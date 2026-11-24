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
  /* === NEW: two files. File 1 keeps the original key so old saves (and
     anything else reading frostfall_save_v1) still resolve. === */
  var SLOT_KEYS = [SAVE_KEY, SAVE_KEY + '_slot2'];
  var activeSlot = 0;
  var slotPick = {};
  var MUTE_KEY = 'frostfall_muted_v1';

  var params = new URLSearchParams(location.search);
  var DEBUG = params.has('debug');
  /* === NEW: 12-CARD BP SYSTEM · 4 BP MAX ===
     Passives may never spend more than four BP, whatever a level-up or an old
     save claims. */
  var BP_MAX = 4;
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
    hudHpRow: $('ff-hud-hp-row'),
    sound: $('ff-sound'), menuButton: $('ff-menu-button'), battleFace: $('ff-battle-face'),
    objective: $('ff-objective'), objectiveText: $('ff-objective-text'),
    toast: $('ff-toast'), prompt: $('ff-prompt'), promptText: $('ff-prompt-text'),
    dialogue: $('ff-dialogue'), speaker: $('ff-speaker'), dialogueText: $('ff-dialogue-text'), dialogueNext: $('ff-dialogue-next'),
    touch: $('ff-touch'), joystick: $('ff-joystick'), stick: $('ff-stick'), action: $('ff-action'),
    loading: $('ff-loading'), loadFill: $('ff-load-fill'), loadingNote: $('ff-loading-note'),
    title: $('ff-title'), startPrompt: $('ff-start-prompt'), fileSelect: $('ff-file-select'),
    fileGrid: $('ff-file-grid'), fileBack: $('ff-file-back'),
    nameScreen: $('ff-name-screen'), nameInput: $('ff-name-input'), nameStart: $('ff-name-start'),
    chapterScreen: $('ff-chapter-screen'), chapterEyebrow: $('ff-chapter-eyebrow'), chapterTitle: $('ff-chapter-title'),
    chapterSub: $('ff-chapter-sub'), chapterLines: $('ff-chapter-lines'), chapterBegin: $('ff-chapter-begin'),
    battle: $('ff-battle'), enemyName: $('ff-enemy-name'), enemyHp: $('ff-enemy-hp'), enemyHpText: $('ff-enemy-hp-text'),
    battleLog: $('ff-battle-log'), battleLevel: $('ff-battle-level'), battleHp: $('ff-battle-hp'), battleSp: $('ff-battle-sp'),
    battleHpBar: $('ff-battle-hp-bar'), battleSpBar: $('ff-battle-sp-bar'), actions: $('ff-actions'),
    battleBp: $('ff-battle-bp'), enemyPlate: $('ff-enemy-plate'),
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
    ended: $('ff-ended'), endedTitle: $('ff-ended-title'), endedCopy: $('ff-ended-copy'),
    endedRecord: $('ff-ended-record'), endedResume: $('ff-ended-resume'),
    /* === NEW: a finished file can be opened from the file list, so the record
       screen needs a way back and an explicit way to start over === */
    endedRenew: $('ff-ended-renew'), endedFiles: $('ff-ended-files'), fallback: $('ff-fallback'),
    /* === NEW: battle pause / quit === */
    battlePauseOpen: $('ff-battle-pause-button'), battlePause: $('ff-battle-pause'),
    battlePauseCopy: $('ff-battle-pause-copy'), battlePauseResume: $('ff-battle-pause-resume'),
    battlePauseQuit: $('ff-battle-pause-quit'),
    cutscene: $('ff-cutscene'), cutSpeaker: $('ff-cut-speaker'), cutText: $('ff-cut-text'),
    cutFace: $('ff-cut-face'), cutNext: $('ff-cut-next'), cutSkip: $('ff-cut-skip'),
    cutScore: $('ff-cut-score'), sheetDebug: $('ff-sheet-debug'),
    sheetDebugCanvas: $('ff-sheet-debug-canvas'), sheetDebugNote: $('ff-sheet-debug-note')
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
      /* === BP STARTS SMALL: two points, +1 per level-up up to BP_MAX === */
      maxHp: 30, hp: 30, maxSp: 10, sp: 10, bp: 2,
      cocoa: 2, shards: 0, cards: [], seenIntro: false, defeated: {}, talked: {},
      /* === NEW: CHARACTER SELECT + CUTSCENE MEMORY === */
      gender: 'boy', cutscenes: {}
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
    out.bp = clamp(Math.floor(Number(value.bp) || base.bp), 1, BP_MAX);
    out.cocoa = clamp(Math.floor(Number(value.cocoa) || 0), 0, 9);
    out.shards = clamp(Math.floor(Number(value.shards) || 0), 0, 5);
    out.seenIntro = Boolean(value.seenIntro);
    out.cards = Array.isArray(value.cards) ? value.cards.filter(function (id) { return typeof id === 'string'; }).slice(0, 8) : [];
    out.gender = value.gender === 'girl' ? 'girl' : 'boy';
    out.cutscenes = value.cutscenes && typeof value.cutscenes === 'object' ? value.cutscenes : {};
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
    try { localStorage.setItem(SLOT_KEYS[activeSlot] || SAVE_KEY, JSON.stringify(save)); } catch (error) { /* storage may be blocked */ }
  }

  /* ----------------------------------------------------------------- state */
  var save = loadSave();
  /* === NEW: CHARACTER SELECT === */
  var selectedGender = save && save.gender === 'girl' ? 'girl' : 'boy';
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
  /* === NEW: IN-WORLD BATTLE CAMERA ===
     An in-world fight keeps the chapter scene on screen and only stages the two
     fighters at the spot where the player met the enemy. These globals are pure
     presentation: nothing below reads them for combat maths. */
  var BATTLE_STAGE_RADIUS = 4;      // props/NPCs inside this hide for the shot
  var BATTLE_CAM_TWEEN = 0.35;      // camera swing into and out of the fight
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
    typing: false, full: '', shown: 0, lastCount: -1, pitch: 1,
    /* === NEW: CUTSCENE MANAGER STATE === */
    id: null, kind: 'intro', shot: 'archway', focus: null, koBoss: null,
    aura: null, resolve: null, onEnd: null, score: '', finalLabel: 'CONTINUE',
    bossName: '', firstTime: false
  };

  var SWING_TIME = 0.3;
  /* Block Tales holds key poses instead of blending them: quantise pose time
     to ~14 fps so limbs snap between readable frames like an action figure. */
  var STEP_FPS = 14;
  function stepped(t) { return Math.floor(t * STEP_FPS) / STEP_FPS; }
  /* Action Cards: the active moves in battle. Each one carries an action
     command (charge, chain, mash, timed) that the timing meter interprets. */
  var SKILLS = [
    { id: 'power-stab', name: 'POWER STAB', cat: 'SWORD', cost: 2, level: 1, cmd: 'charge', mult: 1.15, desc: 'Hold, release in gold. +2 piercing.' },
    { id: 'sword-toss', name: 'SWORD TOSS', cat: 'SWORD', cost: 3, level: 1, cmd: 'toss', mult: 1.45, desc: 'Timed throw. Reaches burrowed foes.' },
    { id: 'line-bounce', name: 'LINE BOUNCE', cat: 'BALL', cost: 3, level: 1, cmd: 'chain', mult: 0.4, desc: 'Press on each bounce. Four hits.' },
    { id: 'soften', name: 'SOFTEN', cat: 'BALL', cost: 2, level: 1, cmd: 'soften', mult: 0.9, desc: 'Timed hit. -1 DEF for 3 turns.' },
    { id: 'power-shot', name: 'POWER SHOT', cat: 'SLINGSHOT', cost: 2, level: 1, cmd: 'shot', mult: 0.55, hits: 3, desc: 'Timed burst. Three pellets break shields.' },
    { id: 'dynamite', name: 'DYNAMITE', cat: 'EXPLOSIVE', cost: 4, level: 4, cmd: 'mash', mult: 1.9, desc: 'Mash for power. Splash and Burn 2.' },
    { id: 'cure', name: 'CURE', cat: 'SUPPORT', cost: 3, level: 2, cmd: 'cure', mult: 0, desc: 'Timed press. 5 HP, 7 HP on PERFECT.' }
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
    if (actor.spriteObj) {
      /* A sprite is a billboard: place its feet, squash it, and swap the UV
         window when the animation frame changes. */
      var sprite = actor.spriteObj;
      sprite.pos[0] = actor.x;
      sprite.pos[1] = actor.y;
      sprite.pos[2] = actor.z;
      sprite.size[0] = SPRITE_W * actor.scale * (actor.squashX === undefined ? 1 : actor.squashX) * (actor.girth === undefined ? 1 : actor.girth);
      sprite.size[1] = SPRITE_H * actor.scale * (actor.squashY === undefined ? 1 : actor.squashY);
      sprite.flip = (actor.facing || 1) < 0;
      sprite.hidden = !!actor.hidden;
      sprite.alpha = actor.alpha === undefined ? 1 : actor.alpha;
      if (actor.windowIndex !== actor.frame) {
        actor.windowIndex = actor.frame;
        sprite.sprite.uv = spriteWindow(actor.atlas, actor.frame);
      }
      return;
    }
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
    if (actor.spriteObj) list.push(actor.spriteObj);
    for (var i = 0; i < actor.parts.length; i++) list.push(actor.parts[i].obj);
  }

  function addActor(actor) {
    if (!world) return actor;
    pushActor(world.objects, actor);
    world.actors.push(actor);
    updateActor(actor);
    return actor;
  }

  /* ------------------------------------------------------------ 2D sprites */
  /* The cast is hand-drawn like the reference sheet: a big-headed cartoon kid
     seen from the side, flat colours and a fat outline. Every pose is baked
     once into a per-palette atlas, and each character in the world is a
     camera-facing billboard slice of it — no polygonal bodies at all. */
  var SPRITE_CELL = 128;
  var SPRITE_COLS = 8;
  var SPRITE_ROWS = 4;
  var SPRITE_H = 2.62;
  var SPRITE_W = 2.62;
  var SPRITE_FRAMES = {
    idle: [0, 1], blink: 2, talk: [3, 4], cheer: 5, ready: 6,
    walk: [8, 9, 10, 11], run: [12, 13, 14, 15],
    windup: 16, strike: 17, follow: 18, hurt: 19, guard: 20, cast: 21,
    victory: [22, 23]
  };

  function shadeHex(hex, k) {
    var r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
    var g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
    var b = Math.min(255, Math.round((hex & 255) * k));
    return (r << 16) | (g << 8) | b;
  }

  function cssHex(hex, alpha) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return alpha === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* Held poses, four to a cycle: legs and arms swing in the sagittal plane so
     the silhouette reads as a side-view sprite even though the world is 3D. */
  var SPRITE_POSES = (function () {
    function pose(frontLeg, backLeg, frontArm, backArm, extra) {
      extra = extra || {};
      return {
        legs: [frontLeg, backLeg], arms: [frontArm, backArm],
        lean: extra.lean || 0, head: extra.head || 0, bob: extra.bob || 0,
        armOut: extra.armOut || 0.085, eyes: extra.eyes || 'open', mouth: extra.mouth || 0
      };
    }
    var list = [];
    /* row 0 — idle, blink, talking, cheer */
    list[0] = pose(0.05, -0.05, 0.06, -0.05, {});
    list[1] = pose(0.04, -0.04, 0.02, -0.02, { bob: 0.008 });
    list[2] = pose(0.05, -0.05, 0.06, -0.05, { eyes: 'shut' });
    list[3] = pose(0.07, -0.06, 0.12, -0.1, { bob: -0.004, mouth: 2 });
    list[4] = pose(0.05, -0.05, 0.05, -0.04, { bob: 0.004, mouth: 1 });
    list[5] = pose(0.12, -0.16, -2.25, -0.5, { bob: -0.02, mouth: 2, armOut: 0.13 });
    list[6] = pose(0.18, -0.18, 0.42, -0.42, { bob: -0.012, head: -0.04 });
    list[7] = pose(0.05, -0.05, 0.06, -0.05, {});
    /* row 1 — four-step walk, then the same beat opened into a run */
    list[8] = pose(0.58, -0.52, -0.5, 0.55, {});
    list[9] = pose(0.18, -0.14, -0.14, 0.2, { bob: 0.016 });
    list[10] = pose(-0.52, 0.58, 0.55, -0.5, {});
    list[11] = pose(-0.14, 0.18, 0.2, -0.14, { bob: 0.016 });
    list[12] = pose(0.98, -0.88, -0.95, 0.9, { lean: 0.1 });
    list[13] = pose(0.32, -0.22, -0.35, 0.4, { lean: 0.13, bob: 0.04 });
    list[14] = pose(-0.88, 0.98, 0.9, -0.95, { lean: 0.1 });
    list[15] = pose(-0.22, 0.32, 0.4, -0.35, { lean: 0.13, bob: 0.04 });
    /* row 2 — cock back, whip through, hurt, guard, cast, victory */
    list[16] = pose(0.18, -0.12, -1.5, 1.15, { lean: -0.14, head: 0.05 });
    list[17] = pose(0.4, -0.34, 2.0, -1.0, { lean: 0.24, bob: -0.01, mouth: 2 });
    list[18] = pose(0.32, -0.26, 1.35, -0.55, { lean: 0.14 });
    list[19] = pose(-0.3, 0.34, -1.7, -1.45, { lean: -0.24, head: -0.2, eyes: 'hurt', mouth: 2, bob: -0.02 });
    list[20] = pose(0.14, -0.14, 1.0, 0.85, { eyes: 'shut', head: 0.05 });
    list[21] = pose(0.12, -0.12, -2.25, 0.35, { lean: -0.05, mouth: 1, armOut: 0.11 });
    list[22] = pose(0.14, -0.2, -2.25, -0.55, { bob: -0.03, mouth: 2, head: -0.05, armOut: 0.13 });
    list[23] = pose(0.22, -0.12, -1.95, -0.4, { bob: 0.01, mouth: 2, head: 0.03, armOut: 0.13 });
    for (var i = 24; i < SPRITE_COLS * SPRITE_ROWS; i++) list[i] = list[0];
    return list;
  })();

  /* One frame, drawn in a 0..1 box with the boots standing on 0.94. */
  function drawSpriteFrame(ctx, ox, oy, unit, pose, pal) {
    var INK = '#2c1a16';
    var skin = pal.skin, hair = pal.hair, coat = pal.coat, pants = pal.pants, shoe = pal.shoe;
    var glove = pal.glove === undefined ? 0xfff4e6 : pal.glove;
    var button = pal.button === undefined ? 0xffd257 : pal.button;
    var trim = pal.trim === undefined ? pal.scarf : pal.trim;
    var cap = pal.cap;
    var hat = pal.hat || 'beanie';
    var cx = 0.47;

    function solid(color, width) {
      ctx.fillStyle = cssHex(color);
      ctx.fill();
      if (width !== 0) {
        ctx.lineWidth = width || 0.011;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    }
    function tint(color, alpha) {
      ctx.fillStyle = cssHex(color, alpha);
      ctx.fill();
    }
    function rrect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    function disc(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    function line(x0, y0, x1, y1, width, color) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(unit, unit);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    tint(0x201410, 0.16);
    ctx.beginPath();
    ctx.ellipse(cx + 0.03, 0.935, 0.19, 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(cx, 0.94);
    ctx.rotate(pose.lean);
    ctx.translate(-cx, -0.94 - pose.bob);

    var HIP = 0.655;
    var SHOULDER = 0.545;

    function drawLeg(offset, angle, dark) {
      ctx.save();
      ctx.translate(cx + offset, HIP);
      ctx.rotate(angle);
      rrect(-0.055, -0.02, 0.11, 0.2, 0.05);
      solid(dark ? shadeHex(pants, 0.7) : pants);
      rrect(-0.07, 0.16, 0.18, 0.105, 0.05);
      solid(dark ? shadeHex(shoe, 0.68) : shoe);
      rrect(-0.065, 0.242, 0.19, 0.032, 0.016);
      solid(shadeHex(shoe, 0.55), 0);
      ctx.restore();
    }

    function drawArm(offset, angle, sleeve, mitten) {
      ctx.save();
      ctx.translate(cx + offset, SHOULDER);
      ctx.rotate(angle);
      rrect(-0.045, -0.02, 0.09, 0.17, 0.04);
      solid(sleeve);
      disc(0, 0.175, 0.056);
      solid(mitten);
      disc(-0.045, 0.152, 0.028);
      solid(mitten, 0.008);
      ctx.restore();
    }

    /* far arm and far leg first, then the body, then the near side */
    drawArm(-0.055, pose.arms[1], shadeHex(coat, 0.76), shadeHex(glove, 0.8));
    drawLeg(-0.055, pose.legs[1], true);
    drawLeg(0.055, pose.legs[0], false);

    /* shirt, overalls, and the bib with its gold button */
    rrect(cx - 0.115, 0.44, 0.235, 0.2, 0.07);
    solid(coat);
    rrect(cx - 0.122, 0.56, 0.245, 0.12, 0.05);
    solid(pants);
    ctx.beginPath();
    ctx.moveTo(cx + 0.02, 0.585);
    ctx.lineTo(cx + 0.112, 0.535);
    ctx.lineTo(cx + 0.112, 0.6);
    ctx.lineTo(cx + 0.02, 0.625);
    ctx.closePath();
    solid(pants);
    rrect(cx + 0.026, 0.462, 0.036, 0.115, 0.017);
    solid(shadeHex(pants, 1.08), 0.008);
    disc(cx + 0.078, 0.565, 0.023);
    solid(button, 0.008);

    /* the white frostfest collar and its tail */
    rrect(cx - 0.075, 0.432, 0.235, 0.056, 0.028);
    solid(trim);
    ctx.beginPath();
    ctx.moveTo(cx - 0.055, 0.46);
    ctx.quadraticCurveTo(cx - 0.175, 0.472, cx - 0.16, 0.54);
    ctx.quadraticCurveTo(cx - 0.1, 0.505, cx - 0.045, 0.496);
    ctx.closePath();
    solid(shadeHex(trim, 0.94));

    /* head: hair behind, ear, big face, fat shaded nose */
    ctx.save();
    ctx.translate(cx, 0.47);
    ctx.rotate(pose.head);
    ctx.translate(-cx, -0.47);
    disc(cx - 0.09, 0.32, 0.1);
    solid(hair);
    disc(cx - 0.145, 0.305, 0.048);
    solid(shadeHex(skin, 0.92));
    disc(cx, 0.27, 0.205);
    solid(skin);
    disc(cx + 0.18, 0.305, 0.062);
    solid(skin);
    disc(cx + 0.165, 0.285, 0.018);
    solid(0xfff3e2, 0);
    disc(cx + 0.125, 0.352, 0.036);
    tint(0xf08a76, 0.45);

    if (pose.eyes === 'shut') {
      line(cx + 0.075, 0.25, cx + 0.135, 0.25, 0.016, INK);
    } else if (pose.eyes === 'hurt') {
      line(cx + 0.07, 0.225, cx + 0.135, 0.275, 0.016, INK);
      line(cx + 0.135, 0.225, cx + 0.07, 0.275, 0.016, INK);
    } else {
      ctx.beginPath();
      ctx.ellipse(cx + 0.09, 0.25, 0.052, 0.066, 0, 0, Math.PI * 2);
      solid(0xfffdf6, 0.01);
      ctx.beginPath();
      ctx.ellipse(cx + 0.108, 0.258, 0.024, 0.036, 0, 0, Math.PI * 2);
      solid(0x24203a, 0);
      disc(cx + 0.098, 0.242, 0.012);
      solid(0xffffff, 0);
    }
    line(cx + 0.038, 0.176, cx + 0.142, 0.166, 0.02, cssHex(hair));

    if (pose.mouth === 2) {
      ctx.beginPath();
      ctx.ellipse(cx + 0.135, 0.368, 0.03, 0.024, 0, 0, Math.PI * 2);
      solid(0x5a2226, 0.008);
    } else if (pose.mouth === 1) {
      ctx.beginPath();
      ctx.ellipse(cx + 0.13, 0.362, 0.019, 0.016, 0, 0, Math.PI * 2);
      solid(0x5a2226, 0.007);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 0.08, 0.352);
      ctx.quadraticCurveTo(cx + 0.13, 0.4, cx + 0.178, 0.348);
      ctx.lineWidth = 0.016;
      ctx.strokeStyle = '#4a2220';
      ctx.stroke();
    }

    /* hats: the brimmed cap is the hero's, the rest dress the townsfolk */
    if (hat === 'cap') {
      ctx.beginPath();
      ctx.ellipse(cx, 0.205, 0.222, 0.15, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(cx + 0.222, 0.218);
      ctx.lineTo(cx - 0.222, 0.218);
      ctx.closePath();
      solid(cap);
      rrect(cx - 0.222, 0.19, 0.444, 0.05, 0.02);
      solid(shadeHex(cap, 0.82));
      ctx.beginPath();
      ctx.moveTo(cx + 0.09, 0.198);
      ctx.quadraticCurveTo(cx + 0.26, 0.182, cx + 0.325, 0.222);
      ctx.quadraticCurveTo(cx + 0.27, 0.268, cx + 0.12, 0.25);
      ctx.closePath();
      solid(shadeHex(cap, 1.04));
      disc(cx + 0.04, 0.148, 0.045);
      solid(trim, 0.009);
      ctx.save();
      ctx.strokeStyle = cssHex(shadeHex(cap, 0.9));
      ctx.lineWidth = 0.011;
      for (var k = 0; k < 3; k++) {
        var a = k * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(cx + 0.04 - Math.cos(a) * 0.024, 0.148 - Math.sin(a) * 0.024);
        ctx.lineTo(cx + 0.04 + Math.cos(a) * 0.024, 0.148 + Math.sin(a) * 0.024);
        ctx.stroke();
      }
      ctx.restore();
    } else if (hat === 'tophat') {
      rrect(cx - 0.17, 0, 0.34, 0.2, 0.02);
      solid(cap);
      ctx.beginPath();
      ctx.ellipse(cx, 0.202, 0.27, 0.045, 0, 0, Math.PI * 2);
      solid(cap);
      rrect(cx - 0.172, 0.158, 0.344, 0.045, 0.012);
      solid(trim);
    } else if (hat === 'bun') {
      disc(cx - 0.21, 0.185, 0.085);
      solid(hair);
      rrect(cx - 0.22, 0.213, 0.44, 0.05, 0.02);
      solid(cap);
    } else if (hat === 'crown') {
      rrect(cx - 0.21, 0.13, 0.42, 0.075, 0.02);
      solid(cap);
      for (var p = 0; p < 3; p++) {
        ctx.beginPath();
        ctx.moveTo(cx - 0.16 + p * 0.14, 0.135);
        ctx.lineTo(cx - 0.12 + p * 0.14, 0.02);
        ctx.lineTo(cx - 0.08 + p * 0.14, 0.135);
        ctx.closePath();
        solid(0xffd257);
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, 0.21, 0.235, 0.18, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(cx + 0.235, 0.245);
      ctx.lineTo(cx - 0.235, 0.245);
      ctx.closePath();
      solid(cap);
      rrect(cx - 0.235, 0.225, 0.47, 0.058, 0.022);
      solid(trim);
      disc(cx + 0.01, 0.052, 0.062);
      solid(trim);
    }
    if (pal.goggles) {
      rrect(cx - 0.2, 0.145, 0.4, 0.05, 0.022);
      solid(shadeHex(cap, 0.7));
      disc(cx + 0.06, 0.17, 0.052);
      solid(pal.goggles);
      disc(cx + 0.06, 0.17, 0.03);
      solid(0xdfefff, 0.008);
    }
    ctx.restore();

    /* near arm last so raised hands read in front of the face */
    drawArm(pose.armOut, pose.arms[0], shadeHex(coat, 0.94), glove);
    ctx.restore();
  }

  var spriteAtlases = {};
  function spriteAtlas(pal) {
    var key = [pal.coat, pal.pants, pal.scarf, pal.cap, pal.skin, pal.hair, pal.shoe, pal.hat, pal.glove, pal.button, pal.trim, pal.goggles].join('|');
    if (spriteAtlases[key]) return spriteAtlases[key];
    var canvas = document.createElement('canvas');
    canvas.width = SPRITE_CELL * SPRITE_COLS;
    canvas.height = SPRITE_CELL * SPRITE_ROWS;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    for (var i = 0; i < SPRITE_COLS * SPRITE_ROWS; i++) {
      drawSpriteFrame(ctx, (i % SPRITE_COLS) * SPRITE_CELL, Math.floor(i / SPRITE_COLS) * SPRITE_CELL, SPRITE_CELL, SPRITE_POSES[i], pal);
    }
    spriteAtlases[key] = { canvas: canvas };
    return spriteAtlases[key];
  }

  function spriteWindow(atlas, index) {
    var cols = atlas && atlas.cols ? atlas.cols : SPRITE_COLS;
    var rows = atlas && atlas.rows ? atlas.rows : SPRITE_ROWS;
    var col = index % cols;
    var row = Math.floor(index / cols);
    return [
      col / cols,
      1 - (row + 1) / rows,
      (col + 1) / cols,
      1 - row / rows
    ];
  }

  /* ----------------------------------------------------------- cast roster */
  /* The townsfolk are the sheet's own pose art recoloured through these colour
     roles, with a hat drawn over the cap anchor. Same proportions, same
     animation, a different character per entry. */
  var CAST_ROLES = [
    ['shirt', 168, 24, 40],     /* cap and sleeves */
    ['pants', 40, 48, 200],     /* overalls */
    ['skin', 184, 136, 88],
    ['leather', 72, 32, 16],    /* hair, moustache, boots */
    ['trim', 176, 176, 176],    /* gloves */
    ['emblem', 255, 255, 255],
    ['button', 208, 154, 99],
    ['ink', 24, 16, 16]
  ];
  var CAST_INK = 0x241010;

  function hexBytes(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }

  function castRoleAt(r, g, b) {
    var best = -1, bestD = 78 * 78 * 3;
    for (var i = 0; i < CAST_ROLES.length; i++) {
      var role = CAST_ROLES[i];
      var dr = r - role[1], dg = g - role[2], db = b - role[3];
      var d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /* The cap is the topmost red run in each cell, so hats can be anchored to
     the head instead of guessing cell coordinates. */
  var castBoxes = {};
  function castCapBox(base, index) {
    if (castBoxes[index]) return castBoxes[index];
    var ctx = base.__ctx || (base.__ctx = base.getContext('2d'));
    var ox = (index % SPRITE_COLS) * SPRITE_CELL;
    var oy = Math.floor(index / SPRITE_COLS) * SPRITE_CELL;
    var data = ctx.getImageData(ox, oy, SPRITE_CELL, SPRITE_CELL).data;
    var topY = -1, y, x, p;
    for (y = 0; y < 76 && topY < 0; y++) {
      for (x = 18; x < SPRITE_CELL - 18; x++) {
        p = (y * SPRITE_CELL + x) * 4;
        if (data[p + 3] > 60 && castRoleAt(data[p], data[p + 1], data[p + 2]) === 0) { topY = y; break; }
      }
    }
    if (topY < 0) topY = 16;
    var minX = SPRITE_CELL, maxX = -1, maxY = topY;
    for (y = topY; y < Math.min(SPRITE_CELL, topY + 22); y++) {
      for (x = 0; x < SPRITE_CELL; x++) {
        p = (y * SPRITE_CELL + x) * 4;
        if (data[p + 3] < 60) continue;
        if (castRoleAt(data[p], data[p + 1], data[p + 2]) !== 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) { minX = 46; maxX = 82; }
    var box = { x: minX, y: topY, w: maxX - minX + 1, h: clamp(maxY - topY + 1, 12, 26) };
    castBoxes[index] = box;
    return box;
  }

  function drawCastHat(ctx, style, box, hex) {
    if (!style || style === 'cap') return;
    var x = box.x, y = box.y, w = box.w, h = box.h;
    var cx = x + w / 2;
    var fill = cssHex(hex);
    var dark = cssHex(shadeHex(hex, 0.74));
    var light = cssHex(shadeHex(hex, 1.24));
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cssHex(CAST_INK);
    ctx.lineJoin = 'round';
    if (style === 'beanie') {
      ctx.beginPath();
      ctx.moveTo(x - 1, y + h * 0.66);
      ctx.quadraticCurveTo(cx, y - h * 0.82, x + w + 1, y + h * 0.66);
      ctx.lineTo(x + w + 1, y + h);
      ctx.lineTo(x - 1, y + h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x - 1, y + h * 0.6, w + 2, h * 0.32);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, y - h * 0.72, Math.max(2.5, w * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = light;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'tophat') {
      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.88, w * 0.76, h * 0.17, 0, 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(cx - w * 0.4, y - h * 0.5, w * 0.8, h * 1.32);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(cx - w * 0.4, y + h * 0.44, w * 0.8, h * 0.26);
      ctx.fillStyle = light;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'hood') {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.08, y + h * 1.02);
      ctx.quadraticCurveTo(cx, y - h * 0.95, x + w * 1.08, y + h * 1.02);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'crown') {
      ctx.beginPath();
      ctx.moveTo(x - 1, y + h * 0.62);
      var step = (w + 2) / 3, i, bx;
      for (i = 0; i < 3; i++) {
        bx = x - 1 + step * i;
        ctx.lineTo(bx + step * 0.18, y - h * 0.46);
        ctx.lineTo(bx + step * 0.44, y + h * 0.2);
        ctx.lineTo(bx + step * 0.68, y - h * 0.46);
        ctx.lineTo(bx + step, y + h * 0.62);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'horns') {
      ctx.fillStyle = cssHex(0xe8ddc8);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.04, y + h * 0.42);
      ctx.lineTo(x - w * 0.14, y - h * 0.5);
      ctx.lineTo(x + w * 0.32, y + h * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.96, y + h * 0.42);
      ctx.lineTo(x + w * 1.14, y - h * 0.5);
      ctx.lineTo(x + w * 0.68, y + h * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (style === 'helm') {
      ctx.beginPath();
      ctx.moveTo(x - 2, y + h * 0.95);
      ctx.quadraticCurveTo(cx, y - h * 0.92, x + w + 2, y + h * 0.95);
      ctx.closePath();
      ctx.fillStyle = cssHex(shadeHex(hex, 1.32));
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(cx - w * 0.07, y + h * 0.28, w * 0.14, h * 0.72);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'bun') {
      ctx.beginPath();
      ctx.arc(x + w * 0.16, y + h * 0.08, Math.max(3, w * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = cssHex(shadeHex(hex, 0.92));
      ctx.fill();
      ctx.stroke();
    } else if (style === 'widebrim') {
      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.82, w * 1.15, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.16, y + h * 0.86);
      ctx.lineTo(cx, y - h * 0.5);
      ctx.lineTo(x + w * 0.84, y + h * 0.86);
      ctx.closePath();
      ctx.fillStyle = cssHex(shadeHex(hex, 1.1));
      ctx.fill();
      ctx.stroke();
    } else if (style === 'wizard') {
      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.9, w * 0.72, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.12, y + h * 0.9);
      ctx.lineTo(cx + w * 0.2, y - h * 1.6);
      ctx.lineTo(x + w * 0.88, y + h * 0.9);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'antler') {
      ctx.strokeStyle = cssHex(0x8a6a44);
      ctx.lineWidth = 3;
      var side, sx;
      for (side = -1; side <= 1; side += 2) {
        sx = cx + side * w * 0.3;
        ctx.beginPath();
        ctx.moveTo(sx, y + h * 0.2);
        ctx.lineTo(sx + side * w * 0.22, y - h * 0.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + side * w * 0.1, y - h * 0.2);
        ctx.lineTo(sx + side * w * 0.38, y - h * 0.5);
        ctx.stroke();
      }
    } else if (style === 'flap') {
      ctx.beginPath();
      ctx.moveTo(x - 1, y + h * 0.7);
      ctx.quadraticCurveTo(cx, y - h * 0.8, x + w + 1, y + h * 0.7);
      ctx.lineTo(x + w + 1, y + h * 0.95);
      ctx.lineTo(x - 1, y + h * 0.95);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x - w * 0.18, y + h * 0.62, w * 0.22, h * 0.8);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x + w * 0.96, y + h * 0.62, w * 0.22, h * 0.8);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'none') {
      ctx.beginPath();
      ctx.moveTo(x - 1, y + h * 0.92);
      ctx.quadraticCurveTo(cx, y - h * 0.55, x + w + 1, y + h * 0.92);
      ctx.closePath();
      ctx.fillStyle = cssHex(shadeHex(hex, 0.9));
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Silhouette work: hair, clothing and held props, anchored to the same cap
     and body boxes so every new character reads differently at a glance. */
  var castSpriteBoxes = {};
  function castSpriteBox(base, index) {
    if (castSpriteBoxes[index]) return castSpriteBoxes[index];
    var ctx = base.__ctx || (base.__ctx = base.getContext('2d'));
    var ox = (index % SPRITE_COLS) * SPRITE_CELL;
    var oy = Math.floor(index / SPRITE_COLS) * SPRITE_CELL;
    var data = ctx.getImageData(ox, oy, SPRITE_CELL, SPRITE_CELL).data;
    var minX = SPRITE_CELL, maxX = -1, minY = SPRITE_CELL, maxY = -1;
    for (var y = 0; y < SPRITE_CELL; y++) {
      for (var x = 0; x < SPRITE_CELL; x++) {
        if (data[(y * SPRITE_CELL + x) * 4 + 3] < 40) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) { minX = 34; maxX = 94; minY = 8; maxY = 118; }
    var box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    castSpriteBoxes[index] = box;
    return box;
  }

  function drawCastBody(ctx, char, cap, sprite) {
    var cx = sprite.x + sprite.w / 2;
    /* The chin sits at ~41% of the sprite height in every pose, which is a far
       steadier anchor than the cap box (hats vary in height). */
    var headBottom = sprite.y + sprite.h * 0.45;
    var bw = Math.max(cap.w, sprite.w * 0.62);
    var feet = sprite.y + sprite.h - 2;
    var ink = cssHex(CAST_INK);
    var hairC = cssHex(char.leather);
    var trimC = cssHex(char.trim);
    var coatC = cssHex(char.shirt);
    var pantsC = cssHex(char.pants);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink;
    ctx.lineJoin = 'round';

    if (char.wear === 'cloak') {
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.4, headBottom + 3);
      ctx.lineTo(cx + bw * 0.4, headBottom + 3);
      ctx.lineTo(cx + bw * 0.56, feet - 10);
      ctx.lineTo(cx - bw * 0.56, feet - 10);
      ctx.closePath();
      ctx.fillStyle = cssHex(shadeHex(char.shirt, 0.8));
      ctx.fill();
      ctx.stroke();
    } else if (char.wear === 'skirt') {
      var waist = feet - 36;
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.34, waist);
      ctx.lineTo(cx + bw * 0.34, waist);
      ctx.lineTo(cx + bw * 0.5, feet - 10);
      ctx.lineTo(cx - bw * 0.5, feet - 10);
      ctx.closePath();
      ctx.fillStyle = cssHex(shadeHex(char.pants, 1.6));
      ctx.fill();
      ctx.stroke();
    } else if (char.wear === 'apron') {
      ctx.beginPath();
      ctx.rect(cx - bw * 0.19, headBottom + 11, bw * 0.38, feet - headBottom - 25);
      ctx.fillStyle = trimC;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.16, headBottom + 8);
      ctx.lineTo(cx - bw * 0.28, headBottom);
      ctx.moveTo(cx + bw * 0.16, headBottom + 8);
      ctx.lineTo(cx + bw * 0.28, headBottom);
      ctx.stroke();
    } else if (char.wear === 'belt') {
      ctx.beginPath();
      ctx.rect(cx - bw * 0.4, feet - 34, bw * 0.8, 5);
      ctx.fillStyle = cssHex(CAST_INK);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - 3, feet - 36, 6, 8);
      ctx.fillStyle = trimC;
      ctx.fill();
      ctx.stroke();
    } else if (char.wear === 'satchel') {
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.3, headBottom + 2);
      ctx.lineTo(cx + bw * 0.26, feet - 28);
      ctx.lineWidth = 3;
      ctx.strokeStyle = cssHex(shadeHex(char.leather, 1.2));
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.rect(cx + bw * 0.14, feet - 30, 10, 10);
      ctx.fillStyle = cssHex(shadeHex(char.leather, 1.25));
      ctx.fill();
      ctx.stroke();
    }

    if (char.wear === 'scarf' || char.wear === 'cloak') {
      ctx.beginPath();
      ctx.rect(cx - bw * 0.3, headBottom + 2, bw * 0.6, 6);
      ctx.fillStyle = trimC;
      ctx.fill();
      ctx.stroke();
      if (char.wear === 'scarf') {
        ctx.beginPath();
        ctx.rect(cx + bw * 0.12, headBottom + 4, 6, 14);
        ctx.fillStyle = trimC;
        ctx.fill();
        ctx.stroke();
      }
    }

    if (char.hair === 'long') {
      ctx.beginPath();
      ctx.rect(cx - bw * 0.66 - 2, headBottom - 30, 7, 32);
      ctx.fillStyle = hairC;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(cx + bw * 0.66 - 5, headBottom - 30, 7, 32);
      ctx.fillStyle = hairC;
      ctx.fill();
      ctx.stroke();
    } else if (char.hair === 'pony') {
      ctx.beginPath();
      ctx.arc(cx - bw * 0.55, headBottom - 14, 6, 0, Math.PI * 2);
      ctx.fillStyle = hairC;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(cx - bw * 0.55 - 3, headBottom - 14, 6, 16);
      ctx.fillStyle = hairC;
      ctx.fill();
      ctx.stroke();
    } else if (char.hair === 'spiky') {
      var sp;
      for (sp = -1; sp <= 1; sp += 2) {
        ctx.beginPath();
        ctx.moveTo(cx + sp * 7, cap.y + 3);
        ctx.lineTo(cx + sp * 17, cap.y - 11);
        ctx.lineTo(cx + sp * 2, cap.y - 1);
        ctx.closePath();
        ctx.fillStyle = hairC;
        ctx.fill();
        ctx.stroke();
      }
    }

    if (char.face === 'beard') {
      ctx.beginPath();
      ctx.ellipse(cx + 1, headBottom - 3, 6, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = hairC;
      ctx.fill();
      ctx.stroke();
    } else if (char.face === 'glasses') {
      ctx.beginPath();
      ctx.rect(cx - 5, headBottom - 13, 14, 4);
      ctx.fillStyle = 'rgba(120,180,210,0.6)';
      ctx.fill();
      ctx.stroke();
    } else if (char.face === 'patch') {
      ctx.beginPath();
      ctx.rect(cx - 7, headBottom - 14, 6, 6);
      ctx.fillStyle = '#2c2430';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 7, headBottom - 13);
      ctx.lineTo(cx + bw * 0.42, headBottom - 16);
      ctx.stroke();
    }

    if (char.prop === 'staff') {
      var sx = cx + bw * 0.5;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6b4a32';
      ctx.beginPath();
      ctx.moveTo(sx, cap.y - 4);
      ctx.lineTo(sx, feet - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, cap.y - 7, 4, 0, Math.PI * 2);
      ctx.fillStyle = trimC;
      ctx.fill();
      ctx.stroke();
    } else if (char.prop === 'lantern') {
      var lx = cx - bw * 0.54;
      ctx.beginPath();
      ctx.moveTo(lx + 4, feet - 34);
      ctx.lineTo(cx - bw * 0.24, headBottom + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(lx, feet - 36, 9, 12);
      ctx.fillStyle = '#ffd678';
      ctx.fill();
      ctx.stroke();
    } else if (char.prop === 'broom') {
      var bx = cx + bw * 0.46;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8a6a44';
      ctx.beginPath();
      ctx.moveTo(bx, cap.y - 2);
      ctx.lineTo(bx, feet - 16);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(bx - 7, feet - 2);
      ctx.lineTo(bx + 7, feet - 2);
      ctx.lineTo(bx + 4, feet - 17);
      ctx.lineTo(bx - 4, feet - 17);
      ctx.closePath();
      ctx.fillStyle = '#b08a4a';
      ctx.fill();
      ctx.stroke();
    } else if (char.prop === 'sack') {
      var kx = cx - bw * 0.52;
      ctx.beginPath();
      ctx.ellipse(kx, feet - 20, 8, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = cssHex(shadeHex(char.leather, 1.4));
      ctx.fill();
      ctx.stroke();
    } else if (char.prop === 'umbrella') {
      var ux = cx + bw * 0.42;
      ctx.beginPath();
      ctx.moveTo(ux, cap.y - 6);
      ctx.lineTo(ux, feet - 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ux, cap.y - 6, 11, 6, 0, Math.PI, 0);
      ctx.fillStyle = cssHex(char.trim);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  var castCache = {};
  function castAtlas(char, rows) {
    var key = char.id + '|' + rows;
    if (castCache[key]) return castCache[key];
    loadHeroAtlas();
    /* === NEW: the hero wears the action sheet, everyone else keeps the atlas === */
    if (char === HERO_CHAR) {
      var sheetHero = heroWorldAtlas();
      if (sheetHero) {
        castCache[key] = sheetHero;
        return sheetHero;
      }
    }
    var base = heroSheet.canvas;
    if (!base || !base.getContext) return null;
    var width = SPRITE_CELL * SPRITE_COLS;
    var height = SPRITE_CELL * rows;
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(base, 0, 0, width, height, 0, 0, width, height);
    var image = ctx.getImageData(0, 0, width, height);
    var data = image.data;
    var targets = [
      hexBytes(char.shirt), hexBytes(char.pants), hexBytes(char.skin), hexBytes(char.leather),
      hexBytes(char.trim), hexBytes(char.emblem === undefined ? char.shirt : char.emblem),
      hexBytes(char.button === undefined ? 0xe9c96a : char.button), null, null
    ];
    var hatSrc = char.hatStyle === 'none' ? char.leather : (char.hat === undefined ? char.shirt : char.hat);
    var hatDark = hexBytes(shadeHex(hatSrc, 0.6));
    targets[9] = hatDark;
    /* Head zones let the pass reshape the face: the sheet's cap and moustache
       are swapped per character instead of showing through the new hat. */
    var hatHex = char.hatStyle === 'none' ? char.leather : (char.hat === undefined ? char.shirt : char.hat);
    var hatBytes = hexBytes(hatHex);
    var zones = [];
    for (var zc = 0; zc < SPRITE_COLS * rows; zc++) {
      var zb = castCapBox(base, zc);
      zones.push({ x0: zb.x - 10, x1: zb.x + zb.w + 10, y0: zb.y - 2, y1: zb.y + zb.h + 27, brim: zb.y + zb.h + 5 });
    }
    var cellW = SPRITE_CELL;
    var reshaped = char.hatStyle && char.hatStyle !== 'cap';
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      var role = castRoleAt(data[i], data[i + 1], data[i + 2]);
      if (role < 0 || role === 7) continue;
      var pix = i >> 2;
      var px = pix % width;
      var py = (pix - px) / width;
      var cx = px % cellW;
      var cy = py % cellW;
      var zone = zones[Math.floor(py / cellW) * SPRITE_COLS + Math.floor(px / cellW)];
      if (zone && cx > zone.x0 && cx < zone.x1) {
        if (role === 0 && reshaped && cy > zone.y0 && cy < zone.brim) role = 8;
        else if (role === 7 && reshaped && cy > zone.y0 && cy < zone.brim) role = 9; /* brim outline joins the hat */
        else if (role === 3 && char.cleanFace && cy > zone.brim - 6 && cy < zone.y1) role = 2; /* shave */
      }
      var target = role === 8 ? hatBytes : targets[role];
      if (!target) continue;
      var from = role === 8 || role === 9 ? CAST_ROLES[0] : CAST_ROLES[role];
      var fromLum = from[1] * 0.299 + from[2] * 0.587 + from[3] * 0.114;
      var lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      var k = fromLum ? lum / fromLum : 1;
      data[i] = clamp(target[0] * k, 0, 255);
      data[i + 1] = clamp(target[1] * k, 0, 255);
      data[i + 2] = clamp(target[2] * k, 0, 255);
    }
    ctx.putImageData(image, 0, 0);

    for (var cell2 = 0; cell2 < SPRITE_COLS * rows; cell2++) {
      var anchor = castCapBox(base, cell2);
      var box2 = {
        x: anchor.x + (cell2 % SPRITE_COLS) * SPRITE_CELL,
        y: anchor.y + Math.floor(cell2 / SPRITE_COLS) * SPRITE_CELL,
        w: anchor.w,
        h: anchor.h
      };
      var hatHex = char.hatStyle === 'none' ? char.leather : (char.hat === undefined ? char.shirt : char.hat);
      drawCastHat(ctx, char.hatStyle, box2, hatHex);
      var sprite = castSpriteBox(base, cell2);
      drawCastBody(ctx, char, box2, {
        x: sprite.x + (cell2 % SPRITE_COLS) * SPRITE_CELL,
        y: sprite.y + Math.floor(cell2 / SPRITE_COLS) * SPRITE_CELL,
        w: sprite.w,
        h: sprite.h
      });
    }

    castCache[key] = canvas;
    return canvas;
  }

  function buildCastActor(char, rows) {
    var actor = makeActor('player');
    actor.castChar = char;
    actor.castRows = rows || 1;
    actor.facing = 1;
    actor.frame = 0;
    actor.scale = char.scale || 1;
    actor.girth = char.girth || 1;
    var atlas = castAtlas(char, actor.castRows);
    var canvas = atlas || blankHeroAtlas();
    actor.atlas = { canvas: canvas, cols: SPRITE_COLS, rows: actor.castRows };
    actor.spriteObj = {
      sprite: { image: canvas, uv: spriteWindow(actor.atlas, 0) },
      pos: [0, 0, 0],
      size: [SPRITE_W * actor.scale, SPRITE_H * actor.scale],
      flip: false,
      alpha: 1,
      hidden: false
    };
    if (!atlas) heroSheet.waiting.push(actor);
    return actor;
  }

  /* id, name, coat/cap, overalls, skin, hair+boots, gloves, hat, hat style, scale */
  function cast(id, name, shirt, pants, skin, leather, trim, hat, style, scale) {
    style = style || 'cap';
    return {
      id: id, name: name, shirt: shirt, pants: pants, skin: skin, leather: leather, trim: trim,
      hat: hat, hatStyle: style, scale: scale || 1,
      /* knit hats and buns read as the younger, clean-shaven half of town */
      cleanFace: style === 'beanie' || style === 'hood' || style === 'bun'
    };
  }

  /* Sixty-odd townsfolk, all built from the sheet: Roadtown, the pines, the
     lake, the clocktower and the mountain each field ten of them. */
  var CAST_ROSTER = [
    cast('bram', 'MAYOR BRAM', 0x3a2f4a, 0x232a3d, 0xe8c39a, 0x9a917f, 0xf2ede2, 0x2b2633, 'tophat', 1.02),
    cast('juniper', 'JUNIPER', 0x3f6b52, 0x2a3a2f, 0xd9a276, 0x6b3f2a, 0xf2ede2, 0x2f5d46, 'beanie', 0.97),
    cast('finn', 'OLD FINN', 0x6a5a3e, 0x3d3428, 0xd8a87e, 0xcfcfcf, 0xf2ede2, 0x5a4632, 'cap', 1),
    cast('odette', 'BELLKEEPER ODETTE', 0x5b3f78, 0x352345, 0xe8c19c, 0x2f2038, 0xf2ede2, 0x472f5c, 'bun', 0.96),
    cast('aurora', 'AURORA', 0x9fd7e6, 0x7fc7e0, 0xf7e7ff, 0xffffff, 0xffffff, 0xbfeaf7, 'crown', 0.98),
    cast('tobias', 'TOBIAS', 0x8c3b2a, 0x3a2b22, 0xe4b083, 0x4a2a18, 0xf4efe2, 0x8c3b2a, 'cap'),
    cast('wren', 'WREN', 0x2f7078, 0x24262e, 0xc98d63, 0x2e2018, 0xf4efe2, 0x2f7078, 'beanie'),
    cast('hollis', 'HOLLIS', 0xb07a2c, 0x444a52, 0xf2c49c, 0x6b432c, 0xf4efe2, 0xb07a2c, 'hood'),
    cast('mabel', 'MABEL', 0xd9cbb0, 0x5a4632, 0xf7d3b0, 0x8a8070, 0xffffff, 0xc9a86a, 'bun'),
    cast('fergus', 'FERGUS', 0x3b4a63, 0x24262e, 0xa86b45, 0x2e2018, 0xf4efe2, 0x3b4a63, 'tophat'),
    cast('ingrid', 'INGRID', 0x7a2f3f, 0x352345, 0xf2c49c, 0xd8c9a8, 0xf4efe2, 0x7a2f3f, 'helm'),
    cast('caleb', 'CALEB', 0x4a5a2f, 0x2a3a2f, 0xc98d63, 0x4a2a18, 0xf4efe2, 0x4a5a2f, 'horns'),
    cast('nella', 'NELLA', 0x6a4b7a, 0x2b3550, 0xe8c19c, 0x2f2038, 0xf4efe2, 0x6a4b7a, 'beanie'),
    cast('oswin', 'OSWIN', 0x5a4632, 0x3d3428, 0xd8a87e, 0xcfcfcf, 0xf4efe2, 0x5a4632, 'cap'),
    cast('pru', 'PRU', 0x2c3d5a, 0x24262e, 0xf2c49c, 0x8a4a2a, 0xf4efe2, 0xc05a3a, 'beanie'),
    cast('rook', 'ROOK', 0x3a3a44, 0x24262e, 0x8a5636, 0x1e1610, 0xd8d2c4, 0x3a3a44, 'hood'),
    cast('sable', 'SABLE', 0x2d2a33, 0x24262e, 0xa86b45, 0x1e1610, 0xd8d2c4, 0x6a2b3a, 'bun'),
    cast('tamsin', 'TAMSIN', 0x8a6b3f, 0x4a3a2a, 0xf2c49c, 0x6b432c, 0xf4efe2, 0x8a6b3f, 'crown'),
    cast('ulf', 'ULF', 0x4a3a2a, 0x2a2420, 0xd8a87e, 0x8a8070, 0xd8d2c4, 0x4a3a2a, 'helm'),
    cast('vera', 'VERA', 0x9a4a6a, 0x352345, 0xe8c19c, 0x2f2038, 0xf4efe2, 0x9a4a6a, 'beanie'),
    cast('wendel', 'WENDEL', 0x3f6b52, 0x2a3a2f, 0xc98d63, 0x4a2a18, 0xf4efe2, 0xd9a03c, 'cap'),
    cast('yara', 'YARA', 0xb0562c, 0x3a2b22, 0x8a5636, 0x2e2018, 0xf4efe2, 0xb0562c, 'horns'),
    cast('zeke', 'ZEKE', 0x2f4a6b, 0x24262e, 0xe4b083, 0x6b432c, 0xf4efe2, 0x2f4a6b, 'tophat'),
    cast('astrid', 'ASTRID', 0xd9cbb0, 0x5a4632, 0xf7d3b0, 0xc9b48a, 0xffffff, 0x8a6b3f, 'crown'),
    cast('bjorn', 'BJORN', 0x4a2f2f, 0x2a2420, 0xd8a87e, 0x8a4a2a, 0xd8d2c4, 0x4a2f2f, 'helm'),
    cast('cora', 'CORA', 0x6a8a5a, 0x2a3a2f, 0xf2c49c, 0x8a5a2a, 0xf4efe2, 0x6a8a5a, 'beanie'),
    cast('dagmar', 'DAGMAR', 0x7a2f3f, 0x352345, 0xe8c19c, 0x2f2038, 0xf4efe2, 0x2b2633, 'tophat'),
    cast('edda', 'EDDA', 0x3b4a63, 0x24262e, 0xf7d3b0, 0xd8c9a8, 0xffffff, 0x3b4a63, 'bun'),
    cast('fenn', 'FENN', 0x5a6b3a, 0x3d3428, 0xc98d63, 0x4a2a18, 0xf4efe2, 0xc9a86a, 'cap'),
    cast('greta', 'GRETA', 0x9a7a3c, 0x444a52, 0xf2c49c, 0x6b432c, 0xf4efe2, 0x9a7a3c, 'hood'),
    cast('halvor', 'HALVOR', 0x33475a, 0x24262e, 0xa86b45, 0x2e2018, 0xd8d2c4, 0x33475a, 'horns'),
    cast('ivo', 'IVO', 0x7a3a5a, 0x352345, 0xd8a87e, 0x2f2038, 0xf4efe2, 0x7a3a5a, 'beanie'),
    cast('jory', 'JORY', 0x2f6b4a, 0x2a3a2f, 0xe4b083, 0x4a2a18, 0xf4efe2, 0x2f6b4a, 'cap'),
    cast('kaja', 'KAJA', 0xb0703c, 0x3a2b22, 0xf2c49c, 0x8a5a2a, 0xf4efe2, 0xb0703c, 'bun'),
    cast('lars', 'LARS', 0x3a4a5a, 0x24262e, 0xe4b083, 0xcfcfcf, 0xf4efe2, 0x3a4a5a, 'tophat'),
    cast('mira', 'MIRA', 0xa04a5a, 0x352345, 0xf7d3b0, 0x6b3320, 0xf4efe2, 0xa04a5a, 'beanie'),
    cast('nils', 'NILS', 0x4a6a4a, 0x2a3a2f, 0xc98d63, 0x4a2a18, 0xd8d2c4, 0x4a6a4a, 'helm'),
    cast('ora', 'ORA', 0x8a5a7a, 0x352345, 0xe8c19c, 0x2f2038, 0xf4efe2, 0x8a5a7a, 'crown'),
    cast('perrin', 'PERRIN', 0x6a5a3e, 0x3d3428, 0xd8a87e, 0x8a8070, 0xf4efe2, 0x6a5a3e, 'cap'),
    cast('quill', 'QUILL', 0x2f3a4a, 0x24262e, 0xa86b45, 0x1e1610, 0xd8d2c4, 0x2f3a4a, 'hood'),
    cast('rask', 'RASK', 0x8a3a2a, 0x3a2b22, 0xc98d63, 0x4a2a18, 0xf4efe2, 0x8a3a2a, 'horns'),
    cast('sigrid', 'SIGRID', 0x4a7a8a, 0x2b3550, 0xf2c49c, 0xd8c9a8, 0xffffff, 0x4a7a8a, 'bun'),
    cast('torv', 'TORV', 0x5a4a3a, 0x2a2420, 0xe4b083, 0x6b432c, 0xd8d2c4, 0x5a4a3a, 'cap'),
    cast('una', 'UNA', 0x7a6a4a, 0x444a52, 0xf7d3b0, 0xc9b48a, 0xf4efe2, 0x7a6a4a, 'beanie'),
    cast('vidar', 'VIDAR', 0x3a5a6a, 0x24262e, 0xa86b45, 0x2e2018, 0xf4efe2, 0x3a5a6a, 'helm'),
    cast('wrenna', 'WRENNA', 0x9a5a3a, 0x3a2b22, 0xf2c49c, 0x8a4a2a, 0xf4efe2, 0x9a5a3a, 'hood'),
    cast('ylva', 'YLVA', 0x5a7a5a, 0x2a3a2f, 0xf7d3b0, 0xd8c9a8, 0xffffff, 0x5a7a5a, 'crown'),
    cast('zora', 'ZORA', 0x6a3a6a, 0x352345, 0xe8c19c, 0x2f2038, 0xf4efe2, 0x6a3a6a, 'beanie'),
    cast('alva', 'ALVA', 0x4a6a7a, 0x2b3550, 0xe4b083, 0x6b432c, 0xf4efe2, 0x4a6a7a, 'cap'),
    cast('brann', 'BRANN', 0x8a4a3a, 0x3a2b22, 0xd8a87e, 0x4a2a18, 0xf4efe2, 0x8a4a3a, 'horns'),
    cast('cyra', 'CYRA', 0x2f6b6b, 0x24262e, 0xc98d63, 0x2e2018, 0xf4efe2, 0x2f6b6b, 'bun'),
    cast('dov', 'DOV', 0x5a5a3a, 0x3d3428, 0xe4b083, 0x8a8070, 0xd8d2c4, 0x5a5a3a, 'tophat'),
    cast('elske', 'ELSKE', 0x8a7a5a, 0x444a52, 0xf7d3b0, 0xc9b48a, 0xf4efe2, 0x8a7a5a, 'hood'),
    cast('frode', 'FRODE', 0x3a4a3a, 0x24262e, 0xd8a87e, 0x4a2a18, 0xf4efe2, 0x3a4a3a, 'cap'),
    cast('gull', 'GULL', 0x6a5a7a, 0x2b3550, 0xf2c49c, 0x6b3320, 0xf4efe2, 0x6a5a7a, 'beanie'),
    cast('hagen', 'HAGEN', 0x4a3a5a, 0x2a2420, 0xa86b45, 0x1e1610, 0xd8d2c4, 0x4a3a5a, 'helm'),
    cast('ines', 'INES', 0x9a3a5a, 0x352345, 0xe8c19c, 0x2f2038, 0xf4efe2, 0x9a3a5a, 'crown'),
    cast('jonte', 'JONTE', 0x2f4a3a, 0x24262e, 0xe4b083, 0x8a5a2a, 0xf4efe2, 0x2f4a3a, 'cap')
  ];

  /* Silhouette and wardrobe per character: hair, clothing, held props, face
     and build, so no two townsfolk read the same at a glance. */
  var CAST_STYLE = {
    bram: 'beard+belt+wide',
    juniper: 'long+scarf+belt',
    finn: 'beard+belt+sack',
    odette: 'pony+cloak',
    aurora: 'long+staff+clean',
    tobias: 'patch+belt',
    wren: 'scarf+satchel+slim',
    hollis: 'cloak+slim+hood',
    mabel: 'apron+clean',
    fergus: 'beard+lantern+wide',
    ingrid: 'long+belt',
    caleb: 'beard+apron+antler',
    nella: 'pony+scarf',
    oswin: 'staff+beard',
    pru: 'spiky+satchel+slim',
    rook: 'cloak+patch',
    sable: 'pony+cloak',
    tamsin: 'skirt+clean',
    ulf: 'beard+wide+belt',
    vera: 'long+apron',
    wendel: 'scarf+wide+belt',
    yara: 'spiky+belt',
    zeke: 'beard+staff+wizard',
    astrid: 'skirt+clean+long',
    bjorn: 'beard+wide+lantern',
    cora: 'pony+apron',
    dagmar: 'long+cloak+glasses',
    edda: 'pony+skirt+belt',
    fenn: 'satchel+glasses+slim',
    greta: 'apron+clean+wizard',
    halvor: 'beard+belt+wide',
    ivo: 'long+scarf',
    jory: 'spiky+belt',
    kaja: 'skirt+lantern',
    lars: 'glasses+beard+slim',
    mira: 'long+cloak',
    nils: 'beard+staff',
    ora: 'skirt+clean+pony',
    perrin: 'beard+wide+sack',
    quill: 'cloak+slim+patch',
    rask: 'spiky+belt+antler',
    sigrid: 'long+apron',
    torv: 'beard+satchel',
    una: 'scarf+clean+slim',
    vidar: 'beard+belt+umbrella',
    wrenna: 'long+broom',
    ylva: 'long+skirt+clean',
    zora: 'pony+cloak+glasses',
    alva: 'glasses+belt+slim',
    brann: 'beard+wide+apron',
    cyra: 'long+scarf+slim',
    dov: 'beard+staff+wizard',
    elske: 'apron+clean+wide',
    frode: 'beard+belt+satchel',
    gull: 'pony+scarf',
    hagen: 'beard+cloak+wide',
    ines: 'long+skirt+clean+flap',
    jonte: 'spiky+satchel+umbrella'
  };

  /* Height varies a lot in Roadtown: the older folk run tall, the kids short. */
  var CAST_BUILD = {
    finn: 'tall', ulf: 'tall', bjorn: 'tall', halvor: 'tall', perrin: 'tall',
    hagen: 'tall', brann: 'tall', fergus: 'tall', vidar: 'tall', lars: 'tall',
    bram: 'tall', oswin: 'tall', nils: 'tall', dov: 'tall',
    elske: 'short', mabel: 'short', pru: 'short', kaja: 'short', gull: 'short',
    ines: 'short', una: 'short', wren: 'short', fenn: 'short', alva: 'short',
    quill: 'short', jonte: 'short', cora: 'short', mira: 'short', edda: 'short'
  };

  function applyCastStyle(char, spec) {
    var tokens = spec ? spec.split('+') : [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === 'long' || t === 'pony' || t === 'spiky') char.hair = t;
      else if (t === 'scarf' || t === 'cloak' || t === 'apron' || t === 'skirt' || t === 'belt' || t === 'satchel') char.wear = t;
      else if (t === 'beard' || t === 'glasses' || t === 'patch') char.face = t;
      else if (t === 'clean') { char.face = 'clean'; char.cleanFace = true; }
      else if (t === 'staff' || t === 'lantern' || t === 'broom' || t === 'sack' || t === 'umbrella') char.prop = t;
      else if (t === 'widebrim' || t === 'wizard' || t === 'antler' || t === 'flap' || t === 'bucket') char.hatStyle = t;
      else if (t === 'wide') char.girth = 1.16;
      else if (t === 'slim') char.girth = 0.88;
      else if (t === 'tall') char.scale = (char.scale || 1) * 1.12;
      else if (t === 'short') char.scale = (char.scale || 1) * 0.88;
    }
  }

  (function () {
    for (var i = 0; i < CAST_ROSTER.length; i++) {
      var member = CAST_ROSTER[i];
      member.hair = 'short';
      member.wear = 'none';
      member.face = member.cleanFace ? 'clean' : 'stache';
      member.girth = 1;
      applyCastStyle(member, (CAST_STYLE[member.id] || '') + '+' + (CAST_BUILD[member.id] || ''));
    }
  })();

  /* The player: the sheet's build and animation, but his own character — short
     spiky hair, teal coat, cream scarf, clean shaven. */
  var HERO_CHAR = {
    id: 'hero', name: 'NICO', hero: true, cleanFace: true, hair: 'spiky',
    wear: 'scarf', face: 'clean', girth: 1,
    shirt: 0x2f7d6b, pants: 0x2b3550, skin: 0xf2c49c, leather: 0x8a3d22,
    trim: 0xf6f1e4, emblem: 0x2f7d6b, button: 0xe9c96a,
    hat: 0x2f7d6b, hatStyle: 'none', scale: 1
  };

  var CAST_BY_ID = {};
  (function () {
    for (var i = 0; i < CAST_ROSTER.length; i++) CAST_BY_ID[CAST_ROSTER[i].id] = CAST_ROSTER[i];
  })();

  /* ==================================================================
     === NEW: CHARACTER FACTORY ===
     One line of config per character: pull a row out of a sprite contact
     sheet, key its blue card to transparency, swap the neutral clothing
     and armour tones for a palette, stamp an accessory on the head/hand
     anchors, and hand back an actor the existing world and battle code
     already knows how to draw. Combat maths, HP, the HUD and the save
     hooks are untouched.
     ================================================================== */
  var FROSTFALL_SHEETS = {
    cast: { src: '/img/frostfall/cast.JPG' },
    extras: { src: '/img/frostfall/extras.JPG' },
    terry: { src: '/img/frostfall/terry.JPG' }
  };
  var FROSTFALL_SHEET_COLS = 5;
  var FROSTFALL_SHEET_ROWS = 4;
  var FROSTFALL_FRAME = 160;
  var FROSTFALL_ATLAS_COLS = 8;      /* idle x3, walk, talk, cheer, ready, hurt */
  var frostfallSheetState = {};
  var frostfallGrids = {};
  var frostfallKeyed = {};
  var frostfallArtBoxes = {};
  var frostfallPaletteCache = {};
  var frostfallCharacters = {};

  /* === NEW: CHARACTER FACTORY === lazily load a contact sheet, JPEG case
     handled the same way the animation sheet does it. */
  function frostfallSheet(name) {
    var spec = FROSTFALL_SHEETS[name];
    if (!spec) return { state: 'missing', canvas: null, waiting: [] };
    var known = frostfallSheetState[name];
    if (known) return known;
    var state = { state: 'loading', canvas: null, waiting: [] };
    frostfallSheetState[name] = state;
    var sources = [spec.src + '?v=1', spec.src.replace('.JPG', '.jpg') + '?v=1'];
    var attempt = function (index) {
      if (index >= sources.length) { state.state = 'error'; return; }
      var image = new Image();
      image.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) ctx.drawImage(image, 0, 0);
        state.canvas = canvas;
        state.state = 'ready';
        var jobs = state.waiting.slice();
        state.waiting.length = 0;
        for (var i = 0; i < jobs.length; i++) jobs[i]();
      };
      image.onerror = function () { attempt(index + 1); };
      image.src = sources[index];
    };
    attempt(0);
    return state;
  }

  /* === NEW: CHARACTER FACTORY ===
     The contact sheets are four rows of five cards, each card outlined by a pale
     stroke. A uniform lattice drifts into the neighbouring card by column four
     (and the caption strip above each card lands in the crop), which is what
     sliced the golem, the knight and the template row. So the outlines are
     measured instead: the strokes are the rows and columns of the sheet whose
     pale-pixel count spikes, and those lines are paired up into card rectangles.
     The panel inside a card is a soft blue gradient rather than a flat fill, so
     it is keyed against a model fitted to the card's four corners. */
  function frostfallEdgeLines(data, w, h, axis) {
    var len = axis === 'x' ? w : h;
    var cross = axis === 'x' ? h : w;
    var counts = new Int32Array(len);
    for (var i = 0; i < len; i++) {
      var n = 0;
      for (var k = 0; k < cross; k++) {
        var idx = (axis === 'x' ? k * w + i : i * w + k) * 4;
        if (data[idx + 1] > 170 && data[idx + 2] > 205 && data[idx] < 160) n++;
      }
      counts[i] = n;
    }
    var min = cross * 0.3;
    var lines = [];
    var run = -1;
    for (var j = 0; j <= len; j++) {
      var on = j < len && counts[j] > min;
      if (on && run < 0) run = j;
      if (!on && run >= 0) {
        lines.push(Math.round((run + j - 1) / 2));
        run = -1;
      }
    }
    var merged = [];
    for (var m = 0; m < lines.length; m++) {
      if (merged.length && lines[m] - merged[merged.length - 1] < 6) continue;
      merged.push(lines[m]);
    }
    return merged;
  }

  function frostfallSheetGrid(sheet, sheetName) {
    var key = sheetName || 'sheet';
    if (frostfallGrids[key] !== undefined) return frostfallGrids[key];
    var ctx = sheet.getContext('2d');
    if (!ctx) return null;
    var w = sheet.width, h = sheet.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var xs = frostfallEdgeLines(data, w, h, 'x');
    var ys = frostfallEdgeLines(data, w, h, 'y');
    var grid = [];
    var r, c;
    if (xs.length === FROSTFALL_SHEET_COLS * 2 && ys.length === FROSTFALL_SHEET_ROWS * 2) {
      for (r = 0; r < FROSTFALL_SHEET_ROWS; r++) {
        var cards = [];
        for (c = 0; c < FROSTFALL_SHEET_COLS; c++) {
          /* stay ten pixels inside the outline so the stroke and its corner
             arcs can never end up inside a crop */
          var x0 = xs[c * 2] + 10, x1 = xs[c * 2 + 1] - 10;
          var y0 = ys[r * 2] + 10, y1 = ys[r * 2 + 1] - 10;
          cards.push({ x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
        }
        grid.push(cards);
      }
    } else {
      /* no clean lattice: fall back to an even split inside the sheet */
      for (r = 0; r < FROSTFALL_SHEET_ROWS; r++) {
        var fb = [];
        for (c = 0; c < FROSTFALL_SHEET_COLS; c++) {
          var fx0 = Math.round(c * w / FROSTFALL_SHEET_COLS) + 8;
          var fx1 = Math.round((c + 1) * w / FROSTFALL_SHEET_COLS) - 8;
          var fy0 = Math.round(r * h / FROSTFALL_SHEET_ROWS) + 78;
          var fy1 = Math.round((r + 1) * h / FROSTFALL_SHEET_ROWS) - 18;
          fb.push({ x0: fx0, y0: fy0, x1: fx1, y1: fy1, w: fx1 - fx0 + 1, h: fy1 - fy0 + 1 });
        }
        grid.push(fb);
      }
    }
    frostfallGrids[key] = grid;
    return grid;
  }

  /* A keyed copy of the sheet: each card's gradient panel removed, plus a pass
     that eats the one pixel of jpeg fringe hugging every silhouette. */
  function frostfallKeyedSheet(sheet, sheetName) {
    var key = sheetName || 'sheet';
    if (frostfallKeyed[key]) return frostfallKeyed[key];
    var grid = frostfallSheetGrid(sheet, sheetName);
    if (!grid) return null;
    var canvas = document.createElement('canvas');
    canvas.width = sheet.width;
    canvas.height = sheet.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, 0, 0);
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    var w = canvas.width;
    function colour(x, y) {
      var i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    }
    function mix(a, b, t) { return a + (b - a) * t; }
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        var card = grid[r][c];
        var inset = 4;
        var tl = colour(card.x0 + inset, card.y0 + inset);
        var tr = colour(card.x1 - inset, card.y0 + inset);
        var bl = colour(card.x0 + inset, card.y1 - inset);
        var br = colour(card.x1 - inset, card.y1 - inset);
        var spanX = Math.max(1, card.x1 - card.x0);
        var spanY = Math.max(1, card.y1 - card.y0);
        function model(x, y, out) {
          var tx = (x - card.x0) / spanX, ty = (y - card.y0) / spanY;
          out[0] = mix(mix(tl[0], tr[0], tx), mix(bl[0], br[0], tx), ty);
          out[1] = mix(mix(tl[1], tr[1], tx), mix(bl[1], br[1], tx), ty);
          out[2] = mix(mix(tl[2], tr[2], tx), mix(bl[2], br[2], tx), ty);
          return out;
        }
        var expect = [0, 0, 0];
        var x, y, i, d;
        var cw = card.x1 - card.x0 + 1;
        var chh = card.y1 - card.y0 + 1;
        /* The panel is one connected gradient running under the card, while a
           pale character is fenced in by its own outline. So the background
           is flooded in from the card border instead of being tested pixel by
           pixel: the fill stops dead at the silhouette, and no amount of pale
           ice plate gets punched out of the middle of a character (which is
           what turned the frost knight into confetti and the guards into a
           crowned ball). */
        var reached = new Uint8Array(cw * chh);
        var queue = new Int32Array(cw * chh);
        var head = 0, tail = 0;
        var panelDistance = function (px, py) {
          var pi = (py * w + px) * 4;
          model(px, py, expect);
          return Math.abs(data[pi] - expect[0]) + Math.abs(data[pi + 1] - expect[1]) + Math.abs(data[pi + 2] - expect[2]);
        };
        var flood = function (px, py, tol) {
          var lfx = px - card.x0, lfy = py - card.y0;
          var li = lfy * cw + lfx;
          if (reached[li]) return;
          if (panelDistance(px, py) >= tol) return;
          reached[li] = 1;
          queue[tail++] = li;
        };
        /* Where a card's highlight drifts the model can be far off right at the
           edge, which leaves a full-height strip of panel unseeded (the Long
           Night's card had one). So a border pixel also counts as background
           when it matches the typical colour of the edge it sits on. */
        var edgeMedian = function (horizontal, fixed) {
          var rs = [], gs = [], bs = [];
          var n = horizontal ? cw : chh;
          for (var em = 0; em < n; em += 2) {
            var emx = horizontal ? card.x0 + em : fixed;
            var emy = horizontal ? fixed : card.y0 + em;
            var emi = (emy * w + emx) * 4;
            rs.push(data[emi]); gs.push(data[emi + 1]); bs.push(data[emi + 2]);
          }
          var pick = function (list) { list.sort(function (u, v) { return u - v; }); return list[list.length >> 1]; };
          return [pick(rs), pick(gs), pick(bs)];
        };
        var topMed = edgeMedian(true, card.y0 + 1), bottomMed = edgeMedian(true, card.y1 - 1);
        var leftMed = edgeMedian(false, card.x0 + 1), rightMed = edgeMedian(false, card.x1 - 1);
        var nearEdgeTone = function (px, py, med) {
          var pi = (py * w + px) * 4;
          return Math.abs(data[pi] - med[0]) + Math.abs(data[pi + 1] - med[1]) + Math.abs(data[pi + 2] - med[2]) < 45;
        };
        var nearestMed = function (px, py) {
          var dl = px - card.x0, dr = card.x1 - px, dt = py - card.y0, db = card.y1 - py;
          var bestD = dl, med = leftMed;
          if (dr < bestD) { bestD = dr; med = rightMed; }
          if (dt < bestD) { bestD = dt; med = topMed; }
          if (db < bestD) { med = bottomMed; }
          return med;
        };
        var seedPixel = function (px, py, med) {
          if (panelDistance(px, py) < 78 || nearEdgeTone(px, py, med)) {
            var slx = px - card.x0, sly = py - card.y0;
            var sli = sly * cw + slx;
            if (!reached[sli]) { reached[sli] = 1; queue[tail++] = sli; }
          }
        };
        var runFlood = function (growTol) {
          head = 0; tail = 0;
          for (x = card.x0; x <= card.x1; x++) {
            seedPixel(x, card.y0, topMed);
            seedPixel(x, card.y1, bottomMed);
          }
          for (y = card.y0; y <= card.y1; y++) {
            seedPixel(card.x0, y, leftMed);
            seedPixel(card.x1, y, rightMed);
          }
          while (head < tail) {
            var ql = queue[head++];
            var qlx = ql % cw, qly = (ql - qlx) / cw;
            for (var gdy = -1; gdy <= 1; gdy++) {
              for (var gdx = -1; gdx <= 1; gdx++) {
                var gnx = qlx + gdx, gny = qly + gdy;
                if (gnx < 0 || gny < 0 || gnx >= cw || gny >= chh) continue;
                var gpx = card.x0 + gnx, gpy = card.y0 + gny;
                flood(gpx, gpy, growTol);
                /* panel that only the edge tone recognises keeps spreading */
                if (!reached[gny * cw + gnx] && nearEdgeTone(gpx, gpy, nearestMed(gpx, gpy))) {
                  reached[gny * cw + gnx] = 1;
                  queue[tail++] = gny * cw + gnx;
                }
              }
            }
          }
        };
        runFlood(96);
        /* only open the tolerance up when the panel model clearly missed */
        var cleared = 0;
        for (y = 0; y < chh; y++) for (x = 0; x < cw; x++) if (!reached[y * cw + x]) cleared++;
        if (cleared / (cw * chh) > 0.55) runFlood(152);
        for (y = 0; y < chh; y++) for (x = 0; x < cw; x++) {
          if (reached[y * cw + x]) data[((card.y0 + y) * w + card.x0 + x) * 4 + 3] = 0;
        }
        /* Panel the figure fences off (the gap between a pair of legs, or the
           notch under a raised arm) cannot be reached from the border. Clear
           such a hole only when it is small and holds no ink at all: the panel
           is a pale wash and every drawn pixel has a dark outline somewhere,
           so a piece of art can never be mistaken for background here. */
        var seen = new Uint8Array(cw * chh);
        for (var s0 = 0; s0 < cw * chh; s0++) {
          if (seen[s0] || reached[s0]) continue;
          var comp = [];
          var sum = 0, worst = 0, darkest = 255;
          head = 0; tail = 0; queue[tail++] = s0; seen[s0] = 1;
          while (head < tail) {
            var hq = queue[head++];
            var hqx = hq % cw, hqy = (hq - hqx) / cw;
            comp.push(hq);
            var hpx = card.x0 + hqx, hpy = card.y0 + hqy;
            var hd = panelDistance(hpx, hpy);
            sum += hd;
            if (hd > worst) worst = hd;
            var hpi = (hpy * w + hpx) * 4;
            var hlum = (data[hpi] * 0.299 + data[hpi + 1] * 0.587 + data[hpi + 2] * 0.114);
            if (hlum < darkest) darkest = hlum;
            for (var hdy = -1; hdy <= 1; hdy++) {
              for (var hdx = -1; hdx <= 1; hdx++) {
                var hnx = hqx + hdx, hny = hqy + hdy;
                if (hnx < 0 || hny < 0 || hnx >= cw || hny >= chh) continue;
                var hni = hny * cw + hnx;
                if (seen[hni]) continue;
                seen[hni] = 1;
                queue[tail++] = hni;
              }
            }
          }
          if (comp.length > cw * chh * 0.12) continue;
          if (darkest < 108) continue;
          if (worst > 130 || sum / comp.length > 58) continue;
          for (var ci = 0; ci < comp.length; ci++) {
            var cp = comp[ci];
            var cpy = (cp - (cp % cw)) / cw, cpx = cp % cw;
            data[((card.y0 + cpy) * w + card.x0 + cpx) * 4 + 3] = 0;
          }
        }
        /* one pixel of jpeg fringe hugging every silhouette */
        for (y = card.y0; y <= card.y1; y++) {
          for (x = card.x0; x <= card.x1; x++) {
            i = (y * w + x) * 4;
            if (data[i + 3] === 0) continue;
            var touch = false;
            if (x > card.x0 && data[i - 1] === 0) touch = true;
            else if (x < card.x1 && data[i + 7] === 0) touch = true;
            else if (y > card.y0 && data[i - w * 4 + 3] === 0) touch = true;
            else if (y < card.y1 && data[i + w * 4 + 3] === 0) touch = true;
            if (!touch) continue;
            d = panelDistance(x, y);
            if (d < 120) data[i + 3] = 0;
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    frostfallKeyed[key] = { canvas: canvas, grid: grid, ctx: ctx, w: canvas.width, h: canvas.height, key: key };
    return frostfallKeyed[key];
  }

  /* The character inside one card: the biggest solid silhouette, with pieces
     whose centre sits inside it (a staff held away from the body) folded in,
     the card outline rejected, and sparse edge rows trimmed. */
  function frostfallArtBox(state, row, col) {
    var boxKey = state.key + '|' + row + '|' + col;
    if (frostfallArtBoxes[boxKey] !== undefined) return frostfallArtBoxes[boxKey];
    var card = state.grid[row] && state.grid[row][col];
    if (!card) return (frostfallArtBoxes[boxKey] = null);
    var data = state.ctx.getImageData(0, 0, state.w, state.h).data;
    var ch = card.h;
    /* a few poses hold a staff or shield out past the card edge, so the search
       window reaches into the gap on both sides; the silhouette that belongs to
       this card is the one whose centre sits over it */
    var pad = 0;
    var wx0 = Math.max(0, card.x0 - pad);
    var cw = Math.min(state.w - 1, card.x1 + pad) - wx0 + 1;
    var mask = new Uint8Array(cw * ch);
    for (var y = 0; y < ch; y++) {
      for (var x = 0; x < cw; x++) {
        mask[y * cw + x] = data[((card.y0 + y) * state.w + wx0 + x) * 4 + 3] > 40 ? 1 : 0;
      }
    }
    var seen = new Uint8Array(cw * ch);
    var stack = [];
    var pieces = [];
    var best = null;
    for (var s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      var count = 0, minX = cw, minY = ch, maxX = -1, maxY = -1;
      stack.length = 0;
      stack.push(s);
      seen[s] = 1;
      while (stack.length) {
        var p = stack.pop();
        var px = p % cw, py = (p - px) / cw;
        count++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
            var np = ny * cw + nx;
            if (!mask[np] || seen[np]) continue;
            seen[np] = 1;
            stack.push(np);
          }
        }
      }
      var piece = { count: count, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      pieces.push(piece);
      /* a card outline is a hollow, card-sized frame: never the character */
      var hollow = piece.count < piece.w * piece.h * 0.25;
      var ring = piece.w > cw * 0.9 && piece.h > ch * 0.9;
      if (hollow || ring || piece.count < 400 || piece.w < 20 || piece.h < ch * 0.15) continue;
      var centre = wx0 + piece.x + piece.w / 2;
      if (centre < card.x0 - 8 || centre > card.x1 + 8) continue;
      if (!best || piece.count > best.count) best = piece;
    }
    if (!best) return (frostfallArtBoxes[boxKey] = null);
    var box = { x: best.x, y: best.y, w: best.w, h: best.h };
    for (var pi = 0; pi < pieces.length; pi++) {
      var frag = pieces[pi];
      if (frag === best || frag.count < 60) continue;
      if (frag.w > cw * 0.9 && frag.h > ch * 0.9) continue;
      var cx2 = frag.x + frag.w / 2, cy2 = frag.y + frag.h / 2;
      if (cx2 < box.x - 4 || cx2 > box.x + box.w + 4) continue;
      if (cy2 < box.y - 4 || cy2 > box.y + box.h + 4) continue;
      var mx1 = Math.min(box.x, frag.x), my1 = Math.min(box.y, frag.y);
      var mx2 = Math.max(box.x + box.w, frag.x + frag.w), my2 = Math.max(box.y + box.h, frag.y + frag.h);
      box = { x: mx1, y: my1, w: mx2 - mx1, h: my2 - my1 };
    }
    /* trim edge rows and columns that hold almost no art */
    function columnDensity(cx) {
      var on = 0;
      for (var yy = box.y; yy < box.y + box.h; yy++) if (mask[yy * cw + cx]) on++;
      return box.h ? on / box.h : 0;
    }
    function rowDensity(ry) {
      var on = 0;
      for (var xx = box.x; xx < box.x + box.w; xx++) if (mask[ry * cw + xx]) on++;
      return box.w ? on / box.w : 0;
    }
    while (box.w > 10 && columnDensity(box.x) < 0.16) { box.x++; box.w--; }
    while (box.w > 10 && columnDensity(box.x + box.w - 1) < 0.16) box.w--;
    while (box.h > 10 && rowDensity(box.y) < 0.16) { box.y++; box.h--; }
    var out = { x: wx0 + box.x, y: card.y0 + box.y, w: box.w, h: box.h, card: card };
    frostfallArtBoxes[boxKey] = out;
    return out;
  }

  /* === NEW: CHARACTER FACTORY ===
     Palette swapper: every low-saturation pixel in the row (the neutral
     white/grey template clothing, plate armour, fur trim) is replaced by a
     palette tone, keeping the original shading by scaling through the old
     luminance. Coloured art (eyes, gems, ice) is left alone. The result is
     cached in an offscreen canvas with smoothing off. */
  function recolorSpriteSheet(source, palette, cacheKey) {
    if (!source) return null;
    var key = cacheKey || '';
    if (frostfallPaletteCache[key]) return frostfallPaletteCache[key];
    var canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    var primary = palette && palette.primary !== undefined ? palette.primary : 0xd8333f;
    var secondary = palette && palette.secondary !== undefined ? palette.secondary : 0x2b3550;
    var accent = palette && palette.accent !== undefined ? palette.accent : 0xf2c49c;
    var tone = [hexBytes(primary), hexBytes(secondary), hexBytes(accent)];
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var sat = max ? (max - min) / max : 0;
      if (sat > 0.24 || max < 70) continue;      /* coloured art or deep ink */
      var lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      var target = lum > 0.86 ? tone[2] : lum > 0.6 ? tone[0] : tone[1];
      var shadeK = clamp(lum / (lum > 0.86 ? 0.93 : lum > 0.6 ? 0.74 : 0.46), 0.55, 1.35);
      data[i] = clamp(target[0] * shadeK, 0, 255);
      data[i + 1] = clamp(target[1] * shadeK, 0, 255);
      data[i + 2] = clamp(target[2] * shadeK, 0, 255);
    }
    ctx.putImageData(image, 0, 0);
    frostfallPaletteCache[key] = canvas;
    return canvas;
  }

  /* === NEW: CHARACTER FACTORY ===
     Pixel-art accessory stamped onto the head (above the art) and hand
     (right side, about halfway down). Everything is drawn with fillRect on
     a small grid so it stays crisp at any zoom. */
  function drawCharacterAccessory(ctx, head, hand, kind, palette) {
    if (!kind || kind === 'none' || !ctx) return;
    var u = Math.max(2, Math.round(head.w / 10));
    var cx = head.x + head.w / 2;
    var top = head.y;
    var accent = palette && palette.accent !== undefined ? palette.accent : 0xe9c96a;
    var primary = palette && palette.primary !== undefined ? palette.primary : 0xd8333f;
    var ink = '#160d1e';
    function box(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    if (kind === 'beanie') {
      box(cx - head.w * 0.34, top - u * 1.2, head.w * 0.68, u * 1.6, ink);
      box(cx - head.w * 0.3, top - u * 1.1, head.w * 0.6, u * 1.4, cssHex(primary));
      for (var b = 0; b < 4; b++) {
        box(cx - head.w * 0.3 + b * head.w * 0.16, top - u * 2.1, head.w * 0.14, u * 1.1, cssHex(shadeHex(primary, 1.15)));
      }
      box(cx - u * 0.9, top - u * 2.9, u * 1.8, u * 1.1, cssHex(accent));
    } else if (kind === 'crown') {
      box(cx - head.w * 0.32, top - u * 1.0, head.w * 0.64, u * 1.5, ink);
      box(cx - head.w * 0.3, top - u * 1.0, head.w * 0.6, u * 1.2, cssHex(accent));
      for (var c = 0; c < 3; c++) {
        var px = cx - head.w * 0.3 + c * head.w * 0.2;
        box(px, top - u * 2.6, head.w * 0.16, u * 1.8, cssHex(accent));
        box(px + head.w * 0.04, top - u * 3.2, head.w * 0.08, u * 0.8, cssHex(shadeHex(accent, 1.25)));
      }
      box(cx - u * 0.5, top - u * 0.7, u, u, '#ff5f7a');
    } else if (kind === 'wizard_hat') {
      box(cx - head.w * 0.46, top - u * 1.1, head.w * 0.92, u * 1.3, ink);
      box(cx - head.w * 0.44, top - u * 1.0, head.w * 0.88, u * 1.0, cssHex(shadeHex(primary, 0.8)));
      for (var w = 0; w < 6; w++) {
        var ww = head.w * (0.62 - w * 0.09);
        box(cx - ww / 2, top - u * (1.4 + w), ww, u * 1.1, cssHex(w % 2 ? shadeHex(primary, 0.9) : primary));
      }
      box(cx - u * 0.6, top - u * 7.4, u * 1.2, u * 1.2, cssHex(accent));
    } else if (kind === 'scarf') {
      var sx = cx - head.w * 0.38;
      var sy = top + head.h * 1.05;
      box(sx, sy, head.w * 0.76, u * 1.5, ink);
      box(sx + u * 0.3, sy + u * 0.3, head.w * 0.7, u * 1.0, cssHex(primary));
      box(sx + head.w * 0.42, sy + u * 1.2, head.w * 0.3, u * 1.6, ink);
      box(sx + head.w * 0.46, sy + u * 1.3, head.w * 0.22, u * 1.4, cssHex(shadeHex(primary, 1.15)));
    } else if (kind === 'lantern') {
      var lx = hand.x + u * 0.6;
      var ly = hand.y;
      box(lx + u * 0.4, ly - u * 1.8, u * 0.8, u * 1.8, '#7a5a32');
      box(lx, ly - u * 0.4, u * 2.2, u * 3.0, ink);
      box(lx + u * 0.2, ly, u * 1.8, u * 2.2, cssHex(accent));
      box(lx + u * 0.6, ly + u * 0.4, u * 1.0, u * 1.3, '#fff6c4');
      ctx.globalAlpha = 0.22;
      box(lx - u, ly - u * 1.1, u * 4.2, u * 4.4, cssHex(accent));
      ctx.globalAlpha = 1;
    } else if (kind === 'ice_spear') {
      var bx = hand.x + u * 0.4;
      var by = hand.y + u * 0.6;
      ctx.lineWidth = u;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(bx - u, by + u * 5.5);
      ctx.lineTo(bx + u, by - u * 5.5);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, u * 0.5);
      ctx.strokeStyle = '#bfe9ff';
      ctx.beginPath();
      ctx.moveTo(bx - u, by + u * 5.5);
      ctx.lineTo(bx + u, by - u * 5.5);
      ctx.stroke();
      box(bx + u * 0.2, by - u * 7.4, u * 2.0, u * 2.4, '#8fdcff');
      box(bx + u * 0.8, by - u * 8.2, u * 1.0, u * 1.4, '#ffffff');
    }
  }

  /* === NEW: CHARACTER FACTORY ===
     Cut four frames (idle, walk, attack, hurt) out of a row, key the blue
     card, recolour, stamp the accessory, and lay them into an 8 column
     atlas that matches SPRITE_FRAMES indices the rest of the game uses. */
  function frostfallBuildAtlas(def) {
    var sheetState = frostfallSheet(def.spriteSource);
    if (!sheetState || sheetState.state !== 'ready' || !sheetState.canvas) return null;
    var sheet = sheetState.canvas;
    var sctx = sheet.getContext('2d');
    if (!sctx) return null;
    var state = frostfallKeyedSheet(sheet, def.spriteSource);
    if (!state) return null;
    var frame = FROSTFALL_FRAME;
    /* one measured box per pose column, drawn on a scale shared by the whole
       row so the frames do not pop between poses */
    var boxes = [];
    for (var f = 1; f < FROSTFALL_SHEET_COLS; f++) boxes.push(frostfallArtBox(state, def.row, f));
    var found = [];
    for (var fi0 = 0; fi0 < boxes.length; fi0++) if (boxes[fi0]) found.push(boxes[fi0]);
    if (!found.length) return null;
    /* one card in a row can crop short (a pose that tucks the body behind a
       prop). Judge the character by the middle of the row and let any odd card
       reuse a good frame instead of pulling the whole atlas down in size. */
    var hs = found.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; });
    var ws = found.map(function (b) { return b.w; }).sort(function (a, b) { return a - b; });
    var medH = hs[Math.floor(hs.length / 2)];
    var medW = ws[Math.floor(ws.length / 2)];
    var fallback = found[0];
    for (var fi1 = 0; fi1 < boxes.length; fi1++) {
      var cand = boxes[fi1];
      if (!cand || cand.w < medW * 0.45 || cand.h < medH * 0.45) boxes[fi1] = fallback;
    }
    var maxW = 1, maxH = 1;
    for (var bi = 0; bi < boxes.length; bi++) {
      var probe = boxes[bi] || fallback;
      if (probe.w > maxW) maxW = probe.w;
      if (probe.h > maxH) maxH = probe.h;
    }
    var scale = Math.min((frame - 12) / maxW, (frame - 22) / maxH);
    var frames = [];
    for (var fi = 0; fi < 4; fi++) {
      var box = boxes[fi] || boxes[0];
      var cell = document.createElement('canvas');
      cell.width = frame;
      cell.height = frame;
      var cctx = cell.getContext('2d');
      if (!cctx) continue;
      cctx.imageSmoothingEnabled = false;
      var dw = Math.max(1, Math.round(box.w * scale));
      var dh = Math.max(1, Math.round(box.h * scale));
      cctx.drawImage(state.canvas, box.x, box.y, box.w, box.h, Math.round((frame - dw) / 2), frame - 4 - dh, dw, dh);
      frames.push(cell);
    }
    if (!frames.length) return null;
    var recolored = [];
    for (var fi = 0; fi < frames.length; fi++) {
      recolored.push(recolorSpriteSheet(frames[fi], def.palette, def.id + '|frame' + fi) || frames[fi]);
    }
    for (var af = 0; af < recolored.length; af++) {
      var canvas = recolored[af];
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      var art = ctx.getImageData(0, 0, frame, frame).data;
      var minX = frame, minY = frame, maxX = -1, maxY = -1;
      for (var y2 = 0; y2 < frame; y2++) {
        for (var x2 = 0; x2 < frame; x2++) {
          if (art[(y2 * frame + x2) * 4 + 3] < 24) continue;
          if (x2 < minX) minX = x2;
          if (x2 > maxX) maxX = x2;
          if (y2 < minY) minY = y2;
          if (y2 > maxY) maxY = y2;
        }
      }
      if (maxX < 0) continue;
      var artW = maxX - minX + 1;
      var headW = artW * 0.52;
      /* the head band is deliberately shallow: hats sit on top of it and the
         scarf hangs just under it, at the neck rather than across the face */
      var head = { x: minX + (artW - headW) / 2, y: minY, w: headW, h: (maxY - minY + 1) * 0.26 };
      var hand = { x: minX + (maxX - minX) * 0.72, y: minY + (maxY - minY) * 0.52 };
      drawCharacterAccessory(ctx, head, hand, def.accessory, def.palette);
    }
    /* 8 column atlas: idle x3, walk, talk, cheer, ready, hurt */
    var order = [0, 0, 0, 1, 2, 2, 0, 3];
    var atlas = document.createElement('canvas');
    atlas.width = frame * FROSTFALL_ATLAS_COLS;
    atlas.height = frame;
    var actx = atlas.getContext('2d');
    if (!actx) return null;
    actx.imageSmoothingEnabled = false;
    for (var oi = 0; oi < order.length; oi++) {
      actx.drawImage(recolored[order[oi]], oi * frame, 0);
    }
    return { canvas: atlas, cols: FROSTFALL_ATLAS_COLS, rows: 1 };
  }

  /* === NEW: CHARACTER FACTORY ===
     The one-line config table. Add a character by adding a line here; the
     factory handles the art, the palette, the accessory and both spawners. */
  var FROSTFALL_ROSTER = {
    mayorBram: {
      name: 'MAYOR BRAM', role: 'npc', spriteSource: 'cast', row: 0,
      palette: { primary: 0x30456e, secondary: 0x1d2740, accent: 0xe9c96a },
      accessory: 'none', hp: 40, atk: 3, dialogue: [
        'FROSTFALL IS A WEEK OUT AND THE TOWN TREE IS ALREADY NAKED.',
        'FIVE RELICS. FIVE THIEVES. YOU SEE THE SHAPE OF MY PROBLEM.'
      ], blipPitch: 0.86
    },
    tutorialTerry: {
      name: 'TUTORIAL TERRY', role: 'npc', spriteSource: 'terry', row: 1,
      palette: { primary: 0x3f56b8, secondary: 0x1e2660, accent: 0xffd257 },
      accessory: 'scarf', hp: 30, atk: 4, dialogue: [
        'I AM A PENGUIN. I DO NOT ENJOY THE COLD. DO NOT ASK.',
        'PRESS SWORD, THEN STOP THE BAR IN THE GOLD. THAT IS THE WHOLE GAME, KID.'
      ], blipPitch: 1.35
    },
    roadtownShopkeeper: {
      name: 'ROADTOWN SHOPKEEPER', role: 'npc', spriteSource: 'extras', row: 1,
      palette: { primary: 0x6b4a2a, secondary: 0x2f2418, accent: 0xffb347 },
      accessory: 'beanie', hp: 26, atk: 2, dialogue: [
        'COCOA, HOT. ONE MUG PER PLAYER PER NIGHT.',
        'THE WOLVES HAVE BEEN EATING MY DELIVERIES. SO IF YOU SEE ONE...'
      ], blipPitch: 1.0
    },
    frostWolf: {
      name: 'FROST WOLF', role: 'enemy', spriteSource: 'extras', row: 0,
      palette: { primary: 0x8fd4ff, secondary: 0x3f7fb8, accent: 0xe8fbff },
      accessory: 'none', hp: 22, atk: 4, xp: 14, agility: 6, blipPitch: 1.5,
      dialogue: ['THE PACK IS THIN THIS YEAR. IT IS NOT YOUR FAULT. IT IS ALSO NOT NOT YOUR FAULT.']
    },
    snowSlime: {
      name: 'SNOW SLIME', role: 'enemy', spriteSource: 'cast', row: 1,
      palette: { primary: 0xbfe9ff, secondary: 0x7fb8e0, accent: 0xffffff },
      accessory: 'none', hp: 16, atk: 3, xp: 9, agility: 3, blipPitch: 1.75,
      dialogue: ['IT IS MOSTLY WATER AND MOSTLY ANGRY.']
    },
    iceGolem: {
      name: 'ICE GOLEM', role: 'enemy', spriteSource: 'extras', row: 2,
      palette: { primary: 0x6fb8e8, secondary: 0x2f5f88, accent: 0xd9f6ff },
      accessory: 'none', hp: 38, atk: 6, xp: 26, agility: 2, blipPitch: 0.62,
      dialogue: ['IT WAS BUILT TO WAIT. IT HAS GOTTEN VERY GOOD AT IT.']
    },
    theLongNight: {
      name: 'THE LONG NIGHT', role: 'boss', spriteSource: 'cast', row: 3,
      palette: { primary: 0x4a2f66, secondary: 0x241533, accent: 0x9fe6ff },
      accessory: 'crown', hp: 60, atk: 7, xp: 70, agility: 4, blipPitch: 0.5,
      dialogue: ['THE STAR WENT OUT. I ONLY MADE IT COMFORTABLE.']
    },
    crimsonGuard: {
      name: 'CRIMSON GUARD', role: 'npc', spriteSource: 'cast', row: 2,
      palette: { primary: 0xa3232f, secondary: 0x5c1219, accent: 0xffd257 },
      accessory: 'crown', hp: 30, atk: 5, dialogue: [
        'THE MAYOR POSTED A GUARD. I AM THE GUARD. I AM ALSO THE PARADE.',
        'NOTHING HAS GOTTEN PAST ME. NOTHING HAS TRIED EITHER.'
      ], blipPitch: 0.74
    },
    lanternScout: {
      name: 'LANTERN SCOUT', role: 'npc', spriteSource: 'cast', row: 2,
      palette: { primary: 0x2f6b4a, secondary: 0x1b3325, accent: 0xffb347 },
      accessory: 'lantern', hp: 24, atk: 3, dialogue: [
        'I LIGHT THE PATH OUT OF TOWN. SOMEBODY HAS TO.',
        'IF YOU SEE A LANTERN BURNING BLUE IN THE PINES, DO NOT FOLLOW IT.'
      ], blipPitch: 1.12
    },
    villagerPip: {
      name: 'VILLAGER PIP', role: 'npc', spriteSource: 'cast', row: 1,
      palette: { primary: 0xf2f8ff, secondary: 0x9fd7e6, accent: 0xff8a2b },
      accessory: 'scarf', hp: 18, atk: 1, dialogue: [
        'YOU LOOK JUST LIKE THE OTHER ONE. ARE YOU THE OTHER ONE?',
        'I AM NOT A SNOWMAN. I AM A VILLAGER. IT IS A WHOLE THING.'
      ], blipPitch: 1.6
    }
  };

  /* === NEW: CHARACTER FACTORY ===
     Build (and cache) a character: atlas canvas, scale and spawn helpers. */
  function createFrostfallCharacter(id) {
    var def = FROSTFALL_ROSTER[id];
    if (!def) return null;
    if (frostfallCharacters[id]) return frostfallCharacters[id];
    def.id = id;                       /* palette cache key needs the id */
    var char = { id: id, def: def, atlas: null, cols: FROSTFALL_ATLAS_COLS, rows: 1, ready: false, waiting: [] };
    frostfallCharacters[id] = char;
    var settle = function () {
      var built = frostfallBuildAtlas(def);
      if (!built) return;
      char.atlas = built.canvas;
      char.cols = built.cols;
      char.rows = built.rows;
      char.ready = true;
      var jobs = char.waiting.slice();
      char.waiting.length = 0;
      for (var i = 0; i < jobs.length; i++) jobs[i](char);
    };
    var sheet = frostfallSheet(def.spriteSource);
    if (sheet.state === 'ready') settle();
    else if (sheet.state === 'loading') sheet.waiting.push(settle);
    return char;
  }

  function frostfallReadyAtlas(char) {
    if (!char || !char.ready || !char.atlas) return null;
    return { canvas: char.atlas, cols: char.cols || FROSTFALL_ATLAS_COLS, rows: char.rows || 1 };
  }

  /* === NEW: CHARACTER FACTORY ===
     A world/battle actor built from a factory character. It is a normal
     sprite actor, so updateActor, the battle camera and the HUD treat it
     exactly like every other sprite in the game. */
  function buildCharacterActor(char) {
    var actor = makeActor(char && char.def && char.def.role === 'npc' ? 'npc' : 'enemy');
    if (!char) return actor;
    actor.character = char;
    actor.characterId = char.id;
    actor.scale = char.def.scale || 1;
    actor.baseY = 0;
    actor.frame = 0;
    actor.facing = 1;
    var dress = function () {
      var atlas = frostfallReadyAtlas(char);
      if (!atlas) return;
      actor.parts.length = 0;
      actor.atlas = atlas;
      actor.spriteObj = {
        sprite: { image: atlas.canvas, uv: spriteWindow(atlas, 0) },
        pos: [0, 0, 0],
        size: [SPRITE_W * actor.scale, SPRITE_H * actor.scale],
        flip: false,
        alpha: 1,
        hidden: false
      };
      actor.windowIndex = -1;
      updateActor(actor);
    };
    if (frostfallReadyAtlas(char)) dress();
    else {
      /* placeholder cube until the sheet decodes, then the pixels swap in */
      addPart(actor, 0x9fb4d8, [0, 0.5, 0], [0, 0.5, 0], [0.9, 1.0, 0.8]);
      char.waiting.push(dress);
    }
    return actor;
  }

  /* === NEW: CHARACTER FACTORY ===
     Drop a roster character anywhere in the live world. One call: actor,
     idle animation, talk prompt and the dialogue lines from the roster. */
  function spawnOverworldNPC(id, x, z, opts) {
    if (!world) return null;
    var char = createFrostfallCharacter(id);
    if (!char) return null;
    opts = opts || {};
    var actor = buildCharacterActor(char);
    actor.x = x;
    actor.z = z;
    actor.y = 0;
    actor.yaw = opts.yaw === undefined ? Math.PI : opts.yaw;
    actor.phase = Math.random() * 6;
    addActor(actor);
    var lines = char.def.dialogue || [];
    if (lines.length) {
      world.interactables.push({
        x: x, z: z, r: 2.4, label: char.def.role === 'npc' ? 'TALK' : 'APPROACH',
        action: function () {
          sound('blip', char.def.blipPitch || 1);
          talk(char.def.name, lines, null);
        }
      });
    }
    return actor;
  }

  /* === NEW: CHARACTER FACTORY ===
     Start a fight with a roster character in one call. The sprite reaches
     buildBattleScene through def.character, so the battle loop, Rolling HP,
     action commands and HUD are untouched. */
  function spawnBattleEnemy(id, opts) {
    var char = createFrostfallCharacter(id);
    if (!char) return null;
    var def = char.def;
    var battleDef = {
      name: def.name,
      hp: def.hp || 20,
      atk: def.atk || 4,
      xp: def.xp || 10,
      agility: def.agility || 4,
      boss: def.role === 'boss',
      character: char,
      model: 'mite'
    };
    startBattle(battleDef, opts || {});
    return battleDef;
  }

  function addVillagers(chapter, index) {
    var count = 10;
    for (var i = 0; i < count; i++) {
      var char = CAST_ROSTER[(index * count + i) % CAST_ROSTER.length];
      if (!char) continue;
      var actor = buildCastActor(char, 1);
      actor.kind = 'npc';
      actor.phase = Math.random() * 6;
      var placed = false;
      for (var tries = 0; tries < 14 && !placed; tries++) {
        var ang = (i / count) * Math.PI * 2 + tries * 0.7 + index * 0.9;
        var radius = 5.4 + ((i + tries) % 6) * 1.5;
        var x = chapter.spawn[0] + Math.cos(ang) * radius;
        var z = chapter.spawn[1] + Math.sin(ang) * radius - 1.4;
        if (blocked(x, z)) continue;
        if (Math.hypot(x - chapter.npc.x, z - chapter.npc.z) < 1.8) continue;
        actor.x = x;
        actor.z = z;
        placed = true;
      }
      if (!placed) continue;
      actor.yaw = Math.PI;
      addActor(actor);
    }
  }

  /* The hero is cut from the Super Mario RPG sheet (The Spriters Resource) and
     baked into img/frostfall/hero-atlas.png on this same 8x4 grid: idle, walk,
     run, hurt, strike and victory frames, keyed off the sheet's green cells. */
  var HERO_ATLAS_URL = '/img/frostfall/hero-atlas.png?v=2';
  var heroSheet = { canvas: null, blank: null, waiting: [], loading: false };

  function blankHeroAtlas() {
    if (!heroSheet.blank) {
      var canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      heroSheet.blank = canvas;
    }
    return heroSheet.blank;
  }

  function loadHeroAtlas() {
    if (heroSheet.canvas || heroSheet.loading) return;
    heroSheet.loading = true;
    var image = new Image();
    image.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      var ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(image, 0, 0);
        heroSheet.canvas = canvas;
      }
      /* Sprites built before the atlas decoded get the real pixels now; the
         fresh canvas is a new texture key, so the renderer uploads it. */
      for (var i = 0; i < heroSheet.waiting.length; i++) {
        var actor = heroSheet.waiting[i];
        if (!actor.spriteObj) continue;
        var rows = actor.castRows || 1;
        var built = actor.castChar ? castAtlas(actor.castChar, rows) : null;
        var image2 = built || canvas;
        actor.atlas = { canvas: image2, cols: SPRITE_COLS, rows: rows };
        actor.spriteObj.sprite.image = image2;
        actor.windowIndex = -1;
        updateActor(actor);
      }
      heroSheet.waiting.length = 0;
    };
    image.onerror = function () { heroSheet.loading = false; };
    image.src = HERO_ATLAS_URL;
  }

  function heroSpriteAtlas() {
    loadHeroAtlas();
    return { canvas: heroSheet.canvas || blankHeroAtlas() };
  }

  /* ==================================================================
     NEW: SINGLE-SHEET SPRITE LOADER + JPEG CHROMA KEY
     animations.jpg packs both heroes into one flat sheet: seven pose rows
     for the boy in the left half, the same seven rows for the girl in the
     right half. A JPG has no alpha, so the blue backing (and the light-blue
     frame boxes) is keyed out once into an offscreen canvas and every row
     is cropped to its own atlas. Cell counts live here so ?debugSprites=1
     can tune them without touching the battle code.
     ================================================================== */
  var ACTION_SHEET = {
    /* The upload is animations.JPG; Linux hosting is case-sensitive, so both
       spellings are tried before giving up on the hero atlas. */
    sources: [params.get('sheetSrc'), '/img/frostfall/animations.jpg', '/img/frostfall/animations.JPG'].filter(Boolean),
    tolerance: 45,
    fps: 9,
    /* Measured cell boxes in the committed 896×1200 contact sheet: each pose
       gets its own labelled band, three boy frames and two girl frames, all
       standing on the band's baseline. Re-measure here if the art changes. */
    sheetWidth: 896,
    sheetHeight: 1200,
    layout: [
      { y: 40, h: 135, boy: { x: 20, w: 142, cols: 3 }, girl: { x: 594, w: 141, cols: 2 } },
      { y: 215, h: 135, boy: { x: 20, w: 142, cols: 3 }, girl: { x: 594, w: 141, cols: 2 } },
      { y: 390, h: 135, boy: { x: 20, w: 161, cols: 3 }, girl: { x: 542, w: 167, cols: 2 } },
      { y: 564, h: 135, boy: { x: 20, w: 160, cols: 3 }, girl: { x: 542, w: 167, cols: 2 } },
      { y: 736, h: 133, boy: { x: 20, w: 161, cols: 3 }, girl: { x: 542, w: 167, cols: 2 } },
      { y: 904, h: 131, boy: { x: 20, w: 161, cols: 3 }, girl: { x: 542, w: 167, cols: 2 } },
      { y: 1069, h: 127, boy: { x: 21, w: 160, cols: 3 }, girl: { x: 542, w: 167, cols: 2 } }
    ],
    names: [
      'IDLE / STANCE', 'POWER STAB / SWORD', 'LINE BOUNCE / BALL',
      'POWER SHOT / SLINGSHOT', 'DYNAMITE / BOMB', 'CURE CARD', 'PASSIVE EQUIP AURA'
    ]
  };
  var actionSheet = { state: 'idle', sheet: null, cache: {}, error: '', layout: ACTION_SHEET.layout, cell: 169, cols: 3, rows: ACTION_SHEET.layout.length };
  var spritesDebug = params.has('debugSprites');

  /* One pass over the whole sheet: everything within `tolerance` of the
     sampled top-left pixel becomes transparent, the next 24 units fade out,
     and leftover blue fringes are pulled back towards their neighbours. */
  function chromaKeySheet(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    var keyR = data[0], keyG = data[1], keyB = data[2];
    var tolerance = ACTION_SHEET.tolerance;
    /* The light-blue frame boxes are a second flat colour, not the backing.
       Find the most common light blue that is not the backing so both go:
       painted blues on a character are far rarer, and never this uniform. */
    var counts = {}, samples = 0, frame = null, frameCount = 0;
    for (var s = 0; s < data.length; s += 16) {
      if (data[s + 3] < 8) continue;
      samples += 1;
      var sr = data[s], sg = data[s + 1], sb = data[s + 2];
      var lum = sr * 0.299 + sg * 0.587 + sb * 0.114;
      if (lum < 140 || sb < sr + 18 || sb < sg + 4) continue;
      var sdr = sr - keyR, sdg = sg - keyG, sdb = sb - keyB;
      if (Math.sqrt(sdr * sdr + sdg * sdg + sdb * sdb) <= tolerance * 1.6) continue;
      var bucket = (sr >> 3) + ',' + (sg >> 3) + ',' + (sb >> 3);
      counts[bucket] = (counts[bucket] || 0) + 1;
      if (counts[bucket] > frameCount) { frameCount = counts[bucket]; frame = [sr, sg, sb]; }
    }
    var frameOk = !!frame && samples > 0 && frameCount >= samples * 0.01;
    actionSheet.frameKey = frameOk ? frame : null;
    for (var i = 0; i < data.length; i += 4) {
      var dr = data[i] - keyR, dg = data[i + 1] - keyG, db = data[i + 2] - keyB;
      var distance = Math.sqrt(dr * dr + dg * dg + db * db);
      if (distance <= tolerance) {
        data[i + 3] = 0;
        continue;
      }
      if (frameOk) {
        var fr = data[i] - frame[0], fg = data[i + 1] - frame[1], fb = data[i + 2] - frame[2];
        if (Math.sqrt(fr * fr + fg * fg + fb * fb) <= tolerance) {
          data[i + 3] = 0;
          continue;
        }
      }
      if (distance < tolerance + 24) {
        data[i + 3] = Math.round(data[i + 3] * (distance - tolerance) / 24);
      }
      /* Spill suppression only near the key colour, so painted blues stay. */
      if (distance < tolerance * 1.8 && data[i + 2] > Math.max(data[i], data[i + 1]) + 22) {
        data[i + 2] = Math.max(data[i], data[i + 1]) + 22;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /* ==================================================================
     === NEW: SPRITE ISLAND SLICING ===
     The measured grid in ACTION_SHEET is a fixed lattice; a wide pose (the
     sword toss, a raised bomb) paints past its own cell, so the neighbour's
     cell picks up a stray sword tip on load. After the chroma key removes
     the blue backing and the light-blue frame boxes, every sprite is its
     own island of opaque pixels: flood fill the cell, keep the island that
     sits lowest (the character's feet) and swap the grid box for its tight
     pixel bounds. White header text is a separate island and never wins.
     ================================================================== */
  var sheetIslands = {};
  var sheetBandScales = {};

  function sheetIslandBox(rowIndex, colIndex, gender) {
    var key = gender + '|' + rowIndex + '|' + colIndex;
    if (sheetIslands[key]) return sheetIslands[key];
    var cell = gridCellBox(rowIndex, colIndex, gender);
    if (!cell) return null;
    var sheet = actionSheet.sheet;
    var ctx = sheet.getContext('2d', { willReadFrequently: true });
    if (!ctx) return cell;
    var iw = Math.max(1, Math.round(cell.w));
    var ih = Math.max(1, Math.round(cell.h));
    var ox = Math.round(cell.x);
    var oy = Math.round(cell.y);
    if (ox < 0 || oy < 0 || ox + iw > sheet.width || oy + ih > sheet.height) return cell;
    var data = ctx.getImageData(ox, oy, iw, ih).data;
    var mask = new Uint8Array(iw * ih);
    for (var p = 0; p < mask.length; p++) mask[p] = data[p * 4 + 3] > 40 ? 1 : 0;
    var seen = new Uint8Array(iw * ih);
    var stack = [];
    var best = null;
    for (var s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      var count = 0, minX = iw, minY = ih, maxX = -1, maxY = -1;
      stack.length = 0;
      stack.push(s);
      seen[s] = 1;
      while (stack.length) {
        var q = stack.pop();
        var px = q % iw, py = (q - px) / iw;
        count++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
            var nq = ny * iw + nx;
            if (!mask[nq] || seen[nq]) continue;
            seen[nq] = 1;
            stack.push(nq);
          }
        }
      }
      if (count < 90) continue;                 /* stray pixels and lettering */
      if (maxX - minX < 6 || maxY - minY < 6) continue;
      /* the feet: the island that reaches lowest in the cell wins, ties by size */
      if (!best || maxY > best.maxY + 2 || (Math.abs(maxY - best.maxY) <= 2 && count > best.count)) {
        best = { count: count, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
      }
    }
    if (!best) return cell;
    var box = {
      x: ox + best.minX, y: oy + best.minY,
      w: best.maxX - best.minX + 1, h: best.maxY - best.minY + 1,
      /* feet anchor inside the cell: used for bottom-centre placement */
      feetX: (best.minX + best.maxX + 1) / 2,
      feetY: best.maxY + 1,
      cellW: iw, cellH: ih
    };
    sheetIslands[key] = box;
    return box;
  }

  /* One scale per band so frames cut from islands of different sizes do not
     pop in scale, and everything still sits on the same baseline. */
  function sheetBandScale(rowIndex, gender) {
    var key = gender + '|' + rowIndex;
    if (sheetBandScales[key]) return sheetBandScales[key];
    var band = actionSheet.layout[rowIndex];
    if (!band) return 1;
    var side = gender === 'girl' ? band.girl : band.boy;
    if (!side || !side.cols) return 1;
    var maxW = 1, maxH = 1;
    for (var c = 0; c < side.cols; c++) {
      var box = sheetIslandBox(rowIndex, c, gender);
      if (!box) continue;
      if (box.w > maxW) maxW = box.w;
      if (box.h > maxH) maxH = box.h;
    }
    var scale = Math.min(SPRITE_CELL / maxW, SPRITE_CELL / maxH);
    sheetBandScales[key] = scale;
    return scale;
  }

  /* A different-sized upload still works: fall back to an even 7-row grid with
     ?sheetCols=N deciding the frame count. */
  function buildSheetLayout(width, height) {
    var known = Math.abs(width - ACTION_SHEET.sheetWidth) <= 2 && Math.abs(height - ACTION_SHEET.sheetHeight) <= 2;
    var layout = [];
    var rows = ACTION_SHEET.layout.length;
    var i;
    if (known) {
      for (i = 0; i < rows; i++) layout.push(ACTION_SHEET.layout[i]);
    } else {
      var cols = clamp(parseInt(params.get('sheetCols'), 10) || 4, 1, 24);
      var halfW = Math.floor(width / 2);
      var cellH = Math.floor(height / rows);
      var cellW = Math.floor(halfW / cols);
      for (i = 0; i < rows; i++) {
        layout.push({
          y: i * cellH, h: cellH,
          boy: { x: 0, w: cellW, cols: cols },
          girl: { x: width - halfW, w: cellW, cols: cols }
        });
      }
    }
    var cell = 0;
    for (i = 0; i < layout.length; i++) {
      cell = Math.max(cell, layout[i].h, layout[i].boy.w, layout[i].girl.w);
    }
    actionSheet.layout = layout;
    actionSheet.rows = layout.length;
    actionSheet.cols = Math.max(layout[0].boy.cols, layout[0].girl.cols);
    actionSheet.cell = Math.ceil(cell) + 2;
  }

  function loadActionSheet() {
    if (actionSheet.state !== 'idle') return;
    actionSheet.state = 'loading';
    var attempt = 0;
    function tryNext() {
      if (attempt >= ACTION_SHEET.sources.length) {
        actionSheet.state = 'failed';
        actionSheet.error = 'animations.jpg / animations.JPG not found';
        buildSheetDebug();
        return;
      }
      var source = ACTION_SHEET.sources[attempt];
      attempt += 1;
      var image = new Image();
      image.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(image, 0, 0);
          chromaKeySheet(canvas);
          buildSheetLayout(canvas.width, canvas.height);
          actionSheet.sheet = canvas;
          actionSheet.cache = {};
          /* === NEW: SPRITE ISLAND SLICING === re-measure from the new sheet */
          sheetIslands = {};
          sheetBandScales = {};
          worldAtlasCache = {};
          actionSheet.state = 'ready';
          if (battlePlayer) refreshBattleSheet();
          refreshHeroArt();
          buildSheetDebug();
        } catch (error) {
          actionSheet.state = 'failed';
          actionSheet.error = String(error && error.message || error);
          buildSheetDebug();
        }
      };
      image.onerror = tryNext;
      image.src = source;
    }
    tryNext();
  }

  /* ==================================================================
     NEW: WORLD HERO FROM THE ACTION SHEET
     The walking hero and the HUD portrait used to be cut from
     img/frostfall/hero-atlas.png, a Super Mario RPG rip. Once the action
     sheet is keyed, its cells are re-cut into the engine's 8x4 grid so the
     overworld billboard, the portrait and the battle all show the same
     character in the same gender. hero-atlas.png stays as the fallback for
     browsers that never load the JPG.
     ================================================================== */
  var worldAtlasCache = {};

  function gridCellBox(rowIndex, colIndex, gender) {
    if (actionSheet.state !== 'ready') return null;
    var band = actionSheet.layout[rowIndex];
    if (!band) return null;
    var who = gender === 'girl' ? 'girl' : gender === 'boy' ? 'boy' : selectedGender;
    var side = who === 'girl' ? band.girl : band.boy;
    if (!side || !side.w || !side.cols) return null;
    var cols = Math.max(1, side.cols);
    /* side.w is one cell, not the whole band (actionRowCanvas relies on that
       too), so the column offset is a straight multiple of it. */
    return {
      x: side.x + side.w * Math.min(Math.max(0, colIndex), cols - 1),
      y: band.y, w: side.w, h: band.h
    };
  }

  /* === NEW: SPRITE ISLAND SLICING === tight bounds per frame, feet anchored */
  function sheetCellBox(rowIndex, colIndex, gender) {
    var who = gender === 'girl' ? 'girl' : gender === 'boy' ? 'boy' : selectedGender;
    var grid = gridCellBox(rowIndex, colIndex, who);
    if (!grid) return null;
    if (actionSheet.state !== 'ready' || !actionSheet.sheet) return grid;
    var island = sheetIslandBox(rowIndex, colIndex, who);
    return island || grid;
  }

  function heroWorldAtlas(gender) {
    if (actionSheet.state !== 'ready' || !actionSheet.sheet) return null;
    var who = gender === 'girl' ? 'girl' : gender === 'boy' ? 'boy' : selectedGender;
    var key = who + '|' + actionSheet.cell;
    if (worldAtlasCache[key]) return worldAtlasCache[key];
    var canvas = document.createElement('canvas');
    canvas.width = SPRITE_CELL * SPRITE_COLS;
    canvas.height = SPRITE_CELL * SPRITE_ROWS;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    /* row 0 is the stance band, 1 the sword swing, 2 the kick, 3 the shot,
       4 the bomb throw, 5 the cure/cheer. The third flag mirrors a cell so
       the two kick frames step onto opposite legs. */
    var plan = [
      [0, 0], [0, 9], [0, 0], [0, 9], [0, 0], [5, 9], [1, 0], [0, 0],
      [2, 0], [0, 9], [2, 0, 1], [0, 9],
      [2, 0], [0, 9], [2, 0, 1], [0, 9],
      [1, 0], [1, 1], [1, 9], [4, 1],
      [3, 0], [5, 0], [5, 9], [5, 0],
      [5, 9], [5, 0], [5, 9], [5, 0],
      [0, 0], [0, 0], [0, 0], [0, 0]
    ];
    for (var i = 0; i < plan.length; i++) {
      var box = sheetCellBox(plan[i][0], plan[i][1], who);
      if (!box) continue;
      /* === NEW: SPRITE ISLAND SLICING === one scale per band, feet on the
         bottom of the cell, centred on the island's feet */
      var scale = sheetBandScale(plan[i][0], who);
      var w = box.w * scale;
      var h = box.h * scale;
      var dx = (i % SPRITE_COLS) * SPRITE_CELL + (SPRITE_CELL - w) / 2;
      var dy = Math.floor(i / SPRITE_COLS) * SPRITE_CELL + (SPRITE_CELL - h);
      ctx.save();
      if (plan[i][2]) {
        ctx.translate(dx + w, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(actionSheet.sheet, box.x, box.y, box.w, box.h, 0, 0, w, h);
      } else {
        ctx.drawImage(actionSheet.sheet, box.x, box.y, box.w, box.h, dx, dy, w, h);
      }
      ctx.restore();
    }
    worldAtlasCache[key] = canvas;
    return canvas;
  }

  /* The new art is a bust rather than a whole-body sheet sprite, so the
     portrait frames the top of the stance cell instead of a cap box. */
  function drawSheetPortrait(ctx, atlas) {
    var cells = atlas.getContext('2d');
    if (!cells) return;
    var data = cells.getImageData(0, 0, SPRITE_CELL, SPRITE_CELL).data;
    var minX = SPRITE_CELL, maxX = -1, minY = SPRITE_CELL, maxY = -1;
    for (var y = 0; y < SPRITE_CELL; y++) {
      for (var x = 0; x < SPRITE_CELL; x++) {
        if (data[(y * SPRITE_CELL + x) * 4 + 3] < 40) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return;
    var height = maxY - minY + 1;
    var headH = Math.max(16, Math.round(height * 0.56));
    var centre = (minX + maxX + 1) / 2;
    var srcW = Math.max(18, Math.round((maxX - minX + 1) * 0.86));
    var scale = (PORTRAIT_PX - 6) / headH;
    var destW = srcW * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      atlas, centre - srcW / 2, Math.max(0, minY - 2), srcW, headH + 2,
      (PORTRAIT_PX - destW) / 2, 4, destW, PORTRAIT_PX - 8
    );
  }

  /* Swapping gender (or the sheet finishing its load) has to re-land the
     walking hero's texture and repaint the head, exactly like the battle. */
  function refreshHeroArt() {
    delete castCache[HERO_CHAR.id + '|' + SPRITE_ROWS];
    delete castCache[HERO_CHAR.id + '|1'];
    if (player && player.castChar === HERO_CHAR && player.spriteObj) {
      var art = castAtlas(HERO_CHAR, player.castRows || SPRITE_ROWS);
      if (art) {
        player.atlas = { canvas: art, cols: SPRITE_COLS, rows: player.castRows || SPRITE_ROWS };
        player.spriteObj.sprite.image = art;
        player.windowIndex = -1;
        updateActor(player);
      }
    }
    paintPortrait();
    if (ui.fileSelect && !ui.fileSelect.hidden) renderFileCards();
  }

  /* A single pose row, already keyed and cropped for the chosen hero. Every
     cell is drawn into a square of the same size, bottom-aligned, so the feet
     and the scale match from row to row. */
  function actionRowCanvas(row) {
    if (actionSheet.state !== 'ready' || !actionSheet.sheet) return null;
    row = clamp(row | 0, 0, actionSheet.rows - 1);
    var key = selectedGender + '|' + row;
    if (actionSheet.cache[key]) return actionSheet.cache[key];
    var info = actionSheet.layout[row];
    if (!info) return null;
    var cells = info[selectedGender];
    var size = actionSheet.cell;
    var canvas = document.createElement('canvas');
    canvas.width = size * cells.cols;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    /* === NEW: SPRITE ISLAND SLICING === each frame is its own tight island,
       bottom-centred on the feet, at one shared scale for the row. */
    var scale = sheetBandScale(row, selectedGender);
    for (var col = 0; col < cells.cols; col++) {
      var frame = sheetCellBox(row, col, selectedGender);
      if (!frame) continue;
      var fw = frame.w * scale;
      var fh = frame.h * scale;
      ctx.drawImage(
        actionSheet.sheet,
        frame.x, frame.y, frame.w, frame.h,
        col * size + Math.round((size - fw) / 2), size - fh,
        fw, fh
      );
    }
    actionSheet.cache[key] = { canvas: canvas, cols: cells.cols, rows: 1 };
    return actionSheet.cache[key];
  }

  /* Action Card -> sheet row. Sword Toss, Power Stab and the plain strike all
     throw the sword, so they share row one. */
  function actionRowForCmd(cmd) {
    if (cmd === 'chain' || cmd === 'soften') return 2;
    if (cmd === 'shot') return 3;
    if (cmd === 'mash') return 4;
    if (cmd === 'cure') return 5;
    return 1;
  }

  function battleSheetRow() {
    if (!battle) return 0;
    if (battle.auraUntil && Date.now() < battle.auraUntil) return 6;
    if (battle.sheetPreview !== null && battle.sheetPreview !== undefined) return battle.sheetPreview;
    if (battle.move && (battle.pose === 'windup' || battle.pose === 'strike')) return actionRowForCmd(battle.move.cmd);
    return 0;
  }

  function battleSheetFrame(row, poseTime, steppedTime) {
    var atlas = actionRowCanvas(row);
    var cols = atlas ? atlas.cols : 1;
    if (battle && battle.pose === 'strike' && battle.move) {
      /* A fired card plays through once and holds its last frame. */
      return Math.min(cols - 1, Math.floor(poseTime / (1000 / ACTION_SHEET.fps)));
    }
    return Math.floor(steppedTime * ACTION_SHEET.fps) % cols;
  }

  function battleSheetApply(row) {
    var atlas = actionRowCanvas(row);
    if (!atlas || !battlePlayer || !battlePlayer.spriteObj) return false;
    if (battlePlayer.atlas !== atlas) {
      battlePlayer.atlas = atlas;
      battlePlayer.spriteObj.sprite.image = atlas.canvas;
      battlePlayer.windowIndex = -1;
    }
    return true;
  }

  function refreshBattleSheet() {
    if (actionSheet.state !== 'ready' || !battlePlayer) return;
    actionSheet.cache = {};
    /* Only swap away from the hero atlas once a real row canvas exists, so a
       half-loaded or malformed sheet can never blank the battler. */
    if (!battleSheetApply(battleSheetRow())) return;
    battlePlayer.windowIndex = -1;
    updateActor(battlePlayer);
  }

  /* === NEW: CHARACTER SELECT === */
  function updateGenderButtons() {
    var buttons = document.querySelectorAll('[data-gender]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].dataset.gender === selectedGender;
      buttons[i].classList.toggle('on', on);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setGender(gender) {
    selectedGender = gender === 'girl' ? 'girl' : 'boy';
    if (save) { save.gender = selectedGender; persist(); }
    updateGenderButtons();
    actionSheet.cache = {};
    if (actionSheet.state === 'ready') {
      refreshBattleSheet();
      refreshHeroArt();
      buildSheetDebug();
    }
    sound('click');
  }

  /* ?debugSprites=1 — the whole keyed sheet with its row/column grid drawn
     on top, so the cell counts in ACTION_SHEET can be tuned by eye. */
  function buildSheetDebug() {
    if (!spritesDebug || !ui.sheetDebug || !ui.sheetDebugCanvas) return;
    ui.sheetDebug.hidden = false;
    var canvas = ui.sheetDebugCanvas;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#120a22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '11px monospace';
    if (actionSheet.state !== 'ready') {
      ctx.fillStyle = '#ff8f9c';
      ctx.fillText('SHEET ' + actionSheet.state.toUpperCase() + (actionSheet.error ? ' · ' + actionSheet.error : ''), 12, 26);
      ctx.fillStyle = '#cbb9ff';
      ctx.fillText('expected at ' + ACTION_SHEET.sources.join(' or '), 12, 46);
      ctx.fillText('?sheetSrc= overrides · ?sheetCols= for a differently sized sheet', 12, 64);
      return;
    }
    var sheet = actionSheet.sheet;
    var scale = Math.min((canvas.width - 24) / sheet.width, (canvas.height - 24) / sheet.height);
    var w = sheet.width * scale, h = sheet.height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, 12, 12, w, h);
    ctx.lineWidth = 1;
    /* Split sheet: the boy half and the girl half, each band boxed exactly as
       the slicer crops it, with the frame count for the chosen hero. */
    ctx.strokeStyle = 'rgba(120, 240, 255, .9)';
    ctx.beginPath();
    ctx.moveTo(12 + w / 2, 12);
    ctx.lineTo(12 + w / 2, 12 + h);
    ctx.stroke();
    for (var row = 0; row < actionSheet.layout.length; row++) {
      var band = actionSheet.layout[row];
      var cells = band[selectedGender];
      ctx.strokeStyle = 'rgba(255, 90, 120, .95)';
      for (var col = 0; col < cells.cols; col++) {
        ctx.strokeRect(
          12 + (cells.x + col * cells.w) * scale,
          12 + band.y * scale,
          cells.w * scale,
          band.h * scale
        );
      }
      ctx.fillStyle = '#ffe08a';
      ctx.fillText((ACTION_SHEET.names[row] || ('ROW ' + row)) + ' · ' + cells.cols + 'F', 14, 12 + (band.y + 8) * scale);
    }
    if (ui.sheetDebugNote) ui.sheetDebugNote.textContent = actionSheet.rows + ' rows · ' + selectedGender + ' · cell ' + actionSheet.cell + 'px · ' + sheet.width + '×' + sheet.height;
  }

  function buildHero(palette) {
    var pal = palette || heroPalette();
    if (pal.hero) return buildCastActor(HERO_CHAR, SPRITE_ROWS);
    var actor = makeActor('player');
    actor.flip = 0;
    actor.facing = 1;
    actor.frame = 0;
    actor.atlas = spriteAtlas(pal);
    if (!actor.atlas) return actor;
    actor.spriteObj = {
      sprite: { image: actor.atlas.canvas, uv: spriteWindow(actor.atlas, 0) },
      pos: [0, 0, 0],
      size: [SPRITE_W, SPRITE_H],
      flip: false,
      alpha: 1,
      hidden: false
    };
    return actor;
  }

  function heroPalette() {
    return { hero: true, coat: 0xd8333f, pants: 0x2f5fb0, scarf: 0xfff4e6, cap: 0xd8333f, skin: 0xf6c9a0, hair: 0x6b432c, shoe: 0x5a3a22, hat: 'cap', glove: 0xfff4e6, button: 0xffd257, trim: 0xfff4e6 };
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

  /* The old pickup was one cyan crystal for all five chapters, which made the
     dialogue lie about what you just picked up. Each chapter now leaves the
     relic it names: a candy cane, a slingshot, a crown, a clapper, the star. */
  function relicPlinth(actor, glow) {
    addPart(actor, 0x2b2440, [0, 0, 0], [0, 0.09, 0], [1.1, 0.18, 1.1]);
    addPart(actor, 0xffe3a8, [0, 0, 0], [0, 0.02, 0], [1.7, 0.06, 1.7], { geo: 'disc', alpha: 0.16 });
    addPart(actor, 0x4a4066, [0, 0, 0], [0, 0.19, 0], [0.86, 0.06, 0.86]);
    addPart(actor, glow, [0, 0, 0], [0, 0.86, 0], [1.5, 1.5, 1.5], { alpha: 0.1 });
  }

  function buildRelicActor(index) {
    var actor = makeActor('relic');
    var i, angle, seg;
    if (index === 0) {
      /* CHAPTER ONE — CANDY CANE CLAYMORE, planted point-down in the snow. */
      relicPlinth(actor, 0xffd6d6);
      for (seg = 0; seg < 6; seg++) {
        addPart(actor, seg % 2 ? 0xd8333f : 0xfff6f1, [0, 0, 0], [0, 0.34 + seg * 0.3, 0], [0.26, 0.3, 0.26]);
      }
      addPart(actor, 0xfff6f1, [0, 2.0, 0], [0.17, 0, 0], [0.52, 0.28, 0.28]);
      addPart(actor, 0xd8333f, [0, 2.0, 0], [0.36, -0.15, 0], [0.3, 0.34, 0.3]);
      addPart(actor, 0xd8333f, [0, 0, 0], [0, 0.64, 0], [0.3, 0.1, 0.3]);
      addPart(actor, 0x3a2a30, [0, 0, 0], [0, 0.24, 0], [0.36, 0.06, 0.36], { geo: 'disc', alpha: 0.5 });
    } else if (index === 1) {
      /* CHAPTER TWO — TINSEL SLINGSHOT on the stump. */
      relicPlinth(actor, 0xd8e8f5);
      addPart(actor, 0x6b472e, [0, 0, 0], [0, 0.78, 0], [0.24, 1.1, 0.24]);
      addPart(actor, 0xd8333f, [0, 0, 0], [0, 0.62, 0], [0.3, 0.16, 0.3]);
      addPart(actor, 0x6b472e, [0, 1.28, 0], [-0.12, 0.34, 0], [0.2, 0.78, 0.2], { rz: 0.5 });
      addPart(actor, 0x6b472e, [0, 1.28, 0], [0.12, 0.34, 0], [0.2, 0.78, 0.2], { rz: -0.5 });
      addPart(actor, 0xeaf4ff, [0, 0, 0], [0, 1.9, 0], [0.76, 0.1, 0.1], { alpha: 0.9 });
      addPart(actor, 0xffe6a3, [0, 0, 0], [-0.36, 1.9, 0], [0.16, 0.16, 0.16]);
      addPart(actor, 0xffe6a3, [0, 0, 0], [0.36, 1.9, 0], [0.16, 0.16, 0.16]);
      addPart(actor, 0xfff6f1, [0, 0, 0], [0, 1.3, 0.18], [0.1, 0.1, 0.1]);
    } else if (index === 2) {
      /* CHAPTER THREE — FROZEN CROWN. Deep-ice band and five tall points give
         it a crown silhouette from the overworld camera, which looks down: the
         old version read as a pile of ice from that angle. */
      relicPlinth(actor, 0xbfe9ff);
      addPart(actor, 0x1c3f5e, [0, 0, 0], [0, 0.66, 0], [0.94, 0.46, 0.94], { geo: 'cylinder' });
      addPart(actor, 0x122838, [0, 0, 0], [0, 0.44, 0], [0.96, 0.1, 0.96], { geo: 'disc' });
      addPart(actor, 0xe8c96a, [0, 0, 0], [0, 0.89, 0], [1.08, 0.14, 1.08], { geo: 'disc' });
      for (i = 0; i < 5; i++) {
        angle = i * Math.PI * 2 / 5;
        addPart(actor, 0xd9f6ff, [0, 0, 0], [Math.cos(angle) * 0.38, 1.28, Math.sin(angle) * 0.38], [0.26, 0.9, 0.26], { geo: 'cone8' });
        addPart(actor, 0xffffff, [0, 0, 0], [Math.cos(angle) * 0.38, 1.77, Math.sin(angle) * 0.38], [0.15, 0.15, 0.15], { geo: 'cone8' });
      }
      addPart(actor, 0x7ce7ff, [0, 0, 0], [0, 0.98, 0.05], [0.32, 0.32, 0.16], { ry: 0.78 });
      addPart(actor, 0xffffff, [0, 0, 0], [0, 0.98, 0.14], [0.12, 0.12, 0.08], { ry: 0.78 });
      addPart(actor, 0x7ce7ff, [0, 0, 0], [0, 0.68, 0.48], [0.34, 0.26, 0.08], { alpha: 0.9 });
      addPart(actor, 0x1b1630, [0, 0, 0], [0, 0.68, 0.51], [0.2, 0.16, 0.06]);
      addPart(actor, 0x9fe6ff, [0, 0, 0], [0, 0.95, 0], [2.0, 2.0, 2.0], { geo: 'disc', alpha: 0.1 });
    } else if (index === 3) {
      /* CHAPTER FOUR — MIDNIGHT CLAPPER, hung in a broken bell frame. */
      relicPlinth(actor, 0xffb347);
      addPart(actor, 0x3a3254, [0, 0, 0], [-0.34, 1.02, 0], [0.14, 1.6, 0.14]);
      addPart(actor, 0x3a3254, [0, 0, 0], [0.34, 1.02, 0], [0.14, 1.6, 0.14]);
      addPart(actor, 0x4a4066, [0, 0, 0], [0, 1.82, 0], [0.82, 0.16, 0.22]);
      addPart(actor, 0x7d6a45, [0, 0, 0], [0, 1.24, 0], [0.11, 1.02, 0.11]);
      addPart(actor, 0x9a8550, [0, 0, 0], [0, 0.72, 0], [0.46, 0.5, 0.46], { geo: 'cone8' });
      addPart(actor, 0x9a8550, [0, 0, 0], [0, 0.5, 0], [0.46, 0.4, 0.46], { geo: 'cone8', rx: Math.PI });
      addPart(actor, 0xffb347, [0, 0, 0], [0, 0.5, 0], [0.9, 0.12, 0.9], { geo: 'disc', alpha: 0.3 });
      addPart(actor, 0x5a4a70, [0, 0, 0], [0.44, 0.21, -0.3], [0.5, 0.08, 0.5], { geo: 'disc', alpha: 0.6 });
    } else if (index === 4) {
      /* CHAPTER FIVE — TOWN TREE STAR, six points of 2010 gold. */
      relicPlinth(actor, 0xffd77a);
      for (i = 0; i < 3; i++) {
        addPart(actor, 0xffd77a, [0, 0, 0], [0, 1.32, 0], [1.7, 0.22, 0.22], { ry: i * Math.PI / 3 });
      }
      addPart(actor, 0xfff8d8, [0, 0, 0], [0, 1.32, 0], [0.52, 0.52, 0.34]);
      addPart(actor, 0xfff8d8, [0, 0, 0], [0, 1.32, 0.18], [0.26, 0.26, 0.16], { alpha: 0.9 });
      addPart(actor, 0xffe3a8, [0, 0, 0], [0, 1.32, 0], [2.1, 2.1, 2.1], { geo: 'disc', alpha: 0.12 });
      addPart(actor, 0xd8e8f5, [0, 0, 0], [0, 1.32, 0], [2.6, 0.05, 0.05], { alpha: 0.35 });
    } else {
      addPart(actor, 0x9ff2ff, [0, 0.7, 0], [0, 0.55, 0], [0.5, 1.5, 0.5], { geo: 'cone8' });
      addPart(actor, 0xffffff, [0, 0.7, 0], [0, 0.4, 0], [0.7, 0.7, 0.7], { alpha: 0.2 });
    }
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

  /* ---------------------------------------------------------- kit models
     Kenney's holiday kit: each prop is a small OBJ sharing one 512px
     colormap. Meshes load in the background and attach to whatever the
     chapter builders already placed, so a chapter never waits on them. */
  var MODEL_URL = '/img/models/holiday/';
  var MODEL_NAMES = [
    'tree-snow-a', 'tree-snow-b', 'tree-snow-c', 'lantern', 'bench', 'snow-pile',
    'snowman', 'present-a-cube', 'present-b-cube', 'candy-cane-red', 'sled',
    'rocks-large', 'wreath'
  ];
  var modelGeo = {};
  var modelTexture = null;
  var modelLoading = false;

  function parseModelOBJ(text) {
    var positions = [], uvs = [], normals = [];
    var outPos = [], outUV = [], outNrm = [], indices = [];
    var lookup = {};
    var lines = text.split('\n');
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l].trim();
      if (!line || line.charAt(0) === '#') continue;
      var parts = line.split(/\s+/);
      var tag = parts[0];
      if (tag === 'v') positions.push(+parts[1], +parts[2], +parts[3]);
      else if (tag === 'vt') uvs.push(+parts[1], +parts[2]);
      else if (tag === 'vn') normals.push(+parts[1], +parts[2], +parts[3]);
      else if (tag === 'f') {
        for (var p = 1; p < parts.length; p++) {
          var corner = parts[p];
          if (lookup[corner] === undefined) {
            var bits = corner.split('/');
            var vi = (parseInt(bits[0], 10) - 1) * 3;
            var ti = bits[1] ? (parseInt(bits[1], 10) - 1) * 2 : -1;
            var ni = bits[2] ? (parseInt(bits[2], 10) - 1) * 3 : -1;
            lookup[corner] = outPos.length / 3;
            outPos.push(positions[vi] || 0, positions[vi + 1] || 0, positions[vi + 2] || 0);
            outUV.push(ti >= 0 ? (uvs[ti] || 0) : 0, ti >= 0 ? (uvs[ti + 1] || 0) : 0);
            var nn = normalsFor(normals, ni);
            outNrm.push(nn[0], nn[1], nn[2]);
          }
          indices.push(lookup[corner]);
        }
      }
    }
    if (!indices.length || indices.length > 65532) return null;
    return {
      position: new Float32Array(outPos),
      uv: new Float32Array(outUV),
      normal: new Float32Array(outNrm),
      index: new Uint16Array(indices)
    };
  }

  function normalsFor(normals, base) {
    if (base < 0) return [0, 1, 0];
    return [normals[base] || 0, normals[base + 1] || 1, normals[base + 2] || 0];
  }

  /* Finished meshes are handed to any placed prop still waiting for them. */
  function attachMeshes() {
    if (!world || !modelTexture) return;
    for (var i = 0; i < world.objects.length; i++) {
      var object = world.objects[i];
      var geo = object.pendingModel ? modelGeo[object.pendingModel] : null;
      if (geo) object.mesh = { geo: geo, texture: modelTexture };
    }
  }

  function loadModels() {
    if (modelLoading || !renderer) return;
    modelLoading = true;
    var texture = new Image();
    texture.onload = function () { modelTexture = texture; attachMeshes(); };
    texture.onerror = function () { modelLoading = false; };
    texture.src = MODEL_URL + 'colormap.png';
    MODEL_NAMES.forEach(function (name) {
      var request = new XMLHttpRequest();
      request.open('GET', MODEL_URL + name + '.obj', true);
      request.onload = function () {
        if (request.status && request.status !== 200) return;
        var geo = renderer.uploadMesh(parseModelOBJ(request.responseText));
        if (geo) modelGeo[name] = geo;
        attachMeshes();
      };
      request.send();
    });
  }

  function modelProp(name, x, z, opts) {
    if (!world) return null;
    opts = opts || {};
    var size = opts.s === undefined ? 1 : opts.s;
    var object = {
      pendingModel: name,
      mesh: null,
      model: mat.compose([x, opts.y || 0, z], [opts.rx || 0, opts.ry || 0, 0], [size, size, size]),
      color: rgb(opts.color === undefined ? 0xffffff : opts.color),
      alpha: opts.alpha === undefined ? 1 : opts.alpha,
      hidden: false
    };
    var geo = modelGeo[name];
    if (geo && modelTexture) object.mesh = { geo: geo, texture: modelTexture };
    world.objects.push(object);
    return object;
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

  /* === NEW: BLOCK HOUSES === flat-roofed, hard-edged and saturated: a plain
     box with a thick roof slab, dark trim, bright window panes, a striped
     awning and an optional chunky pixel sign band. */
  function blockHouse(x, z, w, d, h, opts) {
    opts = opts || {};
    var wall = opts.wall === undefined ? 0xf7e7c6 : opts.wall;
    var trim = opts.trim === undefined ? 0x8a5a3c : opts.trim;
    var face = z + d / 2 + 0.02;
    var doorH = Math.min(1.9, h * 0.46);
    box(x, h / 2, z, w, h, d, wall);
    box(x, h + 0.16, z, w + 0.52, 0.32, d + 0.52, trim);
    box(x, h - 0.24, z, w + 0.26, 0.3, d + 0.26, trim);
    if (opts.chimney) box(x + w * 0.22, h + 1.1, z - d * 0.2, 0.55, 1.8, 0.55, trim);
    box(x, doorH * 0.5 + 0.02, face, 1.2, doorH + 0.14, 0.16, trim);
    box(x, doorH * 0.46, face + 0.09, 0.86, doorH * 0.9, 0.1, 0x6b4230);
    var winY = h * 0.45;
    [-1, 1].forEach(function (side) {
      box(x + side * w * 0.3, winY, face, 1.3, 1.3, 0.14, trim);
      box(x + side * w * 0.3, winY, face + 0.08, 1.0, 1.0, 0.1, 0xbfe9ff);
    });
    if (opts.awning !== false) {
      var awning = opts.awning === undefined ? 0xe2483f : opts.awning;
      for (var i = 0; i < 3; i++) {
        box(x - 0.75 + i * 0.75, doorH + 0.24, face + 0.5, 0.75, 0.18, 1.0, i % 2 ? 0xfffdf4 : awning, { rx: -0.32 });
      }
    }
    if (opts.sign) {
      var px = Math.min(0.15, (w * 0.66) / (String(opts.sign).length * 4));
      var bandY = h * 0.8;
      box(x, bandY, face + 0.04, w * 0.76, 5 * px + 0.36, 0.16, opts.board === undefined ? 0xfff7e6 : opts.board);
      pixelText(opts.sign, x, bandY - 2.5 * px, face + 0.12, px, opts.ink === undefined ? 0xc8323c : opts.ink);
    }
    world.colliders.push({ x: x, z: z, hw: w / 2 + 0.15, hd: d / 2 + 0.15 });
  }

  function house(x, z, w, d, h, wall, roof) {
    blockHouse(x, z, w, d, h, { wall: wall, trim: roof, awning: false, chimney: true });
  }

  /* === NEW: CHECKER LAWN === two batched tones of block tiles, so the ground
     reads as a chunky checkerboard without one draw call per tile. */
  function checkerGround(x, z, width, depth, tile, colorA, colorB, topY) {
    if (!world || !renderer) return;
    var groups = {};
    var cols = Math.max(1, Math.round(width / tile));
    var rows = Math.max(1, Math.round(depth / tile));
    var y = topY === undefined ? 0.03 : topY;
    for (var ix = 0; ix < cols; ix++) {
      for (var iz = 0; iz < rows; iz++) {
        var tone = (ix + iz) % 2 === 0 ? colorA : colorB;
        var list = groups[tone] || (groups[tone] = []);
        list.push(mat.compose([
          x - width / 2 + tile * (ix + 0.5), y, z - depth / 2 + tile * (iz + 0.5)
        ], [0, 0, 0], [tile, 0.08, tile]));
      }
    }
    Object.keys(groups).forEach(function (key) {
      for (var start = 0; start < groups[key].length; start += 400) {
        var geo = renderer.batchGeometry('cube', groups[key].slice(start, start + 400));
        if (!geo) continue;
        world.geometries.push(geo);
        world.objects.push({ geo: geo, model: mat.identity(), color: rgb(Number(key)), alpha: 1, hidden: false });
      }
    });
  }

  function blockBush(x, z, s, leaf) {
    s = s || 1;
    box(x, 0.34 * s, z, 1.15 * s, 0.68 * s, 1.15 * s, leaf === undefined ? 0x45a94e : leaf);
    box(x + 0.38 * s, 0.5 * s, z - 0.22 * s, 0.72 * s, 0.72 * s, 0.72 * s, 0x59c163);
    box(x - 0.4 * s, 0.46 * s, z + 0.24 * s, 0.64 * s, 0.64 * s, 0.64 * s, 0x3d9a48);
  }

  function blockFence(x, z, length, ry, color) {
    color = color === undefined ? 0xfaf6ea : color;
    var posts = Math.max(2, Math.round(length / 1.6));
    for (var i = 0; i <= posts; i++) {
      var off = -length / 2 + (length * i) / posts;
      box(x + Math.cos(ry) * off, 0.55, z + Math.sin(ry) * off, 0.3, 1.1, 0.3, color);
    }
    box(x, 0.8, z, length, 0.18, 0.16, color, { ry: ry });
    box(x, 0.42, z, length, 0.18, 0.16, color, { ry: ry });
  }

  function lamp(x, z, tint) {
    modelProp('lantern', x, z, { s: 1.85, ry: Math.PI / 4, color: tint });
    box(x, 2.78, z, 0.5, 0.5, 0.5, 0xffe9a0, { geo: 'cylinder', alpha: 0.6 });
    box(x, 2.78, z, 1.4, 1.4, 1.4, 0xffd76a, { geo: 'cylinder', alpha: 0.12 });
  }

  /* === NEW: BLOCK TREES === a trunk with stacked cube canopies in saturated
     greens, so every map shares the chunky block look. */
  function tree(x, z, s, tint) {
    s = s || 1;
    var snowy = tint === 0x9aa0c0;
    var leaf = snowy ? 0x2f6d52 : 0x3f9f4a;
    var leaf2 = snowy ? 0x3d8563 : 0x57bd5f;
    box(x, 0.8 * s, z, 0.5 * s, 1.6 * s, 0.5 * s, snowy ? 0x4a3a44 : 0x8a5a3c);
    box(x, 2.1 * s, z, 2.8 * s, 1.5 * s, 2.8 * s, leaf);
    box(x - 1.2 * s, 1.9 * s, z + 0.5 * s, 1.5 * s, 1.1 * s, 1.5 * s, leaf2);
    box(x + 1.15 * s, 2.6 * s, z - 0.45 * s, 1.4 * s, 1.2 * s, 1.4 * s, leaf2);
    box(x, 3.1 * s, z, 1.7 * s, 0.95 * s, 1.7 * s, leaf);
    world.colliders.push({ x: x, z: z, hw: 0.45 * s, hd: 0.45 * s });
  }

  function snowman(x, z, s, tint) {
    modelProp('snowman', x, z, { s: 1.55 * (s || 1), ry: Math.PI, color: tint });
  }

  function bench(x, z, ry, tint) {
    modelProp('bench', x, z, { s: 1.5, ry: ry || 0, color: tint });
  }

  function sled(x, z, ry, tint) {
    modelProp('sled', x, z, { s: 1.6, ry: ry || 0, color: tint });
  }

  function candyCane(x, z, s, tint) {
    modelProp('candy-cane-red', x, z, { s: 2.7 * (s || 1), ry: (x + z) * 0.6, color: tint });
  }

  function presents(x, z, tint) {
    modelProp('present-a-cube', x, z, { s: 1.35, ry: 0.35, color: tint });
    modelProp('present-b-cube', x + 0.5, z + 0.35, { s: 1.05, ry: -0.5, color: tint });
  }

  function rocks(x, z, s, tint) {
    modelProp('rocks-large', x, z, { s: 1.3 * (s || 1), ry: (x * 0.4 + z * 0.9) % 6.283, color: tint });
  }

  function wreathOn(x, y, z, ry, tint) {
    modelProp('wreath', x, z, { y: y, s: 1.35, ry: ry || 0, color: tint });
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

  function snowPile(x, z, s, tint) {
    modelProp('snow-pile', x, z, { s: 1.7 * (s || 1), ry: (x * 0.9 + z * 0.5) % 6.283, color: tint });
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

  /* === NEW: BLOCK TOWN === the town map rebuilt as a sunny, saturated block
     world: checkered lawn, cream sidewalk, flat shopfronts with pixel signs
     and cube-canopy trees. */
  function buildRoadtown() {
    box(0, -0.3, 0, 64, 0.6, 64, 0x67bf43);
    checkerGround(0, 0, 64, 64, 4, 0x8ee06a, 0x67bf43, 0.02);
    box(0, 0.06, 0, 8.6, 0.12, 56, 0xf3e4bd);
    studs(0, 0, 8.6, 56, 0.12, 0xe6d2a2, 1.75);
    box(-4.5, 0.1, 0, 0.42, 0.2, 56, 0xdcc78f);
    box(4.5, 0.1, 0, 0.42, 0.2, 56, 0xdcc78f);
    for (var m = -24; m <= 24; m += 4) box(0, 0.15, m, 7.6, 0.03, 0.24, 0xe3cfa0);
    blockHouse(-11.6, 2.5, 7.6, 7, 4.7, {
      wall: 0xfdf1d8, trim: 0xd9524b, board: 0xfff7e6, ink: 0xc8323c, sign: 'LIBRARY', awning: 0x4aa3d8
    });
    blockHouse(11.5, 2, 7, 6, 4.6, {
      wall: 0xffe3b8, trim: 0x9a6535, board: 0x6b4a2c, ink: 0xfff1c7, sign: 'GENERAL STORE', awning: 0xe2483f
    });
    blockHouse(-11.5, -9.5, 6.4, 6, 4.4, { wall: 0xbfe6c4, trim: 0x2f7a4d, awning: 0xffffff });
    blockHouse(11.5, -10.5, 7, 6, 4.2, { wall: 0xbcd8f2, trim: 0x3d5f8a, awning: 0xffcf3f });
    sign('ROADTOWN', 0, 7.6);
    inspect(0, 7.6, 'ROADTOWN', [
      'ROADTOWN · POP. 214 · RELICS 0 · SNOW 6 FT.',
      'Someone crossed out WELCOME and wrote PLEASE CLOSE THE SKY.',
      'Under that, in pencil: "also the portal is still on. we can hear it."'
    ], 3);
    fountain(0, -4);
    inspect(0, -4, 'FOUNTAIN', [
      'The fountain is frozen mid-splash. It looks personally offended.',
      'A little plaque reads NO SKATING. It is covered in skate marks and one set of claw marks.'
    ], 2.6);
    inspect(11.5, 5.6, 'GENERAL STORE', [
      'A hand-painted sign: GENERAL STORE · OPEN · PROBABLY.',
      'The door is locked. A note says GONE TO FROSTFEST 2010. BACK IN 16 YEARS.'
    ], 2.8);
    lamp(-3.9, 2.5); lamp(3.9, -1.5); lamp(-3.9, -10); lamp(3.9, 8);
    tree(-8.4, 13.5, 1.1); tree(8.4, 14, 1.0); tree(-15.5, -3, 1.05); tree(15.5, -3.5, 1.0);
    tree(-17, -16, 1.2); tree(17, -18, 1.1);
    tree(-7, -19.5, 0.95); tree(7.5, -20, 1.0);
    blockFence(-5.4, 9.5, 9, Math.PI / 2); blockFence(5.4, 9.5, 9, Math.PI / 2);
    blockFence(-5.4, -13, 8, Math.PI / 2); blockFence(5.4, -14, 8, Math.PI / 2);
    blockBush(-6.2, 5.2, 1.1); blockBush(6.4, 6.4, 0.9); blockBush(-6.6, -6.4, 1);
    blockBush(6.2, -3.2, 0.85); blockBush(13.6, -4.6, 1.05);
    bench(-2.8, 1.6, -0.55); bench(2.8, -6.4, 2.55);
    snowman(-7.6, 6.4, 1);
    presents(9.6, 4.9);
    candyCane(-3.2, 4.6); candyCane(3.2, 1.2); candyCane(-3.2, -3.4); candyCane(3.2, -8.4);
    sled(-13.4, 6.6, 0.45);
    wreathOn(11.5, 2.4, 5.06, 0);
    wreathOn(-11.6, 2.6, 6.06, 0);
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
      'Someone left a marshmallow on a stick. It is now a small, haunted rock.'
    ], 2.4);
    inspect(-15.5, 2, 'RANGER HUT', [
      'A hand-lettered sign: WHISPERING PINES · QUIET HOURS 24/7.',
      'Inside: eleven coffee cups and a note that says IF I AM QUIET, I AM NOT OKAY.'
    ], 2.8);
    lamp(3.2, 5);
    lamp(-3.2, -10);
    snowPile(-6, 9, 0.9); snowPile(5, -6, 1.1); snowPile(10, 11, 0.8);
    rocks(-6.2, 12.5, 1); rocks(7.4, -12.6, 0.9); rocks(-17, 8, 0.8);
    bench(-4.6, 2.6, 0.35);
    snowman(1.8, -7.2, 0.9);
    candyCane(-2.8, 12); candyCane(2.8, -13.5);
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
      'The lake taps back when you knock. Politely. Twice. The third time is not polite.'
    ], 2.6);
    inspect(-9, 4, 'FISH HUT', [
      'A cabin that smells like bait and regret.',
      'The calendar is still on December 2010. Every day since has been circled.'
    ], 2.8);
    house(-9, 4, 5.5, 5, 3.2, 0x6a5a4a, 0x3f3028);
    box(-9, 0.4, 7.2, 1.4, 0.8, 1.0, 0x4a3322);
    lamp(-3, 7); lamp(3, -3);
    tree(-16, -2, 1.1); tree(-15, -14, 1.0); tree(16, -6, 1.1); tree(15, 10, 0.9);
    snowPile(-13, 9, 1); snowPile(12, 3, 0.8); snowPile(-7, -18, 1.1); snowPile(8, -17, 0.9);
    sled(6.4, -3.6, 0.9); sled(-11.8, 8.2, -0.3);
    snowman(-11.2, 9.4, 1); snowman(12.6, 6.4, 0.8);
    rocks(-18, 6, 1); rocks(17, -14, 0.9);
    bench(-6.6, -1.2, 0.8);
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
      'Someone has scratched "it counts back" underneath. Someone else has added "she is right".'
    ], 2.8);
    inspect(13, 3, 'TOWNHOUSE', [
      'Every window is dark except one, where a candle is burning in the shape of a lowercase help.',
      'The doormat says WELCOME. It is upside down.'
    ], 2.8);
    tree(-18, 11, 1); tree(18, 12, 1); tree(-18, -17, 0.9); tree(18, -18, 1);
    snowPile(-7, 8, 0.8); snowPile(8, -8, 0.9);
    candyCane(-3.2, 8.4); candyCane(3.2, -5.6); candyCane(-3.2, -12); candyCane(3.2, 13);
    bench(-6.4, -3.2, 0.6); bench(6.4, -6.4, -0.6);
    presents(-9.4, 8.2); sled(9.6, 8.6, -0.5);
    wreathOn(13, 2.0, 5.56, 0);
    rocks(-19, 4, 0.9);
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
    lamp(-3, 7, 0x9aa0c0); lamp(3, 7, 0x9aa0c0);
    presents(-3.6, -8.4, 0x9aa0c0); presents(3.6, -8.4, 0x9aa0c0);
    rocks(-5.4, 4.6, 1, 0x9aa0c0); rocks(5.6, -3.4, 0.9, 0x9aa0c0);
    wreathOn(0, 0.8, -10.2, 0, 0x9aa0c0);
    inspect(0, -9.4, 'ALTAR', [
      'Five grooves wait in the stone. All five are warm now.',
      'Carved underneath: THE STAR IS NOT LOST. IT IS WAITING TO BE LIT. Under that: "OR PUT OUT. WE NEVER FINISHED THE SENTENCE."',
      'Someone has left a mug up here. It is still steaming. Nobody has been up here in years.'
    ], 2.8);
    inspect(4, 2, 'SUMMIT', [
      'From up here, Roadtown looks like a handful of lights someone dropped.',
      'The wind is saying your name. It is getting the pronunciation wrong on purpose.'
    ], 2.4);
    snowPile(-5, 3, 0.8, 0x9aa0c0); snowPile(6, -2, 0.9, 0x9aa0c0);
  }

  /* -------------------------------------------------------------- chapters */
  var CHAPTERS = [
    {
      num: 'ONE', title: 'ROADTOWN IN THE SNOW', sub: 'Frostfest 2010, population: you',
      relic: 'CANDY CANE CLAYMORE',
      theme: 'day', fog: [0.62, 0.82, 0.99], spawn: [0.9, 12],
      intro: [
        'Frostfest 2010 was supposed to be a party. You got the server instead.',
        'Roadtown is snowed in, the tree is dark, and something under the ice has started knocking.',
        'Mayor Bram is waiting by the square with a plan. Pip is waiting with cocoa and doubts.'
      ],
      outro: [
        'The Frost Mite pops like a snow globe. A candy cane the size of a door swings free of the ice.',
        'CANDY CANE CLAYMORE. Bram takes it "for safekeeping" and definitely does not hum while pocketing it.',
        'He says the next relic is in the Whispering Pines. Nobody was supposed to go in the Whispering Pines.'
      ],
      npc: {
        name: 'MAYOR BRAM', x: 2.2, z: 9, palette: 'bram',
        lines: [
          'You saw it, right? Five Sacred Relics, gone straight off the Town Tree. Classic Holiday Griefer work.',
          'The Frost Shades brought the cold with them. Clear them out of the square and the fountain ice should crack.',
          'Bring me the relic and I will keep it somewhere extremely safe. Trust me. I am the Mayor.'
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
          'The fountain ice splits. Something with too many legs climbs out, chewing the backup generator cable.',
          'FROST MITE: "COLD... CRUNCHY... BOOTS..."'
        ]
      },
      build: buildRoadtown
    },
    {
      num: 'TWO', title: 'THE WHISPERING PINES', sub: 'The trees remember every step',
      relic: 'TINSEL SLINGSHOT',
      theme: 'night', fog: [0.16, 0.18, 0.32], spawn: [0, 13],
      intro: [
        'The Whispering Pines used to be a quiet place to get lost in.',
        'Now the trees lean in when you pass, and the snow repeats your name back in your own voice.',
        'Juniper went to check the old grove three days ago. Juniper is still out there.'
      ],
      outro: [
        'The wraith folds into a heap of dry needles. A tinsel slingshot sits bolted to the stump underneath it.',
        'Juniper works the bolts loose and goes very quiet. "Trees do not grow around locks unless they are keeping something IN."',
        'TINSEL SLINGSHOT. She says to keep this one away from the Mayor. You do not ask why. She does not offer.'
      ],
      npc: {
        name: 'JUNIPER', x: -4.8, z: 3.2, palette: 'juniper',
        lines: [
          'I came out here to count the pines. Now the pines are counting me. This is my fourth coffee.',
          'The wraith wears the oldest tree like a winter coat. Clear the wisps and it has to come out and fight like a tree.',
          'Watch the branches. They move when the wind does not. Out here, the wind never moves.'
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
          'A tree that should not be standing turns around. Every ornament on it is broken except one.',
          'PINE WRAITH: "YOU SMELL LIKE WARMTH. GIVE IT BACK."'
        ]
      },
      build: buildPines
    },
    {
      num: 'THREE', title: 'THE GLASS LAKE', sub: 'Something long under the ice',
      relic: 'FROZEN CROWN',
      theme: 'lake', fog: [0.66, 0.8, 0.9], spawn: [0, 11],
      intro: [
        'Glass Lake froze solid overnight. Old Finn says that happens. Old Finn says a lot of things.',
        'What does not normally happen: the ice singing at 3 a.m., and a shape the length of the dock doing laps under it.',
        'Finn is out on the dock with a thermos and no apparent survival instincts.'
      ],
      outro: [
        'The serpent sinks mid-monologue. A frozen crown is bolted to the dock post, stamped with an old Roblox Moderator Lock.',
        'Old Finn reads the lock, pours his coffee into the lake, and says: "Whoever sent you to collect these is switching off Roadtown security."',
        'FROZEN CROWN. He tells you to keep it where the Mayor cannot reach. You have stopped asking why.'
      ],
      npc: {
        name: 'OLD FINN', x: -4, z: 4.5, palette: 'finn',
        lines: [
          'Lake is frozen. Boat is frozen. Line is frozen. Something long has been doing laps under my ice and I want a word with it.',
          'Crack the glass crabs first. They are the lake alarm system, and they are extremely easy to alarm.',
          'If the ice starts singing, stand still. It hates an audience that claps.'
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
          'The ice bulges, cracks, and a frost wyrm comes up for air wearing a sunken 2010 sleigh like a crown.',
          'ICE SERPENT: "SSSTAY... FOR... THE... MONOLOGUE..."'
        ]
      },
      build: buildLake
    },
    {
      num: 'FOUR', title: 'THE THIRTEENTH BELL', sub: 'The clocktower keeps bad time',
      relic: 'MIDNIGHT CLAPPER',
      theme: 'dusk', fog: [0.42, 0.32, 0.44], spawn: [0, 11],
      intro: [
        'The Roadtown clock has struck thirteen three times today. The town has stopped pretending not to notice.',
        'Odette is the only one who will go near the tower, and Odette has not slept since Tuesday.',
        'She says the bell is hollow. She says something is living in the sound.'
      ],
      outro: [
        'The echo dies. A midnight clapper rolls across the cobbles, still warm, still bolted to a broken seal.',
        'Odette holds it up to the clock light. "Four relics. Four Moderator Seals. You did not recover anything, kid. You disarmed it."',
        'Up the mountain, the sky goes out like a light switch. Bram is already at the summit.',
        'MIDNIGHT CLAPPER. Odette gives you her lantern and tells you to run.'
      ],
      npc: {
        name: 'BELLKEEPER ODETTE', x: 4, z: 4, palette: 'odette',
        lines: [
          'The clock struck thirteen at noon. Clocks do not do that. I am a bellkeeper. I have a certificate.',
          'The bell is hollow, but something is living in the sound. Ring it true and the relic will answer. Ring it false and we all will.',
          'Do not count the bells. It counts back, and it is much better at counting than you.'
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
          'The bell swings by itself. There is nothing inside it but a voice, and the voice has been waiting for you.',
          'HOLLOW BELL: "DONG. DONG. DONG. DONG. ...FIVE."'
        ]
      },
      build: buildClocktower
    },
    {
      num: 'FIVE', title: 'THE LONG NIGHT', sub: 'The last relic, the last light',
      relic: 'TOWN TREE STAR',
      theme: 'night', fog: [0.08, 0.07, 0.16], spawn: [0, 10],
      intro: [
        'Above Roadtown, the sky is a hole, and the hole is looking back.',
        'Bram is at the summit with the relics and a speech he has clearly rehearsed.',
        'Aurora has been holding the ice together alone this whole time. She is not doing great.'
      ],
      outro: [
        'Bram hauled all five relics up the mountain himself, including the candy cane he swore was locked in Town Hall.',
        'He thought they were party favours. Aurora empties his pockets one relic at a time, like a parent at the door.',
        'Aurora sets the five relics into the altar. Not to break the seals this time. To reboot the server.',
        'The sky clears into a warm 2010 Roblox winter morning. The lights of Roadtown flicker back on, one window at a time.',
        'Mayor Bram wakes up dazed in a snowbank, grounded to shovel snow for the next 100 years by Juniper and Old Finn.',
        'Pip has made a very small SORRY card and a very large cocoa. The Long Night is gone. The tree is lit.',
        'THE END — thank you for playing A Christmas Tale.'
      ],
      npc: {
        name: 'AURORA', x: 0, z: 6.5, palette: 'aurora',
        lines: [
          'You came all the way up here. Most people would have stayed by the fire. I would have.',
          'The Long Night is not a monster. It is what is left when a server is forgotten with the lights still on.',
          'Take the last relic. I will hold the dark as long as I can.'
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
          'The dark gathers into a shape with a Mayor-shaped smile and your outline.',
          'THE LONG NIGHT: "WELCOME, HERO! YOU ARE JUST IN TIME FOR THE LAST EVENT."'
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
    renderer.setScene({ objects: titleObjects, fogColor: [0.8, 0.88, 0.96], fogNear: 22, fogFar: 70, skyColor: chapterTint(CHAPTERS[0]).sky });
  }

  function updateTitle(time) {
    renderer.setCamera(
      [Math.sin(time * 0.12) * 13, 4.6, 6 + Math.cos(time * 0.12) * 13],
      [0, 2.1, 4.5],
      52 * Math.PI / 180
    );
    if (titleHero) {
      titleHero.y = Math.abs(Math.sin(time * 1.7)) * 0.035;
      titleHero.facing = 1;
      titleHero.frame = SPRITE_FRAMES.idle[Math.floor(stepped(time) * 1.6) % 2];
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

  /* === NEW: THE WINDOW CLOSES, THE RUN DOESN'T ===
     END stops new runs. A file that was already under way may still be
     finished, and a finished file is read as a record of the run instead
     of becoming a dead wall. */
  function windowOpen() {
    var now = clock();
    return now >= START && now < END;
  }

  function slotStillPlayable(info) {
    return !!(info && info.raw && info.raw.started && !info.raw.ending);
  }

  /* === NEW: finished files keep their records readable after the event === */
  function finishedRunExists() {
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      if (slotInfo(i).finished) return true;
    }
    return false;
  }

  function canEnterFiles() {
    if (clock() < START) return false;
    if (windowOpen() || finishedRunExists()) return true;
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      if (slotStillPlayable(slotInfo(i))) return true;
    }
    return false;
  }

  function openTitleOrEnded() {
    phase = phaseAt();
    /* === NEW: past END the wall is a record, and an unfinished run can
       still be picked up from it === */
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
    /* === NEW: title is just the logo and PRESS START; files live on step two === */
    if (ui.startPrompt) ui.startPrompt.hidden = false;
    if (ui.fileSelect) ui.fileSelect.hidden = true;
    renderFileCards();
  }

  /* ------------------------------------------------------- file select */
  function slotRaw(index) {
    try {
      var raw = localStorage.getItem(SLOT_KEYS[index] || SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1) return null;
      return parsed;
    } catch (error) { return null; }
  }

  function slotInfo(index) {
    var raw = slotRaw(index);
    if (!raw || !raw.started) return { empty: true, finished: false };
    /* === NEW: a finished file is a filled slot that holds a record, not an
       empty one waiting to be overwritten === */
    return {
      empty: false,
      finished: Boolean(raw.ending),
      raw: raw,
      name: String(raw.name || 'NICO').slice(0, 12),
      level: Math.max(1, Number(raw.level) || 1),
      chapter: clamp(Number(raw.chapter) || 0, 0, 4),
      gender: raw.gender === 'girl' ? 'girl' : 'boy'
    };
  }

  function paintFileArt(host, gender) {
    if (!host) return;
    host.innerHTML = '';
    var atlas = heroWorldAtlas(gender);
    if (!atlas) return;
    var canvas = document.createElement('canvas');
    canvas.width = SPRITE_CELL;
    canvas.height = SPRITE_CELL;
    canvas.setAttribute('aria-hidden', 'true');
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, 0, 0, SPRITE_CELL, SPRITE_CELL, 0, 0, SPRITE_CELL, SPRITE_CELL);
    host.appendChild(canvas);
  }

  function renderFileCards() {
    if (!ui.fileGrid) return;
    ui.fileGrid.innerHTML = '';
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      var info = slotInfo(i);
      /* === NEW: a finished file reads as a record of the run, the way the
         ended screen does, instead of "NO DATA / NEW FILE" === */
      var finished = info.finished;
      var gender = info.empty ? (slotPick[i] || selectedGender) : info.gender;
      var card = document.createElement('div');
      card.className = 'ff-file-card' + (info.empty ? ' empty' : '') + (finished ? ' done' : '');
      card.dataset.slot = String(i);
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.innerHTML =
        '<div class="ff-file-top"><b>FILE ' + (i + 1) + '</b><em>' +
          (finished ? 'THE END' : info.empty ? 'NO DATA' : 'LV ' + info.level + ' · CHAPTER ' + (info.chapter + 1)) +
        '</em></div>' +
        '<div class="ff-file-art" aria-hidden="true"></div>' +
        '<div class="ff-file-name"></div>' +
        (finished
          ? '<div class="ff-file-meta">LV ' + info.level + ' · CHAPTER ' + (info.chapter + 1) + ' · RELICS ' +
              clamp(Number(info.raw.shards) || 0, 0, 5) + ' / 5</div>'
          : '<div class="ff-file-gender">' +
              '<button type="button" data-gender="boy"' + (gender === 'boy' ? ' class="on"' : '') + '>BOY</button>' +
              '<button type="button" data-gender="girl"' + (gender === 'girl' ? ' class="on"' : '') + '>GIRL</button>' +
            '</div>') +
        '<div class="ff-file-start">' + (finished ? 'VIEW THE RECORD' : info.empty ? 'START' : 'CONTINUE') + '</div>';
      card.querySelector('.ff-file-name').textContent = info.empty ? 'NEW FILE' : info.name;
      ui.fileGrid.appendChild(card);
      paintFileArt(card.querySelector('.ff-file-art'), gender);
    }
  }

  function openFileSelect() {
    if (!canEnterFiles()) { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
    if (ui.startPrompt) ui.startPrompt.hidden = true;
    if (ui.fileSelect) ui.fileSelect.hidden = false;
    renderFileCards();
    sound('click');
  }

  function closeFileSelect() {
    if (ui.fileSelect) ui.fileSelect.hidden = true;
    if (ui.startPrompt) ui.startPrompt.hidden = false;
    sound('click');
  }

  function pickSlotGender(index, gender) {
    var picked = gender === 'girl' ? 'girl' : 'boy';
    slotPick[index] = picked;
    var info = slotInfo(index);
    if (info.raw) {
      info.raw.gender = picked;
      try { localStorage.setItem(SLOT_KEYS[index] || SAVE_KEY, JSON.stringify(info.raw)); } catch (error) { /* ignore */ }
    }
    if (index === activeSlot && save) {
      save.gender = picked;
      selectedGender = picked;
    }
    renderFileCards();
    sound('click');
  }

  function startSlot(index) {
    var info = slotInfo(index);
    /* === NEW: past END only a run that was already under way may open, and a
       finished record may always be read === */
    if (clock() < START || (!windowOpen() && !slotStillPlayable(info) && !info.finished)) { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
    /* === NEW: a finished file opens its record; it is never erased by a tap === */
    if (info.finished) { showEnded(index); return; }
    activeSlot = index;
    if (!info.empty && info.raw) {
      save = normalizeSave(info.raw);
      selectedGender = save.gender === 'girl' ? 'girl' : 'boy';
      save.gender = selectedGender;
      persist();
      if (ui.fileSelect) ui.fileSelect.hidden = true;
      hideScreens();
      continueGame();
      return;
    }
    beginNewRunOnSlot(index);
  }

  /* === NEW: starting over on a file is only ever a deliberate, warned step === */
  function beginNewRunOnSlot(index) {
    activeSlot = index;
    selectedGender = slotPick[index] || selectedGender;
    save = freshSave();
    save.name = 'NICO';
    save.gender = selectedGender;
    save.started = true;
    save.chapter = 0;
    persist();
    if (ui.fileSelect) ui.fileSelect.hidden = true;
    hideScreens();
    buildWorld(0);
    startIntroCutscene();
  }

  function bindFileGrid() {
    if (!ui.fileGrid) return;
    ui.fileGrid.addEventListener('click', function (event) {
      var pick = event.target.closest ? event.target.closest('[data-gender]') : null;
      if (pick) {
        event.stopPropagation();
        var owner = pick.closest('.ff-file-card');
        if (owner) pickSlotGender(Number(owner.dataset.slot), pick.dataset.gender);
        return;
      }
      var card = event.target.closest ? event.target.closest('.ff-file-card') : null;
      if (card) startSlot(Number(card.dataset.slot));
    });
    ui.fileGrid.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest && event.target.closest('[data-gender]')) return;
      var card = event.target.closest ? event.target.closest('.ff-file-card') : null;
      if (!card) return;
      event.preventDefault();
      startSlot(Number(card.dataset.slot));
    });
  }

  function showEnded(slot) {
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
    paintEndedRecord(slot);
  }

  /* === NEW: THE ENDED SCREEN BECOMES A RECORD OF THE RUN ===
     An unfinished run wins over a finished one: it is the file that can
     still be played. With no save at all the wall keeps its old copy. */
  function runRecord(slot) {
    var finished = null;
    for (var i = 0; i < SLOT_KEYS.length; i++) {
      /* === NEW: a slot can be named so the file list can open one record === */
      if (slot !== null && i !== slot) continue;
      var info = slotInfo(i);
      if (!info.raw || !info.raw.started) continue;
      var row = {
        slot: i,
        name: info.name,
        level: info.level,
        chapter: info.chapter,
        relics: clamp(Number(info.raw.shards) || 0, 0, 5),
        ending: Boolean(info.raw.ending)
      };
      if (!row.ending) return row;
      if (!finished) finished = row;
    }
    return finished;
  }

  function paintEndedRecord(slot) {
    var at = typeof slot === 'number' && isFinite(slot) ? slot : null;
    var record = runRecord(at);
    var unfinished = !!(record && !record.ending);
    /* === NEW: a finished file read from the file list is a record, not the
       closing of the event === */
    var viewingClosedFile = !!(record && record.ending && at !== null);
    if (ui.endedTitle) {
      ui.endedTitle.textContent = unfinished
        ? 'THE WINDOW CLOSED. YOUR RUN DID NOT.'
        : (viewingClosedFile && windowOpen() ? 'THIS FILE IS COMPLETE.' : 'A CHRISTMAS TALE HAS ENDED');
    }
    if (ui.endedCopy) {
      if (unfinished) {
        ui.endedCopy.textContent = 'A Christmas Tale closed on ' + formatDate(END) + ', but FILE ' + (record.slot + 1) + ' was already under way. Nothing you started is lost — this run can still be finished.';
      } else if (viewingClosedFile && windowOpen()) {
        ui.endedCopy.textContent = record.name + ' carried the star back at Level ' + record.level + ' with ' + record.relics + ' of 5 relics recovered. Nothing is left to play in this file — it is kept as a record of the run.';
      } else if (record) {
        ui.endedCopy.textContent = record.name + ' reached Chapter ' + (record.chapter + 1) + ' at Level ' + record.level + ' with ' + record.relics + ' of 5 relics recovered before the window closed. The finished story is kept below.';
      } else {
        ui.endedCopy.textContent = 'The Long Night has been pushed back, and the star is still burning. A Christmas Tale ran from November 19, 2026 to January 4, 2027.';
      }
    }
    if (ui.endedRecord) {
      ui.endedRecord.innerHTML = '';
      if (record) {
        var rows = [
          ['FILE', String(record.slot + 1)],
          ['NAME', record.name],
          ['LEVEL', String(record.level)],
          ['CHAPTER', (record.chapter + 1) + ' / 5'],
          ['RELICS', record.relics + ' / 5'],
          ['STATUS', record.ending ? 'THE END' : 'UNFINISHED']
        ];
        rows.forEach(function (row) {
          var cell = document.createElement('div');
          var key = document.createElement('span');
          var value = document.createElement('b');
          key.textContent = row[0];
          value.textContent = row[1];
          cell.appendChild(key);
          cell.appendChild(value);
          ui.endedRecord.appendChild(cell);
        });
      }
      ui.endedRecord.hidden = !record;
    }
    if (ui.endedResume) {
      ui.endedResume.hidden = !unfinished;
      ui.endedResume.dataset.slot = record ? String(record.slot) : '';
    }
    /* === NEW: one door to the file list. It reads BACK TO FILES on a record
       opened from the list, and FINISHED FILES after the event, when the list
       is otherwise shut. START A NEW STORY is the warned, separate step. === */
    if (ui.endedRenew) {
      ui.endedRenew.hidden = !(viewingClosedFile && windowOpen());
      ui.endedRenew.dataset.slot = record ? String(record.slot) : '';
    }
    if (ui.endedFiles) {
      ui.endedFiles.hidden = !(viewingClosedFile || (!windowOpen() && finishedRunExists()));
      ui.endedFiles.textContent = viewingClosedFile ? 'BACK TO FILES' : 'FINISHED FILES';
    }
  }

  function backToFiles() {
    showTitle();
    openFileSelect();
  }

  function renewClosedFile() {
    if (!ui.endedRenew || !windowOpen()) return;
    var slot = Number(ui.endedRenew.dataset.slot);
    if (!isFinite(slot)) return;
    if (!window.confirm('Start a new story on FILE ' + (slot + 1) + '? That finished save will be erased.')) return;
    beginNewRunOnSlot(slot);
  }

  function resumeEndedRun() {
    if (!ui.endedResume) return;
    var slot = Number(ui.endedResume.dataset.slot);
    if (!isFinite(slot)) return;
    startSlot(slot);
  }

  function requestNewGame() {
    if (!windowOpen()) { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
    if (save && save.started && !save.ending && !window.confirm('Start a new story? Your current A Christmas Tale save will be erased.')) return;
    hideScreens();
    ui.nameScreen.hidden = false;
    ui.nameInput.value = save ? save.name : '';
    mode = 'name';
    setTimeout(function () { ui.nameInput.focus(); }, 80);
  }

  function beginNewStory() {
    if (!windowOpen()) { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
    var name = String(ui.nameInput.value || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12) || 'NICO';
    save = freshSave();
    save.name = name;
    /* === NEW: keep the hero chosen on the title card === */
    save.gender = selectedGender;
    save.started = true;
    save.chapter = 0;
    persist();
    ui.nameScreen.hidden = true;
    buildWorld(0);
    startIntroCutscene();
  }

  function continueGame() {
    if (!save || !save.started || save.ending) return;
    /* === NEW: a started, unfinished save is allowed past END === */
    if (clock() < START) { toast('A CHRISTMAS TALE IS NOT OPEN RIGHT NOW.'); return; }
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
    /* === NEW: the door is shut to new runs; show the finished one instead === */
    if (!windowOpen()) { showEnded(); return; }
    var name = save ? save.name : 'NICO';
    save = freshSave();
    save.name = name;
    save.gender = selectedGender;
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
    ui.endingStats.textContent = 'LV ' + save.level + ' · ' + save.name + ' · FIVE RELICS RECOVERED';
    mode = 'ending';
    view = 'title';
    app.dataset.theme = 'night';
    buildTitleScene();
  }

  /* ------------------------------------------------------------- cutscene */
  /* Voice pitch per speaker: narration floats, Bram rumbles, Pip squeaks. */
  var CUT_VOICE = { 'NARRATOR': 1.3, 'MAYOR BRAM': 0.78, 'PIP': 1.55, 'PLAYER': 1.05 };
  var CUT_FACE = { 'NARRATOR': 'narrator', 'MAYOR BRAM': 'bram', 'PIP': 'pip', 'PLAYER': 'player' };

  /* ==================================================================
     NEW: CUTSCENE MANAGER (non-destructive, promise-based)
     Sits on top of the cutscene stage that already exists: same #ff-cutscene
     panel, same typewriter state, same Web Audio voice blips. A scene owns
     the screen only while it plays and resolves to its caller, so battle
     flow is never touched — the caller decides what happens next.
     ================================================================== */
  function seenCutscene(id) {
    return !!(save && save.cutscenes && save.cutscenes[id]);
  }

  function markCutsceneSeen(id) {
    if (!save || !id) return;
    save.cutscenes = save.cutscenes || {};
    if (save.cutscenes[id]) return;
    save.cutscenes[id] = true;
    persist();
  }

  /* **keyword** in a line becomes a coloured highlight while it types. */
  function typedCutMarkup(text, count) {
    var raw = String(text || '').slice(0, Math.max(0, count));
    var out = '';
    var open = false;
    for (var i = 0; i < raw.length; i++) {
      if (raw.charAt(i) === '*' && raw.charAt(i + 1) === '*') {
        out += open ? '</span>' : '<span class="ff-kw">';
        open = !open;
        i += 1;
        continue;
      }
      var ch = raw.charAt(i);
      out += ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
    }
    if (open) out += '</span>';
    return out;
  }

  var CutsceneManager = {
    play: function (id, opts) {
      opts = opts || {};
      if (!opts.force && seenCutscene(id)) return Promise.resolve('seen');
      return new Promise(function (resolve) {
        beginScriptedCutscene(id, opts, resolve);
      });
    },
    skip: function () { skipCutscene(); },
    hasSeen: seenCutscene
  };

  function beginScriptedCutscene(id, opts, resolve) {
    if (!world) {
      /* No stage to play on: resolve and still run the chain (startBattle,
         onWin) so a missing scene can never soft-lock the story. */
      if (resolve) resolve('unavailable');
      if (opts.onEnd) opts.onEnd();
      return;
    }
    hideScreens();
    ui.hud.hidden = true;
    ui.objective.hidden = true;
    ui.touch.hidden = true;
    ui.prompt.hidden = true;
    ui.toast.hidden = true;
    ui.dialogue.hidden = true;
    ui.battle.hidden = true;
    ui.cutscene.hidden = false;
    ui.cutscene.classList.add('ff-letterbox');
    document.body.classList.remove('ff-talking');
    mode = 'cutscene';
    view = 'cutscene';
    cutscene.active = true;
    cutscene.id = id;
    cutscene.kind = opts.kind || 'story';
    cutscene.shot = opts.shot || 'archway';
    cutscene.focus = opts.focus || null;
    cutscene.koBoss = opts.koBoss || null;
    cutscene.bossName = opts.bossName || '';
    cutscene.finalLabel = opts.finalLabel || 'CONTINUE';
    cutscene.score = opts.score || '';
    cutscene.firstTime = !seenCutscene(id);
    cutscene.resolve = resolve || null;
    cutscene.onEnd = opts.onEnd || null;
    cutscene.lines = (opts.lines || []).slice();
    cutscene.index = 0;
    cutscene.t = 0;
    cutscene.lineT = 0;
    cutscene.typing = false;
    cutscene.speaker = null;
    cutscene.shardsOn = false;
    cutscene.star = null;
    cutscene.shard = null;
    cutscene.crack = null;
    if (ui.cutScore) {
      ui.cutScore.hidden = !cutscene.score;
      ui.cutScore.textContent = cutscene.score;
    }
    if (ui.cutSkip) ui.cutSkip.textContent = cutscene.firstTime ? 'SKIP CUTSCENE' : '[ESC] SKIP CUTSCENE';
    if (cutscene.kind === 'victory') buildVictoryAura();
    markCutsceneSeen(id);
    faceCutsceneCast();
    showCutsceneLine();
  }

  function skipCutscene() {
    if (!cutscene.active) return;
    sound('click');
    /* Skipping ends the scene early but still resolves its chain, so a retried
       boss fight drops straight back into startBattle. */
    endCutscene(true);
  }

  /* Hand the world back exactly as finishBattle leaves it. */
  function restoreWorldAfterCutscene() {
    if (!world) return;
    var chapter = CHAPTERS[clamp(save ? save.chapter : 0, 0, 4)];
    view = 'world';
    mode = 'world';
    /* === NEW: HORIZON FILL === the sky behind the geometry matches the winter fog */
    renderer.setScene({ objects: world.objects, fogColor: chapter.fog, fogNear: 22, fogFar: 70, skyColor: chapterTint(chapter).sky });
    app.dataset.theme = chapter.theme;
    ui.hud.hidden = false;
    ui.objective.hidden = false;
    ui.touch.hidden = false;
    updateHud();
    updateObjective();
    snapCamera();
  }

  /* Golden victory aura: three flat rings that pulse around the hero. */
  function buildVictoryAura() {
    if (!world || !player) return;
    var aura = makeActor('victory-aura');
    addPart(aura, 0xffe08a, [0, 0, 0], [0, 0.05, 0], [2.8, 0.04, 2.8], { geo: 'disc', alpha: 0.45 });
    addPart(aura, 0xfff6cf, [0, 0, 0], [0, 0.55, 0], [2.1, 0.04, 2.1], { geo: 'disc', alpha: 0.3 });
    addPart(aura, 0xffcf4a, [0, 0, 0], [0, 1.15, 0], [3.4, 0.1, 3.4], { geo: 'disc', alpha: 0.14 });
    aura.x = player.x;
    aura.y = 0.02;
    aura.z = player.z;
    pushActor(world.objects, aura);
    updateActor(aura);
    cutscene.aura = aura;
  }

  /* Trigger (a) — the guide hands over the starter cards after the intro. */
  function grantStarterCards() {
    if (!save) return false;
    if (Array.isArray(save.cards) && save.cards.length) return false;
    /* The starter is the ball: BOUNCER buys a fifth bounce and a point of
       damage per bounce, and it spends the whole opening 2 BP. */
    save.cards = ['bouncer'];
    persist();
    updateHud();
    return true;
  }

  function startGuideCutscene() {
    var scene = CutsceneManager.play('guide-cards', {
      force: true,
      kind: 'guide',
      shot: 'archway',
      finalLabel: 'BEGIN CHAPTER ONE',
      lines: [
        { who: 'PIP', text: 'Wait wait wait. Before you go out there: **cards**. Bram found a shoebox of them in the lost-and-found and called it "loadout management".' },
        { who: 'PIP', text: '**BOUNCER** is the ball card: Line Bounce gets a **fifth bounce** and every bounce hits a point harder. Ante Up and Defender are still in the box.' },
        { who: 'PIP', text: 'Two **BP** buys one card, so the ball is your whole hand. Take **BP** on a level-up for a second card. Four is the ceiling.' }
      ],
      onEnd: function () {
        showChapterScreen(0);
      }
    });
    grantStarterCards();
    return scene;
  }

  /* Trigger (c) — boss down: KO reaction, hero aura, score banner. */
  function playBossVictory(options) {
    var chapter = CHAPTERS[clamp(save ? save.chapter : 0, 0, 4)];
    var score = 1000 * (save ? save.shards : 0) + 250 * (save ? save.level : 1) + (save ? save.xp : 0);
    var bossName = (options && options.bossName) || 'THE BOSS';
    CutsceneManager.play('boss-victory-' + (save ? save.chapter + 1 : 1), {
      force: true,
      kind: 'victory',
      shot: 'victory',
      focus: player,
      koBoss: options ? options.bossActor : null,
      finalLabel: 'CLAIM THE RELIC',
      score: 'CONTEST SCORE ' + score.toLocaleString('en-US') + ' · CHAPTER ' + chapter.num + ' CLEARED',
      lines: [
        { who: 'NARRATOR', text: bossName + ' folds up like a dropped present.' },
        { who: 'PLAYER', text: 'That is one relic down. **Four** to go.' },
        { who: 'PIP', text: 'You are glowing. Is that the relic, or did you eat the glowing snow again?' }
      ],
      onEnd: function () {
        if (options && options.onWin) options.onWin();
      }
    });
  }

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
    /* === NEW: the intro is the archway shot of the same manager === */
    cutscene.id = 'intro';
    cutscene.kind = 'intro';
    cutscene.shot = 'archway';
    cutscene.focus = null;
    cutscene.koBoss = null;
    cutscene.bossName = '';
    cutscene.finalLabel = 'BEGIN CHAPTER ONE';
    cutscene.score = '';
    cutscene.resolve = null;
    cutscene.onEnd = null;
    cutscene.firstTime = !seenCutscene('intro');
    ui.cutscene.classList.remove('ff-letterbox');
    if (ui.cutScore) ui.cutScore.hidden = true;
    if (ui.cutSkip) ui.cutSkip.textContent = cutscene.firstTime ? 'SKIP CUTSCENE' : '[ESC] SKIP CUTSCENE';
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
      { who: 'NARRATOR', text: 'Frostfest 2010. You clicked the glowing event portal. It clicked back.' },
      { who: 'NARRATOR', face: 'shard', text: 'Then it sneezed, and dropped you out of a chimney into a snowed-in server called Roadtown.', cue: 'soft' },
      { who: 'NARRATOR', text: 'Snowed in. Lights out. Five Sacred Relics missing straight off the Town Tree.' },
      { who: 'NARRATOR', text: 'All you have is a lantern, a scarf, and a best friend made of snow.' },
      { who: 'PIP', text: 'Uh, Mayor? Another player just fell out of the skybox. Should I ban them, or give them cocoa?' },
      { who: 'MAYOR BRAM', text: 'Neither! Look up, kid. The sky just broke, and the town star went out with it.', cue: 'hard' },
      { who: 'MAYOR BRAM', text: 'The five Sacred Holiday Relics were jacked straight off the Town Tree. Without them, Christmas gets permanently deleted!' },
      { who: 'PIP', text: 'Wait. Did you lock those relics in the—' },
      { who: 'MAYOR BRAM', text: 'Ahem! Go talk to Bram. That is me. Mind the Frost Shades. They respect neither personal space nor turn-based etiquette.' },
      { who: 'NARRATOR', text: 'Five relics. One broken sky. One very long night.' }
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
    /* === NEW: a scripted scene can hand the stage to its own boss actor === */
    if (cutscene.focus && cutscene.bossName && who === cutscene.bossName) return cutscene.focus;
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
    ui.cutText.innerHTML = typedCutMarkup(cutscene.full, cutscene.full.length);
    ui.cutNext.classList.remove('typing');
  }

  function showCutsceneLine() {
    var line = cutscene.lines[cutscene.index];
    if (!line) return;
    ui.cutSpeaker.textContent = line.who;
    ui.cutFace.className = 'ff-cut-face ' + (line.face || CUT_FACE[line.who] || 'narrator');
    ui.cutNext.textContent = cutscene.index === cutscene.lines.length - 1 ? cutscene.finalLabel : 'CONTINUE';
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

  function endCutscene(skipped) {
    var resume = cutscene.resume;
    var resolve = cutscene.resolve;
    var onEnd = cutscene.onEnd;
    var shot = cutscene.shot;
    cutscene.active = false;
    cutscene.resume = false;
    cutscene.typing = false;
    cutscene.shardsOn = false;
    cutscene.speaker = null;
    cutscene.resolve = null;
    cutscene.onEnd = null;
    cutscene.id = null;
    cutscene.shot = 'archway';
    ui.cutscene.hidden = true;
    ui.cutscene.classList.remove('ff-letterbox');
    if (ui.cutScore) ui.cutScore.hidden = true;
    ui.flash.hidden = true;
    clearTimeout(cutscene.secondFlash);
    clearTimeout(ui.flashTimer);
    cutscene.star = null;
    cutscene.shard = null;
    cutscene.crack = null;
    cutscene.shards = [];
    cutscene.focus = null;
    cutscene.koBoss = null;
    if (cutscene.aura) {
      cutscene.aura.hidden = true;
      cutscene.aura = null;
    }
    [player, pip].forEach(function (actor) {
      if (!actor) return;
      actor.y = 0;
      actor.squashX = 1;
      actor.squashY = 1;
      actor.lean = 0;
    });
    /* === NEW: resolve the promise and run whatever the scene was chained to
       (startBattle, onWin, the chapter card) before anything else. === */
    if (resolve) {
      if (shot === 'boss' || shot === 'victory') restoreWorldAfterCutscene();
      resolve(skipped ? 'skipped' : 'done');
    }
    if (onEnd) { onEnd(); return; }
    /* Continuing a chapter-one save returns straight to the world; a new
       story still gets the guide's card scene, then the chapter card. */
    if (resume && save) { buildWorld(save.chapter); return; }
    startGuideCutscene();
  }

  function updateCutscene(dt, time) {
    if (!cutscene.active) return;
    cutscene.t += dt;

    /* Typewriter reveal with a retro voice blip every couple of letters. */
    if (cutscene.typing) {
      cutscene.shown = Math.min(cutscene.full.length, cutscene.shown + dt * 40);
      var visible = Math.floor(cutscene.shown);
      if (visible !== cutscene.lastCount) {
        ui.cutText.innerHTML = typedCutMarkup(cutscene.full, visible);
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
    /* === NEW: scripted scenes animate their own focus actor too === */
    if (cutscene.focus && cast.indexOf(cutscene.focus) < 0) cast.push(cutscene.focus);
    if (cutscene.koBoss && cast.indexOf(cutscene.koBoss) < 0) cast.push(cutscene.koBoss);
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
      if (actor.spriteObj) {
        actor.frame = speaking
          ? SPRITE_FRAMES.talk[Math.floor(stepped(cutscene.lineT) * 5) % 2]
          : SPRITE_FRAMES.idle[Math.floor(stepped(cutscene.t) * 1.4) % 2];
        /* Stage the shot: everyone on the left looks right, and vice versa. */
        actor.facing = actor.x < 0 ? 1 : -1;
      }
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

    /* === NEW: boss KO reaction + victory aura === */
    if (cutscene.koBoss) {
      var ko = Math.min(1, cutscene.t / 0.9);
      cutscene.koBoss.lean = 0.55 * ko;
      cutscene.koBoss.squashY = 1 - 0.32 * ko;
      cutscene.koBoss.y = (cutscene.koBoss.baseY || 0) - 0.1 * ko;
      updateActor(cutscene.koBoss);
    }
    if (cutscene.aura) {
      cutscene.aura.scale = 1 + Math.sin(time * 5) * 0.08;
      cutscene.aura.yaw += dt * 0.8;
      for (var ap = 0; ap < cutscene.aura.parts.length; ap++) {
        cutscene.aura.parts[ap].obj.alpha = 0.2 + Math.abs(Math.sin(time * 3 + ap)) * 0.32;
      }
      updateActor(cutscene.aura);
    }

    /* === NEW: three camera shots — archway intro, boss pan, victory ===
       The intro keeps its slow dolly; scripted scenes ease out of the player
       and settle on their own focus instead of cutting. */
    if (cutscene.shot === 'boss' && cutscene.focus) {
      var bossFocus = cutscene.focus;
      var bossT = Math.min(1, cutscene.t / 1.1);
      var bossEase = bossT * bossT * (3 - 2 * bossT);
      renderer.setCamera(
        [lerp(player.x + 2.4, bossFocus.x + 1.6, bossEase), lerp(3.4, 2.6, bossEase), lerp(player.z + 8.4, bossFocus.z + 7.2, bossEase)],
        [lerp(player.x, bossFocus.x, bossEase), lerp(1.2, 1.5, bossEase), lerp(player.z - 1, bossFocus.z, bossEase)],
        50 * Math.PI / 180,
        16
      );
    } else if (cutscene.shot === 'victory' && player) {
      var down = cutscene.koBoss;
      var midX = down ? (player.x + down.x) / 2 : player.x;
      var midZ = down ? (player.z + down.z) / 2 : player.z;
      var winT = Math.min(1, cutscene.t / 1.1);
      var winEase = winT * winT * (3 - 2 * winT);
      renderer.setCamera(
        [lerp(player.x + 1.4, midX, winEase), lerp(3.0, 4.2, winEase), lerp(player.z + 7.6, midZ + 9.6, winEase)],
        [lerp(player.x, midX, winEase), lerp(1.2, 0.9, winEase), lerp(player.z, midZ - 0.6, winEase)],
        50 * Math.PI / 180,
        17
      );
    } else {
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
    var actor = buildCastActor(CAST_BY_ID[chapter.npc.palette] || CAST_ROSTER[0], 1);
    actor.kind = 'npc';
    actor.x = chapter.npc.x;
    actor.z = chapter.npc.z;
    actor.yaw = 0;
    actor.phase = Math.random() * 6;
    addActor(actor);
    world.npc = actor;
    world.npcName = chapter.npc.name;
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
              foe: actor,
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
          talk(boss.name, ['CLEAR THE SHADES FIRST. THEY ARE STILL WATCHING (' + remaining + ' LEFT).'], null);
          return;
        }
        /* === NEW: trigger (b) — pre-boss confrontation cutscene ===
           The manager pans to the boss and calls the existing startBattle
           when it finishes or is skipped. Nothing about the fight changed. */
        CutsceneManager.play('boss-' + boss.key, {
          force: true,
          kind: 'boss',
          shot: 'boss',
          focus: bossActor,
          bossName: boss.name,
          finalLabel: 'FIGHT ' + boss.name,
          lines: boss.intro.map(function (text) {
            return { who: boss.name, text: text };
          }),
          onEnd: function () {
            startBattle(
              { name: boss.name, hp: boss.hp, atk: boss.atk, xp: boss.xp, model: boss.model, boss: true, agility: 4 },
              {
                bossVictory: true,
                bossActor: bossActor,
                bossName: boss.name,
                foe: bossActor,
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
          }
        });
      }
    };
    world.interactables.push(bossItem);
  }

  function spawnShard(chapter) {
    var relic = buildRelicActor(CHAPTERS.indexOf(chapter));
    relic.x = chapter.boss.x;
    relic.z = chapter.boss.z;
    relic.y = 0;
    addActor(relic);
    var item = {
      x: chapter.boss.x, z: chapter.boss.z, r: 2.8, label: 'TAKE THE RELIC',
      action: function () {
        item.disabled = true;
        talk(chapter.relic, chapter.outro, grantShard);
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

  /* === NEW: HORIZON FILL === the cleared sky and the shelf under the terrain
     follow the chapter lighting; a daylight sky behind the pines at midnight
     read as a rendering bug, and a snow-white shelf glowed in the dark. */
  var CHAPTER_TINTS = {
    day: { sky: [0.5333, 0.7686, 0.9804], shelf: 0x67bf43 },
    lake: { sky: [0.6078, 0.7529, 0.8627], shelf: 0xcfe4f2 },
    dusk: { sky: [0.4353, 0.3294, 0.4392], shelf: 0x8a7280 },
    night: { sky: [0.1098, 0.1216, 0.2275], shelf: 0x33405e }
  };
  function chapterTint(chapter) {
    return CHAPTER_TINTS[(chapter && chapter.theme) || 'day'] || CHAPTER_TINTS.day;
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
    /* === NEW: HORIZON FILL === one huge snow shelf under the chapter so the
       bottom of the viewport is never empty sky/void when the terrain stops. */
    var horizon = makeStatic('cube', 0, -0.58, 0, 260, 0.5, 260, chapterTint(chapter).shelf, { pattern: false });
    horizon.keepInBattle = true;
    world.objects.push(horizon);
    loadModels();
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
    addVillagers(chapter, index);
    spawnEnemies(chapter);
    camera.yaw = 0.2;
    camera.pitch = 0.44;
    camera.dist = 16;
    camera.ortho = baseOrtho();
    camera.punch = 0;
    snapCamera();
    renderer.setScene({ objects: world.objects, fogColor: chapter.fog, fogNear: 22, fogFar: 70, skyColor: chapterTint(chapter).sky });
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

  /* The HP readout rolls like an odometer instead of snapping, so a hit that
     takes 12 off is felt in the number as well as the bar. */
  var hpReadout = { shown: null, max: 0, raf: 0 };
  function setHpReadout(value, max) {
    if (!ui.hudHpText) return;
    var target = Math.max(0, Math.round(value));
    if (hpReadout.shown === null || hpReadout.max !== max || Math.abs(hpReadout.shown - target) > max) {
      hpReadout.shown = target;
      hpReadout.max = max;
      ui.hudHpText.textContent = target + '/' + max;
      return;
    }
    if (hpReadout.shown === target) {
      ui.hudHpText.textContent = target + '/' + max;
      return;
    }
    var from = hpReadout.shown;
    var started = performance.now();
    cancelAnimationFrame(hpReadout.raf);
    function step(now) {
      var t = Math.min(1, (now - started) / 360);
      var eased = 1 - Math.pow(1 - t, 3);
      hpReadout.shown = Math.round(from + (target - from) * eased);
      ui.hudHpText.textContent = hpReadout.shown + '/' + max;
      if (t < 1) hpReadout.raf = requestAnimationFrame(step);
      else hpReadout.shown = target;
    }
    hpReadout.raf = requestAnimationFrame(step);
  }

  /* HUD portrait: the hero's own head, cropped from the baked atlas, wearing
     the current battle mood (hurt, nervous at low HP, smug after a guard). */
  var PORTRAIT_PX = 76;
  var portraitMood = null;
  var portraitTimer = 0;

  function portraitHead(mood) {
    var canvas = document.createElement('canvas');
    canvas.width = PORTRAIT_PX;
    canvas.height = PORTRAIT_PX;
    var ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = '#2b1e4a';
    ctx.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
    /* === NEW: prefer the action-sheet head over the old atlas === */
    var sheetArt = heroWorldAtlas();
    var art = sheetArt ? null : castAtlas(HERO_CHAR, 1);
    if (sheetArt) {
      drawSheetPortrait(ctx, sheetArt);
      if (mood === 'hurt' || mood === 'nervous') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = mood === 'hurt' ? 'rgba(255, 70, 80, 0.42)' : 'rgba(90, 175, 255, 0.26)';
        ctx.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (art) {
      var cap = castCapBox(art, 0);
      var body = castSpriteBox(art, 0);
      var middle = body.x + body.w / 2;
      var top = Math.max(0, cap.y - 7);
      var chin = Math.min(SPRITE_CELL, cap.y + cap.h + 31);
      var half = 27;
      var scale = (PORTRAIT_PX - 6) / Math.max(1, chin - top);
      var width = half * 2 * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(art, middle - half, top, half * 2, chin - top, (PORTRAIT_PX - width) / 2, 3, width, PORTRAIT_PX - 6);
      if (mood === 'hurt' || mood === 'nervous') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = mood === 'hurt' ? 'rgba(255, 70, 80, 0.42)' : 'rgba(90, 175, 255, 0.26)';
        ctx.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    return canvas;
  }

  /* Both the HUD and the battle plate carry the same head, so a hit reads
     the same whichever one is on screen. */
  function paintPortrait() {
    var hosts = [ui.face, ui.battleFace];
    var mood = portraitMood;
    if (!mood && save) mood = save.hp / Math.max(1, save.maxHp) <= 0.34 ? 'nervous' : 'idle';
    var head = portraitHead(mood || 'idle');
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (!host) continue;
      var canvas = host.__portrait;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = PORTRAIT_PX;
        canvas.height = PORTRAIT_PX;
        host.appendChild(canvas);
        host.__portrait = canvas;
      }
      var ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
      ctx.drawImage(head, 0, 0);
      if (mood === 'nervous') {
        ctx.fillStyle = '#bff0ff';
        ctx.beginPath();
        ctx.ellipse(57, 21, 6, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5ec8f5';
        ctx.beginPath();
        ctx.ellipse(57, 23, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eafaff';
        ctx.fillRect(54, 17, 2, 3);
      } else if (mood === 'confident') {
        ctx.fillStyle = '#ffe27a';
        ctx.fillRect(9, 11, 4, 4);
        ctx.fillRect(63, 13, 3, 3);
        ctx.fillRect(59, 58, 4, 4);
        ctx.fillStyle = '#fff6c9';
        ctx.fillRect(12, 45, 3, 3);
      }
      host.classList.toggle('hurt', mood === 'hurt');
      host.classList.toggle('nervous', mood === 'nervous');
      host.classList.toggle('confident', mood === 'confident');
    }
  }

  function setPortraitMood(mood, ms) {
    portraitMood = mood;
    paintPortrait();
    clearTimeout(portraitTimer);
    if (ms) portraitTimer = setTimeout(function () { portraitMood = null; paintPortrait(); }, ms);
  }

  function updateHud() {
    if (!save) return;
    ui.hudName.textContent = save.name;
    ui.hudLevel.textContent = save.level;
    ui.hudChapter.textContent = 'CHAPTER ' + CHAPTERS[clamp(save.chapter, 0, 4)].num;
    ui.hudHp.style.width = clamp(save.hp / save.maxHp * 100, 0, 100) + '%';
    ui.hudSp.style.width = clamp(save.sp / save.maxSp * 100, 0, 100) + '%';
    setHpReadout(save.hp, save.maxHp);
    ui.hudSpText.textContent = save.sp + '/' + save.maxSp;
    ui.hudBp.textContent = save.bp;
    ui.hudShards.textContent = save.shards;
    if (ui.hudHpRow) {
      var ratio = save.hp / Math.max(1, save.maxHp);
      ui.hudHpRow.classList.toggle('low', save.hp > 0 && ratio <= 0.34);
      ui.hudHpRow.classList.toggle('mortal', !!(battle && battle.mortal));
    }
    paintPortrait();
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
    if (save.defeated[chapter.boss.key + '-shard']) text = 'The relic is yours';
    else if (save.defeated[chapter.boss.key]) text = 'Take the relic';
    else if (done >= total) text = 'Face ' + chapter.boss.name;
    else if (!save.talked['c' + (save.chapter + 1)]) text = 'Talk to ' + chapter.npc.name;
    else text = 'Clear the shades (' + done + ' / ' + total + ')';
    ui.objectiveText.textContent = text;
    ui.menuObjective.textContent = text;
  }

  /* -------------------------------------------------------------- dialogue */
  /* Listeners in the overworld pop on every new box, so the character you are
     reading is also the character who is moving. */
  function speakerHop(name) {
    if (!world || !world.npc) return;
    if (world.npcName === name) world.npc.hop = 0.26;
  }

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
    speakerHop(speaker);
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
    speakerHop(dialogue.speaker);
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
    if (Math.abs(forward) < 0.06 && Math.abs(strafe) < 0.06) { player.moving = false; player.running = false; return; }
    var length = Math.hypot(forward, strafe) || 1;
    forward /= length;
    strafe /= length;
    var sin = Math.sin(camera.yaw);
    var cos = Math.cos(camera.yaw);
    var dx = -sin * forward + cos * strafe;
    var dz = -cos * forward - sin * strafe;
    player.moveX = dx;
    player.moveZ = dz;
    player.running = !!(keys.ShiftLeft || keys.ShiftRight);
    var speed = player.running ? 6.4 : 4.6;
    var nextX = player.x + dx * speed * dt;
    var nextZ = player.z + dz * speed * dt;
    if (!blocked(nextX, player.z)) player.x = nextX;
    if (!blocked(player.x, nextZ)) player.z = nextZ;
    player.x = clamp(player.x, -28, 28);
    player.z = clamp(player.z, -28, 28);
    var targetYaw = Math.atan2(dx, dz);
    var difference = ((targetYaw - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    /* A hard reversal gets a Paper Mario squash-flip instead of a slow spin. */
    if (Math.abs(difference) > 2.0 && player.flip <= 0) {
      player.flip = 0.16;
      player.yaw = targetYaw;
    } else {
      player.yaw += difference * Math.min(1, dt * 12);
    }
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
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       350ms swing back from the fight: blend the exploration shot from the last
       battle camera instead of snapping. */
    if (camera.ret) {
      camera.ret.t = Math.min(1, camera.ret.t + dt / (camera.ret.dur || BATTLE_CAM_TWEEN));
      var retEase = 1 - Math.pow(1 - camera.ret.t, 3);
      for (var ri = 0; ri < 3; ri++) {
        eye[ri] = battleMix(camera.ret.from.eye[ri], eye[ri], retEase);
        target[ri] = battleMix(camera.ret.from.target[ri], target[ri], retEase);
      }
      for (var rj = 0; rj < 3; rj++) { camera.eye[rj] = eye[rj]; camera.target[rj] = target[rj]; }
      renderer.setCamera(eye, target, 55 * Math.PI / 180, battleMix(camera.ret.from.ortho, camera.ortho, retEase));
      if (camera.ret.t >= 1) camera.ret = null;
      return;
    }
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
    var side = (item.x - player.x) * Math.cos(camera.yaw) - (item.z - player.z) * Math.sin(camera.yaw);
    player.facing = side < 0 ? -1 : 1;
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

    /* Held sprite poses: four steps per stride off the atlas, the same blink
       beat on the idle loop, and the body still squashes on each footfall. */
    var walkPhase = stepped(player.walk);
    var bounce = player.moving ? Math.abs(Math.cos(walkPhase)) : 0;
    var run = player.running ? 1 : 0;
    if (player.swing > 0) {
      player.frame = (1 - player.swing / SWING_TIME) < 0.45 ? SPRITE_FRAMES.strike : SPRITE_FRAMES.follow;
    } else if (player.moving) {
      var cycle = Math.floor(walkPhase / (Math.PI / 2)) % 4;
      player.frame = (run ? SPRITE_FRAMES.run : SPRITE_FRAMES.walk)[cycle];
    } else if ((time % 4.8) > 4.62) {
      player.frame = SPRITE_FRAMES.blink;
    } else {
      player.frame = SPRITE_FRAMES.idle[Math.floor(stepped(time) * 1.6) % 2];
    }
    /* Mirror the profile to the way he crosses the screen, not the world, so
       left and right always match the camera's point of view. */
    if (player.moving) {
      var side = player.moveX * Math.cos(camera.yaw) - player.moveZ * Math.sin(camera.yaw);
      if (Math.abs(side) > 0.12) player.facing = side < 0 ? -1 : 1;
    }
    player.squashY = 1 + bounce * (0.06 + run * 0.04);
    player.squashX = 1 - bounce * (0.045 + run * 0.03);
    if (player.flip > 0) {
      /* Paper-thin pinch at the midpoint of the turn, then snap back. */
      player.flip = Math.max(0, player.flip - dt);
      var flipK = Math.abs(player.flip / 0.16 * 2 - 1);
      player.squashX *= 0.22 + 0.78 * flipK;
      player.squashY *= 1 + (1 - flipK) * 0.1;
    }
    player.y = bounce * (0.07 + run * 0.04);
    if (player.swing > 0) {
      player.swing = Math.max(0, player.swing - dt);
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
        actor.y = Math.sin(stepped(time) * 1.4 + actor.phase) * 0.02;
        actor.yaw = Math.sin(stepped(time) * 0.5 + actor.phase) * 0.18;
        if (actor.hop > 0) {
          /* Talking hop: a small squash-and-stretch pop per dialogue box. */
          actor.hop = Math.max(0, actor.hop - dt);
          var hopK = actor.hop / 0.26;
          var hopLift = Math.sin(clamp(hopK, 0, 1) * Math.PI);
          actor.y += hopLift * 0.34;
          actor.squashY = 1 + hopLift * 0.11;
          actor.squashX = 1 - hopLift * 0.08;
        } else {
          actor.squashY = 1;
          actor.squashX = 1;
        }
        if (mode === 'dialogue' && dialogue.speaker === world.npcName) {
          actor.frame = SPRITE_FRAMES.talk[Math.floor(stepped(time) * 5) % 2];
        } else if (actor.hop > 0) {
          actor.frame = SPRITE_FRAMES.cheer;
        } else {
          actor.frame = SPRITE_FRAMES.idle[Math.floor(stepped(time) * 1.2 + actor.phase) % 2];
        }
        var towardPlayer = (player.x - actor.x) * Math.cos(camera.yaw) - (player.z - actor.z) * Math.sin(camera.yaw);
        if (Math.abs(towardPlayer) > 0.25) actor.facing = towardPlayer < 0 ? -1 : 1;
      } else if (actor.kind === 'enemy') {
        actor.y = actor.baseY * actor.scale + Math.sin(stepped(time) * 1.9 + actor.phase) * 0.12;
      } else if (actor.kind === 'relic') {
        actor.y = Math.sin(stepped(time) * 2.1) * 0.05;
        actor.yaw += dt * 0.55;
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
  /* Passive Cards: equipped with BP in the pause menu, before a fight. */
  var CARDS = [
    { id: 'ante-up', name: 'ANTE UP', cost: 2, desc: 'Windows 30% tighter. Hits deal +1 damage.', mods: { narrow: 1, bonus: 1 } },
    { id: 'bouncer', name: 'BOUNCER', cost: 2, desc: 'Line Bounce gets a fifth bounce and +1 per bounce.', mods: { ballBounce: 1, ballBonus: 1 } },
    { id: 'defender', name: 'DEFENDER', cost: 2, desc: 'Take 1 less damage, deal 1 less damage.', mods: { attack: -1, incoming: -1 } },
    { id: 'sp-saver', name: 'SP SAVER', cost: 3, desc: 'Action Cards cost 1 less SP (min 1).', mods: { skillDiscount: 1 } },
    { id: 'happy-hp-sp', name: 'HAPPY HP / SP', cost: 2, desc: 'Start each turn with +1 HP and +1 SP.', mods: { regenHp: 1, regenSp: 1 } },
    { id: 'thorns', name: 'THORNS', cost: 2, desc: 'Guard counters 1. Superguard counters 2.', mods: { thorns: true } },
    { id: 'hard-mode', name: 'HARD MODE', cost: 0, desc: 'Enemy damage ×2, tighter superguard, +50% XP.', mods: { hard: true } }
  ];

  /* Older saves can still name retired cards. Keep them out of the totals and
     the equipment list rather than letting dead ids eat BP. */
  function equippedCards() {
    if (!save || !Array.isArray(save.cards)) return [];
    return save.cards.filter(function (id) {
      return CARDS.some(function (card) { return card.id === id; });
    });
  }

  function cardMods() {
    var mods = { maxHp: 0, attack: 0, guardMs: 0, revive: false, agility: 0, skillDiscount: 0, narrow: 0, incoming: 0, bonus: 0, regenHp: 0, regenSp: 0, thorns: false, hard: false, ballBounce: 0, ballBonus: 0 };
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
      var rawIndex = save.cards.indexOf(id);
      if (rawIndex >= 0) save.cards.splice(rawIndex, 1);
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

  /* === NEW: IN-WORLD BATTLE CAMERA ===
     Pull a draw object's ground spot out of either its sprite position or its
     baked model matrix. Stud batches sit at the origin with an identity matrix
     and are skipped so a fight near spawn never blanks the ground. */
  function battleSpotOf(obj) {
    if (!obj) return null;
    if (obj.pos && obj.pos.length >= 3) return [obj.pos[0], obj.pos[2]];
    if (obj.model && obj.model.length >= 16) {
      var identity = Math.abs(obj.model[0] - 1) < 1e-4 && Math.abs(obj.model[5] - 1) < 1e-4 &&
        Math.abs(obj.model[10] - 1) < 1e-4 && !obj.model[12] && !obj.model[14];
      if (identity) return null;
      return [obj.model[12], obj.model[14]];
    }
    return null;
  }

  function battleMix(a, b, t) { return a + (b - a) * t; }

  /* === NEW: IN-WORLD BATTLE CAMERA ===
     Half-diagonal of a prop's footprint, read off its model matrix. A whole
     building is one big box whose origin can sit far from the wall the player
     is standing next to, so radius-only distance tests miss it. */
  function battleBoxRadius(obj) {
    if (!obj || !obj.model || obj.model.length < 16) return 0.6;
    var sx = Math.hypot(obj.model[0], obj.model[1], obj.model[2]);
    var sz = Math.hypot(obj.model[8], obj.model[9], obj.model[10]);
    return Math.max(0.6, 0.5 * Math.hypot(sx, sz));
  }

  /* === NEW: IN-WORLD BATTLE CAMERA ===
     Distance from a point to a segment, in the XZ plane. */
  function battleSegDistance(px, pz, ax, az, bx, bz) {
    var vx = bx - ax, vz = bz - az;
    var len2 = vx * vx + vz * vz;
    var t = len2 > 0.0001 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  }

  /* === NEW: IN-WORLD BATTLE CAMERA ===
     How many building footprints the camera-to-stage line crosses. Used to pick
     the side of the fight that is not walled off, so the shot never ends up
     inside a Roadtown wall. */
  function battleCamBlocks(cx, cz, dir, dist) {
    if (!world || !world.colliders.length) return 0;
    var ex = cx + dir[0] * dist;
    var ez = cz + dir[1] * dist;
    var blocked = 0;
    for (var i = 0; i < world.colliders.length; i++) {
      var box = world.colliders[i];
      /* 2D slab test against the footprint, padded a little. */
      var pad = 0.55;
      var minX = box.x - box.hw - pad, maxX = box.x + box.hw + pad;
      var minZ = box.z - box.hd - pad, maxZ = box.z + box.hd + pad;
      var ax = cx, az = cz;
      var dxs = ex - ax, dzs = ez - az;
      var t0 = 0, t1 = 1, hit = true;
      var planes = [[-dxs, ax - minX], [dxs, maxX - ax], [-dzs, az - minZ], [dzs, maxZ - az]];
      for (var p = 0; p < 4; p++) {
        var pd = planes[p][0], pe = planes[p][1];
        if (Math.abs(pd) < 1e-6) { if (pe < 0) { hit = false; break; } continue; }
        var tHit = pe / pd;
        if (pd < 0) { if (tHit > t0) t0 = tHit; }
        else if (tHit < t1) t1 = tHit;
        if (t0 > t1) { hit = false; break; }
      }
      if (hit) blocked++;
    }
    return blocked;
  }

  /* === NEW: IN-WORLD BATTLE CAMERA ===
     Where the fight happens: midpoint between the player and the enemy, the
     axis they stand on, the side-profile camera 11 units off that axis (on the
     side the exploration camera is already on, so the swing is short), and the
     ground height at the spot. */
  function battleStage() {
    var px = player ? player.x : 0;
    var pz = player ? player.z : 0;
    var foe = battle && battle.opts ? battle.opts.foe : null;
    var ex = foe ? foe.x : px + Math.sin(camera.yaw) * 3.4;
    var ez = foe ? foe.z : pz + Math.cos(camera.yaw) * 3.4;
    var dx = ex - px;
    var dz = ez - pz;
    var len = Math.hypot(dx, dz);
    if (len < 0.001) { dx = Math.sin(camera.yaw); dz = Math.cos(camera.yaw); len = 1; }
    var cx = (px + ex) * 0.5;
    var cz = (pz + ez) * 0.5;
    var axis = [dx / len, dz / len];
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       Try 90° either side of the fighters, then 26° and 52° off that, and take
       the angle with the fewest buildings in the way (with a nudge toward the
       side the player is already looking from). */
    var axisAngle = Math.atan2(axis[1], axis[0]);
    var camDist = 7.4;
    var camOffsets = [Math.PI / 2, -Math.PI / 2, Math.PI / 2 + 0.45, -Math.PI / 2 - 0.45,
      Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45, Math.PI / 2 + 0.9, -Math.PI / 2 - 0.9];
    var bestDir = [axis[1], -axis[0]];
    var bestScore = Infinity;
    for (var ci = 0; ci < camOffsets.length; ci++) {
      var angle = axisAngle + camOffsets[ci];
      var dir = [Math.cos(angle), Math.sin(angle)];
      var score = battleCamBlocks(cx, cz, dir, camDist) * 10;
      score += Math.abs(dir[0] * axis[0] + dir[1] * axis[1]) * 4;
      if (dir[0] * (camera.eye[0] - cx) + dir[1] * (camera.eye[2] - cz) < 0) score += 1.5;
      if (score < bestScore) { bestScore = score; bestDir = dir; }
    }
    var perp = bestDir;
    /* Screen right for that camera: keep the hero on the left of frame. */
    var right = [perp[1], -perp[0]];
    var side = axis[0] * right[0] + axis[1] * right[1] >= 0 ? 1 : -1;
    axis = [axis[0] * side, axis[1] * side];
    var fit = window.innerWidth / Math.max(1, window.innerHeight) < 0.9 ? 13.5 : 11.5;
    var ground = 0;
    /* Lift the rig above the rooftops: a ground-level camera ends up staring
       into a town wall whenever the fight lands beside a building. */
    var eye = [cx + perp[0] * camDist, 4.8, cz + perp[1] * camDist];
    var target = [cx, 0.8, cz];
    return {
      center: [cx, cz], axis: axis, perp: perp, ground: ground, fit: fit,
      playerYaw: Math.atan2(axis[0], axis[1]),
      enemyYaw: Math.atan2(-axis[0], -axis[1]),
      from: { eye: camera.eye.slice(), target: camera.target.slice(), ortho: camera.ortho, fov: 55 * Math.PI / 180 },
      to: { eye: eye, target: target, ortho: fit, fov: 55 * Math.PI / 180 },
      t: 0, dur: BATTLE_CAM_TWEEN, last: null,
      extras: [], shadows: [], shadowSize: [[1.5, 0.04, 1.0], [1.6, 0.04, 1.05]],
      hidden: [], hiddenActors: []
    };
  }

  function buildBattleScene(def) {
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       Replaces the old blue checkered room: the live chapter scene (buildings,
       snow, pines, fences, sky) stays rendered and the fight is staged where the
       enemy was met. */
    var stage = battle.stage = battleStage();
    battleObjects = world && world.objects ? world.objects : [];
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
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       Local stage clearance: NPCs, villagers, Pip, the overworld hero, the
       overworld enemy and small props within 4 units of the midpoint are hidden
       so nothing stands between the camera and the fighters. Everything listed
       here is handed back in finishBattle(). */
    if (world) {
      for (var ai = 0; ai < world.actors.length; ai++) {
        var actor = world.actors[ai];
        if (Math.hypot(actor.x - stage.center[0], actor.z - stage.center[1]) > BATTLE_STAGE_RADIUS) continue;
        stage.hiddenActors.push({ actor: actor, hidden: actor.hidden });
        actor.hidden = true;
        updateActor(actor);
      }
      for (var oi = 0; oi < world.objects.length; oi++) {
        var prop = world.objects[oi];
        if (!prop.geo || prop.hidden || prop.keepInBattle) continue;
        var spot = battleSpotOf(prop);
        if (!spot) continue;
        var radius = battleBoxRadius(prop);
        var toStage = Math.hypot(spot[0] - stage.center[0], spot[1] - stage.center[1]);
        /* Whole buildings count from their nearest face, not their origin. */
        var nearStage = toStage - radius <= BATTLE_STAGE_RADIUS;
        /* Trees and fences just off the stage still block the lens: clear the
           corridor between the camera and the fighters too. */
        var nearLens = toStage <= 9 &&
          battleSegDistance(spot[0], spot[1], stage.center[0], stage.center[1], stage.to.eye[0], stage.to.eye[2]) - radius <= 2.8;
        /* Nothing may stand in the gap between the two fighters either. */
        var nearLine = toStage <= 8 &&
          battleSegDistance(spot[0], spot[1],
            stage.center[0] - stage.axis[0] * 2.2, stage.center[1] - stage.axis[1] * 2.2,
            stage.center[0] + stage.axis[0] * 2.2, stage.center[1] + stage.axis[1] * 2.2) - radius <= 1.4;
        if (!nearStage && !nearLens && !nearLine) continue;
        prop.hidden = true;
        stage.hidden.push(prop);
      }
    }

    battlePlayer = buildHero(heroPalette());
    battlePlayer.x = stage.center[0] - stage.axis[0] * 2.2;
    battlePlayer.z = stage.center[1] - stage.axis[1] * 2.2;
    battlePlayer.y = stage.ground;
    battlePlayer.yaw = stage.playerYaw;
    battlePlayer.scale = 0.86;
    /* === NEW: CHARACTER FACTORY === roster enemies bring their own sprite
       actor; procedural models still build exactly as before. */
    battleEnemy = def.character ? buildCharacterActor(def.character) : buildEnemy(def.model);
    battleEnemy.x = stage.center[0] + stage.axis[0] * 2.2;
    battleEnemy.z = stage.center[1] + stage.axis[1] * 2.2;
    battleEnemy.yaw = stage.enemyYaw;
    battleEnemy.scale = def.boss ? 1.28 : 1.05;
    battleEnemy.y = stage.ground + battleEnemy.baseY * battleEnemy.scale;
    /* Soft dark contact shadows: flat discs just above the ground. */
    stage.shadowSize = [[1.5, 0.04, 1.0], [def.boss ? 2.1 : 1.6, 0.04, def.boss ? 1.5 : 1.05]];
    stage.shadows = [
      makeStatic('disc', battlePlayer.x, stage.ground + 0.03, battlePlayer.z, stage.shadowSize[0][0], stage.shadowSize[0][1], stage.shadowSize[0][2], 0x0d0718, { alpha: 0.34, pattern: false }),
      makeStatic('disc', battleEnemy.x, stage.ground + 0.03, battleEnemy.z, stage.shadowSize[1][0], stage.shadowSize[1][1], stage.shadowSize[1][2], 0x0d0718, { alpha: 0.34, pattern: false })
    ];
    stage.extras = [];
    [battlePlayer, battleEnemy].forEach(function (fighter) {
      if (fighter.spriteObj) stage.extras.push(fighter.spriteObj);
      for (var pi = 0; pi < fighter.parts.length; pi++) stage.extras.push(fighter.parts[pi].obj);
    });
    stage.shadows.forEach(function (shadow) { stage.extras.push(shadow); });
    stage.extras.forEach(function (obj) { battleObjects.push(obj); });
    updateActor(battlePlayer);
    updateActor(battleEnemy);
    /* Keep the chapter's own fog and lighting so the fight sits inside the
       living town instead of a separate room. */
    var stageChapter = CHAPTERS[clamp(save.chapter, 0, 4)];
    renderer.setScene({ objects: battleObjects, fogColor: stageChapter.fog, fogNear: 22, fogFar: 70, skyColor: chapterTint(stageChapter).sky });
    if (battle) battle.fit = stage.fit;
    /* Smash cut: the white flash and the punch land here, then updateBattle()
       walks the camera from the exploration shot to the battle shot in 350ms. */
    stage.last = { eye: stage.from.eye.slice(), target: stage.from.target.slice(), ortho: stage.from.ortho, fov: stage.from.fov };
    renderer.setCamera(stage.from.eye, stage.from.target, stage.from.fov, stage.from.ortho);
    flashStage('white');
    cameraPunch(0.55);
  }

  function updateBattle(dt, time) {
    if (!battle || !battlePlayer || !battleEnemy) return;
    var anim = battle.anim;
    var st = stepped(time);
    var poseTime = Date.now() - (battle.poseAt || 0);
    if (battle.pose === 'strike' && poseTime > 240) battle.pose = 'idle';
    if (battle.pose === 'hurt' && poseTime > 320) battle.pose = 'idle';
    battlePlayer.x = -1.7 + anim.p * 1.1;
    battleEnemy.x = 1.8 - anim.e * 1.1;
    anim.p = Math.max(0, anim.p - dt * 3.2);
    anim.e = Math.max(0, anim.e - dt * 3.2);
    battlePlayer.y = Math.abs(Math.sin(st * 2.4)) * 0.04;
    battleEnemy.y = (battle.stage ? battle.stage.ground : 0) + battleEnemy.baseY * battleEnemy.scale + Math.sin(st * 1.9) * 0.1;
    battlePlayer.facing = 1;
    var bframe = SPRITE_FRAMES.idle[Math.floor(st * 1.6) % 2];
    battlePlayer.squashY = 1 + anim.p * 0.06;
    battlePlayer.squashX = 1 - anim.p * 0.04;
    /* Three held poses per swing: cock back, whip forward, rebound. The windup
       runs while the timing bar is still filling, so the pose itself teaches
       the player when to press. */
    if (battle.pose === 'windup') {
      battlePlayer.x -= 0.34;
      battlePlayer.squashY = 0.9;
      battlePlayer.squashX = 1.12;
      battlePlayer.y = 0;
      bframe = SPRITE_FRAMES.windup;
    } else if (battle.pose === 'strike') {
      var hitK = clamp(1 - poseTime / 110, 0, 1);
      var recoilK = clamp((poseTime - 110) / 130, 0, 1);
      battlePlayer.x += 0.72 * hitK - 0.18 * recoilK;
      battlePlayer.squashY = 1 + 0.14 * hitK;
      battlePlayer.squashX = 1 - 0.12 * hitK;
      bframe = poseTime < 130 ? SPRITE_FRAMES.strike : SPRITE_FRAMES.follow;
    } else if (battle.pose === 'hurt') {
      /* Knockback, head snapped away: the sheet's hurt frame. */
      var hurtK = clamp(1 - poseTime / 300, 0, 1);
      battlePlayer.x -= 0.24 * hurtK;
      battlePlayer.squashY = 1 - 0.08 * hurtK;
      battlePlayer.squashX = 1 + 0.08 * hurtK;
      bframe = SPRITE_FRAMES.hurt;
    } else if (battle.pose === 'victory') {
      /* "Praises the sun": arms up, hopping in place, stretched at the top. */
      var victoryT = (Date.now() - battle.poseAt) % 640 / 640;
      var lift = Math.sin(stepped(victoryT * 0.64) * Math.PI);
      battlePlayer.y += lift * 0.4;
      battlePlayer.squashY = 1 + lift * 0.13;
      battlePlayer.squashX = 1 - lift * 0.1;
      bframe = SPRITE_FRAMES.victory[Math.floor((Date.now() - battle.poseAt) / 170) % 2];
    }
    /* === NEW: SINGLE-SHEET POSE ROWS ===
       The JPG sheet replaces the atlas only while a battle is running, and
       only for the frame currently being shown: hover a card to preview its
       row, fire it to play the row at 9 fps. If animations.jpg is missing the
       old hero atlas keeps drawing exactly as before. */
    if (actionSheet.state === 'ready' && battlePlayer && battlePlayer.spriteObj) {
      var sheetRow = battleSheetRow();
      if (battleSheetApply(sheetRow)) bframe = battleSheetFrame(sheetRow, poseTime, st);
    }
    battlePlayer.frame = bframe;
    if (battle.lunge > 0) battle.lunge = Math.max(0, battle.lunge - dt * 4);
    battleEnemy.tiltX = battle.windup ? -0.26 : battle.lunge > 0 ? 0.34 : 0;
    battleEnemy.squashY = battle.windup ? 0.9 : 1;
    battleEnemy.squashX = battle.windup ? 1.1 : 1;
    /* === NEW: CHARACTER FACTORY === sheet enemies play their own strip:
       idle, walk while winding up, attack on the lunge. */
    if (battleEnemy.character) {
      battleEnemy.frame = battle.lunge > 0 ? 5 : battle.windup ? 3 : 0;
    }
    battleEnemy.lean = battle.lunge > 0 ? 0.28 : 0;
    /* A two-frame shoulder shake while the telegraph is up. */
    if (battle.windup) battleEnemy.x += Math.floor(time * 24) % 2 ? 0.05 : -0.05;
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       Everything above animates in stage-local units (the old arena's -1.7 /
       1.8 anchors). Fold those offsets onto the encounter axis so the same
       lunge, windup and knockback maths plays out in the live world at
       center.x - 2.2 and center.x + 2.2. */
    if (battle.stage) {
      var stageRef = battle.stage;
      var heroDev = battlePlayer.x + 1.7;
      var foeDev = battleEnemy.x - 1.8;
      battlePlayer.x = stageRef.center[0] + stageRef.axis[0] * (heroDev - 2.2);
      battlePlayer.z = stageRef.center[1] + stageRef.axis[1] * (heroDev - 2.2);
      battleEnemy.x = stageRef.center[0] + stageRef.axis[0] * (foeDev + 2.2);
      battleEnemy.z = stageRef.center[1] + stageRef.axis[1] * (foeDev + 2.2);
      if (stageRef.shadows.length === 2) {
        var heroShadow = stageRef.shadowSize[0];
        var foeShadow = stageRef.shadowSize[1];
        stageRef.shadows[0].model = mat.compose([battlePlayer.x, stageRef.ground + 0.03, battlePlayer.z], [0, 0, 0], heroShadow);
        stageRef.shadows[1].model = mat.compose([battleEnemy.x, stageRef.ground + 0.03, battleEnemy.z], [0, 0, 0], foeShadow);
      }
    }
    updateActor(battlePlayer);
    updateActor(battleEnemy);
    /* Battle camera: push in on windups, snap wide on the hit, plus the same
       punch kick the overworld uses. */
    camera.punch = Math.max(0, camera.punch - dt * 26);
    var kick = punchOffset();
    var push = battle.pose === 'strike' ? 1.6 : battle.windup ? 1 : 0;
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       350ms swing from the exploration shot into the side-profile shot, then
       the same windup push-in and strike kick the arena used, applied to the
       in-world camera. */
    if (battle.stage) {
      var shot = battle.stage;
      shot.t = Math.min(1, (shot.t || 0) + dt / (shot.dur || BATTLE_CAM_TWEEN));
      var ease = shot.t < 1 ? 1 - Math.pow(1 - shot.t, 3) : 1;
      var camEye = [
        battleMix(shot.from.eye[0], shot.to.eye[0], ease) + kick[0],
        battleMix(shot.from.eye[1], shot.to.eye[1], ease) + kick[1] - push * 0.12,
        battleMix(shot.from.eye[2], shot.to.eye[2], ease)
      ];
      var camTarget = [
        battleMix(shot.from.target[0], shot.to.target[0], ease),
        battleMix(shot.from.target[1], shot.to.target[1], ease),
        battleMix(shot.from.target[2], shot.to.target[2], ease)
      ];
      var camOrtho = battleMix(shot.from.ortho, shot.to.ortho, ease) * (1 - push * 0.022);
      renderer.setCamera(camEye, camTarget, shot.to.fov, camOrtho);
      shot.last = { eye: camEye.slice(), target: camTarget.slice(), ortho: camOrtho, fov: shot.to.fov };
    } else {
      renderer.setCamera(
        [kick[0], 3.3 + kick[1] - push * 0.12, 12.2 - push * 0.5],
        [0, -0.2, 0.9],
        52 * Math.PI / 180,
        (battle.fit || 14.5) * (1 - push * 0.022)
      );
    }

    // Rolling HP: save.hp is the real value, battle.displayHp drains toward it.
    var target = save.hp;
    if (battle.displayHp > target) battle.displayHp = Math.max(target, battle.displayHp - dt * 12);
    else if (battle.displayHp < target) battle.displayHp = Math.min(target, battle.displayHp + dt * 40);
    ui.battleHp.textContent = Math.max(0, Math.ceil(battle.displayHp)) + '/' + save.maxHp;
    ui.battleHpBar.style.width = clamp(battle.displayHp / save.maxHp * 100, 0, 100) + '%';
    ui.battleSp.textContent = save.sp + '/' + save.maxSp;
    ui.battleSpBar.style.width = clamp(save.sp / save.maxSp * 100, 0, 100) + '%';
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
      /* A charge only counts once the bar is actually moving, so the key or
         tap that opened the move cannot release it by accident. */
      if (w.charge && !w.armed && now >= w.openAt) w.armed = true;
      if (!w.resolving && now >= w.closeAt) {
        w.resolving = true;
        if (w.type === 'strike') {
          var strikeQuality = w.quality || 'miss';
          if (w.mash) strikeQuality = w.presses >= 6 ? 'perfect' : w.presses >= 3 ? 'good' : 'miss';
          resolvePlayerMove(w.move, strikeQuality, w);
        } else if (w.type === 'guard') resolveEnemyHit(w.telegraph, w.superguard ? 'superguard' : w.guard ? 'guard' : null);
        else if (w.type === 'unblockable') resolveEnemyHit('unblockable', null);
      }
    }
  }

  function hideSkills() {
    ui.skills.hidden = true;
    ui.actions.hidden = false;
    if (battle) battle.sheetPreview = null;
    ui.battleHint.textContent = 'CHOOSE AN ACTION';
  }

  function hideBattle() {
    if (battle) battle.sheetPreview = null;
    ui.battle.hidden = true;
    /* === NEW: never leave the pause panel open behind a finished fight === */
    if (ui.battlePause) ui.battlePause.hidden = true;
    ui.battle.classList.remove('ff-mortal');
    ui.levelup.hidden = true;
    ui.skills.hidden = true;
    ui.actions.hidden = false;
    ui.timing.hidden = true;
    ui.telegraph.hidden = true;
    ui.battle.classList.remove('ff-window-open');
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
      else if (g.obscured) text = 'THE DARK HIDES THE BEAT · USE CURE';
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
      /* === NEW: IN-WORLD BATTLE CAMERA === stage is filled by buildBattleScene */
      stage: null,
      def: def, hp: def.hp, max: def.hp, displayHp: Math.max(1, save.hp),
      busy: false, ended: false, turn: 1, opts: opts, anim: { p: 0, e: 0 },
      state: 'intro', telegraph: 'standard', extraTurns: opts.advantage === 'player' ? 1 : 0,
      revived: false, mortal: false, mods: cardMods(), window: null, windowTimer: null, raged: false,
      gimmick: bossGimmick(def), windup: 0, lunge: 0, echo: false, stunned: false,
      soften: 0, burn: null,
      pose: 'idle', poseAt: 0, fit: 14.5,
      /* === NEW: ACTION-SHEET POSE ROWS === */
      sheetPreview: null, auraUntil: equippedCards().length ? Date.now() + 900 : 0
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
    /* === NEW: a lingering chapter toast would sit on the enemy plate === */
    ui.toast.hidden = true;
    ui.skills.hidden = true;
    ui.actions.hidden = false;
    ui.timing.hidden = true;
    ui.telegraph.hidden = true;
    ui.enemyName.textContent = def.name;
    buildBattleScene(def);
    updateBattleUI();
    setBattleButtons(false);
    log((/^THE /.test(def.name) ? '' : 'A ') + def.name + ' BLOCKS THE PATH!');
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
    /* Happy HP / SP tops the player up at the start of their turn, never past
       the cap. */
    if (battle.mods.regenHp && save.hp < save.maxHp) {
      var regenHp = Math.min(save.maxHp - save.hp, battle.mods.regenHp);
      save.hp += regenHp;
      pop('+' + regenHp + ' HP', 'nice');
    }
    if (battle.mods.regenSp && save.sp < save.maxSp) {
      var regenSp = Math.min(save.maxSp - save.sp, battle.mods.regenSp);
      save.sp += regenSp;
      pop('+' + regenSp + ' SP', 'sp');
    }
    battle.state = 'menu';
    battle.busy = false;
    battle.window = null;
    battle.sheetPreview = null;
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
    /* === NEW: hold the action strip open so the plate does not slide under the meter === */
    ui.actions.hidden = false;
    ui.battle.classList.add('ff-window-open');
    ui.skills.hidden = true;
  }

  function hideTiming() {
    ui.timing.hidden = true;
    ui.battle.classList.remove('ff-window-open');
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
      if (w.charge) return;
      if (w.resolved) return;
      if (w.mash) {
        w.presses += 1;
        ui.timingLabel.textContent = w.presses >= 6 ? 'MAX POWER!' : 'POWER ' + w.presses;
        ui.timingNote.textContent = w.presses >= 6 ? 'LET IT GO!' : 'MASH! ' + Math.max(0, 6 - w.presses) + ' MORE FOR MAX';
        timingFlash();
        sound('click');
        return;
      }
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

  /* Hold-and-release for Power Stab: the release, not the press, decides the
     timing. A release before the bar is armed is ignored. */
  function chargeRelease() {
    if (!battle || battle.ended) return;
    var w = battle.window;
    if (!w || !w.charge || w.resolved || !w.armed) return;
    var now = Date.now();
    if (now < w.openAt) return;
    w.resolved = true;
    w.quality = now >= w.perfectAt ? 'perfect' : 'good';
    w.closeAt = now + 90;
    ui.timingLabel.textContent = w.quality === 'perfect' ? 'PIERCE!' : 'RELEASED!';
    timingFlash();
    sound('click');
  }

  /* ==================================================================
     NEW: DISTINCT MOVE EFFECTS
     The battlers are single sprite billboards and the cast has no weapon
     models, so each card's look is a 2D prop drawn over the stage at the
     fighter's projected position: a thrown sword, a bouncing ball, three
     pellets, a fused bomb, a healing bloom. Same camera maths the renderer
     uses, so the props land on the right fighters at every aspect ratio.
     ================================================================== */
  /* ==================================================================
     NEW: MOVE EFFECTS
     Every card gets its own prop: a thrown sword, a bouncing ball, three
     pellets, a fused bomb and a healing bloom. The battlers are billboard
     sprites with no weapon models, so each prop is drawn on a 2D canvas
     laid over the stage and anchored to the fighters' projected positions
     with the same camera maths the renderer uses.
     ================================================================== */
  var FX_EYE = [0, 3.3, 12.2];
  var FX_TARGET = [0, -0.2, 0.9];
  var FX_INK = '#17102a';
  var fxHost = null, fxCanvas = null, fxCtx = null;
  var fxParts = [], fxCssW = 0, fxCssH = 0, fxLast = 0, fxLoop = false;

  function fxEnsure() {
    fxHost = fxHost || document.getElementById('ff-battle');
    if (!fxHost) return null;
    if (!fxCanvas || !fxCanvas.parentNode) {
      fxCanvas = document.createElement('canvas');
      fxCanvas.className = 'ff-mfx-canvas';
      fxCanvas.setAttribute('aria-hidden', 'true');
      fxHost.appendChild(fxCanvas);
      fxCtx = fxCanvas.getContext('2d');
    }
    var rect = fxCanvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    if (fxCanvas.width !== width || fxCanvas.height !== height) {
      fxCanvas.width = width;
      fxCanvas.height = height;
    }
    if (fxCtx) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxCssW = rect.width;
    fxCssH = rect.height;
    return fxCanvas;
  }

  function fxProject(x, y, z) {
    if (!fxEnsure() || !mat || !fxCssW || !fxCssH) return { x: 0, y: 0 };
    var halfH = ((battle && battle.fit) || 14.5) / 2;
    var halfW = halfH * (fxCssW / fxCssH);
    var view = mat.lookAt(FX_EYE, FX_TARGET, [0, 1, 0]);
    var vx = view[0] * x + view[4] * y + view[8] * z + view[12];
    var vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    return {
      x: (vx / halfW * 0.5 + 0.5) * fxCssW,
      y: (0.5 - vy / halfH * 0.5) * fxCssH
    };
  }

  function fxHeroPoint() {
    if (!battlePlayer) return fxProject(-1.7, 1.2, 1.7);
    return fxProject(battlePlayer.x, battlePlayer.scale * 1.3, battlePlayer.z);
  }

  function fxEnemyPoint() {
    if (!battleEnemy) return fxProject(1.9, 1.0, 1.0);
    return fxProject(battleEnemy.x, (battleEnemy.baseY || 0) * battleEnemy.scale + battleEnemy.scale, battleEnemy.z);
  }

  function fxPush(part) {
    part.t = 0;
    fxParts.push(part);
    if (!fxLoop) {
      fxLoop = true;
      fxLast = 0;
      requestAnimationFrame(fxRender);
    }
  }

  function fxEase(k) { return k * k * (3 - 2 * k); }

  function fxRender(ts) {
    if (!fxCtx) { fxLoop = false; return; }
    if (!battle || !fxHost || fxHost.hidden) {
      fxParts.length = 0;
      fxCtx.clearRect(0, 0, fxCssW, fxCssH);
      fxLoop = false;
      return;
    }
    var dt = fxLast ? Math.min(0.05, (ts - fxLast) / 1000) : 0.016;
    fxLast = ts;
    fxCtx.clearRect(0, 0, fxCssW, fxCssH);
    for (var i = fxParts.length - 1; i >= 0; i--) {
      var p = fxParts[i];
      var start = p.start || 0;
      p.t += dt;
      if (p.t < start) continue;
      if (p.t >= start + p.life) {
        if (p.type === 'bomb') fxBlast(p.x1, p.y1);
        fxParts.splice(i, 1);
        continue;
      }
      fxDrawPart(p, clamp((p.t - start) / p.life, 0, 1));
    }
    if (fxParts.length) requestAnimationFrame(fxRender);
    else { fxLoop = false; fxLast = 0; }
  }

  function fxBox(x, y, w, h, fill) {
    fxCtx.fillStyle = fill;
    fxCtx.strokeStyle = FX_INK;
    fxCtx.lineWidth = 2;
    fxCtx.beginPath();
    fxCtx.rect(x, y, w, h);
    fxCtx.fill();
    fxCtx.stroke();
  }

  function fxBlade(x, y, angle, len, alpha, tint) {
    var c = fxCtx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.globalAlpha = alpha;
    fxBox(-5, -len, 10, len, tint || '#eaf8ff');
    fxBox(-12, 0, 24, 7, '#ffcf4a');
    fxBox(-4, 7, 8, 15, '#7a4a22');
    c.restore();
  }

  function fxRing(x, y, radius, k, color, width) {
    var c = fxCtx;
    c.save();
    c.globalAlpha = 1 - k;
    c.strokeStyle = color;
    c.lineWidth = width || 4;
    c.beginPath();
    c.arc(x, y, radius * (0.3 + fxEase(k) * 1.3), 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  function fxDrawPart(p, k) {
    var c = fxCtx;
    var i, t, kk, ee;
    if (p.type === 'sword') {
      ee = fxEase(k);
      var sx = p.x0 + (p.x1 - p.x0) * ee;
      var sy = p.y0 + (p.y1 - p.y0) * ee - Math.sin(Math.PI * ee) * 26;
      for (i = 3; i >= 1; i--) {
        t = clamp(k - i * 0.07, 0, 1);
        kk = fxEase(t);
        fxBlade(p.x0 + (p.x1 - p.x0) * kk, p.y0 + (p.y1 - p.y0) * kk - Math.sin(Math.PI * kk) * 26, -0.4 + t * 7, 46, 0.12 * (4 - i), '#cfeaff');
      }
      fxBlade(sx, sy, -0.4 + k * 7, 46, 1);
      if (k > 0.84) fxRing(p.x1, p.y1, 30, (k - 0.84) / 0.16, '#bfefff', 4);
    } else if (p.type === 'ball') {
      ee = fxEase(k);
      var bx = p.x0 + (p.x1 - p.x0) * ee;
      var by = p.y0 + (p.y1 - p.y0) * ee - Math.sin(Math.PI * ee) * 62;
      for (i = 3; i >= 1; i--) {
        t = clamp(k - i * 0.09, 0, 1);
        kk = fxEase(t);
        c.save();
        c.globalAlpha = 0.2 * (4 - i);
        c.fillStyle = '#8ff2ff';
        c.beginPath();
        c.arc(p.x0 + (p.x1 - p.x0) * kk, p.y0 + (p.y1 - p.y0) * kk - Math.sin(Math.PI * kk) * 62, 7 - i, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.save();
      c.fillStyle = '#7cf0ff';
      c.strokeStyle = FX_INK;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(bx, by, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(bx - 3, by - 3, 3, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (p.type === 'pellet') {
      ee = fxEase(k);
      var px = p.x0 + (p.x1 - p.x0) * ee;
      var py = p.y0 + (p.y1 - p.y0) * ee;
      c.save();
      c.globalAlpha = 0.55;
      c.strokeStyle = '#ffe066';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(px - (p.x1 - p.x0) * 0.14, py - (p.y1 - p.y0) * 0.14);
      c.lineTo(px, py);
      c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = '#ffd84a';
      c.strokeStyle = FX_INK;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(px, py, 5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    } else if (p.type === 'bomb') {
      ee = fxEase(k);
      var bombX = p.x0 + (p.x1 - p.x0) * ee;
      var bombY = p.y0 + (p.y1 - p.y0) * ee - Math.sin(Math.PI * ee) * 78;
      c.save();
      c.translate(bombX, bombY);
      c.rotate(k * 9);
      fxBox(-6, -14, 12, 28, '#c8323c');
      c.fillStyle = '#ff7a5a';
      c.fillRect(-6, -10, 12, 5);
      c.fillRect(-6, 2, 12, 5);
      c.strokeStyle = '#ffd84a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -14);
      c.lineTo(0, -20);
      c.stroke();
      c.fillStyle = Math.floor(p.t * 20) % 2 ? '#fff3a8' : '#ff8a2e';
      c.beginPath();
      c.arc(0, -21, 3, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (p.type === 'boom') {
      var radius = 12 + fxEase(k) * 56;
      c.save();
      var grad = c.createRadialGradient(p.x0, p.y0, 2, p.x0, p.y0, radius);
      grad.addColorStop(0, 'rgba(255,255,255,' + (1 - k) + ')');
      grad.addColorStop(0.35, 'rgba(255,224,102,' + (0.95 - k * 0.9) + ')');
      grad.addColorStop(0.7, 'rgba(255,138,46,' + (0.8 - k * 0.78) + ')');
      grad.addColorStop(1, 'rgba(255,80,40,0)');
      c.fillStyle = grad;
      c.beginPath();
      c.arc(p.x0, p.y0, radius, 0, Math.PI * 2);
      c.fill();
      c.restore();
      fxRing(p.x0, p.y0, radius, k, '#ffd08a', 5);
    } else if (p.type === 'spark') {
      var sparkX = p.x0 + Math.cos(p.a) * p.dist * fxEase(k);
      var sparkY = p.y0 + Math.sin(p.a) * p.dist * fxEase(k) + 46 * k * k;
      c.save();
      c.globalAlpha = 1 - k;
      fxBox(sparkX - 3, sparkY - 3, 6, 6, '#ffd84a');
      c.restore();
    } else if (p.type === 'heal') {
      var moteY = p.y0 + p.rise * fxEase(k);
      var moteX = p.x0 + Math.sin(k * 7 + p.seed) * 9;
      c.save();
      c.globalAlpha = 1 - k * k;
      fxBox(moteX - 4, moteY - 6, 8, 12, '#9dffbf');
      c.restore();
    } else if (p.type === 'ring') {
      fxRing(p.x0, p.y0, 34, k, p.color || '#ffe066', 4);
    }
  }

  /* SWORD TOSS — a spinning blade arcs the gap and rings off the target. */
  function fxSwordToss() {
    if (!battle) return;
    var from = fxHeroPoint(), to = fxEnemyPoint();
    fxPush({ type: 'sword', x0: from.x, y0: from.y, x1: to.x, y1: to.y, life: 0.3 });
  }

  /* LINE BOUNCE — one arc per press, ricocheting back off the target. */
  function fxLineBounce(index) {
    if (!battle) return;
    var from = fxHeroPoint(), to = fxEnemyPoint();
    if (index > 0) from = { x: to.x + (index % 2 ? -70 : 70), y: to.y - 90 };
    fxPush({ type: 'ball', x0: from.x, y0: from.y, x1: to.x, y1: to.y, life: 0.3 });
    fxPush({ type: 'ring', x0: to.x, y0: to.y, life: 0.3, start: 0.24, color: '#ffe066' });
  }

  /* POWER SHOT — three staggered pellets, each with its own spark. */
  function fxPowerShot() {
    if (!battle) return;
    var from = fxHeroPoint(), to = fxEnemyPoint();
    var spread = [-18, 0, 16];
    for (var i = 0; i < 3; i++) {
      fxPush({ type: 'pellet', x0: from.x, y0: from.y + spread[i], x1: to.x, y1: to.y + spread[i], life: 0.2, start: i * 0.07 });
      fxPush({ type: 'ring', x0: to.x, y0: to.y + spread[i], life: 0.28, start: 0.15 + i * 0.07, color: '#ffe066' });
    }
  }

  /* DYNAMITE — lobbed stick, burning fuse, then a blast with debris. */
  function fxDynamite() {
    if (!battle) return;
    var from = fxHeroPoint(), to = fxEnemyPoint();
    fxPush({ type: 'bomb', x0: from.x, y0: from.y, x1: to.x, y1: to.y + 6, life: 0.42 });
  }

  function fxBlast(x, y) {
    if (!battle) return;
    fxPush({ type: 'boom', x0: x, y0: y, life: 0.55 });
    for (var i = 0; i < 8; i++) {
      fxPush({
        type: 'spark', x0: x, y0: y, life: 0.5, dist: rand(46, 104),
        a: (Math.PI * 2 / 8) * i + rand(-0.25, 0.25), start: rand(0, 0.05)
      });
    }
    flashStage('orange');
    cameraPunch(0.3);
  }

  /* CURE — a green bloom at the hero's feet and rising motes. */
  function fxCure() {
    if (!battle) return;
    var at = fxHeroPoint();
    fxPush({ type: 'ring', x0: at.x, y0: at.y + 24, life: 0.4, color: '#9dffbf' });
    for (var i = 0; i < 7; i++) {
      fxPush({
        type: 'heal', x0: at.x + rand(-26, 26), y0: at.y + rand(0, 34),
        rise: rand(-92, -54), seed: rand(0, 6), life: 0.75, start: i * 0.05
      });
    }
    flashStage('heal');
  }

  function beginPlayerMove(move) {
    if (!battle || battle.ended || battle.state !== 'menu') return;
    battle.state = 'strike';
    battle.busy = true;
    battle.move = move;
    /* === NEW: the fired card switches to its own sheet row === */
    battle.sheetPreview = actionRowForCmd(move.cmd);
    setBattleButtons(false);
    ui.skills.hidden = true;
    if (move.cmd === 'chain') {
      /* BOUNCER adds a fifth bounce; the window count travels with the move. */
      move.bounces = 4 + (battle.mods.ballBounce || 0);
      beginChainWindow(move, 0);
      return;
    }
    var now = Date.now();
    var charge = move.cmd === 'charge';
    /* A charge needs a longer runway than a tap: hold for about a second,
       then release in the gold band before it overcharges. */
    var perfectAt = charge ? now + (battle.mods.narrow ? 1205 : 1100) : now + (battle.mods.narrow ? 898 : 820);
    var closeAt = charge ? now + 1450 : now + 1080;
    battle.window = {
      type: 'strike', move: move, startAt: now, openAt: now + 220,
      perfectAt: perfectAt, closeAt: closeAt,
      quality: null, resolved: false, charge: charge, mash: move.cmd === 'mash',
      presses: 0, armed: false
    };
    battle.pose = 'windup';
    battle.poseAt = now;
    showTiming('strike', move.kind === 'skill' ? move.name + '!' : 'STRIKE!');
    if (move.cmd === 'charge') {
      ui.timingNote.textContent = 'HOLD, THEN RELEASE IN THE GOLD ZONE';
      ui.timingButton.textContent = 'RELEASE';
    } else if (move.cmd === 'mash') {
      ui.timingNote.textContent = 'MASH! SIX PRESSES FILL THE CHARGE';
      ui.timingButton.textContent = 'MASH';
    }
    if (battle.gimmick && battle.gimmick.obscured) ui.timingLabel.textContent = 'THE DARK IS LISTENING...';
  }

  /* Line Bounce opens a fresh short window for each of its four bounces. */
  function beginChainWindow(move, index) {
    if (!battle || battle.ended) return;
    battle.state = 'strike';
    battle.busy = true;
    setBattleButtons(false);
    var now = Date.now();
    battle.window = {
      type: 'strike', move: move, chain: index, startAt: now, openAt: now + 140,
      perfectAt: now + (battle.mods.narrow ? 515 : 470), closeAt: now + 620, quality: null, resolved: false
    };
    battle.pose = 'windup';
    battle.poseAt = now;
    var total = move.bounces || 4;
    showTiming('strike', index === 0 ? move.name + '!' : 'BOUNCE ' + (index + 1) + '!');
    ui.timingNote.textContent = 'PRESS ON EVERY BOUNCE · ' + (total - index) + ' LEFT';
  }

  function moveMultiplier(quality) {
    return quality === 'perfect' ? 1.5 : quality === 'good' ? 1 : 0.65;
  }

  function moveDamage(move, quality) {
    var mods = battle.mods;
    var flat = (quality === 'perfect' || quality === 'good') ? mods.bonus : 0;
    var soften = battle.soften > 0 ? 1 : 0;
    var bonus = quality === 'miss' ? 0 : (move.bonus || 0);
    var base = (3 + save.level + mods.attack) * (move.mult || 1);
    return Math.max(1, Math.round(base * moveMultiplier(quality) + flat + soften + bonus));
  }

  /* One damage pipeline for every card, so burrows, coils, echo shields and
     burn react the same way whichever card touched them. */
  function hitEnemy(move, quality, opts) {
    opts = opts || {};
    var damage = moveDamage(move, quality);
    var g = battle.gimmick;
    var note = '';
    if (g && g.burrowed) {
      g.burrowed = 0;
      battleEnemy.hidden = false;
      if (!opts.reach) damage = Math.max(1, Math.round(damage * 0.5));
      note = opts.reach ? 'CLEAN HIT THROUGH THE SNOW!' : 'IT WAS BURIED. HALF DAMAGE.';
    }
    if (g && g.coils > 0 && !opts.pierce) {
      if (quality === 'perfect') {
        g.coils -= 1;
        note = 'COIL SHATTERS! ' + g.coils + ' LEFT.';
      } else {
        damage = Math.min(damage, 2);
        note = 'ARMORED COILS ABSORB IT. PERFECT BREAKS THEM.';
      }
    }
    if (g && g.threshold) {
      g.chargeDamage = (g.chargeDamage || 0) + damage;
      while (g.chargeDamage >= g.threshold && g.charge > 0) {
        g.chargeDamage -= g.threshold;
        g.charge -= 1;
        note = 'THE ECHO BREAKS! CHARGE ' + g.charge + '/3.';
      }
    }
    battle.hp = Math.max(0, battle.hp - damage);
    return { damage: damage, note: note };
  }

  function hitFeedback(quality, damage) {
    battle.anim.p = 1;
    battle.pose = 'strike';
    battle.poseAt = Date.now();
    sound('hit');
    shake();
    if (quality === 'perfect') {
      sound('perfect');
      rate('PERFECT!', 'perfect');
      pop(String(damage), 'perfect');
      hitStop(70);
      cameraPunch(0.42);
    } else if (quality === 'good') {
      rate('NICE!', 'nice');
      pop(String(damage), 'nice');
      cameraPunch(0.18);
    } else {
      pop(String(damage), 'weak');
    }
    updateBattleUI();
  }

  function resolvePlayerMove(move, quality, win) {
    if (!battle || battle.ended) return;
    hideTiming();
    if (move.cmd === 'chain') { resolveChain(move, quality, win); return; }
    if (move.cmd === 'cure') { resolveCure(move, quality); return; }

    var opts = {};
    var pierceBonus = 0;
    if (move.cmd === 'charge' && quality === 'perfect') {
      opts.pierce = true;
      opts.reach = true;
      pierceBonus = 2;
    }
    if (move.cmd === 'toss') opts.reach = true;

    /* === NEW: each card gets its own prop instead of the shared swing === */
    if (move.cmd === 'toss') fxSwordToss();
    else if (move.cmd === 'shot') fxPowerShot();
    else if (move.cmd === 'mash') fxDynamite();

    var total = 0;
    var note = '';
    var hits = move.cmd === 'shot' ? 3 : 1;
    for (var i = 0; i < hits; i++) {
      var result = hitEnemy(move, quality, opts);
      total += result.damage;
      if (result.note) note = result.note;
    }
    if (pierceBonus) {
      battle.hp = Math.max(0, battle.hp - pierceBonus);
      total += pierceBonus;
    }
    if (move.cmd === 'soften' && quality !== 'miss') {
      battle.soften = 3;
      note = 'ITS DEFENSE DROPS. -1 DEF FOR 3 TURNS.';
    }
    if (move.cmd === 'mash') {
      battle.burn = { turns: 2, dmg: 1 };
      note = 'SPLASH AND BURNING FOR 2 TURNS.';
    }

    hitFeedback(quality, total);
    var suffix = note ? ' ' + note : '';
    if (move.cmd === 'shot') log((quality === 'perfect' ? 'PERFECT!' : quality === 'good' ? 'GOOD!' : 'OFF BEAT...') + ' POWER SHOT! THREE PELLETS FOR ' + total + '.' + suffix);
    else if (move.cmd === 'charge' && quality === 'perfect') log('PERFECT PIERCE! POWER STAB IGNORES ARMOR FOR ' + total + '.' + suffix);
    else if (quality === 'perfect') log('PERFECT! ' + (move.name || 'YOUR HIT') + ' HITS FOR ' + total + '!' + suffix);
    else if (quality === 'good') log('GOOD! ' + (move.name || 'YOUR HIT') + ' HITS FOR ' + total + '.' + suffix);
    else log('OFF BEAT... ' + (move.name || 'YOUR HIT') + ' ONLY HITS FOR ' + total + '.' + suffix);
    if (move.cmd === 'mash' && quality !== 'miss') rate('BOOM!', 'boss');

    if (quality === 'perfect' && move.kind === 'attack') {
      setTimeout(function () {
        if (!battle || battle.ended || battle.hp <= 0) return;
        var extra = Math.max(1, Math.round(total * 0.5));
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

  function resolveChain(move, quality, win) {
    var index = win && win.chain ? win.chain : 0;
    fxLineBounce(index);
    var total = move.bounces || 4;
    var bounce = { kind: 'skill', name: move.name, mult: 0.4 + index * 0.2, bonus: battle.mods.ballBonus || 0 };
    var result = hitEnemy(bounce, quality, {});
    battle.anim.p = 1;
    battle.pose = 'strike';
    battle.poseAt = Date.now();
    sound('hit');
    shake();
    if (quality === 'perfect') cameraPunch(0.24);
    pop(String(result.damage), quality === 'perfect' ? 'perfect' : quality === 'good' ? 'nice' : 'weak');
    log('BOUNCE ' + (index + 1) + '/' + total + ' · ' + result.damage + ' DAMAGE.' + (quality === 'perfect' ? ' PERFECT!' : '') + (result.note ? ' ' + result.note : ''));
    updateBattleUI();
    if (battle.hp <= 0) { winBattle(); return; }
    var endChain = quality === 'miss' || index >= total - 1;
    setTimeout(function () {
      if (!battle || battle.ended) return;
      if (endChain) { flashEnemy(); playerTurnDone(); }
      else beginChainWindow(move, index + 1);
    }, endChain ? 560 : 220);
  }

  function resolveCure(move, quality) {
    fxCure();
    var healed = Math.min(save.maxHp - save.hp, quality === 'perfect' ? 7 : 5);
    save.hp += healed;
    battle.pose = 'strike';
    battle.poseAt = Date.now();
    battle.anim.p = 0.5;
    sound('heal');
    rate(quality === 'perfect' ? 'NICE CURE!' : 'CURE!', 'nice');
    pop('+' + healed, 'nice');
    log('CURE RESTORES ' + healed + ' HP.' + (quality === 'perfect' ? ' PERFECT BEAT!' : ''));
    if (battle.gimmick && battle.gimmick.obscured) {
      battle.gimmick.obscured = false;
      updateGimmickUi();
      log('WARMTH BURNS THE DARK AWAY. THE BEAT IS CLEAR AGAIN.');
      rate('WARMED UP!', 'nice');
    }
    updateBattleUI();
    setTimeout(function () { if (battle && !battle.ended) playerTurnDone(); }, 650);
  }

  function playerTurnDone() {
    if (!battle || battle.ended) return;
    if (battle.soften > 0) battle.soften -= 1;
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
        /* === NEW: the shade you ran from must not grab you again on landing === */
        setTimeout(function () { holdNearbyEncounters(); finishBattle(false); }, 900);
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
      button.innerHTML = '<b>' + skill.name + '</b><small>' + (unlocked ? skill.cat + ' · ' + cost + ' SP' : 'UNLOCKS AT LV ' + skill.level) + '</small><em>' + (unlocked ? skill.desc : '') + '</em>';
      /* === NEW: hovering or focusing a card previews its sprite row === */
      button._sheetRow = actionRowForCmd(skill.cmd);
      button.addEventListener('pointerenter', function () { if (battle) battle.sheetPreview = this._sheetRow; });
      button.addEventListener('focus', function () { if (battle) battle.sheetPreview = this._sheetRow; });
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
    ui.battleHint.textContent = 'CHOOSE AN ACTION CARD';
  }

  function castSkill(skill) {
    if (!battle || battle.busy || battle.ended || battle.state !== 'menu') return;
    var cost = Math.max(1, skill.cost - battle.mods.skillDiscount);
    if (save.level < skill.level || save.sp < cost) return;
    save.sp -= cost;
    /* === NEW: keep the card's row on screen through the strike === */
    battle.sheetPreview = actionRowForCmd(skill.cmd);
    hideSkills();
    beginPlayerMove({ kind: 'skill', name: skill.name, mult: skill.mult, cmd: skill.cmd, hits: skill.hits });
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
    /* Dynamite's burn ticks before the enemy moves, for its two turns. */
    if (battle.burn && battle.burn.turns > 0) {
      battle.burn.turns -= 1;
      battle.hp = Math.max(0, battle.hp - battle.burn.dmg);
      log('BURN! THE BLAST SCORCHES IT FOR ' + battle.burn.dmg + '.');
      pop(String(battle.burn.dmg), 'hurt');
      updateBattleUI();
      if (battle.hp <= 0) { winBattle(); return; }
    }
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
      log('THE LONG NIGHT TEARS OFF THE MAYOR SUIT.');
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
      perfectAt: now + 520 + extra + (battle.mods.hard ? 110 : 0), closeAt: now + 720 + extra,
      allowSuper: type !== 'heavy', guard: false, superguard: false, quality: null
    };
    showTiming('guard', type === 'heavy' ? 'GUARD!' : 'GUARD!');
    ui.timingNote.textContent = type === 'heavy' ? 'ORANGE ATTACK · SUPERGUARD DISABLED' : 'SPACE / E / TAP · INNER ZONE = SUPERGUARD';

  }

  /* Battle-only feedback must not leak into the world or the next fight: the
     mortal shake, the red stage pulse and a hurt face all reset here. */
  function clearBattleFeedback() {
    if (ui.hudHpRow) ui.hudHpRow.classList.remove('mortal');
    if (ui.battle) ui.battle.classList.remove('ff-mortal');
    if (battle) battle.mortal = false;
    setPortraitMood(null);
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
    if (battle.mods.hard) raw *= 2;
    raw += battle.mods.incoming || 0;
    var damage = Math.max(1, Math.round(raw));
    if (quality === 'superguard') damage = 0;
    else if (quality === 'guard') damage = Math.ceil(damage * 0.5);
    battle.anim.e = 1;
    battle.lunge = 1;
    if (quality !== 'superguard') {
      battle.pose = 'hurt';
      battle.poseAt = Date.now();
    }
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
    setPortraitMood(quality === 'superguard' ? 'confident' : (quality === 'guard' ? 'idle' : 'hurt'), quality === 'superguard' ? 1100 : 900);
    if (quality === 'superguard') log('SUPERGUARD! NO DAMAGE.');
    else if (quality === 'guard') log('GUARD! HALF DAMAGE: ' + damage + '.');
    else log(battle.def.name + ' HITS YOU FOR ' + damage + '!');
    applyDamage(damage);
    if (quality === 'superguard') {
      var counter = battle.mods.thorns ? 2 : 2 + Math.floor(save.level / 2);
      battle.hp = Math.max(0, battle.hp - counter);
      log('SUPERGUARD! ZERO DAMAGE AND A ' + counter + ' COUNTER!');
      pop('COUNTER ' + counter, 'counter');
      setTimeout(function () { if (battle) flashEnemy(); updateBattleUI(); }, 180);
    } else if (quality === 'guard' && battle.mods.thorns) {
      battle.hp = Math.max(0, battle.hp - 1);
      log('THORNS! THE GUARD BITES BACK FOR 1.');
      pop('THORNS 1', 'counter');
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
    if (battlePlayer) { battle.pose = 'victory'; battle.poseAt = Date.now(); }
    log('VICTORY!');
    sound('win');
    clearBattleFeedback();
    grantXp(Math.round(battle.def.xp * (battle.mods.hard ? 1.5 : 1)));
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
    clearBattleFeedback();
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
    /* === NEW: IN-WORLD BATTLE CAMERA === keep the last battle shot so the
       camera can tween back rather than cut, and keep the stage bookkeeping. */
    var lastShot = battle && battle.stage ? battle.stage.last : null;
    var stageInfo = battle && battle.stage ? battle.stage : null;
    /* === NEW: remember a boss win so the victory scene can play first === */
    var bossVictoryOpts = won && options && options.bossVictory ? options : null;
    battle = null;
    clearBattleFeedback();
    hideBattle();
    view = 'world';
    mode = 'world';
    var chapter = CHAPTERS[clamp(save.chapter, 0, 4)];
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       Take the fighters and their shadows back out of the live scene and
       unhide every NPC/prop the fight cleared. */
    if (stageInfo && world) {
      stageInfo.extras.forEach(function (obj) {
        var at = world.objects.indexOf(obj);
        if (at >= 0) world.objects.splice(at, 1);
      });
      stageInfo.hidden.forEach(function (obj) { obj.hidden = false; });
      stageInfo.hiddenActors.forEach(function (entry) {
        entry.actor.hidden = entry.hidden;
        updateActor(entry.actor);
      });
      battleObjects = [];
    }
    renderer.setScene({ objects: world.objects, fogColor: chapter.fog, fogNear: 22, fogFar: 70, skyColor: chapterTint(chapter).sky });
    app.dataset.theme = chapter.theme;
    ui.hud.hidden = false;
    ui.objective.hidden = false;
    ui.touch.hidden = false;
    updateHud();
    updateObjective();
    /* === NEW: IN-WORLD BATTLE CAMERA ===
       Tween from the battle shot back to the player's exploration angle over
       350ms; updateCamera() drives the blend. */
    if (lastShot && player) {
      snapCamera();
      camera.ret = { from: lastShot, t: 0, dur: BATTLE_CAM_TWEEN };
      renderer.setCamera(lastShot.eye, lastShot.target, lastShot.fov || 55 * Math.PI / 180, lastShot.ortho);
    } else {
      snapCamera();
    }
    persist();
    if (bossVictoryOpts) { playBossVictory(bossVictoryOpts); return; }
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
    /* === BP CHOICE IS REAL UNTIL THE CAP, THEN DISABLED === */
    var bpMaxed = save.bp >= BP_MAX;
    ui.lvBp.textContent = bpMaxed ? 'MAXED AT ' + BP_MAX : save.bp + ' → ' + Math.min(BP_MAX, save.bp + 1);
    var bpOption = document.querySelector('.ff-level-option.bp');
    if (bpOption) {
      bpOption.disabled = bpMaxed;
      bpOption.classList.toggle('maxed', bpMaxed);
      bpOption.setAttribute('aria-disabled', bpMaxed ? 'true' : 'false');
    }
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
      /* === BP stays inside the 4 BP card budget === */
      if (save.bp >= BP_MAX) return;
      save.bp = Math.min(BP_MAX, save.bp + 1);
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

  /* === NEW: PAUSING A FIGHT ===
     A pause only opens while the fight is waiting on the player. Freezing a
     guard or strike window would let its clock run out behind the panel, so
     the request is answered with a nudge instead. Resuming returns to the
     same action menu; quitting steps back into the world and keeps the
     damage already taken. */
  function pauseBattle() {
    if (!battle || battle.ended || mode !== 'battle') return;
    if (battle.state !== 'menu') { toast('WAIT FOR YOUR TURN TO PAUSE.'); return; }
    mode = 'battlepause';
    if (ui.battlePauseCopy) ui.battlePauseCopy.textContent = battle.def.name + ' · TURN ' + battle.turn + ' · HP ' + Math.max(0, Math.ceil(battle.displayHp)) + ' / ' + save.maxHp;
    ui.battlePause.hidden = false;
    sound('click');
  }

  function resumeBattle() {
    if (mode !== 'battlepause') return;
    mode = 'battle';
    ui.battlePause.hidden = true;
    sound('click');
  }

  /* === NEW: a quit has to leave you standing in the world, not be undone by
     the next frame. Auto encounters grab the player inside 1.3 units, and the
     cooldown from the fight that just ended has usually run out by the time
     you quit it, so the same shade would pull you straight back in. Holding
     the nearby ones gives you a moment to step away; walking into one or
     pressing E still starts the fight again. */
  function holdNearbyEncounters() {
    if (!world || !player) return;
    for (var i = 0; i < world.interactables.length; i++) {
      var item = world.interactables[i];
      if (!item.auto || item.disabled) continue;
      if (Math.hypot(player.x - item.x, player.z - item.z) < 3) item.cooldown = Date.now() + 2600;
    }
  }

  function quitBattle() {
    if (mode !== 'battlepause' || !battle || battle.ended) return;
    if (!window.confirm('Quit this battle? You keep the damage you have taken.')) return;
    holdNearbyEncounters();
    resumeBattle();
    battle.ended = true;
    battle.busy = true;
    setBattleButtons(false);
    log('YOU STEP BACK OUT OF THE FIGHT.');
    setTimeout(function () { finishBattle(false); }, 420);
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
    try { localStorage.removeItem(SLOT_KEYS[activeSlot] || SAVE_KEY); } catch (error) { /* ignore */ }
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
    if (!ui.sound) return;
    ui.sound.classList.toggle('muted', muted);
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
      /* === NEW: ESC / M pauses the fight while it waits on the player === */
      if (event.code === 'Escape' || event.code === 'KeyM') { event.preventDefault(); pauseBattle(); return; }
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
    /* === NEW: the battle pause panel owns the keyboard while it is open === */
    if (mode === 'battlepause') {
      if (event.code === 'Escape' || event.code === 'KeyM' || event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); resumeBattle(); }
      return;
    }
    if (event.code === 'KeyE' || event.code === 'Space' || event.code === 'Enter') {
      if (mode === 'cutscene') { event.preventDefault(); advanceCutscene(); return; }
      if (mode === 'world' || mode === 'dialogue') { event.preventDefault(); interact(); }
      return;
    }
    /* === NEW: [ESC] jumps a seen cutscene straight back to battle === */
    if (event.code === 'Escape' && mode === 'cutscene') {
      event.preventDefault();
      skipCutscene();
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
    if (battle && battle.window && battle.window.charge &&
      (event.code === 'KeyE' || event.code === 'Space' || event.code === 'Enter')) {
      chargeRelease();
    }
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
    if (ui.startPrompt) ui.startPrompt.addEventListener('click', openFileSelect);
    if (ui.fileBack) ui.fileBack.addEventListener('click', closeFileSelect);
    bindFileGrid();
    if (ui.nameStart) ui.nameStart.addEventListener('click', beginNewStory);
    ui.cutNext.addEventListener('click', advanceCutscene);
    ui.cutSkip.addEventListener('click', skipCutscene);
    /* === NEW: hero selector before the game starts === */
    var genderButtons = document.querySelectorAll('[data-gender]');
    for (var gi = 0; gi < genderButtons.length; gi++) {
      genderButtons[gi].addEventListener('click', function (event) {
        setGender(event.currentTarget.dataset.gender);
      });
    }
    ui.skills.addEventListener('pointerleave', function () {
      if (battle) battle.sheetPreview = null;
    });
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
    if (ui.endedResume) ui.endedResume.addEventListener('click', resumeEndedRun);
    if (ui.endedFiles) ui.endedFiles.addEventListener('click', backToFiles);
    if (ui.endedRenew) ui.endedRenew.addEventListener('click', renewClosedFile);
    if (ui.battlePauseOpen) ui.battlePauseOpen.addEventListener('click', pauseBattle);
    if (ui.battlePauseResume) ui.battlePauseResume.addEventListener('click', resumeBattle);
    if (ui.battlePauseQuit) ui.battlePauseQuit.addEventListener('click', quitBattle);
    ui.action.addEventListener('click', interact);
    ui.timing.addEventListener('click', timingPress);
    ui.timingButton.addEventListener('click', function (event) { event.stopPropagation(); timingPress(); });
    ui.timing.addEventListener('pointerup', function () {
      if (battle && battle.window && battle.window.charge) chargeRelease();
    });
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
    /* === NEW: load the combined hero sheet + paint the selector state === */
    selectedGender = save && save.gender === 'girl' ? 'girl' : 'boy';
    updateGenderButtons();
    loadActionSheet();
    buildSheetDebug();
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
      pose: function () {
        if (!battle) return null;
        return {
          pose: battle.pose, windup: battle.windup, hp: battle.hp,
          x: battlePlayer && Math.round(battlePlayer.x * 100) / 100,
          lean: battlePlayer && Math.round((battlePlayer.lean || 0) * 100) / 100,
          squashX: battlePlayer && Math.round((battlePlayer.squashX || 1) * 100) / 100,
          squashY: battlePlayer && Math.round((battlePlayer.squashY || 1) * 100) / 100
        };
      },
      /* === NEW: IN-WORLD BATTLE CAMERA === read the staged shot for testing */
      stage: function () {
        if (!battle || !battle.stage) return null;
        var st = battle.stage;
        return {
          t: st.t, center: st.center, axis: st.axis,
          eye: st.last ? st.last.eye : null, ortho: st.last ? st.last.ortho : null,
          hero: battlePlayer ? [battlePlayer.x, battlePlayer.z] : null,
          foe: battleEnemy ? [battleEnemy.x, battleEnemy.z] : null,
          shadows: st.shadows.length, hiddenProps: st.hidden.length, hiddenActors: st.hiddenActors.length,
          heroY: battlePlayer ? battlePlayer.y : null, heroScale: battlePlayer ? battlePlayer.scale : null,
          heroHidden: battlePlayer ? !!battlePlayer.hidden : null,
          heroSprite: battlePlayer ? (battlePlayer.spriteObj ? { hidden: !!battlePlayer.spriteObj.hidden, alpha: battlePlayer.spriteObj.alpha, size: battlePlayer.spriteObj.size } : null) : null,
          heroAtlas: battlePlayer ? !!battlePlayer.spriteObj : null,
          extras: st.extras.length
        };
      },
      /* === NEW: CHARACTER FACTORY === roster + spawners for testing */
      roster: function () { return Object.keys(FROSTFALL_ROSTER); },
      character: function (id) { return createFrostfallCharacter(id); },
      spawn: function (id, x, z) { return spawnOverworldNPC(id, x, z); },
      spawnEnemy: function (id, opts) { return spawnBattleEnemy(id, opts); },
      /* === NEW: IN-WORLD BATTLE CAMERA === camera + scene probe for testing */
      cam: function () {
        return {
          eye: camera.eye.slice(), target: camera.target.slice(), ortho: camera.ortho,
          ret: camera.ret ? camera.ret.t : null,
          mode: mode, view: view,
          objects: world ? world.objects.length : 0,
          hidden: world ? world.objects.filter(function (o) { return o.hidden; }).length : 0
        };
      },
      phase: function () { return phaseAt(); },
      state: function () {
        if (!battle) return null;
        return {
          state: battle.state, hp: battle.hp, displayHp: battle.displayHp, hpSave: save.hp,
          mortal: battle.mortal, revived: battle.revived, extraTurns: battle.extraTurns,
          soften: battle.soften, burn: battle.burn ? battle.burn.turns : 0, mods: battle.mods,
          window: battle.window ? {
            type: battle.window.type, guard: battle.window.guard, superguard: battle.window.superguard,
            charge: !!battle.window.charge, mash: !!battle.window.mash, armed: !!battle.window.armed,
            quality: battle.window.quality, presses: battle.window.presses || 0,
            startAt: battle.window.startAt, perfectAt: battle.window.perfectAt, closeAt: battle.window.closeAt
          } : null,
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
      move: function (id) {
        var skill = null;
        for (var i = 0; i < SKILLS.length; i++) if (SKILLS[i].id === id) skill = SKILLS[i];
        if (skill) castSkill(skill);
        return !!skill;
      },
      setSp: function (n) { if (save) { save.sp = clamp(n, 0, save.maxSp); updateBattleUI(); } },
      release: function () { chargeRelease(); },
      equip: function (ids) {
        if (!save) return false;
        save.cards = (ids || []).slice(0, 8);
        save.hp = Math.min(save.hp, save.maxHp);
        persist();
        renderCards();
        updateHud();
        return true;
      },
      drawCalls: function () { return renderer && renderer.stats ? renderer.stats() : null; },
      models: function () {
        var placed = 0, drawn = 0;
        if (world) {
          for (var i = 0; i < world.objects.length; i++) {
            if (!world.objects[i].pendingModel) continue;
            placed += 1;
            if (world.objects[i].mesh) drawn += 1;
          }
        }
        return { loaded: Object.keys(modelGeo).length, of: MODEL_NAMES.length, texture: !!modelTexture, program: renderer.hasMesh(), placed: placed, drawn: drawn };
      },
      heroArt: function () {
        var art = castAtlas(HERO_CHAR, 4);
        if (!art) return null;
        var sheet = document.createElement('canvas');
        sheet.width = art.width;
        sheet.height = art.height;
        var ctx = sheet.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#262834';
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.drawImage(art, 0, 0);
        return sheet.toDataURL('image/png');
      },
      castSheet: function () {
        var cols = 10;
        var size = SPRITE_CELL;
        var rows = Math.ceil(CAST_ROSTER.length / cols);
        var sheet = document.createElement('canvas');
        sheet.width = cols * size;
        sheet.height = rows * size;
        var ctx = sheet.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#262834';
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        for (var i = 0; i < CAST_ROSTER.length; i++) {
          var art = castAtlas(CAST_ROSTER[i], 1);
          if (!art) continue;
          ctx.drawImage(art, 0, 0, size, size, (i % cols) * size, Math.floor(i / cols) * size, size, size);
        }
        return sheet.toDataURL('image/png');
      },
      cast: function () {
        return {
          atlas: heroSheet.canvas ? heroSheet.canvas.width + 'x' + heroSheet.canvas.height : 'none',
          roster: CAST_ROSTER.length,
          actors: (world ? world.actors : []).map(function (a) {
            return {
              kind: a.kind,
              x: Math.round(a.x * 10) / 10,
              z: Math.round(a.z * 10) / 10,
              rows: a.castRows || 0,
              img: a.spriteObj && a.spriteObj.sprite.image ? a.spriteObj.sprite.image.width : 0,
              frame: a.frame,
              hidden: !!a.hidden
            };
          })
        };
      },
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
      hit: function () { if (battle && !battle.ended) resolveEnemyHit('standard', null); },
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
