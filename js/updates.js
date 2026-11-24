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
        const response = await fetch('/api/updates', {
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
            ':host{font-family:var(--bsms-font-body,\'Patrick Hand\',cursive);color:var(--bsms-fg,#fff);color-scheme:dark;--bsms-fg:#f4f4f5;--bsms-fg2:rgba(244,244,245,.66);--bsms-panel:rgba(22,22,25,.98);--bsms-border:rgba(255,255,255,.13);--bsms-red:#BB001E;}',
            '*,*::before,*::after{box-sizing:border-box}',
            'button,input{font:inherit}',
            '.bsms-backdrop{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(0,0,0,.72);backdrop-filter:blur(18px);pointer-events:auto;animation:bsmsFade .22s ease both}',
            '.bsms-dialog{width:min(690px,96vw);max-height:min(90vh,900px);overflow:auto;padding:26px;border:1px solid var(--bsms-border);border-radius:20px;background:var(--bsms-panel);box-shadow:0 24px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.06);animation:bsmsPop .34s cubic-bezier(.2,.8,.2,1) both}',
            '@keyframes bsmsFade{from{opacity:0}to{opacity:1}}',
            '@keyframes bsmsPop{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}',
            '.bsms-eyebrow{display:flex;align-items:center;gap:9px;color:#ff6b81;font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}',
            '.bsms-eyebrow-mark{width:8px;height:8px;border-radius:50%;background:#BB001E;box-shadow:0 0 16px rgba(187,0,30,.75)}',
            '.bsms-title{margin:10px 0 5px;color:var(--bsms-fg);font-size:clamp(25px,4vw,32px);font-weight:750;letter-spacing:-.035em;line-height:1.1}',
            '.bsms-subtitle{margin:0 0 20px;color:var(--bsms-fg2);font-size:14px;line-height:1.55}',
            '.bsms-section{margin-top:20px}',
            '.bsms-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;color:var(--bsms-fg);font-size:15px;font-weight:750}',
            '.bsms-count{color:rgba(255,255,255,.48);font-size:12px;font-weight:600}',
            '.bsms-release{padding:15px 16px;margin-top:10px;border:1px solid var(--bsms-border);border-radius:14px;background:rgba(255,255,255,.035)}',
            '.bsms-release-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}',
            '.bsms-release-version{margin:0;color:var(--bsms-fg);font-size:17px;font-weight:750;letter-spacing:-.02em}',
            '.bsms-new-pill{padding:4px 8px;border:1px solid rgba(187,0,30,.4);border-radius:999px;background:rgba(187,0,30,.13);color:#ff8b9b;font-size:10px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}',
            '.bsms-release-list{display:grid;gap:7px;margin:0;padding:0 0 0 17px;color:rgba(239,240,248,.78);font-size:13px;line-height:1.5}',
            '.bsms-release-list li::marker{color:#ff6b81}',
            '.bsms-release-link{display:inline-flex;margin-top:11px;color:#ff8b9b;font-size:12px;font-weight:650;text-decoration:none}',
            '.bsms-release-link:hover{text-decoration:underline}',
            '.bsms-release-markdown{color:var(--bsms-fg2);font-size:13px;line-height:1.65;overflow-wrap:anywhere}',
            '.bsms-release-markdown h1,.bsms-release-markdown h2,.bsms-release-markdown h3{color:#fff;line-height:1.25;margin:13px 0 7px;font-weight:750}',
            '.bsms-release-markdown h1{font-size:19px}.bsms-release-markdown h2{font-size:16px}.bsms-release-markdown h3{font-size:14px}',
            '.bsms-release-markdown p{margin:7px 0}.bsms-release-markdown ul,.bsms-release-markdown ol{padding-left:21px;margin:8px 0;display:grid;gap:5px}',
            '.bsms-release-markdown a{color:#ff657c;text-decoration:underline;text-underline-offset:3px}',
            '.bsms-release-markdown blockquote{margin:9px 0;padding:7px 12px;border-left:3px solid var(--bsms-red);color:var(--bsms-fg2);background:rgba(255,255,255,.035)}',
            '.bsms-release-markdown code{padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.09);font-family:ui-monospace,SFMono-Regular,monospace;font-size:.92em}',
            '.bsms-release-date{color:var(--bsms-fg2);font-size:10px;font-weight:600}',
            '.bsms-github-link{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:37px;margin-top:13px;padding:0 12px;border:1px solid var(--bsms-border);border-radius:10px;background:rgba(255,255,255,.055);color:var(--bsms-fg);font-size:11px;font-weight:700;text-decoration:none;transition:background .16s ease,border-color .16s ease,transform .16s ease}',
            '.bsms-github-link:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.3);transform:translateY(-1px)}',
            '.bsms-github-link svg{width:16px;height:16px;flex:0 0 16px;fill:currentColor}',
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
            '</section>';
        shadowRoot.appendChild(overlay);
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return overlay;
    }

    function closeOverlay() {
        if (!overlayHost && !overlay) return;
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

    function escapeMarkdownHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMarkdownInline(value) {
        return escapeMarkdownHTML(value)
            .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>')
            .replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/~~(.+?)~~/g, '<del>$1</del>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/_([^_]+)_/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    function markdownToHTML(source) {
        const lines = String(source || '').replace(/\r/g, '').split('\n');
        const output = [];
        let paragraph = [];
        let listType = '';

        function flushParagraph() {
            if (paragraph.length) {
                output.push('<p>' + paragraph.map(formatMarkdownInline).join('<br>') + '</p>');
                paragraph = [];
            }
        }

        function closeList() {
            if (listType) {
                output.push('</' + listType + '>');
                listType = '';
            }
        }

        for (const line of lines) {
            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            const unordered = line.match(/^\s*[-*]\s+(.+)$/);
            const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
            const quote = line.match(/^\s*>\s?(.+)$/);

            if (!line.trim()) {
                flushParagraph();
                closeList();
                continue;
            }

            if (heading) {
                flushParagraph();
                closeList();
                const level = heading[1].length;
                output.push('<h' + level + '>' + formatMarkdownInline(heading[2]) + '</h' + level + '>');
                continue;
            }

            if (unordered || ordered) {
                flushParagraph();
                const nextType = unordered ? 'ul' : 'ol';
                if (listType !== nextType) {
                    closeList();
                    listType = nextType;
                    output.push('<' + listType + '>');
                }
                output.push('<li>' + formatMarkdownInline((unordered || ordered)[1]) + '</li>');
                continue;
            }

            if (quote) {
                flushParagraph();
                closeList();
                output.push('<blockquote>' + formatMarkdownInline(quote[1]) + '</blockquote>');
                continue;
            }

            closeList();
            paragraph.push(line);
        }

        flushParagraph();
        closeList();
        return output.join('');
    }

    function addReleaseCards(releases) {
        const container = overlay.querySelector('#bsms-release-section');
        container.replaceChildren();
        if (!releases.length) return;

        releases.forEach(release => {
            const card = document.createElement('article');
            card.className = 'bsms-release';

            const cardHead = document.createElement('div');
            cardHead.className = 'bsms-release-head';
            const version = document.createElement('h3');
            version.className = 'bsms-release-version';
            version.textContent = release.version || 'Website update';
            const pill = document.createElement('span');
            pill.className = 'bsms-new-pill';
            pill.textContent = 'New';
            cardHead.append(version, pill);
            card.appendChild(cardHead);

            const shownDate = release.releaseDate || release.publishedAt;
            if (Number(shownDate) > 0) {
                const date = document.createElement('div');
                date.className = 'bsms-release-date';
                date.textContent = new Date(Number(shownDate)).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
                card.appendChild(date);
            }

            const content = document.createElement('div');
            content.className = 'bsms-release-markdown';
            content.innerHTML = markdownToHTML(release.content || '');
            card.appendChild(content);

            if (typeof release.detailsUrl === 'string' &&
                release.detailsUrl.startsWith('https://github.com/BSMS-Web-App/web/releases/tag/')) {
                const link = document.createElement('a');
                link.className = 'bsms-github-link';
                link.href = release.detailsUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.02c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.07-.73.08-.72.08-.72 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.76 1.28 3.43.98.11-.76.41-1.28.75-1.57-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.47.11-3.06 0 0 .98-.31 3.2 1.18a11.1 11.1 0 0 1 5.82 0c2.22-1.49 3.2-1.18 3.2-1.18.63 1.59.23 2.77.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.43-2.69 5.4-5.25 5.69.41.35.78 1.04.78 2.1v3.12c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg><span>View full release notes on GitHub</span>';
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
            viewed.textContent = 'Got it';
            viewed.addEventListener('click', markViewed);
            actions.appendChild(viewed);

            return;
        }

        if (successMessage) {
            const done = document.createElement('button');
            done.type = 'button';
            done.className = 'bsms-primary';
            done.textContent = 'Continue to BSMS Web';
            done.addEventListener('click', async () => {
                if (isSubmitting) return;
                isSubmitting = true;
                done.disabled = true;
                done.textContent = 'Checking…';
                try {
                    const refreshed = await updatesRequest('GET');
                    if (!refreshed.legal?.needsAcceptance) {
                        window.dispatchEvent(new CustomEvent('bsms:legal-accepted'));
                    }
                    render(refreshed);
                } catch (error) {
                    showError(error.message);
                    done.disabled = false;
                    done.textContent = 'Continue to BSMS Web';
                } finally {
                    isSubmitting = false;
                    updateAcceptButton();
                }
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
            for (let index = 0; index < currentReleases.length; index += 100) {
                const batch = currentReleases.slice(index, index + 100);
                await updatesRequest('POST', {
                    action: 'mark-viewed',
                    ids: batch.map(release => ({
                        id: release.id,
                        revision: Number(release.revision) || 1
                    }))
                });
            }
            // Re-check after saving: another release or policy may have been
            // published while this popup was open.
            const refreshed = await updatesRequest('GET');
            render(refreshed);
        } catch (error) {
            if (error.status === 409 && error.data?.code === 'UPDATES_CHANGED') {
                try {
                    const refreshed = await updatesRequest('GET');
                    render(refreshed);
                    if (overlay) showError('A release changed while this popup was open. Review the latest version, then select Got it again.');
                    return;
                } catch (refreshError) {
                    showError(refreshError.message);
                }
            } else {
                showError(error.message);
            }
            if (button?.isConnected) {
                button.disabled = false;
                button.textContent = 'Got it';
            }
        } finally {
            isSubmitting = false;
            updateAcceptButton();
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
                render(refreshed);
                showError('A policy changed while your acknowledgments were being saved. Review the latest version before continuing.');
                return;
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
        const documentContent = currentLegal?.documents?.[key]?.content || '';
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

        const documentBody = document.createElement('div');
        documentBody.className = 'bsms-review-content bsms-release-markdown';
        documentBody.style.cssText = 'overflow:auto;padding:22px 26px;color:var(--bsms-fg2);line-height:1.7;';
        documentBody.innerHTML = documentContent ? markdownToHTML(documentContent) : '<p>This policy has not yet been republished in the editable policy system. The currently published page remains available at <a href="' + (key === 'terms' ? '/terms' : '/privacy') + '" target="_blank" rel="noopener noreferrer">the policy page</a>.</p>';
        panel.append(bar, documentBody);
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

        let releasesDeferred = false;
        try {
            releasesDeferred = sessionStorage.getItem(DEFERRED_KEY) === session;
        } catch {}

        const sequence = ++checkSequence;
        try {
            const data = await updatesRequest('GET');
            if (sequence !== checkSequence || session !== getSessionId()) return;
            requestError = '';
            // A deferred release announcement must never suppress mandatory
            // legal acknowledgments for a newly published policy version.
            if (data.legal?.needsAcceptance || (!releasesDeferred && Array.isArray(data.releases) && data.releases.length)) {
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

    const updatesPublicAPI = Object.freeze({
        check: checkUpdates,
        openDocument: key => openDocument(key, true),
        review: key => openDocument(key, true)
    });
    window.BSMSUpdates = updatesPublicAPI;
    window.BSMSLegalUpdates = updatesPublicAPI;

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
