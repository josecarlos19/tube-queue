import { $, escapeHtml } from './dom.js';
import { api, deleteJson, localDayRange, postJson } from './api.js';
import { createTranslator } from './i18n.js';
import { createDateRangePicker } from './date-range.js';
import { createCombobox } from './combobox.js';
import { historyRow, sidebarChannel, videoCard } from './views.js';

const views = ['feed', 'history', 'settings'];
const feedLayoutStorageKey = 'tubequeue.feedLayout';
const preferenceStorageKey = 'tubequeue.preferences';

function viewFromUrl() {
  const view = new URLSearchParams(location.search).get('view');
  return views.includes(view) ? view : 'feed';
}

function urlForView(view) {
  return view === 'feed' ? location.pathname : `${location.pathname}?view=${view}`;
}

const state = { language: 'en', theme: 'light', channels: [], videos: [], history: [], view: viewFromUrl(), player: null, selectedHistory: new Set(), feedLayout: readFeedLayout(), showLastSync: true, selectingChannels: false, selectedChannels: new Set(), settings: {} };
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
    return localStorage.getItem(feedLayoutStorageKey) === 'list' ? 'list' : 'grid';
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
}

function renderFeedLayout() {
  $('#video-grid').classList.toggle('list', state.feedLayout === 'list');
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
  $('#video-grid').innerHTML = state.videos.map((video) => videoCard(video, t, formatDate)).join('');
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
  list.innerHTML = state.history.map((video) => historyRow(video, state.selectedHistory.has(video.video_id), t, formatDate)).join('');
  deleteButton.classList.toggle('hidden', state.selectedHistory.size === 0);
  $('#selected-count').textContent = state.selectedHistory.size ? `(${state.selectedHistory.size})` : '';
}

async function loadSettings() {
  state.settings = await api('/api/settings');
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
  $('#settings-view').classList.toggle('hidden', view !== 'settings');
}

function setView(view, { updateUrl = true } = {}) {
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
  } else {
    renderSettings();
  }
}

function createPlayer(videoId) {
  if (!$('#youtube-player')) {
    return;
  }
  const recordPlayback = (playbackState) => postJson('/api/history', { videoId, state: playbackState }).catch(() => {});
  try {
    state.player = new window.YT.Player('youtube-player', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: { origin: location.origin, playsinline: 1 },
      events: {
        onStateChange(event) {
          if (event.data === window.YT.PlayerState.PLAYING) {
            recordPlayback('started');
          }
          if (event.data === window.YT.PlayerState.ENDED) {
            recordPlayback('finished');
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

function openPlayer(videoId) {
  const video = state.videos.find((item) => item.video_id === videoId) || state.history.find((item) => item.video_id === videoId);
  if (!video) {
    return;
  }
  postJson('/api/history', { videoId, state: 'opened' }).catch(() => {});
  $('#player-title').textContent = video.title;
  $('#player-channel').textContent = video.channel_title;
  $('#youtube-link').href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.video_id)}`;
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
    localStorage.setItem(preferenceStorageKey, JSON.stringify({ language: state.language, theme: state.theme, showLastSync: state.showLastSync }));
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

  $('#player-dialog').addEventListener('close', () => {
    state.player?.destroy?.();
    state.player = null;
    $('#player-frame').innerHTML = '';
    const reload = state.view === 'history' ? loadHistory : loadVideos;
    reload().catch(showError);
  });
}

async function start() {
  bindEvents();
  const cached = readCachedPreferences();
  state.language = cached.language || (navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en');
  state.theme = cached.theme || 'light';
  state.showLastSync = cached.showLastSync !== false;
  applyTranslations();
  renderFeedLayout();
  showView(state.view);
  delete document.documentElement.dataset.loading;
  historyRangePicker = createDateRangePicker($('#history-range'), { language: state.language, onChange: () => loadHistory().catch(showError) });
  try {
    await loadSettings();
    state.language = state.settings.language || state.language;
    state.theme = state.settings.theme || state.theme;
    state.showLastSync = state.settings.showLastSync !== false;
    cachePreferences();
    applyTranslations();
    await loadChannels();
    setView(state.view, { updateUrl: false });
  } catch (error) {
    setNotice(`${t('loadError')} ${error.message}`, 'error');
  }
}

start();
