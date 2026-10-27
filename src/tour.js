// Guided walk: an ordered set of stops with narration, a walkable route between them computed
// by A* over the same collision + floor model the player uses (so it threads doors, goes up the
// stair and never cuts through walls), an animated arrow path on the floor, and auto-walk.
import * as THREE from 'three';

const CELL = 0.3, CLEAR = 0.36, BODY_LO = 0.35, BODY_HI = 1.8, STEP = 0.5;

export const STOPS = (V, venue) => {
  const D = V.features.drum, st = venue.upper.stair, P = V.features.platform;
  return [
    { id: 'arrival', title: 'Arrival court', at: [0.6, -21.2], look: [1.5, -16],
      text: 'You arrive from the hotel path. Ahead is the arched brown door to the upper-floor stair; to the left the white arch gate leads into the courtyard. Black stone steps, gravel bed and a stone-clad jamb, as in the site video.' },
    { id: 'gate', title: 'Through the arch gate', at: [-4.2, -14.2], look: [-9.2, -5.1],
      text: 'The 404 m² open-air courtyard: grey stone pavers, a central tree in a round white planter and curved kerbs marking the terrace along the indoor glazing.' },
    { id: 'booths', title: 'Pergola booths', at: [-8.8, -13.4], look: [-10.5, -16.5],
      text: 'Black steel pergolas with timber-slat roofs over booths along the low white perimeter wall (1.1 m with stone coping). Rattan cone pendants hang in each bay.' },
    { id: 'platform', title: 'Platform over the pool', at: [P.center[0] + 0.6, P.center[1] + 0.4], look: [-36, -14],
      text: 'A raised teak deck (+0.6 m) with frameless glass balustrade, steel posts and its own pergola, overlooking the hotel pool.' },
    { id: 'pods', title: 'Smoking pods', at: [-15.2, 4.2], look: [-8, 10],
      text: '189 m² of glazed pods: black-framed folding glass (RAL 9005, 24 mm grey DGU per spec), reed ceilings, sofa + armchair settings separated by glass partitions. Doors shown folded open.' },
    { id: 'deck', title: 'Beach deck – dining', at: [-19.5, 13.8], look: [-8, 16],
      text: '291 m² grey composite deck on the sand, rope swags on white posts, long dining tables. Steps lead down to the beach.' },
    { id: 'beach', title: 'On the beach', at: [-6, 22.5], look: [-6, 12],
      text: 'Down the deck steps onto the sand: the venue from the shore. The deck with its rope swags and white posts, the glazed pods behind it and the drum of the upper floor above; the Gulf at your back.' },
    { id: 'sunbeds', title: 'Sunbeds & the Gulf', at: [7.5, 17.4], look: [13, 23],
      text: 'Sunbed pairs line the seaward edge. Across the water: the Abu Dhabi skyline (indicative massing) lighting up at dusk.' },
    { id: 'indoor', title: 'Indoor dining', at: [3.6, 1.8], look: [8.5, -1.5],
      text: '532 m² indoor seating & kitchen. Reed ceiling at 3.4 m with radial timber poles, round tables with tub chairs either side of a planter arc, globe pendant clusters.' },
    { id: 'bar', title: 'Bar', at: [11.4, 8.4], look: [15.2, 8.6],
      text: 'Curved timber-slat bar with a marble top and stools; back-of-house beyond.' },
    { id: 'lounge', title: 'Coffered lounge', at: [11.6, -1.6], look: [D.center[0], D.center[1] + 3],
      text: 'The lounge under the white coffer ring with a warm cove light, edged by a low wall with columns.' },
    { id: 'stair', title: 'Stair to the upper floor', at: st.lobby, look: [st.lobby[0] + st.climb[0] * 6, st.lobby[1] + st.climb[1] * 6],
      text: 'Back out to the arrival court and in through the arched door, then left and up: about 24 terracotta risers in three flights, the stone-clad wall on your right and white plaster on your left (video 2). At the top the glazed landing with the iron balustrade, and right into the drum. Position is assumed — confirm on site.' },
    { id: 'upstairs', title: 'Upper floor (stripped)', at: [D.center[0] - 3.5, D.center[1] - 4.5], look: [D.center[0] - 12, D.center[1] + 3],
      text: 'The former Chi-Chi\'s restaurant: a 24-bay drum with pointed-arch windows, an inner ring of 12 columns and a central dome (Chi Chi.pdf). Currently stripped — the shell for the next design phase.' },
  ];
};

export class Tour extends EventTarget {
  constructor(V, venue, nav, scene) {
    super();
    this.V = V; this.venue = venue; this.nav = nav; this.scene = scene;
    this.stops = STOPS(V, venue);
    this.i = 0; this.playing = false; this.dwell = 0; this.s = 0;
    this.group = new THREE.Group(); this.group.name = 'tour'; scene.add(this.group);
    this._plan();
    this._buildRibbon();
  }

  _nearest(p) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.path.length; i++) {
      const d = Math.hypot(this.path[i][0] - p[0], this.path[i][1] - p[1]) + Math.abs(this.heights[i] - this.nav.foot) * 4;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // position and floor height at distance s along the route, between the 0.2 m samples (so the walk glides)
  _at(s) {
    const d = this.dist, hi = this._indexAt(s), lo = Math.max(0, hi - 1);
    const t = hi === lo ? 0 : Math.min(1, Math.max(0, (s - d[lo]) / (d[hi] - d[lo] || 1)));
    const A = this.path[lo], B = this.path[hi];
    return { p: [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], h: this.heights[lo] + (this.heights[hi] - this.heights[lo]) * t };
  }

  // ------------------------------------------------------------------ path planning
  _plan() {
    const pts = [], hs = [], stopS = [];
    let ref = this.venue.floorAt(...this.stops[0].at);
    let total = 0;
    for (let k = 0; k < this.stops.length; k++) {
      const st = this.stops[k];
      st.ref = st.id === 'upstairs' ? this.V.heights.upper_floor : undefined;
      if (k === 0) { pts.push(st.at); hs.push(ref); stopS.push(0); continue; }
      let leg = this._astar(pts[pts.length - 1], hs[hs.length - 1], st.at, st.ref);
      if (!leg) { console.warn('tour: no walkable route to', st.id); leg = [null, { p: st.at, h: this.venue.floorAt(st.at[0], st.at[1], st.ref) ?? hs[hs.length - 1] }]; }
      for (const n of leg.slice(1)) {
        const prev = pts[pts.length - 1]; total += Math.hypot(n.p[0] - prev[0], n.p[1] - prev[1]);
        pts.push(n.p); hs.push(n.h);
      }
      stopS.push(total);
    }
    // dense resample with heights re-evaluated along the line (stairs read as steps)
    const dense = [], dh = [], ds = [];
    let s = 0; ref = hs[0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 0.2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const p = [a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)];
        const h = this.venue.floorAt(p[0], p[1], ref) ?? ref; ref = h;
        dense.push(p); dh.push(h); ds.push(s + L * (k / n));
      }
      s += L;
    }
    this.path = dense; this.heights = dh; this.dist = ds; this.length = s; this.stopS = stopS;
    // the route must stay walkable with the folding doors closed: it may only cross them at a pass door (layout.js)
    for (let i = 1; i < dense.length; i++) for (const c of this.nav.grid.near(dense[i], 0.6)) {
      if (c.closedOnly && c.z0 < dh[i] + 1.6 && c.z1 > dh[i] + 0.3 && segSegDist(dense[i - 1], dense[i], c.a, c.b) === 0) { console.warn('tour: the route crosses closed folding doors at', dense[i].map((v) => +v.toFixed(2)), '— add a pass door there (layout.js)'); break; }
    }
  }

  _blocked(a, b, h) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const c of this.nav.grid.near(mid, CLEAR + 0.4)) {
      // folding doors are open for the plan — except the ones the walk should never use (c.guide, layout.js); where
      // it crosses the others, a pass door in them stands open when they're closed (builder.js)
      if ((c.closedOnly && !c.guide) || c.z1 < h + BODY_LO || c.z0 > h + BODY_HI) continue;
      if (segSegDist(a, b, c.a, c.b) < CLEAR) return true;
    }
    return false;
  }

  _astar(start, h0, goal, goalRef) {
    const key = (i, j, lv) => `${i},${j},${lv}`;
    const toCell = (p) => [Math.round(p[0] / CELL), Math.round(p[1] / CELL)];
    const [si, sj] = toCell(start), [gi, gj] = toCell(goal);
    const lvl = (h) => (h > 2 ? 1 : 0);
    const open = new MinHeap(); const came = new Map(); const g = new Map(); const hgt = new Map();
    const sk = key(si, sj, lvl(h0)); g.set(sk, 0); hgt.set(sk, h0);
    open.push([Math.hypot(gi - si, gj - sj) * CELL, sk, si, sj, h0]);
    const goalLvl = lvl(this.venue.floorAt(goal[0], goal[1], goalRef) ?? 0);
    let found = null, guard = 0;
    while (open.size && guard++ < 260000) {
      const [, k, i, j, h] = open.pop();
      if (i === gi && j === gj && lvl(h) === goalLvl) { found = k; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj; const a = [i * CELL, j * CELL], b = [ni * CELL, nj * CELL];
        const nh = this.venue.floorAt(b[0], b[1], h);
        if (nh === null || nh - h > STEP || h - nh > 1.2) continue;
        if (this._blocked(a, b, Math.max(h, nh))) continue;
        const nk = key(ni, nj, lvl(nh));
        const cost = g.get(k) + Math.hypot(di, dj) * CELL * (nh < -0.1 ? 1.6 : 1);   // mild penalty for walking on sand
        if (cost < (g.get(nk) ?? Infinity)) {
          g.set(nk, cost); came.set(nk, [k, a, h]); hgt.set(nk, nh);
          open.push([cost + Math.hypot(gi - ni, gj - nj) * CELL, nk, ni, nj, nh]);
        }
      }
    }
    if (!found) return null;
    // walk back
    const chain = []; let k = found;
    while (k) {
      const [i, j] = k.split(',').map(Number); chain.push({ p: [i * CELL, j * CELL], h: hgt.get(k) });
      k = came.get(k)?.[0];
    }
    chain.reverse();
    chain[0] = { p: start, h: h0 }; chain[chain.length - 1] = { ...chain[chain.length - 1], p: goal };
    // string-pulling: keep a node only if the straight shot from the last kept node is not clear
    const out = [chain[0]]; let anchor = 0;
    for (let t = 2; t < chain.length; t++) {
      if (!this._clearLine(chain[anchor], chain[t])) { out.push(chain[t - 1]); anchor = t - 1; }
    }
    out.push(chain[chain.length - 1]);
    out.ok = true;
    return out;
  }
  _clearLine(A, B) {
    const L = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]); const n = Math.max(1, Math.ceil(L / 0.2));
    let h = A.h; let prev = A.p;
    for (let k = 1; k <= n; k++) {
      const p = [A.p[0] + (B.p[0] - A.p[0]) * (k / n), A.p[1] + (B.p[1] - A.p[1]) * (k / n)];
      const nh = this.venue.floorAt(p[0], p[1], h);
      if (nh === null || nh - h > STEP || h - nh > 0.6) return false;
      if (this._blocked(prev, p, Math.max(h, nh))) return false;
      h = nh; prev = p;
    }
    return Math.abs(h - B.h) < 0.3;
  }

  // ------------------------------------------------------------------ floor ribbon + stop markers
  _buildRibbon() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 64, 128);
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(12, 84); g.lineTo(32, 52); g.lineTo(52, 84); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const pos = [], uv = [], idx = [];
    const W = 0.42;
    for (let i = 0; i < this.path.length; i++) {
      const p = this.path[i], q = this.path[Math.min(i + 1, this.path.length - 1)], o = this.path[Math.max(i - 1, 0)];
      let tx = q[0] - o[0], ty = q[1] - o[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty * W / 2, ny = tx * W / 2, y = this.heights[i] + 0.035;
      pos.push(p[0] + nx, y, -(p[1] + ny), p[0] - nx, y, -(p[1] - ny));
      uv.push(0, this.dist[i] / 0.9, 1, this.dist[i] / 0.9);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    this.ribbonMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffa95e, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
    const ribbon = new THREE.Mesh(geo, this.ribbonMat); ribbon.renderOrder = 5; this.group.add(ribbon);
    // stop markers: soft ring + number
    this.markers = this.stops.map((st, k) => {
      const i = this._indexAt(this.stopS[k]); const p = this.path[i], h = this.heights[i];
      const m = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({ color: 0xffa95e, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; m.add(ring);
      const spr = numberSprite(k + 1); spr.position.y = 1.0; m.add(spr);
      m.position.set(p[0], h, -p[1]); this.group.add(m); return m;
    });
  }
  _indexAt(s) { let lo = 0, hi = this.dist.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (this.dist[m] < s) lo = m + 1; else hi = m; } return lo; }

  // ------------------------------------------------------------------ control
  setVisible(v) { this.group.visible = v; }
  goTo(k, animate = true) {
    this.i = Math.max(0, Math.min(this.stops.length - 1, k)); this.s = this.stopS[this.i];
    const st = this.stops[this.i]; this.playing = false; this.dwell = 0;
    this.nav.teleport(this.path[this._indexAt(this.s)], st.look, animate, this.heights[this._indexAt(this.s)]);
    this._emit();
  }
  next() { this.goTo(this.i + 1); }
  prev() { this.goTo(this.i - 1); }
  play() {
    if (this.i >= this.stops.length - 1 && this.s >= this.length - 0.01) this.goTo(0, false);
    // resume from the nearest point on the route
    const best = this._nearest(this.nav.pos), bd = Math.hypot(this.path[best][0] - this.nav.pos[0], this.path[best][1] - this.nav.pos[1]) + Math.abs(this.heights[best] - this.nav.foot) * 4;
    if (bd > 2.5) { this.nav.teleport(this.path[best], this.path[Math.min(best + 8, this.path.length - 1)], true, this.heights[best]); }
    this.s = this.dist[best]; this.playing = true; this.dwell = 0; this.nav.setMode('walk');
    this._emit();
  }
  pause() { this.playing = false; this._emit(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  update(dt) {
    this.ribbonMat.map.offset.y -= dt * 0.9;
    for (const m of this.markers) m.children[0].material.opacity = 0.55 + 0.35 * Math.sin(performance.now() / 300);
    if (!this.playing || this.nav.tween) return;
    const nav = this.nav;
    const nextStop = this.stopS.findIndex((s) => s > this.s + 0.01);
    if (this.dwell > 0) {                                   // pausing at a stop, turning to its view
      this.dwell -= dt;
      const st = this.stops[this.i];
      this._turnTo(st.look, dt, 2.2);
      if (this.dwell <= 0 && this.i >= this.stops.length - 1) { this.playing = false; this._emit(); }
      return;
    }
    const speed = 1.35;
    this.s = Math.min(this.s + speed * dt, this.length);
    if (nextStop >= 0 && this.s >= this.stopS[nextStop]) {
      this.s = this.stopS[nextStop]; this.i = nextStop; this.dwell = 6.5; this._emit();
    }
    const here = this._at(this.s);
    nav.pos = here.p;
    nav.foot += (here.h - nav.foot) * Math.min(1, dt * 10);
    const ahead = this._at(Math.min(this.s + 2.2, this.length)).p;
    if (Math.hypot(ahead[0] - nav.pos[0], ahead[1] - nav.pos[1]) > 0.3) this._turnTo(ahead, dt, 2.6);
    const climb = this._at(Math.min(this.s + 1.5, this.length)).h - here.h;
    nav.pitch += (Math.max(-0.2, Math.min(0.25, climb * 0.25)) - 0.04 - nav.pitch) * Math.min(1, dt * 2);
    nav._applyCamera();
  }
  _turnTo(target, dt, rate) {
    const nav = this.nav; const dx = target[0] - nav.pos[0], dy = target[1] - nav.pos[1];
    const yaw = Math.atan2(-dx, dy); let d = Math.atan2(Math.sin(yaw - nav.yaw), Math.cos(yaw - nav.yaw));
    nav.yaw += d * Math.min(1, dt * rate);
    nav.pitch += (-0.05 - nav.pitch) * Math.min(1, dt * 2);
    nav._applyCamera();
  }
  _emit() { this.dispatchEvent(new CustomEvent('change', { detail: { i: this.i, stop: this.stops[this.i], playing: this.playing, n: this.stops.length } })); }
}

// ------------------------------------------------------------------ helpers
function segSegDist(a, b, c, d) {
  if (segIntersect(a, b, c, d)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
function ptSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function segIntersect(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
function numberSprite(n) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = '600 30px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false })); s.scale.set(0.42, 0.42, 1); s.renderOrder = 9; return s;
}
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}
