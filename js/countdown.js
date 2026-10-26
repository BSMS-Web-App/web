/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

// Offline Banner Handlers
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');

async function apiFetch(endpoint, options = {}) {
    const sid = localStorage.getItem('session_id') || "";
    if (!options.headers) options.headers = {};
    options.headers['X-Session-ID'] = sid;
    options.headers['Content-Type'] = 'application/json';
    const res = await fetch(endpoint, options);
    if (!res.ok) throw new Error("API error");
    return res.json();
}

// ============================================================
// FEATURE FLAGS
// ============================================================
const FEATURE_PERMISSION_GATE = false;
const GATE_PASSCODE = "IDCABOUTBSMSWEB";
const FEATURE_SPLASH_TITLE_ANIMATION = false;
const SHIMMER_SPEED_MS = 1000;

const FEATURE_EGG_PARTY    = true;
const FEATURE_EGG_GHOST    = true;
const FEATURE_EGG_RAIN     = true;
const FEATURE_EGG_FLIP     = true;
const FEATURE_EGG_BIG      = true;
const FEATURE_EGG_RAINBOW  = true;
const FEATURE_EGG_FLASH    = true;
const FEATURE_EGG_FIREDRILL = true;

const FEATURE_QUICK_ACTIVATE = true;
const FEATURE_KEYBOARD_TAB  = true;
const FEATURE_KEYBOARD_SHORTCUTS = true;
const FEATURE_TEXT_SIZE = true;
const FEATURE_HELP_BUTTON = false;

const LOADING_SCREEN_MS = 5000;
const RESTART_SCREEN_MS = 4000;

let GRADE = null;

// ============================================================
// KEYBOARD SHORTCUTS ENGINE
// ============================================================
const defaultKeybinds = {
  cycleThemeText: 't',
  resync: 'y',
  toggleControls: 'enter',
  keyboardTab: 'k',
  schedule: 's',
  easterEggs: 'e',
  restart: 'delete'
};
let keybinds = {...defaultKeybinds};
let listeningForKeybind = null;

const keybindLabels = {
  cycleThemeText: "Open Theme tab",
  resync: "Resync Time",
  toggleControls: "Confirm / Toggle",
  keyboardTab: "Open Keyboard Shortcuts tab",
  schedule: "Open Schedule panel",
  easterEggs: "Open Easter Eggs tab",
  restart: "Restart"
};

function renderKeybinds() {
  const container = document.getElementById("keyboard-binds-container");
  if (!container) return;
  container.innerHTML = "";
  for (let action in keybinds) {
    const row = document.createElement("div");
    row.className = "toggle-row";
    
    const label = document.createElement("span");
    label.className = "toggle-label";
    label.style.fontSize = "calc(15px * var(--text-scale))";
    label.textContent = keybindLabels[action];
    
    const btn = document.createElement("button");
    btn.className = "modal-btn";
    btn.style.minWidth = "80px";
    btn.style.textAlign = "center";
    btn.textContent = keybinds[action] === ' ' ? 'SPACE' : keybinds[action].toUpperCase();
    
    btn.addEventListener("click", () => {
      if (listeningForKeybind) renderKeybinds(); 
      listeningForKeybind = action;
      btn.textContent = "Press key...";
      btn.classList.add("primary");
    });

    row.appendChild(label);
    row.appendChild(btn);
    container.appendChild(row);
  }
}

document.getElementById("reset-keybinds-btn").addEventListener("click", () => {
  keybinds = {...defaultKeybinds};
  renderKeybinds();
  saveConfig();
  showToast("Shortcuts reset to defaults");
  logToConsole("Keyboard shortcuts reset", "action");
});

// ============================================================
// TEXT SIZE ENGINE
// ============================================================
const TEXT_SIZE_STEP = 0.05;  
const TEXT_SIZE_DEFAULT = 1.0;
let currentTextScale = TEXT_SIZE_DEFAULT;

function applyTextSize(scale) {
  currentTextScale = Math.max(0.01, scale);
  document.documentElement.style.setProperty('--text-scale', currentTextScale);
  const pct = Math.round(currentTextScale * 100);
  const disp = document.getElementById('textSizeDisplay');
  if (disp) disp.value = pct + '%';
  logToConsole('Text size changed to ' + pct + '%', 'action');
}

function resetTextSize() {
  applyTextSize(TEXT_SIZE_DEFAULT);
  saveConfig();
  showToast("Text size reset to 100%");
}

if (FEATURE_TEXT_SIZE) {
  document.getElementById('textSizeUp').addEventListener('click', () => {
    applyTextSize(currentTextScale + TEXT_SIZE_STEP);
    saveConfig();
    showToast('Text size: ' + Math.round(currentTextScale * 100) + '%');
  });
  document.getElementById('textSizeDown').addEventListener('click', () => {
    applyTextSize(currentTextScale - TEXT_SIZE_STEP);
    saveConfig();
    showToast('Text size: ' + Math.round(currentTextScale * 100) + '%');
  });
  document.getElementById('textSizeReset').addEventListener('click', resetTextSize);

  const textDisp = document.getElementById('textSizeDisplay');
  if (textDisp) {
    textDisp.addEventListener('change', (e) => {
      let val = e.target.value.replace('%', '').trim();
      let parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        applyTextSize(parsed / 100);
        saveConfig();
        showToast('Text size: ' + Math.round(parsed) + '%');
      } else {
        e.target.value = Math.round(currentTextScale * 100) + '%';
      }
    });
  }
}

// ============================================================
// BOOT & ROUTING LOGIC
// ============================================================
function checkRouting() {
  const hash = window.location.hash.replace('#', '');
  if (['6', '7', '8'].includes(hash)) {
    GRADE = parseInt(hash);
    document.getElementById('grade-selection-screen').classList.add('hidden');
    
    if(!testStartFake){
      (async()=>{
        const ok=await fetchSyncedTime();
        syncedOffsetMs=ok?syncedOffsetMs:0;
        lastPeriod=""; updateLabel(); updateBar();
        if(ok) logToConsole("Time synced on load. Offset: "+syncedOffsetMs+"ms","info");
        else logToConsole("Time sync failed — using local time","warn");
      })();
    }
    checkCelebration();
    initGate();
  } else {
    GRADE = null;
    document.getElementById('grade-selection-screen').classList.remove('hidden');
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('permission-gate').classList.add('hidden');
    updateDocumentTitle(null);
  }
}

document.querySelectorAll('.grade-card').forEach(card => {
  card.addEventListener('click', () => {
    window.location.hash = card.dataset.grade;
  });
});

window.addEventListener('hashchange', () => {
  const newHash = window.location.hash.replace('#', '');
  if (['6', '7', '8'].includes(newHash)) {
    if (GRADE === null) {
      checkRouting();
    } else if (GRADE !== parseInt(newHash)) {
      window.location.reload(); 
    }
  } else {
    if (GRADE !== null) {
      window.location.reload(); 
    }
  }
});

// ============================================================
// PERMISSION GATE LOGIC
// ============================================================
function initGate() {
  const gate = document.getElementById('permission-gate');
  if (!FEATURE_PERMISSION_GATE) {
    gate.classList.add('hidden');
    initSplash();
    return;
  }
  document.getElementById('splash-screen').classList.add('hidden');
  gate.classList.remove('hidden');
}

function checkGateCode() {
  const inp = document.getElementById('gate-code-input');
  const err = document.getElementById('gate-error');
  if (inp.value.trim() === GATE_PASSCODE) {
    err.classList.remove('show');
    const gate = document.getElementById('permission-gate');
    gate.classList.add('fade-out');
    logToConsole('Permission gate passed — access granted', 'info');
    setTimeout(() => {
      gate.classList.add('hidden');
      initSplash();
    }, 550);
  } else {
    err.classList.add('show');
    inp.classList.remove('shake');
    void inp.offsetWidth;
    inp.classList.add('shake');
    inp.value = '';
    logToConsole('Permission gate: incorrect code entered', 'warn');
    setTimeout(() => err.classList.remove('show'), 2500);
  }
}

// ============================================================
// APPLY FEATURE FLAGS TO DOM
// ============================================================
(function applyFeatureFlags() {
  const eggPillMap = {party: FEATURE_EGG_PARTY, ghost: FEATURE_EGG_GHOST, rain: FEATURE_EGG_RAIN, flip: FEATURE_EGG_FLIP, big: FEATURE_EGG_BIG, rainbow: FEATURE_EGG_RAINBOW, flash: FEATURE_EGG_FLASH, firedrill: FEATURE_EGG_FIREDRILL};
  Object.entries(eggPillMap).forEach(([egg, enabled]) => {
    const pill = document.getElementById('egg-pill-' + egg);
    if (pill && !enabled) pill.style.display = 'none';
  });
  const qa = document.getElementById('quick-activate-section');
  if (qa && !FEATURE_QUICK_ACTIVATE) qa.style.display = 'none';
  const kbTab = document.getElementById('tab-btn-keyboard');
  if (kbTab && !FEATURE_KEYBOARD_TAB) kbTab.style.display = 'none';

  const tsSection = document.getElementById('section-text-size');
  if (tsSection) tsSection.style.display = FEATURE_TEXT_SIZE ? 'block' : 'none';

  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.style.display = FEATURE_HELP_BUTTON ? 'flex' : 'none';

  if (FEATURE_KEYBOARD_SHORTCUTS) renderKeybinds();
})();

// ============================================================
// SPLASH SCREEN
// ============================================================
const SPLASH_ASSETS = ["color-picker-ui","font-loader","theme-engine","schedule-parser","audio-context","fireworks-engine"].sort(() => Math.random() - 0.5);
let pendingConfig = null;

function buildDotLoader(containerId, count = 10) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const size = 56, cx = size / 2, cy = size / 2, radius = size / 2 - 6;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle);
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.left = (x - 4) + "px";
    dot.style.top  = (y - 4) + "px";
    dot.style.animationDelay = (-((count - i) / count) * 1.2) + "s";
    container.appendChild(dot);
  }
}

function startSplash() {
  const splash = document.getElementById("splash-screen");
  setTimeout(() => {
    splash.style.background = 'transparent';
    splash.classList.add("fade-out");
    document.getElementById('main-display').classList.add('visible');
    setTimeout(() => { 
      splash.classList.add("hidden"); 
      splash.style.background = ''; 
    }, 580);
  }, 1200);
}

function initSplash() {
  document.getElementById('splash-screen').classList.remove('hidden');
  buildDotLoader("splash-dot-loader", 10);
  buildDotLoader("restart-dot-loader", 10);
  startSplash();
}

// ============================================================
// SCHEDULE / TIME LOGIC
// ============================================================
const lunchTimes = { 6: {start: "10:45", end: "11:15"}, 7: {start: "11:20", end: "11:50"} };

function getSchedule() {
  if (GRADE === null) return [];
  
  if (GRADE === 8) {
    return [
      {name: "1st Period", start: "08:00", end: "08:50"},
      {name: "2nd Period", start: "08:55", end: "09:45"},
      {name: "3rd Period", start: "09:50", end: "10:40"},
      {name: "4th Period", start: "10:45", end: "11:35"},
      {name: "5th Period", start: "11:40", end: "11:55"},
      {name: "Lunch",      start: "11:55", end: "12:25"},
      {name: "5th Period", start: "12:30", end: "13:20"},
      {name: "6th Period", start: "13:25", end: "14:15"},
      {name: "7th Period", start: "14:20", end: "15:10"}
    ];
  }

  const lunchStart = lunchTimes[GRADE].start, lunchEnd = lunchTimes[GRADE].end;
  return [
    {name: "1st Period", start: "08:00", end: "08:50"},
    {name: "2nd Period", start: "08:55", end: "09:45"},
    {name: "3rd Period", start: "09:50", end: "10:40"},
    {name: "4th Period", start: "10:45", end: lunchStart},
    {name: "Lunch",      start: lunchStart, end: lunchEnd},
    {name: "4th Period", start: lunchEnd, end: "12:25"},
    {name: "5th Period", start: "12:30", end: "13:20"},
    {name: "6th Period", start: "13:25", end: "14:15"},
    {name: "7th Period", start: "14:20", end: "15:10"}
  ].filter(b => b.start !== b.end);
}

const FONTS = ["Patrick Hand", "Fredoka One", "Bubblegum Sans", "Boogaloo", "Caveat", "Comfortaa", "Architects Daughter", "Permanent Marker", "Rock Salt", "Special Elite", "VT323", "Press Start 2P", "Cinzel", "Playfair Display", "Raleway", "Oswald", "Bebas Neue", "Righteous", "Titan One", "Russo One", "Monoton"];

let testStartReal = Date.now(), testStartFake = null, syncedOffsetMs = 0, syncPromise = null;
const COUNTDOWN_DELAY_MS = 2000, SYNC_TIMEOUT_MS = 5000;
const SYNC_API_URL = "https://worldtimeapi.org/api/timezone/";

function parseTestDateTime(str) {
  if (!str || !str.trim()) return null;
  const s = str.trim();
  const p12 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (p12) {
    let [,mo,dy,yr,hr,mn,sc,ampm] = p12; mo=+mo;dy=+dy;yr=+yr;hr=+hr;mn=+mn;sc=+sc;
    const fullYr = yr < 100 ? 2000+yr : yr;
    if (ampm.toUpperCase()==='PM'&&hr!==12) hr+=12;
    if (ampm.toUpperCase()==='AM'&&hr===12) hr=0;
    const d = new Date(fullYr, mo-1, dy, hr, mn, sc, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const p24 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (p24) {
    const [,mo,dy,yr,hr,mn,sc]=p24.map(Number); const fullYr=yr<100?2000+yr:yr;
    const d=new Date(fullYr,mo-1,dy,hr,mn,sc,0); return isNaN(d.getTime())?null:d;
  }
  return null;
}
function getNow() {
  let base = testStartFake ? new Date(testStartFake.getTime()+(Date.now()-testStartReal)) : new Date(Date.now()+syncedOffsetMs);
  return new Date(base.getTime()-COUNTDOWN_DELAY_MS);
}
function setTestDateTime(str) {
  const parsed = parseTestDateTime(str);
  if (parsed) {
    testStartFake = parsed; testStartReal = Date.now();
    lastPeriod = ""; isFirstLoad = true;
    if (typeof stopCelebration === 'function') stopCelebration();
    updateLabel(); updateBar();
    if (typeof checkCelebration === 'function') checkCelebration();
    updateTestDateBadge(true, str.trim());
    logToConsole('Test time set: ' + str.trim(), 'test');
    showToast("Test time set!");
    return true;
  }
  return false;
}
function clearTestDateTime() {
  testStartFake = null; testStartReal = Date.now();
  lastPeriod = ""; isFirstLoad = true;
  if (typeof stopCelebration === 'function') stopCelebration();
  updateLabel(); updateBar();
  if (typeof checkCelebration === 'function') checkCelebration();
  updateTestDateBadge(false, "");
  logToConsole("Test time cleared — using real time", 'test');
  showToast("Using real time.");
}
function updateTestDateBadge(active, str) {
  const badge = document.getElementById("testDateBadge"), text = document.getElementById("testDateBadgeText");
  if (active) { badge.classList.add("active-test"); text.textContent = "Testing: " + str; }
  else { badge.classList.remove("active-test"); text.textContent = "Using real time"; }
}
async function fetchSyncedTime() {
  if (testStartFake || GRADE === null) return false;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York";
  const ctrl = new AbortController(), tid = setTimeout(()=>ctrl.abort(), SYNC_TIMEOUT_MS);
  try {
    const t0=Date.now(), res=await fetch(`${SYNC_API_URL}${encodeURIComponent(tz)}`,{cache:"no-store",signal:ctrl.signal}), t1=Date.now();
    clearTimeout(tid);
    if(!res.ok) throw new Error("http "+res.status);
    const data=await res.json();
    let st=null;
    if(data.unixtime) st=new Date(data.unixtime*1000);
    else if(data.utc_datetime) st=new Date(data.utc_datetime);
    else if(data.datetime) st=new Date(data.datetime);
    if(!st||isNaN(st)) throw new Error("bad time");
    syncedOffsetMs=(st.getTime()+(t1-t0)/2)-Date.now(); return true;
  } catch(e) {
    clearTimeout(tid);
    try {
      const tz2=Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York";
      const t0=Date.now(),res2=await fetch("https://timeapi.io/api/time/current/zone?timeZone="+encodeURIComponent(tz2),{cache:"no-store"}),t1=Date.now();
      if(!res2.ok) throw new Error();
      const d2=await res2.json(), dt=d2.dateTime||d2.currentLocalTime;
      if(!dt) throw new Error();
      const st2=new Date(dt); if(isNaN(st2)) throw new Error();
      syncedOffsetMs=(st2.getTime()+(t1-t0)/2)-Date.now(); return true;
    } catch{}
    syncedOffsetMs=0; return false;
  }
}
async function syncTime(showUI=false) {
  if (testStartFake) { showToast("Clear test time first to sync."); return false; }
  const ind=document.getElementById("resync-indicator");
  if(showUI){ind.classList.add("show");showToast("Resyncing...");}
  if(syncPromise) return syncPromise;
  syncPromise=(async()=>{
    try { const ok=await fetchSyncedTime(); if(showUI) showToast(ok?"Time synced.":"Sync failed."); return ok; }
    finally { syncPromise=null; setTimeout(()=>ind.classList.remove("show"),1200); lastPeriod=""; updateLabel(); updateBar(); }
  })();
  return syncPromise;
}

const CELEBRATION_START_H=15, CELEBRATION_START_M=10, CELEBRATION_END_H=16, CELEBRATION_END_M=0, WARN_MINUTES=2;
const SHIMMER_DURATION=1000, SHIMMER_CYCLE=3000;
const CELEBRATION_EMOJIS=["🎉","🎊","🥳","🎈","✨","🌟","💥","🎆","🎇","🍕","🎸","🎮","🏆","🥂","🎂","💃","🕺","🎁","🦄","🚀","🤩","😎","🔥","💫","🎵","🎶","👑","🤑","💎","🎠"];
let sessionLabelOverrides={};
let currentDisplayKey="", lastPeriod="", isFirstLoad=true;

function formatDateKey(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function formatTime(ms){const tot=Math.max(0,Math.floor(ms/1000)),h=Math.floor(tot/3600),m=Math.floor((tot%3600)/60),s=tot%60;if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;if(m>0)return`${m}:${String(s).padStart(2,"0")}`;return`0:${String(s).padStart(2,"0")}`;}
function formatTimeMs(ms){const tot=Math.max(0,ms),h=Math.floor(tot/3600000),m=Math.floor((tot%3600000)/60000),s=Math.floor((tot%60000)/1000),ms2=Math.floor((tot%1000)/10);if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(ms2).padStart(2,"0")}`;if(m>0)return`${m}:${String(s).padStart(2,"0")}.${String(ms2).padStart(2,"0")}`;return`0:${String(s).padStart(2,"0")}.${String(ms2).padStart(2,"0")}`;}
function formatClockTime(ti){const[h,m]=ti.split(":").map(Number);return`${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;}
function toDate(time,base){const[h,m]=time.split(":").map(Number),d=new Date(base);d.setHours(h,m,0,0);return d;}
function getDisplayName(def,key){const c=sessionLabelOverrides[key];return(c&&c.trim())?c.trim():def;}
function isWeekendNow(){const d=getNow().getDay();return d===0||d===6;}
function getNextNonChangePeriod(now,fromIdx){
  const schedule=getSchedule();
  for(let i=fromIdx;i<schedule.length;i++){
    if(!isClassChange(schedule[i].name)){const nk=`schedule-base-${i}-${schedule[i].start}-${schedule[i].end}`;return`Next: ${getDisplayName(schedule[i].name,nk)} at ${formatClockTime(schedule[i].start)}`;}
  }
  return "";
}
function isClassChange(name){const n=name.toLowerCase();return n.includes("class change")||n.includes("dismissal")||n.includes("passing");}
function isTimerHidden(state){return state.isWeekend||state.isAfterSchool;}
function getCurrentState(now){
  const schedule=getSchedule();
  if (schedule.length === 0) return {key:`unknown-base`,label:"",remainingText:"",percent:0,nextLabel:""};

  const day=now.getDay();
  const firstStart=toDate(schedule[0].start,now),lastEnd=toDate(schedule[schedule.length-1].end,now);
  if(day===0||day===6){const key=`weekend-base`;return{key,label:getDisplayName("Weekend",key),remainingText:"",percent:0,nextLabel:"",isWeekend:true};}
  if(now<firstStart){const key=`before-school-base`;return{key,label:getDisplayName("School starts in",key),remainingText:formatTime(firstStart-now),percent:0,nextLabel:getNextNonChangePeriod(now,0)};}
  if(now>=lastEnd){const key=`after-school-base`;return{key,label:getDisplayName("School has ended.",key),remainingText:"",percent:100,nextLabel:"",isAfterSchool:true};}
  for(let i=0;i<schedule.length-1;i++){
    const end=toDate(schedule[i].end,now),nextStart=toDate(schedule[i+1].start,now);
    if(now>end&&now<nextStart){const key=`class-change-base-${i}`;return{key,label:"Class Change",remainingText:formatTime(nextStart-now),percent:Math.min(100,Math.max(0,((now-end)/(nextStart-end))*100)),nextLabel:getNextNonChangePeriod(now,i+1),msLeft:nextStart-now,msLeftRaw:nextStart-now};}
  }
  for(let i=0;i<schedule.length;i++){
    const start=toDate(schedule[i].start,now),end=toDate(schedule[i].end,now);
    if(now>=start&&now<=end){const key=`schedule-base-${i}-${schedule[i].start}-${schedule[i].end}`;return{key,label:getDisplayName(schedule[i].name,key),remainingText:formatTime(end-now),percent:Math.min(100,Math.max(0,((now-start)/(end-start))*100)),nextLabel:getNextNonChangePeriod(now,i+1),msLeft:end-now,msLeftRaw:end-now};}
  }
  return{key:`unknown-base`,label:"",remainingText:"",percent:0,nextLabel:""};
}

// ============================================================
// DOM REFS
// ============================================================
const labelEl=document.getElementById("label"), timerEl=document.getElementById("timer");
const bar=document.getElementById("bar"), barTooltip=document.getElementById("bar-tooltip");
const overlay=document.getElementById("overlay"), barContainer=document.getElementById("bar-container");
const nextPreview=document.getElementById("next-preview"), controlsBtn=document.getElementById("controls-btn");
const controlsModal=document.getElementById("controlsModal"), panelClose=document.getElementById("panel-close");
const scheduleModal=document.getElementById("scheduleModal");
const scheduleCardClose=document.getElementById("scheduleCard-close"), scheduleCardBody=document.getElementById("scheduleCard-body");
const screenFlash=document.getElementById("screen-flash"), colorFlash=document.getElementById("color-flash");
const toastEl=document.getElementById("toast"), eggModeIndicator=document.getElementById("egg-mode-indicator");
const fireDrillOverlay=document.getElementById("fire-drill-overlay");

// ============================================================
// FULL RESET / RESTART LOGIC
// ============================================================
function showRestartScreen(){
  closeControls();
  const rs=document.getElementById("restart-screen");
  rs.classList.add("visible"); void rs.offsetWidth; rs.classList.add("fade-in");
  
  if(typeof stopCelebration==="function") stopCelebration();
  if(typeof stopWeekendFireworks==="function") stopWeekendFireworks();
  clearInterval(rainInterval); clearInterval(flashLightInterval); clearInterval(ghostInterval);
  
  setTimeout(()=>{
    localStorage.removeItem("bsms_countdown_prefs");
    const auth = getAuthSession();
    if(auth.loggedIn && auth.uid) {
      apiFetch('/api/account', { method: 'PUT', body: JSON.stringify({ countdown_preferences: null }) })
        .catch(e => console.error(e));
    }
    rs.classList.add("fade-out");
    rs.classList.remove("fade-in");
    setTimeout(()=>{
       rs.classList.remove("visible","fade-out");
       window.location.hash = '';
       window.location.reload();
    }, 450);
  }, RESTART_SCREEN_MS);
}
document.getElementById("panel-restart-btn").addEventListener("click",()=>{closeControls();document.getElementById("restart-confirm-modal").classList.add("open");});
document.getElementById("restart-cancel-btn").addEventListener("click",()=>{document.getElementById("restart-confirm-modal").classList.remove("open");logToConsole('Restart cancelled','info');});
document.getElementById("restart-proceed-btn").addEventListener("click",()=>{document.getElementById("restart-confirm-modal").classList.remove("open");showRestartScreen();});
document.getElementById("restart-confirm-modal").addEventListener("click",e=>{if(e.target===document.getElementById("restart-confirm-modal")){document.getElementById("restart-confirm-modal").classList.remove("open");}});

let toastTimer=null;
function showToast(msg,dur=2200){toastEl.textContent=msg;toastEl.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove("show"),dur);}

let topToastTimer = null;
function showTopToast(msg, dur=3000) {
  const tt = document.getElementById('top-toast');
  tt.textContent = msg;
  tt.classList.add('show');
  clearTimeout(topToastTimer);
  topToastTimer = setTimeout(() => tt.classList.remove('show'), dur);
}
document.getElementById('help-btn').addEventListener('click', () => {
  showTopToast("This feature is not available yet");
  logToConsole('Help button clicked', 'action');
});

// ============================================================
// TABS + DRAG SCROLL
// ============================================================
const panelTabs=document.getElementById("panel-tabs");
let tabDragging=false,tabDragStartX=0,tabDragScrollLeft=0,tabDragMoved=false,lastTabIndex=0;
const TAB_ORDER=["appearance","settings","keyboard","easter","console","accounts"];
panelTabs.addEventListener("mousedown",e=>{tabDragging=true;tabDragMoved=false;tabDragStartX=e.pageX-panelTabs.offsetLeft;tabDragScrollLeft=panelTabs.scrollLeft;});
document.addEventListener("mousemove",e=>{if(!tabDragging)return;const x=e.pageX-panelTabs.offsetLeft;const walk=x-tabDragStartX;if(Math.abs(walk)>4)tabDragMoved=true;panelTabs.scrollLeft=tabDragScrollLeft-walk;});
document.addEventListener("mouseup",()=>{tabDragging=false;});
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    if(tabDragMoved) return;
    const newTab=btn.dataset.tab;
    const newIdx=TAB_ORDER.indexOf(newTab);
    const dir=newIdx>lastTabIndex?'right':'left';
    lastTabIndex=newIdx;
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p=>{p.classList.remove("active","slide-in-right","slide-in-left");});
    btn.classList.add("active");
    const pane=document.getElementById("tab-"+newTab);
    pane.classList.add("active", dir==='right'?"slide-in-right":"slide-in-left");
    if(newTab==="easter") refreshEggList();
    if(newTab==="console") refreshConsoleTab();
    logToConsole('Tab switched to: '+newTab,'action');
  });
});

let lastSubtabIndex=0;
const SUBTAB_ORDER=["theme","text"];
document.querySelectorAll(".subtab-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const newSub=btn.dataset.subtab;
    const newIdx=SUBTAB_ORDER.indexOf(newSub);
    const dir=newIdx>lastSubtabIndex?'right':'left';
    lastSubtabIndex=newIdx;
    document.querySelectorAll(".subtab-btn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".subtab-pane").forEach(p=>{p.classList.remove("active","slide-left");});
    btn.classList.add("active");
    const pane=document.getElementById("subtab-"+newSub);
    pane.classList.add("active");
    if(dir==='left') pane.classList.add("slide-left");
    logToConsole('Appearance subtab switched to: '+newSub,'action');
  });
});

let controlsClosing=false;
let panelMouseDownInside=false;
document.getElementById("controls-panel").addEventListener("mousedown",()=>{ panelMouseDownInside=true; });
document.addEventListener("mouseup",()=>{ setTimeout(()=>{ panelMouseDownInside=false; }, 0); });

function openControls(tab, scrollTargetId){
  if(tab){
    const newIdx=TAB_ORDER.indexOf(tab);
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    document.querySelectorAll(".tab-pane").forEach(p=>p.classList.remove("active","slide-in-right","slide-in-left"));
    const pane=document.getElementById("tab-"+tab);
    if(pane) pane.classList.add("active","slide-in-right");
    lastTabIndex=newIdx>=0?newIdx:0;
    if(tab==="easter") refreshEggList();
    if(tab==="console") refreshConsoleTab();
  }
  controlsModal.classList.remove("closing");
  controlsModal.classList.add("open");
  document.getElementById("controls-panel").classList.remove("closing");
  logToConsole('Controls panel opened'+(tab?' to tab: '+tab:''),'action');
  
  if(scrollTargetId){
    setTimeout(()=>{
      const el = document.getElementById(scrollTargetId);
      const pb = document.getElementById('panel-body');
      if (el && pb) {
        const topPos = el.getBoundingClientRect().top - pb.getBoundingClientRect().top + pb.scrollTop - 10;
        pb.scrollTo({ top: topPos, behavior: 'smooth' });
      }
    }, 360);
  }
}
function closeControls(){
  if(controlsClosing) return;
  controlsClosing=true;
  const panel=document.getElementById("controls-panel");
  panel.classList.add("closing"); controlsModal.classList.add("closing");
  setTimeout(()=>{controlsModal.classList.remove("open","closing");panel.classList.remove("closing");controlsClosing=false;},300);
  logToConsole('Controls panel closed','action');
}
controlsBtn.addEventListener("click", () => {
  const auth = getAuthSession();
  if (auth.loggedIn) {
    openControls("accounts");
  } else {
    window.location.href = "/accounts#signup";
  }
});
panelClose.addEventListener("click",closeControls);
controlsModal.addEventListener("mousedown",e=>{ if(e.target===controlsModal) panelMouseDownInside=false; });
controlsModal.addEventListener("click",e=>{ if(e.target===controlsModal && !panelMouseDownInside) closeControls(); });

// ============================================================
// SCHEDULE MODAL
// ============================================================
function buildScheduleList(container,weekend){
  if (GRADE === null) return;
  const now = getNow();
  container.innerHTML = "";
  if(weekend){
    container.innerHTML=`<p style="font-size:17px;color:var(--fg2);padding:10px 0;margin:0;">No school today — enjoy your weekend!</p>`;
    return;
  }
  
  const instr = document.createElement("div");
  instr.style.cssText = "font-size:calc(14px * var(--text-scale)); color:var(--fg2); text-align:center; margin-bottom:12px; font-style:italic;";
  instr.textContent = "Click any period name to rename it.";
  container.appendChild(instr);

  const schedule = getSchedule();
  schedule.forEach((s,i)=>{
    const start=toDate(s.start,now), end=toDate(s.end,now);
    const row=document.createElement("div"); 
    row.className="sched-row"; 
    row.style.animationDelay=(i*0.04)+"s";
    
    const isCurrent=now>=start&&now<=end;
    if(now>=end&&!isCurrent) row.classList.add("past");
    if(isCurrent) row.classList.add("current");
    
    const key=`schedule-base-${i}-${s.start}-${s.end}`;
    
    const dot = document.createElement("div"); 
    dot.className = "sched-dot";
    
    const nameDiv = document.createElement("div"); 
    nameDiv.className = "sched-name";
    nameDiv.textContent = getDisplayName(s.name, key);
    nameDiv.style.cursor = "pointer";
    nameDiv.title = "Click any period name to rename it.";

    nameDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "sched-rename-input";
      inp.value = sessionLabelOverrides[key] || s.name;
      nameDiv.replaceWith(inp);
      inp.focus();

      const commit = () => {
        const v = inp.value.trim();
        if (v && v !== s.name) sessionLabelOverrides[key] = v;
        else delete sessionLabelOverrides[key];
        saveConfig();
        lastPeriod = "";
        updateLabel();
        buildScheduleList(container, isWeekendNow());
        logToConsole(`Period renamed to: "${v || s.name}"`,'action');
      };
      inp.addEventListener("blur", commit);
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") inp.blur();
        else if (ev.key === "Escape") buildScheduleList(container, isWeekendNow());
      });
    });

    const timeDiv = document.createElement("div"); 
    timeDiv.className = "sched-time";
    timeDiv.textContent = `${formatClockTime(s.start)} – ${formatClockTime(s.end)}`;
    
    row.appendChild(dot);
    row.appendChild(nameDiv);
    row.appendChild(timeDiv);
    container.appendChild(row);
  });
}

function openScheduleModal(){buildScheduleList(scheduleCardBody,isWeekendNow());scheduleModal.classList.add("open");logToConsole('Schedule modal opened','action');}
function closeScheduleModal(){scheduleModal.classList.remove("open");}
scheduleCardClose.addEventListener("click",closeScheduleModal);
scheduleModal.addEventListener("click",e=>{if(e.target===scheduleModal) closeScheduleModal();});

labelEl.addEventListener("click",e=>{
  openScheduleModal();
});

barContainer.addEventListener("click",()=>{
  openControls("appearance", "section-bar-color");
  document.getElementById("subtab-theme-btn").click();
  logToConsole('Progress bar clicked — opened bar color settings','action');
});

// ============================================================
// THEME PRESETS
// ============================================================
document.querySelectorAll(".theme-swatch").forEach(s=>{
  s.addEventListener("click",()=>{
    const theme=s.dataset.theme;
    applyTheme(theme);
    saveConfig();
    logToConsole(`Theme preset applied: ${theme||'dark'}`,'action');
    showToast("Theme applied.");
  });
});
function applyTheme(themeClass){
  document.body.classList.remove("light-theme","custom-theme");
  if(themeClass) document.body.classList.add(themeClass);
  document.querySelectorAll(".theme-swatch").forEach(s=>s.classList.toggle("active",s.dataset.theme===themeClass));
}

// ============================================================
// COLOR WHEEL ENGINE
// ============================================================
function initColorWheel(canvasId, hueId, satId, litId, hexId, previewId, onUpdate, swatchId, satMin, satMax, litMin, litMax) {
  const canvas=document.getElementById(canvasId); if(!canvas) return{setHSL:()=>{},getHex:()=>"#000000",hslToHex:(h,s,l)=>"#000000"};
  const ctx=canvas.getContext("2d"); const size=canvas.width; let isDragging=false;
  let H=0,S=0,L=50; let rafPending=false;
  const sMin=satMin??0,sMax=satMax??100,lMin=litMin??0,lMax=litMax??100;
  const offCanvas=document.createElement("canvas"); offCanvas.width=size; offCanvas.height=size;
  const offCtx=offCanvas.getContext("2d");
  function drawWheelBase(){
    const cx=size/2,cy=size/2,r=size/2-2;
    for(let angle=0;angle<360;angle++){
      const sa=(angle-1)*Math.PI/180,ea=(angle+1)*Math.PI/180;
      const grad=offCtx.createRadialGradient(cx,cy,0,cx,cy,r);
      grad.addColorStop(0,`hsl(${angle},0%,50%)`); grad.addColorStop(1,`hsl(${angle},100%,50%)`);
      offCtx.beginPath(); offCtx.moveTo(cx,cy); offCtx.arc(cx,cy,r,sa,ea); offCtx.closePath();
      offCtx.fillStyle=grad; offCtx.fill();
    }
  }
  drawWheelBase();
  function drawWheel(){
    const cx=size/2,cy=size/2,r=size/2-2;
    ctx.clearRect(0,0,size,size); ctx.drawImage(offCanvas,0,0);
    const lgr=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    const wAlpha=Math.max(0,1-(L/100)*1.4+0.3), bAlpha=Math.max(0,(1-L/100)*0.7);
    lgr.addColorStop(0,`rgba(255,255,255,${wAlpha})`); lgr.addColorStop(1,`rgba(0,0,0,${bAlpha})`);
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=lgr; ctx.fill();
    const angle=H*Math.PI/180, dist=(S/100)*(r-10);
    const cx2=cx+Math.cos(angle)*dist, cy2=cy+Math.sin(angle)*dist;
    ctx.beginPath(); ctx.arc(cx2,cy2,8,0,Math.PI*2); ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx2,cy2,6,0,Math.PI*2); ctx.strokeStyle="rgba(0,0,0,0.5)"; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx2,cy2,4,0,Math.PI*2); ctx.fillStyle=hslToHex(H,S,L); ctx.fill();
  }
  function hslToHex(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,"0");};return "#"+f(0)+f(8)+f(4);}
  function hexToHsl(hex){let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=0,l=(max+min)/2;if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=Math.round(h*60);if(h<0)h+=360;}return[h,Math.round(s*100),Math.round(l*100)];}
  function syncUILive(){
    if(rafPending) return; rafPending=true;
    requestAnimationFrame(()=>{
      rafPending=false;
      const hex=hslToHex(H,S,L);
      const hueEl=document.getElementById(hueId),satEl=document.getElementById(satId),litEl=document.getElementById(litId),hexEl=document.getElementById(hexId);
      if(hueEl) hueEl.value=H; if(satEl) satEl.value=S; if(litEl) litEl.value=L;
      if(hexEl) hexEl.value=hex;
      const prev=document.getElementById(previewId); if(prev) prev.style.background=hex;
      if(swatchId){const sw=document.getElementById(swatchId);if(sw)sw.style.background=hex;}
      drawWheel(); onUpdate(H,S,L,hex);
    });
  }
  function pickFromCanvas(e){
    const rect=canvas.getBoundingClientRect();
    const clientX=e.clientX??e.touches?.[0]?.clientX??0, clientY=e.clientY??e.touches?.[0]?.clientY??0;
    const x=clientX-rect.left-size/2, y=clientY-rect.top-size/2, r=size/2-2;
    const dist=Math.sqrt(x*x+y*y);
    H=Math.round(Math.atan2(y,x)*180/Math.PI); if(H<0)H+=360;
    S=Math.min(sMax,Math.max(sMin,Math.round((dist/r)*100)));
    syncUILive();
  }
  canvas.addEventListener("mousedown",e=>{isDragging=true;pickFromCanvas(e);});
  document.addEventListener("mousemove",e=>{if(isDragging)pickFromCanvas(e);});
  document.addEventListener("mouseup",()=>{isDragging=false;});
  canvas.addEventListener("touchstart",e=>{e.preventDefault();isDragging=true;pickFromCanvas(e);},{passive:false});
  canvas.addEventListener("touchmove",e=>{e.preventDefault();if(isDragging)pickFromCanvas(e);},{passive:false});
  canvas.addEventListener("touchend",()=>{isDragging=false;});
  [hueId,satId,litId].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener("input",()=>{
      H=+(document.getElementById(hueId)?.value||0);
      S=+(document.getElementById(satId)?.value||0);
      L=+(document.getElementById(litId)?.value||50);
      syncUILive();
    });
  });
  const hexInputEl=document.getElementById(hexId);
  if(hexInputEl){
    hexInputEl.addEventListener("input",e=>{
      const v=e.target.value;
      if(/^#[0-9a-fA-F]{6}$/.test(v)){
        [H,S,L]=hexToHsl(v);
        const hueEl=document.getElementById(hueId),satEl=document.getElementById(satId),litEl=document.getElementById(litId);
        if(hueEl)hueEl.value=H; if(satEl)satEl.value=S; if(litEl)litEl.value=L;
        if(swatchId){const sw=document.getElementById(swatchId);if(sw)sw.style.background=v;}
        const prev=document.getElementById(previewId); if(prev)prev.style.background=v;
        requestAnimationFrame(()=>{drawWheel();onUpdate(H,S,L,v);});
      }
    });
  }
  drawWheel();
  return{
    setHSL(h,s,l){H=h;S=Math.min(sMax,Math.max(sMin,s));L=Math.min(lMax,Math.max(lMin,l));syncUILive();},
    getHex(){return hslToHex(H,S,L);},
    hslToHex
  };
}

let primaryHex="#000000";
const primaryWheel=initColorWheel("primary-wheel","primaryHue","primarySat","primaryLit","primaryHexInput","primaryColorPreview",
  (h,s,l,hex)=>{
    primaryHex=hex;
    document.getElementById("primaryColorPreview").style.background=hex;
    document.getElementById("primaryHexSwatch").style.background=hex;
    logToConsole(`Primary color picker: ${hex}`,'log');
  },"primaryHexSwatch",0,100,0,100);
primaryWheel.setHSL(0,0,0);

let secondaryHex="#BB001E";
const secondaryWheel=initColorWheel("secondary-wheel","secondaryHue","secondarySat","secondaryLit","secondaryHexInput","secondaryColorPreview",
  (h,s,l,hex)=>{
    secondaryHex=hex;
    document.getElementById("secondaryColorPreview").style.background=hex;
    document.getElementById("secondaryHexSwatch").style.background=hex;
    logToConsole(`Secondary color picker: ${hex}`,'log');
  },"secondaryHexSwatch",10,100,10,80);
secondaryWheel.setHSL(348,100,37);

document.getElementById("applyPrimaryColor").addEventListener("click",()=>{
  applyThemeColors(primaryHex, secondaryHex);
  saveConfig();
  logToConsole(`Primary color applied: ${primaryHex}`,'action');
  showToast("Primary color applied!");
});

document.getElementById("resetPrimaryColor").addEventListener("click",()=>{
  primaryHex="#000000";
  primaryWheel.setHSL(0,0,0);
  saveConfig();
  logToConsole('Primary color reset to default (#000000)','action');
  showToast("Primary color reset.");
});

document.getElementById("applySecondaryColor").addEventListener("click",()=>{
  applyThemeColors(primaryHex, secondaryHex);
  saveConfig();
  logToConsole(`Secondary color applied: ${secondaryHex}`,'action');
  showToast("Secondary color applied!");
});

document.getElementById("resetSecondaryColor").addEventListener("click",()=>{
  secondaryHex="#BB001E";
  secondaryWheel.setHSL(348,100,37);
  saveConfig();
  logToConsole('Secondary color reset to default (#BB001E)','action');
  showToast("Secondary color reset.");
});

function computeAccent2(hex){
  let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=Math.round(h*60);if(h<0)h+=360;}
  s=Math.round(s*100);l=Math.round(l*100);
  const newL=Math.min(80,l+15),newS=Math.min(100,s+5);
  let sl=newL/100,ss=newS/100;const a2=ss*Math.min(sl,1-sl);
  const f2=n=>{const k=(n+h/30)%12;const c=sl-a2*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,"0");};
  return "#"+f2(0)+f2(8)+f2(4);
}
function applyThemeColors(bg, accent){
  const root=document.documentElement;
  root.style.setProperty("--custom-bg", bg);
  root.style.setProperty("--custom-accent", accent);
  root.style.setProperty("--custom-accent2", computeAccent2(accent));
  if(useAutoText){
    const r=parseInt(bg.slice(1,3),16)/255,g=parseInt(bg.slice(3,5),16)/255,bv=parseInt(bg.slice(5,7),16)/255;
    const lum=0.299*r+0.587*g+0.114*bv;
    const autoFg=lum>0.5?"#000000":"#ffffff";
    root.style.setProperty("--custom-fg",autoFg);
    textColorHex=autoFg;
    const hsl=hexToHslRaw(autoFg);
    if(typeof textColorWheel !== 'undefined') textColorWheel.setHSL(hsl[0],hsl[1],hsl[2]);
  } else {
    root.style.setProperty("--custom-fg",textColorHex);
  }
  document.body.classList.remove("light-theme");
  document.body.classList.add("custom-theme");
  document.querySelectorAll(".theme-swatch").forEach(s=>s.classList.remove("active"));
}
function hexToHslRaw(hex){
  let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=Math.round(h*60);if(h<0)h+=360;}
  return[h,Math.round(s*100),Math.round(l*100)];
}

let barColorHex="#BB001E", pendingBarColorHex="#BB001E";
const barWheel=initColorWheel("bar-wheel","barHue","barSat","barLit","barHexInput","barColorPreview",
  (h,s,l,hex)=>{
    pendingBarColorHex=hex;
    document.getElementById("barColorPreview").style.background=hex;
    document.getElementById("barHexSwatch").style.background=hex;
    logToConsole(`Bar color picker: ${hex}`,'log');
  },"barHexSwatch",0,100,10,90);
barWheel.setHSL(348,100,37);

document.getElementById("saveBarColor").addEventListener("click",()=>{
  barColorHex=pendingBarColorHex; applyBarColor();
  saveConfig();
  logToConsole(`Bar color saved: ${barColorHex}`,'action');
  showToast("Bar color saved.");
});

document.getElementById("resetBarColor").addEventListener("click",()=>{
  barColorHex="#BB001E"; pendingBarColorHex="#BB001E";
  barWheel.setHSL(348,100,37); applyBarColor();
  saveConfig();
  logToConsole('Bar color reset to default (#BB001E)','action');
  showToast("Bar color reset.");
});

function applyBarColor(){if(!eggs.firedrill) bar.style.background=barColorHex;}

let textColorHex="#ffffff", useAutoText=true;
const textColorWheel=initColorWheel("text-color-wheel","textHue","textSat","textLit","textHexInput","textColorPreview",
  (h,s,l,hex)=>{
    textColorHex=hex;
    document.getElementById("textColorPreview").style.background=hex;
    document.getElementById("textHexSwatch").style.background=hex;
    logToConsole(`Text color picker: ${hex}`,'log');
  },"textHexSwatch",0,100,0,100);
textColorWheel.setHSL(0,0,100);

document.getElementById("saveTextColor").addEventListener("click",()=>{
  useAutoText=false;
  document.documentElement.style.setProperty("--custom-fg",textColorHex);
  document.body.classList.add("custom-theme");
  saveConfig();
  logToConsole(`Text color applied: ${textColorHex}`,'action');
  showToast("Text color applied.");
});

document.getElementById("resetTextColor").addEventListener("click",()=>{
  useAutoText=true; textColorHex="#ffffff";
  textColorWheel.setHSL(0,0,100);
  document.documentElement.style.setProperty("--custom-fg","#ffffff");
  saveConfig();
  logToConsole('Text color reset to default (#ffffff)','action');
  showToast("Text color reset.");
});

document.getElementById("autoTextColor").addEventListener("click",()=>{
  useAutoText=true;
  saveConfig();
  logToConsole('Text color set to automatic','action');
  showToast("Auto: ON");
});

let currentFont="Patrick Hand";
const fontList=document.getElementById("font-list"), fontPreviewInput=document.getElementById("fontPreviewText");
function buildFontList(){
  fontList.innerHTML="";
  const previewText=fontPreviewInput.value||fontPreviewInput.placeholder;
  FONTS.forEach((f,idx)=>{
    const row=document.createElement("div"); row.className="font-opt"+(f===currentFont?" active":"");
    row.style.animationDelay=(idx*0.02)+"s";
    row.innerHTML=`<div class="font-preview" style="font-family:'${f}',cursive">${previewText}</div><div class="font-name">${f}</div>`;
    row.addEventListener("click",()=>{
      const prev=currentFont; currentFont=f;
      document.documentElement.style.setProperty("--font",`'${f}',cursive`);
      document.querySelectorAll(".font-opt").forEach(r=>r.classList.remove("active"));
      row.classList.add("active");
      saveConfig();
      logToConsole(`Font changed: "${prev}" → "${f}"`,'action');
      showToast("Font changed to " + f);
    });
    fontList.appendChild(row);
  });
}
buildFontList();
fontPreviewInput.addEventListener("input",()=>{
  const v=fontPreviewInput.value||fontPreviewInput.placeholder;
  document.querySelectorAll(".font-preview").forEach(el=>el.textContent=v);
  logToConsole(`Font preview text changed: "${v}"`,'log');
});

const settings={nextPeriod:true,warnPulse:true,horn:true,celebration:true,reduceMotion:false,liveTitle:true};
document.getElementById("tog-nextperiod").addEventListener("change",e=>{
  settings.nextPeriod=e.target.checked;
  nextPreview.style.display=settings.nextPeriod?"":"none";
  saveConfig();
  logToConsole(`Toggle "Show next period": ${e.target.checked}`,'action');
});
document.getElementById("tog-warnpulse").addEventListener("change",e=>{
  settings.warnPulse=e.target.checked;
  saveConfig();
  logToConsole(`Toggle "Bar warn pulse": ${e.target.checked}`,'action');
});
document.getElementById("tog-horn").addEventListener("change",e=>{
  settings.horn=e.target.checked;
  saveConfig();
  logToConsole(`Toggle "Sound effects": ${e.target.checked}`,'action');
});
document.getElementById("tog-celebration").addEventListener("change",e=>{
  settings.celebration=e.target.checked;
  if(!settings.celebration) stopCelebration();
  saveConfig();
  logToConsole(`Toggle "End of day celebration": ${e.target.checked}`,'action');
});
document.getElementById("tog-reducemotion").addEventListener("change",e=>{
  settings.reduceMotion=e.target.checked;
  document.body.classList.toggle("reduce-motion",settings.reduceMotion);
  if(settings.reduceMotion){stopCelebration();stopWeekendFireworks();clearInterval(rainInterval);clearInterval(flashLightInterval);clearInterval(ghostInterval);document.querySelectorAll(".balloon,.emoji-drop,.ghost-float").forEach(el=>el.remove());particles=[];confettiPieces=[];lightningBolts=[];}
  saveConfig();
  logToConsole(`Toggle "Reduce motion": ${e.target.checked}`,'action');
  showToast("Reduce Motion: " + (settings.reduceMotion?"ON":"OFF"));
});
document.getElementById("tog-livetitle").addEventListener("change", e => {
  settings.liveTitle = e.target.checked;
  saveConfig();
  logToConsole(`Toggle "Live Tab Title": ${e.target.checked}`, 'action');
  if (GRADE !== null) updateDocumentTitle(getCurrentState(getNow()));
  else updateDocumentTitle(null);
});
document.getElementById("syncTimeBtn").addEventListener("click",()=>{
  logToConsole('Manual time sync triggered','action');
  syncTime(true);
});
timerEl.addEventListener("click",()=>syncTime(true));
let timerHovered=false;
timerEl.addEventListener("mouseenter",()=>{timerHovered=true;});
timerEl.addEventListener("mouseleave",()=>{timerHovered=false;});

let barHoverActive=false, barActualPercent=0;
function getBarTimeAtPercent(pct){
  const now=getNow(),state=getCurrentState(now);
  if(state.msLeft===undefined) return null;
  const totalMs=state.msLeft/Math.max(0.001,(1-state.percent/100));
  const msAtPos=totalMs*(1-pct/100);
  return msAtPos<0?null:formatTime(msAtPos);
}
barContainer.addEventListener("mouseenter",()=>{barHoverActive=true;bar.classList.add("hover-snap");bar.classList.remove("hover-release");});
barContainer.addEventListener("mousemove",e=>{
  if(eggs.firedrill||settings.reduceMotion) return;
  const rect=barContainer.getBoundingClientRect(), x=e.clientX-rect.left;
  const pct=Math.max(0,Math.min(100,(x/rect.width)*100));
  bar.style.width=pct+"%"; barTooltip.style.left=pct+"%";
  const timeStr=getBarTimeAtPercent(pct);
  barTooltip.textContent=timeStr?timeStr:Math.round(pct)+"%";
  barTooltip.classList.add("show");
});
barContainer.addEventListener("mouseleave",()=>{
  barHoverActive=false; barTooltip.classList.remove("show");
  bar.classList.remove("hover-snap"); bar.classList.add("hover-release");
  if(!eggs.firedrill) bar.style.width=barActualPercent+"%";
  setTimeout(()=>bar.classList.remove("hover-release"),400);
});

function updateDocumentTitle(state) {
  if (GRADE === null) {
    document.title = "Choose a Grade | BSMS Countdown";
    return;
  }
  if (!settings.liveTitle) {
    document.title = "BSMS Countdown";
    return;
  }
  if (!state) return;
  
  if (state.isWeekend) {
    document.title = "Weekend | BSMS Countdown";
  } else if (state.isAfterSchool) {
    document.title = "School has ended.";
  } else if (state.key.startsWith("before-school")) {
    document.title = `${state.remainingText} until school starts`;
  } else {
    document.title = `${state.remainingText} left in ${state.label}`;
  }
}

function updateLabel(){
  if(eggs.firedrill) return;
  const now=getNow(),state=getCurrentState(now);
  
  updateDocumentTitle(state);

  currentDisplayKey=state.key;
  const displayLabel=state.label||" ";
  if(displayLabel!==lastPeriod){
    if(!isFirstLoad&&settings.horn) playPartyHorn();
    isFirstLoad=false;
    if(!settings.reduceMotion){
      labelEl.style.transform="translateY(-30px)"; labelEl.style.opacity=0;
      setTimeout(()=>{labelEl.textContent=displayLabel;labelEl.style.transform="translateY(0)";labelEl.style.opacity=1;},300);
    } else {labelEl.textContent=displayLabel;}
    lastPeriod=displayLabel;
    logToConsole(`Period changed to: "${displayLabel}"`,'info');
  }
  if(isTimerHidden(state)){timerEl.style.display="none";}
  else{
    timerEl.style.display="";
    if(timerHovered){const st=getCurrentState(now);timerEl.textContent=st.msLeftRaw!==undefined?formatTimeMs(st.msLeftRaw):st.remainingText;}
    else timerEl.textContent=state.remainingText||"0:00";
  }
  nextPreview.textContent=settings.nextPeriod?(state.nextLabel||""):"";
  const isWarn=state.msLeft!==undefined&&state.msLeft<=WARN_MINUTES*60000&&state.msLeft>0;
  if(settings.warnPulse&&!settings.reduceMotion) barContainer.classList.toggle("warn-pulse",isWarn);
  else barContainer.classList.remove("warn-pulse");
}
function updateBar(){
  if(eggs.firedrill) return;
  const pct=getCurrentState(getNow()).percent; barActualPercent=pct;
  if(!barHoverActive) bar.style.width=pct+"%";
  if(settings.reduceMotion) return;
  overlay.style.transition="none"; overlay.style.width="0%"; overlay.style.opacity=1;
  setTimeout(()=>{overlay.style.transition=`width ${SHIMMER_DURATION/1000}s ease,opacity ${SHIMMER_DURATION/1000}s ease`;overlay.style.width="100%";overlay.style.opacity=0;},50);
}

let eggModeActive=false,eggModeBuffer="",eggModeTimer=null,eggModeCooldown=false;
function enterEggMode(){eggModeActive=true;eggModeBuffer="";updateEggModeIndicator();clearTimeout(eggModeTimer);eggModeTimer=setTimeout(exitEggMode,8000);logToConsole('Egg mode entered (type a code)','log');}
function exitEggMode(){eggModeActive=false;eggModeBuffer="";eggModeIndicator.classList.remove("show");clearTimeout(eggModeTimer);eggModeCooldown=true;setTimeout(()=>eggModeCooldown=false,300);}
function updateEggModeIndicator(){if(!eggModeActive)return;eggModeIndicator.innerHTML=`<span style="opacity:.5">/ </span><span>${eggModeBuffer}</span><span style="opacity:.4;font-size:12px;margin-left:8px;">  type "/" again to exit</span>`;eggModeIndicator.classList.add("show");}

const eggs={party:false,ghost:false,rain:false,flip:false,big:false,rainbow:false,flash:false,firedrill:false};
const EGG_FLAGS={party:FEATURE_EGG_PARTY,ghost:FEATURE_EGG_GHOST,rain:FEATURE_EGG_RAIN,flip:FEATURE_EGG_FLIP,big:FEATURE_EGG_BIG,rainbow:FEATURE_EGG_RAINBOW,flash:FEATURE_EGG_FLASH,firedrill:FEATURE_EGG_FIREDRILL};
let rainInterval=null,flashLightInterval=null,ghostInterval=null,fireDrillSavedLabel="",fireDrillBarInterval=null;

function activateEgg(name){
  name=name.replace(/\s+/g,"-").toLowerCase();
  
  if (celebrationActive) {
    showToast("Easter eggs cannot be started during the End of Day celebration. You can disable the celebration in Settings to enable Easter eggs.");
    return;
  }
  
  if(!EGG_FLAGS[name]){logToConsole(`Egg "${name}" is disabled by feature flag`,'warn');return;}
  if(name==="party"){
    eggs.party=!eggs.party;
    logToConsole(`Easter egg "party" ${eggs.party?'activated':'deactivated'}`,'action');
    if(eggs.party){startCelebration();showToast("Party mode!");}
    else{stopCelebration();showToast("Party stopped.");}
  } else if(name==="ghost"){
    eggs.ghost=!eggs.ghost;
    document.body.classList.toggle("ghost-mode",eggs.ghost);
    logToConsole(`Easter egg "ghost" ${eggs.ghost?'activated':'deactivated'}`,'action');
    if(eggs.ghost){ghostInterval=setInterval(()=>spawnGhost(),2500);spawnGhost();showToast("Ghost mode on.");}
    else{clearInterval(ghostInterval);document.querySelectorAll(".ghost-float").forEach(g=>g.remove());showToast("Ghost mode off.");}
  } else if(name==="rain"){
    eggs.rain=!eggs.rain;
    logToConsole(`Easter egg "rain" ${eggs.rain?'activated':'deactivated'}`,'action');
    if(eggs.rain){rainInterval=setInterval(spawnEmojiDrop,80);ensureAnimating();showToast("Emoji rain!");}
    else{clearInterval(rainInterval);showToast("Rain stopped.");}
  } else if(name==="flip"){
    eggs.flip=!eggs.flip;
    document.body.style.transform=eggs.flip?"scaleY(-1)":"";
    logToConsole(`Easter egg "flip" ${eggs.flip?'activated':'deactivated'}`,'action');
    showToast(eggs.flip?"Upside down!":"Right-side up.");
  } else if(name==="big"){
    eggs.big=!eggs.big;
    timerEl.style.fontSize=eggs.big?"160px":"";
    logToConsole(`Easter egg "big-clock" ${eggs.big?'activated':'deactivated'}`,'action');
    showToast(eggs.big?"Big clock!":"Normal clock.");
  } else if(name==="rainbow"){
    eggs.rainbow=!eggs.rainbow;
    document.body.classList.toggle("rainbow-mode",eggs.rainbow);
    logToConsole(`Easter egg "rainbow" ${eggs.rainbow?'activated':'deactivated'}`,'action');
    showToast(eggs.rainbow?"Rainbow mode!":"Rainbow off.");
  } else if(name==="flash"){
    eggs.flash=!eggs.flash;
    logToConsole(`Easter egg "flash" ${eggs.flash?'activated':'deactivated'}`,'action');
    if(eggs.flash){flashLightInterval=setInterval(()=>{if(Math.random()<.7){createLightningBolt();doScreenFlash();}},600);ensureAnimating();showToast("Lightning storm!");}
    else{clearInterval(flashLightInterval);ltCtx.clearRect(0,0,ltCanvas.width,ltCanvas.height);showToast("Storm passed.");}
  } else if(name==="firedrill"){
    eggs.firedrill=!eggs.firedrill;
    logToConsole(`Easter egg "fire-drill" ${eggs.firedrill?'activated':'deactivated'}`,'action');
    if(eggs.firedrill){
      fireDrillSavedLabel=labelEl.textContent;
      document.body.classList.add("fire-drill-mode");fireDrillOverlay.classList.add("active");
      labelEl.textContent="Fire Drill";timerEl.textContent="X: XX";bar.style.width="100%";bar.style.transition="none";
      if(settings.horn) playFireAlarm();
      fireDrillBarInterval=setInterval(()=>{bar.style.background=bar.style.background.includes("linear")?"#fff":"linear-gradient(90deg,#ff0000,#ff6600,#ffcc00)";},200);
      setInterval(()=>{if(eggs.firedrill){doScreenFlash();if(Math.random()<.3)doShake();if(Math.random()<.4)spawnFireEmoji();}},500);
      ensureAnimating();showToast("FIRE DRILL!");
    } else {
      document.body.classList.remove("fire-drill-mode");fireDrillOverlay.classList.remove("active");
      labelEl.textContent=fireDrillSavedLabel;clearInterval(fireDrillBarInterval);fireDrillBarInterval=null;
      bar.style.transition="";applyBarColor();lastPeriod="";updateLabel();updateBar();showToast("Fire drill ended.");
    }
  }
  refreshEggList();
  document.querySelectorAll(".pill[data-egg]").forEach(p=>p.classList.toggle("active",eggs[p.dataset.egg.replace(/\s+/g,"-").toLowerCase()]));
}

function spawnGhost(){
  if(settings.reduceMotion) return;
  const el=document.createElement("div");el.className="ghost-float";el.textContent="👻";
  const startX=Math.random()*90,startY=10+Math.random()*80;
  el.style.left=startX+"vw";el.style.top=startY+"vh";
  el.style.setProperty("--gx",(Math.random()-.5)*300+"px");
  el.style.setProperty("--gy",(Math.random()-.5)*300+"px");
  el.style.setProperty("--gr",(Math.random()-.5)*720+"deg");
  el.style.animationDuration=(5+Math.random()*5)+"s";
  document.body.appendChild(el);setTimeout(()=>el.remove(),12000);
}

function refreshEggList(){
  const container=document.getElementById("active-eggs-list");
  const icons={party:"🎉",ghost:"👻",rain:"🌧️",flip:"🙃",big:"🕐",rainbow:"🌈",flash:"⚡",firedrill:"🔥"};
  const descs={party:"Start celebration mode early",ghost:"Floating ghost + fade",rain:"Emoji rain",flip:"Turn the world upside down",big:"Giant clock mode",rainbow:"Rainbow everything",flash:"Lightning storm",firedrill:"Fire drill mode"};
  const names={party:"PARTY",ghost:"GHOST",rain:"RAIN",flip:"FLIP",big:"BIG-CLOCK",rainbow:"RAINBOW",flash:"FLASH",firedrill:"FIRE-DRILL"};
  const active=Object.entries(eggs).filter(([,v])=>v).map(([k])=>k);
  if(!active.length){container.innerHTML=`<p style="font-size:16px;color:var(--fg2);margin:0;">No Easter Eggs active. Use the buttons below or type "/" then a code.</p>`;return;}
  container.innerHTML=active.map((k,i)=>
    `<div class="egg-item" style="animation-delay:${i*0.06}s"><div class="egg-icon">${icons[k]}</div><div class="egg-info"><div class="egg-name">${names[k]}</div><div class="egg-hint">${descs[k]}</div></div><button class="modal-btn danger" onclick="activateEgg('${k}')">Deactivate</button></div>`
  ).join("");
}

document.querySelectorAll(".pill[data-egg]").forEach(p=>p.addEventListener("click",()=>activateEgg(p.dataset.egg)));
document.getElementById("resetAllEggs").addEventListener("click",()=>{
  Object.keys(eggs).forEach(k=>{if(eggs[k])activateEgg(k);});
  logToConsole('All Easter eggs deactivated','action');
  showToast("All eggs deactivated.");
});

// ============================================================
// GLOBAL KEYBOARD SHORTCUTS ENGINE
// ============================================================
const EGG_CODES = ["PARTY", "GHOST", "RAIN", "FLIP", "BIG-CLOCK", "RAINBOW", "FLASH", "FIRE-DRILL"];
document.addEventListener("keydown",e => {
  if (listeningForKeybind) {
    e.preventDefault();
    const key = e.key.toLowerCase();
    if (key !== 'escape') {
      keybinds[listeningForKeybind] = key;
      logToConsole(`Rebound ${listeningForKeybind} to ${key}`, 'action');
      saveConfig();
    }
    listeningForKeybind = null;
    renderKeybinds();
    return;
  }

  const inInput = (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
  
  if (inInput && e.key.toLowerCase() === 'enter') {
    if (e.target.id === "testDateInput") { document.getElementById("applyTestDate").click(); e.target.blur(); return; }
    if (e.target.id === "textSizeDisplay") { e.target.blur(); return; }
    if (e.target.id === "primaryHexInput") document.getElementById("applyPrimaryColor").click();
    if (e.target.id === "secondaryHexInput") document.getElementById("applySecondaryColor").click();
    if (e.target.id === "barHexInput") document.getElementById("saveBarColor").click();
    if (e.target.id === "textHexInput") document.getElementById("saveTextColor").click();
    return;
  }

  if (e.key === "Escape") {
    closeControls(); 
    closeScheduleModal(); 
    exitEggMode();
    document.getElementById("restart-confirm-modal").classList.remove("open");
    return;
  }

  if (inInput) return;

  if (e.key.length === 1 && (e.key === "/" || eggModeActive)) {
    if (!eggModeActive) {
      if (e.key === "/" && !eggModeCooldown) { enterEggMode(); return; }
    } else {
      if (e.key === "/") { exitEggMode(); return; }
      eggModeBuffer += e.key.toUpperCase();
      updateEggModeIndicator();
      clearTimeout(eggModeTimer);
      eggModeTimer = setTimeout(exitEggMode, 5000);
      for (const code of EGG_CODES) {
        if (eggModeBuffer.endsWith(code)) {
          logToConsole(`Keyboard code entered: /${code}`, 'action');
          activateEgg(code.toLowerCase());
          exitEggMode();
          break;
        }
      }
      return; 
    }
  }

  if (!FEATURE_KEYBOARD_SHORTCUTS) return;

  const k = e.key.toLowerCase();
  const isControlsOpen = controlsModal.classList.contains("open");
  const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
  const activeSubtab = document.querySelector(".subtab-btn.active")?.dataset.subtab;

  switch (k) {
    case keybinds.cycleThemeText:
      e.preventDefault();
      if (!isControlsOpen) {
        document.getElementById("subtab-theme-btn").click();
        openControls("appearance");
      } else if (activeTab === "appearance") {
        if (activeSubtab === "theme") {
          document.getElementById("subtab-text-btn").click();
        } else if (activeSubtab === "text") {
          closeControls();
        } else {
          document.getElementById("subtab-theme-btn").click();
        }
      } else {
        document.getElementById("subtab-theme-btn").click();
        openControls("appearance");
      }
      break;
    case keybinds.resync:
      e.preventDefault();
      syncTime(true);
      break;
    case keybinds.toggleControls:
      e.preventDefault();
      if (isControlsOpen) {
        closeControls();
      } else {
        const auth = getAuthSession();
        if (auth.loggedIn) openControls("accounts");
        else openControls("appearance");
      }
      break;
    case keybinds.keyboardTab:
      e.preventDefault();
      if (isControlsOpen && activeTab === "keyboard") closeControls();
      else openControls("keyboard");
      break;
    case keybinds.schedule:
      e.preventDefault();
      if (scheduleModal.classList.contains("open")) closeScheduleModal();
      else openScheduleModal();
      break;
    case keybinds.easterEggs:
      e.preventDefault();
      if (isControlsOpen && activeTab === "easter") closeControls();
      else openControls("easter");
      break;
    case keybinds.restart:
    case (keybinds.restart === 'delete' ? 'backspace' : null):
      e.preventDefault();
      document.getElementById("restart-confirm-modal").classList.add("open");
      break;
  }
});

// ============================================================
// AUDIO
// ============================================================
function playPartyHorn(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const t2=ctx.currentTime;[[523.25,0],[659.25,.12],[783.99,.22],[1046.5,.32],[1318.5,.44]].forEach(([freq,when])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type="sawtooth";o.frequency.value=freq;g.gain.setValueAtTime(0,t2+when);g.gain.linearRampToValueAtTime(.3,t2+when+.02);g.gain.linearRampToValueAtTime(0,t2+when+.25);o.start(t2+when);o.stop(t2+when+.3);});setTimeout(()=>ctx.close(),2500);}catch(e){}}
function playFireAlarm(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const t2=ctx.currentTime;for(let i=0;i<15;i++){const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type="square";o.frequency.setValueAtTime(880,t2+i*.15);o.frequency.setValueAtTime(660,t2+i*.15+.075);g.gain.setValueAtTime(.7,t2+i*.15);g.gain.setValueAtTime(0,t2+i*.15+.135);o.start(t2+i*.15);o.stop(t2+i*.15+.15);}setTimeout(()=>ctx.close(),4000);}catch(e){}}

// ============================================================
// VISUAL EFFECTS
// ============================================================
function doScreenFlash(){if(settings.reduceMotion)return;screenFlash.style.opacity=".85";setTimeout(()=>screenFlash.style.opacity="0",80);}
const FLASH_COLORS=["rgba(255,0,100,.2)","rgba(0,220,255,.2)","rgba(255,220,0,.2)","rgba(150,0,255,.2)","rgba(0,255,100,.2)"];
let flashColorIdx=0;
function doColorFlash(){if(settings.reduceMotion)return;colorFlash.style.background=FLASH_COLORS[flashColorIdx++%FLASH_COLORS.length];colorFlash.style.opacity="1";setTimeout(()=>colorFlash.style.opacity="0",110);}
function doShake(){if(settings.reduceMotion)return;document.body.classList.remove("shaking");void document.body.offsetWidth;document.body.classList.add("shaking");setTimeout(()=>document.body.classList.remove("shaking"),500);}
function spawnBalloon(){if(settings.reduceMotion)return;const el=document.createElement("div");el.className="balloon";el.textContent="🎈";el.style.left=Math.random()*96+"vw";el.style.fontSize=(38+Math.random()*40)+"px";const dur=4+Math.random()*4;el.style.animationDuration=dur+"s";document.body.appendChild(el);setTimeout(()=>el.remove(),(dur+.5)*1000);}
function spawnCelebrationEmoji(){if(settings.reduceMotion)return;const el=document.createElement("div");el.className="emoji-drop";el.textContent=CELEBRATION_EMOJIS[Math.floor(Math.random()*CELEBRATION_EMOJIS.length)];el.style.left=Math.random()*96+"vw";el.style.fontSize=(22+Math.random()*30)+"px";const dur=2.5+Math.random()*3;el.style.animationDuration=dur+"s";document.body.appendChild(el);setTimeout(()=>el.remove(),(dur+.3)*1000);}
function spawnEmojiDrop(){if(settings.reduceMotion)return;const el=document.createElement("div");el.className="emoji-drop";el.textContent=CELEBRATION_EMOJIS[Math.floor(Math.random()*CELEBRATION_EMOJIS.length)];el.style.left=Math.random()*96+"vw";el.style.fontSize=(22+Math.random()*30)+"px";const dur=2.5+Math.random()*3;el.style.animationDuration=dur+"s";document.body.appendChild(el);setTimeout(()=>el.remove(),(dur+.3)*1000);}
function spawnFireEmoji(){if(settings.reduceMotion)return;const el=document.createElement("div");el.className="emoji-drop";el.textContent="🔥";el.style.left=Math.random()*96+"vw";el.style.fontSize=(30+Math.random()*40)+"px";const dur=1.5+Math.random()*2;el.style.animationDuration=dur+"s";document.body.appendChild(el);setTimeout(()=>el.remove(),(dur+.3)*1000);}

// ============================================================
// CONFETTI
// ============================================================
const confettiCanvas=document.getElementById("confetti-canvas"),confettiCtx=confettiCanvas.getContext("2d");
let confettiPieces=[];
function resizeConfetti(){confettiCanvas.width=window.innerWidth;confettiCanvas.height=window.innerHeight;}
window.addEventListener("resize",resizeConfetti);resizeConfetti();
const CONFETTI_COLORS=["#FF4B4B","#FFD700","#00E5FF","#FF69B4","#7CFC00","#FF8C00","#FF1493","#00BFFF","#FFFFFF","#BB001E","#DA70D6","#ADFF2F"];
function spawnConfettiBurst(count=50){if(settings.reduceMotion)return;for(let i=0;i<count;i++)confettiPieces.push({x:Math.random()*confettiCanvas.width,y:-10,vx:(Math.random()-.5)*8,vy:3+Math.random()*6,rot:Math.random()*360,rotV:(Math.random()-.5)*12,w:8+Math.random()*12,h:4+Math.random()*8,color:CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)],trail:[]});}
function updateConfetti(){confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);confettiPieces=confettiPieces.filter(p=>p.y<confettiCanvas.height+20);confettiPieces.forEach(p=>{p.trail.push({x:p.x,y:p.y});if(p.trail.length>6)p.trail.shift();p.x+=p.vx;p.y+=p.vy;p.rot+=p.rotV;p.vx+=(Math.random()-.5)*.4;confettiCtx.save();confettiCtx.translate(p.x,p.y);confettiCtx.rotate(p.rot*Math.PI/180);confettiCtx.fillStyle=p.color;confettiCtx.fillRect(-p.w/2,-p.h/2,p.w,p.h);confettiCtx.restore();});}

// ============================================================
// FIREWORKS
// ============================================================
const fwCanvas=document.getElementById("fireworks"),fwCtx=fwCanvas.getContext("2d");
let particles=[];
function resizeFireworks(){fwCanvas.width=window.innerWidth;fwCanvas.height=window.innerHeight;}
window.addEventListener("resize",resizeFireworks);resizeFireworks();
function launchFirework(x,y){if(settings.reduceMotion)return;if(x===undefined)x=.05*window.innerWidth+Math.random()*.9*window.innerWidth;if(y===undefined)y=.05*window.innerHeight+Math.random()*.6*window.innerHeight;const hue=Math.random()*360,count=80+Math.floor(Math.random()*80);for(let i=0;i<count;i++){const angle=(Math.PI*2/count)*i,speed=3+Math.random()*7;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,alpha:1,color:`hsl(${hue+Math.random()*50-25},100%,${55+Math.random()*20}%)`,radius:2+Math.random()*3,trail:[]});}}
function updateFireworks(){fwCtx.clearRect(0,0,fwCanvas.width,fwCanvas.height);particles=particles.filter(p=>p.alpha>.02);particles.forEach(p=>{p.trail.push({x:p.x,y:p.y});if(p.trail.length>6)p.trail.shift();p.x+=p.vx;p.y+=p.vy;p.vy+=.09;p.vx*=.97;p.vy*=.97;p.alpha-=.016;for(let i=0;i<p.trail.length;i++){const a=(i/p.trail.length)*p.alpha*.4;fwCtx.beginPath();fwCtx.arc(p.trail[i].x,p.trail[i].y,p.radius*.5,0,Math.PI*2);fwCtx.fillStyle=p.color.replace(")",","+a+")").replace("hsl","hsla");fwCtx.fill();}fwCtx.globalAlpha=p.alpha;fwCtx.beginPath();fwCtx.arc(p.x,p.y,p.radius,0,Math.PI*2);fwCtx.fillStyle=p.color;fwCtx.fill();fwCtx.globalAlpha=1;});}

// ============================================================
// LIGHTNING
// ============================================================
const ltCanvas=document.getElementById("lightning-canvas"),ltCtx=ltCanvas.getContext("2d");
let lightningBolts=[];
function resizeLightning(){ltCanvas.width=window.innerWidth;ltCanvas.height=window.innerHeight;}
window.addEventListener("resize",resizeLightning);resizeLightning();
function createLightningBolt(){if(settings.reduceMotion)return;const x=Math.random()*window.innerWidth,points=[{x,y:0}];let cx=x,cy=0;while(cy<window.innerHeight){cx+=(Math.random()-.5)*120;cy+=40+Math.random()*60;points.push({x:cx,y:cy});}const hues=[200,180,280,60,0];lightningBolts.push({points,alpha:1,color:`hsl(${hues[Math.floor(Math.random()*hues.length)]},100%,80%)`,width:1+Math.random()*3});}
function updateLightning(){ltCtx.clearRect(0,0,ltCanvas.width,ltCanvas.height);lightningBolts=lightningBolts.filter(b=>b.alpha>.05);lightningBolts.forEach(b=>{b.alpha-=.06;ltCtx.globalAlpha=b.alpha;ltCtx.strokeStyle=b.color;ltCtx.lineWidth=b.width;ltCtx.shadowColor=b.color;ltCtx.shadowBlur=12;ltCtx.beginPath();ltCtx.moveTo(b.points[0].x,b.points[0].y);b.points.slice(1).forEach(p=>ltCtx.lineTo(p.x,p.y));ltCtx.stroke();ltCtx.shadowBlur=0;ltCtx.globalAlpha=1;});}

// ============================================================
// CELEBRATION
// ============================================================
let celebrationActive=false,animFrameRunning=false;
let fireworkInterval=null,balloonInterval=null,emojiInterval=null,colorFlashInterval=null,lightningInterval=null,shakeInterval=null,confettiInterval=null;
let weekendFwTimeout=null;
function isCelebrationTime(now){const d=now.getDay();if(d===0||d===6)return false;const tot=now.getHours()*60+now.getMinutes();return tot>=(CELEBRATION_START_H*60+CELEBRATION_START_M)&&tot<(CELEBRATION_END_H*60+CELEBRATION_END_M);}
function animationFrame(){
  const needsRunning=celebrationActive||eggs.flash||eggs.rain||eggs.firedrill||particles.length>0||confettiPieces.length>0||lightningBolts.length>0;
  if(!needsRunning){animFrameRunning=false;return;}
  updateFireworks();updateConfetti();updateLightning();
  if(eggs.firedrill&&Math.random()<.2) spawnFireEmoji();
  requestAnimationFrame(animationFrame);
}
function ensureAnimating(){if(settings.reduceMotion)return;if(!animFrameRunning){animFrameRunning=true;requestAnimationFrame(animationFrame);}}
function startCelebration(){
  if(celebrationActive||settings.reduceMotion) return; celebrationActive=true;
  logToConsole('Celebration started!','info');
  document.body.classList.add("party");doScreenFlash();doShake();ensureAnimating();
  fireworkInterval=setInterval(()=>{launchFirework();if(Math.random()<.6)launchFirework();if(Math.random()<.3)launchFirework();},800);
  spawnConfettiBurst(100);confettiInterval=setInterval(()=>{if(celebrationActive)spawnConfettiBurst(40);},1200);
  balloonInterval=setInterval(()=>{if(celebrationActive){spawnBalloon();if(Math.random()<.5)spawnBalloon();}},700);
  emojiInterval=setInterval(()=>{if(celebrationActive){spawnCelebrationEmoji();if(Math.random()<.4)spawnCelebrationEmoji();}},300);
  lightningInterval=setInterval(()=>{if(celebrationActive&&Math.random()<.5){createLightningBolt();doScreenFlash();}},1500);
  colorFlashInterval=setInterval(()=>{if(celebrationActive)doColorFlash();},400);
  shakeInterval=setInterval(()=>{if(celebrationActive&&Math.random()<.4)doShake();},5000);
}
function stopCelebration(){
  if(!celebrationActive) return; celebrationActive=false;
  logToConsole('Celebration stopped','info');
  document.body.classList.remove("party");
  clearInterval(fireworkInterval);clearInterval(balloonInterval);clearInterval(emojiInterval);clearInterval(colorFlashInterval);clearInterval(lightningInterval);clearInterval(shakeInterval);clearInterval(confettiInterval);
  particles=[];confettiPieces=[];lightningBolts=[];
  fwCtx.clearRect(0,0,fwCanvas.width,fwCanvas.height);confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);ltCtx.clearRect(0,0,ltCanvas.width,ltCanvas.height);
  colorFlash.style.opacity="0";
}
function scheduleWeekendFirework(){if(settings.reduceMotion){weekendFwTimeout=null;return;}if(!isWeekendNow()){weekendFwTimeout=null;return;}launchFirework();if(Math.random()<.35)launchFirework();ensureAnimating();weekendFwTimeout=setTimeout(scheduleWeekendFirework,5000+Math.random()*5000);}
function startWeekendFireworks(){if(!weekendFwTimeout&&!settings.reduceMotion)weekendFwTimeout=setTimeout(scheduleWeekendFirework,1500);}
function stopWeekendFireworks(){clearTimeout(weekendFwTimeout);weekendFwTimeout=null;}
function checkCelebration(){
  if(GRADE === null) return;
  if(isWeekendNow()){stopCelebration();startWeekendFireworks();}
  else{stopWeekendFireworks();if(!settings.celebration){stopCelebration();return;}if(isCelebrationTime(getNow()))startCelebration();else stopCelebration();}
}

// ============================================================
// CONSOLE TAB
// ============================================================
let consoleLogging=true;
const consoleLogEl=document.getElementById('console-log');
let consoleEntries=[], consoleAutoScroll=true;
consoleLogEl.addEventListener('scroll',()=>{
  const atBottom=consoleLogEl.scrollHeight-consoleLogEl.scrollTop-consoleLogEl.clientHeight<30;
  consoleAutoScroll=atBottom;
});
function logToConsole(message,type='log'){
  if(!consoleLogging) return;
  const now=new Date();
  const timestamp=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const entry={timestamp,type,message:typeof message==='object'?JSON.stringify(message,null,2):String(message)};
  consoleEntries.push(entry); if(consoleEntries.length>500) consoleEntries.shift();
  appendConsoleEntry(entry);
  if(consoleAutoScroll) consoleLogEl.scrollTop=consoleLogEl.scrollHeight;
}
function appendConsoleEntry(entry){
  const div=document.createElement('div'); div.className='console-entry';
  div.innerHTML=`<span class="console-timestamp">[${entry.timestamp}]</span><span class="console-type ${entry.type}">${entry.type.toUpperCase()}:</span><span class="console-message">${entry.message.replace(/</g,'&lt;')}</span>`;
  consoleLogEl.appendChild(div);
}
function clearConsole(){consoleLogEl.innerHTML='';consoleEntries=[];}
function toggleLoggingFn(){
  consoleLogging=!consoleLogging;
  document.getElementById('toggleLogging').textContent=consoleLogging?"Pause":"Resume";
  document.getElementById('toggleLogging').classList.toggle('active-btn',!consoleLogging);
  logToConsole('Console logging '+(consoleLogging?'resumed':'paused'),'info');
}
function exportConsole(){
  const text=consoleEntries.map(e=>`[${e.timestamp}] ${e.type.toUpperCase()}: ${e.message}`).join('\n');
  const blob=new Blob([text],{type:'text/plain'}), url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`console-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  logToConsole('Console exported','info');
}
function refreshConsoleTab(){
  consoleLogEl.innerHTML=''; consoleEntries.forEach(e=>appendConsoleEntry(e));
  consoleLogEl.scrollTop=consoleLogEl.scrollHeight;
}
document.getElementById('clearConsole').addEventListener('click',()=>{clearConsole();logToConsole('Console cleared','info');});
document.getElementById('toggleLogging').addEventListener('click',toggleLoggingFn);
document.getElementById('exportConsole').addEventListener('click',exportConsole);
document.getElementById('scrollBottomConsole').addEventListener('click',()=>{consoleLogEl.scrollTop=consoleLogEl.scrollHeight;consoleAutoScroll=true;});
document.getElementById('applyTestDate').addEventListener('click',()=>{
  const val=document.getElementById('testDateInput').value.trim();
  if(!val){showToast("Enter a date/time first.");return;}
  const ok=setTestDateTime(val); if(!ok) showToast("Invalid format. Use MM/DD/YYYY HH:MM:SS AM/PM");
});
document.getElementById('clearTestDate').addEventListener('click',()=>{document.getElementById('testDateInput').value="";clearTestDateTime();});
document.getElementById('testDateInput').addEventListener('input',e=>{logToConsole(`Test date input: "${e.target.value}"`,'log');});
const _clog=console.log,_cerr=console.error,_cwarn=console.warn,_cinfo=console.info;
console.log=function(...args){_clog.apply(console,args);logToConsole(args.map(a=>typeof a==='object'?JSON.stringify(a):a).join(' '),'log');};
console.error=function(...args){_cerr.apply(console,args);logToConsole(args.map(a=>typeof a==='object'?JSON.stringify(a):a).join(' '),'error');};
console.warn=function(...args){_cwarn.apply(console,args);logToConsole(args.map(a=>typeof a==='object'?JSON.stringify(a):a).join(' '),'warn');};
console.info=function(...args){_cinfo.apply(console,args);logToConsole(args.map(a=>typeof a==='object'?JSON.stringify(a):a).join(' '),'info');};

// ============================================================
// LOCAL STORAGE PERSISTENCE (RESTORE LOGIC)
// ============================================================
function loadConfig() {
  try {
    const raw = localStorage.getItem("bsms_countdown_prefs");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) {
    console.error("Failed to load config", e);
    return null;
  }
}

function applySavedConfig(saved) {
  if (saved.settings) {
    Object.assign(settings, saved.settings);
    document.getElementById("tog-nextperiod").checked = settings.nextPeriod;
    document.getElementById("tog-warnpulse").checked = settings.warnPulse;
    document.getElementById("tog-horn").checked = settings.horn;
    document.getElementById("tog-celebration").checked = settings.celebration;
    document.getElementById("tog-reducemotion").checked = settings.reduceMotion;
    
    if (saved.settings.liveTitle !== undefined) {
      document.getElementById("tog-livetitle").checked = settings.liveTitle;
    } else {
      document.getElementById("tog-livetitle").checked = true;
      settings.liveTitle = true;
    }

    document.body.classList.toggle("reduce-motion", settings.reduceMotion);
    nextPreview.style.display = settings.nextPeriod ? "" : "none";
  }

  if (saved.keybinds) {
    Object.assign(keybinds, saved.keybinds);
    renderKeybinds();
  }

  if (saved.currentTextScale) {
    applyTextSize(saved.currentTextScale);
  }

  if (saved.currentFont) {
    currentFont = saved.currentFont;
    document.documentElement.style.setProperty("--font", `'${currentFont}', cursive`);
    buildFontList();
  }

  if (saved.periodNames) {
    Object.assign(sessionLabelOverrides, saved.periodNames);
  }

  if (saved.primaryHex) {
    primaryHex = saved.primaryHex;
    if (typeof primaryWheel !== "undefined") {
      const hsl = hexToHslRaw(primaryHex);
      primaryWheel.setHSL(hsl[0], hsl[1], hsl[2]);
    }
    const phi = document.getElementById("primaryHexInput");
    if (phi) phi.value = primaryHex;
    const pcp = document.getElementById("primaryColorPreview");
    if (pcp) pcp.style.background = primaryHex;
    const phs = document.getElementById("primaryHexSwatch");
    if (phs) phs.style.background = primaryHex;
  }
  if (saved.secondaryHex) {
    secondaryHex = saved.secondaryHex;
    if (typeof secondaryWheel !== "undefined") {
      const hsl = hexToHslRaw(secondaryHex);
      secondaryWheel.setHSL(hsl[0], hsl[1], hsl[2]);
    }
    const shi = document.getElementById("secondaryHexInput");
    if (shi) shi.value = secondaryHex;
    const scp = document.getElementById("secondaryColorPreview");
    if (scp) scp.style.background = secondaryHex;
    const shs = document.getElementById("secondaryHexSwatch");
    if (shs) shs.style.background = secondaryHex;
  }
  if (saved.barColorHex) {
    barColorHex = saved.barColorHex;
    pendingBarColorHex = saved.barColorHex;
    if (typeof barWheel !== "undefined") {
      const hsl = hexToHslRaw(barColorHex);
      barWheel.setHSL(hsl[0], hsl[1], hsl[2]);
    }
    const bhi = document.getElementById("barHexInput");
    if (bhi) bhi.value = barColorHex;
    const bcp = document.getElementById("barColorPreview");
    if (bcp) bcp.style.background = barColorHex;
    const bhs = document.getElementById("barHexSwatch");
    if (bhs) bhs.style.background = barColorHex;
    applyBarColor();
  }

  useAutoText = saved.useAutoText !== false;
  if (saved.textColorHex) {
    textColorHex = saved.textColorHex;
    if (typeof textColorWheel !== "undefined") {
      const hsl = hexToHslRaw(textColorHex);
      textColorWheel.setHSL(hsl[0], hsl[1], hsl[2]);
    }
    const thi = document.getElementById("textHexInput");
    if (thi) thi.value = textColorHex;
    const tcp = document.getElementById("textColorPreview");
    if (tcp) tcp.style.background = textColorHex;
    const ths = document.getElementById("textHexSwatch");
    if (ths) ths.style.background = textColorHex;
  }

  // Set the theme, CSS transitions will handle the smooth fade natively
  if (saved.themeClass) {
    applyTheme(saved.themeClass);
  } else if (saved.isCustom) {
    applyThemeColors(primaryHex, secondaryHex);
  } else {
    applyTheme(""); 
  }

  if (!useAutoText) {
    document.documentElement.style.setProperty("--custom-fg", textColorHex);
  } else {
    if (!saved.isCustom) {
      document.documentElement.style.setProperty("--custom-fg", saved.themeClass === "light-theme" ? "#18100a" : "#fff");
    }
  }
}

// ============================================================
// PREFERENCE SYNC & AUTHENTICATION
// ============================================================
let isApplyingConfig = false;

function getAuthSession() {
  try {
    return JSON.parse(localStorage.getItem('bsms_auth_session')) || {};
  } catch(e) { return {}; }
}

let currentUid = null;

function syncAuthSession() {
  const auth = getAuthSession();
  const btn = document.getElementById("controls-btn");
  
  if (auth.loggedIn && auth.uid) {
    const avatarUrl = auth.avatar || auth.pfp || '';
    
    btn.innerHTML = '';
    const headerImg = document.createElement('img');
    headerImg.className = 'header-avatar';
    headerImg.alt = 'Avatar';
    headerImg.onerror = function() {
      this.src = "data:image/svg+xml;utf8,<svg viewBox='0 0 24 24' width='28' height='28' stroke='currentColor' stroke-width='2' fill='none'><circle cx='12' cy='8' r='5'/><path d='M3 21v-2a7 7 0 0 1 14 0v2'/></svg>";
    };
    headerImg.src = avatarUrl;
    btn.appendChild(headerImg);
    
    const accImg = document.getElementById("account-avatar-img");
    accImg.style.display = ""; 
    accImg.src = avatarUrl;

    document.getElementById("account-display-name").textContent = auth.displayName || 'User';
    document.getElementById("account-username-text").textContent = '@' + (auth.username || 'username');

    if (currentUid !== auth.uid) {
      currentUid = auth.uid;
      
      const localSettings = localStorage.getItem("bsms_countdown_prefs");
      if (localSettings) {
        apiFetch('/api/account', { method: 'PUT', body: JSON.stringify({ countdown_preferences: JSON.parse(localSettings) }) })
          .catch(e => console.error("[BSMS Web :: API] Failed to sync local preferences to cloud", e));
        localStorage.removeItem("bsms_countdown_prefs");
      }

      apiFetch('/api/account').then(data => {
        if (data && data.profile && data.profile.countdown_preferences) {
          isApplyingConfig = true;
          applySavedConfig(data.profile.countdown_preferences);
          isApplyingConfig = false;
        }
      }).catch(e => console.warn("[BSMS Web :: API] Failed to fetch cloud preferences", e));
    }
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    if (currentUid) {
      currentUid = null;
    }
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === 'bsms_auth_session') {
    syncAuthSession();
  }
});

function saveConfig() {
  if (isApplyingConfig) return;
  const conf = {
    settings: settings,
    keybinds: keybinds,
    currentTextScale: currentTextScale,
    currentFont: currentFont,
    periodNames: sessionLabelOverrides,
    primaryHex: primaryHex,
    secondaryHex: secondaryHex,
    barColorHex: barColorHex,
    textColorHex: textColorHex,
    useAutoText: useAutoText,
    themeClass: document.body.classList.contains("light-theme") ? "light-theme" : "",
    isCustom: document.body.classList.contains("custom-theme")
  };
  
  const auth = getAuthSession();
  if (auth.loggedIn && auth.uid) {
    apiFetch('/api/account', { method: 'PUT', body: JSON.stringify({ countdown_preferences: conf }) })
      .catch(e => console.error("[BSMS Web :: API] Failed to save cloud preferences", e));
  } else {
    localStorage.setItem("bsms_countdown_prefs", JSON.stringify(conf));
  }
}

// ============================================================
// BOOT
// ============================================================
pendingConfig = loadConfig();
const initialAuth = getAuthSession();

if (initialAuth.loggedIn && initialAuth.uid) {
  // Sync up logic handled inside syncAuthSession() which fetches right away
} else {
  if (pendingConfig) {
    isApplyingConfig = true;
    applySavedConfig(pendingConfig);
    isApplyingConfig = false;
  } else {
    applyBarColor();
    applyTheme("");
  }
}

syncAuthSession();

logToConsole("BSMS Countdown booted","info");

checkRouting();

setInterval(()=>{
  if (GRADE !== null) {
    updateLabel();
    checkCelebration();
  }
}, 100);

setInterval(()=>{
  if (GRADE !== null) updateBar();
}, SHIMMER_CYCLE);
