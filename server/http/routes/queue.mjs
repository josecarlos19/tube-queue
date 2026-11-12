import { json, readJson } from '../respond.mjs';

export function queueRoutes({ repository, now }) {
  const queue = () => ({ queue: repository.listQueue() });
  return [
    {
      method: 'GET', path: '/api/queue',
      handler({ res }) {
        json(res, 200, queue());
      }
    },
    {
      method: 'POST', path: '/api/queue',
      async handler({ req, res }) {
        const videoId = String((await readJson(req)).videoId || '').trim();
        if (!repository.videoExists(videoId)) {
          return json(res, 404, { error: 'Video not found.' });
        }
        repository.enqueue(videoId, now().toISOString());
        json(res, 200, queue());
      }
    },
    {
      method: 'PUT', path: '/api/queue',
      async handler({ req, res }) {
        const { videoIds } = await readJson(req);
        if (!Array.isArray(videoIds) || !repository.reorderQueue(videoIds.map(String))) {
          return json(res, 400, { error: 'Send every queued video exactly once.' });
        }
        json(res, 200, queue());
      }
    },
    {
      method: 'DELETE', path: '/api/queue',
      async handler({ req, res }) {
        const body = await readJson(req);
        if (body.all === true) {
          repository.clearQueue();
        } else {
          repository.dequeue(String(body.videoId || ''));
        }
        json(res, 200, queue());
      }
    }
  ];
}
