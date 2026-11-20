/*
 * BSMS Web — Frostfall 3D
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * A deliberately small flat-shaded WebGL renderer. It draws the boxes, cones,
 * cylinders and discs that make up Frostfall's low-poly world: one directional
 * light, distance fog, alpha and no textures — plus a camera-facing textured
 * quad for the 2D sprite characters. No dependencies, no build step.
 */
(function (global) {
  'use strict';

  const M = {
    identity() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return o;
    },
    translation(x, y, z) {
      const m = M.identity();
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    },
    scaling(x, y, z) {
      const m = new Float32Array(16);
      m[0] = x; m[5] = y; m[10] = z; m[15] = 1;
      return m;
    },
    rotX(a) {
      const c = Math.cos(a), s = Math.sin(a);
      return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    },
    rotY(a) {
      const c = Math.cos(a), s = Math.sin(a);
      return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    },
    rotZ(a) {
      const c = Math.cos(a), s = Math.sin(a);
      return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },
    compose(pos, rot, scale) {
      const t = M.translation(pos[0], pos[1], pos[2]);
      const r = M.mul(M.mul(M.rotY(rot[1] || 0), M.rotX(rot[0] || 0)), M.rotZ(rot[2] || 0));
      const s = M.scaling(scale[0], scale[1], scale[2]);
      return M.mul(M.mul(t, r), s);
    },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    },
    ortho(left, right, bottom, top, near, far) {
      const nf = 1 / (near - far);
      return new Float32Array([
        2 / (right - left), 0, 0, 0,
        0, 2 / (top - bottom), 0, 0,
        0, 0, 2 * nf, 0,
        -(right + left) / (right - left),
        -(top + bottom) / (top - bottom),
        (far + near) * nf, 1
      ]);
    },
    lookAt(eye, target, up) {
      let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
      let len = Math.hypot(zx, zy, zz) || 1;
      zx /= len; zy /= len; zz /= len;
      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      len = Math.hypot(xx, xy, xz) || 1;
      xx /= len; xy /= len; xz /= len;
      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1
      ]);
    }
  };

  function pushVertex(store, p, n) {
    store.p.push(p[0], p[1], p[2]);
    store.n.push(n[0], n[1], n[2]);
  }

  function finish(store) {
    return {
      position: new Float32Array(store.p),
      normal: new Float32Array(store.n),
      index: new Uint16Array(store.i)
    };
  }

  function quad(store, a, b, c, d, n) {
    const base = store.p.length / 3;
    pushVertex(store, a, n);
    pushVertex(store, b, n);
    pushVertex(store, c, n);
    pushVertex(store, d, n);
    store.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function normalOf(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    return [nx, ny, nz];
  }

  function cubeGeo() {
    const s = { p: [], n: [], i: [] };
    quad(s, [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0, 0, 1]);
    quad(s, [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0, 0, -1]);
    quad(s, [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [1, 0, 0]);
    quad(s, [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-1, 0, 0]);
    quad(s, [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [0, 1, 0]);
    quad(s, [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, -1, 0]);
    return finish(s);
  }

  function coneGeo(sides) {
    const s = { p: [], n: [], i: [] };
    const apex = [0, 1, 0];
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const p0 = [Math.cos(a0), 0, Math.sin(a0)];
      const p1 = [Math.cos(a1), 0, Math.sin(a1)];
      const n = normalOf(p0, p1, apex);
      quad(s, p0, p1, apex, apex, n);
    }
    const base = [0, 0, 0];
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const p0 = [Math.cos(a0), 0, Math.sin(a0)];
      const p1 = [Math.cos(a1), 0, Math.sin(a1)];
      const b = s.p.length / 3;
      pushVertex(s, base, [0, -1, 0]);
      pushVertex(s, p0, [0, -1, 0]);
      pushVertex(s, p1, [0, -1, 0]);
      s.i.push(b, b + 1, b + 2);
    }
    return finish(s);
  }

  function cylinderGeo(sides) {
    const s = { p: [], n: [], i: [] };
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const n = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      const p0 = [Math.cos(a0), -0.5, Math.sin(a0)];
      const p1 = [Math.cos(a1), -0.5, Math.sin(a1)];
      const p2 = [Math.cos(a1), 0.5, Math.sin(a1)];
      const p3 = [Math.cos(a0), 0.5, Math.sin(a0)];
      quad(s, p0, p1, p2, p3, n);
    }
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const top = s.p.length / 3;
      pushVertex(s, [0, 0.5, 0], [0, 1, 0]);
      pushVertex(s, [Math.cos(a1), 0.5, Math.sin(a1)], [0, 1, 0]);
      pushVertex(s, [Math.cos(a0), 0.5, Math.sin(a0)], [0, 1, 0]);
      s.i.push(top, top + 1, top + 2);
      const bottom = s.p.length / 3;
      pushVertex(s, [0, -0.5, 0], [0, -1, 0]);
      pushVertex(s, [Math.cos(a0), -0.5, Math.sin(a0)], [0, -1, 0]);
      pushVertex(s, [Math.cos(a1), -0.5, Math.sin(a1)], [0, -1, 0]);
      s.i.push(bottom, bottom + 1, bottom + 2);
    }
    return finish(s);
  }

  function discGeo(sides) {
    const s = { p: [], n: [], i: [] };
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const b = s.p.length / 3;
      pushVertex(s, [0, 0, 0], [0, 1, 0]);
      pushVertex(s, [Math.cos(a1), 0, Math.sin(a1)], [0, 1, 0]);
      pushVertex(s, [Math.cos(a0), 0, Math.sin(a0)], [0, 1, 0]);
      s.i.push(b, b + 1, b + 2);
    }
    return finish(s);
  }

  const VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'uniform vec3 uColor;',
    'uniform float uAlpha;',
    'varying vec3 vNormal;',
    'varying vec3 vWorld;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec4 world = uModel * vec4(aPos, 1.0);',
    '  vWorld = world.xyz;',
    '  vNormal = normalize(mat3(uModel) * aNormal);',
    '  vColor = uColor;',
    '  vAlpha = uAlpha;',
    '  gl_Position = uProj * uView * world;',
    '}'
  ].join('\n');

  /* World-space stud/brick pattern. Statics opt in with `pattern: 1`, so the
     studs stay glued to the floor while characters slide over them. */
  const FS = [
    'precision mediump float;',
    'varying vec3 vNormal;',
    'varying vec3 vWorld;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'uniform vec3 uCam;',
    'uniform vec3 uFogColor;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'uniform float uPattern;',
    'uniform float uTile;',
    'void main() {',
    '  vec3 n = normalize(vNormal);',
    '  vec3 an = abs(n);',
    '  vec3 light = normalize(vec3(0.42, 0.86, 0.32));',
    '  float diffuse = max(dot(n, light), 0.0);',
    '  float bounce = max(dot(n, vec3(-0.4, 0.2, -0.6)), 0.0);',
    '  float stepped = smoothstep(0.34, 0.40, diffuse);',
    '  vec3 col = vColor * (0.78 + stepped * 0.42 + bounce * 0.10);',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(vec3(lum), col, 1.22);',
    '  if (uPattern > 0.5) {',
    '    vec2 uv;',
    '    if (an.y > 0.6) { uv = vWorld.xz; }',
    '    else if (an.x > an.z) { uv = vWorld.zy; }',
    '    else { uv = vWorld.xy; }',
    '    vec2 cell = fract(uv / uTile) - 0.5;',
    '    float d = length(cell);',
    '    vec2 grid = abs(fract(uv / uTile) - 0.5);',
    '    float seam = smoothstep(0.44, 0.49, max(grid.x, grid.y));',
    '    col *= 1.0 - seam * 0.13;',
    '    if (an.y > 0.6) {',
    '      float stud = smoothstep(0.30, 0.25, d);',
    '      float ring = smoothstep(0.36, 0.30, d) - stud;',
    '      col *= 1.0 - ring * 0.22;',
    '      col += vColor * stud * 0.24;',
    '    } else {',
    '      col *= 0.92 + 0.08 * smoothstep(0.5, 0.0, min(grid.x, grid.y));',
    '    }',
    '  }',
    '  float fog = clamp((distance(vWorld, uCam) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
    '  col = mix(col, uFogColor, fog * 0.62);',
    '  gl_FragColor = vec4(col, vAlpha);',
    '}'
  ].join('\n');

  /* 2D characters: one camera-facing textured quad, alpha-cut so the sprite
     keeps its silhouette, and fogged so it sits in the scene like the rest. */
  const SPRITE_VS = [
    'attribute vec2 aPos;',
    'attribute vec2 aUV;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'uniform vec4 uUV;',
    'varying vec2 vUV;',
    'varying vec3 vWorld;',
    'void main() {',
    '  vec4 world = uModel * vec4(aPos, 0.0, 1.0);',
    '  vWorld = world.xyz;',
    '  vUV = mix(uUV.xy, uUV.zw, aUV);',
    '  gl_Position = uProj * uView * world;',
    '}'
  ].join('\n');

  const SPRITE_FS = [
    'precision mediump float;',
    'varying vec2 vUV;',
    'varying vec3 vWorld;',
    'uniform sampler2D uTex;',
    'uniform float uAlpha;',
    'uniform vec3 uCam;',
    'uniform vec3 uFogColor;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'void main() {',
    '  vec4 texel = texture2D(uTex, vUV);',
    '  if (texel.a < 0.32) discard;',
    '  float fog = clamp((distance(vWorld, uCam) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
    '  vec3 col = mix(texel.rgb, uFogColor, fog * 0.62);',
    '  gl_FragColor = vec4(col, texel.a * uAlpha);',
    '}'
  ].join('\n');

  /* Kit props (Kenney OBJ models) share one texture atlas each: same light
     and fog as the primitives, but sampled colour instead of flat fill. */
  const MESH_VS = [
    'attribute vec3 aPos;',
    'attribute vec2 aUV;',
    'attribute vec3 aNormal;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'varying vec2 vUV;',
    'varying vec3 vNormal;',
    'varying vec3 vWorld;',
    'void main() {',
    '  vec4 world = uModel * vec4(aPos, 1.0);',
    '  vWorld = world.xyz;',
    '  vNormal = normalize(mat3(uModel) * aNormal);',
    '  vUV = aUV;',
    '  gl_Position = uProj * uView * world;',
    '}'
  ].join('\n');

  const MESH_FS = [
    'precision mediump float;',
    'varying vec2 vUV;',
    'varying vec3 vNormal;',
    'varying vec3 vWorld;',
    'uniform sampler2D uTex;',
    'uniform vec3 uColor;',
    'uniform float uAlpha;',
    'uniform vec3 uCam;',
    'uniform vec3 uFogColor;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'void main() {',
    '  vec4 texel = texture2D(uTex, vUV);',
    '  if (texel.a < 0.05) discard;',
    '  vec3 n = normalize(vNormal);',
    '  vec3 light = normalize(vec3(0.42, 0.86, 0.32));',
    '  float diffuse = max(dot(n, light), 0.0);',
    '  float bounce = max(dot(n, vec3(-0.4, 0.2, -0.6)), 0.0);',
    '  float stepped = smoothstep(0.34, 0.40, diffuse);',
    '  vec3 col = texel.rgb * uColor * (0.76 + stepped * 0.40 + bounce * 0.10);',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(vec3(lum), col, 1.12);',
    '  float fog = clamp((distance(vWorld, uCam) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
    '  col = mix(col, uFogColor, fog * 0.62);',
    '  gl_FragColor = vec4(col, texel.a * uAlpha);',
    '}'
  ].join('\n');

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[Frostfall] shader:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[Frostfall] link:', gl.getProgramInfoLog(program));
      return null;
    }

    const loc = {
      aPos: gl.getAttribLocation(program, 'aPos'),
      aNormal: gl.getAttribLocation(program, 'aNormal'),
      uProj: gl.getUniformLocation(program, 'uProj'),
      uView: gl.getUniformLocation(program, 'uView'),
      uModel: gl.getUniformLocation(program, 'uModel'),
      uColor: gl.getUniformLocation(program, 'uColor'),
      uAlpha: gl.getUniformLocation(program, 'uAlpha'),
      uCam: gl.getUniformLocation(program, 'uCam'),
      uFogColor: gl.getUniformLocation(program, 'uFogColor'),
      uFogNear: gl.getUniformLocation(program, 'uFogNear'),
      uFogFar: gl.getUniformLocation(program, 'uFogFar'),
      uPattern: gl.getUniformLocation(program, 'uPattern'),
      uTile: gl.getUniformLocation(program, 'uTile')
    };

    const geometries = {};
    const sources = {
      cube: cubeGeo(),
      cone4: coneGeo(4),
      cone6: coneGeo(6),
      cone8: coneGeo(8),
      cylinder: cylinderGeo(10),
      disc: discGeo(18)
    };

    function upload(source) {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, source.position, gl.STATIC_DRAW);
      const nbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
      gl.bufferData(gl.ARRAY_BUFFER, source.normal, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, source.index, gl.STATIC_DRAW);
      return { vbo, nbo, ibo, count: source.index.length, type: source.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    }

    Object.keys(sources).forEach((name) => {
      geometries[name] = upload(sources[name]);
    });

    /* Sprite program. If the context is too old for it, sprites simply do not
       draw and the rest of the scene still renders. */
    let spriteProgram = null;
    let spriteLoc = null;
    const svs = compile(gl.VERTEX_SHADER, SPRITE_VS);
    const sfs = compile(gl.FRAGMENT_SHADER, SPRITE_FS);
    if (svs && sfs) {
      spriteProgram = gl.createProgram();
      gl.attachShader(spriteProgram, svs);
      gl.attachShader(spriteProgram, sfs);
      gl.linkProgram(spriteProgram);
      if (gl.getProgramParameter(spriteProgram, gl.LINK_STATUS)) {
        spriteLoc = {
          aPos: gl.getAttribLocation(spriteProgram, 'aPos'),
          aUV: gl.getAttribLocation(spriteProgram, 'aUV'),
          uProj: gl.getUniformLocation(spriteProgram, 'uProj'),
          uView: gl.getUniformLocation(spriteProgram, 'uView'),
          uModel: gl.getUniformLocation(spriteProgram, 'uModel'),
          uUV: gl.getUniformLocation(spriteProgram, 'uUV'),
          uTex: gl.getUniformLocation(spriteProgram, 'uTex'),
          uAlpha: gl.getUniformLocation(spriteProgram, 'uAlpha'),
          uCam: gl.getUniformLocation(spriteProgram, 'uCam'),
          uFogColor: gl.getUniformLocation(spriteProgram, 'uFogColor'),
          uFogNear: gl.getUniformLocation(spriteProgram, 'uFogNear'),
          uFogFar: gl.getUniformLocation(spriteProgram, 'uFogFar')
        };
      } else {
        console.error('[Frostfall] sprite link:', gl.getProgramInfoLog(spriteProgram));
        spriteProgram = null;
      }
    }

    /* Mesh program for textured kit models; without it those props stay
       invisible and the blocky world still draws. */
    let meshProgram = null;
    let meshLoc = null;
    const mvs = compile(gl.VERTEX_SHADER, MESH_VS);
    const mfs = compile(gl.FRAGMENT_SHADER, MESH_FS);
    if (mvs && mfs) {
      meshProgram = gl.createProgram();
      gl.attachShader(meshProgram, mvs);
      gl.attachShader(meshProgram, mfs);
      gl.linkProgram(meshProgram);
      if (gl.getProgramParameter(meshProgram, gl.LINK_STATUS)) {
        meshLoc = {
          aPos: gl.getAttribLocation(meshProgram, 'aPos'),
          aUV: gl.getAttribLocation(meshProgram, 'aUV'),
          aNormal: gl.getAttribLocation(meshProgram, 'aNormal'),
          uProj: gl.getUniformLocation(meshProgram, 'uProj'),
          uView: gl.getUniformLocation(meshProgram, 'uView'),
          uModel: gl.getUniformLocation(meshProgram, 'uModel'),
          uTex: gl.getUniformLocation(meshProgram, 'uTex'),
          uColor: gl.getUniformLocation(meshProgram, 'uColor'),
          uAlpha: gl.getUniformLocation(meshProgram, 'uAlpha'),
          uCam: gl.getUniformLocation(meshProgram, 'uCam'),
          uFogColor: gl.getUniformLocation(meshProgram, 'uFogColor'),
          uFogNear: gl.getUniformLocation(meshProgram, 'uFogNear'),
          uFogFar: gl.getUniformLocation(meshProgram, 'uFogFar')
        };
      } else {
        console.error('[Frostfall] mesh link:', gl.getProgramInfoLog(meshProgram));
        meshProgram = null;
      }
    }

    /* One unit quad, bottom-centre pinned, drawn with a per-sprite UV window. */
    const spriteQuad = (function () {
      const position = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
        -0.5, -0.5, 0.5, 0.5, -0.5, 0.5
      ]), gl.STATIC_DRAW);
      const uv = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uv);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1
      ]), gl.STATIC_DRAW);
      return { position, uv };
    })();

    const spriteTextures = new WeakMap();
    function textureFor(image) {
      let texture = spriteTextures.get(image);
      if (texture) return texture;
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      spriteTextures.set(image, texture);
      return texture;
    }

    const meshTextures = new WeakMap();
    function meshTexture(image) {
      let texture = meshTextures.get(image);
      if (texture) return texture;
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      meshTextures.set(image, texture);
      return texture;
    }

    /* Kenney OBJs are tiny, so their vertices are uploaded once and shared by
       every placement of that prop. */
    function uploadMesh(data) {
      if (!data || !data.position || !data.index.length) return null;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.position, gl.STATIC_DRAW);
      const uvbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.uv, gl.STATIC_DRAW);
      const nbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.normal, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.index, gl.STATIC_DRAW);
      return { vbo, uvbo, nbo, ibo, count: data.index.length, type: gl.UNSIGNED_SHORT };
    }

    let scene = { objects: [], fogColor: [0.72, 0.83, 0.94], fogNear: 26, fogFar: 74 };
    const camera = { eye: [0, 3, 9], target: [0, 1, 0], fov: 56 * Math.PI / 180, orthoSize: 0 };
    let currentGeo = null;
    const stats = { calls: 0, objects: 0 };

    /* Bake one primitive into a single static buffer per batch: hundreds of
       studs become one draw call instead of one per stud. */
    function batchGeometry(name, matrices) {
      const source = sources[name] || sources.cube;
      const copies = matrices.length;
      const stride = source.position.length;
      const position = new Float32Array(stride * copies);
      const normal = new Float32Array(source.normal.length * copies);
      const index = new Uint16Array(source.index.length * copies);
      const vertices = (stride / 3) * copies;
      if (vertices > 65535) return null;
      for (let m = 0; m < copies; m++) {
        const matrix = matrices[m];
        const pBase = m * stride;
        const nBase = m * stride;
        for (let v = 0; v < stride; v += 3) {
          const x = source.position[v], y = source.position[v + 1], z = source.position[v + 2];
          position[pBase + v] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
          position[pBase + v + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
          position[pBase + v + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
          const nx = source.normal[v], ny = source.normal[v + 1], nz = source.normal[v + 2];
          let tx = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
          let ty = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
          let tz = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
          const len = Math.hypot(tx, ty, tz) || 1;
          normal[nBase + v] = tx / len;
          normal[nBase + v + 1] = ty / len;
          normal[nBase + v + 2] = tz / len;
        }
        const offset = (stride / 3) * m;
        for (let k = 0; k < source.index.length; k++) {
          index[m * source.index.length + k] = source.index[k] + offset;
        }
      }
      return upload({ position, normal, index });
    }

    function releaseGeometry(geo) {
      if (!geo || geo.released) return;
      geo.released = true;
      gl.deleteBuffer(geo.vbo);
      gl.deleteBuffer(geo.nbo);
      gl.deleteBuffer(geo.ibo);
    }

    function resize() {
      const ratio = Math.min(global.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor((canvas.clientWidth || 1) * ratio));
      const height = Math.max(1, Math.floor((canvas.clientHeight || 1) * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      return { width, height };
    }

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function bindGeometry(key) {
      const geo = typeof key === 'string' ? (geometries[key] || geometries.cube) : key;
      if (!geo) return geometries.cube;
      if (currentGeo === geo) return geo;
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.vbo);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.nbo);
      gl.enableVertexAttribArray(loc.aNormal);
      gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.ibo);
      currentGeo = geo;
      return geo;
    }

    function draw(list) {
      for (let i = 0; i < list.length; i++) {
        const object = list[i];
        if (!object || object.hidden) continue;
        const geo = bindGeometry(object.geo || 'cube');
        gl.uniformMatrix4fv(loc.uModel, false, object.model);
        gl.uniform3fv(loc.uColor, object.color);
        gl.uniform1f(loc.uAlpha, object.alpha === undefined ? 1 : object.alpha);
        gl.uniform1f(loc.uPattern, object.pattern ? 1 : 0);
        gl.uniform1f(loc.uTile, object.tile || 1);
        gl.drawElements(gl.TRIANGLES, geo.count, geo.type || gl.UNSIGNED_SHORT, 0);
        stats.calls += 1;
      }
    }

    function useMeshProgram(size) {
      gl.useProgram(meshProgram);
      gl.uniformMatrix4fv(meshLoc.uProj, false, projectionFor(size));
      gl.uniformMatrix4fv(meshLoc.uView, false, M.lookAt(camera.eye, camera.target, [0, 1, 0]));
      sceneFog(meshLoc);
      gl.uniform1i(meshLoc.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      currentGeo = null;
    }

    function drawMeshes(list) {
      let bound = null;
      for (let i = 0; i < list.length; i++) {
        const object = list[i];
        const mesh = object.mesh;
        if (!mesh || !mesh.geo || !mesh.texture) continue;
        const geo = mesh.geo;
        if (bound !== geo) {
          gl.bindBuffer(gl.ARRAY_BUFFER, geo.vbo);
          gl.enableVertexAttribArray(meshLoc.aPos);
          gl.vertexAttribPointer(meshLoc.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, geo.uvbo);
          gl.enableVertexAttribArray(meshLoc.aUV);
          gl.vertexAttribPointer(meshLoc.aUV, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, geo.nbo);
          gl.enableVertexAttribArray(meshLoc.aNormal);
          gl.vertexAttribPointer(meshLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.ibo);
          gl.bindTexture(gl.TEXTURE_2D, meshTexture(mesh.texture));
          bound = geo;
        }
        gl.uniformMatrix4fv(meshLoc.uModel, false, object.model);
        gl.uniform3fv(meshLoc.uColor, object.color || [1, 1, 1]);
        gl.uniform1f(meshLoc.uAlpha, object.alpha === undefined ? 1 : object.alpha);
        gl.drawElements(gl.TRIANGLES, geo.count, geo.type || gl.UNSIGNED_SHORT, 0);
        stats.calls += 1;
      }
      currentGeo = null;
    }

    function projectionFor(size) {
      const aspect = size.width / size.height;
      if (camera.orthoSize) {
        const halfH = camera.orthoSize / 2;
        const halfW = halfH * aspect;
        return M.ortho(-halfW, halfW, -halfH, halfH, 0.1, 220);
      }
      return M.perspective(camera.fov, aspect, 0.1, 160);
    }

    function sceneFog(target) {
      gl.uniform3fv(target.uCam, camera.eye);
      gl.uniform3fv(target.uFogColor, scene.fogColor || [0.72, 0.83, 0.94]);
      gl.uniform1f(target.uFogNear, scene.fogNear === undefined ? 26 : scene.fogNear);
      gl.uniform1f(target.uFogFar, scene.fogFar === undefined ? 74 : scene.fogFar);
    }

    function useSceneProgram(size) {
      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.uProj, false, projectionFor(size));
      gl.uniformMatrix4fv(loc.uView, false, M.lookAt(camera.eye, camera.target, [0, 1, 0]));
      sceneFog(loc);
      currentGeo = null;
    }

    function useSpriteProgram(size) {
      gl.useProgram(spriteProgram);
      gl.uniformMatrix4fv(spriteLoc.uProj, false, projectionFor(size));
      gl.uniformMatrix4fv(spriteLoc.uView, false, M.lookAt(camera.eye, camera.target, [0, 1, 0]));
      sceneFog(spriteLoc);
      gl.uniform1i(spriteLoc.uTex, 0);
      currentGeo = null;
    }

    function drawSprites(list) {
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteQuad.position);
      gl.enableVertexAttribArray(spriteLoc.aPos);
      gl.vertexAttribPointer(spriteLoc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteQuad.uv);
      gl.enableVertexAttribArray(spriteLoc.aUV);
      gl.vertexAttribPointer(spriteLoc.aUV, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      const uv = new Float32Array(4);
      for (let i = 0; i < list.length; i++) {
        const object = list[i];
        if (!object.sprite || !object.sprite.image) continue;
        const pos = object.pos || [0, 0, 0];
        const size = object.size || [1, 1];
        const flat = Math.atan2(camera.eye[0] - pos[0], camera.eye[2] - pos[2]);
        const model = M.mul(
          M.translation(pos[0], pos[1] + size[1] / 2, pos[2]),
          M.mul(M.rotY(flat), M.scaling(size[0] * (object.flip ? -1 : 1), size[1], 1))
        );
        gl.bindTexture(gl.TEXTURE_2D, textureFor(object.sprite.image));
        gl.uniformMatrix4fv(spriteLoc.uModel, false, model);
        const window = object.sprite.uv || [0, 0, 1, 1];
        uv[0] = window[0]; uv[1] = window[1]; uv[2] = window[2]; uv[3] = window[3];
        gl.uniform4fv(spriteLoc.uUV, uv);
        gl.uniform1f(spriteLoc.uAlpha, object.alpha === undefined ? 1 : object.alpha);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        stats.calls += 1;
      }
    }

    function render() {
      stats.calls = 0;
      stats.objects = scene.objects.length;
      const size = resize();
      /* === NEW: HORIZON FILL === clear to the winter sky instead of transparent,
         so a viewport taller than the terrain never shows the page behind it. */
      const sky = scene.skyColor || scene.fogColor || [0.7216, 0.8314, 0.9098];
      gl.clearColor(sky[0], sky[1], sky[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      useSceneProgram(size);

      const opaque = [];
      const alpha = [];
      const sprites = [];
      const meshes = [];
      for (let i = 0; i < scene.objects.length; i++) {
        const object = scene.objects[i];
        if (!object || object.hidden) continue;
        const objectAlpha = object.alpha === undefined ? 1 : object.alpha;
        if (object.mesh) { if (objectAlpha > 0.01) meshes.push(object); }
        else if (object.sprite) { if (objectAlpha > 0.01) sprites.push(object); }
        else if (objectAlpha < 1) alpha.push(object);
        else opaque.push(object);
      }
      draw(opaque);
      if (meshProgram && meshes.length) {
        useMeshProgram(size);
        drawMeshes(meshes);
      }
      if (spriteProgram && sprites.length) {
        sprites.sort((a, b) => {
          const ap = a.pos || [0, 0, 0], bp = b.pos || [0, 0, 0];
          const ad = (ap[0] - camera.eye[0]) ** 2 + (ap[1] - camera.eye[1]) ** 2 + (ap[2] - camera.eye[2]) ** 2;
          const bd = (bp[0] - camera.eye[0]) ** 2 + (bp[1] - camera.eye[1]) ** 2 + (bp[2] - camera.eye[2]) ** 2;
          return bd - ad;
        });
        useSpriteProgram(size);
        drawSprites(sprites);
      }
      if (alpha.length) {
        useSceneProgram(size);
        alpha.sort((a, b) => {
          const ax = a.model[12] - camera.eye[0], ay = a.model[13] - camera.eye[1], az = a.model[14] - camera.eye[2];
          const bx = b.model[12] - camera.eye[0], by = b.model[13] - camera.eye[1], bz = b.model[14] - camera.eye[2];
          return (bx * bx + by * by + bz * bz) - (ax * ax + ay * ay + az * az);
        });
        gl.depthMask(false);
        draw(alpha);
        gl.depthMask(true);
      }
      currentGeo = null;
    }

    return {
      render,
      gl,
      setScene(next) { scene = next; },
      batchGeometry,
      releaseGeometry,
      uploadMesh,
      meshTexture,
      hasMesh() { return !!meshProgram; },
      stats() { return { calls: stats.calls, objects: stats.objects }; },
      setCamera(eye, target, fov, orthoSize) {
        camera.eye = eye;
        camera.target = target;
        if (fov) camera.fov = fov;
        camera.orthoSize = orthoSize || 0;
      }
    };
  }

  global.FFEngine = { createRenderer, mat: M };
})(window);
