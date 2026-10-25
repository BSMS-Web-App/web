/*
 * BSMS Web Mac Database API
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 *
 * Internal service only. Expose it through Cloudflare Tunnel, never directly
 * expose the JSON file or bind this service to a public interface.
 */
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.BSMS_API_PORT || '4902', 10);
const HOST = process.env.BSMS_API_HOST || '127.0.0.1';
const API_KEY = process.env.BSMS_API_KEY || '';
const DATA_FILE = path.resolve(
  process.env.BSMS_DATA_FILE || path.join(__dirname, 'data', 'db.json')
);
const MAX_BODY_BYTES = process.env.BSMS_API_BODY_LIMIT || '25mb';

if (API_KEY.length < 32) {
  console.error('[BSMS Mac API] BSMS_API_KEY must be at least 32 characters.');
  process.exitCode = 1;
  throw new Error('Missing or weak BSMS_API_KEY.');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY_BYTES, strict: true }));

let database = {};
let mutationQueue = Promise.resolve();

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function parsePath(input) {
  if (typeof input !== 'string') throw new Error('Path must be a string.');
  const parts = input.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\\0'))) {
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
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }

  const last = parts[parts.length - 1];
  if (value === null || value === undefined) {
    delete current[last];
  } else {
    current[last] = clone(value);
  }
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

async function persist(nextValue) {
  const directory = path.dirname(DATA_FILE);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.db-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(nextValue), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, DATA_FILE);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
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

app.get('/health', requireApiKey, (_req, res) => {
  res.status(200).json({ ok: true, service: 'bsms-mac-api' });
});

app.get('/v1/db', requireApiKey, (req, res) => {
  try {
    const value = readAt(database, parsePath(req.query.path ?? '/'));
    return res.status(200).json({ value });
  } catch (error) {
    return sendError(res, 400, error.message);
  }
});

app.put('/v1/db', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.body?.path ?? '');
    const value = req.body?.value;
    await enqueueMutation(async () => {
      const next = writeAt(clone(database), parts, value);
      await persist(next);
      database = next;
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[BSMS Mac API] SET failed:', error.message);
    return sendError(res, 500, 'Database write failed.');
  }
});

app.patch('/v1/db', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.body?.path ?? '');
    const updates = req.body?.updates;
    await enqueueMutation(async () => {
      const next = applyUpdate(clone(database), parts, updates);
      await persist(next);
      database = next;
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[BSMS Mac API] UPDATE failed:', error.message);
    return sendError(res, 400, error.message === 'Updates must be a JSON object.'
      ? error.message
      : 'Database update failed.');
  }
});

app.post('/v1/db/compare-and-set', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.body?.path ?? '');
    const expected = req.body?.expected ?? null;
    const value = req.body?.value;
    return await enqueueMutation(async () => {
      const current = readAt(database, parts);
      if (!equalJson(current, expected)) {
        return res.status(200).json({ committed: false, value: current });
      }
      const next = writeAt(clone(database), parts, value);
      await persist(next);
      database = next;
      return res.status(200).json({ committed: true, value: value ?? null });
    });
  } catch (error) {
    console.error('[BSMS Mac API] TRANSACTION failed:', error.message);
    return sendError(res, 500, 'Database transaction failed.');
  }
});

app.delete('/v1/db', requireApiKey, async (req, res) => {
  try {
    const parts = parsePath(req.query.path ?? '');
    if (parts.length === 0) return sendError(res, 400, 'Deleting the database root is not allowed.');
    await enqueueMutation(async () => {
      const next = writeAt(clone(database), parts, null);
      await persist(next);
      database = next;
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[BSMS Mac API] DELETE failed:', error.message);
    return sendError(res, 500, 'Database delete failed.');
  }
});

async function start() {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      database = JSON.parse(raw);
      if (!database || typeof database !== 'object' || Array.isArray(database)) {
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
      await persist(database);
    }

    app.listen(PORT, HOST, () => {
      console.log('[BSMS Mac API] Listening on http://' + HOST + ':' + PORT);
      console.log('[BSMS Mac API] Persistent data file: ' + DATA_FILE);
    });
  } catch (error) {
    console.error('[BSMS Mac API] Startup failed:', error);
    process.exitCode = 1;
  }
}

await start();
