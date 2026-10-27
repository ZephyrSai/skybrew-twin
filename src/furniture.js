// Parametric placeholder furniture, instanced per part.
//
// Each type is modelled in a unit footprint: local X = depth (front = +X), local Z = width,
// both spanning [-0.5, 0.5]; Y is absolute metres. An instance scales the footprint to the
// CAD item size and rotates it to face its table / the sea. The interior phase can replace
// any type with a real model by registering a new entry in TYPES with the same contract.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceMaterial, fixedMaterial } from './materials.js';

const box = (x0, x1, y0, y1, z0, z1) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
};
const cylinder = (r, y0, y1, seg = 20, x = 0, z = 0, rTop = r) => {
  const g = new THREE.CylinderGeometry(rTop, r, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); return g;
};
const legs = (inset, y1, t = 0.05) => {
  const a = 0.5 - inset;
  return [[-a, -a], [-a, a], [a, -a], [a, a]].map(([x, z]) => box(x - t / 2, x + t / 2, 0, y1, z - t / 2, z + t / 2));
};

// cushion surface depends on where the piece sits (indoor upholstery vs outdoor cushions)
const SOFT = (zone) => (zone === 'indoor' ? 'upholstery' : 'outdoor_fabric');

export const TYPES = {
  chair: (z) => [
    { s: 'furniture_frame', g: [...legs(0.12, 0.43, 0.04), box(-0.38, 0.38, 0.4, 0.45, -0.38, 0.38), box(-0.4, -0.33, 0.45, 0.86, -0.36, 0.36)] },
    { s: SOFT(z), g: [box(-0.34, 0.36, 0.45, 0.5, -0.34, 0.34)] },
  ],
  armchair: (z) => [
    { s: 'furniture_frame', g: [...legs(0.08, 0.12, 0.05), box(-0.45, 0.45, 0.12, 0.32, -0.45, 0.45), box(-0.45, -0.28, 0.32, 0.72, -0.45, 0.45),
      box(-0.45, 0.42, 0.32, 0.55, -0.45, -0.34), box(-0.45, 0.42, 0.32, 0.55, 0.34, 0.45)] },
    { s: SOFT(z), g: [box(-0.28, 0.42, 0.32, 0.44, -0.33, 0.33), box(-0.3, -0.16, 0.44, 0.7, -0.33, 0.33)] },
  ],
  sofa: (z) => [
    { s: 'furniture_frame', g: [...legs(0.06, 0.1, 0.05), box(-0.47, 0.47, 0.1, 0.3, -0.49, 0.49), box(-0.47, -0.25, 0.3, 0.74, -0.49, 0.49),
      box(-0.47, 0.45, 0.3, 0.56, -0.49, -0.43), box(-0.47, 0.45, 0.3, 0.56, 0.43, 0.49)] },
    { s: SOFT(z), g: [box(-0.25, 0.44, 0.3, 0.44, -0.42, -0.005), box(-0.25, 0.44, 0.3, 0.44, 0.005, 0.42),
      box(-0.28, -0.1, 0.44, 0.72, -0.42, -0.005), box(-0.28, -0.1, 0.44, 0.72, 0.005, 0.42)] },
    { s: 'fixed:fabric_terracotta', g: [box(-0.22, -0.08, 0.44, 0.64, -0.36, -0.2), box(-0.22, -0.08, 0.44, 0.64, 0.2, 0.36)] },
  ],
  loveseat: (z) => TYPES.sofa(z),
  table: () => [
    { s: 'tabletops', g: [box(-0.5, 0.5, 0.71, 0.75, -0.5, 0.5)] },
    { s: 'furniture_frame', g: legs(0.07, 0.71, 0.06) },
  ],
  table_round: () => [
    { s: 'tabletops', g: [cylinder(0.5, 0.71, 0.75, 32)] },
    { s: 'fixed:black_metal', g: [cylinder(0.05, 0, 0.71, 10), cylinder(0.28, 0, 0.03, 20)] },
  ],
  coffee_table: () => [
    { s: 'tabletops', g: [box(-0.5, 0.5, 0.36, 0.4, -0.5, 0.5)] },
    { s: 'furniture_frame', g: [box(-0.4, 0.4, 0, 0.36, -0.4, 0.4)] },
  ],
  side_table_round: () => [
    { s: 'tabletops', g: [cylinder(0.42, 0.5, 0.53, 24)] },
    { s: 'furniture_frame', g: [cylinder(0.3, 0, 0.5, 16, 0, 0, 0.2)] },
  ],
  bar_stool: () => [
    { s: 'furniture_frame', g: [cylinder(0.32, 0.72, 0.78, 20), box(-0.36, -0.3, 0.78, 0.98, -0.25, 0.25)] },
    { s: 'fixed:black_metal', g: [cylinder(0.03, 0, 0.72, 8), cylinder(0.25, 0, 0.02, 16), cylinder(0.24, 0.28, 0.3, 16)] },
  ],
  pouf: () => [{ s: 'fixed:rope_white', g: [cylinder(0.42, 0, 0.42, 20, 0, 0, 0.38)] }],
  sunbed: () => [
    { s: 'fixed:teak_furniture', g: [...legs(0.06, 0.2, 0.06), box(-0.5, 0.5, 0.2, 0.3, -0.48, 0.48)] },
    { s: 'outdoor_fabric', g: [box(-0.12, 0.49, 0.3, 0.37, -0.45, 0.45),
      (() => { const g = box(-0.06, 0.3, -0.035, 0.035, -0.45, 0.45); g.rotateZ(-0.55); g.translate(-0.3, 0.52, 0); return g; })()] },
  ],
};

// ---------------------------------------------------------------- orientation logic
const rad = (d) => (d * Math.PI) / 180;
const TABLES = new Set(['table', 'table_round', 'coffee_table', 'side_table_round']);

export function orient(f, all) {
  const a = rad(f.angle);
  if (f.type === 'sunbed') {
    // head toward the building, feet toward the sea
    const out = [f.at[0] - 4, f.at[1] - 1];
    const c = [Math.cos(a), Math.sin(a)];
    return c[0] * out[0] + c[1] * out[1] >= 0 ? a : a + Math.PI;
  }
  if (TABLES.has(f.type) || f.type === 'bar_stool' || f.type === 'pouf') return a + Math.PI / 2;
  if (f.face !== undefined && (f.type === 'chair' || f.type === 'armchair')) return rad(f.face);
  // sofas / loveseats: front = side of the long axis facing the nearest table
  let best = null, bd = 2.6;
  for (const t of all) {
    if (!TABLES.has(t.type)) continue;
    const d = Math.hypot(t.at[0] - f.at[0], t.at[1] - f.at[1]);
    if (d < bd) { bd = d; best = t; }
  }
  const target = best ? best.at : [5, 0];
  const n1 = a + Math.PI / 2;
  const dir = [target[0] - f.at[0], target[1] - f.at[1]];
  return Math.cos(n1) * dir[0] + Math.sin(n1) * dir[1] >= 0 ? n1 : n1 + Math.PI;
}

export function footprint(f) {
  // returns [depth along local X, width along local Z]
  if (f.type === 'sunbed') return [f.l, f.w];
  if (f.type === 'table_round' || f.type === 'side_table_round') return [f.l, f.l];
  if (f.type === 'bar_stool') return [0.45, 0.45];
  if (f.type === 'chair') return [Math.min(f.w, 0.58), Math.min(f.l, 0.58)];
  if (f.type === 'armchair') return [Math.min(Math.max(f.w, 0.7), 0.85), Math.min(Math.max(f.l, 0.7), 0.85)];
  return [f.w, f.l];
}

// Builds one InstancedMesh per (type, part). floorY(x, y) gives the floor height under an item.
export function buildFurniture(items, floorY) {
  const group = new THREE.Group(); group.name = 'furniture';
  const byType = new Map();
  for (const f of items) {
    if (!TYPES[f.type]) continue;
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type).push(f);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [type, list] of byType) {
    // parts can depend on zone (indoor vs outdoor fabric) -> split by zone family
    const families = new Map();
    for (const f of list) { const k = f.zone === 'indoor' ? 'indoor' : 'outdoor'; if (!families.has(k)) families.set(k, []); families.get(k).push(f); }
    for (const [fam, fl] of families) {
      for (const part of TYPES[type](fam === 'indoor' ? 'indoor' : 'outdoor')) {
        const merged = mergeParts(part.g);
        const mat = part.s.startsWith('fixed:') ? fixedMaterial(part.s.slice(6)) : surfaceMaterial(part.s);
        const im = new THREE.InstancedMesh(merged, mat, fl.length);
        im.castShadow = true; im.receiveShadow = true;
        im.userData = { surface: part.s, type, pick: fl };
        fl.forEach((f, i) => {
          const [dx, dz] = footprint(f);
          q.setFromAxisAngle(up, orient(f, items));
          pos.set(f.at[0], floorY(f.at[0], f.at[1]), -f.at[1]);
          sc.set(dx, 1, dz);
          im.setMatrixAt(i, m.compose(pos, q, sc));
        });
        im.instanceMatrix.needsUpdate = true;
        group.add(im);
      }
    }
  }
  return group;
}

function mergeParts(gs) {
  return mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// ---------------------------------------------------------------- lamps & plants (instanced)
export function buildInstanced(name, parts, placements) {
  // parts: [{ mat, geo }] ; placements: [{ p:[x,y], y, s, rot }]
  const group = new THREE.Group(); group.name = name;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
    im.castShadow = part.shadow !== false; im.receiveShadow = true;
    placements.forEach((pl, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot || 0);
      pos.set(pl.p[0], pl.y || 0, -pl.p[1]);
      const s = pl.s || 1; sc.set(s, pl.sy || s, s);
      im.setMatrixAt(i, m.compose(pos, q, sc));
    });
    group.add(im);
  }
  return group;
}

export function coneLampParts() {
  const shade = new THREE.ConeGeometry(0.26, 0.42, 18, 1, true); shade.translate(0, -0.21, 0);
  const cord = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4); cord.translate(0, 0.06, 0);
  return [{ geo: shade, mat: fixedMaterial('lamp_rattan') }, { geo: cord, mat: fixedMaterial('black_metal'), shadow: false }];
}
export function globeLampParts() {
  const gs = [];
  for (const [x, y, z, r] of [[0, -0.15, 0, 0.17], [0.22, -0.32, 0.08, 0.14], [-0.18, -0.38, -0.12, 0.15], [0.05, -0.55, -0.2, 0.12]]) {
    const g = new THREE.SphereGeometry(r, 16, 12); g.translate(x, y, z); gs.push(g.toNonIndexed());
  }
  const cord = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4); cord.translate(0, 0.06, 0);
  return [{ geo: mergeGeometries(gs), mat: fixedMaterial('lamp_globe') }, { geo: cord, mat: fixedMaterial('black_metal'), shadow: false }];
}
// ---------------------------------------------------------------- foliage: alpha-tested leaf cards
let LEAF_MAT = null;
function leafMaterial() {
  if (LEAF_MAT) return LEAF_MAT;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true });
  let seed = 3; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 46; i++) {
    const x = 20 + r() * 216, y = 20 + r() * 216, a = r() * Math.PI, L = 18 + r() * 22;
    const tone = [[58, 92, 44], [70, 108, 50], [48, 80, 38], [86, 120, 58], [64, 98, 46]][(r() * 5) | 0];
    const k = 0.85 + r() * 0.3;
    g.fillStyle = `rgb(${tone[0] * k | 0},${tone[1] * k | 0},${tone[2] * k | 0})`;
    g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, L, L * 0.38, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(30,45,20,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  LEAF_MAT = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, name: 'leaves' });
  return LEAF_MAT;
}
// cards scattered through ellipsoidal blobs; normals point out of the blob so the crown shades as a volume
function foliageCards(blobs, perBlob, size, seed = 1) {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = [], nor = [], uv = [];
  for (const [cx, cy, cz, R] of blobs) {
    for (let i = 0; i < perBlob; i++) {
      // point in/near the blob surface
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = R * (0.55 + 0.45 * Math.cbrt(r()));
      const sq = Math.sqrt(1 - u * u); const n = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      const c = new THREE.Vector3(cx, cy, cz).addScaledVector(n, rr);
      // card plane roughly facing outward, randomly rolled
      const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
      const roll = r() * Math.PI; const a = t1.clone().multiplyScalar(Math.cos(roll)).addScaledVector(t2, Math.sin(roll));
      const b = new THREE.Vector3().crossVectors(n, a).normalize().addScaledVector(n, (r() - 0.5) * 0.8).normalize();
      const h = size * (0.7 + r() * 0.6) / 2;
      const p = [c.clone().addScaledVector(a, -h).addScaledVector(b, -h), c.clone().addScaledVector(a, h).addScaledVector(b, -h),
        c.clone().addScaledVector(a, h).addScaledVector(b, h), c.clone().addScaledVector(a, -h).addScaledVector(b, h)];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(p[k].x, p[k].y, p[k].z); nor.push(n.x, n.y, n.z); }
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// big white sphere planter (open top) with a bougainvillea shrub seated in the soil — arrival court, video 1
let BOUG_MAT = null;
function bougainvilleaMaterial() {
  if (BOUG_MAT) return BOUG_MAT;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d', { willReadFrequently: true });
  let seed = 11; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) { const x = 14 + r() * 100, y = 14 + r() * 100; g.fillStyle = ['#d6337a', '#e04a8c', '#c2266a', '#ea6aa3'][(r() * 4) | 0]; for (let p = 0; p < 3; p++) { g.beginPath(); g.ellipse(x + Math.cos(p * 2.1) * 5, y + Math.sin(p * 2.1) * 5, 6, 4.5, p * 2.1, 0, 7); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  BOUG_MAT = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, name: 'bougainvillea' });
  return BOUG_MAT;
}
export function spherePlanterParts() {
  const R = 0.42, open = 0.62;                             // radius, opening half-angle from the top (rad)
  const bowl = new THREE.SphereGeometry(R, 32, 18, 0, Math.PI * 2, open, Math.PI - open); bowl.translate(0, R * 0.96, 0);
  const rim = R * 0.96 + R * Math.cos(open), rr = R * Math.sin(open);
  const soil = new THREE.CircleGeometry(rr * 0.98, 24); soil.rotateX(-Math.PI / 2); soil.translate(0, rim - 0.05, 0);
  const blobs = [[0, rim + 0.22, 0, 0.36], [0.16, rim + 0.12, 0.08, 0.26], [-0.14, rim + 0.14, -0.06, 0.27], [0.02, rim + 0.42, -0.04, 0.24]];
  return [
    { geo: bowl, mat: fixedMaterial('white_lacquer') },
    { geo: soil, mat: fixedMaterial('bark'), shadow: false },
    { geo: foliageCards(blobs, 70, 0.2, 13), mat: leafMaterial() },
    { geo: foliageCards(blobs.map(([x, y, z, rad]) => [x, y + 0.03, z, rad * 1.02]), 30, 0.16, 17), mat: bougainvilleaMaterial(), shadow: false },
  ];
}
export function shrubParts() {
  const pot = new THREE.CylinderGeometry(0.28, 0.2, 0.5, 14); pot.translate(0, 0.25, 0);
  const leaves = foliageCards([[0, 0.92, 0, 0.36], [0.12, 1.12, 0.05, 0.26], [-0.1, 1.05, -0.08, 0.26]], 55, 0.26, 5);
  return [{ geo: pot, mat: fixedMaterial('white_lacquer') }, { geo: leaves, mat: leafMaterial() }];
}
export function palmParts() {
  const trunk = new THREE.CylinderGeometry(0.14, 0.22, 6, 8); trunk.translate(0, 3, 0);
  const fronds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.PlaneGeometry(0.5, 2.6, 1, 4);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k) + 1.3; pos.setZ(k, -0.12 * y * y); pos.setY(k, y); }
    g.rotateX(-1.0); g.rotateY((i / 9) * Math.PI * 2); g.translate(0, 6, 0); g.computeVertexNormals();
    fronds.push(g.toNonIndexed());
  }
  return [{ geo: trunk, mat: fixedMaterial('bark') }, { geo: mergeGeometries(fronds), mat: fixedMaterial('palm_frond') }];
}
export function treeParts() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 3.2, 10); trunk.translate(0, 1.6, 0);
  const limbs = [];
  for (const [ax, az, len] of [[0.5, 0.2, 1.6], [-0.45, 0.35, 1.5], [0.1, -0.55, 1.4], [-0.2, -0.3, 1.2]]) {
    const g = new THREE.CylinderGeometry(0.05, 0.1, len, 6); g.translate(0, len / 2, 0); g.rotateZ(-ax); g.rotateX(az); g.translate(0, 2.6, 0); limbs.push(g.toNonIndexed());
  }
  const blobs = [[0, 3.9, 0, 1.45], [1.05, 3.5, 0.35, 1.05], [-0.95, 3.6, -0.25, 1.1], [0.2, 4.6, -0.5, 0.95], [-0.3, 3.3, 0.95, 0.95], [0.6, 4.3, 0.7, 0.8]];
  const cards = foliageCards(blobs, 230, 0.55, 9);
  return [{ geo: mergeGeometries([trunk.toNonIndexed(), ...limbs]), mat: fixedMaterial('bark') }, { geo: cards, mat: leafMaterial() }];
}

// ---------------------------------------------------------------- real models (assets/web, Poly Haven CC0)
// Which downloaded model stands in for each CAD furniture type. Types without a model keep the
// parametric placeholder (rectangular dining tables, sunbeds until the Sketchfab set arrives).
// Sofas stay parametric (finish-driven) until the Sketchfab rattan sofa is added: the only free sofa
// here is a leather chesterfield, which is the wrong look for Mykonos.
// (pouf stays parametric too: the free ottoman is dark brown leather; the white rope pouf is closer.)
export const MODEL_FOR = {
  chair: { id: 'outdoor_table_chair_set_01', node: 'outdoor_table_chair_set_01_chair_01' },
  table: { id: 'outdoor_table_chair_set_01', node: 'outdoor_table_chair_set_01_table' },
  armchair: { id: 'modern_arm_chair_01' }, table_round: { id: 'round_wooden_table_01' }, side_table_round: { id: 'side_table_01' },
  coffee_table: { id: 'coffee_table_round_01' }, bar_stool: { id: 'bar_chair_round_01' },
};
const STRETCH = new Set(['table']);                        // footprint-fitted in plan (tables stretch, chairs don't)
// model materials that follow a twin surface, so the Finishes panel restyles the real furniture too
export const MODEL_SURFACES = { modern_arm_chair_01_pillow: 'upholstery' };
const SEATING = new Set(['chair', 'armchair', 'sofa', 'loveseat', 'bar_stool']);

// Normalise a glTF scene into our furniture convention: centred on its footprint, base at y = 0,
// front facing local +X (found from where the backrest is), long axis on local Z for tables.
export function prepareModel(scene, { seating = false, longOnZ = false, node = null } = {}) {
  const remap = (m) => (m && MODEL_SURFACES[m.name] ? surfaceMaterial(MODEL_SURFACES[m.name]) : m);
  scene.updateMatrixWorld(true);
  const root = node ? scene.getObjectByName(node) : scene;
  if (!root) return null;
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = toFloat(o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    if (Array.isArray(o.material) && g.groups.length) {
      for (const gr of g.groups) parts.push({ geometry: sliceGeometry(g, gr.start, gr.count), material: remap(o.material[gr.materialIndex]) });
    } else parts.push({ geometry: g, material: remap(Array.isArray(o.material) ? o.material[0] : o.material) });
  });
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  let theta = 0;
  if (seating) {                                            // backrest = points in the top third
    let bx = 0, bz = 0, n = 0; const yCut = box.min.y + size.y * 0.66;
    for (const p of parts) {
      const a = p.geometry.attributes.position;
      for (let i = 0; i < a.count; i += 3) if (a.getY(i) > yCut) { bx += a.getX(i); bz += a.getZ(i); n++; }
    }
    if (n) { const fx = c.x - bx / n, fz = c.z - bz / n; theta = -Math.atan2(-fz, fx); }
  } else if (longOnZ && size.x > size.z * 1.15) theta = Math.PI / 2;
  const N = new THREE.Matrix4().makeRotationY(theta).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  const nb = new THREE.Box3();
  for (const p of parts) { p.geometry.applyMatrix4(N); p.geometry.computeBoundingBox(); nb.union(p.geometry.boundingBox); }
  return { parts, size: nb.getSize(new THREE.Vector3()) };
}
// meshopt/quantised glTF stores positions as normalised ints; baking a metre-scale transform into
// those would clamp them, so expand every attribute to float32 first
function toFloat(g) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(k)) continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  return out;
}
function sliceGeometry(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize, a.normalized));
  return out;
}

// Instanced model furniture for the types that have a prepared model; returns the set of types it covered.
export function buildModelFurniture(items, floorY, prepared, group) {
  const covered = new Set();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [type, model] of prepared) {
    const list = items.filter((f) => f.type === type); if (!list.length || !model) continue;
    covered.add(type);
    for (const part of model.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      im.castShadow = true; im.receiveShadow = true; im.userData = { type, model: true };
      list.forEach((f, i) => {
        const [dx, dz] = footprint(f);
        q.setFromAxisAngle(up, orient(f, items));
        pos.set(f.at[0], floorY(f.at[0], f.at[1]), -f.at[1]);
        if (STRETCH.has(type)) sc.set(dx / model.size.x, 1, dz / model.size.z);
        else {
          const want = SEATING.has(type) ? (dx / model.size.x + dz / model.size.z) / 2 : Math.max(dx / model.size.x, dz / model.size.z);
          const s = Math.min(1.25, Math.max(0.8, want)); sc.set(s, s, s);
        }
        im.setMatrixAt(i, m.compose(pos, q, sc));
      });
      im.instanceMatrix.needsUpdate = true; group.add(im);
    }
  }
  return covered;
}

// Instanced placements of a prepared model: [{ p:[x,y], y, rot, s }]
export function placeModel(model, placements, group, name) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const part of model.parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    im.castShadow = true; im.receiveShadow = true; im.name = name;
    placements.forEach((pl, i) => {
      q.setFromAxisAngle(up, pl.rot || 0); pos.set(pl.p[0], pl.y || 0, -pl.p[1]); const s = pl.s || 1; sc.set(s, s, s);
      im.setMatrixAt(i, m.compose(pos, q, sc));
    });
    im.instanceMatrix.needsUpdate = true; group.add(im);
  }
}
