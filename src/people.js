// People: a crowd of stylised figures (the faceless "entourage" architects use) that either hold still or live.
//   * seated on the plan's own chairs, armchairs, sofas, bar stools and (by day) sunbeds;
//   * standing at the ground-floor bar, the first-floor bar and the high tables, most with a beer;
//   * walking the guided-walk route (courtyard, restobar, deck, the stair and the first floor);
//   * dancing on the first-floor dance floor and a DJ at the decks (themes; from sunset), a singer on the stage.
// Modes: 'off' | 'static' (frozen mid-gesture) | 'animated'. Density: 'light' | 'busy' | 'packed'.
// One InstancedMesh per body part (12 draw calls for the whole crowd); per-person clothes / skin / hair through
// instanceColor; poses from a tiny forward-kinematics rig (YXZ Euler per joint), evaluated every frame when
// animated or once when static. Photo mode traces them like any instanced mesh (instance colours carried over).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { orient } from './furniture.js';
import * as G from './geom.js';

export const PEOPLE_MODES = [['off', 'Off'], ['static', 'Static'], ['animated', 'Animated']];
export const CROWD_LEVELS = [['light', 'Light'], ['busy', 'Busy'], ['packed', 'Packed']];
const DENSITY = { light: { seat: 0.3, walk: 8, dance: 16, stand: 0.45 }, busy: { seat: 0.58, walk: 16, dance: 36, stand: 0.75 }, packed: { seat: 0.85, walk: 26, dance: 64, stand: 1 } };
export const BPM = 124;                                    // the DJ's tempo: dancers and the club lights share it
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ palettes (sRGB)
const PAL = {
  top: ['#f4f1ea', '#e9e4d8', '#1f2328', '#2b3a55', '#5d6b45', '#b5532f', '#8fb3d1', '#d9c7a5', '#8a3b2e', '#9aa88a', '#6b2737', '#d6a743', '#fbfbf8', '#3d4f5c', '#c7b8e0', '#e07a5f'],
  bottom: ['#1f2a44', '#2b2d31', '#c8b48e', '#141414', '#3b5876', '#e8e4da', '#5a4a3a', '#6e7b8b'],
  dress: ['#141414', '#9e1b32', '#1e5a4a', '#efe9de', '#e2725b', '#d8c3a5', '#1d2c4f', '#b88a4a', '#6a4c93'],
  skin: ['#f3cfb3', '#e8b896', '#d39c7a', '#b97e57', '#94603f', '#6e4630', '#4f3122'],
  hair: ['#14110f', '#2a1d15', '#4a3222', '#6b4429', '#8c5a32', '#b28a5a', '#d4b483', '#8e8a86', '#5b2a1d'],
  shoe: ['#1b1b1b', '#3d2a1e', '#e9e6df', '#6b4a33', '#20232a'],
};
const col = (h) => new THREE.Color(h);

// ------------------------------------------------------------------ body-part geometry (metres, scale 1 ≈ 1.74 m)
// Every part is modelled in its joint's frame: X forward, Y up, Z to the figure's right; limbs hang along −Y.
function lathe(profile, seg = 10, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
  g.scale(sx, 1, sz); return g;
}
const sph = (r, sx, sy, sz, x, y, z, w = 12, h = 8) => { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
// keep the primitives' own smooth normals (recomputing them on a merged mesh would facet it)
const merge = (gs) => mergeGeometries(gs.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g.index ? g : g; }), false);
// tapered limb from the joint (y = 0) down to −len with a rounded tip; cap = a ball at the joint.
// Lathe profiles run bottom → top so the faces point outward.
function limb(r0, r1, len, cap = true) {
  const prof = [[0.0001, -len - r1 * 0.6], [r1 * 0.75, -len - r1 * 0.38]];
  for (let i = 3; i >= 0; i--) { const t = i / 3; prof.push([r0 + (r1 - r0) * t, -len * t]); }
  prof.push([0.0001, cap ? 0 : r0 * 0.3]);
  const gs = [lathe(prof, 8)];
  if (cap) gs.push(sph(r0, 1, 1, 1, 0, 0, 0, 8, 5));
  return merge(gs);
}
function bodyParts() {
  const P = {};
  P.pelvis = sph(0.17, 0.68, 0.62, 1, 0, 0.02, 0, 10, 6);                                          // trousers / dress colour
  P.torso = lathe([[0.0001, -0.01], [0.145, 0], [0.14, 0.12], [0.162, 0.28], [0.17, 0.4], [0.135, 0.47], [0.06, 0.505], [0.0001, 0.51]], 12, 0.62, 1);
  P.head = merge([new THREE.CylinderGeometry(0.048, 0.052, 0.12, 8, 1, true).translate(0, 0.05, 0), sph(0.1, 1.05, 1.18, 0.92, 0.005, 0.2, 0, 12, 8)]);
  const cap = new THREE.SphereGeometry(0.108, 12, 6, 0, TAU, 0, 1.78); cap.scale(1.06, 1.16, 0.97); cap.rotateZ(0.38); cap.translate(-0.008, 0.205, 0);
  P.hairShort = merge([cap]);
  const back = new THREE.CylinderGeometry(0.1, 0.085, 0.3, 8, 1, true, Math.PI * 0.5, Math.PI); back.scale(0.9, 1, 1.02); back.translate(-0.03, 0.09, 0);
  P.hairLong = merge([cap.clone(), back]);
  P.upperArm = limb(0.05, 0.042, 0.29);
  P.forearm = merge([limb(0.043, 0.033, 0.25, false), sph(0.05, 0.85, 1.7, 0.5, 0.004, -0.315, 0, 6, 4)]);  // + hand
  P.thigh = limb(0.08, 0.057, 0.45);
  P.shin = limb(0.057, 0.04, 0.43);
  P.shoe = merge([sph(0.06, 2.2, 0.75, 0.82, 0.06, -0.012, 0, 8, 5)]);                              // sole on the floor
  P.dress = lathe([[0.0001, -0.46], [0.255, -0.46], [0.215, -0.3], [0.165, -0.05], [0.15, 0.1], [0.0001, 0.12]], 12, 0.78, 1);
  P.glass = new THREE.CylinderGeometry(0.034, 0.028, 0.13, 8);                                    // placed upright at the hand
  return P;
}
// ≈ 2,200 triangles a figure: light enough for a packed crowd in the shadow, AO and path-traced passes
// part name -> [instances per person, colour slot]
const PARTS = [['pelvis', 1, 'pelvis'], ['torso', 1, 'top'], ['head', 1, 'skin'], ['hairShort', 1, 'hair'], ['hairLong', 1, 'hair'],
  ['upperArm', 2, 'sleeve'], ['forearm', 2, 'skin'], ['thigh', 2, 'thigh'], ['shin', 2, 'shin'], ['shoe', 2, 'shoe'], ['dress', 1, 'dress'], ['glass', 1, 'glass']];

// ------------------------------------------------------------------ small helpers
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const E = new THREE.Euler(0, 0, 0, 'YXZ');
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
// joint: out = parent · T(x,y,z) · R(YXZ: flex about Z first, then abduction about X, then twist about Y)
function bone(out, parent, x, y, z, rx, ry, rz) {
  E.set(rx, ry, rz); out.makeRotationFromEuler(E);
  const e = out.elements; e[12] = x; e[13] = y; e[14] = z;
  return out.premultiply(parent);
}

export class Crowd {
  constructor(venue, tour) {
    this.venue = venue; this.tour = tour;
    this.group = new THREE.Group(); this.group.name = 'people';
    venue.root.add(this.group);
    this.mode = 'animated'; this.level = 'busy'; this.theme = 'free'; this.themes = null; this.evening = 1;
    this.people = []; this.meshes = {}; this.cap = 0;
    this.geo = bodyParts();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });   // open shells
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, emissive: new THREE.Color('#5a2a00'), emissiveIntensity: 0.25 });
    this.M = Array.from({ length: 16 }, () => new THREE.Matrix4());
    this.t = 0; this.dirty = true;
  }

  // ---------------------------------------------------------------- public
  setMode(m) { if (m === this.mode) return; const was = this.mode; this.mode = m; this.group.visible = m !== 'off'; if (was === 'off' || !this.people.length) this.rebuild(); else this.dirty = true; }
  setLevel(l) { if (l === this.level) return; this.level = l; this.rebuild(); }
  setTheme(id, themes) { this.theme = id; this.themes = themes; this.rebuild(); }
  // k: 0 day … 1 evening / night. Sunbathers by day; the band, the DJ and the first-floor crowd from sunset.
  setEvening(k) { const night = k > 0.5; if (night !== this.night) { this.night = night; this.dirty = true; } this.evening = k; }
  get count() { return this.people.filter((p) => this._on(p)).length; }

  rebuild() {
    this.group.visible = this.mode !== 'off';
    if (this.mode === 'off') return;
    this.people = this._place();
    this._alloc(this.people.length);
    this._paint();
    this.dirty = true;
  }

  // eye: the camera position; anyone the camera stands inside is hidden (you can walk through people)
  update(dt, eye) {
    if (this.mode === 'off' || !this.people.length) return;
    const up = this.venue.groups.upper?.visible !== false; if (up !== this._upper) { this._upper = up; this.dirty = true; }   // first-floor people go with the upper floor (overview cut-away)
    if (eye) { const moved = !this._eye || this._eye.distanceToSquared(eye) > 1e-4; if (moved) { (this._eye ||= eye.clone()).copy(eye); if (this.mode === 'static') this.dirty = true; } }
    if (this.mode === 'animated') { this.t += Math.min(dt, 0.1); for (const p of this.people) if (p.kind === 'walk') this._walk(p, Math.min(dt, 0.1)); }
    else if (!this.dirty) return;
    this._pose();
    this.dirty = false;
  }

  // ---------------------------------------------------------------- placement
  _on(p) { return p.when === 'any' || (p.when === 'night') === !!this.night; }
  _place() {   // every person: { s (body scale ≈ 0.9–1.0), p, y, yaw, kind, … }
    const { venue, theme, themes } = this, D = DENSITY[this.level], r = rng(4242), out = [];
    const items = venue.items, fy = (x, y) => venue.floorAt(x, y) ?? 0;
    const themed = theme !== 'free' && themes?.site;
    const stage = themed ? themes.site.stage : null;
    const onStage = (p) => stage && [stage.poly, stage.step1, stage.step2].some((q) => G.inside(p, q) || G.ringDist(p, q) < 0.4);
    const person = (o) => { const p = { ...this._look(r), ...o, phase: r() * 100, seed: r() }; out.push(p); return p; };
    // seats on the plan's furniture
    const SEAT = { chair: 0.46, armchair: 0.4, sofa: 0.42, loveseat: 0.42, bar_stool: 0.76, sunbed: 0.36 };
    const barFront = themed ? themes.site.bar : null;
    for (const f of items) {
      const h = SEAT[f.type]; if (h === undefined || onStage(f.at)) continue;
      let a = orient(f, items);
      if (f.type === 'bar_stool' && barFront) { const n = barFront.outN; a = Math.atan2(-n[1], -n[0]); }
      const fwd = [Math.cos(a), Math.sin(a)], lat = [-fwd[1], fwd[0]], y0 = fy(...f.at);
      if (f.type === 'sunbed') { if (r() < D.seat * 0.8) person({ kind: 'recline', p: [f.at[0] - fwd[0] * 0.1, f.at[1] - fwd[1] * 0.1], y: y0, yaw: a, seatH: h, when: 'day', glass: false }); continue; }
      const n = f.type === 'sofa' || f.type === 'loveseat' ? Math.max(1, Math.round(Math.max(f.w, f.l) / 0.66)) : 1;
      const back = f.type === 'armchair' ? 0.1 : f.type === 'chair' ? 0.04 : f.type === 'bar_stool' ? 0 : 0.12;
      for (let i = 0; i < n; i++) {
        if (r() > D.seat) continue;
        const o = (i - (n - 1) / 2) * 0.62;
        const p = [f.at[0] + lat[0] * o - fwd[0] * back, f.at[1] + lat[1] * o - fwd[1] * back];
        person({ kind: 'sit', p, y: y0, yaw: a, seatH: h, lounge: f.type !== 'chair' && f.type !== 'bar_stool', stool: f.type === 'bar_stool', when: 'any', glass: f.type === 'bar_stool' || r() < 0.3 });
      }
    }
    // standing at the ground-floor bar (between the stools)
    if (barFront) {
      const stools = items.filter((f) => f.type === 'bar_stool').map((f) => f.at), n = barFront.outN;
      const pts = G.resample(barFront.front, 0.8).pts;
      for (const q of pts) {
        const p = [q[0] + n[0] * 0.55, q[1] + n[1] * 0.55];
        if (stools.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 0.65) || r() > D.stand * 0.7) continue;
        person({ kind: 'stand', lean: true, p, y: fy(...p), yaw: Math.atan2(-n[1], -n[0]) + (r() - 0.5) * 0.5, when: 'any', glass: true });
      }
    }
    // the band: a singer on the stage stool at the mic (themes; evening)
    if (themed && themes.stageInfo) {
      const s = themes.stageInfo;
      person({ kind: 'sit', p: s.stool, y: s.y, yaw: Math.atan2(s.fwd[1], s.fwd[0]), seatH: 0.72, stool: true, singer: true, when: 'night', glass: false });
      person({ kind: 'stand', p: s.player, y: s.y, yaw: Math.atan2(s.fwd[1], s.fwd[0]) + 0.35, player: true, when: 'night', glass: false });
    }
    // first floor (themes): DJ, dancers, banquettes, high tables, the bar — the DJ pub opens at sunset
    const ff = themed ? themes.ff : null;
    if (ff) {
      const { C, f0 } = ff, at = (rr, aa) => [C[0] + rr * Math.cos(aa), C[1] + rr * Math.sin(aa)], face = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]);
      const dj = at(ff.djR, ff.ja); person({ kind: 'dj', p: dj, y: f0 + 0.4, yaw: ff.ja + Math.PI, when: 'night', glass: false });
      const djFocus = at(ff.djR - 3, ff.ja), placed = [];
      for (let k = 0, tries = 0; k < D.dance && tries < 4000; tries++) {
        const rr = 5.3 * Math.sqrt(r()), aa = r() * TAU, p = [C[0] + rr * Math.cos(aa), C[1] + rr * Math.sin(aa)];
        // denser toward the DJ, never on top of each other
        const toDj = Math.hypot(p[0] - djFocus[0], p[1] - djFocus[1]); if (r() > 1.15 - toDj / 12) continue;
        if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.62)) continue;
        placed.push(p); k++;
        person({ kind: 'dance', p, y: f0, yaw: face(p, djFocus) + (r() - 0.5) * 1.2, style: (r() * 4) | 0, when: 'night', glass: r() < 0.3 });
      }
      for (const sp of ff.seats || []) {                         // the window tables' chairs (themes.js)
        if (r() > D.seat) continue;
        person({ kind: 'sit', p: sp.p, y: f0, yaw: sp.a, seatH: 0.46, when: 'night', glass: r() < 0.55 });
      }
      for (const t of ff.tables) {
        const n = 1 + Math.round(r() * 3 * D.stand), a0 = r() * TAU;
        for (let i = 0; i < n; i++) { const aa = a0 + (i / n) * TAU, p = [t[0] + Math.cos(aa) * 0.58, t[1] + Math.sin(aa) * 0.58]; person({ kind: 'stand', p, y: f0, yaw: face(p, t), when: 'night', glass: r() < 0.85 }); }
      }
      for (let aa = ff.ba0 + 0.06; aa < ff.ba1 - 0.03; aa += 0.11) {
        if (r() > D.stand * 0.75) continue;
        const p = at(ff.barR - 0.5, aa); person({ kind: 'stand', lean: true, p, y: f0, yaw: face(p, at(ff.barR + 1, aa)), when: 'night', glass: true });
      }
    }
    // walkers on the guided-walk route (pairs now and then); the first floor stretch only with a theme
    const tr = this.tour, L = tr.length, endS = themed ? L : (tr.stopS?.[tr.stopS.length - 2] ?? L);
    for (let k = 0; k < D.walk; k++) {
      // none start at the arrival court, where the camera begins
      const s = 6 + r() * (endS - 6), dir = r() < 0.5 ? 1 : -1, speed = 1.05 + r() * 0.35, off = (r() - 0.5) * 0.7;
      person({ kind: 'walk', rs: s, dir, speed, off, endS, when: 'any', glass: false });   // rs: distance along the route (s is body scale)
      if (r() < 0.3 && k + 1 < D.walk) { k++; person({ kind: 'walk', rs: s - dir * 0.05, dir, speed, off: off + (off > 0 ? -0.55 : 0.55), endS, when: 'any', glass: false }); }
    }
    for (const p of out) { if (!(p.s > 0.8 && p.s < 1.1)) p.s = 1; if (p.kind === 'walk') this._walk(p, 0); }   // a figure is always life size
    return out;
  }

  // clothes, skin, hair, build
  _look(r) {
    const pick = (a) => a[(r() * a.length) | 0];
    const fem = r() < 0.5, dress = fem && r() < 0.55, shorts = !dress && r() < 0.15;
    const skin = pick(PAL.skin), top = pick(PAL.top), bottom = dress ? pick(PAL.dress) : pick(PAL.bottom);
    return {
      fem, dress, long: fem ? r() < 0.75 : r() < 0.06, bald: !fem && r() < 0.1,
      s: (fem ? 0.92 : 0.975) + (r() - 0.5) * 0.08, sw: fem ? 0.9 : 1.04,
      c: { skin: col(skin), top: col(dress && r() < 0.7 ? bottom : top), bottom: col(bottom), hair: col(pick(PAL.hair)), shoe: col(pick(PAL.shoe)), short: shorts, sleeveless: dress && r() < 0.5 },
    };
  }

  // ---------------------------------------------------------------- instancing
  _alloc(n) {
    if (n <= this.cap) { for (const [name, k] of PARTS) this.meshes[name].count = n * k; return; }
    for (const m of Object.values(this.meshes)) { this.group.remove(m); m.dispose(); }
    this.cap = Math.ceil(n * 1.2) + 8; this.meshes = {};
    for (const [name, k] of PARTS) {
      const m = new THREE.InstancedMesh(this.geo[name], name === 'glass' ? this.glassMat : name.startsWith('hair') ? this.hairMat : this.mat, this.cap * k);
      m.name = `people_${name}`; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      m.userData.photoMaxDist = 35;                       // photo mode traces the people near the camera only
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = n * k;
      m.setColorAt(0, new THREE.Color()); this.meshes[name] = m; this.group.add(m);
    }
  }
  _paint() {
    const amber = col('#d98a1e');
    this.people.forEach((p, i) => {
      const k = p.c, sitting = p.kind === 'sit' || p.kind === 'recline', pelvis = k.bottom;
      const thigh = p.dress ? (sitting ? k.bottom : k.skin) : k.bottom, shin = p.dress || k.short ? k.skin : k.bottom;
      const set = (name, j, cc) => this.meshes[name].setColorAt(j, cc);
      set('pelvis', i, pelvis); set('torso', i, k.top); set('head', i, k.skin); set('hairShort', i, k.hair); set('hairLong', i, k.hair);
      set('dress', i, k.bottom); set('glass', i, amber);
      for (const s of [0, 1]) {
        set('upperArm', 2 * i + s, k.sleeveless ? k.skin : k.top); set('forearm', 2 * i + s, k.skin);
        set('thigh', 2 * i + s, thigh); set('shin', 2 * i + s, shin); set('shoe', 2 * i + s, k.shoe);
      }
    });
    for (const m of Object.values(this.meshes)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- motion along the route
  // walkers share the route with the guided-walk camera: one heading for the camera turns round about 3 m short
  // of it (and won't turn again for a few seconds), so nobody walks into the view or stands parked in front of it
  _walk(p, dt) {
    const tr = this.tour, e = this._eye;
    p.turnT = Math.max(0, (p.turnT || 0) - dt);
    if (e && p.p && !p.turnT && Math.abs(e.y - p.y - 1.4) < 1.5) {
      const dx = e.x - p.p[0], dy = -e.z - p.p[1], d = Math.hypot(dx, dy) || 1, fx = Math.cos(p.yaw), fy = Math.sin(p.yaw);
      if (d < 3 && (dx * fx + dy * fy) / d > 0.3) { p.dir = -p.dir; p.turnT = 5; }
    }
    p.v = p.speed; p.gait = (p.gait || 0) + dt * p.v / 1.45;
    p.rs += p.dir * p.v * dt;
    if (p.rs > p.endS - 0.5) { p.rs = p.endS - 0.5; p.dir = -1; }
    if (p.rs < 0.5) { p.rs = 0.5; p.dir = 1; }
    const d = tr.dist; let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m] <= p.rs) lo = m; else hi = m; }
    const t = (p.rs - d[lo]) / Math.max(1e-6, d[hi] - d[lo]), A = tr.path[lo], B = tr.path[hi];
    const tx = B[0] - A[0], ty = B[1] - A[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    p.p = [lerp(A[0], B[0], t) + nx * p.off, lerp(A[1], B[1], t) + ny * p.off];
    const hr = lerp(tr.heights[lo], tr.heights[hi], t), f = this.venue.floorAt(p.p[0], p.p[1], hr + 0.1);   // the floor under the feet (offset from the route's centreline)
    p.y = f !== null && Math.abs(f - hr) < 0.6 ? f : hr;
    const yaw = Math.atan2(ty * p.dir, tx * p.dir);
    p.yaw = p.yaw === undefined ? yaw : p.yaw + Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * Math.min(1, dt * 6);
  }

  // ---------------------------------------------------------------- poses
  _pose() {
    const T = this.mode === 'animated' ? this.t : 0, M = this.M, ms = this.meshes;
    const beat = (BPM / 60) * TAU;
    this.people.forEach((p, i) => {
      const e = this._eye, near = e && Math.abs(e.y - p.y - 1) < 1.2 && (e.x - p.p[0]) ** 2 + (e.z + p.p[1]) ** 2 < 1.0;   // within 1 m
      if (!this._on(p) || near || (!this._upper && p.y > 3)) { for (const [name, k] of PARTS) for (let j = 0; j < k; j++) ms[name].setMatrixAt(k * i + j, ZERO); return; }
      const t = T + p.phase, A = this._angles(p, t, beat);
      // root
      const [root, pelvis, torso, head] = M;
      E.set(0, p.yaw, 0); root.makeRotationFromEuler(E); root.scale(_s.set(p.s, p.s, p.s)); root.setPosition(p.p[0], p.y + A.bob, -p.p[1]);
      bone(pelvis, root, A.dx, A.hipH, 0, A.pelvisRx, A.pelvisRy, 0);
      bone(torso, pelvis, 0, 0.07, 0, A.torsoRx, A.torsoRy, A.torsoRz);
      ms.pelvis.setMatrixAt(i, pelvis);
      torso.scale(_s.set(1, 1, p.sw)); ms.torso.setMatrixAt(i, torso); torso.scale(_s.set(1, 1, 1 / p.sw));
      bone(head, torso, 0.01, 0.47, 0, A.headRx, A.headRy, A.headRz);
      ms.head.setMatrixAt(i, head);
      ms.hairShort.setMatrixAt(i, p.bald || p.long ? ZERO : head); ms.hairLong.setMatrixAt(i, p.long ? head : ZERO);
      ms.dress.setMatrixAt(i, p.dress && !A.seated ? pelvis : ZERO);
      for (const side of [-1, 1]) {
        const L = side < 0, j = 2 * i + (L ? 0 : 1), [sh, el, hip, kn, an] = [M[4], M[5], M[6], M[7], M[8]];
        bone(sh, torso, 0, 0.435, side * 0.165 * p.sw, -side * (L ? A.shAbdL : A.shAbdR), L ? A.shTwL : A.shTwR, L ? A.shFlexL : A.shFlexR);
        ms.upperArm.setMatrixAt(j, sh);
        bone(el, sh, 0, -0.29, 0, 0, 0, L ? A.elbowL : A.elbowR); ms.forearm.setMatrixAt(j, el);
        if (!L) {                                            // the beer stays upright in the right hand
          if (p.glass) { _v.set(0.03, -0.33, 0).applyMatrix4(el); M[9].compose(_v, _q.setFromAxisAngle(_Y, p.yaw), _s.set(p.s, p.s, p.s)); ms.glass.setMatrixAt(i, M[9]); } else ms.glass.setMatrixAt(i, ZERO);
        }
        bone(hip, pelvis, 0, -0.035, side * 0.09, -side * (L ? A.hipAbdL : A.hipAbdR), L ? A.hipTwL : A.hipTwR, L ? A.hipL : A.hipR);
        ms.thigh.setMatrixAt(j, hip);
        const knee = L ? A.kneeL : A.kneeR; bone(kn, hip, 0, -0.45, 0, 0, 0, -knee); ms.shin.setMatrixAt(j, kn);
        bone(an, kn, 0, -0.43, 0, 0, 0, knee - (L ? A.hipL : A.hipR) + A.footTilt); ms.shoe.setMatrixAt(j, an);
      }
    });
    for (const m of Object.values(ms)) m.instanceMatrix.needsUpdate = true;
  }

  // joint angles for a person at time t (radians; flex > 0 = forward, abduction > 0 = outward)
  _angles(p, t, beat) {
    const A = this._A || (this._A = {});
    Object.assign(A, { bob: 0, dx: 0, hipH: 0.93, pelvisRx: 0, pelvisRy: 0, torsoRx: 0, torsoRy: 0, torsoRz: 0, headRx: 0, headRy: 0, headRz: 0,
      shFlexL: 0.04, shFlexR: 0.04, shAbdL: 0.09, shAbdR: 0.09, shTwL: 0, shTwR: 0, elbowL: 0.18, elbowR: 0.18,
      hipL: 0, hipR: 0, hipAbdL: 0.02, hipAbdR: 0.02, hipTwL: 0, hipTwR: 0, kneeL: 0.04, kneeR: 0.04, footTilt: 0, seated: false });
    const slow = (f, ph = 0) => Math.sin(t * f + p.seed * 17 + ph);
    const look = () => { A.headRy = 0.45 * slow(0.23) * smooth(Math.abs(slow(0.11))); A.headRz = -0.05 + 0.06 * slow(0.17, 1); };
    // a sip every ~10 s: right forearm up to the mouth and back
    const sip = () => { const c = ((t * 0.1 + p.seed) % 1) * 10; const k = c < 1.6 ? smooth(Math.min(1, c / 0.5)) * smooth(Math.min(1, (1.6 - c) / 0.5)) : 0; return k; };
    switch (p.kind) {
      case 'walk': {
        const ph = (this.mode === 'animated' ? p.gait || 0 : p.phase) * TAU, amp = Math.min(1, (p.v ?? p.speed) / 0.6);
        const sw = Math.sin(ph) * amp, cw = Math.cos(ph);
        A.hipL = 0.42 * sw; A.hipR = -0.42 * sw;
        A.kneeL = 0.06 + amp * 0.62 * Math.max(0, Math.sin(ph - 1.2)); A.kneeR = 0.06 + amp * 0.62 * Math.max(0, Math.sin(ph + Math.PI - 1.2));
        A.shFlexL = -0.32 * sw; A.shFlexR = 0.32 * sw; A.elbowL = 0.3 + 0.15 * Math.max(0, -sw); A.elbowR = 0.3 + 0.15 * Math.max(0, sw);
        A.bob = (0.022 * Math.abs(cw) - 0.02) * amp; A.pelvisRy = 0.08 * sw; A.torsoRy = -0.1 * sw; A.torsoRz = -0.04;
        A.headRy = 0.15 * slow(0.3) * smooth(Math.abs(slow(0.13)));
        break;
      }
      case 'sit': case 'recline': {
        A.seated = true;
        const rec = p.kind === 'recline';
        A.hipH = p.seatH + 0.085; A.dx = rec ? 0 : -0.02;
        A.hipL = A.hipR = rec ? 1.5 : p.stool ? 1.3 : 1.42;
        A.kneeL = A.kneeR = rec ? 0.05 : p.stool ? 1.15 : p.lounge ? 1.15 : 1.45;
        A.hipAbdL = A.hipAbdR = rec ? 0.05 : 0.11;
        if (p.lounge && !rec) { A.kneeL = 1.0 + 0.25 * p.seed; A.hipL = 1.3; A.hipTwR = -0.15; }   // relaxed, legs apart / crossed-ish
        A.torsoRz = rec ? 1.05 : p.lounge ? 0.16 : -0.05 + 0.03 * slow(0.4);
        A.footTilt = rec ? -0.6 : 0.05;
        // arms: forearms forward on the lap / the table; sipping; gesturing while talking
        A.shFlexL = A.shFlexR = rec ? -0.2 : p.lounge ? 0.25 : 0.38; A.elbowL = A.elbowR = rec ? 0.4 : p.lounge ? 1.0 : 1.2;
        A.shAbdL = A.shAbdR = 0.14;
        if (p.singer) { const k = 0.8 + 0.2 * slow(1.3); A.shFlexR = 0.9 * k; A.elbowR = 2.1; A.shFlexL = 0.55; A.elbowL = 1.3 + 0.3 * Math.max(0, slow(2.1)); A.torsoRz = -0.08; A.headRz = 0.05 * slow(1.1); A.headRy = 0.25 * slow(0.4); break; }
        if (p.glass) { const k = sip(); A.shFlexR = lerp(A.shFlexR, 0.75, k); A.elbowR = lerp(A.elbowR + 0.2, 2.35, k); A.headRz = 0.12 * k; }
        else { const g = Math.max(0, slow(0.9, 2)) ** 2; A.elbowL += 0.45 * g; A.shFlexL += 0.25 * g; }
        if (!p.glass || !sip()) look();
        A.torsoRy = 0.08 * slow(0.21);
        break;
      }
      case 'stand': {
        const shift = slow(0.35);
        A.pelvisRx = 0.03 * shift; A.hipAbdL = 0.03 + 0.03 * shift; A.hipAbdR = 0.03 - 0.03 * shift; A.kneeL = 0.04 + 0.08 * Math.max(0, shift); A.kneeR = 0.04 + 0.08 * Math.max(0, -shift);
        A.torsoRx = -0.025 * shift;
        if (p.player) { A.shFlexL = 0.75; A.elbowL = 1.6; A.shFlexR = 0.55 + 0.08 * Math.sin(t * beat); A.elbowR = 1.25; A.shAbdR = 0.3; A.torsoRz = -0.06; A.headRz = 0.1 + 0.05 * Math.sin(t * beat); break; }
        if (p.lean) { A.shFlexL = 0.62; A.elbowL = 1.55; A.torsoRz = -0.12; A.hipL = A.hipR = 0.08; }      // forearm on the counter
        if (p.glass) { const k = sip(); A.shFlexR = lerp(0.3, 0.72, k); A.elbowR = lerp(1.35, 2.4, k); A.headRz = 0.12 * k; }
        else { const g = Math.max(0, slow(0.8, 1)) ** 2; A.elbowL = 0.25 + 1.0 * g; A.shFlexL = 0.1 + 0.4 * g; }
        look();
        break;
      }
      case 'dance': {
        const b = t * beat, bounce = Math.abs(Math.sin(b / 2));
        A.bob = -0.045 * (1 - bounce); A.kneeL = A.kneeR = 0.18 + 0.22 * (1 - bounce); A.hipL = A.hipR = 0.12 + 0.12 * (1 - bounce);
        A.footTilt = 0;
        A.pelvisRy = 0.22 * Math.sin(b / 4 + p.seed * 6); A.torsoRy = -0.12 * Math.sin(b / 4 + p.seed * 6); A.pelvisRx = 0.06 * Math.sin(b / 2);
        A.headRz = 0.12 * Math.sin(b); A.headRy = 0.2 * Math.sin(b / 8 + p.seed * 9);
        const arm = p.style, w = Math.sin(b / 2);
        if (arm === 0) { A.shAbdL = A.shAbdR = 2.5 + 0.25 * w; A.shFlexL = A.shFlexR = 0.35; A.elbowL = A.elbowR = 0.35 + 0.25 * Math.abs(w); }   // both hands up
        else if (arm === 1) { A.shFlexR = 2.55 + 0.35 * Math.sin(b); A.elbowR = 0.3 + 0.3 * Math.max(0, Math.sin(b)); A.shFlexL = 0.5; A.elbowL = 1.6; }   // fist pump
        else if (arm === 2) { A.shFlexL = A.shFlexR = 0.55 + 0.15 * w; A.elbowL = A.elbowR = 1.7; A.shAbdL = 0.3 + 0.2 * w; A.shAbdR = 0.3 - 0.2 * w; A.torsoRx = 0.07 * w; }   // grooving
        else { A.shAbdL = 0.6 + 0.6 * Math.max(0, w); A.shAbdR = 0.6 + 0.6 * Math.max(0, -w); A.elbowL = A.elbowR = 0.9; A.shFlexL = A.shFlexR = 0.4; A.torsoRx = 0.08 * w; }   // side to side
        if (p.glass && arm !== 0) { A.shFlexR = 0.45; A.elbowR = 1.5; }
        break;
      }
      case 'dj': {
        const b = t * beat;
        A.torsoRz = -0.16; A.headRz = 0.2 + 0.1 * Math.sin(b); A.bob = -0.02 * (1 - Math.abs(Math.sin(b / 2)));
        A.shFlexL = 0.85; A.elbowL = 1.05 + 0.15 * Math.sin(b / 4); A.shFlexR = 0.8 + 0.2 * Math.max(0, Math.sin(b / 8 + 1)); A.elbowR = 1.05;
        if (Math.sin(t * 0.37) > 0.8) { A.shFlexR = 2.7; A.elbowR = 0.3; }                       // hand up on the drop
        A.kneeL = A.kneeR = 0.1 + 0.08 * (1 - Math.abs(Math.sin(b / 2)));
        break;
      }
      default: break;
    }
    return A;
  }
}
