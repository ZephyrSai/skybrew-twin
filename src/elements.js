// Element overrides: any wall-like CAD solid (wall, partition, low wall, planter, sill, column, generated wall)
// can be switched to glass. The glass is built along the element's centreline from the venue's own
// "Glazing" and "Glazing frames" surfaces, so it inherits their finish (clear / grey reflective glass,
// black / bronze / brass frames per theme) and renders see-through and reflective in both the realtime view
// and photo mode. Mullions every ~1.2 m plus a head and a base rail, like the rest of the glazing.
// Defaults: walls the CAD draws solid but the site video shows as glass (DEFAULT_GLASS).
import * as THREE from 'three';
import * as G from './geom.js';
import { surfaceMaterial } from './materials.js';

// near: a plan point on the element; why: the evidence. Resolved to the nearest element at start-up.
export const DEFAULT_GLASS = [
  { near: [11.4, 12.1], kind: 'wall', why: 'bar, sea side: floor-to-ceiling glazing in video 1 and photo GF03 ("keep the sea-view windows")' },
  { near: [-1.92, -4.2], kind: 'gen_wall', why: 'the building corner where the glass passage to the entrance starts: glazed in video 1 (client notes, 26 Oct)' },
];

const len2 = (v) => Math.hypot(v[0], v[1]);
// centreline of a thin polygon: cut it across its principal axis every 10 cm and take the mid-points
export function centreline(outer) {
  const a = G.principalAngle(outer), u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], c = G.centroid(outer);
  const proj = outer.map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]);
  const lo = Math.min(...proj), hi = Math.max(...proj), mids = [], widths = [];
  let prev = null;
  for (let t = lo + 0.04; t <= hi - 0.04; t += 0.1) {
    const p = [c[0] + u[0] * t, c[1] + u[1] * t], ts = G.lineCuts(p, v, outer).sort((x, y) => x - y);
    if (ts.length < 2) continue;
    let best = null;                                    // pick the pair of cuts nearest the previous mid-point
    for (let k = 0; k + 1 < ts.length; k += 2) {
      const m = [p[0] + v[0] * (ts[k] + ts[k + 1]) / 2, p[1] + v[1] * (ts[k] + ts[k + 1]) / 2];
      const d = prev ? len2([m[0] - prev[0], m[1] - prev[1]]) : 0;
      if (!best || d < best.d) best = { m, d, w: ts[k + 1] - ts[k] };
    }
    if (prev && best.d > 0.6) continue;                // a separate branch of a complex outline: skip
    mids.push(best.m); widths.push(best.w); prev = best.m;
  }
  const w = widths.length ? widths.reduce((s, x) => s + x, 0) / widths.length : 0;
  return { pts: mids, width: w };
}

export class Elements extends EventTarget {
  constructor(venue) {
    super();
    this.venue = venue;
    this.list = venue.elements; this.byKey = new Map(this.list.map((e) => [e.key, e]));
    this.glass = new Map();                             // key -> THREE.Group (built on first use)
    this.state = {};                                    // key -> 'glass'
    this.defaults = {};
    for (const d of DEFAULT_GLASS) {
      let best = null, bd = 1e9;
      for (const e of this.list) { if (d.kind && e.kind !== d.kind) continue; const dd = G.inside(d.near, e.outer) ? 0 : G.ringDist(d.near, e.outer); if (dd < bd) { bd = dd; best = e; } }
      if (best && bd < 0.8) this.defaults[best.key] = 'glass';
    }
  }
  label(key) { const e = this.byKey.get(key); return e ? e.label : key; }
  isGlass(key) { return this.state[key] === 'glass'; }
  toggle(key) { this.set(key, this.isGlass(key) ? 'wall' : 'glass'); }
  // replace the whole override map (profiles / reset); missing keys revert to wall
  apply(map) {
    for (const k of Object.keys(this.state)) if (!map[k]) this._set(k, 'wall');
    for (const [k, m] of Object.entries(map)) this._set(k, m);
    this.dispatchEvent(new CustomEvent('change'));
  }
  set(key, mode) { this._set(key, mode); this.dispatchEvent(new CustomEvent('change', { detail: key })); }
  overrides() { return { ...this.state }; }
  _set(key, mode) {
    const e = this.byKey.get(key); if (!e) return;
    const on = mode === 'glass';
    if (on) this.state[key] = 'glass'; else delete this.state[key];
    for (const m of e.meshes || []) m.visible = !on;
    if (on && !this.glass.has(key)) this.glass.set(key, this._build(e));
    const g = this.glass.get(key); if (g) g.visible = on;
  }
  meshes() { const out = []; for (const g of this.glass.values()) g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; }

  _build(e) {
    const glass = surfaceMaterial('glazing'), frames = surfaceMaterial('frames');
    const z0 = e.z0, z1 = e.z1;
    let line = e.path || null, w = 0.06;
    if (!line) { const cl = centreline(e.outer); if (cl.pts.length >= 2 && cl.width < 0.7) { line = cl.pts; w = Math.min(0.12, Math.max(0.05, cl.width * 0.4)); } }
    const panes = [], fr = [];
    if (line) {
      const { pts } = G.resample(line, 1.2);
      for (let i = 1; i < pts.length; i++) panes.push(G.pane(pts[i - 1], pts[i], z0, z1));
      for (const p of pts) fr.push(G.post(p, w, z0, z1, w));
      fr.push(G.wall(pts, w + 0.02, z1 - 0.08, z1), G.wall(pts, w + 0.02, z0, z0 + 0.08));
      if (z1 - z0 > 2.8) fr.push(G.wall(pts, w, z0 + 2.3, z0 + 2.36));                   // transom, as the venue's tall glazing
    } else {
      panes.push(G.prism(e.outer, e.holes, z0, z1));                                     // irregular outline: a solid glass block
      fr.push(G.prism(e.outer, e.holes, z1 - 0.06, z1), G.prism(e.outer, e.holes, z0, z0 + 0.06));
    }
    const grp = new THREE.Group(); grp.name = `element_glass_${e.tag}`;
    const gm = new THREE.Mesh(G.merge(panes), glass); gm.renderOrder = 2; gm.userData = { surface: 'glazing', element: e.key };
    const fm = new THREE.Mesh(G.merge(fr), frames); fm.castShadow = true; fm.receiveShadow = true; fm.userData = { surface: 'frames', element: e.key };
    grp.add(gm, fm);
    this.venue.groups[e.group].add(grp);
    return grp;
  }
}
