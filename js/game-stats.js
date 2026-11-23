/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Playtime stats panel for the Game Vault.
(() => {
  "use strict";

  const playtime = window.BSMSPlaytime;
  const button = document.getElementById("gameStatsBtn");
  const modal = document.getElementById("gameStatsModal");
  if (!playtime || !button || !modal) return;

  const el = {
    close: document.getElementById("gameStatsClose"),
    title: document.getElementById("gameStatsTitle"),
    login: document.getElementById("statsLoginRequired"),
    sub: document.getElementById("statsSub"),
    total: document.getElementById("statsTotalTime"),
    week: document.getElementById("statsWeekTime"),
    today: document.getElementById("statsTodayTime"),
    games: document.getElementById("statsGameCount"),
    gameSelect: document.getElementById("statsGameSelect"),
    peak: document.getElementById("statsChartPeak"),
    chart: document.getElementById("statsChart"),
    calendar: document.getElementById("statsCalendar"),
    list: document.getElementById("statsList"),
    cards: document.querySelector(".stats-cards"),
    controls: document.querySelector(".stats-controls"),
    chartBlock: document.querySelector(".stats-chart-block"),
    calendarBlock: document.querySelector(".stats-calendar-block"),
    sectionTitle: document.querySelector(".stats-section-title")
  };

  let selectedGame = "";
  let catalogById = new Map();
  const fmt = playtime.formatDuration;
  const dayKey = playtime.dayKey;

  fetch("/data/55gms-games.json", { cache: "force-cache" })
    .then(response => response.ok ? response.json() : [])
    .then(games => {
      if (!Array.isArray(games)) return;
      catalogById = new Map(games.filter(game => game && game.id).map(game => [String(game.id), game]));
      if (modal.classList.contains("show") && playtime.isSignedIn()) render();
    })
    .catch(error => console.warn("[BSMS Web :: Game Stats] Could not load game thumbnails", error));

  function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function rangeDays(days) {
    const output = [];
    const end = startOfToday();
    for (let index = days - 1; index >= 0; index--) {
      const date = new Date(end);
      date.setDate(date.getDate() - index);
      output.push({ key: dayKey(date), date });
    }
    return output;
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
    if (!timestamp) return "Never";
    const today = startOfToday().getTime();
    const then = new Date(timestamp);
    then.setHours(0, 0, 0, 0);
    const difference = Math.round((today - then.getTime()) / 86400000);
    if (difference <= 0) return "Today";
    if (difference === 1) return "Yesterday";
    if (difference < 7) return difference + " days ago";
    return then.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: then.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    });
  }

  function cdnImage(value) {
    const image = String(value || "");
    if (!/^https:\/\/raw\.githubusercontent\.com\/55gms\/(?:55GMS|assets)\//i.test(image)) return "";
    return image.replace(
      /^https:\/\/raw\.githubusercontent\.com\/55gms\/(55GMS|assets)\/([^/]+)\/(.+)$/i,
      "https://cdn.jsdelivr.net/gh/55gms/$1@$2/$3"
    );
  }

  function renderChart(days, data) {
    el.chart.replaceChildren();
    const values = days.map(day => dayMs(data, day.key, selectedGame));
    const peak = Math.max(0, ...values);
    el.peak.textContent = peak > 0 ? "Peak day · " + fmt(peak) : "Last 7 days";
    if (peak <= 0) {
      const empty = document.createElement("div");
      empty.className = "stats-empty";
      empty.textContent = "No play time in the last 7 days.";
      el.chart.append(empty);
      return;
    }

    days.forEach((day, index) => {
      const value = values[index];
      const column = document.createElement("div");
      column.className = "stats-bar";
      const dateLabel = day.date.toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric"
      });
      column.title = dateLabel + " · " + fmt(value);
      column.setAttribute("aria-label", dateLabel + ": " + fmt(value));

      const track = document.createElement("div");
      track.className = "stats-bar-track";
      const fill = document.createElement("div");
      fill.className = "stats-bar-fill";
      fill.style.height = value > 0 ? Math.max(4, (value / peak) * 100) + "%" : "0%";
      track.append(fill);
      column.append(track);

      const label = document.createElement("span");
      label.className = "stats-bar-label";
      label.textContent = day.date.toLocaleDateString(undefined, { weekday: "short" });
      column.append(label);
      el.chart.append(column);
    });
  }

  function renderCalendar(data) {
    el.calendar.replaceChildren();
    const today = startOfToday();
    const first = new Date(today);
    first.setDate(first.getDate() - 364);
    first.setDate(first.getDate() - first.getDay());

    const weeks = document.createElement("div");
    weeks.className = "stats-calendar-weeks";
    const values = [];
    const cursor = new Date(first);
    for (let index = 0; index < 371; index++) {
      const key = dayKey(cursor);
      values.push({ key, date: new Date(cursor), value: dayMs(data, key, selectedGame) });
      cursor.setDate(cursor.getDate() + 1);
    }
    const peak = Math.max(0, ...values.map(day => day.value));
    const monthLabels = document.createElement("div");
    monthLabels.className = "stats-calendar-months";
    let lastMonth = "";
    values.forEach((day, index) => {
      if (day.date.getDate() === 1 || index === 0) {
        const label = document.createElement("span");
        label.textContent = day.date.toLocaleDateString(undefined, { month: "short" });
        label.style.gridColumn = String(Math.floor(index / 7) + 1);
        monthLabels.append(label);
        lastMonth = day.date.getMonth() + "-" + day.date.getFullYear();
      }
    });
    weeks.append(monthLabels);

    const body = document.createElement("div");
    body.className = "stats-calendar-body";
    const weekdays = document.createElement("div");
    weekdays.className = "stats-calendar-weekdays";
    ["", "Mon", "", "Wed", "", "Fri", ""].forEach(label => {
      const item = document.createElement("span");
      item.textContent = label;
      weekdays.append(item);
    });
    body.append(weekdays);

    const grid = document.createElement("div");
    grid.className = "stats-calendar-grid";
    values.forEach(day => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "stats-calendar-dot";
      dot.dataset.level = day.value <= 0 || peak <= 0 ? "0" :
        day.value / peak >= .75 ? "1" :
        day.value / peak >= .5 ? "2" :
        day.value / peak >= .25 ? "3" : "4";
      const dateLabel = day.date.toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric", year: "numeric"
      });
      const tooltip = dateLabel + " · " + fmt(day.value);
      dot.title = tooltip;
      dot.setAttribute("aria-label", tooltip);
      dot.addEventListener("click", () => {
        const wasPinned = dot.classList.contains("is-pinned");
        el.calendar.querySelectorAll(".is-pinned").forEach(item => item.classList.remove("is-pinned"));
        if (!wasPinned) dot.classList.add("is-pinned");
      });
      dot.addEventListener("blur", () => dot.classList.remove("is-pinned"));
      grid.append(dot);
    });
    body.append(grid);
    weeks.append(body);
    el.calendar.append(weeks);

    const legend = document.createElement("div");
    legend.className = "stats-calendar-legend";
    legend.innerHTML = '<span>Less</span><i data-level="4"></i><i data-level="3"></i><i data-level="2"></i><i data-level="1"></i><span>More</span>';
    el.calendar.append(legend);
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
    selectedGame = previous && games.some(game => game.id === previous) ? previous : "";
    el.gameSelect.value = selectedGame;
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

      const image = document.createElement("img");
      image.className = "stats-game-thumb";
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      const catalogGame = catalogById.get(game.id);
      const thumbnail = cdnImage(catalogGame && catalogGame.image);
      if (thumbnail) {
        image.src = thumbnail;
        image.onerror = () => image.classList.add("is-missing");
      } else {
        image.classList.add("is-missing");
      }

      const content = document.createElement("div");
      content.className = "stats-game-content";
      const head = document.createElement("div");
      head.className = "stats-game-head";
      const name = document.createElement("span");
      name.className = "stats-game-name";
      name.textContent = game.name;
      const time = document.createElement("span");
      time.className = "stats-game-time";
      time.textContent = fmt(game.inRange);
      head.append(name, time);

      const meta = document.createElement("div");
      meta.className = "stats-game-badges";
      [
        ["Lifetime", fmt(game.total)],
        [game.plays === 1 ? "Session" : "Sessions", String(game.plays)],
        ["Last played", relativeDate(game.last)]
      ].forEach(([label, value]) => {
        const badge = document.createElement("span");
        badge.className = "stats-game-badge";
        const strong = document.createElement("strong");
        strong.textContent = value;
        const caption = document.createElement("small");
        caption.textContent = label;
        badge.append(strong, caption);
        meta.append(badge);
      });

      const bar = document.createElement("div");
      bar.className = "stats-game-bar";
      const fill = document.createElement("span");
      fill.style.width = (game.inRange / top) * 100 + "%";
      bar.append(fill);

      content.append(head, meta, bar);
      row.append(image, content);
      row.addEventListener("click", () => {
        selectedGame = game.id;
        el.gameSelect.value = game.id;
        render();
      });
      el.list.append(row);
    });
  }

  function render() {
    const signedIn = playtime.isSignedIn();
    if (el.login) el.login.hidden = signedIn;
    [el.cards, el.controls, el.chartBlock, el.calendarBlock, el.sectionTitle, el.list].forEach(node => {
      if (node) node.hidden = !signedIn;
    });
    if (el.title) el.title.textContent = signedIn ? "Your playtime" : "Sign in to track playtime";
    if (el.sub) el.sub.textContent = signedIn
      ? "Your Game Vault activity, collected across your devices."
      : "Playtime statistics are available to signed-in BSMS Web accounts.";
    if (!signedIn) return;

    playtime.flush();
    const stats = playtime.getStats();
    const games = stats.games.slice().sort((a, b) => b.total - a.total);
    const data = stats.days || {};
    const days = rangeDays(7);
    const lifetime = games.reduce((total, game) => total + game.total, 0);
    const week = sumDays(data, days.map(day => day.key), "");
    const today = dayMs(data, dayKey(new Date()), "");

    el.total.textContent = fmt(lifetime);
    el.week.textContent = fmt(week);
    el.today.textContent = fmt(today);
    el.games.textContent = String(games.filter(game => game.total > 0).length);
    buildGameOptions(games);
    renderChart(days, data);
    renderCalendar(data);
    renderList(games, data, days);
  }

  async function open() {
    modal.classList.add("show");
    render();
    if (!playtime.isSignedIn()) {
      if (el.close) el.close.focus();
      return;
    }
    playtime.flush();
    if (el.close) el.close.focus();
    const stats = await playtime.sync();
    if (stats && modal.classList.contains("show")) render();
  }

  function close() {
    modal.classList.remove("show");
    button.focus();
  }

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
