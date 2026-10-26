/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
// Offline support is scoped to Halloween Haunt only.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/event/halloween-haunt-sw.js', { scope: '/event/' })
        .then(() => console.info('[Halloween Haunt] Offline support ready.'))
        .catch(error => console.warn('[Halloween Haunt] Offline support could not be enabled:', error));
    });
  }
  window.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeOfflineHelp?.();});
