/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
(function () {
  'use strict';

  const SESSION_KEY = 'bsms_auth_session';
  const SESSION_ID_KEY = 'session_id';
  const params = new URLSearchParams(window.location.search);
  const initialType = params.get('type') === 'feature' ? 'feature' : (params.get('type') === 'bug' ? 'bug' : null);
  const authCard = document.getElementById('contactAuthCard');
  const formCard = document.getElementById('contactFormCard');
  const successCard = document.getElementById('contactSuccessCard');
  const form = document.getElementById('contactForm');
  const typeInput = document.getElementById('contactType');
  const titleInput = document.getElementById('contactTitle');
  const descriptionInput = document.getElementById('contactDescription');
  const stepsInput = document.getElementById('contactSteps');
  const pageInput = document.getElementById('contactPage');
  const submitButton = document.getElementById('contactSubmit');
  const message = document.getElementById('contactMessage');
  let activeType = initialType || 'bug';
  let currentProfile = null;

  function readSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session || !session.loggedIn || !localStorage.getItem(SESSION_ID_KEY)) return null;
      return session;
    } catch (_) {
      return null;
    }
  }

  function setType(type) {
    activeType = type === 'feature' ? 'feature' : 'bug';
    typeInput.value = activeType;
    document.querySelectorAll('.contact-type').forEach(button => {
      const selected = button.dataset.type === activeType;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const feature = activeType === 'feature';
    document.getElementById('contactDescriptionLabel').textContent = feature ? 'What would you like to see?' : 'What happened?';
    descriptionInput.placeholder = feature
      ? 'Describe the idea, how it should work, and why it would be useful.'
      : 'Describe what happened and what you expected to happen.';
    document.getElementById('contactDescriptionHint').textContent = feature
      ? 'Explain the problem this idea would solve or how it would improve BSMS Web.'
      : 'Include the steps that led to the problem, if you know them.';
    document.getElementById('contactStepsLabel').innerHTML = feature ? 'Example or suggested behavior <span>Optional</span>' : 'Steps to reproduce <span>Optional</span>';
    document.getElementById('contactPageField').style.display = feature ? 'none' : '';
    document.getElementById('contactSubmit').textContent = feature ? 'Submit feature request' : 'Submit bug report';
    stepsInput.placeholder = feature
      ? 'How do you imagine this feature working?'
      : '1. Open the page\n2. Try the action\n3. Describe what happened';
  }

  function showMessage(text, kind) {
    message.textContent = text;
    message.className = 'contact-message ' + kind;
    message.hidden = false;
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = '';
    message.className = 'contact-message';
  }

  function showSignedIn(session) {
    currentProfile = session;
    authCard.hidden = true;
    formCard.hidden = false;
    successCard.hidden = true;
    const name = session.displayName || session.username || 'BSMS Web user';
    document.getElementById('contactDisplayName').textContent = name;
    document.getElementById('contactUsername').textContent = '@' + (session.username || 'unknown');
    const avatar = document.getElementById('contactAvatar');
    if (session.pfp) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = session.pfp;
      avatar.replaceChildren(img);
    } else {
      avatar.textContent = name.charAt(0).toUpperCase();
    }
  }

  async function initialize() {
    const session = readSession();
    if (!session) {
      authCard.hidden = false;
      formCard.hidden = true;
      successCard.hidden = true;
      return;
    }
    showSignedIn(session);
    setType(activeType);
    if (!pageInput.value) pageInput.value = window.location.pathname === '/support' ? '' : window.location.pathname;
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem(SESSION_ID_KEY) },
        body: JSON.stringify({ action: 'getProfile' })
      });
      if (!response.ok) {
        authCard.hidden = false;
        formCard.hidden = true;
        return;
      }
      const data = await response.json();
      if (data.profile) {
        currentProfile = { ...session, ...data.profile };
        showSignedIn(currentProfile);
      }
    } catch (_) {
      // The submission API independently validates the session before saving.
    }
  }

  document.querySelectorAll('.contact-type').forEach(button => {
    button.addEventListener('click', () => setType(button.dataset.type));
  });

  descriptionInput.addEventListener('input', () => {
    document.getElementById('contactCharCount').textContent = descriptionInput.value.length + ' / 5000';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearMessage();
    if (!readSession()) {
      formCard.hidden = true;
      authCard.hidden = false;
      return;
    }

    const payload = {
      type: activeType,
      title: titleInput.value.trim(),
      category: document.getElementById('contactCategory').value,
      description: descriptionInput.value.trim(),
      page: activeType === 'bug' ? pageInput.value.trim() : '',
      steps: stepsInput.value.trim()
    };
    if (payload.title.length < 4) {
      showMessage('Please enter a title with at least 4 characters.', 'error');
      titleInput.focus();
      return;
    }
    if (payload.description.length < 10) {
      showMessage('Please add a little more detail (at least 10 characters).', 'error');
      descriptionInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': localStorage.getItem(SESSION_ID_KEY) || ''
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Your submission could not be saved. Please try again.');
      formCard.hidden = true;
      successCard.hidden = false;
      document.getElementById('contactReference').textContent = data.reportId || 'Saved';
      form.reset();
      document.getElementById('contactCharCount').textContent = '0 / 5000';
      setType(activeType);
    } catch (error) {
      showMessage(error.message || 'Your submission could not be saved. Please try again.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = activeType === 'feature' ? 'Submit feature request' : 'Submit bug report';
    }
  });

  document.getElementById('contactAnother').addEventListener('click', () => {
    successCard.hidden = true;
    formCard.hidden = false;
    clearMessage();
    titleInput.focus();
  });

  initialize();
})();
