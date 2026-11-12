import { HttpError } from '../../errors.mjs';
import { json, readJson } from '../respond.mjs';

const maxNameLength = 60;

function parseName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > maxNameLength) {
    throw new HttpError(400, `Group name must have 1 to ${maxNameLength} characters.`);
  }
  return name;
}

function parseChannelIds(value) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))].slice(0, 1000) : [];
}

export function groupRoutes({ repository, now }) {
  const groups = () => ({ groups: repository.listGroups() });
  return [
    {
      method: 'GET', path: '/api/groups',
      handler({ res }) {
        json(res, 200, groups());
      }
    },
    {
      method: 'POST', path: '/api/groups',
      async handler({ req, res }) {
        const body = await readJson(req);
        const name = parseName(body.name);
        if (repository.groupNameTaken(name)) {
          throw new HttpError(409, 'A group with this name already exists.');
        }
        repository.createGroup(name, parseChannelIds(body.channelIds), now().toISOString());
        json(res, 201, groups());
      }
    },
    {
      method: 'PUT', path: /^\/api\/groups\/(\d+)$/,
      async handler({ req, res, params: [rawGroupId] }) {
        const groupId = Number(rawGroupId);
        if (!repository.findGroup(groupId)) {
          throw new HttpError(404, 'Group not found.');
        }
        const body = await readJson(req);
        const changes = {};
        if (body.name !== undefined) {
          changes.name = parseName(body.name);
          if (repository.groupNameTaken(changes.name, groupId)) {
            throw new HttpError(409, 'A group with this name already exists.');
          }
        }
        if (body.channelIds !== undefined) {
          changes.channelIds = parseChannelIds(body.channelIds);
        }
        repository.updateGroup(groupId, changes);
        json(res, 200, groups());
      }
    },
    {
      method: 'DELETE', path: /^\/api\/groups\/(\d+)$/,
      handler({ res, params: [groupId] }) {
        if (!repository.deleteGroup(Number(groupId))) {
          throw new HttpError(404, 'Group not found.');
        }
        json(res, 200, groups());
      }
    }
  ];
}
