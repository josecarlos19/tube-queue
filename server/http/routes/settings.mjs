import { json, readJson } from '../respond.mjs';

const languages = ['en', 'pt-BR'];
const themes = ['light', 'dark'];

export function settingsRoutes({ settings }) {
  const payload = () => ({
    hasApiKey: Boolean(settings.apiKey()),
    language: settings.language(),
    theme: settings.theme(),
    showLastSync: settings.showLastSync(),
    recordHistory: settings.recordHistory()
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
        json(res, 200, payload());
      }
    }
  ];
}
