/*
 * BSMS Web — Frostfall: Hold the Line
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * A low-poly tower defense. Build lantern towers on the stone pads, chill the
 * Hollow King's horde and keep the last light burning for ten waves. The world
 * is drawn with the tiny WebGL renderer in js/frostfall-engine.js; everything
 * else — waves, towers, projectiles and the HUD — lives here.
 *
 * === NEW: TOWER DEFENSE === the five-chapter RPG has been replaced entirely.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rgb = function (hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; };
  var TAU = Math.PI * 2;

  var FF = window.FFEngine;
  var mat = FF ? FF.mat : null;

  /* ---------------------------------------------------------------- tuning */
  var START_GOLD = 140;
  var START_LIVES = 12;
  var TOTAL_WAVES = 10;
  var SELL_RATE = 0.7;
  var HP_GROWTH = 0.16;

  var C = {
    sky: rgb(0xbcd8ee),
    white: rgb(0xffffff),
    snow: rgb(0xd3e2f0),
    snow2: rgb(0xc6d8e9),
    pathA: rgb(0x74899e),
    pathB: rgb(0x6b7f95),
    pathDark: rgb(0x4e6074),
    pad: rgb(0x8b7f70),
    padHover: rgb(0xab9d8b),
    padHot: rgb(0xf0bd55),
    padBuilt: rgb(0x6f6559),
    padRim: rgb(0x554b41),
    stone: rgb(0x7c90a8),
    stoneRim: rgb(0x5b6f86),
    stoneDark: rgb(0x44576b),
    trim: rgb(0xc99a3a),
    shadow: rgb(0x243149),
    treeA: rgb(0x2f6b57),
    treeB: rgb(0x3d8567),
    treeC: rgb(0x275846),
    trunk: rgb(0x6b4a33),
    lantern: rgb(0xffd774),
    lanternGlow: rgb(0xffe9a8),
    lanternFrame: rgb(0x5c4a7a),
    gold: rgb(0xffc247),
    orange: rgb(0xff8a2b),
    purple: rgb(0x6c4fa8),
    purpleDark: rgb(0x3a2a5f),
    cyan: rgb(0x7ce7ff),
    cyanDark: rgb(0x2a7f99),
    frost: rgb(0xbfe9ff),
    red: rgb(0xff5c74),
    eye: rgb(0xffef9a),
    imp: rgb(0xb0d6ff),
    impDark: rgb(0x74a4d8),
    wisp: rgb(0x54cdfb),
    wispGlow: rgb(0x1fa8df),
    brute: rgb(0x6c8fc7),
    bruteDark: rgb(0x45628e),
    bruteEye: rgb(0xff6248),
    boss: rgb(0x58407f),
    bossDark: rgb(0x342450),
    bossGold: rgb(0xffcf63),
    bossEye: rgb(0xff6b8a)
  };

  /* ---------------------------------------------------------------- map */
  var PATH_POINTS = [[-16, -13], [12, -13], [12, -3], [-12, -3], [-12, 7], [8, 7], [8, 12.5]];
  var LANTERN = [8, 13.6];
  var PADS = [
    [-16, -9], [-8, -9], [0, -9], [8, -9], [16, -9],
    [-18, 2], [-10, 2], [-2, 2], [6, 2], [14, 2], [18, 2],
    [-6, 11], [1, 11], [13, 11], [-18, 8], [2, 4]
  ];

  var pathSegs = [];
  var pathLength = 0;
  (function () {
    for (var i = 0; i < PATH_POINTS.length - 1; i++) {
      var a = PATH_POINTS[i], b = PATH_POINTS[i + 1];
      var dx = b[0] - a[0], dz = b[1] - a[1];
      var len = Math.hypot(dx, dz) || 1;
      pathSegs.push({ ax: a[0], az: a[1], dx: dx / len, dz: dz / len, len: len, start: pathLength });
      pathLength += len;
    }
  })();

  function samplePath(d) {
    var s, i, t;
    if (d <= 0) { s = pathSegs[0]; return { x: s.ax, z: s.az, dx: s.dx, dz: s.dz }; }
    for (i = 0; i < pathSegs.length; i++) {
      s = pathSegs[i];
      if (d <= s.start + s.len || i === pathSegs.length - 1) {
        t = clamp(d - s.start, 0, s.len);
        return { x: s.ax + s.dx * t, z: s.az + s.dz * t, dx: s.dx, dz: s.dz };
      }
    }
    s = pathSegs[pathSegs.length - 1];
    return { x: s.ax + s.dx * s.len, z: s.az + s.dz * s.len, dx: s.dx, dz: s.dz };
  }

  function distToPath(x, z) {
    var best = Infinity;
    for (var i = 0; i < pathSegs.length; i++) {
      var s = pathSegs[i];
      var px = x - s.ax, pz = z - s.az;
      var t = clamp(px * s.dx + pz * s.dz, 0, s.len);
      var dx = px - s.dx * t, dz = pz - s.dz * t;
      best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  }

  function distToPad(x, z) {
    var best = Infinity;
    for (var i = 0; i < PADS.length; i++) {
      var dx = x - PADS[i][0], dz = z - PADS[i][1];
      best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
    }
    return best;
  }

  /* ---------------------------------------------------------------- enemies */
  var ENEMIES = {
    imp: { name: 'SNOW IMP', hp: 30, speed: 2.4, reward: 6, life: 1, armor: 0, barY: 2.2, barW: 30 },
    wisp: { name: 'WISP', hp: 20, speed: 3.9, reward: 5, life: 1, armor: 0, barY: 2.15, barW: 24 },
    brute: { name: 'FROST BRUTE', hp: 105, speed: 1.5, reward: 14, life: 2, armor: 1, barY: 3.5, barW: 48 },
    boss: { name: 'THE HOLLOW KING', hp: 5600, speed: 1.9, reward: 150, life: 12, armor: 4, barY: 4.8, barW: 100 }
  };
  var PLURAL = { imp: 'IMPS', wisp: 'WISPS', brute: 'BRUTES', boss: 'THE KING' };

  var TOWERS = {
    lantern: {
      name: 'LANTERN', blurb: 'FAST · SINGLE TARGET', key: '1', cost: [60, 55, 95],
      levels: [
        { dmg: 12, rate: 1.5, range: 9.0 },
        { dmg: 19, rate: 1.75, range: 9.5 },
        { dmg: 30, rate: 2.0, range: 10.0 }
      ]
    },
    mortar: {
      name: 'MORTAR', blurb: 'SPLASH · SLOW SHELLS', key: '2', cost: [90, 80, 130],
      levels: [
        { dmg: 28, rate: 0.6, range: 8.6, splash: 2.2 },
        { dmg: 46, rate: 0.7, range: 9.1, splash: 2.5 },
        { dmg: 72, rate: 0.85, range: 9.6, splash: 2.8 }
      ]
    },
    spire: {
      name: 'FROST SPIRE', blurb: 'CHILLS · SLOWS THE HORDE', key: '3', cost: [75, 65, 110],
      levels: [
        { dmg: 8, rate: 1.15, range: 8.6, slow: 0.42 },
        { dmg: 13, rate: 1.25, range: 9.1, slow: 0.52 },
        { dmg: 20, rate: 1.4, range: 9.6, slow: 0.62 }
      ]
    }
  };
  var TOWER_ORDER = ['lantern', 'mortar', 'spire'];

  var WAVES = [
    { name: 'FIRST SNOW', groups: [{ type: 'imp', count: 8, gap: 1.0 }] },
    { name: 'BITING WIND', groups: [{ type: 'imp', count: 10, gap: 0.8 }, { type: 'wisp', count: 4, gap: 1.4, delay: 5 }] },
    { name: 'THE PACK', groups: [{ type: 'imp', count: 10, gap: 0.7 }, { type: 'wisp', count: 8, gap: 0.7, delay: 4 }, { type: 'brute', count: 2, gap: 3, delay: 9 }] },
    { name: 'DEEP FREEZE', groups: [{ type: 'wisp', count: 12, gap: 0.6 }, { type: 'brute', count: 4, gap: 2.4, delay: 3 }] },
    { name: 'HALFWAY STORM', groups: [{ type: 'imp', count: 14, gap: 0.55 }, { type: 'wisp', count: 8, gap: 0.7, delay: 3 }, { type: 'brute', count: 4, gap: 2.5, delay: 7 }] },
    { name: 'IRON WINTER', groups: [{ type: 'brute', count: 8, gap: 2.0 }, { type: 'imp', count: 10, gap: 0.6, delay: 4 }, { type: 'wisp', count: 6, gap: 0.9, delay: 12 }] },
    { name: 'WHITEOUT', groups: [{ type: 'wisp', count: 20, gap: 0.45 }, { type: 'imp', count: 10, gap: 0.7, delay: 4 }, { type: 'brute', count: 4, gap: 2.2, delay: 10 }] },
    { name: 'THE LONG NIGHT', groups: [{ type: 'brute', count: 10, gap: 1.6 }, { type: 'wisp', count: 12, gap: 0.5, delay: 3 }, { type: 'imp', count: 12, gap: 0.5, delay: 7 }] },
    { name: 'LAST LIGHT', groups: [{ type: 'brute', count: 12, gap: 1.5 }, { type: 'wisp', count: 16, gap: 0.45, delay: 2 }, { type: 'imp', count: 12, gap: 0.5, delay: 6 }] },
    {
      name: 'THE HOLLOW KING',
      groups: [
        { type: 'imp', count: 10, gap: 0.6 },
        { type: 'boss', count: 1, gap: 1, delay: 2 },
        { type: 'wisp', count: 8, gap: 0.6, delay: 6 },
        { type: 'brute', count: 4, gap: 2, delay: 10 }
      ]
    }
  ];

  var ICONS = {
    lantern: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="11" y="3" width="10" height="3" fill="#ffc247"/><path d="M9 8h14l-2 4H11z" fill="#8a6b3a"/><rect x="10" y="12" width="12" height="13" fill="#ffd774" stroke="#0d0718" stroke-width="2"/><rect x="13" y="15" width="6" height="7" fill="#fff7c9"/><rect x="8" y="25" width="16" height="4" fill="#8a6b3a" stroke="#0d0718" stroke-width="2"/></svg>',
    mortar: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="22" width="20" height="7" fill="#7b8fae" stroke="#0d0718" stroke-width="2"/><rect x="9" y="18" width="14" height="6" fill="#5d7392" stroke="#0d0718" stroke-width="2"/><rect x="15" y="6" width="8" height="16" rx="2" transform="rotate(24 19 15)" fill="#9fb6d6" stroke="#0d0718" stroke-width="2"/><rect x="18" y="4" width="4" height="3" fill="#ffc247"/></svg>',
    spire: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="9" y="22" width="14" height="7" fill="#7b8fae" stroke="#0d0718" stroke-width="2"/><rect x="12" y="15" width="8" height="8" fill="#5d7392" stroke="#0d0718" stroke-width="2"/><path d="M16 3l6 8-6 5-6-5z" fill="#9fe6ff" stroke="#0d0718" stroke-width="2"/></svg>'
  };

  /* ---------------------------------------------------------------- DOM */
  var ui = {};
  var pips = [];
  var coarsePointer = false;
  try {
    coarsePointer = window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
  } catch (error) { coarsePointer = false; }

  function cacheDom() {
    ui.stage = $('ff-stage');
    ui.canvas = $('ff-canvas');
    ui.fx = $('ff-fx');
    ui.flash = $('ff-flash');
    ui.banner = $('ff-banner');
    ui.bannerTitle = $('ff-banner-title');
    ui.bannerSub = $('ff-banner-sub');
    ui.hud = $('ff-hud');
    ui.lives = $('ff-lives');
    ui.pips = $('ff-pips');
    ui.gold = $('ff-gold');
    ui.wave = $('ff-wave');
    ui.speed = $('ff-speed');
    ui.pauseButton = $('ff-pause');
    ui.boss = $('ff-boss');
    ui.bossFill = $('ff-boss-fill');
    ui.hint = $('ff-hint');
    ui.hintText = $('ff-hint-text');
    ui.shop = $('ff-shop');
    ui.shopTitle = $('ff-shop-title');
    ui.shopSub = $('ff-shop-sub');
    ui.shopCards = $('ff-shop-cards');
    ui.shopActions = $('ff-shop-actions');
    ui.upgrade = $('ff-upgrade');
    ui.sell = $('ff-sell');
    ui.shopClose = $('ff-shop-close');
    ui.send = $('ff-send');
    ui.sendKicker = $('ff-send-kicker');
    ui.sendLabel = $('ff-send-label');
    ui.title = $('ff-title');
    ui.start = $('ff-start');
    ui.pauseScreen = $('ff-pause-screen');
    ui.resume = $('ff-resume');
    ui.pauseRestart = $('ff-pause-restart');
    ui.pauseTitle = $('ff-pause-title');
    ui.end = $('ff-end');
    ui.endEyebrow = $('ff-end-eyebrow');
    ui.endTitle = $('ff-end-title');
    ui.endCopy = $('ff-end-copy');
    ui.endStats = $('ff-end-stats');
    ui.again = $('ff-again');
    ui.fallback = $('ff-fallback');
    for (var i = 0; i < START_LIVES; i++) {
      var pip = document.createElement('i');
      ui.pips.appendChild(pip);
      pips.push(pip);
    }
  }

  /* ---------------------------------------------------------------- renderer */
  var renderer = null;
  var fxCtx = null;
  var view = { w: 1, h: 1, dpr: 1 };
  var cam = { eye: [0, 28, 34], target: [0, 0, 0.5], ortho: 30 };
  var camRig = { x: 0, z: 0, zoom: 1 };
  var baseOrtho = 30;
  var userZoomed = false;
  var camProj = null;
  var camView = null;
  var staticObjects = [];
  var padObjects = [];

  function resize() {
    if (!renderer) return;
    var w = ui.stage.clientWidth || window.innerWidth;
    var h = ui.stage.clientHeight || window.innerHeight;
    view.w = w;
    view.h = h;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    ui.fx.width = Math.max(1, Math.floor(w * view.dpr));
    ui.fx.height = Math.max(1, Math.floor(h * view.dpr));
    ui.fx.style.width = w + 'px';
    ui.fx.style.height = h + 'px';
    fxCtx = ui.fx.getContext('2d');
    fxCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    if (!userZoomed && w / Math.max(1, h) < 0.75) camRig.zoom = 2.5;
    if (!userZoomed && w / Math.max(1, h) >= 0.75) camRig.zoom = 1;
    applyCamera();
    seedSnow();
  }

  function applyCamera() {
    if (!renderer) return;
    var aspect = view.w / Math.max(1, view.h);
    baseOrtho = Math.max(30, 52 / aspect);
    cam.ortho = baseOrtho / camRig.zoom;
    clampPan();
    var halfH = cam.ortho / 2;
    var halfW = halfH * aspect;
    cam.eye = [camRig.x, 28, 34 + camRig.z];
    cam.target = [camRig.x, 0, 0.5 + camRig.z];
    camProj = mat.ortho(-halfW, halfW, -halfH, halfH, 0.1, 220);
    camView = mat.lookAt(cam.eye, cam.target, [0, 1, 0]);
    renderer.setCamera(cam.eye, cam.target, 0, cam.ortho);
  }

  function clampPan() {
    var aspect = view.w / Math.max(1, view.h);
    var visibleW = cam.ortho * aspect;
    var visibleD = cam.ortho / 0.64;
    var maxX = Math.min(22, Math.max(0, (46 - visibleW) / 2));
    var maxZ = Math.min(12, Math.max(0, (34 - visibleD) / 2));
    camRig.x = clamp(camRig.x, -maxX, maxX);
    camRig.z = clamp(camRig.z, -maxZ, maxZ);
  }

  function project(x, y, z) {
    if (!camProj || !camView) return null;
    var vx = camView[0] * x + camView[4] * y + camView[8] * z + camView[12];
    var vy = camView[1] * x + camView[5] * y + camView[9] * z + camView[13];
    var vz = camView[2] * x + camView[6] * y + camView[10] * z + camView[14];
    var cw = camProj[3] * vx + camProj[7] * vy + camProj[11] * vz + camProj[15];
    if (cw <= 0.0001) return null;
    var cx = camProj[0] * vx + camProj[4] * vy + camProj[8] * vz + camProj[12];
    var cy = camProj[1] * vx + camProj[5] * vy + camProj[9] * vz + camProj[13];
    return { x: (cx / cw * 0.5 + 0.5) * view.w, y: (1 - (cy / cw * 0.5 + 0.5)) * view.h };
  }

  function addPart(list, geo, color, pos, size, opts) {
    var o = { geo: geo, color: color, model: mat.compose(pos, (opts && opts.rot) || [0, 0, 0], size) };
    if (opts) {
      if (opts.alpha !== undefined) o.alpha = opts.alpha;
      if (opts.pattern) { o.pattern = true; o.tile = opts.tile || 1; }
    }
    list.push(o);
    return o;
  }

  function addBatch(name, matrices, color) {
    if (!matrices.length) return;
    var geo = renderer.batchGeometry(name, matrices);
    if (!geo) return;
    staticObjects.push({ geo: geo, color: color, model: mat.identity() });
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------- world */
  function buildStaticWorld() {
    staticObjects.length = 0;

    addPart(staticObjects, 'cube', C.snow, [0, -0.9, 0.5], [84, 2, 84], { pattern: true, tile: 6 });

    /* Two layers of path: a dark curb under a lighter stone walk. */
    var tileA = [], tileB = [], curb = [];
    for (var s = 0; s < pathSegs.length; s++) {
      var seg = pathSegs[s];
      var yaw = Math.atan2(seg.dx, seg.dz);
      for (var d = 0; d < seg.len; d += 1) {
        var t = d + 0.5;
        var px = seg.ax + seg.dx * t;
        var pz = seg.az + seg.dz * t;
        curb.push(mat.compose([px, 0.02, pz], [0, yaw, 0], [2.75, 0.16, 1.35]));
        var m = mat.compose([px, 0.07, pz], [0, yaw, 0], [2.25, 0.16, 1.05]);
        ((d | 0) % 2 ? tileA : tileB).push(m);
      }
      for (var k = 0; k < 2; k++) {
        var corner = k === 0 ? PATH_POINTS[s] : PATH_POINTS[s + 1];
        curb.push(mat.compose([corner[0], 0.02, corner[1]], [0, yaw, 0], [2.75, 0.16, 2.75]));
        (s % 2 ? tileA : tileB).push(mat.compose([corner[0], 0.07, corner[1]], [0, yaw, 0], [2.25, 0.16, 2.25]));
      }
    }
    addBatch('cube', curb, C.pathDark);
    addBatch('cube', tileA, C.pathA);
    addBatch('cube', tileB, C.pathB);

    /* Trees, drifts and rocks are baked into a handful of draw calls. */
    var rnd = mulberry32(20261224);
    var conesA = [], conesB = [], conesC = [], trunks = [], drifts = [], rocks = [];
    for (var gx = -26; gx <= 26; gx += 3) {
      for (var gz = -19; gz <= 21; gz += 3) {
        var x = gx + (rnd() - 0.5) * 1.8;
        var z = gz + (rnd() - 0.5) * 1.8;
        var edge = Math.abs(x) > 19 || z < -14 || z > 17;
        if (rnd() > (edge ? 0.72 : 0.32)) continue;
        if (distToPath(x, z) < 5.2) continue;
        if (distToPad(x, z) < 5.0) continue;
        if (Math.hypot(x - LANTERN[0], z - LANTERN[1]) < 7) continue;
        if (Math.hypot(x - PATH_POINTS[0][0], z - PATH_POINTS[0][1]) < 5) continue;

        if (rnd() < 0.08) {
          drifts.push(mat.compose([x, 0, z], [0, rnd() * TAU, 0], [2.6 + rnd() * 1.4, 0.5 + rnd() * 0.35, 2.1 + rnd() * 1.2]));
          continue;
        }
        if (rnd() < 0.14) {
          rocks.push(mat.compose([x, 0.35, z], [0, rnd() * TAU, 0], [1.1 + rnd(), 0.8 + rnd() * 0.6, 0.9 + rnd() * 0.7]));
          continue;
        }
        var size = 0.72 + rnd() * 0.55;
        var ry = rnd() * TAU;
        trunks.push(mat.compose([x, 0, z], [0, ry, 0], [0.3 * size, 1.1 * size, 0.3 * size]));
        conesA.push(mat.compose([x, 0.8 * size, z], [0, ry, 0], [1.95 * size, 1.5 * size, 1.95 * size]));
        conesB.push(mat.compose([x, 1.55 * size, z], [0, ry + 0.4, 0], [1.45 * size, 1.3 * size, 1.45 * size]));
        conesC.push(mat.compose([x, 2.2 * size, z], [0, ry + 0.8, 0], [0.95 * size, 0.9 * size, 0.95 * size]));
      }
    }
    addBatch('cone6', conesA, C.treeA);
    addBatch('cone6', conesB, C.treeB);
    addBatch('cone6', conesC, C.white);
    addBatch('cylinder', trunks, C.trunk);
    addBatch('cone8', drifts, C.snow2);
    addBatch('cube', rocks, C.stoneRim);

    /* Stone pads. Their colours are swapped live, so they stay separate. */
    padObjects = PADS.map(function (p) {
      return {
        rim: { geo: 'cylinder', color: C.padRim, model: mat.compose([p[0], 0.02, p[1]], [0, 0, 0], [3.35, 0.16, 3.35]) },
        band: { geo: 'cylinder', color: C.trim, model: mat.compose([p[0], 0.13, p[1]], [0, 0, 0], [3.02, 0.1, 3.02]) },
        top: { geo: 'cylinder', color: C.pad, model: mat.compose([p[0], 0.24, p[1]], [0, 0, 0], [2.6, 0.3, 2.6]) }
      };
    });

    /* Spawn arch at the tree line. */
    var sx = PATH_POINTS[0][0], sz = PATH_POINTS[0][1];
    addPart(staticObjects, 'cube', C.purpleDark, [sx, 1.7, sz - 1.7], [0.55, 3.4, 0.55]);
    addPart(staticObjects, 'cube', C.purpleDark, [sx, 1.7, sz + 1.7], [0.55, 3.4, 0.55]);
    addPart(staticObjects, 'cube', C.purpleDark, [sx, 3.3, sz], [0.7, 0.5, 4.2]);
    addPart(staticObjects, 'cone4', C.cyan, [sx, 3.55, sz - 1.7], [0.42, 0.9, 0.42]);
    addPart(staticObjects, 'cone4', C.cyan, [sx, 3.55, sz + 1.7], [0.42, 0.9, 0.42]);
    addPart(staticObjects, 'cube', C.purple, [sx, 0.14, sz], [3.0, 0.1, 3.0], { alpha: 0.45 });

    /* The lantern that must survive. */
    var lx = LANTERN[0], lz = LANTERN[1];
    addPart(staticObjects, 'cylinder', C.stoneRim, [lx, 0.3, lz], [6.2, 0.6, 6.2]);
    addPart(staticObjects, 'cylinder', C.stoneDark, [lx, 0.66, lz], [4.4, 0.42, 4.4]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx - 1.7, 2.1, lz - 1.7], [0.4, 3.1, 0.4]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx + 1.7, 2.1, lz - 1.7], [0.4, 3.1, 0.4]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx - 1.7, 2.1, lz + 1.7], [0.4, 3.1, 0.4]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx + 1.7, 2.1, lz + 1.7], [0.4, 3.1, 0.4]);
    addPart(staticObjects, 'cube', C.snow, [lx - 1.7, 3.72, lz - 1.7], [0.62, 0.22, 0.62]);
    addPart(staticObjects, 'cube', C.snow, [lx + 1.7, 3.72, lz - 1.7], [0.62, 0.22, 0.62]);
    addPart(staticObjects, 'cube', C.snow, [lx - 1.7, 3.72, lz + 1.7], [0.62, 0.22, 0.62]);
    addPart(staticObjects, 'cube', C.snow, [lx + 1.7, 3.72, lz + 1.7], [0.62, 0.22, 0.62]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx, 3.55, lz - 1.7], [4.3, 0.34, 0.34]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx, 3.55, lz + 1.7], [4.3, 0.34, 0.34]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx - 1.7, 3.55, lz], [0.34, 0.34, 4.3]);
    addPart(staticObjects, 'cube', C.lanternFrame, [lx + 1.7, 3.55, lz], [0.34, 0.34, 4.3]);
    addPart(staticObjects, 'cube', C.lantern, [lx, 2.35, lz], [2.3, 2.7, 2.3]);
    addPart(staticObjects, 'cube', C.lanternGlow, [lx, 2.35, lz], [3.7, 4.2, 3.7], { alpha: 0.18 });
    addPart(staticObjects, 'cube', C.lanternGlow, [lx, 3.55, lz], [1.1, 0.7, 1.1], { alpha: 0.3 });
    addPart(staticObjects, 'cube', C.gold, [lx, 4.05, lz], [0.6, 0.6, 0.6]);
    addPart(staticObjects, 'disc', C.lanternGlow, [lx, 0.72, lz], [18, 1, 18], { alpha: 0.1 });
  }

  /* ---------------------------------------------------------------- state */
  var game = {
    mode: 'title',
    wave: 0,
    gold: START_GOLD,
    lives: START_LIVES,
    speed: 1,
    paused: false,
    selected: -1,
    hover: -1,
    towers: [],
    enemies: [],
    projectiles: [],
    fx3d: [],
    texts: [],
    beams: [],
    spawns: [],
    spawnIndex: 0,
    waveTime: 0,
    waveActive: false,
    kills: 0,
    leaked: 0,
    endWin: false,
    endTimer: 0,
    endShown: false
  };

  var worldTime = 0;
  var lastFrame = 0;
  var manual = false;
  var bannerTimer = 0;
  var hintFlashUntil = 0;
  var nextId = 1;

  function resetRun() {
    game.mode = 'title';
    game.wave = 0;
    game.gold = START_GOLD;
    game.lives = START_LIVES;
    game.speed = 1;
    game.paused = false;
    game.selected = -1;
    game.hover = -1;
    game.towers = PADS.map(function () { return null; });
    game.enemies = [];
    game.projectiles = [];
    game.fx3d = [];
    game.texts = [];
    game.beams = [];
    game.spawns = [];
    game.spawnIndex = 0;
    game.waveTime = 0;
    game.waveActive = false;
    game.kills = 0;
    game.leaked = 0;
    game.endWin = false;
    game.endTimer = 0;
    game.endShown = false;
    clearTimeout(game.endTimeout);
    hintFlashUntil = 0;
    ui.end.hidden = true;
    ui.pauseScreen.hidden = true;
    ui.shop.hidden = true;
    ui.boss.hidden = true;
    ui.send.disabled = false;
    ui.send.classList.remove('is-busy');
    ui.speed.textContent = '1×';
    syncHud();
    updateHint();
  }

  /* ---------------------------------------------------------------- run flow */
  function startRun() {
    resetRun();
    game.mode = 'playing';
    ui.title.hidden = true;
    ui.hud.hidden = false;
    ui.hint.hidden = false;
    ui.send.hidden = false;
    banner('HOLD THE LINE', 'TEN WAVES · KEEP THE LANTERN LIT');
    selectPad(-1);
    syncHud();
    updateHint();
  }

  function quitToTitle() {
    resetRun();
    game.mode = 'title';
    ui.title.hidden = false;
    ui.hud.hidden = true;
    ui.hint.hidden = true;
    ui.send.hidden = true;
    ui.boss.hidden = true;
  }

  function setPaused(on) {
    if (game.mode !== 'playing') return;
    game.paused = !!on;
    ui.pauseScreen.hidden = !game.paused;
    if (game.paused) {
      ui.shop.hidden = true;
      ui.send.hidden = true;
      ui.hint.hidden = true;
    } else {
      if (game.selected >= 0) renderShop();
      updateHint();
      syncSend();
    }
  }

  function endRun(win) {
    if (game.mode !== 'playing') return;
    game.mode = win ? 'victory' : 'defeat';
    game.endWin = !!win;
    game.endTimer = win ? 1.0 : 1.1;
    clearTimeout(game.endTimeout);
    game.endTimeout = setTimeout(showEnd, win ? 1000 : 1100);
    game.waveActive = false;
    selectPad(-1);
    ui.boss.hidden = true;
    ui.send.hidden = true;
    ui.hint.hidden = true;
    ui.shop.hidden = true;
    syncHud();
    banner(win ? 'THE LANTERN HOLDS' : 'THE LIGHT WENT OUT', win ? 'TEN WAVES SURVIVED' : 'THE HORDE REACHED THE LANTERN');
  }

  function showEnd() {
    if (game.endShown) return;
    if (game.mode !== 'victory' && game.mode !== 'defeat') return;
    game.endShown = true;
    var win = game.endWin;
    ui.endEyebrow.textContent = win ? 'THE LANTERN HOLDS' : 'THE LIGHT WENT OUT';
    ui.endTitle.textContent = win ? 'VICTORY' : 'DEFEAT';
    ui.endCopy.textContent = win
      ? 'Ten waves broke against the path and the star is still burning. The mountain gets to see the morning.'
      : 'The horde reached the lantern on wave ' + Math.max(1, game.wave) + '. The last light went out, and the mountain went quiet.';
    ui.endStats.innerHTML =
      '<span>WAVES <b>' + game.wave + '/' + TOTAL_WAVES + '</b></span>' +
      '<span>KILLS <b>' + game.kills + '</b></span>' +
      '<span>TOWERS <b>' + game.towers.filter(Boolean).length + '</b></span>' +
      '<span>LIGHT <b>' + game.lives + '/' + START_LIVES + '</b></span>';
    ui.end.hidden = false;
    ui.pauseScreen.hidden = true;
    ui.hud.hidden = true;
  }

  /* ---------------------------------------------------------------- HUD */
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function syncHud() {
    if (!ui.gold) return;
    setText(ui.gold, String(Math.floor(game.gold)));
    setText(ui.lives, String(game.lives));
    setText(ui.wave, String(game.wave));
    for (var i = 0; i < pips.length; i++) {
      if (i < game.lives) pips[i].classList.remove('out');
      else pips[i].classList.add('out');
    }
    if (game.selected >= 0 && !ui.shop.hidden) renderShop();
    syncSend();
  }

  function waveCounts(wave) {
    var counts = {};
    wave.groups.forEach(function (g) { counts[g.type] = (counts[g.type] || 0) + g.count; });
    return counts;
  }

  function wavePreview(wave) {
    var counts = waveCounts(wave);
    var parts = [];
    Object.keys(counts).forEach(function (key) {
      parts.push(counts[key] + ' ' + (PLURAL[key] || key));
    });
    return parts.join(' · ');
  }

  function syncSend() {
    if (!ui.send) return;
    if (game.mode !== 'playing' || game.paused) { ui.send.hidden = true; return; }
    ui.send.hidden = false;
    if (game.waveActive) {
      var left = Math.max(0, game.spawns.length - game.spawnIndex) + aliveEnemies().length;
      ui.send.disabled = true;
      ui.send.classList.add('is-busy');
      setText(ui.sendKicker, 'INCOMING');
      setText(ui.sendLabel, 'WAVE ' + game.wave + ' · ' + left + ' LEFT');
    } else if (game.wave >= TOTAL_WAVES) {
      ui.send.disabled = true;
      ui.send.classList.add('is-busy');
      setText(ui.sendKicker, 'THE NIGHT IS OVER');
      setText(ui.sendLabel, 'ALL WAVES SENT');
    } else {
      ui.send.disabled = false;
      ui.send.classList.remove('is-busy');
      setText(ui.sendKicker, wavePreview(WAVES[game.wave]));
      setText(ui.sendLabel, 'SEND WAVE ' + (game.wave + 1));
    }
  }

  function updateHint() {
    if (!ui.hint) return;
    if (performance.now() < hintFlashUntil) return;
    if (game.mode !== 'playing' || game.paused || game.endShown) {
      ui.hint.hidden = true;
      return;
    }
    var bossAlive = false;
    for (var i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].type === 'boss' && !game.enemies[i].dead) { bossAlive = true; break; }
    }
    if (bossAlive) {
      ui.hint.hidden = true;
      return;
    }
    ui.hint.hidden = false;
    var text;
    if (game.selected >= 0) {
      text = game.towers[game.selected]
        ? (coarsePointer ? 'UPGRADE OR SELL BELOW' : 'U UPGRADE · X SELL · ESC CLOSE')
        : (coarsePointer ? 'CHOOSE A TOWER BELOW' : '1 LANTERN · 2 MORTAR · 3 FROST SPIRE');
    } else if (!game.towers.some(Boolean)) {
      text = coarsePointer ? 'TAP A STONE PAD TO BUILD · DRAG TO LOOK' : 'CLICK A STONE PAD TO BUILD YOUR FIRST TOWER';
    } else if (game.waveActive) {
      text = 'HOLD THE LINE';
    } else if (game.wave >= TOTAL_WAVES) {
      text = 'ALL TEN WAVES SENT';
    } else {
      text = 'SEND THE NEXT WAVE WHEN YOU ARE READY';
    }
    setText(ui.hintText, text);
  }

  function flashHint(text) {
    if (!ui.hint) return;
    ui.hint.hidden = false;
    setText(ui.hintText, text);
    ui.hint.classList.remove('flash');
    void ui.hint.offsetWidth;
    ui.hint.classList.add('flash');
    hintFlashUntil = performance.now() + 1000;
  }

  function banner(title, sub) {
    if (!ui.banner) return;
    clearTimeout(bannerTimer);
    ui.bannerTitle.textContent = title;
    ui.bannerSub.textContent = sub || '';
    ui.banner.hidden = false;
    ui.banner.style.animation = 'none';
    void ui.banner.offsetWidth;
    ui.banner.style.animation = '';
    bannerTimer = setTimeout(function () { ui.banner.hidden = true; }, 2100);
  }

  function screenFlash() {
    if (!ui.flash) return;
    ui.flash.classList.add('on');
    setTimeout(function () { ui.flash.classList.remove('on'); }, 130);
  }

  /* ---------------------------------------------------------------- shop */
  function buildCards() {
    var html = '';
    TOWER_ORDER.forEach(function (key) {
      var d = TOWERS[key];
      html += '<button class="ff-card" type="button" data-tower="' + key + '" aria-label="Build ' + d.name + ' for ' + d.cost[0] + ' gold">' +
        '<span class="ff-card-icon">' + ICONS[key] + '</span>' +
        '<span class="ff-card-info"><b>' + d.name + '</b><small>' + d.blurb + '</small></span>' +
        '<span class="ff-card-cost"><i></i>' + d.cost[0] + '</span>' +
        '<kbd>' + d.key + '</kbd></button>';
    });
    ui.shopCards.innerHTML = html;
    ui.shopCards.addEventListener('click', function (ev) {
      var card = ev.target && ev.target.closest ? ev.target.closest('.ff-card') : null;
      if (!card) return;
      buildTower(game.selected, card.getAttribute('data-tower'));
    });
  }

  function selectPad(index) {
    if (game.mode !== 'playing') index = -1;
    game.selected = index;
    if (index < 0) {
      ui.shop.hidden = true;
    } else {
      ui.shop.hidden = false;
      renderShop();
    }
    updateHint();
  }

  function towerStats(t) { return TOWERS[t.type].levels[t.level - 1]; }
  function upgradeCost(t) { return t.level >= 3 ? null : TOWERS[t.type].cost[t.level]; }
  function sellValue(t) { return Math.floor(t.invested * SELL_RATE); }

  function renderShop() {
    var index = game.selected;
    if (index < 0 || game.mode !== 'playing') { ui.shop.hidden = true; return; }
    ui.shop.hidden = false;
    var t = game.towers[index];
    if (!t) {
      ui.shopTitle.textContent = 'BUILD TOWER';
      ui.shopSub.textContent = 'PAD ' + (index + 1) + ' · ' + Math.floor(game.gold) + ' GOLD';
      ui.shopCards.hidden = false;
      ui.shopActions.hidden = true;
      var cards = ui.shopCards.querySelectorAll('.ff-card');
      for (var i = 0; i < cards.length; i++) {
        var key = cards[i].getAttribute('data-tower');
        cards[i].classList.toggle('is-poor', game.gold < TOWERS[key].cost[0]);
      }
      return;
    }
    var def = TOWERS[t.type];
    var stats = towerStats(t);
    ui.shopTitle.textContent = def.name + ' · LV ' + t.level;
    ui.shopSub.textContent = 'DMG ' + stats.dmg + ' · RNG ' + stats.range.toFixed(1) + ' · ' + stats.rate.toFixed(2) + '/S';
    ui.shopCards.hidden = true;
    ui.shopActions.hidden = false;
    var cost = upgradeCost(t);
    if (cost === null) {
      ui.upgrade.textContent = 'MAX LEVEL';
      ui.upgrade.disabled = true;
    } else {
      ui.upgrade.textContent = 'UPGRADE · ' + cost;
      ui.upgrade.disabled = game.gold < cost;
    }
    ui.sell.textContent = 'SELL · ' + sellValue(t);
  }

  function buildTower(index, key) {
    if (game.mode !== 'playing' || game.paused) return;
    if (index < 0 || !TOWERS[key] || game.towers[index]) return;
    var cost = TOWERS[key].cost[0];
    if (game.gold < cost) {
      flashHint('NEED ' + (cost - Math.floor(game.gold)) + ' MORE GOLD');
      return;
    }
    game.gold -= cost;
    game.towers[index] = {
      type: key,
      level: 1,
      cooldown: 0.3,
      angle: Math.PI / 2,
      recoil: 0,
      invested: cost,
      x: PADS[index][0],
      z: PADS[index][1],
      seed: Math.random() * TAU
    };
    game.selected = index;
    renderShop();
    syncHud();
    updateHint();
  }

  function upgradeTower(index) {
    if (game.mode !== 'playing' || game.paused) return;
    var t = game.towers[index];
    if (!t) return;
    var cost = upgradeCost(t);
    if (cost === null) return;
    if (game.gold < cost) {
      flashHint('NEED ' + (cost - Math.floor(game.gold)) + ' MORE GOLD');
      return;
    }
    game.gold -= cost;
    t.invested += cost;
    t.level += 1;
    renderShop();
    syncHud();
  }

  function sellTower(index) {
    if (game.mode !== 'playing' || game.paused) return;
    var t = game.towers[index];
    if (!t) return;
    game.gold += sellValue(t);
    game.towers[index] = null;
    renderShop();
    syncHud();
  }

  function upgradeSelected() { if (game.selected >= 0) upgradeTower(game.selected); }
  function sellSelected() { if (game.selected >= 0) sellTower(game.selected); }

  /* ---------------------------------------------------------------- combat */
  function aliveEnemies() {
    var out = [];
    for (var i = 0; i < game.enemies.length; i++) {
      if (!game.enemies[i].dead) out.push(game.enemies[i]);
    }
    return out;
  }

  function spawnEnemy(type) {
    var def = ENEMIES[type];
    var scale = type === 'boss' ? 1 : 1 + HP_GROWTH * (game.wave - 1);
    var hp = Math.round(def.hp * scale);
    var start = samplePath(0);
    game.enemies.push({
      id: nextId++,
      type: type,
      hp: hp,
      maxHp: hp,
      speed: def.speed,
      d: 0,
      pos: { x: start.x, z: start.z },
      yaw: Math.atan2(start.dx, start.dz),
      slowT: 0,
      slowAmt: 0,
      spawnT: 0,
      hitFlash: 0,
      dead: false,
      deadT: 0,
      remove: false,
      reward: def.reward,
      life: def.life,
      armor: def.armor,
      barY: def.barY,
      barW: def.barW,
      seed: Math.random() * TAU
    });
  }

  function positionEnemy(e) {
    var p = samplePath(e.d);
    e.pos.x = p.x;
    e.pos.z = p.z;
    e.yaw = Math.atan2(p.dx, p.dz);
  }

  function hurt(e, amount, slow, slowDur) {
    if (!e || e.dead) return;
    var dmg = Math.max(1, amount - (e.armor || 0));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (slow) {
      e.slowAmt = Math.max(e.slowAmt, slow);
      e.slowT = Math.max(e.slowT, slowDur || 1.6);
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0;
    game.gold += e.reward;
    game.kills += 1;
    addText(e.pos.x, 0.9, e.pos.z, '+' + e.reward, '#ffc247');
    syncHud();
  }

  function leakEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.remove = true;
    game.lives = Math.max(0, game.lives - e.life);
    game.leaked += 1;
    addText(LANTERN[0], 3.4, LANTERN[1], '-' + e.life + ' LIGHT', '#ff5c74');
    screenFlash();
    syncHud();
    if (game.lives <= 0) endRun(false);
  }

  function addText(x, y, z, text, color) {
    game.texts.push({ x: x, y: y, z: z, text: text, color: color, life: 1.05, max: 1.05 });
  }

  function findTarget(t, range) {
    var best = null;
    var bestD = -1;
    var r2 = range * range;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead || e.spawnT < 0.15) continue;
      var dx = e.pos.x - t.x;
      var dz = e.pos.z - t.z;
      if (dx * dx + dz * dz <= r2 && e.d > bestD) {
        best = e;
        bestD = e.d;
      }
    }
    return best;
  }

  function fireTower(t, target) {
    var stats = towerStats(t);
    var a = t.angle;
    var dirX = Math.sin(a);
    var dirZ = Math.cos(a);
    t.recoil = 1;
    if (t.type === 'spire') {
      hurt(target, stats.dmg, stats.slow, 1.8);
      game.beams.push({
        ax: t.x + dirX * 0.3, ay: 2.45, az: t.z + dirZ * 0.3,
        bx: target.pos.x, by: 0.75, bz: target.pos.z,
        life: 0.15, max: 0.15, color: '#7ce7ff'
      });
      return;
    }
    if (t.type === 'mortar') {
      var dist = Math.hypot(target.pos.x - t.x, target.pos.z - t.z);
      game.projectiles.push({
        kind: 'shell',
        x: t.x + dirX * 0.9, y: 1.35, z: t.z + dirZ * 0.9,
        sx: t.x + dirX * 0.9, sz: t.z + dirZ * 0.9,
        tx: target.pos.x, tz: target.pos.z,
        p: 0, dur: clamp(dist / 20, 0.35, 0.8),
        dmg: stats.dmg, splash: stats.splash
      });
      return;
    }
    game.projectiles.push({
      kind: 'bolt',
      x: t.x + dirX * 0.4, y: 2.05, z: t.z + dirZ * 0.4,
      tx: target.pos.x, ty: 0.72, tz: target.pos.z,
      target: target, dmg: stats.dmg, speed: 27
    });
  }

  function splashDamage(x, z, radius, dmg) {
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead) continue;
      var dx = e.pos.x - x, dz = e.pos.z - z;
      if (dx * dx + dz * dz <= radius * radius) hurt(e, dmg);
    }
    game.fx3d.push({ kind: 'boom', x: x, z: z, t: 0, max: 0.45, size: radius * 1.25 });
  }

  function updateTowers(dt) {
    for (var i = 0; i < game.towers.length; i++) {
      var t = game.towers[i];
      if (!t) continue;
      t.recoil = Math.max(0, t.recoil - dt * 6);
      if (t.cooldown > 0) t.cooldown -= dt;
      var stats = towerStats(t);
      var target = findTarget(t, stats.range);
      if (target) {
        var want = Math.atan2(target.pos.x - t.x, target.pos.z - t.z);
        var delta = ((want - t.angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
        t.angle += delta * Math.min(1, dt * 10);
        if (t.cooldown <= 0) {
          fireTower(t, target);
          t.cooldown = 1 / stats.rate;
        }
      }
    }
  }

  function updateEnemies(dt) {
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      e.spawnT += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.dead) {
        e.deadT += dt;
        if (e.deadT > 0.45) e.remove = true;
        continue;
      }
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slowAmt = 0;
      }
      var speed = e.speed * (e.slowT > 0 ? (1 - e.slowAmt) : 1);
      e.d += speed * dt;
      if (e.d >= pathLength) { leakEnemy(e); continue; }
      positionEnemy(e);
    }
  }

  function updateProjectiles(dt) {
    for (var i = 0; i < game.projectiles.length; i++) {
      var p = game.projectiles[i];
      if (p.kind === 'bolt') {
        var target = p.target;
        if (target && !target.dead) {
          p.tx = target.pos.x;
          p.ty = 0.72;
          p.tz = target.pos.z;
        }
        var dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        var dist = Math.hypot(dx, dy, dz) || 1;
        var step = p.speed * dt;
        if (dist <= step + 0.08) {
          if (target && !target.dead) hurt(target, p.dmg);
          p.remove = true;
        } else {
          p.x += dx / dist * step;
          p.y += dy / dist * step;
          p.z += dz / dist * step;
        }
      } else if (p.kind === 'shell') {
        p.p += dt / p.dur;
        var t = Math.min(1, p.p);
        p.x = lerp(p.sx, p.tx, t);
        p.z = lerp(p.sz, p.tz, t);
        p.y = 1.25 + Math.sin(t * Math.PI) * 2.6;
        if (p.p >= 1) {
          splashDamage(p.tx, p.tz, p.splash, p.dmg);
          p.remove = true;
        }
      }
    }
  }

  function updateFx(dt) {
    for (var i = 0; i < game.fx3d.length; i++) {
      var f = game.fx3d[i];
      f.t += dt;
      if (f.t >= f.max) f.remove = true;
    }
    for (var j = 0; j < game.beams.length; j++) {
      game.beams[j].life -= dt;
      if (game.beams[j].life <= 0) game.beams[j].remove = true;
    }
    for (var k = 0; k < game.texts.length; k++) {
      var tx = game.texts[k];
      tx.life -= dt;
      if (tx.life <= 0) tx.remove = true;
    }
  }

  /* ---------------------------------------------------------------- waves */
  function buildSpawns(wave) {
    var list = [];
    wave.groups.forEach(function (g) {
      for (var i = 0; i < g.count; i++) {
        list.push({ t: 1.2 + (g.delay || 0) + i * g.gap, type: g.type });
      }
    });
    list.sort(function (a, b) { return a.t - b.t; });
    return list;
  }

  function startWave() {
    if (game.mode !== 'playing' || game.paused || game.waveActive) return;
    if (game.wave >= TOTAL_WAVES) return;
    game.wave += 1;
    game.spawns = buildSpawns(WAVES[game.wave - 1]);
    game.spawnIndex = 0;
    game.waveTime = 0;
    game.waveActive = true;
    banner('WAVE ' + game.wave, WAVES[game.wave - 1].name);
    syncHud();
    updateHint();
  }

  function clearWave() {
    game.waveActive = false;
    var bonus = 25 + game.wave * 8;
    game.gold += bonus;
    banner('WAVE CLEARED', '+' + bonus + ' GOLD');
    if (game.wave >= TOTAL_WAVES) endRun(true);
    syncHud();
    updateHint();
  }

  function step(dt) {
    if (game.mode !== 'playing' || game.paused) return;
    worldTime += dt;

    if (game.waveActive) {
      game.waveTime += dt;
      while (game.spawnIndex < game.spawns.length && game.spawns[game.spawnIndex].t <= game.waveTime) {
        spawnEnemy(game.spawns[game.spawnIndex].type);
        game.spawnIndex += 1;
      }
    }

    updateEnemies(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    updateFx(dt);

    if (game.waveActive && game.spawnIndex >= game.spawns.length && aliveEnemies().length === 0) clearWave();

    if (game.enemies.length && game.enemies.some(function (e) { return e.remove; })) {
      game.enemies = game.enemies.filter(function (e) { return !e.remove; });
    }
    if (game.projectiles.length && game.projectiles.some(function (p) { return p.remove; })) {
      game.projectiles = game.projectiles.filter(function (p) { return !p.remove; });
    }
    if (game.fx3d.length && game.fx3d.some(function (f) { return f.remove; })) {
      game.fx3d = game.fx3d.filter(function (f) { return !f.remove; });
    }
    if (game.beams.length && game.beams.some(function (b) { return b.remove; })) {
      game.beams = game.beams.filter(function (b) { return !b.remove; });
    }
    if (game.texts.length && game.texts.some(function (t) { return t.remove; })) {
      game.texts = game.texts.filter(function (t) { return !t.remove; });
    }

    syncSend();
    updateHint();
  }

  /* ---------------------------------------------------------------- models */
  function rot2(x, z, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [x * c - z * s, x * s + z * c];
  }

  function mix(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }

  function towerObjects(t, list) {
    var K = 1.28;
    var x = t.x, z = t.z, a = t.angle, lv = t.level;
    var recoil = t.recoil;
    var dirX = Math.sin(a), dirZ = Math.cos(a);
    addPart(list, 'disc', C.shadow, [x, 0.42, z], [2.7, 1, 2.7], { alpha: 0.22 });

    function part(geo, color, px, py, pz, sx, sy, sz, opts) {
      addPart(list, geo, color, [x + px * K, py * K, z + pz * K], [sx * K, sy * K, sz * K], opts);
    }

    if (t.type === 'lantern') {
      part('cylinder', C.stone, 0, 0.38, 0, 1.95, 0.34, 1.95);
      part('cube', C.lanternFrame, -0.52, 1.35, -0.52, 0.16, 1.85, 0.16);
      part('cube', C.lanternFrame, 0.52, 1.35, -0.52, 0.16, 1.85, 0.16);
      part('cube', C.lanternFrame, -0.52, 1.35, 0.52, 0.16, 1.85, 0.16);
      part('cube', C.lanternFrame, 0.52, 1.35, 0.52, 0.16, 1.85, 0.16);
      part('cube', C.lantern, 0, 1.55, 0, 0.82, 0.95, 0.82);
      part('cube', C.lanternGlow, 0, 1.55, 0, 1.55, 1.65, 1.55, { alpha: 0.2 });
      part('cube', C.lanternFrame, 0, 2.3, -0.52, 1.45, 0.14, 0.14);
      part('cube', C.lanternFrame, 0, 2.3, 0.52, 1.45, 0.14, 0.14);
      part('cube', C.lanternFrame, -0.52, 2.3, 0, 0.14, 0.14, 1.45);
      part('cube', C.lanternFrame, 0.52, 2.3, 0, 0.14, 0.14, 1.45);
      part('cube', C.gold, 0, 2.46, 0, 0.28, 0.28, 0.28);
      part('cube', C.gold, dirX * 0.62, 1.62, dirZ * 0.62, 0.22, 0.22, 0.22);
      for (var i = 0; i < lv; i++) {
        var ang = (i / lv) * TAU + 0.4;
        part('cube', C.gold, Math.cos(ang) * 1.4, 0.5, Math.sin(ang) * 1.4, 0.26, 0.26, 0.26);
      }
      return;
    }

    if (t.type === 'mortar') {
      part('cylinder', C.stone, 0, 0.38, 0, 2.1, 0.36, 2.1);
      part('cube', C.stoneRim, 0, 0.78, 0, 1.3, 0.4, 1.3);
      var back = recoil * 0.35;
      part('cube', C.stoneDark, -dirX * back, 1.28, -dirZ * back, 0.6, 0.6, 1.65, { rot: [-0.5, a, 0] });
      part('cube', C.gold, dirX * (0.92 - back), 1.66, dirZ * (0.92 - back), 0.3, 0.3, 0.3);
      part('cube', C.orange, dirX * (1.05 - back), 1.72, dirZ * (1.05 - back), 0.18, 0.18, 0.18);
      for (var j = 0; j < lv; j++) {
        var ang2 = (j / lv) * TAU + 0.2;
        part('cube', C.gold, Math.cos(ang2) * 1.45, 0.52, Math.sin(ang2) * 1.45, 0.26, 0.26, 0.26);
      }
      return;
    }

    var range = towerStats(t).range;
    addPart(list, 'disc', C.cyan, [x, 0.3, z], [range * 2, 1, range * 2], { alpha: 0.045 });
    part('cylinder', C.stone, 0, 0.38, 0, 1.85, 0.36, 1.85);
    part('cube', C.stoneRim, 0, 0.92, 0, 1.12, 0.8, 1.12);
    part('cube', C.stone, 0, 1.5, 0, 0.86, 0.56, 0.86);
    part('cube', C.stoneRim, 0, 1.95, 0, 0.6, 0.44, 0.6);
    part('cone4', C.cyan, 0, 2.3, 0, 0.7, 1.0, 0.7);
    part('cube', C.cyan, 0, 2.62, 0, 1.25, 1.25, 1.25, { alpha: 0.14 });
    for (var k = 0; k < 3; k++) {
      var a2 = worldTime * 1.4 + k * TAU / 3;
      part('cube', C.cyan, Math.cos(a2) * 0.95, 1.75 + Math.sin(worldTime * 2 + k) * 0.2, Math.sin(a2) * 0.95, 0.18, 0.18, 0.18);
    }
    for (var m = 0; m < lv; m++) {
      var a3 = (m / lv) * TAU + 0.8;
      part('cube', C.gold, Math.cos(a3) * 1.35, 0.5, Math.sin(a3) * 1.35, 0.26, 0.26, 0.26);
    }
  }

  function drawEnemy(e, list) {
    var alpha = e.dead ? clamp(1 - e.deadT / 0.45, 0, 1) : clamp(e.spawnT / 0.3, 0, 1);
    if (alpha <= 0.01) return;
    var bob = Math.sin(worldTime * 7 + e.seed) * 0.05;
    var yaw = e.yaw;
    var flash = e.hitFlash > 0;
    var slow = e.slowT > 0;
    var p = e.pos;
    var K = e.type === 'brute' ? 1.4 : (e.type === 'imp' ? 1.5 : (e.type === 'wisp' ? 1.3 : 1));

    function tint(base) {
      if (flash) return C.white;
      if (slow) return mix(base, C.frost, 0.55);
      return base;
    }
    function put(geo, color, lx, ly, lz, sx, sy, sz) {
      var r = rot2(lx, lz, yaw);
      addPart(list, geo, tint(color), [p.x + r[0] * K, ly * K, p.z + r[1] * K], [sx * K, sy * K, sz * K], {
        rot: [0, yaw, 0],
        alpha: alpha
      });
    }

    addPart(list, 'disc', C.shadow, [p.x, 0.05, p.z], [1.3 * K, 1, 1.3 * K], { alpha: 0.22 * alpha });

    if (e.type === 'imp') {
      put('cube', C.imp, 0, 0.5 + bob, 0, 0.8, 0.7, 0.68);
      put('cube', C.impDark, 0, 0.4 + bob, 0.34, 0.48, 0.32, 0.08);
      put('cube', C.imp, 0, 1.04 + bob, 0.04, 0.56, 0.5, 0.5);
      put('cube', C.eye, -0.14, 1.08 + bob, 0.3, 0.1, 0.11, 0.07);
      put('cube', C.eye, 0.14, 1.08 + bob, 0.3, 0.1, 0.11, 0.07);
      put('cube', C.imp, -0.5, 0.56 + bob, 0, 0.2, 0.5, 0.22);
      put('cube', C.imp, 0.5, 0.56 + bob, 0, 0.2, 0.5, 0.22);
      return;
    }
    if (e.type === 'wisp') {
      var hover = 0.35 + Math.sin(worldTime * 3 + e.seed) * 0.15;
      put('cone6', C.wisp, 0, 0.85 + hover, 0, 0.62, 1.15, 0.62);
      put('cube', C.wispGlow, 0, 1.15 + hover, 0, 1.3, 1.3, 1.3);
      put('disc', C.cyan, 0, 0.12, 0, 1.3, 1, 1.3);
      put('cube', C.eye, -0.12, 1.2 + hover, 0.24, 0.08, 0.1, 0.07);
      put('cube', C.eye, 0.12, 1.2 + hover, 0.24, 0.08, 0.1, 0.07);
      return;
    }
    if (e.type === 'brute') {
      put('cube', C.brute, 0, 0.95 + bob, 0, 1.35, 1.15, 1.05);
      put('cube', C.bruteDark, 0, 0.9 + bob, 0.5, 0.8, 0.6, 0.1);
      put('cube', C.brute, 0, 1.86 + bob, 0.05, 0.74, 0.64, 0.66);
      put('cone4', C.stoneRim, -0.32, 2.16 + bob, 0, 0.2, 0.5, 0.2);
      put('cone4', C.stoneRim, 0.32, 2.16 + bob, 0, 0.2, 0.5, 0.2);
      put('cube', C.bruteEye, -0.17, 1.9 + bob, 0.38, 0.12, 0.1, 0.07);
      put('cube', C.bruteEye, 0.17, 1.9 + bob, 0.38, 0.12, 0.1, 0.07);
      put('cube', C.brute, -1.0, 1.15 + bob, 0, 0.46, 1.1, 0.46);
      put('cube', C.bruteDark, 0.86, 1.64 + bob, 0, 0.6, 0.32, 0.72);
      put('cube', C.bruteDark, -0.86, 1.64 + bob, 0, 0.6, 0.32, 0.72);
      return;
    }
    /* boss */
    var sway = Math.sin(worldTime * 1.8 + e.seed) * 0.08;
    put('disc', C.purple, 0, 0.12, 0, 5.4, 1, 5.4);
    put('cube', C.boss, 0, 1.35 + sway, 0, 2.4, 2.1, 1.6);
    put('cube', C.bossGold, 0, 2.0 + sway, 0.82, 1.7, 0.34, 0.12);
    put('cube', C.bossDark, 0, 2.8 + sway, 0.06, 1.08, 0.88, 0.92);
    put('cube', C.bossEye, -0.23, 2.85 + sway, 0.5, 0.16, 0.16, 0.08);
    put('cube', C.bossEye, 0.23, 2.85 + sway, 0.5, 0.16, 0.16, 0.08);
    put('cone4', C.bossGold, -0.45, 3.1 + sway, 0.02, 0.3, 1.0, 0.3);
    put('cone4', C.bossGold, 0.45, 3.1 + sway, 0.02, 0.3, 1.0, 0.3);
    put('cube', C.bossDark, -1.5, 1.3 + sway, 0, 0.52, 1.8, 0.52);
    put('cube', C.bossDark, 1.5, 1.3 + sway, 0, 0.52, 1.8, 0.52);
    put('cube', C.bossGold, -1.5, 0.5 + sway, 0, 0.62, 0.3, 0.62);
    put('cube', C.bossGold, 1.5, 0.5 + sway, 0, 0.62, 0.3, 0.62);
  }

  function drawProjectiles(list) {
    for (var i = 0; i < game.projectiles.length; i++) {
      var p = game.projectiles[i];
      if (p.kind === 'bolt') {
        addPart(list, 'cube', C.lanternGlow, [p.x, p.y, p.z], [0.2, 0.2, 0.42], { rot: [0, Math.atan2(p.tx - p.x, p.tz - p.z), 0] });
        addPart(list, 'cube', C.lantern, [p.x, p.y, p.z], [0.42, 0.42, 0.42], { alpha: 0.18 });
      } else {
        addPart(list, 'cube', C.stoneDark, [p.x, p.y, p.z], [0.34, 0.34, 0.34], { rot: [p.p * 6, p.p * 4, 0] });
        addPart(list, 'cube', C.orange, [p.x, p.y + 0.16, p.z], [0.16, 0.16, 0.16]);
      }
    }
  }

  function drawFx(list) {
    for (var i = 0; i < game.fx3d.length; i++) {
      var f = game.fx3d[i];
      var k = clamp(f.t / f.max, 0, 1);
      addPart(list, 'disc', C.orange, [f.x, 0.24, f.z], [f.size * (0.6 + k * 1.4), 1, f.size * (0.6 + k * 1.4)], { alpha: 0.5 * (1 - k) });
      addPart(list, 'disc', C.gold, [f.x, 0.3, f.z], [f.size * (0.3 + k), 1, f.size * (0.3 + k)], { alpha: 0.35 * (1 - k) });
    }
  }

  /* ---------------------------------------------------------------- drawing */
  function draw(dt) {
    if (!renderer) return;

    var list = staticObjects.slice();

    for (var i = 0; i < PADS.length; i++) {
      var po = padObjects[i];
      var tower = game.towers[i];
      var selected = i === game.selected;
      var hot = tower ? C.padBuilt : (selected ? C.padHot : (i === game.hover ? C.padHover : mix(C.pad, C.white, 0.06 + 0.06 * Math.sin(worldTime * 2 + i))));
      po.top.color = hot;
      po.rim.color = selected ? C.padHot : C.padRim;
      po.band.color = selected ? C.white : C.gold;
      list.push(po.rim, po.band, po.top);
      if (tower) towerObjects(tower, list);
    }

    /* Spawn portal and lantern pulse. */
    addPart(list, 'disc', C.purple, [PATH_POINTS[0][0], 0.16, PATH_POINTS[0][1]], [3.4, 1, 3.4], { alpha: 0.22 + 0.09 * Math.sin(worldTime * 2.4) });
    addPart(list, 'cube', C.lanternGlow, [LANTERN[0], 2.1, LANTERN[1]], [3.6, 3.8, 3.6], { alpha: 0.1 + 0.04 * Math.sin(worldTime * 2) });

    for (var j = 0; j < game.enemies.length; j++) drawEnemy(game.enemies[j], list);
    drawProjectiles(list);
    drawFx(list);

    renderer.setScene({
      objects: list,
      fogColor: C.sky,
      fogNear: 30,
      fogFar: 110,
      skyColor: C.sky
    });
    renderer.render();
    drawOverlay(dt);
  }

  var flakes = [];
  function seedSnow() {
    flakes = [];
    var count = view.w < 700 ? 55 : 90;
    for (var i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * view.w,
        y: Math.random() * view.h,
        r: 0.8 + Math.random() * 1.8,
        s: 10 + Math.random() * 26,
        p: Math.random() * TAU
      });
    }
  }

  function drawOverlay(dt) {
    if (!fxCtx) return;
    var ctx = fxCtx;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    /* Snow. */
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.s * dt;
      f.x += Math.sin(worldTime * 0.7 + f.p) * 8 * dt;
      if (f.y > view.h + 4) { f.y = -4; f.x = Math.random() * view.w; }
      if (f.x < -4) f.x = view.w + 4;
      if (f.x > view.w + 4) f.x = -4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
    }

    /* The lantern's pool of light. */
    var pool = project(LANTERN[0], 0.4, LANTERN[1]);
    if (pool) {
      var edge = project(LANTERN[0] + 7, 0.4, LANTERN[1]);
      var radius = edge ? Math.abs(edge.x - pool.x) : 140;
      var glow = ctx.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, radius);
      glow.addColorStop(0, 'rgba(255,224,145,0.4)');
      glow.addColorStop(0.5, 'rgba(255,201,90,0.17)');
      glow.addColorStop(1, 'rgba(255,201,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pool.x, pool.y, radius, 0, TAU);
      ctx.fill();
    }

    /* Selected tower range. */
    var sel = game.selected;
    if (sel >= 0 && game.mode === 'playing') {
      var tower = game.towers[sel];
      var range = tower ? towerStats(tower).range : 2.2;
      var cx = PADS[sel][0], cz = PADS[sel][1];
      ctx.beginPath();
      for (var a = 0; a <= 40; a++) {
        var ang = a / 40 * TAU;
        var pt = project(cx + Math.cos(ang) * range, 0.2, cz + Math.sin(ang) * range);
        if (!pt) continue;
        if (a === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = tower ? 'rgba(255,194,71,0.06)' : 'rgba(124,231,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = tower ? 'rgba(255,194,71,0.55)' : 'rgba(124,231,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* Frost beams. */
    for (var b = 0; b < game.beams.length; b++) {
      var beam = game.beams[b];
      var a1 = project(beam.ax, beam.ay, beam.az);
      var b1 = project(beam.bx, beam.by, beam.bz);
      if (!a1 || !b1) continue;
      var life = clamp(beam.life / beam.max, 0, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(124,231,255,' + (0.75 * life) + ')';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(a1.x, a1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * life) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a1.x, a1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.stroke();
    }

    /* Health bars. */
    for (var e = 0; e < game.enemies.length; e++) {
      var enemy = game.enemies[e];
      if (enemy.dead || enemy.spawnT < 0.2 || enemy.type === 'boss') continue;
      if (enemy.hp >= enemy.maxHp - 0.01) continue;
      var hb = project(enemy.pos.x, enemy.barY, enemy.pos.z);
      if (!hb) continue;
      var w = enemy.barW;
      var h = 4;
      var pct = clamp(enemy.hp / enemy.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(13,7,24,0.78)';
      ctx.fillRect(hb.x - w / 2 - 1, hb.y - h / 2 - 1, w + 2, h + 2);
      ctx.fillStyle = pct > 0.55 ? '#8df0b3' : (pct > 0.25 ? '#ffc247' : '#ff5c74');
      ctx.fillRect(hb.x - w / 2, hb.y - h / 2, w * pct, h);
      if (enemy.slowT > 0) {
        ctx.strokeStyle = 'rgba(124,231,255,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(hb.x - w / 2 - 1, hb.y - h / 2 - 1, w + 2, h + 2);
      }
    }

    /* Floating +gold and leak text. */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var t = 0; t < game.texts.length; t++) {
      var item = game.texts[t];
      var tp = project(item.x, item.y + (1 - item.life / item.max) * 1.3, item.z);
      if (!tp) continue;
      var ta = clamp(item.life / item.max, 0, 1);
      ctx.globalAlpha = ta;
      ctx.font = '700 18px "VT323", ui-monospace, monospace';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(13,7,24,0.9)';
      ctx.strokeText(item.text, tp.x, tp.y);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, tp.x, tp.y);
      ctx.globalAlpha = 1;
    }

    /* The lantern's star. */
    var star = project(LANTERN[0], 4.6, LANTERN[1]);
    if (star) {
      var pulse = 0.6 + 0.3 * Math.sin(worldTime * 2.4);
      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#fff6c4';
      ctx.beginPath();
      for (var s2 = 0; s2 < 8; s2++) {
        var ang2 = -Math.PI / 2 + s2 * Math.PI / 4;
        var rad = s2 % 2 === 0 ? 13 : 4;
        ctx.lineTo(Math.cos(ang2) * rad, Math.sin(ang2) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------- boss bar */
  function syncBoss() {
    if (!ui.boss) return;
    var boss = null;
    for (var i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].type === 'boss' && !game.enemies[i].dead) { boss = game.enemies[i]; break; }
    }
    if (boss && game.mode === 'playing') {
      ui.boss.hidden = false;
      ui.bossFill.style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%';
    } else {
      ui.boss.hidden = true;
    }
  }

  /* ---------------------------------------------------------------- input */
  var dragState = null;

  function padAt(clientX, clientY) {
    var best = -1;
    var bestDist = 60;
    for (var i = 0; i < PADS.length; i++) {
      var pt = project(PADS[i][0], 0.25, PADS[i][1]);
      if (!pt) continue;
      var d = Math.hypot(pt.x - clientX, pt.y - clientY);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function bind() {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    ui.canvas.addEventListener('pointerdown', function (ev) {
      dragState = { x: ev.clientX, y: ev.clientY, camX: camRig.x, camZ: camRig.z, moved: false };
      if (ui.canvas.setPointerCapture) {
        try { ui.canvas.setPointerCapture(ev.pointerId); } catch (error) { /* ignore */ }
      }
    });
    ui.canvas.addEventListener('pointermove', function (ev) {
      if (dragState) {
        var dx = ev.clientX - dragState.x;
        var dy = ev.clientY - dragState.y;
        if (!dragState.moved && Math.hypot(dx, dy) > 7) dragState.moved = true;
        if (dragState.moved) {
          var perPx = (baseOrtho / camRig.zoom) / view.h;
          camRig.x = dragState.camX - dx * perPx;
          camRig.z = dragState.camZ - dy * perPx / 0.64;
          applyCamera();
        }
        return;
      }
      if (ev.pointerType !== 'mouse') return;
      if (game.mode !== 'playing' || game.paused) { game.hover = -1; return; }
      game.hover = padAt(ev.clientX, ev.clientY);
    });
    ui.canvas.addEventListener('pointerup', function (ev) {
      if (!dragState) return;
      var moved = dragState.moved;
      dragState = null;
      if (moved) return;
      if (game.mode !== 'playing' || game.paused) return;
      var index = padAt(ev.clientX, ev.clientY);
      if (index < 0) selectPad(-1);
      else selectPad(game.selected === index ? -1 : index);
    });
    ui.canvas.addEventListener('pointercancel', function () { dragState = null; });
    ui.canvas.addEventListener('pointerleave', function () { game.hover = -1; });
    ui.canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    ui.canvas.addEventListener('wheel', function (ev) {
      if (game.mode !== 'playing') return;
      ev.preventDefault();
      userZoomed = true;
      camRig.zoom = clamp(camRig.zoom * (ev.deltaY > 0 ? 0.88 : 1.12), 1, 3);
      applyCamera();
    }, { passive: false });

    ui.start.addEventListener('click', startRun);
    ui.send.addEventListener('click', startWave);
    ui.speed.addEventListener('click', function () {
      game.speed = game.speed === 1 ? 2 : 1;
      ui.speed.textContent = game.speed + '×';
    });
    ui.pauseButton.addEventListener('click', function () { setPaused(true); });
    ui.resume.addEventListener('click', function () { setPaused(false); });
    ui.pauseRestart.addEventListener('click', function () { startRun(); });
    ui.pauseTitle.addEventListener('click', quitToTitle);
    ui.shopClose.addEventListener('click', function () { selectPad(-1); });
    ui.upgrade.addEventListener('click', upgradeSelected);
    ui.sell.addEventListener('click', sellSelected);
    ui.again.addEventListener('click', startRun);

    document.addEventListener('keydown', function (ev) {
      if (ev.repeat) return;
      var key = (ev.key || '').toLowerCase();
      if (key === ' ' || key === 'spacebar') {
        ev.preventDefault();
        if (game.mode === 'playing' && !game.paused) startWave();
        return;
      }
      if (key === 'p') {
        if (game.mode === 'playing') setPaused(!game.paused);
        return;
      }
      if (key === 'escape') {
        if (game.mode === 'playing') {
          if (!game.paused && game.selected >= 0) selectPad(-1);
          else setPaused(!game.paused);
        }
        return;
      }
      if (game.mode !== 'playing' || game.paused) return;
      if (key === '1' || key === '2' || key === '3') {
        if (game.selected >= 0 && !game.towers[game.selected]) {
          buildTower(game.selected, TOWER_ORDER[Number(key) - 1]);
        }
        return;
      }
      if (key === 'u') { upgradeSelected(); return; }
      if (key === 'x') { sellSelected(); }
    });
  }

  /* ---------------------------------------------------------------- loop */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = lastFrame ? Math.min(0.06, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    worldTime += dt;

    if (!manual) {
      if (game.mode === 'playing' && !game.paused) {
        var total = dt * game.speed;
        var steps = Math.min(5, Math.max(1, Math.ceil(total / 0.033)));
        for (var i = 0; i < steps; i++) step(total / steps);
      }
    }

    if ((game.mode === 'victory' || game.mode === 'defeat') && !game.endShown) {
      game.endTimer -= dt;
      if (game.endTimer <= 0) showEnd();
    }

    syncBoss();
    draw(dt);
  }

  /* ---------------------------------------------------------------- debug */
  function exposeDebug() {
    window.__ff = {
      version: 137,
      state: function () {
        return {
          mode: game.mode,
          wave: game.wave,
          gold: Math.floor(game.gold),
          lives: game.lives,
          speed: game.speed,
          paused: game.paused,
          waveActive: game.waveActive,
          enemies: aliveEnemies().length,
          spawnsLeft: Math.max(0, game.spawns.length - game.spawnIndex),
          towers: game.towers.filter(Boolean).length,
          kills: game.kills,
          leaked: game.leaked,
          selected: game.selected,
          pathLength: Math.round(pathLength)
        };
      },
      start: startRun,
      restart: startRun,
      title: quitToTitle,
      send: startWave,
      select: selectPad,
      build: buildTower,
      upgrade: upgradeTower,
      sell: sellTower,
      addGold: function (n) { game.gold += n; syncHud(); },
      setGold: function (n) { game.gold = n; syncHud(); },
      setLives: function (n) { game.lives = n; syncHud(); },
      tick: function (seconds) {
        manual = true;
        var left = Math.max(0, seconds || 0);
        var guard = 0;
        while (left > 0.0001 && guard < 60000) {
          var d = Math.min(1 / 30, left);
          step(d);
          left -= d;
          guard += 1;
          if (game.mode !== 'playing') break;
        }
        draw(0);
        syncHud();
        return this.state();
      },
      resume: function () { manual = false; },
      waveInfo: function () {
        return WAVES.map(function (w, i) {
          return { wave: i + 1, name: w.name, composition: wavePreview(w) };
        });
      },
      towerInfo: TOWERS,
      pads: PADS,
      padScreen: function (i) {
        if (!PADS[i]) return null;
        return project(PADS[i][0], 0.25, PADS[i][1]);
      },
      debug: game
    };
  }

  /* ---------------------------------------------------------------- init */
  function showFallback() {
    if (ui.title) ui.title.hidden = true;
    if (ui.hud) ui.hud.hidden = true;
    if (ui.hint) ui.hint.hidden = true;
    if (ui.send) ui.send.hidden = true;
    if (ui.fallback) ui.fallback.hidden = false;
  }

  function init() {
    cacheDom();
    if (!FF || !mat) { showFallback(); return; }
    try {
      renderer = FF.createRenderer(ui.canvas);
    } catch (error) {
      renderer = null;
    }
    if (!renderer) { showFallback(); return; }

    resize();
    buildStaticWorld();
    buildCards();
    resetRun();
    game.mode = 'title';
    ui.title.hidden = false;
    bind();
    exposeDebug();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
