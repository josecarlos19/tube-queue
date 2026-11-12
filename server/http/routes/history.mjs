import { HttpError } from '../../errors.mjs';
import { json, readJson } from '../respond.mjs';

const playbackStates = ['opened', 'started', 'finished'];

function toInstant(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Invalid date filter.');
  }
  return date.toISOString();
}

export function historyRoutes({ repository, settings, now }) {
  return [
    {
      method: 'GET', path: '/api/history',
      handler({ res, url }) {
        const history = repository.listHistory({
          from: toInstant(url.searchParams.get('from')),
          to: toInstant(url.searchParams.get('to'))
        });
        json(res, 200, { history });
      }
    },
    {
      method: 'POST', path: '/api/history',
      async handler({ req, res }) {
        const body = await readJson(req);
        const videoId = String(body.videoId || '').trim();
        if (!videoId || !repository.videoExists(videoId)) {
          return json(res, 404, { error: 'Video not found in the local feed.' });
        }
        if (!settings.recordHistory()) {
          return json(res, 200, { ok: true, recorded: false });
        }
        const playbackState = playbackStates.includes(body.state) ? body.state : 'opened';
        repository.recordPlayback(videoId, playbackState, now().toISOString());
        json(res, 200, { ok: true, recorded: true });
      }
    },
    {
      method: 'POST', path: '/api/history/mark',
      async handler({ req, res }) {
        const body = await readJson(req);
        const videoId = String(body.videoId || '').trim();
        if (!repository.videoExists(videoId)) {
          return json(res, 404, { error: 'Video not found.' });
        }
        repository.markWatched(videoId, now().toISOString());
        json(res, 200, { ok: true });
      }
    },
    {
      method: 'DELETE', path: '/api/history/mark',
      async handler({ req, res }) {
        const body = await readJson(req);
        const videoId = String(body.videoId || '').trim();
        if (!repository.videoExists(videoId)) {
          return json(res, 404, { error: 'Video not found.' });
        }
        repository.unmarkWatched(videoId, now().toISOString());
        json(res, 200, { ok: true });
      }
    },
    {
      method: 'DELETE', path: '/api/history',
      async handler({ req, res }) {
        const body = await readJson(req);
        const videoIds = Array.isArray(body.videoIds) ? [...new Set(body.videoIds.map(String).filter(Boolean))].slice(0, 1000) : [];
        if (!videoIds.length) {
          return json(res, 400, { error: 'Select at least one history item.' });
        }
        repository.deleteHistory(videoIds);
        json(res, 200, { deleted: videoIds.length });
      }
    }
  ];
}
