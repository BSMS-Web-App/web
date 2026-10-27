/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
(function () {
  'use strict';

  const SESSION_KEY = 'bsms_auth_session';

  function hasSignedInAccount() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return Boolean(session && session.loggedIn === true && session.uid);
    } catch {
      return false;
    }
  }

  function enforceSignIn() {
    if (hasSignedInAccount()) return;

    const style = document.createElement('style');
    style.textContent = `
      #hh-signin-required-overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        padding: 20px; background: rgba(5, 2, 11, .88);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      }
      #hh-signin-required-card {
        width: min(440px, 100%); padding: 30px 26px;
        border: 1px solid rgba(249, 115, 22, .65); border-radius: 24px;
        background: linear-gradient(145deg, #25112f, #100912);
        color: #f0e6fa; text-align: center;
        box-shadow: 0 24px 90px rgba(0, 0, 0, .65);
        font-family: Nunito, system-ui, -apple-system, sans-serif;
      }
      #hh-signin-required-card h2 {
        margin: 0 0 12px; color: #fff; font-size: 1.65rem;
      }
      #hh-signin-required-card p {
        margin: 0 0 22px; color: #e9dced; line-height: 1.65;
      }
      #hh-signin-required-button {
        display: inline-flex; align-items: center; justify-content: center;
        min-height: 48px; width: 100%; padding: 12px 18px;
        border: 0; border-radius: 14px; background: #f97316;
        color: #1b0b04; font: 900 1rem Nunito, system-ui, sans-serif;
        text-decoration: none; cursor: pointer;
        transition: transform .18s ease, filter .18s ease;
      }
      #hh-signin-required-button:hover { filter: brightness(1.08); transform: translateY(-1px); }
      #hh-signin-required-button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'hh-signin-required-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'hh-signin-required-title');
    overlay.innerHTML = `
      <section id="hh-signin-required-card">
        <h2 id="hh-signin-required-title">Sign In Required</h2>
        <p>You must be signed in with your BSMS Web account to play the Halloween Haunt Contest.</p>
        <a id="hh-signin-required-button" href="/accounts">Sign In to BSMS Web</a>
      </section>
    `;
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
  }

  function initializePrizeModal() {
    const modal = document.getElementById('hh-prize-modal');
    const button = document.getElementById('hhPrizeGotIt');
    const closeButton = document.getElementById('hhPrizeClose');
    if (!modal || !button) return;

    const close = () => {
      modal.hidden = true;
      try { localStorage.setItem('hh_prize_notice_seen_v1', '1'); } catch {}
    };
    button.addEventListener('click', close);
    closeButton?.addEventListener('click', close);
    modal.addEventListener('click', event => {
      if (event.target === modal) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) close();
    });
    try {
      if (localStorage.getItem('hh_prize_notice_seen_v1') !== '1') modal.hidden = false;
    } catch {
      modal.hidden = false;
    }
  }

  // Gate access before the game scripts initialize. The server API also independently
  // requires a valid account session for all player state and gameplay actions.
  enforceSignIn();
  initializePrizeModal();
})();
