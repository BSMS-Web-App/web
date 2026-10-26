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
let offlineMode = false;
const OFFLINE_PROGRESS_KEY = 'halloween_haunt_offline_progress_v1';
let offlineSyncInFlight = false;

function readOfflineProgress() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_PROGRESS_KEY) || '{}') || {}; }
    catch (_) { return {}; }
}

function updateOfflineCard(mode, detail = '') {
    const card = document.getElementById('offlineBanner');
    if (!card) return;
    if (mode === 'hidden') { card.style.display = 'none'; card.innerHTML = ''; return; }
    const syncing = mode === 'syncing';
    const failed = mode === 'failed';
    const title = syncing ? 'Connection restored — saving progress' : failed ? 'Still waiting to sync' : 'No internet connection';
    const message = syncing ? 'Your saved offline candy clicks are being added to your online game automatically.' : failed ? 'Your progress is still saved on this device. We’ll retry automatically when the game server is reachable. If your online basket is full, sell candy to make room.' : 'You can keep playing. Your progress is saved on this device and will sync automatically when your connection returns.';
    card.style.display = 'block';
    card.innerHTML = '<div class="offline-card-title"><span aria-hidden="true">' + (syncing ? '↻' : failed ? '!' : '⌁') + '</span><span>' + title + '</span></div><p>' + message + '</p><p class="offline-card-status">' + (detail || 'Offline practice cash stays on this device and does not affect your online account or leaderboard.') + '</p>';
}

function saveOfflineProgress() {
    if (!offlineMode || !gameState) return true;
    const snapshot = {
        version: 1,
        currentBasketCount: Math.max(0, Math.min(Number(gameState.basketCapacity) || 50, Number(gameState.currentBasketCount) || 0)),
        cash: Math.max(0, Number(gameState.cash) || 0),
        offlineClicks: Math.max(0, Math.floor(Number(readOfflineProgress().offlineClicks) || 0)),
        updatedAt: Date.now()
    };
    try {
        localStorage.setItem(OFFLINE_PROGRESS_KEY, JSON.stringify(snapshot));
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Offline save failed:', error);
        const banner = document.getElementById('offlineBanner');
        if (banner) {
            banner.textContent = 'Offline practice is running, but this browser could not save progress on this device. Check Safari storage settings.';
            banner.style.display = 'block';
        }
        return false;
    }
}

let currentModal = null;
let offerRefreshTime = 0;
let isEventActive = false;
let leaderboardCache = [];
let pendingClicks = 0;
let inFlightClicks = 0;
let retryBatchClicks = 0;
let pendingRetryRequestId = null;
let collectInFlight = false;
let collectFlushTimer = null;
let shopTimerInterval = null;
let shopRefreshInFlight = false;
let actionInFlight = false;
let helpSection = 0;
const PRELOADED_CANDY_IMAGES = new Map();
const HELP_SECTIONS = [
 {title:"Welcome to Halloween Haunt",body:"Click the pumpkin to collect candy. Candy goes into your basket until it reaches capacity. Sell candy at Local Shops to earn cash, then spend that cash on upgrades and helpers."},
 {title:"Cash, Basket & Candy",body:"Your green cash total is shown above the pumpkin. The basket meter shows how much candy you can hold. Candy has different rarities and sale values. The Candy Index tracks what you have discovered and collected."},
 {title:"Local Shops",body:"Local Shops buy candy in your basket. Compare offers, choose a shop or use best-price selling, then sell all or selected candy. Shared offers rotate when the countdown reaches zero."},
 {title:"Upgrades",body:"Basket Capacity lets you hold more candy. Click Power increases candy collected per click. Candy Luck improves your odds of rarer candy, but the rarest candy remains very hard to find. Auto-Sell unlocks crew auto-selling."},
 {title:"Trick-or-Treat Crew",body:"Hire helpers to collect candy while you actively play. Upgrade their speed to collect more often and their capacity to let them hold more candy."},
 {title:"Stats & Leaderboard",body:"Stats tracks your progress and lifetime activity. The leaderboard ranks players by current cash, so spending cash can change your position. Keep collecting, selling, and upgrading!"}
];

// Helpers
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getCandyObj(id) { return CANDY_CATALOG.find(c => c.id === id); }
function formatCash(num) { return '$' + Math.floor(num).toLocaleString(); }
function cloneGameState(value) { return JSON.parse(JSON.stringify(value)); }
function renderCurrentModal() {
 const body=document.getElementById('modalBody'); if(!body||!currentModal||!gameState)return;
 if(currentModal==='shops')renderShops(body);else if(currentModal==='upgrades')renderUpgrades(body);else if(currentModal==='crew')renderCrew(body);else if(currentModal==='index')renderIndex(body);else if(currentModal==='stats')renderStats(body);else if(currentModal==='leaderboard')renderLeaderboard(body);
}
async function performOptimisticAction(endpoint,payload,mutate,successMessage) {
 if(actionInFlight)return;actionInFlight=true;const previous=cloneGameState(gameState);
 try {mutate(gameState);updateUI();renderCurrentModal();const result=await apiCall(endpoint,'POST',payload);
  if(!result||!result.state){gameState=previous;updateUI();renderCurrentModal();return;}
  gameState=result.state;updateUI();renderCurrentModal();if(successMessage)showToast(successMessage(result));
 }catch(error){gameState=previous;updateUI();renderCurrentModal();console.error('[Halloween Haunt] Optimistic action failed:',error);}
 finally{actionInFlight=false;}
}
function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(String.fromCharCode(34), '&quot;').replaceAll(String.fromCharCode(39), '&#39;'); }


// ------------------------------------------------------------------
// API Communication
// ------------------------------------------------------------------
async function apiCall(endpoint, method = 'GET', payload = null) {
    const sessionId = localStorage.getItem('session_id') || '';
    const isHealthCheck = endpoint.includes('action=health');
    if (!sessionId && !isHealthCheck) {
        showToast("Please sign in to play Halloween Haunt.");
        return null;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) {
        headers['X-Session-ID'] = sessionId;
        headers['X-Device-ID'] = localStorage.getItem('device_id') || sessionId;
    }

    const requestPayload = method === 'POST' && payload && typeof payload === 'object'
        ? { ...payload, requestId: payload.requestId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`) }
        : payload;

    try {
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
            showToast(data.error || `Game API returned HTTP ${res.status}.`);
            return null;
        }
        return data;
    } catch (e) {
        console.error("API Error:", e);
        showToast("Network error. Please try again.");
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

function enterOfflineMode() {
    offlineMode = true;
    const saved = readOfflineProgress();
    gameState = {
        accountId: 'offline-local',
        displayName: 'Offline Player',
        cash: Math.max(0, Number(saved.cash) || 0),
        currentBasketCount: Math.max(0, Math.min(50, Number(saved.currentBasketCount) || 0)),
        basketCapacity: 50,
        upgrades: { power: { level: 0 } },
        startsAt: Date.parse(START_Z),
        endsAt: Date.parse(DEADLINE_Z),
        crew: [],
        discovered: [],
        candyInventory: {}
    };
    leaderboardCache = [];
    updateOfflineCard(navigator.onLine ? 'failed' : 'offline');
    document.querySelector('.hero-cash-label')?.replaceChildren(document.createTextNode('Offline Practice'));
    updateUI();
    updateTimer();
    if (!window.halloweenHauntTimerStarted) {
        window.halloweenHauntTimerStarted = true;
        setInterval(updateTimer, 1000);
    }
    preloadCandyImages();
    hideLoadingScreen();
    maybeShowWelcomeGuide();
}

async function initGame() {
    const retryButton = document.getElementById('loadingRetry');
    if (retryButton) retryButton.hidden = true;
    setLoadingMessage('Loading your game, shops, collection, and candy artwork…');

    if (navigator.onLine && !offlineSyncInFlight) {
        const synced = await syncPendingOfflineClicks();
        if (!synced) updateOfflineCard('failed');
    }

    const data = await apiCall('?action=state');
    if (!data?.state) {
        await enterOfflineMode();
        return;
    }

    const [leaderboard] = await Promise.all([
        apiCall('?action=leaderboard'),
        preloadCandyImages(),
        document.fonts?.ready || Promise.resolve()
    ]);
    if (!leaderboard || !Array.isArray(leaderboard.rankings)) {
        await enterOfflineMode();
        return;
    }

    offlineMode = false;
    gameState = data.state;
    leaderboardCache = leaderboard.rankings;
    const queuedOfflineClicks = Math.max(0, Math.floor(Number(readOfflineProgress().offlineClicks) || 0));
    updateOfflineCard(!navigator.onLine ? 'offline' : queuedOfflineClicks > 0 ? 'failed' : 'hidden');
    updateUI();
    updateTimer();
    if (!window.halloweenHauntTimerStarted) {
        window.halloweenHauntTimerStarted = true;
        setInterval(updateTimer, 1000);
    }
    setInterval(syncCrew, 12000);
    setInterval(refreshLeaderboard, 60000);
    hideLoadingScreen();
    maybeShowWelcomeGuide();
}

function updateTimer(){if(!gameState)return;const now=Date.now(),start=Number(gameState.startsAt||Date.parse(START_Z)),end=Number(gameState.endsAt||Date.parse(DEADLINE_Z));isEventActive=now>=start&&now<end;const timer=document.getElementById('ui-timer'),label=timer?.previousSibling;if(!timer)return;if(now<start){if(label)label.textContent='Starts in: ';timer.textContent=eventDuration(start-now);}else if(now<end){if(label)label.textContent='Ends in: ';timer.textContent=eventDuration(end-now);}else{if(label)label.textContent='';timer.textContent='EVENT ENDED';}}
function eventDuration(ms){const t=Math.max(0,Math.floor(ms/1000)),d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60),s=t%60;return d>0?d+'d '+h+'h '+m+'m '+s+'s':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

async function syncCrew() {
    if (!gameState || !isEventActive || !gameState.crewUnlocked || document.visibilityState==='hidden') return;
    // Pings server to claim active-play crew rewards.
    const res = await apiCall('?action=crew-sync', 'POST');
    if (res) {
        gameState = res.state;
        updateUI();
        if (currentModal === 'crew') renderCrew();
    }
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
function handleBasketClick(e) {
    if (!gameState) { showToast("Halloween Haunt is still connecting."); return; }
    if (!isEventActive) { showToast("Event is not active."); return; }

    const perClick = Math.min(8, Math.max(1, Number(gameState.upgrades?.power?.level || 0) + 1));
    let confirmed = Math.max(0, Number(gameState.currentBasketCount) || 0);
    const pendingCandy = (pendingClicks + retryBatchClicks + inFlightClicks) * perClick;
    if (confirmed + pendingCandy >= Number(gameState.basketCapacity || 0)) {
        if (offlineMode && confirmed > 0) {
            // Offline practice has no shop API, so sell a full basket locally to keep the game playable.
            gameState.cash = Math.max(0, Number(gameState.cash) || 0) + confirmed;
            gameState.currentBasketCount = 0;
            confirmed = 0;
            saveOfflineProgress();
            showToast('Offline practice: sold a basket locally. This cash will not sync online.');
        } else {
            showToast("Basket is full! Sell candy to make room.");
            return;
        }
    }

    // Immediate feedback: never wait for the network before animating a click.
    const preview = CANDY_CATALOG[Math.floor(Math.random() * CANDY_CATALOG.length)];
    spawnFallingCandy(preview.id, e.clientX, e.clientY);

    if (offlineMode) {
        gameState.currentBasketCount = Math.min(
            Number(gameState.basketCapacity) || 50,
            confirmed + perClick
        );
        const saved = readOfflineProgress();
        saved.offlineClicks = Math.max(0, Math.floor(Number(saved.offlineClicks) || 0)) + 1;
        saved.currentBasketCount = gameState.currentBasketCount;
        saved.cash = Math.max(0, Number(gameState.cash) || 0);
        saved.updatedAt = Date.now();
        try { localStorage.setItem(OFFLINE_PROGRESS_KEY, JSON.stringify(saved)); }
        catch (error) { console.warn('[Halloween Haunt] Could not save offline click queue:', error); }
        saveOfflineProgress();
        updateUI();
        return;
    }

    pendingClicks += 1;
    updateUI();

    if (collectFlushTimer) clearTimeout(collectFlushTimer);
    collectFlushTimer = setTimeout(flushCollectQueue, 45);
}

async function flushCollectQueue() {
    if (collectInFlight || (!pendingRetryRequestId && pendingClicks <= 0) || !gameState) return;
    collectInFlight = true;
    const retrying = Boolean(pendingRetryRequestId);
    const batch = retrying ? retryBatchClicks : Math.min(50, pendingClicks);
    if (!retrying) pendingClicks -= batch;
    inFlightClicks = batch;
    const requestId = pendingRetryRequestId || (crypto.randomUUID ? crypto.randomUUID() : `collect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    let succeeded = false;
    try {
        const res = await apiCall('?action=collect', 'POST', { clickCount: batch, requestId });
        if (res?.state) {
            succeeded = true;
            pendingRetryRequestId = null;
            retryBatchClicks = 0;
            gameState = res.state;
            inFlightClicks = 0;
            updateUI();
            const retry = document.getElementById('collectRetry');
            if (retry) retry.hidden = true;
        } else {
            // Keep failed clicks separate from newer clicks and reuse the ID on retry.
            // A committed-but-lost response is then replayed without double counting.
            if (!retrying) {
                pendingRetryRequestId = requestId;
                retryBatchClicks = batch;
            }
            inFlightClicks = 0;
            updateUI();
            const retry = document.getElementById('collectRetry');
            if (retry) retry.hidden = false;
        }
    } finally {
        collectInFlight = false;
        if (succeeded && pendingClicks > 0) {
            if (collectFlushTimer) clearTimeout(collectFlushTimer);
            collectFlushTimer = setTimeout(flushCollectQueue, 0);
        }
    }
}

function retryCollectQueue() {
    const retry = document.getElementById('collectRetry');
    if (retry) retry.hidden = true;
    flushCollectQueue();
}

function spawnFallingCandy(candyId, originX, originY) {
 const candy=getCandyObj(candyId);if(!candy)return;
 const el=document.createElement('img');el.src=IMG_BASE+candy.file;el.className='falling-candy rarity-'+candy.rarity.toLowerCase();
 const styles={common:['drop-shadow(0 4px 7px rgba(255,255,255,.25))',48],uncommon:['drop-shadow(0 0 10px rgba(70,220,120,.65))',52],rare:['drop-shadow(0 0 12px rgba(70,150,255,.8))',56],epic:['drop-shadow(0 0 15px rgba(170,80,255,.9))',60],legendary:['drop-shadow(0 0 18px rgba(255,190,50,1))',66]};
 const style=styles[candy.rarity.toLowerCase()];if(style){el.style.filter=style[0];el.style.width=style[1]+'px';el.style.height=style[1]+'px';}
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
    if (offlineMode) {
        showToast('Shops, upgrades, crew, stats, and leaderboard require an internet connection.');
        return;
    }
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

// ---- Modals Implementation ----

function renderIndex(container) {
    const unlocked=gameState.discovered.length, percent=Math.round(unlocked/CANDY_CATALOG.length*100);
    container.innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px"><strong>Collection progress: ${unlocked}/${CANDY_CATALOG.length} (${percent}%)</strong><select id="indexRarity" style="background:#201a28;color:white;padding:8px;border-radius:10px;font:inherit"><option value="all">All rarities</option><option>Common</option><option>Uncommon</option><option>Rare</option><option>Epic</option><option>Legendary</option><option>Mythic</option></select><select id="indexProgress" style="background:#201a28;color:white;padding:8px;border-radius:10px;font:inherit"><option value="all">All candies</option><option value="unlocked">Discovered</option><option value="locked">Not discovered</option><option value="owned">Currently owned</option></select></div><div style="height:8px;background:rgba(255,255,255,.1);border-radius:8px;overflow:hidden;margin-bottom:18px"><div style="height:100%;width:${percent}%;background:var(--orange)"></div></div><div class="candy-grid" id="candyIndexGrid"></div>`;
    const grid=container.querySelector('#candyIndexGrid');
    const draw=()=>{const rarity=container.querySelector('#indexRarity').value, progress=container.querySelector('#indexProgress').value;
      const list=CANDY_CATALOG.filter(c=>{const found=gameState.discovered.includes(c.id),crew=(gameState.crew||[]).reduce((n,h)=>n+Number((h.inventory||{})[c.id]||0),0),qty=Number(gameState.inventory[c.id]||0)+crew;return (rarity==='all'||c.rarity===rarity)&&(progress==='all'||(progress==='unlocked'&&found)||(progress==='locked'&&!found)||(progress==='owned'&&qty>0));});
      grid.innerHTML=list.map(c=>{const found=gameState.discovered.includes(c.id),crew=(gameState.crew||[]).reduce((n,h)=>n+Number((h.inventory||{})[c.id]||0),0),qty=Number(gameState.inventory[c.id]||0)+crew,lifetime=Number((gameState.lifetimeCollected||{})[c.id]||0),best=gameState.candyCatalog?.find(x=>x.id===c.id)?.bestPrice||c.baseValue||0;return `<div class="candy-card ${found?'':'locked'}" style="cursor:default"><img loading="lazy" src="${IMG_BASE}${c.file}" alt="${found?c.name:'Undiscovered candy'}" onerror="this.style.visibility='hidden'"><div>${found?c.name:'???'}</div><div class="qty">${c.rarity}</div><div class="qty">Owned: ${qty}</div><div class="qty">Lifetime: ${lifetime}</div><div class="qty">Best: ${formatCash(best)}</div></div>`;}).join('')||'<p>No candies match these filters.</p>';
    };
    container.querySelector('#indexRarity').addEventListener('change',draw);container.querySelector('#indexProgress').addEventListener('change',draw);draw();
}
function renderShops(container) {
    const s = gameState;
    const seconds = Math.max(0, Math.ceil((s.offerRefreshAt - Date.now()) / 1000));
    const options = s.shops.map(x => `<option value="${x.id}">${escapeHTML(x.name)}</option>`).join('');
    container.innerHTML=`<div style="margin-bottom:15px;color:var(--fg2)">Shared offers refresh in <strong id="shop-timer" style="color:var(--orange)">${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}</strong>. Everyone sees the same offers.</div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px"><label for="sellShop">Sell to:</label><select id="sellShop" style="background:#201a28;color:white;padding:8px;border-radius:10px;font:inherit"><option value="best">Best price for each candy</option>${options}</select><button class="buy-btn" onclick="executeSellAll()">Sell All Inventory</button><button class="buy-btn" onclick="executeSellSelected()">Sell Selected</button></div><p style="font-size:16px;color:var(--fg2);margin-bottom:12px">Select candies below. Best-price selling routes each candy to the highest-paying shop. Crew inventory is included.</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:16px;min-width:560px"><thead><tr style="text-align:left;color:var(--orange)"><th style="padding:8px">Select</th><th>Candy</th><th>Basket</th><th>Crew</th><th>Best offer</th><th>Shop comparison</th></tr></thead><tbody>${CANDY_CATALOG.map(c=>{const crew=(s.crew||[]).reduce((n,h)=>n+Number((h.inventory||{})[c.id]||0),0),qty=Number(s.inventory[c.id]||0),prices=s.shops.map(shop=>({name:shop.name,price:Number(shop.prices[c.id]||0)})).sort((a,b)=>b.price-a.price);return `<tr style="border-top:1px solid rgba(255,255,255,.08)"><td style="padding:8px"><input class="sellCandyCheck" type="checkbox" value="${c.id}" ${qty+crew===0?'disabled':''} aria-label="Select ${c.name}"></td><td>${c.name}<div style="font-size:13px;color:var(--fg2)">${c.rarity}</div></td><td>${qty}</td><td>${crew}</td><td style="color:#F5C451">${formatCash(prices[0]?.price||0)}</td><td>${prices.map(p=>`<span style="display:inline-block;margin:2px 5px 2px 0;white-space:nowrap">${p.name}: ${formatCash(p.price)}</span>`).join('')}</td></tr>`;}).join('')}</tbody></table></div>`;
    if (shopTimerInterval) clearInterval(shopTimerInterval);
    let refreshRequestedFor = 0;
    const tick = async () => {
        const el = document.getElementById('shop-timer');
        if (!el || currentModal !== 'shops') return;
        const left = Math.max(0, Math.ceil((gameState.offerRefreshAt - Date.now()) / 1000));
        el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (left === 0 && refreshRequestedFor !== gameState.offerRefreshAt && !shopRefreshInFlight) {
            refreshRequestedFor = gameState.offerRefreshAt;
            shopRefreshInFlight = true;
            try {
                const refreshed = await apiCall('?action=shops');
                if (refreshed?.state && currentModal === 'shops') {
                    gameState = refreshed.state;
                    updateUI();
                    renderShops(document.getElementById('modalBody'));
                }
            } finally {
                shopRefreshInFlight = false;
            }
        }
    };
    tick();
    shopTimerInterval = setInterval(tick, 1000);
}
window.executeSellAll = async function() {
 const shopId=document.getElementById('sellShop')?.value||'best';
 await performOptimisticAction('?action=sell',shopId==='best'?{}:{shopId},state=>{
  let earned=0;for(const candy of CANDY_CATALOG){const qty=Math.max(0,Number(state.inventory[candy.id])||0);if(!qty)continue;
   const shop=shopId==='best'?[...state.shops].sort((a,b)=>Number(b.prices[candy.id]||0)-Number(a.prices[candy.id]||0))[0]:state.shops.find(x=>x.id===shopId);
   earned+=qty*Number(shop?.prices?.[candy.id]||0);state.inventory[candy.id]=0;
  }state.cash=Number(state.cash||0)+earned;
 },r=>'Sold '+(r.sold||0)+' candies for '+formatCash(r.earned||0)+'.');
}

function renderUpgrades(container) {
    const upg = gameState.upgrades;
    const list = [
        { id: 'capacity', name: 'Basket Capacity', desc: 'Hold more candy', data: upg.capacity },
        { id: 'power', name: 'Click Power', desc: 'More candy per click', data: upg.power },
        { id: 'luck', name: 'Candy Luck', desc: 'Higher chance for rare drops', data: upg.luck },
        { id: 'autoSell', name: 'Auto-Sell', desc: 'Crew automatically sells when full', data: upg.autoSell }
    ];

    let html = `<div class="upgrade-list">`;
    list.forEach(u => {
        const canAfford = gameState.cash >= u.data.nextCost;
        const maxed = u.data.nextCost === -1;
        html += `
            <div class="upgrade-row">
                <div>
                    <div class="upgrade-title-row"><h3 style="color:#fff;">${u.name}</h3><span class="level-badge">LEVEL ${u.data.level}</span></div>
                    <div style="color:var(--fg2); font-size:16px;">${u.desc}</div>
                </div>
                <button class="buy-btn" ${(!canAfford || maxed) ? 'disabled' : ''} onclick="executeUpgrade('${u.id}')">
                    ${maxed ? 'MAXED' : formatCash(u.data.nextCost)}
                </button>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

window.executeSellSelected=async function(){
 const selected=Array.from(document.querySelectorAll('.sellCandyCheck:checked')).map(el=>el.value);if(!selected.length){showToast('Select at least one candy to sell.');return;}
 const shopId=document.getElementById('sellShop')?.value||'best',payload={selected};if(shopId!=='best')payload.shopId=shopId;
 await performOptimisticAction('?action=sell',payload,state=>{
  let earned=0;for(const id of selected){const qty=Math.max(0,Number(state.inventory[id])||0);const shop=shopId==='best'?[...state.shops].sort((a,b)=>Number(b.prices[id]||0)-Number(a.prices[id]||0))[0]:state.shops.find(x=>x.id===shopId);earned+=qty*Number(shop?.prices?.[id]||0);state.inventory[id]=0;}state.cash=Number(state.cash||0)+earned;
 },r=>'Sold '+(r.sold||0)+' candies for '+formatCash(r.earned||0)+'.');
};

window.executeUpgrade=async function(type){
 await performOptimisticAction('?action=upgrade',{type},state=>{
  const u=state.upgrades[type];if(!u||u.nextCost<0||state.cash<u.nextCost)return;
  const cost=u.nextCost;state.cash-=cost;state.stats.cashSpent=Number(state.stats.cashSpent||0)+cost;state.stats.upgradesBought=Number(state.stats.upgradesBought||0)+1;u.level++;
  const base={capacity:45,power:60,luck:90,autoSell:250}[type],max={capacity:30,power:20,luck:15,autoSell:1}[type];u.nextCost=u.level>=max?-1:Math.floor(base*Math.pow(1.62,u.level));
  if(type==='capacity')state.basketCapacity=Math.min(500,state.basketCapacity+10);if(type==='autoSell'&&u.level)state.crewUnlocked=state.crew.length>0;
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
 await performOptimisticAction('?action=crew-action',{action,index},state=>{
  state.stats ||= {};
  if(action==='hire'){if(state.crew.length>=5||state.cash<state.crewHireCost)return;const cost=state.crewHireCost;state.cash-=cost;state.stats.cashSpent=Number(state.stats.cashSpent||0)+cost;state.crewUnlocked=true;state.crew.push({id:'helper-'+(state.crew.length+1),speedLevel:0,capacityLevel:0,inventory:{},inventoryCount:0,capacity:10,intervalMs:12000,speedUpgradeCost:75,capUpgradeCost:65,lastActionAt:Date.now()});state.crewHireCost=Math.floor(state.crewHireCost*1.85);return;}
  const c=state.crew[index];if(!c)return;const speed=action==='upgrade_speed',cost=speed?Math.floor(75*Math.pow(1.7,c.speedLevel||0)):Math.floor(65*Math.pow(1.65,c.capacityLevel||0));if(state.cash<cost)return;
  state.cash-=cost;state.stats.cashSpent=Number(state.stats.cashSpent||0)+cost;state.stats.upgradesBought=Number(state.stats.upgradesBought||0)+1;
  if(speed){c.speedLevel=(c.speedLevel||0)+1;c.intervalMs=Math.max(2500,Math.floor(12000*Math.pow(.82,c.speedLevel)));c.speedUpgradeCost=c.speedLevel>=8?-1:Math.floor(75*Math.pow(1.7,c.speedLevel));}
  else{c.capacityLevel=(c.capacityLevel||0)+1;c.capacity=Math.min(100,10+c.capacityLevel*10);c.capUpgradeCost=c.capacityLevel>=9?-1:Math.floor(65*Math.pow(1.65,c.capacityLevel));}
 },r=>r.hired?'Helper hired!':'Crew upgrade purchased!');
}

function renderStats(container) {
    const s=gameState.stats||{},basket=Object.values(gameState.inventory||{}).reduce((a,n)=>a+Number(n||0),0),crew=(gameState.crew||[]).reduce((a,h)=>a+Number(h.inventoryCount||0),0),progress=Math.round(gameState.discovered.length/CANDY_CATALOG.length*100);
    const rows=[['Current cash',formatCash(gameState.cash)],['Highest cash balance',formatCash(s.highScore||0)],['Lifetime cash earned',formatCash(s.lifetimeCash||0)],['Total cash spent',formatCash(s.cashSpent||0)],['Lifetime candy collected',Number(s.totalCollected||0).toLocaleString()],['Candy sold',Number(s.totalSold||0).toLocaleString()],['Basket clicks',Number(s.totalClicks||0).toLocaleString()],['Rare and epic collected',Number(s.rareCollected||0).toLocaleString()],['Legendary collected',Number(s.legendaryCollected||0).toLocaleString()],['Upgrades purchased',Number(s.upgradesBought||0).toLocaleString()],['Crew candy collected',Number(s.crewCollected||0).toLocaleString()],['Crew candy sold',Number(s.crewSold||0).toLocaleString()],['Candy in basket',basket.toLocaleString()],['Candy held by crew',crew.toLocaleString()],['Candy Index',`${gameState.discovered.length}/${CANDY_CATALOG.length} (${progress}%)`]];
    container.innerHTML=`<div style="display:flex;flex-direction:column;gap:0;color:var(--fg2);font-size:18px">${rows.map(([label,value])=>`<div style="display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)"><span>${label}</span><strong style="color:#fff;text-align:right">${value}</strong></div>`).join('')}</div>`;
}
function renderLeaderboard(container) {
    const rankings = leaderboardCache;
    let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    html += `<div style="font-size:14px; color:var(--orange); margin-bottom:10px;">Ranked entirely by CURRENT CASH. Spend wisely!</div>`;
    
    rankings.forEach((r, i) => {
        const isMe = r.accountId === gameState.accountId;
        html += `
            <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,${isMe? '0.1' : '0.03'}); border-radius:8px; border:1px solid ${isMe? 'var(--orange)' : 'transparent'};">
                <div><span style="color:var(--fg2); margin-right:10px;">#${i+1}</span> <span style="color:#fff; font-weight:bold;">${escapeHTML(r.displayName)}</span></div>
                <div style="color:#F5C451; font-weight:bold;">${formatCash(r.cash)}</div>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

function maybeShowWelcomeGuide(){let seen=false;try{seen=localStorage.getItem('halloween_haunt_guide_seen_v1')==='1'}catch{}if(seen)return;helpSection=0;renderWelcomeGuide()}
function renderWelcomeGuide(){
 const s=HELP_SECTIONS[helpSection],last=helpSection===HELP_SECTIONS.length-1,overlay=document.getElementById('welcomeGuideOverlay');if(!overlay)return;
 overlay.innerHTML='<div class="welcome-guide-card" role="dialog" aria-modal="true" aria-labelledby="welcomeGuideTitle"><div class="welcome-guide-kicker">HALLOWEEN HAUNT · QUICK GUIDE</div><div class="welcome-guide-progress">SECTION '+(helpSection+1)+' OF '+HELP_SECTIONS.length+'</div><h2 id="welcomeGuideTitle">'+s.title+'</h2><p>'+s.body+'</p><div class="welcome-guide-dots">'+HELP_SECTIONS.map((_,i)=>'<span class="'+(i===helpSection?'active':'')+'"></span>').join('')+'</div><div class="welcome-guide-controls"><button class="guide-btn secondary" '+(helpSection===0?'disabled':'')+' onclick="changeWelcomeGuide(-1)">Previous</button><button class="guide-btn" onclick="changeWelcomeGuide(1)">'+(last?'Start playing':'Next')+'</button></div><button class="guide-skip" onclick="finishWelcomeGuide()">Skip guide</button></div>';overlay.classList.add('show');
}
function changeWelcomeGuide(direction){if(helpSection===HELP_SECTIONS.length-1&&direction>0){finishWelcomeGuide();return}helpSection=Math.max(0,Math.min(HELP_SECTIONS.length-1,helpSection+direction));renderWelcomeGuide()}
function finishWelcomeGuide(){try{localStorage.setItem('halloween_haunt_guide_seen_v1','1')}catch{}document.getElementById('welcomeGuideOverlay')?.classList.remove('show')}
window.changeWelcomeGuide=changeWelcomeGuide;window.finishWelcomeGuide=finishWelcomeGuide;
// Bootstrap
window.addEventListener('DOMContentLoaded', initGame);
window.retryHalloweenHauntLoad = initGame;
window.retryHalloweenHauntCollect = retryCollectQueue;

let crewExitSent=false;
function sellCrewCandyOnExit(){if(crewExitSent||!gameState||!gameState.crew?.length)return;crewExitSent=true;const sessionId=localStorage.getItem('session_id')||'';if(!sessionId)return;const deviceId=localStorage.getItem('device_id')||sessionId;const payload={requestId:'crew-exit-'+Date.now()+'-'+Math.random().toString(36).slice(2)};try{fetch(API_BASE+'?action=crew-exit',{method:'POST',keepalive:true,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Session-ID':sessionId,'X-Device-ID':deviceId},body:JSON.stringify(payload)}).catch(()=>{});}catch{}}
window.addEventListener('pagehide',sellCrewCandyOnExit);

window.addEventListener('pagehide', saveOfflineProgress);
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveOfflineProgress();
});
async function syncPendingOfflineClicks() {
    if (offlineSyncInFlight) return false;
    const saved = readOfflineProgress();
    let remaining = Math.max(0, Math.floor(Number(saved.offlineClicks) || 0));
    if (!remaining) return true;
    if (!navigator.onLine) return false;
    offlineSyncInFlight = true;
    updateOfflineCard('syncing');
    try {
        while (remaining > 0) {
            if (!navigator.onLine) throw new Error('Connection lost during sync.');
            let stateResult = await apiCall('?action=state');
            if (!stateResult?.state) throw new Error('Could not load the online game state.');
            gameState = stateResult.state;
            const owned = Object.values(gameState.inventory || {}).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
            if (owned >= Number(gameState.basketCapacity || 0)) throw new Error('Your online basket is full. Sell candy to make room for offline progress to sync.');
            const batch = Math.min(50, remaining);
            const result = await apiCall('?action=collect', 'POST', { clickCount: batch, requestId: 'offline-sync-' + (saved.updatedAt || 0) + '-' + (remaining - batch) + '-' + batch });
            if (!result?.state) throw new Error('The server did not confirm the offline clicks.');
            remaining -= batch;
            saved.offlineClicks = remaining;
            saved.updatedAt = Date.now();
            try { localStorage.setItem(OFFLINE_PROGRESS_KEY, JSON.stringify(saved)); }
            catch (_) { throw new Error('Could not update the local sync record.'); }
            gameState = result.state;
        }
        saved.offlineClicks = 0;
        saved.updatedAt = Date.now();
        try { localStorage.setItem(OFFLINE_PROGRESS_KEY, JSON.stringify(saved)); } catch (_) {}
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Offline progress sync is pending:', error);
        updateOfflineCard('failed');
        return false;
    } finally { offlineSyncInFlight = false; }
}

window.addEventListener('online', async () => {
    updateOfflineCard('syncing');
    const synced = await syncPendingOfflineClicks();
    if (synced) { offlineMode = false; await initGame(); }
    else updateOfflineCard('failed');
});
window.addEventListener('offline', () => updateOfflineCard('offline'));
setInterval(() => {
    if (navigator.onLine && !offlineSyncInFlight) {
        const saved = readOfflineProgress();
        if (Number(saved.offlineClicks) > 0) syncPendingOfflineClicks().then(synced => {
            if (synced && offlineMode) { offlineMode = false; initGame(); }
        });
    }
}, 10000);
