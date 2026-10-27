/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');

if (!localStorage.getItem('session_id')) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let sid = '';
    for (let i = 0; i < 10; i++) sid += chars.charAt(Math.floor(Math.random() * chars.length));
    localStorage.setItem('session_id', sid);
    console.log("[BSMS Web :: System] Generated new session_id.");
}
