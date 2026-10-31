/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 3500;

function isPublicAddress(address) {
    try { return ipaddr.parse(address).range() === 'unicast'; }
    catch { return false; }
}

async function resolvePublicAddresses(hostname) {
    const version = isIP(hostname);
    const addresses = version
        ? [{ address: hostname, family: version }]
        : await dns.lookup(hostname, { all: true, verbatim: true });

    // Reject the entire hostname if any DNS answer is private, local, reserved, or otherwise non-public.
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
        throw new Error('Disallowed target address.');
    }
    return addresses;
}

function requestHtml(url, addresses) {
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const request = transport.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || undefined,
            path: url.pathname + url.search,
            method: 'GET',
            headers: { 'User-Agent': 'BSMSWeb-LinkPreview/1.0', 'Accept': 'text/html,application/xhtml+xml' },
            // Pin the connection to the public DNS result already validated above.
            lookup: (_hostname, options, callback) => {
                if (options && options.all) return callback(null, addresses);
                return callback(null, addresses[0].address, addresses[0].family);
            },
            timeout: REQUEST_TIMEOUT_MS
        }, (response) => {
            const status = response.statusCode || 0;
            if (status >= 300 && status < 400 && response.headers.location) {
                response.resume();
                return resolve({ redirect: response.headers.location });
            }
            const contentType = String(response.headers['content-type'] || '').toLowerCase();
            if (status < 200 || status >= 300 ||
                (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml'))) {
                response.resume();
                return resolve({ status, html: '' });
            }
            let body = '';
            let bytes = 0;
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                bytes += Buffer.byteLength(chunk);
                if (bytes > MAX_RESPONSE_BYTES) return request.destroy(new Error('Preview response is too large.'));
                body += chunk;
            });
            response.on('end', () => resolve({ status, html: body }));
            response.on('error', reject);
        });
        request.on('timeout', () => request.destroy(new Error('Preview request timed out.')));
        request.on('error', reject);
        request.end();
    });
}

function extractMetadata(html, pageUrl) {
    const readMeta = (key) => {
        const patterns = [
            new RegExp("<meta[^>]+(?:property|name)=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']*)[\"'][^>]*>", 'i'),
            new RegExp("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+(?:property|name)=[\"']" + key + "[\"'][^>]*>", 'i')
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) return match[1];
        }
        return '';
    };
    const unescapeHtml = (value) => String(value || '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'")
        .replace(/&amp;/g, '&').trim();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    let image = readMeta('og:image');
    if (image) {
        try {
            const imageUrl = new URL(image, pageUrl);
            image = ['http:', 'https:'].includes(imageUrl.protocol) && !imageUrl.username && !imageUrl.password ? imageUrl.href : null;
        } catch { image = null; }
    }
    return {
        title: unescapeHtml(readMeta('og:title') || (titleMatch && titleMatch[1]) || pageUrl.hostname).slice(0, 150) || pageUrl.hostname,
        description: unescapeHtml(readMeta('og:description') || readMeta('description')).slice(0, 300),
        image,
        siteName: unescapeHtml(readMeta('og:site_name') || pageUrl.hostname).slice(0, 100)
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });

    let payload = req.body || {};
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload || '{}'); }
        catch { return res.status(400).json({ error: 'Invalid request body.' }); }
    }
    const targetUrl = payload.url || req.query.url;
    if (typeof targetUrl !== 'string' || targetUrl.length > 2048) {
        return res.status(400).json({ error: 'A valid URL is required.' });
    }

    try {
        let currentUrl = new URL(targetUrl);
        if (!['http:', 'https:'].includes(currentUrl.protocol) || currentUrl.username || currentUrl.password ||
            !currentUrl.hostname || (currentUrl.port && currentUrl.port !== '80' && currentUrl.port !== '443') ||
            (currentUrl.protocol === 'http:' && currentUrl.port === '443') ||
            (currentUrl.protocol === 'https:' && currentUrl.port === '80')) {
            return res.status(400).json({ error: 'Invalid target URL.' });
        }

        let result = null;
        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            const addresses = await resolvePublicAddresses(currentUrl.hostname);
            result = await requestHtml(currentUrl, addresses);
            if (!result.redirect) break;
            if (redirectCount === MAX_REDIRECTS) return res.status(400).json({ error: 'Too many redirects.' });
            const nextUrl = new URL(result.redirect, currentUrl);
            if (!['http:', 'https:'].includes(nextUrl.protocol) || nextUrl.username || nextUrl.password ||
                (nextUrl.protocol === 'http:' && nextUrl.port && nextUrl.port !== '80') ||
                (nextUrl.protocol === 'https:' && nextUrl.port && nextUrl.port !== '443')) {
                return res.status(400).json({ error: 'Disallowed redirect target.' });
            }
            currentUrl = nextUrl;
        }

        const metadata = extractMetadata(result && result.html ? result.html : '', currentUrl);
        return res.status(200).json({ url: targetUrl, title: metadata.title, description: metadata.description, image: metadata.image, siteName: metadata.siteName });
    } catch (error) {
        let fallbackHost = targetUrl;
        try { fallbackHost = new URL(targetUrl).hostname; } catch {}
        if (error && error.message === 'Disallowed target address.') return res.status(400).json({ error: 'Disallowed target.' });
        return res.status(200).json({ url: targetUrl, title: fallbackHost, description: '', image: null, siteName: fallbackHost });
    }
}
