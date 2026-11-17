/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Authenticated, cloud-hosted reader proxy.
 * This is deliberately not an unrestricted CONNECT/open proxy.
 */

import crypto from 'node:crypto';
import net from 'node:net';
import { db } from './db.js';
import { handleApiCors } from '../lib/api-cors.js';
import { legalAcceptanceRequired } from './legal-policy.js';

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 90;
const rateBuckets = globalThis.__bsmsProxyRateBuckets || new Map();
globalThis.__bsmsProxyRateBuckets = rateBuckets;

const ALLOWED_HOSTS = [
    'wikipedia.org',
    'britannica.com',
    'developer.mozilla.org',
    'support.apple.com',
    'apple.com',
    'github.com',
    'w3.org',
    'nasa.gov',
    'noaa.gov',
    'weather.gov',
    'khanacademy.org',
    'pbs.org',
    'loc.gov',
    'si.edu'
];

function getBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch { return {}; }
    }
    return {};
}

function getSigningKey() {
    const key = process.env.BSMS_WEB_API_KEY || '';
    if (key.length < 32) throw new Error('Proxy signing is not configured.');
    return key;
}

function sign(value) {
    return crypto.createHmac('sha256', getSigningKey()).update(value).digest();
}

function createToken(uid, sessionId) {
    const payload = Buffer.from(JSON.stringify({
        uid,
        sid: sessionId,
        exp: Date.now() + TOKEN_TTL_MS
    })).toString('base64url');
    return payload + '.' + sign(payload).toString('base64url');
}

function readToken(token) {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    let supplied;
    try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return null; }
    const expected = sign(parts[0]);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
    if (!payload.uid || !payload.sid || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload;
}

async function findAccountBySession(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    for (const [uid, account] of Object.entries(accounts)) {
        if (account?.sessions?.[sessionId]) return { uid, account };
    }
    return null;
}

async function verifyToken(token) {
    const payload = readToken(token);
    if (!payload) return null;

    const snap = await db.ref('/accounts/' + payload.uid).once('value');
    const account = snap.val();
    if (!account || account.account_status === 'banned') return null;
    if (!account.sessions || !account.sessions[payload.sid]) return null;
    if (legalAcceptanceRequired(account)) return null;

    return { uid: payload.uid, account };
}

function enforceRateLimit(uid) {
    const now = Date.now();
    const current = rateBuckets.get(uid);
    if (!current || now - current.start >= RATE_WINDOW_MS) {
        rateBuckets.set(uid, { start: now, count: 1 });
        return true;
    }
    current.count += 1;
    return current.count <= RATE_LIMIT;
}

function validateTarget(input, base) {
    let url;
    try { url = base ? new URL(input, base) : new URL(input); } catch { return null; }

    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;
    if (net.isIP(url.hostname)) return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const allowed = ALLOWED_HOSTS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
    if (!allowed) return null;

    url.hostname = hostname;
    url.hash = '';
    return url;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function proxyUrl(url, token, asset) {
    return '/api/proxy?url=' + encodeURIComponent(url.href)
        + '&token=' + encodeURIComponent(token)
        + (asset ? '&asset=1' : '');
}

function sanitizeHtml(source, pageUrl, token) {
    let html = source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|iframe|frame|frameset|object|embed|form|input|button|textarea|select|option|base|link|meta|noscript|template|portal|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<(script|style|iframe|frame|object|embed|form|input|button|textarea|select|option|base|link|meta|noscript|template|portal|svg|math)\b[^>]*\/?>/gi, '')
        .replace(/\s(?:on[a-z]+|srcdoc|srcset|formaction|action|autofocus|contenteditable)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(?:target|download)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    html = html.replace(/\b(href|src)\s*=\s*(["'])(.*?)\2/gi, (match, attribute, quote, rawValue) => {
        const value = rawValue.trim();
        if (!value || /^(?:javascript:|data:|blob:|mailto:|tel:)/i.test(value)) {
            return attribute.toLowerCase() === 'href' ? 'href="#"' : '';
        }

        const target = validateTarget(value, pageUrl);
        if (!target) return attribute.toLowerCase() === 'href' ? 'href="#"' : '';

        const isImage = attribute.toLowerCase() === 'src';
        return attribute.toLowerCase() + '=' + quote + escapeHtml(proxyUrl(target, token, isImage)) + quote;
    });

    html = html.replace(/<a\b/gi, '<a rel="noreferrer noopener"');
    html = html.replace(/<head\b[^>]*>/i, '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><style>'
        + 'body{margin:0;padding:24px;background:#fff;color:#202124;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
        + 'main{max-width:900px;margin:auto;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#175fc4}'
        + 'pre,code{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #ddd}'
        + 'h1,h2,h3{line-height:1.25}blockquote{border-left:3px solid #bbb;padding-left:14px;color:#555}'
        + '</style>');
    if (!/<head\b/i.test(html)) {
        html = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' + html;
    }
    if (!/<body\b/i.test(html)) html = '<body>' + html + '</body>';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<meta name="referrer" content="no-referrer"><style>'
        + 'body{margin:0;padding:24px;background:#fff;color:#202124;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
        + 'main{max-width:900px;margin:auto;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#175fc4}'
        + 'pre,code{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #ddd}'
        + '</style></head><body><main>' + html.replace(/<\/?html\b[^>]*>|<\/?head\b[^>]*>|<\/?body\b[^>]*>/gi, '') + '</main></body></html>';
}

async function issueToken(req, res) {
    const sessionId = req.headers['x-session-id'];
    const user = await findAccountBySession(sessionId);
    if (!user || user.account.account_status === 'banned') {
        return res.status(401).json({ error: 'Sign in to use the BSMS Web reader.' });
    }
    if (legalAcceptanceRequired(user.account)) {
        return res.status(428).json({ error: 'Accept the current Terms of Service and Privacy Policy first.', code: 'LEGAL_ACCEPTANCE_REQUIRED' });
    }
    return res.status(200).json({
        success: true,
        token: createToken(user.uid, sessionId),
        expiresIn: TOKEN_TTL_MS
    });
}

export default async function handler(req, res) {
    if (!handleApiCors(req, res)) return;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'POST' && (req.query.action === 'token' || getBody(req).action === 'token')) {
        try { return await issueToken(req, res); }
        catch (error) {
            console.error('[BSMS Web :: Proxy] Token issue failed:', error);
            return res.status(503).json({ error: 'The reader service is temporarily unavailable.' });
        }
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST, OPTIONS');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    let identity;
    try { identity = await verifyToken(req.query.token); }
    catch (error) {
        console.error('[BSMS Web :: Proxy] Session verification failed:', error);
        return res.status(503).json({ error: 'The reader service is temporarily unavailable.' });
    }
    if (!identity) return res.status(401).json({ error: 'Your reader session expired. Refresh the BSMS Web page.' });
    if (!enforceRateLimit(identity.uid)) return res.status(429).json({ error: 'Reader request limit reached. Please wait a minute.' });

    let target = validateTarget(req.query.url);
    if (!target) return res.status(400).json({ error: 'That address is not supported by the BSMS Web reader.' });

    try {
        let upstream;
        for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
            upstream = await fetch(target.href, {
                method: 'GET',
                redirect: 'manual',
                headers: {
                    'User-Agent': 'BSMS-Web-Reader/1.0 (+https://bsms-web.com)',
                    'Accept': 'text/html,image/avif,image/webp,image/png,image/jpeg,image/gif,text/plain;q=0.8'
                },
                signal: AbortSignal.timeout(12000)
            });

            if ([301, 302, 303, 307, 308].includes(upstream.status)) {
                const location = upstream.headers.get('location');
                if (!location || redirect === MAX_REDIRECTS) {
                    return res.status(502).json({ error: 'The destination redirected too many times.' });
                }
                target = validateTarget(location, target);
                if (!target) return res.status(403).json({ error: 'The destination redirected outside the supported sites.' });
                continue;
            }
            break;
        }

        if (!upstream || !upstream.ok) {
            return res.status(502).json({ error: 'The destination could not be loaded.' });
        }

        const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
        const declaredLength = Number(upstream.headers.get('content-length') || 0);
        if (declaredLength > MAX_BODY_BYTES) return res.status(413).json({ error: 'This page is too large for the reader.' });

        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.length > MAX_BODY_BYTES) return res.status(413).json({ error: 'This page is too large for the reader.' });

        if (contentType.startsWith('image/')) {
            if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(contentType.split(';')[0])) {
                return res.status(415).json({ error: 'This image format is not supported.' });
            }
            res.setHeader('Content-Type', contentType.split(';')[0]);
            res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
            res.setHeader('Cache-Control', 'private, max-age=60');
            return res.status(200).send(bytes);
        }

        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        if (contentType.includes('text/html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
            res.setHeader('Cache-Control', 'private, no-store');
            return res.status(200).send(sanitizeHtml(text, target, req.query.token));
        }

        if (contentType.startsWith('text/plain')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'");
            return res.status(200).send('<!doctype html><meta charset="utf-8"><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'
                + escapeHtml(text) + '</pre>');
        }

        return res.status(415).json({ error: 'This content type is not supported in reader mode.' });
    } catch (error) {
        console.error('[BSMS Web :: Proxy] Destination request failed:', error);
        return res.status(502).json({ error: 'The destination could not be loaded.' });
    }
}
