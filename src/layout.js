// Site layout edits from the client walk-through notes of 26 Oct 2026, applied to the CAD data (data/venue.json)
// before anything is built, so every theme (Free, Bali, Riviera), the walk colliders, the guided walk and the
// people all follow them. venue.json itself is left untouched: the pre-edit twin is kept in
// ../twin-backups/2026-10-26_before-layout-update (runs on its own with "Start Backup Twin.command").
//
// Ground floor
//   * Entrance (video 1; client notes 27 Oct): from the arch gate straight across the courtyard to the walkway along
//     the building's glazed west face — roofed, on slim posts, open to the courtyard (no glass wall) — and in through
//     the one entrance at its end: a white arched doorway into the pods' end bay, then a few steps right through an
//     open doorway into the hall. Both are always open (the folding-doors toggle doesn't close them). The old opening
//     in the façade is closed as a wall — the stair hall now stands in front of it.
//   * Brewery in a curved glass room: the redundant inner curved wall just inside the old entrance is removed and the
//     curved strip it left becomes the brewhouse, behind a glass screen on the old wall's line.
//   * Seating: the CAD's "loveseats" in the booths along the glass are tables (a banquette + table + chairs, the
//     chairs already drawn round them) — read as sofas they stacked two sofas back to back. Two 4-tops and a 2-top
//     added where the hall floor is genuinely free (clear of walls, furniture, the stage, the bar and the route).
// First floor
//   * Stair: the arched street door stays where it was. Inside you face the lobby's stone wall, turn LEFT and climb
//     (video 2: three straight flights, the stone wall on your right, the big glazed arch with the iron balustrade on
//     your left at the top, the door into the first floor on your right). The flights run north-west along the
//     courtyard side of the building; the hall's drum-side face just clears the first floor's outer wall at the top
//     landing, which opens straight through it (climb_deg is the angle that does that from the lobby's corner).
//   * Windows: the four window bays to the left of the bar become wall; the old door bay is walled up too, and so is
//     any bay that would only look at the stair hall's wall.
//   * The DJ booth and the bar stay where they were (bays 22 and 23 / 0 / 1), whatever the door and windows do.

export const LAYOUT = {
  version: '2026-10-26',
  stair: {                             // left turn after the door (video 2); the door itself is the CAD's
    lobby_box: [-2.3, 0.7, 0.9],       //   lobby along the door wall (t from, t to) and its depth (q of the stone wall)
    climb_deg: 112.8,                  //   the flights' heading: drum-side face 0.2 m clear of the drum at the top
    top_landing: 1.6, corridor_width: 1.4,
  },
  ffClosedBays: [2, 3, 4, 5, 18],      // window → wall (2–5, left of the bar) + the old door bay (18)
  ffDj: 22, ffBar: [23, 0, 1],
  passageRoofZ: 3.0,
};

const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
function rectPoly([x, y], w, l, a) {          // the CAD item footprint: l along the angle, w across it
  const u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => [x + u[0] * (l / 2) * i + v[0] * (w / 2) * j, y + u[1] * (l / 2) * i + v[1] * (w / 2) * j]);
}
function item(type, at, w, l, angleDeg, extra = {}) {
  return { type, at, w, l, angle: angleDeg, zone: 'indoor', round: type === 'table_round', poly: rectPoly(at, w, l, rad(angleDeg)), ...extra };
}
// a table with chairs round it: n = 4 (one each side) or 2 (facing across the short axis)
function diningSet(c, axisDeg, n, round = false) {
  const a = rad(axisDeg), u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], out = [];
  out.push(round ? item('table_round', c, 0.72, 0.72, axisDeg) : item('table', c, 0.8, 0.8, axisDeg));
  const offs = n === 4 ? [u, v, [-u[0], -u[1]], [-v[0], -v[1]]] : [v, [-v[0], -v[1]]];
  for (const o of offs) {
    const p = [c[0] + o[0] * 0.72, c[1] + o[1] * 0.72];
    out.push(item('chair', p, 0.7, 0.78, deg(Math.atan2(-o[1], -o[0])) - 90, { face: deg(Math.atan2(-o[1], -o[0])) }));
  }
  return out;
}

export function applyLayout(V) {
  if (V._layout) return V; V._layout = LAYOUT.version;
  const F = V.features;

  // ---- seating: booth "loveseats" are the tables the chairs are drawn round
  const chairs = V.furniture.filter((f) => f.type === 'chair' && f.zone === 'indoor');
  for (const f of V.furniture) {
    if (f.zone !== 'indoor' || f.type !== 'loveseat') continue;
    const near = chairs.filter((c) => Math.hypot(c.at[0] - f.at[0], c.at[1] - f.at[1]) < 1.3).length;
    if (near >= 2) { f.type = 'table'; f.fromLoveseat = true; }
  }
  // ---- more dining where the hall floor is free (west end by the glazed façade; a 2-top by the planter arc)
  V.furniture.push(...diningSet([0.25, -1.85], 81, 4), ...diningSet([2.15, -0.15], 81, 4), ...diningSet([8.2, 3.8], 34, 2, true));

  // ---- the old opening in the courtyard façade becomes wall (between wall 42 and the façade curve)
  V.solids.push({ kind: 'wall', h: 3.4, holes: [], outer: [[-0.24, -5.52], [0.10, -6.52], [0.33, -6.62], [-0.06, -5.46]], layout: 'closed entrance' });

  // ---- the redundant inner curved wall (a spur of CAD solid 4: vertices 25–41) is removed
  const s4 = V.solids[4];
  if (s4 && s4.outer.length === 49 && Math.abs(s4.outer[32][0] - 1.73) < 0.05) s4.outer = [...s4.outer.slice(0, 25), ...s4.outer.slice(42)];
  // the curved strip it left becomes the brewhouse, behind a glass screen on the old wall's centreline
  const screen = [[0.36, -6.66], [1.8, -6.165], [2.249, -7.002], [2.872, -7.929], [3.579, -8.786], [4.364, -9.569], [5.221, -10.271], [6.146, -10.889], [7.13, -11.415], [8.173, -11.848]];
  V.glazing.push({ kind: 'glass', path: screen, zone: 'indoor', h: 3.4, layout: 'brewery screen' });
  F.brewery = { screen: screen.slice(1), facade: [[0.54, -7.18], [2.33, -9.69], [2.6, -9.88], [4.93, -12.0], [7.84, -12.91]] };

  // ---- the roofed walkway along the building's glazed west face, and the arched entrance at its end
  const doorEnd = [-3.45, 4.12];                                          // the walkway roof's outer corner at the pods' glazing
  const g5 = V.glazing[5], g6 = V.glazing[6];
  if (g5 && g6 && g5.kind === 'folding' && Math.abs(g6.path[0][0] + 2.07) < 0.05) {
    g5.path = [...g5.path, ...g6.path.slice(1, 5), doorEnd];               // the entrance run, ~2.25 m
    g6.path = [doorEnd, ...g6.path.slice(5)];
    g5.kind = 'arch'; g5.layout = 'entrance arch';
  }
  const z = LAYOUT.passageRoofZ;
  F.passage = {
    z, t: 0.18,
    roof: [[-1.95, -4.62], [-1.98, -3.7], [-2.16, -1.32], [-2.16, -0.69], [-1.92, 0.67], [-1.62, 2.4], [-1.57, 2.53], [-2.05, 3.05], [-2.57, 3.52], [-3.13, 3.92], doorEnd, [-3.95, -4.75]],
    posts: [[-3.81, -4.4], [-3.65, -1.56], [-3.49, 1.28]],               // slim steel posts under the roof's open edge
  };
  // entrance facts for the theme dressing (threshold, arch surround, planting) — under the walkway roof
  const d0 = g5.path[0], dx = doorEnd[0] - d0[0], dy = doorEnd[1] - d0[1], L = Math.hypot(dx, dy), t0 = [dx / L, dy / L];
  F.entrance = { p: [(d0[0] + doorEnd[0]) / 2, (d0[1] + doorEnd[1]) / 2], out: [-t0[1], t0[0]], width: 1.6, top: z - 0.02, inPassage: true, arch: { crown: 2.7, wall: 0.3 } };   // out: onto the walkway (south-west)
  g5.opening = { center: F.entrance.p, width: F.entrance.width, crown: F.entrance.arch.crown, wall: F.entrance.arch.wall };
  // ...and a few steps to the right, through to the hall: 1.6 m of the hall's glazing just inside is an open doorway
  const g0 = V.glazing[0];
  if (g0 && g0.kind === 'folding' && g0.path.length > 20 && Math.hypot(g0.path[11][0] + 1.4, g0.path[11][1] - 3.02) < 0.05) {
    V.glazing.push({ ...g0, kind: 'opening', path: g0.path.slice(11, 16), layout: 'doorway to the hall' }, { ...g0, path: g0.path.slice(15), layout: 'hall glazing, pods side', stacks: 'noStart' });
    g0.path = g0.path.slice(0, 12); g0.stacks = 'noEnd';                  // no folded door stack standing in the doorway
    g0.guide = 'closed';                                                    // the guided walk comes in by the arch, not through these
  }

  // ---- pass doors: where the guided walk crosses a folding-door line (pods, platform, deck), one leaf of it stands
  // slid open when the folding doors are shown closed, so the walk is walkable either way (tour.js warns if a new
  // route crosses closed glass anywhere else)
  F.pass_doors = [[-18.39, -5.26], [-15.69, -3.73], [-15.25, -0.65], [-16.03, 6.06], [7.31, 15.67], [7.2, 11.47]];

  // ---- first floor: stair turns left, windows to wall, DJ / bar pinned
  Object.assign(F.stair, LAYOUT.stair, { turn: 'left' });
  F.ff_layout = { closed: LAYOUT.ffClosedBays, dj: LAYOUT.ffDj, bar: LAYOUT.ffBar };
  return V;
}
