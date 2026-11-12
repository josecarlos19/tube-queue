import { json } from '../respond.mjs';

export function videoRoutes({ repository, sync, logger }) {
  return [
    {
      method: 'GET', path: '/api/videos',
      handler({ res, url }) {
        sync.syncStale(false).catch((error) => logger.error('Background sync failed:', error.message));
        const videos = repository.searchVideos({
          channelId: url.searchParams.get('channel') || '',
          query: url.searchParams.get('q')?.trim() || ''
        });
        json(res, 200, { videos });
      }
    }
  ];
}
