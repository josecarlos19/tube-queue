export function createSyncService({ repository, youtube, intervalMs, concurrency, hideShorts = () => false, videosPerChannel = () => 50, now = () => new Date() }) {
  let running = null;

  async function syncChannel(channelId) {
    const channel = repository.findChannel(channelId);
    if (!channel) {
      return;
    }
    try {
      const limit = videosPerChannel();
      const playlistSuffix = channel.uploads_playlist_id.slice(2);
      const videos = hideShorts()
        ? (await Promise.all([
            youtube.listRecentUploads(`UULF${playlistSuffix}`, { limit, missingIsEmpty: true }),
            youtube.listRecentUploads(`UULV${playlistSuffix}`, { limit: 50, missingIsEmpty: true })
          ])).flat().sort((first, second) => String(second.publishedAt).localeCompare(String(first.publishedAt))).slice(0, limit)
        : await youtube.listRecentUploads(channel.uploads_playlist_id, { limit });
      repository.saveUploads(channelId, videos, now().toISOString());
    } catch (error) {
      repository.recordSyncError(channelId, error.message);
      throw error;
    }
  }

  async function syncMany(channelIds) {
    const errors = [];
    let next = 0;
    const worker = async () => {
      while (next < channelIds.length) {
        const channelId = channelIds[next++];
        try {
          await syncChannel(channelId);
        } catch (error) {
          errors.push({ channelId, message: error.message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, channelIds.length) }, worker));
    return { synced: channelIds.length - errors.length, errors };
  }

  function syncStale(force = false) {
    if (running) {
      return running;
    }
    const interval = intervalMs();
    if (!force && !interval) {
      return Promise.resolve({ synced: 0, errors: [] });
    }
    const cutoff = now().getTime() - interval;
    const due = repository.listChannelsForSync()
      .filter((channel) => force || !channel.last_synced_at || Date.parse(channel.last_synced_at) < cutoff)
      .map((channel) => channel.channel_id);
    running = syncMany(due).finally(() => {
      running = null;
    });
    return running;
  }

  function startScheduler({ tickMs = 60_000, onError = () => {} } = {}) {
    const tick = () => syncStale(false).catch(onError);
    tick();
    const timer = setInterval(tick, tickMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return { syncChannel, syncMany, syncStale, startScheduler };
}
