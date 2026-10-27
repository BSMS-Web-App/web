/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');
