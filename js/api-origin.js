/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Routes application API requests directly to the dev2 Mac-hosted API.
 * Keep this public origin free of secrets; authentication uses session headers.
 */
(() => {
    'use strict';

    const API_ORIGIN = 'https://app-api-dev2.bsms-web.com';
    const API_PATH = /^\/(?:api(?:\/|$)|games\/saves(?:\/|$)|raw(?:\/|$))/;
    const originalFetch = window.fetch.bind(window);

    window.BSMS_API_ORIGIN = API_ORIGIN;

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
})();
