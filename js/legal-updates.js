/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(() => {
    'use strict';

    const SESSION_KEY = 'session_id';
    const AUTH_KEY = 'bsms_auth_session';
    const DEFERRED_KEY = 'bsms_updates_deferred_session';
    const EXEMPT_PATHS = new Set(['/terms', '/privacy', '/support']);

    let overlayHost = null;
    let shadowRoot = null;
    let overlay = null;
    let reviewLayer = null;
    let previousBodyOverflow = '';
    let currentSessionId = '';
    let currentReleases = [];
    let currentLegal = null;
    let isSubmitting = false;
    let checkSequence = 0;
    let requestError = '';

    const rawPath = window.location.pathname;
    const currentPath = (rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath) || '/';
    if (EXEMPT_PATHS.has(currentPath) || new URLSearchParams(window.location.search).get('embed') === '1') return;

    function getSessionId() {
        try {
            const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
            if (!auth || auth.loggedIn !== true) return '';
            return localStorage.getItem(SESSION_KEY) || auth.sessionId || '';
        } catch {
            return '';
        }
    }

    function headers(session = getSessionId()) {
        return {
            'Content-Type': 'application/json',
            'X-Session-ID': session
        };
    }

    async function updatesRequest(method, body) {
        const response = await fetch('/api/updates', {
            method,
            headers: headers(),
            ...(body ? { body: JSON.stringify(body) } : {}),
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'The updates service is unavailable.');
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    async function legalRequest(action, body = {}) {
        const response = await fetch('/api/legal', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ action, ...body }),
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'The legal policy service is unavailable.');
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    function ensureHost() {
        if (shadowRoot) return;
        previousBodyOverflow = document.body.style.overflow;
        overlayHost = document.createElement('div');
        overlayHost.id = 'bsms-unified-updates-host';
        overlayHost.style.cssText = 'position:fixed;inset:0;z-index:100000;pointer-events:none;';
        shadowRoot = overlayHost.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = [
            ':host{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#f7f7fa;color-scheme:dark}',
            '*,*::before,*::after{box-sizing:border-box}',
            'button,input{font:inherit}',
            '.bsms-backdrop{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(3,4,9,.78);backdrop-filter:blur(14px);pointer-events:auto;animation:bsmsFade .22s ease both}',
            '.bsms-dialog{width:min(690px,96vw);max-height:min(90vh,900px);overflow:auto;padding:26px;border:1px solid rgba(255,255,255,.14);border-radius:25px;background:linear-gradient(155deg,rgba(31,32,42,.97),rgba(12,13,19,.985));box-shadow:0 28px 100px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.07);animation:bsmsPop .34s cubic-bezier(.2,.8,.2,1) both}',
            '@keyframes bsmsFade{from{opacity:0}to{opacity:1}}',
            '@keyframes bsmsPop{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}',
            '.bsms-eyebrow{display:flex;align-items:center;gap:9px;color:#ff7b8e;font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}',
            '.bsms-eyebrow-mark{width:8px;height:8px;border-radius:50%;background:#BB001E;box-shadow:0 0 16px rgba(187,0,30,.75)}',
            '.bsms-title{margin:10px 0 5px;color:#fff;font-size:clamp(25px,4vw,32px);font-weight:750;letter-spacing:-.035em;line-height:1.1}',
            '.bsms-subtitle{margin:0 0 20px;color:rgba(239,240,248,.62);font-size:14px;line-height:1.55}',
            '.bsms-section{margin-top:20px}',
            '.bsms-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;color:#fff;font-size:15px;font-weight:750}',
            '.bsms-count{color:rgba(255,255,255,.48);font-size:12px;font-weight:600}',
            '.bsms-release{padding:15px 16px;margin-top:10px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.035)}',
            '.bsms-release-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}',
            '.bsms-release-version{margin:0;color:#fff;font-size:17px;font-weight:750;letter-spacing:-.02em}',
            '.bsms-new-pill{padding:4px 8px;border:1px solid rgba(187,0,30,.4);border-radius:999px;background:rgba(187,0,30,.13);color:#ff8b9b;font-size:10px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}',
            '.bsms-release-list{display:grid;gap:7px;margin:0;padding:0 0 0 17px;color:rgba(239,240,248,.78);font-size:13px;line-height:1.5}',
            '.bsms-release-list li::marker{color:#ff6b81}',
            '.bsms-release-link{display:inline-flex;margin-top:11px;color:#ff8b9b;font-size:12px;font-weight:650;text-decoration:none}',
            '.bsms-release-link:hover{text-decoration:underline}',
            '.bsms-legal-card{padding:14px;margin-top:9px;border:1px solid rgba(255,255,255,.11);border-radius:15px;background:rgba(255,255,255,.035)}',
            '.bsms-legal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}',
            '.bsms-legal-name{color:#fff;font-size:14px;font-weight:750}',
            '.bsms-legal-status{color:#ff8999;font-size:10px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}',
            '.bsms-review{min-height:35px;padding:0 12px;border:1px solid rgba(255,255,255,.17);border-radius:10px;background:rgba(255,255,255,.055);color:#fff;font-size:12px;font-weight:650;cursor:pointer}',
            '.bsms-review:hover{border-color:rgba(255,255,255,.34);background:rgba(255,255,255,.1)}',
            '.bsms-check{display:flex;align-items:flex-start;gap:9px;margin-top:11px;color:rgba(255,255,255,.83);font-size:12px;line-height:1.45;cursor:pointer}',
            '.bsms-check input{width:16px;height:16px;flex:0 0 16px;margin:1px 0 0;accent-color:#BB001E}',
            '.bsms-note{margin:7px 0 0;color:rgba(255,255,255,.43);font-size:11px;line-height:1.45}',
            '.bsms-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:21px}',
            '.bsms-primary,.bsms-secondary{min-height:43px;padding:0 17px;border-radius:12px;font-size:13px;font-weight:750;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease,opacity .16s ease}',
            '.bsms-primary{flex:1 1 220px;border:1px solid #BB001E;background:#BB001E;color:#fff;box-shadow:0 7px 20px rgba(187,0,30,.2)}',
            '.bsms-primary:hover:not(:disabled){background:#d20b2b;transform:translateY(-1px)}',
            '.bsms-primary:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}',
            '.bsms-secondary{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);color:rgba(255,255,255,.83)}',
            '.bsms-secondary:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.08)}',
            '.bsms-error{margin:12px 0 0;color:#ff8797;font-size:12px;line-height:1.45}',
            '.bsms-success{padding:12px 14px;margin-top:15px;border:1px solid rgba(74,222,128,.25);border-radius:12px;background:rgba(34,197,94,.08);color:#9ae6b4;font-size:12px;line-height:1.5}',
            '.bsms-footer{margin:16px 0 0;color:rgba(255,255,255,.35);font-size:10px;line-height:1.5;text-align:center}',
            '.bsms-review-layer{position:fixed;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.86);pointer-events:auto}',
            '.bsms-review-panel{display:flex;flex-direction:column;width:min(1050px,100%);height:min(900px,94vh);overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:#101116}',
            '.bsms-review-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:0 14px;border-bottom:1px solid rgba(255,255,255,.1);color:#fff;font-size:13px;font-weight:750}',
            '.bsms-back{padding:7px 11px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:transparent;color:#fff;font-size:11px;cursor:pointer}',
            '.bsms-frame{width:100%;height:100%;border:0;background:#08090d}',
            '@media(max-width:600px){.bsms-backdrop{padding:10px}.bsms-dialog{width:100%;max-height:94vh;padding:20px 16px;border-radius:20px}.bsms-actions{display:grid;grid-template-columns:1fr}.bsms-primary,.bsms-secondary{width:100%}.bsms-review-layer{padding:0}.bsms-review-panel{width:100%;height:100%;border:0;border-radius:0}.bsms-review-bar{min-height:50px;padding:0 10px}}',
            '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}'
        ].join('');
        shadowRoot.appendChild(style);
        document.body.appendChild(overlayHost);
    }

    function createOverlay() {
        if (overlay) return overlay;
        ensureHost();
        overlay = document.createElement('div');
        overlay.className = 'bsms-backdrop';
        overlay.innerHTML =
            '<section class="bsms-dialog" role="dialog" aria-modal="true" aria-labelledby="bsms-updates-title">' +
                '<div class="bsms-eyebrow"><span class="bsms-eyebrow-mark" aria-hidden="true"></span> BSMS WEB · UPDATES</div>' +
                '<h2 class="bsms-title" id="bsms-updates-title">What’s new</h2>' +
                '<p class="bsms-subtitle" id="bsms-updates-subtitle"></p>' +
                '<div id="bsms-release-section" class="bsms-section"></div>' +
                '<div id="bsms-legal-section" class="bsms-section"></div>' +
                '<div id="bsms-legal-success"></div>' +
                '<p id="bsms-updates-error" class="bsms-error" role="alert" hidden></p>' +
                '<div id="bsms-updates-actions" class="bsms-actions"></div>' +
                '<p class="bsms-footer">Release notes are based on the official BSMS Web changelog. Your viewed updates are saved to your account.</p>' +
            '</section>';
        shadowRoot.appendChild(overlay);
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return overlay;
    }

    function closeOverlay() {
        if (reviewLayer) {
            reviewLayer.remove();
            reviewLayer = null;
        }
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
        document.body.style.overflow = previousBodyOverflow;
        if (overlayHost) overlayHost.remove();
        overlayHost = null;
        shadowRoot = null;
    }

    function addReleaseCards(releases) {
        const container = overlay.querySelector('#bsms-release-section');
        container.replaceChildren();
        if (!releases.length) return;

        const heading = document.createElement('div');
        heading.className = 'bsms-section-heading';
        const label = document.createElement('span');
        label.textContent = 'Product updates';
        const count = document.createElement('span');
        count.className = 'bsms-count';
        count.textContent = releases.length + (releases.length === 1 ? ' new release' : ' new releases');
        heading.append(label, count);
        container.appendChild(heading);

        releases.forEach(release => {
            const card = document.createElement('article');
            card.className = 'bsms-release';

            const cardHead = document.createElement('div');
            cardHead.className = 'bsms-release-head';
            const version = document.createElement('h3');
            version.className = 'bsms-release-version';
            version.textContent = release.version;
            const pill = document.createElement('span');
            pill.className = 'bsms-new-pill';
            pill.textContent = 'New';
            cardHead.append(version, pill);
            card.appendChild(cardHead);

            const list = document.createElement('ul');
            list.className = 'bsms-release-list';
            (Array.isArray(release.items) ? release.items : []).forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                list.appendChild(li);
            });
            card.appendChild(list);

            if (typeof release.detailsUrl === 'string' &&
                release.detailsUrl.startsWith('https://github.com/BSMS-Web-App/web/releases/tag/')) {
                const link = document.createElement('a');
                link.className = 'bsms-release-link';
                link.href = release.detailsUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Read full release notes';
                card.appendChild(link);
            }

            container.appendChild(card);
        });
    }

    function createPolicyCard(key, policy) {
        const title = key === 'terms' ? 'Terms of Service' : 'Privacy Policy';
        const updated = policy.updated === true;
        const card = document.createElement('section');
        card.className = 'bsms-legal-card';

        const head = document.createElement('div');
        head.className = 'bsms-legal-head';
        const name = document.createElement('span');
        name.className = 'bsms-legal-name';
        name.textContent = title;
        const status = document.createElement('span');
        status.className = 'bsms-legal-status';
        status.textContent = updated ? 'Updated' : 'First acknowledgment';
        head.append(name, status);
        card.appendChild(head);

        const review = document.createElement('button');
        review.type = 'button';
        review.className = 'bsms-review';
        review.textContent = 'Review ' + title;
        review.addEventListener('click', () => openDocument(key, true));
        card.appendChild(review);

        const label = document.createElement('label');
        label.className = 'bsms-check';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.accept = key;
        checkbox.addEventListener('change', updateAcceptButton);
        const text = document.createElement('span');
        text.textContent = key === 'terms'
            ? (updated ? 'I agree to the updated Terms of Service.' : 'I agree to the current Terms of Service.')
            : (updated ? 'I acknowledge the updated Privacy Policy.' : 'I acknowledge the current Privacy Policy.');
        label.append(checkbox, text);
        card.appendChild(label);

        const note = document.createElement('p');
        note.className = 'bsms-note';
        note.textContent = updated
            ? 'This document changed since the version previously accepted on this account.'
            : 'This account does not yet have a recorded acknowledgment for this document.';
        card.appendChild(note);
        return card;
    }

    function addLegalSections(legal) {
        const container = overlay.querySelector('#bsms-legal-section');
        container.replaceChildren();
        if (!legal || !legal.needsAcceptance) return;

        const policies = legal.policies || {};
        const updated = Object.keys(policies).filter(key => policies[key].required && policies[key].updated);
        const firstAcknowledgments = Object.keys(policies).filter(key =>
            policies[key].required && policies[key].firstAcknowledgment
        );
        const otherRequired = Object.keys(policies).filter(key =>
            policies[key].required && !policies[key].updated && !policies[key].firstAcknowledgment
        );

        function addGroup(title, keys) {
            if (!keys.length) return;
            const heading = document.createElement('div');
            heading.className = 'bsms-section-heading';
            heading.textContent = title;
            container.appendChild(heading);
            keys.forEach(key => container.appendChild(createPolicyCard(key, policies[key])));
        }

        addGroup('Policy updates', updated);
        addGroup('Required acknowledgments', firstAcknowledgments.concat(otherRequired));
    }

    function showError(message) {
        const error = overlay?.querySelector('#bsms-updates-error');
        if (!error) return;
        error.textContent = message || 'Something went wrong. Please try again.';
        error.hidden = false;
    }

    function updateAcceptButton() {
        if (!overlay || !currentLegal) return;
        const required = Object.keys(currentLegal.policies || {}).filter(key =>
            currentLegal.policies[key].required
        );
        const checked = required.every(key =>
            Boolean(overlay.querySelector('[data-accept="' + key + '"]')?.checked)
        );
        const button = overlay.querySelector('#bsms-legal-accept');
        if (button) button.disabled = !checked || isSubmitting;
    }

    function renderActions(legal, successMessage) {
        const actions = overlay.querySelector('#bsms-updates-actions');
        actions.replaceChildren();

        if (legal && legal.needsAcceptance) {
            const accept = document.createElement('button');
            accept.type = 'button';
            accept.id = 'bsms-legal-accept';
            accept.className = 'bsms-primary';
            accept.textContent = 'Accept and continue';
            accept.disabled = true;
            accept.addEventListener('click', submitAcceptance);
            actions.appendChild(accept);

            const signOut = document.createElement('button');
            signOut.type = 'button';
            signOut.className = 'bsms-secondary';
            signOut.textContent = 'Sign Out';
            signOut.addEventListener('click', signOutFromPopup);
            actions.appendChild(signOut);

            const support = document.createElement('button');
            support.type = 'button';
            support.className = 'bsms-secondary';
            support.textContent = 'Contact Support';
            support.addEventListener('click', () => { window.location.href = '/support'; });
            actions.appendChild(support);
            return;
        }

        if (currentReleases.length) {
            const viewed = document.createElement('button');
            viewed.type = 'button';
            viewed.className = 'bsms-primary';
            viewed.textContent = 'I’ve read these updates';
            viewed.addEventListener('click', markViewed);
            actions.appendChild(viewed);

            const later = document.createElement('button');
            later.type = 'button';
            later.className = 'bsms-secondary';
            later.textContent = 'Later';
            later.addEventListener('click', deferUpdates);
            actions.appendChild(later);
            return;
        }

        if (successMessage) {
            const done = document.createElement('button');
            done.type = 'button';
            done.className = 'bsms-primary';
            done.textContent = 'Continue to BSMS Web';
            done.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('bsms:legal-accepted'));
                closeOverlay();
            });
            actions.appendChild(done);
        }
    }

    function render(data, legalSuccess = false) {
        currentReleases = Array.isArray(data.releases) ? data.releases : [];
        currentLegal = data.legal || { policies: {}, needsAcceptance: false };

        if (!currentReleases.length && !currentLegal.needsAcceptance && !legalSuccess) {
            closeOverlay();
            return;
        }

        const root = createOverlay();
        const subtitle = root.querySelector('#bsms-updates-subtitle');
        if (currentReleases.length) {
            subtitle.textContent = currentReleases.length === 1
                ? 'There is one release you haven’t viewed yet.'
                : 'There are ' + currentReleases.length + ' releases you haven’t viewed yet.';
        } else if (currentLegal.needsAcceptance) {
            subtitle.textContent = 'Please review the required policy information below before continuing.';
        } else {
            subtitle.textContent = 'Your legal acknowledgments have been saved.';
        }

        addReleaseCards(currentReleases);
        addLegalSections(currentLegal);

        const success = root.querySelector('#bsms-legal-success');
        success.replaceChildren();
        if (legalSuccess) {
            const notice = document.createElement('div');
            notice.className = 'bsms-success';
            notice.textContent = 'Your legal acknowledgments have been saved and verified on your account.';
            success.appendChild(notice);
        }

        renderActions(currentLegal, legalSuccess);
        root.querySelector('#bsms-updates-error').hidden = true;
        updateAcceptButton();
    }

    async function markViewed() {
        if (!currentReleases.length || isSubmitting) return;
        isSubmitting = true;
        const button = overlay?.querySelector('#bsms-updates-actions .bsms-primary');
        if (button) {
            button.disabled = true;
            button.textContent = 'Saving…';
        }

        try {
            await updatesRequest('POST', {
                action: 'mark-viewed',
                versions: currentReleases.map(release => release.version)
            });
            closeOverlay();
        } catch (error) {
            showError(error.message);
            if (button) {
                button.disabled = false;
                button.textContent = 'I’ve read these updates';
            }
        } finally {
            isSubmitting = false;
        }
    }

    function deferUpdates() {
        try {
            sessionStorage.setItem(DEFERRED_KEY, getSessionId());
        } catch {}
        closeOverlay();
    }

    async function submitAcceptance() {
        if (!currentLegal || !currentLegal.needsAcceptance || isSubmitting) return;
        const required = Object.keys(currentLegal.policies || {}).filter(key =>
            currentLegal.policies[key].required
        );
        const accepted = {};
        required.forEach(key => {
            accepted[key] = Boolean(overlay.querySelector('[data-accept="' + key + '"]')?.checked);
        });
        if (!required.every(key => accepted[key])) return;

        isSubmitting = true;
        updateAcceptButton();
        const button = overlay.querySelector('#bsms-legal-accept');
        if (button) button.textContent = 'Saving…';

        try {
            await legalRequest('accept', {
                termsAccepted: accepted.terms === true,
                privacyAccepted: accepted.privacy === true,
                versions: currentLegal.versions
            });

            const refreshed = await updatesRequest('GET');
            if (refreshed.legal?.needsAcceptance) {
                throw new Error('The latest legal status still requires review. Please try again.');
            }
            render(refreshed, true);
        } catch (error) {
            showError(error.message);
            if (error.status === 409) {
                try {
                    const refreshed = await updatesRequest('GET');
                    render(refreshed);
                    showError(error.message);
                } catch {}
            }
        } finally {
            isSubmitting = false;
            updateAcceptButton();
        }
    }

    async function signOutFromPopup() {
        const button = overlay?.querySelector('#bsms-updates-actions .bsms-secondary');
        if (button) {
            button.disabled = true;
            button.textContent = 'Signing Out…';
        }

        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ action: 'logout' }),
                cache: 'no-store'
            });
        } catch (error) {
            console.warn('[BSMS Web :: Updates] Server logout failed; clearing the local session.', error);
        }

        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(AUTH_KEY);
        } catch (error) {
            console.warn('[BSMS Web :: Updates] Could not clear local session storage.', error);
        }

        window.dispatchEvent(new Event('bsms:auth-changed'));
        window.location.replace('/');
    }

    function openDocument(key, force = false) {
        if (!['terms', 'privacy'].includes(key)) return;
        if (!force && (!currentLegal || !currentLegal.policies?.[key]?.required)) return;

        ensureHost();
        if (reviewLayer) reviewLayer.remove();

        const title = key === 'terms' ? 'Terms of Service' : 'Privacy Policy';
        const path = key === 'terms' ? '/terms?embed=1' : '/privacy?embed=1';
        reviewLayer = document.createElement('div');
        reviewLayer.className = 'bsms-review-layer';

        const panel = document.createElement('section');
        panel.className = 'bsms-review-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', title);

        const bar = document.createElement('header');
        bar.className = 'bsms-review-bar';
        const label = document.createElement('span');
        label.textContent = 'Review ' + title;
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'bsms-back';
        back.textContent = 'Back to updates';
        back.addEventListener('click', closeDocument);
        bar.append(label, back);

        const frame = document.createElement('iframe');
        frame.className = 'bsms-frame';
        frame.title = title;
        frame.src = path;
        panel.append(bar, frame);
        reviewLayer.appendChild(panel);
        shadowRoot.appendChild(reviewLayer);
        document.body.style.overflow = 'hidden';
    }

    function closeDocument() {
        if (reviewLayer) {
            reviewLayer.remove();
            reviewLayer = null;
        }
        if (!overlay) {
            document.body.style.overflow = previousBodyOverflow;
            if (overlayHost) overlayHost.remove();
            overlayHost = null;
            shadowRoot = null;
        }
    }

    async function checkUpdates() {
        const session = getSessionId();
        if (!session) {
            currentSessionId = '';
            closeOverlay();
            return;
        }

        if (session !== currentSessionId) {
            currentSessionId = session;
            requestError = '';
        } else if (overlay) {
            return;
        }

        try {
            if (sessionStorage.getItem(DEFERRED_KEY) === session) return;
        } catch {}

        const sequence = ++checkSequence;
        try {
            const data = await updatesRequest('GET');
            if (sequence !== checkSequence || session !== getSessionId()) return;
            requestError = '';
            if (data.legal?.needsAcceptance || (Array.isArray(data.releases) && data.releases.length)) {
                render(data);
            } else {
                closeOverlay();
            }
        } catch (error) {
            if (sequence !== checkSequence) return;
            if (error.status === 401 || error.status === 403) {
                closeOverlay();
                return;
            }
            requestError = error.message;
            console.warn('[BSMS Web :: Updates] Could not check account updates:', error.message);
        }
    }

    window.BSMSLegalUpdates = Object.freeze({
        check: checkUpdates,
        openDocument: key => openDocument(key, true),
        review: key => openDocument(key, true)
    });

    window.addEventListener('bsms:auth-changed', () => {
        currentSessionId = '';
        try { sessionStorage.removeItem(DEFERRED_KEY); } catch {}
        checkUpdates();
    });
    window.addEventListener('storage', event => {
        if (event.key === SESSION_KEY || event.key === AUTH_KEY) {
            currentSessionId = '';
            try { sessionStorage.removeItem(DEFERRED_KEY); } catch {}
            checkUpdates();
        }
    });
    window.addEventListener('focus', checkUpdates);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkUpdates, { once: true });
    } else {
        checkUpdates();
    }
})();
