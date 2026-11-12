import { parseChannelInput } from '../google/youtube.mjs';
import { parseCsv, toCsv } from './csv.mjs';

const maxImportRows = 500;
const channelColumn = 'channel';
const exportHeader = [channelColumn, 'title', 'url'];

export const channelCsvTemplate = toCsv(exportHeader, [
  ['@GoogleDevelopers', 'Example: a channel @handle', ''],
  ['https://www.youtube.com/@YouTube', 'Example: a channel URL', '']
]);

export function createChannelAdder({ youtube, repository, sync, now = () => new Date() }) {
  return async function addChannel(input) {
    const channel = await youtube.findChannel(input);
    const alreadyAdded = Boolean(repository.findChannel(channel.channelId));
    repository.upsertChannel(channel, now().toISOString());
    let syncError = null;
    try {
      await sync.syncChannel(channel.channelId);
    } catch (error) {
      syncError = error.message;
    }
    return { channel: repository.findChannel(channel.channelId), alreadyAdded, syncError };
  };
}

export function exportChannelsCsv(repository) {
  const rows = repository.listChannels().map((channel) => [
    channel.channel_id,
    channel.title,
    `https://www.youtube.com/channel/${channel.channel_id}`
  ]);
  return toCsv(exportHeader, rows, { textColumns: [1] });
}

function readChannelInputs(csvText) {
  const rows = parseCsv(csvText).map((cells, index) => ({ line: index + 1, cells }));
  const firstRow = rows[0]?.cells.map((cell) => cell.trim().toLowerCase()) || [];
  const headerIndex = firstRow.indexOf(channelColumn);
  const column = headerIndex === -1 ? 0 : headerIndex;
  return rows
    .slice(headerIndex === -1 ? 0 : 1)
    .map(({ line, cells }) => ({ line, input: String(cells[column] || '').trim() }))
    .filter(({ input }) => input);
}

export function createChannelImporter({ youtube, repository, sync, now = () => new Date() }) {
  return async function importChannels(csvText) {
    const entries = readChannelInputs(csvText);
    const skipped = [];
    const added = [];
    const seen = new Set();
    let alreadyAdded = 0;

    for (const { line, input } of entries.slice(maxImportRows)) {
      skipped.push({ line, input, reason: `Only the first ${maxImportRows} rows are imported.` });
    }
    for (const { line, input } of entries.slice(0, maxImportRows)) {
      if (!parseChannelInput(input)) {
        skipped.push({ line, input, reason: 'Not a channel @handle, channel URL or channel ID.' });
        continue;
      }
      let channel;
      try {
        channel = await youtube.findChannel(input);
      } catch (error) {
        if (error.status === 429 || error.status === 400) {
          throw error;
        }
        skipped.push({ line, input, reason: error.message });
        continue;
      }
      if (seen.has(channel.channelId)) {
        skipped.push({ line, input, reason: 'Duplicate of an earlier row.' });
        continue;
      }
      seen.add(channel.channelId);
      if (repository.findChannel(channel.channelId)) {
        alreadyAdded += 1;
        continue;
      }
      repository.upsertChannel(channel, now().toISOString());
      added.push(channel.channelId);
    }

    const syncResult = await sync.syncMany(added);
    skipped.sort((left, right) => left.line - right.line);
    return { added: added.length, alreadyAdded, skipped, syncErrors: syncResult.errors };
  };
}
