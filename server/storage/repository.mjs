export function createRepository(db) {
  function transaction(work) {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const upsertVideo = db.prepare(`
    INSERT INTO videos (video_id, channel_id, title, description, thumbnail_url, published_at, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      channel_id=excluded.channel_id, title=excluded.title, description=excluded.description,
      thumbnail_url=excluded.thumbnail_url, published_at=excluded.published_at, cached_at=excluded.cached_at
  `);
  const markSynced = db.prepare('UPDATE channels SET last_synced_at = ?, sync_error = NULL WHERE channel_id = ?');
  const deleteHistoryEntry = db.prepare('DELETE FROM watch_history WHERE video_id = ?');

  return {
    listChannels() {
      return db.prepare('SELECT * FROM channels ORDER BY title COLLATE NOCASE').all();
    },
    listChannelsForSync() {
      return db.prepare('SELECT channel_id, last_synced_at FROM channels ORDER BY added_at').all();
    },
    findChannel(channelId) {
      return db.prepare('SELECT * FROM channels WHERE channel_id = ?').get(channelId);
    },
    upsertChannel(channel, addedAt) {
      db.prepare(`INSERT INTO channels(channel_id, title, handle, thumbnail_url, uploads_playlist_id, added_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET title=excluded.title, handle=excluded.handle,
          thumbnail_url=excluded.thumbnail_url, uploads_playlist_id=excluded.uploads_playlist_id`)
        .run(channel.channelId, channel.title, channel.handle, channel.thumbnailUrl, channel.uploadsPlaylistId, addedAt);
    },
    deleteChannel(channelId) {
      db.prepare('DELETE FROM channels WHERE channel_id = ?').run(channelId);
    },
    deleteChannels(channelIds) {
      const statement = db.prepare('DELETE FROM channels WHERE channel_id = ?');
      return transaction(() => channelIds.reduce((deleted, channelId) => deleted + Number(statement.run(channelId).changes), 0));
    },
    saveUploads(channelId, videos, syncedAt) {
      transaction(() => {
        for (const video of videos) {
          upsertVideo.run(video.videoId, channelId, video.title, video.description, video.thumbnailUrl, video.publishedAt, syncedAt);
        }
        markSynced.run(syncedAt, channelId);
      });
    },
    recordSyncError(channelId, message) {
      db.prepare('UPDATE channels SET sync_error = ? WHERE channel_id = ?').run(message, channelId);
    },

    clearVideoCache() {
      return transaction(() => {
        const removed = Number(db.prepare(`DELETE FROM videos WHERE video_id NOT IN (SELECT video_id FROM watch_history)
          AND video_id NOT IN (SELECT video_id FROM play_queue)`).run().changes);
        db.prepare('UPDATE channels SET last_synced_at = NULL').run();
        return removed;
      });
    },
    listGroups() {
      const members = db.prepare('SELECT group_id, channel_id FROM channel_group_members').all();
      return db.prepare('SELECT group_id, name FROM channel_groups ORDER BY name COLLATE NOCASE').all().map((group) => ({
        ...group,
        channel_ids: members.filter((member) => member.group_id === group.group_id).map((member) => member.channel_id)
      }));
    },
    findGroup(groupId) {
      return this.listGroups().find((group) => group.group_id === groupId);
    },
    groupNameTaken(name, exceptGroupId = null) {
      return Boolean(db.prepare('SELECT 1 FROM channel_groups WHERE name = ? AND group_id IS NOT ?').get(name, exceptGroupId));
    },
    createGroup(name, channelIds, at) {
      return transaction(() => {
        const groupId = Number(db.prepare('INSERT INTO channel_groups(name, created_at) VALUES (?, ?)').run(name, at).lastInsertRowid);
        this.setGroupChannels(groupId, channelIds);
        return groupId;
      });
    },
    updateGroup(groupId, { name, channelIds }) {
      transaction(() => {
        if (name !== undefined) {
          db.prepare('UPDATE channel_groups SET name = ? WHERE group_id = ?').run(name, groupId);
        }
        if (channelIds !== undefined) {
          this.setGroupChannels(groupId, channelIds);
        }
      });
    },
    setGroupChannels(groupId, channelIds) {
      db.prepare('DELETE FROM channel_group_members WHERE group_id = ?').run(groupId);
      const insert = db.prepare(`INSERT OR IGNORE INTO channel_group_members(group_id, channel_id)
        SELECT ?, channel_id FROM channels WHERE channel_id = ?`);
      for (const channelId of channelIds) {
        insert.run(groupId, channelId);
      }
    },
    deleteGroup(groupId) {
      return Number(db.prepare('DELETE FROM channel_groups WHERE group_id = ?').run(groupId).changes) > 0;
    },
    searchVideos({ channelId, groupId, query }) {
      const conditions = [];
      const values = [];
      if (channelId) {
        conditions.push('videos.channel_id = ?'); values.push(channelId);
      }
      if (groupId) {
        conditions.push('videos.channel_id IN (SELECT channel_id FROM channel_group_members WHERE group_id = ?)'); values.push(groupId);
      }
      if (query) {
        conditions.push('(videos.title LIKE ? OR videos.description LIKE ? OR channels.title LIKE ?)');
        values.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`SELECT videos.*, channels.title AS channel_title, channels.thumbnail_url AS channel_thumbnail,
          watch_history.playback_state, watch_history.manually_watched, watch_history.last_activity_at
        FROM videos
        JOIN channels ON channels.channel_id = videos.channel_id
        LEFT JOIN watch_history ON watch_history.video_id = videos.video_id
        ${where} ORDER BY videos.published_at DESC LIMIT 2000`).all(...values);
    },
    videoExists(videoId) {
      return Boolean(db.prepare('SELECT 1 FROM videos WHERE video_id = ?').get(videoId));
    },

    listHistory({ from, to }) {
      const conditions = [];
      const values = [];
      if (from) {
        conditions.push('watch_history.last_activity_at >= ?'); values.push(from);
      }
      if (to) {
        conditions.push('watch_history.last_activity_at < ?'); values.push(to);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`SELECT videos.*, channels.title AS channel_title, watch_history.first_opened_at,
          watch_history.last_activity_at, watch_history.playback_state, watch_history.manually_watched
        FROM watch_history
        JOIN videos ON videos.video_id = watch_history.video_id
        JOIN channels ON channels.channel_id = videos.channel_id
        ${where} ORDER BY watch_history.last_activity_at DESC LIMIT 1000`).all(...values);
    },
    recordPlayback(videoId, playbackState, at) {
      db.prepare(`INSERT INTO watch_history(video_id, first_opened_at, last_activity_at, playback_state)
        VALUES (?, ?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET
        last_activity_at=excluded.last_activity_at,
        playback_state=CASE WHEN excluded.playback_state='opened' AND watch_history.playback_state IN ('started','finished')
          THEN watch_history.playback_state ELSE excluded.playback_state END`).run(videoId, at, at, playbackState);
    },
    markWatched(videoId, at) {
      db.prepare(`INSERT INTO watch_history(video_id, first_opened_at, last_activity_at, playback_state, manually_watched)
        VALUES (?, ?, ?, 'finished', 1) ON CONFLICT(video_id) DO UPDATE SET
        last_activity_at=excluded.last_activity_at, playback_state='finished', manually_watched=1`).run(videoId, at, at);
    },
    unmarkWatched(videoId, at) {
      db.prepare(`UPDATE watch_history SET last_activity_at = ?, manually_watched = 0,
        playback_state = CASE WHEN playback_state = 'finished' THEN 'started' ELSE playback_state END
        WHERE video_id = ?`).run(at, videoId);
    },
    listQueue() {
      return db.prepare(`SELECT videos.*, channels.title AS channel_title, channels.thumbnail_url AS channel_thumbnail,
          watch_history.playback_state, watch_history.manually_watched, play_queue.added_at AS queued_at
        FROM play_queue
        JOIN videos ON videos.video_id = play_queue.video_id
        JOIN channels ON channels.channel_id = videos.channel_id
        LEFT JOIN watch_history ON watch_history.video_id = play_queue.video_id
        ORDER BY play_queue.position`).all();
    },
    enqueue(videoId, at) {
      db.prepare(`INSERT INTO play_queue(video_id, position, added_at)
        VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM play_queue), ?)
        ON CONFLICT(video_id) DO NOTHING`).run(videoId, at);
    },
    dequeue(videoId) {
      db.prepare('DELETE FROM play_queue WHERE video_id = ?').run(videoId);
    },
    clearQueue() {
      db.prepare('DELETE FROM play_queue').run();
    },
    reorderQueue(videoIds) {
      const current = db.prepare('SELECT video_id FROM play_queue').all().map((row) => row.video_id);
      if (videoIds.length !== current.length || new Set(videoIds).size !== current.length || !videoIds.every((videoId) => current.includes(videoId))) {
        return false;
      }
      const update = db.prepare('UPDATE play_queue SET position = ? WHERE video_id = ?');
      transaction(() => videoIds.forEach((videoId, index) => update.run(index + 1, videoId)));
      return true;
    },
    deleteHistory(videoIds) {
      transaction(() => {
        for (const videoId of videoIds) {
          deleteHistoryEntry.run(videoId);
        }
      });
    }
  };
}
