/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(() => {
    'use strict';

    const SESSION_KEY = 'session_id';
    const EXEMPT_PATHS = new Set(['/terms', '/privacy', '/support']);
    let policyState = null;
    let overlay = null;
    let overlayHost = null;
    let legalShadowRoot = null;
    let reviewLayer = null;
    let previousBodyOverflow = '';
    let isSubmitting = false;
    let acceptanceSucceeded = false;
    let statusCheckSequence = 0;

    const rawPath = window.location.pathname;
    const currentPath = (rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath) || '/';
    if (EXEMPT_PATHS.has(currentPath) || new URLSearchParams(window.location.search).get('embed') === '1') return;

    function sessionId() {
        try {
            const auth = JSON.parse(localStorage.getItem('bsms_auth_session') || 'null');
            if (!auth || auth.loggedIn !== true) return '';
            return localStorage.getItem(SESSION_KEY) || auth.sessionId || '';
        } catch {
            return '';
        }
    }

    function requestHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId()
        };
    }

    async function apiRequest(action, body = {}) {
        const response = await fetch('/api/legal', {
            method: 'POST',
            headers: requestHeaders(),
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

    function ensureStyles() {
        if (legalShadowRoot) return;
        overlayHost = document.createElement('div');
        overlayHost.id = 'bsms-legal-updates-host';
        overlayHost.style.cssText = 'position:fixed;inset:0;z-index:100000;pointer-events:none;';
        legalShadowRoot = overlayHost.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `:host{font-family:'Patrick Hand',cursive;color:#fff;color-scheme:dark}*,*::before,*::after{box-sizing:border-box}button,input{font:inherit}
.bsms-legal-backdrop{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.86);backdrop-filter:blur(0);pointer-events:auto;animation:bsmsLegalBackdropIn .32s ease forwards}
.bsms-legal-dialog{width:min(620px,94vw);max-height:min(90vh,860px);overflow-y:auto;background:#000;border:2px solid #BB001E;border-radius:20px;padding:26px 24px 20px;color:#fff;box-shadow:0 10px 40px rgba(0,0,0,.55);animation:bsmsLegalPopIn .48s cubic-bezier(.2,.85,.25,1.15) both;transform-origin:50% 60%}
@keyframes bsmsLegalBackdropIn{from{opacity:0;backdrop-filter:blur(0)}to{opacity:1;backdrop-filter:blur(7px)}}
@keyframes bsmsLegalPopIn{0%{opacity:0;transform:scale(.88) translateY(24px)}70%{opacity:1;transform:scale(1.015) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
.bsms-legal-eyebrow{display:flex;align-items:center;gap:8px;color:#ff5369;font-size:16px;font-weight:700}
.bsms-legal-dialog h2{font-family:'Patrick Hand',cursive!important;font-size:32px;line-height:1.1;margin:9px 0 8px;color:#fff!important;text-shadow:none!important}
.bsms-legal-intro{font-size:18px;line-height:1.4;color:rgba(255,255,255,.68);margin:0 0 15px}
.bsms-legal-policy{padding:14px 15px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.13);border-radius:13px;margin-top:11px;animation:bsmsLegalCardIn .42s cubic-bezier(.2,.75,.25,1) both;transition:background .22s ease,border-color .22s ease,transform .22s ease}
.bsms-legal-policy:nth-child(2){animation-delay:.09s}
.bsms-legal-policy:hover{background:rgba(255,255,255,.075);border-color:rgba(255,255,255,.25);transform:translateY(-2px)}
@keyframes bsmsLegalCardIn{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:translateY(0)}}
.bsms-legal-policy-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.bsms-legal-policy-title{font-size:20px;font-weight:700;color:#fff}
.bsms-legal-state{font-size:13px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(187,0,30,.17);color:#ff7b8e;border:1px solid rgba(187,0,30,.45)}
.bsms-legal-state.is-current{background:rgba(255,255,255,.07);color:rgba(255,255,255,.48);border-color:rgba(255,255,255,.12)}
.bsms-legal-review{width:100%;min-height:40px;border-radius:11px;border:2px solid #BB001E;background:#BB001E;color:#fff;font-size:18px;font-weight:700;cursor:pointer;transition:background .2s ease,border-color .2s ease,transform .2s ease,box-shadow .2s ease}.bsms-legal-review:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 5px 16px rgba(187,0,30,.24)}
.bsms-legal-review:hover:not(:disabled),.bsms-legal-accept:hover:not(:disabled){background:#d10022;border-color:#d10022}
.bsms-legal-review:disabled{opacity:.38;cursor:not-allowed;background:transparent;border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.45)}
.bsms-legal-check{display:flex;align-items:flex-start;gap:9px;margin-top:11px;color:#fff;font-size:17px;line-height:1.3;cursor:pointer}
.bsms-legal-check input{appearance:auto;width:17px;height:17px;flex:0 0 17px;margin:3px 0 0;accent-color:#BB001E;cursor:pointer;transition:transform .18s ease}.bsms-legal-check input:checked{transform:scale(1.12)}
.bsms-legal-check.is-disabled{color:rgba(255,255,255,.4)}
.bsms-legal-note{font-size:14px;color:rgba(255,255,255,.48);line-height:1.35;margin:7px 0 0}
.bsms-legal-actions{display:grid;gap:9px;margin-top:17px}
.bsms-legal-accept{min-height:46px;border:2px solid #BB001E;border-radius:12px;background:#BB001E;color:#fff;font-size:21px;font-weight:700;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,background .2s ease,opacity .2s ease}.bsms-legal-accept:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 7px 20px rgba(187,0,30,.28)}
.bsms-legal-accept:disabled{opacity:.45;cursor:not-allowed}
.bsms-legal-signout{min-height:42px;border:2px solid rgba(255,255,255,.22);border-radius:12px;background:transparent;color:rgba(255,255,255,.88);font-size:19px;cursor:pointer}.bsms-legal-signout:hover:not(:disabled){border-color:#BB001E;background:rgba(187,0,30,.12);transform:translateY(-1px)}.bsms-legal-signout:disabled{opacity:.5;cursor:wait}
.bsms-legal-support{min-height:40px;border:2px solid rgba(255,255,255,.15);border-radius:12px;background:transparent;color:#fff;font-size:19px;cursor:pointer;transition:border-color .2s ease,background .2s ease,transform .2s ease}.bsms-legal-support:hover{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.06);transform:translateY(-1px)}
.bsms-legal-error{color:#ff6678;font-size:16px;margin:10px 0 0}
.bsms-legal-footer{color:rgba(255,255,255,.42);font-size:13px;text-align:center;margin:12px 0 0}
.bsms-legal-success{min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px 8px;animation:bsmsLegalSuccessIn .5s cubic-bezier(.2,.8,.25,1) both}
@keyframes bsmsLegalSuccessIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.bsms-legal-success-mark{width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:rgba(34,197,94,.13);border:2px solid #22c55e;color:#4ade80;box-shadow:0 0 0 0 rgba(34,197,94,.3);animation:bsmsLegalCheckPulse 1.1s ease .2s both}
.bsms-legal-success-mark svg{width:48px;height:48px;stroke:currentColor;stroke-width:3.5;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:70;stroke-dashoffset:70;animation:bsmsLegalDrawCheck .55s ease .38s forwards}
@keyframes bsmsLegalCheckPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.35)}100%{box-shadow:0 0 0 18px rgba(34,197,94,0)}}
@keyframes bsmsLegalDrawCheck{to{stroke-dashoffset:0}}
.bsms-legal-success h2{margin:23px 0 8px!important;font-size:36px!important;color:#fff!important}
.bsms-legal-success p{max-width:420px;margin:0 0 24px;color:rgba(255,255,255,.68);font-size:19px;line-height:1.4}
.bsms-legal-continue{width:100%;max-width:390px;min-height:49px;border:2px solid #22c55e;border-radius:12px;background:#16a34a;color:#fff;font-size:21px;font-weight:700;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
.bsms-legal-continue:hover{transform:translateY(-2px);background:#15803d;box-shadow:0 8px 22px rgba(34,197,94,.22)}
.bsms-legal-review-layer{position:fixed;inset:0;z-index:2;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:clamp(8px,2vw,24px);pointer-events:auto;animation:bsmsLegalBackdropIn .24s ease both}
.bsms-legal-review-panel{width:min(1050px,100%);height:min(900px,94vh);display:flex;flex-direction:column;overflow:hidden;border:2px solid #BB001E;border-radius:20px;background:#000;animation:bsmsLegalPopIn .34s cubic-bezier(.2,.8,.25,1) both}
.bsms-legal-review-bar{height:58px;flex:0 0 58px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid rgba(255,255,255,.13);color:#fff;font-size:20px;font-weight:700}
.bsms-legal-back{border:2px solid rgba(255,255,255,.15);background:transparent;color:#fff;border-radius:10px;padding:6px 12px;font-size:17px;cursor:pointer;transition:background .2s ease,border-color .2s ease,transform .2s ease}.bsms-legal-back:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.35);transform:translateY(-1px)}
.bsms-legal-frame{width:100%;height:100%;border:0;background:#000}
@media(max-width:600px){.bsms-legal-backdrop{padding:10px;align-items:flex-end}.bsms-legal-dialog{border-radius:20px 20px 14px 14px;max-height:94vh;padding:23px 18px 17px}.bsms-legal-dialog h2{font-size:29px}.bsms-legal-policy{padding:12px}.bsms-legal-review-layer{padding:0}.bsms-legal-review-panel{height:100%;border-radius:0;border:0}.bsms-legal-review-bar{height:54px;flex-basis:54px;padding:0 12px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
        legalShadowRoot.appendChild(style);
        document.body.appendChild(overlayHost);
    }

    function createOverlay() {
        if (overlay) return overlay;
        ensureStyles();
        overlay = document.createElement('div');
        overlay.className = 'bsms-legal-backdrop';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'bsms-legal-title');
        overlay.innerHTML = `
            <section class="bsms-legal-dialog">
                <div class="bsms-legal-eyebrow"><span aria-hidden="true">●</span> ACTION REQUIRED</div>
                <h2 id="bsms-legal-title">Updates to Terms and Privacy Policy</h2>
                <p class="bsms-legal-intro">We've updated our legal documents. Please review and confirm each document that requires acknowledgment before continuing to use protected BSMS Web features.</p>
                <div id="bsms-legal-policy-list"></div>
                <p id="bsms-legal-error" class="bsms-legal-error" role="alert" hidden></p>
                <div class="bsms-legal-actions">
                    <button type="button" id="bsms-legal-accept" class="bsms-legal-accept" disabled>Accept updates and continue</button>
                    <button type="button" id="bsms-legal-signout" class="bsms-legal-signout">Sign Out</button>
                    <button type="button" id="bsms-legal-support" class="bsms-legal-support">Contact Support</button>
                </div>
                <p class="bsms-legal-footer">Your acceptance is securely associated with your account. You can review either document again before confirming.</p>
            </section>`;
        legalShadowRoot.appendChild(overlay);
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        overlay.querySelector('#bsms-legal-support').addEventListener('click', () => {
            window.location.href = '/support';
        });
        overlay.querySelector('#bsms-legal-accept').addEventListener('click', submitAcceptance);
        overlay.querySelector('#bsms-legal-signout').addEventListener('click', signOutFromPopup);
        return overlay;
    }

    function policyCard(key, title, url, policy) {
        const required = policy.required;
        const first = policy.firstAcknowledgment;
        const statusText = required ? (policy.updated ? 'Updated' : 'Acknowledgment required') : 'Not updated';
        const checkboxText = key === 'terms'
            ? (policy.updated ? 'I agree to the updated Terms of Service.' : 'I agree to the current Terms of Service.')
            : (policy.updated ? 'I agree to the updated Privacy Policy.' : 'I acknowledge the current Privacy Policy.');
        const note = required
            ? (first ? 'This account does not yet have a recorded acknowledgment for this document.' : 'This document has changed since your previous acknowledgment.')
            : 'This document has not changed since your last acknowledgment.';
        const disabledClass = required ? '' : ' is-disabled';
        return `
            <section class="bsms-legal-policy" data-policy="${key}">
                <div class="bsms-legal-policy-head">
                    <span class="bsms-legal-policy-title">${title}</span>
                    <span class="bsms-legal-state ${required ? '' : 'is-current'}">${statusText}</span>
                </div>
                <button type="button" class="bsms-legal-review" data-review="${key}" ${required ? '' : 'disabled'}>▤ <span>Review ${title}</span></button>
                <label class="bsms-legal-check${disabledClass}">
                    <input type="checkbox" data-accept="${key}" ${required ? '' : 'disabled'}>
                    <span>${checkboxText}</span>
                </label>
                <p class="bsms-legal-note">${note}</p>
            </section>`;
    }

    function renderStatus(data) {
        if (overlay && policyState && JSON.stringify(policyState.policies) === JSON.stringify(data.policies)) return;
        policyState = data;
        const root = createOverlay();
        const list = root.querySelector('#bsms-legal-policy-list');
        list.innerHTML =
            policyCard('terms', 'Terms of Service', '/terms?embed=1', data.policies.terms) +
            policyCard('privacy', 'Privacy Policy', '/privacy?embed=1', data.policies.privacy);

        root.querySelectorAll('[data-review]').forEach(button => {
            button.addEventListener('click', () => openDocument(button.dataset.review));
        });
        root.querySelectorAll('[data-accept]').forEach(input => {
            input.addEventListener('change', updateAcceptButton);
        });
        updateAcceptButton();
        root.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function updateAcceptButton() {
        if (!overlay || !policyState) return;
        const required = ['terms', 'privacy'].filter(key => policyState.policies[key].required);
        const checked = required.every(key => overlay.querySelector('[data-accept="' + key + '"]')?.checked);
        const button = overlay.querySelector('#bsms-legal-accept');
        if (button) button.disabled = !checked || isSubmitting;
    }

    function openDocument(key, force = false) {
        if (!['terms', 'privacy'].includes(key)) return;
        ensureStyles();
        if (!force && (!policyState || !policyState.policies[key]?.required)) return;
        if (reviewLayer) reviewLayer.remove();
        const title = key === 'terms' ? 'Terms of Service' : 'Privacy Policy';
        const path = key === 'terms' ? '/terms?embed=1' : '/privacy?embed=1';
        reviewLayer = document.createElement('div');
        reviewLayer.className = 'bsms-legal-review-layer';
        document.body.style.overflow = 'hidden';
        reviewLayer.innerHTML = `
            <section class="bsms-legal-review-panel" role="dialog" aria-modal="true" aria-label="${title}">
                <header class="bsms-legal-review-bar">
                    <span>Review ${title}</span>
                    <button type="button" class="bsms-legal-back">← Back to updates</button>
                </header>
                <iframe class="bsms-legal-frame" title="${title}" src="${path}"></iframe>
            </section>`;
        legalShadowRoot.appendChild(reviewLayer);
        reviewLayer.querySelector('.bsms-legal-back').addEventListener('click', closeDocument);
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
            legalShadowRoot = null;
        }
    }

    async function signOutFromPopup() {
        const signOutButton = overlay?.querySelector('#bsms-legal-signout');
        if (signOutButton) {
            signOutButton.disabled = true;
            signOutButton.textContent = 'Signing Out…';
        }

        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: requestHeaders(),
                body: JSON.stringify({ action: 'logout' }),
                cache: 'no-store'
            });
        } catch (error) {
            console.warn('[BSMS Web :: Legal] Server logout failed; clearing the local session.', error);
        }

        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem('bsms_auth_session');
        } catch (error) {
            console.warn('[BSMS Web :: Legal] Could not clear local session storage.', error);
        }

        window.dispatchEvent(new Event('bsms:auth-changed'));
        window.location.replace('/');
    }

    function showAcceptanceSuccess() {
        if (!overlay) return;
        acceptanceSucceeded = true;
        statusCheckSequence += 1;
        const dialog = overlay.querySelector('.bsms-legal-dialog');
        if (!dialog) return;

        dialog.innerHTML = `
            <section class="bsms-legal-success" role="status" aria-live="polite">
                <div class="bsms-legal-success-mark" aria-hidden="true">
                    <svg viewBox="0 0 48 48"><path d="M10 25.5 20 35 39 14"/></svg>
                </div>
                <h2>You're all set!</h2>
                <p>Your Terms of Service and Privacy Policy acknowledgments have been saved successfully.</p>
                <button type="button" class="bsms-legal-continue">Continue to BSMS Web</button>
            </section>`;
        dialog.querySelector('.bsms-legal-continue').addEventListener('click', () => {
            if (overlay) overlay.remove();
            overlay = null;
            policyState = null;
            if (overlayHost) overlayHost.remove();
            overlayHost = null;
            legalShadowRoot = null;
            document.body.style.overflow = previousBodyOverflow;
            window.dispatchEvent(new CustomEvent('bsms:legal-accepted'));
            window.location.reload();
        });
    }

    async function submitAcceptance() {
        if (!policyState || isSubmitting) return;
        const termsRequired = policyState.policies.terms.required;
        const privacyRequired = policyState.policies.privacy.required;
        const termsAccepted = !termsRequired || Boolean(overlay.querySelector('[data-accept="terms"]')?.checked);
        const privacyAccepted = !privacyRequired || Boolean(overlay.querySelector('[data-accept="privacy"]')?.checked);
        if (!termsAccepted || !privacyAccepted) return;

        isSubmitting = true;
        statusCheckSequence += 1;
        updateAcceptButton();
        const error = overlay.querySelector('#bsms-legal-error');
        error.hidden = true;

        try {
            const result = await apiRequest('accept', {
                termsAccepted,
                privacyAccepted,
                versions: policyState.versions
            });
            if (result.needsAcceptance) {
                throw new Error('Your acknowledgments were saved, but the latest policy status still requires review. Please try again.');
            }
            try { localStorage.setItem('bsms_legal_accepted_at', String(Date.now())); } catch {}
            showAcceptanceSuccess();
        } catch (err) {
            error.textContent = err.message || 'Your acceptance could not be saved. Please try again.';
            error.hidden = false;
            if (err.status === 409) {
                isSubmitting = false;
                await checkPolicies();
            }
        } finally {
            isSubmitting = false;
            updateAcceptButton();
        }
    }

    async function checkPolicies() {
        if (acceptanceSucceeded || isSubmitting) return;
        const checkSequence = ++statusCheckSequence;
        if (!sessionId()) {
            closeDocument();
            if (overlay) {
                overlay.remove();
                overlay = null;
                policyState = null;
                document.body.style.overflow = previousBodyOverflow;
                if (overlayHost) overlayHost.remove();
            overlayHost = null;
            legalShadowRoot = null;
            }
            return;
        }
        try {
            const data = await apiRequest('status');
            if (checkSequence !== statusCheckSequence || acceptanceSucceeded) return;
            if (data.needsAcceptance) renderStatus(data);
            else if (overlay) {
                closeDocument();
                overlay.remove();
                overlay = null;
                policyState = null;
                document.body.style.overflow = previousBodyOverflow;
            if (overlayHost) overlayHost.remove();
            overlayHost = null;
            legalShadowRoot = null;
            }
        } catch (error) {
            if (error.status === 401) return;
            console.warn('[BSMS Web :: Legal] Could not check policy status:', error.message);
        }
    }

    window.BSMSLegalUpdates = Object.freeze({
        check: checkPolicies,
        openDocument: key => {
            if (!policyState) {
                checkPolicies().then(() => openDocument(key, true));
                return;
            }
            openDocument(key, true);
        },
        review: key => openDocument(key, true)
    });

    window.addEventListener('bsms:auth-changed', checkPolicies);
    window.addEventListener('storage', event => {
        if (event.key === SESSION_KEY || event.key === 'bsms_auth_session' || event.key === 'bsms_legal_accepted_at') checkPolicies();
    });
    window.addEventListener('focus', () => {
        if (sessionId()) checkPolicies();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkPolicies, { once: true });
    } else {
        checkPolicies();
    }
})();
