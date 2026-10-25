/*
 * BSMS Web Mac Database API
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 *
 * Internal service only. Publish it through Cloudflare Tunnel; never expose
 * the data files or bind this service directly to a public interface.
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

function applyRecord(root, record) {
  if (record.op === 'set' || record.op === 'delete') {
    return writeAt(root, parsePath(record.path), record.op === 'delete' ? null : record.value);
  }
  if (record.op === 'update') {
    return applyUpdate(root, parsePath(record.path), record.updates);
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
  const nextDatabase = applyRecord(clone(database), completeRecord);
  // Write-ahead log: persist the operation before publishing it in memory.
  await appendJournal(completeRecord);
  database = nextDatabase;
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
      // Accept the existing Firebase export / data/db.json as an initial import.
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
app.listen(PORT, HOST, () => {
  console.log('[BSMS Web Mac API] Listening on http://' + HOST + ':' + PORT);
  console.log('[BSMS Web Mac API] JSON snapshot: ' + DATA_FILE);
  console.log('[BSMS Web Mac API] Write-ahead journal: ' + JOURNAL_FILE);
});
