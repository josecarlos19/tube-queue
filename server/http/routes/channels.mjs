import { HttpError } from '../../errors.mjs';
import { csv, json, readJson } from '../respond.mjs';
import { channelCsvTemplate, exportChannelsCsv } from '../../services/channels.mjs';

export function channelRoutes({ repository, sync, addChannel, importChannels }) {
  return [
    {
      method: 'GET', path: '/api/channels',
      handler({ res }) {
        json(res, 200, { channels: repository.listChannels() });
      }
    },
    {
      method: 'POST', path: '/api/channels',
      async handler({ req, res }) {
        const body = await readJson(req);
        const result = await addChannel(body.input);
        json(res, result.alreadyAdded ? 200 : 201, result);
      }
    },
    {
      method: 'GET', path: '/api/channels/export',
      handler({ res }) {
        csv(res, 'tubequeue-channels.csv', exportChannelsCsv(repository));
      }
    },
    {
      method: 'GET', path: '/api/channels/template',
      handler({ res }) {
        csv(res, 'tubequeue-channels-template.csv', channelCsvTemplate);
      }
    },
    {
      method: 'POST', path: '/api/channels/import',
      async handler({ req, res }) {
        const body = await readJson(req);
        if (typeof body.csv !== 'string' || !body.csv.trim()) {
          throw new HttpError(400, 'The CSV file is empty.');
        }
        json(res, 200, await importChannels(body.csv));
      }
    },
    {
      method: 'DELETE', path: '/api/channels',
      async handler({ req, res }) {
        const body = await readJson(req);
        const channelIds = Array.isArray(body.channelIds) ? [...new Set(body.channelIds.map(String).filter(Boolean))].slice(0, 1000) : [];
        if (!channelIds.length) {
          throw new HttpError(400, 'Select at least one channel.');
        }
        json(res, 200, { deleted: repository.deleteChannels(channelIds) });
      }
    },
    {
      method: 'DELETE', path: /^\/api\/channels\/([a-zA-Z0-9_-]+)$/,
      handler({ res, params: [channelId] }) {
        repository.deleteChannel(channelId);
        json(res, 200, { ok: true });
      }
    },
    {
      method: 'POST', path: '/api/sync',
      async handler({ res }) {
        json(res, 200, await sync.syncStale(true));
      }
    },
    {
      method: 'POST', path: '/api/cache/clear',
      async handler({ res }) {
        const removed = repository.clearVideoCache();
        json(res, 200, { removed, ...await sync.syncStale(true) });
      }
    }
  ];
}
