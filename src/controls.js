// Walk (first person, pointer lock, collisions, floor following) + Overview (orbit) navigation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EYE = 1.62, RADIUS = 0.28, MAX_STEP = 0.5, BODY_LOW = 0.35;

export class Navigator extends EventTarget {
  constructor(camera, dom, venue) {
    super();
    this.camera = camera; this.dom = dom; this.venue = venue;
    this.mode = 'walk';
    this.pos = [0, 0]; this.foot = 0; this.yaw = 0; this.pitch = 0;
    this.keys = new Set(); this.doorsClosed = false;
    this.grid = new SegmentGrid(venue.colliders, 2);
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enabled = false; this.orbit.enableDamping = true; this.orbit.maxPolarAngle = Math.PI * 0.47;
    this.orbit.minDistance = 6; this.orbit.maxDistance = 220; this.orbit.target.set(0, 0, 0);
    this.tween = null; this.touch = { move: null, look: null };
    this._bind();
  }

  // ------------------------------------------------------------ public API
  teleport(p, look, animate = true, ref) {
    const f = this.venue.floorAt(p[0], p[1], ref); if (f === null) return;
    const yaw = Math.atan2(-(look[0] - p[0]), (look[1] - p[1]));
    if (this.mode !== 'walk') this.setMode('walk', false);
    const from = { pos: [...this.pos], foot: this.foot, yaw: this.yaw, pitch: this.pitch };
    const to = { pos: [...p], foot: f, yaw: from.yaw + shortest(yaw - from.yaw), pitch: -0.05 };
    if (!animate) { Object.assign(this, { pos: to.pos, foot: to.foot, yaw: to.yaw, pitch: to.pitch }); return; }
    this.tween = { t: 0, dur: 1.2, from, to };
  }

  setMode(mode, animate = true) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'orbit') {
      document.exitPointerLock?.();
      this.orbit.enabled = true;
      const target = new THREE.Vector3(this.pos[0], 0, -this.pos[1]);
      this.orbit.target.copy(target.lerp(new THREE.Vector3(-2, 0, 0), 0.6));
      if (animate) {
        const end = new THREE.Vector3(18, 62, 58).add(new THREE.Vector3(-4, 0, -2));
        this.tween = { t: 0, dur: 1.4, orbitFrom: this.camera.position.clone(), orbitTo: end };
      }
    } else {
      this.orbit.enabled = false;
    }
    this.dispatchEvent(new CustomEvent('mode', { detail: mode }));
  }

  setDoorsClosed(v) { this.doorsClosed = v; }

  // ------------------------------------------------------------ per frame
  update(dt) {
    dt = Math.min(dt, 0.05);
    if (this.tween) return this._tween(dt);
    if (this.mode === 'orbit') { this.orbit.update(); return; }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = run ? 3.6 : 1.5;
    let f = 0, s = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD')) s += 1;
    if (this.keys.has('KeyA')) s -= 1;
    if (this.keys.has('ArrowLeft')) this.yaw += 1.6 * dt;
    if (this.keys.has('ArrowRight')) this.yaw -= 1.6 * dt;
    if (this.touch.move) { f += -this.touch.move.dy; s += this.touch.move.dx; }
    const len = Math.hypot(f, s);
    if (len > 0) {
      f /= Math.max(len, 1); s /= Math.max(len, 1);
      // yaw = 0 looks north (+y); positive yaw turns left (counter-clockwise)
      const fx = -Math.sin(this.yaw), fy = Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), ry = Math.sin(this.yaw);
      this._move([(fx * f + rx * s) * speed * dt, (fy * f + ry * s) * speed * dt]);
    }
    const target = this.venue.floorAt(this.pos[0], this.pos[1], this.foot) ?? this.foot;
    this.foot += (target - this.foot) * Math.min(1, dt * 12);
    this._applyCamera();
  }

  _move(d) {
    const steps = Math.ceil(Math.hypot(d[0], d[1]) / 0.1);
    for (let i = 0; i < steps; i++) {
      const nx = this.pos[0] + d[0] / steps, ny = this.pos[1] + d[1] / steps;
      const fl = this.venue.floorAt(nx, ny, this.foot);
      if (fl === null || fl - this.foot > MAX_STEP) {
        // try sliding along each axis
        const fx = this.venue.floorAt(nx, this.pos[1], this.foot), fy = this.venue.floorAt(this.pos[0], ny, this.foot);
        if (fx !== null && fx - this.foot <= MAX_STEP) this.pos[0] = nx;
        else if (fy !== null && fy - this.foot <= MAX_STEP) this.pos[1] = ny;
        continue;
      }
      this.pos = [nx, ny];
      this._resolve();
    }
  }

  _resolve() {
    const lo = this.foot + BODY_LOW, hi = this.foot + 1.8;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const s of this.grid.near(this.pos, RADIUS + 0.2)) {
        if (s.z1 < lo || s.z0 > hi) continue;
        if (s.closedOnly && !this.doorsClosed) continue;
        if (s.when && !s.when()) continue;                  // theme-only (bar counters, DJ console)
        const [d, x, y] = segDist(this.pos, s.a, s.b);
        if (d < RADIUS) {
          const nx = d > 1e-6 ? (this.pos[0] - x) / d : 1, ny = d > 1e-6 ? (this.pos[1] - y) / d : 0;
          this.pos[0] = x + nx * RADIUS; this.pos[1] = y + ny * RADIUS; moved = true;
        }
      }
      if (!moved) break;
    }
  }

  _applyCamera() {
    this.camera.position.set(this.pos[0], this.foot + EYE, -this.pos[1]);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  _tween(dt) {
    const tw = this.tween; tw.t += dt / tw.dur; const k = ease(Math.min(tw.t, 1));
    if (tw.orbitTo) {
      this.camera.position.lerpVectors(tw.orbitFrom, tw.orbitTo, k);
      this.camera.lookAt(this.orbit.target);
    } else {
      this.pos = [lerp(tw.from.pos[0], tw.to.pos[0], k), lerp(tw.from.pos[1], tw.to.pos[1], k)];
      // arc up a little when the jump is long, so the move reads as a fly-over
      const dist = Math.hypot(tw.to.pos[0] - tw.from.pos[0], tw.to.pos[1] - tw.from.pos[1]);
      this.foot = lerp(tw.from.foot, tw.to.foot, k) + Math.sin(k * Math.PI) * Math.min(dist * 0.25, 9);
      this.yaw = lerp(tw.from.yaw, tw.to.yaw, k); this.pitch = lerp(tw.from.pitch, tw.to.pitch, k) - Math.sin(k * Math.PI) * Math.min(dist * 0.02, 0.5);
      this._applyCamera();
    }
    if (tw.t >= 1) this.tween = null;
  }

  // ------------------------------------------------------------ input
  _bind() {
    const d = this.dom;
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    d.addEventListener('click', () => {
      if (this.mode === 'walk' && !this.isTouch && !this.dragLook) d.requestPointerLock?.()?.catch?.(() => {});
    });
    document.addEventListener('pointerlockchange', () => this.dispatchEvent(new CustomEvent('lock', { detail: document.pointerLockElement === d })));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== d || this.mode !== 'walk' || this.tween) return;
      this.yaw -= e.movementX * 0.0022; this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    });
    // drag-to-look fallback when pointer lock is unavailable (e.g. embedded preview)
    let drag = null;
    d.addEventListener('pointerdown', (e) => { if (this.mode === 'walk' && e.pointerType === 'mouse' && this.dragLook) drag = [e.clientX, e.clientY]; });
    addEventListener('pointerup', () => { drag = null; });
    addEventListener('pointermove', (e) => {
      if (!drag || this.mode !== 'walk') return;
      this.yaw -= (e.clientX - drag[0]) * 0.004; this.pitch -= (e.clientY - drag[1]) * 0.004;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch)); drag = [e.clientX, e.clientY];
    });
    // touch: left half = move stick, right half = look
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    d.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const left = t.clientX < innerWidth / 2;
        if (left && !this.touch.move) this.touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
        else if (!left && !this.touch.look) this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    d.addEventListener('touchmove', (e) => {
      if (this.mode !== 'walk') return;
      for (const t of e.changedTouches) {
        const m = this.touch.move, l = this.touch.look;
        if (m && t.identifier === m.id) { m.dx = clamp((t.clientX - m.x0) / 60); m.dy = clamp((t.clientY - m.y0) / 60); }
        if (l && t.identifier === l.id) {
          this.yaw -= (t.clientX - l.x) * 0.005; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - (t.clientY - l.y) * 0.005));
          l.x = t.clientX; l.y = t.clientY;
        }
      }
    }, { passive: true });
    d.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) this.touch.move = null;
        if (this.touch.look?.id === t.identifier) this.touch.look = null;
      }
    });
  }
}

class SegmentGrid {
  constructor(segs, cell) {
    this.cell = cell; this.map = new Map();
    for (const s of segs) {
      const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / cell), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / cell);
      const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / cell), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / cell);
      if ((x1 - x0) * (y1 - y0) > 400) continue;               // skip huge context edges
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`; if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(s);
      }
    }
  }
  add(segs) {
    for (const s of segs) {
      const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / this.cell), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / this.cell);
      const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / this.cell), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / this.cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = `${x},${y}`; if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(s); }
    }
  }
  near(p, r) {
    const out = new Set(); const c = this.cell;
    for (let x = Math.floor((p[0] - r) / c); x <= Math.floor((p[0] + r) / c); x++)
      for (let y = Math.floor((p[1] - r) / c); y <= Math.floor((p[1] + r) / c); y++)
        for (const s of this.map.get(`${x},${y}`) || []) out.add(s);
    return out;
  }
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx, y = a[1] + t * dy; return [Math.hypot(p[0] - x, p[1] - y), x, y];
}
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const shortest = (d) => Math.atan2(Math.sin(d), Math.cos(d));
const clamp = (v) => Math.max(-1, Math.min(1, v));
