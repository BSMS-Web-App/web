/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
(function () {
  'use strict';

  const SESSION_KEY = 'bsms_auth_session';
  const SESSION_ID_KEY = 'session_id';
  const SUPPORT_STORAGE_KEY = 'bsms_general_support_access_v1';
  const params = new URLSearchParams(location.search);
  const initialType = ['bug', 'feature', 'general'].includes(params.get('type')) ? params.get('type') : null;
  const chooser = document.getElementById('contactTypeChooser');
  const authCard = document.getElementById('contactAuthCard');
  const formCard = document.getElementById('contactFormCard');
  const successCard = document.getElementById('contactSuccessCard');
  const generalCard = document.getElementById('generalSupportCard');
  const form = document.getElementById('contactForm');
  const typeInput = document.getElementById('contactType');
  const titleInput = document.getElementById('contactTitle');
  const descriptionInput = document.getElementById('contactDescription');
  const stepsInput = document.getElementById('contactSteps');
  const pageInput = document.getElementById('contactPage');
  const submitButton = document.getElementById('contactSubmit');
  const message = document.getElementById('contactMessage');
  let activeType = null;
  let supportAccess = null;
  let activeConversation = null;
  let refreshTimer = null;

  function readSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session || !session.loggedIn || !localStorage.getItem(SESSION_ID_KEY)) return null;
      return session;
    } catch (_) { return null; }
  }

  function setNotice(element, text, kind = 'error') {
    element.textContent = text;
    element.className = 'contact-message ' + kind;
    element.hidden = false;
  }
  function clearNotice(element) {
    element.hidden = true;
    element.textContent = '';
    element.className = 'contact-message';
  }

  function setType(type) {
    activeType = type;
    chooser.hidden = false;
    document.querySelectorAll('#contactTypeChooser .contact-type').forEach(button => {
      const selected = button.dataset.type === type;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    authCard.hidden = true;
    formCard.hidden = true;
    successCard.hidden = true;
    generalCard.hidden = true;

    if (type === 'general') {
      generalCard.hidden = false;
      if (supportAccess) openConversation(supportAccess.conversationId, supportAccess.accessKey).catch(() => {});
      return;
    }
    const session = readSession();
    if (!session) {
      authCard.hidden = false;
      return;
    }
    showSignedIn(session);
    formCard.hidden = false;
    setReportType(type);
  }

  function setReportType(type) {
    activeType = type === 'feature' ? 'feature' : 'bug';
    typeInput.value = activeType;
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
    submitButton.textContent = feature ? 'Submit feature request' : 'Submit bug report';
    stepsInput.placeholder = feature ? 'How do you imagine this feature working?' : '1. Open the page\n2. Try the action\n3. Describe what happened';
  }

  function showSignedIn(session) {
    document.getElementById('contactDisplayName').textContent = session.displayName || session.username || 'BSMS Web user';
    document.getElementById('contactUsername').textContent = '@' + (session.username || 'unknown');
    const avatar = document.getElementById('contactAvatar');
    if (session.pfp) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = session.pfp;
      avatar.replaceChildren(img);
    } else {
      avatar.textContent = (session.displayName || session.username || 'B').charAt(0).toUpperCase();
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    clearNotice(message);
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
    if (payload.title.length < 4 || payload.description.length < 10) {
      setNotice(message, payload.title.length < 4 ? 'Please enter a title with at least 4 characters.' : 'Please add a little more detail (at least 10 characters).');
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem(SESSION_ID_KEY) || '' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Your submission could not be saved. Please try again.');
      formCard.hidden = true;
      successCard.hidden = false;
      document.getElementById('contactReference').textContent = data.reportId || 'Saved';
      form.reset();
      document.getElementById('contactCharCount').textContent = '0 / 5000';
    } catch (error) {
      setNotice(message, error.message || 'Your submission could not be saved. Please try again.');
    } finally {
      submitButton.disabled = false;
      setReportType(activeType);
    }
  }

  async function supportRequest(payload) {
    const response = await fetch('/api/support-conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Support is temporarily unavailable.');
    return data;
  }

  function saveAccess(id, key) {
    supportAccess = { conversationId: id, accessKey: key };
    try { localStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(supportAccess)); } catch (_) {}
  }

  function showCredentials(id, key) {
    document.getElementById('supportCreatedId').textContent = id;
    document.getElementById('supportCreatedKey').textContent = key;
    document.getElementById('supportCredentialNotice').hidden = false;
    document.getElementById('supportConversationStart').hidden = true;
    document.getElementById('supportConversationView').hidden = true;
  }

  function renderConversation(conversation) {
    activeConversation = conversation;
    document.getElementById('supportConversationSubject').textContent = conversation.subject || 'General support';
    document.getElementById('supportConversationMeta').textContent =
      (conversation.status === 'closed' ? 'Closed' : 'Open') + ' · Reference ' + conversation.id;
    const messages = document.getElementById('supportMessages');
    messages.replaceChildren();
    (conversation.messages || []).forEach(item => {
      const row = document.createElement('article');
      row.className = 'support-message ' + (item.sender === 'admin' ? 'from-admin' : 'from-visitor');
      const header = document.createElement('div');
      header.className = 'support-message-meta';
      const sender = document.createElement('strong');
      sender.textContent = item.sender === 'admin' ? (item.senderName || 'BSMS Web Admin') : 'You';
      const time = document.createElement('time');
      time.dateTime = new Date(Number(item.createdAt || Date.now())).toISOString();
      time.textContent = Number(item.createdAt) ? new Date(Number(item.createdAt)).toLocaleString() : '';
      header.append(sender, time);
      const body = document.createElement('p');
      body.textContent = item.body || '';
      row.append(header, body);
      messages.appendChild(row);
    });
    messages.scrollTop = messages.scrollHeight;
    const closed = conversation.status === 'closed';
    document.getElementById('supportReply').disabled = closed;
    document.getElementById('supportReplyButton').disabled = closed;
    document.getElementById('supportReplyButton').textContent = closed ? 'Conversation closed' : 'Send message';
    document.getElementById('supportConversationView').hidden = false;
    document.getElementById('supportConversationStart').hidden = true;
    document.getElementById('supportCredentialNotice').hidden = true;
  }

  async function openConversation(id, key) {
    const data = await supportRequest({ action: 'get', conversationId: id, accessKey: key });
    saveAccess(id, key);
    renderConversation(data.conversation);
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshConversation, 15000);
  }

  async function refreshConversation() {
    if (!supportAccess || !activeConversation) return;
    try {
      const data = await supportRequest({ action: 'get', ...supportAccess });
      const oldCount = (activeConversation.messages || []).length;
      renderConversation(data.conversation);
      if ((data.conversation.messages || []).length > oldCount) {
        const messages = document.getElementById('supportMessages');
        messages.scrollTop = messages.scrollHeight;
      }
    } catch (_) {}
  }

  document.querySelectorAll('#contactTypeChooser .contact-type').forEach(button => {
    button.addEventListener('click', () => setType(button.dataset.type));
  });
  document.getElementById('contactDescription').addEventListener('input', () => {
    document.getElementById('contactCharCount').textContent = descriptionInput.value.length + ' / 5000';
  });
  form.addEventListener('submit', submitReport);
  document.getElementById('contactAnother').addEventListener('click', () => {
    successCard.hidden = true;
    formCard.hidden = false;
    clearNotice(message);
    titleInput.focus();
  });
  document.getElementById('supportBackToTypes').addEventListener('click', () => {
    activeType = null;
    chooser.hidden = false;
    authCard.hidden = true;
    formCard.hidden = true;
    successCard.hidden = true;
    generalCard.hidden = true;
    document.querySelectorAll('#contactTypeChooser .contact-type').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
  });

  document.getElementById('supportStartForm').addEventListener('submit', async event => {
    event.preventDefault();
    const notice = document.getElementById('supportStartMessage');
    clearNotice(notice);
    const button = document.getElementById('supportStartButton');
    button.disabled = true;
    button.textContent = 'Starting…';
    try {
      const data = await supportRequest({
        action: 'create',
        subject: document.getElementById('supportSubject').value.trim(),
        message: document.getElementById('supportFirstMessage').value.trim()
      });
      saveAccess(data.conversation.id, data.accessKey);
      showCredentials(data.conversation.id, data.accessKey);
      document.getElementById('supportStartForm').reset();
    } catch (error) {
      setNotice(notice, error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Start support conversation';
    }
  });

  document.getElementById('supportResumeForm').addEventListener('submit', async event => {
    event.preventDefault();
    const notice = document.getElementById('supportResumeMessage');
    clearNotice(notice);
    try {
      await openConversation(
        document.getElementById('supportResumeId').value.trim(),
        document.getElementById('supportResumeKey').value.trim()
      );
    } catch (error) {
      setNotice(notice, error.message);
    }
  });

  document.getElementById('supportContinueButton').addEventListener('click', async () => {
    if (!supportAccess) return;
    try {
      await openConversation(supportAccess.conversationId, supportAccess.accessKey);
    } catch (error) {
      setNotice(document.getElementById('supportResumeMessage'), error.message);
      document.getElementById('supportCredentialNotice').hidden = true;
      document.getElementById('supportConversationStart').hidden = false;
    }
  });

  document.getElementById('supportReplyForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!supportAccess) return;
    const input = document.getElementById('supportReply');
    const status = document.getElementById('supportReplyStatus');
    const button = document.getElementById('supportReplyButton');
    const text = input.value.trim();
    if (!text) return;
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const data = await supportRequest({ action: 'send', ...supportAccess, message: text });
      input.value = '';
      renderConversation(data.conversation);
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      if (activeConversation?.status !== 'closed') button.disabled = false;
    }
  });

  document.querySelectorAll('[data-copy-target]').forEach(button => {
    button.addEventListener('click', async () => {
      const value = document.getElementById(button.dataset.copyTarget)?.textContent || '';
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy'; }, 1500);
      } catch (_) {
        button.textContent = 'Select and copy';
      }
    });
  });

  document.getElementById('supportShowCredentials').addEventListener('click', () => {
    if (supportAccess) showCredentials(supportAccess.conversationId, supportAccess.accessKey);
  });

  if (initialType) setType(initialType);
  else {
    chooser.hidden = false;
    authCard.hidden = true;
    formCard.hidden = true;
    successCard.hidden = true;
    generalCard.hidden = true;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(SUPPORT_STORAGE_KEY) || 'null');
    if (saved?.conversationId && saved?.accessKey) {
      supportAccess = saved;
      if (initialType === 'general') openConversation(saved.conversationId, saved.accessKey).catch(() => {});
    }
  } catch (_) {}
  window.addEventListener('beforeunload', () => { if (refreshTimer) clearInterval(refreshTimer); });
})();
