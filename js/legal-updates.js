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
    let reviewLayer = null;
    let isSubmitting = false;

    const currentPath = window.location.pathname.replace(/\\/$/, '') || '/';
    if (EXEMPT_PATHS.has(currentPath) || new URLSearchParams(window.location.search).get('embed') === '1') return;

    function sessionId() {
        return localStorage.getItem(SESSION_KEY) || '';
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
        if (document.getElementById('bsms-legal-updates-styles')) return;
        const style = document.createElement('style');
        style.id = 'bsms-legal-updates-styles';
        style.textContent = `
            .bsms-legal-backdrop{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(3,5,10,.78);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
            .bsms-legal-dialog{width:min(620px,100%);max-height:min(92vh,900px);overflow:auto;background:linear-gradient(145deg,rgba(30,35,49,.98),rgba(13,17,27,.99));border:1px solid rgba(255,255,255,.13);border-radius:25px;padding:clamp(20px,4vw,32px);color:#f5f6fa;box-shadow:0 30px 100px rgba(0,0,0,.55);font-family:inherit}
            .bsms-legal-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#ffb6c0;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
            .bsms-legal-dialog h2{font-size:clamp(24px,4vw,32px);line-height:1.15;margin:12px 0;color:#fff}
            .bsms-legal-intro{color:#b9c1d0;line-height:1.6;margin:0 0 20px;font-size:14px}
            .bsms-legal-policy{padding:17px;background:rgba(5,8,15,.55);border:1px solid rgba(255,255,255,.09);border-radius:17px;margin-top:12px}
            .bsms-legal-policy-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
            .bsms-legal-policy-title{font-size:15px;font-weight:750;color:#fff}
            .bsms-legal-state{font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;padding:5px 8px;border-radius:999px;background:rgba(187,0,30,.16);color:#ffb6c0;border:1px solid rgba(255,80,100,.2)}
            .bsms-legal-state.is-current{background:rgba(130,145,170,.12);color:#aab3c4;border-color:rgba(160,170,190,.15)}
            .bsms-legal-review{width:100%;display:flex;justify-content:center;align-items:center;gap:9px;min-height:42px;border-radius:11px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.045);color:#f3f4f8;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background .18s,border-color .18s,transform .18s}
            .bsms-legal-review:hover:not(:disabled){background:rgba(187,0,30,.17);border-color:rgba(255,90,110,.4);transform:translateY(-1px)}
            .bsms-legal-review:disabled{opacity:.35;cursor:not-allowed}
            .bsms-legal-check{display:flex;align-items:flex-start;gap:10px;margin-top:13px;color:#e5e8ef;font-size:13px;line-height:1.45;cursor:pointer}
            .bsms-legal-check input{width:17px;height:17px;flex:0 0 17px;margin:1px 0 0;accent-color:#BB001E}
            .bsms-legal-check.is-disabled{color:#778195;cursor:not-allowed}
            .bsms-legal-note{font-size:11px;color:#8d98aa;line-height:1.45;margin:9px 0 0}
            .bsms-legal-actions{display:grid;gap:10px;margin-top:20px}
            .bsms-legal-accept{min-height:47px;border:0;border-radius:12px;background:linear-gradient(135deg,#d20a2e,#9f001c);color:#fff;font:inherit;font-weight:800;cursor:pointer;box-shadow:0 8px 25px rgba(187,0,30,.2)}
            .bsms-legal-accept:disabled{opacity:.38;cursor:not-allowed;box-shadow:none}
            .bsms-legal-support{min-height:42px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:transparent;color:#c4ccda;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
            .bsms-legal-error{color:#ff9ba8;font-size:12px;line-height:1.45;margin:12px 0 0}
            .bsms-legal-footer{color:#7e899c;font-size:10px;line-height:1.5;text-align:center;margin:15px 0 0}
            .bsms-legal-review-layer{position:fixed;inset:0;z-index:100001;background:rgba(3,5,10,.9);display:flex;align-items:center;justify-content:center;padding:clamp(8px,2vw,24px)}
            .bsms-legal-review-panel{width:min(1050px,100%);height:min(900px,94vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:20px;background:#101521;box-shadow:0 30px 100px rgba(0,0,0,.6)}
            .bsms-legal-review-bar{height:58px;flex:0 0 58px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid rgba(255,255,255,.1);color:#fff;font-size:14px;font-weight:750}
            .bsms-legal-back{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e8ebf2;border-radius:9px;padding:8px 12px;font:inherit;font-size:12px;cursor:pointer}
            .bsms-legal-frame{width:100%;height:100%;border:0;background:#101521}
            body.bsms-legal-open{overflow:hidden}
            @media(max-width:600px){.bsms-legal-backdrop{padding:10px;align-items:flex-end}.bsms-legal-dialog{border-radius:22px 22px 14px 14px;max-height:94vh}.bsms-legal-review-layer{padding:0}.bsms-legal-review-panel{height:100%;border-radius:0;border:0}.bsms-legal-review-bar{height:54px;flex-basis:54px}}
        `;
        document.head.appendChild(style);
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
                    <button type="button" id="bsms-legal-support" class="bsms-legal-support">Contact Support</button>
                </div>
                <p class="bsms-legal-footer">Your acceptance is securely associated with your account. You can review either document again before confirming.</p>
            </section>`;
        document.body.appendChild(overlay);
        document.body.classList.add('bsms-legal-open');
        overlay.querySelector('#bsms-legal-support').addEventListener('click', () => {
            window.location.href = '/support';
        });
        overlay.querySelector('#bsms-legal-accept').addEventListener('click', submitAcceptance);
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
        document.body.classList.add('bsms-legal-open');
    }

    function updateAcceptButton() {
        if (!overlay || !policyState) return;
        const required = ['terms', 'privacy'].filter(key => policyState.policies[key].required);
        const checked = required.every(key => overlay.querySelector('[data-accept="' + key + '"]')?.checked);
        const button = overlay.querySelector('#bsms-legal-accept');
        button.disabled = !checked || isSubmitting;
    }

    function openDocument(key, force = false) {
        if (!['terms', 'privacy'].includes(key)) return;
        if (!force && (!policyState || !policyState.policies[key]?.required)) return;
        if (reviewLayer) reviewLayer.remove();
        const title = key === 'terms' ? 'Terms of Service' : 'Privacy Policy';
        const path = key === 'terms' ? '/terms?embed=1' : '/privacy?embed=1';
        reviewLayer = document.createElement('div');
        reviewLayer.className = 'bsms-legal-review-layer';
        reviewLayer.innerHTML = `
            <section class="bsms-legal-review-panel" role="dialog" aria-modal="true" aria-label="${title}">
                <header class="bsms-legal-review-bar">
                    <span>Review ${title}</span>
                    <button type="button" class="bsms-legal-back">← Back to updates</button>
                </header>
                <iframe class="bsms-legal-frame" title="${title}" src="${path}"></iframe>
            </section>`;
        document.body.appendChild(reviewLayer);
        reviewLayer.querySelector('.bsms-legal-back').addEventListener('click', closeDocument);
    }

    function closeDocument() {
        if (reviewLayer) {
            reviewLayer.remove();
            reviewLayer = null;
        }
    }

    async function submitAcceptance() {
        if (!policyState || isSubmitting) return;
        const termsRequired = policyState.policies.terms.required;
        const privacyRequired = policyState.policies.privacy.required;
        const termsAccepted = !termsRequired || Boolean(overlay.querySelector('[data-accept="terms"]')?.checked);
        const privacyAccepted = !privacyRequired || Boolean(overlay.querySelector('[data-accept="privacy"]')?.checked);
        if (!termsAccepted || !privacyAccepted) return;

        isSubmitting = true;
        updateAcceptButton();
        const error = overlay.querySelector('#bsms-legal-error');
        error.hidden = true;

        try {
            await apiRequest('accept', {
                termsAccepted,
                privacyAccepted,
                versions: policyState.versions
            });
            closeDocument();
            overlay.remove();
            overlay = null;
            policyState = null;
            document.body.classList.remove('bsms-legal-open');
            window.dispatchEvent(new CustomEvent('bsms:legal-accepted'));
        } catch (err) {
            error.textContent = err.message || 'Your acceptance could not be saved. Please try again.';
            error.hidden = false;
            if (err.status === 409) {
                await checkPolicies();
            }
        } finally {
            isSubmitting = false;
            updateAcceptButton();
        }
    }

    async function checkPolicies() {
        if (!sessionId()) return;
        try {
            const data = await apiRequest('status');
            if (data.needsAcceptance) renderStatus(data);
            else if (overlay) {
                closeDocument();
                overlay.remove();
                overlay = null;
                policyState = null;
                document.body.classList.remove('bsms-legal-open');
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
        if (event.key === SESSION_KEY) checkPolicies();
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
