/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import authHandler from './api/auth.js';
import adminHandler from './api/admin.js';
import chatHandler from './api/chat.js';
import gamesHandler from './api/games.js';
import exportDataHandler from './api/export-data.js';
import profanityFilterHandler from './api/profanity-filter.js';
import linkPreviewHandler from './api/link-preview.js';
import announcementsHandler from './api/announcements.js';
import versionHandler from './api/version.js';
import reportsHandler from './api/reports.js';
import supportConversationsHandler from './api/support-conversations.js';
import legalHandler from './api/legal.js';
import mediaHandler from './api/media.js';
import voiceHandler from './api/voice.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// The application API runs behind Cloudflare Tunnel on the Mac mini.
// Browser origins are explicitly allowlisted; no wildcard CORS is used.
const allowedOrigins = new Set(
    (process.env.APP_ALLOWED_ORIGINS || 'https://bsms-web-dev2.vercel.app,http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
);

function apiCors(req, res, next) {
    const origin = req.get('Origin');

    if (origin && !allowedOrigins.has(origin)) {
        return res.status(403).json({ error: 'Origin is not allowed.' });
    }

    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID, X-Device-ID, X-UID, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    return next();
}

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    keyGenerator: (req) => {
        const sessionId = String(req.get('X-Session-ID') || '').trim();
        if (sessionId) return 'session:' + crypto.createHash('sha256').update(sessionId).digest('hex');
        return ipKeyGenerator(req.ip);
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again shortly.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
    skip: (req) => !['login', 'register'].includes(String(req.query.action || req.body?.action || '').toLowerCase())
});

const rawFileLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many file requests. Please try again shortly.' }
});

const pageFileLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many page requests. Please try again shortly.' }
});

// Apply CORS before body parsing and rate limiting so browser preflight requests terminate cleanly.
app.use('/api', apiCors);
app.use('/games/saves', apiCors);
app.use('/raw', apiCors);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Vercel redirects specified in vercel.json
app.get('/account', (req, res) => res.redirect(301, '/accounts'));
app.get('/c', (req, res) => res.redirect(301, '/chat'));
app.get('/games', (req, res) => res.redirect(301, '/g'));
app.get('/rooms', (req, res) => res.redirect(301, '/chat'));
app.get('/event/halloween-haunt', (req, res) => res.redirect(301, '/events'));
app.all('/api/halloween-haunt', (req, res) => res.status(410).json({ error: 'This event has ended.' }));

// API Routes
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/games/saves', apiLimiter);
app.use('/raw', rawFileLimiter);
app.use('/api/auth', (req, res) => authHandler(req, res));
app.use('/api/admin', (req, res) => adminHandler(req, res));
app.use('/api/chat', (req, res) => chatHandler(req, res));
app.use('/api/games/saves', (req, res) => gamesHandler(req, res));
app.use('/games/saves', (req, res) => gamesHandler(req, res));
app.use('/api/games', (req, res) => gamesHandler(req, res));
app.use('/api/link-preview', (req, res) => linkPreviewHandler(req, res));
app.use('/api/export-data', (req, res) => exportDataHandler(req, res));
app.use('/api/profanity-filter', (req, res) => profanityFilterHandler(req, res));
app.use('/api/announcements', (req, res) => announcementsHandler(req, res));
app.use('/api/version', (req, res) => versionHandler(req, res));
app.use('/api/reports', (req, res) => reportsHandler(req, res));
app.use('/api/support-conversations', (req, res) => supportConversationsHandler(req, res));
app.use('/api/legal', (req, res) => legalHandler(req, res));
app.use('/api/media', (req, res) => mediaHandler(req, res));
app.use('/api/voice', (req, res) => voiceHandler(req, res));

// Raw text endpoints for 1-click copy into GitHub
app.get('/raw/chat.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'chat.html')));
app.get('/raw/users.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'users.html')));
app.get('/raw/accounts.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'accounts.html')));
app.get('/raw/api/auth.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/auth.js')));
app.get('/raw/api/chat.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/chat.js')));
app.get('/raw/api/profanity-filter.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/profanity-filter.js')));
app.get('/raw/api/db.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/db.js')));
app.get('/raw/package.json', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'package.json')));
app.get('/raw/vercel.json', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'vercel.json')));
app.get('/raw/server.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'server.js')));

// Rate-limit routes that read and serve individual page files.
app.use(pageFileLimiter);

// Clean URLs
// Serve the original homepage at the root path.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/accounts', (req, res) => res.sendFile(path.join(__dirname, 'accounts.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/countdown', (req, res) => res.sendFile(path.join(__dirname, 'countdown.html')));
app.get('/g', (req, res) => res.sendFile(path.join(__dirname, 'g.html')));
app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'support.html')));
app.get('/contact', (req, res) => res.redirect(301, '/support'));
app.get('/bug-report', (req, res) => res.redirect(302, '/support?type=bug'));
app.get('/feature-request', (req, res) => res.redirect(302, '/support?type=feature'));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/401', (req, res) => res.status(401).sendFile(path.join(__dirname, '401.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin/index.html')));
app.get('/users', (req, res) => res.sendFile(path.join(__dirname, 'users.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'events.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/metadata.json', (req, res) => res.sendFile(path.join(__dirname, 'metadata.json')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/accounts.html', (req, res) => res.sendFile(path.join(__dirname, 'accounts.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/countdown.html', (req, res) => res.sendFile(path.join(__dirname, 'countdown.html')));
app.get('/g.html', (req, res) => res.sendFile(path.join(__dirname, 'g.html')));
app.get('/support.html', (req, res) => res.sendFile(path.join(__dirname, 'support.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/401.html', (req, res) => res.status(401).sendFile(path.join(__dirname, '401.html')));
app.get('/users.html', (req, res) => res.sendFile(path.join(__dirname, 'users.html')));
app.get('/events.html', (req, res) => res.sendFile(path.join(__dirname, 'events.html')));
app.get('/terms.html', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));

// Serve only intentionally public asset directories. The repository root contains
// server code, API handlers, configuration, and deployment metadata and must not be static.
app.use('/admin', express.static(path.join(__dirname, 'admin'), { dotfiles: 'deny', index: false }));
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'deny', index: false }));
app.use('/img', express.static(path.join(__dirname, 'img'), { dotfiles: 'deny', index: false }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'deny', index: false }));

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = parseInt(process.env.APP_PORT || '4903', 10);
const HOST = process.env.APP_HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
    console.log(`[BSMS Web] Server listening on http://${HOST}:${PORT}`);
});
