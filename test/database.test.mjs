import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/storage/database.mjs';

test('reopening a database deletes leftover OAuth settings and keeps the rest', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubequeue-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const first = openDatabase(dataDir);
  const insert = first.prepare('INSERT INTO settings(setting_key, setting_value) VALUES (?, ?)');
  for (const key of ['oauth_access_token', 'oauth_client_secret', 'oauthless', 'api_key']) {
    insert.run(key, 'value');
  }
  first.close();

  const reopened = openDatabase(dataDir);
  t.after(() => reopened.close());
  const keys = reopened.prepare('SELECT setting_key FROM settings ORDER BY setting_key').all().map((row) => row.setting_key);
  assert.deepEqual(keys, ['api_key', 'oauthless']);
});
