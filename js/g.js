/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Offline handlers
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');

// === Authentication & Cloud Saves ===
if (!localStorage.getItem('session_id')) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let sid = '';
    for (let i = 0; i < 10; i++) sid += chars.charAt(Math.floor(Math.random() * chars.length));
    localStorage.setItem('session_id', sid);
}
const currentSessionId = localStorage.getItem('session_id');

const SESSION_KEY = 'bsms_auth_session';
let authSession = null;
let isGuest = true;
let cloudSyncDone = false; 

function syncAuthSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    
    if (raw) {
        authSession = JSON.parse(raw);
        isGuest = !authSession.loggedIn;
    } else {
        authSession = null;
        isGuest = true;
    }
    
    renderUserIcon();
    
    if (!isGuest && !cloudSyncDone) {
        pullCloudSaves();
    }
}

window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY) syncAuthSession();
});

function renderUserIcon() {
    const btn = document.getElementById('globalUserBtn');
    if (isGuest) {
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        btn.style.border = "2px solid var(--border)";
    } else {
        if (authSession.pfp) {
            btn.innerHTML = `<img src="${authSession.pfp}" alt="Avatar">`;
            btn.style.border = "none";
        } else {
            btn.innerHTML = (authSession.displayName || authSession.username || "?").charAt(0).toUpperCase();
            btn.style.border = "2px solid var(--border)";
        }
    }
}

function handleUserIconClick() {
    if (isGuest) {
        window.location.href = '/accounts#signup';
    } else {
        document.getElementById('accPopupName').textContent = authSession.displayName || authSession.username;
        document.getElementById('accPopupUser').textContent = authSession.username;
        const ava = document.getElementById('accPopupAvatar');
        if(authSession.pfp) ava.innerHTML = `<img src="${authSession.pfp}" style="width:100%;height:100%;object-fit:cover;">`;
        else ava.innerHTML = (authSession.displayName || authSession.username).charAt(0).toUpperCase();
        openPopup('accountPopup');
    }
}

let cloudSaveTimeout = null;

function scheduleCloudSave(delay = 1000) {
    if (isGuest || !authSession) return;
    clearTimeout(cloudSaveTimeout);
    cloudSaveTimeout = setTimeout(() => {
        pushCloudSaves();
    }, delay);
}

function getActiveSessionId() {
    return localStorage.getItem('session_id') || (authSession && (authSession.sessionId || authSession.session_id)) || currentSessionId || "";
}
function getActiveUid() {
    return (authSession && authSession.uid) || "";
}

async function pullCloudSaves() {
    if (isGuest || !authSession) return;
    try {
        const sid = getActiveSessionId();
        const uid = getActiveUid();
        const qParams = new URLSearchParams();
        if (sid) qParams.set('sessionId', sid);
        if (uid) qParams.set('uid', uid);

        const res = await fetch(`/api/games/saves?${qParams.toString()}`, {
            headers: { 
                'X-Session-ID': sid,
                'X-UID': uid
            }
        });
        if(res.status === 403) {
            const data = await res.json();
            if(data.account_status === "banned") { window.location.href = "/device-banned.html"; return; }
        }
        
        if (res.ok) {
            const data = await res.json();
            if (data && data.saves && typeof data.saves === 'object') {
                for (const [key, value] of Object.entries(data.saves)) {
                    if (key && key !== SESSION_KEY && key !== 'session_id') {
                        try {
                            localStorage.setItem(key, value);
                        } catch(e) {}
                    }
                }
            }
            console.log("[BSMS Web :: Games] Cloud saves successfully loaded from the database.");
        }
        cloudSyncDone = true;
    } catch (err) {
        console.error("[BSMS Web :: Games] Failed to pull cloud saves", err);
        cloudSyncDone = true; 
    }
}

async function pushCloudSaves(keepAlive = false) {
    if (isGuest || !authSession) return;
    try {
        const sid = getActiveSessionId();
        const uid = getActiveUid();
        const dump = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== SESSION_KEY && key !== 'session_id') {
                dump[key] = localStorage.getItem(key);
            }
        }
        
        const qParams = new URLSearchParams();
        if (sid) qParams.set('sessionId', sid);
        if (uid) qParams.set('uid', uid);

        await fetch(`/api/games/saves?${qParams.toString()}`, {
            method: 'PUT',
            keepalive: !!keepAlive,
            headers: { 
                'Content-Type': 'application/json',
                'X-Session-ID': sid,
                'X-UID': uid
            },
            body: JSON.stringify({ saves: dump })
        });
        console.log("[BSMS Web :: Games] Progress successfully stored in the database.");
    } catch (err) {
        console.error("[BSMS Web :: Games] Failed to push cloud saves", err);
    }
}

// Hook into parent window localStorage changes
try {
    const _nativeSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v) {
        _nativeSetItem(k, v);
        if (cloudSyncDone && !isGuest && k !== SESSION_KEY && k !== 'session_id') {
            scheduleCloudSave(1000);
        }
    };
} catch(e) {}

function openPopup(id) { document.getElementById(id).classList.add('show'); }
function closePopup(id) { document.getElementById(id).classList.remove('show'); }

syncAuthSession();


// === Game Launcher Logic ===
const GITHUB_API_URL = "https://api.github.com/repos/JellyfishJelly13/HTML5-Games/contents/offline";
const FIVE5_GMS_CATALOG_URL = "/data/55gms-games.json";
let allGamesList = [];
let currentGameBlobUrl = null;
let currentFetchController = null;
let isGameRunning = false;
let currentLetterFilter = 'All';

const gamesGrid = document.getElementById('gamesGrid');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingSpinner = document.getElementById('loadingSpinner');
const playBtn = document.getElementById('playBtn');
const cancelLoadBtn = document.getElementById('cancelLoadBtn');
const gameContainer = document.getElementById('gameContainer');
const gameIframe = document.getElementById('gameIframe');
const toast = document.getElementById('toast');
const searchInput = document.getElementById('gameSearch');
const azFiltersContainer = document.getElementById('azFilters');

function initFilters() {
    const letters = ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = `az-btn ${letter === 'All' ? 'active' : ''}`;
        btn.textContent = letter;
        btn.onclick = () => {
            currentLetterFilter = letter;
            document.querySelectorAll('.az-btn').forEach(b => b.classList.toggle('active', b.textContent === letter));
            filterAndRenderGames();
        };
        azFiltersContainer.appendChild(btn);
    });

    searchInput.addEventListener('input', filterAndRenderGames);
}
initFilters();

async function fetchGames() {
    const results = await Promise.allSettled([
        fetch(GITHUB_API_URL).then(response => {
            if (!response.ok) throw new Error("Failed to fetch the existing BSMS games list.");
            return response.json();
        }),
        fetch(FIVE5_GMS_CATALOG_URL).then(response => {
            if (!response.ok) throw new Error("Failed to fetch the 55GMS catalog.");
            return response.json();
        })
    ]);

    const legacyResult = results[0];
    const five5Result = results[1];
    const legacyGames = legacyResult.status === "fulfilled"
        ? legacyResult.value.filter(item => item.type === "file" && item.name.endsWith(".html"))
            .map(item => ({ ...item, source: "bsms" }))
        : [];
    const five5Games = five5Result.status === "fulfilled" && Array.isArray(five5Result.value)
        ? five5Result.value
        : [];

    allGamesList = [...legacyGames, ...five5Games];
    filterAndRenderGames();
    handleHashChange();

    if (!allGamesList.length) {
        gamesGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--red);">The game library could not be loaded. Please try again later.</div>`;
    } else if (legacyResult.status === "rejected" || five5Result.status === "rejected") {
        console.warn("[BSMS Web :: Games] One game catalog could not be loaded.", results);
    }
}

function filterAndRenderGames() {
    const query = searchInput.value.toLowerCase().trim();
    
    const filtered = allGamesList.filter(game => {
        const name = game.name.replace('.html', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
        
        const matchesLetter = currentLetterFilter === 'All' ? true : name.startsWith(currentLetterFilter.toLowerCase());
        const matchesSearch = name.includes(query);
        
        return matchesLetter && matchesSearch;
    });

    renderGamesGrid(filtered);
}

function renderGamesGrid(listToRender) {
    gamesGrid.innerHTML = ''; 
    
    if (listToRender.length === 0) {
        gamesGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--fg2); padding: 40px; font-size: 22px;">No games found matching your criteria.</div>`;
        return;
    }

    listToRender.forEach((game, index) => {
        const displayName = game.name.replace('.html', '').replace(/([A-Z])/g, ' $1').trim();

        const card = document.createElement('div');
        card.className = 'app-card';
        card.style.animationDelay = `${(index % 20) * 0.03}s`; 
        
        const thumbnail = document.createElement("img");
        thumbnail.className = "game-thumb";
        thumbnail.alt = "";
        thumbnail.loading = "lazy";
        thumbnail.decoding = "async";
        if (game.image) {
            thumbnail.src = game.image;
            thumbnail.addEventListener("error", () => {
                thumbnail.classList.add("image-failed");
            }, { once: true });
        } else {
            thumbnail.classList.add("image-failed");
        }

        const title = document.createElement("h3");
        title.className = "app-title";
        title.textContent = displayName;

        const sourceLabel = document.createElement("span");
        sourceLabel.className = "game-source";
        sourceLabel.textContent = game.source === "55gms" ? "55GMS" : "BSMS Web";

        let playButton;
        if (game.source === "55gms") {
            playButton = document.createElement("a");
            const assetMatch = (game.image || "").match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/assets@([^/]+)\/(misc\/[^/]+\/)/);
            const assetBase = assetMatch
                ? `https://raw.githubusercontent.com/55gms/assets/${assetMatch[1]}/${assetMatch[2]}`
                : "";
            playButton.href = `/game-player.html?id=${encodeURIComponent(game.id || game.name)}&src=${encodeURIComponent(game.launchUrl)}&assetBase=${encodeURIComponent(assetBase)}&title=${encodeURIComponent(displayName)}`;
            playButton.target = "_blank";
            playButton.rel = "opener";
        } else {
            playButton = document.createElement("button");
            playButton.type = "button";
            playButton.addEventListener("click", () => {
                history.pushState(null, null, `#${game.name}`);
                triggerLoadGame(game);
            });
        }
        playButton.className = "btn";
        playButton.textContent = "Play";

        card.append(thumbnail, title, sourceLabel, playButton);

        gamesGrid.appendChild(card);
    });
}

async function triggerLoadGame(game) {
    playBtn.style.display = 'none';
    cancelLoadBtn.style.display = 'inline-block';
    loadingSpinner.style.display = 'block';
    loadingText.textContent = `Loading ${game.name}...`;
    openPopup('loadingOverlay');
    
    currentFetchController = new AbortController();

    try {
        const delayPromise = new Promise(resolve => setTimeout(resolve, 2000));
        const fetchPromise = fetch(game.download_url, { signal: currentFetchController.signal });

        const [res] = await Promise.all([fetchPromise, delayPromise]);
        
        if (!res.ok) throw new Error("Network response was not ok");
        const htmlContent = await res.text();
        
        const scriptToInject = `
            <script>
                (function() {
                    // Ensure instant focus
                    window.addEventListener('mousedown', function() {
                        window.focus();
                    });
                    document.addEventListener('click', function() {
                        window.focus();
                    });

                    // Live localStorage proxy to notify parent and persist to the database
                    try {
                        const _origSet = window.localStorage.setItem.bind(window.localStorage);
                        window.localStorage.setItem = function(k, v) {
                            try { _origSet(k, v); } catch(e) {}
                            try {
                                window.parent.postMessage({ type: 'bsms-storage-save', key: String(k), val: String(v) }, '*');
                            } catch(e) {}
                        };
                        const _origRemove = window.localStorage.removeItem.bind(window.localStorage);
                        window.localStorage.removeItem = function(k) {
                            try { _origRemove(k); } catch(e) {}
                            try {
                                window.parent.postMessage({ type: 'bsms-storage-remove', key: String(k) }, '*');
                            } catch(e) {}
                        };
                        const _origClear = window.localStorage.clear.bind(window.localStorage);
                        window.localStorage.clear = function() {
                            try { _origClear(); } catch(e) {}
                            try {
                                window.parent.postMessage({ type: 'bsms-storage-clear' }, '*');
                            } catch(e) {}
                        };
                    } catch(err) {}
                })();
            <\/script>
        `;
        
        let finalHtml = htmlContent;
        if (finalHtml.includes('</head>')) {
            finalHtml = finalHtml.replace('</head>', scriptToInject + '</head>');
        } else {
            finalHtml += scriptToInject;
        }

        const blob = new Blob([finalHtml], { type: 'text/html' });
        if (currentGameBlobUrl) URL.revokeObjectURL(currentGameBlobUrl);
        currentGameBlobUrl = URL.createObjectURL(blob);
        
        loadingSpinner.style.display = 'none';
        cancelLoadBtn.style.display = 'none';
        loadingText.textContent = `${game.name.replace('.html', '')} is ready!`;
        playBtn.style.display = 'inline-block';
        
        playBtn.onclick = () => startGame();

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log("[BSMS Web :: Games] Game loading cancelled.");
        } else {
            console.error("[BSMS Web :: Games] Game Load Error: ", err);
            loadingText.textContent = "Error loading game.";
            loadingSpinner.style.display = 'none';
        }
    }
}

document.getElementById("exitGameBtn")?.addEventListener("click", () => quitGame(false));

cancelLoadBtn.addEventListener('click', () => {
    if (currentFetchController) currentFetchController.abort();
    closePopup('loadingOverlay');
    if (!isGameRunning) {
        history.pushState('', document.title, window.location.pathname + window.location.search);
    }
});

function startGame() {
    closePopup('loadingOverlay');
    isGameRunning = true;
    gameIframe.src = currentGameBlobUrl;
    gameContainer.style.display = 'block';
    
    setTimeout(() => { 
        gameIframe.focus(); 
        showToast(); 
    }, 200);
}

function showToast() {
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4500);
}

// In-Game Message Listener Map (Storage Sync)
window.addEventListener('message', (e) => {
    if (e.origin === window.location.origin && e.data?.type === 'bsms-return-game-vault') {
        window.location.assign('/g');
        return;
    }
    if (!e.data) return;
    if (e.data.type === 'bsms-storage-save') {
        const { key, val } = e.data;
        if (key && key !== SESSION_KEY && key !== 'session_id') {
            try { localStorage.setItem(key, val); } catch(err) {}
            scheduleCloudSave(600);
        }
    }
    if (e.data.type === 'bsms-storage-remove') {
        const { key } = e.data;
        if (key && key !== SESSION_KEY && key !== 'session_id') {
            try { localStorage.removeItem(key); } catch(err) {}
            scheduleCloudSave(600);
        }
    }
    if (e.data.type === 'bsms-storage-clear') {
        scheduleCloudSave(600);
    }
});
window.addEventListener('beforeunload', () => {
    if (isGameRunning) pushCloudSaves(true);
});
window.addEventListener('pagehide', () => {
    if (isGameRunning) pushCloudSaves(true);
});

function quitGame(skipHistoryAction = false) {
    gameContainer.style.display = 'none';
    isGameRunning = false;
    
    pushCloudSaves(); 
    
    gameIframe.src = 'about:blank';
    if (currentGameBlobUrl) {
        URL.revokeObjectURL(currentGameBlobUrl);
        currentGameBlobUrl = null;
    }
    
    if (!skipHistoryAction) {
        history.pushState('', document.title, window.location.pathname + window.location.search);
    }
}

// Background Auto-Save Loop
setInterval(() => {
    if (isGameRunning) pushCloudSaves();
}, 30000);

function handleHashChange() {
    const hash = window.location.hash.substring(1);
    if (!hash && isGameRunning) {
        quitGame(true);
    } else if (hash && !isGameRunning && allGamesList.length > 0) {
        const game = allGamesList.find(g => g.name === hash);
        if (game) triggerLoadGame(game);
    }
}
window.addEventListener('hashchange', handleHashChange);

fetchGames();
