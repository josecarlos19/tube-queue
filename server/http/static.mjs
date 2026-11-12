import fs from 'node:fs';
import path from 'node:path';
import { json } from './respond.mjs';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

export function createStaticHandler(publicDir) {
  return function serveStatic(res, pathname) {
    const route = pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(publicDir, `.${route}`);
    if (!file.startsWith(`${publicDir}${path.sep}`)) {
      return json(res, 403, { error: 'Forbidden' });
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return json(res, 404, { error: 'Not found' });
    }
    const extension = path.extname(file);
    res.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY'
    });
    fs.createReadStream(file).pipe(res);
  };
}
