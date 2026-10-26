/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

// Core Constants
const DEADLINE_Z = '2026-10-30T19:10:00Z'; // Oct 30 2026, 3:10 PM EDT
const API_BASE = '/api/halloween-haunt';
const IMG_BASE = '/img/halloween-haunt-contest/candy/';

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
let currentModal = null;
let offerRefreshTime = 0;
let isContestActive = false;

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

// ------------------------------------------------------------------
// API Communication
// ------------------------------------------------------------------
async function apiCall(endpoint, method = 'GET', payload = null) {
    const sessionId = localStorage.getItem('session_id') || '';
    if (!sessionId) {
        showToast("Error: Not logged in. Redirecting...");
        setTimeout(() => window.location.href='/accounts', 1500);
        return null;
    }

    const headers = {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
        'X-Device-ID': sessionId
    };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers,
            body: payload ? JSON.stringify(payload) : null
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || "An error occurred.");
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
async function initGame() {
    const data = await apiCall('/state');
    if (!data) return;
    
    gameState = data.state;
    updateUI();
    
    // Heartbeat timers
    setInterval(updateTimer, 1000);
    // Crew sync every 20 seconds of ACTIVE page time (prevents offline cheating)
    setInterval(syncCrew, 20000); 
}

function updateTimer() {
    const now = new Date().getTime();
    const end = new Date(DEADLINE_Z).getTime();
    const diff = end - now;

    if (diff <= 0) {
        document.getElementById('ui-timer').innerText = "ENDED";
        isContestActive = false;
        return;
    }
    
    isContestActive = true;
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    
    document.getElementById('ui-timer').innerText = 
        `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

async function syncCrew() {
    if (!gameState || !isContestActive || !gameState.crewUnlocked) return;
    // Pings server to claim active-play crew rewards.
    const res = await apiCall('/crew-sync', 'POST');
    if (res) {
        gameState = res.state;
        updateUI();
        if (currentModal === 'crew') renderCrew();
    }
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
let collectCooldown = false;
async function handleBasketClick(e) {
    if (!isContestActive) { showToast("Contest is not active."); return; }
    if (collectCooldown) return;
    if (gameState.currentBasketCount >= gameState.basketCapacity) {
        showToast("Basket is full! Sell candy to make room.");
        return;
    }

    collectCooldown = true;
    
    // Server validation is authoritative
    const res = await apiCall('/collect', 'POST');
    if (res) {
        gameState = res.state;
        updateUI();
        
        // Optimistic visual feedback based on authoritative result
        if (res.drops && res.drops.length > 0) {
            res.drops.forEach((dropId, i) => {
                setTimeout(() => spawnFallingCandy(dropId, e.clientX, e.clientY), i * 100);
            });
        }
    }
    setTimeout(() => { collectCooldown = false; }, 150);
}

function spawnFallingCandy(candyId, originX, originY) {
    const candy = getCandyObj(candyId);
    if(!candy) return;
    const el = document.createElement('img');
    el.src = IMG_BASE + candy.file;
    el.className = 'falling-candy';
    
    // Fall around the center of the basket
    const basketRect = document.getElementById('basketHitbox').getBoundingClientRect();
    const startX = basketRect.left + (basketRect.width / 2) + ((Math.random() - 0.5) * 80) - 20;
    const startY = basketRect.top - 20;
    
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.onerror = function() { this.src = '/img/icon.png'; }; // fallback
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

// ------------------------------------------------------------------
// UI Rendering
// ------------------------------------------------------------------
function updateUI() {
    document.getElementById('ui-cash').innerText = formatCash(gameState.cash);
    
    const count = gameState.currentBasketCount;
    const cap = gameState.basketCapacity;
    document.getElementById('ui-capacity-text').innerText = `${count} / ${cap}`;
    document.getElementById('ui-capacity-bar').style.width = `${Math.min(100, (count/cap)*100)}%`;
}

function openModal(type) {
    currentModal = type;
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
    document.getElementById('hauntModalOverlay').classList.remove('show');
}

// ---- Modals Implementation ----

function renderIndex(container) {
    let html = `<div class="candy-grid">`;
    CANDY_CATALOG.forEach(c => {
        const discovered = gameState.discovered.includes(c.id);
        const qty = gameState.inventory[c.id] || 0;
        html += `
            <div class="candy-card ${discovered ? '' : 'locked'}" onclick="showToast('${discovered ? c.name : 'Unknown Candy'} - ${c.rarity}')">
                <img src="${IMG_BASE}${c.file}" onerror="this.src='/img/icon.png'">
                <div>${discovered ? c.name : '???'}</div>
                <div class="qty">x${qty}</div>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

async function renderShops(container) {
    const data = await apiCall('/shops');
    if (!data) { container.innerHTML = 'Error loading shops.'; return; }
    
    let html = `<div style="margin-bottom:15px; color:var(--fg2);">Offers refresh in <span id="shop-timer" style="color:var(--orange);">...</span></div>`;
    
    // Quick Sell All to Best Shop
    html += `
        <div style="background:rgba(255,122,24,0.1); padding:16px; border-radius:12px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div>
                <h3 style="color:var(--orange);">Quick Sell All</h3>
                <div style="font-size:16px; color:var(--fg2);">Automatically sells inventory to highest bidding shops.</div>
            </div>
            <button class="buy-btn" onclick="executeSellAll()">Sell All Candy</button>
        </div>
    `;

    container.innerHTML = html;
}

window.executeSellAll = async function() {
    const res = await apiCall('/sell', 'POST', { action: 'sell_all' });
    if(res) {
        gameState = res.state;
        updateUI();
        showToast(`Sold all for ${formatCash(res.earned)}!`);
        if(currentModal === 'shops') closeModal();
    }
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
                    <h3 style="color:#fff;">${u.name} (Lvl ${u.data.level})</h3>
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

window.executeUpgrade = async function(type) {
    const res = await apiCall('/upgrade', 'POST', { type });
    if(res) {
        gameState = res.state;
        updateUI();
        showToast("Upgrade purchased!");
        if(currentModal === 'upgrades') renderUpgrades(document.getElementById('modalBody'));
    }
}

function renderCrew(container) {
    if(!container) container = document.getElementById('modalBody');
    if(!gameState.crewUnlocked) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px;">
                <h3 style="color:var(--purple); margin-bottom:10px;">Hire Trick-or-Treat Crew</h3>
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
                <div style="width:100%; display:flex; justify-content:space-between; margin-bottom:10px;">
                    <h3 style="color:var(--orange);">Helper #${idx+1}</h3>
                    <span style="color:var(--fg2);">Holding: ${c.inventoryCount}/${c.capacity}</span>
                </div>
                <div style="width:100%; display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="buy-btn" style="flex:1; font-size:16px;" ${gameState.cash < c.speedUpgradeCost ? 'disabled' : ''} onclick="executeCrew('upgrade_speed', ${idx})">
                        Speed Up (${formatCash(c.speedUpgradeCost)})
                    </button>
                    <button class="buy-btn" style="flex:1; font-size:16px;" ${gameState.cash < c.capUpgradeCost ? 'disabled' : ''} onclick="executeCrew('upgrade_cap', ${idx})">
                        Capacity Up (${formatCash(c.capUpgradeCost)})
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

window.executeCrew = async function(action, index=0) {
    const res = await apiCall('/crew-action', 'POST', { action, index });
    if(res) {
        gameState = res.state;
        updateUI();
        if(currentModal === 'crew') renderCrew(document.getElementById('modalBody'));
    }
}

function renderStats(container) {
    const s = gameState.stats;
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px; color:var(--fg2); font-size:18px;">
            <div style="display:flex; justify-content:space-between;"><span>Highest Cash Balance:</span> <span style="color:#fff;">${formatCash(s.highScore)}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Lifetime Cash Earned:</span> <span style="color:#fff;">${formatCash(s.lifetimeCash)}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Total Spent on Upgrades:</span> <span style="color:#fff;">${formatCash(s.cashSpent)}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Total Basket Clicks:</span> <span style="color:#fff;">${s.totalClicks.toLocaleString()}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Candy Index Progress:</span> <span style="color:#fff;">${gameState.discovered.length} / 29</span></div>
        </div>
    `;
}

async function renderLeaderboard(container) {
    const res = await apiCall('/leaderboard');
    if(!res) { container.innerHTML = 'Failed to load rankings.'; return; }
    
    let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    html += `<div style="font-size:14px; color:var(--orange); margin-bottom:10px;">Ranked entirely by CURRENT CASH. Spend wisely!</div>`;
    
    res.rankings.forEach((r, i) => {
        const isMe = r.accountId === gameState.accountId;
        html += `
            <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,${isMe? '0.1' : '0.03'}); border-radius:8px; border:1px solid ${isMe? 'var(--orange)' : 'transparent'};">
                <div><span style="color:var(--fg2); margin-right:10px;">#${i+1}</span> <span style="color:#fff; font-weight:bold;">${r.displayName}</span></div>
                <div style="color:#F5C451; font-weight:bold;">${formatCash(r.cash)}</div>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

// Bootstrap
window.addEventListener('DOMContentLoaded', initGame);
