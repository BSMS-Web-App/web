/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import authHandler from './api/auth.js';
import adminHandler from './api/admin.js';
import chatHandler from './api/chat.js';
import gamesHandler from './api/games.js';
import bugReportHandler from './api/bug-report.js';
import exportDataHandler from './api/export-data.js';
import profanityFilterHandler from './api/profanity-filter.js';
import linkPreviewHandler from './api/link-preview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Vercel redirects specified in vercel.json
app.get('/account', (req, res) => res.redirect(301, '/accounts'));
app.get('/c', (req, res) => res.redirect(301, '/chat'));
app.get('/games', (req, res) => res.redirect(301, '/g'));
app.get('/rooms', (req, res) => res.redirect(301, '/chat'));

// API Routes
app.use('/api/auth', (req, res) => authHandler(req, res));
app.use('/api/admin', (req, res) => adminHandler(req, res));
app.use('/api/chat', (req, res) => chatHandler(req, res));
app.use('/api/games/saves', (req, res) => gamesHandler(req, res));
app.use('/games/saves', (req, res) => gamesHandler(req, res));
app.use('/api/games', (req, res) => gamesHandler(req, res));
app.use('/api/link-preview', (req, res) => linkPreviewHandler(req, res));
app.use('/api/bug-report', (req, res) => bugReportHandler(req, res));
app.use('/api/export-data', (req, res) => exportDataHandler(req, res));
app.use('/api/profanity-filter', (req, res) => profanityFilterHandler(req, res));

// Raw text endpoints for 1-click copy into GitHub
app.get('/raw/chat.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'chat.html')));
app.get('/raw/accounts.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'accounts.html')));
app.get('/raw/api/auth.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/auth.js')));
app.get('/raw/api/chat.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/chat.js')));
app.get('/raw/api/profanity-filter.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/profanity-filter.js')));
app.get('/raw/api/db.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/db.js')));
app.get('/raw/package.json', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'package.json')));
app.get('/raw/vercel.json', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'vercel.json')));
app.get('/raw/server.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'server.js')));

// Clean URLs
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/accounts', (req, res) => res.sendFile(path.join(__dirname, 'accounts.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/countdown', (req, res) => res.sendFile(path.join(__dirname, 'countdown.html')));
app.get('/g', (req, res) => res.sendFile(path.join(__dirname, 'g.html')));
app.get('/bug-report', (req, res) => res.sendFile(path.join(__dirname, 'bug-report.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/401', (req, res) => res.status(401).sendFile(path.join(__dirname, '401.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin/index.html')));
app.get('/users', (req, res) => res.sendFile(path.join(__dirname, 'users.html')));

// Static asset folders
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// General static serving with clean URL support
app.use(express.static(__dirname, { extensions: ['html'] }));

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = parseInt(process.env.APP_PORT || '3000', 10);
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`[BSMS Web] Server listening on http://${HOST}:${PORT}`);
});
