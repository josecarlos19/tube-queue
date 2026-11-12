export function createSyncService({ repository, youtube, intervalMs, concurrency, now = () => new Date() }) {
  let running = null;

  async function syncChannel(channelId) {
    const channel = repository.findChannel(channelId);
    if (!channel) {
      return;
    }
    try {
      const videos = await youtube.listRecentUploads(channel.uploads_playlist_id);
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
    const cutoff = now().getTime() - intervalMs;
    const due = repository.listChannelsForSync()
      .filter((channel) => force || !channel.last_synced_at || Date.parse(channel.last_synced_at) < cutoff)
      .map((channel) => channel.channel_id);
    running = syncMany(due).finally(() => {
      running = null;
    });
    return running;
  }

  return { syncChannel, syncMany, syncStale };
}
