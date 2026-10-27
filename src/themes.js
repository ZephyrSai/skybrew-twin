// Skybrew themes: Free (the venue as built), Bali and Riviera, translated from the contractor's render pack
// ("Skybrew render pack": 22 Bali + 25 Riviera renders, their prompts, the 30 site photos they were made from).
// Each theme is applied place by place, at the spots the renders show:
//   courtyard pavilion (GF01) · restobar entrance (GF02) · bar + brewhouse glazing (GF03–05)
//   live-music stage in the round alcove under the white soffit (GF06–08, PLAN_GF) · dining hall (GF09)
//   glazed pods / garden room (GF10–13) · first-floor entrance (FF01) · stair + landing (ST01–02)
//   first-floor DJ pub: dance floor, DJ booth on the back wall, bar, window banquettes, industrial ceiling (FF02–08)
// Finishes go through the normal surface registry (so the Finishes panel still edits them); everything new is
// "dressing" built once per theme on first use and toggled. Placement assumptions are listed in THEMES.md.
import * as THREE from 'three';
import * as G from './geom.js';
import { mat, glowMaterials } from './themekit.js';
import * as PR from './themeprops.js';
import { FINISHES, SURFACES, setFinish, currentScheme, fixedMaterial } from './materials.js';
import { orient, footprint } from './furniture.js';
import { poolMaterial, poolGeometry, scallopMaterial, scallopGeometry, uplightMaterial } from './lighting.js';

const TAU = Math.PI * 2;
export const THEME_LIST = [
  { id: 'free', label: 'Free', title: 'Free — the venue as built (site photos + CAD)' },
  { id: 'bali', label: 'Bali', title: 'Skybrew Bali — tropical resort brewhouse: teak, bamboo, thatch, lava stone, rattan' },
  { id: 'riviera', label: 'Riviera', title: 'Skybrew Riviera — 1960s French Riviera brewhouse: Riviera-blue tile, terrazzo, brass, cane, stripes' },
];

// ------------------------------------------------------------------ finishes (registered into the surface registry)
const FIN = {
  // id: [label, themekit material key]
  sk_concrete_sand: ['Polished concrete, warm sand (Skybrew Bali renders)', 'concrete_sand'],
  sk_concrete_light: ['Polished concrete, pale (Skybrew Bali, first draft)', 'concrete_light'],
  sk_limestone: ['Cream limestone slabs (Skybrew Bali option)', 'limestone_slabs'],
  sk_teak_carved: ['Carved teak panels (Skybrew Bali option, GF03 render)', 'teak_carved'],
  sk_concrete_dark: ['Dark polished concrete (Skybrew Bali FF)', 'concrete_dark'],
  sk_split_bamboo: ['Vertical split bamboo (Skybrew Bali)', 'split_bamboo'],
  sk_teak_slab: ['Live-edge teak (Skybrew Bali)', 'teak_solid'],
  sk_lattice: ['Carved teak lattice (Skybrew Bali)', 'lattice'],
  sk_bronze: ['Dark bronze frames (Skybrew Bali)', 'bronze_dark'],
  sk_lava: ['Lava stone (Skybrew Bali)', 'lava_stone'],
  sk_sandstone: ['Stacked paras sandstone (Skybrew Bali)', 'sandstone_stacked'],
  sk_plaster_ochre: ['Warm textured lime plaster (Skybrew Bali)', 'plaster_ochre'],
  sk_linen: ['Natural linen (Skybrew Bali)', 'linen'],
  sk_teak: ['Oiled teak (Skybrew)', 'teak'],
  sk_terracotta: ['Hand-made terracotta tiles (Skybrew)', 'terracotta_tiles'],
  sk_terrazzo_sand: ['Sand terrazzo, terracotta / olive / blue chips (Skybrew Riviera)', 'terrazzo_sand'],
  sk_terrazzo_white: ['White terrazzo bar top (Skybrew Riviera)', 'terrazzo_white'],
  sk_terrazzo_dark: ['Dark terrazzo (Skybrew Riviera FF)', 'terrazzo_dark'],
  sk_tile_blue: ['Glossy Riviera-blue tile #2C6A8E (Skybrew Riviera)', 'tile_blue'],
  sk_herringbone: ['Blue & white herringbone tile (Skybrew Riviera)', 'tile_herringbone'],
  sk_plaster_lime: ['Warm white lime plaster (Skybrew Riviera)', 'plaster_lime'],
  sk_slats_white: ['White-painted slatted ceiling (Skybrew Riviera)', 'slats_white'],
  sk_olive_velvet: ['Olive velvet (Skybrew Riviera)', 'olive_velvet'],
  sk_stripe: ['Navy & white stripe (Skybrew Riviera)', 'stripe_cushion'],
  sk_marble: ['White marble (Skybrew Riviera)', 'marble_white'],
  sk_cane: ['Cane webbing (Skybrew Riviera)', 'cane'],
};
const SCHEMES = {
  bali: {
    indoor_floor: 'sk_concrete_sand', bar_front: 'sk_split_bamboo', bar_top: 'sk_teak_slab', smoking_floor: 'sk_terracotta',
    partitions: 'sk_lattice', frames: 'sk_bronze', stair_treads: 'sk_lava', stone_cladding: 'sk_sandstone', landing_walls: 'sk_plaster_ochre',
    upper_floor: 'sk_concrete_dark', beach_deck: 'sk_teak', upholstery: 'sk_linen', outdoor_fabric: 'sk_linen', tabletops: 'sk_teak',
  },
  riviera: {
    indoor_floor: 'sk_terrazzo_sand', indoor_walls: 'sk_plaster_lime', bar_front: 'sk_tile_blue', bar_top: 'sk_terrazzo_white',
    smoking_floor: 'sk_terrazzo_sand', smoking_ceiling: 'sk_slats_white', partitions: 'sk_cane', stair_treads: 'sk_terracotta',
    stone_cladding: 'sk_herringbone', landing_walls: 'sk_plaster_lime', upper_floor: 'sk_terrazzo_dark',
    upholstery: 'sk_olive_velvet', outdoor_fabric: 'sk_stripe', tabletops: 'sk_marble',
  },
};
const OFFER = {                                            // where each theme finish is offered in the Finishes panel
  indoor_floor: ['sk_concrete_sand', 'sk_concrete_light', 'sk_limestone', 'sk_terrazzo_sand', 'sk_terracotta', 'sk_teak'], indoor_walls: ['sk_plaster_lime', 'sk_plaster_ochre'],
  bar_front: ['sk_split_bamboo', 'sk_teak_carved', 'sk_tile_blue'], bar_top: ['sk_teak_slab', 'sk_terrazzo_white'], smoking_floor: ['sk_terracotta', 'sk_terrazzo_sand', 'sk_concrete_sand', 'sk_concrete_light'],
  smoking_ceiling: ['sk_slats_white'], partitions: ['sk_lattice', 'sk_cane'], frames: ['sk_bronze'], stair_treads: ['sk_lava', 'sk_terracotta'],
  stone_cladding: ['sk_sandstone', 'sk_herringbone'], landing_walls: ['sk_plaster_ochre', 'sk_plaster_lime'],
  upper_floor: ['sk_concrete_dark', 'sk_terrazzo_dark'], beach_deck: ['sk_teak'], upholstery: ['sk_linen', 'sk_olive_velvet', 'sk_stripe'],
  outdoor_fabric: ['sk_linen', 'sk_stripe'], tabletops: ['sk_teak', 'sk_marble'],
};
// profiles saved before a default changed: move surfaces still on the old default to the new one
// (v1 → v2: the Bali hall floor follows the renders' warm sand concrete instead of the pale first draft)
export function migrateSchemes(schemes, v = 1) {
  const out = JSON.parse(JSON.stringify(schemes || {}));
  if (v < 2 && out.bali?.indoor_floor === 'sk_concrete_light') out.bali.indoor_floor = 'sk_concrete_sand';
  // v2 → v3: Riviera pods floor matches the indoor sand terrazzo (was terracotta tiles)
  if (v < 3 && out.riviera?.smoking_floor === 'sk_terracotta') out.riviera.smoking_floor = 'sk_terrazzo_sand';
  return out;
}
export function registerThemeFinishes() {
  for (const [id, [label, key]] of Object.entries(FIN)) FINISHES[id] = { label, make: () => mat(key) };
  for (const [s, list] of Object.entries(OFFER)) if (SURFACES[s]) SURFACES[s].choices = [...new Set([...SURFACES[s].choices, ...list])];
}

// ------------------------------------------------------------------ narration per theme (appended to tour stops)
export const TOUR_NOTES = {
  bali: {
    arrival: 'Bali: bronze “skybrew” letters over the arched door, tall woven bamboo lanterns and frangipani in lava-stone planters; a teak threshold step (FF01 render).',
    gate: 'Bali: the pavilion fascia carries bronze SKYBREW letters on a lava-stone panel under a deep alang-alang thatch eave (GF01).',
    beach: 'Bali: from the sand the deck reads as oiled teak, with teak sunbeds in natural linen along its seaward edge.',
    booths: 'Bali: rattan tub chairs with indigo ikat cushions at reclaimed-teak tables; woven pendants.',
    pods: 'Bali glass garden room (GF10–12): terracotta floor, carved teak lattice screens, thatch fringe and bamboo blinds at the windows, linen daybeds with ikat cushions, hanging ferns.',
    indoor: 'Bali dining (GF09): polished concrete, round teak tables, woven rattan chairs, a carved teak panel on the wall, monstera and palms in lava-stone pots.',
    bar: 'Bali bar (GF03–05): split-bamboo front with an amber underglow, live-edge teak top, bronze taps, and a back bar of teak shelves full of bottles on the lava wall. The brewhouse is in its own curved glass room by the old entrance: copper mash tun and kettle, stainless fermenters.',
    lounge: 'Bali stage (GF06–08): a 40 cm teak stage with a lava-stone edge, carved paras-sandstone wall, the Skybrew logo in carved teak with a warm halo, thatch fringe on the soffit.',
    stair: 'Bali stair (ST01–02): teak treads on lava-stone risers, stacked cream sandstone wall, warm lime plaster, rope-wrapped teak handrail on bronze brackets, step lights.',
    upstairs: 'Bali first floor (FF02–08): a tropical DJ pub — dark polished concrete with a lava-pebble ring, bamboo-wrapped columns, woven-bamboo ceiling with copper ducts, the DJ booth on a lava-stone wall, teak tables at the windows and standing tables round the dance floor.',
  },
  riviera: {
    arrival: 'Riviera: brushed-brass SKYBREW serif letters, a striped dome awning over the arched door, opal globe sconces and olive trees in terracotta (FF01 render).',
    gate: 'Riviera: brass SKYBREW letters on the white fascia over a navy-and-white scalloped awning (GF01).',
    beach: 'Riviera: white sunbeds with navy-and-white striped cushions line the deck edge.',
    booths: 'Riviera: cane bistro chairs with striped cushions at walnut tables.',
    pods: 'Riviera garden room (GF10–12): the same sand terrazzo as the hall, white slatted ceiling, striped scalloped valances and sheer linen, olive-velvet banquettes, low cane dividers, olive trees.',
    indoor: 'Riviera dining (GF09): sand terrazzo, white marble tulip tables, bentwood cane chairs with striped cushions, a brass sunburst mirror, opal globe clusters.',
    bar: 'Riviera bar (GF03–05): glossy Riviera-blue tile front, white terrazzo top, brass foot rail and taps, a back bar of walnut and brass shelves full of bottles on white tile, the ON TAP board. The brewhouse is in its own curved glass room by the old entrance.',
    lounge: 'Riviera stage (GF06–08): a timber stage with brass trim and underglow, backlit brass logo on lime plaster, a striped scalloped valance on the soffit, olive trees.',
    stair: 'Riviera stair (ST01–02): terracotta treads with terrazzo nosings, blue-and-white herringbone tile, a brushed-brass handrail, brass sconces and travel posters.',
    upstairs: 'Riviera first floor (FF02–08): a late-night DJ pub — dark terrazzo with a brass ring, Riviera-blue tiled columns, fluted walnut DJ wall, black ducts with bronze rings, marble tables at the windows and standing tables round the dance floor.',
  },
};

// ------------------------------------------------------------------ dressing container
const M = (m) => (m?.isMaterial ? m : Array.isArray(m) ? mat(m[0], { rep: m[1] }) : mat(m));
const NO_PHOTO = new Set(['halo', 'beam']);
function placed(geo, x, y, h, a = 0, s = 1) { const g = geo.clone(); if (s !== 1) g.scale(s, s, s); g.rotateY(a); g.translate(x, h, -y); return g; }
class Dress {
  constructor(id) { this.id = id; this.bins = new Map(); this.inst = []; }
  add(group, m, geo) {
    if (!geo) return;
    const key = `${group}§${m?.isMaterial ? m.uuid : Array.isArray(m) ? `${m[0]}@${m[1].join('x')}` : m}`;
    if (!this.bins.has(key)) this.bins.set(key, { group, m, list: [] });
    this.bins.get(key).list.push(geo);
  }
  prop(group, parts, x, y, h = 0, a = 0, s = 1) { for (const p of parts) this.add(group, p.m, placed(p.g, x, y, h, a, s)); }
  many(group, parts, placements) { if (placements.length) this.inst.push({ group, parts, placements }); }
  build(venue) {
    const out = {};
    const grp = (g) => (out[g] ||= Object.assign(new THREE.Group(), { name: `theme_${this.id}` }));
    for (const { group, m, list } of this.bins.values()) {
      const material = M(m), mesh = new THREE.Mesh(PR.merge(list), material);
      const base = m?.isMaterial ? (material.blending === THREE.AdditiveBlending ? 'halo' : material.name) : Array.isArray(m) ? m[0] : m;
      mesh.castShadow = !material.transparent && !NO_PHOTO.has(base); mesh.receiveShadow = !NO_PHOTO.has(base);
      if (NO_PHOTO.has(base)) { mesh.userData.noPhoto = true; mesh.renderOrder = 3; }
      if (material.transparent) mesh.renderOrder = Math.max(mesh.renderOrder, 2);
      mesh.name = `theme:${base}`; grp(group).add(mesh);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const { group, parts, placements } of this.inst) {
      for (const p of parts) {
        const material = M(p.m), im = new THREE.InstancedMesh(p.g, material, placements.length);
        im.castShadow = true; im.receiveShadow = true;
        if (material.blending === THREE.AdditiveBlending) { im.castShadow = im.receiveShadow = false; im.userData.noPhoto = true; im.renderOrder = 3; }
        placements.forEach((pl, i) => im.setMatrixAt(i, m4.compose(pos.set(pl.p[0], pl.y || 0, -pl.p[1]), q.setFromAxisAngle(up, pl.a || 0), sc.set(pl.sx ?? pl.s ?? 1, pl.sy ?? pl.s ?? 1, pl.sz ?? pl.s ?? 1))));
        im.instanceMatrix.needsUpdate = true; grp(group).add(im);
      }
    }
    for (const [g, o] of Object.entries(out)) venue.groups[g].add(o);
    return out;
  }
}

// ------------------------------------------------------------------ geometry helpers (plan space)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add2 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const len2 = (v) => Math.hypot(v[0], v[1]), nrm = (v) => { const l = len2(v) || 1; return [v[0] / l, v[1] / l]; };
const angOf = (v) => Math.atan2(v[1], v[0]);
function fitCircle(pts) {                        // least-squares circle (Kåsa)
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [sxz, syz, sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A), col = (k) => A.map((r, i) => r.map((v, j) => (j === k ? b[i] : v)));
  const a1 = det(col(0)) / D, b1 = det(col(1)) / D, c1 = det(col(2)) / D;
  const cx = a1 / 2, cy = b1 / 2; return { c: [cx, cy], r: Math.sqrt(c1 + cx * cx + cy * cy) };
}
// thin vertical strip (curtain/valance/fringe) along a plan path, top at `top`, bottom given by fn(s); uv in metres
function strip3(path, top, bottomOf, step = 0.05) {
  const { pts, total } = G.resample(path, step); const pos = [], uv = [];
  const L = []; let s = 0; for (let i = 0; i < pts.length; i++) { if (i) s += len2(sub(pts[i], pts[i - 1])); L.push(s); }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], ya = bottomOf(L[i - 1]), yb = bottomOf(L[i]);
    const A = [a[0], top, -a[1]], B = [b[0], top, -b[1]], Ab = [a[0], ya, -a[1]], Bb = [b[0], yb, -b[1]];
    pos.push(...Ab, ...Bb, ...B, ...Ab, ...B, ...A);
    uv.push(L[i - 1], ya - (top - 1), L[i], yb - (top - 1), L[i], 1, L[i - 1], ya - (top - 1), L[i], 1, L[i - 1], 1);
  }
  void total;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
// sloped canopy (awning / thatch eave) from path at height top, out along `out(s)` by depth, dropping `drop`
function canopy(path, outN, top, depth, drop, step = 0.1) {
  const { pts } = G.resample(path, step); const pos = [], uv = []; let s0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], s1 = s0 + len2(sub(b, a));
    const na = outN(a), nb = outN(b), ao = add2(a, na, depth), bo = add2(b, nb, depth);
    const A = [a[0], top, -a[1]], B = [b[0], top, -b[1]], Ao = [ao[0], top - drop, -ao[1]], Bo = [bo[0], top - drop, -bo[1]];
    const sl = Math.hypot(depth, drop);
    pos.push(...A, ...B, ...Bo, ...A, ...Bo, ...Ao); uv.push(s0, 0, s1, 0, s1, sl, s0, 0, s1, sl, s0, sl); s0 = s1;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
const offsetPath = (path, outN, d) => path.map((p) => add2(p, outN(p), d));
// tied-back curtain panel (local: width along X, faces +Z), pinched at the tie
function curtain(h, w = 0.7, tie = 1.05) {
  const g = new THREE.PlaneGeometry(w, h, 10, 30); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + h / 2, d = Math.abs(y - tie) / Math.max(tie, h - tie), k = 0.22 + 0.78 * Math.min(1, d ** 0.8);
    p.setX(i, (x + w / 2) * k - w / 2 * 0.15); p.setY(i, y); p.setZ(i, 0.035 * Math.sin(x * 26) * k);
  }
  g.computeVertexNormals(); return g;
}
function ringPoly(c, r, n = 72) { return Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * TAU), c[1] + r * Math.sin((i / n) * TAU)]); }
function sectorPoly(c, r0, r1, a0, a1, n = 18) {
  const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([c[0] + r1 * Math.cos(a), c[1] + r1 * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); out.push([c[0] + r0 * Math.cos(a), c[1] + r0 * Math.sin(a)]); }
  return out;
}
// thin skin following an arc (cladding / wall panels): panels between arc points, thickness t
function arcSkin(c, r, a0, a1, z0, z1, t = 0.02, step = 0.35) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / step)), gs = [];
  for (let i = 0; i < n; i++) { const p = [c[0] + r * Math.cos(a0 + (a1 - a0) * i / n), c[1] + r * Math.sin(a0 + (a1 - a0) * i / n)], q = [c[0] + r * Math.cos(a0 + (a1 - a0) * (i + 1) / n), c[1] + r * Math.sin(a0 + (a1 - a0) * (i + 1) / n)]; gs.push(G.panel(p, q, z0, z1, t)); }
  return PR.merge(gs);
}
// stand a local shape (face +Z, x to the right, y up) at plan point p facing plan direction f, base height h
function placeFacing(g, p, f, h) {
  // local +Z -> world facing direction (f[0], 0, -f[1]); local +X -> right-hand along the wall
  const fz = new THREE.Vector3(f[0], 0, -f[1]).normalize(), fy = new THREE.Vector3(0, 1, 0), fx = new THREE.Vector3().crossVectors(fy, fz);
  const m = new THREE.Matrix4().makeBasis(fx, fy, fz); m.setPosition(p[0], h, -p[1]); return g.applyMatrix4(m);
}

const POOL = () => [{ m: poolMaterial(), g: poolGeometry() }];

// ------------------------------------------------------------------ the themes
export class Themes extends EventTarget {
  constructor({ V, venue, brand, defaults }) {
    super();
    Object.assign(this, { V, venue, brand, defaults });
    this.id = 'free'; this.built = {}; this.schemes = {}; this.extraColliders = [];
    this.H = V.heights; this.Z = venue.zones; this.D = V.features.drum;
    this.site = this._siteFacts();
  }
  get current() { return this.id; }

  // ---- facts about the building the renders refer to (computed once from the CAD)
  _siteFacts() {
    const { V, venue, Z, D } = this; const C = D.center;
    // the round alcove's back wall: the curved wall inside the white coffer ring (PLAN_GF_logo-and-live-band)
    const curved = V.solids.filter((s) => s.kind === 'wall').map((s) => ({ s, pts: s.outer.filter((p) => len2(sub(p, C)) < 6.2) })).sort((a, b) => b.pts.length - a.pts.length)[0];
    const arc = fitCircle(curved.pts); arc.rHall = Math.max(...curved.pts.map((p) => len2(sub(p, arc.c))));
    // angles about the arc centre, unwrapped around the wall's own direction (it straddles ±180°)
    const mdir = angOf(sub(G.centroid(curved.pts), arc.c));
    const angs = curved.pts.map((p) => mdir + Math.atan2(Math.sin(angOf(sub(p, arc.c)) - mdir), Math.cos(angOf(sub(p, arc.c)) - mdir)));
    // stage band along the hall face, kept inside the alcove (≤ 5.1 m from the drum centre): longest run of angles
    const depth = 2.0; let a0 = null, a1 = null, s0 = null, longest = 0;
    for (let a = Math.min(...angs); a <= Math.max(...angs) + 1e-9; a += 0.005) {
      const B = add2(arc.c, [Math.cos(a), Math.sin(a)], arc.rHall + 0.02), F = add2(arc.c, [Math.cos(a), Math.sin(a)], arc.rHall + depth + 0.6);
      const ok = len2(sub(B, C)) <= 5.3 && len2(sub(F, C)) <= 5.1;
      if (ok) { s0 ??= a; if (a - s0 > longest) { longest = a - s0; a0 = s0; a1 = a; } } else s0 = null;
    }
    const stage = { arc, a0, a1, am: (a0 + a1) / 2, depth };
    stage.poly = sectorPoly(arc.c, arc.rHall + 0.02, arc.rHall + depth, a0, a1, 24);
    stage.step1 = sectorPoly(arc.c, arc.rHall + depth, arc.rHall + depth + 0.3, a0 + 0.03, a1 - 0.03, 24);
    stage.step2 = sectorPoly(arc.c, arc.rHall + depth + 0.3, arc.rHall + depth + 0.6, a0 + 0.06, a1 - 0.06, 24);
    stage.wallPoint = add2(arc.c, [Math.cos(stage.am), Math.sin(stage.am)], arc.rHall);
    stage.face = [Math.cos(stage.am), Math.sin(stage.am)];
    stage.center = add2(arc.c, stage.face, arc.rHall + depth / 2);
    // bar counter frame: principal axis, front edge (toward the hall), back edge
    const ctr = V.solids.find((s) => s.kind === 'counter');
    const ax = G.principalAngle(ctr.outer), u = [Math.cos(ax), Math.sin(ax)], v = [-u[1], u[0]];
    const c0 = G.centroid(ctr.outer); const proj = ctr.outer.map((p) => (p[0] - c0[0]) * u[0] + (p[1] - c0[1]) * u[1]);
    const front = [], back = [];
    for (let t = Math.min(...proj) + 0.25; t <= Math.max(...proj) - 0.25; t += 0.25) {
      const p = add2(c0, u, t), ts = G.lineCuts(p, v, ctr.outer); if (ts.length < 2) continue;
      const pa = add2(p, v, Math.min(...ts)), pb = add2(p, v, Math.max(...ts));
      const [f, b] = len2(sub(pa, C)) < len2(sub(pb, C)) ? [pa, pb] : [pb, pa]; front.push(f); back.push(b);
    }
    const bar = { front, back, outN: nrm(sub(front[(front.length / 2) | 0], back[(back.length / 2) | 0])) };
    // the white pebble wall behind the bar (tagged in the CAD build) -> brewhouse glazing line
    const bw = V.solids.find((s) => s.tag === 'bar_back');
    const bax = G.principalAngle(bw.outer), bu = [Math.cos(bax), Math.sin(bax)], bc = G.centroid(bw.outer);
    const bp = bw.outer.map((p) => (p[0] - bc[0]) * bu[0] + (p[1] - bc[1]) * bu[1]);
    let g0 = add2(bc, bu, Math.min(...bp)), g1 = add2(bc, bu, Math.max(...bp)); if (g0[1] > g1[1]) [g0, g1] = [g1, g0];
    const intoRoom = (() => { const n = [-bu[1], bu[0]]; return len2(sub(add2(bc, n, 1), c0)) > len2(sub(add2(bc, n, -1), c0)) ? n : [-n[0], -n[1]]; })();
    const walls = V.solids.filter((s) => (s.kind === 'wall' || s.kind === 'column') && s.tag !== 'bar_back');
    const clearance = (p) => Math.min(...walls.map((s) => (G.inside(p, s.outer) ? 0 : G.ringDist(p, s.outer))));
    const brew = { g0, g1, intoRoom, clearance };
    // courtyard-facing edge of the pod band (the "glass pavilion" fascia + eave in GF01)
    const sm = Z.smoking, edge = [];
    for (let i = 0; i < sm.length; i++) { const p = sm[i], q = sm[(i + 1) % sm.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; edge.push(G.ringDist(m, Z.outdoor) < 0.8 && !G.inside(m, Z.indoor)); }
    let best = [], cur = [];
    for (let k = 0; k < sm.length * 2; k++) { const i = k % sm.length; if (edge[i]) { if (!cur.length) cur.push(sm[i]); cur.push(sm[(i + 1) % sm.length]); } else { if (cur.length > best.length) best = cur; cur = []; } }
    if (cur.length > best.length) best = cur;
    const PR0 = V.features.passage?.roof; if (PR0) best = best.filter((p) => !G.inside(p, PR0) && G.ringDist(p, PR0) > 0.4);   // the walkway to the entrance has its own roof
    const pavilion = { path: best, out: (p) => { const c = G.centroid(Z.outdoor); void c; const t = [0, 0]; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) if (G.inside(add2(p, d, 0.6), Z.outdoor) && !G.inside(add2(p, d, 0.6), Z.smoking)) { t[0] += d[0]; t[1] += d[1]; } return nrm(t); } };
    // seaward glazing of the pods (GF10–12 windows)
    const seaRun = V.glazing.filter((g) => g.zone === 'smoking').sort((a, b) => G.resample(b.path, 1).total - G.resample(a.path, 1).total)[0];
    const podsIn = (p) => { for (const d of [[0, -1], [1, 0], [-1, 0], [0, 1], [0.7, -0.7], [-0.7, -0.7]]) if (G.inside(add2(p, d, 0.8), Z.smoking)) return d; return [0, -1]; };
    const pods = { sea: seaRun.path, inN: (p) => nrm(podsIn(p)) };
    // the restobar entrance from the courtyard (GF02): the longest wall-free stretch of the indoor edge that
    // faces the courtyard (the CAD leaves the door opening open)
    const solidsAll = V.solids.filter((s) => ['wall', 'column', 'planter', 'low_wall_indoor', 'counter'].includes(s.kind));
    const free = (p) => solidsAll.every((s) => !G.inside(p, s.outer) && G.ringDist(p, s.outer) > 0.3)
      && V.glazing.every((g) => g.path.every((q, i) => i === 0 || G.segDist(p, g.path[i - 1], q)[0] > 0.3)) && V.gen_walls.every((w) => w.path.every((q, i) => i === 0 || G.segDist(p, w.path[i - 1], q)[0] > 0.3));
    const samples = [];
    for (let i = 0; i < Z.indoor.length; i++) { const a = Z.indoor[i], b = Z.indoor[(i + 1) % Z.indoor.length], L = len2(sub(b, a)); for (let t = 0; t < L; t += 0.2) { const p = add2(a, nrm(sub(b, a)), t); samples.push({ p, ok: G.ringDist(p, Z.outdoor) < 1.2 && free(p) }); } }
    let runE = [], bestE = [];
    for (const smp of samples.concat(samples)) { if (smp.ok) { runE.push(smp.p); if (runE.length > bestE.length && runE.length <= samples.length) bestE = [...runE]; } else runE = []; }
    const T = V.features.courtyard_tree.center;
    const entP = bestE.length ? bestE[(bestE.length / 2) | 0] : Z.indoor.reduce((m, q) => (len2(sub(q, T)) < len2(sub(m, T)) ? q : m));
    const entDir = bestE.length > 1 ? nrm(sub(bestE[bestE.length - 1], bestE[0])) : [0, 1];
    let entOut = [-entDir[1], entDir[0]]; if (G.inside(add2(entP, entOut, 0.6), Z.indoor)) entOut = [-entOut[0], -entOut[1]];
    const entrance = { p: entP, out: entOut, width: Math.max(1.6, Math.min(3.2, bestE.length * 0.2)) };
    if (V.features.entrance) Object.assign(entrance, V.features.entrance);   // the entrance as in video 1 (layout.js)
    // first floor: blind bays (back wall), DJ in the middle of the longest blind run, bar to its left
    const bays = venue.upper.bays, N = bays.length; let run = [], bestRun = [];
    for (let k = 0; k < N * 2; k++) { const b = bays[k % N]; if (!b.open && !b.door) { run.push(b); if (run.length > bestRun.length && run.length <= N) bestRun = [...run]; } else run = []; }
    const dj = bestRun[(bestRun.length / 2) | 0];
    const barBays = bestRun.filter((b) => b !== dj).sort((a, b) => ((a.k - dj.k + N) % N) - ((b.k - dj.k + N) % N)).filter((b) => ((b.k - dj.k + N) % N) <= 3 && ((b.k - dj.k + N) % N) >= 1);
    const fl = V.features.ff_layout;                                // DJ + bar pinned (layout.js), whatever the door / windows do
    const ff = { bays, dj: fl ? bays[fl.dj] : dj, barBays: fl ? fl.bar.map((k) => bays[k]) : barBays.length ? barBays : bestRun.slice(0, 2), open: bays.filter((b) => b.open), door: bays.find((b) => b.door) };
    return { stage, bar, brew, pavilion, pods, entrance, ff };
  }

  // ---- public: switch theme
  async set(id) {
    if (!THEME_LIST.some((t) => t.id === id) || id === this.id && this.applied) return;
    const prev = this.id; this.schemes[prev] = currentScheme();
    if (id !== 'free' && !this.built[id]) { this.built[id] = this._build(id); }
    this.id = id; this.applied = true;
    const scheme = this.schemes[id] || this.defaultScheme(id);
    for (const [s, f] of Object.entries(scheme)) if (SURFACES[s] && FINISHES[f] && SURFACES[s].finish !== f) setFinish(s, f);
    this.refresh();
    this.dispatchEvent(new CustomEvent('change', { detail: id }));
  }
  // free-only objects hide under a theme; theme objects show for their theme (re-run after async model loads)
  refresh() {
    const { venue } = this, themed = this.id !== 'free';
    const freeOnly = new Set(['model_furniture', 'model_plants', 'shrubs', 'cone_lamps', 'globe_lamps', 'free_pools', 'baskets', 'furniture', 'sphere_planters']);   // themes plant the doors themselves
    venue.root.traverse((o) => {
      if (freeOnly.has(o.name) && o !== venue.groups.furniture) o.visible = !themed;
      if (o.name.startsWith('theme_')) o.visible = o.name === `theme_${this.id}`;
    });
    venue.furnitureGroup.visible = !themed;
    // by name prefix: wall elements carry their own meshes (…|el12), see builder.js / elements.js
    const hide = (prefix, v) => venue.root.traverse((o) => { if (o.isMesh && o.name.startsWith(prefix) && !(v && this.glassed?.(o.userData.element))) o.visible = v; });
    hide('structure|fixed:foliage', !themed);                       // planter-top greens -> theme pots
    hide('structure|indoor_walls|bar_back', !themed);              // pebble wall -> brewhouse glazing
    hide('structure|fixed:skirting|bar_back', !themed);
    hide('glazing|partitions', this.id !== 'riviera');             // Riviera: low cane dividers instead
    hide('upper|fixed:iron_rail', this.id !== 'bali');             // Bali: carved teak lattice balustrade
    const iron = fixedMaterial('iron_rail'); iron.color.set(this.id === 'riviera' ? '#1e2c48' : '#151515');
  }
  // where this theme's practical (real) lights go: bar, stage, dining, pods, courtyard, the DJ pub, the stair
  lightSpots(id = this.id) {
    if (id === 'free') return null;
    const { site, D, H } = this, C = D.center, RR = D.radius, at = (r, a) => [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)];
    const bar = site.bar, mid = bar.front[(bar.front.length / 2) | 0], nEnd = bar.front[bar.front.length - 2] || mid;
    const pods = this.venue.items.filter((f) => f.zone === 'smoking' && f.type === 'coffee_table').sort((a, b) => a.at[0] - b.at[0]);
    const pick = (arr, t) => arr[Math.min(arr.length - 1, Math.round(t * (arr.length - 1)))]?.at || [0, 0];
    const pv = site.pavilion.path[(site.pavilion.path.length / 2) | 0] || [-8, 0], pvo = site.pavilion.out(pv);
    const ff = site.ff, dj = ff.dj.am, barA = ff.barBays.length ? ff.barBays.reduce((sum, b) => sum + b.am, 0) / ff.barBays.length : dj + 0.5;
    const win = ff.open[(ff.open.length / 2) | 0]?.am ?? dj + Math.PI;
    const g = H.indoor_ceiling - 0.85, f = H.upper_floor;     // at pendant-bulb height, not against the ceiling
    return [
      { p: add2(mid, bar.outN, 0.6), h: g, power: 9 }, { p: add2(nEnd, bar.outN, 0.5), h: g, power: 7 },
      { p: site.stage.center, h: g, power: 11 }, { p: add2(C, [-1, 0.6], 3.2), h: g, power: 7 }, { p: [5, -7], h: g, power: 7 },
      { p: pick(pods, 0.1), h: H.smoking_roof - 0.35, power: 7 }, { p: pick(pods, 0.5), h: H.smoking_roof - 0.35, power: 7 }, { p: pick(pods, 0.9), h: H.smoking_roof - 0.35, power: 7 },
      { p: add2(pv, pvo, 1.2), h: 2.6, power: 6 },
      { p: C, h: f + 2.8, power: 12, dist: 14 }, { p: at(RR - 3.2, dj), h: f + 2.4, power: 9 }, { p: at(RR - 3.2, barA), h: f + 2.4, power: 8 },
      { p: at(RR - 3.0, win), h: f + 2.4, power: 7 }, { p: this.venue.upper.stair.top, h: f + 2.2, power: 6 },
    ];
  }
  defaultScheme(id) { return id === 'free' ? { ...this.defaults } : { ...this.defaults, ...SCHEMES[id] }; }
  // load a saved set of per-theme finish schemes (profiles) and show `id` with its scheme
  async restore(schemes, id) {
    this.schemes = { ...schemes };
    if (id !== 'free' && !this.built[id]) this.built[id] = this._build(id);
    this.id = id; this.applied = true;
    const scheme = this.schemes[id] || this.defaultScheme(id);
    for (const [s2, f2] of Object.entries(scheme)) if (SURFACES[s2] && FINISHES[f2] && SURFACES[s2].finish !== f2) setFinish(s2, f2);
    this.refresh(); this.dispatchEvent(new CustomEvent('change', { detail: id }));
  }
  allSchemes() { return { ...this.schemes, [this.id]: currentScheme() }; }
  setNight(k) { for (const [m, d, n] of glowMaterials()) m.emissiveIntensity = d + (n - d) * k; const b = mat('beam'); b.opacity = 0.16 * Math.max(0, k - 0.3); const h = mat('halo'); h.opacity = 0.35 + 0.5 * k; }
  // theme-only colliders (bar counters, DJ console) are registered with the navigator once
  colliders() { return this.extraColliders; }

  // ---- build a theme (once)
  _build(id) {
    const t0 = performance.now(), d = new Dress(id), R = id === 'riviera', B = id === 'bali';
    const when = () => this.id === id;
    this._furniture(d, R);
    this._plants(d, R);
    this._lamps(d, R);
    this._barBrewhouse(d, R, when);
    this._brewery(d, R);
    this._stage(d, R, when);
    this._hall(d, R);
    this._pods(d, R, B);
    this._pavilion(d, R);
    this._ffEntrance(d, R);
    this._stair(d, R);
    this._firstFloor(d, R, when);
    const groups = d.build(this.venue);
    console.info(`theme ${id} built in ${Math.round(performance.now() - t0)} ms`);
    return groups;
  }

  // ---------------------------------------------------------------- furniture on the CAD positions
  _furniture(d, R) {
    const { venue, site } = this, items = venue.items;
    const fy = (x, y) => venue.floorAt(x, y) ?? 0;
    const onStage = (p) => [site.stage.poly, site.stage.step1, site.stage.step2].some((r) => G.inside(p, r) || G.ringDist(p, r) < 0.4);
    const pick = (f) => {
      const z = f.zone;
      switch (f.type) {
        case 'chair': return { key: 'chair', parts: () => (R ? PR.chairRiviera() : PR.chairBali()) };
        case 'armchair': return { key: 'arm', parts: () => (R ? PR.loungeChair('stripe_cushion', 'linen_white') : PR.loungeChair('linen', 'ikat')) };
        case 'sofa': case 'loveseat': {
          const L = Math.min(2.6, Math.max(1.2, Math.round(Math.max(f.w, f.l) / 0.25) * 0.25));
          const out = z === 'outdoor' || z === 'beach_deck';
          return { key: `sofa${out ? 'o' : ''}${L}`, parts: () => (R ? (out ? PR.caneSofa(L) : PR.sofaRiviera(L)) : PR.daybedBali(L)), real: true };
        }
        case 'table': return { key: 'table', parts: () => (R ? PR.tableMarbleRect() : PR.tableTeakRect()), stretch: true };   // Riviera: white marble (renders)
        case 'table_round': return { key: 'tround', parts: () => (R ? PR.tableTulip() : PR.tableTeakRound()), stretch: true };
        case 'coffee_table': return { key: 'coffee', parts: () => (R ? PR.tableTulip(0.42) : PR.coffeeTeak()), stretch: true };
        case 'side_table_round': return { key: 'side', parts: () => (R ? PR.sideBrass() : PR.sideTeak()), stretch: true };
        case 'bar_stool': return { key: 'stool', parts: () => (R ? PR.barStoolRiviera() : PR.barStoolBali()) };
        case 'pouf': return { key: 'pouf', parts: () => (R ? PR.poufRiviera() : PR.poufBali()) };
        case 'sunbed': return { key: 'sunbed', parts: () => (R ? PR.sunbed('white_pot', 'stripe_cushion') : PR.sunbed('teak_solid', 'linen')), real: true };
        default: return null;
      }
    };
    const sets = new Map();
    for (const f of items) {
      if (onStage(f.at)) continue;                                 // the stage takes this part of the alcove
      const pk = pick(f); if (!pk) continue;
      if (!sets.has(pk.key)) sets.set(pk.key, { parts: pk.parts(), stretch: pk.stretch, list: [] });
      const [dx, dz] = footprint(f), a = orient(f, items);
      const set = sets.get(pk.key);
      set.list.push(pk.stretch ? { p: f.at, y: fy(...f.at), a, sx: dx, sy: 1, sz: dz } : { p: f.at, y: fy(...f.at), a, s: 1 });
    }
    for (const { parts, list } of sets.values()) d.many('furniture', parts, list);
    // a candle (and on Riviera a little olive pot) on each dining table
    const tables = items.filter((f) => ['table', 'table_round'].includes(f.type) && f.zone !== 'beach_deck' && !onStage(f.at));
    d.many('furniture', PR.hurricane(), tables.map((f) => ({ p: f.at, y: fy(...f.at) + 0.75, a: 0 })));
    d.many('furniture', PR.tablePlant(R), tables.filter((_, i) => i % 2).map((f) => ({ p: [f.at[0] + 0.15, f.at[1] + 0.1], y: fy(...f.at) + 0.75, a: f.at[0] })));
  }

  // ---------------------------------------------------------------- planting on the CAD plant symbols
  _plants(d, R) {
    const { V, venue } = this, T = V.features.courtyard_tree;
    const fy = (x, y) => venue.floorAt(x, y) ?? 0;
    const sp = { olive: [], palm: [], monstera: [], frangipani: [], bird: [] };
    V.plants.forEach((p, i) => {
      if (len2(sub(p.at, T.center)) < T.radius + 0.3) return;
      const z = ['indoor', 'smoking', 'outdoor', 'beach_deck'].find((k) => G.inside(p.at, this.Z[k])) || 'outdoor';
      const s = Math.min(1.25, Math.max(0.75, p.r / 1.2));
      const pl = { p: p.at, y: fy(...p.at), a: i * 2.39, s };
      if (R) (z === 'indoor' || z === 'smoking' ? (i % 3 === 0 ? sp.palm : sp.olive) : sp.olive).push(pl);
      else (z === 'indoor' ? (i % 2 ? sp.monstera : sp.palm) : z === 'smoking' ? [sp.palm, sp.monstera, sp.bird][i % 3] : i % 2 ? sp.frangipani : sp.bird).push(pl);
    });
    const pot = R ? 'terracotta_pot' : 'lava_pot';
    d.many('plants', PR.oliveTree(2.3, pot), sp.olive);
    d.many('plants', PR.pottedPalm(1.9, pot), sp.palm);
    d.many('plants', PR.monstera(1.3, pot), sp.monstera);
    d.many('plants', PR.frangipani(2.4, pot), sp.frangipani);
    d.many('plants', PR.birdOfParadise(1.5, pot), sp.bird);
    // pots on the low curved ledge of the round alcove (GF08: baskets -> palms / olives in pots)
    const pots = [];
    for (const s of V.solids.filter((x) => x.kind === 'planter' && G.inside(G.centroid(x.outer), this.Z.indoor))) {
      const a = G.principalAngle(s.outer), u = [Math.cos(a), Math.sin(a)], c = G.centroid(s.outer);
      const pr = s.outer.map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]); const L = Math.max(...pr) - Math.min(...pr);
      for (let t = Math.min(...pr) + 0.45; t < Math.max(...pr) - 0.3; t += 1.1) pots.push({ p: add2(c, u, t), y: this.H.planter + 0.05, a: t * 3, s: 0.55 }); void L;
    }
    d.many('plants', R ? PR.oliveTree(1.6, 'terracotta_pot') : PR.monstera(1.2, 'lava_pot'), pots);
  }

  // ---------------------------------------------------------------- pendants over the tables (as the renders)
  _lamps(d, R) {
    const { venue, H } = this, items = venue.items, spots = { a: [], b: [], c: [] };
    for (const f of items) {
      if (f.zone === 'smoking' && ['coffee_table', 'table'].includes(f.type)) (spots.a.length % 2 ? spots.b : spots.a).push({ p: f.at, y: H.smoking_roof - 0.02, a: f.at[0] });
      if (f.zone === 'indoor' && ['side_table_round', 'table_round', 'coffee_table', 'table'].includes(f.type)) spots.c.push({ p: f.at, y: H.indoor_ceiling - 0.03, a: f.at[1] });
    }
    // pods: woven pendants (both themes); indoor: woven (Bali) or opal globe clusters (Riviera)
    d.many('lamps', PR.pendant('woven_bell', 0.55), spots.a);
    d.many('lamps', PR.pendant(R ? 'woven_bell' : 'woven_dome', 0.55), spots.b);
    d.many('lamps', PR.pendant(R ? 'globe_cluster' : 'woven_dome', 0.75), spots.c.filter((_, i) => i % 2 === 0));
    d.many('lamps', PR.pendant(R ? 'woven_bell' : 'woven_lantern', 0.7), spots.c.filter((_, i) => i % 2 === 1));
    // warm pools of light on the floor under every pendant (the renders' uneven, lamp-lit floors)
    const fy = (p) => (venue.floorAt(p[0], p[1]) ?? 0) + 0.012;
    d.many('lamps', POOL(), [...spots.a, ...spots.b, ...spots.c].map((sp) => ({ p: sp.p, y: fy(sp.p), s: 1.35 })));
  }

  // ---------------------------------------------------------------- bar + brewhouse (GF03–GF05)
  _barBrewhouse(d, R, when) {
    const { site, H } = this, { bar, brew } = site, fl = H.indoor_floor;
    const metal = R ? 'brass' : 'bronze';
    // foot rail + LED under the bar top, along the hall side of the counter
    const rail = bar.front.map((p) => add2(p, bar.outN, 0.2));
    d.add('structure', metal, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail.map((p) => new THREE.Vector3(p[0], fl + 0.22, -p[1]))), 60, 0.022, 8));
    for (let i = 0; i < rail.length; i += 3) d.add('structure', metal, G.beam(bar.front[i], rail[i], 0.025, fl + 0.2, fl + 0.24));
    d.add('structure', 'led_strip', PR.merge(bar.front.slice(1).map((p, i) => G.beam(add2(bar.front[i], bar.outN, 0.035), add2(p, bar.outN, 0.035), 0.02, H.counter - 0.1, H.counter - 0.08))));
    d.many('structure', POOL(), bar.front.filter((_, i) => i % 2 === 0).map((p) => ({ p: add2(p, bar.outN, 0.35), y: fl + 0.012, s: 0.7 })));   // underglow wash
    // taps on the back half of the top (8, centred), turned toward the hall
    const mid = bar.back[(bar.back.length / 2) | 0], midF = bar.front[(bar.front.length / 2) | 0], tdir = nrm(sub(midF, mid));
    const tp = add2(mid, tdir, 0.18), along = nrm(sub(bar.back[bar.back.length - 1], bar.back[0]));
    d.prop('structure', PR.tapTower(8, R ? 'terracotta_velvet' : 'teak_solid', metal), tp[0], tp[1], H.counter + 0.05, angOf(tdir) + 0 * along[0]);
    // the white pebble wall becomes floor-to-ceiling glazing: dark bronze (Bali) / slim brass (Riviera) frames
    const frame = R ? 'brass' : 'bronze_dark', top = H.indoor_ceiling;
    const gl = len2(sub(brew.g1, brew.g0)), gn = Math.max(2, Math.round(gl / 0.9));
    d.add('structure', 'glass', G.pane(brew.g0, brew.g1, fl, top));
    for (let i = 0; i <= gn; i++) d.add('structure', frame, G.post(add2(brew.g0, nrm(sub(brew.g1, brew.g0)), (gl * i) / gn), 0.06, fl, top, 0.08));
    for (const z of [fl, fl + 1.0, top - 0.08]) d.add('structure', frame, G.beam(brew.g0, brew.g1, 0.08, z, z + 0.07));
    // brewhouse room behind: copper tanks (3) on a plinth, pipework, back wall + floor, pendants (GF05) — the bar's own
    // brew kit (client notes 27 Oct: keep it); the big brewhouse is in the curved glass room (_brewery)
    const n = brew.intoRoom, along2 = nrm(sub(brew.g1, brew.g0)), sn = [-n[0], -n[1]], spots = [];
    for (const [s, r, h] of [[0.75, 0.5, 1.6], [1.85, 0.5, 1.75], [2.9, 0.42, 1.35]]) {
      for (const off of [1.05, 0.95, 0.85]) { const c = add2(add2(brew.g0, along2, Math.min(s, gl - 0.3)), n, off); if (brew.clearance(c) > r + 0.12 && G.inside(c, this.Z.indoor)) { spots.push({ c, r, h }); break; } }
    }
    const plinth = R ? 'terrazzo_white' : 'lava_stone';
    for (const [i, s] of spots.entries()) {
      d.add('structure', plinth, G.cyl(s.c, s.r + 0.22, fl, fl + 0.15, 28));
      d.prop('structure', PR.tank(s.h, s.r, i === 2 && !R ? 'copper_hammered' : 'copper', { band: R ? 'brass' : 'copper', cone: i !== 2 }), s.c[0], s.c[1], fl + 0.15, angOf(n) + Math.PI);
    }
    if (spots.length > 1) {                                       // brass pipework header with drops into each tank
      const hp = spots.map((s) => new THREE.Vector3(...[add2(s.c, n, -s.r - 0.12)].map((p) => [p[0], fl + 2.35, -p[1]])[0]));
      d.add('structure', 'brass', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 40, 0.025, 8));
      for (const [i, s] of spots.entries()) d.add('structure', 'brass', G.cyl(add2(s.c, n, -s.r - 0.12), 0.022, fl + 0.6 + s.h * 0.4, fl + 2.35, 8)), void i;
    }
    for (const s of spots) d.prop('structure', PR.pendant(R ? 'brass_dome' : 'woven_bell', 0.6), s.c[0], s.c[1], top - 0.02);
    // back wall of the brewhouse: lava stone (Bali) / white glazed subway tile (Riviera), floor resin/terrazzo
    const far = add2(add2(brew.g0, n, 2.25), along2, -0.3), far2 = add2(add2(brew.g1, n, 2.25), along2, 0.6);
    d.add('structure', R ? 'tile_subway' : 'lava_wall', G.panel(far, far2, fl, top, 0.03));
    const room = [add2(brew.g0, n, 0.12), add2(brew.g1, n, 0.12), far2, far];
    d.add('structure', R ? 'terrazzo_white' : 'concrete_light', G.flat(room, [], fl + 0.004));
    // beer list: chalk slate in a teak frame (Bali) / navy flip-board (Riviera), hung at the north end of the glazing
    const bp = add2(add2(brew.g1, along2, 0.9), sn, 0.06);                         // over the north shelves, beside the back bar
    d.add('structure', R ? 'board_riviera' : 'board_bali', placeFacing(new THREE.PlaneGeometry(0.85, 0.95), bp, [-n[0], -n[1]], fl + 2.85));
    d.add('structure', R ? 'brass' : 'teak_solid', placeFacing(PR.merge([new THREE.BoxGeometry(0.93, 0.05, 0.03).translate(0, 0.5, 0), new THREE.BoxGeometry(0.93, 0.05, 0.03).translate(0, -0.5, 0), new THREE.BoxGeometry(0.05, 1.03, 0.03).translate(0.45, 0, 0), new THREE.BoxGeometry(0.05, 1.03, 0.03).translate(-0.45, 0, 0)]), add2(bp, n, -0.01), [-n[0], -n[1]], fl + 2.85));
    // back-bar bottle shelves on the remaining wall behind the north end of the bar (glowing at night)
    const sb0 = add2(brew.g1, along2, 0.35), sb1 = add2(brew.g1, along2, 2.2);
    for (const z of [1.2, 1.65, 2.1]) {
      d.add('structure', R ? 'walnut' : 'teak_solid', G.beam(add2(sb0, sn, 0.15), add2(sb1, sn, 0.15), 0.28, fl + z - 0.03, fl + z));
      d.add('structure', 'led_strip', G.beam(add2(sb0, sn, 0.03), add2(sb1, sn, 0.03), 0.02, fl + z + 0.3, fl + z + 0.32));
      const bl = PR.wineBottles(Math.floor((len2(sub(sb1, sb0)) - 0.2) / 0.085), (z * 100) | 0, len2(sub(sb1, sb0)) - 0.2), mp = add2(add2(sb0, sb1, 1), [0, 0], 0).map((v) => v / 2);
      for (const p of bl) d.add('structure', p.m, placed(p.g, mp[0] + sn[0] * 0.15, mp[1] + sn[1] * 0.15, fl + z, angOf(along2) + Math.PI / 2));   // row along the shelf
    }
    if (!R) for (let s = 0.4; s < 2.2; s += 0.45) { const p = add2(add2(sb0, along2, s - 0.35), sn, 0.15); d.prop('structure', PR.hangingFern(0.25), p[0], p[1], top - 0.02, s); }
    // shelving glow / wall finish behind the shelves
    d.add('structure', R ? 'tile_subway' : 'lava_wall', G.panel(add2(sb0, sn, 0.012), add2(sb1, sn, 0.012), fl + 1.0, top, 0.02));
    void when;
  }

  // ---------------------------------------------------------------- brewhouse in the curved glass room (layout.js)
  // The curved strip between the courtyard façade and the glass screen that replaced the redundant inner wall, just
  // inside the old entrance: mash tun + kettle in copper, a line of stainless fermenters with copper bands, a bright
  // tank; brass pipework overhead, pendants, a sealed floor. The glass (and its frames) is the venue's glazing.
  _brewery(d, R) {
    const B = this.V.features.brewery; if (!B) return;
    const fl = this.H.indoor_floor, top = this.H.indoor_ceiling;
    const strip = [...B.facade, ...B.screen.slice().reverse()];
    d.add('structure', R ? 'terrazzo_white' : 'concrete_light', G.flat(strip, [], fl + 0.004));
    const { pts, total } = G.resample(B.screen, 0.1);
    const at = (s) => pts[Math.min(pts.length - 1, Math.round((s / total) * (pts.length - 1)))];
    const nearFacade = (p) => { let best = null, bd = 1e9; for (let i = 1; i < B.facade.length; i++) { const [dd, x, y] = G.segDist(p, B.facade[i - 1], B.facade[i]); if (dd < bd) { bd = dd; best = [x, y]; } } return { q: best, w: bd }; };
    const KIT = [['copper', 0.5, 1.3, false], ['copper', 0.5, 1.45, false], ['stainless', 0.44, 2.05, true], ['stainless', 0.44, 2.05, true], ['stainless', 0.44, 2.05, true], ['stainless', 0.44, 2.05, true], ['stainless', 0.4, 1.75, true]];
    const spots = [];
    KIT.forEach(([m, r0, h, cone], i) => {
      const sp = at(0.9 + (i * (total - 1.7)) / (KIT.length - 1)), { q, w } = nearFacade(sp);
      const r = Math.min(r0, (w - 0.4) / 2); if (r < 0.25) return;
      const c = [(sp[0] + q[0]) / 2, (sp[1] + q[1]) / 2], toGlass = nrm(sub(sp, q));
      spots.push({ c, r, h, toGlass });
      d.add('structure', R ? 'terrazzo_white' : 'lava_stone', G.cyl(c, r + 0.14, fl, fl + 0.12, 28));
      d.prop('structure', PR.tank(h, r, m === 'copper' && !R && i === 1 ? 'copper_hammered' : m, { band: m === 'copper' ? (R ? 'brass' : 'copper') : 'copper', cone }), c[0], c[1], fl + 0.12, angOf(toGlass));
    });
    if (spots.length > 1) {                                            // brass header along the room with drops into each vessel
      const hp = spots.map((x) => new THREE.Vector3(x.c[0], fl + 2.75, -x.c[1]));
      d.add('structure', 'brass', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 60, 0.03, 8));
      for (const x of spots) d.add('structure', 'brass', G.cyl(x.c, 0.025, fl + 0.12 + x.h, fl + 2.75, 8));
      for (const x of spots.slice(2)) { const v = add2(x.c, x.toGlass, x.r + 0.05); d.add('structure', 'brass', G.cyl(v, 0.02, fl + 0.45, fl + 0.95, 8)); }   // sample valves
    }
    for (const [i, x] of spots.entries()) if (i % 2 === 0) d.prop('structure', PR.pendant(R ? 'brass_dome' : 'woven_bell', 0.35), x.c[0], x.c[1], top - 0.02, i);
  }

  // ---------------------------------------------------------------- live-music stage in the round alcove (GF06–08)
  _stage(d, R, when) {
    const { site, H, brand } = this, st = site.stage, arc = st.arc, fl = H.indoor_floor, sh = 0.4;
    d.add('structure', R ? 'oak_stage' : 'teak', G.prism(st.poly, [], fl, fl + sh, 0.01));
    d.add('structure', R ? 'oak_stage' : 'lava_stone', G.prism(st.step1, [], fl, fl + sh * 0.66, 0.01));
    d.add('structure', R ? 'oak_stage' : 'lava_stone', G.prism(st.step2, [], fl, fl + sh * 0.33, 0.01));
    // edge: lava-stone fascia (Bali) / brass trim + warm underglow at each nosing (Riviera)
    const edgeArc = (r, z0, z1, m, t = 0.03) => d.add('structure', m, arcSkin(arc.c, r, st.a0, st.a1, z0, z1, t, 0.25));
    if (R) { edgeArc(arc.rHall + st.depth + 0.015, fl + sh - 0.03, fl + sh, 'brass'); edgeArc(arc.rHall + st.depth + 0.33, fl + sh * 0.66 - 0.05, fl + sh * 0.66 - 0.03, 'led_strip'); edgeArc(arc.rHall + st.depth + 0.63, fl + sh * 0.33 - 0.05, fl + sh * 0.33 - 0.03, 'led_strip'); }
    else edgeArc(arc.rHall + st.depth + 0.015, fl, fl + sh, 'lava_stone', 0.05);
    this.venue.addSurfaces([{ poly: st.poly, h: () => fl + sh, when }, { poly: st.step1, h: () => fl + sh * 0.66, when }, { poly: st.step2, h: () => fl + sh * 0.33, when }]);
    // back wall skin: carved paras sandstone (Bali) / warm lime plaster (Riviera), floor to ceiling
    d.add('structure', R ? 'plaster_lime' : 'sandstone_relief', arcSkin(arc.c, arc.rHall + 0.012, st.a0 - 0.12, st.a1 + 0.12, fl, H.indoor_ceiling - 0.03, 0.02));
    // the Skybrew logo, centred above the stage, with a backlight halo
    const L = brand.logo, W = 1.85, polys = [...L.icon, ...L.word, ...(R ? L.tagline : [])];
    const logo = PR.brandGeometry(polys, W, 0.05, L.aspect);
    const lp = add2(st.wallPoint, st.face, 0.05), base = fl + sh + 1.0;
    d.add('structure', R ? 'brass_logo' : 'teak_solid', placeFacing(logo, lp, st.face, base - (R ? 0 : 0.12 * W)));
    d.add('structure', 'halo', placeFacing(new THREE.PlaneGeometry(W * 1.5, W * L.aspect * 1.4).translate(0, W * L.aspect * 0.5, 0), add2(st.wallPoint, st.face, 0.03), st.face, base - 0.1));
    // stage props: stool, mic, guitar, monitors; plants / lanterns either side
    const fwd = st.face, side = [-fwd[1], fwd[0]], c = add2(st.wallPoint, fwd, 1.0);
    this.stageInfo = { stool: c, fwd, y: fl + sh, player: add2(add2(c, side, -1.0), fwd, 0.25) };   // where the band stands (people.js)
    d.prop('structure', PR.barStoolStage(R ? 'honey_wood' : 'teak_solid'), c[0], c[1], fl + sh, angOf(fwd));
    const mic = add2(c, fwd, 0.55); d.prop('structure', PR.micStand(), mic[0], mic[1], fl + sh, angOf(fwd) + Math.PI);
    const gt = add2(c, side, 0.9); d.prop('structure', PR.guitar(), gt[0], gt[1], fl + sh, angOf(fwd));
    for (const sgn of [-1, 1]) { const m = add2(add2(st.wallPoint, fwd, st.depth - 0.35), side, sgn * 1.3); d.prop('structure', PR.monitor(), m[0], m[1], fl + sh, angOf(fwd) + Math.PI); }
    if (R) { const rug = G.flat(ringPoly(c, 1.0, 40), [], fl + sh + 0.006); d.add('structure', 'jute', rug); }
    d.many('structure', POOL(), [{ p: c, y: fl + sh + 0.014, s: 2.1 }, { p: add2(c, fwd, 1.4), y: fl + 0.012, s: 1.6 }]);   // stage wash
    for (const sgn of [-1, 1]) {
      const ang = sgn < 0 ? st.a0 + 0.06 : st.a1 - 0.06, p = add2(arc.c, [Math.cos(ang), Math.sin(ang)], arc.rHall + 0.5);
      d.prop('plants', R ? PR.oliveTree(2.1, 'terracotta_pot') : PR.pottedPalm(2.0, 'lava_pot'), p[0], p[1], fl + sh, sgn * 2);
      const sc = add2(st.wallPoint, side, sgn * 1.45), wn = nrm(sub(sc, arc.c)), wp = add2(arc.c, wn, arc.rHall + 0.02);
      if (R) for (const p2 of PR.sconceGlobes(2)) d.add('structure', p2.m, placeFacing(p2.g.clone().rotateY(-Math.PI / 2), wp, wn, fl + 1.9));   // double opal sconces
      else { const lp2 = add2(wp, wn, 0.35); d.prop('structure', PR.floorLanternBali(), lp2[0], lp2[1], fl + sh, 0); }
    }
    // the white soffit ring: striped scalloped valance (Riviera) / alang-alang thatch fringe (Bali)
    const C = this.D.center, ring = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * TAU, p = [C[0] + 5.62 * Math.cos(a), C[1] + 5.62 * Math.sin(a)];
      const ok = len2(sub(p, arc.c)) > arc.rHall + 0.25 && G.inside(p, this.Z.indoor);
      if (ok) ring.push(p); else if (ring.length) { this._soffitTrim(d, R, ring.splice(0)); }
    }
    if (ring.length) this._soffitTrim(d, R, ring);
  }
  _soffitTrim(d, R, path) {
    if (path.length < 3) return;
    const top = this.H.indoor_ceiling - 0.42;                      // the soffit band's underside (builder: 2.98 m)
    if (R) d.add('ceilings', 'stripe_awning', strip3(path, top + 0.02, (s) => top - 0.3 - 0.07 * Math.abs(Math.sin((Math.PI * s) / 0.25))));
    else for (const [o, h] of [[0, 0.5], [0.04, 0.42]]) d.add('ceilings', 'thatch_fringe', strip3(path.map((p) => add2(p, nrm(sub(p, this.D.center)), o)), top + 0.02, () => top - h));
    // Bali hall render (GF08): a curved teak inlay in the polished floor, tracing the soffit edge above (4 mm proud: no z-fight)
    if (!R) d.add('structure', 'teak_solid', G.wall(path, 0.1, this.H.indoor_floor, this.H.indoor_floor + 0.004));
  }

  // ---------------------------------------------------------------- hall: column bases, wall feature (GF08/GF09)
  _hall(d, R) {
    const { V, H } = this;
    for (const s of V.solids.filter((x) => x.kind === 'column' && (G.inside(G.centroid(x.outer), this.Z.indoor) || G.inside(G.centroid(x.outer), this.Z.smoking)))) {
      const c = G.centroid(s.outer), r = Math.max(...s.outer.map((p) => len2(sub(p, c)))) + 0.035;
      if (R) { d.add('structure', ['tile_blue_vert', [r * TAU, 1.25]], G.cyl(c, r, 0, 1.25, 20)); d.add('structure', 'brass', G.cyl(c, r + 0.01, 1.25, 1.3, 20)); }
      else { d.add('structure', ['rattan', [r * TAU * 4, 4]], G.cyl(c, r, 0, 1.1, 20)); d.add('structure', 'bronze', G.cyl(c, r + 0.012, 1.1, 1.16, 20)); d.add('structure', 'bronze', G.cyl(c, r + 0.012, 0.02, 0.08, 20)); }
    }
    // the wall feature on the hall's long south-west wall: carved teak panel (Bali) / brass sunburst mirror (Riviera)
    const C = this.D.center, target = add2(C, nrm([-0.45, -0.89]), 8.5);
    let best = null, bd = 1e9;
    for (const s of V.solids.filter((x) => x.kind === 'wall' && !x.tag)) for (const p of s.outer) { const dd = len2(sub(p, target)); if (dd < bd) { bd = dd; best = p; } }
    if (best && bd < 4) {
      const f = nrm(sub(C, best)), p = add2(best, f, 0.05);
      if (R) {
        const rays = []; for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU, L = i % 2 ? 0.42 : 0.6; const g = new THREE.BoxGeometry(0.018, L, 0.012); g.translate(0, 0.3 + L / 2, 0); g.rotateZ(a); rays.push(g); }
        d.add('structure', 'brass_polished', placeFacing(PR.merge([...rays, new THREE.TorusGeometry(0.3, 0.025, 8, 40)]), p, f, H.indoor_floor + 1.9));
        d.add('structure', 'chrome', placeFacing(new THREE.CircleGeometry(0.29, 40), add2(p, f, 0.005), f, H.indoor_floor + 1.9));
      } else {
        d.add('structure', ['teak_carved', [1.2, 1.6]], placeFacing(new THREE.BoxGeometry(1.2, 1.9, 0.06), p, f, H.indoor_floor + 1.75));
        d.add('structure', 'teak_dark', placeFacing(PR.merge([new THREE.BoxGeometry(1.32, 0.08, 0.08).translate(0, 1.0, 0), new THREE.BoxGeometry(1.32, 0.08, 0.08).translate(0, -1.0, 0)]), p, f, H.indoor_floor + 1.75));
      }
    }
    // the restobar entrance from the courtyard (GF02): door surround + threshold + planting
    const e = this.site.entrance, side = [-e.out[1], e.out[0]];
    const tw = e.width / 2 + 0.1, thr = [add2(add2(e.p, side, -tw), e.out, 0), add2(add2(e.p, side, tw), e.out, 0), add2(add2(e.p, side, tw), e.out, 1.4), add2(add2(e.p, side, -tw), e.out, 1.4)];
    const walk = V.features.passage?.roof;
    if (R && walk) {                                          // the roofed walkway is paved in the hall's sand terrazzo, brass-edged
      d.add('structure', 'terrazzo_sand', G.flat(walk, [], 0.012));
      d.add('structure', 'brass', G.flat(G.strip([walk[walk.length - 2], walk[walk.length - 1]], 0.04), [], 0.013));
    } else if (R) { d.add('structure', 'terrazzo_sand', G.flat(thr, [], 0.012)); d.add('structure', 'brass', G.flat(G.strip([...thr, thr[0]], 0.04), [], 0.013)); }
    else { d.add('structure', 'sandstone_stacked', G.flat(thr, [], 0.012)); d.add('structure', 'lava_stone', G.flat(G.strip([...thr, thr[0]], 0.12), [], 0.013)); }
    // planting either side; on the walkway (layout.js) only on the building side
    for (const sgn of e.inPassage ? [1] : [-1, 1]) {
      const p = e.inPassage ? add2(add2(e.p, side, e.arch ? 1.45 : 1.05), e.out, 0.9) : add2(add2(e.p, side, sgn * (e.width / 2 + 0.6)), e.out, 0.7);
      d.prop('plants', R ? PR.oliveTree(e.inPassage ? 1.8 : 2.0, 'terracotta_pot') : PR.pottedPalm(1.8, 'terracotta_pot'), p[0], p[1], 0, sgn);
    }
    // door surround: carved teak posts + lintel (Bali) / a striped scalloped awning over the doors (Riviera); on the
    // arched doorway (layout.js) a carved teak / blue-and-white tile band round the arch instead
    const hw2 = e.width / 2, top = e.top ?? H.indoor_ceiling - 0.1;
    if (e.arch) {
      const sh = G.openingShape({ u0: -hw2 - 0.16, u1: hw2 + 0.16, v0: -0.01, v1: e.arch.crown + 0.16, arch: 'round' });
      sh.holes.push(G.openingPath({ u0: -hw2, u1: hw2, v0: 0, v1: e.arch.crown, arch: 'round' }));
      d.add('structure', R ? ['tile_blue_vert', [2, 2]] : ['teak_carved', [2, 2]], G.panelShape(e.p, add2(e.p, side, 1), sh, -(e.arch.wall / 2 + 0.06 + 0.012), 0.02));
    } else if (R) {
      const a0 = add2(e.p, side, -hw2 - 0.2), a1 = add2(e.p, side, hw2 + 0.2);
      d.add('structure', 'stripe_awning', canopy([a0, a1], () => e.out, top - 0.25, 0.85, 0.35, 0.1));
      d.add('structure', 'stripe_awning', strip3([add2(a0, e.out, 0.85), add2(a1, e.out, 0.85)], top - 0.6, (s) => top - 0.82 - 0.06 * Math.abs(Math.sin((Math.PI * s) / 0.25))));
    } else {
      for (const sgn of [-1, 1]) d.add('structure', ['teak_carved', [0.4, 3]], G.post(add2(add2(e.p, side, sgn * (hw2 + 0.12)), e.out, 0.08), 0.24, 0, top - 0.2, 0.14));
      d.add('structure', ['teak_carved', [3, 0.5]], G.beam(add2(add2(e.p, side, -hw2 - 0.28), e.out, 0.08), add2(add2(e.p, side, hw2 + 0.28), e.out, 0.08), 0.16, top - 0.45, top - 0.15));
    }
    if (!R && !e.inPassage) {                                   // stone water trough with floating frangipani (no room in the passage)
      const p = add2(add2(e.p, side, e.width / 2 + 1.5), e.out, 0.9);
      d.add('structure', 'lava_stone', G.prism([add2(add2(p, side, -0.6), e.out, -0.25), add2(add2(p, side, 0.6), e.out, -0.25), add2(add2(p, side, 0.6), e.out, 0.25), add2(add2(p, side, -0.6), e.out, 0.25)], [], 0, 0.45, 0.02));
      d.add('structure', 'glass', G.flat([add2(add2(p, side, -0.52), e.out, -0.18), add2(add2(p, side, 0.52), e.out, -0.18), add2(add2(p, side, 0.52), e.out, 0.18), add2(add2(p, side, -0.52), e.out, 0.18)], [], 0.43));
      d.prop('structure', PR.pendant('woven_lantern', 0.4), add2(e.p, e.out, 0.6)[0], add2(e.p, e.out, 0.6)[1], H.smoking_roof);
    }
  }

  // ---------------------------------------------------------------- pods / glass garden room (GF10–GF13)
  _pods(d, R, B) {
    const { V, H, site } = this, top = H.smoking_roof, sea = site.pods.sea, inN = site.pods.inN;
    const inside = offsetPath(sea, inN, 0.14);
    if (R) {
      d.add('ceilings', 'stripe_awning', strip3(inside, top - 0.02, (s) => top - 0.3 - 0.06 * Math.abs(Math.sin((Math.PI * s) / 0.25))));
    } else {
      d.add('ceilings', 'thatch_fringe', strip3(inside, top - 0.02, () => top - 0.45));
      d.add('ceilings', 'thatch_fringe', strip3(offsetPath(sea, inN, 0.2), top - 0.02, () => top - 0.36));
    }
    // curtains tied back every ~4.5 m (sheer linen + brass hooks / natural linen); Bali bamboo blinds in between
    const { pts, total } = G.resample(sea, 0.5); let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; acc += len2(sub(b, a));
      if (acc < 4.5) continue; acc = 0;
      const n = inN(b), along = nrm(sub(b, a));
      for (const sgn of [-1, 1]) {
        const cp = add2(add2(b, n, 0.22), along, sgn * 0.42), g = curtain(top - 0.35 - H.smoking_floor, 0.75);
        if (sgn < 0) g.scale(-1, 1, 1);
        d.add('glazing', R ? 'sheer' : 'linen_curtain', placeFacing(g, cp, n, H.smoking_floor));
        if (R) d.add('glazing', 'brass', G.cyl(add2(cp, along, sgn * 0.12), 0.012, 1.0, 1.06, 8));
      }
    }
    if (B) {
      let s = 0; const st = G.resample(sea, 2.2);
      for (let i = 1; i < st.pts.length; i++) {
        const a = add2(st.pts[i - 1], inN(st.pts[i - 1]), 0.1), b = add2(st.pts[i], inN(st.pts[i]), 0.1), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = len2(sub(b, a)) - 0.25;
        if (i % 2) { const roll = new THREE.CylinderGeometry(0.06, 0.06, L, 10); roll.rotateZ(Math.PI / 2); d.add('ceilings', ['bamboo_pole', [1, 2]], placed(roll, m[0], m[1], top - 0.5, angOf(sub(b, a)))); d.add('glazing', 'bamboo_blind', placeFacing(new THREE.PlaneGeometry(L, 0.6).translate(0, -0.3, 0), m, inN(m), top - 0.5)); }
        s += L;
      }
      void s;
      // hanging ferns along the pods (one per seating group)
      const groups = this.venue.items.filter((f) => f.zone === 'smoking' && f.type === 'coffee_table');
      for (const [i, f] of groups.entries()) { const p = add2(f.at, inN(f.at), -0.9); d.prop('ceilings', PR.hangingFern(0.35 + (i % 3) * 0.12), p[0], p[1], top - 0.02, i); }
    }
    // Riviera: low cane room dividers on the partition lines (GF10 Riviera: "low cane room dividers")
    if (R) for (const s of V.solids.filter((x) => x.kind === 'partition')) {
      d.add('glazing', ['cane', [3, 1.5]], G.prism(s.outer, [], H.smoking_floor, 1.3));
      d.add('glazing', 'honey_wood', G.prism(s.outer, [], 1.3, 1.36, 0, 0.02));
    }
    void total;
  }

  // ---------------------------------------------------------------- courtyard pavilion: eave + fascia sign (GF01)
  _pavilion(d, R) {
    const { H, site, brand } = this, pv = site.pavilion; if (pv.path.length < 2) return;
    const top = H.smoking_roof - 0.05;
    if (R) {
      d.add('roofs', 'stripe_awning', canopy(pv.path, pv.out, top, 1.0, 0.42));
      const lip = offsetPath(pv.path, pv.out, 1.0);
      d.add('roofs', 'stripe_awning', strip3(lip, top - 0.42, (s) => top - 0.62 - 0.07 * Math.abs(Math.sin((Math.PI * s) / 0.25))));
    } else {
      d.add('roofs', 'thatch_roof', canopy(pv.path, pv.out, top + 0.05, 1.15, 0.5));
      const lip = offsetPath(pv.path, pv.out, 1.15);
      d.add('roofs', 'thatch_fringe', strip3(lip, top - 0.44, () => top - 0.85));
    }
    // sign on the fascia, centred on the courtyard-facing run
    const { pts, total } = G.resample(pv.path, 0.25); let s = 0, mid = pts[0], dir = [1, 0];
    for (let i = 1; i < pts.length; i++) { s += len2(sub(pts[i], pts[i - 1])); if (s >= total / 2) { mid = pts[i]; dir = nrm(sub(pts[i], pts[i - 1])); break; } }
    const f = pv.out(mid), p = add2(mid, f, 0.05), fz = H.smoking_roof + 0.02;
    if (R) {
      const S = brand.serif.SKYBREW, W = 2.3; d.add('roofs', 'brass_polished', placeFacing(PR.brandGeometry(S.polys, W, 0.03, S.aspect, 0.002), p, f, fz + 0.03));
    } else {
      const S = brand.wordmark, W = 0.95; d.add('roofs', 'lava_stone', placeFacing(new THREE.BoxGeometry(W + 0.3, 0.36, 0.05), p, f, fz + 0.16));
      d.add('roofs', 'bronze', placeFacing(PR.brandGeometry(S.word, W, 0.025, S.aspect, 0.002), add2(p, f, 0.03), f, fz + 0.16 - W * S.aspect / 2));
    }
    // lanterns: tall woven bamboo floor lanterns (Bali) / brass globe lanterns under the awning (Riviera)
    const step = G.resample(pv.path, 3.2).pts;
    step.forEach((q, i) => {
      if (i === 0 || i === step.length - 1) return;
      const o = pv.out(q);
      if (R) { d.prop('roofs', PR.pendant('globe_cluster', 0.25).slice(0, 2), add2(q, o, 0.6)[0], add2(q, o, 0.6)[1], top - 0.25); d.many('structure', POOL(), [{ p: add2(q, o, 0.6), y: 0.012, s: 1.3 }]); }
      else if (i % 2) { d.prop('structure', PR.floorLanternBali(), add2(q, o, 1.5)[0], add2(q, o, 1.5)[1], 0, i); d.many('structure', POOL(), [{ p: add2(q, o, 1.5), y: 0.012, s: 1.0 }]); }
    });
  }

  // ---------------------------------------------------------------- first-floor entrance at the arrival court (FF01)
  _ffEntrance(d, R) {
    const { venue, brand, V } = this, st = venue.upper.stair, { PD: P, hw, wt, doorS, lobbyH } = st;
    const sm = (doorS[0] + doorS[1]) / 2, q = -hw - wt, out = [-st.nD[0], -st.nD[1]], along = st.dD;
    const face = P(sm, q - 0.05);
    // the name over the door is lit (client notes, 26 Oct): glowing letters with a warm halo on the wall behind
    const glowSign = (geo, W, h, zc) => {
      d.add('upper', 'sign_glow', placeFacing(geo, face, out, zc));
      d.add('upper', 'halo', placeFacing(new THREE.PlaneGeometry(W * 1.45, Math.max(h * 3.2, 0.9)).translate(0, h / 2, 0), add2(face, out, -0.02), out, zc));
    };
    if (R) {
      const S = brand.serif.SKYBREW, W = 1.9; glowSign(PR.brandGeometry(S.polys, W, 0.03, S.aspect, 0.002), W, W * S.aspect, 4.05);
      // striped dome (Dutch) awning over the doorway, inside the arch
      const dome = new THREE.SphereGeometry(1.0, 24, 10, 0, Math.PI, 0, Math.PI / 2); dome.scale(1, 0.62, 0.72); dome.rotateY(Math.PI / 2);
      d.add('upper', ['stripe_awning', [6, 1]], placeFacing(dome.rotateY(-Math.PI / 2), face, out, 3.05));
      for (const sgn of [-1, 1]) PR.sconceGlobes(1).forEach((p2) => d.add('upper', p2.m, placeFacing(p2.g.clone().rotateY(-Math.PI / 2), add2(face, along, sgn * 1.25), out, 2.0)));
    } else {
      const S = brand.wordmark, W = 1.35; glowSign(PR.brandGeometry(S.word, W, 0.035, S.aspect, 0.003), W, W * S.aspect, 4.0);
      for (const sgn of [-1, 1]) { const p = add2(add2(face, along, sgn * 1.2), out, 0.45); d.prop('upper', PR.floorLanternBali(), p[0], p[1], lobbyH, 0); }
      // teak threshold step over the black stone
      d.add('upper', 'teak_solid', G.prism([P(doorS[0] - 0.9, q - 0.9), P(doorS[1] + 0.9, q - 0.9), P(doorS[1] + 0.9, q), P(doorS[0] - 0.9, q)], [], lobbyH, lobbyH + 0.03, 0.005));
    }
    for (const sgn of [-1, 1]) {
      const p = add2(add2(face, along, sgn * 2.2), out, 1.5);
      d.prop('plants', R ? PR.oliveTree(2.0, 'terracotta_pot') : PR.frangipani(2.3, 'lava_pot'), p[0], p[1], 0, sgn * 1.7);
    }
    // small GROUND FLOOR plaque on the freestanding arch gate (both renders)
    const g = V.features.arch_gate, ga = (g.dir_deg * Math.PI) / 180, t = [Math.cos(ga), Math.sin(ga)], nG = [-t[1], t[0]];
    const toArrival = len2(sub(add2(g.center, nG, 1), st.door)) < len2(sub(add2(g.center, nG, -1), st.door)) ? nG : [-nG[0], -nG[1]];
    const pier = add2(add2(g.center, t, -(g.opening / 2 + 0.28)), toArrival, 0.22);
    const S = brand.serif['GROUND FLOOR'], W = 0.46;
    d.add('structure', R ? 'brass' : 'bronze', placeFacing(new THREE.BoxGeometry(W + 0.08, W * S.aspect + 0.08, 0.008), pier, toArrival, 1.62));
    d.add('structure', R ? 'navy_iron' : 'teak_dark', placeFacing(PR.brandGeometry(S.polys, W, 0.006, S.aspect, 0), add2(pier, toArrival, 0.006), toArrival, 1.62 - W * S.aspect / 2));
  }

  // ---------------------------------------------------------------- stair hall + top landing (ST01–ST02)
  _stair(d, R) {
    const { venue, H, brand } = this, st = venue.upper.stair, { P, runs, hw } = st;
    const rect = (s0, s1, q0, q1) => [P(s0, q0), P(s1, q0), P(s1, q1), P(s0, q1)];
    for (const r of runs) {
      if (r.landing) { if (!R) d.add('upper', 'teak_solid', G.prism(rect(r.s0, r.s1, -hw, hw - 0.18), [], r.z, r.z + 0.03)); continue; }
      if (R) {                                   // terracotta tread with a sand-terrazzo nosing and a brass edge
        d.add('upper', 'terrazzo_sand', G.prism(rect(r.s0 - 0.02, r.s0 + 0.07, -hw, hw - 0.18), [], r.z, r.z + 0.012));
        d.add('upper', 'brass', G.prism(rect(r.s0 - 0.025, r.s0 - 0.012, -hw, hw - 0.18), [], r.z - 0.02, r.z + 0.013));
      } else d.add('upper', 'teak_solid', G.prism(rect(r.s0 - 0.03, r.s1, -hw, hw - 0.18), [], r.z, r.z + 0.035, 0.006));   // teak tread over lava riser
    }
    if (!R) d.add('upper', 'teak_solid', G.prism(rect(st.sTop, st.sEnd, -hw, hw), [], H.upper_floor, H.upper_floor + 0.03));
    // the plaster walls (stair's left side, the lobby's door wall and east wall): warm textured lime plaster skins
    for (const k of st.skins) d.add('upper', R ? 'plaster_lime' : 'plaster_ochre', G.panel(k.a, k.b, 0, st.roof, 0.02, k.holes));
    // handrail on the stone wall following the pitch: rope-wrapped teak on bronze brackets / brushed brass with an LED
    const rail = [];                                         // along the pitch line: step mid-points, both ends of landings
    for (const r of runs) { if (r.landing) rail.push([r.s0 + 0.05, r.z + 1.02], [r.s1 - 0.05, r.z + 1.02]); else rail.push([(r.s0 + r.s1) / 2, r.z - st.riser / 2 + 1.02]); }   // 0.12 m above the dwarf wall cap
    const railPts = rail.map(([s, z]) => { const p = P(s, hw - 0.1); return new THREE.Vector3(p[0], z, -p[1]); });
    d.add('upper', R ? 'brass' : 'rope', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, false, 'catmullrom', 0.1), 160, R ? 0.024 : 0.032, 10));
    for (let i = 0; i < rail.length; i += 3) { const [s, z] = rail[i]; d.add('upper', R ? 'brass' : 'bronze', G.beam(P(s, hw - 0.1), P(s, hw + 0.0), 0.02, z - 0.06, z - 0.03)); d.add('upper', R ? 'brass' : 'bronze', G.cyl(P(s, hw - 0.1), 0.012, z - 0.06, z, 6)); }
    if (R) d.add('upper', 'led_strip', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts.map((v) => v.clone().add(new THREE.Vector3(0, -0.04, 0)))), 160, 0.008, 6));
    // step lights in the left wall (Bali) / brass sconces + two travel posters (Riviera)
    runs.filter((r) => !r.landing).forEach((r, i) => {
      if (!R && i % 2 === 0) { d.add('upper', 'glow_warm', placeFacing(new THREE.PlaneGeometry(0.1, 0.06), P((r.s0 + r.s1) / 2, -hw + 0.025), st.n, r.z + 0.25)); const q = poolGeometry(); q.scale(0.35, 1, 0.35); const pp = P((r.s0 + r.s1) / 2, -hw + 0.2); q.translate(pp[0], r.z + 0.04, -pp[1]); d.add('upper', poolMaterial(), q); }
      if (R && i % 5 === 2) { const p = P((r.s0 + r.s1) / 2, -hw + 0.04); d.add('upper', scallopMaterial(), placeFacing(scallopGeometry(0.5, 1.3, true), add2(p, st.n, 0.006), st.n, r.z + 1.8)); d.add('upper', scallopMaterial(), placeFacing(scallopGeometry(0.45, 1.1, false), add2(p, st.n, 0.006), st.n, r.z + 2.0)); d.add('upper', 'brass', placeFacing(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 14).translate(0, 0, 0.04), p, st.n, r.z + 1.9)); d.add('upper', 'glow_warm', placeFacing(new THREE.CircleGeometry(0.035, 12).rotateX(Math.PI / 2).translate(0, -0.111, 0.04), p, st.n, r.z + 1.9)); }
    });
    if (R) for (const [k, s] of [[0, 2.4], [1, 5.6]]) {
      const r = runs.find((x) => x.s1 >= s) || runs[0]; const p = P(s, -hw + 0.04);
      d.add('upper', k ? 'poster_b' : 'poster_a', placeFacing(new THREE.PlaneGeometry(0.62, 0.8), add2(p, st.n, 0.012), st.n, r.z + 1.55));
      d.add('upper', 'honey_wood', placeFacing(PR.merge([new THREE.BoxGeometry(0.7, 0.04, 0.03).translate(0, 0.42, 0), new THREE.BoxGeometry(0.7, 0.04, 0.03).translate(0, -0.42, 0), new THREE.BoxGeometry(0.04, 0.88, 0.03).translate(0.33, 0, 0), new THREE.BoxGeometry(0.04, 0.88, 0.03).translate(-0.33, 0, 0)]), p, st.n, r.z + 1.55));
    }
    // top landing: big woven pendant / opal globe, plant by the window, carved teak / brass mark on the end wall
    // the pendant hangs over the top flight (it lights the stair, as in ST02), its underside ~2.35 m above the landing;
    // the plant stands in the far corner of the landing, clear of the pendant and the corridor opening
    const land = P(st.sTop - 0.8, 0), hang = st.roof - 0.02, under = H.upper_floor + 2.35;
    if (R) { const rod = hang - (under + 0.48); d.prop('upper', [{ m: 'brass', g: PR.merge([new THREE.CylinderGeometry(0.006, 0.006, rod, 4).translate(0, -rod / 2, 0)]) }, { m: 'opal', g: new THREE.SphereGeometry(0.24, 24, 16).translate(0, -rod - 0.24, 0) }], land[0], land[1], hang); }
    else d.prop('upper', PR.pendant('woven_dome', Math.max(0.2, hang - under - 0.32)), land[0], land[1], hang);
    // the plant stands in the landing's far corner by the glazed arch, out of the way: you come off the top step and
    // turn right through the door into the first floor
    const pp = P(st.sEnd - 0.3, -hw + 0.3); d.prop('upper', R ? PR.oliveTree(1.25, 'terracotta_pot') : PR.frangipani(1.3, 'lava_pot'), pp[0], pp[1], H.upper_floor, 1);
    const mk = P(st.sEnd - 0.012, 0.42), L = brand.logo, W = 0.45;
    d.add('upper', R ? 'brass_polished' : 'teak_solid', placeFacing(PR.brandGeometry([...L.icon, ...L.word], W, 0.02, L.aspect, 0.002), mk, [-st.d[0], -st.d[1]], H.upper_floor + 1.25));
    // balustrade in front of the glazed arch: carved teak lattice (Bali) / the iron rail repainted navy + a brass top rail (Riviera)
    const [r0, r1] = st.balustrade;
    if (R) d.add('upper', 'brass', G.beam(r0, r1, 0.06, H.upper_floor + 0.98, H.upper_floor + 1.03));
    else { d.add('upper', ['lattice', [len2(sub(r1, r0)) / 0.8, 1.2]], G.pane(r0, r1, H.upper_floor + 0.06, H.upper_floor + 0.94)); d.add('upper', 'teak_solid', G.beam(r0, r1, 0.08, H.upper_floor + 0.94, H.upper_floor + 1.0)); d.add('upper', 'teak_solid', G.beam(r0, r1, 0.06, H.upper_floor, H.upper_floor + 0.06)); }
  }

  // ---------------------------------------------------------------- first floor: the DJ pub (FF02–FF08)
  _firstFloor(d, R, when) {
    const { H, D, site, brand } = this, C = D.center, RR = D.radius, ff = site.ff, f0 = H.upper_floor, ceil = H.upper_ceiling;
    const at = (r, a) => [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)];
    // floor: dance-floor ring inlay on the existing circle (lava pebbles between bronze strips / brass rings)
    if (R) {
      d.add('upper', 'brass_polished', G.flat(ringPoly(C, 6.05), [ringPoly(C, 5.88).reverse()], f0 + 0.004));
      d.add('upper', 'brass_polished', G.flat(ringPoly(C, 9.06, 96), [ringPoly(C, 9.0, 96).reverse()], f0 + 0.004));
    } else {
      d.add('upper', 'lava_pebbles', G.flat(ringPoly(C, 6.2), [ringPoly(C, 5.7).reverse()], f0 + 0.004));
      d.add('upper', 'bronze', G.flat(ringPoly(C, 6.25), [ringPoly(C, 6.2).reverse()], f0 + 0.005));
      d.add('upper', 'bronze', G.flat(ringPoly(C, 5.7), [ringPoly(C, 5.65).reverse()], f0 + 0.005));
    }
    // inner wall skins per bay (DJ wall, bar wall, the rest), with the window / door openings
    const rs = RR - 0.31, wallMat = R ? 'plaster_lime' : 'plaster_ochre';
    for (const b of ff.bays) {
      const A = at(rs, b.a0), Bp = at(rs, b.a1), L = len2(sub(Bp, A));
      // the shell's door sill sits a little below the floor (z-fight fix); this skin starts at the floor, so clamp —
      // a hole that crosses the panel's edge is dropped by the triangulator and the doorway closes
      const holes = b.holes.map((h) => { const w = (h.u1 - h.u0) / 2; return { ...h, u0: L / 2 - w, u1: L / 2 + w, v0: Math.max(h.v0, f0) }; });
      const m = b === ff.dj ? (R ? 'walnut_fluted' : 'lava_wall') : ff.barBays.includes(b) ? (R ? 'plaster_lime' : 'lava_wall') : wallMat;
      d.add('upper', m, G.panel(Bp, A, f0, ceil - 0.02, 0.02, holes));
    }
    // perimeter piers: vertical teak boards + sconce (Bali) / matte charcoal + brass band (Riviera)
    for (let k = 0; k < ff.bays.length; k++) {
      const a = ff.bays[k].a0, pc = at(RR - 0.55, a), c = Math.cos(a), s = Math.sin(a), h = 0.25;
      const sq = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [pc[0] + x * c - y * s, pc[1] + x * s + y * c]);
      d.add('upper', R ? 'charcoal' : ['teak_boards', [1, 3.3]], G.prism(sq, [], f0, ceil - 0.02));
      if (R) d.add('upper', 'brass', G.prism(sq, [], f0 + 2.3, f0 + 2.36, 0, 0.012));
      const inward = [-c, -s], sp = add2(pc, inward, 0.27);
      d.add('upper', R ? 'brass' : 'bronze', placeFacing(new THREE.BoxGeometry(0.1, 0.3, 0.06), sp, inward, f0 + 2.2));
      d.add('upper', 'glow_warm', placeFacing(new THREE.PlaneGeometry(0.06, 0.24), add2(sp, inward, 0.031), inward, f0 + 2.2));
    }
    // inner ring of 12 columns: split bamboo to head height with bronze collars / Riviera-blue tile + brass bands
    for (let k = 0; k < 12; k++) {
      const p = at(D.inner_columns_radius, (k / 12) * TAU + Math.PI / 12);
      d.add('upper', R ? ['tile_blue_vert', [1.76, 2.3]] : ['bamboo_pole', [1.76 / 0.35, 2.3]], G.cyl(p, 0.29, f0, f0 + 2.3, 24));
      d.add('upper', 'black_steel', G.cyl(p, 0.265, f0 + 2.3, ceil, 20));
      for (const z of R ? [f0, f0 + 2.3] : [f0 + 0.05, f0 + 2.3]) d.add('upper', R ? 'brass' : 'bronze', G.cyl(p, 0.305, z, z + (R ? 0.06 : 0.08), 24));
      if (!R) d.add('upper', 'lava_stone', G.cyl(p, 0.31, f0, f0 + 0.05, 24));
      if (!R && k % 2 === 0) d.prop('upper', PR.hangingFern(0.5), p[0] + 0.45, p[1], ceil - 0.5, k);
    }
    // uplit columns and sconce scallops on the piers (Bali / Riviera night renders)
    for (let k = 0; k < 12; k++) {
      const p = at(D.inner_columns_radius, (k / 12) * TAU + Math.PI / 12);
      const g = new THREE.CylinderGeometry(0.33, 0.33, 2.6, 24, 1, true); g.translate(p[0], f0 + 1.3, -p[1]); d.add('upper', uplightMaterial(), g);
      d.add('upper', poolMaterial(), (() => { const q = poolGeometry(); q.scale(0.8, 1, 0.8); q.translate(p[0], f0 + 0.012, -p[1]); return q; })());
    }
    for (let k = 0; k < ff.bays.length; k++) {
      const a = ff.bays[k].a0, inward = [-Math.cos(a), -Math.sin(a)], sp = add2(at(RR - 0.55, a), inward, 0.262);
      d.add('upper', scallopMaterial(), placeFacing(scallopGeometry(0.55, 1.6, true), sp, inward, f0 + 2.15));
      d.add('upper', scallopMaterial(), placeFacing(scallopGeometry(0.5, 1.4, false), sp, inward, f0 + 2.25));
    }
    // the exposed industrial ceiling: infill skin, black steel beam grid, ring-jointed ducts, fans, spots
    d.add('upper', R ? 'charcoal' : 'woven_bamboo_dark', G.flat(ringPoly(C, RR - 0.3, 96), [], ceil - 0.01, true));
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; d.add('upper', 'black_steel', G.beam(at(1.0, a), at(RR - 0.45, a), 0.18, ceil - 0.42, ceil - 0.01)); }
    for (const rr of [D.inner_columns_radius, 10.3, 3.2]) { const ring = ringPoly(C, rr, 48); for (let i = 0; i < ring.length; i++) d.add('upper', 'black_steel', G.beam(ring[i], ring[(i + 1) % ring.length], 0.16, ceil - 0.36, ceil - 0.01)); }
    const ductMat = R ? 'black_steel' : 'copper', ringPath = [];
    for (let i = 0; i <= 40; i++) { const a = ff.dj.am + 0.7 + (i / 40) * 4.6; const p = at(9.0, a); ringPath.push([p[0], ceil - 0.85, -p[1]]); }
    const du1 = PR.duct(ringPath, 0.3); d.add('upper', ductMat, du1.body); d.add('upper', 'bronze', du1.rings);   // Riviera: black with bronze rings; Bali: copper + bronze
    const pA = at(11.5, ff.dj.am + 2.1), pB = at(11.5, ff.dj.am + 2.1 + Math.PI);
    const du2 = PR.duct([[pA[0], ceil - 0.6, -pA[1]], [C[0], ceil - 0.6, -C[1]], [pB[0], ceil - 0.6, -pB[1]]], 0.26); d.add('upper', ductMat, du2.body); d.add('upper', 'bronze', du2.rings);
    for (let k = 0; k < 6; k++) { const p = at(8.2, (k / 6) * TAU + 0.3); d.prop('upper', PR.fan(R ? 'black_steel' : 'teak_solid'), p[0], p[1], ceil - 0.02, k); }
    const spotsAt = [];
    for (let k = 0; k < 24; k += 2) for (const rr of [4.2, 7.6]) spotsAt.push({ p: at(rr, (k / 24) * TAU), y: ceil - 0.42, a: 0 });
    d.many('upper', PR.spot(R ? 'black_steel' : 'bronze'), spotsAt);
    // visible beams from the spots onto the dance floor at night (not traced in photo mode)
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2, p = at(4.2, a), q = at(2.2, a + 0.4); const L = Math.hypot(ceil - 0.6 - f0, len2(sub(p, q))); const cone = new THREE.ConeGeometry(0.75, L, 18, 1, true); cone.translate(0, -L / 2, 0); const dir = new THREE.Vector3(q[0] - p[0], f0 - (ceil - 1.05), -(q[1] - p[1])).normalize(); cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)); cone.translate(p[0], ceil - 1.05, -p[1]); d.add('upper', 'beam', cone); }
    // pendants along the window ring: hammered copper + woven domes (Bali) / brass domes (Riviera)
    for (const [i, b] of ff.open.entries()) { const p = at(RR - 2.1, b.am); d.prop('upper', PR.pendant(R ? 'brass_dome' : i % 2 ? 'copper_dome' : 'woven_dome', 2.7 + (i % 3) * 0.25), p[0], p[1], ceil - 0.02, i); }
    d.many('upper', POOL(), ff.open.map((b) => ({ p: at(RR - 2.1, b.am), y: f0 + 0.012, s: 1.5 })));
    // window seating (client notes, 26 Oct): a table at every window instead of the cushioned banquettes — a round
    // 4-top with the chairs on the diagonals (nobody's back to the view), alternating with a 2-top whose two chairs
    // sit side by side facing the window (the sunset seats). Bali keeps the bamboo blinds over the windows.
    const angD = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y))), doorA = ff.door?.am;
    const seats = [], chairsAt = [], tables4 = [], tables2 = [];
    for (const [i, b] of ff.open.entries()) {
      const e = [Math.cos(b.am), Math.sin(b.am)], tg = [-e[1], e[0]];
      if (i % 2 === 0) {
        const c = at(RR - 1.95, b.am); tables4.push({ p: c, y: f0, a: b.am });
        for (const th of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
          const o = [e[0] * Math.cos(th) + tg[0] * Math.sin(th), e[1] * Math.cos(th) + tg[1] * Math.sin(th)], p = add2(c, o, 0.7);
          const yaw = Math.atan2(c[1] - p[1], c[0] - p[0]); chairsAt.push({ p, y: f0, a: yaw }); seats.push({ p, a: yaw });
        }
      } else {
        const c = at(RR - 1.7, b.am); tables2.push({ p: c, y: f0, a: b.am });
        for (const sg of [-1, 1]) { const p = add2(add2(c, e, -0.62), tg, sg * 0.34), yaw = b.am - sg * 0.22; chairsAt.push({ p, y: f0, a: yaw }); seats.push({ p, a: yaw }); }
      }
      if (!R) { const bl = new THREE.CylinderGeometry(0.055, 0.055, 1.7, 10); bl.rotateZ(Math.PI / 2); const wp = at(RR - 0.36, b.am); d.add('upper', ['bamboo_pole', [1, 5]], placed(bl, wp[0], wp[1], f0 + 3.1, b.am + Math.PI / 2)); d.add('upper', 'bamboo_blind', placeFacing(new THREE.PlaneGeometry(1.7, 0.55).translate(0, -0.28, 0), wp, [-Math.cos(b.am), -Math.sin(b.am)], f0 + 3.1)); }
    }
    d.many('upper', R ? PR.chairRiviera() : PR.chairBali(), chairsAt);
    d.many('upper', R ? PR.tableTulip(0.74, 0.45) : PR.tableTeakRound(0.75), tables4);
    d.many('upper', R ? PR.tableTulip(0.74, 0.34) : PR.tableTeakRound(0.75).map((q) => ({ ...q, g: q.g.clone().scale(0.72, 1, 0.72) })), tables2);
    d.many('upper', PR.hurricane(), [...tables4, ...tables2].map((t) => ({ ...t, y: f0 + 0.75 })));
    const ends = [ff.open[0], ff.open[ff.open.length - 1]].filter(Boolean);
    for (const [i, b] of ends.entries()) { const p = at(RR - 1.25, i ? b.a1 + 0.03 : b.a0 - 0.03); d.prop('upper', R ? PR.oliveTree(2.0, 'terracotta_pot') : PR.pottedPalm(2.0, 'lava_pot'), p[0], p[1], f0, i); }
    // standing tables: one per bay on a ring between the columns and the window tables, plus an inner ring in every
    // other column gap — none on the dance floor, in front of the DJ or in the aisle from the door; the bar keeps its own
    const ht = [];
    for (const b of ff.bays) {
      if (ff.barBays.includes(b)) { ht.push({ p: at(9.5, b.am), y: f0, a: b.am }); continue; }
      if (b === ff.dj || angD(b.am, ff.dj.am) < 0.4 || (doorA !== undefined && angD(b.am, doorA) < 0.2)) continue;
      ht.push({ p: at(9.15, b.am), y: f0, a: b.am });
    }
    for (let k = 0; k < 12; k += 2) { const a = (k / 12) * TAU; if (angD(a, ff.dj.am) < 0.5 || (doorA !== undefined && angD(a, doorA) < 0.25)) continue; ht.push({ p: at(7.6, a), y: f0, a }); }
    d.many('upper', R ? PR.highTableRiviera() : PR.highTableBali(), ht);
    d.many('upper', PR.hurricane(), ht.map((h) => ({ ...h, y: f0 + 1.1 })));
    // DJ booth in the centre of the back wall: 40 cm platform, console, logo wall, speakers / carved screens
    const dj = ff.dj, ja = dj.am, jr0 = RR - 0.33 - 2.3, jr1 = RR - 0.33, half = (dj.a1 - dj.a0) / 2 * 0.95;
    // the DJ pub's layout, for the crowd (people.js) and the light show (clublights.js); the same for both themes
    this.ff = { C, f0, RR, ceil, ja, djR: jr0 + 1.25, tables: ht.map((h) => h.p), seats, ba0: 0, ba1: -1, barR: 0 };
    const plat = sectorPoly(C, jr0, jr1, ja - half, ja + half, 12);
    d.add('upper', R ? 'charcoal' : 'lava_stone', G.prism(plat, [], f0, f0 + 0.4, 0.01));
    if (R) d.add('upper', 'brass', arcSkin(C, jr0 - 0.012, ja - half, ja + half, f0 + 0.37, f0 + 0.4, 0.02, 0.2));
    this.venue.addSurfaces([{ poly: plat, h: () => f0 + 0.4, when }]);
    d.many('upper', POOL(), [{ p: at(jr0 + 1.2, ja), y: f0 + 0.414, s: 1.6 }, { p: at(jr0 - 1.6, ja), y: f0 + 0.012, s: 2.6 }]);
    const con0 = jr0 + 0.35, con1 = jr0 + 0.85, ch = 0.25;
    d.add('upper', R ? ['tile_blue_vert', [3, 1]] : ['teak_carved', [3, 1]], G.prism(sectorPoly(C, con0, con1, ja - ch, ja + ch, 10), [], f0 + 0.4, f0 + 1.42));
    d.add('upper', R ? 'brass' : 'bronze', G.prism(sectorPoly(C, con0 - 0.03, con1 + 0.03, ja - ch - 0.01, ja + ch + 0.01, 10), [], f0 + 1.42, f0 + 1.46));
    for (const da of [-0.11, 0, 0.11]) { const p = at((con0 + con1) / 2, ja + da); d.add('upper', 'black_matte', G.post(p, da ? 0.36 : 0.3, f0 + 1.46, f0 + 1.52, da ? 0.36 : 0.22)); }
    this.extraColliders.push(...[0, 1, 2, 3].map((i) => ({ a: at(con0 - 0.05, ja - ch + (2 * ch * i) / 4), b: at(con0 - 0.05, ja - ch + (2 * ch * (i + 1)) / 4), z0: f0, z1: f0 + 1.5, tag: 'dj', when })));
    const wallP = at(RR - 0.33, ja), inward = [-Math.cos(ja), -Math.sin(ja)], Lg = brand.logo, LW = 2.1;
    d.add('upper', R ? 'brass_logo' : 'teak_solid', placeFacing(PR.brandGeometry([...Lg.icon, ...Lg.word, ...(R ? Lg.tagline : [])], LW, 0.06, Lg.aspect), add2(wallP, inward, 0.05), inward, f0 + 2.0));
    d.add('upper', 'halo', placeFacing(new THREE.PlaneGeometry(LW * 1.5, LW * Lg.aspect * 1.4).translate(0, LW * Lg.aspect * 0.5, 0), add2(wallP, inward, 0.03), inward, f0 + 1.9));
    for (const sgn of [-1, 1]) {
      const p = at(RR - 0.9, ja + sgn * half * 0.92);
      if (R) d.prop('upper', PR.lineArray(2.4), p[0], p[1], f0 + 0.4, ja + Math.PI);
      else { d.add('upper', ['lattice', [1.1, 3]], placeFacing(new THREE.PlaneGeometry(0.9, 2.4).translate(0, 1.2, 0), p, inward, f0 + 0.4)); d.prop('upper', PR.hangingFern(0.8), p[0], p[1], ceil - 0.02, sgn); }
    }
    // the bar along the back wall to the DJ's left: front, top, foot rail, LED, back-bar shelving with bottles, taps
    const bb = ff.barBays; if (!bb.length) return;
    const rel = (x) => ja + Math.atan2(Math.sin(x - ja), Math.cos(x - ja));          // unwrap around the DJ's bearing
    const ba0 = Math.min(...bb.map((b) => rel(b.a0))) + 0.02, ba1 = Math.max(...bb.map((b) => rel(b.a1))) - 0.02, br0 = RR - 0.33 - 2.25, br1 = br0 + 0.62;
    Object.assign(this.ff, { ba0, ba1, barR: br0 });
    d.add('upper', R ? ['tile_blue_vert', [6, 1.1]] : 'split_bamboo', G.prism(sectorPoly(C, br0, br1, ba0, ba1, 30), [], f0, f0 + 1.05));
    d.add('upper', R ? 'terrazzo_white' : 'teak_solid', G.prism(sectorPoly(C, br0 - 0.06, br1 + 0.02, ba0 - 0.005, ba1 + 0.005, 30), [], f0 + 1.05, f0 + 1.12, 0.01));
    d.add('upper', 'led_strip', arcSkin(C, br0 - 0.065, ba0, ba1, f0 + 1.02, f0 + 1.04, 0.02, 0.3));
    d.many('upper', POOL(), Array.from({ length: 14 }, (_, i) => ({ p: at(br0 - 0.45, ba0 + (ba1 - ba0) * (i + 0.5) / 14), y: f0 + 0.012, s: 0.75 })));
    const fr = []; for (let i = 0; i <= 30; i++) { const p = at(br0 - 0.22, ba0 + (ba1 - ba0) * (i / 30)); fr.push(new THREE.Vector3(p[0], f0 + 0.24, -p[1])); }
    d.add('upper', R ? 'brass' : 'bronze', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fr), 60, 0.022, 8));
    this.extraColliders.push(...Array.from({ length: 12 }, (_, i) => ({ a: at(br0 - 0.05, ba0 + ((ba1 - ba0) * i) / 12), b: at(br0 - 0.05, ba0 + ((ba1 - ba0) * (i + 1)) / 12), z0: f0, z1: f0 + 1.2, tag: 'ffbar', when })));
    for (const z of [1.25, 1.7, 2.15, 2.6]) {
      d.add('upper', R ? 'walnut' : 'teak_solid', G.prism(sectorPoly(C, RR - 0.65, RR - 0.34, ba0 + 0.05, ba1 - 0.05, 30), [], f0 + z - 0.035, f0 + z));
      d.add('upper', 'led_strip', arcSkin(C, RR - 0.345, ba0 + 0.05, ba1 - 0.05, f0 + z + 0.33, f0 + z + 0.35, 0.02, 0.3));
      const n = Math.round(((ba1 - ba0) * (RR - 0.5)) / 0.11);
      for (let i = 0; i < n; i++) { const a = ba0 + 0.07 + (ba1 - ba0 - 0.14) * (i + 0.5) / n, p = at(RR - 0.5, a); for (const q of PR.wineBottles(1, i * 13 + z * 100, 0)) d.add('upper', q.m, placed(q.g, p[0], p[1], f0 + z, a)); }   // wine + spirit bottles, as downstairs
    }
    if (R) for (let a = ba0 + 0.1; a < ba1 - 0.05; a += 0.2) d.add('upper', 'brass', G.cyl(at(RR - 0.66, a), 0.012, f0 + 1.2, f0 + 2.7, 6));
    else for (let a = ba0 + 0.15; a < ba1; a += 0.25) { const p = at(RR - 0.55, a); d.prop('upper', PR.hangingFern(0.3), p[0], p[1], ceil - 0.02, a * 10); }
    const tapA = (ba0 + ba1) / 2, tp = at(br1 - 0.15, tapA);
    d.prop('upper', PR.tapTower(6, R ? 'terracotta_velvet' : 'teak_solid', R ? 'brass' : 'bronze'), tp[0], tp[1], f0 + 1.12, tapA + Math.PI);
  }
}
