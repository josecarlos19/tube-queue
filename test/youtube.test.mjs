import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeClient, parseChannelInput } from '../server/google/youtube.mjs';

const channelId = 'UCabcdefghijklmnopqrstuv';

function fakeSettings(apiKey = 'k') {
  return { apiKey: () => apiKey };
}

function fakeFetch(responder) {
  const requests = [];
  const fetch = async (url) => {
    requests.push(new URL(url));
    const { status = 200, body } = responder(new URL(url), requests.length);
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, requests };
}

test('parses channel IDs, handles and YouTube URLs', () => {
  assert.deepEqual(parseChannelInput(channelId), { id: channelId });
  assert.deepEqual(parseChannelInput('@Fireship'), { forHandle: '@Fireship' });
  assert.deepEqual(parseChannelInput('fireship'), { forHandle: '@fireship' });
  assert.deepEqual(parseChannelInput('https://www.youtube.com/@Fireship/videos'), { forHandle: '@Fireship' });
  assert.deepEqual(parseChannelInput('youtube.com/@Fireship'), { forHandle: '@Fireship' });
  assert.deepEqual(parseChannelInput(`https://m.youtube.com/channel/${channelId}`), { id: channelId });
  assert.deepEqual(parseChannelInput('https://www.youtube.com/user/GoogleDevelopers'), { forUsername: 'GoogleDevelopers' });
  assert.equal(parseChannelInput('https://www.youtube.com/c/SomeName'), null);
  assert.equal(parseChannelInput('https://example.com/@someone'), null);
  assert.equal(parseChannelInput(''), null);
});

test('finds a channel with the API key and the parsed lookup', async () => {
  const { fetch, requests } = fakeFetch(() => ({ body: { items: [{ id: channelId, snippet: { title: 'Fireship', customUrl: '@fireship' }, contentDetails: { relatedPlaylists: { uploads: 'UUx' } } }] } }));
  const found = await createYouTubeClient({ settings: fakeSettings('my-key'), fetch }).findChannel('https://www.youtube.com/@Fireship');
  assert.deepEqual(found, { channelId, title: 'Fireship', handle: '@fireship', thumbnailUrl: null, uploadsPlaylistId: 'UUx' });
  assert.equal(requests[0].pathname, '/youtube/v3/channels');
  assert.equal(requests[0].searchParams.get('forHandle'), '@Fireship');
  assert.equal(requests[0].searchParams.get('key'), 'my-key');
});

test('an unknown channel is a 404 and invalid input is a 400 without calling YouTube', async () => {
  const empty = fakeFetch(() => ({ body: {} }));
  await assert.rejects(createYouTubeClient({ settings: fakeSettings(), fetch: empty.fetch }).findChannel('@nobody'), { status: 404 });

  const invalid = fakeFetch(() => ({ body: {} }));
  await assert.rejects(createYouTubeClient({ settings: fakeSettings(), fetch: invalid.fetch }).findChannel('https://example.com'), { status: 400 });
  assert.equal(invalid.requests.length, 0);
});

test('without an API key it fails before calling YouTube', async () => {
  const { fetch, requests } = fakeFetch(() => ({ body: {} }));
  const client = createYouTubeClient({ settings: fakeSettings(''), fetch });
  await assert.rejects(client.listRecentUploads('UU1'), { status: 400 });
  await assert.rejects(client.findChannel('@someone'), { status: 400 });
  assert.equal(requests.length, 0);
});

test('only quota errors become 429; other API errors become 502', async () => {
  const quota = fakeFetch(() => ({ status: 403, body: { error: { message: 'x', errors: [{ reason: 'quotaExceeded' }] } } }));
  await assert.rejects(createYouTubeClient({ settings: fakeSettings(), fetch: quota.fetch }).listRecentUploads('UU1'),
    { status: 429, message: 'YouTube API quota exceeded. Try again after the quota resets.' });

  const forbidden = fakeFetch(() => ({ status: 403, body: { error: { message: 'YouTube Data API v3 has not been used in project 1', errors: [{ reason: 'accessNotConfigured' }] } } }));
  await assert.rejects(createYouTubeClient({ settings: fakeSettings(), fetch: forbidden.fetch }).listRecentUploads('UU1'),
    { status: 502, message: 'YouTube Data API v3 has not been used in project 1' });
});

test('maps uploads and skips deleted and private videos', async () => {
  const { fetch } = fakeFetch(() => ({ body: { items: [
    { snippet: { title: 'Hello', description: 'd', thumbnails: { medium: { url: 'm.jpg' } } }, contentDetails: { videoId: 'v1', videoPublishedAt: '2026-11-01T00:00:00Z' } },
    { snippet: { title: 'Deleted video' }, contentDetails: { videoId: 'v2' } },
    { snippet: { title: 'Private video' }, contentDetails: { videoId: 'v3' } },
    { snippet: { title: 'No id' }, contentDetails: {} }
  ] } }));
  const videos = await createYouTubeClient({ settings: fakeSettings(), fetch }).listRecentUploads('UU1');
  assert.deepEqual(videos, [{ videoId: 'v1', title: 'Hello', description: 'd', thumbnailUrl: 'm.jpg', publishedAt: '2026-11-01T00:00:00Z' }]);
});
