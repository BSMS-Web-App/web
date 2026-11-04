/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
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
// cloudflared is the single trusted reverse proxy in front of this loopback-only service.
app.set('trust proxy', 1);

const PUBLIC_MEDIA_ORIGIN = (process.env.BSMS_WEB_PUBLIC_MEDIA_URL || 'https://media.bsms-web.com').replace(/\/+$/, '');
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MEDIA_UPLOAD_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'audio/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/rtf': '.rtf',
  'application/json': '.json',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-7z-compressed': '.7z',
  'application/x-rar-compressed': '.rar',
  'application/gzip': '.gz',
  'application/x-tar': '.tar',
  'audio/wav': '.wav',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'video/webm': '.vwebm',
  'video/x-matroska': '.mkv',
  'application/octet-stream': '.bin'
};

const mediaReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Too many media requests. Please try again shortly.' }
});
const mediaUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Too many uploads. Please try again shortly.' }
});

const mediaTicketLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Too many upload authorizations. Please try again shortly.' }
});

const allowedMediaOrigins = new Set([
  'https://bsms-web.vercel.app',
  'https://bsms-web-dev1.vercel.app',
  'https://bsms-web-dev2.vercel.app',
  'https://bsms-web-dev3.vercel.app',
  'https://bsms-web-dev4.vercel.app',
  'https://bsms-web-beta.vercel.app',
  'https://bsms-web-development.vercel.app',
  'https://bsmsweb.vercel.app',
  'http://localhost:3000'
]);

function mediaUploadCors(req, res, next) {
  const origin = req.get('origin') || '';
  if (origin && !allowedMediaOrigins.has(origin)) return sendError(res, 403, 'Origin is not allowed.');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return next();
}

app.use('/v1/media', mediaReadLimiter);
app.use('/v1/media-public', mediaReadLimiter);
// Authenticate every API endpoint before parsing request bodies. Media uploads
// use a short-lived, one-use HMAC capability instead of exposing the API key.
app.use('/v1', (req, res, next) => {
  const publicRead = req.path === '/media-public' || req.path.startsWith('/media-public/');
  const signedUpload = req.path.startsWith('/media-upload/') && (req.method === 'PUT' || req.method === 'OPTIONS');
  const sessionMediaTicket = req.path === '/media-upload-ticket' && (req.method === 'POST' || req.method === 'OPTIONS');
  if (publicRead || signedUpload || sessionMediaTicket) return next();
  return requireApiKey(req, res, next);
});

app.options('/v1/media-upload/:mediaId', mediaUploadCors, (_req, res) => res.status(204).end());
app.put(
  '/v1/media-upload/:mediaId',
  mediaUploadCors,
  mediaUploadLimiter,
  express.raw({ type: () => true, limit: '25mb' }),
  async (req, res) => {
    const mediaId = String(req.params.mediaId || '');
    const expires = String(req.query.expires || '');
    const uid = String(req.query.uid || '');
    const cid = String(req.query.cid || '');
    const channelType = String(req.query.channelType || '');
    const mimeType = String(req.query.mime || '').toLowerCase();
    const size = Number(req.query.size);
    const signature = String(req.query.signature || '');

    if (!/^[a-f0-9]{64}$/.test(mediaId) || !/^\d{10}$/.test(expires) ||
        !uid || uid.length > 256 || !cid || cid.length > 256 ||
        !['dms', 'gcs', 'profile'].includes(channelType) ||
        (channelType === 'profile' && cid !== 'profile') ||
        (channelType !== 'profile' && cid === 'profile') ||
        !Object.prototype.hasOwnProperty.call(MEDIA_UPLOAD_TYPES, mimeType) ||
        !Number.isSafeInteger(size) || size < 1 || size > MAX_MEDIA_BYTES ||
        !/^[a-f0-9]{64}$/.test(signature)) {
      return sendError(res, 400, 'Invalid upload authorization.');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry = Number(expires);
    if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 660) {
      return sendError(res, 403, 'Upload authorization expired.');
    }

    const signedPayload = [mediaId, expires, uid, channelType, cid, mimeType, String(size)].join('.');
    const expected = Buffer.from(crypto.createHmac('sha256', API_KEY).update(signedPayload).digest('hex'), 'hex');
    const supplied = Buffer.from(signature, 'hex');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return sendError(res, 403, 'Invalid upload signature.');
    }

    const requestMime = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (requestMime !== mimeType || !Buffer.isBuffer(req.body) || req.body.length !== size) {
      return sendError(res, 400, 'Upload content does not match its authorization.');
    }

    const filePath = path.join(MEDIA_DIR, mediaId + MEDIA_UPLOAD_TYPES[mimeType]);
    try {
      await fs.mkdir(MEDIA_DIR, { recursive: true });
      await fs.writeFile(filePath, req.body, { flag: 'wx', mode: 0o600 });
      const uploadNow = Math.floor(Date.now() / 1000);
      const expiresAt = Math.floor(uploadNow / 21600) * 21600 + 21600;
      const readSignature = crypto.createHmac('sha256', API_KEY).update(mediaId + '.' + expiresAt).digest('hex');
      const url = PUBLIC_MEDIA_ORIGIN + '/v1/media-public/' + mediaId
        + '?expires=' + expiresAt + '&signature=' + readSignature;
      return res.status(201).json({ success: true, mediaId, url });
    } catch (error) {
      if (error.code === 'EEXIST') return sendError(res, 409, 'This upload has already been used.');
      console.error('[BSMS Web Mac API] Media upload failed:', error.message);
      return sendError(res, 500, 'Media upload failed.');
    }
  }
);

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
      if (sessionId) sessionIndex.set(sessionId, uid);
    }
    if (typeof account?.creator_session_id === 'string' && account.creator_session_id) {
      sessionIndex.set(account.creator_session_id, uid);
    }
  }
}

function mediaTicketCors(req, res, next) {
  const origin = req.get('origin') || '';
  if (origin && !allowedMediaOrigins.has(origin)) return sendError(res, 403, 'Origin is not allowed.');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');
  res.setHeader('Access-Control-Max-Age', '86400');
  return next();
}

app.options('/v1/media-upload-ticket', mediaTicketCors, (_req, res) => res.status(204).end());
app.post('/v1/media-upload-ticket', mediaTicketCors, mediaTicketLimiter, (req, res) => {
  const sessionId = String(req.get('x-session-id') || '');
  if (!sessionId || sessionId.length > 300) return sendError(res, 401, 'Your session is invalid. Please sign in again.');

  let uid = sessionIndex.get(sessionId) || null;
  let account = uid ? database.accounts?.[uid] : null;
  const validSession = (candidate) => Boolean(
    candidate &&
    candidate.account_status !== 'banned' &&
    candidate.account_status !== 'deleted' &&
    (
      (candidate.sessions && Object.prototype.hasOwnProperty.call(candidate.sessions, sessionId)) ||
      candidate.creator_session_id === sessionId
    )
  );

  if (!validSession(account)) {
    uid = null;
    account = null;
    for (const [candidateUid, candidateAccount] of Object.entries(database.accounts || {})) {
      if (!validSession(candidateAccount)) continue;
      uid = candidateUid;
      account = candidateAccount;
      sessionIndex.set(sessionId, candidateUid);
      break;
    }
  }
  if (!validSession(account)) return sendError(res, 401, 'Your session is invalid. Please sign in again.');

  // Keep this in sync with api/legal-policy.js so uploads respect the same policy gate.
  if (account.legalAcceptance?.terms?.version !== '1.0.1' ||
      account.legalAcceptance?.privacy?.version !== '1.0.2') {
    return res.status(428).json({
      error: 'Please review and accept the current Terms of Service and Privacy Policy before uploading media.',
      code: 'LEGAL_ACCEPTANCE_REQUIRED'
    });
  }

  const body = req.body || {};
  const channelType = String(body.type || '');
  const cid = String(body.cid || '');
  const mimeType = String(body.mimeType || '').toLowerCase();
  const size = Number(body.size);
  const isProfile = channelType === 'profile';

  if (isProfile) {
    const avatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
    if (cid !== 'profile' || !avatarTypes.has(mimeType) ||
        !Number.isSafeInteger(size) || size < 1 || size > 5 * 1024 * 1024) {
      return sendError(res, 400, 'Choose a supported profile image no larger than 5 MB.');
    }
  } else {
    if (!cid || cid.length > 256 || !['dms', 'gcs'].includes(channelType)) {
      return sendError(res, 400, 'Missing or invalid channel data.');
    }
    if (!Object.prototype.hasOwnProperty.call(MEDIA_UPLOAD_TYPES, mimeType) ||
        !Number.isSafeInteger(size) || size < 1 || size > MAX_MEDIA_BYTES) {
      return sendError(res, 400, 'This file type or size is not supported.');
    }
    const channel = database.chat?.conversations?.[channelType]?.[cid];
    if (!channel?.members?.[uid]) return sendError(res, 403, 'Not a member of this conversation.');
  }

  const mediaId = crypto.randomBytes(32).toString('hex');
  const expires = String(Math.floor(Date.now() / 1000) + 600);
  const signedPayload = [mediaId, expires, uid, channelType, cid, mimeType, String(size)].join('.');
  const signature = crypto.createHmac('sha256', API_KEY).update(signedPayload).digest('hex');
  const query = new URLSearchParams({
    expires, uid, cid, channelType, mime: mimeType, size: String(size), signature
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    mediaId,
    mimeType,
    uploadUrl: PUBLIC_MEDIA_ORIGIN + '/v1/media-upload/' + mediaId + '?' + query.toString()
  });
});

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
  if (completeRecord.path === '/accounts' || /^\/accounts\/[^/]+$/.test(completeRecord.path) || /^\/accounts\/[^/]+\/sessions(?:\/[^/]+)?$/.test(completeRecord.path) || /^\/accounts\/[^/]+\/creator_session_id$/.test(completeRecord.path)) rebuildSessionIndex();
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
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.rtf': 'application/rtf',
  '.json': 'application/json',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/x-rar-compressed',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.vwebm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.bin': 'application/octet-stream'
};

function parseSingleByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

async function serveMediaFile(req, res, mediaId, cacheControl, downloadName = '') {
  try {
    for (const [extension, mimeType] of Object.entries(MEDIA_TYPES)) {
      const filePath = path.join(MEDIA_DIR, mediaId + extension);
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (!stats.isFile()) continue;

      const rangeHeader = req.get('range');
      const range = rangeHeader ? parseSingleByteRange(rangeHeader, stats.size) : null;
      if (rangeHeader && !range) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', 'bytes */' + stats.size);
        res.setHeader('Content-Length', '0');
        return res.status(416).end();
      }

      const start = range ? range.start : 0;
      const end = range ? range.end : Math.max(0, stats.size - 1);
      const contentLength = stats.size === 0 ? 0 : end - start + 1;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(contentLength));
      const inlineMedia = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(mimeType) ||
        ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/flac',
          'video/mp4', 'video/quicktime', 'video/webm'].includes(mimeType);
      if (!inlineMedia) {
        const safeName = safeMediaFilename(downloadName) || ('attachment' + extension);
        const asciiName = Array.from(safeName).map((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && code <= 126 ? character : '_';
        }).join('');
        res.setHeader('Content-Disposition', 'attachment; filename="' + asciiName + '"');
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', cacheControl);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('ETag', '"' + mediaId + '"');
      res.setHeader('Last-Modified', stats.mtime.toUTCString());
      if (range) res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + stats.size);

      if (req.method === 'HEAD' || contentLength === 0) {
        return res.status(range ? 206 : 200).end();
      }

      const stream = createReadStream(filePath, range ? { start, end } : undefined);
      stream.on('error', (error) => {
        console.error('[BSMS Web Mac API] Media stream failed:', error.message);
        if (!res.headersSent) sendError(res, 500, 'Media read failed.');
        else res.destroy(error);
      });
      res.on('close', () => {
        if (!res.writableEnded) stream.destroy();
      });
      res.status(range ? 206 : 200);
      return stream.pipe(res);
    }
    return sendError(res, 404, 'Media file not found.');
  } catch (error) {
    console.error('[BSMS Web Mac API] Media read failed:', error.message);
    return sendError(res, 500, 'Media read failed.');
  }
}

app.get('/v1/media/:mediaId', requireApiKey, async (req, res) => {
  const mediaId = String(req.params.mediaId || '');
  if (!/^[a-f0-9]{64}$/.test(mediaId)) return sendError(res, 400, 'Invalid media ID.');
  return serveMediaFile(req, res, mediaId, 'private, max-age=3600');
});
app.head('/v1/media/:mediaId', requireApiKey, async (req, res) => {
  const mediaId = String(req.params.mediaId || '');
  if (!/^[a-f0-9]{64}$/.test(mediaId)) return sendError(res, 400, 'Invalid media ID.');
  return serveMediaFile(req, res, mediaId, 'private, max-age=3600');
});

// Public browser media route. Access is granted only by an expiring HMAC URL
// signed by the Vercel server with the shared server-side API key.
app.get('/v1/media-public/:mediaId', async (req, res) => {
  const mediaId = String(req.params.mediaId || '');
  const expires = String(req.query.expires || '');
  const signature = String(req.query.signature || '');
  const requestedName = String(req.query.name || '');
  const safeName = safeMediaFilename(requestedName);
  if (!/^[a-f0-9]{64}$/.test(mediaId) || !/^\d{10}$/.test(expires) ||
      !/^[a-f0-9]{64}$/.test(signature) || requestedName.length > 180 || safeName !== requestedName) {
    return sendError(res, 400, 'Invalid signed media URL.');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiry = Number(expires);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 21660) {
    return sendError(res, 403, 'Media URL expired or has an invalid expiration.');
  }

  const signedPayload = safeName ? mediaId + '.' + expires + '.' + safeName : mediaId + '.' + expires;
  const expectedSignature = crypto.createHmac('sha256', API_KEY).update(signedPayload).digest('hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  const supplied = Buffer.from(signature, 'hex');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return sendError(res, 403, 'Invalid media signature.');
  }

  return serveMediaFile(req, res, mediaId, 'private, max-age=600', safeName);
});
app.get('/health', requireApiKey, (_req, res) => {
  res.status(200).json({ ok: true, service: 'bsms-web-mac-api' });
});


async function migrateLegacyDataUrl(dataUrl, storagePath) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const extension = MEDIA_UPLOAD_TYPES[mimeType];
  if (!extension) return null;
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) return null;

  const mediaId = crypto.randomBytes(32).toString('hex');
  const filePath = path.join(MEDIA_DIR, mediaId + extension);
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  const media = { type: 'media', mediaId, mimeType };

  await enqueueMutation(async () => {
    const current = readAt(database, parsePath(storagePath));
    if (typeof current === 'string' && current.startsWith('data:')) {
      await commitMutation({ op: 'set', path: storagePath, value: media });
    } else {
      await fs.rm(filePath, { force: true });
    }
  });
  const stored = readAt(database, parsePath(storagePath));
  return stored && typeof stored === 'object' && stored.type === 'media' ? stored : null;
}

function publicAccount(uid, account) {
  const avatar = account?.account_status === 'banned' ? null : account?.avatar;
  return {
    username: account?.username || uid,
    displayName: account?.displayName || account?.username || uid,
    avatar: avatar && typeof avatar === 'object' && avatar.type === 'media' && /^[a-f0-9]{64}$/.test(avatar.mediaId || '')
      ? signedPublicMediaUrl(avatar.mediaId) : (typeof avatar === 'string' && avatar.startsWith('data:') ? '' : (avatar || '')),
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
  if (!sessionId || sessionId.length > 300) return sendError(res, 400, 'Invalid session ID.');

  // The index is a fast path, not the source of truth. Session data may have
  // been written by an older server version or restored before the index was
  // rebuilt, so validate the indexed account and fall back to the live database.
  let uid = sessionIndex.get(sessionId) || null;
  let account = uid ? database.accounts?.[uid] : null;
  const isValidForAccount = (candidate) => Boolean(
    candidate &&
    candidate.account_status !== 'banned' &&
    candidate.account_status !== 'deleted' &&
    (
      (candidate.sessions && Object.prototype.hasOwnProperty.call(candidate.sessions, sessionId)) ||
      candidate.creator_session_id === sessionId
    )
  );

  if (!isValidForAccount(account)) {
    uid = null;
    account = null;
    for (const [candidateUid, candidateAccount] of Object.entries(database.accounts || {})) {
      if (!isValidForAccount(candidateAccount)) continue;
      uid = candidateUid;
      account = candidateAccount;
      // Repair the index so subsequent requests use the fast path.
      sessionIndex.set(sessionId, candidateUid);
      break;
    }
  }

  if (!isValidForAccount(account)) {
    return res.status(200).json({ authenticated: false, uid: null, account: null });
  }

  // Return only the fields used by server-side authorization and game state.
  // Passwords, session collections, and unrelated account data stay on the Mac.
  return res.status(200).json({
    authenticated: true,
    uid,
    account: {
      username: account.username || uid,
      displayName: account.displayName || account.username || uid,
      account_status: account.account_status || 'active',
      role: account.role || null,
      verified: Boolean(account.verified),
      isDeveloper: Boolean(account.isDeveloper)
    }
  });
});

app.get('/v1/chat/sync', requireApiKey, async (req, res) => {
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
    if (account?.account_status === 'deleted') continue;
    let accountForSync = account;
    if (typeof account?.avatar === 'string' && account.avatar.startsWith('data:')) {
      try {
        const migratedAvatar = await migrateLegacyDataUrl(account.avatar, '/accounts/' + accountId + '/avatar');
        accountForSync = { ...account, avatar: migratedAvatar };
      } catch (error) {
        console.error('[BSMS Web Mac API] Legacy account avatar migration failed:', error.message);
        accountForSync = { ...account, avatar: null };
      }
    }
    accounts[accountId] = publicAccount(accountId, accountForSync);
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
      if (typeof config.icon === 'string' && config.icon.startsWith('data:')) {
        try {
          const migratedIcon = await migrateLegacyDataUrl(config.icon, '/chat/conversations/' + type + '/' + cid + '/config/icon');
          config.icon = migratedIcon ? signedPublicMediaUrl(migratedIcon.mediaId) : null;
        } catch (error) {
          console.error('[BSMS Web Mac API] Legacy group icon migration failed:', error.message);
          config.icon = null;
        }
      } else if (config.icon && typeof config.icon === 'object' && config.icon.type === 'media' && /^[a-f0-9]{64}$/.test(config.icon.mediaId || '')) {
        config.icon = signedPublicMediaUrl(config.icon.mediaId);
      }
      if (config.theme && typeof config.theme === 'object') {
        config.theme = { ...config.theme };
        if (typeof config.theme.background === 'string' && config.theme.background.startsWith('data:')) {
          try {
            const migratedBackground = await migrateLegacyDataUrl(
              config.theme.background,
              '/chat/conversations/' + type + '/' + cid + '/config/theme/background'
            );
            config.theme.backgroundMedia = migratedBackground;
            config.theme.background = migratedBackground ? signedPublicMediaUrl(migratedBackground.mediaId) : null;
          } catch (error) {
            console.error('[BSMS Web Mac API] Legacy group wallpaper migration failed:', error.message);
            config.theme.background = null;
          }
        } else if (config.theme.background && typeof config.theme.background === 'object' &&
            config.theme.background.type === 'media' && /^[a-f0-9]{64}$/.test(config.theme.background.mediaId || '')) {
          config.theme.backgroundMedia = config.theme.background;
          config.theme.background = signedPublicMediaUrl(config.theme.background.mediaId);
        }
      }
      const channelData = {
        name: channel.name || '',
        _type: type,
        _id: cid,
        config,
        members,
        messageCount: indexedKeys.length,
        lastMessage: lastMessage && ['file', 'image', 'audio', 'video'].includes(lastMessage.contentType)
          ? {
              ...lastMessage,
              content: null,
              hasContent: true,
              attachmentMimeType: lastMessage.content && typeof lastMessage.content === 'object' ? (lastMessage.content.mimeType || null) : null,
              attachmentName: lastMessage.attachmentName || (lastMessage.contentType === 'audio' ? 'Voice message' : 'Attachment')
            }
          : lastMessage,
        lastMessageId: lastId
      };
      if (channel.members[uid]?.role === 'owner' && channel.joinRequests) channelData.joinRequests = channel.joinRequests;
      channels[cid] = channelData;
    }
  }
  return res.status(200).json({ users, accounts, channels });
});

function safeMediaFilename(value) {
  return Array.from(String(value || '')).filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 && character !== '/' &&
      character !== String.fromCharCode(92) && character !== '"';
  }).join('').slice(0, 180);
}

function signedPublicMediaUrl(mediaId, filename = '') {
  // Keep URLs stable during each six-hour window so chat polling does not
  // continually replace image/audio/video elements.
  const now = Math.floor(Date.now() / 1000);
  const expires = Math.floor(now / 21600) * 21600 + 21600;
  const safeName = safeMediaFilename(filename);
  const payload = safeName ? mediaId + '.' + expires + '.' + safeName : mediaId + '.' + expires;
  const signature = crypto.createHmac('sha256', API_KEY).update(payload).digest('hex');
  const query = new URLSearchParams({ expires: String(expires), signature });
  if (safeName) query.set('name', safeName);
  return PUBLIC_MEDIA_ORIGIN + '/v1/media-public/' + mediaId + '?' + query.toString();
}

async function migrateLegacyChatMedia(type, cid, messageId, message) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(message.content || '');
  if (!match) return { ...message, content: null, hasContent: true };
  const mimeType = match[1].toLowerCase();
  const extension = MEDIA_UPLOAD_TYPES[mimeType];
  if (!extension) return { ...message, content: null, hasContent: true, attachmentMimeType: mimeType };
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) {
    return { ...message, content: null, hasContent: true, attachmentMimeType: mimeType };
  }

  const mediaId = crypto.randomBytes(32).toString('hex');
  const filePath = path.join(MEDIA_DIR, mediaId + extension);
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  const migrated = {
    ...message,
    content: { type: 'media', mediaId, mimeType },
    attachmentMimeType: mimeType,
    attachmentName: message.attachmentName || (message.contentType === 'audio' ? 'Voice message' : 'Attachment')
  };

  await enqueueMutation(async () => {
    const current = database.chat?.conversations?.[type]?.[cid]?.messages?.[messageId];
    if (typeof current?.content === 'string' && current.content.startsWith('data:')) {
      await commitMutation({
        op: 'set',
        path: '/chat/conversations/' + type + '/' + cid + '/messages/' + messageId,
        value: migrated
      });
    } else {
      await fs.rm(filePath, { force: true });
    }
  });

  return database.chat?.conversations?.[type]?.[cid]?.messages?.[messageId] || migrated;
}

app.get('/v1/chat/messages', requireApiKey, async (req, res) => {
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
    let message = allMsgs[id];
    if (!message) continue;
    if (message.senderUid) neededUids.add(message.senderUid);

    if (message.contentType === 'invite' && message.content && typeof message.content === 'object') {
      const groupIcon = message.content.groupIcon;
      if (typeof groupIcon === 'string' && groupIcon.startsWith('data:')) {
        try {
          const migratedIcon = await migrateLegacyDataUrl(
            groupIcon,
            '/chat/conversations/' + type + '/' + cid + '/messages/' + id + '/content/groupIcon'
          );
          message = {
            ...message,
            content: {
              ...message.content,
              groupIcon: migratedIcon ? signedPublicMediaUrl(migratedIcon.mediaId) : null
            }
          };
        } catch (error) {
          console.error('[BSMS Web Mac API] Legacy invite icon migration failed:', error.message);
          message = { ...message, content: { ...message.content, groupIcon: null } };
        }
      } else if (groupIcon && typeof groupIcon === 'object' &&
          groupIcon.type === 'media' && /^[a-f0-9]{64}$/.test(groupIcon.mediaId || '')) {
        message = {
          ...message,
          content: { ...message.content, groupIcon: signedPublicMediaUrl(groupIcon.mediaId) }
        };
      }
    }

    if (typeof message.content === 'string' && message.content.startsWith('data:') &&
        ['file', 'image', 'audio', 'video'].includes(message.contentType)) {
      try {
        message = await migrateLegacyChatMedia(type, cid, id, message);
      } catch (error) {
        console.error('[BSMS Web Mac API] Legacy chat media migration failed:', error.message);
        message = { ...message, content: null, hasContent: true };
      }
    }

    const media = message.content && typeof message.content === 'object' &&
      message.content.type === 'media' && /^[a-f0-9]{64}$/.test(message.content.mediaId || '');
    if (media) {
      messages[id] = {
        ...message,
        content: signedPublicMediaUrl(message.content.mediaId, message.attachmentName || (message.contentType === 'audio' ? 'Voice message' : 'Attachment')),
        attachmentMimeType: message.content.mimeType || message.attachmentMimeType || null,
        attachmentName: message.attachmentName || (message.contentType === 'audio' ? 'Voice message' : 'Attachment'),
        senderBanned: allAccounts[message.senderUid]?.account_status === 'banned'
      };
    } else if (['file', 'image', 'audio', 'video'].includes(message.contentType) && message.hasContent) {
      messages[id] = {
        ...message,
        content: null,
        attachmentName: message.attachmentName || (message.contentType === 'audio' ? 'Voice message' : 'Attachment'),
        senderBanned: allAccounts[message.senderUid]?.account_status === 'banned'
      };
    } else {
      messages[id] = {
        ...message,
        attachmentMimeType: message.attachmentMimeType || null,
        senderBanned: allAccounts[message.senderUid]?.account_status === 'banned'
      };
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
