import { createSettingsStore } from './storage/settings.mjs';
import { createRepository } from './storage/repository.mjs';
import { createYouTubeClient } from './google/youtube.mjs';
import { createSyncService } from './services/sync.mjs';
import { createChannelAdder, createChannelImporter } from './services/channels.mjs';

export function createContainer({ db, config, fetch = globalThis.fetch, now = () => new Date(), logger = console, overrides = {} }) {
  const settings = createSettingsStore(db, config.credentialDefaults);
  const repository = createRepository(db);
  const youtube = overrides.youtube ?? createYouTubeClient({ settings, fetch });
  const sync = createSyncService({ repository, youtube, intervalMs: config.syncIntervalMs, concurrency: config.syncConcurrency, now });
  const addChannel = createChannelAdder({ youtube, repository, sync, now });
  const importChannels = createChannelImporter({ youtube, repository, sync, now });
  return { config, settings, repository, youtube, sync, addChannel, importChannels, now, logger };
}
