/*
 * BSMS Web — Frostfall 3D
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * A deliberately small flat-shaded WebGL renderer. It draws the boxes, cones,
 * cylinders and discs that make up Frostfall's low-poly world: one directional
 * light, distance fog, alpha and no textures. No dependencies, no build step.
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
    'void main() {',
    '  vec3 n = normalize(vNormal);',
    '  vec3 light = normalize(vec3(0.42, 0.86, 0.32));',
    '  float diffuse = max(dot(n, light), 0.0);',
    '  float bounce = max(dot(n, vec3(-0.4, 0.2, -0.6)), 0.0);',
    '  vec3 col = vColor * (0.56 + diffuse * 0.58 + bounce * 0.10);',
    '  float fog = clamp((distance(vWorld, uCam) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
    '  col = mix(col, uFogColor, fog * 0.86);',
    '  gl_FragColor = vec4(col, vAlpha);',
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
      uFogFar: gl.getUniformLocation(program, 'uFogFar')
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

    Object.keys(sources).forEach((name) => {
      const source = sources[name];
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, source.position, gl.STATIC_DRAW);
      const nbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
      gl.bufferData(gl.ARRAY_BUFFER, source.normal, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, source.index, gl.STATIC_DRAW);
      geometries[name] = { vbo, nbo, ibo, count: source.index.length };
    });

    let scene = { objects: [], fogColor: [0.72, 0.83, 0.94], fogNear: 26, fogFar: 74 };
    const camera = { eye: [0, 3, 9], target: [0, 1, 0], fov: 56 * Math.PI / 180 };
    let currentGeo = null;

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

    function bindGeometry(name) {
      if (currentGeo === name) return geometries[name];
      const geo = geometries[name] || geometries.cube;
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.vbo);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.nbo);
      gl.enableVertexAttribArray(loc.aNormal);
      gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.ibo);
      currentGeo = name;
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
        gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_SHORT, 0);
      }
    }

    function render() {
      const size = resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.uProj, false, M.perspective(camera.fov, size.width / size.height, 0.1, 160));
      gl.uniformMatrix4fv(loc.uView, false, M.lookAt(camera.eye, camera.target, [0, 1, 0]));
      gl.uniform3fv(loc.uCam, camera.eye);
      gl.uniform3fv(loc.uFogColor, scene.fogColor || [0.72, 0.83, 0.94]);
      gl.uniform1f(loc.uFogNear, scene.fogNear === undefined ? 26 : scene.fogNear);
      gl.uniform1f(loc.uFogFar, scene.fogFar === undefined ? 74 : scene.fogFar);

      const opaque = [];
      const alpha = [];
      for (let i = 0; i < scene.objects.length; i++) {
        const object = scene.objects[i];
        if (!object || object.hidden) continue;
        if ((object.alpha === undefined ? 1 : object.alpha) < 1) alpha.push(object);
        else opaque.push(object);
      }
      draw(opaque);
      if (alpha.length) {
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
      setCamera(eye, target, fov) {
        camera.eye = eye;
        camera.target = target;
        if (fov) camera.fov = fov;
      }
    };
  }

  global.FFEngine = { createRenderer, mat: M };
})(window);
