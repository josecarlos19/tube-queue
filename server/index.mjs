import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, readConfig } from './config.mjs';
import { openDatabase } from './storage/database.mjs';
import { createContainer } from './container.mjs';
import { createApp } from './http/app.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(rootDir);
const config = { ...readConfig(process.env, rootDir), dev: process.argv.includes('--dev') };

process.umask(0o077);
const db = openDatabase(config.dataDir);
const container = createContainer({ db, config });
const server = http.createServer(createApp(container));
container.sync.startScheduler({ onError: (error) => console.error('Scheduled sync failed:', error.message) });

server.listen(config.port, config.host, () => {
  console.log(`TubeQueue is running at http://${config.host}:${config.port}`);
  console.log(`SQLite database: ${path.join(config.dataDir, 'tubequeue.sqlite')}`);
});
