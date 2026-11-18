(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const form = $('addressForm');
  const input = $('addressInput');
  const frame = $('readerFrame');
  const empty = $('emptyState');
  const status = $('statusText');
  const toast = $('toast');
  const signinLink = $('signinLink');
  const proxy = String(window.BSMS_READER_PROXY_ORIGIN || '').replace(/\/+$/, '');

  let token = null;
  let current = '';
  let history = [];
  let index = -1;
  let toastTimer;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function updateNavigation() {
    $('backButton').disabled = index <= 0;
    $('forwardButton').disabled = index >= history.length - 1;
  }

  function normalizeAddress(value) {
    let address = String(value || '').trim();
    if (!address) throw new Error('Enter a website address.');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) address = 'https://' + address;

    let url;
    try {
      url = new URL(address);
    } catch {
      throw new Error('That website address does not look valid.');
    }
    if (url.protocol !== 'https:') throw new Error('For security, Reader only opens HTTPS websites.');
    if (!url.hostname) throw new Error('Enter a valid website address.');
    return url.href;
  }

  async function createSession() {
    if (!proxy) throw new Error('The BSMS Web Reader service is not configured.');

    let account;
    try {
      account = JSON.parse(localStorage.getItem('bsms_auth_session') || 'null');
    } catch {}

    const sessionId = localStorage.getItem('session_id');
    if (!sessionId || !account?.loggedIn || !account?.uid) {
      throw new Error('Sign in to your BSMS Web account first.');
    }

    const response = await fetch(proxy + '/session', {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
        'X-UID': account.uid
      },
      body: '{}'
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.token) {
      throw new Error(result.error || 'Could not start your Reader session.');
    }
    return result.token;
  }

  function loadAddress(address, addToHistory = true) {
    current = address;
    input.value = address;

    const pageUrl = new URL(proxy + '/page');
    pageUrl.searchParams.set('url', address);
    pageUrl.searchParams.set('token', token);
    frame.src = pageUrl.href;
    frame.hidden = false;
    empty.hidden = true;
    status.textContent = 'Loading website through Cloudflare…';

    if (addToHistory) {
      history = history.slice(0, index + 1);
      history.push(address);
      index = history.length - 1;
    }
    updateNavigation();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (!token) throw new Error('Your Reader session is not ready yet.');
      loadAddress(normalizeAddress(input.value));
    } catch (error) {
      notify(error.message);
    }
  });

  $('backButton').addEventListener('click', () => {
    if (index > 0) {
      index--;
      loadAddress(history[index], false);
    }
  });

  $('forwardButton').addEventListener('click', () => {
    if (index < history.length - 1) {
      index++;
      loadAddress(history[index], false);
    }
  });

  $('reloadButton').addEventListener('click', () => {
    if (current && token) loadAddress(current, false);
  });

  frame.addEventListener('load', () => {
    if (!frame.hidden) status.textContent = current || 'Ready';
  });

  createSession()
    .then(sessionToken => {
      token = sessionToken;
      status.textContent = 'Signed in · Ready to browse public HTTPS websites';
    })
    .catch(error => {
      status.textContent = error.message;
      notify(error.message);
      if (error.message.includes('Sign in')) signinLink.hidden = false;
    });
})();
