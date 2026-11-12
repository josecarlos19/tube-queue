import { HttpError } from '../errors.mjs';

const quotaReasons = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded']);
const unavailableTitles = new Set(['Deleted video', 'Private video']);
const channelIdPattern = /^UC[\w-]{22}$/;
const handlePattern = /^@?[\w.-]{3,30}$/;
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const videoThumbnailSizes = ['maxres', 'standard', 'high', 'medium', 'default'];
const channelThumbnailSizes = ['medium', 'high', 'default'];

function bestThumbnail(thumbnails, sizes) {
  const size = sizes.find((name) => thumbnails?.[name]?.url);
  return size ? thumbnails[size].url : null;
}

function toChannel(item) {
  return {
    channelId: item.id,
    title: item.snippet?.title || 'YouTube channel',
    handle: item.snippet?.customUrl || null,
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails, channelThumbnailSizes),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || null
  };
}

function toVideo(item) {
  return {
    videoId: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId,
    title: item.snippet?.title || 'Untitled video',
    description: item.snippet?.description || '',
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails, videoThumbnailSizes),
    publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || null
  };
}

function parseUrl(value) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

export function parseChannelInput(input) {
  const value = String(input || '').trim();
  if (channelIdPattern.test(value)) {
    return { id: value };
  }
  if (handlePattern.test(value)) {
    return { forHandle: value.startsWith('@') ? value : `@${value}` };
  }
  const url = parseUrl(value);
  if (!url || !youtubeHosts.has(url.hostname.toLowerCase())) {
    return null;
  }
  const [first = '', second = ''] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (first.startsWith('@') && handlePattern.test(first)) {
    return { forHandle: first };
  }
  if (first === 'channel' && channelIdPattern.test(second)) {
    return { id: second };
  }
  if (first === 'user' && second) {
    return { forUsername: second };
  }
  return null;
}

export function createYouTubeClient({ settings, fetch = globalThis.fetch }) {
  async function request(resource, params) {
    const apiKey = settings.apiKey();
    if (!apiKey) {
      throw new HttpError(400, 'Add a YouTube API key in Settings.');
    }
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const quotaExceeded = quotaReasons.has(data?.error?.errors?.[0]?.reason);
      if (response.status === 404) {
        throw new HttpError(404, data?.error?.message || 'Not found on YouTube.');
      }
      throw new HttpError(quotaExceeded ? 429 : 502, quotaExceeded
        ? 'YouTube API quota exceeded. Try again after the quota resets.'
        : data?.error?.message || `YouTube API returned ${response.status}.`);
    }
    return data;
  }

  return {
    async findChannel(input) {
      const lookup = parseChannelInput(input);
      if (!lookup) {
        throw new HttpError(400, 'Enter a channel @handle, channel URL or channel ID.');
      }
      const data = await request('channels', { part: 'snippet,contentDetails', ...lookup });
      const channel = data.items?.[0] ? toChannel(data.items[0]) : null;
      if (!channel?.uploadsPlaylistId) {
        throw new HttpError(404, 'Channel not found on YouTube.');
      }
      return channel;
    },

    async listRecentUploads(playlistId, { limit = 50, missingIsEmpty = false } = {}) {
      const items = [];
      let pageToken = '';
      try {
        do {
          const params = { part: 'snippet,contentDetails', playlistId, maxResults: String(Math.min(50, limit - items.length)) };
          if (pageToken) {
            params.pageToken = pageToken;
          }
          const data = await request('playlistItems', params);
          items.push(...(data.items || []));
          pageToken = data.nextPageToken || '';
        } while (pageToken && items.length < limit);
      } catch (error) {
        if (missingIsEmpty && error.status === 404) {
          return [];
        }
        throw error;
      }
      return items
        .filter((item) => !unavailableTitles.has(item.snippet?.title))
        .map(toVideo)
        .filter((video) => video.videoId);
    }
  };
}
