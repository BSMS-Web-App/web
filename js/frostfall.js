/*
 * BSMS Web — Frostfall
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * A five-chapter low-poly winter adventure. The world is drawn with a tiny
 * local WebGL renderer (js/frostfall-engine.js); everything else — story,
 * battles, level-ups and saving — lives here. No dependencies, no build step.
 */
(function () {
  'use strict';

  /* The event window is the same everywhere the event appears. */
  var START = Date.parse('2026-11-19T05:00:00.000Z'); // Nov 19, 2026, 12:00 AM EST
  var END = Date.parse('2027-01-05T04:59:00.000Z');   // Jan 4, 2027, 11:59 PM EST (exclusive)
  var SAVE_KEY = 'frostfall_save_v1';
  var MUTE_KEY = 'frostfall_muted_v1';

  var params = new URLSearchParams(location.search);
  var DEBUG = params.has('debug');
  var clock = Date.now;
  var fakeNow = params.get('now');
  if (fakeNow) {
    var fakeMs = Date.parse(fakeNow);
    if (isFinite(fakeMs)) clock = function () { return fakeMs; };
  }

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var rgb = function (hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; };

  var app = $('ff-app');
  var stage = $('ff-stage');
  var canvas = $('ff-canvas');
  var snowCanvas = $('ff-snow');
  var snowCtx = snowCanvas.getContext('2d');

  var ui = {
    hud: $('ff-hud'), face: $('ff-hud-face'), hudName: $('ff-hud-name'), hudLevel: $('ff-hud-level'),
    hudChapter: $('ff-hud-chapter'), hudHp: $('ff-hud-hp'), hudHpText: $('ff-hud-hp-text'),
    hudSp: $('ff-hud-sp'), hudSpText: $('ff-hud-sp-text'), hudBp: $('ff-hud-bp'), hudShards: $('ff-hud-shards'),
    hudBpBar: $('ff-hud-bp-fill'), hudBpText: $('ff-hud-bp-text'),
    sound: $('ff-sound'), menuButton: $('ff-menu-button'),
    objective: $('ff-objective'), objectiveText: $('ff-objective-text'),
    toast: $('ff-toast'), prompt: $('ff-prompt'), promptText: $('ff-prompt-text'),
    dialogue: $('ff-dialogue'), speaker: $('ff-speaker'), dialogueText: $('ff-dialogue-text'), dialogueNext: $('ff-dialogue-next'),
    touch: $('ff-touch'), joystick: $('ff-joystick'), stick: $('ff-stick'), action: $('ff-action'),
    loading: $('ff-loading'), loadFill: $('ff-load-fill'), loadingNote: $('ff-loading-note'),
    title: $('ff-title'), continueButton: $('ff-continue'), newGame: $('ff-new-game'), titleNote: $('ff-title-note'),
    nameScreen: $('ff-name-screen'), nameInput: $('ff-name-input'), nameStart: $('ff-name-start'),
    chapterScreen: $('ff-chapter-screen'), chapterEyebrow: $('ff-chapter-eyebrow'), chapterTitle: $('ff-chapter-title'),
    chapterSub: $('ff-chapter-sub'), chapterLines: $('ff-chapter-lines'), chapterBegin: $('ff-chapter-begin'),
    battle: $('ff-battle'), enemyName: $('ff-enemy-name'), enemyHp: $('ff-enemy-hp'), enemyHpText: $('ff-enemy-hp-text'),
    battleLog: $('ff-battle-log'), battleLevel: $('ff-battle-level'), battleHp: $('ff-battle-hp'), battleSp: $('ff-battle-sp'),
    battleHpBar: $('ff-battle-hp-bar'), battleSpBar: $('ff-battle-sp-bar'), actions: $('ff-actions'),
    battleBp: $('ff-battle-bp'), battleBpBar: $('ff-battle-bp-bar'), enemyPlate: $('ff-enemy-plate'),
    cocoa: $('ff-cocoa-count'), skills: $('ff-skills'), battleHint: $('ff-battle-hint'),
    timing: $('ff-timing'), timingLabel: $('ff-timing-label'), timingMarker: $('ff-timing-marker'),
    timingButton: $('ff-timing-button'), timingNote: $('ff-timing-note'), telegraph: $('ff-telegraph'),
    cards: $('ff-cards'), cardBudget: $('ff-card-budget'),
    slash: $('ff-slash'), fx: $('ff-fx'), rating: $('ff-rating'), gimmick: $('ff-gimmick'), flash: $('ff-flash'),
    levelup: $('ff-levelup'), levelSub: $('ff-level-sub'), lvHp: $('ff-lv-hp'), lvSp: $('ff-lv-sp'), lvBp: $('ff-lv-bp'),
    menu: $('ff-menu'), menuClose: $('ff-menu-close'), menuName: $('ff-menu-name'), menuLevel: $('ff-menu-level'),
    menuHp: $('ff-menu-hp'), menuSp: $('ff-menu-sp'), menuBp: $('ff-menu-bp'), menuShards: $('ff-menu-shards'),
    menuObjective: $('ff-menu-objective'), menuResume: $('ff-menu-resume'), menuRestart: $('ff-menu-restart'), menuReset: $('ff-menu-reset'),
    ending: $('ff-ending'), endingLines: $('ff-ending-lines'), endingStats: $('ff-ending-stats'), endingAgain: $('ff-ending-again'),
    ended: $('ff-ended'), fallback: $('ff-fallback'),
    cutscene: $('ff-cutscene'), cutSpeaker: $('ff-cut-speaker'), cutText: $('ff-cut-text'),
    cutFace: $('ff-cut-face'), cutNext: $('ff-cut-next'), cutSkip: $('ff-cut-skip')
  };

  var FF = window.FFEngine;
  var mat = FF ? FF.mat : null;
  var renderer = null;
  if (FF) {
    try { renderer = FF.createRenderer(canvas); } catch (error) { renderer = null; }
  }

  /* ------------------------------------------------------------------ save */
  function freshSave() {
    return {
      v: 1, name: 'NICO', started: false, ending: false,
      chapter: 0, level: 1, xp: 0,
      maxHp: 30, hp: 30, maxSp: 10, sp: 10, bp: 4,
      cocoa: 2, shards: 0, cards: [], seenIntro: false, defeated: {}, talked: {}
    };
  }

  function normalizeSave(value) {
    var base = freshSave();
    if (!value || typeof value !== 'object') return base;
    var out = base;
    out.name = String(value.name || base.name).toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 12) || base.name;
    out.started = Boolean(value.started);
    out.ending = Boolean(value.ending);
    out.chapter = clamp(Math.floor(Number(value.chapter) || 0), 0, 4);
    out.level = clamp(Math.floor(Number(value.level) || 1), 1, 30);
    out.xp = clamp(Math.floor(Number(value.xp) || 0), 0, 100000);
    out.maxHp = clamp(Math.floor(Number(value.maxHp) || base.maxHp), 1, 999);
    out.maxSp = clamp(Math.floor(Number(value.maxSp) || base.maxSp), 1, 999);
    out.hp = clamp(Math.floor(value.hp === undefined ? out.maxHp : Number(value.hp)), 1, out.maxHp);
    out.sp = clamp(Math.floor(value.sp === undefined ? out.maxSp : Number(value.sp)), 0, out.maxSp);
    out.bp = clamp(Math.floor(Number(value.bp) || base.bp), 1, 999);
    out.cocoa = clamp(Math.floor(Number(value.cocoa) || 0), 0, 9);
    out.shards = clamp(Math.floor(Number(value.shards) || 0), 0, 5);
    out.seenIntro = Boolean(value.seenIntro);
    out.cards = Array.isArray(value.cards) ? value.cards.filter(function (id) { return typeof id === 'string'; }).slice(0, 8) : [];
    ['defeated', 'talked'].forEach(function (key) {
      if (value[key] && typeof value[key] === 'object') {
        Object.keys(value[key]).forEach(function (id) {
          if (value[key][id]) out[key][id] = true;
        });
      }
    });
    return out;
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1) return null;
      return normalizeSave(parsed);
    } catch (error) { return null; }
  }

  function persist() {
    if (!save) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (error) { /* storage may be blocked */ }
  }

  /* ----------------------------------------------------------------- state */
  var save = loadSave();
  var mode = 'loading';
  var view = 'title';
  var phase = 'active';
  var world = null;
  var player = null;
  var pip = null;
  var camera = { yaw: 0.26, pitch: 0.46, dist: 16, ortho: 15, punch: 0, eye: [0, 8, 18], target: [0, 1.2, 0] };
  var keys = Object.create(null);
  var touchMove = { x: 0, y: 0 };
  var battle = null;
  var battleObjects = [];
  var battlePlayer = null;
  var battleEnemy = null;
  var levelQueue = 0;
  var battleSelect = 0;
  var freezeUntil = 0;
  var punchTimer = null;
  var titleObjects = [];
  var titleGeometries = [];
  var titleHero = null;
  var pipTrail = [];
  var pipTimer = 0;
  var nearestItem = null;
  var dragging = false;
  var dragDistance = 0;
  var dragX = 0;
  var dragY = 0;
  var joystickId = null;
  var muted = false;
  var audio = null;
  var lastFrame = 0;
  var toastTimer = null;
  var shakeTimer = null;
  var snowFlakes = [];
  var dialogue = { lines: [], index: 0, speaker: '', onDone: null };
  var PARTY = { max: 4, active: [{ id: 'player', name: 'PLAYER' }], leader: 'player', ready: 0 };
  /* The opening shot stands in front of the ROADTOWN archway (the sign board
     faces +z at z=7.6), so the cast waits between the lens and the sign: the
     sign reads behind them instead of sitting in front of the camera. */
  var CUTSCENE_MARKS = [[-2.4, 10.5], [2.35, 10.45], [0.15, 10.95]];
  var CUTSCENE_ORTHO = 21.5;
  var cutscene = {
    active: false, index: 0, t: 0, lines: [], star: null, shard: null,
    crack: null, shards: [], shardsOn: false, speaker: null, lineT: 0,
    typing: false, full: '', shown: 0, lastCount: -1, pitch: 1
  };

  var SWING_TIME = 0.3;
  var SKILLS = [
    { id: 'icicle', name: 'ICICLE', cost: 3, level: 1, mult: 1.8, desc: 'A spear of ice. Heavy damage.' },
    { id: 'warmth', name: 'WARMTH', cost: 4, level: 2, heal: true, desc: 'Melt the cold. Restore HP.' },
    { id: 'starfall', name: 'STARFALL', cost: 7, level: 4, mult: 2.7, desc: 'Call the star down. Huge damage.' }
  ];

  /* ---------------------------------------------------------------- actors */
  function makeActor(kind) {
    return { x: 0, y: 0, z: 0, yaw: 0, scale: 1, baseY: 0, kind: kind || 'actor', hidden: false, parts: [], walk: 0, phase: Math.random() * 6 };
  }

  function addPart(actor, color, pivot, offset, size, opts) {
    opts = opts || {};
    var part = {
      obj: { geo: opts.geo || 'cube', color: rgb(color), alpha: opts.alpha === undefined ? 1 : opts.alpha, model: null, hidden: false },
      pivot: pivot, offset: offset, size: size,
      rx: opts.rx || 0, ry: opts.ry || 0, rz: opts.rz || 0
    };
    actor.parts.push(part);
    return part;
  }

  function updateActor(actor) {
    var squashY = actor.scale * (actor.squashY === undefined ? 1 : actor.squashY);
    var squashXZ = actor.scale * (actor.squashX === undefined ? 1 : actor.squashX);
    var root = mat.mul(
      mat.translation(actor.x, actor.y, actor.z),
      mat.mul(
        mat.rotY(actor.yaw),
        mat.mul(mat.rotX(actor.tiltX || 0), mat.mul(mat.rotZ(actor.lean || 0), mat.scaling(squashXZ, squashY, squashXZ)))
      )
    );
    for (var i = 0; i < actor.parts.length; i++) {
      var part = actor.parts[i];
      var rotation = mat.mul(mat.mul(mat.rotY(part.ry), mat.rotX(part.rx)), mat.rotZ(part.rz));
      var local = mat.mul(
        mat.mul(mat.translation(part.pivot[0], part.pivot[1], part.pivot[2]), rotation),
        mat.mul(mat.translation(part.offset[0], part.offset[1], part.offset[2]), mat.scaling(part.size[0], part.size[1], part.size[2]))
      );
      part.obj.model = mat.mul(root, local);
      part.obj.hidden = actor.hidden;
    }
  }

  function pushActor(list, actor) {
    for (var i = 0; i < actor.parts.length; i++) list.push(actor.parts[i].obj);
  }

  function addActor(actor) {
    if (!world) return actor;
    pushActor(world.objects, actor);
    world.actors.push(actor);
    updateActor(actor);
    return actor;
  }

  /* Classic R6 proportions: one big square head, a blocky torso and four
     limbs swinging from shoulder and hip pivots. Squash, tilt and lean live
     on the root (see updateActor) so a walk reads as a bouncy toy. */
  function buildHero(palette) {
    var pal = palette || heroPalette();
    var actor = makeActor('player');
    var hat = pal.hat || 'beanie';
    var trim = pal.trim === undefined ? pal.scarf : pal.trim;
    var belt = pal.belt === undefined ? 0x2b2036 : pal.belt;

    actor.legL = addPart(actor, pal.pants, [-0.24, 0.88, 0], [0, -0.44, 0], [0.40, 0.88, 0.44]);
    actor.legR = addPart(actor, pal.pants, [0.24, 0.88, 0], [0, -0.44, 0], [0.40, 0.88, 0.44]);
    actor.shoeL = addPart(actor, pal.shoe, [-0.24, 0.88, 0], [0, -0.84, 0.08], [0.44, 0.20, 0.56]);
    actor.shoeR = addPart(actor, pal.shoe, [0.24, 0.88, 0], [0, -0.84, 0.08], [0.44, 0.20, 0.56]);

    addPart(actor, pal.coat, [0, 1.34, 0], [0, 0, 0], [0.96, 1.02, 0.56]);
    addPart(actor, trim, [0, 1.34, 0.29], [0, 0, 0], [0.26, 0.94, 0.06]);
    addPart(actor, belt, [0, 0.88, 0], [0, 0, 0], [1.02, 0.16, 0.60]);
    addPart(actor, pal.scarf, [0, 1.80, 0], [0, 0, 0], [0.86, 0.22, 0.70]);
    addPart(actor, pal.scarf, [0, 1.66, 0.30], [-0.34, 0, 0], [0.22, 0.50, 0.12], { rz: 0.18 });
    addPart(actor, pal.scarf, [0, 1.66, 0.30], [0.34, 0, 0], [0.22, 0.40, 0.12], { rz: -0.24 });

    actor.armL = addPart(actor, pal.coat, [-0.62, 1.74, 0], [0, -0.34, 0], [0.32, 0.86, 0.36]);
    actor.armR = addPart(actor, pal.coat, [0.62, 1.74, 0], [0, -0.34, 0], [0.32, 0.86, 0.36]);
    addPart(actor, pal.skin, [-0.62, 1.74, 0], [0, -0.66, 0.02], [0.32, 0.24, 0.38]);
    addPart(actor, pal.skin, [0.62, 1.74, 0], [0, -0.66, 0.02], [0.32, 0.24, 0.38]);

    /* head, then the classic two eyes and smile */
    addPart(actor, pal.skin, [0, 1.94, 0], [0, 0.40, 0], [0.88, 0.88, 0.84]);
    addPart(actor, 0xffffff, [0, 1.94, 0], [-0.20, 0.46, 0.43], [0.20, 0.22, 0.05]);
    addPart(actor, 0xffffff, [0, 1.94, 0], [0.20, 0.46, 0.43], [0.20, 0.22, 0.05]);
    addPart(actor, 0x1a1224, [0, 1.94, 0], [-0.18, 0.44, 0.46], [0.11, 0.14, 0.04]);
    addPart(actor, 0x1a1224, [0, 1.94, 0], [0.18, 0.44, 0.46], [0.11, 0.14, 0.04]);
    addPart(actor, 0x1a1224, [0, 1.94, 0], [-0.14, 0.26, 0.44], [0.14, 0.06, 0.03], { rz: -0.38 });
    addPart(actor, 0x1a1224, [0, 1.94, 0], [0.14, 0.26, 0.44], [0.14, 0.06, 0.03], { rz: 0.38 });
    addPart(actor, pal.hair, [0, 1.94, 0], [0, 0.62, 0.16], [0.58, 0.26, 0.50]);

    if (hat === 'pom') {
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.74, 0], [0.94, 0.28, 0.90]);
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.60, 0], [0.98, 0.14, 0.94]);
      addPart(actor, 0xfff3d5, [0, 1.94, 0], [0, 0.96, 0], [0.26, 0.26, 0.26]);
    } else if (hat === 'tophat') {
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.86, 0], [0.64, 0.52, 0.62]);
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.66, 0], [1.02, 0.12, 0.98]);
      addPart(actor, pal.scarf, [0, 1.94, 0], [0, 0.70, 0], [0.68, 0.10, 0.66]);
    } else if (hat === 'cap') {
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.76, 0], [0.92, 0.26, 0.90]);
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.66, 0.46], [0.84, 0.10, 0.30]);
    } else if (hat === 'bun') {
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.80, -0.10], [0.94, 0.22, 0.86]);
      addPart(actor, pal.hair, [0, 1.94, 0], [0, 0.66, -0.50], [0.42, 0.42, 0.34]);
    } else if (hat === 'crown') {
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.82, 0], [0.90, 0.16, 0.86]);
      addPart(actor, pal.cap, [0, 1.94, 0], [-0.28, 1.00, 0], [0.14, 0.40, 0.14], { geo: 'cone4' });
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 1.06, 0], [0.16, 0.52, 0.16], { geo: 'cone4' });
      addPart(actor, pal.cap, [0, 1.94, 0], [0.28, 1.00, 0], [0.14, 0.40, 0.14], { geo: 'cone4' });
    } else {
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.76, 0], [0.92, 0.28, 0.88]);
      addPart(actor, pal.cap, [0, 1.94, 0], [0, 0.62, 0], [0.96, 0.14, 0.92]);
    }
    if (pal.goggles) {
      addPart(actor, pal.goggles, [0, 1.94, 0], [0, 0.62, 0.40], [0.90, 0.16, 0.14]);
      addPart(actor, pal.goggles, [0, 1.94, 0], [-0.22, 0.62, 0.46], [0.26, 0.26, 0.10]);
      addPart(actor, pal.goggles, [0, 1.94, 0], [0.22, 0.62, 0.46], [0.26, 0.26, 0.10]);
    }
    return actor;
  }

  function heroPalette() {
    return { coat: 0x3a63b8, pants: 0x243a6e, scarf: 0xe03f36, cap: 0xe03f36, skin: 0xf6c9a0, hair: 0x6b432c, shoe: 0x3a2418, hat: 'pom', belt: 0x2b2036 };
  }

  var PALETTES = {
    bram: { coat: 0x4a6b8a, pants: 0x2c3550, scarf: 0x9a4436, cap: 0x2b2633, skin: 0xe7b78e, hair: 0x8a8070, shoe: 0x3a2418, hat: 'tophat', goggles: 0x9a4436 },
    juniper: { coat: 0x3d7a56, pants: 0x2c4638, scarf: 0xd7a03c, cap: 0x2f5d46, skin: 0xd9a276, hair: 0x6b3f2a, shoe: 0x3a2418, hat: 'beanie' },
    finn: { coat: 0x6a5a3e, pants: 0x3d3428, scarf: 0x4d6e8a, cap: 0x3c3024, skin: 0xd8a87e, hair: 0xcfcfcf, shoe: 0x3a2418, hat: 'cap' },
    odette: { coat: 0x5b3f78, pants: 0x352345, scarf: 0xc7a1e0, cap: 0x472f5c, skin: 0xe8c19c, hair: 0x2f2038, shoe: 0x3a2418, hat: 'bun' },
    aurora: { coat: 0xbdefff, pants: 0x7fc7e0, scarf: 0xffffff, cap: 0x9fe6ff, skin: 0xf7e7ff, hair: 0xffffff, shoe: 0x8fdcf5, hat: 'crown' }
  };

  function buildPip() {
    var actor = makeActor('pip');
    actor.scale = 0.9;
    addPart(actor, 0xf6fbff, [0, 0.42, 0], [0, 0, 0], [0.66, 0.5, 0.6]);
    addPart(actor, 0xf6fbff, [0, 0.88, 0], [0, 0.16, 0], [0.52, 0.46, 0.48]);
    addPart(actor, 0x1a1224, [0, 1.02, 0.22], [-0.11, 0, 0], [0.09, 0.1, 0.05]);
    addPart(actor, 0x1a1224, [0, 1.02, 0.22], [0.11, 0, 0], [0.09, 0.1, 0.05]);
    addPart(actor, 0xff8a2b, [0, 0.98, 0.28], [0, -0.02, 0], [0.08, 0.08, 0.22]);
    addPart(actor, 0x2e8bc0, [0, 0.78, 0], [0, 0, 0], [0.5, 0.12, 0.52]);
    addPart(actor, 0x6fb7d8, [0, 0.72, 0.28], [0, -0.2, 0], [0.14, 0.34, 0.06]);
    addPart(actor, 0x6fb7d8, [0, 0.72, -0.28], [0, -0.2, 0], [0.14, 0.34, 0.06]);
    addPart(actor, 0x8a5a32, [0, 0.76, 0], [-0.42, 0.1, 0], [0.06, 0.5, 0.06], { rz: 0.9 });
    addPart(actor, 0x8a5a32, [0, 0.76, 0], [0.42, 0.1, 0], [0.06, 0.5, 0.06], { rz: -0.9 });
    addPart(actor, 0x2e8bc0, [0, 1.16, 0], [0, 0.06, 0], [0.4, 0.14, 0.4]);
    addPart(actor, 0x2e8bc0, [0, 1.28, 0], [0, 0.08, 0], [0.12, 0.24, 0.12]);
    return actor;
  }

  /* Blocky, toy-like enemies: chunky pieces, a big readable head, glowing
     eyes with a soft halo, and a silhouette you can name at a glance. */
  function glowEyes(actor, color, y, z, spread, size) {
    var s = size || 0.16;
    addPart(actor, color, [0, 0, 0], [-spread, y, z], [s, s * 1.2, 0.06]);
    addPart(actor, color, [0, 0, 0], [spread, y, z], [s, s * 1.2, 0.06]);
    addPart(actor, color, [0, 0, 0], [-spread, y, z + 0.02], [s * 2.4, s * 2.4, 0.02], { alpha: 0.22 });
    addPart(actor, color, [0, 0, 0], [spread, y, z + 0.02], [s * 2.4, s * 2.4, 0.02], { alpha: 0.22 });
  }

  function buildEnemy(model) {
    var actor = makeActor('enemy');
    if (model === 'mite') {
      actor.baseY = 0;
      addPart(actor, 0x9fdcff, [0, 0, 0], [0, 1.05, 0], [1.5, 0.9, 1.25]);
      addPart(actor, 0x7fc4ec, [0, 0, 0], [0, 1.0, 0.62], [1.0, 0.72, 0.5]);
      addPart(actor, 0xd9f6ff, [0, 0, 0], [-0.42, 1.62, 0], [0.3, 0.9, 0.3], { geo: 'cone6', rz: 0.28 });
      addPart(actor, 0xd9f6ff, [0, 0, 0], [0, 1.72, -0.1], [0.34, 1.05, 0.34], { geo: 'cone6' });
      addPart(actor, 0xd9f6ff, [0, 0, 0], [0.42, 1.62, 0], [0.3, 0.9, 0.3], { geo: 'cone6', rz: -0.28 });
      for (var m = 0; m < 3; m++) {
        var mz = -0.45 + m * 0.45;
        addPart(actor, 0x6aa8cc, [0, 0, 0], [-0.95, 0.92, mz], [0.5, 0.24, 0.24], { rz: 0.5 });
        addPart(actor, 0x6aa8cc, [0, 0, 0], [-1.28, 0.5, mz], [0.22, 0.9, 0.22], { rz: -0.35 });
        addPart(actor, 0x6aa8cc, [0, 0, 0], [0.95, 0.92, mz], [0.5, 0.24, 0.24], { rz: -0.5 });
        addPart(actor, 0x6aa8cc, [0, 0, 0], [1.28, 0.5, mz], [0.22, 0.9, 0.22], { rz: 0.35 });
      }
      glowEyes(actor, 0xeafaff, 1.14, 0.9, 0.26, 0.17);
    } else if (model === 'wisp') {
      actor.baseY = 0.55;
      addPart(actor, 0x8fe8ff, [0, 0, 0], [0, 1.5, 0], [0.86, 1.05, 0.7], { alpha: 0.96 });
      addPart(actor, 0xbdf4ff, [0, 0, 0], [0, 1.9, 0], [0.94, 0.34, 0.78], { alpha: 0.95 });
      addPart(actor, 0x8fe8ff, [0, 0, 0], [0, 0.7, 0], [0.92, 1.1, 0.86], { geo: 'cone6', rx: Math.PI, alpha: 0.9 });
      addPart(actor, 0x6fd0f0, [0, 0, 0], [-0.52, 1.5, 0], [0.26, 0.62, 0.26], { rz: 0.5, alpha: 0.9 });
      addPart(actor, 0x6fd0f0, [0, 0, 0], [0.52, 1.5, 0], [0.26, 0.62, 0.26], { rz: -0.5, alpha: 0.9 });
      addPart(actor, 0x4aa8cc, [0, 0, 0], [0, 0.05, 0], [1.4, 0.1, 1.4], { geo: 'disc', alpha: 0.25 });
      glowEyes(actor, 0xffffff, 1.68, 0.38, 0.22, 0.15);
    } else if (model === 'crab') {
      actor.baseY = 0;
      addPart(actor, 0xbfe9ff, [0, 0, 0], [0, 0.78, 0], [1.7, 0.62, 1.15]);
      addPart(actor, 0xe8f9ff, [0, 0, 0], [0, 1.1, -0.05], [1.3, 0.3, 0.9]);
      addPart(actor, 0x8fc9e6, [0, 0, 0], [-1.15, 0.8, 0.15], [0.56, 0.55, 0.55]);
      addPart(actor, 0x8fc9e6, [0, 0, 0], [1.15, 0.8, 0.15], [0.56, 0.55, 0.55]);
      addPart(actor, 0x5a9ab8, [0, 0, 0], [-1.2, 0.95, 0.5], [0.22, 0.22, 0.62], { rz: 0.3 });
      addPart(actor, 0x5a9ab8, [0, 0, 0], [1.2, 0.95, 0.5], [0.22, 0.22, 0.62], { rz: -0.3 });
      addPart(actor, 0x9fe6ff, [0, 0, 0], [-0.5, 1.35, -0.1], [0.2, 0.6, 0.2], { geo: 'cone6' });
      addPart(actor, 0x9fe6ff, [0, 0, 0], [0.5, 1.35, -0.1], [0.2, 0.6, 0.2], { geo: 'cone6' });
      addPart(actor, 0x9fe6ff, [0, 0, 0], [0, 1.42, -0.2], [0.24, 0.72, 0.24], { geo: 'cone6' });
      for (var c = 0; c < 4; c++) {
        addPart(actor, 0x8fc9e6, [0, 0, 0], [-0.62 + c * 0.42, 0.35, 0.45], [0.14, 0.7, 0.14], { rz: c % 2 ? 0.55 : -0.55 });
      }
      glowEyes(actor, 0x1a3a4a, 1.05, 0.62, 0.3, 0.16);
    } else if (model === 'wraith') {
      actor.baseY = 0;
      addPart(actor, 0x3b2b2a, [0, 0, 0], [0, 1.5, 0], [1.3, 2.6, 1.3], { geo: 'cylinder' });
      addPart(actor, 0x2a1e1c, [0, 0, 0], [0, 2.95, 0], [1.15, 1.1, 1.05]);
      addPart(actor, 0x2a1e1c, [0, 0, 0], [0, 1.3, 0], [2.6, 0.5, 2.2], { geo: 'cone6', rx: Math.PI });
      addPart(actor, 0x4a3a30, [0, 0, 0], [-0.7, 3.1, 0], [0.24, 1.5, 0.24], { rz: 0.85 });
      addPart(actor, 0x4a3a30, [0, 0, 0], [0.7, 3.1, 0], [0.24, 1.5, 0.24], { rz: -0.85 });
      addPart(actor, 0x4a3a30, [0, 0, 0], [-1.15, 3.55, 0], [0.18, 0.8, 0.18], { rz: 1.35 });
      addPart(actor, 0x4a3a30, [0, 0, 0], [1.15, 3.55, 0], [0.18, 0.8, 0.18], { rz: -1.35 });
      addPart(actor, 0x4a3a30, [0, 0, 0], [-1.1, 2.0, 0.2], [0.2, 1.6, 0.2], { rz: 0.9 });
      addPart(actor, 0x4a3a30, [0, 0, 0], [1.1, 2.0, 0.2], [0.2, 1.6, 0.2], { rz: -0.9 });
      addPart(actor, 0x1a1220, [0, 0, 0], [0, 2.95, 0.52], [0.7, 0.42, 0.14]);
      glowEyes(actor, 0x9ff2ff, 3.0, 0.55, 0.24, 0.16);
    } else if (model === 'serpent') {
      actor.baseY = 0;
      var coils = [[0, 0.55, 1.2], [-0.5, 0.5, 0.4], [0.5, 0.55, -0.4], [-0.45, 0.6, -1.2], [0.35, 0.7, -2.0]];
      coils.forEach(function (spot, index) {
        addPart(actor, index % 2 ? 0x8fdcef : 0x6ec3dd, [0, 0, 0], spot, [1.05 - index * 0.07, 1.0, 1.0]);
        addPart(actor, 0x4fa8c4, [0, 0, 0], [spot[0], spot[1] + 0.55, spot[2]], [0.5, 0.16, 0.5]);
      });
      addPart(actor, 0x9fe6ff, [0, 0, 0], [0, 1.35, 1.9], [1.15, 0.95, 1.3]);
      addPart(actor, 0x7fd4ee, [0, 0, 0], [0, 1.2, 2.55], [0.8, 0.5, 0.5]);
      addPart(actor, 0x2c6a86, [0, 0, 0], [0, 0.98, 2.6], [0.7, 0.18, 0.45]);
      addPart(actor, 0xd9f6ff, [0, 0, 0], [-0.34, 1.8, 1.8], [0.22, 0.5, 0.22], { geo: 'cone6', rz: 0.4 });
      addPart(actor, 0xd9f6ff, [0, 0, 0], [0.34, 1.8, 1.8], [0.22, 0.5, 0.22], { geo: 'cone6', rz: -0.4 });
      glowEyes(actor, 0xffffff, 1.42, 2.42, 0.3, 0.15);
    } else if (model === 'bell') {
      actor.baseY = 0;
      addPart(actor, 0x8a6fc2, [0, 0, 0], [0, 2.0, 0], [2.1, 2.4, 2.1], { geo: 'cone6', rx: Math.PI });
      addPart(actor, 0xcdb6f5, [0, 0, 0], [0, 0.85, 0], [2.2, 0.3, 2.2]);
      addPart(actor, 0x2a1a4c, [0, 0, 0], [0, 1.2, 0], [1.2, 0.55, 1.2]);
      addPart(actor, 0x8a6fc2, [0, 0, 0], [0, 3.35, 0], [0.7, 0.55, 0.7]);
      addPart(actor, 0xffe066, [0, 0, 0], [0, 1.55, 0], [0.42, 0.7, 0.42], { geo: 'cylinder' });
      addPart(actor, 0xffe066, [0, 0, 0], [0, 2.2, 0.02], [0.55, 0.55, 0.4]);
      addPart(actor, 0x5a4580, [0, 0, 0], [-1.25, 2.0, 0], [0.28, 1.5, 0.28], { rz: 0.4 });
      addPart(actor, 0x5a4580, [0, 0, 0], [1.25, 2.0, 0], [0.28, 1.5, 0.28], { rz: -0.4 });
      glowEyes(actor, 0xffe066, 2.35, 0.62, 0.3, 0.18);
    } else if (model === 'night') {
      actor.baseY = 0;
      addPart(actor, 0x140c26, [0, 0, 0], [-0.26, 0.62, 0], [0.5, 1.3, 0.55]);
      addPart(actor, 0x140c26, [0, 0, 0], [0.26, 0.62, 0], [0.5, 1.3, 0.55]);
      addPart(actor, 0x1b1130, [0, 0, 0], [0, 1.85, 0], [1.25, 1.35, 0.7]);
      addPart(actor, 0x241740, [0, 0, 0], [-0.82, 1.85, 0], [0.42, 1.2, 0.42]);
      addPart(actor, 0x241740, [0, 0, 0], [0.82, 1.85, 0], [0.42, 1.2, 0.42]);
      addPart(actor, 0x0e0818, [0, 0, 0], [0, 2.9, 0], [1.0, 1.0, 0.95]);
      addPart(actor, 0x7ce7ff, [0, 0, 0], [0, 1.85, 0.36], [0.34, 0.34, 0.06], { alpha: 0.85 });
      addPart(actor, 0x241740, [0, 0, 0], [-0.6, 3.5, 0], [0.26, 0.9, 0.26], { geo: 'cone6', rz: 0.45 });
      addPart(actor, 0x241740, [0, 0, 0], [0.6, 3.5, 0], [0.26, 0.9, 0.26], { geo: 'cone6', rz: -0.45 });
      addPart(actor, 0x1b1130, [0, 0, 0], [0, 1.2, -0.5], [2.0, 1.8, 0.4], { alpha: 0.55 });
      glowEyes(actor, 0xff5c74, 2.92, 0.5, 0.24, 0.16);
    } else {
      actor.baseY = 0.4;
      addPart(actor, 0x35245c, [0, 0, 0], [0, 1.3, 0], [0.95, 1.15, 0.75]);
      addPart(actor, 0x2a1d44, [0, 0, 0], [0, 0.55, 0], [1.1, 1.2, 0.95], { geo: 'cone6', rx: Math.PI });
      addPart(actor, 0x120a22, [0, 0, 0], [0, 2.0, 0], [0.95, 0.95, 0.9]);
      addPart(actor, 0x120a22, [0, 0, 0], [0, 2.15, -0.25], [1.0, 0.7, 0.5]);
      addPart(actor, 0x3a2a5c, [0, 0, 0], [-0.62, 1.35, 0], [0.26, 0.95, 0.26], { rz: 0.5 });
      addPart(actor, 0x3a2a5c, [0, 0, 0], [0.62, 1.35, 0], [0.26, 0.95, 0.26], { rz: -0.5 });
      addPart(actor, 0x6a4ca0, [0, 0, 0], [0, 0.05, 0], [1.4, 0.1, 1.4], { geo: 'disc', alpha: 0.3 });
      glowEyes(actor, 0x9ff2ff, 2.05, 0.46, 0.22, 0.14);
    }
    /* Rotate each angled part around its own centre, so limbs and antlers stay
       attached instead of swinging around the model's feet. */
    actor.parts.forEach(function (part) {
      if ((part.rx || part.ry || part.rz) && !part.pivot[0] && !part.pivot[1] && !part.pivot[2]) {
        part.pivot = part.offset.slice();
        part.offset = [0, 0, 0];
      }
    });
    return actor;
  }

  function buildShardActor() {
    var actor = makeActor('crystal');
    addPart(actor, 0x9ff2ff, [0, 0.7, 0], [0, 0.55, 0], [0.5, 1.5, 0.5], { geo: 'cone8' });
    addPart(actor, 0xffffff, [0, 0.7, 0], [0, 0.4, 0], [0.7, 0.7, 0.7], { alpha: 0.2 });
    addPart(actor, 0xbfe9ff, [0, 0.2, 0], [0, 0, 0], [1.1, 0.12, 1.1], { geo: 'disc', alpha: 0.35 });
    return actor;
  }

  /* ------------------------------------------------------------- snow/sfx */
  function resizeSnow() {
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    snowCanvas.width = Math.floor(window.innerWidth * ratio);
    snowCanvas.height = Math.floor(window.innerHeight * ratio);
    snowCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    var count = window.innerWidth < 700 ? 60 : 120;
    snowFlakes = [];
    for (var i = 0; i < count; i++) {
      snowFlakes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: rand(1, 2.8),
        speed: rand(18, 52),
        drift: rand(0.4, 1.6),
        phase: Math.random() * 6.28,
        alpha: rand(0.35, 0.85)
      });
    }
  }

  function drawSnow(dt, time) {
    if (!snowCtx) return;
    var w = window.innerWidth, h = window.innerHeight;
    snowCtx.clearRect(0, 0, w, h);
    snowCtx.fillStyle = '#ffffff';
    for (var i = 0; i < snowFlakes.length; i++) {
      var flake = snowFlakes[i];
      flake.y += flake.speed * dt;
      flake.x += Math.sin(time * 0.8 + flake.phase) * flake.drift;
      if (flake.y > h + 4) { flake.y = -4; flake.x = Math.random() * w; }
      if (flake.x < -4) flake.x = w + 4;
      if (flake.x > w + 4) flake.x = -4;
      snowCtx.globalAlpha = flake.alpha;
      snowCtx.fillRect(flake.x, flake.y, flake.r, flake.r);
    }
    snowCtx.globalAlpha = 1;
  }

  function sound(name, pitch) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var presets = {
        click: [{ f: 620, t: 0.05 }, { f: 930, at: 0.03, t: 0.05 }],
        blip: [{ f: 560, t: 0.028, type: 'square', gain: 0.018 }],
        crack: [{ f: 92, t: 0.55, type: 'sawtooth' }, { f: 54, at: 0.04, t: 0.8, type: 'square' }, { f: 1380, at: 0, t: 0.16, type: 'square', gain: 0.026 }],
        menu: [{ f: 440, t: 0.04 }, { f: 660, at: 0.04, t: 0.06 }],
        battle: [{ f: 196, t: 0.1 }, { f: 262, at: 0.1, t: 0.12 }, { f: 392, at: 0.2, t: 0.16 }],
        swing: [{ f: 880, t: 0.09, type: 'sawtooth' }, { f: 360, at: 0.03, t: 0.1, type: 'triangle' }],
        hit: [{ f: 190, t: 0.11, type: 'sawtooth' }, { f: 90, at: 0.02, t: 0.12, type: 'square' }],
        perfect: [{ f: 880, t: 0.06 }, { f: 1320, at: 0.05, t: 0.08 }, { f: 1760, at: 0.11, t: 0.14 }],
        guard: [{ f: 300, t: 0.08, type: 'triangle' }, { f: 600, at: 0.04, t: 0.1 }],
        superguard: [{ f: 660, t: 0.07 }, { f: 990, at: 0.06, t: 0.09 }, { f: 1480, at: 0.13, t: 0.18 }],
        chimeWhite: [{ f: 760, t: 0.08 }, { f: 1010, at: 0.06, t: 0.1 }],
        chimeOrange: [{ f: 520, t: 0.09, type: 'triangle' }, { f: 700, at: 0.07, t: 0.12 }],
        chimeRed: [{ f: 320, t: 0.1, type: 'sawtooth' }, { f: 240, at: 0.08, t: 0.16 }],
        burrow: [{ f: 180, t: 0.2, type: 'triangle' }],
        charge: [{ f: 200, t: 0.12, type: 'sawtooth' }, { f: 400, at: 0.12, t: 0.2, type: 'square' }],
        break: [{ f: 1200, t: 0.06, type: 'square' }, { f: 700, at: 0.06, t: 0.12 }],
        inspect: [{ f: 700, t: 0.05 }, { f: 540, at: 0.05, t: 0.06 }],
        hurt: [{ f: 110, t: 0.18, type: 'square' }],
        heal: [{ f: 520, t: 0.1 }, { f: 780, at: 0.08, t: 0.14 }],
        win: [{ f: 523, t: 0.1 }, { f: 659, at: 0.1, t: 0.1 }, { f: 784, at: 0.2, t: 0.2 }],
        level: [{ f: 659, t: 0.08 }, { f: 784, at: 0.08, t: 0.08 }, { f: 1046, at: 0.16, t: 0.22 }],
        deny: [{ f: 150, t: 0.12, type: 'square' }],
        shard: [{ f: 880, t: 0.12 }, { f: 1174, at: 0.1, t: 0.24 }],
        lose: [{ f: 330, t: 0.16 }, { f: 196, at: 0.14, t: 0.3 }]
      };
      var notes = presets[name] || presets.click;
      var start = audio.currentTime;
      var rate = pitch || 1;
      notes.forEach(function (note) {
        var at = start + (note.at || 0);
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = note.type || 'square';
        osc.frequency.setValueAtTime(note.f * rate, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(note.gain || 0.045, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.t);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(at);
        osc.stop(at + note.t + 0.02);
      });
    } catch (error) { /* audio is optional */ }
  }

  function toast(message, duration) {
    if (!ui.toast) return;
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, duration || 2600);
  }

  function shake() {
    stage.classList.add('ff-shake');
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(function () { stage.classList.remove('ff-shake'); }, 260);
  }

  /* Block Tales-style juice: 60-80ms hit-stop, a camera kick, a fat damage
     popup and a rating badge that squashes in. */
  function hitStop(ms) {
    freezeUntil = Math.max(freezeUntil, performance.now() + ms);
  }

  function flashStage(kind) {
    if (!ui.flash) return;
    ui.flash.className = 'ff-flash ' + (kind || 'white');
    ui.flash.hidden = false;
    clearTimeout(ui.flashTimer);
    ui.flashTimer = setTimeout(function () { ui.flash.hidden = true; }, 230);
  }

  function pop(text, cls) {
    if (!ui.fx) return;
    var node = document.createElement('div');
    node.className = 'ff-pop ' + (cls || '');
    node.textContent = text;
    node.style.left = (42 + Math.random() * 18) + '%';
    node.style.top = (26 + Math.random() * 12) + '%';
    ui.fx.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 820);
  }

  function rate(text, cls) {
    if (!ui.rating) return;
    ui.rating.textContent = text;
    ui.rating.className = 'ff-rating ' + (cls || '');
    ui.rating.hidden = false;
    clearTimeout(ui.ratingTimer);
    ui.ratingTimer = setTimeout(function () { ui.rating.hidden = true; }, 900);
  }

  /* ------------------------------------------------------------- scenery */
  function makeStatic(geo, x, y, z, sx, sy, sz, color, opts) {
    opts = opts || {};
    return {
      geo: geo,
      model: mat.compose([x, y, z], [opts.rx || 0, opts.ry || 0, opts.rz || 0], [sx, sy, sz]),
      color: rgb(color),
      alpha: opts.alpha === undefined ? 1 : opts.alpha,
      pattern: opts.pattern === undefined ? !opts.alpha : opts.pattern,
      tile: opts.tile || 1,
      hidden: false
    };
  }

  function box(x, y, z, sx, sy, sz, color, opts) {
    opts = opts || {};
    world.objects.push(makeStatic(opts.geo || 'cube', x, y, z, sx, sy, sz, color, opts));
  }

  var FONT = {
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['101', '111', '111', '111', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '111', '011'], R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    ' ': ['000', '000', '000', '000', '000'], '!': ['010', '010', '010', '000', '010'],
    '?': ['110', '001', '010', '000', '010'], '-': ['000', '000', '111', '000', '000']
  };

  /* Each glyph pixel is a cube, so a word is ~100 cubes. They are baked per
     colour into one buffer (same trick as the studs) so a sign costs a single
     draw call. Baked buffers go into `bucket` so they can be released later. */
  var GLYPH_BATCH_MAX = 400;
  function pixelTextInto(bucket, objects, text, centerX, bottomY, z, px, color) {
    var chars = String(text).toUpperCase().split('');
    var width = chars.length * 4 * px - px;
    var startX = centerX - width / 2;
    var queues = renderer ? {} : null;
    for (var letter = 0; letter < chars.length; letter++) {
      var glyph = FONT[chars[letter]] || FONT['?'];
      for (var row = 0; row < 5; row++) {
        for (var col = 0; col < 3; col++) {
          if (glyph[row].charAt(col) !== '1') continue;
          var gx = startX + letter * 4 * px + col * px;
          var gy = bottomY + (4 - row) * px;
          if (!queues) {
            objects.push(makeStatic('cube', gx, gy, z, px * 0.92, px * 0.92, 0.18, color, {}));
            continue;
          }
          var queue = queues[color] || (queues[color] = { color: color, matrices: [] });
          queue.matrices.push(mat.compose([gx, gy, z], [0, 0, 0], [px * 0.92, px * 0.92, 0.18]));
        }
      }
    }
    if (!queues) return;
    Object.keys(queues).forEach(function (key) {
      var queue = queues[key];
      for (var start = 0; start < queue.matrices.length; start += GLYPH_BATCH_MAX) {
        var geo = renderer.batchGeometry('cube', queue.matrices.slice(start, start + GLYPH_BATCH_MAX));
        if (!geo) continue;
        if (bucket) bucket.push(geo);
        objects.push({ geo: geo, model: mat.identity(), color: rgb(queue.color), alpha: 1, hidden: false });
      }
    });
  }

  function pixelText(text, centerX, bottomY, z, px, color) {
    pixelTextInto(world.geometries, world.objects, text, centerX, bottomY, z, px, color);
  }

  /* A gantry sign straddling the road: the board sits centred over the path
     with a post at each end, so it stays fully inside the frame at spawn. */
  function sign(text, x, z) {
    var px = 0.22;
    var width = String(text).length * 4 * px;
    /* Tall enough to arch over the R6 cast (2.4 units), low enough that the
       top of the board still clears the compact HUD at spawn. */
    var boardY = 3.3;
    box(x - width / 2 - 0.62, boardY / 2, z, 0.34, boardY, 0.34, 0x6b4a32);
    box(x + width / 2 + 0.62, boardY / 2, z, 0.34, boardY, 0.34, 0x6b4a32);
    box(x, boardY, z, width + 1.8, 1.55, 0.44, 0x6b4a32);
    box(x, boardY + 0.88, z, width + 2.1, 0.22, 0.52, 0x8a6242);
    pixelText(text, x, boardY - 0.5, z + 0.30, px, 0xfff3d5);
    world.colliders.push({ x: x - width / 2 - 0.62, z: z, hw: 0.42, hd: 0.42 });
    world.colliders.push({ x: x + width / 2 + 0.62, z: z, hw: 0.42, hd: 0.42 });
  }

  /* E on scenery is a joke delivery service. */
  function inspect(x, z, speaker, lines, radius) {
    if (!world) return;
    world.interactables.push({
      x: x, z: z, r: radius || 2.6, label: 'INSPECT',
      action: function () { talk(speaker, lines, null); }
    });
  }

  function house(x, z, w, d, h, wall, roof) {
    box(x, h / 2, z, w, h, d, wall);
    box(x, h, z, w * 0.84, h * 0.58, d * 0.84, roof, { geo: 'cone4', ry: Math.PI / 4 });
    box(x - w * 0.28, h * 0.62, z + d / 2 + 0.06, 0.7, 0.7, 0.08, 0xffd77a);
    box(x + w * 0.28, h * 0.62, z + d / 2 + 0.06, 0.7, 0.7, 0.08, 0xffd77a);
    box(x, h * 0.17, z + d / 2 + 0.07, 0.9, h * 0.34, 0.12, 0x3a2a20);
    box(x + w * 0.22, h + h * 0.42, z - d * 0.2, 0.5, 1.2, 0.5, 0x4a3a32);
    world.colliders.push({ x: x, z: z, hw: w / 2, hd: d / 2 });
  }

  function lamp(x, z) {
    box(x, 1.5, z, 0.16, 3.0, 0.16, 0x2b2b3a, { geo: 'cylinder' });
    box(x, 3.05, z, 0.5, 0.5, 0.5, 0xffe9a0);
    box(x, 3.05, z, 1.0, 1.0, 1.0, 0xffd76a, { alpha: 0.16 });
  }

  function tree(x, z, s) {
    s = s || 1;
    box(x, 0.9 * s, z, 0.5 * s, 1.8 * s, 0.5 * s, 0x6a4a32, { geo: 'cylinder' });
    box(x, 1.3 * s, z, 1.35 * s, 2.0 * s, 1.35 * s, 0x2f6b52, { geo: 'cone6' });
    box(x, 2.2 * s, z, 1.05 * s, 1.8 * s, 1.05 * s, 0x377a5c, { geo: 'cone6' });
    box(x, 3.1 * s, z, 0.75 * s, 1.4 * s, 0.75 * s, 0x2f6b52, { geo: 'cone6' });
    box(x, 3.75 * s, z, 0.6 * s, 0.6 * s, 0.6 * s, 0xf2fbff, { geo: 'cone6' });
    world.colliders.push({ x: x, z: z, hw: 0.42 * s, hd: 0.42 * s });
  }

  /* Studs are collected per colour and baked into one buffer (see flushStuds),
     so a studded plaza costs a draw call instead of hundreds. */
  var STUD_BATCH_MAX = 400;
  function studs(x, z, width, depth, topY, color, spacing) {
    if (!world) return;
    spacing = spacing || 1.7;
    var radius = 0.2;
    var groups = world.studGroups || (world.studGroups = {});
    var group = groups[color] || (groups[color] = { color: color, matrices: [] });
    for (var sx = -width / 2 + spacing / 2; sx <= width / 2 - 0.05; sx += spacing) {
      for (var sz = -depth / 2 + spacing / 2; sz <= depth / 2 - 0.05; sz += spacing) {
        group.matrices.push(mat.compose([x + sx, topY + 0.07, z + sz], [0, 0, 0], [radius * 2, 0.14, radius * 2]));
      }
    }
  }

  function flushStuds() {
    var groups = world && world.studGroups;
    if (!groups || !renderer) return;
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      for (var start = 0; start < group.matrices.length; start += STUD_BATCH_MAX) {
        var geo = renderer.batchGeometry('cylinder', group.matrices.slice(start, start + STUD_BATCH_MAX));
        if (!geo) continue;
        world.geometries.push(geo);
        world.objects.push({ geo: geo, model: mat.identity(), color: rgb(group.color), alpha: 1, hidden: false });
      }
    });
    world.studGroups = null;
  }

  function snowPile(x, z, s) {
    box(x, 0.16 * (s || 1), z, 1.8 * (s || 1), 0.32 * (s || 1), 1.4 * (s || 1), 0xf6fcff);
  }

  function fountain(x, z) {
    box(x, 0.35, z, 1.7, 0.7, 1.7, 0x8fa6bb, { geo: 'cylinder' });
    box(x, 0.72, z, 1.55, 0.14, 1.55, 0xbfe9ff, { geo: 'cylinder' });
    box(x, 1.15, z, 0.45, 1.0, 0.45, 0x8fa6bb);
    box(x, 1.8, z, 0.7, 1.4, 0.7, 0xaee8ff, { geo: 'cone8' });
    world.colliders.push({ x: x, z: z, hw: 1.9, hd: 1.9 });
  }

  function campfire(x, z) {
    box(x, 0.15, z, 1.4, 0.3, 1.4, 0x3b2a22);
    box(x, 0.55, z, 0.5, 1.0, 0.5, 0xff7b2b, { alpha: 0.95 });
    box(x, 0.5, z, 0.85, 0.7, 0.85, 0xffc44d, { alpha: 0.5 });
    box(x, 0.05, z, 3.2, 0.06, 3.2, 0xffb347, { geo: 'disc', alpha: 0.14 });
  }

  function dock(x, z) {
    for (var i = 0; i < 6; i++) {
      box(x, 0.35, z - i * 1.6, 3.4, 0.18, 1.2, 0x7a5a3c);
    }
    box(x - 1.5, 0.7, z - 4, 0.2, 0.8, 0.2, 0x5a4028);
    box(x + 1.5, 0.7, z - 4, 0.2, 0.8, 0.2, 0x5a4028);
  }

  function buildRoadtown() {
    box(0, -0.3, 0, 64, 0.6, 64, 0xeaf4ff);
    box(0, 0.02, 0, 7, 0.06, 54, 0x6d8cb8);
    studs(0, 0, 7, 54, 0.05, 0xe8f4ff, 1.75);
    for (var m = -24; m <= 24; m += 4) box(0, 0.15, m, 0.32, 0.03, 1.4, 0xdce9f7);
    house(-10.5, 3, 7, 6, 4, 0x9a7561, 0x6b4a3a);
    house(10.5, 2, 6, 5, 3.8, 0x7f8fa8, 0x51617a);
    house(-11, -9, 6, 6, 4.4, 0x8a6a8f, 0x5d4166);
    house(11, -10, 7, 6, 4, 0x6f8a78, 0x47604f);
    sign('ROADTOWN', 0, 7.6);
    inspect(0, 7.6, 'ROADTOWN', [
      'ROADTOWN · POP. 214 · SHARDS 1 · SNOW 6 FT.',
      'Someone crossed out WELCOME and wrote PLEASE CLOSE THE SKY.',
      'Under that, in pencil: "we mean it."'
    ], 3);
    fountain(0, -4);
    inspect(0, -4, 'FOUNTAIN', [
      'The fountain is frozen mid-splash. It looks personally offended.',
      'A little plaque reads NO SKATING. It is covered in skate marks.'
    ], 2.6);
    lamp(-3.6, 2.5); lamp(3.6, -1.5); lamp(-3.6, -10); lamp(3.6, 8);
    tree(-16, 8, 1.1); tree(16, 6, 1.0); tree(-17, -16, 1.2); tree(17, -18, 1.1);
    tree(-6.5, -19, 0.9); tree(7, -20, 1.0);
    snowPile(-7, 10, 1); snowPile(7, -13, 0.9); snowPile(13, 12, 1.1);
    snowPile(-14, 14, 0.8); snowPile(5, -16, 0.7);
  }

  function buildPines() {
    box(0, -0.3, 0, 64, 0.6, 64, 0xc6e0f7);
    for (var z = -24; z <= 24; z += 3) {
      box(Math.sin(z * 0.18) * 2, 0.03, z, 4.6, 0.06, 2.8, 0xf3faff);
      studs(Math.sin(z * 0.18) * 2, z, 4.6, 2.8, 0.06, 0x9fc8ea, 1.5);
    }
    var spots = [[-8, 8], [-12, 4], [-9, -2], [-13, -9], [-8, -15], [-12, -21], [8, 7], [12, 3], [9, -3], [13, -9], [8, -15], [12, -21], [-4, 17], [5, 16], [-16, 12], [16, 12], [-16, -16], [16, -18], [-18, 1], [18, 0]];
    spots.forEach(function (spot, index) {
      tree(spot[0], spot[1], 0.85 + (index % 4) * 0.12);
    });
    house(-15.5, 2, 5, 5, 3.4, 0x6a5a4a, 0x3f3028);
    campfire(-4.5, -1.5);
    inspect(-4.5, -1.5, 'CAMPFIRE', [
      'The fire is warm. The fire is also the only thing here not whispering.',
      'Someone left a marshmallow on a stick. It is now a small rock.'
    ], 2.4);
    lamp(3.2, 5);
    lamp(-3.2, -10);
    snowPile(-6, 9, 0.9); snowPile(5, -6, 1.1); snowPile(10, 11, 0.8);
  }

  function buildLake() {
    box(0, -0.3, 0, 64, 0.6, 64, 0xbfe8f5);
    box(0, 0.02, 0, 5, 0.06, 52, 0xeaf7fc);
    studs(0, 0, 5, 52, 0.05, 0xffffff, 1.7);
    box(-5.5, 0.05, 2, 0.18, 0.02, 8, 0xffffff);
    box(6.5, 0.05, -5, 0.18, 0.02, 6, 0xffffff, { ry: 0.35 });
    box(-2, 0.05, -13, 0.18, 0.02, 7, 0xffffff, { ry: -0.5 });
    box(9, 0.05, 8, 0.18, 0.02, 5, 0xffffff, { ry: 0.8 });
    dock(4, 2);
    inspect(4, 2, 'DOCK', [
      'A boathouse sign: BOATS FOR RENT · ASK FINN · FINN IS UNDER THE ICE.',
      'The lake taps back when you knock. Politely. Twice.'
    ], 2.6);
    house(-9, 4, 5.5, 5, 3.2, 0x6a5a4a, 0x3f3028);
    box(-9, 0.4, 7.2, 1.4, 0.8, 1.0, 0x4a3322);
    lamp(-3, 7); lamp(3, -3);
    tree(-16, -2, 1.1); tree(-15, -14, 1.0); tree(16, -6, 1.1); tree(15, 10, 0.9);
    snowPile(-13, 9, 1); snowPile(12, 3, 0.8); snowPile(-7, -18, 1.1); snowPile(8, -17, 0.9);
  }

  function buildClocktower() {
    box(0, -0.3, 0, 64, 0.6, 64, 0x5a5468);
    box(0, 0.02, 0, 22, 0.06, 30, 0x6b6478);
    studs(0, 0, 22, 30, 0.05, 0x817a96, 2.0);

    box(0, 6, -14, 8, 12, 8, 0x565074);
    box(0, 13.5, -14, 6, 4, 6, 0x6a6288);
    box(0, 16.5, -14, 4, 3, 4, 0x565074);
    box(0, 18.4, -14, 4.4, 1.8, 4.4, 0x3b3554, { geo: 'cone4', ry: Math.PI / 4 });
    box(0, 15.4, -10, 4.2, 4.2, 0.35, 0xfff3d5);
    box(0, 15.2, -9.75, 0.22, 1.5, 0.1, 0x1b1430);
    box(0.5, 15.4, -9.75, 1.1, 0.22, 0.1, 0x1b1430);
    box(0, 21, -14, 0.2, 5, 0.2, 0x8a7ab0);
    world.colliders.push({ x: 0, z: -14, hw: 4, hd: 4 });
    house(-13, 4, 6, 6, 4, 0x7f8fa8, 0x51617a);
    house(13, 3, 6, 5, 3.8, 0x8a6a8f, 0x5d4166);
    house(-13, -9, 5, 5, 3.6, 0x6f8a78, 0x47604f);
    house(13, -10, 6, 6, 4.2, 0x9a7561, 0x6b4a3a);
    lamp(-4, 4); lamp(4, -2); lamp(-4, -9); lamp(4, 9);
    inspect(0, -9, 'CLOCKTOWER', [
      'The clock face shows THIRTEEN. The little hand is pointing at YOU.',
      'A brass plate: BELLKEEPER ODETTE · DO NOT COUNT THE BELLS.',
      'Someone has scratched "it counts back" underneath.'
    ], 2.8);
    tree(-18, 11, 1); tree(18, 12, 1); tree(-18, -17, 0.9); tree(18, -18, 1);
    snowPile(-7, 8, 0.8); snowPile(8, -8, 0.9);
  }

  function buildSummit() {
    box(0, -0.3, 0, 64, 0.6, 64, 0x2a2440);
    box(0, 0.02, 0, 6, 0.06, 50, 0x3a3254);
    studs(0, 0, 6, 50, 0.05, 0x4d4468, 1.8);
    var spires = [[-8, 6], [-13, 0], [9, 4], [14, -2], [-10, -9], [11, -11], [-6, -18], [7, -20], [-16, 14], [16, 14]];
    spires.forEach(function (spot, index) {
      var h = 3 + (index % 3) * 2;
      box(spot[0], 0, spot[1], 1.6, h, 1.6, 0x1b1630, { geo: 'cone6' });
      box(spot[0], h - 0.4, spot[1], 0.8, 0.9, 0.8, 0xeaf7ff, { geo: 'cone6' });
      world.colliders.push({ x: spot[0], z: spot[1], hw: 0.9, hd: 0.9 });
    });
    box(0, 8, -24, 26, 0.6, 3, 0x7ce7ff, { alpha: 0.2 });
    box(-9, 10, -22, 16, 0.5, 2.6, 0xff7bc0, { alpha: 0.16 });
    box(10, 12, -23, 14, 0.5, 2.4, 0x8df0b3, { alpha: 0.14 });
    box(0, 0.4, -12, 3.2, 0.8, 3.2, 0x3a3254);
    box(0, 0.9, -12, 2.4, 0.2, 2.4, 0x8a7ab0);
    box(0, 2.0, -12, 0.5, 2.2, 0.5, 0x8a7ab0);
    box(0, 3.4, -12, 0.9, 1.0, 0.9, 0x7ce7ff, { alpha: 0.35 });
    world.colliders.push({ x: 0, z: -12, hw: 1.8, hd: 1.8 });
    lamp(-3, 7); lamp(3, 7);
    inspect(0, -9.4, 'ALTAR', [
      'Five grooves wait in the stone. One of them is already warm.',
      'Carved underneath: THE STAR IS NOT LOST. IT IS WAITING TO BE LIT.'
    ], 2.8);
    snowPile(-5, 3, 0.8); snowPile(6, -2, 0.9);
  }

  /* -------------------------------------------------------------- chapters */
  var CHAPTERS = [
    {
      num: 'ONE', title: 'ROADTOWN IN THE SNOW', sub: 'Where the star fell first',
      theme: 'day', fog: [0.78, 0.87, 0.96], spawn: [0.9, 12],
      intro: [
        'The Aurora Star cracked at midnight. Five pieces fell out of the sky.',
        'By morning, Roadtown was buried, and the cold had teeth.',
        'Mayor Bram is waiting by the square. Pip has already packed the cocoa.'
      ],
      outro: [
        'The shard hums in your hand. It sounds like a spring bird.',
        'One down. Four to go. The pines are whispering your name.'
      ],
      npc: {
        name: 'MAYOR BRAM', x: 2.2, z: 9, palette: 'bram',
        lines: [
          'You saw it fall, didn\'t you? The whole town felt the sky crack.',
          'A shard landed in the fountain. But the cold brought shades with it. They\'re lurking in the drifts.',
          'Clear them out and the ice should break. Pip can patch you up between fights.'
        ]
      },
      shades: [
        { key: 'c1-a', name: 'FROST SHADE', x: -8, z: -1.5, hp: 14, atk: 3, xp: 12 },
        { key: 'c1-b', name: 'FROST SHADE', x: 8, z: -7, hp: 15, atk: 3, xp: 12 }
      ],
      shadeModel: 'shade',
      boss: {
        key: 'c1-boss', name: 'FROST MITE', x: 0, z: -6.5, hp: 34, atk: 4, xp: 30, model: 'mite',
        intro: [
          'The fountain ice splits. Something with too many legs climbs out.',
          'FROST MITE: "COLD... COLD... MINE..."'
        ]
      },
      build: buildRoadtown
    },
    {
      num: 'TWO', title: 'THE WHISPERING PINES', sub: 'The trees remember every step',
      theme: 'night', fog: [0.16, 0.18, 0.32], spawn: [0, 13],
      intro: [
        'The Whispering Pines used to be a quiet place.',
        'Now the trees lean in when you walk past, and the snow repeats what you say.',
        'Juniper went ahead to check on the old grove. She has not come back.'
      ],
      outro: [
        'The wraith collapses into a heap of dry needles. A green shard rolls free.',
        'Two down. The lake is next, and the lake is never quiet.'
      ],
      npc: {
        name: 'JUNIPER', x: -4.8, z: 3.2, palette: 'juniper',
        lines: [
          'I came out here to count the pines. Now the pines are counting me.',
          'The wraith wears the oldest tree like a coat. Clear the shades and it will have to come out.',
          'Watch the branches. They move when the wind does not.'
        ]
      },
      shades: [
        { key: 'c2-a', name: 'SNOW WISP', x: -8, z: -4, hp: 18, atk: 4, xp: 15 },
        { key: 'c2-b', name: 'SNOW WISP', x: 7, z: -8, hp: 19, atk: 4, xp: 15 }
      ],
      shadeModel: 'wisp',
      boss: {
        key: 'c2-boss', name: 'PINE WRAITH', x: 0, z: -12, hp: 46, atk: 5, xp: 40, model: 'wraith',
        intro: [
          'A tree that should not be standing turns around.',
          'PINE WRAITH: "YOU SMELL LIKE WARMTH."'
        ]
      },
      build: buildPines
    },
    {
      num: 'THREE', title: 'THE GLASS LAKE', sub: 'Something long under the ice',
      theme: 'lake', fog: [0.66, 0.8, 0.9], spawn: [0, 11],
      intro: [
        'Glass Lake froze solid overnight. Old Finn says that is normal.',
        'The thing under the ice is not.',
        'The dock is still out there. So is Finn, and so is whatever has been swimming laps.'
      ],
      outro: [
        'The serpent sinks, and the lake goes quiet for the first time in years.',
        'Three shards. Above the rooftops, the clocktower is ringing thirteen.'
      ],
      npc: {
        name: 'OLD FINN', x: -4, z: 4.5, palette: 'finn',
        lines: [
          'Lake\'s frozen solid. Boat\'s stuck. Line\'s frozen. Something long has been swimming laps under the ice.',
          'Crack the glass crabs first. Then we will see what is making the lake knock.',
          'If the ice starts singing, stand still. It hates being listened to.'
        ]
      },
      shades: [
        { key: 'c3-a', name: 'GLASS CRAB', x: -7, z: 1, hp: 24, atk: 5, xp: 18 },
        { key: 'c3-b', name: 'GLASS CRAB', x: 8, z: -4, hp: 25, atk: 5, xp: 18 }
      ],
      shadeModel: 'crab',
      boss: {
        key: 'c3-boss', name: 'ICE SERPENT', x: 0, z: -9, hp: 60, atk: 6, xp: 55, model: 'serpent',
        intro: [
          'The ice bulges, cracks, and something long comes up for air.',
          'ICE SERPENT: "SSSTAY... WARM... HERE..."'
        ]
      },
      build: buildLake
    },
    {
      num: 'FOUR', title: 'THE THIRTEENTH BELL', sub: 'The clocktower keeps bad time',
      theme: 'dusk', fog: [0.42, 0.32, 0.44], spawn: [0, 11],
      intro: [
        'Roadtown\'s clock has struck thirteen three times today.',
        'Nobody wants to go near the tower. Odette is the only one who will.',
        'She says the bell is hollow. She says something is living in the sound.'
      ],
      outro: [
        'The bell\'s echo dies. A silver shard rings against the cobbles.',
        'Four shards. One left. The mountain is waiting.'
      ],
      npc: {
        name: 'BELLKEEPER ODETTE', x: 4, z: 4, palette: 'odette',
        lines: [
          'The clock struck thirteen at noon. Clocks do not do that.',
          'The bell is hollow, but something is living in the sound. Ring it true and the shard will answer.',
          'Do not count the bells. It will count you back.'
        ]
      },
      shades: [
        { key: 'c4-a', name: 'BELL WRAITH', x: -8, z: 1, hp: 30, atk: 6, xp: 22 },
        { key: 'c4-b', name: 'BELL WRAITH', x: 8, z: -3, hp: 31, atk: 6, xp: 22 }
      ],
      shadeModel: 'shade',
      boss: {
        key: 'c4-boss', name: 'HOLLOW BELL', x: 0, z: -6, hp: 76, atk: 7, xp: 70, model: 'bell',
        intro: [
          'The bell swings by itself. There is nothing inside it but a voice.',
          'HOLLOW BELL: "DONG. DONG. DONG. DONG."'
        ]
      },
      build: buildClocktower
    },
    {
      num: 'FIVE', title: 'THE LONG NIGHT', sub: 'The last shard, the last light',
      theme: 'night', fog: [0.08, 0.07, 0.16], spawn: [0, 10],
      intro: [
        'Above Roadtown, the sky is a hole.',
        'The Long Night is not a storm. It is a decision.',
        'Climb. Light the star. Come home.'
      ],
      outro: [
        'You set the last shard into the dark.',
        'Five pieces become one. The Aurora Star catches like a struck match.',
        'Below, Roadtown lights up window by window. Pip cheers so hard he falls over.',
        'The Long Night retreats down the mountain, grumbling.',
        'THE END — thank you for playing A Christmas Tale.'
      ],
      npc: {
        name: 'AURORA', x: 0, z: 6.5, palette: 'aurora',
        lines: [
          'You came all the way up here. Most people would have stayed by the fire.',
          'The Long Night is not a monster. It is what is left when hope runs out.',
          'Take the last shard. I will hold the dark as long as I can.'
        ]
      },
      shades: [
        { key: 'c5-a', name: 'NIGHT SHADE', x: -7, z: 2, hp: 36, atk: 7, xp: 26 },
        { key: 'c5-b', name: 'NIGHT SHADE', x: 7, z: 0, hp: 38, atk: 7, xp: 26 }
      ],
      shadeModel: 'shade',
      boss: {
        key: 'c5-boss', name: 'THE LONG NIGHT', x: 0, z: -6, hp: 96, atk: 8, xp: 100, model: 'night',
        intro: [
          'The dark gathers into a shape with your outline.',
          'THE LONG NIGHT: "YOU COULD HAVE STAYED BY THE FIRE."'
        ]
      },
      build: buildSummit
    }
  ];
/*
 * Frostfall game — part 3a (title, flow, world, dialogue, movement).
 * This file is appended into js/frostfall.js by the build step and then removed.
 */

  var titlePip = null;

  /* ---------------------------------------------------------------- title */
  function buildTitleScene() {
    titleGeometries.forEach(function (geo) { renderer.releaseGeometry(geo); });
    titleGeometries.length = 0;
    titleObjects.length = 0;
    titleHero = null;
    titlePip = null;
    function tbox(x, y, z, sx, sy, sz, color, opts) {
      opts = opts || {};
      titleObjects.push(makeStatic(opts.geo || 'cube', x, y, z, sx, sy, sz, color, opts));
    }
    tbox(0, -0.3, 0, 64, 0.6, 64, 0xe6f2fd);
    tbox(0, 0.02, 0, 8, 0.06, 56, 0x9fb3c8);
    for (var m = -22; m <= 22; m += 4) tbox(0, 0.07, m, 0.3, 0.04, 1.3, 0xdce9f7);
    tbox(-9.5, 2, 3, 6, 4, 5, 0x9a7561);
    tbox(-9.5, 4.1, 3, 5.1, 2.3, 4.3, 0x6b4a3a, { geo: 'cone4', ry: Math.PI / 4 });
    tbox(-9.5, 2.5, 5.55, 0.7, 0.7, 0.08, 0xffd77a);
    tbox(-9.5, 0.7, 5.55, 0.9, 1.4, 0.1, 0x3a2a20);
    tbox(9.5, 2.4, 0, 6.5, 4.8, 5.5, 0x7f8fa8);
    tbox(9.5, 4.9, 0, 5.5, 2.5, 4.7, 0x51617a, { geo: 'cone4', ry: Math.PI / 4 });
    tbox(9.5, 2.9, 2.8, 0.8, 0.8, 0.08, 0xffd77a);
    tbox(9.5, 2.9, -2.8, 0.8, 0.8, 0.08, 0xffd77a);
    tbox(-15, 0, -10, 1.6, 4, 1.6, 0x2f6b52, { geo: 'cone6' });
    tbox(15, 0, -8, 1.4, 3.4, 1.4, 0x2f6b52, { geo: 'cone6' });
    tbox(-14, 4.2, 10, 1.3, 3, 1.3, 0x2f6b52, { geo: 'cone6' });
    tbox(0, 0.02, 8, 5, 0.06, 10, 0xdce9f7);
    tbox(0, 1.8, 6.5, 7.3, 3.2, 0.5, 0x6b4a32);
    tbox(-3.2, 0.8, 6.5, 0.35, 1.6, 0.35, 0x4c3323);
    tbox(3.2, 0.8, 6.5, 0.35, 1.6, 0.35, 0x4c3323);
    pixelTextInto(titleGeometries, titleObjects, 'ROADTOWN', 0, 1.2, 6.8, 0.32, 0xfff3d5);
    tbox(-4, 0.2, 4, 1.8, 0.5, 1.4, 0xf6fcff);
    tbox(5, 0.2, 1, 2.2, 0.4, 1.2, 0xf6fcff);
    titleHero = buildHero(heroPalette());
    titleHero.x = 2.4;
    titleHero.z = 3.2;
    titleHero.yaw = Math.PI;
    pushActor(titleObjects, titleHero);
    titlePip = buildPip();
    titlePip.x = 3.4;
    titlePip.z = 4.6;
    titlePip.yaw = Math.PI;
    pushActor(titleObjects, titlePip);
    updateActor(titleHero);
    updateActor(titlePip);
    app.dataset.theme = 'day';
    renderer.setScene({ objects: titleObjects, fogColor: [0.8, 0.88, 0.96], fogNear: 22, fogFar: 70 });
  }

  function updateTitle(time) {
    renderer.setCamera(
      [Math.sin(time * 0.12) * 13, 4.6, 6 + Math.cos(time * 0.12) * 13],
      [0, 2.1, 4.5],
      52 * Math.PI / 180
    );
    if (titleHero) {
      titleHero.y = Math.abs(Math.sin(time * 1.7)) * 0.035;
      titleHero.yaw = Math.PI + Math.sin(time * 0.4) * 0.18;
      titleHero.armL.rx = Math.sin(time * 1.7) * 0.14;
      titleHero.armR.rx = -Math.sin(time * 1.7) * 0.14;
      updateActor(titleHero);
    }
    if (titlePip) {
      titlePip.y = Math.abs(Math.sin(time * 1.5 + 1)) * 0.06;
      titlePip.yaw = Math.PI + Math.sin(time * 1.1) * 0.3;
      updateActor(titlePip);
    }
  }

  /* ---------------------------------------------------------------- flow */
  var SCREENS = ['ff-title', 'ff-name-screen', 'ff-chapter-screen', 'ff-menu', 'ff-ending', 'ff-ended', 'ff-levelup', 'ff-loading', 'ff-fallback', 'ff-cutscene'];

  function hideScreens() {
    SCREENS.forEach(function (id) {
      var element = $(id);
      if (element) element.hidden = true;
    });
  }

  function phaseAt() {
    var now = clock();
    if (now < START) return 'upcoming';
    if (now >= END) return 'ended';
    return 'active';
  }

  function formatDate(ms) {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(ms));
  }

  function openTitleOrEnded() {
    phase = phaseAt();
    if (phase === 'ended') { showEnded(); return; }
    showTitle();
  }

  function showTitle() {
    hideScreens();
    ui.title.hidden = false;
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.prompt.hidden = true;
    ui.battle.hidden = true;
    ui.dialogue.hidden = true;
    view = 'title';
    mode = 'title';
    buildTitleScene();
    var hasSave = Boolean(save && save.started && !save.ending);
    ui.continueButton.hidden = !hasSave;
    if (hasSave) ui.continueButton.textContent = 'CONTINUE · CHAPTER ' + CHAPTERS[clamp(save.chapter, 0, 4)].num;
    ui.newGame.disabled = phase !== 'active';
    ui.newGame.textContent = phase === 'upcoming' ? 'OPENS SOON' : (save && save.ending ? 'PLAY AGAIN' : 'NEW GAME');
    ui.titleNote.textContent = phase === 'upcoming'
      ? 'OPENS ' + formatDate(START).toUpperCase() + ' · EASTERN TIME'
      : formatDate(START).toUpperCase() + ' – ' + formatDate(END).toUpperCase() + ' · EASTERN TIME';
  }

  function showEnded() {
    hideScreens();
    ui.ended.hidden = false;
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.battle.hidden = true;
    ui.dialogue.hidden = true;
    view = 'title';
    mode = 'ended';
    buildTitleScene();
  }

  function requestNewGame() {
    if (phaseAt() !== 'active') { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
    if (save && save.started && !save.ending && !window.confirm('Start a new story? Your current A Christmas Tale save will be erased.')) return;
    hideScreens();
    ui.nameScreen.hidden = false;
    ui.nameInput.value = save ? save.name : '';
    mode = 'name';
    setTimeout(function () { ui.nameInput.focus(); }, 80);
  }

  function beginNewStory() {
    if (phaseAt() !== 'active') { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
    var name = String(ui.nameInput.value || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12) || 'NICO';
    save = freshSave();
    save.name = name;
    save.started = true;
    save.chapter = 0;
    persist();
    ui.nameScreen.hidden = true;
    buildWorld(0);
    startIntroCutscene();
  }

  function continueGame() {
    if (!save || !save.started || save.ending) return;
    if (phaseAt() === 'ended') { showEnded(); return; }
    var showIntro = save.chapter === 0 && !save.seenIntro;
    buildWorld(save.chapter);
    if (showIntro) startIntroCutscene(true);
  }

  function showChapterScreen(index) {
    var chapter = CHAPTERS[clamp(index, 0, CHAPTERS.length - 1)];
    hideScreens();
    ui.chapterScreen.hidden = false;
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.prompt.hidden = true;
    ui.battle.hidden = true;
    ui.dialogue.hidden = true;
    ui.chapterEyebrow.textContent = 'CHAPTER ' + chapter.num;
    ui.chapterTitle.textContent = chapter.title;
    ui.chapterSub.textContent = chapter.sub;
    ui.chapterLines.innerHTML = '';
    chapter.intro.forEach(function (line) {
      var paragraph = document.createElement('p');
      paragraph.textContent = line;
      ui.chapterLines.appendChild(paragraph);
    });
    ui.chapterBegin.textContent = index === 0 ? 'BEGIN YOUR STORY' : 'BEGIN CHAPTER';
    app.dataset.theme = chapter.theme;
    mode = 'chapter';
  }

  function beginChapter() {
    if (!save) return;
    buildWorld(save.chapter);
  }

  function playAgain() {
    var name = save ? save.name : 'NICO';
    save = freshSave();
    save.name = name;
    save.started = true;
    persist();
    showChapterScreen(0);
  }

  function showEnding() {
    if (!save) save = freshSave();
    save.ending = true;
    save.shards = 5;
    persist();
    hideScreens();
    ui.ending.hidden = false;
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.battle.hidden = true;
    ui.dialogue.hidden = true;
    ui.endingLines.innerHTML = '';
    CHAPTERS[CHAPTERS.length - 1].outro.forEach(function (line) {
      var paragraph = document.createElement('p');
      paragraph.textContent = line;
      ui.endingLines.appendChild(paragraph);
    });
    ui.endingStats.textContent = 'LV ' + save.level + ' · ' + save.name + ' · FIVE SHARDS FOUND';
    mode = 'ending';
    view = 'title';
    app.dataset.theme = 'night';
    buildTitleScene();
  }

  /* ------------------------------------------------------------- cutscene */
  /* Voice pitch per speaker: narration floats, Bram rumbles, Pip squeaks. */
  var CUT_VOICE = { 'NARRATOR': 1.3, 'MAYOR BRAM': 0.78, 'PIP': 1.55, 'PLAYER': 1.05 };
  var CUT_FACE = { 'NARRATOR': 'narrator', 'MAYOR BRAM': 'bram', 'PIP': 'pip', 'PLAYER': 'player' };

  function cutsceneNpc() {
    if (!world) return null;
    for (var i = 0; i < world.actors.length; i++) {
      if (world.actors[i].kind === 'npc') return world.actors[i];
    }
    return null;
  }

  function buildCutsceneProps() {
    var star = makeActor('cutscene-star');
    addPart(star, 0xffe08a, [0, 0, 0], [0, 0, 0], [1.1, 1.1, 0.8], { rz: Math.PI / 4 });
    addPart(star, 0xfff6cf, [0, 0, 0], [0, 0, 0], [0.34, 2.4, 0.34], { rz: Math.PI / 4 });
    addPart(star, 0xffd76a, [0, 0, 0], [0, 0, 0], [2.3, 0.3, 0.3]);
    addPart(star, 0xffd76a, [0, 0, 0], [0, 0, 0], [0.3, 2.3, 0.3]);
    addPart(star, 0xffd76a, [0, 0, 0], [0, 0, 0], [1.7, 0.22, 0.22], { rz: 0.78 });
    addPart(star, 0xffd76a, [0, 0, 0], [0, 0, 0], [1.7, 0.22, 0.22], { rz: -0.78 });
    /* High above the archway but close enough to stay in the cutscene frame. */
    star.x = 0; star.y = 5.9; star.z = 6.3;
    pushActor(world.objects, star);
    updateActor(star);
    cutscene.star = star;

    var shard = makeActor('cutscene-shard');
    addPart(shard, 0x9fe6ff, [0, 0, 0], [0, 0, 0], [0.36, 0.95, 0.36], { geo: 'cone6', rz: Math.PI });
    addPart(shard, 0xffffff, [0, 0, 0], [0, 0, 0], [0.55, 0.55, 0.55], { alpha: 0.2 });
    shard.x = 2.2; shard.y = 8.5; shard.z = -5;
    pushActor(world.objects, shard);
    updateActor(shard);
    cutscene.shard = shard;

    /* The fracture that opens across the star when the sky breaks. */
    var crack = makeActor('cutscene-crack');
    addPart(crack, 0x9fe6ff, [0, 0, 0], [0, 0, 0], [0.14, 2.5, 0.14], { rz: 0.4 });
    addPart(crack, 0xe8ffff, [0, 0, 0], [0.46, 0.42, 0.04], [0.1, 1.5, 0.1], { rz: -0.95 });
    addPart(crack, 0xe8ffff, [0, 0, 0], [-0.62, 0.06, 0.04], [0.09, 1.2, 0.09], { rz: 1.2 });
    crack.x = 0; crack.y = 6.0; crack.z = 6.5;
    crack.hidden = true;
    pushActor(world.objects, crack);
    updateActor(crack);
    cutscene.crack = crack;

    /* Glowing shard rain. It hangs hidden in the sky until the star cracks. */
    cutscene.shards = [];
    cutscene.shardsOn = false;
    for (var pieceIndex = 0; pieceIndex < 16; pieceIndex++) {
      var piece = makeActor('cutscene-fall');
      addPart(piece, 0xd8f8ff, [0, 0, 0], [0, 0, 0], [0.3, 0.86, 0.3], { geo: 'cone6', rz: Math.PI });
      addPart(piece, 0x9fe6ff, [0, 0, 0], [0, 0, 0], [0.72, 0.72, 0.72], { alpha: 0.22 });
      piece.x = -5.4 + Math.random() * 10.8;
      piece.z = 7.98 + Math.random() * 0.85;
      piece.y = 1.6 + Math.random() * 6.4;
      piece.fall = 1.5 + Math.random() * 1.8;
      piece.spin = (Math.random() - 0.5) * 4;
      piece.hidden = true;
      pushActor(world.objects, piece);
      updateActor(piece);
      cutscene.shards.push(piece);
    }
  }

  function startIntroCutscene(resume) {
    if (!world) return;
    cutscene.resume = Boolean(resume);
    hideScreens();
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.prompt.hidden = true;
    ui.toast.hidden = true;
    ui.cutscene.hidden = false;
    document.body.classList.remove('ff-talking');
    mode = 'cutscene';
    view = 'cutscene';
    cutscene.active = true;
    cutscene.index = 0;
    cutscene.t = 0;
    cutscene.lines = [
      { who: 'NARRATOR', text: 'Every winter, Roadtown hangs one golden star above the square.' },
      { who: 'NARRATOR', face: 'shard', text: 'This year, the star cracked before midnight.', cue: 'soft' },
      { who: 'MAYOR BRAM', text: 'The sky just broke. Get inside, kid. The cold is coming down the mountain.', cue: 'hard' },
      { who: 'PIP', text: 'Look! A piece landed in the fountain!' },
      { who: 'NARRATOR', text: 'Five shards. One star. One very long night.' }
    ];
    cutscene.typing = false;
    cutscene.speaker = null;
    cutscene.lineT = 0;
    var cast = [player, pip, cutsceneNpc()];
    var marks = [CUTSCENE_MARKS[0], CUTSCENE_MARKS[1], CUTSCENE_MARKS[2]];
    for (var castIndex = 0; castIndex < cast.length; castIndex++) {
      var actor = cast[castIndex];
      if (!actor || !marks[castIndex]) continue;
      actor.x = marks[castIndex][0];
      actor.z = marks[castIndex][1];
      actor.y = 0;
      actor.yaw = 0;
      actor.turnTo = 0;
      actor.squashX = 1;
      actor.squashY = 1;
      actor.lean = 0;
      updateActor(actor);
    }
    buildCutsceneProps();
    showCutsceneLine();
    save.seenIntro = true;
    persist();
    sound('shard');
  }

  /* Who is on screen for a given speaker name. */
  function cutsceneSpeaker(who) {
    if (who === 'MAYOR BRAM') return cutsceneNpc();
    if (who === 'PIP') return pip;
    if (who === 'PLAYER') return player;
    return null;
  }

  /* Everyone angles a little toward the person they are answering, but only
     part way round so their R6 faces stay readable from the camera. */
  function faceCutsceneCast() {
    var npc = cutsceneNpc();
    var focus = npc || player;
    var cast = [player, pip, npc];
    for (var i = 0; i < cast.length; i++) {
      var actor = cast[i];
      if (!actor || !focus) continue;
      var listener = actor === focus ? player : focus;
      if (!listener) continue;
      var directed = Math.atan2(listener.x - actor.x, listener.z - actor.z);
      var eased = ((directed + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      actor.turnTo = eased * 0.45;
    }
  }

  function finishCutsceneLine() {
    cutscene.typing = false;
    cutscene.shown = cutscene.full.length;
    cutscene.lastCount = cutscene.full.length;
    ui.cutText.textContent = cutscene.full;
    ui.cutNext.classList.remove('typing');
  }

  function showCutsceneLine() {
    var line = cutscene.lines[cutscene.index];
    if (!line) return;
    ui.cutSpeaker.textContent = line.who;
    ui.cutFace.className = 'ff-cut-face ' + (line.face || CUT_FACE[line.who] || 'narrator');
    ui.cutNext.textContent = cutscene.index === cutscene.lines.length - 1 ? 'BEGIN CHAPTER ONE' : 'CONTINUE';
    ui.cutNext.classList.add('typing');
    ui.cutText.textContent = '';
    cutscene.full = line.text;
    cutscene.shown = 0;
    cutscene.lastCount = -1;
    cutscene.typing = true;
    cutscene.lineT = 0;
    cutscene.speaker = cutsceneSpeaker(line.who);
    cutscene.pitch = CUT_VOICE[line.who] || 1;
    faceCutsceneCast();
    sound('click');
    if (line.cue === 'soft') triggerSkyCrack(false);
    else if (line.cue === 'hard') triggerSkyCrack(true);
  }

  function flashCutSky() {
    if (!ui.flash) return;
    ui.flash.className = 'ff-flash';
    void ui.flash.offsetWidth;
    ui.flash.className = 'ff-flash sky';
    ui.flash.hidden = false;
    clearTimeout(ui.flashTimer);
    ui.flashTimer = setTimeout(function () { ui.flash.hidden = true; }, 680);
  }

  /* The star breaks: sky flash, camera kick, and the shard rain starts. */
  function triggerSkyCrack(hard) {
    flashCutSky();
    if (cutscene.crack) {
      cutscene.crack.hidden = false;
      updateActor(cutscene.crack);
    }
    cameraPunch(hard ? 0.36 : 0.14);
    if (!hard) { sound('chimeWhite'); return; }
    sound('crack');
    shake();
    cutscene.shardsOn = true;
    clearTimeout(cutscene.secondFlash);
    cutscene.secondFlash = setTimeout(flashCutSky, 260);
  }

  function advanceCutscene() {
    if (!cutscene.active) return;
    if (cutscene.typing) { finishCutsceneLine(); return; }
    cutscene.index += 1;
    if (cutscene.index >= cutscene.lines.length) { endCutscene(); return; }
    showCutsceneLine();
  }

  function endCutscene() {
    var resume = cutscene.resume;
    cutscene.active = false;
    cutscene.resume = false;
    cutscene.typing = false;
    cutscene.shardsOn = false;
    cutscene.speaker = null;
    ui.cutscene.hidden = true;
    ui.flash.hidden = true;
    clearTimeout(cutscene.secondFlash);
    clearTimeout(ui.flashTimer);
    cutscene.star = null;
    cutscene.shard = null;
    cutscene.crack = null;
    cutscene.shards = [];
    [player, pip].forEach(function (actor) {
      if (!actor) return;
      actor.y = 0;
      actor.squashX = 1;
      actor.squashY = 1;
      actor.lean = 0;
    });
    /* Continuing a chapter-one save returns straight to the world; a new
       story still gets the chapter card. */
    if (resume && save) { buildWorld(save.chapter); return; }
    showChapterScreen(0);
  }

  function updateCutscene(dt, time) {
    if (!cutscene.active) return;
    cutscene.t += dt;

    /* Typewriter reveal with a retro voice blip every couple of letters. */
    if (cutscene.typing) {
      cutscene.shown = Math.min(cutscene.full.length, cutscene.shown + dt * 40);
      var visible = Math.floor(cutscene.shown);
      if (visible !== cutscene.lastCount) {
        ui.cutText.textContent = cutscene.full.slice(0, visible);
        var letter = cutscene.full.charAt(visible - 1);
        if (visible % 2 === 0 && letter && letter !== ' ') {
          sound('blip', cutscene.pitch + (visible % 5) * 0.03);
        }
        cutscene.lastCount = visible;
      }
      if (cutscene.shown >= cutscene.full.length) finishCutsceneLine();
    }

    /* Per-line hop and squash on whoever is talking, plus the turn-in. */
    cutscene.lineT += dt;
    var cast = [player, pip, cutsceneNpc()];
    for (var c = 0; c < cast.length; c++) {
      var actor = cast[c];
      if (!actor) continue;
      var speaking = actor === cutscene.speaker;
      var beat = speaking ? Math.min(1, cutscene.lineT / 0.46) : 1;
      var bounce = speaking ? Math.abs(Math.sin(beat * Math.PI)) : 0;
      actor.squashY = 1 + bounce * 0.2;
      actor.squashX = 1 - bounce * 0.1;
      actor.y = bounce * 0.32;
      actor.lean = bounce * 0.05 * (actor.x < 0 ? 1 : -1);
      actor.yaw = lerp(actor.yaw, actor.turnTo === undefined ? 0 : actor.turnTo, Math.min(1, dt * 8));
      updateActor(actor);
    }

    if (cutscene.star) {
      cutscene.star.y = 5.9 + Math.sin(time * 1.4) * 0.14;
      cutscene.star.yaw += dt * 0.35;
      updateActor(cutscene.star);
    }
    if (cutscene.crack) {
      var glow = 0.55 + Math.abs(Math.sin(time * 6.4)) * 0.45;
      for (var p = 0; p < cutscene.crack.parts.length; p++) cutscene.crack.parts[p].obj.alpha = glow;
      cutscene.crack.yaw += dt * 0.12;
      updateActor(cutscene.crack);
    }
    if (cutscene.shard) {
      var fall = Math.min(1, cutscene.t / 7);
      cutscene.shard.y = 8.5 - 5.6 * fall;
      cutscene.shard.x = 2.2 + Math.sin(cutscene.t * 1.7) * 0.3;
      cutscene.shard.yaw += dt * 1.6;
      updateActor(cutscene.shard);
    }
    if (cutscene.shardsOn) {
      for (var s = 0; s < cutscene.shards.length; s++) {
        var piece = cutscene.shards[s];
        piece.hidden = false;
        piece.y -= piece.fall * dt;
        piece.yaw += piece.spin * dt;
        if (piece.y < 0.9) {
          piece.y = 7.2 + Math.random() * 2.2;
          piece.x = -5.4 + Math.random() * 10.8;
        }
        updateActor(piece);
      }
    }

    /* Camera stands in front of the archway, aimed a touch low so the sign
       and the star sit high in frame and the cast lands above the panel. */
    var dolly = Math.min(1, cutscene.t / 34);
    renderer.setCamera(
      [0.1 - dolly * 0.1, 2.0 + dolly * 0.1, 16.6 - dolly * 1.1],
      [0, -0.8, 9.1],
      50 * Math.PI / 180,
      CUTSCENE_ORTHO
    );
  }

  function scaleEnemyForParty(def) {
    var count = Math.max(1, Math.min(PARTY.max, PARTY.active.length || 1));
    if (count === 1) return def;
    var multiplier = count === 2 ? 1.3 : count === 3 ? 1.5 : 2;
    var scaled = Object.assign({}, def);
    scaled.hp = Math.round(def.hp * multiplier);
    scaled.enemyEvery = 1;
    scaled.partySize = count;
    return scaled;
  }

  function partyReady() {
    return PARTY.active.length <= 1 || PARTY.ready >= PARTY.active.length;
  }

  /* ---------------------------------------------------------------- world */
  function addNpc(chapter, index) {
    var actor = buildHero(PALETTES[chapter.npc.palette] || PALETTES.bram);
    actor.kind = 'npc';
    actor.x = chapter.npc.x;
    actor.z = chapter.npc.z;
    actor.yaw = 0;
    actor.phase = Math.random() * 6;
    addActor(actor);
    world.interactables.push({
      x: chapter.npc.x, z: chapter.npc.z, r: 2.5, label: 'TALK',
      action: function () {
        talk(chapter.npc.name, chapter.npc.lines, function () {
          var key = 'c' + (index + 1);
          if (!save.talked[key]) {
            save.talked[key] = true;
            updateObjective();
            persist();
          }
        });
      }
    });
  }

  function spawnEnemies(chapter) {
    chapter.shades.forEach(function (shade) {
      if (save.defeated[shade.key]) return;
      var actor = buildEnemy(chapter.shadeModel);
      actor.x = shade.x;
      actor.z = shade.z;
      actor.y = actor.baseY;
      actor.yaw = Math.PI * 0.25;
      actor.phase = Math.random() * 6;
      addActor(actor);
      var item = {
        x: shade.x, z: shade.z, r: 2.6, label: 'STRIKE', auto: true, cooldown: 0, enemy: true, opening: 0,
        action: function () {
          item.cooldown = Date.now() + 5000;
          var toPlayer = Math.atan2(player.x - actor.x, player.z - actor.z);
          var facing = Math.abs(((toPlayer - actor.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          var advantage = item.opening ? 'player' : facing > 2.0 ? 'player' : facing < 0.9 ? 'enemy' : 'neutral';
          var opening = item.opening || 0;
          item.opening = 0;
          startBattle(
            { name: shade.name, hp: shade.hp, atk: shade.atk, xp: shade.xp, model: chapter.shadeModel, agility: 5 },
            {
              advantage: advantage,
              opening: opening,
              onWin: function () {
                save.defeated[shade.key] = true;
                actor.hidden = true;
                item.disabled = true;
                updateObjective();
                persist();
                toast('THE SHADE DISPERSES.');
              }
            }
          );
        }
      };
      world.interactables.push(item);
    });

    var boss = chapter.boss;
    if (save.defeated[boss.key + '-shard']) return;
    if (save.defeated[boss.key]) { spawnShard(chapter); return; }

    var bossActor = buildEnemy(boss.model);
    bossActor.x = boss.x;
    bossActor.z = boss.z;
    bossActor.scale = boss.model === 'night' ? 1.6 : 1.45;
    bossActor.y = bossActor.baseY * bossActor.scale;
    bossActor.yaw = Math.PI;
    bossActor.phase = Math.random() * 6;
    addActor(bossActor);

    var bossItem = {
      x: boss.x, z: boss.z, r: 3.0, label: 'CHALLENGE',
      action: function () {
        var remaining = chapter.shades.filter(function (shade) { return !save.defeated[shade.key]; }).length;
        if (remaining > 0) {
          talk(boss.name, ['THE COLD IS TOO THICK. CLEAR THE SHADES FIRST (' + remaining + ' LEFT).'], null);
          return;
        }
        talk(boss.name, boss.intro, function () {
          startBattle(
            { name: boss.name, hp: boss.hp, atk: boss.atk, xp: boss.xp, model: boss.model, boss: true, agility: 4 },
            {
              onWin: function () {
                save.defeated[boss.key] = true;
                bossActor.hidden = true;
                bossItem.disabled = true;
                updateObjective();
                persist();
                spawnShard(chapter);
              }
            }
          );
        });
      }
    };
    world.interactables.push(bossItem);
  }

  function spawnShard(chapter) {
    var shard = buildShardActor();
    shard.x = chapter.boss.x;
    shard.z = chapter.boss.z;
    shard.y = 0.7;
    addActor(shard);
    var item = {
      x: chapter.boss.x, z: chapter.boss.z, r: 2.8, label: 'TAKE THE SHARD',
      action: function () {
        item.disabled = true;
        talk('AURORA SHARD', chapter.outro, grantShard);
      }
    };
    world.interactables.push(item);
  }

  function grantShard() {
    var chapter = CHAPTERS[save.chapter];
    save.shards = Math.min(5, save.shards + 1);
    save.defeated[chapter.boss.key + '-shard'] = true;
    persist();
    updateHud();
    sound('shard');
    if (save.shards >= 5 || save.chapter >= CHAPTERS.length - 1) {
      save.shards = 5;
      showEnding();
      return;
    }
    save.chapter += 1;
    save.hp = save.maxHp;
    save.sp = save.maxSp;
    save.cocoa = Math.min(9, save.cocoa + 1);
    persist();
    showChapterScreen(save.chapter);
  }

  function buildWorld(index) {
    if (!save) return;
    index = clamp(index, 0, CHAPTERS.length - 1);
    save.chapter = index;
    var chapter = CHAPTERS[index];
    if (world && world.geometries && renderer) {
      world.geometries.forEach(function (geo) { renderer.releaseGeometry(geo); });
    }
    world = { objects: [], colliders: [], interactables: [], actors: [], geometries: [], chapter: index, theme: chapter.theme, spawn: chapter.spawn.slice() };
    chapter.build();
    flushStuds();
    player = buildHero(heroPalette());
    player.x = chapter.spawn[0];
    player.z = chapter.spawn[1];
    player.yaw = Math.PI;
    addActor(player);
    pip = buildPip();
    pip.x = chapter.spawn[0] + 1.7;
    pip.z = chapter.spawn[1] + 1.6;
    pip.yaw = Math.PI;
    addActor(pip);
    pipTrail = [];
    for (var trailIndex = 0; trailIndex < 12; trailIndex++) pipTrail.push({ x: pip.x, z: pip.z });
    pipTimer = 0;
    addNpc(chapter, index);
    spawnEnemies(chapter);
    camera.yaw = 0.2;
    camera.pitch = 0.44;
    camera.dist = 16;
    camera.ortho = baseOrtho();
    camera.punch = 0;
    snapCamera();
    renderer.setScene({ objects: world.objects, fogColor: chapter.fog, fogNear: 22, fogFar: 70 });
    app.dataset.theme = chapter.theme;
    hideScreens();
    view = 'world';
    mode = 'world';
    ui.hud.hidden = false;
    ui.objective.hidden = false;
    ui.touch.hidden = false;
    ui.prompt.hidden = true;
    ui.dialogue.hidden = true;
    ui.battle.hidden = true;
    updateHud();
    updateObjective();
    placeObjective();
    requestAnimationFrame(placeObjective);
    persist();
    toast('CHAPTER ' + chapter.num + ' · ' + chapter.title, 3200);
  }

  function updateHud() {
    if (!save) return;
    ui.hudName.textContent = save.name;
    ui.hudLevel.textContent = save.level;
    ui.hudChapter.textContent = 'CHAPTER ' + CHAPTERS[clamp(save.chapter, 0, 4)].num;
    ui.hudHp.style.width = clamp(save.hp / save.maxHp * 100, 0, 100) + '%';
    ui.hudSp.style.width = clamp(save.sp / save.maxSp * 100, 0, 100) + '%';
    ui.hudHpText.textContent = save.hp + '/' + save.maxHp;
    ui.hudSpText.textContent = save.sp + '/' + save.maxSp;
    ui.hudBp.textContent = save.bp;
    ui.hudShards.textContent = save.shards;
    if (ui.hudBpBar) {
      var spentBp = cardCost();
      var totalBp = Math.max(1, spentBp + save.bp);
      ui.hudBpBar.style.width = clamp(spentBp / totalBp * 100, 0, 100) + '%';
      if (ui.hudBpText) ui.hudBpText.textContent = spentBp + '/' + totalBp;
    }
    placeObjective();
  }

  function placeObjective() {
    /* The objective card lives in the bottom-left corner (CSS positions it),
       so it never sits on top of the ROADTOWN sign or the characters. */
    if (!ui.objective) return;
    ui.objective.style.top = '';
  }

  function updateObjective() {
    if (!save) return;
    var chapter = CHAPTERS[clamp(save.chapter, 0, 4)];
    if (!chapter) return;
    var total = chapter.shades.length;
    var done = chapter.shades.filter(function (shade) { return save.defeated[shade.key]; }).length;
    var text;
    if (save.defeated[chapter.boss.key + '-shard']) text = 'The shard is yours';
    else if (save.defeated[chapter.boss.key]) text = 'Take the shard';
    else if (done >= total) text = 'Face ' + chapter.boss.name;
    else if (!save.talked['c' + (save.chapter + 1)]) text = 'Talk to ' + chapter.npc.name;
    else text = 'Clear the shades (' + done + ' / ' + total + ')';
    ui.objectiveText.textContent = text;
    ui.menuObjective.textContent = text;
  }

  /* -------------------------------------------------------------- dialogue */
  function talk(speaker, lines, onDone) {
    if (!lines || !lines.length) { if (onDone) onDone(); return; }
    dialogue = { lines: lines.slice(), index: 0, speaker: speaker, onDone: onDone || null };
    ui.speaker.textContent = speaker;
    ui.dialogueText.textContent = lines[0];
    ui.dialogue.hidden = false;
    ui.prompt.hidden = true;
    ui.touch.hidden = true;
    document.body.classList.add('ff-talking');
    mode = 'dialogue';
    sound('click');
  }

  function advanceDialogue() {
    if (mode !== 'dialogue') return;
    dialogue.index += 1;
    if (dialogue.index >= dialogue.lines.length) {
      ui.dialogue.hidden = true;
      mode = 'world';
      document.body.classList.remove('ff-talking');
      ui.touch.hidden = false;
      var callback = dialogue.onDone;
      dialogue = { lines: [], index: 0, speaker: '', onDone: null };
      if (callback) callback();
      return;
    }
    ui.dialogueText.textContent = dialogue.lines[dialogue.index];
    sound('click');
  }

  /* -------------------------------------------------------------- movement */
  function blocked(x, z) {
    if (!world) return false;
    for (var i = 0; i < world.colliders.length; i++) {
      var collider = world.colliders[i];
      if (Math.abs(x - collider.x) < collider.hw + 0.42 && Math.abs(z - collider.z) < collider.hd + 0.42) return true;
    }
    return false;
  }

  function handleMovement(dt) {
    var forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touchMove.y;
    var strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchMove.x;
    if (Math.abs(forward) < 0.06 && Math.abs(strafe) < 0.06) { player.moving = false; return; }
    var length = Math.hypot(forward, strafe) || 1;
    forward /= length;
    strafe /= length;
    var sin = Math.sin(camera.yaw);
    var cos = Math.cos(camera.yaw);
    var dx = -sin * forward + cos * strafe;
    var dz = -cos * forward - sin * strafe;
    var speed = (keys.ShiftLeft || keys.ShiftRight) ? 6.4 : 4.6;
    var nextX = player.x + dx * speed * dt;
    var nextZ = player.z + dz * speed * dt;
    if (!blocked(nextX, player.z)) player.x = nextX;
    if (!blocked(player.x, nextZ)) player.z = nextZ;
    player.x = clamp(player.x, -28, 28);
    player.z = clamp(player.z, -28, 28);
    var targetYaw = Math.atan2(dx, dz);
    var difference = ((targetYaw - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    player.yaw += difference * Math.min(1, dt * 12);
    player.walk += dt * 11;
    player.moving = true;
  }

  /* Portrait screens need a wider ortho box, otherwise the ROADTOWN gantry
     leaves the frame at spawn. Desktop stays tight and low. */
  function baseOrtho() {
    // Keep at least ~12.6 world units across the screen so the ROADTOWN gantry
    // never clips, then let tall screens pull back rather than crop.
    var aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return clamp(12.6 / aspect, 14, 26);
  }

  function cameraPunch(amount) {
    camera.punch = Math.max(camera.punch, amount);
    stage.classList.remove('ff-punch');
    void stage.offsetWidth;
    stage.classList.add('ff-punch');
    clearTimeout(punchTimer);
    punchTimer = setTimeout(function () { stage.classList.remove('ff-punch'); }, 190);
  }

  function punchOffset() {
    if (camera.punch <= 0.001) return [0, 0, 0];
    var t = performance.now();
    return [Math.sin(t * 0.075) * camera.punch, Math.cos(t * 0.11) * camera.punch * 0.7, 0];
  }

  function snapCamera() {
    if (!player) return;
    camera.target = [player.x, player.y + 1.05, player.z];
    var flat = Math.cos(camera.pitch) * camera.dist;
    var kick = punchOffset();
    camera.eye = [
      camera.target[0] + Math.sin(camera.yaw) * flat + kick[0],
      camera.target[1] + Math.sin(camera.pitch) * camera.dist + kick[1],
      camera.target[2] + Math.cos(camera.yaw) * flat
    ];
    renderer.setCamera(camera.eye, camera.target, 55 * Math.PI / 180, camera.ortho);
  }

  function updateCamera(dt) {
    var target = [player.x, player.y + 1.05, player.z];
    var flat = Math.cos(camera.pitch) * camera.dist;
    var kick = punchOffset();
    var eye = [
      target[0] + Math.sin(camera.yaw) * flat + kick[0],
      target[1] + Math.sin(camera.pitch) * camera.dist + kick[1],
      target[2] + Math.cos(camera.yaw) * flat
    ];
    for (var i = 0; i < 3; i++) {
      camera.target[i] = lerp(camera.target[i], target[i], Math.min(1, dt * 9));
      camera.eye[i] = lerp(camera.eye[i], eye[i], Math.min(1, dt * 7));
    }
    camera.punch = Math.max(0, camera.punch - dt * 26);
    renderer.setCamera(camera.eye, camera.target, 55 * Math.PI / 180, camera.ortho);
  }

  function nearestInteractable() {
    if (!world || !player) return null;
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < world.interactables.length; i++) {
      var item = world.interactables[i];
      if (item.disabled) continue;
      var distance = Math.hypot(player.x - item.x, player.z - item.z);
      if (distance < item.r && distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    return best;
  }

  function updatePrompt() {
    nearestItem = mode === 'world' ? nearestInteractable() : null;
    ui.prompt.hidden = !nearestItem;
    if (nearestItem) ui.promptText.textContent = nearestItem.label;
  }

    /* E is also an action button: near a shade it is a real pre-emptive swing
     worth 1-2 opening damage, everywhere else it pokes the scenery. */
  function overworldStrike(item) {
    if (player.swing > 0) return;
    player.swing = SWING_TIME;
    player.yaw = Math.atan2(item.x - player.x, item.z - player.z);
    updateActor(player);
    item.opening = 1 + (Math.random() < 0.5 ? 1 : 0);
    sound('swing');
    slashFx();
    cameraPunch(0.18);
    item.action();
  }

  function slashFx() {
    if (!ui.slash) return;
    ui.slash.hidden = false;
    ui.slash.classList.remove('on');
    void ui.slash.offsetWidth;
    ui.slash.classList.add('on');
    clearTimeout(ui.slashTimer);
    ui.slashTimer = setTimeout(function () { ui.slash.hidden = true; }, 320);
  }

  function interact() {
    if (mode === 'dialogue') { advanceDialogue(); return; }
    if (mode !== 'world') return;
    if (!nearestItem) return;
    if (nearestItem.enemy) { overworldStrike(nearestItem); return; }
    sound('click');
    nearestItem.action();
  }

  function updateWorld(dt, time) {
    if (mode === 'world') handleMovement(dt);
    else player.moving = false;

    /* Snappy 4-pose walk: limbs snap between poses instead of sliding, and
       the torso squashes on each footfall like a plastic toy. */
    var walkSin = Math.sin(player.walk);
    var step = player.moving ? (walkSin > 0.55 ? 1 : walkSin < -0.55 ? -1 : walkSin * 0.3) : 0;
    var bounce = player.moving ? Math.abs(Math.cos(player.walk)) : 0;
    player.legL.rx = step * 0.82;
    player.legR.rx = -step * 0.82;
    player.armL.rx = -step * 0.72;
    player.armR.rx = step * 0.72;
    player.squashY = 1 + bounce * 0.075;
    player.squashX = 1 - bounce * 0.05;
    player.lean = -step * 0.055;
    player.tiltX = player.moving ? 0.05 : 0;
    player.y = bounce * 0.09;
    if (player.swing > 0) {
      player.swing = Math.max(0, player.swing - dt);
      var swingK = 1 - player.swing / SWING_TIME;
      player.armR.rx = -2.2 + swingK * 3.3;
      player.armL.rx = 0.5 - swingK * 0.8;
      player.tiltX = 0.15 - swingK * 0.2;
      player.squashY = 1.04;
      player.squashX = 0.96;
    }

    pipTimer += dt;
    if (pipTimer >= 0.12) {
      pipTrail.unshift({ x: player.x, z: player.z });
      if (pipTrail.length > 20) pipTrail.pop();
      pipTimer = 0;
    }
    var desiredX = player.x + Math.cos(camera.yaw) * 1.7 + Math.sin(camera.yaw) * 1.9;
    var desiredZ = player.z - Math.sin(camera.yaw) * 1.7 + Math.cos(camera.yaw) * 1.9;
    var pdx = desiredX - pip.x;
    var pdz = desiredZ - pip.z;
    var pdistance = Math.hypot(pdx, pdz);
    if (pdistance > 0.06) {
      pip.x += pdx * Math.min(1, dt * 4);
      pip.z += pdz * Math.min(1, dt * 4);
      pip.walk += dt * 9 * Math.min(1, pdistance);
      pip.yaw = Math.atan2(pdx, pdz);
      pip.y = Math.abs(Math.sin(pip.walk)) * 0.05;
    } else {
      pip.y = lerp(pip.y, 0, Math.min(1, dt * 6));
    }

    for (var i = 0; i < world.actors.length; i++) {
      var actor = world.actors[i];
      if (actor === player || actor === pip || actor.hidden) continue;
      if (actor.kind === 'npc') {
        actor.y = Math.sin(time * 1.4 + actor.phase) * 0.02;
        actor.yaw = Math.sin(time * 0.5 + actor.phase) * 0.18;
      } else if (actor.kind === 'enemy') {
        actor.y = actor.baseY * actor.scale + Math.sin(time * 1.9 + actor.phase) * 0.12;
      } else if (actor.kind === 'crystal') {
        actor.y = 0.7 + Math.sin(time * 2.1) * 0.14;
        actor.yaw += dt * 0.9;
      }
    }

    for (var j = 0; j < world.actors.length; j++) updateActor(world.actors[j]);
    updateCamera(dt);
    updatePrompt();
    if (mode === 'world' && !battle) {
      for (var k = 0; k < world.interactables.length; k++) {
        var item = world.interactables[k];
        if (!item.auto || item.disabled || Date.now() < item.cooldown) continue;
        if (Math.hypot(player.x - item.x, player.z - item.z) < 1.3) {
          item.cooldown = Date.now() + 5000;
          item.action();
          break;
        }
      }
    }
  }
/*
 * Frostfall game — part 3b (battle, level-up, menu, input, loop, startup).
 * This file is appended into js/frostfall.js by the build step and then removed.
 */

  /* ----------------------------------------------------------- battle scene */
  var CARDS = [
    { id: 'warm-heart', name: 'WARM HEART', cost: 2, desc: '+6 max HP while equipped.', mods: { maxHp: 6 } },
    { id: 'ice-fang', name: 'ICE FANG', cost: 3, desc: '+2 damage on attacks and skills.', mods: { attack: 2 } },
    { id: 'guard-charm', name: 'GUARD CHARM', cost: 2, desc: 'Wider guard and superguard windows.', mods: { guardMs: 160 } },
    { id: 'second-wind', name: 'SECOND WIND', cost: 4, desc: 'Get up once per battle at 5 HP.', mods: { revive: true } },
    { id: 'swift-boots', name: 'SWIFT BOOTS', cost: 2, desc: '+3 agility: act before the enemy.', mods: { agility: 3 } },
    { id: 'snowball', name: 'SNOWBALL CHARM', cost: 3, desc: 'Skills cost 1 less SP.', mods: { skillDiscount: 1 } },
    { id: 'ante-up', name: 'ANTE UP', cost: 3, desc: 'Narrow gold zone, but PERFECT hits deal 2× damage.', mods: { narrow: 1, ante: true } },
    { id: 'glass-cannon', name: 'GLASS CANNON', cost: 3, desc: '+3 attack, but every hit you take deals +2.', mods: { attack: 3, incoming: 2 } }
  ];

  function equippedCards() {
    return (save && Array.isArray(save.cards)) ? save.cards : [];
  }

  function cardMods() {
    var mods = { maxHp: 0, attack: 0, guardMs: 0, revive: false, agility: 0, skillDiscount: 0, narrow: 0, incoming: 0, ante: false };
    equippedCards().forEach(function (id) {
      CARDS.forEach(function (card) {
        if (card.id !== id) return;
        Object.keys(card.mods).forEach(function (key) {
          if (typeof mods[key] === 'boolean') mods[key] = true;
          else mods[key] += card.mods[key];
        });
      });
    });
    return mods;
  }

  function cardCost() {
    var total = 0;
    equippedCards().forEach(function (id) {
      CARDS.forEach(function (card) { if (card.id === id) total += card.cost; });
    });
    return total;
  }

  function renderCards() {
    if (!ui.cards) return;
    ui.cards.innerHTML = '';
    var spent = cardCost();
    CARDS.forEach(function (card) {
      var equipped = equippedCards().indexOf(card.id) >= 0;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ff-card-btn' + (equipped ? ' equipped' : '');
      button.dataset.card = card.id;
      button.disabled = !equipped && spent + card.cost > save.bp;
      button.innerHTML = '<b>' + card.name + '</b><small>' + card.desc + '</small><em>' + card.cost + ' BP' + (equipped ? ' · EQUIPPED' : '') + '</em>';
      ui.cards.appendChild(button);
    });
    ui.cardBudget.textContent = 'BP ' + spent + ' / ' + save.bp;
  }

  function toggleCard(id) {
    if (!save || mode !== 'menu') return;
    var card = null;
    CARDS.forEach(function (entry) { if (entry.id === id) card = entry; });
    if (!card) return;
    var index = equippedCards().indexOf(id);
    if (index >= 0) {
      save.cards.splice(index, 1);
      if (card.mods.maxHp) {
        save.maxHp = Math.max(1, save.maxHp - card.mods.maxHp);
        save.hp = clamp(save.hp, 1, save.maxHp);
      }
    } else {
      if (cardCost() + card.cost > save.bp) { toast('NOT ENOUGH BP FOR THAT CARD.'); return; }
      save.cards.push(id);
      if (card.mods.maxHp) {
        save.maxHp += card.mods.maxHp;
        save.hp = Math.min(save.maxHp, save.hp + card.mods.maxHp);
      }
    }
    persist();
    updateHud();
    renderCards();
    ui.menuHp.textContent = save.hp + ' / ' + save.maxHp;
    ui.menuSp.textContent = save.sp + ' / ' + save.maxSp;
    ui.menuBp.textContent = save.bp;
    sound('click');
  }

  function buildBattleScene(def) {
    battleObjects = [];
    function bpush(x, y, z, sx, sy, sz, color, opts) {
      opts = opts || {};
      battleObjects.push(makeStatic(opts.geo || 'cube', x, y, z, sx, sy, sz, color, opts));
    }
    for (var ix = -4; ix <= 4; ix++) {
      for (var iz = -3; iz <= 8; iz++) {
        bpush(ix * 1.55, -0.2, iz * 1.55, 1.55, 0.35, 1.55, (ix + iz) % 2 === 0 ? 0x5f9ae6 : 0x2f5fa8);
      }
    }
    bpush(0, -0.5, 0.6, 24, 0.4, 28, 0x1b3566);
    bpush(-5.4, 1.6, -4.2, 1.4, 4.6, 1.4, 0x3f6cb8);
    bpush(5.4, 1.6, -4.2, 1.4, 4.6, 1.4, 0x3f6cb8);
    bpush(-5.4, 4.2, -4.2, 2.0, 0.5, 2.0, 0x7ce7ff, { alpha: 0.2 });
    bpush(5.4, 4.2, -4.2, 2.0, 0.5, 2.0, 0x7ce7ff, { alpha: 0.2 });
    bpush(0, 5.4, -6.4, 12, 0.4, 2, 0x7bc9ff, { alpha: 0.12 });
    bpush(0, -0.19, 0.6, 15, 0.02, 10, 0x0d0718, { alpha: 0.25 });
    battlePlayer = buildHero(heroPalette());
    battlePlayer.x = -2.1;
    battlePlayer.z = 1.7;
    battlePlayer.yaw = 0.72;
    battlePlayer.scale = 0.86;
    battleEnemy = buildEnemy(def.model);
    battleEnemy.x = 2.05;
    battleEnemy.z = 1.0;
    battleEnemy.yaw = -0.72;
    battleEnemy.scale = def.boss ? 1.28 : 1.05;
    battleEnemy.y = battleEnemy.baseY * battleEnemy.scale;
    pushActor(battleObjects, battlePlayer);
    pushActor(battleObjects, battleEnemy);
    updateActor(battlePlayer);
    updateActor(battleEnemy);
    renderer.setScene({ objects: battleObjects, fogColor: [0.26, 0.19, 0.46], fogNear: 16, fogFar: 44 });
    /* Fighters sit ~4 units apart; portrait phones need a wider ortho box or
       the boss's arms clip off the right edge. The camera looks low so both
       battlers stand in the upper stage, clear of the command plate. */
    var battleFit = window.innerWidth / Math.max(1, window.innerHeight) < 0.9 ? 17 : 14.5;
    renderer.setCamera([0, 3.3, 12.2], [0, -0.2, 0.9], 52 * Math.PI / 180, battleFit);
  }

  function updateBattle(dt, time) {
    if (!battle || !battlePlayer || !battleEnemy) return;
    var anim = battle.anim;
    battlePlayer.x = -1.7 + anim.p * 1.1;
    battleEnemy.x = 1.8 - anim.e * 1.1;
    anim.p = Math.max(0, anim.p - dt * 3.2);
    anim.e = Math.max(0, anim.e - dt * 3.2);
    battlePlayer.y = Math.abs(Math.sin(time * 2.4)) * 0.04;
    battlePlayer.yaw = 0.72 + Math.sin(time * 0.8) * 0.03;
    battleEnemy.y = battleEnemy.baseY * battleEnemy.scale + Math.sin(time * 1.9) * 0.1;
    battlePlayer.legL.rx = Math.sin(time * 2) * 0.05;
    battlePlayer.legR.rx = -Math.sin(time * 2) * 0.05;
    battlePlayer.armL.rx = -anim.p * 0.6;
    battlePlayer.armR.rx = -anim.p * 2.5;
    battlePlayer.tiltX = anim.p * 0.18;
    battlePlayer.squashY = 1 + anim.p * 0.06;
    battlePlayer.squashX = 1 - anim.p * 0.04;
    if (battle.lunge > 0) battle.lunge = Math.max(0, battle.lunge - dt * 4);
    battleEnemy.tiltX = battle.windup ? -0.26 : battle.lunge > 0 ? 0.34 : 0;
    battleEnemy.squashY = battle.windup ? 0.9 : 1;
    battleEnemy.squashX = battle.windup ? 1.1 : 1;
    battleEnemy.lean = battle.lunge > 0 ? 0.28 : 0;
    updateActor(battlePlayer);
    updateActor(battleEnemy);

    // Rolling HP: save.hp is the real value, battle.displayHp drains toward it.
    var target = save.hp;
    if (battle.displayHp > target) battle.displayHp = Math.max(target, battle.displayHp - dt * 12);
    else if (battle.displayHp < target) battle.displayHp = Math.min(target, battle.displayHp + dt * 40);
    ui.battleHp.textContent = Math.max(0, Math.ceil(battle.displayHp)) + '/' + save.maxHp;
    ui.battleHpBar.style.width = clamp(battle.displayHp / save.maxHp * 100, 0, 100) + '%';
    ui.battleSp.textContent = save.sp + '/' + save.maxSp;
    ui.battleSpBar.style.width = clamp(save.sp / save.maxSp * 100, 0, 100) + '%';
    var liveBp = cardCost();
    if (ui.battleBpBar) ui.battleBpBar.style.width = clamp(liveBp / Math.max(1, liveBp + save.bp) * 100, 0, 100) + '%';
    if (ui.battleBp) ui.battleBp.textContent = save.bp;
    ui.battleLevel.textContent = save.level;
    ui.cocoa.textContent = save.cocoa;
    if (battle.mortal && battle.displayHp <= 0.05 && !battle.ended) {
      battle.displayHp = 0;
      loseBattle();
      return;
    }
    if (battle.window) {
      var w = battle.window;
      var now = Date.now();
      if (!ui.timing.hidden) {
        var span = Math.max(1, w.closeAt - w.startAt);
        var progress = clamp((now - w.startAt) / span, 0, 1);
        ui.timingMarker.style.left = (progress * 100) + '%';
      }
      if (!w.resolving && now >= w.closeAt) {
        w.resolving = true;
        if (w.type === 'strike') resolvePlayerMove(w.move, w.quality || 'miss');
        else if (w.type === 'guard') resolveEnemyHit(w.telegraph, w.superguard ? 'superguard' : w.guard ? 'guard' : null);
        else if (w.type === 'unblockable') resolveEnemyHit('unblockable', null);
      }
    }
  }

  function hideSkills() {
    ui.skills.hidden = true;
    ui.actions.hidden = false;
    ui.battleHint.textContent = 'CHOOSE AN ACTION';
  }

  function hideBattle() {
    ui.battle.hidden = true;
    ui.battle.classList.remove('ff-mortal');
    ui.levelup.hidden = true;
    ui.skills.hidden = true;
    ui.actions.hidden = false;
    ui.timing.hidden = true;
    ui.telegraph.hidden = true;
    ui.battleHint.textContent = 'CHOOSE AN ACTION';
  }

  function log(text) {
    ui.battleLog.textContent = text;
  }

  function flashEnemy() {
    if (!battleEnemy) return;
    battleEnemy.hidden = true;
    setTimeout(function () { if (battleEnemy) battleEnemy.hidden = false; }, 90);
  }

  function setBattleButtons(enabled) {
    var buttons = ui.actions.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !enabled;
      if (enabled && buttons[i].dataset.act === 'item' && save.cocoa <= 0) buttons[i].disabled = true;
      if (enabled && buttons[i].dataset.act === 'run' && battle && battle.def.boss) buttons[i].disabled = true;
    }
    if (enabled) selectAction(battleSelect, true);
  }

  /* Block Tales-style cursor: a highlighted card you can drive with arrows,
     number keys or the pointer, confirmed with E / Enter / Space. */
  function actionButtons() {
    if (!ui.actions) return [];
    return Array.prototype.slice.call(ui.actions.querySelectorAll('button'));
  }

  function selectAction(index, silent) {
    var buttons = actionButtons();
    if (!buttons.length) return;
    var count = buttons.length;
    var next = ((index % count) + count) % count;
    for (var i = 0; i < count; i++) buttons[i].classList.toggle('selected', i === next && !buttons[i].disabled);
    battleSelect = next;
    if (!silent) sound('menu');
  }

  function activateSelected() {
    var buttons = actionButtons();
    var button = buttons[battleSelect];
    if (!button || button.disabled) { sound('deny'); return; }
    chooseAction(button.dataset.act);
  }

  function timingFlash() {
    if (!ui.timing) return;
    ui.timing.classList.add('hit');
    setTimeout(function () { if (ui.timing) ui.timing.classList.remove('hit'); }, 220);
  }

  function updateGimmickUi() {
    if (!ui.gimmick) return;
    var g = battle && battle.gimmick;
    var text = '';
    if (g) {
      if (g.burrowed) text = 'BURROWED · YOUR NEXT HIT IS HALVED';
      else if (g.coils > 0) text = 'ARMORED COILS · ' + g.coils + ' LEFT · PERFECT BREAKS ONE';
      else if (g.threshold) text = 'ECHO ' + g.charge + '/3 · ' + Math.max(0, g.threshold - (g.chargeDamage || 0)) + ' DAMAGE TO BREAK IT';
      else if (g.obscured) text = 'THE DARK HIDES THE BEAT · USE WARMTH';
      else if (g.burrowEvery) text = 'BURROWS EVERY ' + g.burrowEvery + 'RD TURN';
      else text = g.name || '';
    }
    ui.gimmick.hidden = !text;
    ui.gimmick.textContent = text;
  }

  function updateBattleUI() {
    if (!battle) return;
    updateGimmickUi();
    ui.enemyHp.style.width = clamp(battle.hp / battle.max * 100, 0, 100) + '%';
    ui.enemyHpText.textContent = battle.hp + ' / ' + battle.max;
    ui.battleLevel.textContent = save.level;
    ui.battleHp.textContent = Math.max(0, Math.ceil(battle.displayHp)) + '/' + save.maxHp;
    ui.battleSp.textContent = save.sp + '/' + save.maxSp;
    ui.battleHpBar.style.width = clamp(battle.displayHp / save.maxHp * 100, 0, 100) + '%';
    ui.battleSpBar.style.width = clamp(save.sp / save.maxSp * 100, 0, 100) + '%';
    var spentBp = cardCost();
    if (ui.battleBpBar) ui.battleBpBar.style.width = clamp(spentBp / Math.max(1, spentBp + save.bp) * 100, 0, 100) + '%';
    if (ui.battleBp) ui.battleBp.textContent = save.bp;
    ui.cocoa.textContent = save.cocoa;
    updateHud();
  }

  function playerAgility() {
    return 6 + save.level + cardMods().agility + rand(0, 2);
  }

  function queueFor(advantage, def) {
    // Higher priority resolves first; ties break on agility. Revive moves in a
    // full party would take priority -1 so they resolve at the back of a round.
    var entries = [
      { side: 'player', agility: playerAgility(), priority: advantage === 'player' ? 2 : 0 },
      { side: 'enemy', agility: (def.agility || 5) + rand(0, 2), priority: advantage === 'enemy' ? 2 : 0 }
    ];
    return entries.sort(function (a, b) {
      return b.priority - a.priority || b.agility - a.agility;
    });
  }

  /* Every boss fights differently. These little state objects are the whole
     mechanic: they are read in the player and enemy turns below. */
  function bossGimmick(def) {
    if (def.model === 'mite') return { burrowEvery: 3, turns: 0, burrowed: 0, name: 'IT BURROWS EVERY THIRD TURN' };
    if (def.model === 'wraith') return { obscured: true, name: 'THE DARK HIDES THE BEAT' };
    if (def.model === 'serpent') return { coils: 3, name: 'ARMORED COILS · PERFECT BREAKS ONE' };
    if (def.model === 'bell') return { charge: 0, threshold: Math.max(16, Math.round(def.hp * 0.24)), chargeDamage: 0, name: 'ECHO CHARGE' };
    if (def.model === 'night') return { pulse: 0, name: 'THE LONG NIGHT DRAINS THE FIRE' };
    return null;
  }

  function startBattle(def, opts) {
    opts = opts || {};
    def = scaleEnemyForParty(def);
    battle = {
      def: def, hp: def.hp, max: def.hp, displayHp: Math.max(1, save.hp),
      busy: false, ended: false, turn: 1, opts: opts, anim: { p: 0, e: 0 },
      state: 'intro', telegraph: 'standard', extraTurns: opts.advantage === 'player' ? 1 : 0,
      revived: false, mortal: false, mods: cardMods(), window: null, windowTimer: null, raged: false,
      gimmick: bossGimmick(def), windup: 0, lunge: 0, echo: false, stunned: false
    };
    if (opts.opening) battle.hp = Math.max(1, battle.hp - opts.opening);
    save.hp = Math.max(1, save.hp);
    levelQueue = 0;
    mode = 'battle';
    view = 'battle';
    app.dataset.theme = 'battle';
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.prompt.hidden = true;
    ui.dialogue.hidden = true;
    ui.battle.hidden = false;
    ui.battle.classList.remove('ff-mortal');
    ui.skills.hidden = true;
    ui.actions.hidden = false;
    ui.timing.hidden = true;
    ui.telegraph.hidden = true;
    ui.enemyName.textContent = def.name;
    buildBattleScene(def);
    updateBattleUI();
    setBattleButtons(false);
    log('A ' + def.name + ' BLOCKS THE PATH!');
    sound('battle');
    battle.queue = queueFor(opts.advantage, def);
    ui.battleHint.textContent = '...';
    setTimeout(function () {
      if (!battle || battle.ended) return;
      if (opts.opening) {
        log('FIRST STRIKE! ' + opts.opening + ' DAMAGE BEFORE IT TURNS.');
        flashStage('white');
        pop(String(opts.opening), 'first');
        rate('FIRST STRIKE!', 'first');
        updateBattleUI();
        setTimeout(function () { if (battle && !battle.ended) beginPlayerMenu(); }, 620);
        return;
      }
      if (battle.queue[0].side === 'enemy') {
        log((opts.advantage === 'enemy' ? 'AMBUSH! ' : '') + def.name + ' MOVES FIRST!');
        enemyTurn();
      } else {
        if (opts.advantage === 'player') log('FIRST STRIKE! YOU GET AN EXTRA ACTION.');
        beginPlayerMenu();
      }
    }, 760);
  }

  function beginPlayerMenu() {
    if (!battle || battle.ended) return;
    battle.state = 'menu';
    battle.busy = false;
    battle.window = null;
    ui.timing.hidden = true;
    ui.telegraph.hidden = true;
    ui.actions.hidden = false;
    ui.skills.hidden = true;
    setBattleButtons(true);
    selectAction(battleSelect, true);
    ui.battleHint.textContent = 'ARROWS SELECT · E CONFIRM';
  }

  function showTiming(kind, label) {
    ui.timing.hidden = false;
    /* Keep the enemy's telegraph colour ring lit while the guard window is up. */
    if (kind === 'guard' && ui.enemyPlate && battle) {
      ui.enemyPlate.className = 'ff-enemy-plate windup ' + (battle.telegraph || 'standard');
    }
    var blind = !!(battle && battle.gimmick && battle.gimmick.obscured && kind === 'strike');
    var narrow = !!(battle && battle.mods && battle.mods.narrow && kind === 'strike');
    ui.timing.className = 'ff-timing' + (kind === 'guard' ? ' guard' : '') + (blind ? ' blind' : '') + (narrow ? ' narrow' : '');
    ui.timingLabel.textContent = label;
    ui.timingButton.textContent = kind === 'guard' ? 'GUARD' : 'STRIKE';
    ui.timing.classList.remove('hit');
    ui.timingNote.textContent = kind === 'guard'
      ? 'SPACE / E / TAP · INNER ZONE = SUPERGUARD'
      : 'SPACE / E / TAP · GOLD ZONE = PERFECT';
    ui.timingMarker.style.left = '0%';
    ui.actions.hidden = true;
    ui.skills.hidden = true;
  }

  function hideTiming() {
    ui.timing.hidden = true;
    if (battle) {
      if (battle.windowTimer) clearTimeout(battle.windowTimer);
      battle.windowTimer = null;
      battle.window = null;
    }
  }

  function timingPress() {
    if (!battle || battle.ended) return;
    var w = battle.window;
    if (!w) return;
    var now = Date.now();
    if (now < w.openAt || now > w.closeAt) return;
    if (w.type === 'strike') {
      if (w.resolved) return;
      w.resolved = true;
      w.quality = now >= w.perfectAt ? 'perfect' : 'good';
      w.closeAt = now + 90;
      ui.timingLabel.textContent = w.quality === 'perfect' ? 'PERFECT!' : 'GOOD!';
      timingFlash();
      sound('click');
      return;
    }
    if (w.type === 'guard') {
      if (w.superguard) return;
      if (w.allowSuper && now >= w.perfectAt) {
        w.superguard = true;
        w.guard = true;
        ui.timingLabel.textContent = 'SUPERGUARD!';
        timingFlash();
        sound('guard');
        return;
      }
      if (!w.guard) {
        w.guard = true;
        ui.timingLabel.textContent = 'GUARD';
        timingFlash();
        sound('guard');
      }
    }
  }

  function beginPlayerMove(move) {
    if (!battle || battle.ended || battle.state !== 'menu') return;
    battle.state = 'strike';
    battle.busy = true;
    battle.move = move;
    setBattleButtons(false);
    ui.skills.hidden = true;
    var now = Date.now();
    battle.window = {
      type: 'strike', move: move, startAt: now, openAt: now + 220,
      perfectAt: now + (battle.mods.narrow ? 930 : 820), closeAt: now + 1080, quality: null, resolved: false
    };
    showTiming('strike', move.kind === 'skill' ? move.name + '!' : 'STRIKE!');
    if (battle.gimmick && battle.gimmick.obscured) ui.timingLabel.textContent = 'THE DARK IS LISTENING...';
  }

  function resolvePlayerMove(move, quality) {
    if (!battle || battle.ended) return;
    hideTiming();
    var perfectMult = battle.mods.ante ? 2 : 1.5;
    var multiplier = quality === 'perfect' ? perfectMult : quality === 'good' ? 1 : 0.65;
    var base = (3 + save.level + battle.mods.attack) * (move.mult || 1) * multiplier;
    var damage = Math.max(1, Math.round(base));
    var g = battle.gimmick;
    if (g && g.burrowed) {
      damage = Math.max(1, Math.round(damage * 0.5));
      g.burrowed = 0;
      battleEnemy.hidden = false;
      log('IT WAS BURROWED. HALF DAMAGE: ' + damage + '.');
    }
    if (g && g.coils > 0) {
      if (quality === 'perfect') {
        g.coils -= 1;
        sound('break');
        shake();
        log('COIL SHATTERS! ' + g.coils + ' LEFT.');
      } else {
        damage = Math.min(damage, 2);
        log('ARMORED COILS ABSORB IT. PERFECT HITS BREAK THEM.');
      }
    }
    if (g && g.threshold) {
      g.chargeDamage = (g.chargeDamage || 0) + damage;
      while (g.chargeDamage >= g.threshold && g.charge > 0) {
        g.chargeDamage -= g.threshold;
        g.charge -= 1;
        sound('break');
        log('THE ECHO BREAKS! CHARGE ' + g.charge + '/3.');
      }
    }
    battle.hp = Math.max(0, battle.hp - damage);
    battle.anim.p = 1;
    sound('hit');
    shake();
    if (quality === 'perfect') {
      log('PERFECT! ' + (move.kind === 'skill' ? move.name : 'YOUR HIT') + ' LANDS FOR ' + damage + '!');
      sound('perfect');
      rate('PERFECT!', 'perfect');
      pop(String(damage), 'perfect');
      hitStop(70);
      cameraPunch(0.42);
    } else if (quality === 'good') {
      log('GOOD! ' + damage + ' DAMAGE.');
      rate('NICE!', 'nice');
      pop(String(damage), 'nice');
      cameraPunch(0.18);
    } else {
      log('OFF BEAT... ONLY ' + damage + ' DAMAGE.');
      pop(String(damage), 'weak');
    }
    updateBattleUI();
    if (quality === 'perfect' && move.kind === 'attack') {
      setTimeout(function () {
        if (!battle || battle.ended || battle.hp <= 0) return;
        var extra = Math.max(1, Math.round(base * 0.5));
        battle.hp = Math.max(0, battle.hp - extra);
        battle.anim.p = 1;
        log('PERFECT LOOP! A SECOND HIT FOR ' + extra + '!');
        updateBattleUI();
        if (battle.hp <= 0) winBattle();
      }, 280);
    }
    if (battle.hp <= 0) { winBattle(); return; }
    setTimeout(function () {
      if (!battle || battle.ended) return;
      flashEnemy();
      playerTurnDone();
    }, 720);
  }

  function playerTurnDone() {
    if (!battle || battle.ended) return;
    if (battle.extraTurns > 0) {
      battle.extraTurns -= 1;
      log('FIRST STRIKE! YOU ACT AGAIN.');
      beginPlayerMenu();
      return;
    }
    if (battle.holdTurn) { beginPlayerMenu(); return; }
    enemyTurn();
  }

  function chooseAction(action) {
    if (!battle || battle.ended || battle.state !== 'menu') return;
    if (action === 'attack') {
      beginPlayerMove({ kind: 'attack', name: 'ATTACK', mult: 1 });
    } else if (action === 'skill') {
      showSkills();
    } else if (action === 'guard') {
      battle.state = 'busy';
      battle.busy = true;
      setBattleButtons(false);
      save.sp = Math.min(save.maxSp, save.sp + 2);
      log('YOU STEADY YOURSELF. +2 SP. GUARD ON THE HIT!');
      updateBattleUI();
      setTimeout(function () { if (battle && !battle.ended) enemyTurn(); }, 520);
    } else if (action === 'item') {
      if (save.cocoa <= 0) { log('NO COCOA LEFT.'); return; }
      save.cocoa -= 1;
      var healed = Math.min(save.maxHp - save.hp, 12 + save.level * 2);
      save.hp += healed;
      battle.busy = true;
      setBattleButtons(false);
      sound('heal');
      log('THE COCOA WARMS YOU. +' + healed + ' HP.');
      updateBattleUI();
      setTimeout(function () { if (battle && !battle.ended) enemyTurn(); }, 620);
    } else if (action === 'run') {
      if (battle.def.boss) { log('THERE IS NOWHERE TO RUN.'); return; }
      if (Math.random() < 0.55) {
        battle.ended = true;
        battle.busy = true;
        setBattleButtons(false);
        log('YOU SLIP AWAY INTO THE SNOW...');
        setTimeout(function () { finishBattle(false); }, 900);
      } else {
        battle.busy = true;
        setBattleButtons(false);
        log('YOU TRIP ON A DRIFT!');
        setTimeout(function () { if (battle && !battle.ended) enemyTurn(); }, 560);
      }
    }
  }

  function showSkills() {
    if (!battle || battle.busy || battle.ended) return;
    var mods = battle.mods;
    ui.skills.innerHTML = '';
    SKILLS.forEach(function (skill) {
      var unlocked = save.level >= skill.level;
      var cost = Math.max(1, skill.cost - mods.skillDiscount);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ff-skill-btn';
      button.dataset.skill = skill.id;
      button.disabled = !unlocked || save.sp < cost;
      button.innerHTML = '<b>' + skill.name + '</b><small>' + (unlocked ? skill.desc + ' · ' + cost + ' SP' : 'UNLOCKS AT LV ' + skill.level) + '</small>';
      ui.skills.appendChild(button);
    });
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'ff-skill-btn';
    back.dataset.back = '1';
    back.innerHTML = '<b>BACK</b><small>RETURN TO ACTIONS</small>';
    ui.skills.appendChild(back);
    ui.skills.hidden = false;
    ui.actions.hidden = true;
    ui.battleHint.textContent = 'CHOOSE A SKILL';
  }

  function castSkill(skill) {
    if (!battle || battle.busy || battle.ended || battle.state !== 'menu') return;
    var cost = Math.max(1, skill.cost - battle.mods.skillDiscount);
    if (save.level < skill.level || save.sp < cost) return;
    save.sp -= cost;
    hideSkills();
    if (skill.heal) {
      battle.busy = true;
      setBattleButtons(false);
      var healed = Math.min(save.maxHp - save.hp, 10 + save.level * 2);
      save.hp += healed;
      battle.anim.p = 0.5;
      sound('heal');
      log('WARMTH RESTORES ' + healed + ' HP.');
      if (battle.gimmick && battle.gimmick.obscured) {
        battle.gimmick.obscured = false;
        log('WARMTH BURNS THE DARK AWAY. THE BEAT IS CLEAR AGAIN.');
        rate('WARMED UP!', 'nice');
      }
      updateBattleUI();
      setTimeout(function () { if (battle && !battle.ended) playerTurnDone(); }, 650);
      return;
    }
    beginPlayerMove({ kind: 'skill', name: skill.name, mult: skill.mult });
  }

  function showTelegraph(type) {
    ui.telegraph.hidden = false;
    ui.telegraph.className = 'ff-telegraph ' + type;
    if (type === 'heavy') ui.telegraph.textContent = 'ORANGE · HEAVY · NO SUPERGUARD';
    else if (type === 'unblockable') ui.telegraph.textContent = 'RED · UNBLOCKABLE';
    else ui.telegraph.textContent = 'WHITE · GUARD OR SUPERGUARD';
    if (ui.enemyPlate) ui.enemyPlate.className = 'ff-enemy-plate windup ' + type;
    sound(type === 'heavy' ? 'chimeOrange' : type === 'unblockable' ? 'chimeRed' : 'chimeWhite');
    flashStage(type === 'heavy' ? 'orange' : type === 'unblockable' ? 'red' : 'white');
  }

  function hideTelegraph() {
    ui.telegraph.hidden = true;
    if (ui.enemyPlate) ui.enemyPlate.className = 'ff-enemy-plate';
  }

  function rollTelegraph() {
    var roll = Math.random();
    if (roll < 0.62) return 'standard';
    if (roll < 0.88) return 'heavy';
    return 'unblockable';
  }

  function enemyTurn() {
    if (!battle || battle.ended) return;
    var g = battle.gimmick;
    battle.turn += 1;
    battle.busy = true;
    setBattleButtons(false);
    ui.skills.hidden = true;
    if (battle.stunned) {
      battle.stunned = false;
      battle.windup = 0;
      log(battle.def.name + ' IS STUNNED AND LOSES THE TURN!');
      rate('STUNNED!', 'superguard');
      sound('break');
      setTimeout(function () { if (battle && !battle.ended) beginPlayerMenu(); }, 720);
      return;
    }
    battle.state = 'enemyWindup';
    battle.windup = 1;
    if (battle.def.model === 'night' && battle.hp < battle.max * 0.5 && !battle.raged) {
      battle.raged = true;
      battle.def.atk += 2;
      log('THE LONG NIGHT PULLS THE DARK CLOSER.');
      rate('ENRAGED!', 'boss');
    }
    if (battle.def.model === 'night') {
      g.pulse += 1;
      if (g.pulse % 4 === 0) {
        var drained = Math.min(save.sp, 4);
        save.sp -= drained;
        log('THE DARK DRINKS YOUR FIRE. -' + drained + ' SP.');
        pop('-' + drained + ' SP', 'sp');
        updateBattleUI();
      }
    }
    if (g && g.burrowEvery) {
      g.turns += 1;
      if (g.turns % g.burrowEvery === 0) {
        g.burrowed = 1;
        battle.windup = 0;
        battleEnemy.hidden = true;
        log('FROST MITE BURROWS INTO THE SNOW. YOUR NEXT HIT IS HALVED.');
        rate('BURROW!', 'boss');
        sound('burrow');
        updateGimmickUi();
        setTimeout(function () { if (battle && !battle.ended) beginPlayerMenu(); }, 760);
        return;
      }
    }
    var type = rollTelegraph();
    var extra = '';
    if (g && g.threshold) {
      if (g.charge >= 3) {
        g.charge = 0;
        type = 'unblockable';
        battle.echo = true;
        extra = 'THE HOLLOW BELL RELEASES THE ECHO! IT CANNOT BE GUARDED!';
        rate('ECHO!', 'boss');
      } else {
        g.charge += 1;
        extra = 'THE BELL SWELLS (' + g.charge + '/3) — HIT IT HARD TO BREAK THE ECHO.';
        sound('charge');
      }
      updateGimmickUi();
    }
    if (g && g.coils > 0 && battle.turn % 4 === 0) type = 'heavy';
    battle.telegraph = type;
    showTelegraph(type);
    log((type === 'unblockable' ? 'UNBLOCKABLE ATTACK INCOMING. BRACE!' : type === 'heavy' ? 'HEAVY ATTACK. GUARD, NO SUPERGUARD!' : 'ATTACK INCOMING. TIME YOUR GUARD!') + (extra ? ' ' + extra : ''));
    setTimeout(function () {
      if (!battle || battle.ended) return;
      beginGuardWindow(type);
    }, type === 'unblockable' ? 620 : 820);
  }

  function beginGuardWindow(type) {
    if (!battle || battle.ended) return;
    hideTelegraph();
    battle.state = 'guardWindow';
    battle.windup = 0;
    if (type === 'unblockable') {
      log('NO GUARD. NO SUPERGUARD. BRACE!');
      battle.window = { type: 'unblockable', startAt: Date.now(), closeAt: Date.now() + 360 };
      return;
    }
    var now = Date.now();
    var extra = battle.mods.guardMs;
    battle.window = {
      type: 'guard', telegraph: type, startAt: now, openAt: now,
      perfectAt: now + 520 + extra, closeAt: now + 720 + extra,
      allowSuper: type !== 'heavy', guard: false, superguard: false, quality: null
    };
    showTiming('guard', type === 'heavy' ? 'GUARD!' : 'GUARD!');
    ui.timingNote.textContent = type === 'heavy' ? 'ORANGE ATTACK · SUPERGUARD DISABLED' : 'SPACE / E / TAP · INNER ZONE = SUPERGUARD';

  }

  function applyDamage(amount) {
    if (!battle || battle.ended) return;
    save.hp = Math.max(0, save.hp - amount);
    if (save.hp <= 0) {
      if (battle.mods.revive && !battle.revived) {
        battle.revived = true;
        battle.mortal = false;
        save.hp = 5;
        battle.displayHp = Math.max(1, battle.displayHp);
        log('SECOND WIND! YOU GET BACK UP AT 5 HP.');
        sound('heal');
      } else {
        battle.mortal = true;
        ui.battle.classList.add('ff-mortal');
        log('MORTAL DAMAGE...');
      }
    }
  }

  function resolveEnemyHit(type, quality) {
    if (!battle || battle.ended) return;
    hideTiming();
    hideTelegraph();
    var raw = battle.def.atk * rand(0.9, 1.1);
    if (type === 'heavy') raw += 1;
    if (type === 'unblockable') raw *= 1.35;
    if (battle.echo) { raw *= 1.9; battle.echo = false; }
    raw += battle.mods.incoming || 0;
    var damage = Math.max(1, Math.round(raw));
    if (quality === 'superguard') damage = 0;
    else if (quality === 'guard') damage = Math.ceil(damage * 0.5);
    battle.anim.e = 1;
    battle.lunge = 1;
    shake();
    if (quality === 'superguard') {
      sound('superguard');
      rate('SUPERGUARD!', 'superguard');
      pop('0', 'block');
      flashStage('white');
      hitStop(80);
      cameraPunch(0.5);
    } else if (quality === 'guard') {
      sound('guard');
      rate('GUARD!', 'guard');
      pop(String(damage), 'guard');
      cameraPunch(0.22);
    } else {
      sound('hurt');
      pop(String(damage), 'hurt');
      flashStage('red');
      cameraPunch(0.3);
    }
    if (quality === 'superguard') log('SUPERGUARD! NO DAMAGE.');
    else if (quality === 'guard') log('GUARD! HALF DAMAGE: ' + damage + '.');
    else log(battle.def.name + ' HITS YOU FOR ' + damage + '!');
    applyDamage(damage);
    if (quality === 'superguard') {
      var counter = 2 + Math.floor(save.level / 2);
      battle.hp = Math.max(0, battle.hp - counter);
      log('SUPERGUARD! ZERO DAMAGE AND A ' + counter + ' COUNTER!');
      pop('COUNTER ' + counter, 'counter');
      setTimeout(function () { if (battle) flashEnemy(); updateBattleUI(); }, 180);
    }
    updateBattleUI();
    if (battle.hp <= 0) { winBattle(); return; }
    if (save.hp > 0) {
      setTimeout(function () {
        if (!battle || battle.ended) return;
        beginPlayerMenu();
      }, 820);
    }
  }

  function grantXp(amount) {
    save.xp += amount;
    var gained = 0;
    while (save.xp >= xpNeeded(save.level)) {
      save.xp -= xpNeeded(save.level);
      save.level += 1;
      gained += 1;
    }
    levelQueue += gained;
    return gained;
  }

  function xpNeeded(level) {
    return 16 + (level - 1) * 12;
  }

  function winBattle() {
    if (!battle || battle.ended) return;
    if (battleEnemy) battleEnemy.hidden = false;
    battle.ended = true;
    battle.busy = true;
    setBattleButtons(false);
    hideTiming();
    hideTelegraph();
    ui.battle.classList.remove('ff-mortal');
    log('VICTORY!');
    sound('win');
    grantXp(battle.def.xp);
    persist();
    updateHud();
    setTimeout(function () {
      if (!battle) return;
      if (levelQueue > 0) showLevelUp();
      else finishBattle(true);
    }, 1000);
  }

  function loseBattle() {
    if (!battle || battle.ended) return;
    battle.ended = true;
    battle.busy = true;
    setBattleButtons(false);
    hideTiming();
    hideTelegraph();
    log('YOU BLACK OUT...');
    sound('lose');
    setTimeout(function () {
      battle = null;
      hideBattle();
      respawn();
    }, 1500);
  }

  function respawn() {
    save.hp = Math.max(1, Math.ceil(save.maxHp * 0.5));
    save.sp = save.maxSp;
    persist();
    buildWorld(save.chapter);
    toast('YOU WAKE UP BY THE FIRE. TRY AGAIN.');
  }

  function finishBattle(won) {
    var options = battle ? battle.opts : null;
    battle = null;
    hideBattle();
    view = 'world';
    mode = 'world';
    var chapter = CHAPTERS[clamp(save.chapter, 0, 4)];
    renderer.setScene({ objects: world.objects, fogColor: chapter.fog, fogNear: 22, fogFar: 70 });
    app.dataset.theme = chapter.theme;
    ui.hud.hidden = false;
    ui.objective.hidden = false;
    ui.touch.hidden = false;
    updateHud();
    updateObjective();
    snapCamera();
    persist();
    if (won && options && options.onWin) setTimeout(options.onWin, 160);
  }

  /* -------------------------------------------------------------- level up */
  function showLevelUp() {
    mode = 'levelup';
    ui.levelup.hidden = false;
    ui.levelSub.textContent = 'LEVEL ' + save.level;
    updateLevelCards();
    sound('level');
  }

  function updateLevelCards() {
    ui.lvHp.textContent = save.maxHp + ' → ' + (save.maxHp + 5);
    ui.lvSp.textContent = save.maxSp + ' → ' + (save.maxSp + 5);
    ui.lvBp.textContent = save.bp + ' → ' + (save.bp + 5);
  }

  function chooseStat(stat) {
    if (mode !== 'levelup') return;
    if (stat === 'hp') {
      save.maxHp += 5;
      save.hp = Math.min(save.maxHp, save.hp + 5);
    } else if (stat === 'sp') {
      save.maxSp += 5;
      save.sp = Math.min(save.maxSp, save.sp + 5);
    } else if (stat === 'bp') {
      save.bp += 5;
    }
    levelQueue -= 1;
    persist();
    updateHud();
    updateBattleUI();
    sound('level');
    if (levelQueue > 0) {
      ui.levelSub.textContent = 'LEVEL ' + save.level;
      updateLevelCards();
      return;
    }
    ui.levelup.hidden = true;
    finishBattle(true);
  }

  /* ------------------------------------------------------------------ menu */
  function openMenu() {
    if (mode !== 'world') return;
    mode = 'menu';
    ui.menu.hidden = false;
    ui.menuName.textContent = save.name;
    ui.menuLevel.textContent = save.level;
    ui.menuHp.textContent = save.hp + ' / ' + save.maxHp;
    ui.menuSp.textContent = save.sp + ' / ' + save.maxSp;
    ui.menuBp.textContent = save.bp;
    ui.menuShards.textContent = save.shards + ' / 5';
    renderCards();
    updateObjective();
    sound('click');
  }

  function closeMenu() {
    if (mode !== 'menu') return;
    mode = 'world';
    ui.menu.hidden = true;
  }

  function restartChapter() {
    if (!save) return;
    closeMenu();
    save.hp = save.maxHp;
    save.sp = save.maxSp;
    persist();
    buildWorld(save.chapter);
    toast('CHAPTER RESTARTED.');
  }

  function resetSave() {
    if (!window.confirm('Erase your A Christmas Tale save and start from Chapter One?')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (error) { /* ignore */ }
    save = null;
    location.reload();
  }

  function toggleSound() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (error) { /* ignore */ }
    updateSoundButton();
    if (!muted) sound('click');
  }

  function updateSoundButton() {
    ui.sound.textContent = muted ? 'X' : '♪';
    ui.sound.setAttribute('aria-pressed', muted ? 'false' : 'true');
    ui.sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  /* ---------------------------------------------------------------- input */
  function onKeyDown(event) {
    if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(event.code) >= 0) event.preventDefault();
    /* Battle keyboard: arrows drive the card cursor, E confirms, and E during
       a timing window is the action command press. */
    if (mode === 'battle' && battle) {
      if (battle.window) {
        if (event.code === 'KeyE' || event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); timingPress(); }
        return;
      }
      if (battle.state === 'menu') {
        if (event.code === 'ArrowLeft' || event.code === 'KeyA') { event.preventDefault(); selectAction(battleSelect - 1); return; }
        if (event.code === 'ArrowRight' || event.code === 'KeyD') { event.preventDefault(); selectAction(battleSelect + 1); return; }
        if (event.code === 'ArrowUp' || event.code === 'KeyW') { event.preventDefault(); selectAction(battleSelect - 3); return; }
        if (event.code === 'ArrowDown' || event.code === 'KeyS') { event.preventDefault(); selectAction(battleSelect + 3); return; }
        if (event.code === 'KeyE' || event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); activateSelected(); return; }
        if (/^Digit[1-5]$/.test(event.code)) {
          event.preventDefault();
          selectAction(Number(event.code.slice(5)) - 1, true);
          activateSelected();
          return;
        }
      }
    }
    if (event.code === 'KeyE' || event.code === 'Space' || event.code === 'Enter') {
      if (mode === 'cutscene') { event.preventDefault(); advanceCutscene(); return; }
      if (mode === 'world' || mode === 'dialogue') { event.preventDefault(); interact(); }
      return;
    }
    if (event.code === 'KeyM' || event.code === 'Escape') {
      if (mode === 'world') openMenu();
      else if (mode === 'menu') closeMenu();
      return;
    }
    keys[event.code] = true;
  }

  function onKeyUp(event) {
    keys[event.code] = false;
  }

  function onPointerDown(event) {
    if (mode !== 'world') return;
    dragging = true;
    dragDistance = 0;
    dragX = event.clientX;
    dragY = event.clientY;
  }

  function onPointerMove(event) {
    if (!dragging) return;
    var dx = event.clientX - dragX;
    var dy = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    dragDistance += Math.abs(dx) + Math.abs(dy);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    if (dragDistance < 10 && mode === 'world') interact();
  }

  function onWheel(event) {
    if (mode !== 'world') return;
    event.preventDefault();
    camera.ortho = clamp(camera.ortho + event.deltaY * 0.012, 11, 24);
  }

  function updateJoystick(event) {
    var rect = ui.joystick.getBoundingClientRect();
    var dx = event.clientX - (rect.left + rect.width / 2);
    var dy = event.clientY - (rect.top + rect.height / 2);
    var limit = rect.width * 0.34;
    var distance = Math.hypot(dx, dy);
    if (distance > limit) {
      dx = dx / distance * limit;
      dy = dy / distance * limit;
    }
    touchMove.x = dx / limit;
    touchMove.y = dy / limit;
    ui.stick.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  function endJoystick(event) {
    if (event.pointerId !== joystickId) return;
    joystickId = null;
    touchMove.x = 0;
    touchMove.y = 0;
    ui.stick.style.transform = 'translate(0,0)';
  }

  function bindEvents() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', function () {
      resizeSnow();
      placeObjective();
      if (view === 'world' && player) { camera.ortho = baseOrtho(); snapCamera(); }
    });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    ui.newGame.addEventListener('click', requestNewGame);
    ui.continueButton.addEventListener('click', continueGame);
    ui.nameStart.addEventListener('click', beginNewStory);
    ui.cutNext.addEventListener('click', advanceCutscene);
    ui.cutSkip.addEventListener('click', endCutscene);
    ui.cutscene.addEventListener('click', function (event) {
      if (event.target.closest('button')) return;
      advanceCutscene();
    });
    ui.nameInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        beginNewStory();
      }
    });
    ui.chapterBegin.addEventListener('click', beginChapter);
    ui.dialogueNext.addEventListener('click', function (event) { event.stopPropagation(); advanceDialogue(); });
    ui.dialogue.addEventListener('click', advanceDialogue);
    ui.menuButton.addEventListener('click', openMenu);
    ui.menuClose.addEventListener('click', closeMenu);
    ui.menuResume.addEventListener('click', closeMenu);
    ui.menuRestart.addEventListener('click', restartChapter);
    ui.menuReset.addEventListener('click', resetSave);
    ui.sound.addEventListener('click', toggleSound);
    ui.endingAgain.addEventListener('click', playAgain);
    ui.action.addEventListener('click', interact);
    ui.timing.addEventListener('click', timingPress);
    ui.timingButton.addEventListener('click', function (event) { event.stopPropagation(); timingPress(); });
    ui.cards.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-card]');
      if (button) toggleCard(button.dataset.card);
    });
    ui.actions.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (button && button.dataset.act) chooseAction(button.dataset.act);
    });
    ui.actions.addEventListener('pointerover', function (event) {
      var button = event.target.closest('button');
      if (button && button.dataset.index !== undefined) selectAction(Number(button.dataset.index), true);
    });
    ui.skills.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.back) { hideSkills(); return; }
      var skill = null;
      for (var i = 0; i < SKILLS.length; i++) if (SKILLS[i].id === button.dataset.skill) skill = SKILLS[i];
      if (skill) castSkill(skill);
    });
    ui.levelup.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-stat]');
      if (button) chooseStat(button.dataset.stat);
    });
    ui.joystick.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      joystickId = event.pointerId;
      try { ui.joystick.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
      updateJoystick(event);
    });
    ui.joystick.addEventListener('pointermove', function (event) {
      if (event.pointerId === joystickId) updateJoystick(event);
    });
    ui.joystick.addEventListener('pointerup', endJoystick);
    ui.joystick.addEventListener('pointercancel', endJoystick);
  }

  /* ------------------------------------------------------------------ loop */
  function frame(time) {
    var dt = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0.016;
    lastFrame = time;
    var frozen = performance.now() < freezeUntil;
    if (!frozen) {
      if (view === 'world' && world && player) updateWorld(dt, time / 1000);
      else if (view === 'cutscene') updateCutscene(dt, time / 1000);
      else if (view === 'battle' && battle) updateBattle(dt, time / 1000);
      else if (view === 'title') updateTitle(time / 1000);
      drawSnow(dt, time / 1000);
    }
    if (renderer) renderer.render();
    requestAnimationFrame(frame);
  }

  function init() {
    if (!renderer) {
      ui.loading.hidden = true;
      ui.fallback.hidden = false;
      return;
    }
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (error) { muted = false; }
    updateSoundButton();
    bindEvents();
    resizeSnow();
    buildTitleScene();
    app.dataset.theme = 'day';
    requestAnimationFrame(frame);
    var progress = 8;
    ui.loadFill.style.width = progress + '%';
    var timer = setInterval(function () {
      progress = Math.min(100, progress + 14);
      ui.loadFill.style.width = progress + '%';
      if (progress >= 100) {
        clearInterval(timer);
        setTimeout(function () {
          ui.loading.hidden = true;
          openTitleOrEnded();
        }, 260);
      }
    }, 70);
  }

  if (DEBUG) {
    window.__ff = {
      getSave: function () { return save; },
      save: function () { persist(); },
      chapter: function (index) { if (!save) { save = freshSave(); save.started = true; } buildWorld(index); },
      teleport: function (x, z) { if (player) { player.x = x; player.z = z; snapCamera(); } },
      fight: function (model, hp, boss) {
        var screens = document.querySelectorAll('.ff-screen');
        for (var s = 0; s < screens.length; s++) screens[s].hidden = true;
        var names = { mite: 'FROST MITE', wisp: 'SNOW WISP', crab: 'ICE CRAB', wraith: 'PINE WRAITH', serpent: 'ICE SERPENT', bell: 'HOLLOW BELL', night: 'THE LONG NIGHT' };
        var key = model || 'shade';
        startBattle({ name: names[key] || 'FROST SHADE', hp: hp || 22, atk: 4, xp: 10, model: key, boss: !!boss, agility: 4 }, {});
      },
      win: function () { if (battle && !battle.ended) { battle.hp = 0; winBattle(); } },
      grant: function (amount) { var gained = grantXp(amount || 50); updateHud(); return gained; },
      stats: function () { return { level: save.level, xp: save.xp, maxHp: save.maxHp, sp: save.maxSp, bp: save.bp, shards: save.shards }; },
      phase: function () { return phaseAt(); },
      state: function () {
        if (!battle) return null;
        return {
          state: battle.state, hp: battle.hp, displayHp: battle.displayHp, hpSave: save.hp,
          mortal: battle.mortal, revived: battle.revived, extraTurns: battle.extraTurns,
          window: battle.window ? { type: battle.window.type, guard: battle.window.guard, superguard: battle.window.superguard } : null,
          telegraph: battle.telegraph,
          gimmick: battle.gimmick ? {
            coils: battle.gimmick.coils, charge: battle.gimmick.charge, turns: battle.gimmick.turns,
            burrowed: battle.gimmick.burrowed, obscured: battle.gimmick.obscured
          } : null
        };
      },
      press: function () { timingPress(); },
      hold: function (ms) {
        if (battle && battle.window) battle.window.closeAt = Date.now() + (ms || 5000);
      },
      cards: function () { return { equipped: save.cards.slice(), mods: cardMods(), spent: cardCost(), bp: save.bp }; },
      drawCalls: function () { return renderer && renderer.stats ? renderer.stats() : null; },
      openChapter: function (index) { if (!save) { save = freshSave(); save.started = true; } save.chapter = index; showChapterScreen(index); },
      strike: function () {
        var item = nearestInteractable();
        if (item && item.enemy) { overworldStrike(item); return true; }
        return false;
      },
      perfect: function () {
        if (!battle || !battle.window) return false;
        var w = battle.window;
        if (w.type === 'strike') { w.perfectAt = Date.now() - 10; timingPress(); return true; }
        if (w.type === 'guard') { w.guard = true; if (w.allowSuper) w.superguard = true; timingPress(); return true; }
        return false;
      },
      attack: function () { if (battle && battle.state === 'menu') beginPlayerMove({ kind: 'attack', name: 'ATTACK', mult: 1 }); },
      enemyTurn: function () { if (battle && !battle.ended) enemyTurn(); },
      setHp: function (hp) { if (save) { save.hp = clamp(hp, 1, save.maxHp); updateHud(); } },
      camera: function () {
        return { eye: camera.eye.slice(), target: camera.target.slice(), ortho: camera.ortho, yaw: camera.yaw, pitch: camera.pitch, dist: camera.dist };
      },
      freeze: function (ms) { freezeUntil = performance.now() + (ms || 2500); },
      resume: function () { freezeUntil = 0; },
      frozen: function () { return performance.now() < freezeUntil; },
      holdTurn: function (on) { if (battle) battle.holdTurn = !!on; },
      demo: function (kind) {
        if (!battle || battle.ended) return false;
        battle.holdTurn = true;
        if (kind === 'superguard') resolveEnemyHit('standard', 'superguard');
        else if (kind === 'guard') resolveEnemyHit('standard', 'guard');
        else resolvePlayerMove({ kind: 'attack', name: 'ATTACK', mult: 1 }, 'perfect');
        clearTimeout(ui.ratingTimer);
        freezeUntil = performance.now() + 300000;
        return true;
      },
      showcase: function (text, cls, amount) {
        rate(text || 'PERFECT!', cls || 'perfect');
        pop(String(amount === undefined ? 12 : amount), cls || 'perfect');
        freezeUntil = performance.now() + 300000;
        clearTimeout(ui.ratingTimer);
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
