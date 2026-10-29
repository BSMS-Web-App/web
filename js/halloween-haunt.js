/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

// Core Constants
const START_Z = '2026-10-26T04:00:00Z'; // Oct 26 2026, 12:00 AM EDT
const DEADLINE_Z = '2026-10-30T19:10:00Z'; // Oct 30 2026, 3:10 PM EDT
const API_BASE = '/api/halloween-haunt';
const IMG_BASE = '/img/halloween-haunt-event/candy/';

// The EXACT Candy Catalog mappings requested
const CANDY_CATALOG = [
    // Common
    { id: 'candy-corn', name: 'Candy Corn', rarity: 'Common', file: 'candy-corn.png' },
    { id: 'smarties', name: 'Smarties', rarity: 'Common', file: 'smarties.png' },
    { id: 'tootsie-roll', name: 'Tootsie Roll', rarity: 'Common', file: 'tootsie-roll.png' },
    { id: 'whoppers', name: 'Whoppers', rarity: 'Common', file: 'whoppers.jpeg.png' },
    { id: 'milk-duds', name: 'Milk Duds', rarity: 'Common', file: 'milk-duds.png' },
    { id: 'mounds', name: 'Mounds', rarity: 'Common', file: 'mounds.png' },
    // Uncommon
    { id: '3-musketeers', name: '3 Musketeers', rarity: 'Uncommon', file: '3-musketeers.png' },
    { id: 'milky-way', name: 'Milky Way', rarity: 'Uncommon', file: 'milky-way.png' },
    { id: 'mr-goodbar', name: 'Mr. Goodbar', rarity: 'Uncommon', file: 'mr-goodbar.png' },
    { id: 'almond-joy', name: 'Almond Joy', rarity: 'Uncommon', file: 'almond-joy.png' },
    { id: 'baby-ruth', name: 'Baby Ruth', rarity: 'Uncommon', file: 'baby-ruth.png' },
    { id: 'tootsie-pop', name: 'Tootsie Pop', rarity: 'Uncommon', file: 'tootsie-pop.png' },
    { id: 'jolly-ranchers', name: 'Jolly Ranchers', rarity: 'Uncommon', file: 'jolly-ranchers.png' },
    { id: 'twizzlers', name: 'Twizzlers', rarity: 'Uncommon', file: 'twizzlers.png' },
    // Rare
    { id: 'hersheys', name: 'Hershey\'s', rarity: 'Rare', file: 'hersheys.png' },
    { id: 'm-ms', name: 'M&M\'s', rarity: 'Rare', file: 'm-ms.png' },
    { id: 'skittles', name: 'Skittles', rarity: 'Rare', file: 'skittles.png' },
    { id: 'airheads', name: 'Airheads', rarity: 'Rare', file: 'airheads.png' },
    { id: 'swedish-fish', name: 'Swedish Fish', rarity: 'Rare', file: 'swedish-fish.png' },
    { id: 'york', name: 'York', rarity: 'Rare', file: 'york.png' },
    { id: 'crunch', name: 'Crunch', rarity: 'Rare', file: 'crunch.png' },
    { id: 'butter-finger', name: 'Butterfinger', rarity: 'Rare', file: 'butter-finger.png' },
    { id: 'startburst', name: 'Starburst', rarity: 'Rare', file: 'startburst.png' },
    // Epic
    { id: 'kitkat', name: 'KitKat', rarity: 'Epic', file: 'kitkat.png' },
    { id: 'snickers', name: 'Snickers', rarity: 'Epic', file: 'snickers.png' },
    { id: 'sour-patch-kids', name: 'Sour Patch Kids', rarity: 'Epic', file: 'sour-patch-kids.png' },
    { id: '100-grand', name: '100 Grand', rarity: 'Epic', file: '100-grand.png' },
    // Legendary
    { id: 'twix', name: 'Twix', rarity: 'Legendary', file: 'twix.png' },
    { id: 'reeses', name: 'Reese\'s', rarity: 'Legendary', file: 'reeses.png' }
];

// Active State
let gameState = null;
let lastApiError = null;

function createDefaultStats(){return {highScore:100,lifetimeCash:0,cashSpent:0,totalClicks:0,totalCollected:0,totalSold:0,rareCollected:0,legendaryCollected:0,upgradesBought:0,crewCollected:0,crewSold:0};}
function choosePreviewCandy(){
 const weights={Common:62,Uncommon:24,Rare:10,Epic:3.3,Legendary:.7},luck=Math.min(14,Math.max(0,Number(gameState?.upgrades?.luck?.level)||0)),items=CANDY_CATALOG.map(c=>({c,w:(weights[c.rarity]||1)*(c.rarity==='Common'?1:1+luck*.055)}));
 let roll=Math.random()*items.reduce((n,x)=>n+x.w,0);for(const x of items){roll-=x.w;if(roll<=0)return x.c;}return items[0].c;
}
function recalculateBasketCount(state=gameState){if(!state)return 0;state.inventory||={};state.currentBasketCount=Object.values(state.inventory).reduce((n,q)=>n+Math.max(0,Math.floor(Number(q)||0)),0);return state.currentBasketCount;}

let currentModal = null;
let offerRefreshTime = 0;
let isEventActive = false;
let crewSyncInFlight = false;
let crewSyncFailures = 0;
let leaderboardCache = [];
let pendingClicks = 0;
let inFlightClicks = 0;
let retryBatchClicks = 0;
let pendingRetryRequestId = null;
let collectInFlight = false;
let collectFlushTimer = null;
let autoSellInProgress = false;
let shopTimerInterval = null;
let shopRefreshInFlight = false;
let actionInFlight = false;
let helpSection = 0;
const PRELOADED_CANDY_IMAGES = new Map();
const HELP_SECTIONS = [
 {title:"Collect Candy",body:"Click the pumpkin to collect candy. Your basket has a capacity limit. Candy has different rarities, and the Candy Index records the types you discover."},
 {title:"Sell All Candy",body:"Open Shops to sell everything in your player basket at once. The game automatically sends each candy type to the shop offering the best price. You cannot pick a shop or sell only selected candy."},
 {title:"Upgrade Your Progress",body:"Basket Capacity lets you carry more candy, Click Power gives you more candy per click, and Candy Luck improves your chance of finding rarer candy. Auto Sell is a one-time $5,000 unlock that sells your full basket one second after it fills."},
 {title:"Manage Your Crew",body:"Hire up to 20 named crew members. They collect candy while the game is open and automatically sell a full basket after 20 seconds to the best-paying shop. They fall asleep after five minutes and must be woken manually. Your Candy Reserve grows as candy is collected; feeding costs 10 times your basket capacity and boosts a crew member for 20 minutes. Use Settings to control notifications or replay this guide."}
];

// Helpers
const recentToastCategories = new Map();
function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const text = String(msg ?? '').trim();
    const lower = text.toLowerCase();
    let category = null;
    if (/sold .* candies|candy sold|your candy was sold|selling your full basket|auto sell.*selling|selling candy/.test(lower)) category = 'sale';
    else if (/upgrade purchased|upgrade unlocked|auto sell unlocked/.test(lower)) category = 'upgrade';
    else if (/crew member hired|crew updated|crew hired|your worker is ready/.test(lower)) category = 'crew-hired';
    else if (/fed for 20 minutes|crew member fed|boosts are active/.test(lower)) category = 'crew-fed';
    else if (/crew member awake|worker is back to work/.test(lower)) category = 'crew-awake';
    else if (/basket is full|basket full/.test(lower)) category = 'basket-full';
    else if (/new rarity unlocked|discovered a .* candy/.test(lower)) category = 'new-rarity';
    else if (/crew member asleep|needs to be woken|needs waking/.test(lower)) category = 'crew-asleep';
    const now = Date.now();
    if (category && now - (recentToastCategories.get(category) || 0) < 1800) return;
    if (category) recentToastCategories.set(category, now);
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = text;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getCandyObj(id) { return CANDY_CATALOG.find(c => c.id === id); }
function formatCash(num) { return '$' + Math.floor(num).toLocaleString(); }
function cloneGameState(value) { return JSON.parse(JSON.stringify(value)); }
function renderCurrentModal() {
 const body=document.getElementById('modalBody'); if(!body||!currentModal||!gameState)return;
 if(currentModal==='shops')renderShops(body);else if(currentModal==='upgrades')renderUpgrades(body);else if(currentModal==='crew'){if(typeof window.renderCrew==='function')window.renderCrew(body);else renderCrew(body);}else if(currentModal==='index')renderIndex(body);else if(currentModal==='stats')renderStats(body);else if(currentModal==='leaderboard')renderLeaderboard(body);
}
const HH_PENDING_ACTIONS_KEY = 'bsms_halloween_haunt_pending_actions_v1';
const HH_SYNC_INTERVAL_MS = 10000;
let pendingOptimisticActions = 0;
let pendingServerActions = [];
let syncInProgress = false;
let syncTimerStarted = false;

function makeRequestId(prefix = 'hh') {
 return (crypto.randomUUID ? crypto.randomUUID() : prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
}

function persistPendingServerActions() {
 try {
  const sessionId = localStorage.getItem('session_id') || '';
  localStorage.setItem(HH_PENDING_ACTIONS_KEY, JSON.stringify({ sessionId, actions: pendingServerActions }));
  if (gameState) localStorage.setItem(HH_PENDING_ACTIONS_KEY + '_state', JSON.stringify({ sessionId, state: gameState }));
 } catch (error) {
  console.warn('[Halloween Haunt] Could not persist pending actions:', error);
 }
}

function restorePendingServerActions() {
 try {
  const saved = JSON.parse(localStorage.getItem(HH_PENDING_ACTIONS_KEY) || 'null');
  const sessionId = localStorage.getItem('session_id') || '';
  if (saved?.sessionId && saved.sessionId === sessionId && Array.isArray(saved.actions)) {
   pendingServerActions = saved.actions.filter(item =>
    item && typeof item.action === 'string' && item.payload &&
    typeof item.payload === 'object' && typeof item.payload.requestId === 'string'
   ).slice(0, 500);
   pendingOptimisticActions = pendingServerActions.length;
   if (pendingServerActions.length) {
    const savedState = JSON.parse(localStorage.getItem(HH_PENDING_ACTIONS_KEY + '_state') || 'null');
    if (savedState?.sessionId === sessionId && savedState.state) gameState = hhValidateSaveState(savedState.state);
   }
  } else if (saved) {
   localStorage.removeItem(HH_PENDING_ACTIONS_KEY);
   localStorage.removeItem(HH_PENDING_ACTIONS_KEY + '_state');
  }
 } catch (error) {
  console.warn('[Halloween Haunt] Could not restore pending actions:', error);
  pendingServerActions = [];
  pendingOptimisticActions = 0;
 }
}

function queueServerAction(action, payload = {}) {
 if (!action || halloweenOfflineMode) return false;
 if (pendingServerActions.length >= 500) {
  showToast('Your action queue is full. Wait for synchronization before trying again.');
  return false;
 }
 const item = { action, payload: { ...payload, requestId: payload.requestId || makeRequestId(action) } };
 pendingServerActions.push(item);
 pendingOptimisticActions = pendingServerActions.length;
 persistPendingServerActions();
 return true;
}

async function flushServerActionQueue() {
 if (syncInProgress || halloweenOfflineMode || !pendingServerActions.length) return;
 if (!navigator.onLine || !(localStorage.getItem('session_id') || '')) return;
 syncInProgress = true;
 const batch = pendingServerActions.slice(0, 20);
 try {
  const result = await apiCall('?action=sync', 'POST', {
   actions: batch.map(item => ({ action: item.action, payload: item.payload }))
  });
  if (!result?.ok || !Array.isArray(result.results)) {
   if (!navigator.onLine) {
    try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
   }
   return;
  }

  pendingServerActions.splice(0, batch.length);
  pendingOptimisticActions = pendingServerActions.length;
  persistPendingServerActions();
  if (!pendingServerActions.length) localStorage.removeItem(HH_PENDING_ACTIONS_KEY + '_state');

  const failed = result.results.find(item => Number(item.status) >= 400);
  if (failed?.result?.error) showToast(failed.result.error);

  if (!pendingServerActions.length && result.state) {
   gameState = cloneGameState(result.state);
   recalculateBasketCount();
   updateUI();
   renderCurrentModal();
  } else if (!pendingServerActions.length) {
   const authoritative = await apiCall('?action=state');
   if (authoritative?.state) {
    gameState = cloneGameState(authoritative.state);
    recalculateBasketCount();
    updateUI();
    renderCurrentModal();
   }
  }
 } catch (error) {
  console.warn('[Halloween Haunt] Background sync failed; queued actions will be retried:', error);
 } finally {
  syncInProgress = false;
  if (pendingServerActions.length && !halloweenOfflineMode && navigator.onLine) {
   setTimeout(flushServerActionQueue, 50);
  }
 }
}

function startServerSyncTimer() {
 if (syncTimerStarted) return;
 syncTimerStarted = true;
 setInterval(flushServerActionQueue, HH_SYNC_INTERVAL_MS);
}

window.addEventListener('offline', () => {
 if (!gameState) return;
 halloweenOfflineMode = true;
 try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
 showToast('Connection lost. Halloween Haunt is continuing in offline mode on this device.');
});
window.addEventListener('online', () => {
 if (!halloweenOfflineMode) setTimeout(flushServerActionQueue, 100);
 else setTimeout(hhOfferOfflineSync, 250);
});

function performOptimisticAction(endpoint, payload, mutate, successMessage) {
 if (!gameState) return Promise.resolve();
 const action = String(endpoint.split('action=')[1] || '').split('&')[0];
 let optimisticResult = { state: gameState, hired: payload?.action === 'hire' };
 if (action === 'sell') {
  let sold = 0, earned = 0;
  for (const candy of CANDY_CATALOG) {
   const qty = Math.max(0, Math.floor(Number(gameState.inventory?.[candy.id]) || 0));
   if (!qty) continue;
   const shop = [...(gameState.shops || [])].sort((a, b) => Number(b.prices?.[candy.id] || 0) - Number(a.prices?.[candy.id] || 0))[0];
   sold += qty;
   earned += qty * Math.max(0, Number(shop?.prices?.[candy.id] || 0));
  }
  optimisticResult = { ...optimisticResult, sold, earned };
 }
 mutate(gameState);
 recalculateBasketCount();
 updateUI();
 renderCurrentModal();

 if (successMessage) {
  try {
   const message = successMessage(optimisticResult);
   if (message) showToast(message);
  } catch (error) {
   console.warn('[Halloween Haunt] Could not create optimistic success notice:', error);
  }
 }

 if (halloweenOfflineMode) {
  try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
 } else {
  queueServerAction(action, payload);
 }
 return Promise.resolve(optimisticResult);
}

function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(String.fromCharCode(34), '&quot;').replaceAll(String.fromCharCode(39), '&#39;'); }


// ------------------------------------------------------------------
// API Communication
// ------------------------------------------------------------------
function getHalloweenHauntSessionId() {
    // Match the repository-wide authentication contract used by accounts.js:
    // session_id is sent as X-Session-ID and the API validates it server-side.
    try {
        const sessionId = localStorage.getItem('session_id');
        if (typeof sessionId === 'string' && sessionId.trim()) {
            return sessionId.trim();
        }
    } catch (error) {
        console.warn('[Halloween Haunt] Could not read session_id:', error);
    }

    // Compatibility fallback for a tab where the standard key is missing.
    for (const key of ['bsms_auth_session', 'bsms_session']) {
        try {
            const session = JSON.parse(localStorage.getItem(key) || 'null');
            if (session?.loggedIn && typeof session.sessionId === 'string' && session.sessionId.trim()) {
                return session.sessionId.trim();
            }
        } catch (error) {
            console.warn('[Halloween Haunt] Could not read saved account session:', error);
        }
    }

    return '';
}

async function apiCall(endpoint, method = 'GET', payload = null) {
    const sessionId = getHalloweenHauntSessionId();
    const isHealthCheck = endpoint.includes('action=health');
    const isBackgroundSync = endpoint.includes('action=sync');
    if (halloweenOfflineMode) return hhOfflineApi(endpoint, method, payload);
    if (!sessionId && !isHealthCheck) {
        lastApiError = { status: 401, message: 'Please sign in to play Halloween Haunt.' };
        if (!isBackgroundSync) showToast(lastApiError.message);
        return null;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) {
        headers['X-Session-ID'] = sessionId;
        headers['X-Device-ID'] = localStorage.getItem('device_id') || localStorage.getItem('session_id') || sessionId;
    }

    const requestPayload = method === 'POST' && payload && typeof payload === 'object'
        ? { ...payload, requestId: payload.requestId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`) }
        : payload;

    try {
        lastApiError = null;
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers,
            body: requestPayload ? JSON.stringify(requestPayload) : null
        });
        const responseText = await res.text();
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            console.error('[Halloween Haunt] Non-JSON API response:', res.status, responseText.slice(0, 500));
            showToast(`Game API returned HTTP ${res.status}. Check the Vercel function logs.`);
            return null;
        }
        if (!res.ok) {
            lastApiError = { status: res.status, message: String(data.error || `Game API returned HTTP ${res.status}.`) };
            if (!isBackgroundSync) showToast(lastApiError.message);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('[Halloween Haunt] API request failed:', endpoint, e);
        if (!navigator.onLine && gameState) {
            // Switch the running session to local simulation immediately when the
            // network disappears; otherwise crew simulation remains disabled.
            halloweenOfflineMode = true;
            try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
            return hhOfflineApi(endpoint, method, payload);
        }
        return null;
    }
}

// ------------------------------------------------------------------
// Game Loop & Init
// ------------------------------------------------------------------
async function preloadCandyImages() {
    const jobs = CANDY_CATALOG.map(candy => new Promise(resolve => {
        const image = new Image();
        PRELOADED_CANDY_IMAGES.set(candy.id, image);
        image.onload = () => resolve({ id: candy.id, ok: true });
        image.onerror = () => resolve({ id: candy.id, ok: false });
        image.src = IMG_BASE + candy.file;
        if (image.complete) resolve({ id: candy.id, ok: image.naturalWidth > 0 });
    }));
    return Promise.all(jobs);
}

function setLoadingMessage(message) {
    const label = document.getElementById('loadingMessage');
    if (label) label.textContent = message;
}

function hideLoadingScreen() {
    const screen = document.getElementById('gameLoadingScreen');
    if (!screen) return;
    screen.classList.add('hidden');
    setTimeout(() => screen.remove(), 350);
}

async function initGame() {
    const retryButton = document.getElementById('loadingRetry');
    if (retryButton) retryButton.hidden = true;
    const offlineImportButton=document.getElementById('offlineImportButton'); if(offlineImportButton) offlineImportButton.hidden=true;
    if (!navigator.onLine) {
        halloweenOfflineMode = true;
        try {
            const saved = localStorage.getItem(HH_OFFLINE_KEY);
            if (saved) {
                gameState = hhValidateSaveState(JSON.parse(saved));
                hhPhase2Defaults(gameState);updateUI(); hideLoadingScreen(); showToast('Continuing your saved offline game.');maybeShowWelcomeGuide();
                return;
            }
        } catch (error) { console.warn('[Halloween Haunt] Could not restore local offline save:', error); }
        hhShowOfflineMenu(); return;
    }
    halloweenOfflineMode=false;
    setLoadingMessage('Connecting to Halloween Haunt…');
    try {
        const data = await apiCall('?action=state');
        if (!data?.state) {
            hhShowOfflineMenu();
            if (navigator.onLine) { const message=document.getElementById('loadingMessage'); if(message) message.textContent='The game server could not be reached. You can retry or import a save for offline play.'; }
            if (retryButton) retryButton.hidden = false;
            return;
        }
        gameState = data.state;
        restorePendingServerActions();
        startServerSyncTimer();
        const [leaderboard] = await Promise.all([apiCall('?action=leaderboard'),preloadCandyImages(),document.fonts?.ready || Promise.resolve()]);
        leaderboardCache = Array.isArray(leaderboard?.rankings) ? leaderboard.rankings : [];
        updateUI(); updateTimer();
        if (!window.halloweenHauntTimerStarted) { window.halloweenHauntTimerStarted = true; setInterval(updateTimer, 1000); }
        if (!window.halloweenHauntOnlineIntervalsStarted) { window.halloweenHauntOnlineIntervalsStarted = true; setInterval(syncCrew, 2000); setInterval(refreshLeaderboard, 60000); startServerSyncTimer(); }
        hideLoadingScreen(); hhPhase2Defaults(gameState); maybeShowWelcomeGuide();
    } catch (error) {
        console.error('[Halloween Haunt] Initial load failed:', error);
        hhShowOfflineMenu();
        if (navigator.onLine) { const message=document.getElementById('loadingMessage'); if(message) message.textContent='The game server could not be reached. You can retry or import a save for offline play.'; }
        if (retryButton) retryButton.hidden = false;
    }
}

function updateTimer(){if(!gameState)return;const now=Date.now(),start=Number(gameState.startsAt||Date.parse(START_Z)),end=Number(gameState.endsAt||Date.parse(DEADLINE_Z));isEventActive=now>=start&&now<end;const timer=document.getElementById('ui-timer'),label=timer?.previousSibling;if(!timer)return;if(now<start){if(label)label.textContent='Starts in: ';timer.textContent=eventDuration(start-now);}else if(now<end){if(label)label.textContent='Ends in: ';timer.textContent=eventDuration(end-now);}else{if(label)label.textContent='';timer.textContent='EVENT ENDED';}}
function eventDuration(ms){const t=Math.max(0,Math.floor(ms/1000)),d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60),s=t%60;return d>0?d+'d '+h+'h '+m+'m '+s+'s':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

async function syncCrew() {
 if (!gameState || !isEventActive || !(gameState.crew || []).length || document.visibilityState === 'hidden' || halloweenOfflineMode || crewSyncInFlight) return;
 // Crew production is time-based state. Send it directly instead of queueing it
 // behind player clicks/upgrades, then apply the authoritative response so the
 // basket and cash actually refresh in the open UI.
 if (pendingServerActions.length || syncInProgress) return;
 crewSyncInFlight = true;
 try {
  const result = await apiCall('?action=crew-sync', 'POST', {});
  if (result?.state) {
   crewSyncFailures = 0;
   if (!pendingServerActions.length && !halloweenOfflineMode) {
    gameState = cloneGameState(result.state);
    recalculateBasketCount();
    updateUI();
    renderCurrentModal();
   }
   return;
  }
  // Some browsers keep navigator.onLine=true when the network/API is unreachable.
  // After repeated transport/server failures, switch to the local simulator rather
  // than leaving the crew looking active while no production requests succeed.
  const status = Number(lastApiError?.status || 0);
  if (!navigator.onLine || !status || status >= 500) {
   crewSyncFailures++;
   if (crewSyncFailures >= 2 && gameState && !halloweenOfflineMode) {
    halloweenOfflineMode = true;
    try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
    showToast('Crew server sync failed. Continuing with local offline crew simulation.');
   }
  }
 } catch (error) {
  console.warn('[Halloween Haunt] Crew sync failed:', error);
 } finally {
  crewSyncInFlight = false;
 }
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
function handleBasketClick(e) {
    if (!gameState) { showToast("Halloween Haunt is still connecting."); return; }
    if (!isEventActive) { showToast("Event is not active."); return; }
    const perClick = Math.min(8, Math.max(1, Number(gameState.upgrades?.power?.level || 0) + 1));
    const confirmed = Math.max(0, Number(gameState.currentBasketCount) || 0);
    const pendingCandy = (pendingClicks + retryBatchClicks + inFlightClicks) * perClick;
    if (confirmed + pendingCandy >= Number(gameState.basketCapacity || 0)) { showToast("Basket is full! Sell candy to make room."); return; }
    for (let i = 0; i < perClick; i++) { const previewCandy = choosePreviewCandy(); if (previewCandy) spawnFallingCandy(previewCandy.id, e?.clientX, e?.clientY); }
    pendingClicks += 1; updateUI(); if(currentModal==='shops')renderCurrentModal();
    if (collectFlushTimer) clearTimeout(collectFlushTimer);
    collectFlushTimer = setTimeout(flushCollectQueue, 45);
}

async function flushCollectQueue() {
 if (autoSellInProgress || collectInFlight || pendingClicks <= 0 || !gameState) return;
 collectInFlight = true;
 const batch = Math.min(50, pendingClicks);
 pendingClicks -= batch;
 inFlightClicks = batch;
 const requestId = makeRequestId('collect');
 try {
  const perClick = Math.min(8, Math.max(1, Number(gameState.upgrades?.power?.level || 0) + 1));
  const room = Math.max(0, Number(gameState.basketCapacity || 50) - recalculateBasketCount());
  const collected = Math.min(room, batch * perClick);
  gameState.inventory ||= {};
  gameState.lifetimeCollected ||= {};
  gameState.discovered ||= [];
  gameState.stats ||= createDefaultStats();
  for (let i = 0; i < collected; i++) {
   const candy = choosePreviewCandy();
            hhPhase2Defaults(gameState);if(Math.random()<Math.min(.08,.003+Number(gameState.phase2.shardUpgrades.fortune||0)*.002+(candy.rarity==='Legendary'?.012:candy.rarity==='Epic'?.004:0)))gameState.soulShards++;
   gameState.inventory[candy.id] = Number(gameState.inventory[candy.id] || 0) + 1;
   gameState.lifetimeCollected[candy.id] = Number(gameState.lifetimeCollected[candy.id] || 0) + 1;
   gameState.feedCandy = Number(gameState.feedCandy || 0) + 1;
   gameState.stats.totalCollected = Number(gameState.stats.totalCollected || 0) + 1;
   if (candy.rarity === 'Rare' || candy.rarity === 'Epic') gameState.stats.rareCollected = Number(gameState.stats.rareCollected || 0) + 1;
   if (candy.rarity === 'Legendary') gameState.stats.legendaryCollected = Number(gameState.stats.legendaryCollected || 0) + 1;
   if (!gameState.discovered.includes(candy.id)) gameState.discovered.push(candy.id);
  }
  gameState.stats.totalClicks = Number(gameState.stats.totalClicks || 0) + batch;
  recalculateBasketCount();
  if (halloweenOfflineMode) {
   try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
  } else {
   queueServerAction('collect', { clickCount: batch, requestId });
  }
  inFlightClicks = 0;
  updateUI();
  renderCurrentModal();
  const retry = document.getElementById('collectRetry');
  if (retry) retry.hidden = true;
 } finally {
  collectInFlight = false;
  if (pendingClicks > 0) {
   if (collectFlushTimer) clearTimeout(collectFlushTimer);
   collectFlushTimer = setTimeout(flushCollectQueue, 0);
  }
 }
}

function retryCollectQueue() {
 const retry = document.getElementById('collectRetry');
 if (retry) retry.hidden = true;
 flushServerActionQueue();
}

function spawnFallingCandy(candyId, originX, originY) {
 const candy=getCandyObj(candyId);if(!candy)return;
 const el=document.createElement('img');el.src=IMG_BASE+candy.file;el.className='falling-candy rarity-'+candy.rarity.toLowerCase();
 const colors={common:'#ddd',uncommon:'#45d483',rare:'#4c9dff',epic:'#b66aff',legendary:'#ffc94a',mythic:'#ff5ca8'};
 const sizes={common:48,uncommon:52,rare:56,epic:60,legendary:66,mythic:70};
 const color=colors[candy.rarity.toLowerCase()]||'#ddd',size=sizes[candy.rarity.toLowerCase()]||52;
 el.style.setProperty('--rarity-color',color);
 el.style.filter='drop-shadow(0 0 2px '+color+') drop-shadow(0 0 7px '+color+') drop-shadow(0 0 14px '+color+'aa)';
 el.style.width=size+'px';el.style.height=size+'px';
 const basket=document.getElementById('basketHitbox');if(!basket)return;const rect=basket.getBoundingClientRect();
 const x=window.scrollX+rect.left+rect.width/2+(Math.random()-.5)*70;const y=window.scrollY+rect.top+rect.height*.22;
 const drift=(Math.random()<.5?-1:1)*(90+Math.random()*180);const lift=-(35+Math.random()*65);
 el.style.left=x+'px';el.style.top=y+'px';el.style.setProperty('--candy-drift',drift+'px');el.style.setProperty('--candy-lift',lift+'px');
 el.onerror=function(){this.src='/img/icon.png';};document.body.appendChild(el);setTimeout(()=>el.remove(),1450);
}

// ------------------------------------------------------------------
// UI Rendering
// ------------------------------------------------------------------
function updateUI() {
    if (!gameState) return;
    
    document.getElementById('ui-cash').innerText = formatCash(gameState.cash);

    const perClick = Math.min(8, Math.max(1, Number(gameState.upgrades?.power?.level || 0) + 1));
    const cap = gameState.basketCapacity;
    const count = Math.min(cap, Number(gameState.currentBasketCount || 0) + (pendingClicks + retryBatchClicks + inFlightClicks) * perClick);
    document.getElementById('ui-capacity-text').innerText = `${count} / ${cap}`;
    document.getElementById('ui-capacity-bar').style.width = `${Math.min(100, (count/cap)*100)}%`;
    syncOwnLeaderboardEntry();
}

function syncOwnLeaderboardEntry() {
    if (!gameState || !Array.isArray(leaderboardCache)) return;
    const me = leaderboardCache.find(entry => entry.accountId === gameState.accountId);
    const ownEntry = {
        accountId: gameState.accountId,
        displayName: gameState.displayName || me?.displayName || 'Player',
        cash: Math.max(0, Math.floor(Number(gameState.cash) || 0))
    };
    if (me) Object.assign(me, ownEntry);
    else leaderboardCache.push(ownEntry);
    leaderboardCache.sort((a, b) => b.cash - a.cash || String(a.displayName).localeCompare(String(b.displayName)));
    leaderboardCache = leaderboardCache.slice(0, 100);
    if (currentModal === 'leaderboard') renderLeaderboard(document.getElementById('modalBody'));
}

async function refreshLeaderboard() {
    const res = await apiCall('?action=leaderboard');
    if (!res || !Array.isArray(res.rankings)) return;
    leaderboardCache = res.rankings;
    syncOwnLeaderboardEntry();
    if (currentModal === 'leaderboard') renderLeaderboard(document.getElementById('modalBody'));
}

function openModal(type) {
    currentModal = type;
    document.querySelectorAll('.action-btn').forEach(button => button.classList.toggle('active', button.getAttribute('onclick') === `openModal('${type}')`));
    document.getElementById('hauntModalOverlay').classList.add('show');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    bodyEl.innerHTML = '<div style="text-align:center;">Loading...</div>';

    if (type === 'index') { titleEl.innerText = 'Candy Index'; renderIndex(bodyEl); }
    if (type === 'shops') { titleEl.innerText = 'Local Shops'; renderShops(bodyEl); }
    if (type === 'upgrades') { titleEl.innerText = 'Upgrades'; renderUpgrades(bodyEl); }
    if (type === 'crew') { titleEl.innerText = 'Trick-or-Treat Crew'; renderCrew(bodyEl); }
    if (type === 'stats') { titleEl.innerText = 'Player Stats'; renderStats(bodyEl); }
    if (type === 'leaderboard') { titleEl.innerText = 'Leaderboard'; renderLeaderboard(bodyEl); }
}

function closeModal() {
    currentModal = null;
    if (shopTimerInterval) {
        clearInterval(shopTimerInterval);
        shopTimerInterval = null;
    }
    document.querySelectorAll('.action-btn').forEach(button => button.classList.remove('active'));
    document.getElementById('hauntModalOverlay').classList.remove('show');
}


// ---- Encrypted save import/export and offline play ----
let halloweenOfflineMode = false;
let pendingSaveImport = null;
const HH_SAVE_MAGIC = 'BSMS-HALLOWEEN-HAUNT-SAVE';
const HH_SAVE_VERSION = 1;
const HH_OFFLINE_KEY = 'halloween_haunt_offline_save_v1';

function hhBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
function hhUnbase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function hhSaveKey(passphrase, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function hhShowDialog(title, body, buttons, options={}) {
    let dialog = document.getElementById('hhSaveDialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'hhSaveDialog';
        dialog.className = 'hh-save-dialog';
        dialog.innerHTML = '<section class="hh-save-dialog-card" role="dialog" aria-modal="true" aria-labelledby="hhSaveDialogTitle"><h2 id="hhSaveDialogTitle"></h2><div id="hhSaveDialogBody"></div><div id="hhSaveDialogActions"></div></section>';
        document.body.appendChild(dialog);
    }
    dialog.querySelector('#hhSaveDialogTitle').textContent = title;
    dialog.querySelector('#hhSaveDialogBody').innerHTML = body;
    const actions = dialog.querySelector('#hhSaveDialogActions');
    actions.replaceChildren();
    for (const item of buttons) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = item.primary ? 'buy-btn' : 'hh-save-secondary';
        button.textContent = item.label;
        button.addEventListener('click', async () => {
            if (item.action) await item.action(dialog);
            else dialog.hidden = true;
        });
        actions.appendChild(button);
    }
    dialog.hidden = false;
    const firstInput = dialog.querySelector('input');
    if (firstInput) firstInput.focus();
    return dialog;
}
async function hhManualSave(dialog) {
    const status = dialog?.querySelector('#hhSaveStatus');
    const setStatus = message => { if (status) status.textContent = message; };

    if (!gameState) {
        setStatus('Your game has not finished loading yet.');
        return;
    }
    if (halloweenOfflineMode || !navigator.onLine) {
        setStatus('You are offline. Your current progress cannot be saved to the server until your connection returns.');
        showToast('You are offline. Server saving is unavailable.');
        return;
    }
    if (window.hhManualSaveInProgress) return;
    window.hhManualSaveInProgress = true;
    setStatus('Saving pending actions and checking the server…');

    try {
        const deadline = Date.now() + 30000;
        while (pendingServerActions.length || syncInProgress) {
            if (!navigator.onLine) throw new Error('Connection lost before the save could finish.');
            if (Date.now() >= deadline) throw new Error('Saving is taking too long. Your pending actions will remain queued for retry.');
            if (!syncInProgress && pendingServerActions.length) {
                await flushServerActionQueue();
            } else {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const result = await apiCall('?action=state');
        if (!result?.state) throw new Error(lastApiError?.message || 'The server could not confirm your save.');

        gameState = cloneGameState(result.state);
        recalculateBasketCount();
        updateUI();
        renderCurrentModal();
        setStatus('Saved to the server just now.');
        showToast('Game progress saved to the server.');
    } catch (error) {
        const message = error?.message || 'Could not save your progress right now.';
        setStatus(message);
        showToast(message);
    } finally {
        window.hhManualSaveInProgress = false;
    }
}

function hhOpenSaveInfo() {
    hhShowDialog(
        'Game saving',
        '<p>Your progress automatically saves to the server every <strong>10 seconds</strong> while you are online.</p><p>You can also select <strong>Save now</strong> to send pending actions immediately and confirm that the latest server save is available.</p><p id="hhSaveStatus" role="status" aria-live="polite">Your game is saved automatically while you play.</p>',
        [
            { label: 'Save now', primary: true, action: async dialog => { await hhManualSave(dialog); } },
            { label: 'Close', action: async dialog => { dialog.hidden = true; } }
        ]
    );
}
window.hhOpenSaveInfo = hhOpenSaveInfo;

function hhValidateSaveState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('This save does not contain a valid game state.');
    if (!Number.isFinite(Number(state.cash)) || Number(state.cash) < 0) throw new Error('The save has an invalid cash value.');
    if (!state.inventory || typeof state.inventory !== 'object' || !Array.isArray(state.discovered) || !state.stats || typeof state.stats !== 'object') throw new Error('The save is missing required game data.');
    const validIds = new Set(CANDY_CATALOG.map(c => c.id));
    for (const [id, quantity] of Object.entries(state.inventory)) {
        if (!validIds.has(id) || !Number.isFinite(Number(quantity)) || Number(quantity) < 0 || Number(quantity) > 1000000) throw new Error('The save contains invalid candy inventory.');
    }
    if (state.discovered.some(id => !validIds.has(id))) throw new Error('The save contains an unknown candy type.');
    if (state.discovered.length > CANDY_CATALOG.length) throw new Error('The save contains too many discovered candies.');

    // Migrate older saves where crew used a 20-second collection interval.
    // The current server-created crew interval is 2 seconds; keeping the old
    // value made a 50-candy basket take nearly 17 minutes to fill.
    state.crew = Array.isArray(state.crew) ? state.crew : [];
    for (const worker of state.crew) {
        if (!worker || typeof worker !== 'object') continue;
        const oldInterval = Number(worker.intervalMs || 0);
        worker.intervalMs = !Number.isFinite(oldInterval) || oldInterval <= 0 || oldInterval >= 10000 ? 2000 : Math.max(500, oldInterval);
        worker.inventory = worker.inventory && typeof worker.inventory === 'object' ? worker.inventory : {};
        worker.inventoryCount = Object.values(worker.inventory).reduce((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0);
        worker.workMs = Math.max(0, Number(worker.workMs) || 0);
        worker.awakeMs = Math.max(0, Number(worker.awakeMs) || 0);
        worker.fedUntil = Math.max(0, Number(worker.fedUntil) || 0);
        worker.sellReadyAt = Math.max(0, Number(worker.sellReadyAt) || 0);
        worker.lastActionAt = Number(worker.lastActionAt) || Date.now();
    }
    return state;
}
async function hhExportSave() {
    if (!gameState) return showToast('There is no loaded game save to export.');
    hhShowDialog('Encrypt your save', '<p>Choose a passphrase. You will need the same passphrase to import this file later.</p><label class="hh-save-label" for="hhSavePass">Passphrase</label><input id="hhSavePass" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"><p class="hh-save-note">Keep the passphrase somewhere safe. It cannot be recovered if lost.</p>', [
        {label:'Cancel'},
        {label:'Export .txt',primary:true,action:async dialog=>{
            const pass=dialog.querySelector('#hhSavePass').value;
            if(pass.length<8){dialog.querySelector('#hhSavePass').setCustomValidity('Use at least 8 characters.');dialog.querySelector('#hhSavePass').reportValidity();return;}
            try {
                const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
                const key=await hhSaveKey(pass,salt);
                const payload={format:HH_SAVE_MAGIC,version:HH_SAVE_VERSION,createdAt:new Date().toISOString(),state:cloneGameState(gameState)};
                const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload)));
                const fileText=JSON.stringify({format:HH_SAVE_MAGIC,version:HH_SAVE_VERSION,algorithm:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:250000,salt:hhBase64(salt),iv:hhBase64(iv),data:hhBase64(new Uint8Array(encrypted))},null,2);
                const url=URL.createObjectURL(new Blob([fileText],{type:'text/plain;charset=utf-8'}));
                const link=document.createElement('a');link.href=url;link.download='halloween-haunt-save.txt';link.click();URL.revokeObjectURL(url);
                dialog.hidden=true;showToast('Encrypted save exported.');
            } catch(error) { showToast('Could not encrypt this save in your browser.'); }
        }}
    ]);
}
async function hhReadSaveFile(file) {
    if (!file || file.size > 5*1024*1024) throw new Error('Choose a save file smaller than 5 MB.');
    const envelope=JSON.parse(await file.text());
    if(envelope.format!==HH_SAVE_MAGIC||envelope.version!==HH_SAVE_VERSION||envelope.algorithm!=='AES-GCM'||envelope.kdf!=='PBKDF2-SHA256') throw new Error('This is not a supported Halloween Haunt save file.');
    const salt=hhUnbase64(envelope.salt),iv=hhUnbase64(envelope.iv),data=hhUnbase64(envelope.data);
    const dialog=hhShowDialog('Unlock save file','<p>Enter the passphrase used when this save was exported.</p><label class="hh-save-label" for="hhImportPass">Passphrase</label><input id="hhImportPass" type="password" autocomplete="current-password" placeholder="Save passphrase">',[
        {label:'Cancel',action:async d=>{d.hidden=true;pendingSaveImport=null;}},
        {label:'Unlock save',primary:true,action:async d=>{
            const pass=d.querySelector('#hhImportPass').value;
            try {
                const key=await hhSaveKey(pass,salt);
                const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data);
                const payload=JSON.parse(new TextDecoder().decode(clear));
                if(payload.format!==HH_SAVE_MAGIC||payload.version!==HH_SAVE_VERSION) throw new Error('Unsupported save version.');
                pendingSaveImport=hhValidateSaveState(payload.state);
                d.hidden=true;
                hhConfirmImport();
            } catch(error) {
                d.querySelector('#hhImportPass').setCustomValidity('Passphrase is incorrect or the save file is damaged.');
                d.querySelector('#hhImportPass').reportValidity();
            }
        }}
    ]);
}
function hhConfirmImport() {
    if(!pendingSaveImport)return;
    const offline=!navigator.onLine;
    const body=offline
      ? '<p>You are <strong>OFFLINE</strong>. This loads the save only on this device. It will not update the online account while offline.</p><p>Continue with this imported save?</p>'
      : '<p>This will replace the currently loaded save'+(halloweenOfflineMode?' on this device':' on the server')+'. Export a backup first if you want to keep the current progress.</p><p>The imported file is encrypted, but save values are not a cheat-proof proof of progress. Server-side checks still apply.</p>';
    hhShowDialog(offline?'Load offline save':'Replace current save',body,[
      {label:'Cancel',action:async d=>{d.hidden=true;pendingSaveImport=null;}},
      {label:offline?'Load on this device':'Replace save',primary:true,action:async d=>{
        const imported=pendingSaveImport;d.hidden=true;pendingSaveImport=null;
        try {
          if(!navigator.onLine||halloweenOfflineMode){
            gameState=cloneGameState(imported);halloweenOfflineMode=true;
            localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(gameState));
            updateUI();hideLoadingScreen();setLoadingMessage('Offline save loaded.');
            showToast('Offline save loaded on this device.');
            if(currentModal==='stats')renderStats(document.getElementById('modalBody'));
          } else {
            const result=await apiCall('?action=import-save','POST',{saveState:imported});
            if(result?.state){gameState=result.state;updateUI();if(currentModal==='stats')renderStats(document.getElementById('modalBody'));showToast('Server save replaced successfully.');}
          }
        } catch(error) { showToast(error.message||'Could not import this save.'); }
      }}
    ]);
}
function hhChooseImportFile() {
    let picker=document.getElementById('hhSaveFileInput');
    if(!picker){picker=document.createElement('input');picker.id='hhSaveFileInput';picker.type='file';picker.accept='.txt,text/plain';picker.hidden=true;document.body.appendChild(picker);
      picker.addEventListener('change',async()=>{const file=picker.files?.[0];picker.value='';if(!file)return;try{await hhReadSaveFile(file);}catch(error){hhShowDialog('Could not read save','<p>'+escapeHtml(error.message||'The save file could not be read.')+'</p>',[{label:'Close',primary:true}]);}});
    }
    picker.click();
}
function hhShowOfflineMenu() {
    halloweenOfflineMode=true;
    const message=document.getElementById('loadingMessage');
    if(message)message.textContent='You are OFFLINE. Import an encrypted save file to continue on this device.';
    const retry=document.getElementById('loadingRetry');
    if(retry){retry.hidden=false;retry.textContent='Try connecting again';}
    const importButton=document.getElementById('offlineImportButton');
    if(importButton)importButton.hidden=false;
}

async function hhOfferOfflineSync() {
    if (!halloweenOfflineMode || !gameState || !navigator.onLine || document.getElementById('hhSaveDialog')?.hidden===false) return;
    hhShowDialog('Connection restored', '<p>Your offline progress is saved on this device. Would you like to replace your online server save with this offline version?</p><p><strong>This replaces the online save.</strong> Nothing will upload unless you choose the replace option.</p>', [
      {label:'Keep playing offline',action:async d=>{d.hidden=true;}},
      {label:'Replace server save',primary:true,action:async d=>{
        const localState=cloneGameState(gameState);d.hidden=true;
        halloweenOfflineMode=false;
        const result=await apiCall('?action=import-save','POST',{saveState:localState});
        if(result?.state){
          gameState=result.state;
          try{localStorage.removeItem(HH_OFFLINE_KEY);}catch(_){}
          updateUI();if(currentModal==='stats')renderStats(document.getElementById('modalBody'));
          showToast('Offline save uploaded and server save replaced.');
        } else {
          halloweenOfflineMode=true;
          showToast('Could not upload offline save. Your local copy is still available.');
        }
      }}
    ]);
}

function hhOfflineCrewTick() {
    if (!halloweenOfflineMode || !gameState || !Array.isArray(gameState.crew) || !gameState.crew.length) return;
    const now = Date.now();
    const start = Number(gameState.startsAt || Date.parse(START_Z));
    const end = Number(gameState.endsAt || Date.parse(DEADLINE_Z));
    if (now < start || now >= end) return;

    const previous = Number(gameState._offlineCrewTickAt || now - 1000);
    const elapsed = Math.min(10000, Math.max(0, now - previous));
    gameState._offlineCrewTickAt = now;
    if (!elapsed) return;

    gameState.stats ||= createDefaultStats();
    gameState.inventory ||= {};
    gameState.discovered ||= [];
    gameState.lifetimeCollected ||= {};
    gameState.feedCandy = Number(gameState.feedCandy || 0);
    let changed = false;

    for (const worker of gameState.crew) {
        worker.inventory ||= {};
        worker.capacity = Math.max(1, Number(worker.capacity || 50));
        worker.inventoryCount = Object.values(worker.inventory).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
        worker.workMs = Number(worker.workMs || 0);
        worker.awakeMs = Number(worker.awakeMs || 0);
        worker.fedUntil = Number(worker.fedUntil || 0);
        worker.sellReadyAt = Number(worker.sellReadyAt || 0);
        const savedInterval = Number(worker.intervalMs || 0);
        worker.intervalMs = !Number.isFinite(savedInterval) || savedInterval <= 0 || savedInterval >= 10000
            ? 2000
            : Math.max(500, savedInterval);
        // Keep the UI's "next candy" countdown aligned with this local work tick.
        worker.lastActionAt = now;

        hhPhase2Defaults(gameState);if(worker.asleep&&Number(gameState.phase2.managerLevel||0)){worker.asleep=false;worker.awakeMs=0;}if(Number(gameState.phase2.managerLevel||0)&&Number(gameState.feedCandy||0)>=Math.max(1,Number(gameState.basketCapacity||50)*10)&&Number(worker.fedUntil||0)<=now){gameState.feedCandy-=Math.max(1,Number(gameState.basketCapacity||50)*10);worker.fedUntil=now+1200000;worker.asleep=false;worker.awakeMs=0;changed=true;}
        if (worker.asleep) continue;
        const fed = worker.fedUntil > now;
        if (!fed) {
            worker.awakeMs += elapsed;
            if (worker.awakeMs >= 300000 + Number(worker.awakeLevel || 0) * 60000) {
                worker.asleep = true;
                changed = true;
                continue;
            }
        }

        const capacity = Math.max(1, Math.floor(worker.capacity * (fed ? 1.25 : 1)));
        const interval = Math.max(500, worker.intervalMs * (fed ? 0.75 : 1));
        worker.workMs += elapsed;
        const ticks = Math.min(10, Math.floor(worker.workMs / interval));
        worker.workMs -= ticks * interval;

        for (let tick = 0; tick < ticks; tick++) {
            const held = Object.values(worker.inventory).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
            if (held >= capacity) break;
            const candy = choosePreviewCandy();
            const basePower = Math.min(8, 1 + Number(worker.powerLevel || 0));
            const power = Math.min(capacity - held, basePower + (fed ? Math.max(1, Math.ceil(basePower * 0.25)) : 0));
            worker.inventory[candy.id] = Number(worker.inventory[candy.id] || 0) + power;
            worker.inventoryCount = held + power;
            worker.collectedCount = Number(worker.collectedCount || 0) + power;
            gameState.stats.crewCollected = Number(gameState.stats.crewCollected || 0) + power;
            gameState.stats.totalCollected = Number(gameState.stats.totalCollected || 0) + power;
            gameState.feedCandy += power;
            gameState.lifetimeCollected[candy.id] = Number(gameState.lifetimeCollected[candy.id] || 0) + power;
            if (!gameState.discovered.includes(candy.id)) gameState.discovered.push(candy.id);
            if (candy.rarity === 'Rare' || candy.rarity === 'Epic') gameState.stats.rareCollected = Number(gameState.stats.rareCollected || 0) + power;
            if (candy.rarity === 'Legendary') gameState.stats.legendaryCollected = Number(gameState.stats.legendaryCollected || 0) + power;
            changed = true;
        }

        worker.inventoryCount = Object.values(worker.inventory).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
        if (worker.inventoryCount >= capacity && !worker.sellReadyAt) {
            worker.sellReadyAt = now + Math.max(4000, 20000 - 2000 * Number(worker.speedLevel || 0)) * (fed ? 0.75 : 1);
            changed = true;
        }
        if (worker.sellReadyAt && now >= worker.sellReadyAt && worker.inventoryCount > 0) {
            let earned = 0, sold = 0;
            for (const candy of CANDY_CATALOG) {
                const qty = Math.max(0, Math.floor(Number(worker.inventory[candy.id] || 0)));
                if (!qty) continue;
                const bestShopPrice = Math.max(0, ...(gameState.shops || []).map(shop => Number(shop.prices?.[candy.id] || 0)));
                const catalogPrice = Number(gameState.candyCatalog?.find(item => item.id === candy.id)?.bestPrice || 0);
                earned += qty * Math.max(1, bestShopPrice || catalogPrice || 1);
                sold += qty;
                worker.inventory[candy.id] = 0;
            }
            if (sold > 0) {
                gameState.cash = Number(gameState.cash || 0) + earned;
                gameState.stats.lifetimeCash = Number(gameState.stats.lifetimeCash || 0) + earned;
                gameState.stats.crewSold = Number(gameState.stats.crewSold || 0) + sold;
                gameState.stats.totalSold = Number(gameState.stats.totalSold || 0) + sold;
                worker.moneyEarned = Number(worker.moneyEarned || 0) + earned;
                worker.inventoryCount = 0;
                worker.sellReadyAt = 0;
                changed = true;
            }
        }
    }

    if (changed) {
        try { localStorage.setItem(HH_OFFLINE_KEY, JSON.stringify(gameState)); } catch (_) {}
        updateUI();
        if (currentModal === 'crew' || currentModal === 'stats' || currentModal === 'index') renderCurrentModal();
    }
}
setInterval(hhOfflineCrewTick, 1000);

function hhPhase2Defaults(state=gameState){if(!state)return;state.soulShards=Math.max(0,Number(state.soulShards)||0);state.phase2 ||= {shopLevels:{},managerLevel:0,shardUpgrades:{luck:0,fortune:0}};state.phase2.shopLevels ||= {};state.phase2.shardUpgrades ||= {};state.shops ||= [];const baseShops=[['diner','Witchlight Diner',1.18],['bazaar','Graveyard Bazaar',1.25]];for(const [id,name,mult] of baseShops)if(!state.shops.some(x=>x.id===id)){const prices={};for(const candy of CANDY_CATALOG)prices[candy.id]=Math.max(1,Math.round(Number(state.candyCatalog?.find(x=>x.id===candy.id)?.bestPrice||candy.baseValue||1)*mult));state.shops.push({id,name,prices});}for(const shop of (state.shops||[]))state.phase2.shopLevels[shop.id]=Math.max(0,Math.min(5,Number(state.phase2.shopLevels[shop.id])||0));for(const key of ['luck','fortune'])state.phase2.shardUpgrades[key]=Math.max(0,Math.min(10,Number(state.phase2.shardUpgrades[key])||0));}
function hhOfflineApi(endpoint,method,payload) {
    const action=(endpoint.split('action=')[1]||'state').split('&')[0];
    const s=gameState;
    if(action==='leaderboard')return Promise.resolve({rankings:[]});
    if(action==='state')return Promise.resolve({state:s});
    if(!s)return Promise.resolve(null);
    if(action==='crew-pause')return Promise.resolve({state:s});
    hhPhase2Defaults(s);
    if(action==='phase2'){const type=String(payload?.type||'');let cost=0;if(type==='shop-upgrade'){const id=String(payload?.shopId||''),shop=(s.shops||[]).find(x=>x.id===id),costs=[50000,75000,110000,160000,230000],level=Number(s.phase2.shopLevels[id]||0);if(!shop)return Promise.resolve({state:s,error:'Unknown shop.'});if(level>=5||Number(s.cash||0)<costs[level])return Promise.resolve({state:s,error:level>=5?'This shop is fully upgraded.':'Not enough cash for this shop upgrade.'});cost=costs[level];s.cash-=cost;s.stats.cashSpent=Number(s.stats.cashSpent||0)+cost;s.phase2.shopLevels[id]=level+1;const ratio=(1+(level+1)*.12)/(1+level*.12);for(const candyId of Object.keys(shop.prices||{}))shop.prices[candyId]=Math.max(1,Math.round(Number(shop.prices[candyId]||1)*ratio));}else if(type==='manager'){if(s.phase2.managerLevel)return Promise.resolve({state:s,error:'You already hired the Crew Manager.'});cost=250000;if(Number(s.cash||0)<cost)return Promise.resolve({state:s,error:'The Crew Manager costs $250,000.'});s.cash-=cost;s.stats.cashSpent=Number(s.stats.cashSpent||0)+cost;s.phase2.managerLevel=1;}else if(type==='shard-upgrade'){const id=String(payload?.upgradeId||''),level=Number(s.phase2.shardUpgrades[id]||0),base=id==='luck'?3:id==='fortune'?5:0;if(!base||level>=10)return Promise.resolve({state:s,error:'That Soul Shard upgrade is unavailable.'});cost=base+level*2;if(Number(s.soulShards||0)<cost)return Promise.resolve({state:s,error:'Not enough Soul Shards.'});s.soulShards-=cost;s.phase2.shardUpgrades[id]=level+1;}else if(type==='comeback-wheel'){if(Number(s.cash)>=100000)return Promise.resolve({state:s,error:'The Comeback Wheel is only for players under $100,000.'});if(s.phase2.comebackWheelClaimed)return Promise.resolve({state:s,error:'You already claimed your Comeback Wheel spin.'});const payout=(1+Math.floor(Math.random()*8))*10000;s.phase2.comebackWheelClaimed=true;s.cash+=payout;s.stats.lifetimeCash=Number(s.stats.lifetimeCash||0)+payout;localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(s));return Promise.resolve({state:s,comebackWheel:{payout}});}else if(type==='gamble'){const wager=Math.floor(Number(payload?.wager)||0);if(wager<10||wager>10000||wager>Number(s.cash||0))return Promise.resolve({state:s,error:'Choose a wager from $10 to $10,000 that you can afford.'});s.cash-=wager;s.stats.cashSpent=Number(s.stats.cashSpent||0)+wager;const roll=Math.random(),won=roll<.22,jackpot=roll<.025,payout=won?(jackpot?wager*8:wager*2):0;if(payout){s.cash+=payout;s.stats.lifetimeCash=Number(s.stats.lifetimeCash||0)+payout;}localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(s));return Promise.resolve({state:s,gamble:{won,jackpot,payout,wager}});}else return Promise.resolve({state:s,error:'Unknown Phase 2 action.'});if(cost)s.stats.upgradesBought=Number(s.stats.upgradesBought||0)+1;localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(s));return Promise.resolve({state:s,purchased:type,cost});}
    
    if(action==='shops')return Promise.resolve({state:s});
    if(action==='collect'){
      const count=Math.min(50,Math.max(1,Math.floor(Number(payload?.clickCount)||1))),per=Math.min(8,1+Number(s.upgrades?.power?.level||0));
      const room=Math.max(0,Number(s.basketCapacity||50)-Object.values(s.inventory||{}).reduce((a,n)=>a+Number(n||0),0));
      const n=Math.min(room,count*per);
      for(let i=0;i<n;i++){const candy=choosePreviewCandy();hhPhase2Defaults(s);if(Math.random()<Math.min(.08,.003+Number(s.phase2.shardUpgrades.fortune||0)*.002+(candy.rarity==='Legendary'?.012:candy.rarity==='Epic'?.004:0)))s.soulShards++;s.inventory[candy.id]=Number(s.inventory[candy.id]||0)+1;s.lifetimeCollected[candy.id]=Number(s.lifetimeCollected[candy.id]||0)+1;if(!s.discovered.includes(candy.id))s.discovered.push(candy.id);}
      s.stats.totalClicks=Number(s.stats.totalClicks||0)+count;s.stats.totalCollected=Number(s.stats.totalCollected||0)+n;
      recalculateBasketCount(s);localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(s));return Promise.resolve({state:s,drops:[]});
    }
    if(action==='sell'){
      let earned=0,sold=0;for(const candy of CANDY_CATALOG){const q=Math.max(0,Math.floor(Number(s.inventory?.[candy.id]||0)));if(q){const price=Math.max(1,...(s.shops||[]).map(shop=>Number(shop.prices?.[candy.id]||0)));earned+=q*price;sold+=q;s.inventory[candy.id]=0;}}
      s.cash=Number(s.cash||0)+earned;s.stats.lifetimeCash=Number(s.stats.lifetimeCash||0)+earned;s.stats.totalSold=Number(s.stats.totalSold||0)+sold;recalculateBasketCount(s);localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(s));return Promise.resolve({state:s,earned,sold});
    }
    if(action==='upgrade'){
      const type=String(payload?.type||''),cfg={capacity:[45,30],power:[60,20],luck:[90,15],autoSell:[5000,1]}[type],u=s.upgrades?.[type];
      if(!cfg||!u||Number(u.level)>=cfg[1])return Promise.resolve({state:s,error:'Upgrade unavailable offline.'});
      const cost=Math.floor(cfg[0]*Math.pow(1.62,Number(u.level)||0));if(Number(s.cash)<cost)return Promise.resolve({state:s,error:'Not enough cash.'});
      s.cash-=cost;s.stats.cashSpent=Number(s.stats.cashSpent||0)+cost;s.stats.upgradesBought=Number(s.stats.upgradesBought||0)+1;u.level++;u.nextCost=u.level>=cfg[1]?-1:Math.floor(cfg[0]*Math.pow(1.62,u.level));if(type==='capacity')s.basketCapacity=Math.min(500,Number(s.basketCapacity||50)+10);localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(s));return Promise.resolve({state:s,purchased:type,cost});
    }
    return Promise.resolve({state:s,offline:true});
}
// ---- Modals Implementation ----

function renderIndex(container) {
    const unlocked=gameState.discovered.length, percent=Math.round(unlocked/CANDY_CATALOG.length*100);
    container.innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px"><strong>Collection progress: ${unlocked}/${CANDY_CATALOG.length} (${percent}%)</strong><select id="indexRarity" style="background:#201a28;color:white;padding:8px;border-radius:10px;font:inherit"><option value="all">All rarities</option><option>Common</option><option>Uncommon</option><option>Rare</option><option>Epic</option><option>Legendary</option><option>Mythic</option></select><select id="indexProgress" style="background:#201a28;color:white;padding:8px;border-radius:10px;font:inherit"><option value="all">All candies</option><option value="unlocked">Discovered</option><option value="locked">Not discovered</option><option value="owned">Currently owned</option></select></div><div style="height:8px;background:rgba(255,255,255,.1);border-radius:8px;overflow:hidden;margin-bottom:18px"><div style="height:100%;width:${percent}%;background:var(--orange)"></div></div><div class="candy-grid" id="candyIndexGrid"></div>`;
    const grid=container.querySelector('#candyIndexGrid');
    const draw=()=>{const rarity=container.querySelector('#indexRarity').value, progress=container.querySelector('#indexProgress').value;
      const list=CANDY_CATALOG.filter(c=>{const found=gameState.discovered.includes(c.id),crew=(gameState.crew||[]).reduce((n,h)=>n+Number((h.inventory||{})[c.id]||0),0),qty=Number(gameState.inventory[c.id]||0)+crew;return (rarity==='all'||c.rarity===rarity)&&(progress==='all'||(progress==='unlocked'&&found)||(progress==='locked'&&!found)||(progress==='owned'&&qty>0));});
      grid.innerHTML=list.map(c=>{const found=gameState.discovered.includes(c.id),crew=(gameState.crew||[]).reduce((n,h)=>n+Number((h.inventory||{})[c.id]||0),0),qty=Number(gameState.inventory[c.id]||0)+crew,lifetime=Number((gameState.lifetimeCollected||{})[c.id]||0),best=gameState.candyCatalog?.find(x=>x.id===c.id)?.bestPrice||c.baseValue||0;return `<div class="candy-card rarity-${c.rarity.toLowerCase()} ${found?'':'locked'}" style="cursor:default;--rarity-color:${({Common:'#ddd',Uncommon:'#45d483',Rare:'#4c9dff',Epic:'#b66aff',Legendary:'#ffc94a',Mythic:'#ff5ca8'})[c.rarity]||'#ddd'}"><img loading="lazy" src="${IMG_BASE}${c.file}" alt="${found?c.name:'Undiscovered candy'}" onerror="this.style.visibility='hidden'"><div>${found?c.name:'???'}</div><div class="qty">${c.rarity}</div><div class="qty">Owned: ${qty}</div><div class="qty">Lifetime: ${lifetime}</div><div class="qty">Best: ${formatCash(best)}</div></div>`;}).join('')||'<p>No candies match these filters.</p>';
    };
    container.querySelector('#indexRarity').addEventListener('change',draw);container.querySelector('#indexProgress').addEventListener('change',draw);draw();
}
function renderShops(container) {
 const s=gameState,inventory=s.inventory||{},rows=CANDY_CATALOG.map(c=>{const qty=Math.max(0,Number(inventory[c.id])||0),prices=(s.shops||[]).map(shop=>({name:shop.name,price:Number(shop.prices?.[c.id]||0)})).sort((a,b)=>b.price-a.price),best=prices[0]?.price||0;return {c,qty,best,total:qty*best};}).filter(x=>x.qty>0);
 const count=rows.reduce((n,x)=>n+x.qty,0),total=rows.reduce((n,x)=>n+x.total,0),seconds=Math.max(0,Math.ceil((Number(s.offerRefreshAt||Date.now())-Date.now())/1000));
 container.innerHTML='<section class="hh-card-ui"><div class="hh-card-heading"><h3>Sell all your candy</h3><span class="hh-badge">BEST PRICE AUTOMATICALLY</span></div><p class="hh-muted">Your entire player basket is sold in one transaction. The game automatically chooses the highest-paying shop for each candy. You cannot choose a shop or sell only selected candy.</p><div class="hh-summary-grid"><div class="hh-stat-card"><small>Candy in basket</small><strong>'+count.toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Estimated payout</small><strong>'+formatCash(total)+'</strong></div><div class="hh-stat-card"><small>Offers refresh in</small><strong>'+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+'</strong></div></div><button class="buy-btn" id="hhSellAllButton" '+(count===0?'disabled':'')+'>Sell All Candy · '+formatCash(total)+'</button></section><section class="hh-card-ui"><div class="hh-card-heading"><h3>Sale breakdown</h3><span class="hh-badge">'+rows.length+' CANDY TYPES</span></div>'+(rows.length?'<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:9px">Candy</th><th style="text-align:right;padding:9px">Quantity</th><th style="text-align:right;padding:9px">Best price each</th><th style="text-align:right;padding:9px">Subtotal</th></tr></thead><tbody>'+rows.map(x=>'<tr style="border-top:1px solid #ffffff16"><td style="padding:9px">'+escapeHTML(x.c.name)+'<div class="hh-muted">'+escapeHTML(x.c.rarity)+'</div></td><td style="text-align:right;padding:9px">'+x.qty+'</td><td style="text-align:right;padding:9px">'+formatCash(x.best)+'</td><td style="text-align:right;padding:9px">'+formatCash(x.total)+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="3" style="text-align:right;padding:10px">Estimated total</th><th style="text-align:right;padding:10px">'+formatCash(total)+'</th></tr></tfoot></table></div>':'<p class="hh-muted">Your basket is empty. Click the pumpkin to collect candy.</p>')+'</section>';
 renderPhase2ShopUpgrades(container);
 container.querySelector('#hhSellAllButton')?.addEventListener('click',()=>window.executeSellAll());
}
window.executeSellAll = async function() {
 const count=Object.values(gameState?.inventory||{}).reduce((n,q)=>n+Math.max(0,Number(q)||0),0);
 if(!count){showToast('Your basket is empty. Collect candy before selling.');return;}
 await performOptimisticAction('?action=sell',{},state=>{
  let earned=0;
  for(const candy of CANDY_CATALOG){const qty=Math.max(0,Number(state.inventory[candy.id])||0);if(!qty)continue;const shop=[...(state.shops||[])].sort((a,b)=>Number(b.prices?.[candy.id]||0)-Number(a.prices?.[candy.id]||0))[0];earned+=qty*Number(shop?.prices?.[candy.id]||0);state.inventory[candy.id]=0;}
  state.cash=Number(state.cash||0)+earned;state.currentBasketCount=0;
 },r=>'Sold '+(r.sold||count)+' candies for '+formatCash(r.earned||0)+'.');
}

window.executeAutoSell = async function() {
 if (autoSellInProgress || !gameState || Number(gameState.upgrades?.autoSell?.level || 0) <= 0) return;
 if (pendingClicks > 0 && !collectInFlight) await flushCollectQueue();
 if (collectInFlight || pendingClicks > 0) return;

 autoSellInProgress = true;
 try {
  recalculateBasketCount();
  const count = Number(gameState.currentBasketCount || 0);
  const capacity = Math.max(1, Number(gameState.basketCapacity || 50));
  // The collect command is already queued before this sale, so the server
  // processes collection and auto-sale in the same ordered background sync.
  if (Number(gameState.upgrades?.autoSell?.level || 0) > 0 && count >= capacity) {
   await window.executeSellAll();
  }
 } finally {
  autoSellInProgress = false;
  if (pendingClicks > 0 && !collectInFlight) {
   if (collectFlushTimer) clearTimeout(collectFlushTimer);
   collectFlushTimer = setTimeout(flushCollectQueue, 0);
  }
 }
};

function renderPhase2ShopUpgrades(container) {
 hhPhase2Defaults(gameState);
 const state=gameState, costs=[50000,75000,110000,160000,230000];
 const cards=(state.shops||[]).map(shop=>{
  const level=Math.max(0,Math.min(5,Number(state.phase2.shopLevels?.[shop.id]||0)));
  const cost=costs[level];
  const bestPrice=Math.max(0,...CANDY_CATALOG.map(c=>Number(shop.prices?.[c.id]||0)));
  return '<article class="hh-card-ui"><div class="hh-card-heading"><h3>'+escapeHTML(shop.name)+'</h3><span class="hh-badge">LEVEL '+level+'/5</span></div><p class="hh-muted">Upgrade this shop to increase its candy offers by 12% per level. Highest current offer: '+formatCash(bestPrice)+'.</p><button class="buy-btn" type="button" data-shop-upgrade="'+escapeHTML(shop.id)+'" '+(level>=5||Number(state.cash)<cost?'disabled':'')+'>'+(level>=5?'MAXED':'Upgrade · '+formatCash(cost))+'</button></article>';
 }).join('');
 container.insertAdjacentHTML('beforeend','<section class="hh-card-ui"><div class="hh-card-heading"><h3>Phase 2 · Shop Improvements</h3><span class="hh-badge">ALL SHOPS</span></div><p class="hh-muted">Witchlight Diner and Graveyard Bazaar appear here alongside the original shops. Each shop can be upgraded independently, and the best-paying shop is still selected automatically.</p><div class="hh-upgrade-grid">'+cards+'</div></section>');
 container.querySelectorAll('[data-shop-upgrade]').forEach(button=>button.addEventListener('click',()=>window.executePhase2('shop-upgrade',{shopId:button.dataset.shopUpgrade})));
}

function renderUpgrades(container) {
 const upg=gameState.upgrades||{};
 const list=[
  {id:'capacity',name:'Basket Capacity',desc:'Increase how much candy you can carry.',cost:Number(upg.capacity?.nextCost??45),level:Number(upg.capacity?.level||0),one:false},
  {id:'power',name:'Click Power',desc:'Collect more candy with each pumpkin click.',cost:Number(upg.power?.nextCost??60),level:Number(upg.power?.level||0),one:false},
  {id:'luck',name:'Candy Luck',desc:'Improve your chance of finding rarer candy.',cost:Number(upg.luck?.nextCost??90),level:Number(upg.luck?.level||0),one:false},
  {id:'autoSell',name:'Auto Sell',desc:'One-time unlock for $5,000. When your player basket reaches capacity, wait one second and the whole basket sells automatically to the best-paying shop.',cost:5000,level:Number(upg.autoSell?.level||0),one:true}
 ];
 container.innerHTML='<div class="hh-upgrade-grid">'+list.map(u=>'<section class="hh-card-ui"><div class="hh-card-heading"><h3>'+u.name+'</h3><span class="hh-badge">'+(u.one?(u.level>0?'UNLOCKED':'ONE-TIME UNLOCK'):'LEVEL '+u.level)+'</span></div><p class="hh-muted">'+u.desc+'</p><button class="buy-btn" data-hh-player-upgrade="'+u.id+'" '+(u.level>0&&u.one?'disabled':Number(gameState.cash)<u.cost?'disabled':'')+'>'+(u.level>0&&u.one?'Unlocked':u.cost===-1?'MAXED':'Buy · '+formatCash(u.cost))+'</button></section>').join('')+'</div>';
 container.querySelectorAll('[data-hh-player-upgrade]').forEach(b=>b.addEventListener('click',()=>window.executeUpgrade(b.dataset.hhPlayerUpgrade)));
 hhPhase2Defaults(gameState);
 const shards=Number(gameState.soulShards||0),p=gameState.phase2;
 const shardCards=[['luck','Shard Luck',3,'Improves the odds of finding rare candy.'],['fortune','Shard Fortune',5,'Improves Soul Shard drops and slightly boosts shop value.']].map(([id,label,base,desc])=>{
  const level=Number(p.shardUpgrades[id]||0),cost=base+level*2;
  return '<article class="hh-card-ui"><div class="hh-card-heading"><h3>'+label+'</h3><span class="hh-badge">LEVEL '+level+'/10</span></div><p class="hh-muted">'+desc+'</p><button class="buy-btn" type="button" data-shard-upgrade="'+id+'" '+(level>=10||shards<cost?'disabled':'')+'>'+(level>=10?'MAXED':'Upgrade · '+cost+' Soul Shards')+'</button></article>';
 }).join('');
 container.insertAdjacentHTML('beforeend','<section class="hh-card-ui"><div class="hh-card-heading"><h3>Soul Shard Research</h3><span class="hh-badge">'+shards.toLocaleString()+' SHARDS</span></div><p class="hh-muted">Soul Shards are earned from rare drops. Spend them here to improve your collection.</p><div class="hh-upgrade-grid">'+shardCards+'</div></section>');
 container.querySelectorAll('[data-shard-upgrade]').forEach(button=>button.addEventListener('click',()=>window.executePhase2('shard-upgrade',{upgradeId:button.dataset.shardUpgrade})));
}
window.executeUpgrade=async function(type){
 const cost=type==='autoSell'?5000:Number(gameState?.upgrades?.[type]?.nextCost||0);
 if(type==='autoSell'&&Number(gameState?.upgrades?.autoSell?.level||0)>0){showToast('Auto Sell is already unlocked.');return;}
 if(Number(gameState?.cash||0)<cost){showToast('You need '+formatCash(cost)+' to buy this upgrade.');return;}
 await performOptimisticAction('?action=upgrade',{type},state=>{
  const u=state.upgrades?.[type];if(!u)return;
  const actualCost=type==='autoSell'?5000:Number(u.nextCost||cost);
  if(type==='autoSell'&&Number(u.level||0)>0)return;
  if(Number(state.cash)<actualCost)return;
  state.cash-=actualCost;state.stats.cashSpent=Number(state.stats.cashSpent||0)+actualCost;state.stats.upgradesBought=Number(state.stats.upgradesBought||0)+1;u.level=type==='autoSell'?1:Number(u.level||0)+1;u.nextCost=type==='autoSell'?-1:Math.floor(({capacity:45,power:60,luck:90}[type]||60)*Math.pow(1.62,u.level));
  if(type==='capacity')state.basketCapacity=Math.min(500,Number(state.basketCapacity||50)+10);
 },()=>'Upgrade purchased!');
}
function renderCrew(container) {
    if(!container) container = document.getElementById('modalBody');
    if(!gameState.crewUnlocked) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px;">
                <h3 style="color:var(--red-hot); margin-bottom:10px;">Hire Trick-or-Treat Crew</h3>
                <p style="color:var(--fg2); margin-bottom:20px;">Helpers collect candy automatically while you are playing.</p>
                <button class="buy-btn" ${gameState.cash < gameState.crewHireCost ? 'disabled' : ''} onclick="executeCrew('hire')">
                    Hire First Helper (${formatCash(gameState.crewHireCost)})
                </button>
            </div>
        `;
        return;
    }
    
    // Render hired crew
    let html = `<div class="upgrade-list">`;
    gameState.crew.forEach((c, idx) => {
        html += `
            <div class="upgrade-row" style="flex-direction:column; align-items:flex-start;">
                <div style="width:100%; display:flex; justify-content:space-between; gap:12px; margin-bottom:10px;">
                    <h3 style="color:var(--orange);">Helper #${idx+1}</h3>
                    <span style="color:var(--fg2);">Holding: ${c.inventoryCount}/${c.capacity}</span>
                </div>
                <div style="color:var(--fg2);font-size:15px;margin-bottom:10px;">Collection interval: ${(Number(c.intervalMs||12000)/1000).toFixed(1)}s while active. ${Object.entries(c.inventory||{}).filter(([,qty])=>Number(qty)>0).map(([id,qty])=>{const candy=getCandyObj(id);return (candy?candy.name:id)+' × '+qty;}).join(' · ') || 'Inventory empty.'}</div>
                <div style="width:100%; display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="buy-btn" style="flex:1; font-size:16px;" ${c.speedUpgradeCost===-1 || gameState.cash < c.speedUpgradeCost ? 'disabled' : ''} onclick="executeCrew('upgrade_speed', ${idx})">
                        ${c.speedUpgradeCost===-1?'Speed MAXED':'Speed Up ('+formatCash(c.speedUpgradeCost)+')'}
                    </button>
                    <button class="buy-btn" style="flex:1; font-size:16px;" ${c.capUpgradeCost===-1 || gameState.cash < c.capUpgradeCost ? 'disabled' : ''} onclick="executeCrew('upgrade_cap', ${idx})">
                        ${c.capUpgradeCost===-1?'Capacity MAXED':'Capacity Up ('+formatCash(c.capUpgradeCost)+')'}
                    </button>
                </div>
            </div>
        `;
    });
    
    if (gameState.crew.length < 5) { // Assuming max 5 helpers
        html += `
            <button class="buy-btn" style="margin-top:15px; width:100%;" ${gameState.cash < gameState.crewHireCost ? 'disabled' : ''} onclick="executeCrew('hire')">
                Hire Another Helper (${formatCash(gameState.crewHireCost)})
            </button>
        `;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

window.executeCrew=async function(action,index=0){
 const names=['Jack','Misty','Boo','Candy','Pumpkin','Raven','Cocoa','Hex','Maple','Ember','Cobweb','Midnight','Toffee','Salem','Patches','Wick','Hocus','Mallow','Fable','Trick'];
 const worker=gameState?.crew?.[index];
 if(action==='hire'){
  if((gameState.crew||[]).length>=20){showToast('Your crew is already at the maximum of 20.');return;}
  if(Number(gameState.cash)<Number(gameState.crewHireCost)){showToast('You need '+formatCash(gameState.crewHireCost)+' to hire the next crew member.');return;}
 } else if(!worker){showToast('That crew member could not be found.');return;}
 if(action==='feed'){
  const need=10*Number(gameState.basketCapacity||50),held=Number(gameState.feedCandy||0);
  if(Number(worker.fedUntil||0)>Date.now()){showToast('This crew member is already fed.');return;}
  if(held<need){showToast('You need '+need+' candy to feed '+(worker.name||names[index])+'.');return;}
 }
 const upgradeMap={upgrade_capacity:'capacityLevel',upgrade_power:'powerLevel',upgrade_luck:'luckLevel',upgrade_speed:'speedLevel',upgrade_awake:'awakeLevel'};
 const bases={capacityLevel:65,powerLevel:80,luckLevel:95,speedLevel:75,awakeLevel:100};
 const mults={capacityLevel:1.65,powerLevel:1.65,luckLevel:1.65,speedLevel:1.7,awakeLevel:1.8},key=upgradeMap[action];
 if(key){const cost=Math.floor(bases[key]*Math.pow(mults[key],Number(worker[key]||0)));if(Number(gameState.cash)<cost){showToast('You need '+formatCash(cost)+' for this upgrade.');return;}}
 await performOptimisticAction('?action=crew-action',{action,index},state=>{
  state.stats ||= {};
  if(action==='hire'){
   const i=state.crew.length,cost=Number(state.crewHireCost||180);
   state.cash-=cost;state.stats.cashSpent=Number(state.stats.cashSpent||0)+cost;state.crewUnlocked=true;
   state.crew.push({id:'helper-'+(i+1),name:names[i]||('Worker '+(i+1)),speedLevel:0,capacityLevel:0,powerLevel:0,luckLevel:0,awakeLevel:0,inventory:{},inventoryCount:0,capacity:50,intervalMs:2000,asleep:false,awakeMs:0,fedUntil:0,lastActionAt:Date.now(),workMs:0,collectedCount:0,moneyEarned:0});
   state.crewHireCost=Math.floor(cost*1.85);return;
  }
  const c=state.crew[index];if(!c)return;
  if(action==='wake'){c.asleep=false;c.awakeMs=0;c.lastActionAt=Date.now();return;}
  if(action==='feed'){const need=10*Number(state.basketCapacity||50);state.feedCandy=Math.max(0,Number(state.feedCandy||0)-need);c.fedUntil=Date.now()+1200000;c.asleep=false;c.awakeMs=0;return;}
  if(key){const cost=Math.floor(bases[key]*Math.pow(mults[key],Number(c[key]||0)));state.cash-=cost;state.stats.cashSpent=Number(state.stats.cashSpent||0)+cost;state.stats.upgradesBought=Number(state.stats.upgradesBought||0)+1;c[key]=Number(c[key]||0)+1;if(key==='capacityLevel')c.capacity=Math.min(500,50+c.capacityLevel*10);}
 },r=>r.hired?'Crew member hired!':action==='feed'?'Crew member fed for 20 minutes.':action==='wake'?'Crew member is awake.':'Crew upgrade purchased!');
}
function renderStats(container) {
    const s=gameState.stats||{},basket=Object.values(gameState.inventory||{}).reduce((a,n)=>a+Number(n||0),0),crew=(gameState.crew||[]).reduce((a,h)=>a+Number(h.inventoryCount||0),0),progress=Math.round(gameState.discovered.length/CANDY_CATALOG.length*100);
    const rows=[['Current cash',formatCash(gameState.cash)],['Highest cash balance',formatCash(s.highScore||0)],['Lifetime cash earned',formatCash(s.lifetimeCash||0)],['Total cash spent',formatCash(s.cashSpent||0)],['Lifetime candy collected',Number(s.totalCollected||0).toLocaleString()],['Candy sold',Number(s.totalSold||0).toLocaleString()],['Basket clicks',Number(s.totalClicks||0).toLocaleString()],['Rare and epic collected',Number(s.rareCollected||0).toLocaleString()],['Legendary collected',Number(s.legendaryCollected||0).toLocaleString()],['Upgrades purchased',Number(s.upgradesBought||0).toLocaleString()],['Crew candy collected',Number(s.crewCollected||0).toLocaleString()],['Crew candy sold',Number(s.crewSold||0).toLocaleString()],['Candy in basket',basket.toLocaleString()],['Candy held by crew',crew.toLocaleString()],['Candy Index',`${gameState.discovered.length}/${CANDY_CATALOG.length} (${progress}%)`]];
    container.innerHTML=`<div class="hh-save-controls"><button type="button" class="buy-btn" onclick="hhExportSave()">Export Save (.txt)</button><button type="button" class="hh-save-secondary" onclick="hhChooseImportFile()">Import Save (.txt)</button><p class="hh-save-note">${halloweenOfflineMode?'OFFLINE MODE — changes stay on this device.':'Importing online replaces your server save after confirmation.'}</p></div><div style="display:flex;flex-direction:column;gap:0;color:var(--fg2);font-size:18px">${rows.map(([label,value])=>`<div style="display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)"><span>${label}</span><strong style="color:#fff;text-align:right">${value}</strong></div>`).join('')}</div>`;
}
function renderLeaderboard(container) {
    const rankings = leaderboardCache;
    let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    html += `<div style="font-size:14px; color:var(--orange); margin-bottom:10px;">Ranked entirely by CURRENT CASH. Spend wisely!</div>`;
    
    rankings.forEach((r, i) => {
        const isMe = r.accountId === gameState.accountId;
        html += `
            <div class="hh-leaderboard-row ${i===0?'is-first-place':''}" style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,${isMe? '0.1' : '0.03'}); border-radius:8px; border:1px solid ${i===0?'#ffd84d':isMe?'var(--orange)':'transparent'};">
                <div><span style="color:var(--fg2); margin-right:10px;">#${i+1}</span> <span style="color:#fff; font-weight:bold;">${escapeHTML(r.displayName)}</span></div>
                <div style="color:#F5C451; font-weight:bold;">${formatCash(r.cash)}</div>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

function maybeShowWelcomeGuide(){let seen=false;try{seen=localStorage.getItem('halloween_haunt_guide_seen_v1')==='1'}catch{}if(seen){setTimeout(maybeShowPhase2News,500);return}helpSection=0;renderWelcomeGuide()}
function maybeShowPhase2News(){
 let seen=false;try{seen=localStorage.getItem('halloween_haunt_phase2_news_v1')==='1'}catch{}if(seen||!gameState)return;
 const overlay=document.getElementById('hhNewsOverlay');if(!overlay)return;
 try{localStorage.setItem('halloween_haunt_phase2_news_v1','1')}catch{}
 const eligible=Number(gameState.cash||0)<100000&&!gameState.phase2?.comebackWheelClaimed;
 overlay.innerHTML='<div class="hh-news-card" role="dialog" aria-modal="true" aria-labelledby="hhNewsTitle"><div class="hh-news-eyebrow">☠️ THE HAUNT HAS DEEPENED ☠️</div><div class="hh-news-art" aria-hidden="true">🎃 🕯️ 🦇</div><h2 id="hhNewsTitle">Phase 2 has arrived</h2><p class="hh-news-intro">The fog is thicker, the shops are stranger, and the night has more secrets.</p><div class="hh-news-list"><div><span>🛍️</span><section><strong>Witchlight Diner & Graveyard Bazaar</strong><small>New shops and pricey upgrades boost candy sale values — including crew sales.</small></section></div><div><span>🧟</span><section><strong>Crew Manager</strong><small>Hire a manager to wake your crew and feed them from Candy Reserve.</small></section></div><div><span>🟣</span><section><strong>Soul Shards</strong><small>Rare drops unlock special shard-only upgrades.</small></section></div><div><span>🎡</span><section><strong>Haunted High-Roller</strong><small>Use in-game cash for a chance at a jackpot.</small></section></div></div>'+(eligible?'<div class="hh-news-comeback"><strong>Need a head start?</strong><p>You have under $100,000. Claim one free Comeback Wheel spin for <b>$10,000–$80,000</b> in cash.</p><button class="hh-news-spin" onclick="window.executePhase2(\'comeback-wheel\')">🎡 Spin Comeback Wheel</button></div>':'')+'<div class="hh-news-actions"><button class="hh-news-secondary" onclick="window.dismissPhase2News()">Later</button><button class="hh-news-primary" onclick="window.dismissPhase2News();window.openHalloweenPhase2()">Explore Phase 2 →</button></div><p class="hh-news-footnote">One free Comeback Wheel spin per account. Offline mode is supported.</p></div>';
 overlay.classList.add('show');
}
window.dismissPhase2News=function(){document.getElementById('hhNewsOverlay')?.classList.remove('show')};
window.replayPhase2News=function(){try{localStorage.removeItem('halloween_haunt_phase2_news_v1')}catch{}maybeShowPhase2News()};
function renderWelcomeGuide(){
 const s=HELP_SECTIONS[helpSection],last=helpSection===HELP_SECTIONS.length-1,overlay=document.getElementById('welcomeGuideOverlay');if(!overlay)return;
 overlay.innerHTML='<div class="welcome-guide-card" role="dialog" aria-modal="true" aria-labelledby="welcomeGuideTitle"><div class="welcome-guide-kicker">HALLOWEEN HAUNT · QUICK GUIDE</div><div class="welcome-guide-progress">SECTION '+(helpSection+1)+' OF '+HELP_SECTIONS.length+'</div><h2 id="welcomeGuideTitle">'+s.title+'</h2><p>'+s.body+'</p><div class="welcome-guide-dots">'+HELP_SECTIONS.map((_,i)=>'<span class="'+(i===helpSection?'active':'')+'"></span>').join('')+'</div><div class="welcome-guide-controls"><button class="guide-btn secondary" '+(helpSection===0?'disabled':'')+' onclick="changeWelcomeGuide(-1)">Previous</button><button class="guide-btn" onclick="changeWelcomeGuide(1)">'+(last?'Start playing':'Next')+'</button></div><button class="guide-skip" onclick="finishWelcomeGuide()">Skip guide</button></div>';overlay.classList.add('show');
}
function changeWelcomeGuide(direction){if(helpSection===HELP_SECTIONS.length-1&&direction>0){finishWelcomeGuide();return}helpSection=Math.max(0,Math.min(HELP_SECTIONS.length-1,helpSection+direction));renderWelcomeGuide()}
function finishWelcomeGuide(){try{localStorage.setItem('halloween_haunt_guide_seen_v1','1')}catch{}document.getElementById('welcomeGuideOverlay')?.classList.remove('show');setTimeout(maybeShowPhase2News,350)}
window.changeWelcomeGuide=changeWelcomeGuide;window.finishWelcomeGuide=finishWelcomeGuide;
// Bootstrap
window.addEventListener('DOMContentLoaded', initGame);
window.importHalloweenHauntSave = hhChooseImportFile;
window.offerHalloweenHauntSync = hhOfferOfflineSync;
window.retryHalloweenHauntLoad = initGame;
window.retryHalloweenHauntCollect = retryCollectQueue;

let crewPauseSent=false;
function pauseCrewOnExit(){if(crewPauseSent||!gameState||!gameState.crew?.length)return;crewPauseSent=true;const sessionId=localStorage.getItem('session_id')||'';if(!sessionId)return;const deviceId=localStorage.getItem('device_id')||sessionId;const payload={requestId:'crew-pause-'+Date.now()+'-'+Math.random().toString(36).slice(2)};try{fetch(API_BASE+'?action=crew-pause',{method:'POST',keepalive:true,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Session-ID':sessionId,'X-Device-ID':deviceId},body:JSON.stringify(payload)}).catch(()=>{});}catch{}}
window.addEventListener('pagehide',pauseCrewOnExit);

const HHN=['Jack','Misty','Boo','Candy','Pumpkin','Raven','Cocoa','Hex','Maple','Ember','Cobweb','Midnight','Toffee','Salem','Patches','Wick','Hocus','Mallow','Fable','Trick'],HHR={Common:'#ddd',Uncommon:'#45d483',Rare:'#4c9dff',Epic:'#b66aff',Legendary:'#ffc94a',Mythic:'#ff5ca8'},HHP=[['basketFull','Basket full'],['candySold','Candy sold'],['crewAsleep','Crew asleep'],['newRarity','New rarity unlocked'],['upgradeBought','Upgrade purchased'],['crewHired','Crew hired'],['crewFed','Crew feeding'],['autoSell','Auto Sell']];
function hPrefs(){try{return JSON.parse(localStorage.getItem('hh_notification_prefs')||'{}')}catch{return {}}}function hNotify(k,t,m){if(hPrefs()[k]===false)return;showToast(t+' — '+m)}
function hHelp(t,m){let x=document.createElement('div');x.className='hh-help-overlay';let card=document.createElement('section');card.className='hh-help-card';card.innerHTML='<span class="hh-badge">HELP</span><h2>'+escapeHTML(t)+'</h2><p>'+escapeHTML(m)+'</p><button class="buy-btn">Got it</button>';card.querySelector('button').onclick=()=>x.remove();x.appendChild(card);x.onclick=e=>{if(e.target===x)x.remove()};document.body.appendChild(x)}function hQ(t,m){return `<button class="hh-help-btn" data-hh-help="${escapeHTML(t)}" data-hh-info="${escapeHTML(m)}">?</button>`}function hCard(t,b,tag='INFO'){return `<section class="hh-card-ui"><div class="hh-card-heading"><h3>${t}</h3><span class="hh-badge">${tag}</span></div>${b}</section>`}document.addEventListener('click',e=>{const b=e.target.closest('[data-hh-help]');if(b)hHelp(b.dataset.hhHelp,b.dataset.hhInfo)});
function hSettings(c){let p=hPrefs();c.innerHTML=hCard('Notifications','<p class="hh-muted">Control each notification separately.</p>'+HHP.map(([id,n])=>'<label class="hh-setting-row"><span><strong>'+n+'</strong><small>Show or hide '+n.toLowerCase()+' alerts.</small></span><input type="checkbox" data-hhp="'+id+'" '+(p[id]===false?'':'checked')+'></label>').join(''),'PREFERENCES')+hCard('Tutorial','<p class="hh-muted">Replay the short guide any time.</p><button class="buy-btn" onclick="localStorage.removeItem(\'halloween_haunt_guide_seen_v1\');closeModal();helpSection=0;renderWelcomeGuide()">Redo tutorial</button>','LEARN');c.querySelectorAll('[data-hhp]').forEach(x=>x.onchange=()=>{let q=hPrefs();q[x.dataset.hhp]=x.checked;localStorage.setItem('hh_notification_prefs',JSON.stringify(q))})}
function hInit(){let n=document.querySelector('.action-nav');if(n&&!n.querySelector('[data-hhsettings]')){let b=document.createElement('button');b.className='action-btn';b.dataset.hhsettings='1';b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.3l-.1.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.3-1.8l-.1-.1v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.3l.1-.1h3.4l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .3 1.8l.1.1z"></path></svg><span>Settings</span>';b.onclick=()=>openModal('settings');n.appendChild(b)}if(!document.getElementById('hh-ghost-layer')){let g=document.createElement('div');g.id='hh-ghost-layer';g.innerHTML=Array.from({length:7},(_,i)=>'<span style="--i:'+i+'">👻</span>').join('');g.setAttribute('aria-hidden','true');document.body.appendChild(g)}}window.addEventListener('DOMContentLoaded',hInit);setTimeout(hInit,0);
const hOpen=window.openModal;window.openModal=function(t){if(t==='settings'){currentModal='settings';document.getElementById('hauntModalOverlay').classList.add('show');document.getElementById('modalTitle').innerText='Settings';hSettings(document.getElementById('modalBody'));return}return hOpen(t)};
renderShops = function(c){let s=gameState,items=CANDY_CATALOG.map(x=>({c:x,n:Number(s.inventory?.[x.id]||0),p:Math.max(0,...(s.shops||[]).map(y=>Number(y.prices?.[x.id]||0)))})).filter(x=>x.n),confirmedQty=items.reduce((n,x)=>n+x.n,0),perClick=Math.min(8,Math.max(1,Number(s.upgrades?.power?.level||0)+1)),pendingClickCount=pendingClicks+(collectInFlight?inFlightClicks:retryBatchClicks),pendingQty=pendingClickCount*perClick,qty=confirmedQty+pendingQty,val=items.reduce((n,x)=>n+x.n*x.p,0);c.innerHTML='<section class="hh-card-ui"><div class="hh-card-heading"><h3>Sell All Candy</h3>'+hQ('How selling works','One button sells every candy in your basket at once. Each candy goes to the seller paying the best price. Crew members automatically sell their own full baskets.')+'</div><p class="hh-muted">Every candy is matched to its best-paying seller.</p>'+'<div class="hh-collect-pending" data-hh-collect-pending role="status" aria-live="polite" '+(pendingQty?'':'hidden')+'><span class="hh-collect-pending-icon" aria-hidden="true">!</span><span><strong data-hh-pending-count>'+pendingQty+'</strong> candy <span data-hh-pending-verb>'+(pendingQty===1?'is':'are')+'</span> being collected; this is why Sell All is temporarily disabled.</span></div><div class="hh-summary-grid"><div class="hh-stat-card"><small>Candy in basket</small><strong data-hh-basket-total>'+qty+'</strong></div><div class="hh-stat-card"><small>Estimated payout</small><strong>'+formatCash(val)+'</strong></div></div><button class="buy-btn" style="width:100%" '+(!qty||pendingQty?'disabled':'')+' onclick="executeSellAll()">Sell All Candy · '+formatCash(val)+'</button></section><div class="hh-item-grid">'+(items.length?items.map(x=>'<div class="hh-candy-row"><span><strong>'+escapeHTML(x.c.name)+'</strong><small>'+escapeHTML(x.c.rarity)+' · '+x.n+' held</small></span><strong>'+formatCash(x.n*x.p)+'</strong></div>').join(''):(pendingQty?'<div class="hh-card-ui">Candy is being collected. Its type and sale value will appear when the server confirms it.</div>':'<div class="hh-card-ui">Your basket is empty. Collect candy to see it here.</div>'))+'</div>'};
setInterval(()=>{if(currentModal!=='shops'||!gameState)return;const body=document.getElementById('modalBody');if(!body)return;const clicks=pendingClicks+(collectInFlight?inFlightClicks:retryBatchClicks),power=Math.min(8,Math.max(1,Number(gameState.upgrades?.power?.level||0)+1)),pending=clicks*power,confirmed=Object.values(gameState.inventory||{}).reduce((n,q)=>n+Math.max(0,Number(q)||0),0),pill=body.querySelector('[data-hh-collect-pending]'),count=body.querySelector('[data-hh-pending-count]'),verb=body.querySelector('[data-hh-pending-verb]'),total=body.querySelector('[data-hh-basket-total]'),button=body.querySelector('#hhSellAllButton');if(pill)pill.hidden=!pending;if(count)count.textContent=String(pending);if(verb)verb.textContent=pending===1?'is':'are';if(total)total.textContent=(confirmed+pending).toLocaleString();if(button)button.disabled=confirmed+pending===0||pending>0;},100);
renderUpgrades = function(c){let arr=[['capacity','Basket Capacity','Carry more candy.'],['power','Click Power','Collect more candy per click.'],['luck','Candy Luck','Improve the chance of rare candy.']];c.innerHTML='<div class="hh-upgrade-grid">'+arr.map(([id,n,d])=>{let u=gameState.upgrades[id];return '<article class="hh-card-ui"><div class="hh-card-heading"><h3>'+n+'</h3>'+hQ(n,d)+'</div><p class="hh-muted">'+d+'</p><div class="hh-level-line">Level '+u.level+' <strong>'+(u.nextCost<0?'MAXED':formatCash(u.nextCost))+'</strong></div><button class="buy-btn" '+(u.nextCost<0||gameState.cash<u.nextCost?'disabled':'')+' onclick="executeUpgrade(\''+id+'\')">Upgrade</button></article>'}).join('')+'<article class="hh-card-ui"><div class="hh-card-heading"><h3>Auto Sell</h3>'+hQ('Auto Sell','One-time $5,000 unlock. When your basket fills, wait one second and sell all candy at the best price.')+'</div><p class="hh-muted">Automatically sells a full basket after one second.</p><strong>'+(gameState.upgrades.autoSell.level?'UNLOCKED':'$5,000 · One-time unlock')+'</strong><button class="buy-btn" style="width:100%;margin-top:12px" '+(gameState.upgrades.autoSell.level||gameState.cash<5000?'disabled':'')+' onclick="executeUpgrade(\'autoSell\')">'+(gameState.upgrades.autoSell.level?'Unlocked':'Unlock Auto Sell')+'</button></article></div>'};

const hhBaseRenderShops=renderShops;renderShops=function(c){hhBaseRenderShops(c);renderPhase2ShopUpgrades(c)};
function renderPhase2ShardUpgrades(c){if(!c||!gameState)return;hhPhase2Defaults(gameState);const shards=Number(gameState.soulShards||0),p=gameState.phase2;const cards=[['luck','Shard Luck',3,'Improves the odds of finding rare candy.'],['fortune','Shard Fortune',5,'Improves Soul Shard drops and slightly boosts shop value.']].map(([id,label,base,desc])=>{const level=Number(p.shardUpgrades[id]||0),cost=base+level*2;return '<article class="hh-card-ui"><div class="hh-card-heading"><h3>'+label+'</h3><span class="hh-badge">LEVEL '+level+'/10</span></div><p class="hh-muted">'+desc+'</p><button class="buy-btn" type="button" data-shard-upgrade="'+id+'" '+(level>=10||shards<cost?'disabled':'')+'>'+(level>=10?'MAXED':'Upgrade · '+cost+' Soul Shards')+'</button></article>'}).join('');c.insertAdjacentHTML('beforeend','<section class="hh-card-ui"><div class="hh-card-heading"><h3>Soul Shard Research</h3><span class="hh-badge">'+shards.toLocaleString()+' SHARDS</span></div><p class="hh-muted">Soul Shards are earned from rare drops. Spend them here to improve your collection.</p><div class="hh-upgrade-grid">'+cards+'</div></section>');c.querySelectorAll('[data-shard-upgrade]').forEach(b=>b.addEventListener('click',()=>window.executePhase2?.('shard-upgrade',{upgradeId:b.dataset.shardUpgrade})))}
const hhBaseRenderUpgrades=renderUpgrades;renderUpgrades=function(c){hhBaseRenderUpgrades(c);renderPhase2ShardUpgrades(c)};

renderCrew = function(c){let a=gameState.crew||[],out=hCard('What are Crews?','<p>Crew members collect candy while the game is open. They sell a full basket to the best-paying seller. After five minutes they fall asleep and must be woken manually. Upgrade each member independently or feed them for 20-minute boosts.</p>'+hQ('Crew basics','Crew pauses when the game is closed. Sleeping workers need a manual wake-up. Feeding costs 10× your basket capacity in candy, gives percentage boosts, and prevents sleep for 20 minutes.'),'AUTOMATIC WORK');out+='<div class="hh-summary-grid"><div class="hh-stat-card"><small>Crew members</small><strong>'+a.length+' / 20</strong></div><div class="hh-stat-card"><small>Candy collected</small><strong>'+Number(gameState.stats?.crewCollected||0).toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Candy sold</small><strong>'+Number(gameState.stats?.crewSold||0).toLocaleString()+'</strong></div></div>';if(!a.length)out+=hCard('Hire your first member','<button class="buy-btn" onclick="executeCrew(\'hire\')" '+(gameState.cash<gameState.crewHireCost?'disabled':'')+'>Hire '+HHN[0]+' · '+formatCash(gameState.crewHireCost)+'</button>','RECRUIT');out+='<div class="hh-crew-grid">'+a.map((w,i)=>{let asleep=!!w.asleep,fed=Number(w.fedUntil||0)>Date.now(),cnt=Number(w.inventoryCount||0),cap=Number(w.capacity||10),ups=[['capacity','Basket Capacity',w.capacityLevel||0,65,1.65],['power','Click Power',w.powerLevel||0,80,1.65],['luck','Candy Luck',w.luckLevel||0,95,1.65],['speed','Auto Sell Faster',w.speedLevel||0,75,1.7],['awake','Longer Awake Time',w.awakeLevel||0,100,1.8]];return '<article class="hh-crew-card '+(asleep?'is-asleep':'')+'"><div class="hh-crew-top"><div><span class="hh-badge">'+(asleep?'ASLEEP':fed?'FED BOOST':'WORKING')+'</span><h3>'+escapeHTML(w.name||HHN[i]||('Worker '+(i+1)))+'</h3><p class="hh-muted">'+(asleep?'Needs a manual wake-up':fed?'Boosted for '+Math.max(0,Math.ceil((w.fedUntil-Date.now())/60000))+' min':'Collecting candy automatically')+'</p></div>'+hQ('Worker status','The basket bar shows carried candy. Full baskets sell automatically. Sleeping workers need you to wake them.')+'</div><div class="hh-progress-label"><span>Basket</span><strong>'+cnt+' / '+cap+'</strong></div><div class="hh-progress"><i style="width:'+Math.min(100,cnt/Math.max(1,cap)*100)+'%"></i></div><div style="display:flex;gap:8px;margin:12px 0">'+(asleep?'<button class="buy-btn" onclick="executeCrew(\'wake\','+i+')">Wake up</button>':'<button class="buy-btn" '+(fed?'disabled':'')+' onclick="executeCrew(\'feed\','+i+')">Feed · '+(10*Number(gameState.basketCapacity||50))+' candy</button>')+'</div><div class="hh-upgrade-grid">'+ups.map(([k,n,l,b,m])=>'<div class="hh-upgrade-mini"><span>'+n+'<small>Level '+l+'</small></span><button class="buy-btn" '+(gameState.cash<Math.floor(b*Math.pow(m,l))?'disabled':'')+' onclick="executeCrew(\'upgrade_'+k+'\','+i+')">'+formatCash(Math.floor(b*Math.pow(m,l)))+'</button></div>').join('')+'</div></article>'}).join('')+'</div>';if(a.length<20)out+=hCard('Recruit another member','<p>Each recruit costs more. All members start with the same base stats.</p><button class="buy-btn" onclick="executeCrew(\'hire\')" '+(gameState.cash<gameState.crewHireCost?'disabled':'')+'>Hire '+escapeHTML(HHN[a.length]||'Worker')+' · '+formatCash(gameState.crewHireCost)+'</button>','NEXT RECRUIT');c.innerHTML=out};
// Sale confirmation is handled once by performOptimisticAction; do not wrap it in a second toast.
const hUpgrade=window.executeUpgrade;window.executeUpgrade=async function(t){if(t==='autoSell'){if(gameState.upgrades.autoSell.level||gameState.cash<5000){showToast('Auto Sell costs $5,000 and can only be unlocked once.');return}return performOptimisticAction('?action=upgrade',{type:t},s=>{if(s.cash<5000)return;s.cash-=5000;s.stats.cashSpent+=5000;s.stats.upgradesBought++;s.upgrades.autoSell.level=1;s.upgrades.autoSell.nextCost=-1},()=> 'Auto Sell unlocked!')}return hUpgrade(t)};
window.executeCrew=async function(action,index=0){let map={upgrade_capacity:['capacityLevel',65,1.65],upgrade_power:['powerLevel',80,1.65],upgrade_luck:['luckLevel',95,1.65],upgrade_speed:['speedLevel',75,1.7],upgrade_awake:['awakeLevel',100,1.8],upgrade_cap:['capacityLevel',65,1.65]};await performOptimisticAction('?action=crew-action',{action,index},s=>{s.stats||=createDefaultStats();if(action==='hire'){if(s.crew.length>=20||s.cash<s.crewHireCost)return;let cost=s.crewHireCost,i=s.crew.length;s.cash-=cost;s.stats.cashSpent+=cost;s.crewUnlocked=true;s.crew.push({id:'helper-'+(i+1),name:HHN[i]||('Worker '+(i+1)),capacity:10,capacityLevel:0,powerLevel:0,luckLevel:0,speedLevel:0,awakeLevel:0,intervalMs:2000,inventory:{},inventoryCount:0,asleep:false,awakeMs:0,fedUntil:0});s.crewHireCost=Math.floor(cost*1.85);return}let w=s.crew[index];if(!w)return;if(action==='wake'){w.asleep=false;w.awakeMs=0;return}if(action==='feed'){let need=10*Number(s.basketCapacity||50),reserve=Math.max(0,Number(s.feedCandy||0));if(Number(w.fedUntil||0)>Date.now()||reserve<need){showToast('You need '+need+' candy in your Candy Reserve to feed this crew member.');return}s.feedCandy=reserve-need;w.fedUntil=Date.now()+1200000;w.asleep=false;w.awakeMs=0;return}let cfg=map[action];if(!cfg)return;let [key,base,mult]=cfg,cost=Math.floor(base*Math.pow(mult,Number(w[key]||0)));if(s.cash<cost)return;s.cash-=cost;s.stats.cashSpent+=cost;s.stats.upgradesBought++;w[key]=Number(w[key]||0)+1;if(key==='capacityLevel')w.capacity=10+w[key]*10;if(key==='speedLevel')w.intervalMs=Math.max(2000,20000*Math.pow(.85,w.speedLevel))},r=>r.fed?'Fed for 20 minutes.':action==='wake'?null:r.woke?'Crew member awake.':r.hired?'Crew member hired!':'Crew updated!')};
const hSpawn=spawnFallingCandy;spawnFallingCandy=function(id,x,y){const r=hSpawn(id,x,y),els=document.querySelectorAll('.falling-candy'),el=els[els.length-1],c=getCandyObj(id);if(el&&c){const col=HHR[c.rarity]||'#fff';el.style.width='112px';el.style.height='112px';el.style.border='0';el.style.outline='0';el.style.borderRadius='0';el.style.background='transparent';el.style.boxShadow='none';el.style.filter='drop-shadow(0 0 4px '+col+') drop-shadow(0 0 12px '+col+')'}return r};
const hIndex=renderIndex;renderIndex=function(c){hIndex(c);const paint=()=>c.querySelectorAll('.candy-card').forEach(card=>{let img=card.querySelector('img'),x=CANDY_CATALOG.find(v=>img?.getAttribute('src')?.includes(v.file));if(x){card.style.border='2px solid '+(HHR[x.rarity]||'#fff');card.style.boxShadow='0 0 12px '+(HHR[x.rarity]||'#fff')+'33'}});paint();c.querySelectorAll('select').forEach(x=>x.addEventListener('change',()=>setTimeout(paint,0)))};
const hUI=updateUI;window.hhAsleepSeen=window.hhAsleepSeen||new Set();updateUI=function(){hUI();if(!gameState)return;let b=[...document.querySelectorAll('.action-btn')].find(x=>x.textContent.includes('Crew')),asleep=(gameState.crew||[]).some(x=>x.asleep);if(b){b.classList.toggle('hh-crew-alert',asleep);if(asleep&&!b.querySelector('.hh-alert-dot'))b.insertAdjacentHTML('beforeend','<i class="hh-alert-dot"></i>');if(!asleep)b.querySelector('.hh-alert-dot')?.remove()}for(let w of gameState.crew||[])if(w.asleep&&!hhAsleepSeen.has(w.id)){hhAsleepSeen.add(w.id);hNotify('crewAsleep','Crew member asleep',(w.name||'A crew member')+' needs to be woken.')}else if(!w.asleep)hhAsleepSeen.delete(w.id);let cap=Number(gameState.basketCapacity||0),cnt=Number(gameState.currentBasketCount||0);if(cap&&cnt>=cap&&!window.hhFull){window.hhFull=true;hNotify('basketFull','Basket full','Your basket is full.')}if(cnt<cap)window.hhFull=false;};

const hRarityUpdate=updateUI;window.hhKnownRarities=window.hhKnownRarities||null;updateUI=function(){hRarityUpdate();if(!gameState)return;const found=new Set();for(const id of gameState.discovered||[]){const candy=getCandyObj(id);if(candy)found.add(candy.rarity)}if(window.hhKnownRarities===null){window.hhKnownRarities=found;return}for(const rarity of found){if(!window.hhKnownRarities.has(rarity)){window.hhKnownRarities.add(rarity);hNotify('newRarity','New rarity unlocked',rarity+' candy has been discovered!')}}};

// Phase 2 UI and shared online/offline action dispatcher.
window.executePhase2=async function(type,extra={}){if(!gameState)return;const result=await apiCall('?action=phase2','POST',{type,...extra});if(!result)return;if(result.error){showToast(result.error);return;}if(result.state)gameState=cloneGameState(result.state);hhPhase2Defaults(gameState);try{localStorage.setItem(HH_OFFLINE_KEY,JSON.stringify(gameState));}catch(_){}updateUI();if(['shops','upgrades','crew'].includes(currentModal)){renderCurrentModal();}else{window.openHalloweenPhase2();}if(result.comebackWheel){showToast('🎉 Comeback Wheel awarded '+formatCash(result.comebackWheel.payout)+'!');window.dismissPhase2News?.();}else if(result.gamble){showToast(result.gamble.jackpot?'JACKPOT! You won '+formatCash(result.gamble.payout)+'!':result.gamble.won?'You won '+formatCash(result.gamble.payout)+'!':'No win this time.');}else if(result.purchased)showToast('Phase 2 upgrade purchased!');};
window.openHalloweenPhase2=function(){if(!gameState)return;hhPhase2Defaults(gameState);currentModal='phase2';const overlay=document.getElementById('hauntModalOverlay');if(!overlay)return;overlay.classList.add('show');document.getElementById('modalTitle').innerText='Halloween Haunt · Phase 2';const c=document.getElementById('modalBody'),p=gameState.phase2,shards=Number(gameState.soulShards||0),shops=gameState.shops||[],costs=[50000,75000,110000,160000,230000];c.innerHTML='<section class="hh-card-ui hh-comeback-card"><div class="hh-card-heading"><h3>🎡 Comeback Wheel</h3><span class="hh-badge">NEW PLAYER BOOST</span></div><p class="hh-muted">If your cash is below $100,000, claim one free spin for $10,000–$80,000. This is a one-time in-game reward.</p><button class="buy-btn" id="hhPhase2Comeback" '+((Number(gameState.cash)>=100000||p.comebackWheelClaimed)?'disabled':'')+'>'+(p.comebackWheelClaimed?'SPIN CLAIMED':Number(gameState.cash)>=100000?'Available under $100,000':'Spin for $10k–$80k')+'</button></section>'+'<section class="hh-card-ui"><div class="hh-card-heading"><h3>Haunted High-Roller</h3><span class="hh-badge">IN-GAME CURRENCY ONLY</span></div><p class="hh-muted">Risk cash for a chance to double your wager; a 2.5% jackpot pays 8×. Wagers are capped at $10,000. No real money.</p><div class="hh-summary-grid"><div class="hh-stat-card"><small>Cash</small><strong>'+formatCash(gameState.cash)+'</strong></div><div class="hh-stat-card"><small>🟣 Soul Shards</small><strong>'+shards+'</strong></div></div><label for="hhPhase2Wager">Wager ($10–$10,000)</label><input id="hhPhase2Wager" type="number" min="10" max="10000" step="10" value="100" style="display:block;width:100%;margin:8px 0;padding:10px"><button class="buy-btn" id="hhPhase2Gamble">Spin the wheel</button></section><section class="hh-card-ui"><div class="hh-card-heading"><h3>Shop Improvements</h3><span class="hh-badge">CREW SALES BENEFIT TOO</span></div><p class="hh-muted">Each level boosts shop sale prices by 12%. Upgrade costs rise from $50,000 to $230,000.</p><div class="hh-item-grid">'+shops.map(shop=>{const level=Number(p.shopLevels[shop.id]||0),cost=costs[level];return '<div class="hh-candy-row"><span><strong>'+escapeHTML(shop.name)+'</strong><small>Level '+level+'/5 · +'+(level*12)+'% sale value</small></span><button class="buy-btn" '+(level>=5||Number(gameState.cash)<cost?'disabled':'')+' data-shop-upgrade="'+escapeHTML(shop.id)+'">'+(level>=5?'MAXED':formatCash(cost))+'</button></div>';}).join('')+'</div></section><section class="hh-card-ui"><div class="hh-card-heading"><h3>Crew Manager</h3><span class="hh-badge">AUTOMATION</span></div><p class="hh-muted">Costs $250,000 once. Automatically wakes sleeping crew and uses Candy Reserve to feed them when enough candy is available.</p><button class="buy-btn" id="hhPhase2Manager" '+(p.managerLevel||Number(gameState.cash)<250000?'disabled':'')+'>'+(p.managerLevel?'Manager hired':'Hire Manager · $250,000')+'</button></section><section class="hh-card-ui"><div class="hh-card-heading"><h3>Soul Shard Research</h3><span class="hh-badge">RARE CURRENCY</span></div><p class="hh-muted">Soul Shards are rare candy drops. Shard Luck improves rare-candy odds; Shard Fortune increases shard drop chances and shop value slightly.</p>'+[['luck','Shard Luck',3],['fortune','Shard Fortune',5]].map(([id,label,base])=>{const level=Number(p.shardUpgrades[id]||0),cost=base+level*2;return '<div class="hh-candy-row"><span><strong>'+label+'</strong><small>Level '+level+'/10</small></span><button class="buy-btn" '+(level>=10||shards<cost?'disabled':'')+' data-shard-upgrade="'+id+'">'+(level>=10?'MAXED':cost+' shards')+'</button></div>';}).join('')+'</section>';
 c.querySelector('#hhPhase2Comeback').onclick=()=>window.executePhase2('comeback-wheel');c.querySelector('#hhPhase2Gamble').onclick=()=>window.executePhase2('gamble',{wager:Number(c.querySelector('#hhPhase2Wager').value)});c.querySelector('#hhPhase2Manager').onclick=()=>window.executePhase2('manager');c.querySelectorAll('[data-shop-upgrade]').forEach(b=>b.onclick=()=>window.executePhase2('shop-upgrade',{shopId:b.dataset.shopUpgrade}));c.querySelectorAll('[data-shard-upgrade]').forEach(b=>b.onclick=()=>window.executePhase2('shard-upgrade',{upgradeId:b.dataset.shardUpgrade}));};
(function addPhase2Button(){const add=()=>{const nav=document.querySelector('.action-nav');if(!nav||nav.querySelector('[data-hh-phase2]'))return;const b=document.createElement('button');b.className='action-btn';b.dataset.hhPhase2='1';b.innerHTML='<span aria-hidden="true">🎃</span><span>Phase 2</span>';b.addEventListener('click',window.openHalloweenPhase2);nav.appendChild(b);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();setTimeout(add,500);})();
