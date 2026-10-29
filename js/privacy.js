/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');
