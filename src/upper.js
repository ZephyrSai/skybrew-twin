// Upper floor of the drum (ex Chi-Chi's, now stripped — video 2), its stair hall from the
// arrival court, the entrance and the courtyard arch gate.
//
// Sources: Chi Chi.pdf (24-bay round plan, central dome, ceiling H 330), Voodoo.pdf (1998 GF with
// staircase), video 2 (arched brown door → 3 straight flights, ~24 risers, terracotta treads,
// stone-clad walls, glazed upper landing). Stair position is an ASSUMPTION (overrides.json).
import * as THREE from 'three';
import * as G from './geom.js';

const TAU = Math.PI * 2;

export function buildUpper(V, add, colliders) {
  const H = V.heights, F = V.features;
  const D = F.drum, C = D.center, R = D.radius, N = D.sides;
  const surfaces = [];                                   // elevated walkable surfaces {poly, h(p)}
  const at = (r, a) => [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)];
  const poly = (r, n = N, a0 = 0) => Array.from({ length: n }, (_, k) => at(r, a0 + (k / n) * TAU));
  const Zones = Object.fromEntries(V.zones.map((z) => [z.zone, z.outer]));

  // ------------------------------------------------------------------ stair hall
  const S = F.stair, W = S.width, hw = W / 2, wt = 0.22, roof = H.annex_roof;
  const risers = S.flights.reduce((a, b) => a + b, 0);
  const lobbyH = 0.3, riser = (H.upper_floor - lobbyH) / risers;
  // the street door (video 2, 0:00–0:12): arched and brown, on the arrival court with the arch gate on its left. It
  // opens into a small lobby; PD(t, q) is the lobby's frame, t along the door wall, q inward (q = -hw is the door wall)
  const tD = (S.dir_deg * Math.PI) / 180, dD = [Math.cos(tD), Math.sin(tD)], nD = [-dD[1], dD[0]];
  const PD = (t, q) => [S.foot[0] + dD[0] * t + nD[0] * q, S.foot[1] + dD[1] * t + nD[1] * q];
  const doorS = [-S.lobby + 0.25, -0.25];                 // the door spans this t-range of the door wall
  const [tW, tE, qN] = S.lobby_box;                       // lobby: t from tW to tE, q from the door wall to qN
  // in through the door you face the lobby's stone wall, turn LEFT and climb (layout.js; video 2, 0:12–0:24): three
  // straight flights along the courtyard side of the building, the stone wall on your right, to a top landing that
  // opens right into the first floor. P(s, q): s up the stair (lobby < 0 < flights < sTop < landing < sEnd), q across
  // it, +q toward the drum (on your right going up); its left wall carries on from the lobby's south-west corner
  const tc = (S.climb_deg * Math.PI) / 180, d = [Math.cos(tc), Math.sin(tc)], n = [d[1], -d[0]];
  const meet = (a, da, b, db) => { const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / (da[0] * db[1] - da[1] * db[0]); return [a[0] + da[0] * t, a[1] + da[1] * t]; };
  const xL = PD(tW, -hw);                                 // lobby's south-west corner = foot of the stair's left wall
  const xR = meet(PD(0, qN), dD, [xL[0] + n[0] * W, xL[1] + n[1] * W], d);   // where the stair's right wall meets the lobby's
  const s0 = ((xR[0] - xL[0]) * d[0] + (xR[1] - xL[1]) * d[1]) + 0.35;       // north wall; the first riser is 0.35 m past it
  const O = [xL[0] + d[0] * s0 + n[0] * hw, xL[1] + d[1] * s0 + n[1] * hw];
  const P = (s, q) => [O[0] + d[0] * s + n[0] * q, O[1] + d[1] * s + n[1] * q];
  const sOf = (p) => (p[0] - O[0]) * d[0] + (p[1] - O[1]) * d[1], tOf = (p) => (p[0] - S.foot[0]) * dD[0] + (p[1] - S.foot[1]) * dD[1];
  const rect = (s0_, s1, q0, q1) => [P(s0_, q0), P(s1, q0), P(s1, q1), P(s0_, q1)];
  // flights: a flight of k risers has k - 1 treads, its last riser lands on the landing (or the top landing)
  const runs = []; let s = 0, z = lobbyH;
  S.flights.forEach((k, i) => {
    for (let j = 0; j < k - 1; j++) { z += riser; runs.push({ s0: s, s1: s + S.going, z }); s += S.going; }
    z += riser;
    if (i < S.flights.length - 1) { runs.push({ s0: s, s1: s + S.landing, z, landing: true }); s += S.landing; }
  });
  const sTop = s, sEnd = s + S.top_landing, sCorr = (sTop + sEnd) / 2, cw = S.corridor_width;

  // treads (solid down to the ground so the underside reads as built), landings, the lobby floor
  for (const r of runs) add('upper', 'stair_treads', G.prism(rect(r.s0, r.s1, -hw, hw), [], 0, r.z));
  add('upper', 'stair_treads', G.prism(rect(sTop, sEnd, -hw, hw), [], 0, H.upper_floor));
  const lobby = [xL, PD(tE, -hw), PD(tE, qN), xR, P(0, hw), P(0, -hw)];
  add('upper', 'stair_treads', G.prism(lobby, [], 0, lobbyH));
  surfaces.push({ poly: lobby, h: () => lobbyH });
  surfaces.push({
    poly: rect(0, sTop, -hw, hw),
    h: (p) => {
      const sp = sOf(p);
      for (const r of runs) if (sp >= r.s0 && sp < r.s1) return r.z;
      return sp < 0 ? lobbyH : H.upper_floor;
    },
  });
  surfaces.push({ poly: rect(sTop, sEnd, -hw, hw), h: () => H.upper_floor });

  // handrail: timber on a stone-clad dwarf wall along the drum side, following the pitch
  const rail = [];
  for (const r of runs) rail.push([r.s0, r.z], [r.s1, r.z]);
  for (let i = 0; i + 1 < rail.length; i += 2) {
    const [sa, za] = rail[i], [sb] = rail[i + 1];
    add('upper', 'stone_cladding', G.prism(rect(sa, sb, hw - 0.18, hw), [], za, za + 0.82));
    add('upper', 'fixed:teak_furniture', G.prism(rect(sa, sb, hw - 0.22, hw + 0.03), [], za + 0.82, za + 0.88, 0.01));
  }

  // walls. Outer corners: each wall runs to where its outer face meets its neighbour's
  const oSW = meet(PD(0, -hw - wt), dD, P(0, -hw - wt), d), oN = meet(PD(0, qN + wt), dD, P(0, hw + wt), d);
  const oEnd = [P(sEnd + wt, -hw - wt), P(sEnd + wt, hw + wt)];
  const sSW = sOf(oSW), sN = sOf(oN), tSW = tOf(oSW), tN = tOf(oN);
  // the stair's left wall (white plaster, courtyard side): two small arched windows, then the big glazed arch over the
  // top flight and landing (video 2, 0:22: the light at the top, the iron balustrade in front of it)
  const leftHoles = [{ s0: 3.4, s1: 4.1, v0: 2.9, v1: 4.0, arch: 'round' }, { s0: sTop - 1.15, s1: sEnd - 0.15, v0: H.upper_floor + 0.1, v1: roof - 0.5, arch: 'round', glass: true }];
  const corrHole = { s0: sCorr - cw / 2, s1: sCorr + cw / 2, v0: H.upper_floor - 0.03, v1: H.upper_floor + 2.6, arch: 'round' };
  const wallS = (q, a0, a1, holes, mat) => add('upper', mat, G.panel(P(a0, q), P(a1, q), 0, roof, wt, holes.map((h) => ({ ...h, u0: h.s0 - a0, u1: h.s1 - a0 }))));
  wallS(-hw - wt / 2, sSW, sEnd + wt, leftHoles, 'facade');
  wallS(hw + wt / 2, sN, sEnd + wt, [corrHole], 'stone_cladding');
  const endHole = { u0: wt + hw - 0.35, u1: wt + hw + 0.35, v0: H.upper_floor + 1.9, v1: H.upper_floor + 3.0, arch: 'round' };
  add('upper', 'facade', G.panel(P(sEnd + wt / 2, -hw - wt), P(sEnd + wt / 2, hw + wt), 0, roof, wt, [endHole]));
  for (const h of leftHoles.filter((x) => x.glass)) add('upper', 'glazing', G.panelShape(P(h.s0, -hw - wt / 2), P(h.s1, -hw - wt / 2), G.openingShape({ ...h, u0: 0, u1: h.s1 - h.s0 }), 0, 0.02));
  add('upper', 'glazing', G.panelShape(P(sEnd + wt / 2, -hw - wt), P(sEnd + wt / 2, hw + wt), G.openingShape(endHole), 0, 0.02));
  // the lobby: door wall (south), a short east wall, the stone wall you face as you come in (north)
  const doorHole = { u0: doorS[0] - tSW, u1: doorS[1] - tSW, v0: lobbyH, v1: lobbyH + 2.75, arch: 'round' };
  add('upper', 'facade', G.panel(PD(tSW, -hw - wt / 2), PD(tE + wt, -hw - wt / 2), 0, roof, wt, [doorHole]));
  add('upper', 'facade', G.panel(PD(tE + wt / 2, -hw - wt), PD(tE + wt / 2, qN + wt), 0, roof, wt));
  add('upper', 'stone_cladding', G.panel(PD(tN, qN + wt / 2), PD(tE + wt, qN + wt / 2), 0, roof, wt));
  // roof slab (with a small overhang) and ceiling over the lobby + stair
  const shell = [oSW, PD(tE + wt, -hw - wt), PD(tE + wt, qN + wt), oN, oEnd[1], oEnd[0]];
  const inner = [xL, PD(tE, -hw), PD(tE, qN), xR, P(sEnd, hw), P(sEnd, -hw)];
  add('upper', 'facade', G.prism(shell, [], roof, roof + 0.3, 0.02, 0.12));
  add('ceilings', 'fixed:white_ceiling_fixed', G.flat(inner, [], roof - 0.02, true));
  // colliders (inner faces; the door gap; the opening to the drum only blocks below the upper floor)
  const seg = (a, b, z0 = 0, z1 = roof) => colliders.push({ a, b, z0, z1, tag: 'stairhall' });
  seg(xL, PD(doorS[0], -hw)); seg(PD(doorS[1], -hw), PD(tE, -hw)); seg(PD(doorS[0], -hw), PD(doorS[1], -hw), lobbyH + 2.75, roof);
  seg(PD(tE, -hw), PD(tE, qN)); seg(PD(tE, qN), xR);
  seg(xL, P(sEnd, -hw)); seg(P(sEnd, -hw), P(sEnd, hw));
  seg(xR, P(corrHole.s0, hw)); seg(P(corrHole.s1, hw), P(sEnd, hw)); seg(P(corrHole.s0, hw), P(corrHole.s1, hw), 0, H.upper_floor - 0.2);

  // ------------------------------------------------------------------ entrance (video 2, 0:00–0:08)
  {
    const sm = (doorS[0] + doorS[1]) / 2, dw = doorS[1] - doorS[0];
    const q = -hw - wt;                                     // outer face of the door wall
    // arched recess frame proud of the wall
    const f0 = Math.max(doorS[0] - 1.05, tSW + 0.02), f1 = Math.min(doorS[1] + 1.05, tE + wt);
    const fa = PD(f0, q - 0.02), fb = PD(f1, q - 0.02);
    add('upper', 'facade', G.panel(fa, fb, 0, 3.9, 0.36, [{ u0: doorS[0] - 0.55 - f0, u1: doorS[1] + 0.55 - f0, v0: 0, v1: 3.55, arch: 'round' }], -0.18));
    // stone cladding on the left jamb of the recess, door leaf (open), small arched windows, black stone steps. The
    // leaf is hung on the right and stands open against the lobby's east side, clear of the stair on your left
    add('upper', 'landing_walls', G.panel(PD(doorS[0] - 0.55, q - 0.04), PD(doorS[0] - 0.1, q - 0.04), 0, 2.9, 0.06));
    const hinge = PD(doorS[1] - 0.04, -hw);
    add('upper', 'fixed:door_timber', G.beam(hinge, [hinge[0] + nD[0] * 0.95, hinge[1] + nD[1] * 0.95], 0.06, lobbyH, lobbyH + 2.45));
    for (const ds of [-0.32, dw + 0.32]) {
      const c0 = doorS[0] + ds;
      add('upper', 'fixed:door_timber', G.panelShape(PD(c0 - 0.17, q - 0.03), PD(c0 + 0.17, q - 0.03), G.openingShape({ u0: 0, u1: 0.34, v0: 1.25, v1: 2.15, arch: 'round' }), 0, 0.03));
    }
    const step = (q0, q1, zt) => add('upper', 'fixed:black_stone', G.prism([PD(doorS[0] - 0.9, q0), PD(doorS[1] + 0.9, q0), PD(doorS[1] + 0.9, q1), PD(doorS[0] - 0.9, q1)], [], 0, zt, 0.01));
    step(-hw - wt - 1.5, -hw - wt, lobbyH / 2); step(-hw - wt - 0.9, -hw - wt, lobbyH);
    surfaces.push({ poly: [PD(doorS[0] - 0.9, -hw - wt - 1.5), PD(doorS[1] + 0.9, -hw - wt - 1.5), PD(doorS[1] + 0.9, -hw + 0.01), PD(doorS[0] - 0.9, -hw + 0.01)], h: (p) => {
      const qp = (p[0] - S.foot[0]) * nD[0] + (p[1] - S.foot[1]) * nD[1];
      return qp > -hw - wt - 0.9 ? lobbyH : lobbyH / 2;
    } });
  }

  // ------------------------------------------------------------------ the top landing opens into the drum
  // the stair's drum-side face runs just clear of the first floor's outer wall at the top landing (layout.js): a short
  // throat with solid cheeks, floor and roof closes the gap and runs on through the drum wall
  const cA = P(sCorr, hw);
  const Q = (u, v) => [cA[0] + n[0] * u + d[0] * v, cA[1] + n[1] * u + d[1] * v];
  let uWall = 0; while (Math.hypot(Q(uWall, 0)[0] - C[0], Q(uWall, 0)[1] - C[1]) > R && uWall < 30) uWall += 0.02;
  const corrLen = uWall + 1.2;                             // the walk floor runs 1.2 m into the drum
  const corr = [Q(0, -cw / 2), Q(corrLen, -cw / 2), Q(corrLen, cw / 2), Q(0, cw / 2)];
  add('upper', 'upper_floor', G.prism([Q(0, -cw / 2), Q(uWall + 0.3, -cw / 2), Q(uWall + 0.3, cw / 2), Q(0, cw / 2)], [], H.upper_slab_soffit, H.upper_floor));
  surfaces.push({ poly: corr, h: () => H.upper_floor });
  for (const sg of [-1, 1]) add('upper', 'landing_walls', G.panel(Q(-wt, sg * (cw / 2 + 0.1)), Q(uWall + 0.05, sg * (cw / 2 + 0.1)), 0, roof, 0.2));
  add('upper', 'facade', G.prism([Q(-wt, -cw / 2 - 0.2), Q(uWall + 0.05, -cw / 2 - 0.2), Q(uWall + 0.05, cw / 2 + 0.2), Q(-wt, cw / 2 + 0.2)], [], roof, roof + 0.3, 0.02));
  add('ceilings', 'fixed:white_ceiling_fixed', G.flat([Q(0, -cw / 2), Q(uWall, -cw / 2), Q(uWall, cw / 2), Q(0, cw / 2)], [], roof - 0.02, true));
  colliders.push({ a: Q(0, -cw / 2), b: Q(uWall + 0.3, -cw / 2), z0: 0, z1: roof, tag: 'corridor' });
  colliders.push({ a: Q(0, cw / 2), b: Q(uWall + 0.3, cw / 2), z0: 0, z1: roof, tag: 'corridor' });
  // iron balustrade (video 2) along the top landing, in front of the big glazed arch
  const balA = P(leftHoles[1].s0 + 0.9, -hw + 0.06), balB = P(sEnd - 0.08, -hw + 0.06);
  ironRail(balA, balB, H.upper_floor);

  function ironRail(a, b, z0) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    add('upper', 'fixed:iron_rail', G.beam(a, b, 0.05, z0 + 0.95, z0 + 1.0));
    for (let u = 0; u <= L; u += 0.14) {
      const p = [a[0] + t[0] * u, a[1] + t[1] * u];
      add('upper', 'fixed:iron_rail', G.post(p, 0.02, z0, z0 + 0.95 - 0.08 * Math.abs(Math.sin(u * 4.5))));
    }
  }

  // ------------------------------------------------------------------ the drum: upper floor shell
  const ringIn = poly(R - 0.3), ringOut = poly(R);
  const dome = D.dome_radius;
  const domeHole = (r) => Array.from({ length: 40 }, (_, k) => at(r, (k / 40) * TAU)).reverse();
  add('upper', 'upper_floor', G.prism(ringIn, [], H.upper_slab_soffit, H.upper_floor));
  surfaces.push({ poly: ringIn, h: () => H.upper_floor });
  // slab edge band + projecting cornice between the floors
  add('upper', 'facade', G.prism(ringOut, [ringIn.slice().reverse()], H.indoor_ceiling, H.upper_slab_soffit + 0.05));
  add('upper', 'facade', G.prism(poly(R + 0.16), [poly(R - 0.05).reverse()], H.upper_slab_soffit + 0.05, H.upper_floor - 0.05, 0.02));
  // ceiling with the dome opening, roof slab, the dome itself
  add('roofs', 'fixed:white_ceiling_fixed', G.flat(ringIn, [domeHole(dome)], H.upper_ceiling - 0.02, true));   // just under the roof slab's soffit (no z-fight)
  add('roofs', 'facade', G.prism(ringIn, [domeHole(dome)], H.upper_ceiling, H.roof_top));
  {
    const g = new THREE.SphereGeometry(dome, 40, 12, 0, TAU, 0, Math.PI / 2); g.scale(1, 0.55, 1);
    g.translate(C[0], H.upper_ceiling, -C[1]); add('roofs', 'fixed:dome', g);
    add('roofs', 'facade', G.prism(Array.from({ length: 40 }, (_, k) => at(dome + 0.25, (k / 40) * TAU)), [domeHole(dome)], H.roof_top, H.roof_top + 0.35, 0.03));
  }
  // inner column ring (Chi-Chi's "K" columns around the dome)
  for (let k = 0; k < 12; k++) {
    const p = at(D.inner_columns_radius, (k / 12) * TAU + Math.PI / 12);
    add('upper', 'columns', G.cyl(p, 0.24, H.upper_floor, H.upper_ceiling, 16));
    colliders.push({ a: [p[0] - 0.24, p[1]], b: [p[0] + 0.24, p[1]], z0: H.upper_floor, z1: H.upper_ceiling, tag: 'col' });
    colliders.push({ a: [p[0], p[1] - 0.24], b: [p[0], p[1] + 0.24], z0: H.upper_floor, z1: H.upper_ceiling, tag: 'col' });
  }

  // 24 bays: pointed-arch windows toward courtyard / pods / beach, blind arches + lattice elsewhere,
  // one door bay where the corridor arrives
  const corrBearing = Math.atan2(Q(uWall, 0)[1] - C[1], Q(uWall, 0)[0] - C[0]);
  const stairFace = [P(sOf(oN), hw + wt), P(sEnd + wt, hw + wt)];          // the stair hall's drum-side outer face
  const bays = [];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU, am = (a0 + a1) / 2;
    const A = at(R - 0.15, a0), B = at(R - 0.15, a1);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const mid = at(R + 1.5, am);
    const isDoor = Math.abs(Math.atan2(Math.sin(am - corrBearing), Math.cos(am - corrBearing))) < Math.PI / N;
    // windows walled up (layout.js), and any bay that would only look at the stair hall's wall a few steps away
    const closed = (F.ff_layout?.closed || []).includes(k) || G.segDist(at(R, am), stairFace[0], stairFace[1])[0] < 1.0;
    const facesOpen = !closed && (G.ringDist(mid, Zones.outdoor) < 3 || G.ringDist(mid, Zones.smoking) < 2.5 || G.inside(mid, Zones.smoking) || mid[1] > C[1] + R * 0.55);
    const win = { u0: len / 2 - 0.85, u1: len / 2 + 0.85, v0: H.upper_floor + 0.75, v1: H.upper_floor + 3.15, arch: 'pointed' };
    // the door is cut where the throat from the stair meets this wall (not at the bay's centre), as wide as the throat
    const pd = Q(uWall, 0), uDoor = ((pd[0] - B[0]) * (A[0] - B[0]) + (pd[1] - B[1]) * (A[1] - B[1])) / len;
    const doorCut = { u0: uDoor - cw / 2, u1: uDoor + cw / 2, v0: H.upper_floor - 0.03, v1: H.upper_floor + 2.7, arch: 'round' };
    const holes = isDoor ? [doorCut] : facesOpen ? [win] : [];
    bays.push({ k, a0, a1, am, len, open: facesOpen && !isDoor, door: isDoor, holes });
    add('upper', 'facade', G.panel(B, A, H.upper_slab_soffit, H.parapet, 0.3, holes));
    if (facesOpen && !isDoor) {
      add('upper', 'fixed:glass_dark_trans', G.panelShape(B, A, G.openingShape(win), 0.02));
      // projecting stone sill under each window
      const t = [(A[0] - B[0]) / len, (A[1] - B[1]) / len], o = [Math.cos(am), Math.sin(am)];
      const sa = [B[0] + t[0] * (len / 2 - 0.98) + o[0] * 0.2, B[1] + t[1] * (len / 2 - 0.98) + o[1] * 0.2];
      const sb = [B[0] + t[0] * (len / 2 + 0.98) + o[0] * 0.2, B[1] + t[1] * (len / 2 + 0.98) + o[1] * 0.2];
      add('upper', 'fixed:limestone_fixed', G.beam(sa, sb, 0.16, win.v0 - 0.1, win.v0));
    } else if (!isDoor) {
      // blind arch relief (archivolt) proud of the outer face
      const outer = { u0: len / 2 - 0.95, u1: len / 2 + 0.95, v0: H.upper_floor + 0.6, v1: H.upper_floor + 3.35, arch: 'pointed' };
      const inner = { u0: len / 2 - 0.8, u1: len / 2 + 0.8, v0: H.upper_floor + 0.6, v1: H.upper_floor + 3.15, arch: 'pointed' };
      const sh = G.openingShape(outer); sh.holes.push(G.openingPath(inner));
      add('upper', 'facade', G.panelShape(B, A, sh, 0.175, 0.05));
      if (k % 3 === 0) lattice(B, A, len, H.upper_floor + 0.7, H.upper_floor + 3.0);
    }
    // merlons on the parapet (pointed, as on the existing building)
    for (const u of [len * 0.25, len * 0.75]) {
      const m = new THREE.Shape();
      m.moveTo(u - 0.28, H.parapet); m.lineTo(u + 0.28, H.parapet); m.lineTo(u + 0.28, H.parapet + 0.22);
      m.quadraticCurveTo(u + 0.2, H.parapet + 0.42, u, H.parapet + 0.55); m.quadraticCurveTo(u - 0.2, H.parapet + 0.42, u - 0.28, H.parapet + 0.22); m.lineTo(u - 0.28, H.parapet);
      add('upper', 'facade', G.panelShape(B, A, m, 0, 0.24));
    }
    // perimeter columns inside each vertex
    const pc = at(R - 0.55, a0);
    add('upper', 'columns', G.prism(squareAt(pc, 0.42, a0), [], H.upper_floor, H.upper_ceiling, 0.03));
    // colliders: upper level only
    if (isDoor) {
      const t = [(B[0] - A[0]) / len, (B[1] - A[1]) / len]; const { u0, u1 } = doorCut;
      colliders.push({ a: A, b: [A[0] + t[0] * (len - u1), A[1] + t[1] * (len - u1)], z0: H.upper_slab_soffit, z1: H.parapet, tag: 'drum' });
      colliders.push({ a: [A[0] + t[0] * (len - u0), A[1] + t[1] * (len - u0)], b: B, z0: H.upper_slab_soffit, z1: H.parapet, tag: 'drum' });
    } else colliders.push({ a: A, b: B, z0: H.upper_slab_soffit, z1: H.parapet, tag: 'drum' });
  }
  function lattice(B, A, len, v0, v1) {
    for (let u = len / 2 - 0.7; u <= len / 2 + 0.7; u += 0.12) {
      const sh = new THREE.Shape(); sh.moveTo(u - 0.025, v0); sh.lineTo(u + 0.025, v0); sh.lineTo(u + 0.025, v1); sh.lineTo(u - 0.025, v1); sh.lineTo(u - 0.025, v0);
      add('upper', 'fixed:white_lacquer', G.panelShape(B, A, sh, 0.33, 0.04));
    }
  }

  // ------------------------------------------------------------------ courtyard arch gate (video 1, 0:00)
  {
    const g = F.arch_gate; const ga = (g.dir_deg * Math.PI) / 180; const t = [Math.cos(ga), Math.sin(ga)];
    const half = g.opening / 2 + 0.55;
    const a = [g.center[0] - t[0] * half, g.center[1] - t[1] * half], b = [g.center[0] + t[0] * half, g.center[1] + t[1] * half];
    add('structure', 'facade', G.panel(a, b, 0, g.height, 0.42, [{ u0: 0.55, u1: 0.55 + g.opening, v0: 0, v1: g.height - 0.35, arch: 'round' }]));
    add('structure', 'facade', G.panel([a[0] - t[0] * 1.1, a[1] - t[1] * 1.1], a, 0, 1.0, 0.42));
    add('structure', 'facade', G.panel(b, [b[0] + t[0] * 1.1, b[1] + t[1] * 1.1], 0, 1.4, 0.42));
    colliders.push({ a: [a[0] - t[0] * 1.1, a[1] - t[1] * 1.1], b: [a[0] + t[0] * 0.5, a[1] + t[1] * 0.5], z0: 0, z1: 3, tag: 'gate' });
    colliders.push({ a: [b[0] - t[0] * 0.5, b[1] - t[1] * 0.5], b: [b[0] + t[0] * 1.1, b[1] + t[1] * 1.1], z0: 0, z1: 3, tag: 'gate' });
  }

  return {
    surfaces,
    stair: { d, n, climb: d, sTop, sEnd, sCorr, corrEnd: Q(corrLen, 0), lobby: P(-0.3, 0), door: PD((doorS[0] + doorS[1]) / 2, -hw - wt - 1.0), top: P(sCorr, 0),
      // geometry the themes dress: treads, the plaster walls' inner faces (skins), the handrail line, the street door
      // (PD frame: dD along its wall, nD inward), the top landing's balustrade line
      runs, hw, wt, lobbyH, riser, doorS, roof, cw, corrLen, P, Q, PD, dD, nD, balustrade: [balA, balB],
      skins: [
        { a: P(-s0, -hw + 0.012), b: P(sEnd, -hw + 0.012), holes: leftHoles.map((h) => ({ ...h, u0: h.s0 + s0, u1: h.s1 + s0 })) },
        { a: PD(tW, -hw + 0.012), b: PD(tE, -hw + 0.012), holes: [{ ...doorHole, u0: doorS[0] - tW, u1: doorS[1] - tW, v0: lobbyH - 0.02 }] },
        { a: PD(tE - 0.012, -hw), b: PD(tE - 0.012, qN), holes: [] },
      ] },
    bays,
  };
}

function squareAt(p, w, a) {
  const c = Math.cos(a), s = Math.sin(a), h = w / 2;
  return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [p[0] + x * c - y * s, p[1] + x * s + y * c]);
}
