(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const form = $('addressForm');
    const input = $('addressInput');
    const frame = $('readerFrame');
    const empty = $('emptyState');
    const status = $('statusText');
    const toast = $('toast');

    let readerToken = null;
    let currentUrl = '';
    let historyStack = [];
    let historyIndex = -1;
    let toastTimer = null;

    function notify(message) {
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    }

    function updateNavigation() {
        $('backButton').disabled = historyIndex <= 0;
        $('forwardButton').disabled = historyIndex >= historyStack.length - 1;
    }

    function normalizeAddress(value) {
        let raw = String(value || '').trim();
        if (!raw) throw new Error('Enter a website address first.');
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
        const url = new URL(raw);
        if (url.protocol !== 'https:') throw new Error('Only secure HTTPS websites are supported.');
        return url.href;
    }

    async function getReaderToken() {
        const stored = localStorage.getItem('bsms_auth_session');
        const sessionId = localStorage.getItem('session_id');
        let auth;
        try { auth = JSON.parse(stored || 'null'); } catch { auth = null; }
        if (!sessionId || !auth || !auth.loggedIn || !auth.uid) {
            throw new Error('Sign in to your BSMS Web account before using the reader.');
        }

        const response = await fetch('/api/proxy?action=token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sessionId,
                'X-Device-ID': sessionId
            },
            body: JSON.stringify({ action: 'token' })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.token) throw new Error(data.error || 'Could not start a reader session.');
        return data.token;
    }

    function loadUrl(url, addHistory = true) {
        currentUrl = url;
        input.value = url;
        const proxyAddress = '/api/proxy?url=' + encodeURIComponent(url)
            + '&token=' + encodeURIComponent(readerToken);
        frame.src = proxyAddress;
        frame.hidden = false;
        empty.hidden = true;
        status.textContent = 'Loading through the BSMS Web cloud reader…';
        if (addHistory) {
            historyStack = historyStack.slice(0, historyIndex + 1);
            historyStack.push(url);
            historyIndex = historyStack.length - 1;
        }
        updateNavigation();
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        try {
            const url = normalizeAddress(input.value);
            if (!readerToken) {
                notify('Your reader session is still starting. Try again in a moment.');
                return;
            }
            loadUrl(url);
        } catch (error) {
            notify(error.message || 'That address is not valid.');
        }
    });

    $('backButton').addEventListener('click', () => {
        if (historyIndex <= 0) return;
        historyIndex -= 1;
        loadUrl(historyStack[historyIndex], false);
        updateNavigation();
    });

    $('forwardButton').addEventListener('click', () => {
        if (historyIndex >= historyStack.length - 1) return;
        historyIndex += 1;
        loadUrl(historyStack[historyIndex], false);
        updateNavigation();
    });

    $('reloadButton').addEventListener('click', () => {
        if (currentUrl && readerToken) loadUrl(currentUrl, false);
    });

    frame.addEventListener('load', () => {
        if (!frame.hidden) status.textContent = currentUrl || 'Ready';
        updateNavigation();
    });

    frame.addEventListener('error', () => {
        status.textContent = 'The page could not be displayed.';
    });

    getReaderToken()
        .then(token => {
            readerToken = token;
            status.textContent = 'Signed in · Cloud reader ready';
        })
        .catch(error => {
            status.textContent = error.message;
            notify(error.message);
            if (error.message.includes('Sign in')) {
                const link = document.createElement('a');
                link.href = '/accounts';
                link.textContent = 'Open account sign-in';
                link.style.cssText = 'margin-top:16px;color:#fff;text-decoration:underline;font-size:13px';
                empty.appendChild(link);
            }
        });
})();
