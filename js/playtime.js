/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Tracks game playtime for signed-in accounts only. Account snapshots from every
// device are combined by the BSMS Web API.
(() => {
  "use strict";

  const STORAGE_PREFIX = "bsms_playtime_v1:";
  const DEVICE_KEY = "bsms_stats_device_v1";
  const API_URL = "/api/games/stats";
  const TICK_MS = 5000;
  const FLUSH_MS = 15000;
  const MAX_GAP_MS = 5 * 60 * 1000;
  const SYNC_DELAY_MS = 5000;

  let active = null;
  let pending = 0;
  let ticker = null;
  let lastFlush = 0;
  let syncTimer = null;
  let syncPromise = null;
  let accountStats = null;
  let accountUid = "";

  function safeId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function authSession() {
    let auth = null;
    try { auth = JSON.parse(localStorage.getItem("bsms_auth_session") || "null"); } catch {}
    if (!auth || auth.loggedIn !== true || !auth.uid) return null;
    let sid = "";
    try { sid = localStorage.getItem("session_id") || ""; } catch {}
    if (!sid) return null;
    return { uid: String(auth.uid).trim().slice(0, 128), sid: String(sid) };
  }

  function identity() {
    const auth = authSession();
    if (auth) return "u_" + safeId(auth.uid);
    let sid = "";
    try { sid = localStorage.getItem("session_id") || ""; } catch {}
    return "d_" + (safeId(sid) || "local");
  }

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (id && /^[a-zA-Z0-9_-]{8,64}$/.test(id)) return id;
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = "dv" + Array.from(bytes, byte => byte.toString(36).padStart(2, "0")).join("").slice(0, 40);
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      return "";
    }
  }

  function storageKey(who) {
    return STORAGE_PREFIX + (who || identity());
  }

  function emptyStore() {
    return { v: 1, games: {}, days: {} };
  }

  function load(who) {
    try {
      const raw = localStorage.getItem(storageKey(who));
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyStore();
      if (!parsed.games || typeof parsed.games !== "object" || Array.isArray(parsed.games)) parsed.games = {};
      if (!parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) parsed.days = {};
      parsed.v = 1;
      return parsed;
    } catch {
      return emptyStore();
    }
  }

  function save(store, who) {
    try {
      localStorage.setItem(storageKey(who), JSON.stringify(store));
    } catch (error) {
      console.warn("[BSMS Web :: Playtime] Could not save play time", error);
    }
  }

  function dayKey(date) {
    const d = date || new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function addTime(store, game, ms, when) {
    if (!(ms > 0)) return;

    const entry = store.games[game.id] || { name: game.name || game.id, total: 0, plays: 0, last: 0 };
    entry.name = game.name || entry.name || game.id;
    entry.total = (number(entry.total)) + ms;
    entry.last = Math.max(number(entry.last), when);
    store.games[game.id] = entry;

    const key = dayKey(new Date(when));
    const day = store.days[key] || { total: 0, games: {} };
    day.total = number(day.total) + ms;
    day.games[game.id] = number(day.games[game.id]) + ms;
    store.days[key] = day;
  }

  // Absolute per-device snapshot. The account API combines every device's
  // complete history; no arbitrary day-window truncation is applied.
  function snapshot() {
    const store = load(identity());
    const days = {};
    for (const [key, day] of Object.entries(store.days)) {
      if (day && typeof day === "object") days[key] = { games: day.games || {} };
    }
    return { games: store.games, days };
  }

  async function runSync(auth, options) {
    if (accountUid !== auth.uid) {
      accountStats = null;
      accountUid = auth.uid;
    }

    const device = deviceId();
    if (!device) return null;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": auth.sid,
          "X-UID": auth.uid,
          "X-Device-ID": device
        },
        body: JSON.stringify({ action: "syncStats", stats: snapshot() }),
        cache: "no-store",
        keepalive: !!(options && options.keepalive)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Play time sync failed.");
      if (accountUid !== auth.uid) return null;
      if (data.stats) accountStats = data.stats;
      return accountStats;
    } catch (error) {
      console.warn("[BSMS Web :: Playtime] Account sync failed", error);
      return null;
    }
  }

  function sync(options) {
    const auth = authSession();
    if (!auth) {
      accountStats = null;
      accountUid = "";
      return Promise.resolve(null);
    }
    if (syncPromise) return syncPromise;
    syncPromise = runSync(auth, options).finally(() => { syncPromise = null; });
    return syncPromise;
  }

  function scheduleSync() {
    if (!authSession()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      sync();
    }, SYNC_DELAY_MS);
  }

  function start(game) {
    if (!game || !game.id) return;
    stop();
    if (!authSession()) return;

    const who = identity();
    const id = safeId(game.id);
    if (!id) return;

    const store = load(who);
    const name = String(game.name || id);
    const entry = store.games[id] || { name, total: 0, plays: 0, last: 0 };
    entry.name = name;
    entry.plays = number(entry.plays) + 1;
    entry.last = Date.now();
    store.games[id] = entry;
    save(store, who);

    active = { who, id, name, last: Date.now(), running: true };
    pending = 0;
    lastFlush = Date.now();
    startTicker();
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(tick, TICK_MS);
  }

  function stopTicker() {
    if (!ticker) return;
    clearInterval(ticker);
    ticker = null;
  }

  function tick() {
    if (!active || !active.running) return;
    const now = Date.now();
    const delta = now - active.last;
    active.last = now;
    if (delta > 0 && delta <= MAX_GAP_MS) pending += delta;
    if (now - lastFlush >= FLUSH_MS) flush();
  }

  function flush() {
    if (!active) return;

    const now = Date.now();
    const delta = now - active.last;
    active.last = now;
    if (delta > 0 && delta <= MAX_GAP_MS) pending += delta;
    lastFlush = now;

    if (pending < 1000) return;

    const store = load(active.who);
    addTime(store, { id: active.id, name: active.name }, pending, now);
    save(store, active.who);
    pending = 0;
    scheduleSync();
  }

  function pause() {
    if (!active || !active.running) return;
    flush();
    active.running = false;
    stopTicker();
  }

  function resume() {
    if (!active || active.running) return;
    active.running = true;
    active.last = Date.now();
    startTicker();
  }

  function stop() {
    if (!active) return;
    flush();
    active = null;
    pending = 0;
    stopTicker();
  }

  function toStatsObject(games, days) {
    return {
      games: Object.entries(games && typeof games === "object" ? games : {}).map(([id, game]) => ({
        id,
        name: String((game && game.name) || id),
        total: number(game && game.total),
        plays: number(game && game.plays),
        last: number(game && game.last)
      })),
      days: days && typeof days === "object" ? days : {}
    };
  }

  function getStats() {
    const auth = authSession();
    if (!auth) return toStatsObject({}, {});
    if (accountUid === auth.uid && accountStats) {
      return toStatsObject(accountStats.games, accountStats.days);
    }
    const store = load(identity());
    return toStatsObject(store.games, store.days);
  }

  function formatDuration(ms) {
    const totalMinutes = Math.floor(number(ms) / 60000);
    if (totalMinutes < 1) return "0m";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return minutes + "m";
    if (!minutes) return hours + "h";
    return hours + "h " + minutes + "m";
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pause();
    else resume();
  });
  addEventListener("pagehide", () => {
    pause();
    sync({ keepalive: true });
  });
  addEventListener("pageshow", event => { if (event.persisted) resume(); });

  window.BSMSPlaytime = {
    start, stop, pause, resume, flush, sync, getStats,
    formatDuration, dayKey, identity,
    isSignedIn: () => !!authSession()
  };
})();
