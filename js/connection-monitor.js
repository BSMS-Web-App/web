/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Independent connectivity diagnosis:
 * - Cloudflare DNS-over-HTTPS is only an external diagnostic signal.
 * - The BSMS health endpoint checks the application API.
 * Neither service is used as a dependency of the other.
 */
(() => {
    'use strict';

    if (window.BSMS_CONNECTION_MONITOR) return;
    window.BSMS_CONNECTION_MONITOR = true;

    const CHECK_INTERVAL = 5000;
    const REQUEST_TIMEOUT = 3000;
    const CLOUDFLARE_CHECK_URL = 'https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=A';
    const API_ORIGIN = window.BSMS_API_ORIGIN || 'https://bsms-web.com';
    const HEALTH_URL = new URL('/api/health', API_ORIGIN).href;

    let checking = false;
    let hadOutage = false;
    let recoveryDismissed = false;
    let recoveryVisible = false;
    let banner = null;
    let titleNode = null;
    let messageNode = null;
    let dismissButton = null;

    function addStyles() {
        if (document.getElementById('bsms-connection-styles')) return;
        const link = document.createElement('link');
        link.id = 'bsms-connection-styles';
        link.rel = 'stylesheet';
        link.href = '/css/connection-monitor.css';
        document.head.appendChild(link);
    }

    function createBanner() {
        if (banner) return;
        banner = document.createElement('section');
        banner.id = 'bsms-connection-banner';
        banner.className = 'bsms-connection-banner';
        banner.hidden = true;
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'assertive');
        banner.innerHTML = `
            <div class="bsms-connection-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                    <path d="M12 20h.01"></path>
                </svg>
            </div>
            <div class="bsms-connection-copy">
                <strong class="bsms-connection-title"></strong>
                <span class="bsms-connection-message"></span>
            </div>
            <button class="bsms-connection-dismiss" type="button" hidden aria-label="Dismiss connection notification">Dismiss</button>
        `;
        document.body.appendChild(banner);
        titleNode = banner.querySelector('.bsms-connection-title');
        messageNode = banner.querySelector('.bsms-connection-message');
        dismissButton = banner.querySelector('.bsms-connection-dismiss');
        dismissButton.addEventListener('click', () => {
            recoveryDismissed = true;
            recoveryVisible = false;
            banner.hidden = true;
        });
    }

    function showBanner(type, title, message) {
        createBanner();
        banner.dataset.state = type;
        titleNode.textContent = title;
        messageNode.textContent = message;
        dismissButton.hidden = type !== 'restored';
        banner.hidden = false;
    }

    function hideBanner() {
        if (banner) banner.hidden = true;
    }

    async function checkCloudflare() {
        const response = await fetch(CLOUDFLARE_CHECK_URL, {
            method: 'GET',
            headers: { Accept: 'application/dns-json' },
            cache: 'no-store',
            credentials: 'omit',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
    }

    async function checkServer() {
        // Use a dedicated, database-independent endpoint. A no-cors GET avoids
        // treating a branch-origin CORS response as an internet outage; an
        // opaque response still proves the production API host responded.
        const response = await fetch(HEALTH_URL, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            credentials: 'omit',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });
        return response.type === 'opaque' || response.ok;
    }

    function diagnose(cloudflareUp, serverUp) {
        if (cloudflareUp && serverUp) return 'healthy';
        if (cloudflareUp && !serverUp) return 'server';
        if (!cloudflareUp && !serverUp) return 'internet';
        return 'partial';
    }

    async function runCheck() {
        if (checking || document.visibilityState === 'prerender') return;
        checking = true;

        try {
            const [cloudflareUp, serverUp] = await Promise.all([
                checkCloudflare().catch(() => false),
                checkServer().catch(() => false)
            ]);

            const diagnosis = diagnose(cloudflareUp, serverUp);

            if (diagnosis === 'server') {
                hadOutage = true;
                recoveryDismissed = false;
                recoveryVisible = false;
                showBanner(
                    'server',
                    'Server is not reachable',
                    'Your internet connection appears to be working, but the BSMS Web server is not responding.'
                );
            } else if (diagnosis === 'internet') {
                hadOutage = true;
                recoveryDismissed = false;
                recoveryVisible = false;
                showBanner(
                    'internet',
                    'No internet connection',
                    'Your device cannot reach the internet. Check your connection and try again.'
                );
            } else if (diagnosis === 'healthy') {
                if (hadOutage && !recoveryDismissed) {
                    showBanner(
                        'restored',
                        'Connection restored',
                        'BSMS Web is connected again. You can safely continue where you left off.'
                    );
                    recoveryVisible = true;
                    window.dispatchEvent(new CustomEvent('bsms:connection-restored'));
                } else if (!recoveryVisible || recoveryDismissed) {
                    hideBanner();
                }
                hadOutage = false;
            } else {
                // Cloudflare is unavailable while the BSMS server still responds.
                // Per the agreed decision table, this condition does not show a popup.
                hideBanner();
                if (recoveryVisible) recoveryVisible = false;
            }

            window.dispatchEvent(new CustomEvent('bsms:connection-status', {
                detail: { cloudflareUp, serverUp, diagnosis }
            }));
        } finally {
            checking = false;
        }
    }

    function start() {
        addStyles();
        createBanner();
        runCheck();
        window.setInterval(() => {
            if (document.visibilityState === 'visible') runCheck();
        }, CHECK_INTERVAL);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') runCheck();
        });

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js').catch(error => {
                console.warn('[BSMS Web :: Offline] Service worker registration failed:', error);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
