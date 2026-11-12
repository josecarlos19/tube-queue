import fs from 'node:fs';

export function devRoutes({ config }) {
  if (!config.dev) {
    return [];
  }
  const clients = new Set();
  let pending = null;
  fs.watch(config.publicDir, { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      for (const client of clients) {
        client.write('data: reload\n\n');
      }
    }, 80);
  });
  return [
    {
      method: 'GET', path: '/api/dev/reload',
      handler({ req, res }) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
      }
    }
  ];
}
