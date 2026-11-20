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
    hudHpRow: $('ff-hud-hp-row'),
    sound: $('ff-sound'), menuButton: $('ff-menu-button'), battleFace: $('ff-battle-face'),
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
    { id: 'dynamite', name: 'DYNAMITE', cat: 'EXPLOSIVE', cost: 4, level: 1, cmd: 'mash', mult: 1.9, desc: 'Mash for power. Splash and Burn 2.' },
    { id: 'cure', name: 'CURE', cat: 'SUPPORT', cost: 3, level: 1, cmd: 'cure', mult: 0, desc: 'Timed press. 5 HP, 7 HP on PERFECT.' }
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

  function house(x, z, w, d, h, wall, roof) {
    box(x, h / 2, z, w, h, d, wall);
    box(x, h, z, w * 0.84, h * 0.58, d * 0.84, roof, { geo: 'cone4', ry: Math.PI / 4 });
    box(x - w * 0.28, h * 0.62, z + d / 2 + 0.06, 0.7, 0.7, 0.08, 0xffd77a);
    box(x + w * 0.28, h * 0.62, z + d / 2 + 0.06, 0.7, 0.7, 0.08, 0xffd77a);
    box(x, h * 0.17, z + d / 2 + 0.07, 0.9, h * 0.34, 0.12, 0x3a2a20);
    box(x + w * 0.22, h + h * 0.42, z - d * 0.2, 0.5, 1.2, 0.5, 0x4a3a32);
    world.colliders.push({ x: x, z: z, hw: w / 2, hd: d / 2 });
  }

  function lamp(x, z, tint) {
    modelProp('lantern', x, z, { s: 1.85, ry: Math.PI / 4, color: tint });
    box(x, 2.78, z, 0.5, 0.5, 0.5, 0xffe9a0, { geo: 'cylinder', alpha: 0.6 });
    box(x, 2.78, z, 1.4, 1.4, 1.4, 0xffd76a, { geo: 'cylinder', alpha: 0.12 });
  }

  var PINES = ['tree-snow-a', 'tree-snow-b', 'tree-snow-c'];
  function tree(x, z, s, tint) {
    s = s || 1;
    var pick = PINES[Math.abs(Math.round(x * 3 + z * 5)) % PINES.length];
    modelProp(pick, x, z, { s: 2.15 * s, ry: (x * 0.7 + z * 1.1) % 6.283, color: tint });
    world.colliders.push({ x: x, z: z, hw: 0.42 * s, hd: 0.42 * s });
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
      'ROADTOWN · POP. 214 · RELICS 0 · SNOW 6 FT.',
      'Someone crossed out WELCOME and wrote PLEASE CLOSE THE SKY.',
      'Under that, in pencil: "also the portal is still on. we can hear it."'
    ], 3);
    fountain(0, -4);
    inspect(0, -4, 'FOUNTAIN', [
      'The fountain is frozen mid-splash. It looks personally offended.',
      'A little plaque reads NO SKATING. It is covered in skate marks and one set of claw marks.'
    ], 2.6);
    inspect(10.5, 2, 'GENERAL STORE', [
      'A hand-painted sign: GENERAL STORE · OPEN · PROBABLY.',
      'The door is locked. A note says GONE TO FROSTFEST 2010. BACK IN 16 YEARS.'
    ], 2.8);
    lamp(-3.6, 2.5); lamp(3.6, -1.5); lamp(-3.6, -10); lamp(3.6, 8);
    tree(-16, 8, 1.1); tree(16, 6, 1.0); tree(-17, -16, 1.2); tree(17, -18, 1.1);
    tree(-6.5, -19, 0.9); tree(7, -20, 1.0);
    snowPile(-7, 10, 1); snowPile(7, -13, 0.9); snowPile(13, 12, 1.1);
    snowPile(-14, 14, 0.8); snowPile(5, -16, 0.7);
    bench(-2.4, 1.6, -0.55); bench(2.4, -6.4, 2.55);
    snowman(-7.6, 6.4, 1);
    presents(9.2, 4.8);
    candyCane(-3.0, 4.6); candyCane(3.0, 1.2); candyCane(-3.0, -3.4); candyCane(3.0, -8.4);
    sled(-13.4, 6.6, 0.45);
    wreathOn(10.5, 2.0, 4.56, 0);
    wreathOn(-10.5, 2.4, 6.06, 0);
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
      theme: 'day', fog: [0.78, 0.87, 0.96], spawn: [0.9, 12],
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
      { who: 'NARRATOR', text: 'Frostfest 2010. You clicked the glowing event portal. It clicked back.' },
      { who: 'NARRATOR', face: 'shard', text: 'Then it sneezed, and dropped you out of a chimney into a snowed-in server called Roadtown.', cue: 'soft' },
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

  function buildWorld(index) {
    if (!save) return;
    index = clamp(index, 0, CHAPTERS.length - 1);
    save.chapter = index;
    var chapter = CHAPTERS[index];
    if (world && world.geometries && renderer) {
      world.geometries.forEach(function (geo) { renderer.releaseGeometry(geo); });
    }
    world = { objects: [], colliders: [], interactables: [], actors: [], geometries: [], chapter: index, theme: chapter.theme, spawn: chapter.spawn.slice() };
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
    var art = castAtlas(HERO_CHAR, 1);
    if (art) {
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
    var mods = { maxHp: 0, attack: 0, guardMs: 0, revive: false, agility: 0, skillDiscount: 0, narrow: 0, incoming: 0, bonus: 0, regenHp: 0, regenSp: 0, thorns: false, hard: false };
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
    if (battle) battle.fit = battleFit;
    renderer.setCamera([0, 3.3, 12.2], [0, -0.2, 0.9], 52 * Math.PI / 180, battleFit);
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
    battleEnemy.y = battleEnemy.baseY * battleEnemy.scale + Math.sin(st * 1.9) * 0.1;
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
    battlePlayer.frame = bframe;
    if (battle.lunge > 0) battle.lunge = Math.max(0, battle.lunge - dt * 4);
    battleEnemy.tiltX = battle.windup ? -0.26 : battle.lunge > 0 ? 0.34 : 0;
    battleEnemy.squashY = battle.windup ? 0.9 : 1;
    battleEnemy.squashX = battle.windup ? 1.1 : 1;
    battleEnemy.lean = battle.lunge > 0 ? 0.28 : 0;
    /* A two-frame shoulder shake while the telegraph is up. */
    if (battle.windup) battleEnemy.x += Math.floor(time * 24) % 2 ? 0.05 : -0.05;
    updateActor(battlePlayer);
    updateActor(battleEnemy);
    /* Battle camera: push in on windups, snap wide on the hit, plus the same
       punch kick the overworld uses. */
    camera.punch = Math.max(0, camera.punch - dt * 26);
    var kick = punchOffset();
    var push = battle.pose === 'strike' ? 1.6 : battle.windup ? 1 : 0;
    renderer.setCamera(
      [kick[0], 3.3 + kick[1] - push * 0.12, 12.2 - push * 0.5],
      [0, -0.2, 0.9],
      52 * Math.PI / 180,
      (battle.fit || 14.5) * (1 - push * 0.022)
    );

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
      def: def, hp: def.hp, max: def.hp, displayHp: Math.max(1, save.hp),
      busy: false, ended: false, turn: 1, opts: opts, anim: { p: 0, e: 0 },
      state: 'intro', telegraph: 'standard', extraTurns: opts.advantage === 'player' ? 1 : 0,
      revived: false, mortal: false, mods: cardMods(), window: null, windowTimer: null, raged: false,
      gimmick: bossGimmick(def), windup: 0, lunge: 0, echo: false, stunned: false,
      soften: 0, burn: null,
      pose: 'idle', poseAt: 0, fit: 14.5
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

  function beginPlayerMove(move) {
    if (!battle || battle.ended || battle.state !== 'menu') return;
    battle.state = 'strike';
    battle.busy = true;
    battle.move = move;
    setBattleButtons(false);
    ui.skills.hidden = true;
    if (move.cmd === 'chain') { beginChainWindow(move, 0); return; }
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
    showTiming('strike', index === 0 ? move.name + '!' : 'BOUNCE ' + (index + 1) + '!');
    ui.timingNote.textContent = 'PRESS ON EVERY BOUNCE · ' + (4 - index) + ' LEFT';
  }

  function moveMultiplier(quality) {
    return quality === 'perfect' ? 1.5 : quality === 'good' ? 1 : 0.65;
  }

  function moveDamage(move, quality) {
    var mods = battle.mods;
    var flat = (quality === 'perfect' || quality === 'good') ? mods.bonus : 0;
    var soften = battle.soften > 0 ? 1 : 0;
    var base = (3 + save.level + mods.attack) * (move.mult || 1);
    return Math.max(1, Math.round(base * moveMultiplier(quality) + flat + soften));
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
    var bounce = { kind: 'skill', name: move.name, mult: 0.4 + index * 0.2 };
    var result = hitEnemy(bounce, quality, {});
    battle.anim.p = 1;
    battle.pose = 'strike';
    battle.poseAt = Date.now();
    sound('hit');
    shake();
    if (quality === 'perfect') cameraPunch(0.24);
    pop(String(result.damage), quality === 'perfect' ? 'perfect' : quality === 'good' ? 'nice' : 'weak');
    log('BOUNCE ' + (index + 1) + '/4 · ' + result.damage + ' DAMAGE.' + (quality === 'perfect' ? ' PERFECT!' : '') + (result.note ? ' ' + result.note : ''));
    updateBattleUI();
    if (battle.hp <= 0) { winBattle(); return; }
    var endChain = quality === 'miss' || index >= 3;
    setTimeout(function () {
      if (!battle || battle.ended) return;
      if (endChain) { flashEnemy(); playerTurnDone(); }
      else beginChainWindow(move, index + 1);
    }, endChain ? 560 : 220);
  }

  function resolveCure(move, quality) {
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
      button.innerHTML = '<b>' + skill.name + '</b><small>' + (unlocked ? skill.cat + ' · ' + cost + ' SP' : 'UNLOCKS AT LV ' + skill.level) + '</small><em>' + (unlocked ? skill.desc : '') + '</em>';
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
    battle = null;
    clearBattleFeedback();
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
