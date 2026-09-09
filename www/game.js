(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  const scoreEl = document.querySelector("#score");
  const statusEl = document.querySelector("#status");
  const startScreen = document.querySelector("#start-screen");
  const startBtn = document.querySelector("#start");
  const pushBtn = document.querySelector("#push");
  const resetBtn = document.querySelector("#reset");
  const joystick = document.querySelector("#joystick");
  const knob = document.querySelector("#joystick-knob");

  if (!gl) {
    statusEl.textContent = "この端末では3D表示に対応していません";
    return;
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform mat4 uModel;
    varying vec3 vColor;
    varying float vLight;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vec3 fakeLight = normalize(vec3(-0.5, 1.0, 0.6));
      vec3 normal = normalize(aPosition);
      vLight = 0.72 + max(0.0, dot(normal, fakeLight)) * 0.28;
      vColor = aColor;
      gl_Position = uProjection * uView * world;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    varying float vLight;
    void main() { gl_FragColor = vec4(vColor * vLight, 1.0); }
  `;

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  }
  function program(vs, fs) {
    const result = gl.createProgram();
    gl.attachShader(result, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(result, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return result;
  }

  const drawProgram = program(vertexSource, fragmentSource);
  const loc = {
    position: gl.getAttribLocation(drawProgram, "aPosition"),
    color: gl.getAttribLocation(drawProgram, "aColor"),
    projection: gl.getUniformLocation(drawProgram, "uProjection"),
    view: gl.getUniformLocation(drawProgram, "uView"),
    model: gl.getUniformLocation(drawProgram, "uModel"),
  };

  const cubePositions = new Float32Array([
    -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1,
     1,-1,-1, -1,-1,-1, -1, 1,-1,  1, 1,-1,
    -1, 1, 1,  1, 1, 1,  1, 1,-1, -1, 1,-1,
    -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1, 1,
     1,-1, 1,  1,-1,-1,  1, 1,-1,  1, 1, 1,
    -1,-1,-1, -1,-1, 1, -1, 1, 1, -1, 1,-1,
  ]);
  const cubeIndices = new Uint16Array([
    0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11,
    12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23,
  ]);
  const cubeColors = new Float32Array(Array.from({ length: 24 }, () => [1, 1, 1]).flat());
  const geometry = createGeometry(cubePositions, cubeColors, cubeIndices);

  function createGeometry(positions, colors, indices) {
    const position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const color = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, color);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    const index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return { position, color, index, count: indices.length };
  }

  const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
    return out;
  };
  const perspective = (fov, aspect, near, far) => {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  };
  const translationScale = (x, y, z, sx, sy, sz) => new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, x,y,z,1]);
  const lookAt = (eye, target, up) => {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*eye[0]+xy*eye[1]+xz*eye[2]), -(yx*eye[0]+yy*eye[1]+yz*eye[2]), -(zx*eye[0]+zy*eye[1]+zz*eye[2]),1]);
  };
  const colorBuffer = (rgb) => {
    const values = new Float32Array(Array.from({ length: 24 }, () => rgb).flat());
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    return buffer;
  };

  const white = colorBuffer([0.96, 0.97, 0.98]);
  const gray = colorBuffer([0.79, 0.82, 0.86]);
  const red = colorBuffer([0.9, 0.08, 0.06]);
  const redDark = colorBuffer([0.47, 0.03, 0.02]);
  const blue = colorBuffer([0.06, 0.39, 0.9]);

  const state = {
    started: false,
    player: { x: 0, z: 5.1, yaw: Math.PI, pitch: -0.19 },
    keys: new Set(),
    joystick: { x: 0, y: 0, active: false },
    score: 0,
    activated: false,
    last: 0,
  };

  function reset() {
    state.player.x = 0; state.player.z = 5.1; state.player.yaw = Math.PI; state.player.pitch = -0.19;
    state.score = 0; state.activated = false;
    scoreEl.textContent = "0";
    statusEl.textContent = "赤いボタンまで歩こう";
    pushBtn.disabled = true;
  }
  function start() { state.started = true; startScreen.hidden = true; canvas.focus?.(); }
  startBtn.addEventListener("click", start);
  resetBtn.addEventListener("click", reset);

  function activate() {
    if (!nearButton() || state.activated) return;
    state.activated = true;
    statusEl.textContent = "起動！ スコアが増えていく";
    pushBtn.disabled = true;
  }
  pushBtn.addEventListener("click", activate);

  function nearButton() {
    return Math.hypot(state.player.x, state.player.z) < 1.6;
  }

  window.addEventListener("keydown", (event) => {
    state.keys.add(event.key.toLowerCase());
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) event.preventDefault();
    if (event.key.toLowerCase() === "e") activate();
  });
  window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));

  let drag = null;
  function updateJoystick(clientX, clientY) {
    const box = joystick.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const dx = clientX - cx, dy = clientY - cy;
    const radius = box.width * 0.33;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, radius / length);
    const x = dx * scale, y = dy * scale;
    state.joystick.x = x / radius; state.joystick.y = y / radius;
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }
  function pointerDown(event) {
    if (!state.started || event.target.closest("button")) return;
    const box = joystick.getBoundingClientRect();
    if (event.clientX >= box.left - 16 && event.clientX <= box.right + 16 && event.clientY >= box.top - 16 && event.clientY <= box.bottom + 16) {
      drag = { type: "move", id: event.pointerId };
      state.joystick.active = true;
      updateJoystick(event.clientX, event.clientY);
    } else {
      drag = { type: "look", id: event.pointerId, x: event.clientX, y: event.clientY };
    }
    canvas.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.type === "move") updateJoystick(event.clientX, event.clientY);
    else {
      state.player.yaw -= (event.clientX - drag.x) * 0.008;
      state.player.pitch = Math.max(-0.78, Math.min(0.38, state.player.pitch - (event.clientY - drag.y) * 0.006));
      drag.x = event.clientX; drag.y = event.clientY;
    }
  }
  function pointerUp(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.type === "move") {
      state.joystick.x = 0; state.joystick.y = 0; state.joystick.active = false;
      knob.style.transform = "translate(-50%, -50%)";
    }
    drag = null;
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(canvas.clientWidth * ratio), height = Math.floor(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
  }
  window.addEventListener("resize", resize);

  function update(delta) {
    const p = state.player;
    let forward = (state.keys.has("w") || state.keys.has("arrowup") ? 1 : 0) - (state.keys.has("s") || state.keys.has("arrowdown") ? 1 : 0);
    let side = (state.keys.has("d") || state.keys.has("arrowright") ? 1 : 0) - (state.keys.has("a") || state.keys.has("arrowleft") ? 1 : 0);
    forward += -state.joystick.y; side += state.joystick.x;
    const turn = (state.keys.has("q") ? 1 : 0) - (state.keys.has("e") ? 1 : 0);
    p.yaw += turn * delta * 1.8;
    const length = Math.hypot(forward, side);
    if (length > 0) {
      forward /= Math.max(1, length); side /= Math.max(1, length);
      const speed = 3.1 * delta;
      p.x += (Math.sin(p.yaw) * forward + Math.cos(p.yaw) * side) * speed;
      p.z += (Math.cos(p.yaw) * forward - Math.sin(p.yaw) * side) * speed;
      p.x = Math.max(-6.25, Math.min(6.25, p.x));
      p.z = Math.max(-6.25, Math.min(6.25, p.z));
    }
    if (state.activated) { state.score += delta * 12; scoreEl.textContent = String(Math.floor(state.score)); }
    const canPush = nearButton() && !state.activated;
    pushBtn.disabled = !canPush;
    if (canPush) statusEl.textContent = "赤いボタンをPUSH！";
  }

  function bindColor(buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(loc.color, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc.color);
  }
  function draw(model, colors) {
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.position);
    gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc.position);
    bindColor(colors);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.index);
    gl.uniformMatrix4fv(loc.model, false, model);
    gl.drawElements(gl.TRIANGLES, geometry.count, gl.UNSIGNED_SHORT, 0);
  }

  function render() {
    resize();
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.clearColor(0.82, 0.85, 0.89, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(drawProgram);
    const p = state.player;
    const facing = [Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(p.yaw) * Math.cos(p.pitch)];
    const eye = [p.x, 1.45, p.z];
    const target = [eye[0] + facing[0], eye[1] + facing[1], eye[2] + facing[2]];
    gl.uniformMatrix4fv(loc.projection, false, perspective(Math.PI / 3.1, canvas.width / canvas.height, 0.05, 50));
    gl.uniformMatrix4fv(loc.view, false, lookAt(eye, target, [0, 1, 0]));

    // 白い箱状の部屋（床、天井、4つの壁）
    draw(translationScale(0, -0.14, 0, 7.2, 0.14, 7.2), white);
    draw(translationScale(0, 3.2, 0, 7.2, 0.08, 7.2), white);
    draw(translationScale(0, 1.5, -7, 7.2, 1.7, 0.08), white);
    draw(translationScale(0, 1.5, 7, 7.2, 1.7, 0.08), white);
    draw(translationScale(-7, 1.5, 0, 0.08, 1.7, 7.2), gray);
    draw(translationScale(7, 1.5, 0, 0.08, 1.7, 7.2), gray);

    // ボタン台と赤いボタン
    draw(translationScale(0, 0.12, 0, 0.82, 0.12, 0.82), gray);
    draw(translationScale(0, state.activated ? 0.22 : 0.34, 0, 0.56, state.activated ? 0.10 : 0.22, 0.56), red);
    draw(translationScale(0, 0.06, 0, 0.68, 0.06, 0.68), redDark);

    // 開始位置を見失わないための小さな青いマーカー
    if (!state.activated) draw(translationScale(0, 0.04, 5.1, 0.16, 0.04, 0.16), blue);
  }

  function frame(now) {
    const delta = Math.min(0.05, (now - state.last) / 1000 || 0);
    state.last = now;
    if (state.started) update(delta);
    render();
    requestAnimationFrame(frame);
  }
  reset();
  requestAnimationFrame(frame);
})();
