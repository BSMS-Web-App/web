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
const LAST_KNOWN_STATE_KEY = 'halloween_haunt_last_known_state_v1';
let offlineSyncInFlight = false;
let activeSessionHash = null;
let lastApiError = null;
let offlineConflictResolverOpen = false;

// Keep saved game data separate for each signed-in session. Never use a
// shared anonymous key: this browser may be used by more than one account.
function getSessionHash() {
    try {
        const sessionId = localStorage.getItem('session_id') || '';
        if (!sessionId) return null;
        let hash = 2166136261;
        for (let i = 0; i < sessionId.length; i++) {
            hash ^= sessionId.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    } catch (_) { return null; }
}

function getSessionStorageKey(baseKey) {
    const hash = getSessionHash();
    return hash ? baseKey + ':' + hash : null;
}

function readLastKnownOnlineState() {
    const key = getSessionStorageKey(LAST_KNOWN_STATE_KEY);
    const sessionHash = getSessionHash();
    if (!key || !sessionHash) return null;
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (!saved || saved.version !== 2 || saved.sessionHash !== sessionHash ||
            !saved.state || typeof saved.state !== 'object' ||
            !saved.state.accountId || saved.state.accountId === 'offline-local') return null;
        return saved.state;
    } catch (_) { return null; }
}

function saveLastKnownOnlineState() {
    const key = getSessionStorageKey(LAST_KNOWN_STATE_KEY);
    const sessionHash = getSessionHash();
    if (offlineMode || !key || !sessionHash || activeSessionHash !== sessionHash ||
        !gameState || !gameState.accountId || gameState.accountId === 'offline-local') return false;
    try {
        localStorage.setItem(key, JSON.stringify({ version: 2, sessionHash, savedAt: Date.now(), state: gameState }));
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Could not save last known online stats locally:', error);
        return false;
    }
}

function readOfflineProgress() {
    const key = getSessionStorageKey(OFFLINE_PROGRESS_KEY);
    const sessionHash = getSessionHash();
    if (!key || !sessionHash) return {};
    try {
        const saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
        return saved.sessionHash === sessionHash ? saved : {};
    } catch (_) { return {}; }
}

function writeOfflineProgress(saved) {
    const key = getSessionStorageKey(OFFLINE_PROGRESS_KEY);
    const sessionHash = getSessionHash();
    if (!key || !sessionHash) return false;
    try {
        localStorage.setItem(key, JSON.stringify({ ...saved, version: 2, sessionHash }));
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Could not save offline progress:', error);
        return false;
    }
}

function createDefaultStats(){return {highScore:100,lifetimeCash:0,cashSpent:0,totalClicks:0,totalCollected:0,totalSold:0,rareCollected:0,legendaryCollected:0,upgradesBought:0,crewCollected:0,crewSold:0};}
function createDefaultUpgrades(){return {capacity:{level:0,nextCost:45},power:{level:0,nextCost:60},luck:{level:0,nextCost:90},autoSell:{level:0,nextCost:5000}};}
function createDefaultShops(){
 const values=Object.fromEntries(CANDY_CATALOG.map(c=>[c.id,c.rarity==='Common'?1:c.rarity==='Uncommon'?2:c.rarity==='Rare'?4:c.rarity==='Epic'?8:16]));
 return [{id:'corner',name:'Corner Store',multiplier:1},{id:'market',name:'Harvest Market',multiplier:1.12},{id:'arcade',name:'Midnight Arcade',multiplier:.94},{id:'pharmacy',name:'Moonlight Pharmacy',multiplier:1.05}].map(s=>({...s,prices:Object.fromEntries(Object.entries(values).map(([id,v])=>[id,Math.max(1,Math.round(v*s.multiplier))]))}));
}
function createOfflineGameState(){
 const inventory={},lifetimeCollected={};for(const c of CANDY_CATALOG){inventory[c.id]=0;lifetimeCollected[c.id]=0;}
 const now=Date.now(),values=Object.fromEntries(CANDY_CATALOG.map(c=>[c.id,c.rarity==='Common'?1:c.rarity==='Uncommon'?2:c.rarity==='Rare'?4:c.rarity==='Epic'?8:16]));
 const shops=createDefaultShops();
 return {accountId:'offline-local',displayName:'Offline Player',cash:100,inventory,discovered:[],lifetimeCollected,feedCandy:0,currentBasketCount:0,basketCapacity:50,upgrades:createDefaultUpgrades(),crew:[],crewUnlocked:false,crewHireCost:180,stats:createDefaultStats(),shops,candyCatalog:CANDY_CATALOG.map(c=>({...c,baseValue:values[c.id]})),offerWindow:Math.floor(now/300000)*300000,offerRefreshAt:(Math.floor(now/300000)+1)*300000,startsAt:Date.parse(START_Z),endsAt:Date.parse(DEADLINE_Z),crewAutoSell:false};
}
function chooseOfflineCandy(){
 const weights={Common:62,Uncommon:24,Rare:10,Epic:3.3,Legendary:.7},luck=Math.min(14,Math.max(0,Number(gameState?.upgrades?.luck?.level)||0)),items=CANDY_CATALOG.map(c=>({c,w:(weights[c.rarity]||1)*(c.rarity==='Common'?1:1+luck*.055)}));
 let roll=Math.random()*items.reduce((n,x)=>n+x.w,0);for(const x of items){roll-=x.w;if(roll<=0)return x.c;}return items[0].c;
}
function recalculateBasketCount(state=gameState){if(!state)return 0;state.inventory||={};state.currentBasketCount=Object.values(state.inventory).reduce((n,q)=>n+Math.max(0,Math.floor(Number(q)||0)),0);return state.currentBasketCount;}
function recordOfflineCandy(candy,amount=1){
 gameState.inventory||={};gameState.lifetimeCollected||={};gameState.discovered||=[];gameState.stats||=createDefaultStats();
 gameState.inventory[candy.id]=Math.max(0,Number(gameState.inventory[candy.id])||0)+amount;
 gameState.feedCandy=Math.max(0,Number(gameState.feedCandy)||0)+amount;
 gameState.lifetimeCollected[candy.id]=Math.max(0,Number(gameState.lifetimeCollected[candy.id])||0)+amount;
 if(!gameState.discovered.includes(candy.id))gameState.discovered.push(candy.id);
 gameState.stats.totalCollected=Number(gameState.stats.totalCollected||0)+amount;
 if(candy.rarity==='Rare'||candy.rarity==='Epic')gameState.stats.rareCollected=Number(gameState.stats.rareCollected||0)+amount;
 if(candy.rarity==='Legendary')gameState.stats.legendaryCollected=Number(gameState.stats.legendaryCollected||0)+amount;
}
function offlinePrice(id,shopId='best'){const shops=gameState?.shops||[];return shopId==='best'?Math.max(0,...shops.map(s=>Number(s.prices?.[id])||0)):Math.max(0,Number(shops.find(s=>s.id===shopId)?.prices?.[id])||0);}
function sellOfflineCandy(){
 let earned=0,sold=0;
 for(const c of CANDY_CATALOG){const qty=Math.max(0,Math.floor(Number(gameState.inventory?.[c.id])||0));if(qty){earned+=qty*offlinePrice(c.id,'best');sold+=qty;gameState.inventory[c.id]=0;}}
 if(sold){gameState.cash=Number(gameState.cash||0)+earned;gameState.stats||=createDefaultStats();gameState.stats.totalSold=Number(gameState.stats.totalSold||0)+sold;gameState.stats.lifetimeCash=Number(gameState.stats.lifetimeCash||0)+earned;gameState.stats.highScore=Math.max(Number(gameState.stats.highScore||0),gameState.cash);}
 recalculateBasketCount();return {sold,earned};
}
function rotateOfflineShopOffers(){
 if(!offlineMode||!gameState)return;
 const values=Object.fromEntries(CANDY_CATALOG.map(c=>[c.id,c.rarity==='Common'?1:c.rarity==='Uncommon'?2:c.rarity==='Rare'?4:c.rarity==='Epic'?8:16]));
 const mult={corner:1,market:1.12,arcade:.94,pharmacy:1.05};
 gameState.shops=(gameState.shops||createDefaultShops()).map(s=>({...s,prices:Object.fromEntries(Object.entries(values).map(([id,v])=>[id,Math.max(1,Math.round(v*(mult[s.id]||1)*(.82+Math.random()*.38)))]))}));
 const now=Date.now();gameState.offerWindow=Math.floor(now/300000)*300000;gameState.offerRefreshAt=gameState.offerWindow+300000;
 gameState.candyCatalog=CANDY_CATALOG.map(c=>({...c,baseValue:values[c.id],bestPrice:Math.max(0,...gameState.shops.map(s=>Number(s.prices[c.id])||0))}));saveOfflineProgress();
}
function updateOfflineCard(mode, detail = '') {
 const card=document.getElementById('offlineBanner');if(!card)return;
 if(mode==='hidden'){card.style.display='none';card.innerHTML='';return;}
 card.style.display='flex';
 card.innerHTML='<div class="offline-card-title"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5A15 15 0 0 1 22 8.5"></path><path d="M5 12a10 10 0 0 1 14 0"></path><path d="M8.5 15.5a5 5 0 0 1 7 0"></path><path d="M12 19h.01"></path><path d="M3 3l18 18"></path></svg><span>Server Connection Failed</span></div><button type="button" class="offline-learn-more" onclick="openOfflineHelp()">Learn More</button>';
}
function openOfflineHelp(){document.getElementById('offlineHelpOverlay')?.classList.add('show');}
function closeOfflineHelp(){document.getElementById('offlineHelpOverlay')?.classList.remove('show');}
window.openOfflineHelp=openOfflineHelp;window.closeOfflineHelp=closeOfflineHelp;

function saveOfflineProgress() {
    if (!offlineMode || !gameState) return true;
    const previous=readOfflineProgress();
    // If gameplay changes after a sync request may have reached the server,
    // discard that request ID. A retry with the old ID could otherwise replay
    // the earlier snapshot and accidentally discard these newer local changes.
    if (previous.pendingFullSyncRequestId && previous.localState &&
        JSON.stringify(previous.localState) !== JSON.stringify(gameState)) {
        delete previous.pendingFullSyncRequestId;
    }
    const snapshot={...previous,version:2,localState:cloneGameState(gameState),hasLocalChanges:true,currentBasketCount:recalculateBasketCount(gameState),cash:Math.max(0,Number(gameState.cash)||0),offlineClicks:0,updatedAt:Date.now()};
    try {
        if (!writeOfflineProgress(snapshot)) throw new Error('Session-scoped storage is unavailable.');
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Offline save failed:', error);
        const banner = document.getElementById('offlineBanner');
        if (banner) {
            banner.textContent = 'Offline practice is running, but this browser could not save progress for this session. Keep this tab open until the connection returns and check browser storage settings.';
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
 {title:"Collect Candy",body:"Click the pumpkin to collect candy. Your basket has a capacity limit. Candy has different rarities, and the Candy Index records the types you discover."},
 {title:"Sell All Candy",body:"Open Shops to sell everything in your player basket at once. The game automatically sends each candy type to the shop offering the best price. You cannot pick a shop or sell only selected candy."},
 {title:"Upgrade Your Progress",body:"Basket Capacity lets you carry more candy, Click Power gives you more candy per click, and Candy Luck improves your chance of finding rarer candy. Auto Sell is a one-time $5,000 unlock that sells your full basket one second after it fills."},
 {title:"Manage Your Crew",body:"Hire up to 20 named crew members. They collect candy while the game is open and automatically sell a full basket after 20 seconds to the best-paying shop. They fall asleep after five minutes and must be woken manually. Your Candy Reserve grows as candy is collected; feeding costs 10 times your basket capacity and boosts a crew member for 20 minutes. Use Settings to control notifications or replay this guide."}
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
 if(currentModal==='shops')renderShops(body);else if(currentModal==='upgrades')renderUpgrades(body);else if(currentModal==='crew'){if(typeof window.renderCrew==='function')window.renderCrew(body);else renderCrew(body);}else if(currentModal==='index')renderIndex(body);else if(currentModal==='stats')renderStats(body);else if(currentModal==='leaderboard')renderLeaderboard(body);
}
let pendingOptimisticActions=0;
let actionQueuePromise=Promise.resolve();
let lastAuthoritativeActionState=null;

function performOptimisticAction(endpoint,payload,mutate,successMessage) {
 if(!gameState)return Promise.resolve();
 const action=String(endpoint.split('action=')[1]||'').split('&')[0];
 if(offlineMode){
  if(action==='sell'){const result=sellOfflineCandy();if(!result.sold){showToast('There is no matching candy to sell.');return Promise.resolve();}saveOfflineProgress();updateUI();renderCurrentModal();if(successMessage)showToast(successMessage(result));return Promise.resolve(result);}
  mutate(gameState);recalculateBasketCount();gameState.stats||=createDefaultStats();gameState.stats.highScore=Math.max(Number(gameState.stats.highScore||0),Number(gameState.cash||0));saveOfflineProgress();updateUI();renderCurrentModal();if(successMessage)showToast(successMessage({state:gameState,hired:payload?.action==='hire'}));return Promise.resolve(gameState);
 }
 // Optimistically update the interface before starting any network work. Actions
 // are serialized in the background so server transactions cannot race each other.
 if(pendingOptimisticActions===0)lastAuthoritativeActionState=cloneGameState(gameState);
 let optimisticResult={state:gameState,hired:payload?.action==='hire'};
 if(action==='sell'){
  let sold=0,earned=0;
  for(const candy of CANDY_CATALOG){const qty=Math.max(0,Math.floor(Number(gameState.inventory?.[candy.id])||0));if(!qty)continue;const shop=[...(gameState.shops||[])].sort((a,b)=>Number(b.prices?.[candy.id]||0)-Number(a.prices?.[candy.id]||0))[0];sold+=qty;earned+=qty*Math.max(0,Number(shop?.prices?.[candy.id]||0));}
  optimisticResult={...optimisticResult,sold,earned};
 }
 mutate(gameState);
 recalculateBasketCount();
 updateUI();
 renderCurrentModal();
 if(successMessage){try{const message=successMessage(optimisticResult);if(message)showToast(message);}catch(error){console.warn('[Halloween Haunt] Could not create optimistic success notice:',error);}}
 pendingOptimisticActions++;
 actionQueuePromise=actionQueuePromise.then(async()=>{
  try{
   const result=await apiCall(endpoint,'POST',payload);
   if(result?.state)lastAuthoritativeActionState=cloneGameState(result.state);
  }catch(error){console.error('[Halloween Haunt] Action request failed:',error);}
 }).catch(error=>console.error('[Halloween Haunt] Action queue failed:',error)).finally(()=>{
  pendingOptimisticActions=Math.max(0,pendingOptimisticActions-1);
  if(pendingOptimisticActions===0){
   if(lastAuthoritativeActionState)gameState=cloneGameState(lastAuthoritativeActionState);
   activeSessionHash=getSessionHash();
   saveLastKnownOnlineState();
   updateUI();
   renderCurrentModal();
  }
 });
 return actionQueuePromise;
}
function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(String.fromCharCode(34), '&quot;').replaceAll(String.fromCharCode(39), '&#39;'); }


// ------------------------------------------------------------------
// API Communication
// ------------------------------------------------------------------
async function apiCall(endpoint, method = 'GET', payload = null) {
    const sessionId = localStorage.getItem('session_id') || '';
    const isHealthCheck = endpoint.includes('action=health');
    // Offline practice must work without an account session.
    // Let the caller fall back to local-only play instead of blocking the game.
    if (!sessionId && !isHealthCheck) {
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
            if (!(endpoint.includes('action=offline-sync') && res.status === 409 && lastApiError.message.includes('changed since this offline session began'))) showToast(lastApiError.message);
            return null;
        }
        return data;
    } catch (e) {
        // A failed request is not a reason to block offline practice.
        // initGame() switches to local state when the API cannot be reached.
        console.warn("[Halloween Haunt] API unavailable; local/offline fallback will be used:", endpoint);
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
    const saved=readOfflineProgress(),lastKnown=readLastKnownOnlineState();activeSessionHash=getSessionHash();
    const restored=saved.localState&&typeof saved.localState==='object'?cloneGameState(saved.localState):lastKnown?cloneGameState(lastKnown):createOfflineGameState();
    gameState={...restored,accountId:restored.accountId||'offline-local',displayName:restored.displayName||'Offline Player',cash:Math.max(0,Number(restored.cash??saved.cash)||0),basketCapacity:Math.max(1,Number(restored.basketCapacity)||50),upgrades:{...createDefaultUpgrades(),...(restored.upgrades||{})},startsAt:Number(restored.startsAt)||Date.parse(START_Z),endsAt:Number(restored.endsAt)||Date.parse(DEADLINE_Z),crew:Array.isArray(restored.crew)?restored.crew:[],discovered:Array.isArray(restored.discovered)?restored.discovered:[],candyCatalog:Array.isArray(restored.candyCatalog)?restored.candyCatalog:CANDY_CATALOG,shops:Array.isArray(restored.shops)&&restored.shops.length?restored.shops:createDefaultShops(),lifetimeCollected:restored.lifetimeCollected||{},inventory:restored.inventory||{},stats:{...createDefaultStats(),...(restored.stats||{})},crewHireCost:Number(restored.crewHireCost)||180,crewUnlocked:Boolean(restored.crewUnlocked)};
    for(const c of CANDY_CATALOG){gameState.inventory[c.id]=Math.max(0,Number(gameState.inventory[c.id])||0);gameState.lifetimeCollected[c.id]=Math.max(0,Number(gameState.lifetimeCollected[c.id])||0);}recalculateBasketCount();
    leaderboardCache = [];
    updateOfflineCard(navigator.onLine ? 'failed' : 'offline');
    document.querySelector('.hero-cash-label')?.replaceChildren(document.createTextNode('Offline Practice'));
    updateUI();
    updateTimer();
    if (!window.halloweenHauntTimerStarted) {
        window.halloweenHauntTimerStarted = true;
        setInterval(updateTimer, 1000);
        setInterval(syncCrew, 3000);
    }
    preloadCandyImages();
    hideLoadingScreen();
    maybeShowWelcomeGuide();
}

async function initGame() {
    const retryButton = document.getElementById('loadingRetry');
    if (retryButton) retryButton.hidden = true;
    setLoadingMessage('Loading your game, shops, collection, and candy artwork…');

    const savedLocal=readOfflineProgress();
    if(savedLocal.hasLocalChanges&&savedLocal.localState){await enterOfflineMode();if(navigator.onLine)updateOfflineCard('failed');return;}
    const data = navigator.onLine ? await apiCall('?action=state') : null;
    if (!data?.state) {
        await enterOfflineMode();
        return;
    }

    // Save authoritative state before optional requests such as the leaderboard.
    // A leaderboard outage must not block the player's online game.
    offlineMode = false;
    gameState = data.state;
    activeSessionHash = getSessionHash();
    saveLastKnownOnlineState();

    const [leaderboard] = await Promise.all([
        apiCall('?action=leaderboard'),
        preloadCandyImages(),
        document.fonts?.ready || Promise.resolve()
    ]);
    leaderboardCache = Array.isArray(leaderboard?.rankings) ? leaderboard.rankings : [];
    const queuedOfflineClicks = Math.max(0, Math.floor(Number(readOfflineProgress().offlineClicks) || 0));
    updateOfflineCard(!navigator.onLine ? 'offline' : queuedOfflineClicks > 0 ? 'failed' : 'hidden');
    updateUI();
    updateTimer();
    if (!window.halloweenHauntTimerStarted) {
        window.halloweenHauntTimerStarted = true;
        setInterval(updateTimer, 1000);
    }
    if(!window.halloweenHauntOnlineIntervalsStarted){window.halloweenHauntOnlineIntervalsStarted=true;setInterval(syncCrew,3000);setInterval(refreshLeaderboard,60000);}
    hideLoadingScreen();
    maybeShowWelcomeGuide();
}

function updateTimer(){if(!gameState)return;const now=Date.now(),start=Number(gameState.startsAt||Date.parse(START_Z)),end=Number(gameState.endsAt||Date.parse(DEADLINE_Z));isEventActive=now>=start&&now<end;const timer=document.getElementById('ui-timer'),label=timer?.previousSibling;if(!timer)return;if(now<start){if(label)label.textContent='Starts in: ';timer.textContent=eventDuration(start-now);}else if(now<end){if(label)label.textContent='Ends in: ';timer.textContent=eventDuration(end-now);}else{if(label)label.textContent='';timer.textContent='EVENT ENDED';}}
function eventDuration(ms){const t=Math.max(0,Math.floor(ms/1000)),d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60),s=t%60;return d>0?d+'d '+h+'h '+m+'m '+s+'s':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

async function syncCrew(){
 if(!gameState||!isEventActive||!gameState.crewUnlocked||document.visibilityState==='hidden')return;
 if(offlineMode){
  let changed=false;const now=Date.now();
  for(const crew of gameState.crew||[]){
   crew.inventory||={};crew.awakeMs=Number(crew.awakeMs||0);crew.fedUntil=Number(crew.fedUntil||0);crew.workMs=Number(crew.workMs||0);crew.capacityLevel=Number(crew.capacityLevel||0);if(crew.capacityLevel===0&&Number(crew.capacity||10)<=10)crew.capacity=50;crew.intervalMs=2000;
   if(crew.asleep)continue;
   const fed=crew.fedUntil>now;
   const last=Number(crew.lastActionAt)||now,elapsed=Math.max(0,Math.min(5000,now-last));crew.lastActionAt=now;if(!fed)crew.awakeMs+=elapsed;
   if(!fed&&crew.awakeMs>=300000+Number(crew.awakeLevel||0)*60000){crew.asleep=true;changed=true;continue;}
   const cap=Math.max(1,Math.floor(Number(crew.capacity||50)*(fed?1.25:1))),interval=Math.max(500,Number(crew.intervalMs||2000)*(fed?.75:1));
   crew.workMs+=elapsed;
   let ticks=Math.min(5,Math.floor(crew.workMs/interval));crew.workMs-=ticks*interval;
   for(let t=0;t<ticks;t++){
    const held=Object.values(crew.inventory).reduce((n,v)=>n+Math.max(0,Number(v)||0),0);if(held>=cap)break;
    const candy=chooseOfflineCandy(),basePower=Math.min(8,1+Number(crew.powerLevel||0)),power=Math.min(cap-held,basePower+(fed?Math.max(1,Math.ceil(basePower*.25)):0));
    for(let k=0;k<power;k++){crew.inventory[candy.id]=Number(crew.inventory[candy.id]||0)+1;gameState.lifetimeCollected[candy.id]=Number(gameState.lifetimeCollected[candy.id]||0)+1;}
    crew.inventoryCount=held+power;crew.collectedCount=Number(crew.collectedCount||0)+power;gameState.feedCandy=Number(gameState.feedCandy||0)+power;gameState.stats.totalCollected=Number(gameState.stats.totalCollected||0)+power;gameState.stats.crewCollected=Number(gameState.stats.crewCollected||0)+power;
    if(!gameState.discovered.includes(candy.id))gameState.discovered.push(candy.id);
    if(candy.rarity==='Rare'||candy.rarity==='Epic')gameState.stats.rareCollected=Number(gameState.stats.rareCollected||0)+power;if(candy.rarity==='Legendary')gameState.stats.legendaryCollected=Number(gameState.stats.legendaryCollected||0)+power;
    changed=true;
   }
   if(crew.inventoryCount>=cap&&!crew.sellReadyAt)crew.sellReadyAt=now+Math.max(4000,20000-2000*Number(crew.speedLevel||0))*(fed?.75:1);
   if(crew.sellReadyAt&&now>=crew.sellReadyAt&&crew.inventoryCount>0){const sold=sellCrewOffline(crew);if(sold)changed=true;}
  }
  if(changed){saveOfflineProgress();updateUI();if(currentModal==='crew'){if(typeof window.renderCrew==='function')window.renderCrew(document.getElementById('modalBody'));else renderCrew();}if(currentModal==='shops')renderShops(document.getElementById('modalBody'));if(currentModal==='index')renderIndex(document.getElementById('modalBody'));if(currentModal==='stats')renderStats(document.getElementById('modalBody'));}
  return;
 }
 const res=await apiCall('?action=crew-sync','POST');if(res?.state){gameState=res.state;activeSessionHash=getSessionHash();saveLastKnownOnlineState();updateUI();if(currentModal==='crew')renderCrew();}
}
function sellCrewOffline(crew){
 let earned=0,sold=0;for(const c of CANDY_CATALOG){const q=Math.max(0,Number(crew.inventory?.[c.id])||0);if(q){earned+=q*offlinePrice(c.id,'best');sold+=q;crew.inventory[c.id]=0;}}
 crew.inventoryCount=0;crew.sellReadyAt=0;if(sold){gameState.cash=Number(gameState.cash||0)+earned;gameState.stats.totalSold=Number(gameState.stats.totalSold||0)+sold;gameState.stats.crewSold=Number(gameState.stats.crewSold||0)+sold;gameState.stats.lifetimeCash=Number(gameState.stats.lifetimeCash||0)+earned;gameState.stats.highScore=Math.max(Number(gameState.stats.highScore||0),gameState.cash);crew.moneyEarned=Number(crew.moneyEarned||0)+earned;}return sold;
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
function handleBasketClick(e) {
    if (!gameState) { showToast("Halloween Haunt is still connecting."); return; }
    if (!isEventActive) { showToast("Event is not active."); return; }
    if (offlineMode && offlineSyncInFlight) {
        showToast('Saving offline progress. Please wait a moment.');
        return;
    }

    const perClick = Math.min(8, Math.max(1, Number(gameState.upgrades?.power?.level || 0) + 1));
    let confirmed = Math.max(0, Number(gameState.currentBasketCount) || 0);
    const pendingCandy = (pendingClicks + retryBatchClicks + inFlightClicks) * perClick;
    if (confirmed + pendingCandy >= Number(gameState.basketCapacity || 0)) {
        showToast("Basket is full! Sell candy to make room.");
        return;
    }

    if(offlineMode){
        const room=Math.max(0,Number(gameState.basketCapacity||50)-recalculateBasketCount()),amount=Math.min(room,perClick);
        if(amount<=0){showToast('Basket is full. Sell candy to make room.');return;}
        for(let n=0;n<amount;n++){const candy=chooseOfflineCandy();recordOfflineCandy(candy,1);spawnFallingCandy(candy.id,e.clientX,e.clientY);}
        gameState.stats.totalClicks=Number(gameState.stats.totalClicks||0)+1;recalculateBasketCount();saveOfflineProgress();updateUI();
        if(currentModal==='index')renderIndex(document.getElementById('modalBody'));if(currentModal==='stats')renderStats(document.getElementById('modalBody'));return;
    }

    // Animate visual candy immediately. The server remains authoritative for
    // inventory; network latency must not delay the pumpkin's visual feedback.
    for (let i = 0; i < perClick; i++) {
        const previewCandy = chooseOfflineCandy();
        if (previewCandy) spawnFallingCandy(previewCandy.id, e?.clientX, e?.clientY);
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
    saveLastKnownOnlineState();
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
    if(offlineMode&&type==='leaderboard'){
        currentModal=type;document.querySelectorAll('.action-btn').forEach(b=>b.classList.toggle('active',b.getAttribute('onclick')===`openModal('${type}')`));
        document.getElementById('hauntModalOverlay').classList.add('show');document.getElementById('modalTitle').innerText='Leaderboard';
        document.getElementById('modalBody').innerHTML='<div class="offline-leaderboard-note"><strong>Leaderboard unavailable offline</strong><p>Your local progress is saved on this device. Reconnect to load the live leaderboard.</p></div>';return;
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
      grid.innerHTML=list.map(c=>{const found=gameState.discovered.includes(c.id),crew=(gameState.crew||[]).reduce((n,h)=>n+Number((h.inventory||{})[c.id]||0),0),qty=Number(gameState.inventory[c.id]||0)+crew,lifetime=Number((gameState.lifetimeCollected||{})[c.id]||0),best=gameState.candyCatalog?.find(x=>x.id===c.id)?.bestPrice||c.baseValue||0;return `<div class="candy-card rarity-${c.rarity.toLowerCase()} ${found?'':'locked'}" style="cursor:default;--rarity-color:${({Common:'#ddd',Uncommon:'#45d483',Rare:'#4c9dff',Epic:'#b66aff',Legendary:'#ffc94a',Mythic:'#ff5ca8'})[c.rarity]||'#ddd'}"><img loading="lazy" src="${IMG_BASE}${c.file}" alt="${found?c.name:'Undiscovered candy'}" onerror="this.style.visibility='hidden'"><div>${found?c.name:'???'}</div><div class="qty">${c.rarity}</div><div class="qty">Owned: ${qty}</div><div class="qty">Lifetime: ${lifetime}</div><div class="qty">Best: ${formatCash(best)}</div></div>`;}).join('')||'<p>No candies match these filters.</p>';
    };
    container.querySelector('#indexRarity').addEventListener('change',draw);container.querySelector('#indexProgress').addEventListener('change',draw);draw();
}
function renderShops(container) {
 const s=gameState,inventory=s.inventory||{},rows=CANDY_CATALOG.map(c=>{const qty=Math.max(0,Number(inventory[c.id])||0),prices=(s.shops||[]).map(shop=>({name:shop.name,price:Number(shop.prices?.[c.id]||0)})).sort((a,b)=>b.price-a.price),best=prices[0]?.price||0;return {c,qty,best,total:qty*best};}).filter(x=>x.qty>0);
 const count=rows.reduce((n,x)=>n+x.qty,0),total=rows.reduce((n,x)=>n+x.total,0),seconds=Math.max(0,Math.ceil((Number(s.offerRefreshAt||Date.now())-Date.now())/1000));
 container.innerHTML='<section class="hh-card-ui"><div class="hh-card-heading"><h3>Sell all your candy</h3><span class="hh-badge">BEST PRICE AUTOMATICALLY</span></div><p class="hh-muted">Your entire player basket is sold in one transaction. The game automatically chooses the highest-paying shop for each candy. You cannot choose a shop or sell only selected candy.</p><div class="hh-summary-grid"><div class="hh-stat-card"><small>Candy in basket</small><strong>'+count.toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Estimated payout</small><strong>'+formatCash(total)+'</strong></div><div class="hh-stat-card"><small>Offers refresh in</small><strong>'+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+'</strong></div></div><button class="buy-btn" id="hhSellAllButton" '+(count===0?'disabled':'')+'>Sell All Candy · '+formatCash(total)+'</button></section><section class="hh-card-ui"><div class="hh-card-heading"><h3>Sale breakdown</h3><span class="hh-badge">'+rows.length+' CANDY TYPES</span></div>'+(rows.length?'<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:9px">Candy</th><th style="text-align:right;padding:9px">Quantity</th><th style="text-align:right;padding:9px">Best price each</th><th style="text-align:right;padding:9px">Subtotal</th></tr></thead><tbody>'+rows.map(x=>'<tr style="border-top:1px solid #ffffff16"><td style="padding:9px">'+escapeHTML(x.c.name)+'<div class="hh-muted">'+escapeHTML(x.c.rarity)+'</div></td><td style="text-align:right;padding:9px">'+x.qty+'</td><td style="text-align:right;padding:9px">'+formatCash(x.best)+'</td><td style="text-align:right;padding:9px">'+formatCash(x.total)+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="3" style="text-align:right;padding:10px">Estimated total</th><th style="text-align:right;padding:10px">'+formatCash(total)+'</th></tr></tfoot></table></div>':'<p class="hh-muted">Your basket is empty. Click the pumpkin to collect candy.</p>')+'</section>';
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
    container.innerHTML=`<div style="display:flex;flex-direction:column;gap:0;color:var(--fg2);font-size:18px">${rows.map(([label,value])=>`<div style="display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)"><span>${label}</span><strong style="color:#fff;text-align:right">${value}</strong></div>`).join('')}</div>`;
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

function maybeShowWelcomeGuide(){let seen=false;try{seen=localStorage.getItem('halloween_haunt_guide_seen_v1')==='1'}catch{}if(seen)return;helpSection=0;renderWelcomeGuide()}
function renderWelcomeGuide(){
 const s=HELP_SECTIONS[helpSection],last=helpSection===HELP_SECTIONS.length-1,overlay=document.getElementById('welcomeGuideOverlay');if(!overlay)return;
 overlay.innerHTML='<div class="welcome-guide-card" role="dialog" aria-modal="true" aria-labelledby="welcomeGuideTitle"><div class="welcome-guide-kicker">HALLOWEEN HAUNT · QUICK GUIDE</div><div class="welcome-guide-progress">SECTION '+(helpSection+1)+' OF '+HELP_SECTIONS.length+'</div><h2 id="welcomeGuideTitle">'+s.title+'</h2><p>'+s.body+'</p><div class="welcome-guide-dots">'+HELP_SECTIONS.map((_,i)=>'<span class="'+(i===helpSection?'active':'')+'"></span>').join('')+'</div><div class="welcome-guide-controls"><button class="guide-btn secondary" '+(helpSection===0?'disabled':'')+' onclick="changeWelcomeGuide(-1)">Previous</button><button class="guide-btn" onclick="changeWelcomeGuide(1)">'+(last?'Start playing':'Next')+'</button></div><button class="guide-skip" onclick="finishWelcomeGuide()">Skip guide</button></div>';overlay.classList.add('show');
}
function changeWelcomeGuide(direction){if(helpSection===HELP_SECTIONS.length-1&&direction>0){finishWelcomeGuide();return}helpSection=Math.max(0,Math.min(HELP_SECTIONS.length-1,helpSection+direction));renderWelcomeGuide()}
function finishWelcomeGuide(){try{localStorage.setItem('halloween_haunt_guide_seen_v1','1')}catch{}document.getElementById('welcomeGuideOverlay')?.classList.remove('show')}
window.changeWelcomeGuide=changeWelcomeGuide;window.finishWelcomeGuide=finishWelcomeGuide;
// Bootstrap
document.addEventListener('visibilitychange',()=>{if(!gameState||!Array.isArray(gameState.crew))return;const now=Date.now();for(const worker of gameState.crew){worker.lastActionAt=now;}if(offlineMode)saveOfflineProgress();});
window.addEventListener('DOMContentLoaded', initGame);
window.retryHalloweenHauntLoad = initGame;
window.retryHalloweenHauntCollect = retryCollectQueue;

let crewPauseSent=false;
function pauseCrewOnExit(){if(crewPauseSent||!gameState||!gameState.crew?.length||offlineMode)return;crewPauseSent=true;const sessionId=localStorage.getItem('session_id')||'';if(!sessionId)return;const deviceId=localStorage.getItem('device_id')||sessionId;const payload={requestId:'crew-pause-'+Date.now()+'-'+Math.random().toString(36).slice(2)};try{fetch(API_BASE+'?action=crew-pause',{method:'POST',keepalive:true,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Session-ID':sessionId,'X-Device-ID':deviceId},body:JSON.stringify(payload)}).catch(()=>{});}catch{}}
window.addEventListener('pagehide',pauseCrewOnExit);

window.addEventListener('pagehide', saveOfflineProgress);
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveOfflineProgress();
});
async function syncPendingOfflineClicks() {
    if (offlineSyncInFlight) return false;
    let saved = readOfflineProgress();
    let remaining = Math.max(0, Math.floor(Number(saved.offlineClicks) || 0));
    if (!remaining) return true;
    if (!navigator.onLine || !getSessionHash()) return false;

    offlineSyncInFlight = true;
    updateOfflineCard('syncing');
    try {
        while (remaining > 0) {
            if (!navigator.onLine) throw new Error('Connection lost during sync.');

            const stateResult = await apiCall('?action=state');
            if (!stateResult?.state) throw new Error('Could not load the online game state.');
            gameState = stateResult.state;
            activeSessionHash = getSessionHash();

            let batch;
            let requestId;
            const pendingBatch = Math.floor(Number(saved.pendingSyncBatch) || 0);
            // Persist a batch ID and size before sending it. If the server commits
            // but the response is lost, retry that exact request instead of
            // recalculating a smaller batch from the changed basket capacity.
            if (typeof saved.pendingSyncRequestId === 'string' &&
                saved.pendingSyncRemaining === remaining &&
                pendingBatch >= 1 && pendingBatch <= 50) {
                batch = pendingBatch;
                requestId = saved.pendingSyncRequestId;
            } else {
                const owned = Object.values(gameState.inventory || {}).reduce(
                    (sum, qty) => sum + Math.max(0, Number(qty) || 0), 0
                );
                const capacity = Math.max(0, Number(gameState.basketCapacity) || 0);
                const room = Math.max(0, capacity - owned);
                if (room <= 0) {
                    throw new Error('Your online basket is full. Sell candy to make room for offline progress to sync.');
                }
                const perClick = Math.max(1, Math.min(50, 1 + Number(gameState.upgrades?.power?.level || 0)));
                const clicksThatFit = Math.max(1, Math.floor(room / perClick));
                batch = Math.min(50, remaining, clicksThatFit);
                requestId = 'offline-sync-' + getSessionHash() + '-' +
                    (saved.updatedAt || 0) + '-' + remaining + '-' + batch;
                saved.pendingSyncRequestId = requestId;
                saved.pendingSyncBatch = batch;
                saved.pendingSyncRemaining = remaining;
                if (!writeOfflineProgress(saved)) {
                    throw new Error('Could not save the retry-safe sync record on this device.');
                }
            }

            const result = await apiCall('?action=collect', 'POST', {
                clickCount: batch,
                requestId
            });
            if (!result?.state) throw new Error('The server did not confirm the offline clicks.');

            remaining = Math.max(0, remaining - batch);
            saved.offlineClicks = remaining;
            delete saved.pendingSyncRequestId;
            delete saved.pendingSyncBatch;
            delete saved.pendingSyncRemaining;
            saved.updatedAt = Date.now();
            if (!writeOfflineProgress(saved)) {
                // The pending request record was persisted before sending. If this
                // write fails, the same request ID remains available for replay.
                throw new Error('Could not update the local sync record.');
            }
            gameState = result.state;
            activeSessionHash = getSessionHash();
        }

        saved.offlineClicks = 0;
        delete saved.pendingSyncRequestId;
        delete saved.pendingSyncBatch;
        delete saved.pendingSyncRemaining;
        saved.updatedAt = Date.now();
        writeOfflineProgress(saved);
        if (gameState && !offlineMode) {
            activeSessionHash = getSessionHash();
            saveLastKnownOnlineState();
            updateUI();
            renderCurrentModal();
        }
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Offline progress sync is pending:', error);
        updateOfflineCard('failed');
        return false;
    } finally {
        offlineSyncInFlight = false;
    }
}



function offlineSaveSummary(state) {
    const s=state||{}, inventory=s.inventory||{}, stats=s.stats||{}, upgrades=s.upgrades||{};
    const candyCount=Object.values(inventory).reduce((n,q)=>n+Math.max(0,Number(q)||0),0);
    const discovered=Array.isArray(s.discovered)?s.discovered.length:0;
    const crew=Array.isArray(s.crew)?s.crew.length:0;
    const upgradeLevels=['capacity','power','luck','autoSell'].map(k=>Math.max(0,Number(upgrades[k]?.level)||0));
    return [['Cash',formatCash(s.cash)],['Candy in basket',candyCount.toLocaleString()],['Candy Reserve',Math.max(0,Number(s.feedCandy)||0).toLocaleString()],['Candy types discovered',discovered+' / '+CANDY_CATALOG.length],['Lifetime candy collected',Math.max(0,Number(stats.totalCollected)||0).toLocaleString()],['Candy sold',Math.max(0,Number(stats.totalSold)||0).toLocaleString()],['Crew members',crew+' / 20'],['Upgrade levels',upgradeLevels.join(' · ')],['Upgrades purchased',Math.max(0,Number(stats.upgradesBought)||0).toLocaleString()],['Lifetime cash earned',formatCash(stats.lifetimeCash)],['Lifetime cash spent',formatCash(stats.cashSpent)]];
}
function renderOfflineSaveDetails(state) {
    const s=state||{}, inventory=s.inventory||{}, upgrades=s.upgrades||{}, crew=Array.isArray(s.crew)?s.crew:[];
    const candyRows=CANDY_CATALOG.filter(c=>Math.max(0,Number(inventory[c.id])||0)>0).map(c=>'<div class="hh-conflict-stat"><span>'+escapeHTML(c.name)+' <em>'+escapeHTML(c.rarity)+'</em></span><strong>'+Math.max(0,Number(inventory[c.id])||0).toLocaleString()+'</strong></div>').join('')||'<div class="hh-conflict-empty">No candy currently in the basket</div>';
    const discovered=(Array.isArray(s.discovered)?s.discovered:[]).map(id=>CANDY_CATALOG.find(c=>c.id===id)?.name).filter(Boolean);
    const crewRows=crew.map(w=>'<div class="hh-conflict-stat"><span>'+escapeHTML(w.name||'Crew member')+'</span><strong>'+(w.asleep?'Asleep':'Awake')+' · '+Math.max(0,Number(w.inventoryCount)||0)+' candy</strong></div>').join('')||'<div class="hh-conflict-empty">No crew members hired</div>';
    const upgradeRows=[['Basket Capacity','capacity'],['Click Power','power'],['Candy Luck','luck'],['Auto Sell','autoSell']].map(([name,id])=>'<div class="hh-conflict-stat"><span>'+name+'</span><strong>'+(Number(upgrades[id]?.level)||0)+(id==='autoSell'?' '+((Number(upgrades[id]?.level)||0)>0?'(unlocked)':'(locked)'):'')+'</strong></div>').join('');
    return '<div class="hh-conflict-section-label">Save overview</div>'+offlineSaveSummary(s).map(([label,value])=>'<div class="hh-conflict-stat"><span>'+escapeHTML(label)+'</span><strong>'+escapeHTML(value)+'</strong></div>').join('')+'<details class="hh-conflict-details" open><summary>Candy in basket ('+CANDY_CATALOG.filter(c=>Math.max(0,Number(inventory[c.id])||0)>0).length+' types)</summary>'+candyRows+'</details><details class="hh-conflict-details"><summary>Candy Index ('+discovered.length+' discovered)</summary><p class="hh-conflict-discovered">'+escapeHTML(discovered.join(', ')||'No candy discovered yet')+'</p></details><details class="hh-conflict-details"><summary>Upgrade levels</summary>'+upgradeRows+'</details><details class="hh-conflict-details"><summary>Crew details ('+crew.length+' members)</summary>'+crewRows+'</details>';
}
function closeOfflineConflictResolver() {
    document.getElementById('hhOfflineConflictResolver')?.remove();
    document.getElementById('hhOfflineConflictStyles')?.remove();
    offlineConflictResolverOpen=false;
}
async function showOfflineConflictResolver(localState, baselineState) {
    if(offlineConflictResolverOpen)return;
    offlineConflictResolverOpen=true;
    // Display a full-screen conflict immediately, instead of waiting on the
    // extra state request (which previously made the conflict appear to do nothing).
    const loadingOverlay=document.createElement('div');
    loadingOverlay.id='hhOfflineConflictLoading';
    loadingOverlay.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:#07030cf5;color:#fff;font:600 17px system-ui;text-align:center';
    loadingOverlay.innerHTML='<div style="max-width:560px;padding:28px;border:1px solid #ba7dff77;border-radius:20px;background:#170c24"><h1 style="font-size:28px">Save conflict</h1><p>Your online game changed while you were playing offline.</p><p>Loading the current database save so you can compare it with your local save…</p><p style="font-size:14px;color:#d8c7e8">Your local progress remains saved on this device.</p></div>';
    document.body.appendChild(loadingOverlay);
    let onlineState=null;
    try { const result=await apiCall('?action=state'); onlineState=result?.state||null; }
    catch(error) { console.warn('[Halloween Haunt] Could not load current database save:',error); }
    if(!onlineState) {
        loadingOverlay.innerHTML='<div style="max-width:560px;padding:28px;border:1px solid #ba7dff77;border-radius:20px;background:#170c24"><h1 style="font-size:28px">Save conflict</h1><p>Could not load the current database save. Your local save is still safe.</p><p>Reconnect, then reload the page to retry the comparison.</p></div>';
        offlineConflictResolverOpen=false;
        return;
    }
    loadingOverlay.remove();
    const overlay=document.createElement('div');
    overlay.id='hhOfflineConflictResolver';overlay.className='hh-conflict-overlay';
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','hhConflictTitle');
    overlay.innerHTML='<div class="hh-conflict-shell"><header class="hh-conflict-header"><span class="hh-conflict-eyebrow">SAVE CONFLICT</span><h1 id="hhConflictTitle">Which save should we keep?</h1><p>Your online game changed while you were playing offline. Compare both saves, then choose which version becomes the official database save. Your local save will not be deleted until you choose.</p></header><div class="hh-conflict-columns"><section class="hh-conflict-save"><div class="hh-conflict-save-title"><span class="hh-conflict-dot online"></span><div><h2>Current database save</h2><p>Most recent save on the server</p></div></div><div class="hh-conflict-stats">'+renderOfflineSaveDetails(onlineState)+'</div><button type="button" class="hh-conflict-button keep-database" id="hhKeepDatabaseSave">Keep database save</button><small>This keeps the server version and discards this device’s pending offline changes.</small></section><section class="hh-conflict-save local"><div class="hh-conflict-save-title"><span class="hh-conflict-dot local"></span><div><h2>Your local offline save</h2><p>Progress saved on this device</p></div></div><div class="hh-conflict-stats">'+renderOfflineSaveDetails(localState)+'</div><button type="button" class="hh-conflict-button keep-local" id="hhKeepLocalSave">Keep local save and overwrite database</button><small>This replaces the database save with your local version. The current database save will be overwritten.</small></section></div><p class="hh-conflict-footnote">Neither option merges the two saves. Review the details carefully before choosing.</p><div class="hh-conflict-status" id="hhConflictStatus" role="status" aria-live="polite"></div></div>';
    const style=document.createElement('style');style.id='hhOfflineConflictStyles';
    style.textContent='#hhOfflineConflictResolver{position:fixed;inset:0;z-index:1000000;overflow:auto;background:radial-gradient(ellipse at top,#2b1743 0%,#100a19 48%,#07050b 100%);color:#fff;padding:clamp(18px,4vw,48px);display:flex;align-items:flex-start;justify-content:center;font-family:inherit}#hhOfflineConflictResolver *{box-sizing:border-box}#hhOfflineConflictResolver .hh-conflict-shell{width:min(1160px,100%);margin:auto}#hhOfflineConflictResolver .hh-conflict-header{max-width:800px;margin:0 auto 28px;text-align:center}#hhOfflineConflictResolver .hh-conflict-eyebrow{display:inline-flex;border:1px solid #ffb84d77;background:#ffb84d18;color:#ffd58a;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:900;letter-spacing:.13em}#hhOfflineConflictResolver h1{font-size:clamp(30px,5vw,52px);line-height:1.06;margin:18px 0 12px;color:#fff}#hhOfflineConflictResolver .hh-conflict-header p{color:#d4c8e0;font-size:16px;line-height:1.7;margin:0}#hhOfflineConflictResolver .hh-conflict-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}#hhOfflineConflictResolver .hh-conflict-save{min-width:0;padding:clamp(16px,2.5vw,26px);border:1px solid #8f8aa755;border-radius:22px;background:linear-gradient(145deg,#21182e,#100d17);box-shadow:0 20px 60px #0005}#hhOfflineConflictResolver .hh-conflict-save.local{border-color:#b56aff88;background:linear-gradient(145deg,#29163a,#100d17)}#hhOfflineConflictResolver .hh-conflict-save-title{display:flex;align-items:center;gap:12px;margin-bottom:20px}#hhOfflineConflictResolver .hh-conflict-save-title h2{font-size:21px;margin:0 0 5px;color:#fff}#hhOfflineConflictResolver .hh-conflict-save-title p{margin:0;color:#bdb0ca;font-size:13px}#hhOfflineConflictResolver .hh-conflict-dot{width:12px;height:12px;flex:none;border-radius:50%;background:#54d99b;box-shadow:0 0 16px #54d99b88}#hhOfflineConflictResolver .hh-conflict-dot.local{background:#c084fc;box-shadow:0 0 16px #c084fc88}#hhOfflineConflictResolver .hh-conflict-stats{display:grid;gap:0;margin-bottom:22px}#hhOfflineConflictResolver .hh-conflict-section-label{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#b8a5ca;margin:0 0 8px}#hhOfflineConflictResolver .hh-conflict-details{margin:13px 0;border:1px solid #ffffff18;border-radius:12px;background:#ffffff05;overflow:hidden}#hhOfflineConflictResolver .hh-conflict-details summary{padding:12px;color:#f0e7f7;font-size:13px;font-weight:800;cursor:pointer}#hhOfflineConflictResolver .hh-conflict-details[open] summary{border-bottom:1px solid #ffffff12}#hhOfflineConflictResolver .hh-conflict-details .hh-conflict-stat{padding:9px 12px}#hhOfflineConflictResolver .hh-conflict-details em{font-size:11px;font-style:normal;color:#aa99bb}#hhOfflineConflictResolver .hh-conflict-empty,#hhOfflineConflictResolver .hh-conflict-discovered{padding:10px 12px;margin:0;color:#bdb0ca;font-size:12px;line-height:1.7;overflow-wrap:anywhere}#hhOfflineConflictResolver .hh-conflict-stat{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #ffffff12}#hhOfflineConflictResolver .hh-conflict-stat span{color:#c4b8d0;font-size:13px}#hhOfflineConflictResolver .hh-conflict-stat strong{color:#fff;font-size:14px;text-align:right;overflow-wrap:anywhere}#hhOfflineConflictResolver .hh-conflict-button{width:100%;min-height:50px;padding:12px 16px;border:1px solid transparent;border-radius:13px;font:inherit;font-weight:850;cursor:pointer;transition:filter .15s,transform .15s}#hhOfflineConflictResolver .hh-conflict-button:hover{filter:brightness(1.12);transform:translateY(-1px)}#hhOfflineConflictResolver .keep-database{background:#d9fbe9;color:#12452d}#hhOfflineConflictResolver .keep-local{background:linear-gradient(110deg,#a855f7,#7c3aed);color:#fff}#hhOfflineConflictResolver .hh-conflict-save>small{display:block;color:#bdb0ca;font-size:12px;line-height:1.6;margin-top:11px}#hhOfflineConflictResolver .hh-conflict-footnote{text-align:center;color:#a99ab8;font-size:13px;line-height:1.6;margin:24px auto 0}#hhOfflineConflictResolver .hh-conflict-status:empty{display:none}#hhOfflineConflictResolver .hh-conflict-status{margin:16px auto 0;text-align:center;color:#ffb4bc;font-weight:700}#hhOfflineConflictResolver button:disabled{opacity:.55;cursor:wait;transform:none}@media(max-width:760px){#hhOfflineConflictResolver{padding:16px;align-items:flex-start}#hhOfflineConflictResolver .hh-conflict-columns{grid-template-columns:1fr}#hhOfflineConflictResolver .hh-conflict-header{margin-bottom:20px}#hhOfflineConflictResolver .hh-conflict-stat{gap:8px}#hhOfflineConflictResolver .hh-conflict-stat span{max-width:55%}}';
    document.head.appendChild(style);document.body.appendChild(overlay);
    const setBusy=(busy,message='')=>{overlay.querySelectorAll('button').forEach(b=>b.disabled=busy);const status=overlay.querySelector('#hhConflictStatus');if(status)status.textContent=message;};
    overlay.querySelector('#hhKeepDatabaseSave').addEventListener('click',()=>{
        setBusy(true,'Keeping the current database save…');
        const key=getSessionStorageKey(OFFLINE_PROGRESS_KEY);
        try{if(key)localStorage.removeItem(key);}catch(error){console.warn('[Halloween Haunt] Could not clear the local offline save:',error);}
        gameState=cloneGameState(onlineState);offlineMode=false;activeSessionHash=getSessionHash();saveLastKnownOnlineState();
        closeOfflineConflictResolver();updateOfflineCard('hidden');updateUI();renderCurrentModal();
        showToast('Kept the current database save. Local offline changes were discarded.');
    });
    overlay.querySelector('#hhKeepLocalSave').addEventListener('click',async()=>{
        setBusy(true,'Validating and saving your local version to the database…');
        try{
            const requestId='offline-resolve-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
            const result=await apiCall('?action=offline-sync-resolve','POST',{requestId,baselineState:baselineState,localState:localState});
            if(!result?.state)throw new Error(lastApiError?.message||'The server did not confirm the selected local save.');
            gameState=result.state;offlineMode=false;activeSessionHash=getSessionHash();
            const key=getSessionStorageKey(OFFLINE_PROGRESS_KEY);if(key)localStorage.removeItem(key);
            saveLastKnownOnlineState();updateOfflineCard('hidden');updateUI();renderCurrentModal();
            closeOfflineConflictResolver();showToast('Your local offline save is now the database save.');
        }catch(error){console.error('[Halloween Haunt] Conflict resolution failed:',error);setBusy(false,error?.message||'Could not save this version. Both saves are still available.');}
    });
}

async function syncOfflineGameProgress() {
    if (offlineSyncInFlight || !navigator.onLine || !getSessionHash()) return false;
    const saved = readOfflineProgress();
    if (!saved.hasLocalChanges || !saved.localState) return syncPendingOfflineClicks();
    const baseline = readLastKnownOnlineState();
    const localState = saved.localState;
    if (!baseline?.accountId || baseline.accountId === 'offline-local' || localState.accountId !== baseline.accountId) {
        showToast('This offline session has no matching saved online account state. Your progress remains saved on this device.');
        return false;
    }
    offlineSyncInFlight = true;
    updateOfflineCard('syncing');
    try {
        const requestId = saved.pendingFullSyncRequestId || ('offline-state-' + getSessionHash() + '-' + String(saved.updatedAt || 0));
        if (!saved.pendingFullSyncRequestId) {
            saved.pendingFullSyncRequestId = requestId;
            if (!writeOfflineProgress(saved)) throw new Error('Could not save the retry-safe sync record.');
        }
        const result = await apiCall('?action=offline-sync', 'POST', { requestId, baselineState: baseline, localState });
        if (!result?.state) {
            if (lastApiError?.status === 409 && lastApiError.message.includes('changed since this offline session began')) {
                delete saved.pendingFullSyncRequestId;
                writeOfflineProgress(saved);
                await showOfflineConflictResolver(localState, baseline);
                return false;
            }
            throw new Error(lastApiError?.message || 'The server did not confirm the offline progress sync.');
        }
        gameState = result.state;
        offlineMode = false;
        activeSessionHash = getSessionHash();
        const key = getSessionStorageKey(OFFLINE_PROGRESS_KEY);
        if (key) { try { localStorage.removeItem(key); } catch (error) { console.warn('[Halloween Haunt] Synced progress, but could not clear the local queue:', error); } }
        saveLastKnownOnlineState();
        updateOfflineCard('hidden');
        updateUI();
        renderCurrentModal();
        showToast('Offline progress synced to your online account.');
        return true;
    } catch (error) {
        console.warn('[Halloween Haunt] Offline progress sync is pending:', error);
        updateOfflineCard('failed');
        showToast(error?.message || 'Offline progress is still saved locally and will retry when the server is available.');
        return false;
    } finally { offlineSyncInFlight = false; }
}

window.addEventListener('online', async () => {
    updateOfflineCard('syncing');
    const synced = await syncOfflineGameProgress();
    if (synced) { offlineMode = false; await initGame(); }
    else {
        updateOfflineCard('failed');
        // Keep the local snapshot untouched; the background retry loop will
        // keep attempting synchronization until the API confirms it.
    }
});
window.addEventListener('pagehide',()=>{if(offlineMode&&gameState)saveOfflineProgress();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&offlineMode&&gameState)saveOfflineProgress();});
window.addEventListener('offline',()=>{if(gameState&&!offlineMode){saveLastKnownOnlineState();enterOfflineMode();}updateOfflineCard('offline');});
setInterval(() => {
    if (!navigator.onLine || offlineSyncInFlight || !getSessionHash()) return;
    const saved = readOfflineProgress();
    if (offlineMode || saved.hasLocalChanges || saved.pendingSyncRequestId || saved.pendingFullSyncRequestId) {
        syncOfflineGameProgress().then(synced => {
            if (synced && offlineMode) { offlineMode = false; initGame(); }
        });
    }
}, 3000);


const HHN=['Jack','Misty','Boo','Candy','Pumpkin','Raven','Cocoa','Hex','Maple','Ember','Cobweb','Midnight','Toffee','Salem','Patches','Wick','Hocus','Mallow','Fable','Trick'],HHR={Common:'#ddd',Uncommon:'#45d483',Rare:'#4c9dff',Epic:'#b66aff',Legendary:'#ffc94a',Mythic:'#ff5ca8'},HHP=[['basketFull','Basket full'],['candySold','Candy sold'],['crewAsleep','Crew asleep'],['newRarity','New rarity unlocked'],['upgradeBought','Upgrade purchased'],['crewHired','Crew hired'],['crewFed','Crew feeding'],['autoSell','Auto Sell']];
function hPrefs(){try{return JSON.parse(localStorage.getItem('hh_notification_prefs')||'{}')}catch{return {}}}function hNotify(k,t,m){if(hPrefs()[k]===false)return;showToast(t+' — '+m)}
function hHelp(t,m){let x=document.createElement('div');x.className='hh-help-overlay';let card=document.createElement('section');card.className='hh-help-card';card.innerHTML='<span class="hh-badge">HELP</span><h2>'+escapeHTML(t)+'</h2><p>'+escapeHTML(m)+'</p><button class="buy-btn">Got it</button>';card.querySelector('button').onclick=()=>x.remove();x.appendChild(card);x.onclick=e=>{if(e.target===x)x.remove()};document.body.appendChild(x)}function hQ(t,m){return `<button class="hh-help-btn" data-hh-help="${escapeHTML(t)}" data-hh-info="${escapeHTML(m)}">?</button>`}function hCard(t,b,tag='INFO'){return `<section class="hh-card-ui"><div class="hh-card-heading"><h3>${t}</h3><span class="hh-badge">${tag}</span></div>${b}</section>`}document.addEventListener('click',e=>{const b=e.target.closest('[data-hh-help]');if(b)hHelp(b.dataset.hhHelp,b.dataset.hhInfo)});
function hSettings(c){let p=hPrefs();c.innerHTML=hCard('Notifications','<p class="hh-muted">Control each notification separately.</p>'+HHP.map(([id,n])=>'<label class="hh-setting-row"><span><strong>'+n+'</strong><small>Show or hide '+n.toLowerCase()+' alerts.</small></span><input type="checkbox" data-hhp="'+id+'" '+(p[id]===false?'':'checked')+'></label>').join(''),'PREFERENCES')+hCard('Tutorial','<p class="hh-muted">Replay the short guide any time.</p><button class="buy-btn" onclick="localStorage.removeItem(\'halloween_haunt_guide_seen_v1\');closeModal();helpSection=0;renderWelcomeGuide()">Redo tutorial</button>','LEARN');c.querySelectorAll('[data-hhp]').forEach(x=>x.onchange=()=>{let q=hPrefs();q[x.dataset.hhp]=x.checked;localStorage.setItem('hh_notification_prefs',JSON.stringify(q))})}
function hInit(){let n=document.querySelector('.action-nav');if(n&&!n.querySelector('[data-hhsettings]')){let b=document.createElement('button');b.className='action-btn';b.dataset.hhsettings='1';b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.3l-.1.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.3-1.8l-.1-.1v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.3l.1-.1h3.4l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .3 1.8l.1.1z"></path></svg><span>Settings</span>';b.onclick=()=>openModal('settings');n.appendChild(b)}if(!document.getElementById('hh-ghost-layer')){let g=document.createElement('div');g.id='hh-ghost-layer';g.innerHTML=Array.from({length:7},(_,i)=>'<span style="--i:'+i+'">👻</span>').join('');g.setAttribute('aria-hidden','true');document.body.appendChild(g)}}window.addEventListener('DOMContentLoaded',hInit);setTimeout(hInit,0);
const hOpen=window.openModal;window.openModal=function(t){if(t==='settings'){currentModal='settings';document.getElementById('hauntModalOverlay').classList.add('show');document.getElementById('modalTitle').innerText='Settings';hSettings(document.getElementById('modalBody'));return}return hOpen(t)};
renderShops = function(c){let s=gameState,items=CANDY_CATALOG.map(x=>({c:x,n:Number(s.inventory?.[x.id]||0),p:Math.max(0,...(s.shops||[]).map(y=>Number(y.prices?.[x.id]||0)))})).filter(x=>x.n),qty=items.reduce((n,x)=>n+x.n,0),val=items.reduce((n,x)=>n+x.n*x.p,0);c.innerHTML='<section class="hh-card-ui"><div class="hh-card-heading"><h3>Sell All Candy</h3>'+hQ('How selling works','One button sells every candy in your basket at once. Each candy goes to the seller paying the best price. Crew members automatically sell their own full baskets.')+'</div><p class="hh-muted">Every candy is matched to its best-paying seller.</p><div class="hh-summary-grid"><div class="hh-stat-card"><small>Candy in basket</small><strong>'+qty+'</strong></div><div class="hh-stat-card"><small>Estimated payout</small><strong>'+formatCash(val)+'</strong></div></div><button class="buy-btn" style="width:100%" '+(!qty?'disabled':'')+' onclick="executeSellAll()">Sell All Candy · '+formatCash(val)+'</button></section><div class="hh-item-grid">'+(items.length?items.map(x=>'<div class="hh-candy-row"><span><strong>'+escapeHTML(x.c.name)+'</strong><small>'+escapeHTML(x.c.rarity)+' · '+x.n+' held</small></span><strong>'+formatCash(x.n*x.p)+'</strong></div>').join(''):'<div class="hh-card-ui">Your basket is empty. Collect candy to see it here.</div>')+'</div>'};
renderUpgrades = function(c){let arr=[['capacity','Basket Capacity','Carry more candy.'],['power','Click Power','Collect more candy per click.'],['luck','Candy Luck','Improve the chance of rare candy.']];c.innerHTML='<div class="hh-upgrade-grid">'+arr.map(([id,n,d])=>{let u=gameState.upgrades[id];return '<article class="hh-card-ui"><div class="hh-card-heading"><h3>'+n+'</h3>'+hQ(n,d)+'</div><p class="hh-muted">'+d+'</p><div class="hh-level-line">Level '+u.level+' <strong>'+(u.nextCost<0?'MAXED':formatCash(u.nextCost))+'</strong></div><button class="buy-btn" '+(u.nextCost<0||gameState.cash<u.nextCost?'disabled':'')+' onclick="executeUpgrade(\''+id+'\')">Upgrade</button></article>'}).join('')+'<article class="hh-card-ui"><div class="hh-card-heading"><h3>Auto Sell</h3>'+hQ('Auto Sell','One-time $5,000 unlock. When your basket fills, wait one second and sell all candy at the best price.')+'</div><p class="hh-muted">Automatically sells a full basket after one second.</p><strong>'+(gameState.upgrades.autoSell.level?'UNLOCKED':'$5,000 · One-time unlock')+'</strong><button class="buy-btn" style="width:100%;margin-top:12px" '+(gameState.upgrades.autoSell.level||gameState.cash<5000?'disabled':'')+' onclick="executeUpgrade(\'autoSell\')">'+(gameState.upgrades.autoSell.level?'Unlocked':'Unlock Auto Sell')+'</button></article></div>'};
renderCrew = function(c){let a=gameState.crew||[],out=hCard('What are Crews?','<p>Crew members collect candy while the game is open. They sell a full basket to the best-paying seller. After five minutes they fall asleep and must be woken manually. Upgrade each member independently or feed them for 20-minute boosts.</p>'+hQ('Crew basics','Crew pauses when the game is closed. Sleeping workers need a manual wake-up. Feeding costs 10× your basket capacity in candy, gives percentage boosts, and prevents sleep for 20 minutes.'),'AUTOMATIC WORK');out+='<div class="hh-summary-grid"><div class="hh-stat-card"><small>Crew members</small><strong>'+a.length+' / 20</strong></div><div class="hh-stat-card"><small>Candy collected</small><strong>'+Number(gameState.stats?.crewCollected||0).toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Candy sold</small><strong>'+Number(gameState.stats?.crewSold||0).toLocaleString()+'</strong></div></div>';if(!a.length)out+=hCard('Hire your first member','<button class="buy-btn" onclick="executeCrew(\'hire\')" '+(gameState.cash<gameState.crewHireCost?'disabled':'')+'>Hire '+HHN[0]+' · '+formatCash(gameState.crewHireCost)+'</button>','RECRUIT');out+='<div class="hh-crew-grid">'+a.map((w,i)=>{let asleep=!!w.asleep,fed=Number(w.fedUntil||0)>Date.now(),cnt=Number(w.inventoryCount||0),cap=Number(w.capacity||10),ups=[['capacity','Basket Capacity',w.capacityLevel||0,65,1.65],['power','Click Power',w.powerLevel||0,80,1.65],['luck','Candy Luck',w.luckLevel||0,95,1.65],['speed','Auto Sell Faster',w.speedLevel||0,75,1.7],['awake','Longer Awake Time',w.awakeLevel||0,100,1.8]];return '<article class="hh-crew-card '+(asleep?'is-asleep':'')+'"><div class="hh-crew-top"><div><span class="hh-badge">'+(asleep?'ASLEEP':fed?'FED BOOST':'WORKING')+'</span><h3>'+escapeHTML(w.name||HHN[i]||('Worker '+(i+1)))+'</h3><p class="hh-muted">'+(asleep?'Needs a manual wake-up':fed?'Boosted for '+Math.max(0,Math.ceil((w.fedUntil-Date.now())/60000))+' min':'Collecting candy automatically')+'</p></div>'+hQ('Worker status','The basket bar shows carried candy. Full baskets sell automatically. Sleeping workers need you to wake them.')+'</div><div class="hh-progress-label"><span>Basket</span><strong>'+cnt+' / '+cap+'</strong></div><div class="hh-progress"><i style="width:'+Math.min(100,cnt/Math.max(1,cap)*100)+'%"></i></div><div style="display:flex;gap:8px;margin:12px 0">'+(asleep?'<button class="buy-btn" onclick="executeCrew(\'wake\','+i+')">Wake up</button>':'<button class="buy-btn" '+(fed?'disabled':'')+' onclick="executeCrew(\'feed\','+i+')">Feed · '+(10*Number(gameState.basketCapacity||50))+' candy</button>')+'</div><div class="hh-upgrade-grid">'+ups.map(([k,n,l,b,m])=>'<div class="hh-upgrade-mini"><span>'+n+'<small>Level '+l+'</small></span><button class="buy-btn" '+(gameState.cash<Math.floor(b*Math.pow(m,l))?'disabled':'')+' onclick="executeCrew(\'upgrade_'+k+'\','+i+')">'+formatCash(Math.floor(b*Math.pow(m,l)))+'</button></div>').join('')+'</div></article>'}).join('')+'</div>';if(a.length<20)out+=hCard('Recruit another member','<p>Each recruit costs more. All members start with the same base stats.</p><button class="buy-btn" onclick="executeCrew(\'hire\')" '+(gameState.cash<gameState.crewHireCost?'disabled':'')+'>Hire '+escapeHTML(HHN[a.length]||'Worker')+' · '+formatCash(gameState.crewHireCost)+'</button>','NEXT RECRUIT');c.innerHTML=out};
const hSell=window.executeSellAll;window.executeSellAll=async function(){let cash=Number(gameState.cash||0);await hSell();if(Number(gameState.cash||0)>cash)hNotify('candySold','Candy sold','Your candy was sold.')};
const hUpgrade=window.executeUpgrade;window.executeUpgrade=async function(t){if(t==='autoSell'){if(gameState.upgrades.autoSell.level||gameState.cash<5000){showToast('Auto Sell costs $5,000 and can only be unlocked once.');return}return performOptimisticAction('?action=upgrade',{type:t},s=>{if(s.cash<5000)return;s.cash-=5000;s.stats.cashSpent+=5000;s.stats.upgradesBought++;s.upgrades.autoSell.level=1;s.upgrades.autoSell.nextCost=-1},()=> 'Auto Sell unlocked!')}return hUpgrade(t)};
window.executeCrew=async function(action,index=0){let map={upgrade_capacity:['capacityLevel',65,1.65],upgrade_power:['powerLevel',80,1.65],upgrade_luck:['luckLevel',95,1.65],upgrade_speed:['speedLevel',75,1.7],upgrade_awake:['awakeLevel',100,1.8],upgrade_cap:['capacityLevel',65,1.65]};await performOptimisticAction('?action=crew-action',{action,index},s=>{s.stats||=createDefaultStats();if(action==='hire'){if(s.crew.length>=20||s.cash<s.crewHireCost)return;let cost=s.crewHireCost,i=s.crew.length;s.cash-=cost;s.stats.cashSpent+=cost;s.crewUnlocked=true;s.crew.push({id:'helper-'+(i+1),name:HHN[i]||('Worker '+(i+1)),capacity:10,capacityLevel:0,powerLevel:0,luckLevel:0,speedLevel:0,awakeLevel:0,intervalMs:20000,inventory:{},inventoryCount:0,asleep:false,awakeMs:0,fedUntil:0});s.crewHireCost=Math.floor(cost*1.85);return}let w=s.crew[index];if(!w)return;if(action==='wake'){w.asleep=false;w.awakeMs=0;return}if(action==='feed'){let need=10*Number(s.basketCapacity||50),reserve=Math.max(0,Number(s.feedCandy||0));if(Number(w.fedUntil||0)>Date.now()||reserve<need){showToast('You need '+need+' candy in your Candy Reserve to feed this crew member.');return}s.feedCandy=reserve-need;w.fedUntil=Date.now()+1200000;w.asleep=false;w.awakeMs=0;return}let cfg=map[action];if(!cfg)return;let [key,base,mult]=cfg,cost=Math.floor(base*Math.pow(mult,Number(w[key]||0)));if(s.cash<cost)return;s.cash-=cost;s.stats.cashSpent+=cost;s.stats.upgradesBought++;w[key]=Number(w[key]||0)+1;if(key==='capacityLevel')w.capacity=10+w[key]*10;if(key==='speedLevel')w.intervalMs=Math.max(2000,20000*Math.pow(.85,w.speedLevel))},r=>r.fed?'Fed for 20 minutes.':r.woke?'Crew member awake.':r.hired?'Crew member hired!':'Crew updated!');if(action==='hire')hNotify('crewHired','Crew member hired','Your worker is ready.');if(action==='feed')hNotify('crewFed','Crew member fed','Boosts are active for 20 minutes.');if(action==='wake')hNotify('crewAsleep','Crew member awake','Your worker is back to work.')};
const hSpawn=spawnFallingCandy;spawnFallingCandy=function(id,x,y){const r=hSpawn(id,x,y),els=document.querySelectorAll('.falling-candy'),el=els[els.length-1],c=getCandyObj(id);if(el&&c){const col=HHR[c.rarity]||'#fff';el.style.width='112px';el.style.height='112px';el.style.border='0';el.style.outline='0';el.style.borderRadius='0';el.style.background='transparent';el.style.boxShadow='none';el.style.filter='drop-shadow(0 0 4px '+col+') drop-shadow(0 0 12px '+col+')'}return r};
const hIndex=renderIndex;renderIndex=function(c){hIndex(c);const paint=()=>c.querySelectorAll('.candy-card').forEach(card=>{let img=card.querySelector('img'),x=CANDY_CATALOG.find(v=>img?.getAttribute('src')?.includes(v.file));if(x){card.style.border='2px solid '+(HHR[x.rarity]||'#fff');card.style.boxShadow='0 0 12px '+(HHR[x.rarity]||'#fff')+'33'}});paint();c.querySelectorAll('select').forEach(x=>x.addEventListener('change',()=>setTimeout(paint,0)))};
const hUI=updateUI;window.hhAsleepSeen=window.hhAsleepSeen||new Set();updateUI=function(){hUI();if(!gameState)return;let b=[...document.querySelectorAll('.action-btn')].find(x=>x.textContent.includes('Crew')),asleep=(gameState.crew||[]).some(x=>x.asleep);if(b){b.classList.toggle('hh-crew-alert',asleep);if(asleep&&!b.querySelector('.hh-alert-dot'))b.insertAdjacentHTML('beforeend','<i class="hh-alert-dot"></i>');if(!asleep)b.querySelector('.hh-alert-dot')?.remove()}for(let w of gameState.crew||[])if(w.asleep&&!hhAsleepSeen.has(w.id)){hhAsleepSeen.add(w.id);hNotify('crewAsleep','Crew member asleep',(w.name||'A crew member')+' needs to be woken.')}else if(!w.asleep)hhAsleepSeen.delete(w.id);let cap=Number(gameState.basketCapacity||0),cnt=Number(gameState.currentBasketCount||0);if(cap&&cnt>=cap&&!window.hhFull){window.hhFull=true;hNotify('basketFull','Basket full','Your basket is full.')}if(cnt<cap)window.hhFull=false;if(cap&&cnt>=cap&&gameState.upgrades?.autoSell?.level&&!window.hhAuto){window.hhAuto=true;setTimeout(async()=>{try{if(!offlineMode&&gameState.upgrades.autoSell.level&&Number(gameState.currentBasketCount)>=Number(gameState.basketCapacity)){hNotify('autoSell','Auto Sell','Selling your full basket at the best price.');await executeSellAll()}}finally{window.hhAuto=false}},1000)}};

const hRarityUpdate=updateUI;window.hhKnownRarities=window.hhKnownRarities||null;updateUI=function(){hRarityUpdate();if(!gameState)return;const found=new Set();for(const id of gameState.discovered||[]){const candy=getCandyObj(id);if(candy)found.add(candy.rarity)}if(window.hhKnownRarities===null){window.hhKnownRarities=found;return}for(const rarity of found){if(!window.hhKnownRarities.has(rarity)){window.hhKnownRarities.add(rarity);hNotify('newRarity','New rarity unlocked',rarity+' candy has been discovered!')}}};
