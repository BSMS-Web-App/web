/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
(() => {
    'use strict';

    const CHANGELOG_URL = 'https://raw.githubusercontent.com/BSMS-Web-App/web/main/CHANGELOG.md';
    const CHANGELOG_PAGE = '/changelog';
    const LOCAL_KEY = 'bsms_release_update_dismissals_v1';
    const SESSION_KEY = 'session_id';
    const EXEMPT_PATHS = new Set(['/changelog', '/terms', '/privacy', '/401', '/404']);
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (EXEMPT_PATHS.has(path) || new URLSearchParams(location.search).get('embed') === '1') return;

    let host = null, shadow = null, dialog = null, bodyOverflow = '', activeRelease = null, opening = false;

    function getSessionId() {
        try {
            const auth = JSON.parse(localStorage.getItem('bsms_auth_session') || 'null');
            if (!auth || auth.loggedIn !== true) return '';
            return localStorage.getItem(SESSION_KEY) || auth.sessionId || '';
        } catch { return ''; }
    }

    async function apiRequest(action, version) {
        const response = await fetch('/api/updates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-ID': getSessionId() },
            body: JSON.stringify({ action, version }),
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'Could not save your update preferences.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function parseReleases(markdown) {
        const releases = [];
        let current = null;
        for (const line of String(markdown || '').split(/\r?\n/)) {
            const heading = line.match(/^##\s+(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/);
            if (heading) {
                current = { version: heading[1], topics: [], url: '' };
                releases.push(current);
                continue;
            }
            if (!current) continue;
            const topic = line.match(/^\s*-\s+(.+?)\s*$/);
            if (topic) current.topics.push(topic[1]);
            const link = line.match(/\[View the full changelog for this release\]\((https?:\/\/[^)]+)\)/i);
            if (link) current.url = link[1];
        }
        return releases;
    }

    function localDismissed(version) {
        try { return Boolean(JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')?.[version]); }
        catch { return false; }
    }

    function saveLocalDismissal(version) {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch {}
        saved[version] = Date.now();
        localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));
    }

    async function isDismissed(version) {
        if (!getSessionId()) return localDismissed(version);
        try { return (await apiRequest('status', version)).dismissed === true; }
        catch (error) {
            if (error.status === 401) return localDismissed(version);
            throw error;
        }
    }

    async function persistDismissal(version) {
        if (!getSessionId()) return saveLocalDismissal(version);
        try { await apiRequest('dismiss', version); }
        catch (error) {
            if (error.status === 401) return saveLocalDismissal(version);
            throw error;
        }
    }

    function ensureHost() {
        if (shadow) return;
        host = document.createElement('div');
        host.id = 'bsms-release-updates-host';
        host.style.cssText = 'position:fixed;inset:0;z-index:100001;pointer-events:none;';
        shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            :host{font-family:'Patrick Hand',cursive;color:#fff;color-scheme:dark}*,*::before,*::after{box-sizing:border-box}button,a{font:inherit}
            .backdrop{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);pointer-events:auto;animation:fade-in .28s ease both}
            .dialog{position:relative;width:min(620px,94vw);max-height:min(88vh,820px);overflow:auto;padding:30px 28px 24px;background:linear-gradient(145deg,rgba(24,24,27,.98),rgba(5,5,7,.98));border:1px solid rgba(255,255,255,.15);border-top:3px solid #BB001E;border-radius:24px;box-shadow:0 24px 90px rgba(0,0,0,.6),0 0 55px rgba(187,0,30,.12);animation:pop-in .42s cubic-bezier(.2,.85,.25,1.15) both}
            .eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 11px;border:1px solid rgba(255,83,105,.3);border-radius:999px;background:rgba(187,0,30,.13);color:#ff7b8b;font:700 12px/1.2 system-ui,sans-serif;letter-spacing:.11em;text-transform:uppercase}
            .eyebrow:before{content:'';width:7px;height:7px;border-radius:50%;background:#ff5369;box-shadow:0 0 12px #ff5369}
            h2{margin:17px 0 3px;font-size:clamp(32px,6vw,43px);line-height:1.05;font-weight:700;letter-spacing:-.02em}
            .version{margin:0 0 18px;color:rgba(255,255,255,.58);font:600 13px/1.5 system-ui,sans-serif;letter-spacing:.04em}
            .intro{margin:0 0 15px;color:rgba(255,255,255,.82);font-size:19px;line-height:1.45}
            .topics{display:grid;gap:10px;margin:0 0 24px;padding:0;list-style:none}
            .topics li{position:relative;padding:10px 13px 10px 35px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.045);color:rgba(255,255,255,.9);font-size:17px;line-height:1.35}
            .topics li:before{content:'';position:absolute;left:14px;top:17px;width:8px;height:8px;border-radius:3px;background:#ff5369;transform:rotate(45deg)}
            .actions{display:flex;flex-wrap:wrap;gap:10px}
            .actions button,.actions a{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:10px 18px;border:1px solid transparent;border-radius:12px;text-decoration:none;font-size:17px;font-weight:700;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease}
            .actions button:hover,.actions a:hover{transform:translateY(-1px)}.primary{flex:1;background:#BB001E;color:#fff}.primary:hover{background:#d10022}
            .secondary{flex:1;background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.13)!important;color:#fff}.secondary:hover{background:rgba(255,255,255,.12)}
            .error{margin:12px 0 0;color:#ff9aa6;font:14px/1.45 system-ui,sans-serif}
            button:focus-visible,a:focus-visible{outline:3px solid #ff8290;outline-offset:3px}
            @keyframes fade-in{from{opacity:0}to{opacity:1}}@keyframes pop-in{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
            @media(max-width:520px){.backdrop{padding:12px}.dialog{width:100%;padding:25px 18px 18px;border-radius:19px}.actions{flex-direction:column}.actions button,.actions a{width:100%}}
            @media(prefers-reduced-motion:reduce){.backdrop,.dialog{animation:none}.actions button,.actions a{transition:none}}
        `;
        shadow.appendChild(style);
        document.body.appendChild(host);
    }

    function removeOverlay() {
        if (host) host.remove();
        host = null; shadow = null; dialog = null;
        document.body.style.overflow = bodyOverflow;
    }

    function render(release) {
        ensureHost();
        bodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        activeRelease = release;

        const backdrop = document.createElement('div');
        backdrop.className = 'backdrop';
        backdrop.innerHTML = `
            <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="bsms-release-title" aria-describedby="bsms-release-description">
                <div class="eyebrow">BSMS Web Update</div><h2 id="bsms-release-title">What's New?</h2>
                <p class="version"></p><p class="intro" id="bsms-release-description">A new BSMS Web release is available. Here's what changed.</p>
                <ul class="topics"></ul><div class="actions"><button class="primary" type="button">Continue</button><a class="secondary" href="${CHANGELOG_PAGE}">View Full Changelog</a></div>
                <p class="error" role="alert" hidden></p>
            </section>`;
        shadow.appendChild(backdrop);
        dialog = backdrop.querySelector('.dialog');
        dialog.querySelector('.version').textContent = release.version;
        const list = dialog.querySelector('.topics');
        for (const topic of release.topics.slice(0, 6)) {
            const item = document.createElement('li');
            item.textContent = topic;
            list.appendChild(item);
        }
        if (!release.topics.length) {
            const item = document.createElement('li');
            item.textContent = 'Explore the latest improvements to BSMS Web.';
            list.appendChild(item);
        }
        dialog.querySelector('.primary').addEventListener('click', dismiss);
        dialog.querySelector('.secondary').addEventListener('click', async event => {
            event.preventDefault();
            const destination = event.currentTarget.href;
            const button = dialog.querySelector('.primary');
            button.disabled = true;
            try {
                await persistDismissal(release.version);
                removeOverlay();
                location.href = destination;
            } catch (error) {
                showError(error.message);
                button.disabled = false;
            }
        });
        backdrop.addEventListener('click', event => { if (event.target === backdrop) dismiss(); });
        dialog.querySelector('.primary').focus();
    }

    function showError(message) {
        if (!dialog) return;
        const error = dialog.querySelector('.error');
        error.textContent = message || 'Could not save this preference. Please try again.';
        error.hidden = false;
    }

    async function dismiss() {
        if (!activeRelease || !dialog) return;
        const button = dialog.querySelector('.primary');
        button.disabled = true;
        button.textContent = 'Saving…';
        try {
            await persistDismissal(activeRelease.version);
            removeOverlay();
            activeRelease = null;
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Continue';
            showError(error.message);
        }
    }

    async function checkForRelease() {
        if (opening || host || document.visibilityState === 'hidden') return;
        opening = true;
        try {
            const response = await fetch(CHANGELOG_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error('The changelog could not be loaded.');
            const latest = parseReleases(await response.text())[0];
            if (!latest || await isDismissed(latest.version)) return;
            render(latest);
        } catch (error) {
            console.warn('[BSMS Web :: Updates] Could not check for a new release:', error.message);
        } finally { opening = false; }
    }

    window.addEventListener('bsms:auth-changed', () => { if (host) removeOverlay(); checkForRelease(); });
    window.addEventListener('storage', event => {
        if (event.key === SESSION_KEY || event.key === 'bsms_auth_session') {
            if (host) removeOverlay();
            checkForRelease();
        }
    });
    window.addEventListener('focus', checkForRelease);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkForRelease, { once: true });
    else checkForRelease();
})();
