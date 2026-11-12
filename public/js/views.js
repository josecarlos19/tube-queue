import { escapeHtml } from './dom.js';

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

export function videoCard(video, t, formatDate) {
  const watched = isWatched(video);
  const watchLabel = t(watched ? 'markUnwatched' : 'markWatched');
  const watchedPill = watched ? `<span class="watched-pill">✓ ${escapeHtml(t('watched'))}</span>` : '';
  return `<article class="video-card">
    <button class="thumbnail-button" data-play="${escapeHtml(video.video_id)}" aria-label="Play ${escapeHtml(video.title)}">
      <img class="thumbnail" src="${escapeHtml(video.thumbnail_url || '')}" alt="" loading="lazy"><span class="play-overlay">▶</span>${watchedPill}
    </button>
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

export function historyRow(video, selected, t, formatDate) {
  const status = t(isWatched(video) ? 'watched' : video.playback_state || 'opened');
  return `<article class="history-row">
    <input class="history-check" type="checkbox" data-select-history="${escapeHtml(video.video_id)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(video.title)}">
    <button class="history-thumb" data-play="${escapeHtml(video.video_id)}"><img src="${escapeHtml(video.thumbnail_url || '')}" alt=""><span>▶</span></button>
    <div class="history-copy">
      <button class="video-title" data-play="${escapeHtml(video.video_id)}">${escapeHtml(video.title)}</button>
      <p>${escapeHtml(video.channel_title)}</p>
      <p class="video-date">${escapeHtml(status)} · ${escapeHtml(formatDate(video.last_activity_at))}</p>
    </div>
    <button class="icon-button history-delete" data-delete-one="${escapeHtml(video.video_id)}" title="${escapeHtml(t('remove'))}" aria-label="${escapeHtml(t('remove'))}">${trashIcon}</button>
  </article>`;
}
