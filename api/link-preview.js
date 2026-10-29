/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Controla-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const targetUrl = payload.url || req.query.url;

    if (!targetUrl || typeof targetUrl !== 'string') {
        return res.status(400).json({ error: "Missing URL." });
    }

    try {
        let parsedUrl = new URL(targetUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return res.status(400).json({ error: "Invalid protocol." });
        }

        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.endsWith('.local')) {
            return res.status(400).json({ error: "Disallowed target." });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const fetchRes = await fetch(parsedUrl.href, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 BSMSWeb/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        clearTimeout(timeoutId);

        if (!fetchRes.ok) {
            return res.status(200).json({
                url: targetUrl,
                title: hostname,
                description: '',
                image: null,
                siteName: hostname
            });
        }

        const html = await fetchRes.text();
        
        // Extract og tags and title
        const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                            html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
                            
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

        const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);

        let title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : hostname);
        let description = ogDescMatch ? ogDescMatch[1] : '';
        let image = ogImageMatch ? ogImageMatch[1] : null;
        let siteName = ogSiteName ? ogSiteName[1] : hostname;

        const unescapeHtml = (s) => s ? s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim() : '';
        title = unescapeHtml(title).slice(0, 150);
        description = unescapeHtml(description).slice(0, 300);

        if (image && !image.startsWith('http')) {
            try {
                image = new URL(image, parsedUrl.origin).href;
            } catch(e) {
                image = null;
            }
        }

        return res.status(200).json({
            url: targetUrl,
            title: title || hostname,
            description,
            image,
            siteName
        });
    } catch(fetchErr) {
        let fallbackHost = targetUrl;
        try { fallbackHost = new URL(targetUrl).hostname; } catch(e) {}
        return res.status(200).json({
            url: targetUrl,
            title: fallbackHost,
            description: '',
            image: null,
            siteName: fallbackHost
        });
    }
}
