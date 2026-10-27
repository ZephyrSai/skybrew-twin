// Parametric props for the Skybrew themes, modelled at true size from the render pack.
// Convention (same as furniture.js): metres, base at y = 0, front = +X, width along Z.
// Each builder returns parts: [{ m: materialKey | [key, rep], g: BufferGeometry }]; a part list is
// instanced or merged by the caller. Materials come from themekit.js (UVs: 0..1 on primitives -> rep).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
// ------------------------------------------------------------------ primitives
function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
export function merge(gs) { gs = gs.filter(Boolean); return gs.length ? mergeGeometries(gs.map(clean), false) : null; }
export const part = (m, ...gs) => ({ m, g: merge(gs.flat()) });
const box = (x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; };
const rbox = (w, h, d, r, x, y, z) => { const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)); g.translate(x, y, z); return g; };
const cyl = (r, y0, y1, seg = 16, x = 0, z = 0, rTop = r, open = false) => { const g = new THREE.CylinderGeometry(rTop, r, y1 - y0, seg, 1, open); g.translate(x, (y0 + y1) / 2, z); return g; };
const sphere = (r, x, y, z, seg = 16) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)); g.translate(x, y, z); return g; };
const torus = (R, r, y, seg = 24, x = 0, z = 0) => { const g = new THREE.TorusGeometry(R, r, 6, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
const tube = (pts, r, seg = 24, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, 6, closed);
const lathe = (prof, seg = 24, phi0 = 0, phiL = TAU) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiL);
const legs = (pts, y0, y1, r, rTop = r) => pts.map(([x, z]) => cyl(r, y0, y1, 8, x, z, rTop));
// partial open cylinder whose top edge follows h(theta) (theta measured from +X, CCW seen from above)
function shell(rBot, rTop, y0, hOf, open, seg = 28) {
  // the opening (no shell) is centred on +X with half-width `open` radians
  const g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, 3, true, Math.PI / 2 + open, TAU - 2 * open);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), t = p.getY(i) + 0.5, th = Math.atan2(-z, x);
    p.setY(i, y0 + t * hOf(th));
  }
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ seating
// Bali: woven rattan tub chair, teak legs, indigo ikat seat cushion (GF03/GF09 Bali renders)
export function chairBali() {
  const back = (th) => 0.3 + 0.13 * Math.max(0, -Math.cos(th));            // high at the back (-X), lower toward the arms
  return [
    part(['rattan', [5, 1.5]], shell(0.27, 0.3, 0.42, back, 0.95)),
    part(['rattan', [3, 3]], cyl(0.27, 0.4, 0.45, 20)),
    part('teak_solid', legs([[0.17, 0.17], [0.17, -0.17], [-0.17, 0.17], [-0.17, -0.17]], 0, 0.42, 0.018, 0.016)),
    part('ikat', rbox(0.42, 0.07, 0.42, 0.03, 0.02, 0.48, 0)),
  ];
}
// Riviera: bentwood bistro chair, cane back and seat, navy/white striped cushion (GF03/GF09 Riviera)
export function chairRiviera() {
  const hoop = tube([[-0.19, 0, -0.18], [-0.23, 0.5, -0.19], [-0.25, 0.86, -0.15], [-0.255, 0.9, 0], [-0.25, 0.86, 0.15], [-0.23, 0.5, 0.19], [-0.19, 0, 0.18]], 0.014, 40);
  const back = new THREE.PlaneGeometry(0.34, 0.27); back.rotateY(-Math.PI / 2); back.translate(-0.235, 0.7, 0);
  return [
    part('honey_wood', hoop, legs([[0.19, 0.18], [0.19, -0.18]], 0, 0.45, 0.015, 0.012), torus(0.2, 0.012, 0.45, 28), torus(0.17, 0.008, 0.16, 24)),
    part(['cane', [3, 2.4]], back, (() => { const g = new THREE.CircleGeometry(0.2, 24); g.rotateX(-Math.PI / 2); g.translate(0, 0.452, 0); return g; })()),
    part(['stripe_cushion', [1, 1]], rbox(0.38, 0.05, 0.38, 0.02, 0.01, 0.48, 0)),
  ];
}
// low rattan lounge chair (pods / lounges); cushion material per theme
export function loungeChair(cushion, pillow) {
  const back = (th) => 0.3 + 0.16 * Math.max(0, -Math.cos(th)) ** 0.7;
  return [
    part(['rattan', [7, 1.6]], shell(0.39, 0.42, 0.3, back, 1.05, 32)),
    part(['rattan', [4, 4]], cyl(0.39, 0.22, 0.32, 24)),
    part('teak_solid', legs([[0.24, 0.24], [0.24, -0.24], [-0.24, 0.24], [-0.24, -0.24]], 0, 0.22, 0.02)),
    part([cushion, [1, 1]], rbox(0.6, 0.12, 0.62, 0.05, 0.03, 0.38, 0), rbox(0.14, 0.38, 0.58, 0.06, -0.24, 0.58, 0)),
    part([pillow, [1, 1]], (() => { const g = rbox(0.12, 0.34, 0.34, 0.06, 0, 0, 0); g.rotateZ(0.25); g.translate(-0.12, 0.62, 0.08); return g; })()),
  ];
}
// sofas: built for a given length L (along Z)
export function daybedBali(L) {
  const n = Math.max(1, Math.round(L / 0.75)), w = (L - 0.1) / n;
  const backs = []; for (let i = 0; i < n; i++) backs.push(rbox(0.2, 0.44, w - 0.02, 0.07, -0.32, 0.52, -L / 2 + 0.05 + w * (i + 0.5)));
  return [
    part('teak_solid', box(-0.43, 0.43, 0.04, 0.26, -L / 2, L / 2), legs([[0.36, L / 2 - 0.08], [0.36, -L / 2 + 0.08], [-0.36, L / 2 - 0.08], [-0.36, -L / 2 + 0.08]], 0, 0.05, 0.035)),
    part(['linen', [1, 1]], rbox(0.84, 0.14, L - 0.06, 0.05, 0, 0.33, 0), backs),
    part(['ikat', [1, 1]], (() => { const g = rbox(0.13, 0.4, 0.42, 0.06, 0, 0, 0); g.rotateZ(0.2); g.translate(-0.18, 0.58, L / 2 - 0.35); return g; })(),
      (() => { const g = rbox(0.13, 0.4, 0.42, 0.06, 0, 0, 0); g.rotateZ(0.2); g.translate(-0.18, 0.58, -L / 2 + 0.35); return g; })()),
  ];
}
// Riviera: olive velvet, channel-tufted back, brass plinth, striped pillows (GF08/GF10 Riviera)
export function sofaRiviera(L) {
  const ch = Math.max(3, Math.round(L / 0.22)), cw = (L - 0.2) / ch, back = [];
  for (let i = 0; i < ch; i++) back.push(rbox(0.2, 0.48, cw - 0.012, 0.08, -0.33, 0.6, -L / 2 + 0.1 + cw * (i + 0.5)));
  return [
    part('brass', box(-0.42, 0.42, 0, 0.06, -L / 2 + 0.02, L / 2 - 0.02)),
    part(['olive_velvet', [1, 1]], rbox(0.86, 0.36, L, 0.06, 0, 0.24, 0), back, rbox(0.82, 0.12, L - 0.1, 0.05, 0.03, 0.44, 0)),
    part(['stripe_cushion', [1, 1]], (() => { const g = rbox(0.12, 0.4, 0.4, 0.06, 0, 0, 0); g.rotateZ(0.2); g.translate(-0.16, 0.66, L / 2 - 0.4); return g; })(),
      (() => { const g = rbox(0.12, 0.4, 0.4, 0.06, 0, 0, 0); g.rotateZ(0.2); g.translate(-0.16, 0.66, -L / 2 + 0.4); return g; })()),
  ];
}
// Riviera courtyard: cane lounge sofa with striped cushions (GF01 Riviera)
export function caneSofa(L) {
  const g = [box(-0.4, 0.4, 0.18, 0.3, -L / 2, L / 2), box(-0.4, -0.32, 0.3, 0.74, -L / 2, L / 2), box(-0.4, 0.4, 0.3, 0.6, -L / 2, -L / 2 + 0.07), box(-0.4, 0.4, 0.3, 0.6, L / 2 - 0.07, L / 2)];
  return [
    part(['rattan', [6, 2]], g),
    part('honey_wood', legs([[0.35, L / 2 - 0.05], [0.35, -L / 2 + 0.05], [-0.35, L / 2 - 0.05], [-0.35, -L / 2 + 0.05]], 0, 0.18, 0.025)),
    part(['stripe_cushion', [1, 1]], rbox(0.7, 0.13, L - 0.16, 0.05, 0.04, 0.37, 0), rbox(0.14, 0.4, L - 0.16, 0.06, -0.25, 0.58, 0)),
  ];
}
export function barStoolBali() {
  const back = (th) => 0.12 + 0.16 * Math.max(0, -Math.cos(th));
  return [
    part(['rattan', [4, 1]], shell(0.21, 0.22, 0.74, back, 1.2, 24), cyl(0.21, 0.7, 0.76, 20)),
    part('teak_solid', legs([[0.14, 0.14], [0.14, -0.14], [-0.14, 0.14], [-0.14, -0.14]], 0, 0.72, 0.016), torus(0.17, 0.012, 0.28, 20)),
    part('ikat', rbox(0.34, 0.05, 0.34, 0.02, 0, 0.785, 0)),
  ];
}
export function barStoolRiviera() {
  const back = new THREE.PlaneGeometry(0.34, 0.22); back.rotateY(-Math.PI / 2); back.translate(-0.17, 0.98, 0);
  return [
    part('brass', legs([[0.15, 0.15], [0.15, -0.15], [-0.15, 0.15], [-0.15, -0.15]], 0, 0.76, 0.012), torus(0.19, 0.01, 0.3, 24)),
    part('honey_wood', tube([[-0.16, 0.76, -0.18], [-0.18, 0.95, -0.18], [-0.19, 1.1, -0.12], [-0.19, 1.12, 0], [-0.19, 1.1, 0.12], [-0.18, 0.95, 0.18], [-0.16, 0.76, 0.18]], 0.013, 30), box(-0.2, 0.2, 0.76, 0.79, -0.2, 0.2)),
    part(['cane', [3, 2]], back),
    part('linen_white', rbox(0.38, 0.06, 0.38, 0.025, 0.01, 0.82, 0)),
  ];
}
export function poufBali() { return [part(['rattan', [4, 1]], cyl(0.26, 0, 0.42, 24, 0, 0, 0.24)), part('linen', rbox(0.46, 0.06, 0.46, 0.03, 0, 0.44, 0))]; }
export function poufRiviera() { return [part(['terracotta_velvet', [1, 1]], cyl(0.25, 0, 0.42, 28, 0, 0, 0.25), (() => { const g = new THREE.SphereGeometry(0.25, 24, 8, 0, TAU, 0, Math.PI / 2); g.scale(1, 0.12, 1); g.translate(0, 0.42, 0); return g; })())]; }
export function sunbed(frame, cushion) {
  const back = box(-0.06, 0.32, -0.03, 0.03, -0.32, 0.32); back.rotateZ(-0.6); back.translate(-0.78, 0.48, 0);
  return [
    part(frame, legs([[0.9, 0.3], [0.9, -0.3], [-0.9, 0.3], [-0.9, -0.3]], 0, 0.25, 0.03), box(-0.98, 0.98, 0.22, 0.3, -0.34, 0.34)),
    part([cushion, [1, 1]], rbox(1.36, 0.08, 0.64, 0.03, 0.26, 0.34, 0), back),
  ];
}

// ------------------------------------------------------------------ tables (unit footprint: X, Z in [-0.5, 0.5] -> stretched)
export function tableTeakRect() {
  return [part('teak', rbox(1, 0.06, 1, 0.01, 0, 0.73, 0)), part('teak_solid', legs([[0.4, 0.4], [0.4, -0.4], [-0.4, 0.4], [-0.4, -0.4]], 0, 0.7, 0.04))];
}
export function tableWalnutRect() {
  return [part('walnut', rbox(1, 0.04, 1, 0.008, 0, 0.74, 0)), part('walnut', legs([[0.42, 0.42], [0.42, -0.42], [-0.42, 0.42], [-0.42, -0.42]], 0.05, 0.72, 0.022, 0.03)),
    part('brass', legs([[0.42, 0.42], [0.42, -0.42], [-0.42, 0.42], [-0.42, -0.42]], 0, 0.05, 0.022))];
}
// Riviera dining table (renders GF08/GF09): white marble top, slim brass legs — stretched to the CAD footprint
export function tableMarbleRect() {
  const lg = [[0.42, 0.42], [0.42, -0.42], [-0.42, 0.42], [-0.42, -0.42]];
  return [part('marble_white', rbox(1, 0.035, 1, 0.006, 0, 0.745, 0)), part('brass', legs(lg, 0, 0.73, 0.018, 0.022))];
}
export function tableTeakRound(h = 0.75) {
  const top = new THREE.CylinderGeometry(0.5, 0.49, 0.06, 40); const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r > 0.3) { const a = Math.atan2(z, x), k = 1 + 0.025 * Math.sin(a * 5) + 0.015 * Math.sin(a * 11 + 1); p.setX(i, x * k); p.setZ(i, z * k); } }
  top.computeVertexNormals(); top.translate(0, h - 0.03, 0);
  return [part('teak', top), part('teak_solid', cyl(0.11, 0.06, h - 0.06, 16), cyl(0.3, 0, 0.06, 24, 0, 0, 0.26))];
}
export function tableTulip(h = 0.74, r = 0.5) {
  const base = lathe([[0, 0], [0.28, 0], [0.28, 0.015], [0.2, 0.06], [0.07, 0.2], [0.05, h - 0.12], [0.1, h - 0.04], [0.0, h - 0.04]], 32);
  return [part('marble_white', cyl(r, h - 0.03, h, 48)), part('white_pot', base)];
}
export function coffeeTeak() { return [part('teak', cyl(0.5, 0.34, 0.4, 36)), part('teak_solid', cyl(0.3, 0, 0.34, 24, 0, 0, 0.32))]; }
export function sideTeak() { return [part(['teak_boards', [2, 1]], cyl(0.45, 0, 0.5, 24)), part('teak', cyl(0.47, 0.5, 0.53, 24))]; }
export function sideBrass() { return [part('brass_polished', cyl(0.48, 0.5, 0.52, 32), legs([[0, 0.38], [0.33, -0.19], [-0.33, -0.19]], 0, 0.5, 0.02), torus(0.48, 0.012, 0.52, 32))]; }
// standing tables for the first-floor DJ pub
export function highTableBali() {
  const top = tableTeakRound(1.08)[0].g; top.scale(0.65, 1, 0.65);
  return [part('teak', top), part('black_steel', cyl(0.045, 0.04, 1.05, 12), cyl(0.24, 0, 0.04, 24))];
}
export function highTableRiviera() {
  return [part('terrazzo_dark', cyl(0.32, 1.06, 1.1, 36)), part('brass', cyl(0.04, 0.04, 1.06, 14), cyl(0.24, 0, 0.04, 28), torus(0.32, 0.012, 1.08, 36))];
}

// ------------------------------------------------------------------ lighting
// pendants hang from y = 0 (ceiling) downward to -drop
export function pendant(kind, drop = 0.9) {
  const cord = cyl(0.005, -drop, 0, 4);
  const at = (g, y) => { g.translate(0, y, 0); return g; };
  switch (kind) {
    case 'woven_dome': return [part('black_steel', cord), part(['rattan_lamp', [6, 2]], at(lathe([[0.04, 0.32], [0.18, 0.3], [0.34, 0.18], [0.42, 0.02], [0.43, 0]], 28), -drop - 0.32)), part('glow_warm', sphere(0.06, 0, -drop - 0.2, 0, 10))];
    case 'woven_bell': return [part('black_steel', cord), part(['rattan_lamp', [5, 2]], at(lathe([[0.03, 0.5], [0.1, 0.46], [0.16, 0.34], [0.22, 0.14], [0.29, 0]], 24), -drop - 0.5)), part('glow_warm', sphere(0.05, 0, -drop - 0.32, 0, 10))];
    case 'woven_lantern': return [part('black_steel', cord), part(['rattan_lamp', [5, 2]], at(lathe([[0.04, 0.6], [0.16, 0.55], [0.23, 0.3], [0.16, 0.05], [0.04, 0]], 24), -drop - 0.6)), part('glow_warm', sphere(0.06, 0, -drop - 0.3, 0, 10))];
    case 'copper_dome': return [part('black_steel', cord), part('copper_hammered', at(lathe([[0.02, 0.2], [0.08, 0.19], [0.18, 0.08], [0.24, 0]], 24), -drop - 0.2)), part('glow_warm', (() => { const g = new THREE.CircleGeometry(0.16, 20); g.rotateX(Math.PI / 2); g.translate(0, -drop - 0.19, 0); return g; })())];
    case 'brass_dome': return [part('black_steel', cord), part('brass', at(lathe([[0.02, 0.22], [0.09, 0.2], [0.2, 0.08], [0.26, 0]], 24), -drop - 0.22)), part('glow_warm', (() => { const g = new THREE.CircleGeometry(0.2, 20); g.rotateX(Math.PI / 2); g.translate(0, -drop - 0.21, 0); return g; })())];
    case 'globe_cluster': {
      const stems = [], globes = [];
      for (const [x, y, z] of [[0.18, -0.12, 0], [-0.1, -0.22, 0.15], [-0.08, -0.3, -0.16]]) { stems.push(tube([[0, -drop, 0], [x * 0.6, -drop + y * 0.4, z * 0.6], [x, -drop + y, z]], 0.008, 8)); globes.push(sphere(0.15, x, -drop + y - 0.14, z, 20)); }
      return [part('brass', cord, cyl(0.06, -0.03, 0, 16), stems), part('opal', globes)];
    }
    default: throw new Error(kind);
  }
}
export function floorLanternBali() {             // tall woven bamboo lantern, teak base (FF01 / GF01 Bali)
  return [part('teak_solid', cyl(0.2, 0, 0.08, 20)), part(['rattan_lamp', [6, 3]], lathe([[0.12, 0.08], [0.2, 0.4], [0.21, 0.9], [0.16, 1.25], [0.06, 1.32]], 28)), part('glow_warm', cyl(0.05, 0.3, 1.0, 10))];
}
export function sconceGlobes(n = 2) {             // brass arm(s) with opal globes (FF01 / stage, Riviera)
  const parts = [box(-0.03, 0, -0.06, 0.06, -0.06, 0.06)], globes = [];
  for (let i = 0; i < n; i++) { const y = n > 1 ? (i ? 0.22 : -0.08) : 0.05; parts.push(tube([[0, y - 0.05, 0], [0.12, y - 0.02, 0], [0.16, y + 0.05, 0]], 0.012, 8)); globes.push(sphere(0.1, 0.16, y + 0.15, 0, 18)); }
  return [part('brass', parts), part('opal', globes)];
}
export function hurricane() { return [part('glass', cyl(0.05, 0, 0.16, 14, 0, 0, 0.055, true)), part('candle', cyl(0.025, 0.005, 0.07, 10))]; }

// ------------------------------------------------------------------ planting (cards from themekit leaf textures)
function cards(n, seed, place) {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gs = [];
  for (let i = 0; i < n; i++) { const g = new THREE.PlaneGeometry(1, 1, 1, 3); place(g, i, r); gs.push(g); }
  return gs;
}
// leaf on a stem: unit plane (base at the bottom) scaled, curled, leaning by `tilt` (0 = upright) toward the
// plan direction a (x = cos a, z = sin a), its base pushed `out` metres that way
function leafAt(g, size, yBase, tilt, a, curl = 0.25, out = 0) {
  g.translate(0, 0.5, 0); g.scale(size, size, 1);
  const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, curl * y * y / size); }
  g.rotateX(-tilt); g.rotateY(-a - Math.PI / 2); g.translate(out * Math.cos(a), yBase, out * Math.sin(a)); g.computeVertexNormals();
  return g;
}
const potJar = (h, r) => lathe([[0, 0], [r * 0.62, 0], [r * 0.95, h * 0.25], [r, h * 0.55], [r * 0.82, h * 0.88], [r * 0.7, h * 0.95], [r * 0.78, h], [r * 0.7, h], [0, h * 0.94]], 28);
const potBowl = (h, r) => lathe([[0, 0], [r * 0.6, 0], [r * 0.95, h * 0.5], [r, h], [r * 0.9, h], [0, h * 0.92]], 28);
export function oliveTree(h = 2.3, pot = 'terracotta_pot') {
  const ph = 0.75, trunk = [];
  trunk.push(tube([[0, ph - 0.1, 0], [0.06, ph + 0.4, 0.03], [-0.04, ph + 0.8, 0.06], [0.03, h * 0.62, 0]], 0.055, 12));
  trunk.push(tube([[-0.04, ph + 0.8, 0.06], [-0.25, h * 0.7, 0.1]], 0.03, 6), tube([[0.03, h * 0.62, 0], [0.22, h * 0.78, -0.12]], 0.03, 6));
  const leaves = cards(170, 5, (g, i, r) => {            // a loose, silvery crown of sprigs
    const a = r() * TAU, rr = 0.1 + Math.sqrt(r()) * 0.55, y = h * 0.58 + r() * h * 0.38;
    leafAt(g, 0.3 + r() * 0.18, y, 0.4 + r() * 1.6, a, 0.05, rr);
  });
  return [part([pot, [2, 1]], potJar(ph, 0.36)), part('soil', cyl(0.27, ph - 0.06, ph - 0.03, 16)), part('bark_olive', trunk), part('leaf_olive', leaves)];
}
export function frangipani(h = 2.4, pot = 'lava_pot') {
  const ph = 0.7, br = [];
  const tips = [[0.45, h * 0.86, 0.2], [-0.4, h * 0.9, 0.25], [0.1, h, -0.45], [-0.25, h * 0.8, -0.35], [0.35, h * 0.95, -0.15]];
  br.push(tube([[0, ph - 0.1, 0], [0.02, h * 0.45, 0]], 0.09, 8));
  for (const t of tips) br.push(tube([[0.02, h * 0.45, 0], [t[0] * 0.5, h * 0.62, t[2] * 0.5], t], 0.05, 10));
  // leaf rosettes at the branch tips, tilted up so they read from eye level (FF01 Bali render)
  const rosettes = tips.flatMap((t, k) => cards(5, 31 + k, (g, i, r) => {
    const s = 0.8 + r() * 0.25; g.scale(s, s, 1); g.rotateX(-Math.PI / 2 + 0.55 + r() * 0.5); g.rotateY((i / 5) * TAU + r() * 0.5); g.translate(t[0] + (r() - 0.5) * 0.12, t[1] + 0.04 + i * 0.03, t[2] + (r() - 0.5) * 0.12);
  }));
  return [part([pot, [2, 1]], potBowl(ph, 0.42)), part('soil', cyl(0.36, ph - 0.06, ph - 0.03, 16)), part('bark_frangipani', br), part('leaf_frangipani', rosettes)];
}
export function monstera(h = 1.3, pot = 'lava_pot') {
  const ph = 0.5, stems = [];
  const leaves = cards(11, 7, (g, i, r) => {
    const a = (i / 11) * TAU + r() * 0.4, len = 0.55 + r() * 0.3, y = ph + 0.35 + r() * (h - ph - 0.6);
    stems.push(tube([[0, ph, 0], [Math.cos(a) * 0.12, y * 0.8, Math.sin(a) * 0.12], [Math.cos(a) * 0.25, y, Math.sin(a) * 0.25]], 0.012, 6));
    leafAt(g, len, y, 0.9 + r() * 0.5, a, 0.12, 0.25);
  });
  return [part([pot, [2, 1]], potBowl(ph, 0.34)), part('soil', cyl(0.3, ph - 0.05, ph - 0.03, 16)), part('stem', stems), part('leaf_monstera', leaves)];
}
export function pottedPalm(h = 1.9, pot = 'terracotta_pot') {
  const ph = 0.55, stems = [];
  const fronds = cards(12, 9, (g, i, r) => {
    const a = (i / 12) * TAU + r() * 0.3, len = 0.9 + r() * 0.45, y = ph + 0.2 + r() * 0.45;
    stems.push(cyl(0.015, ph, y, 6, Math.cos(a) * 0.04, Math.sin(a) * 0.04));
    leafAt(g, len, y, 0.35 + r() * 0.6, a, 0.35, 0.05);
  });
  return [part([pot, [2, 1]], potJar(ph, 0.3)), part('soil', cyl(0.22, ph - 0.05, ph - 0.03, 16)), part('stem', stems), part('leaf_palm', fronds)];
}
export function birdOfParadise(h = 1.5, pot = 'lava_pot') {
  const ph = 0.55;
  const leaves = cards(9, 13, (g, i, r) => { const a = r() * TAU; leafAt(g, 0.8 + r() * 0.4, ph, 0.1 + r() * 0.35, a, 0.1, 0.05); });
  return [part([pot, [2, 1]], potBowl(ph, 0.33)), part('soil', cyl(0.28, ph - 0.05, ph - 0.03, 16)), part('leaf_paddle', leaves)];
}
export function hangingFern(drop = 0.6) {         // woven basket on a cord with drooping fronds (Bali)
  const by = -drop - 0.25;
  const fronds = cards(16, 17, (g, i, r) => {
    const a = (i / 16) * TAU + r() * 0.3; g.translate(0, 0.5, 0); g.scale(0.55 + r() * 0.25, 0.55 + r() * 0.25, 1);
    g.rotateX(Math.PI - 0.5 - r() * 0.6); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * 0.18, by + 0.24, Math.sin(a) * 0.18);
  });
  return [part('black_steel', cyl(0.004, by + 0.24, 0, 4)), part(['rattan', [5, 1]], potBowl(0.24, 0.2).translate(0, by, 0)), part('leaf_fern', fronds)];
}
export function tablePlant(riviera) {
  return riviera ? [part(['terracotta_pot', [1, 1]], potBowl(0.12, 0.07)), part('leaf_olive', cards(8, 21, (g, i, r) => leafAt(g, 0.18, 0.1, 0.3 + r() * 0.6, r() * TAU, 0.02, 0.01)))]
    : [part(['lava_pot', [1, 1]], potBowl(0.12, 0.08)), part('leaf_fern', cards(9, 23, (g, i, r) => leafAt(g, 0.22, 0.1, 0.6 + r() * 0.7, r() * TAU, 0.08, 0.02)))];
}

// ------------------------------------------------------------------ brewing
export function tank(h, r, mat = 'copper', { cone = true, band = 'brass' } = {}) {
  const leg = cone ? 0.45 : 0.15, b = cone ? r * 0.9 : 0.05;
  const prof = [[0.02, leg], [r * 0.25, leg + b * 0.15], [r, leg + b], [r, leg + b + h], [r * 0.7, leg + b + h + r * 0.35], [r * 0.18, leg + b + h + r * 0.45], [0.02, leg + b + h + r * 0.46]];
  const top = leg + b + h;
  const bands = [torus(r + 0.008, 0.012, leg + b + 0.08, 40), torus(r + 0.008, 0.012, top - 0.06, 40), torus(r + 0.008, 0.012, leg + b + h / 2, 40)];
  const manway = cyl(0.16, 0, 0.06, 20); manway.rotateZ(Math.PI / 2); manway.translate(r + 0.03, leg + b + 0.45, 0);
  return [
    part(mat, lathe(prof, 40)),
    part(band, bands, manway, cyl(0.05, top + r * 0.4, top + r * 0.6, 12)),
    part('stainless', legs([[r * 0.7, 0], [-r * 0.35, r * 0.6], [-r * 0.35, -r * 0.6]], 0, leg + b * 0.3, 0.03)),
  ];
}
export function tapTower(n, handle, metal) {         // T-bar with n taps; handle = material key
  const W = 0.11 * n, taps = [], handles = [];
  for (let i = 0; i < n; i++) {
    const z = -W / 2 + 0.055 + i * 0.11;
    taps.push(cyl(0.014, 0.33, 0.38, 10, 0.05, z), box(0.03, 0.08, 0.36, 0.38, z - 0.008, z + 0.008));
    handles.push(cyl(0.016, 0.38, 0.52, 10, 0.06, z, 0.02));
  }
  return [part(metal, cyl(0.035, 0, 0.36, 14), (() => { const g = cyl(0.03, -W / 2, W / 2, 14); g.rotateX(Math.PI / 2); g.translate(0, 0.36, 0); return g; })(), taps), part(handle, handles)];
}
// a row of wine and spirit bottles along local Z (-w/2 … w/2), standing on y = 0: Bordeaux (high shoulders),
// Burgundy (sloping) and spirit bottles, in green / amber / clear glass, each with a label band and a foil capsule
const BOTTLE_SHAPES = {
  bordeaux: [[0, 0], [0.037, 0], [0.038, 0.006], [0.038, 0.19], [0.035, 0.212], [0.025, 0.232], [0.0135, 0.25], [0.013, 0.3], [0, 0.3]],
  burgundy: [[0, 0], [0.04, 0], [0.041, 0.006], [0.041, 0.15], [0.036, 0.19], [0.026, 0.222], [0.0145, 0.25], [0.014, 0.3], [0, 0.3]],
  spirit: [[0, 0], [0.042, 0], [0.043, 0.006], [0.043, 0.19], [0.04, 0.205], [0.018, 0.215], [0.016, 0.255], [0.019, 0.258], [0.019, 0.272], [0, 0.272]],
};
export function wineBottles(n, seed, w = 1.0) {
  let s = seed >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sets = {};
  const put = (k, g) => (sets[k] ||= []).push(g);
  for (let i = 0; i < n; i++) {
    const z = -w / 2 + (i + 0.5) * (w / n), kind = r() < 0.48 ? 'bordeaux' : r() < 0.7 ? 'burgundy' : 'spirit';
    const glass = kind === 'spirit' ? (r() < 0.6 ? 'bottle_clear' : 'bottle_amber') : (r() < 0.75 ? 'bottle_green' : r() < 0.6 ? 'bottle_amber' : 'bottle_clear');
    const k = 0.94 + r() * 0.1, prof = BOTTLE_SHAPES[kind];
    const body = lathe(prof.map(([x, y]) => [x * (kind === 'spirit' ? 0.95 : 1), y * k]), 12); body.translate(0, 0, z); put(glass, body);
    const lab = cyl(0.0415, 0.06 * k, 0.135 * k, 12, 0, z); put(r() < 0.5 ? 'plaster_white' : 'linen', lab);
    if (kind !== 'spirit') put(['terracotta_velvet', 'brass', 'black_matte', 'brass'][(r() * 4) | 0], cyl(0.0148, 0.252 * k, 0.302 * k, 10, 0, z));
    else put('black_matte', cyl(0.021, 0.268 * k, 0.3 * k, 10, 0, z));
  }
  return Object.entries(sets).map(([m, g]) => part(m, g));
}
export function bottles(n, seed, w = 1.0) {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sets = { bottle_amber: [], bottle_green: [], bottle_clear: [] };
  for (let i = 0; i < n; i++) {
    const z = -w / 2 + (i + 0.5) * (w / n), k = ['bottle_amber', 'bottle_green', 'bottle_clear'][(r() * 3) | 0], h = 0.24 + r() * 0.1;
    sets[k].push(cyl(0.035, 0, h * 0.7, 10, 0, z), cyl(0.012, h * 0.7, h, 8, 0, z, 0.012), cyl(0.035, h * 0.7 - 0.001, h * 0.78, 10, 0, z, 0.013));
  }
  return Object.entries(sets).filter(([, g]) => g.length).map(([k, g]) => part(k, g));
}

// ------------------------------------------------------------------ stage, DJ and FF ceiling kit
export function micStand() { return [part('chrome', cyl(0.12, 0, 0.02, 20), cyl(0.012, 0.02, 1.5, 8), tube([[0, 1.5, 0], [0.08, 1.55, 0], [0.18, 1.6, 0]], 0.008, 8)), part('black_matte', sphere(0.03, 0.2, 1.61, 0, 10))]; }
export function barStoolStage(mat) { return [part(mat, cyl(0.17, 0.72, 0.76, 20), legs([[0.12, 0.12], [0.12, -0.12], [-0.12, 0.12], [-0.12, -0.12]], 0, 0.72, 0.016), torus(0.15, 0.01, 0.3, 20))]; }
export function guitar() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.2, 0, 0.21, 0.22, 0.12, 0.27); s.bezierCurveTo(0.17, 0.33, 0.16, 0.47, 0, 0.48); s.bezierCurveTo(-0.16, 0.47, -0.17, 0.33, -0.12, 0.27); s.bezierCurveTo(-0.21, 0.22, -0.2, 0, 0, 0);
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 16 });
  body.translate(0, 0, -0.05);
  const g = merge([body, box(-0.022, 0.022, 0.46, 1.0, -0.02, 0.02)]); g.rotateZ(0.2); g.rotateY(Math.PI / 2); g.translate(-0.05, 0.08, 0);
  return [part('honey_wood', g), part('black_steel', legs([[0.12, 0.12], [0.12, -0.12], [-0.06, 0]], 0, 0.3, 0.008))];
}
export function monitor() { const g = box(-0.25, 0.25, 0, 0.3, -0.22, 0.22); g.rotateZ(-0.45); g.translate(0, 0.12, 0); return [part('black_matte', g)]; }
export function lineArray(h = 2.2) { return [part('black_matte', box(-0.2, 0.2, 0, h, -0.25, 0.25)), part('black_steel', box(-0.21, -0.2, 0.1, h - 0.1, -0.2, 0.2))]; }
export function fan(bladeMat) {
  const blades = [];
  for (let i = 0; i < 5; i++) { const b = box(0.12, 0.72, -0.01, 0.0, -0.065, 0.065); b.rotateY((i / 5) * TAU); blades.push(b); }
  return [part('black_steel', cyl(0.012, -0.6, 0, 6), cyl(0.11, -0.72, -0.6, 18)), part(bladeMat, merge(blades).translate(0, -0.66, 0))];
}
export function spot(mat) {                     // suspended cylinder spot, emitting face down
  return [part(mat, cyl(0.006, -0.4, 0, 4), cyl(0.06, -0.62, -0.4, 14)), part('glow_warm', (() => { const g = new THREE.CircleGeometry(0.05, 14); g.rotateX(Math.PI / 2); g.translate(0, -0.621, 0); return g; })())];
}
// duct along a 3D path (world metres), ring joints every `pitch`
export function duct(path3, r, pitch = 1.2) {
  const curve = new THREE.CatmullRomCurve3(path3.map((p) => new THREE.Vector3(...p)));
  const L = curve.getLength(), segs = Math.max(8, Math.round(L / 0.4));
  const body = new THREE.TubeGeometry(curve, segs, r, 20, false);
  const rings = [];
  for (let s = pitch / 2; s < L; s += pitch) {
    const t = curve.getUtoTmapping(s / L), p = curve.getPointAt(s / L), d = curve.getTangentAt(s / L);
    const g = new THREE.TorusGeometry(r + 0.012, 0.016, 6, 24); g.lookAt(d); g.translate(p.x, p.y, p.z); rings.push(g); void t;
  }
  return { body, rings: merge(rings) };
}

// ------------------------------------------------------------------ brand marks (data/brand.json polygons -> 3D letters)
export function brandShapes(polys) {
  return polys.map((rings) => { const s = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y))); for (const h of rings.slice(1)) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y)))); return s; });
}
// extruded mark: width in metres, depth = letter depth; centred on x, base at y = 0, face toward +Z
export function brandGeometry(polys, width, depth, aspect, bevel = 0.004) {
  const shapes = brandShapes(polys);
  const g = new THREE.ExtrudeGeometry(shapes, { depth: depth / width, bevelEnabled: bevel > 0, bevelThickness: bevel / width, bevelSize: bevel / width * 0.8, bevelSegments: 2, curveSegments: 4 });
  g.translate(-0.5, 0, 0); g.scale(width, width, width);
  void aspect;
  return clean(g);
}
