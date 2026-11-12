import { json, readJson } from '../respond.mjs';

const languages = ['en', 'pt-BR'];
const themes = ['light', 'dark'];
export const syncIntervals = [0, 15, 30, 60, 180];
export const videosPerChannelOptions = [50, 100, 200];

export function settingsRoutes({ settings, config }) {
  const payload = () => ({
    hasApiKey: Boolean(settings.apiKey()),
    dev: Boolean(config.dev),
    language: settings.language(),
    theme: settings.theme(),
    showLastSync: settings.showLastSync(),
    recordHistory: settings.recordHistory(),
    hideShorts: settings.hideShorts(),
    videosPerChannel: settings.videosPerChannel(),
    floatingQueue: settings.floatingQueue(),
    dataSaver: settings.dataSaver(),
    markWatchedOnClose: settings.markWatchedOnClose(),
    syncIntervalMinutes: settings.syncIntervalMinutes()
  });

  return [
    {
      method: 'GET', path: '/api/settings',
      handler({ res }) {
        json(res, 200, payload());
      }
    },
    {
      method: 'POST', path: '/api/settings',
      async handler({ req, res }) {
        const body = await readJson(req);
        if (typeof body.apiKey === 'string') {
          settings.save('api_key', body.apiKey.trim());
        }
        if (languages.includes(body.language)) {
          settings.save('language', body.language);
        }
        if (themes.includes(body.theme)) {
          settings.save('theme', body.theme);
        }
        if (typeof body.showLastSync === 'boolean') {
          settings.save('show_last_sync', body.showLastSync);
        }
        if (typeof body.recordHistory === 'boolean') {
          settings.save('record_history', body.recordHistory);
        }
        if (typeof body.hideShorts === 'boolean') {
          settings.save('hide_shorts', body.hideShorts);
        }
        if (typeof body.floatingQueue === 'boolean') {
          settings.save('floating_queue', body.floatingQueue);
        }
        if (typeof body.dataSaver === 'boolean') {
          settings.save('data_saver', body.dataSaver);
        }
        if (typeof body.markWatchedOnClose === 'boolean') {
          settings.save('mark_watched_on_close', body.markWatchedOnClose);
        }
        if (videosPerChannelOptions.includes(body.videosPerChannel)) {
          settings.save('videos_per_channel', body.videosPerChannel);
        }
        if (syncIntervals.includes(body.syncIntervalMinutes)) {
          settings.save('sync_interval_minutes', body.syncIntervalMinutes);
        }
        json(res, 200, payload());
      }
    }
  ];
}
