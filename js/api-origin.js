/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Routes application API requests through the production BSMS Web website/API origin.
 * The dev1 preview uses its own Vercel API functions, which connect to the configured
 * shared backend using Preview environment variables. Keeping those requests same-origin
 * avoids cross-origin preflight failures without changing production.
 */
(() => {
    'use strict';

    const IS_DEV1 = window.location.hostname === 'dev1.bsms-web.com';
    const API_ORIGIN = IS_DEV1 ? window.location.origin : 'https://bsms-web.com';
    const MEDIA_ORIGIN = 'https://media.bsms-web.com';
    const API_PATH = /^\/(?:api(?:\/|$)|games\/saves(?:\/|$)|raw(?:\/|$))/;
    const originalFetch = window.fetch.bind(window);

    window.BSMS_API_ORIGIN = API_ORIGIN;
    window.BSMS_MEDIA_ORIGIN = MEDIA_ORIGIN;

    window.fetch = function(input, init) {
        // Application requests use URL strings. Leave Request objects and
        // unrelated external requests untouched.
        if (typeof input !== 'string' && !(input instanceof URL)) {
            return originalFetch(input, init);
        }

        const requestUrl = new URL(String(input), window.location.href);
        if (requestUrl.origin !== window.location.origin || !API_PATH.test(requestUrl.pathname)) {
            return originalFetch(input, init);
        }

        const destination = new URL(
            requestUrl.pathname + requestUrl.search + requestUrl.hash,
            API_ORIGIN
        );

        return originalFetch(destination.href, init);
    };

    // Load the shared connection monitor on every page using the API bootstrap.
    const monitorScript = document.createElement('script');
    monitorScript.src = '/js/connection-monitor.js';
    monitorScript.defer = true;
    document.head.appendChild(monitorScript);
})();
