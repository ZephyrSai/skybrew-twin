// The city around the venue, from OpenStreetMap footprints + heights (ODbL), dressed so it reads as a real
// skyline rather than white blocks:
//   * facades textured by real size: floor lines, window bays and mullions, so a 30-storey tower shows
//     30 storeys. Towers get tinted reflective curtain walls; low- and mid-rise get punched windows in
//     plaster of the Gulf palette;
//   * parapets, rooftop plant on large roofs, setback crowns and masts on the tallest towers;
//   * windows light up at dusk, each building differently;
//   * the landscape from OSM too (osm_landscape.json): real land and water from the coastline with a stone
//     quay edge, parks, sand, parking, pools, roads by class, ramped bridges on piers, street trees and
//     park trees, street lights, and a sodium glow on the roads at night. Without it, land pads with
//     promenade palms stand in.
// Everything merges into a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fixedMaterial } from './materials.js';

const GLASS_TINTS = ['#7fa3b6', '#86a89c', '#9aa4aa', '#a3907a', '#5e7482', '#b4c0c4', '#6d8a9a'];
const PLASTER_TINTS = ['#f1ece2', '#e9dfcc', '#dccbb0', '#efe9e0', '#d9d3c8', '#e6d6bd', '#cbb89c', '#f3efe8'];
const ROOF_TINTS = ['#bdb6aa', '#a9a49b', '#c8c1b4', '#9d9b96'];
// one texture tile = 4 bays × 4 floors
const GLASS = { bayW: 3.0, floorH: 3.8 }, PLASTER = { bayW: 3.6, floorH: 3.3 };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function canvas(n, draw) {
  const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d', { willReadFrequently: true }), n);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Facade tiles are painted near-white so per-building vertex colours can tint them.
function glassTextures() {
  const r = rng(201);
  const map = canvas(512, (g, n) => {
    const b = n / 4;
    g.fillStyle = '#d8dcdd'; g.fillRect(0, 0, n, n);                       // mullions / transoms
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * b, y = fy * b;
      g.fillStyle = '#9aa3a8'; g.fillRect(x + 3, y + b * 0.78, b - 6, b * 0.2);   // spandrel band
      for (let k = 0; k < 2; k++) {                                        // two lites per bay, slightly uneven reflection
        const v = 150 + Math.floor((r() - 0.5) * 26);
        g.fillStyle = `rgb(${v - 6},${v + 4},${v + 12})`; g.fillRect(x + 3 + k * (b / 2 - 1), y + 3, b / 2 - 5, b * 0.74);
      }
    }
  });
  const em = canvas(512, (g, n) => {
    const b = n / 4; g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) for (let k = 0; k < 2; k++) {
      if (r() > 0.24) continue;
      g.fillStyle = r() < 0.75 ? '#ffd7a0' : '#eef2ff';
      g.globalAlpha = 0.55 + r() * 0.45; g.fillRect(bx * b + 3 + k * (b / 2 - 1), fy * b + 3, b / 2 - 5, b * 0.74);
    }
    g.globalAlpha = 1;
  });
  return { map, em };
}
function plasterTextures() {
  const r = rng(301);
  const map = canvas(512, (g, n) => {
    const b = n / 4;
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.035})`; g.fillRect(r() * n, r() * n, 2 + r() * 6, 2 + r() * 6); }
    for (let fy = 0; fy < 4; fy++) {
      g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, fy * b + b - 5, n, 5);      // floor-slab line
      for (let bx = 0; bx < 4; bx++) {
        const x = bx * b + b * 0.2, y = fy * b + b * 0.18, w = b * 0.6, h = b * 0.56;
        g.fillStyle = '#c9c4ba'; g.fillRect(x - 3, y - 3, w + 6, h + 8);         // frame + sill
        const v = 104 + Math.floor(r() * 34);                                  // glass reflects the sky: not black holes
        g.fillStyle = `rgb(${v},${v + 8},${v + 16})`; g.fillRect(x, y, w, h);     // glass
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + w / 2 - 1, y, 2, h);
        if (r() < 0.3) { g.fillStyle = 'rgba(40,30,20,0.25)'; g.fillRect(x, y, w, h * (0.3 + r() * 0.5)); }   // blinds
      }
    }
  });
  const em = canvas(512, (g, n) => {
    const b = n / 4; g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      if (r() > 0.3) continue;
      g.fillStyle = r() < 0.8 ? '#ffcf8f' : '#f0f4ff'; g.globalAlpha = 0.5 + r() * 0.5;
      g.fillRect(bx * b + b * 0.2, fy * b + b * 0.18, b * 0.6, b * 0.56);
    }
    g.globalAlpha = 1;
  });
  return { map, em };
}
function noiseTexture(seed, base, spots) {
  const r = rng(seed);
  return canvas(256, (g, n) => {
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (const [col, count, size] of spots) for (let i = 0; i < count; i++) { g.fillStyle = col; g.globalAlpha = 0.15 + r() * 0.35; g.fillRect(r() * n, r() * n, size * (0.4 + r()), size * (0.4 + r())); }
    g.globalAlpha = 1;
  });
}

const signedArea = (ring) => { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const ccw = (ring) => (signedArea(ring) < 0 ? [...ring].reverse() : ring);
function inside(p, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// geometry writer: non-indexed triangles with position / normal / uv / colour
class Writer {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  tri(a, b, c, n, ua, ub, uc, col) {
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u[0], u[1]); this.c.push(col.r, col.g, col.b); }
  }
  // vertical wall band along a CCW ring, outward-facing, uv in metres / tile
  walls(ring, z0, z1, tileW, tileH, u0, v0, col) {
    let s = u0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 0.05) continue;
      const n = [(y2 - y1) / len, 0, (x2 - x1) / len];
      const A0 = [x1, z0, -y1], B0 = [x2, z0, -y2], B1 = [x2, z1, -y2], A1 = [x1, z1, -y1];
      const ua = s / tileW, ub = (s + len) / tileW, va = (z0 + v0) / tileH, vb = (z1 + v0) / tileH;
      this.tri(A0, B0, B1, n, [ua, va], [ub, va], [ub, vb], col);
      this.tri(A0, B1, A1, n, [ua, va], [ub, vb], [ua, vb], col);
      s += len;
    }
  }
  cap(ring, z, uvScale, col, holes = []) {
    const pts = ring.map(([x, y]) => new THREE.Vector2(x, y)), hv = holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
    const all = ring.concat(...holes);
    const P = (i) => [all[i][0], z, -all[i][1]], U = (i) => [all[i][0] / uvScale, all[i][1] / uvScale];
    for (let [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, hv)) {
      // keep every triangle facing up (+Y), whatever order the triangulator returns
      const A = P(a), B = P(b), C = P(c);
      if ((B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]) < 0) [b, c] = [c, b];
      this.tri(P(a), P(b), P(c), [0, 1, 0], U(a), U(b), U(c), col);
    }
  }
  // a quad (A B C D in order round the edge) turned to face `want`
  quad(A, B, C, D, want, col, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const L = Math.hypot(...n) || 1; const nn = n.map((x) => x / L);
    if (nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0) { [B, D] = [D, B]; [uv[1], uv[3]] = [uv[3], uv[1]]; nn.forEach((x, i) => { nn[i] = -x; }); }
    this.tri(A, B, C, nn, uv[0], uv[1], uv[2], col); this.tri(A, C, D, nn, uv[0], uv[2], uv[3], col);
  }
  // road deck along a centreline whose height h(s) ramps up from both ends; sides, soffit and parapets
  bridge(pts, w, H, deck, side) {
    const L = []; let tot = 0;
    for (let i = 0; i < pts.length; i++) { if (i) tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(tot); }
    const R = Math.min(tot / 3, 130), h = (s) => 0.3 + (H - 0.3) * THREE.MathUtils.smoothstep(s, 0, R) * THREE.MathUtils.smoothstep(tot - s, 0, R);
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const len = Math.hypot(x2 - x1, y2 - y1); if (len < 0.2) continue;
      const nx = -(y2 - y1) / len * w / 2, ny = (x2 - x1) / len * w / 2, ha = h(L[i]), hb = h(L[i + 1]);
      const V = (x, y, z) => [x, z, -y];
      const aL = [x1 + nx, y1 + ny], aR = [x1 - nx, y1 - ny], bL = [x2 + nx, y2 + ny], bR = [x2 - nx, y2 - ny];
      const u0 = L[i] / 12, u1 = L[i + 1] / 12;
      deck.quad(V(...aL, ha), V(...aR, ha), V(...bR, hb), V(...bL, hb), [0, 1, 0], white, [[0, u0], [w / 12, u0], [w / 12, u1], [0, u1]]);
      side.quad(V(...aL, ha - 1.2), V(...aR, ha - 1.2), V(...bR, hb - 1.2), V(...bL, hb - 1.2), [0, -1, 0], white);
      for (const [p, q, sgn] of [[aL, bL, 1], [aR, bR, -1]]) {
        const want = [sgn * nx, 0, -sgn * ny];
        side.quad(V(...p, ha - 1.2), V(...q, hb - 1.2), V(...q, hb + 1.0), V(...p, ha + 1.0), want, white, [[u0, 0], [u1, 0], [u1, 0.18], [u0, 0.18]]);
      }
      for (let s = Math.ceil(L[i] / 36) * 36; s < L[i + 1]; s += 36) {          // piers
        const k = (s - L[i]) / len, hs = h(s);
        if (hs > 2.5) side.box(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, 1.8, w * 0.5, -2.5, hs - 1.2, Math.atan2(y2 - y1, x2 - x1), white);
      }
    }
  }
  box(cx, cy, w, d, z0, z1, rot, col) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ring = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
    this.walls(ring, z0, z1, 4, 4, 0, 0, col); this.cap(ring, z1, 4, col);
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

// a light, distance-friendly palm (the venue's own palms are the detailed ones)
function farPalmParts() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 8, 5, 1, true); trunk.translate(0, 4, 0);
  const fronds = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.PlaneGeometry(0.7, 3.2, 1, 3); const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k) + 1.6; pos.setZ(k, -0.16 * y * y); pos.setY(k, y); }
    g.rotateX(-0.9); g.rotateY((i / 7) * Math.PI * 2 + 0.3); g.translate(0, 7.9, 0); g.computeVertexNormals();
    fronds.push(g.toNonIndexed());
  }
  return [{ geo: trunk, mat: fixedMaterial('bark') }, { geo: mergeGeometries(fronds), mat: fixedMaterial('palm_frond') }];
}
function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d', { willReadFrequently: true });
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildCity(osm, { maxDist = 4200, keepClear = 80, landscape = null } = {}) {
  const group = new THREE.Group(); group.name = 'city';
  const r = rng(7);
  const glassW = new Writer(), plasterW = new Writer(), roofW = new Writer(), landW = new Writer(), quayW = new Writer();
  const blds = [];
  // grid index of footprints, for "is this spot inside a building?"
  const CELL = 60, grid = new Map();
  const key = (i, j) => `${i},${j}`;

  for (const b of osm.buildings) {
    if (b.outer.length < 3 || Math.hypot(b.outer[0][0], b.outer[0][1]) > maxDist) continue;
    const ring = ccw(b.outer);
    const h = Math.max(b.h, 3), z0 = Math.max(b.min, -0.5);
    const tower = h >= 36, glassy = tower && r() < 0.8;
    const spec = glassy ? GLASS : PLASTER;
    const col = new THREE.Color(glassy ? GLASS_TINTS[Math.floor(r() * GLASS_TINTS.length)] : PLASTER_TINTS[Math.floor(r() * PLASTER_TINTS.length)]);
    const roofCol = new THREE.Color(ROOF_TINTS[Math.floor(r() * ROOF_TINTS.length)]);
    const W = glassy ? glassW : plasterW;
    const u0 = Math.floor(r() * 4) * spec.bayW, v0 = Math.floor(r() * 4) * spec.floorH;   // vary the lit-window pattern
    W.walls(ring, z0, h, spec.bayW * 4, spec.floorH * 4, u0, v0, col);
    const parapet = tower ? 1.2 : 0.9;
    roofW.cap(ring, h - parapet, 8, roofCol);
    // the parapet's inner face
    W.walls([...ring].reverse(), h - parapet, h, spec.bayW * 4, spec.floorH * 4, 0, 0, col.clone().multiplyScalar(0.85));

    let cx = 0, cy = 0; for (const [x, y] of ring) { cx += x; cy += y; } cx /= ring.length; cy /= ring.length;
    const area = Math.abs(signedArea(ring));
    // rooftop plant / lift overruns
    if (area > 250 && h < 140) {
      const n = 1 + Math.floor(r() * Math.min(4, area / 400));
      const ang = Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0]);
      for (let k = 0; k < n; k++) {
        const ext = Math.sqrt(area) * 0.25, px = cx + (r() - 0.5) * ext, py = cy + (r() - 0.5) * ext;
        if (!inside([px, py], ring)) continue;
        roofW.box(px, py, 2.5 + r() * 5, 2.5 + r() * 4, h - parapet, h - parapet + 1.6 + r() * 2.4, ang, new THREE.Color('#d6d2ca').multiplyScalar(0.8 + r() * 0.2));
      }
    }
    // setback crown and mast on the tallest
    if (tower && h > 90 && area > 150) {
      const k = 0.62 + r() * 0.15, ch = Math.min(16, 4 + h * 0.05);
      const crown = ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
      W.walls(crown, h - parapet, h + ch, spec.bayW * 4, spec.floorH * 4, u0, v0, col.clone().multiplyScalar(0.92));
      roofW.cap(crown, h + ch, 8, roofCol);
      if (h > 160 && r() < 0.6) roofW.box(cx, cy, 1.2, 1.2, h + ch, h + ch + 14 + r() * 20, 0, new THREE.Color('#b9bcbf'));
    }
    const bb = ring.reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const idx = blds.push({ ring, h }) - 1;
    for (let i = Math.floor(bb[0] / CELL); i <= Math.floor(bb[2] / CELL); i++) for (let j = Math.floor(bb[1] / CELL); j <= Math.floor(bb[3] / CELL); j++) {
      const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(idx);
    }
  }
  const inBuilding = (p, pad = 0) => {
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const k of grid.get(key(Math.floor(p[0] / CELL) + di, Math.floor(p[1] / CELL) + dj)) || []) {
        if (inside(p, blds[k].ring)) return true;
        if (pad) for (const [ox, oy] of [[pad, 0], [-pad, 0], [0, pad], [0, -pad]]) if (inside([p[0] + ox, p[1] + oy], blds[k].ring)) return true;
      }
    }
    return false;
  };

  // without the OSM landscape: land pads across the channel, stone quay, promenade palms + street lights
  const palms = [], lamps = [];
  const stone = new THREE.Color('#cdbfa6'), ground = new THREE.Color('#ffffff');
  for (const pad of landscape ? [] : osm.land || []) {
    const ring = ccw(pad);
    landW.cap(ring, 0.6, 60, ground);
    quayW.walls(ring, -1.2, 0.6, 6, 1.8, 0, 1.2, stone);
    let carry = r() * 20;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 1) continue;
      const tx = (x2 - x1) / len, ty = (y2 - y1) / len, nx = -ty, ny = tx;         // inward normal (CCW)
      for (let s = carry; s < len; s += 22) {
        const p = [x1 + tx * s + nx * 6, y1 + ty * s + ny * 6];
        if (inside(p, ring) && !inBuilding(p, 2)) palms.push({ p, s: 0.8 + r() * 0.5, rot: r() * 6.28 });
        if (Math.round(s / 22) % 2 === 0) { const q = [x1 + tx * s + nx * 2.5, y1 + ty * s + ny * 2.5]; if (inside(q, ring)) lamps.push(q); }
      }
      carry = (carry + len) % 22;
    }
  }
  // the hotel side: palms round the buildings near the venue (keeps clear of the venue's own landscape)
  for (const b of landscape ? [] : blds) {
    const c0 = b.ring[0]; const d = Math.hypot(c0[0], c0[1]);
    if (d > 900 || c0[1] > 20) continue;
    for (let i = 0; i < b.ring.length; i++) {
      const [x1, y1] = b.ring[i], [x2, y2] = b.ring[(i + 1) % b.ring.length];
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 8) continue;
      const tx = (x2 - x1) / len, ty = (y2 - y1) / len, nx = ty, ny = -tx;          // outward normal (CCW)
      for (let s = 6; s < len - 4; s += 16) {
        const p = [x1 + tx * s + nx * 7, y1 + ty * s + ny * 7];
        if (Math.hypot(p[0], p[1]) < keepClear || p[1] > 4 || inBuilding(p, 3)) continue;
        palms.push({ p, s: 0.85 + r() * 0.45, rot: r() * 6.28 });
      }
    }
  }

  const facade = (W, tex, opts) => {
    const g = W.geometry(); if (!g) return null;
    const m = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.em, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, side: THREE.DoubleSide, ...opts });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; group.add(mesh); return m;
  };
  const glassMat = facade(glassW, glassTextures(), { roughness: 0.16, metalness: 0.55, envMapIntensity: 1.25 });
  const plasterMat = facade(plasterW, plasterTextures(), { roughness: 0.85, metalness: 0 });
  const roofGeo = roofW.geometry();
  if (roofGeo) group.add(new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: noiseTexture(401, '#ffffff', [['#8d877c', 260, 14], ['#ffffff', 120, 10]]), vertexColors: true, roughness: 0.92 })));
  const landGeo = landW.geometry();
  if (landGeo) group.add(new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({
    map: noiseTexture(402, '#c4bba9', [['#6b6b6b', 40, 60], ['#7f9152', 70, 40], ['#d8c9a8', 90, 36], ['#9c9384', 200, 14]]), vertexColors: true, roughness: 0.95,
  })));
  const quayGeo = quayW.geometry();
  if (quayGeo) group.add(new THREE.Mesh(quayGeo, new THREE.MeshStandardMaterial({ map: noiseTexture(403, '#ffffff', [['#8a7e68', 300, 8]]), vertexColors: true, roughness: 0.9 })));

  if (palms.length) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (const part of farPalmParts()) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, palms.length); im.castShadow = false; im.receiveShadow = false; im.name = 'city_palms';
      palms.forEach((pl, i) => {
        const onLand = pl.p[1] > 40 ? 0.6 : 0;
        im.setMatrixAt(i, m.compose(pos.set(pl.p[0], onLand, -pl.p[1]), q.setFromAxisAngle(Y, pl.rot), sc.set(pl.s, pl.s, pl.s)));
      });
      group.add(im);
    }
  }
  const lampMat = new THREE.PointsMaterial({ size: 3.2, map: glowSprite(), color: new THREE.Color('#ffc983').multiplyScalar(4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  if (lamps.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap(([x, y]) => [x, 9, -y]), 3));
    const pts = new THREE.Points(g, lampMat); pts.name = 'city_lamps'; pts.frustumCulled = false; group.add(pts);
  }

  const land = landscape ? buildLandscape(landscape, group, lampMat) : null;

  return {
    group, stats: { buildings: blds.length, palms: palms.length, lamps: lamps.length, ...(land?.stats || {}) },
    // 0 = day … 1 = night: lit windows, street lights, road glow
    setNight(k) {
      if (glassMat) glassMat.emissiveIntensity = 0.75 * THREE.MathUtils.smoothstep(k, 0.3, 0.9);
      if (plasterMat) plasterMat.emissiveIntensity = 0.65 * THREE.MathUtils.smoothstep(k, 0.35, 0.9);
      lampMat.opacity = THREE.MathUtils.smoothstep(k, 0.35, 0.8);
      land?.setNight(k);
    },
  };
}

// ------------------------------------------------------------------ OSM landscape (pipeline/osm_landscape.py)
function surfaceTex(seed, base, draw, tileM) {
  const r = rng(seed);
  const t = canvas(256, (g, n) => { g.fillStyle = base; g.fillRect(0, 0, n, n); draw(g, n, r); });
  t.userData.cityTile = tileM; return t;
}
function buildLandscape(L, group, lampMat) {
  const white = new THREE.Color('#ffffff');
  // all ground layers sit at the same height; polygon offset (in depth-buffer units, so it holds at any
  // distance) decides which one shows: land < sand < grass < parking/plaza < pools < paths < minor < major
  const layer = (mat, units) => { const m = mat.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = units; return m; };
  const asphalt = (seed, base) => surfaceTex(seed, base, (g, n, r) => {
    for (let i = 0; i < 2600; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${r() * 0.06})`; g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; g.beginPath(); g.ellipse(r() * n, r() * n, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, 7); g.fill(); }
  }, 12);
  const mats = {
    // land sits a hair over the CAD site's lawn/sand where they overlap at the edge of the site
    land: layer(new THREE.MeshStandardMaterial({ roughness: 0.95, map: surfaceTex(501, '#cbc2b0', (g, n, r) => {
      g.strokeStyle = 'rgba(90,80,60,0.18)'; g.lineWidth = 1;
      for (let k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(k * n / 8, 0); g.lineTo(k * n / 8, n); g.moveTo(0, k * n / 8); g.lineTo(n, k * n / 8); g.stroke(); }
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,50,40' : '255,250,240'},${r() * 0.08})`; g.fillRect(r() * n, r() * n, 2 + r() * 14, 2 + r() * 14); }
    }, 16) }), -1),
    sand: layer(fixedMaterial('sand'), -2), grass: layer(fixedMaterial('lawn'), -3),
    parking: layer(new THREE.MeshStandardMaterial({ roughness: 0.9, map: surfaceTex(502, '#55575a', (g, n, r) => {
      g.fillStyle = 'rgba(235,235,235,0.55)'; for (let k = 0; k < 8; k++) g.fillRect(k * n / 8, n * 0.1, 2, n * 0.35);
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * n, r() * n, 2, 2); }
    }, 20) }), -4),
    plaza: layer(fixedMaterial('limestone_fixed'), -4), pool: layer(fixedMaterial('pool'), -5),
    path: layer(new THREE.MeshStandardMaterial({ roughness: 0.85, map: surfaceTex(503, '#d6cfc2', (g, n, r) => {
      g.strokeStyle = 'rgba(80,70,60,0.22)'; for (let k = 0; k <= 16; k++) { g.beginPath(); g.moveTo(k * n / 16, 0); g.lineTo(k * n / 16, n); g.moveTo(0, k * n / 16); g.lineTo(n, k * n / 16); g.stroke(); }
    }, 4) }), -6),
    minor: layer(new THREE.MeshStandardMaterial({ roughness: 0.88, map: asphalt(504, '#5d5f62'), emissive: '#ffae5c', emissiveIntensity: 0 }), -7),
    major: layer(new THREE.MeshStandardMaterial({ roughness: 0.85, map: asphalt(505, '#4b4d50'), emissive: '#ffae5c', emissiveIntensity: 0 }), -8),
  };
  // our surface textures repeat once per cityTile metres; the venue's fixed materials already carry their repeat (uv = metres)
  const uvOf = (m) => m.map?.userData.cityTile || 1;
  const writers = {};
  const put = (key, polys) => {
    const W = (writers[key] ||= new Writer());
    const s = uvOf(mats[key]);
    for (const [outer, ...holes] of polys || []) if (outer.length >= 3) W.cap(outer, 0, s, white, holes);
  };
  put('land', L.land);
  for (const [k, polys] of Object.entries(L.areas || {})) if (mats[k]) put(k, polys);
  for (const [k, polys] of Object.entries(L.roads || {})) if (mats[k]) put(k, polys);
  // stone quay round every shore (the land's outline), from below the waterline to the ground
  const quay = new Writer();
  for (const [outer, ...holes] of L.land || []) {
    // outline anticlockwise and lake holes clockwise, so every wall faces the water
    for (const ring of [ccw(outer), ...holes.map((h) => ccw(h).reverse())]) quay.walls(ring, -1.4, 0, 6, 1.8, 0, 1.4, new THREE.Color('#cdbfa6'));
  }
  for (const [k, W] of Object.entries(writers)) {
    const g = W.geometry(); if (!g) continue;
    const m = new THREE.Mesh(g, mats[k]); m.name = `land_${k}`; m.receiveShadow = true; group.add(m);
  }
  const qg = quay.geometry();
  if (qg) group.add(new THREE.Mesh(qg, new THREE.MeshStandardMaterial({ map: noiseTexture(403, '#d2c4aa', [['#8a7e68', 300, 8]]), roughness: 0.9, side: THREE.DoubleSide })));
  // bridges and flyovers
  const deck = new Writer(), sides = new Writer();
  for (const b of L.bridges || []) if (b.pts.length > 1) deck.bridge(b.pts, b.w, b.h, deck, sides);
  const concrete = new THREE.MeshStandardMaterial({ color: '#c9c6bf', roughness: 0.85, map: noiseTexture(506, '#ffffff', [['#8f8b84', 220, 10]]) });
  const dg = deck.geometry(), sg = sides.geometry();
  if (dg) group.add(new THREE.Mesh(dg, mats.major));
  if (sg) group.add(new THREE.Mesh(sg, concrete));

  // trees: date palms on the streets, a mix in the parks
  const palms = [], broad = [];
  for (const [x, y, kind, s] of L.trees || []) (kind === 0 ? palms : broad).push([x, y, s]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const r = rng(29);
  const plant = (parts, list, name) => {
    if (!list.length) return;
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      im.name = name; im.castShadow = false; im.receiveShadow = false;
      im.userData.photoMaxDist = 500;                     // photo mode only traces the near ones
      list.forEach(([x, y, s], i) => im.setMatrixAt(i, m4.compose(pos.set(x, 0, -y), q.setFromAxisAngle(Y, r() * 6.28), sc.set(s, s * (0.9 + r() * 0.25), s))));
      group.add(im);
    }
  };
  plant(farPalmParts(), palms, 'osm_palms');
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 3, 5, 1, true); trunk.translate(0, 1.5, 0);
  const crown = new THREE.IcosahedronGeometry(2.3, 1); crown.scale(1, 0.82, 1); crown.translate(0, 4.1, 0);
  plant([{ geo: trunk, mat: fixedMaterial('bark') }, { geo: crown, mat: new THREE.MeshStandardMaterial({ color: '#58743b', roughness: 0.95, flatShading: true }) }], broad, 'osm_trees');

  if (L.lamps?.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(L.lamps.flatMap(([x, y]) => [x, 9, -y]), 3));
    const pts = new THREE.Points(g, lampMat); pts.name = 'osm_lamps'; pts.frustumCulled = false; group.add(pts);
  }
  return {
    stats: { trees: palms.length + broad.length, streetLights: L.lamps?.length || 0, bridges: L.bridges?.length || 0 },
    setNight(k) { const g = THREE.MathUtils.smoothstep(k, 0.4, 0.9); mats.major.emissiveIntensity = 0.1 * g; mats.minor.emissiveIntensity = 0.05 * g; },
  };
}
