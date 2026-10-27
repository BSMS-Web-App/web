/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number.parseInt(process.env.BSMS_WEB_API_PORT || '4901', 10);
const HOST = process.env.BSMS_WEB_API_HOST || '127.0.0.1';
const API_KEY = process.env.BSMS_WEB_API_KEY || '';
const DATA_FILE = path.resolve(process.env.BSMS_WEB_DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
const MEDIA_DIR = path.resolve(process.env.BSMS_WEB_MEDIA_DIR || path.join(__dirname, '..', 'media'));
const JOURNAL_FILE = DATA_FILE + '.journal';
const MAX_BODY_BYTES = process.env.BSMS_WEB_API_BODY_LIMIT || '25mb';
const COMPACT_EVERY = Number.parseInt(process.env.BSMS_WEB_COMPACT_EVERY || '1000', 10);

if (API_KEY.length < 32) {
  console.error('[BSMS Web Mac API] BSMS_WEB_API_KEY must be at least 32 characters.');
  throw new Error('Missing or weak BSMS_WEB_API_KEY.');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY_BYTES, strict: true }));

let database = {};
let sequence = 0;
let mutationsSinceCompact = 0;
let mutationQueue = Promise.resolve();
const sessionIndex = new Map();
const messageKeyIndex = new Map();

function messageIndexKey(type, cid) {
  return type + '/' + cid;
}

function indexConversation(type, cid, source = database) {
  const messages = source.chat?.conversations?.[type]?.[cid]?.messages || {};
  const keys = Object.keys(messages).filter((id) => messages[id] != null).sort(numericKeySort);
  messageKeyIndex.set(messageIndexKey(type, cid), keys);
}

function rebuildMessageKeyIndex() {
  messageKeyIndex.clear();
  const conversations = database.chat?.conversations || {};
  for (const type of ['dms', 'gcs']) {
    for (const cid of Object.keys(conversations[type] || {})) indexConversation(type, cid);
  }
}

function refreshMessageKeyIndex(record, source = database) {
  const parts = parsePath(record.path);
  if (parts[0] !== 'chat' || parts[1] !== 'conversations' || !['dms', 'gcs'].includes(parts[2]) || !parts[3]) return;
  const [type, cid] = [parts[2], parts[3]];
  if (parts.length <= 4 || parts[4] === 'messages' && parts.length <= 5) {
    indexConversation(type, cid, source);
    return;
  }
  if (parts[4] !== 'messages' || parts.length !== 6) return;
  const key = messageIndexKey(type, cid);
  const messages = source.chat?.conversations?.[type]?.[cid]?.messages || {};
  const keys = messageKeyIndex.get(key) || [];
  const position = keys.indexOf(parts[5]);
  if (messages[parts[5]] == null) {
    if (position >= 0) keys.splice(position, 1);
  } else if (position < 0) {
    keys.push(parts[5]);
    keys.sort(numericKeySort);
  }
  messageKeyIndex.set(key, keys);
}

function rebuildSessionIndex() {
  sessionIndex.clear();
  for (const [uid, account] of Object.entries(database.accounts || {})) {
    for (const sessionId of Object.keys(account?.sessions || {})) {
      sessionIndex.set(sessionId, uid);
    }
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function parsePath(input) {
  if (typeof input !== 'string') throw new Error('Path must be a string.');
  const parts = input.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\0') || part === '__proto__' || part === 'prototype' || part === 'constructor')) {
    throw new Error('Invalid database path.');
  }
  return parts;
}

function readAt(root, parts) {
  let current = root;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return null;
    current = current[part];
  }
  return current === undefined ? null : clone(current);
}

function writeAt(root, parts, value) {
  if (parts.length === 0) return value === null || value === undefined ? {} : clone(value);
  let current = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete current[last];
  else current[last] = clone(value);
  return root;
}

function applyUpdate(root, parts, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Updates must be a JSON object.');
  }
  const targetValue = readAt(root, parts);
  const target = targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
    ? targetValue
    : {};
  for (const [relativePath, value] of Object.entries(updates)) {
    const subParts = parsePath(relativePath);
    if (subParts.length === 0) throw new Error('Update paths cannot be empty.');
    writeAt(target, subParts, value);
  }
  return writeAt(root, parts, target);
}

function equalJson(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

function resolveServerValues(value) {
  if (value && typeof value === 'object') {
    if (!Array.isArray(value) && value['.sv'] === 'timestamp') return Date.now();
    const copy = Array.isArray(value) ? [] : {};
    for (const [key, child] of Object.entries(value)) copy[key] = resolveServerValues(child);
    return copy;
  }
  return value;
}

async function writeAtomic(filePath, contents) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function appendJournal(record) {
  await fs.mkdir(path.dirname(JOURNAL_FILE), { recursive: true });
  const handle = await fs.open(JOURNAL_FILE, 'a', 0o600);
  try {
    await handle.writeFile(JSON.stringify(record) + '\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function copyPath(root, parts) {
  const rootCopy = Array.isArray(root) ? root.slice() : { ...(root || {}) };
  let source = root || {};
  let target = rootCopy;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const child = source && typeof source === 'object' ? source[key] : undefined;
    const childCopy = Array.isArray(child) ? child.slice()
      : child && typeof child === 'object' ? { ...child } : {};
    target[key] = childCopy;
    source = child || {};
    target = childCopy;
  }
  return rootCopy;
}

function applyRecord(root, record) {
  const parts = parsePath(record.path);
  const nextRoot = copyPath(root, parts);
  if (record.op === 'set' || record.op === 'delete') {
    return writeAt(nextRoot, parts, record.op === 'delete' ? null : record.value);
  }
  if (record.op === 'update') {
    return applyUpdate(nextRoot, parts, record.updates);
  }
  throw new Error('Unknown journal operation: ' + record.op);
}

async function compactJournal() {
  const snapshot = JSON.stringify({ formatVersion: 1, sequence, data: database });
  await writeAtomic(DATA_FILE, snapshot);
  await writeAtomic(JOURNAL_FILE, '');
  mutationsSinceCompact = 0;
}

async function commitMutation(record) {
  const nextSequence = sequence + 1;
  const completeRecord = { ...record, sequence: nextSequence };
  // Validate and prepare the next state before writing anything to the journal.
  const nextDatabase = applyRecord(database, completeRecord);
  // Write-ahead log: persist the operation before publishing it in memory.
  await appendJournal(completeRecord);
  database = nextDatabase;
  if (completeRecord.path === '/accounts' || /^\/accounts\/[^/]+$/.test(completeRecord.path) || /^\/accounts\/[^/]+\/sessions(?:\/[^/]+)?$/.test(completeRecord.path)) rebuildSessionIndex();
  refreshMessageKeyIndex(completeRecord, database);
  sequence = nextSequence;
  mutationsSinceCompact += 1;

  if (mutationsSinceCompact >= COMPACT_EVERY) {
    // A compaction failure does not undo a committed journaled mutation.
    // Keep the journal as the durable source and retry compaction later.
    try {
      await compactJournal();
    } catch (error) {
      console.error('[BSMS Web Mac API] Snapshot compaction failed; journal retained:', error.message);
    }
  }
}

function enqueueMutation(operation) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.catch(() => {});
  return result;
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function requireApiKey(req, res, next) {
  const authorization = req.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = Buffer.from(API_KEY);
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return sendError(res, 401, 'Unauthorized.');
  }
  return next();
}

const MEDIA_TYPES = {
  '.webm': 'audio/webm',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mov': 'video/quicktime',
  '.webp': 'image/webp'
};

app.get('/v1/media/:mediaId', requireApiKey, async (req, res) => {
  const mediaId = String(req.params.mediaId || '');
  if (!/^[a-f0-9]{64}$/.test(mediaId)) return sendError(res, 400, 'Invalid media ID.');

  try {
    for (const [extension, mimeType] of Object.entries(MEDIA_TYPES)) {
      const filePath = path.join(MEDIA_DIR, mediaId + extension);
      try {
        const contents = await fs.readFile(filePath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', String(contents.length));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).send(contents);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return sendError(res, 404, 'Media file not found.');
  } catch (error) {
    console.error('[BSMS Web Mac API] Media read failed:', error.message);
    return sendError(res, 500, 'Media read failed.');
  }
});

app.get('/health', requireApiKey, (_req, res) => {
  res.status(200).json({ ok: true, service: 'bsms-web-mac-api' });
});


function publicAccount(uid, account) {
  const avatar = account?.account_status === 'banned' ? null : account?.avatar;
  return {
    username: account?.username || uid,
    displayName: account?.displayName || account?.username || uid,
    avatar: avatar && typeof avatar === 'object' && avatar.type === 'media' && /^[a-f0-9]{64}$/.test(avatar.mediaId || '')
      ? '/api/media?id=' + encodeURIComponent(avatar.mediaId) : (avatar || ''),
    account_status: account?.account_status || 'active',
    ban_expires: account?.ban_expires || null,
    role: account?.role || null,
    verified: Boolean(account?.verified),
    isDeveloper: Boolean(account?.isDeveloper),
    nameColor: account?.nameColor || account?.chatColor || null,
    chatColor: account?.nameColor || account?.chatColor || null
  };
}

function numericKeySort(a, b) {
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

app.get('/v1/auth/session', requireApiKey, (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  if (!sessionId || sessionId.length > 512) return sendError(res, 400, 'Invalid session ID.');
  const uid = sessionIndex.get(sessionId);
  const account = uid ? database.accounts?.[uid] : null;
  if (account?.sessions && Object.prototype.hasOwnProperty.call(account.sessions, sessionId)) {
    const { password, sessions, ...safeAccount } = account;
    return res.status(200).json({ uid, account: safeAccount });
  }
  return res.status(404).json({ uid: null, account: null });
});

app.get('/v1/chat/sync', requireApiKey, (req, res) => {
  const uid = String(req.query.uid || '');
  if (!uid || uid.length > 256) return sendError(res, 400, 'Invalid user ID.');
  const allAccounts = database.accounts || {};
  const rawUsers = database.chat?.users || {};
  const allConvos = database.chat?.conversations || {};
  const now = Date.now();
  const users = {};
  for (const [userId, user] of Object.entries(rawUsers)) {
    users[userId] = {
      ...user,
      status: user?.status === 'online' && user.lastSeen && now - user.lastSeen < 25000 ? 'online' : 'offline'
    };
  }
  const accounts = {};
  for (const [accountId, account] of Object.entries(allAccounts)) {
    if (account?.account_status !== 'deleted') accounts[accountId] = publicAccount(accountId, account);
  }
  const channels = {};
  for (const type of ['dms', 'gcs']) {
    for (const [cid, channel] of Object.entries(allConvos[type] || {})) {
      if (!channel?.members || !channel.members[uid]) continue;
      const members = {};
      for (const [memberUid, memberData] of Object.entries(channel.members)) {
        if (allAccounts[memberUid]?.account_status !== 'banned') members[memberUid] = memberData;
      }
      const messageMap = channel.messages || {};
      const indexedKeys = messageKeyIndex.get(messageIndexKey(type, cid)) || [];
      let lastId = indexedKeys.length ? indexedKeys[indexedKeys.length - 1] : null;
      let last = lastId ? messageMap[lastId] : null;
      if (!last && Object.keys(messageMap).length) {
        indexConversation(type, cid);
        const refreshedKeys = messageKeyIndex.get(messageIndexKey(type, cid)) || [];
        lastId = refreshedKeys.length ? refreshedKeys[refreshedKeys.length - 1] : null;
        last = lastId ? messageMap[lastId] : null;
      }
      const lastMessage = last ? {
        id: lastId,
        senderUid: last.senderUid || null,
        timestamp: last.timestamp || 0,
        contentType: last.contentType || 'text',
        content: ['text'].includes(last.contentType || 'text') ? String(last.content || '').slice(0, 180) : null,
        status: {
          unsent: Boolean(last.status?.unsent),
          deletedByMod: Boolean(last.status?.deletedByMod)
        },
        readReceipts: last.readReceipts || {}
      } : null;
      const config = { ...(channel.config || {}) };
      if (config.theme?.background && typeof config.theme.background === 'object' && config.theme.background.type === 'media' && /^[a-f0-9]{64}$/.test(config.theme.background.mediaId || '')) {
        config.theme = { ...config.theme, background: '/api/media?id=' + encodeURIComponent(config.theme.background.mediaId) };
      }
      if (config.icon && typeof config.icon === 'object' && config.icon.type === 'media' && /^[a-f0-9]{64}$/.test(config.icon.mediaId || '')) {
        config.icon = '/api/media?id=' + encodeURIComponent(config.icon.mediaId);
      }
      const channelData = {
        name: channel.name || '',
        _type: type,
        _id: cid,
        config,
        members,
        messageCount: indexedKeys.length,
        lastMessage: lastMessage && (lastMessage.contentType === 'file' || lastMessage.contentType === 'image')
          ? { ...lastMessage, content: null, hasContent: true, attachmentMimeType: null, attachmentName: 'Attachment' }
          : lastMessage,
        lastMessageId: lastId
      };
      if (channel.members[uid]?.role === 'owner' && channel.joinRequests) channelData.joinRequests = channel.joinRequests;
      channels[cid] = channelData;
    }
  }
  return res.status(200).json({ users, accounts, channels });
});

app.get('/v1/chat/messages', requireApiKey, (req, res) => {
  const uid = String(req.query.uid || '');
  const cid = String(req.query.cid || '');
  const type = String(req.query.type || '');
  if (!uid || !cid || !['dms', 'gcs'].includes(type)) return sendError(res, 400, 'Missing or invalid channel data.');
  const channel = database.chat?.conversations?.[type]?.[cid];
  if (cid === 'gc-general' && !channel) return res.status(200).json({ error: 'General conversation is not initialized.', unauthorized: true });
  if (!channel?.members?.[uid]) return res.status(200).json({ error: 'Not a member of this channel.', unauthorized: true });

  const allAccounts = database.accounts || {};
  const activeMembers = {};
  for (const [memberUid, memberData] of Object.entries(channel.members || {})) {
    if (allAccounts[memberUid]?.account_status !== 'banned') activeMembers[memberUid] = memberData;
  }
  const allMsgs = channel.messages || {};
  let allKeys = messageKeyIndex.get(messageIndexKey(type, cid));
  if (!allKeys) {
    indexConversation(type, cid);
    allKeys = messageKeyIndex.get(messageIndexKey(type, cid)) || [];
  }
  const parsedLimit = Number.parseInt(String(req.query.limit || '20'), 10);
  const limit = Math.max(1, Math.min(50, Number.isFinite(parsedLimit) ? parsedLimit : 20));
  const beforeId = req.query.beforeId ? String(req.query.beforeId) : '';
  let selectedKeys;
  let hasMore = false;
  if (beforeId) {
    const beforeIndex = allKeys.indexOf(beforeId);
    if (beforeIndex > 0) {
      const start = Math.max(0, beforeIndex - limit);
      selectedKeys = allKeys.slice(start, beforeIndex);
      hasMore = start > 0;
    } else {
      selectedKeys = [];
    }
  } else {
    const start = Math.max(0, allKeys.length - limit);
    selectedKeys = allKeys.slice(start);
    hasMore = start > 0;
  }
  const messages = {};
  const neededUids = new Set(Object.keys(channel.members || {}));
  for (const id of selectedKeys) {
    const message = allMsgs[id];
    if (!message) continue;
    if (message.senderUid) neededUids.add(message.senderUid);
    if (message.contentType === 'file' || message.contentType === 'image') {
      messages[id] = { ...message, content: null, hasContent: true, attachmentName: 'Attachment', attachmentMimeType: null, senderBanned: allAccounts[message.senderUid]?.account_status === 'banned' };
    } else {
      const media = message.content && typeof message.content === 'object' && message.content.type === 'media' && /^[a-f0-9]{64}$/.test(message.content.mediaId || '');
      const content = media ? '/api/media?id=' + encodeURIComponent(message.content.mediaId) : message.content;
      messages[id] = { ...message, content, attachmentMimeType: media ? (message.content.mimeType || null) : (typeof message.content === 'string' && message.content.startsWith('data:') ? message.content.slice(5).split(/[;,]/)[0] : null), senderBanned: allAccounts[message.senderUid]?.account_status === 'banned' };
    }
  }
  const accounts = {};
  for (const memberUid of neededUids) {
    if (allAccounts[memberUid]) accounts[memberUid] = publicAccount(memberUid, allAccounts[memberUid]);
  }
  return res.status(200).json({
    messages, members: activeMembers, accounts, hasMore,
    oldestId: selectedKeys.length ? selectedKeys[0] : null
  });
});

app.get('/v1/db', requireApiKey, (req, res) => {
  try {
    return res.status(200).json({ value: readAt(database, parsePath(req.query.path ?? '/')) });
  } catch (error) {
    return sendError(res, 400, error.message);
  }
});

app.get('/v1/db/query', requireApiKey, (req, res) => {
  try {
    const pathParts = parsePath(req.query.path ?? '/');
    const childPath = req.query.child;
    if (typeof childPath !== 'string' || !childPath) {
      return sendError(res, 400, 'A child path is required.');
    }
    const expected = JSON.parse(String(req.query.equalTo ?? 'null'));
    const source = readAt(database, pathParts) || {};
    const filtered = {};
    for (const [key, item] of Object.entries(source)) {
      const actual = readAt(item, parsePath(childPath));
      if (equalJson(actual, expected)) filtered[key] = item;
    }
    return res.status(200).json({ value: Object.keys(filtered).length ? filtered : null });
  } catch (error) {
    return sendError(res, 400, 'Invalid database query.');
  }
});

app.put('/v1/db', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.body?.path ?? '');
    if (parts.length === 0) return sendError(res, 400, 'Writing the database root is not allowed.');
    const value = resolveServerValues(req.body?.value);
    await enqueueMutation(() => commitMutation({
      op: value === null || value === undefined ? 'delete' : 'set',
      path: '/' + parts.join('/'),
      value
    }));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[BSMS Web Mac API] SET failed:', error.message);
    return sendError(res, 500, 'Database write failed.');
  }
});

app.patch('/v1/db', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.body?.path ?? '');
    if (parts.length === 0) return sendError(res, 400, 'Updating the database root is not allowed.');
    const updates = req.body?.updates;
    // Validate before queuing to return clear client errors.
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return sendError(res, 400, 'Updates must be a JSON object.');
    }
    try {
      for (const relativePath of Object.keys(updates)) {
        if (parsePath(relativePath).length === 0) {
          return sendError(res, 400, 'Update paths cannot be empty.');
        }
      }
    } catch {
      return sendError(res, 400, 'Invalid update path.');
    }
    const resolvedUpdates = resolveServerValues(updates);
    await enqueueMutation(() => commitMutation({
      op: 'update',
      path: '/' + parts.join('/'),
      updates: resolvedUpdates
    }));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[BSMS Web Mac API] UPDATE failed:', error.message);
    return sendError(res, 500, 'Database update failed.');
  }
});

app.post('/v1/db/compare-and-set', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.body?.path ?? '');
    if (parts.length === 0) return sendError(res, 400, 'Root transactions are not allowed.');
    const expected = req.body?.expected ?? null;
    const value = resolveServerValues(req.body?.value);
    return await enqueueMutation(async () => {
      const current = readAt(database, parts);
      if (!equalJson(current, expected)) {
        return res.status(200).json({ committed: false, value: current });
      }
      await commitMutation({
        op: value === null || value === undefined ? 'delete' : 'set',
        path: '/' + parts.join('/'),
        value
      });
      return res.status(200).json({ committed: true, value: value ?? null });
    });
  } catch (error) {
    console.error('[BSMS Web Mac API] TRANSACTION failed:', error.message);
    return sendError(res, 500, 'Database transaction failed.');
  }
});

app.delete('/v1/db', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.query.path ?? '');
    if (parts.length === 0) return sendError(res, 400, 'Deleting the database root is not allowed.');
    await enqueueMutation(() => commitMutation({
      op: 'delete',
      path: '/' + parts.join('/')
    }));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[BSMS Web Mac API] DELETE failed:', error.message);
    return sendError(res, 500, 'Database delete failed.');
  }
});

async function loadDatabase() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.formatVersion === 1 && parsed.data && typeof parsed.data === 'object') {
      database = parsed.data;
      sequence = Number.isSafeInteger(parsed.sequence) ? parsed.sequence : 0;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Accept the existing legacy export / data/db.json as an initial import.
      database = parsed;
      sequence = 0;
    } else {
      throw new Error('Database root must be a JSON object.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    database = {
      accounts: {},
      announcements: {},
      banned_devices: {},
      chat: { users: {}, conversations: { dms: {}, gcs: {} } },
      config: { versions: {} },
      chess: {}
    };
    sequence = 0;
    await writeAtomic(DATA_FILE, JSON.stringify({ formatVersion: 1, sequence, data: database }));
  }

  let journal = '';
  try {
    journal = await fs.readFile(JOURNAL_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const lines = journal.split('\n');
  const validLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      const isLast = index === lines.length - 1 || (index === lines.length - 2 && lines.at(-1) === '');
      if (isLast) break; // Ignore only a possibly partial final append.
      throw new Error('Database journal is corrupt before its final line.');
    }
    validLines.push(line);
    if (Number.isSafeInteger(record.sequence) && record.sequence > sequence) {
      database = applyRecord(database, record);
      sequence = record.sequence;
    }
  }

  // Remove an incomplete trailing journal line if one was found.
  const normalizedJournal = validLines.length ? validLines.join('\n') + '\n' : '';
  if (normalizedJournal !== journal) await writeAtomic(JOURNAL_FILE, normalizedJournal);
}

await loadDatabase();
rebuildSessionIndex();
rebuildMessageKeyIndex();
app.listen(PORT, HOST, () => {
  console.log('[BSMS Web Mac API] Listening on http://' + HOST + ':' + PORT);
  console.log('[BSMS Web Mac API] JSON snapshot: ' + DATA_FILE);
  console.log('[BSMS Web Mac API] Write-ahead journal: ' + JOURNAL_FILE);
});
