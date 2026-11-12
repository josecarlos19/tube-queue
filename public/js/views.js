import { escapeHtml } from './dom.js';

const youtubeThumbnailPattern = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]+)\//;

function thumbnailUrl(url, { dataSaver = false } = {}) {
  const videoId = dataSaver && url?.match(youtubeThumbnailPattern)?.[1];
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : url || '';
}

const isWatched = (video) => Boolean(video.manually_watched) || video.playback_state === 'finished';

export const trashIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

export function sidebarChannel(channel, t, { selecting = false, selected = false } = {}) {
  const channelId = escapeHtml(channel.channel_id);
  const avatar = `<img src="${escapeHtml(channel.thumbnail_url || '/logo.svg')}" alt="">`;
  const name = `<span title="${escapeHtml(channel.title)}">${escapeHtml(channel.title)}</span>`;
  if (selecting) {
    return `<label class="sidebar-channel selectable${selected ? ' selected' : ''}">
    <input class="channel-check" type="checkbox" data-select-channel="${channelId}" ${selected ? 'checked' : ''}>${avatar}${name}
  </label>`;
  }
  return `<div class="sidebar-channel">${avatar}${name}
    <button class="remove-channel" data-remove-channel="${channelId}" title="${escapeHtml(t('remove'))}" aria-label="${escapeHtml(t('remove'))}">${trashIcon}</button>
  </div>`;
}

const queueAddIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h11M4 12h11M4 18h7"/><path d="M18 15v6M15 18h6"/></svg>';
const queueRemoveIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h11M4 12h11M4 18h7"/><path d="M15 18l2 2 4-4"/></svg>';

function queueButton(video, t, queued) {
  const label = t(queued ? 'removeFromQueue' : 'addToQueue');
  return `<button class="queue-toggle${queued ? ' active' : ''}" data-toggle-queue="${escapeHtml(video.video_id)}" aria-pressed="${queued}" data-tooltip="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${queued ? queueRemoveIcon : queueAddIcon}</button>`;
}

export function videoCard(video, t, formatDate, options = {}) {
  const watched = isWatched(video);
  const watchLabel = t(watched ? 'markUnwatched' : 'markWatched');
  const watchedPill = watched ? `<span class="watched-pill">✓ ${escapeHtml(t('watched'))}</span>` : '';
  return `<article class="video-card">
    <div class="thumbnail-wrap">
    <button class="thumbnail-button" data-play="${escapeHtml(video.video_id)}" aria-label="Play ${escapeHtml(video.title)}">
      <img class="thumbnail" src="${escapeHtml(thumbnailUrl(video.thumbnail_url, options))}" alt="" loading="lazy"><span class="play-overlay">▶</span>${watchedPill}
    </button>${queueButton(video, t, Boolean(options.queued))}
    </div>
    <div class="video-meta">
      <img class="avatar" src="${escapeHtml(video.channel_thumbnail || '/logo.svg')}" alt="">
      <div class="video-copy">
        <button class="video-title" data-play="${escapeHtml(video.video_id)}">${escapeHtml(video.title)}</button>
        <p class="channel-name">${escapeHtml(video.channel_title)}</p>
        <p class="video-date">${escapeHtml(formatDate(video.published_at))}</p>
        ${video.description ? `<p class="video-description">${escapeHtml(video.description)}</p>` : ''}
      </div>
      <button class="watch-toggle${watched ? ' active' : ''}" data-toggle-watched="${escapeHtml(video.video_id)}" aria-pressed="${watched}" data-tooltip="${escapeHtml(watchLabel)}" aria-label="${escapeHtml(watchLabel)}">✓</button>
    </div>
  </article>`;
}

export function historyRow(video, selected, t, formatDate, options = {}) {
  const status = t(isWatched(video) ? 'watched' : video.playback_state || 'opened');
  return `<article class="history-row">
    <input class="history-check" type="checkbox" data-select-history="${escapeHtml(video.video_id)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(video.title)}">
    <button class="history-thumb" data-play="${escapeHtml(video.video_id)}"><img src="${escapeHtml(thumbnailUrl(video.thumbnail_url, options))}" alt=""><span>▶</span></button>
    <div class="history-copy">
      <button class="video-title" data-play="${escapeHtml(video.video_id)}">${escapeHtml(video.title)}</button>
      <p>${escapeHtml(video.channel_title)}</p>
      <p class="video-date">${escapeHtml(status)} · ${escapeHtml(formatDate(video.last_activity_at))}</p>
    </div>
    <button class="icon-button history-delete" data-delete-one="${escapeHtml(video.video_id)}" title="${escapeHtml(t('remove'))}" aria-label="${escapeHtml(t('remove'))}">${trashIcon}</button>
  </article>`;
}

export function queueRow(video, index, total, t, formatDate, options = {}) {
  const videoId = escapeHtml(video.video_id);
  const moveButton = (direction, label, symbol, disabled) => `<button class="icon-button queue-move" data-queue-move="${direction}" data-video-id="${videoId}" title="${escapeHtml(t(label))}" aria-label="${escapeHtml(t(label))}" ${disabled ? 'disabled' : ''}>${symbol}</button>`;
  return `<article class="history-row queue-row${isWatched(video) ? ' watched' : ''}" data-queue-item="${videoId}" draggable="true">
    <span class="queue-position">${index + 1}</span>
    <button class="history-thumb" data-play-queue="${videoId}"><img draggable="false" src="${escapeHtml(thumbnailUrl(video.thumbnail_url, options))}" alt=""><span>▶</span></button>
    <div class="history-copy">
      <button class="video-title" data-play-queue="${videoId}">${escapeHtml(video.title)}</button>
      <p>${escapeHtml(video.channel_title)}</p>
      <p class="video-date">${escapeHtml(formatDate(video.published_at))}${isWatched(video) ? ` · ${escapeHtml(t('watched'))}` : ''}</p>
    </div>
    ${moveButton('-1', 'moveUp', '↑', index === 0)}${moveButton('1', 'moveDown', '↓', index === total - 1)}
    <button class="icon-button history-delete" data-queue-remove="${videoId}" title="${escapeHtml(t('removeFromQueue'))}" aria-label="${escapeHtml(t('removeFromQueue'))}">${trashIcon}</button>
  </article>`;
}

export function queueDockItem(video, index, total, t, options = {}) {
  const videoId = escapeHtml(video.video_id);
  const action = (attribute, value, label, symbol, disabled = false) => `<button type="button" class="queue-dock-action" ${attribute}="${value}" data-video-id="${videoId}" title="${escapeHtml(t(label))}" aria-label="${escapeHtml(t(label))}" ${disabled ? 'disabled' : ''}>${symbol}</button>`;
  return `<div class="queue-dock-item${isWatched(video) ? ' watched' : ''}" data-queue-item="${videoId}" draggable="true">
    <button type="button" class="queue-dock-thumb" data-play-queue="${videoId}"><img draggable="false" src="${escapeHtml(thumbnailUrl(video.thumbnail_url, { ...options, dataSaver: true }))}" alt=""><span>${index + 1}</span></button>
    <button type="button" class="queue-dock-copy" data-play-queue="${videoId}"><strong>${escapeHtml(video.title)}</strong><small>${escapeHtml(video.channel_title)}</small></button>
    <div class="queue-dock-actions">
      ${action('data-queue-move', '-1', 'moveUp', '↑', index === 0)}${action('data-queue-move', '1', 'moveDown', '↓', index === total - 1)}${action('data-queue-remove', videoId, 'removeFromQueue', '×')}
    </div>
  </div>`;
}

export function playerQueueItem(video, index, current) {
  const videoId = escapeHtml(video.video_id);
  const classes = ['player-queue-item', current ? 'current' : '', isWatched(video) && !current ? 'watched' : ''].filter(Boolean).join(' ');
  return `<button type="button" class="${classes}" data-play-queue="${videoId}" data-queue-item="${videoId}" draggable="true"${current ? ' aria-current="true"' : ''}>
    <span class="player-queue-index">${current ? '▶' : index + 1}</span>
    <img draggable="false" src="${escapeHtml(thumbnailUrl(video.thumbnail_url, { dataSaver: true }))}" alt="">
    <span class="player-queue-copy"><strong>${escapeHtml(video.title)}</strong><small>${escapeHtml(video.channel_title)}</small></span>
  </button>`;
}

export function sidebarGroup(group, t, active) {
  const groupId = escapeHtml(group.group_id);
  const label = t('editGroup');
  return `<div class="sidebar-group${active ? ' active' : ''}">
    <span class="sidebar-group-icon">▤</span>
    <button type="button" class="sidebar-group-name" data-filter-group="${groupId}" title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</button>
    <small>${group.channel_ids.length}</small>
    <button type="button" class="edit-group" data-edit-group="${groupId}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">✎</button>
  </div>`;
}

export function groupChannelOption(channel, selected) {
  return `<label class="sidebar-channel${selected ? ' selected' : ''}">
    <input class="channel-check" type="checkbox" data-group-channel="${escapeHtml(channel.channel_id)}" ${selected ? 'checked' : ''}><img src="${escapeHtml(channel.thumbnail_url || '/logo.svg')}" alt=""><span title="${escapeHtml(channel.title)}">${escapeHtml(channel.title)}</span>
  </label>`;
}
