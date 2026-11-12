import { json } from './respond.mjs';
import { createStaticHandler } from './static.mjs';
import { settingsRoutes } from './routes/settings.mjs';
import { channelRoutes } from './routes/channels.mjs';
import { groupRoutes } from './routes/groups.mjs';
import { videoRoutes } from './routes/videos.mjs';
import { historyRoutes } from './routes/history.mjs';
import { queueRoutes } from './routes/queue.mjs';
import { devRoutes } from './routes/dev.mjs';

function isTrustedWrite(req, baseUrl) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    return false;
  }
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  return origin === baseUrl || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    if (typeof route.path === 'string') {
      if (route.path === pathname) {
        return { route, params: [] };
      }
      continue;
    }
    const match = pathname.match(route.path);
    if (match) {
      return { route, params: match.slice(1) };
    }
  }
  return null;
}

export function createApp(dependencies) {
  const routes = [
    { method: 'GET', path: '/api/health', handler: ({ res }) => json(res, 200, { ok: true }) },
    ...settingsRoutes(dependencies),
    ...channelRoutes(dependencies),
    ...groupRoutes(dependencies),
    ...videoRoutes(dependencies),
    ...historyRoutes(dependencies),
    ...queueRoutes(dependencies),
    ...devRoutes(dependencies)
  ];
  const serveStatic = createStaticHandler(dependencies.config.publicDir);

  return async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return json(res, 400, { error: 'Malformed URL.' });
    }
    try {
      if (req.method !== 'GET' && pathname.startsWith('/api/') && !isTrustedWrite(req, dependencies.config.baseUrl)) {
        return json(res, 403, { error: 'Cross-site or non-JSON request rejected.' });
      }
      const matched = matchRoute(routes, req.method, pathname);
      if (matched) {
        return await matched.route.handler({ req, res, url, params: matched.params });
      }
      if (req.method === 'GET' && pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'API route not found.' });
      }
      if (req.method === 'GET') {
        return serveStatic(res, pathname);
      }
      return json(res, 405, { error: 'Method not allowed.' });
    } catch (error) {
      json(res, error.status || 500, { error: error.message || 'Unexpected server error.' });
    }
  };
}
