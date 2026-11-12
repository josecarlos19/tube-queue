import path from 'node:path';

export function loadEnvFile(rootDir) {
  try {
    process.loadEnvFile(path.join(rootDir, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function readConfig(env, rootDir) {
  const port = Number(env.PORT || 8070);
  return {
    port,
    host: env.HOST || '127.0.0.1',
    dataDir: path.resolve(env.DATA_DIR || path.join(rootDir, 'data')),
    publicDir: path.join(rootDir, 'public'),
    baseUrl: (env.APP_BASE_URL || `http://localhost:${port}`).trim().replace(/\/$/, ''),
    syncIntervalMs: 30 * 60 * 1000,
    syncConcurrency: 4,
    credentialDefaults: {
      apiKey: env.YOUTUBE_API_KEY || ''
    }
  };
}
