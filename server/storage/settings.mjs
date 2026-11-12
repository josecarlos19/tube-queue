export function createSettingsStore(db, credentialDefaults) {
  const select = db.prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
  const upsert = db.prepare(`INSERT INTO settings(setting_key, setting_value) VALUES (?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value`);
  const get = (key, fallback) => select.get(key)?.setting_value ?? fallback;
  const save = (key, value) => {
    upsert.run(key, String(value));
  };
  return {
    get,
    save,
    apiKey: () => get('api_key', credentialDefaults.apiKey).trim(),
    language: () => get('language', 'en'),
    theme: () => get('theme', 'light'),
    showLastSync: () => get('show_last_sync', 'true') === 'true',
    recordHistory: () => get('record_history', 'true') === 'true',
    hideShorts: () => get('hide_shorts', 'true') === 'true',
    videosPerChannel: () => Number(get('videos_per_channel', '50')),
    floatingQueue: () => get('floating_queue', 'true') === 'true',
    dataSaver: () => get('data_saver', 'false') === 'true',
    markWatchedOnClose: () => get('mark_watched_on_close', 'true') === 'true',
    autoplayNext: () => get('autoplay_next', 'true') === 'true',
    syncIntervalMinutes: () => Number(get('sync_interval_minutes', '30'))
  };
}
