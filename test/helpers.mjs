import http from 'node:http';
import path from 'node:path';
import { openMemoryDatabase } from '../server/storage/database.mjs';
import { readConfig } from '../server/config.mjs';
import { createContainer } from '../server/container.mjs';
import { createApp } from '../server/http/app.mjs';
import { HttpError } from '../server/errors.mjs';

export const rootDir = path.resolve(import.meta.dirname, '..');

export function channel(channelId, overrides = {}) {
  return { channelId, title: `Channel ${channelId}`, handle: `@${channelId}`, thumbnailUrl: null, uploadsPlaylistId: `UU${channelId}`, ...overrides };
}

export function video(videoId, publishedAt, overrides = {}) {
  return { videoId, title: `Video ${videoId}`, description: '', thumbnailUrl: null, publishedAt, ...overrides };
}

export function createFakeYouTube({ channels = [], uploads = {}, shorts = {}, failingPlaylists = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    async findChannel(input) {
      calls.push(['findChannel', input]);
      const found = channels.find((item) => item.channelId === input || item.handle === input);
      if (!found) {
        throw new HttpError(404, 'Channel not found on YouTube.');
      }
      return found;
    },
    async listRecentUploads(playlistId, options = {}) {
      calls.push(['listRecentUploads', playlistId, options]);
      const uploadsPlaylistId = `UU${playlistId.replace(/^UU(LF|LV)?/, '')}`;
      if (failingPlaylists.has(uploadsPlaylistId)) {
        throw new Error(`Playlist ${uploadsPlaylistId} failed`);
      }
      const channelShorts = new Set(shorts[uploadsPlaylistId.slice(2)] || []);
      const all = uploads[uploadsPlaylistId] || [];
      if (playlistId.startsWith('UULF')) {
        return all.filter((item) => !channelShorts.has(item.videoId) && !item.live);
      }
      if (playlistId.startsWith('UULV')) {
        return all.filter((item) => item.live);
      }
      return all;
    }
  };
}

export async function startTestApp({ youtube = createFakeYouTube(), now = () => new Date('2026-11-10T12:00:00Z') } = {}) {
  const db = openMemoryDatabase();
  const config = readConfig({ PORT: '8070' }, rootDir);
  const container = createContainer({ db, config, now, logger: { error() {} }, overrides: { youtube } });
  const server = http.createServer(createApp(container));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, pathname, { body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual'
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: response.status, headers: response.headers, data };
  }

  return { ...container, db, baseUrl, request, close: () => new Promise((resolve) => server.close(resolve)) };
}
