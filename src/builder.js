// Builds the venue scene from data/venue.json.
// Returns { root, groups, floorAt, colliders, hotspots, bounds, lights }.
import * as THREE from 'three';
import { surfaceMaterial, fixedMaterial, FINISHES } from './materials.js';
import * as G from './geom.js';
import { buildFurniture, buildInstanced, coneLampParts, globeLampParts, shrubParts, palmParts, treeParts, spherePlanterParts } from './furniture.js';
import { buildUpper } from './upper.js';
import { poolMaterial, poolGeometry } from './lighting.js';
import { buildCity } from './city.js';
import { applyLayout } from './layout.js';

const TAU = Math.PI * 2;

export function buildVenue(V, opts = {}) {
  applyLayout(V);                            // client layout edits of 26 Oct (entrance, brewery, seating, stair, FF bays)
  const H = V.heights;
  const Z = Object.fromEntries(V.zones.map((z) => [z.zone, z.outer]));
  const root = new THREE.Group(); root.name = 'venue';
  const groupNames = ['structure', 'glazing', 'doorsClosed', 'doorsOpen', 'roofs', 'upper', 'ceilings', 'pergolas',
    'furniture', 'lamps', 'plants', 'context', 'labels'];
  const groups = Object.fromEntries(groupNames.map((n) => { const g = new THREE.Group(); g.name = n; root.add(g); return [n, g]; }));
  const colliders = [];                      // {a, b, z0, z1, tag}
  const bins = new Map();                    // `${group}|${mat}` -> geometry[]
  const add = (group, mat, geo, tag) => {
    if (!geo) return;
    const k = tag ? `${group}|${mat}|${tag}` : `${group}|${mat}`; if (!bins.has(k)) bins.set(k, []); bins.get(k).push(geo);
  };
  const collideRing = (ring, z0, z1, tag, closed = true) => {
    const n = ring.length; for (let i = 0; i < (closed ? n : n - 1); i++) colliders.push({ a: ring[i], b: ring[(i + 1) % n], z0, z1, tag });
  };

  // ------------------------------------------------------------- floor height function
  const P = V.features.platform; const PR = P.radius;
  const platformStepsDir = norm([-13.5 - P.center[0], -8.5 - P.center[1]]);   // opening toward the courtyard
  const deckSteps = findDeckSteps(Z.beach_deck, [Z.smoking, Z.indoor]);
  const LAND = [[-1500, -1500], [1500, -1500], [1500, 10], [26, 10], [18, 2], [-24, -2], [-30, 0], [-40, -4], [-55, -12], [-1500, -12]];
  const shore = longestLine(V.context.shore);
  const FAR = 5000;
  const seaRing = shore ? [...shore, [FAR, shore[shore.length - 1][1]], [FAR, FAR], [-FAR, FAR], [-FAR, shore[0][1]]] : null;
  const pools = V.context.pool;

  // Level-aware floor height. Without `ref` it returns the ground level (used to place furniture).
  // With `ref` (current foot height) it returns the highest walkable surface you can step onto from
  // there — so the ground floor under the upper floor and the stairs both work.
  let elevated = [];
  function floorAt(x, y, ref) {
    const g = groundAt(x, y);
    if (ref === undefined) return g;
    let best = g !== null && g <= ref + 0.55 ? g : null;
    for (const s of elevated) {
      if (s.when && !s.when()) continue;                 // theme-only surfaces (stage, DJ platform)
      if (!G.inside([x, y], s.poly)) continue;
      const h = s.h([x, y]);
      if (h <= ref + 0.55 && (best === null || h > best)) best = h;
    }
    if (best === null && g !== null) return g;           // caller decides if the step is too high
    return best;
  }
  function groundAt(x, y) {
    const p = [x, y];
    const dp = Math.hypot(x - P.center[0], y - P.center[1]);
    if (dp <= PR) return H.platform_deck;
    if (dp <= PR + 0.8) {
      const d = norm([x - P.center[0], y - P.center[1]]);
      if (d[0] * platformStepsDir[0] + d[1] * platformStepsDir[1] > Math.cos(0.42)) return dp <= PR + 0.4 ? H.platform_deck * 0.66 : H.platform_deck * 0.33;
    }
    for (const s of deckSteps) if (G.inside(p, s.quad)) {
      const t = Math.max(0, Math.min(1, G.segDist(p, s.a, s.b)[0] / s.depth));
      return H.sand + (H.beach_deck - H.sand) * (Math.ceil(t * 3) / 3);
    }
    if (G.inside(p, Z.beach_deck)) return H.beach_deck;
    if (G.inside(p, Z.indoor)) return H.indoor_floor;
    if (G.inside(p, Z.smoking)) return H.smoking_floor;
    if (G.inside(p, Z.outdoor)) return 0;
    if (seaRing && G.inside(p, seaRing)) return null;            // not walkable
    for (const pl of pools) if (G.inside(p, pl)) return null;
    for (const bw of V.context.boardwalk) if (G.inside(p, bw)) return 0.12;
    if (G.inside(p, LAND)) return 0;
    return H.sand;
  }

  // ------------------------------------------------------------- floors
  add('structure', 'indoor_floor', G.prism(Z.indoor, [], -0.2, H.indoor_floor));
  add('structure', 'smoking_floor', G.prism(Z.smoking, [], -0.2, H.smoking_floor));
  add('structure', 'courtyard_floor', G.flat(Z.outdoor, [], 0.005));
  add('structure', 'beach_deck', G.prism(Z.beach_deck, [], H.sand - 0.05, H.beach_deck));

  // ------------------------------------------------------------- CAD solids
  const KIND = {
    wall:            { mat: 'indoor_walls', z1: (s) => s.h, collide: true },
    column:          { mat: 'columns', z1: () => H.indoor_ceiling, collide: true },
    partition:       { mat: 'partitions', z1: () => H.smoking_roof, collide: true, frame: true },
    sill:            { mat: 'facade', z1: () => H.sill + 0.01, collide: false },      // 1 cm proud: a sill flush with the beach deck z-fights
    kerb:            { mat: 'courtyard_walls', z1: () => H.kerb, collide: false },
    planter:         { mat: 'planters', z1: () => H.planter, collide: true, greens: true },
    counter:         { mat: 'bar_front', z1: () => H.counter - 0.05, collide: true, top: true },
    low_wall:        { mat: 'courtyard_walls', z1: () => H.low_wall, collide: true },
    low_wall_indoor: { mat: 'planters', z1: () => H.low_wall_indoor, collide: true },
  };
  // Every wall-like CAD solid is its own "element" (own meshes, tag el<i>) so it can be restyled on its own —
  // e.g. turned into glass where the drawing shows a wall but the site has glazing (elements.js).
  const ELEMENT_KINDS = new Set(['wall', 'partition', 'low_wall', 'low_wall_indoor', 'planter', 'sill', 'column']);
  const LABELS = { wall: 'Wall', partition: 'Partition', low_wall: 'Low wall', low_wall_indoor: 'Low wall', planter: 'Planter', sill: 'Sill wall', column: 'Column' };
  const elements = [];
  V.solids.forEach((s, i) => {
    const k = KIND[s.kind]; if (!k) return;
    const z1 = k.z1(s);
    const el = ELEMENT_KINDS.has(s.kind) && !s.tag ? `el${i}` : null, tag = s.tag || el;
    const soft = s.kind !== 'partition' && G.minWidth(s.outer) > 0.12 ? 0.025 : 0;
    const group = s.kind === 'partition' ? 'glazing' : 'structure';
    add(group, k.mat, G.prism(s.outer, s.holes, 0, z1, soft), tag);
    if (['low_wall', 'planter', 'low_wall_indoor', 'kerb'].includes(s.kind) && soft)       // stone coping
      add('structure', 'fixed:limestone_fixed', G.prism(s.outer, s.holes, z1, z1 + 0.05, 0.012, 0.03), el);
    if (['wall', 'column'].includes(s.kind) && soft)                                         // dark skirting
      add('structure', 'fixed:skirting', G.prism(s.outer, s.holes, H.indoor_floor, H.indoor_floor + 0.1, 0.004, 0.012), tag);
    if (k.frame) { add('glazing', 'frames', G.prism(s.outer, s.holes, z1 - 0.06, z1), el); add('glazing', 'frames', G.prism(s.outer, s.holes, 0, 0.2), el); }
    if (k.greens) add('structure', 'fixed:foliage', G.prism(s.outer, s.holes, z1, z1 + 0.28), el);
    if (k.top) add('structure', 'bar_top', G.prism(s.outer, s.holes, z1, z1 + 0.05));
    if (k.collide) { collideRing(s.outer, 0, z1, s.kind); for (const h of s.holes) collideRing(h, 0, z1, s.kind); }
    if (el) { const c = G.centroid(s.outer); elements.push({ key: `${s.kind}@${c[0].toFixed(1)},${c[1].toFixed(1)}`, tag: el, kind: s.kind, label: LABELS[s.kind], outer: s.outer, holes: s.holes, z0: 0, z1, surface: k.mat, group }); }
  });
  V.gen_walls.forEach((w, i) => {
    const tag = `gen${i}`, outer = G.strip(w.path, 0.25);
    add('structure', 'indoor_walls', G.prism(outer, [], 0, H.indoor_ceiling, 0.025), tag);
    collideRing(w.path, 0, H.indoor_ceiling, 'wall', false);
    const c = G.centroid(outer); elements.push({ key: `gen_wall@${c[0].toFixed(1)},${c[1].toFixed(1)}`, tag, kind: 'gen_wall', label: 'Wall', outer, holes: [], z0: 0, z1: H.indoor_ceiling, surface: 'indoor_walls', group: 'structure', path: w.path });
  });

  // ------------------------------------------------------------- glazing + folding doors
  for (const run of V.glazing) {
    const z0 = run.z0 ?? (run.zone === 'smoking' ? H.smoking_floor : H.indoor_floor);   // a run may carry its own heights (layout.js)
    const z1 = run.z1 ?? (run.zone === 'smoking' ? H.smoking_roof : H.indoor_ceiling);
    const zoneRing = Z[run.zone];
    if (run.kind === 'glass') {
      glassRun(run.path, z0, z1, 1.2, 'glazing');
      collideRing(run.path, 0, z1, 'glass', false);
    } else if (run.kind === 'arch') {
      entranceArch(run, z1, zoneRing);
    } else if (run.kind === 'opening') {
      const { pts } = G.resample(run.path, 0.4);                         // an open doorway: a head beam and two posts
      add('glazing', 'frames', G.wall(pts, 0.12, z1 - 0.12, z1));
      for (const p of [pts[0], pts[pts.length - 1]]) add('glazing', 'frames', G.post(p, 0.08, z0, z1, 0.08));
    } else {
      // pass doors (layout.js): where the guided walk crosses this line, a 1 m leaf of the closed glazing stands slid open
      const L = pathLen(run.path), passes = (V.features.pass_doors || []).map((p) => arcOf(run.path, p)).filter(([dd]) => dd < 0.4)
        .map(([, u]) => [Math.max(0.05, u - 0.5), Math.min(L - 0.05, u + 0.5)]).sort((a, b) => a[0] - b[0]);
      const parts = []; let from = 0;
      for (const [a, b] of passes) { parts.push(subPath(run.path, from, a)); from = b; }
      parts.push(subPath(run.path, from, L));
      for (const part of parts) if (part.length > 1 && pathLen(part) > 0.05) glassRun(part, z0, z1, 0.9, 'doorsClosed');
      for (const [a, b] of passes) {                               // the leaf, slid back behind the glass beside the opening
        add('doorsClosed', 'frames', G.wall(subPath(run.path, a, b), 0.1, z1 - 0.1, z1));
        const seg = subPath(run.path, Math.max(0, a - 1.0), a), p0 = seg[0], p1 = seg[seg.length - 1];
        const t = norm([p1[0] - p0[0], p1[1] - p0[1]]); let n = [-t[1], t[0]];
        if (!G.inside([p1[0] + n[0] * 0.5, p1[1] + n[1] * 0.5], zoneRing)) n = [-n[0], -n[1]];
        const q0 = [p0[0] + n[0] * 0.09, p0[1] + n[1] * 0.09], q1 = [p1[0] + n[0] * 0.09, p1[1] + n[1] * 0.09];
        add('doorsClosed', 'glazing', G.pane(q0, q1, z0 + 0.03, z1 - 0.12));
        for (const q of [q0, q1]) add('doorsClosed', 'frames', G.post(q, 0.05, z0 + 0.02, z1 - 0.1, 0.05));
        add('doorsClosed', 'frames', G.beam(q0, q1, 0.05, z0 + 0.02, z0 + 0.09)); add('doorsClosed', 'frames', G.beam(q0, q1, 0.05, z1 - 0.17, z1 - 0.1));
      }
      foldedStacks(run.path, z0, z1, zoneRing, run.stacks);
      // closed-state colliders on the glazed parts only; run.guide 'closed': the guided walk never plans through them
      for (const part of parts) colliders.push(...pathSegs(part).map(([a, b]) => ({ a, b, z0: 0, z1, tag: 'folding', closedOnly: true, guide: run.guide === 'closed' || undefined })));
    }
  }
  function glassRun(path, z0, z1, step, group) {
    const { pts } = G.resample(path, step);
    for (let i = 1; i < pts.length; i++) add(group, 'glazing', G.pane(pts[i - 1], pts[i], z0, z1));
    for (const p of pts) add(group, 'frames', G.post(p, 0.06, z0, z1, 0.06));
    add(group, 'frames', G.wall(pts, 0.1, z1 - 0.1, z1));
    add(group, 'frames', G.wall(pts, 0.1, z0, z0 + 0.06));
  }
  // the entrance (layout.js): one white arched doorway in a short wall on the run's chord — always open, whatever the
  // folding-doors toggle says — with a proud arch surround on the outside
  function entranceArch(run, z1, zoneRing) {
    const o = run.opening, A = run.path[0], B = run.path[run.path.length - 1];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), t = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const uc = Math.min(Math.max((o.center[0] - A[0]) * t[0] + (o.center[1] - A[1]) * t[1], o.width / 2 + 0.2), L - o.width / 2 - 0.2);
    const hole = { u0: uc - o.width / 2, u1: uc + o.width / 2, v0: 0, v1: o.crown, arch: 'round' };
    add('structure', 'facade', G.panel(A, B, -0.05, z1, o.wall, [hole]));    // base just below the ground: the opening runs to the floor
    // which side is outside: away from the zone the doorway opens into
    const left = [-t[1], t[0]], mid = [A[0] + t[0] * uc, A[1] + t[1] * uc];
    const outSign = G.inside([mid[0] + left[0] * 0.6, mid[1] + left[1] * 0.6], zoneRing) ? -1 : 1;
    const band = G.openingShape({ u0: hole.u0 - 0.16, u1: hole.u1 + 0.16, v0: 0, v1: o.crown + 0.16, arch: 'round' });
    band.holes.push(G.openingPath(hole));
    add('structure', 'facade', G.panelShape(A, B, band, outSign * (o.wall / 2 + 0.03), 0.06));
    colliders.push({ a: A, b: [A[0] + t[0] * hole.u0, A[1] + t[1] * hole.u0], z0: 0, z1, tag: 'wall' });
    colliders.push({ a: [A[0] + t[0] * hole.u1, A[1] + t[1] * hole.u1], b: B, z0: 0, z1, tag: 'wall' });
  }
  function foldedStacks(path, z0, z1, zoneRing, which) {             // which: 'noStart' / 'noEnd' skips the stack at that end
    // open state: head + sill track along the run, panels folded into stacks every ~4.5 m
    const { pts, total } = G.resample(path, 0.5);
    add('doorsOpen', 'frames', G.wall(pts, 0.12, z1 - 0.12, z1));
    add('doorsOpen', 'frames', G.wall(pts, 0.1, z0, z0 + 0.02));
    const nStacks = Math.max(1, Math.round(total / 4.5));
    for (let k = 0; k <= nStacks; k++) {
      if ((k === 0 && which === 'noStart') || (k === nStacks && which === 'noEnd')) continue;
      const idx = Math.min(pts.length - 1, Math.round((k / nStacks) * (pts.length - 1)));
      const p = pts[idx], q = pts[Math.min(idx + 1, pts.length - 1)], o = pts[Math.max(idx - 1, 0)];
      const t = norm([q[0] - o[0], q[1] - o[1]]); let n = [-t[1], t[0]];
      if (!G.inside([p[0] + n[0] * 0.6, p[1] + n[1] * 0.6], zoneRing)) n = [-n[0], -n[1]];
      const a = [p[0] + n[0] * 0.05, p[1] + n[1] * 0.05], b = [p[0] + n[0] * 0.85, p[1] + n[1] * 0.85];
      add('doorsOpen', 'glazing', G.beam(a, b, 0.22, z0 + 0.02, z1 - 0.12));
      add('doorsOpen', 'frames', G.beam(a, b, 0.24, z1 - 0.18, z1 - 0.12));
      add('doorsOpen', 'frames', G.beam(a, b, 0.24, z0 + 0.02, z0 + 0.08));
      add('doorsOpen', 'frames', G.post(b, 0.06, z0, z1 - 0.12, 0.24));
      add('doorsOpen', 'frames', G.post(p, 0.08, z0, z1, 0.08));
      colliders.push({ a, b, z0: 0, z1, tag: 'stack' });
    }
  }

  // the roofed walkway to the entrance (layout.js): a flat white roof from the building face, on slim posts
  if (V.features.passage) {
    const P = V.features.passage;
    add('roofs', 'facade', G.prism(P.roof, [], P.z, P.z + P.t, 0.02));
    add('ceilings', 'fixed:white_ceiling_fixed', G.flat(P.roof, [], P.z - 0.01, true));
    for (const p of P.posts || []) { add('roofs', 'frames', G.post(p, 0.1, 0, P.z)); colliders.push({ a: [p[0] - 0.05, p[1]], b: [p[0] + 0.05, p[1]], z0: 0, z1: P.z, tag: 'post' }); }
  }

  // ------------------------------------------------------------- ceilings, roofs, upper storey
  add('ceilings', 'indoor_ceiling', G.flat(Z.indoor, [], H.indoor_ceiling - 0.02, true));
  add('ceilings', 'smoking_ceiling', G.flat(Z.smoking, [], H.smoking_roof - 0.02, true));
  add('roofs', 'facade', G.prism(Z.smoking, [], H.smoking_roof, H.smoking_roof + 0.32));
  add('roofs', 'pergola_roof', G.wall([...Z.smoking, Z.smoking[0]], 0.05, H.smoking_roof - 0.04, H.smoking_roof + 0.06, 0.03));
  // single-storey roof over the indoor zone (the drum's upper floor sits on top, see upper.js)
  add('roofs', 'facade', G.prism(Z.indoor, [], H.indoor_ceiling, H.single_storey_roof));
  // parapet stops 3 cm under the first floor: where it runs inside the drum its top would be coplanar with the drum floor (z-fighting)
  add('roofs', 'facade', G.prism(G.strip([...Z.indoor, Z.indoor[0]], 0.3), [], H.single_storey_roof, Math.min(H.single_storey_roof + 0.35, H.upper_floor - 0.03), 0.02));
  // GF ceiling detail (video 1): radial timber poles under the reed ceiling + white coffer ring over the lounge
  {
    const D = V.features.drum;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU; const pts = [];
      for (let r = 5.6; r <= D.radius - 0.3; r += 0.25) {
        const q = [D.center[0] + r * Math.cos(a), D.center[1] + r * Math.sin(a)];
        if (G.inside(q, Z.indoor) && G.ringDist(q, Z.indoor) > 0.25) pts.push(q);
      }
      if (pts.length > 3) { const g = poleBetween(pts[0], pts[pts.length - 1], H.indoor_ceiling - 0.09, 0.07); add('ceilings', 'fixed:timber_beam', g); }
    }
    const ring = (r, n = 64) => Array.from({ length: n }, (_, i) => [D.center[0] + r * Math.cos((i / n) * TAU), D.center[1] + r * Math.sin((i / n) * TAU)]);
    add('ceilings', 'fixed:white_ceiling_fixed', G.prism(ring(5.6), [ring(4.9).reverse()], H.indoor_ceiling - 0.42, H.indoor_ceiling, 0.02));
    add('ceilings', 'fixed:cove_light', G.prism(ring(4.92), [ring(4.86).reverse()], H.indoor_ceiling - 0.44, H.indoor_ceiling - 0.4));
  }

  // ------------------------------------------------------------- pergolas (courtyard bays)
  const lampSpots = { cone: [], globe: [] };
  for (const bay of V.pergolas) pergola(bay.outer, H.pergola);
  function pergola(ring, h) {
    const ang = G.principalAngle(ring); const dir = [Math.cos(ang), Math.sin(ang)]; const nrm = [-dir[1], dir[0]];
    const c = G.centroid(ring);
    for (let off = -6; off <= 6; off += 0.16) {             // slats along the principal axis
      const p = [c[0] + nrm[0] * off, c[1] + nrm[1] * off];
      const ts = G.lineCuts(p, dir, ring);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const a = [p[0] + dir[0] * (ts[i] + 0.05), p[1] + dir[1] * (ts[i] + 0.05)];
        const b = [p[0] + dir[0] * (ts[i + 1] - 0.05), p[1] + dir[1] * (ts[i + 1] - 0.05)];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2) add('pergolas', 'pergola_roof', G.beam(a, b, 0.06, h, h + 0.04));
      }
    }
    add('pergolas', 'frames', G.wall([...ring, ring[0]], 0.08, h - 0.16, h));
    for (const v of corners(ring, 25)) {
      add('pergolas', 'frames', G.post(v, 0.1, 0, h));
      colliders.push({ a: [v[0] - 0.05, v[1]], b: [v[0] + 0.05, v[1]], z0: 0, z1: h, tag: 'post' });
    }
    lampSpots.cone.push({ p: c, y: h - 0.05 });
  }

  // ------------------------------------------------------------- platform (raised round deck by the pool)
  const circ = (c, r, n = 64) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * TAU), c[1] + r * Math.sin((i / n) * TAU)]);
  add('structure', 'platform_deck', G.prism(circ(P.center, PR), [], 0, H.platform_deck));
  {
    const open = Math.atan2(platformStepsDir[1], platformStepsDir[0]); const half = 0.42;
    for (let k = 1; k <= 2; k++) {                          // two treads in the opening
      const r0 = PR + (2 - k) * 0.4, r1 = PR + (3 - k) * 0.4, zt = H.platform_deck * (k / 3);
      const arc = []; for (let i = 0; i <= 12; i++) { const a = open - half + (i / 12) * half * 2; arc.push([Math.cos(a), Math.sin(a)]); }
      const ring = [...arc.map((d) => [P.center[0] + d[0] * (r0 - 0.4), P.center[1] + d[1] * (r0 - 0.4)]), ...arc.reverse().map((d) => [P.center[0] + d[0] * r1, P.center[1] + d[1] * r1])];
      add('structure', 'platform_deck', G.prism(ring, [], 0, zt));
    }
    // glass balustrade with steel posts, open toward the courtyard
    const N = 40; const rr = PR - 0.06; let prev = null;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU; let da = Math.abs(((a - open + Math.PI) % TAU + TAU) % TAU - Math.PI);
      const p = [P.center[0] + rr * Math.cos(a), P.center[1] + rr * Math.sin(a)];
      if (da < half) { prev = null; continue; }
      if (prev) {
        add('structure', 'glazing', G.pane(prev, p, H.platform_deck + 0.05, H.platform_deck + 1.05));
        colliders.push({ a: prev, b: p, z0: 0, z1: 2, tag: 'balustrade' });
      }
      if (i % 3 === 0) {
        add('structure', 'fixed:steel', G.cyl(p, 0.025, H.platform_deck, H.platform_deck + 1.1, 8));
        add('structure', 'fixed:steel', sphereAt(p, H.platform_deck + 1.12, 0.045));
      }
      prev = p;
    }
    add('structure', 'fixed:steel', G.wall(circ(P.center, rr, 64).concat([circ(P.center, rr, 64)[0]]).filter((p) => {
      const a = Math.atan2(p[1] - P.center[1], p[0] - P.center[0]); return Math.abs(((a - open + Math.PI) % TAU + TAU) % TAU - Math.PI) >= half;
    }), 0.05, H.platform_deck + 1.06, H.platform_deck + 1.1));
    // pergola over the deck
    const s = 1.55; const sq = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([dx, dy]) => [P.center[0] + dx, P.center[1] + dy]);
    pergola(sq.map((v) => v), H.platform_deck + 2.6);
  }
  // courtyard tree planter
  const T = V.features.courtyard_tree;
  add('structure', 'courtyard_walls', G.prism(circ(T.center, T.radius, 40), [circ(T.center, T.radius - 0.15, 40).reverse()], 0, 0.45));
  add('structure', 'fixed:gravel', G.prism(circ(T.center, T.radius - 0.15, 40), [], 0, 0.4));
  colliders.push(...pathSegs([...circ(T.center, T.radius, 24), circ(T.center, T.radius, 24)[0]]).map(([a, b]) => ({ a, b, z0: 0, z1: 0.45, tag: 'planter' })));

  // ------------------------------------------------------------- beach deck: rope fence + steps
  const fencePosts = [];
  {
    const ring = Z.beach_deck; const n = ring.length;
    const skip = new Set(deckSteps.flatMap((s) => s.edges));
    for (let i = 0; i < n; i++) {
      if (skip.has(i)) continue;
      const a = ring[i], b = ring[(i + 1) % n];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (G.ringDist(mid, Z.smoking) < 1.0 || G.ringDist(mid, Z.indoor) < 1.0) continue;
      colliders.push({ a, b, z0: -1, z1: 2, tag: 'fence' });
      fencePosts.push(a, b);
      ropeSwag(a, b, H.beach_deck + 0.86);
    }
    for (const s of deckSteps) {
      for (let k = 0; k < 3; k++) {
        const z = H.sand + (H.beach_deck - H.sand) * ((3 - k) / 3);
        const d0 = s.depth * (k / 3), d1 = s.depth * ((k + 1) / 3);
        const q = [[s.a[0] + s.n[0] * d0, s.a[1] + s.n[1] * d0], [s.b[0] + s.n[0] * d0, s.b[1] + s.n[1] * d0],
          [s.b[0] + s.n[0] * d1, s.b[1] + s.n[1] * d1], [s.a[0] + s.n[0] * d1, s.a[1] + s.n[1] * d1]];
        add('structure', 'beach_deck', G.prism(q, [], H.sand - 0.05, z));
      }
    }
  }
  function ropeSwag(a, b, z) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const spans = Math.max(1, Math.round(L / 2.2));
    for (let k = 0; k < spans; k++) {
      const A = [a[0] + (b[0] - a[0]) * (k / spans), a[1] + (b[1] - a[1]) * (k / spans)];
      const B = [a[0] + (b[0] - a[0]) * ((k + 1) / spans), a[1] + (b[1] - a[1]) * ((k + 1) / spans)];
      fencePosts.push(A);
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(A[0] + (B[0] - A[0]) * t, z - 0.12 * Math.sin(Math.PI * t), -(A[1] + (B[1] - A[1]) * t))); }
      add('structure', 'fixed:rope', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.018, 5, false));
    }
  }
  {
    const seen = []; for (const p of fencePosts) {
      if (seen.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.2)) continue; seen.push(p);
      add('structure', 'fixed:white_lacquer', G.prism(squareAround(p, 0.1), [], H.beach_deck, H.beach_deck + 1.0, 0.015));
    }
  }

  // ------------------------------------------------------------- site context
  const sandRing = shore ? [...shore, [FAR, shore[shore.length - 1][1]], [FAR, -FAR], [-FAR, -FAR], [-FAR, shore[0][1]]] : [[-FAR, -FAR], [FAR, -FAR], [FAR, FAR], [-FAR, FAR]];
  // with the OSM landscape, the CAD site model (beach, lawn, shore) only fills its own box; real land and
  // water from the coastline take over outside it, over one sea plane
  const KEEP = opts.landscape?.keep;
  const own = (ring) => (KEEP ? clipToBox(ring, KEEP) : ring);
  add('context', 'fixed:sand', G.flat(own(sandRing), [], H.sand));
  if (seaRing) {
    const sea = KEEP ? [[-FAR, -FAR], [FAR, -FAR], [FAR, FAR], [-FAR, FAR]] : seaRing;
    add('context', 'fixed:sea', G.flat(sea, [], H.sand - 0.12));
    add('context', 'fixed:seabed', G.flat(sea, [], -2.5));
    colliders.push(...pathSegs(shore).map(([a, b]) => ({ a, b, z0: -5, z1: 5, tag: 'shore' })));
  }
  add('context', 'fixed:lawn', G.flat(own(LAND), pools.map((p) => [...p].reverse()), -0.02));
  for (const pl of pools) {
    add('context', 'fixed:pool', G.flat(pl, [], -0.22));
    add('context', 'fixed:limestone_fixed', G.wall([...pl, pl[0]], 0.45, -0.05, 0.04, -0.2));
    add('context', 'fixed:pool_tile', G.wall([...pl, pl[0]], 0.08, -1.3, -0.04, 0.0));
    collideRing(pl, -2, 2, 'pool');
  }
  for (const bw of V.context.boardwalk) add('context', 'fixed:teak_deck', G.prism(bw, [], -0.4, 0.1));
  for (const b of opts.osm ? [] : V.context.buildings) {
    if (b.length < 2) continue;
    const c = b[0]; if (Math.hypot(c[0], c[1]) > 90) continue;
    if (G.inside(c, Z.indoor) || G.inside(c, Z.outdoor) || G.inside(c, Z.smoking)) continue;
    add('context', 'fixed:context', G.wall(b, 0.3, -0.02, 0.06));          // hotel footprint lines (no heights in the set)
  }
  // real footprints + heights from OpenStreetMap (ODbL), dressed with facades, roofs, quays and palms (city.js)
  let city = null;
  if (opts.osm) { city = buildCity(opts.osm, { landscape: opts.landscape }); groups.context.add(city.group); } else skyline();
  function skyline() {
    // distant towers across the water (Abu Dhabi skyline seen in the site videos) — indicative only
    const rnd = mulberry(11); const geos = [];
    for (let i = 0; i < 90; i++) {
      const a = -0.3 + rnd() * 2.2;                          // bearing from east, CCW (east -> north-west)
      const d = 700 + rnd() * 1600;
      const w = 16 + rnd() * 28, h = 30 + rnd() * rnd() * 240, dz = w * (0.6 + rnd() * 0.8);
      const g = new THREE.BoxGeometry(w, h, dz);
      const uv = g.attributes.uv;                            // tile the window texture by real size
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.max(w, dz) / 12, uv.getY(k) * h / 12);
      g.rotateY(rnd() * 3); g.translate(Math.cos(a) * d, h / 2 - 2, -Math.sin(a) * d);
      geos.push(g);
      if (h > 150 && rnd() < 0.5) {                          // crown on the tall ones
        const c = new THREE.CylinderGeometry(w * 0.18, w * 0.3, 18, 8); c.translate(Math.cos(a) * d, h + 7, -Math.sin(a) * d); geos.push(c);
      }
    }
    add('context', 'fixed:tower', G.merge(geos));
  }

  // ------------------------------------------------------------- upper floor, stair hall, entrance, arch gate
  const upper = buildUpper(V, add, colliders);
  // courtyard kerbs / terrace edges are steps you can stand on
  elevated = upper.surfaces.concat(V.solids.filter((x) => x.kind === 'kerb').map((x) => ({ poly: x.outer, h: () => H.kerb })));

  // ------------------------------------------------------------- meshes from bins
  for (const [key, list] of bins) {
    const [group, mat] = key.split('|');                  // optional third part: a tag (its own mesh)
    const material = mat.startsWith('fixed:') ? fixedFor(mat.slice(6)) : surfaceMaterial(mat);
    const mesh = new THREE.Mesh(G.merge(list), material);
    mesh.name = key; mesh.userData.surface = mat;
    const tag = key.split('|')[2]; const el = tag && elements.find((e) => e.tag === tag); if (el) { mesh.userData.element = el.key; (el.meshes ||= []).push(mesh); }
    const transparent = material.transparent;
    mesh.castShadow = !transparent && !['context'].includes(group) || mat === 'fixed:tower';
    mesh.receiveShadow = true;
    if (mat === 'fixed:sea' || mat === 'fixed:pool') mesh.userData.water = true;
    if (mat === 'fixed:sea') Object.assign(material, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });   // never over distant land
    if (transparent) mesh.renderOrder = 2;
    groups[group].add(mesh);
  }

  // ------------------------------------------------------------- furniture, lamps, plants
  const items = V.furniture.filter((f) => f.type);
  const fy = (x, y) => floorAt(x, y) ?? 0;
  const furnitureGroup = buildFurniture(items, fy);
  groups.furniture.add(furnitureGroup);
  for (const f of items) {
    if (f.zone === 'smoking' && (f.type === 'coffee_table' || f.type === 'table')) lampSpots.cone.push({ p: f.at, y: H.smoking_roof - 0.1 });
    if (f.zone === 'indoor' && (f.type === 'side_table_round' || f.type === 'table_round')) lampSpots.globe.push({ p: f.at, y: H.indoor_ceiling - 0.1 });
    if (f.zone === 'indoor' && (f.type === 'coffee_table' || (f.type === 'table' && f.l > 1.2))) lampSpots.cone.push({ p: f.at, y: H.indoor_ceiling - 0.1 });
  }
  groups.lamps.add(buildInstanced('cone_lamps', coneLampParts(), lampSpots.cone.map((s) => ({ ...s, sy: 1 }))));
  groups.lamps.add(buildInstanced('globe_lamps', globeLampParts(), lampSpots.globe));
  // warm light pools on the floor under each pendant (realtime only; photo mode uses the real lights)
  const freePools = buildInstanced('free_pools', [{ geo: poolGeometry(), mat: poolMaterial(), shadow: false }], [...lampSpots.cone, ...lampSpots.globe].map((s) => ({ p: s.p, y: (floorAt(s.p[0], s.p[1]) ?? 0) + 0.012, s: 1.3 })));
  freePools.traverse((o) => { if (o.isMesh) { o.userData.noPhoto = true; o.receiveShadow = false; o.renderOrder = 3; } });
  groups.lamps.add(freePools);
  const shrubs = V.plants.filter((p) => Math.hypot(p.at[0] - T.center[0], p.at[1] - T.center[1]) > T.radius + 0.3).map((p) => ({ p: p.at, y: fy(p.at[0], p.at[1]), s: Math.min(Math.max(p.r / 0.45, 0.6), 1.4), rot: p.at[0] * 7 }));
  groups.plants.add(buildInstanced('shrubs', shrubParts(), shrubs));
  const palms = (V.features.palms || []).map((p, i) => ({ p, y: 0, s: 0.9 + (i % 3) * 0.12, rot: i * 1.3 }));
  if (palms.length) groups.plants.add(buildInstanced('palms', palmParts(), palms));
  groups.plants.add(buildInstanced('tree', treeParts(), [{ p: T.center, y: 0.4, s: 1.15 }]));
  // white sphere planters with bougainvillea at the arrival court and the arch gate (video 1)
  {
    const st = upper.stair, g = V.features.arch_gate;
    const spots = [[st.door[0] - 1.6, st.door[1] - 0.6], [st.door[0] + 1.8, st.door[1] - 1.0], [g.center[0] - 1.9, g.center[1] - 1.5], [g.center[0] + 1.6, g.center[1] - 1.9]];
    groups.plants.add(buildInstanced('sphere_planters', spherePlanterParts(), spots.map((p, i) => ({ p, y: fy(...p), rot: i * 1.9 }))));
  }

  // ------------------------------------------------------------- zone labels (overview mode)
  const LABEL = { indoor: 'Indoor seating & kitchen', smoking: 'Smoking pods', outdoor: 'Outdoor courtyard', beach_deck: 'Beach deck' };
  for (const z of V.zones) {
    const c = labelPoint(z.zone);
    const spr = textSprite(`${LABEL[z.zone]}\n${Math.round(z.area)} m²`);
    spr.position.set(c[0], z.zone === 'indoor' ? H.parapet + 3 : 6, -c[1]);
    groups.labels.add(spr);
  }
  function labelPoint(zone) {
    return { indoor: [11, -2], smoking: [-14, 7.5], outdoor: [-9, -10], beach_deck: [-8, 15] }[zone] || G.centroid(Z[zone]);
  }

  // ------------------------------------------------------------- night lights (few, unshadowed)
  const lights = [];
  for (const [x, y, h, c] of [[5, 4, 3.0, 0xffc58a], [12, -4, 3.0, 0xffc58a], [8, 10, 3.0, 0xffc58a], [-14, 8, 2.8, 0xffb070],
    [-2, 12, 2.8, 0xffb070], [-16, -2, 2.6, 0xffb070], [-10, -14, 2.5, 0xffb070], [P.center[0], P.center[1], 2.9, 0xffb070],
    [V.features.drum.center[0], V.features.drum.center[1], 7.2, 0xffe2b8], [upper.stair.lobby[0], upper.stair.lobby[1], 3.0, 0xffd2a0],
    // a fixed pool of 14 (see lighting.js LightRig): themes re-aim them at their own fixtures
    [15, 10, 2.9, 0xffc58a], [4, 13.5, 2.8, 0xffb070], [5, -7, 3.0, 0xffc58a], [-6, 9, 2.8, 0xffb070]]) {
    const l = new THREE.PointLight(c, 0, 18, 1.2); l.position.set(x, h, -y); root.add(l); lights.push(l);
  }

  // ------------------------------------------------------------- hotspots
  const hotspots = [
    { id: 'arrival', label: 'Arrival – courtyard gate', p: [-2.8, -21], look: [-6, -8] },
    { id: 'courtyard', label: 'Courtyard & tree', p: [-4.5, -12.5], look: [-10, -4] },
    { id: 'platform', label: 'Platform over the pool', p: [P.center[0] + 0.8, P.center[1] + 0.6], look: [-36, -14] },
    { id: 'pods', label: 'Smoking pods', p: [-15.5, 4.5], look: [-8, 10] },
    { id: 'indoor', label: 'Indoor dining', p: [2.0, -1.5], look: [10, 2] },
    { id: 'bar', label: 'Bar', p: [10.5, 8.0], look: [15, 8] },
    { id: 'lounge', label: 'Coffered lounge', p: [10.5, -2.5], look: [14, 2] },
    { id: 'deck', label: 'Beach deck – dining', p: [-21, 14.5], look: [-4, 16] },
    { id: 'sunbeds', label: 'Beach deck – sunbeds', p: [4, 17.5], look: [14, 19] },
    { id: 'beach', label: 'On the beach', p: [-6, 22.5], look: [-6, 12] },
    { id: 'stair', label: 'Stair to the upper floor', p: upper.stair.lobby, look: [upper.stair.lobby[0] + upper.stair.climb[0] * 6, upper.stair.lobby[1] + upper.stair.climb[1] * 6] },
    { id: 'upstairs', label: 'Upper floor (stripped)', p: [V.features.drum.center[0] + 1, V.features.drum.center[1] - 7], look: V.features.drum.center, ref: H.upper_floor },
  ];

  // extra walkable surfaces added later (theme stages / platforms); each may carry when() to switch it off
  const addSurfaces = (list) => { elevated.push(...list); };
  return { root, groups, floorAt, colliders, hotspots, lights, zones: Z, shore, upper, items, furnitureGroup, city, addSurfaces, elements };
}

// ------------------------------------------------------------- helpers
function fixedFor(id) {
  const extra = {
    steel: () => new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.25 }),
    rope: () => new THREE.MeshStandardMaterial({ color: '#e9e2d0', roughness: 1 }),
    seabed: () => new THREE.MeshStandardMaterial({ color: '#c9b98f', roughness: 1 }),
    pool_tile: () => new THREE.MeshStandardMaterial({ color: '#7fd3dc', roughness: 0.4 }),
    skirting: () => new THREE.MeshStandardMaterial({ color: '#8d877d', roughness: 0.6 }),
  };
  if (extra[id] && !FINISHES[id]) {
    fixedFor.cache = fixedFor.cache || {}; return (fixedFor.cache[id] = fixedFor.cache[id] || extra[id]());
  }
  return fixedMaterial(id);
}
function poleBetween(a, b, y, r) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = new THREE.CylinderGeometry(r, r, L, 8); g.rotateZ(Math.PI / 2);
  g.rotateY(Math.atan2(b[1] - a[1], b[0] - a[0])); g.translate((a[0] + b[0]) / 2, y, -(a[1] + b[1]) / 2);
  return g;
}
function squareAround(p, w) { const h = w / 2; return [[p[0] - h, p[1] - h], [p[0] + h, p[1] - h], [p[0] + h, p[1] + h], [p[0] - h, p[1] + h]]; }
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
function pathSegs(path) { const s = []; for (let i = 1; i < path.length; i++) s.push([path[i - 1], path[i]]); return s; }
function pathLen(path) { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return l; }
// [distance, arc length] of the point on a polyline nearest to p
function arcOf(path, p) {
  let best = [Infinity, 0], acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], [dd, x, y] = G.segDist(p, a, b);
    if (dd < best[0]) best = [dd, acc + Math.hypot(x - a[0], y - a[1])];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return best;
}
// the stretch of a polyline between arc lengths u0 and u1
function subPath(path, u0, u1) {
  const out = []; let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), s0 = acc; acc += L;
    if (acc < u0 || s0 > u1 || !L) continue;
    const t0 = Math.max(0, (u0 - s0) / L), t1 = Math.min(1, (u1 - s0) / L);
    if (!out.length) out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
    out.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
  }
  return out;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sphereAt(p, y, r) { const g = new THREE.SphereGeometry(r, 10, 8); g.translate(p[0], y, -p[1]); return g; }
function corners(ring, minTurnDeg) {
  const out = []; const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n];
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(t2 - t1); if (d > Math.PI) d = TAU - d;
    if (d * 180 / Math.PI >= minTurnDeg && !out.some((q) => Math.hypot(q[0] - b[0], q[1] - b[1]) < 0.6)) out.push(b);
  }
  return out;
}
function longestLine(lines) {
  if (!lines || !lines.length) return null;
  // chain pieces end-to-start greedily, then keep the longest chain, ordered west -> east
  const pieces = lines.map((l) => l.slice());
  let best = null, bestLen = 0;
  for (const start of pieces) {
    const chain = start.slice(); const used = new Set([start]);
    let grown = true;
    while (grown) {
      grown = false;
      for (const p of pieces) {
        if (used.has(p)) continue;
        const e = chain[chain.length - 1];
        if (Math.hypot(p[0][0] - e[0], p[0][1] - e[1]) < 0.5) { chain.push(...p.slice(1)); used.add(p); grown = true; }
        else if (Math.hypot(p[p.length - 1][0] - e[0], p[p.length - 1][1] - e[1]) < 0.5) { chain.push(...p.slice(0, -1).reverse()); used.add(p); grown = true; }
      }
    }
    let len = 0; for (let i = 1; i < chain.length; i++) len += Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]);
    if (len > bestLen) { bestLen = len; best = chain; }
  }
  if (best[0][0] > best[best.length - 1][0]) best.reverse();
  return best;
}
// beach-deck stair protrusions: an edge whose neighbours are both short and ~perpendicular
function findDeckSteps(ring, avoid) {
  const n = ring.length; const out = [];
  const L = (i) => { const a = ring[i % n], b = ring[(i + 1) % n]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
  const dir = (i) => norm([ring[(i + 1) % n][0] - ring[i % n][0], ring[(i + 1) % n][1] - ring[i % n][1]]);
  for (let i = 0; i < n; i++) {
    const len = L(i); if (len < 1.5 || len > 5) continue;
    const ip = (i - 1 + n) % n, inx = (i + 1) % n;
    if (L(ip) > 1.8 || L(inx) > 1.8 || L(ip) < 0.4 || L(inx) < 0.4) continue;
    const d0 = dir(i), dp = dir(ip), dn = dir(inx);
    if (Math.abs(d0[0] * dp[0] + d0[1] * dp[1]) > 0.35 || Math.abs(d0[0] * dn[0] + d0[1] * dn[1]) > 0.35) continue;
    const a = ring[i], b = ring[inx], p0 = ring[ip], p3 = ring[(i + 2) % n];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (avoid.some((r) => G.ringDist(mid, r) < 2)) continue;
    const nin = norm([p0[0] - a[0], p0[1] - a[1]]);       // from outer edge back toward the deck
    out.push({ a, b, n: nin, depth: L(ip), quad: [p0, a, b, p3], edges: [ip, i, inx] });
  }
  return out;
}

function textSprite(text) {
  const lines = text.split('\n'); const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true });
  const fs = 44; c.width = 900; c.height = fs * 1.5 * lines.length + 30;
  g.fillStyle = 'rgba(18,22,26,0.78)'; roundRect(g, 0, 0, c.width, c.height, 26); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = `${i ? 400 : 600} ${i ? fs * 0.8 : fs}px Inter, system-ui, sans-serif`; g.fillText(l, c.width / 2, 15 + fs * 0.75 + i * fs * 1.5); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(9, 9 * c.height / c.width, 1); s.renderOrder = 10; return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// Sutherland–Hodgman: a polygon clipped to an axis-aligned box [x0, y0, x1, y1]
function clipToBox(ring, [x0, y0, x1, y1]) {
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  let out = ring;
  for (const [ins, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (ins(b)) { if (!ins(a)) out.push(cut(a, b)); out.push(b); } else if (ins(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
