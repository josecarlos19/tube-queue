import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channel, createFakeYouTube, startTestApp, video } from './helpers.mjs';

const alphaId = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const betaId = 'UCbbbbbbbbbbbbbbbbbbbbbb';

function youtubeWithChannels() {
  return createFakeYouTube({
    channels: [channel(alphaId, { title: 'Alpha', handle: '@alpha' }), channel(betaId, { title: 'Beta', handle: '@beta' })],
    uploads: {
      [`UU${alphaId}`]: [video('a1', '2026-11-08T10:00:00Z', { title: 'Rust tips' }), video('a2', '2026-11-10T10:00:00Z')],
      [`UU${betaId}`]: [video('b1', '2026-11-09T10:00:00Z', { description: 'all about rust' })]
    }
  });
}

async function addBoth(app) {
  await app.request('POST', '/api/channels', { body: { input: '@alpha' } });
  await app.request('POST', '/api/channels', { body: { input: betaId } });
}

test('adding channels fills a chronological, filterable feed', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);

  const added = await app.request('POST', '/api/channels', { body: { input: '@alpha' } });
  assert.equal(added.status, 201);
  assert.equal(added.data.channel.title, 'Alpha');
  assert.equal(added.data.alreadyAdded, false);
  assert.equal(added.data.syncError, null);
  await app.request('POST', '/api/channels', { body: { input: betaId } });

  const channels = await app.request('GET', '/api/channels');
  assert.deepEqual(channels.data.channels.map((row) => row.title), ['Alpha', 'Beta']);

  const feed = await app.request('GET', '/api/videos');
  assert.deepEqual(feed.data.videos.map((row) => row.video_id), ['a2', 'b1', 'a1']);
  assert.equal(feed.data.videos[0].channel_title, 'Alpha');

  const search = await app.request('GET', '/api/videos?q=rust');
  assert.deepEqual(search.data.videos.map((row) => row.video_id), ['b1', 'a1']);

  const byChannel = await app.request('GET', `/api/videos?channel=${betaId}`);
  assert.deepEqual(byChannel.data.videos.map((row) => row.video_id), ['b1']);
});

test('adding the same channel twice keeps one entry', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await app.request('POST', '/api/channels', { body: { input: '@alpha' } });
  const again = await app.request('POST', '/api/channels', { body: { input: alphaId } });
  assert.equal(again.status, 200);
  assert.equal(again.data.alreadyAdded, true);
  assert.equal((await app.request('GET', '/api/channels')).data.channels.length, 1);
});

test('an unknown channel is reported and not stored', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  const missing = await app.request('POST', '/api/channels', { body: { input: '@nobody' } });
  assert.equal(missing.status, 404);
  assert.deepEqual((await app.request('GET', '/api/channels')).data.channels, []);
});

test('a channel whose uploads fail to sync is still added with the error', async (t) => {
  const youtube = createFakeYouTube({ channels: [channel(alphaId, { handle: '@alpha' })], failingPlaylists: new Set([`UU${alphaId}`]) });
  const app = await startTestApp({ youtube });
  t.after(app.close);
  const added = await app.request('POST', '/api/channels', { body: { input: '@alpha' } });
  assert.equal(added.status, 201);
  assert.equal(added.data.syncError, `Playlist UU${alphaId} failed`);
  assert.equal(added.data.channel.sync_error, `Playlist UU${alphaId} failed`);
});

test('exports saved channels as CSV that imports back', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await addBoth(app);

  const exported = await app.request('GET', '/api/channels/export');
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type'), /^text\/csv/);
  assert.match(exported.headers.get('content-disposition'), /attachment; filename="tubequeue-channels.csv"/);
  const rawBytes = new Uint8Array(await (await fetch(`${app.baseUrl}/api/channels/export`)).arrayBuffer());
  assert.deepEqual([...rawBytes.slice(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.equal(exported.data, `channel,title,url\r\n${alphaId},Alpha,https://www.youtube.com/channel/${alphaId}\r\n${betaId},Beta,https://www.youtube.com/channel/${betaId}\r\n`);

  const fresh = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(fresh.close);
  const imported = await fresh.request('POST', '/api/channels/import', { body: { csv: exported.data } });
  assert.deepEqual(imported.data, { added: 2, alreadyAdded: 0, skipped: [], syncErrors: [] });
  assert.deepEqual((await fresh.request('GET', '/api/videos')).data.videos.map((row) => row.video_id), ['a2', 'b1', 'a1']);
});

test('the CSV template has a channel column with example rows', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const template = await app.request('GET', '/api/channels/template');
  assert.match(template.headers.get('content-disposition'), /tubequeue-channels-template.csv/);
  const lines = template.data.replace('\uFEFF', '').trim().split('\r\n');
  assert.equal(lines[0], 'channel,title,url');
  assert.ok(lines.length > 1);
});

test('CSV import adds only valid channels and reports the rest by line', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await app.request('POST', '/api/channels', { body: { input: betaId } });

  const csv = ['channel,title', '@alpha,Alpha', 'not a channel!,x', '@nobody,', '', `${alphaId},dup`, `${betaId},existing`].join('\n');
  const imported = await app.request('POST', '/api/channels/import', { body: { csv } });
  assert.equal(imported.status, 200);
  assert.equal(imported.data.added, 1);
  assert.equal(imported.data.alreadyAdded, 1);
  assert.deepEqual(imported.data.skipped.map((row) => [row.line, row.input]), [[3, 'not a channel!'], [4, '@nobody'], [6, alphaId]]);
  assert.deepEqual((await app.request('GET', '/api/channels')).data.channels.map((row) => row.title), ['Alpha', 'Beta']);
});

test('CSV import without a header reads the first column', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  const imported = await app.request('POST', '/api/channels/import', { body: { csv: '@alpha\r\n@beta\r\n' } });
  assert.equal(imported.data.added, 2);
  assert.equal((await app.request('POST', '/api/channels/import', { body: { csv: '  ' } })).status, 400);
});

test('history records playback, marks watched, filters by date and deletes', async (t) => {
  let now = new Date('2026-11-09T12:00:00Z');
  const app = await startTestApp({ youtube: youtubeWithChannels(), now: () => now });
  t.after(app.close);
  await addBoth(app);

  await app.request('POST', '/api/history', { body: { videoId: 'a1', state: 'started' } });
  now = new Date('2026-11-10T12:00:00Z');
  await app.request('POST', '/api/history', { body: { videoId: 'a1', state: 'opened' } });
  await app.request('POST', '/api/history/mark', { body: { videoId: 'b1' } });

  const all = await app.request('GET', '/api/history');
  assert.deepEqual(all.data.history.map((row) => [row.video_id, row.playback_state, row.manually_watched]), [['a1', 'started', 0], ['b1', 'finished', 1]]);

  const firstDayOnly = await app.request('GET', '/api/history?from=2026-11-09T00:00:00.000Z&to=2026-11-10T00:00:00.000Z');
  assert.deepEqual(firstDayOnly.data.history.map((row) => row.video_id), []);
  const secondDay = await app.request('GET', '/api/history?from=2026-11-10T00:00:00.000Z&to=2026-11-11T00:00:00.000Z');
  assert.deepEqual(secondDay.data.history.map((row) => row.video_id), ['a1', 'b1']);
  assert.equal((await app.request('GET', '/api/history?from=banana')).status, 400);

  assert.equal((await app.request('POST', '/api/history', { body: { videoId: 'missing' } })).status, 404);
  const deleted = await app.request('DELETE', '/api/history', { body: { videoIds: ['a1', 'a1'] } });
  assert.deepEqual(deleted.data, { deleted: 1 });
  assert.deepEqual((await app.request('GET', '/api/history')).data.history.map((row) => row.video_id), ['b1']);

  const feed = await app.request('GET', '/api/videos');
  assert.deepEqual(feed.data.videos.map((row) => row.video_id), ['a2', 'b1', 'a1']);
});

test('removing a channel removes its videos from the feed', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await addBoth(app);
  await app.request('DELETE', `/api/channels/${alphaId}`);
  assert.deepEqual((await app.request('GET', '/api/videos')).data.videos.map((row) => row.video_id), ['b1']);
});

test('deletes several channels at once', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await addBoth(app);
  const deleted = await app.request('DELETE', '/api/channels', { body: { channelIds: [alphaId, betaId, alphaId, 'UCmissing'] } });
  assert.deepEqual(deleted.data, { deleted: 2 });
  assert.deepEqual((await app.request('GET', '/api/channels')).data.channels, []);
  assert.deepEqual((await app.request('GET', '/api/videos')).data.videos, []);
  assert.equal((await app.request('DELETE', '/api/channels', { body: { channelIds: [] } })).status, 400);
});

test('unmarking a watched video makes it unwatched again', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await addBoth(app);
  await app.request('POST', '/api/history', { body: { videoId: 'a1', state: 'finished' } });
  await app.request('POST', '/api/history/mark', { body: { videoId: 'b1' } });
  await app.request('DELETE', '/api/history/mark', { body: { videoId: 'a1' } });
  await app.request('DELETE', '/api/history/mark', { body: { videoId: 'b1' } });
  const history = (await app.request('GET', '/api/history')).data.history;
  assert.deepEqual(history.map((row) => [row.video_id, row.playback_state, row.manually_watched]).sort(), [['a1', 'started', 0], ['b1', 'started', 0]]);
  assert.equal((await app.request('DELETE', '/api/history/mark', { body: { videoId: 'missing' } })).status, 404);
});

test('rejects cross-site and non-JSON writes', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const plain = await app.request('POST', '/api/settings', { body: { theme: 'dark' }, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(plain.status, 403);
  const crossSite = await app.request('POST', '/api/settings', { body: { theme: 'dark' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(crossSite.status, 403);
  const sameSite = await app.request('POST', '/api/settings', { body: { theme: 'dark' }, headers: { Origin: app.baseUrl } });
  assert.equal(sameSite.data.theme, 'dark');
});

test('the last sync time can be hidden and shown again', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  assert.equal((await app.request('GET', '/api/settings')).data.showLastSync, true);
  assert.equal((await app.request('POST', '/api/settings', { body: { showLastSync: false } })).data.showLastSync, false);
  assert.equal((await app.request('GET', '/api/settings')).data.showLastSync, false);
  assert.equal((await app.request('POST', '/api/settings', { body: { showLastSync: 'no' } })).data.showLastSync, false);
  assert.equal((await app.request('POST', '/api/settings', { body: { showLastSync: true } })).data.showLastSync, true);
});

test('with history turned off, playback is not recorded but marking as watched still works', async (t) => {
  const app = await startTestApp({ youtube: youtubeWithChannels() });
  t.after(app.close);
  await addBoth(app);
  assert.equal((await app.request('GET', '/api/settings')).data.recordHistory, true);

  await app.request('POST', '/api/history', { body: { videoId: 'a1', state: 'opened' } });
  assert.equal((await app.request('POST', '/api/settings', { body: { recordHistory: false } })).data.recordHistory, false);

  const ignored = await app.request('POST', '/api/history', { body: { videoId: 'a2', state: 'started' } });
  assert.deepEqual(ignored.data, { ok: true, recorded: false });
  await app.request('POST', '/api/history/mark', { body: { videoId: 'b1' } });

  const history = (await app.request('GET', '/api/history')).data.history;
  assert.deepEqual(history.map((row) => row.video_id).sort(), ['a1', 'b1']);

  await app.request('POST', '/api/settings', { body: { recordHistory: true } });
  const recorded = await app.request('POST', '/api/history', { body: { videoId: 'a2', state: 'started' } });
  assert.deepEqual(recorded.data, { ok: true, recorded: true });
});

test('settings never return the API key', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const saved = await app.request('POST', '/api/settings', { body: { apiKey: 'my-secret-key' } });
  assert.equal(saved.data.hasApiKey, true);
  assert.equal(JSON.stringify(saved.data).includes('my-secret-key'), false);
});

test('OAuth routes no longer exist', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  assert.equal((await app.request('POST', '/api/subscriptions/import', { body: {} })).status, 405);
  assert.equal((await app.request('GET', '/auth/youtube/start')).status, 404);
});

test('malformed URLs and path traversal are rejected without crashing', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  assert.equal((await app.request('GET', '/%E0%A4%A')).status, 400);
  assert.equal((await app.request('GET', '/..%2Fpackage.json')).status, 403);
  assert.equal((await app.request('GET', '/api/health')).status, 200);
});
