/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Playtime stats panel for the Game Vault. Reads the data collected by
// /js/playtime.js and renders the summary, daily chart and per-game totals.
(() => {
  "use strict";

  const playtime = window.BSMSPlaytime;
  const button = document.getElementById("gameStatsBtn");
  const modal = document.getElementById("gameStatsModal");
  if (!playtime || !button || !modal) return;

  const el = {
    close: document.getElementById("gameStatsClose"),
    sub: document.getElementById("statsSub"),
    total: document.getElementById("statsTotalTime"),
    week: document.getElementById("statsWeekTime"),
    today: document.getElementById("statsTodayTime"),
    games: document.getElementById("statsGameCount"),
    ranges: document.getElementById("statsRanges"),
    gameSelect: document.getElementById("statsGameSelect"),
    peak: document.getElementById("statsChartPeak"),
    chart: document.getElementById("statsChart"),
    list: document.getElementById("statsList")
  };

  const RANGES = [
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 }
  ];

  let rangeIndex = 1;
  let selectedGame = "";

  const fmt = playtime.formatDuration;
  const dayKey = playtime.dayKey;

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function rangeDays(days) {
    const out = [];
    const end = startOfToday();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      out.push({ key: dayKey(d), date: d });
    }
    return out;
  }

  function dayMs(days, key, gameId) {
    const day = days[key];
    if (!day || typeof day !== "object") return 0;
    if (gameId) return Number(day.games && day.games[gameId]) || 0;
    return Number(day.total) || 0;
  }

  function sumDays(days, keys, gameId) {
    return keys.reduce((total, key) => total + dayMs(days, key, gameId), 0);
  }

  function relativeDate(timestamp) {
    if (!timestamp) return "never";
    const today = startOfToday().getTime();
    const then = new Date(timestamp);
    then.setHours(0, 0, 0, 0);
    const days = Math.round((today - then.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    return then.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: then.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    });
  }

  function buildRangeButtons() {
    el.ranges.replaceChildren();
    RANGES.forEach((range, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "stats-range" + (index === rangeIndex ? " active" : "");
      item.textContent = range.label;
      item.addEventListener("click", () => {
        rangeIndex = index;
        [...el.ranges.children].forEach((child, childIndex) => {
          child.classList.toggle("active", childIndex === index);
        });
        render();
      });
      el.ranges.append(item);
    });
  }

  function buildGameOptions(games) {
    const previous = selectedGame;
    el.gameSelect.replaceChildren();

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All games";
    el.gameSelect.append(all);

    games.forEach(game => {
      const option = document.createElement("option");
      option.value = game.id;
      option.textContent = game.name;
      el.gameSelect.append(option);
    });

    if (previous && games.some(game => game.id === previous)) {
      el.gameSelect.value = previous;
      selectedGame = previous;
    } else {
      el.gameSelect.value = "";
      selectedGame = "";
    }
  }

  function renderChart(days, data, peak) {
    el.chart.replaceChildren();
    el.peak.textContent = peak > 0 ? "Peak: " + fmt(peak) + " in one day" : "";

    if (peak <= 0) {
      const empty = document.createElement("div");
      empty.className = "stats-empty";
      empty.textContent = "No play time in this period yet.";
      el.chart.append(empty);
      return;
    }

    const labelEvery = Math.max(1, Math.ceil(days.length / 8));
    days.forEach((day, index) => {
      const value = dayMs(data, day.key, selectedGame);
      const column = document.createElement("div");
      column.className = "stats-bar";
      column.title = day.date.toLocaleDateString(undefined, {
        weekday: "short", month: "short", day: "numeric"
      }) + " · " + fmt(value);

      const fill = document.createElement("div");
      fill.className = "stats-bar-fill";
      fill.style.height = value > 0 ? Math.max(4, (value / peak) * 100) + "%" : "0%";
      column.append(fill);

      if (index % labelEvery === 0 || index === days.length - 1) {
        const label = document.createElement("span");
        label.className = "stats-bar-label";
        label.textContent = day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        column.append(label);
      }

      el.chart.append(column);
    });
  }

  function renderList(games, data, days) {
    el.list.replaceChildren();

    const rows = games
      .map(game => ({ ...game, inRange: sumDays(data, days.map(day => day.key), game.id) }))
      .filter(game => game.total > 0 || game.inRange > 0)
      .sort((a, b) => b.inRange - a.inRange || b.total - a.total);

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "stats-empty";
      empty.textContent = "No games played yet. Launch a game from the vault and your play time will show up here.";
      el.list.append(empty);
      return;
    }

    const top = Math.max(...rows.map(row => row.inRange), 1);

    rows.forEach(game => {
      const row = document.createElement("div");
      row.className = "stats-game" + (game.id === selectedGame ? " is-selected" : "");

      const head = document.createElement("div");
      head.className = "stats-game-head";

      const name = document.createElement("span");
      name.className = "stats-game-name";
      name.textContent = game.name;

      const time = document.createElement("span");
      time.className = "stats-game-time";
      time.textContent = fmt(game.inRange);

      head.append(name, time);

      const meta = document.createElement("span");
      meta.className = "stats-game-meta";
      meta.textContent = "Lifetime " + fmt(game.total) + " · " +
        game.plays + (game.plays === 1 ? " session" : " sessions") +
        " · last played " + relativeDate(game.last);

      const bar = document.createElement("div");
      bar.className = "stats-game-bar";
      const fill = document.createElement("span");
      fill.style.width = (game.inRange / top) * 100 + "%";
      bar.append(fill);

      row.append(head, meta, bar);
      row.addEventListener("click", () => {
        selectedGame = game.id;
        el.gameSelect.value = game.id;
        render();
      });
      el.list.append(row);
    });
  }

  function render() {
    playtime.flush();

    const stats = playtime.getStats();
    const games = stats.games.slice().sort((a, b) => b.total - a.total);
    const data = stats.days || {};
    const days = rangeDays(RANGES[rangeIndex].days);

    const lifetime = games.reduce((total, game) => total + game.total, 0);
    const week = sumDays(data, rangeDays(7).map(day => day.key), "");
    const today = dayMs(data, dayKey(new Date()), "");

    el.total.textContent = fmt(lifetime);
    el.week.textContent = fmt(week);
    el.today.textContent = fmt(today);
    el.games.textContent = String(games.filter(game => game.total > 0).length);

    if (el.sub) {
      el.sub.textContent = playtime.isSignedIn()
        ? "Synced with your BSMS Web account and shown across your devices."
        : "Tracked on this device. Sign in to sync your play time across devices.";
    }

    buildGameOptions(games);

    const values = days.map(day => dayMs(data, day.key, selectedGame));
    renderChart(days, data, Math.max(0, ...values));
    renderList(games, data, days);
  }

  async function open() {
    modal.classList.add("show");
    playtime.flush();
    render();
    if (el.close) el.close.focus();

    if (playtime.isSignedIn()) {
      const stats = await playtime.sync();
      if (stats && modal.classList.contains("show")) render();
    }
  }

  function close() {
    modal.classList.remove("show");
    button.focus();
  }

  buildRangeButtons();
  button.addEventListener("click", open);
  if (el.close) el.close.addEventListener("click", close);
  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });
  el.gameSelect.addEventListener("change", () => {
    selectedGame = el.gameSelect.value;
    render();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.classList.contains("show")) close();
  });
})();
