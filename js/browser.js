(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const form = $('addressForm');
  const input = $('addressInput');
  const frame = $('browserFrame');
  const empty = $('emptyState');
  const blocked = $('blockedState');
  const blockedAddress = $('blockedAddress');
  const shell = $('browserShell');
  const signinLink = $('signinLink');
  const toast = $('toast');
  const proxy = String(window.BSMS_READER_PROXY_ORIGIN || '').replace(/\/+$/, '');

  let token = null;
  let current = '';
  let history = [];
  let index = -1;
  let toastTimer;
  let cssFullscreen = false;

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
    try { url = new URL(address); }
    catch { throw new Error('That website address does not look valid.'); }
    if (url.protocol !== 'https:') throw new Error('For security, the Browser only opens HTTPS websites.');
    if (!url.hostname) throw new Error('Enter a valid website address.');
    return url.href;
  }

  function isBsmsWebAddress(address) {
    try {
      const host = new URL(address).hostname.toLowerCase().replace(/\.$/, '');
      return host === 'bsms-web.com' || host.endsWith('.bsms-web.com');
    } catch { return false; }
  }

  function showBlockedPage(address, addToHistory = true) {
    current = address;
    renderAddress(address);
    frame.removeAttribute('src');
    frame.hidden = true;
    empty.hidden = true;
    blockedAddress.textContent = address;
    blocked.hidden = false;
    if (addToHistory) {
      history = history.slice(0, index + 1);
      history.push(address);
      index = history.length - 1;
    } else if (index >= 0) {
      history[index] = address;
    }
    updateNavigation();
  }

  function caretOffset(element) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !element.contains(selection.anchorNode)) return element.textContent.length;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  }

  function setCaretOffset(element, offset) {
    const selection = window.getSelection();
    if (!selection) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    let remaining = offset;
    while ((node = walker.nextNode())) {
      if (remaining <= node.textContent.length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= node.textContent.length;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function addressParts(value) {
    const text = String(value || '').replace(/[\r\n]/g, '');
    const match = text.match(/^((?:https?:\/\/)?[^/?#]+)(\/)?(.*)$/i);
    if (!match) return { origin: text, path: '' };
    return { origin: match[1] + (match[2] || ''), path: match[3] || '' };
  }

  function renderAddress(value, keepCaret = false) {
    const oldCaret = keepCaret ? caretOffset(input) : null;
    const text = String(value || '').replace(/[\r\n]/g, '');
    const parts = addressParts(text);
    input.replaceChildren();
    if (parts.origin) {
      const origin = document.createElement('span');
      origin.className = 'address-origin';
      origin.textContent = parts.origin;
      input.append(origin);
    }
    if (parts.path) {
      const path = document.createElement('span');
      path.className = 'address-path';
      path.textContent = parts.path;
      input.append(path);
    }
    if (keepCaret) {
      setCaretOffset(input, Math.min(oldCaret, input.textContent.length));
    } else {
      input.scrollLeft = 0;
    }
    input.scrollTop = 0;
  }

  function updateAddressFromPage(address, mode = 'push') {
    let normalized;
    try { normalized = normalizeAddress(address); }
    catch { return; }
    if (isBsmsWebAddress(normalized)) {
      if (normalized !== current) showBlockedPage(normalized, mode !== 'replace');
      return;
    }
    if (normalized === current) return;

    current = normalized;
    renderAddress(normalized);
    if (mode === 'replace' && index >= 0) {
      history[index] = normalized;
    } else {
      history = history.slice(0, index + 1);
      history.push(normalized);
      index = history.length - 1;
    }
    updateNavigation();
  }

  async function createSession() {
    if (!proxy) throw new Error('The BSMS Web Browser service is not configured.');
    let account;
    try { account = JSON.parse(localStorage.getItem('bsms_auth_session') || 'null'); } catch {}
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
      throw new Error(result.error || 'Could not start your Browser session.');
    }
    return result.token;
  }

  function loadAddress(address, addToHistory = true) {
    if (isBsmsWebAddress(address)) {
      showBlockedPage(address, addToHistory);
      return;
    }
    current = address;
    renderAddress(address);
    blocked.hidden = true;
    const pageUrl = new URL(proxy + '/page');
    pageUrl.searchParams.set('url', address);
    pageUrl.searchParams.set('token', token);
    frame.src = pageUrl.href;
    frame.hidden = false;
    empty.hidden = true;

    if (addToHistory) {
      history = history.slice(0, index + 1);
      history.push(address);
      index = history.length - 1;
    }
    updateNavigation();
  }

  input.addEventListener('input', () => {
    const value = input.textContent.replace(/[\r\n]/g, '');
    renderAddress(value, true);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const address = normalizeAddress(input.textContent);
      if (isBsmsWebAddress(address)) {
        loadAddress(address);
        return;
      }
      if (!token) throw new Error('Your Browser session is not ready yet.');
      loadAddress(address);
    } catch (error) { notify(error.message); }
  });

  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'bsms-browser-blocked' && typeof event.data.url === 'string') {
      try { showBlockedPage(normalizeAddress(event.data.url), true); } catch {}
      return;
    }
    if (event.data.type !== 'bsms-browser-location' || typeof event.data.url !== 'string') return;
    updateAddressFromPage(event.data.url, event.data.mode);
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

  function leaveCssFullscreen() {
    if (!cssFullscreen) return;
    cssFullscreen = false;
    shell.classList.remove('reader-fullscreen');
    $('exitFullscreenButton').hidden = true;
    $('fullscreenButton').setAttribute('aria-label', 'Full screen website');
    $('fullscreenButton').title = 'Full screen';
  }

  async function enterFullscreen() {
    if (!current || frame.hidden || blocked.hidden === false) {
      notify('Open a website before using full screen.');
      return;
    }
    try {
      if (frame.requestFullscreen) {
        await frame.requestFullscreen();
        return;
      }
    } catch {}
    cssFullscreen = true;
    shell.classList.add('reader-fullscreen');
    $('exitFullscreenButton').hidden = false;
    $('fullscreenButton').setAttribute('aria-label', 'Exit full screen');
    $('fullscreenButton').title = 'Exit full screen';
  }

  $('fullscreenButton').addEventListener('click', () => {
    if (cssFullscreen) {
      leaveCssFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    enterFullscreen();
  });
  $('exitFullscreenButton').addEventListener('click', leaveCssFullscreen);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      leaveCssFullscreen();
      $('fullscreenButton').setAttribute('aria-label', 'Full screen website');
      $('fullscreenButton').title = 'Full screen';
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && cssFullscreen) leaveCssFullscreen();
  });

  const betaNotice = $('betaNotice');
  const betaGotItButton = $('betaGotItButton');
  betaGotItButton.addEventListener('click', () => {
    if (betaGotItButton.disabled) return;
    betaNotice.hidden = true;
  });
  window.setTimeout(() => { betaGotItButton.disabled = false; }, 5000);

  const infoModal = $('infoModal');
  function closeInfoModal() { infoModal.hidden = true; }
  $('infoButton').addEventListener('click', () => { infoModal.hidden = false; });
  $('closeInfoButton').addEventListener('click', closeInfoModal);
  $('closeInfoDoneButton').addEventListener('click', closeInfoModal);
  infoModal.addEventListener('click', event => {
    if (event.target === infoModal) closeInfoModal();
  });

  createSession()
    .then(sessionToken => { token = sessionToken; })
    .catch(error => {
      notify(error.message);
      if (error.message.includes('Sign in')) signinLink.hidden = false;
    });
})();