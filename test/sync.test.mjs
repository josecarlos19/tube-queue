import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDatabase } from '../server/storage/database.mjs';
import { createRepository } from '../server/storage/repository.mjs';
import { createSyncService } from '../server/services/sync.mjs';
import { channel, createFakeYouTube, video } from './helpers.mjs';

function setup(youtube, clock = { now: new Date('2026-11-10T12:00:00Z') }) {
  const repository = createRepository(openMemoryDatabase());
  const sync = createSyncService({ repository, youtube, intervalMs: 30 * 60_000, concurrency: 2, now: () => clock.now });
  return { repository, sync, clock };
}

test('stores uploads and records failures per channel', async () => {
  const youtube = createFakeYouTube({
    uploads: { UUa: [video('v1', '2026-11-09T00:00:00Z'), video('v2', '2026-11-10T00:00:00Z')] },
    failingPlaylists: new Set(['UUb'])
  });
  const { repository, sync } = setup(youtube);
  repository.upsertChannel(channel('a'), '2026-11-01T00:00:00Z');
  repository.upsertChannel(channel('b'), '2026-11-01T00:00:00Z');

  const result = await sync.syncStale();
  assert.equal(result.synced, 1);
  assert.deepEqual(result.errors, [{ channelId: 'b', message: 'Playlist UUb failed' }]);
  assert.deepEqual(repository.searchVideos({}).map((row) => row.video_id), ['v2', 'v1']);
  assert.equal(repository.findChannel('b').sync_error, 'Playlist UUb failed');
  assert.equal(repository.findChannel('a').last_synced_at, '2026-11-10T12:00:00.000Z');
});

test('skips channels synced within the interval unless forced', async () => {
  const youtube = createFakeYouTube();
  const { repository, sync, clock } = setup(youtube);
  repository.upsertChannel(channel('a'), '2026-11-01T00:00:00Z');
  await sync.syncStale();
  clock.now = new Date('2026-11-10T12:20:00Z');
  assert.equal((await sync.syncStale()).synced, 0);
  assert.equal((await sync.syncStale(true)).synced, 1);
  clock.now = new Date('2026-11-10T12:51:00Z');
  assert.equal((await sync.syncStale()).synced, 1);
});

test('concurrent callers share one run', async () => {
  const youtube = createFakeYouTube();
  const { repository, sync } = setup(youtube);
  for (const id of ['a', 'b', 'c']) {
    repository.upsertChannel(channel(id), '2026-11-01T00:00:00Z');
  }
  const [first, second] = await Promise.all([sync.syncStale(true), sync.syncStale(true)]);
  assert.equal(first, second);
  assert.equal(youtube.calls.filter(([name]) => name === 'listRecentUploads').length, 3);
});
