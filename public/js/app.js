import { $, escapeHtml } from './dom.js';
import { api, deleteJson, localDayRange, postJson, putJson } from './api.js';
import { createTranslator } from './i18n.js';
import { createDateRangePicker } from './date-range.js';
import { createCombobox } from './combobox.js';
import { historyRow, playerQueueItem, queueDockItem, queueRow, sidebarChannel, videoCard } from './views.js';

const views = ['feed', 'queue', 'history', 'settings'];
const feedLayoutStorageKey = 'tubequeue.feedLayout';
const feedLayouts = ['grid', 'list', 'rows'];
const preferenceStorageKey = 'tubequeue.preferences';
const queueDockStorageKey = 'tubequeue.queueDockOpen';
const queueDockPositionKey = 'tubequeue.queueDockPosition';

function viewFromUrl() {
  const view = new URLSearchParams(location.search).get('view');
  return views.includes(view) ? view : 'feed';
}

function urlForView(view) {
  return view === 'feed' ? location.pathname : `${location.pathname}?view=${view}`;
}

const state = { language: 'en', theme: 'light', channels: [], videos: [], history: [], queue: [], playingFromQueue: false, view: viewFromUrl(), player: null, selectedHistory: new Set(), feedLayout: readFeedLayout(), showLastSync: true, recordHistory: true, hideShorts: true, markWatchedOnClose: true, dataSaver: false, floatingQueue: true, queueDockOpen: readQueueDockOpen(), syncIntervalMinutes: 30, videosPerChannel: 50, playingVideoId: null, selectingChannels: false, selectedChannels: new Set(), settings: {} };
const t = createTranslator(() => state.language);

let noticeTimer;
function setNotice(message, kind = 'info') {
  const box = $('#notice');
  box.textContent = message;
  box.className = `notice ${kind}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => box.classList.add('hidden'), 5000);
}

const showError = (error) => setNotice(error.message, 'error');

function formatDate(value) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat(state.language === 'pt-BR' ? 'pt-BR' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(state.language === 'pt-BR' ? 'pt-BR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function lastSyncedAt() {
  return state.channels.map((channel) => channel.last_synced_at).filter(Boolean).sort().at(-1) || null;
}

function renderLastSync() {
  const label = $('#last-sync');
  const syncedAt = lastSyncedAt();
  label.classList.toggle('hidden', !syncedAt || !state.showLastSync);
  label.textContent = syncedAt ? t('lastSync').replace('{time}', formatDateTime(syncedAt)) : '';
}

function hasApiKey() {
  return Boolean(state.settings.hasApiKey);
}

let historyRangePicker = null;
const channelFilter = createCombobox($('#channel-filter'), { onChange: () => loadVideos().catch(showError) });

function applyTranslations() {
  historyRangePicker?.setLanguage(state.language);
  document.documentElement.lang = state.language === 'pt-BR' ? 'pt-BR' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = t(node.dataset.i18n);
    if (value) {
      node.textContent = value;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
    node.setAttribute('aria-label', node.title);
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.language === state.language));
  });
  $('#show-last-sync').setAttribute('aria-checked', String(state.showLastSync));
  $('#record-history').setAttribute('aria-checked', String(state.recordHistory));
  $('#hide-shorts').setAttribute('aria-checked', String(state.hideShorts));
  $('#mark-watched-on-close').setAttribute('aria-checked', String(state.markWatchedOnClose));
  $('#data-saver').setAttribute('aria-checked', String(state.dataSaver));
  $('#floating-queue').setAttribute('aria-checked', String(state.floatingQueue));
  renderQueueDock();
  document.querySelectorAll('[data-sync-interval]').forEach((button) => {
    button.setAttribute('aria-checked', String(Number(button.dataset.syncInterval) === state.syncIntervalMinutes));
  });
  document.querySelectorAll('[data-videos-per-channel]').forEach((button) => {
    button.setAttribute('aria-checked', String(Number(button.dataset.videosPerChannel) === state.videosPerChannel));
  });
  document.querySelector('.nav-item[data-view="history"]').classList.toggle('hidden', !state.recordHistory);
  $('#theme-icon').textContent = state.theme === 'dark' ? '☀' : '☾';
  document.body.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').content = state.theme === 'dark' ? '#0f0f0f' : '#f9f9f9';
  $('#theme-toggle').title = t(state.theme === 'dark' ? 'switchToLight' : 'switchToDark');
  renderChannels();
  renderCurrentView();
}

function renderCurrentView() {
  if (state.view === 'feed') {
    renderVideos();
  } else if (state.view === 'history') {
    renderHistory();
  } else if (state.view === 'queue') {
    renderQueue();
  } else {
    renderSettings();
  }
}

function renderChannels() {
  const list = $('#sidebar-channels');
  if (state.channels.length) {
    list.innerHTML = state.channels
      .map((channel) => sidebarChannel(channel, t, { selecting: state.selectingChannels, selected: state.selectedChannels.has(channel.channel_id) }))
      .join('');
  } else {
    list.innerHTML = `<p class="sidebar-empty">${t('noChannels')}</p>`;
  }
  renderChannelSelection();
  renderLastSync();

  channelFilter.setOptions(
    [{ value: '', label: t('allChannels') }, ...state.channels.map((channel) => ({ value: channel.channel_id, label: channel.title, image: channel.thumbnail_url || '/logo.svg' }))],
    { label: t('filterByChannel'), search: t('searchChannels'), empty: t('noChannelMatches') }
  );

  $('#api-status').textContent = t(hasApiKey() ? 'apiReady' : 'apiMissing');
  $('#api-status-dot').classList.toggle('ready', hasApiKey());
  renderSettings();
}

function renderChannelSelection() {
  const selecting = state.selectingChannels && state.channels.length > 0;
  const count = state.selectedChannels.size;
  $('#select-channels').classList.toggle('hidden', !state.channels.length);
  $('#select-channels').classList.toggle('active', selecting);
  $('#select-channels').setAttribute('aria-pressed', String(selecting));
  $('#channel-bulk').classList.toggle('hidden', !selecting);
  $('#select-all-channels').checked = selecting && count === state.channels.length;
  $('#select-all-channels').indeterminate = count > 0 && count < state.channels.length;
  $('#delete-channels').disabled = count === 0;
  $('#delete-channels').textContent = count ? `${t('remove')} (${count})` : t('remove');
}

function setChannelSelection(selecting) {
  state.selectingChannels = selecting;
  state.selectedChannels.clear();
  renderChannels();
}

async function removeSelectedChannels() {
  const channelIds = [...state.selectedChannels];
  const confirmed = await confirmAction({
    title: t('confirmRemoveManyTitle', channelIds.length),
    message: t('confirmRemove'),
    confirmLabel: t('remove')
  });
  if (!confirmed) {
    return;
  }
  try {
    const result = await deleteJson('/api/channels', { channelIds });
    state.selectingChannels = false;
    state.selectedChannels.clear();
    await loadChannels();
    await loadVideos();
    setNotice(t('channelsRemoved', result.deleted), 'success');
  } catch (error) {
    showError(error);
  }
}

function showFeedEmpty(title, text) {
  $('#video-grid').innerHTML = '';
  $('#feed-empty').classList.remove('hidden');
  $('#feed-empty h2').textContent = title;
  $('#feed-empty p').textContent = text;
}

function readFeedLayout() {
  try {
    const layout = localStorage.getItem(feedLayoutStorageKey);
    return feedLayouts.includes(layout) ? layout : 'grid';
  } catch {
    return 'grid';
  }
}

function setFeedLayout(layout) {
  state.feedLayout = layout;
  try {
    localStorage.setItem(feedLayoutStorageKey, layout);
  } catch {}
  renderFeedLayout();
  if (state.videos.length) {
    renderVideos();
  }
}

function renderFeedLayout() {
  $('#video-grid').className = state.feedLayout === 'rows' ? 'video-rows' : `video-grid${state.feedLayout === 'list' ? ' list' : ''}`;
  document.querySelectorAll('[data-layout]').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.layout === state.feedLayout));
  });
}

function renderVideos() {
  if (!state.channels.length) {
    showFeedEmpty(t('emptyFeedTitle'), t('emptyFeedText'));
    return;
  }
  if (!state.videos.length) {
    showFeedEmpty(t('noVideos'), hasApiKey() ? '' : t('keyHelp'));
    return;
  }
  $('#feed-empty').classList.add('hidden');
  $('#video-grid').innerHTML = state.feedLayout === 'rows' ? channelRowsHtml() : dayGroupsHtml();
}

function isQueued(videoId) {
  return state.queue.some((video) => video.video_id === videoId);
}

function cardOptions(video) {
  return { dataSaver: state.dataSaver, queued: isQueued(video.video_id) };
}

function setQueue(queue) {
  state.queue = queue;
  const count = $('#queue-count');
  count.textContent = String(queue.length);
  count.classList.toggle('hidden', !queue.length);
  if (state.view === 'queue') {
    renderQueue();
  } else if (state.view === 'feed' && state.videos.length) {
    renderVideos();
  }
  renderQueueDock();
}

function readQueueDockOpen() {
  try {
    return localStorage.getItem(queueDockStorageKey) === 'true';
  } catch {
    return false;
  }
}

function setQueueDockOpen(open) {
  state.queueDockOpen = open;
  try {
    localStorage.setItem(queueDockStorageKey, String(open));
  } catch {}
  renderQueueDock();
}

function readQueueDockPosition() {
  try {
    const position = JSON.parse(localStorage.getItem(queueDockPositionKey));
    return Number.isFinite(position?.x) && Number.isFinite(position?.y) ? position : null;
  } catch {
    return null;
  }
}

function placeQueueDock(position) {
  const dock = $('#queue-dock');
  if (!position) {
    dock.style.left = '';
    dock.style.top = '';
    dock.classList.remove('moved');
    return;
  }
  const maxX = window.innerWidth - dock.offsetWidth - 8;
  const maxY = window.innerHeight - dock.offsetHeight - 8;
  dock.style.left = `${Math.max(8, Math.min(position.x, maxX))}px`;
  dock.style.top = `${Math.max(8, Math.min(position.y, maxY))}px`;
  dock.classList.add('moved');
}

function bindQueueDockDrag() {
  const dock = $('#queue-dock');
  const grip = $('#queue-dock-grip');
  let start = null;
  grip.addEventListener('pointerdown', (event) => {
    const box = dock.getBoundingClientRect();
    start = { pointerX: event.clientX, pointerY: event.clientY, x: box.left, y: box.top };
    grip.setPointerCapture(event.pointerId);
    dock.classList.add('dragging');
  });
  grip.addEventListener('pointermove', (event) => {
    if (start) {
      placeQueueDock({ x: start.x + event.clientX - start.pointerX, y: start.y + event.clientY - start.pointerY });
    }
  });
  grip.addEventListener('pointerup', () => {
    if (!start) {
      return;
    }
    start = null;
    dock.classList.remove('dragging');
    const box = dock.getBoundingClientRect();
    try {
      localStorage.setItem(queueDockPositionKey, JSON.stringify({ x: box.left, y: box.top }));
    } catch {}
  });
  grip.addEventListener('dblclick', () => {
    try {
      localStorage.removeItem(queueDockPositionKey);
    } catch {}
    placeQueueDock(null);
  });
  window.addEventListener('resize', () => placeQueueDock(readQueueDockPosition()));
}

function renderQueueDock() {
  const dock = $('#queue-dock');
  const visible = state.floatingQueue && state.queue.length > 0 && state.view !== 'queue';
  dock.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  dock.classList.toggle('open', state.queueDockOpen);
  $('#queue-dock-toggle').setAttribute('aria-expanded', String(state.queueDockOpen));
  $('#queue-dock-count').textContent = String(state.queue.length);
  $('#queue-dock-list').innerHTML = state.queueDockOpen
    ? state.queue.map((video, index) => queueDockItem(video, index, state.queue.length, t)).join('')
    : '';
  placeQueueDock(readQueueDockPosition());
}

async function loadQueue() {
  setQueue((await api('/api/queue')).queue);
}

function renderQueue() {
  const empty = !state.queue.length;
  $('#queue-empty').classList.toggle('hidden', !empty);
  $('#play-queue').classList.toggle('hidden', empty);
  $('#clear-queue').classList.toggle('hidden', empty);
  $('#queue-list').innerHTML = state.queue.map((video, index) => queueRow(video, index, state.queue.length, t, formatDate, { dataSaver: state.dataSaver })).join('');
}

async function toggleQueue(button) {
  const videoId = button.dataset.toggleQueue;
  button.disabled = true;
  try {
    const result = isQueued(videoId) ? await deleteJson('/api/queue', { videoId }) : await postJson('/api/queue', { videoId });
    setQueue(result.queue);
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
}

async function moveInQueue(videoId, direction) {
  const videoIds = state.queue.map((video) => video.video_id);
  const from = videoIds.indexOf(videoId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= videoIds.length) {
    return;
  }
  [videoIds[from], videoIds[to]] = [videoIds[to], videoIds[from]];
  setQueue((await putJson('/api/queue', { videoIds })).queue);
}

async function clearQueue() {
  const confirmed = await confirmAction({ title: t('clearQueueConfirmTitle'), message: t('clearQueueConfirm'), confirmLabel: t('clearQueue') });
  if (confirmed) {
    setQueue((await deleteJson('/api/queue', { all: true })).queue);
  }
}

function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(value) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const key = localDayKey(value);
  if (key === localDayKey(today)) {
    return t('today');
  }
  if (key === localDayKey(yesterday)) {
    return t('yesterday');
  }
  const date = new Date(value);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (date.getFullYear() !== today.getFullYear()) {
    options.year = 'numeric';
  }
  const label = new Intl.DateTimeFormat(state.language === 'pt-BR' ? 'pt-BR' : 'en-US', options).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayGroupsHtml() {
  let currentDay = null;
  return state.videos.map((video) => {
    const day = video.published_at ? localDayKey(video.published_at) : '';
    const heading = day !== currentDay ? `<h2 class="video-day">${escapeHtml(video.published_at ? dayLabel(video.published_at) : '')}</h2>` : '';
    currentDay = day;
    return heading + videoCard(video, t, formatDate, cardOptions(video));
  }).join('');
}

function channelRowsHtml() {
  const rows = new Map();
  for (const video of state.videos) {
    if (!rows.has(video.channel_id)) {
      rows.set(video.channel_id, []);
    }
    rows.get(video.channel_id).push(video);
  }
  return [...rows.values()].map((videos) => `<section class="video-row">
    <h2 class="video-row-title"><img src="${escapeHtml(videos[0].channel_thumbnail || '/logo.svg')}" alt="">${escapeHtml(videos[0].channel_title)}<span>${videos.length}</span></h2>
    <div class="video-row-viewport">
      <button type="button" class="row-scroll row-scroll-left" data-scroll-row="-1" aria-label="${escapeHtml(t('scrollLeft'))}">‹</button>
      <div class="video-row-track">${videos.map((video) => videoCard(video, t, formatDate, cardOptions(video))).join('')}</div>
      <button type="button" class="row-scroll row-scroll-right" data-scroll-row="1" aria-label="${escapeHtml(t('scrollRight'))}">›</button>
    </div>
  </section>`).join('');
}

function renderSettings() {
  $('#api-key-status').textContent = hasApiKey() ? t('apiKeyConfigured') : t('apiKeyNotConfigured');
  $('#api-key-status').classList.toggle('connected', hasApiKey());
  $('#api-key-input').placeholder = hasApiKey() ? t('apiKeyPlaceholder') : '';
  $('#channels-csv-status').textContent = t('savedChannelsCount', state.channels.length);
  $('#export-channels').classList.toggle('hidden', !state.channels.length);
}

function renderHistory() {
  const list = $('#history-list');
  const empty = $('#history-empty');
  const deleteButton = $('#delete-selected');
  if (!state.history.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    deleteButton.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = state.history.map((video) => historyRow(video, state.selectedHistory.has(video.video_id), t, formatDate, { dataSaver: state.dataSaver })).join('');
  deleteButton.classList.toggle('hidden', state.selectedHistory.size === 0);
  $('#selected-count').textContent = state.selectedHistory.size ? `(${state.selectedHistory.size})` : '';
}

async function loadSettings() {
  state.settings = await api('/api/settings');
  if (state.settings.dev) {
    connectDevReload();
  }
}

let devReloadSource = null;

function connectDevReload() {
  if (devReloadSource) {
    return;
  }
  let disconnected = false;
  devReloadSource = new EventSource('/api/dev/reload');
  devReloadSource.onmessage = () => location.reload();
  devReloadSource.onerror = () => {
    disconnected = true;
  };
  devReloadSource.onopen = () => {
    if (disconnected) {
      location.reload();
    }
  };
}

async function loadChannels() {
  state.channels = (await api('/api/channels')).channels;
  renderChannels();
}

async function loadVideos() {
  const params = new URLSearchParams();
  const query = $('#video-search').value.trim();
  const channelId = channelFilter.value;
  if (query) {
    params.set('q', query);
  }
  if (channelId) {
    params.set('channel', channelId);
  }
  state.videos = (await api(`/api/videos?${params}`)).videos;
  renderVideos();
}

async function loadHistory() {
  const params = new URLSearchParams(localDayRange(historyRangePicker?.range()));
  state.history = (await api(`/api/history?${params}`)).history;
  state.selectedHistory.clear();
  renderHistory();
}

function showView(view) {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#feed-view').classList.toggle('hidden', view !== 'feed');
  $('#history-view').classList.toggle('hidden', view !== 'history');
  $('#queue-view').classList.toggle('hidden', view !== 'queue');
  renderQueueDock();
  $('#settings-view').classList.toggle('hidden', view !== 'settings');
}

function availableView(view) {
  return view === 'history' && !state.recordHistory ? 'feed' : view;
}

function setView(requestedView, { updateUrl = true } = {}) {
  const view = availableView(requestedView);
  if (view !== requestedView) {
    history.replaceState({ view }, '', urlForView(view));
  }
  state.view = view;
  const url = urlForView(view);
  if (updateUrl && `${location.pathname}${location.search}` !== url) {
    history.pushState({ view }, '', url);
  }
  showView(view);
  $('#sidebar').classList.remove('open');
  if (view === 'feed') {
    loadVideos().catch(showError);
  } else if (view === 'history') {
    loadHistory().catch(showError);
  } else if (view === 'queue') {
    loadQueue().catch(showError);
  } else {
    renderSettings();
  }
}

function createPlayer(videoId) {
  if (!$('#youtube-player')) {
    return;
  }
  const recordPlayback = (playbackState) => {
    if (state.recordHistory && state.playingVideoId) {
      postJson('/api/history', { videoId: state.playingVideoId, state: playbackState }).catch(() => {});
    }
  };
  try {
    state.player = new window.YT.Player('youtube-player', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: { origin: location.origin, playsinline: 1, autoplay: 1 },
      events: {
        onReady(event) {
          event.target.playVideo();
        },
        onStateChange(event) {
          if (event.data === window.YT.PlayerState.PLAYING) {
            recordPlayback('started');
          }
          if (event.data === window.YT.PlayerState.ENDED) {
            recordPlayback('finished');
            finishCurrentVideo().catch(showError);
          }
        },
        onError() {
          setNotice(t('playbackError'), 'error');
        }
      }
    });
  } catch {
    setNotice(t('playbackError'), 'error');
  }
}

let pendingVideoId = null;
window.onYouTubeIframeAPIReady = () => {
  if (pendingVideoId) {
    const videoId = pendingVideoId;
    pendingVideoId = null;
    createPlayer(videoId);
  }
};

function findVideo(videoId) {
  return [...state.queue, ...state.videos, ...state.history].find((item) => item.video_id === videoId);
}

function queueIndex() {
  return state.queue.findIndex((video) => video.video_id === state.playingVideoId);
}

function showPlayerVideo(video) {
  if (state.recordHistory) {
    postJson('/api/history', { videoId: video.video_id, state: 'opened' }).catch(() => {});
  }
  state.playingVideoId = video.video_id;
  $('#player-title').textContent = video.title;
  $('#player-channel').textContent = video.channel_title;
  $('#youtube-link').href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.video_id)}`;
  renderPlayerNext();
}

function renderPlayerNext() {
  const index = state.playingFromQueue ? queueIndex() : -1;
  $('#player-queue').classList.toggle('hidden', index < 0);
  $('#player-dialog').classList.toggle('with-queue', index >= 0);
  if (index < 0) {
    return;
  }
  $('#player-previous').disabled = index === 0;
  $('#player-next').disabled = index === state.queue.length - 1;
  $('#player-queue-position').textContent = t('queuePosition').replace('{current}', index + 1).replace('{total}', state.queue.length);
  $('#player-queue-list').innerHTML = state.queue.map((video, position) => playerQueueItem(video, position, position === index)).join('');
  $('#player-queue-list [aria-current]')?.scrollIntoView({ block: 'nearest' });
}

function jumpInQueue(videoId) {
  const target = state.queue.find((video) => video.video_id === videoId);
  if (target && target.video_id !== state.playingVideoId) {
    showPlayerVideo(target);
    state.player?.loadVideoById?.(target.video_id);
  }
}

async function stepQueue(step, { finished = false } = {}) {
  const videoId = state.playingVideoId;
  if (finished && videoId && state.markWatchedOnClose) {
    await postJson('/api/history/mark', { videoId }).catch(() => {});
    await loadQueue().catch(() => {});
    renderPlayerNext();
  }
  const target = state.queue[queueIndex() + step];
  if (!target) {
    if (finished) {
      $('#player-dialog').close();
    }
    return;
  }
  showPlayerVideo(target);
  state.player?.loadVideoById?.(target.video_id);
}

async function finishCurrentVideo() {
  if (state.playingFromQueue) {
    await stepQueue(1, { finished: true });
  }
}

function firstUnwatchedInQueue() {
  return (state.queue.find((video) => !video.manually_watched && video.playback_state !== 'finished') || state.queue[0])?.video_id;
}

function playQueue(videoId = firstUnwatchedInQueue()) {
  if (videoId) {
    openPlayer(videoId, { fromQueue: true });
  }
}

function openPlayer(videoId, { fromQueue = false } = {}) {
  const video = findVideo(videoId);
  if (!video) {
    return;
  }
  state.playingFromQueue = fromQueue;
  showPlayerVideo(video);
  $('#player-frame').innerHTML = '<div id="youtube-player"></div>';
  $('#player-dialog').showModal();
  if (window.YT?.Player) {
    createPlayer(video.video_id);
  } else {
    pendingVideoId = video.video_id;
  }
}

function readCachedPreferences() {
  try {
    return JSON.parse(localStorage.getItem(preferenceStorageKey)) || {};
  } catch {
    return {};
  }
}

function cachePreferences() {
  try {
    localStorage.setItem(preferenceStorageKey, JSON.stringify({ language: state.language, theme: state.theme, showLastSync: state.showLastSync, recordHistory: state.recordHistory, hideShorts: state.hideShorts, markWatchedOnClose: state.markWatchedOnClose, dataSaver: state.dataSaver, floatingQueue: state.floatingQueue, syncIntervalMinutes: state.syncIntervalMinutes, videosPerChannel: state.videosPerChannel }));
  } catch {}
}

async function savePreference(key, value) {
  cachePreferences();
  await postJson('/api/settings', { [key]: value });
}

function openChannelDialog() {
  if (!hasApiKey()) {
    setView('settings');
    setNotice(t('apiKeyRequired'), 'warning');
    return;
  }
  $('#sidebar').classList.remove('open');
  $('#channel-form').reset();
  $('#channel-error').classList.add('hidden');
  $('#channel-dialog').showModal();
  $('#channel-input').focus();
}

async function submitChannel(event) {
  event.preventDefault();
  const input = $('#channel-input').value.trim();
  if (!input) {
    return;
  }
  const button = $('#submit-channel');
  const error = $('#channel-error');
  button.disabled = true;
  error.classList.add('hidden');
  try {
    const result = await postJson('/api/channels', { input });
    $('#channel-dialog').close();
    await loadChannels();
    setView('feed');
    if (result.syncError) {
      setNotice(t('channelAddedSyncFailed'), 'warning');
    } else {
      setNotice(t(result.alreadyAdded ? 'channelAlreadyAdded' : 'channelAdded').replace('{title}', result.channel.title), 'success');
    }
  } catch (requestError) {
    error.textContent = requestError.message;
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}

function renderImportReport(result) {
  const report = $('#import-report');
  report.classList.toggle('hidden', !result.skipped.length);
  $('#import-report-title').textContent = t('importSkippedTitle');
  $('#import-report-list').innerHTML = result.skipped
    .map((row) => `<li>${escapeHtml(t('importSkippedRow').replace('{line}', row.line).replace('{input}', row.input))} — ${escapeHtml(row.reason)}</li>`)
    .join('');
}

async function importChannelsFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) {
    return;
  }
  if (!hasApiKey()) {
    setNotice(t('apiKeyRequired'), 'warning');
    return;
  }
  const button = $('#import-channels-button');
  button.disabled = true;
  try {
    const result = await postJson('/api/channels/import', { csv: await file.text() });
    await loadChannels();
    renderImportReport(result);
    const message = t('importResult')
      .replace('{added}', result.added)
      .replace('{existing}', result.alreadyAdded)
      .replace('{skipped}', result.skipped.length);
    setNotice(message, result.skipped.length || result.syncErrors.length ? 'warning' : 'success');
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

async function saveApiKey() {
  const key = $('#api-key-input').value.trim();
  if (!key && state.settings.hasApiKey) {
    setNotice(t('apiKeyConfigured'), 'success');
    return;
  }
  try {
    state.settings = await postJson('/api/settings', { apiKey: key });
    $('#api-key-input').value = '';
    renderChannels();
    setNotice(t('apiKeyConfigured'), 'success');
  } catch (error) {
    showError(error);
  }
}

async function refreshFeed() {
  const button = $('#refresh-button');
  button.disabled = true;
  try {
    const result = await postJson('/api/sync');
    await loadChannels();
    await loadVideos();
    const syncedAt = lastSyncedAt();
    if (result.errors?.length) {
      setNotice(t('syncFailed'), 'warning');
    } else {
      setNotice(syncedAt ? t('refreshDoneAt').replace('{time}', formatDateTime(syncedAt)) : t('refreshDone'), 'success');
    }
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

async function deleteHistory(videoIds) {
  try {
    await deleteJson('/api/history', { videoIds });
    await loadHistory();
  } catch (error) {
    showError(error);
  }
}

async function clearCache() {
  const confirmed = await confirmAction({ title: t('clearCacheConfirmTitle'), message: t('clearCacheConfirm'), confirmLabel: t('clearCacheButton') });
  if (!confirmed) {
    return;
  }
  const button = $('#clear-cache');
  button.disabled = true;
  try {
    const result = await postJson('/api/cache/clear');
    await loadChannels();
    await loadVideos();
    setNotice(t('cacheCleared', result.removed), result.errors?.length ? 'warning' : 'success');
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

function confirmAction({ title, message, confirmLabel }) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-accept').textContent = confirmLabel;
  dialog.returnValue = '';
  dialog.showModal();
  $('#confirm-accept').focus();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}

async function removeChannel(channelId) {
  const channel = state.channels.find((item) => item.channel_id === channelId);
  const confirmed = await confirmAction({
    title: t('confirmRemoveTitle').replace('{title}', channel?.title || ''),
    message: t('confirmRemove'),
    confirmLabel: t('remove')
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteJson(`/api/channels/${encodeURIComponent(channelId)}`);
    await loadChannels();
    await loadVideos();
    setNotice(t('channelRemoved'), 'success');
  } catch (error) {
    showError(error);
  }
}

async function toggleWatched(button) {
  const videoId = button.dataset.toggleWatched;
  const watched = button.getAttribute('aria-pressed') === 'true';
  button.disabled = true;
  try {
    if (watched) {
      await deleteJson('/api/history/mark', { videoId });
    } else {
      await postJson('/api/history/mark', { videoId });
    }
    await loadVideos();
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
}

function bindEvents() {
  $('#home-button').addEventListener('click', () => setView('feed'));
  document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
  $('#add-channel-button').addEventListener('click', openChannelDialog);
  $('#sidebar-add-channel').addEventListener('click', openChannelDialog);
  $('#channel-form').addEventListener('submit', submitChannel);
  $('#cancel-channel').addEventListener('click', () => $('#channel-dialog').close());
  $('#save-api-key').addEventListener('click', saveApiKey);
  $('#hide-shorts').addEventListener('click', async () => {
    state.hideShorts = !state.hideShorts;
    $('#hide-shorts').setAttribute('aria-checked', String(state.hideShorts));
    await savePreference('hideShorts', state.hideShorts);
    await postJson(state.hideShorts ? '/api/cache/clear' : '/api/sync').catch(() => {});
    await loadChannels().catch(showError);
    await loadVideos().catch(showError);
  });
  $('#data-saver').addEventListener('click', async () => {
    state.dataSaver = !state.dataSaver;
    applyTranslations();
    await savePreference('dataSaver', state.dataSaver);
  });
  $('#mark-watched-on-close').addEventListener('click', async () => {
    state.markWatchedOnClose = !state.markWatchedOnClose;
    $('#mark-watched-on-close').setAttribute('aria-checked', String(state.markWatchedOnClose));
    await savePreference('markWatchedOnClose', state.markWatchedOnClose);
  });
  document.querySelectorAll('[data-sync-interval]').forEach((button) => button.addEventListener('click', async () => {
    state.syncIntervalMinutes = Number(button.dataset.syncInterval);
    applyTranslations();
    await savePreference('syncIntervalMinutes', state.syncIntervalMinutes);
  }));
  $('#clear-cache').addEventListener('click', clearCache);
  document.querySelectorAll('[data-videos-per-channel]').forEach((button) => button.addEventListener('click', async () => {
    state.videosPerChannel = Number(button.dataset.videosPerChannel);
    applyTranslations();
    await savePreference('videosPerChannel', state.videosPerChannel);
    await postJson('/api/sync').catch(() => {});
    await loadChannels().catch(showError);
    await loadVideos().catch(showError);
  }));
  bindQueueDockDrag();
  $('#play-queue').addEventListener('click', () => playQueue());
  $('#queue-dock-play').addEventListener('click', () => playQueue());
  $('#queue-dock-toggle').addEventListener('click', () => setQueueDockOpen(!state.queueDockOpen));
  $('#floating-queue').addEventListener('click', async () => {
    state.floatingQueue = !state.floatingQueue;
    applyTranslations();
    await savePreference('floatingQueue', state.floatingQueue);
  });
  $('#clear-queue').addEventListener('click', () => clearQueue().catch(showError));
  $('#player-previous').addEventListener('click', () => stepQueue(-1).catch(showError));
  $('#player-next').addEventListener('click', () => stepQueue(1).catch(showError));
  $('#record-history').addEventListener('click', async () => {
    state.recordHistory = !state.recordHistory;
    applyTranslations();
    await savePreference('recordHistory', state.recordHistory);
  });
  $('#show-last-sync').addEventListener('click', async () => {
    state.showLastSync = !state.showLastSync;
    $('#show-last-sync').setAttribute('aria-checked', String(state.showLastSync));
    renderLastSync();
    await savePreference('showLastSync', state.showLastSync);
  });
  document.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => setFeedLayout(button.dataset.layout)));
  $('#select-channels').addEventListener('click', () => setChannelSelection(!state.selectingChannels));
  $('#cancel-channel-selection').addEventListener('click', () => setChannelSelection(false));
  $('#delete-channels').addEventListener('click', removeSelectedChannels);
  $('#select-all-channels').addEventListener('change', (event) => {
    state.selectedChannels = new Set(event.target.checked ? state.channels.map((channel) => channel.channel_id) : []);
    renderChannels();
  });
  $('#import-channels-button').addEventListener('click', () => $('#import-channels-file').click());
  $('#import-channels-file').addEventListener('change', importChannelsFile);
  $('#theme-toggle').addEventListener('click', async () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTranslations();
    await savePreference('theme', state.theme);
  });
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', async () => {
    if (button.dataset.language === state.language) {
      return;
    }
    state.language = button.dataset.language;
    applyTranslations();
    await savePreference('language', state.language);
  }));
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#add-first-channel').addEventListener('click', openChannelDialog);
  $('#refresh-button').addEventListener('click', refreshFeed);

  let searchTimer;
  $('#video-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadVideos().catch(showError), 250);
  });
  $('#delete-selected').addEventListener('click', async () => {
    const count = state.selectedHistory.size;
    const confirmed = await confirmAction({
      title: t('deleteConfirmTitle', count),
      message: t('deleteConfirm'),
      confirmLabel: t('deleteSelected')
    });
    if (confirmed) {
      deleteHistory([...state.selectedHistory]);
    }
  });

  document.addEventListener('click', (event) => {
    const play = event.target.closest('[data-play]');
    if (play) {
      openPlayer(play.dataset.play);
      return;
    }
    const remove = event.target.closest('[data-remove-channel]');
    if (remove) {
      removeChannel(remove.dataset.removeChannel);
      return;
    }
    const watchToggle = event.target.closest('[data-toggle-watched]');
    if (watchToggle) {
      toggleWatched(watchToggle);
      return;
    }
    const playFromQueue = event.target.closest('[data-play-queue]');
    if (playFromQueue) {
      if ($('#player-dialog').open && state.playingFromQueue) {
        jumpInQueue(playFromQueue.dataset.playQueue);
      } else {
        playQueue(playFromQueue.dataset.playQueue);
      }
      return;
    }
    const queueToggle = event.target.closest('[data-toggle-queue]');
    if (queueToggle) {
      toggleQueue(queueToggle);
      return;
    }
    const queueMove = event.target.closest('[data-queue-move]');
    if (queueMove) {
      moveInQueue(queueMove.dataset.videoId, Number(queueMove.dataset.queueMove)).catch(showError);
      return;
    }
    const queueRemove = event.target.closest('[data-queue-remove]');
    if (queueRemove) {
      deleteJson('/api/queue', { videoId: queueRemove.dataset.queueRemove }).then((result) => setQueue(result.queue)).catch(showError);
      return;
    }
    const scrollRow = event.target.closest('[data-scroll-row]');
    if (scrollRow) {
      const track = scrollRow.parentElement.querySelector('.video-row-track');
      track.scrollBy({ left: Number(scrollRow.dataset.scrollRow) * track.clientWidth * 0.9, behavior: 'smooth' });
      return;
    }
    const deleteOne = event.target.closest('[data-delete-one]');
    if (deleteOne) {
      deleteHistory([deleteOne.dataset.deleteOne]);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-select-channel]')) {
      const channelId = event.target.dataset.selectChannel;
      if (event.target.checked) {
        state.selectedChannels.add(channelId);
      } else {
        state.selectedChannels.delete(channelId);
      }
      renderChannels();
      return;
    }
    if (!event.target.matches('[data-select-history]')) {
      return;
    }
    const videoId = event.target.dataset.selectHistory;
    if (event.target.checked) {
      state.selectedHistory.add(videoId);
    } else {
      state.selectedHistory.delete(videoId);
    }
    renderHistory();
  });

  window.addEventListener('popstate', () => setView(viewFromUrl(), { updateUrl: false }));

  document.querySelectorAll('dialog.modal').forEach((dialog) => dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) {
      dialog.close();
    }
  }));
  $('#player-dialog').addEventListener('close', async () => {
    state.player?.destroy?.();
    state.player = null;
    $('#player-frame').innerHTML = '';
    const videoId = state.playingVideoId;
    state.playingVideoId = null;
    state.playingFromQueue = false;
    if (videoId && state.markWatchedOnClose) {
      await postJson('/api/history/mark', { videoId }).catch(() => {});
    }
    await loadQueue().catch(() => {});
    const reload = { history: loadHistory, queue: loadQueue }[state.view] || loadVideos;
    reload().catch(showError);
  });
}

async function start() {
  bindEvents();
  const cached = readCachedPreferences();
  state.language = cached.language || (navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en');
  state.theme = cached.theme || 'light';
  state.showLastSync = cached.showLastSync !== false;
  state.recordHistory = cached.recordHistory !== false;
  state.hideShorts = cached.hideShorts !== false;
  state.markWatchedOnClose = cached.markWatchedOnClose !== false;
  state.dataSaver = cached.dataSaver === true;
  state.floatingQueue = cached.floatingQueue !== false;
  state.syncIntervalMinutes = Number.isInteger(cached.syncIntervalMinutes) ? cached.syncIntervalMinutes : 30;
  state.videosPerChannel = Number.isInteger(cached.videosPerChannel) ? cached.videosPerChannel : 50;
  applyTranslations();
  renderFeedLayout();
  showView(availableView(state.view));
  delete document.documentElement.dataset.loading;
  historyRangePicker = createDateRangePicker($('#history-range'), { language: state.language, onChange: () => loadHistory().catch(showError) });
  try {
    await loadSettings();
    state.language = state.settings.language || state.language;
    state.theme = state.settings.theme || state.theme;
    state.showLastSync = state.settings.showLastSync !== false;
    state.recordHistory = state.settings.recordHistory !== false;
    state.hideShorts = state.settings.hideShorts !== false;
    state.markWatchedOnClose = state.settings.markWatchedOnClose !== false;
    state.dataSaver = state.settings.dataSaver === true;
    state.floatingQueue = state.settings.floatingQueue !== false;
    state.syncIntervalMinutes = state.settings.syncIntervalMinutes ?? 30;
    state.videosPerChannel = state.settings.videosPerChannel ?? 50;
    cachePreferences();
    applyTranslations();
    await loadChannels();
    await loadQueue().catch(() => {});
    setView(state.view, { updateUrl: false });
  } catch (error) {
    setNotice(`${t('loadError')} ${error.message}`, 'error');
  }
}

start();
