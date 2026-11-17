/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Routes application API requests to the configured API host.
 * The cloud reader endpoint is intentionally excluded: its outbound requests
 * must originate from Vercel, never from the Mac-hosted API.
 */
(() => {
    'use strict';

    const API_ORIGIN = 'https://dev-api.bsms-web.com';
    const MEDIA_ORIGIN = 'https://media.bsms-web.com';
    const API_PATH = /^\/(?:api(?:\/|$)|games\/saves(?:\/|$)|raw(?:\/|$))/;
    const originalFetch = window.fetch.bind(window);

    window.BSMS_API_ORIGIN = API_ORIGIN;
    window.BSMS_MEDIA_ORIGIN = MEDIA_ORIGIN;

    window.fetch = function(input, init) {
        if (typeof input !== 'string' && !(input instanceof URL)) {
            return originalFetch(input, init);
        }

        const requestUrl = new URL(String(input), window.location.href);

        // This route runs on Vercel so destination websites see cloud egress.
        if (requestUrl.pathname === '/api/proxy' || requestUrl.pathname.startsWith('/api/proxy/')) {
            return originalFetch(input, init);
        }

        if (requestUrl.origin !== window.location.origin || !API_PATH.test(requestUrl.pathname)) {
            return originalFetch(input, init);
        }

        const destination = new URL(
            requestUrl.pathname + requestUrl.search + requestUrl.hash,
            API_ORIGIN
        );

        return originalFetch(destination.href, init);
    };

    const monitorScript = document.createElement('script');
    monitorScript.src = '/js/connection-monitor.js';
    monitorScript.defer = true;
    document.head.appendChild(monitorScript);
})();
