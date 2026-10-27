// Geometry helpers. Plan coordinates are (x = east, y = north) in metres;
// three.js world is X = east, Y = up, Z = -north.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const v2 = (p) => new THREE.Vector2(p[0], p[1]);
export const toWorld = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

export function shapeFrom(outer, holes = []) {
  const s = new THREE.Shape(outer.map(v2));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(v2)));
  return s;
}

function finish(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
}

// solid prism from a plan polygon between heights z0..z1.
// bevel > 0 softens every edge (Cycladic plaster look) without changing the outer size;
// grow > 0 pushes the outline outward (copings, skirtings, cornices).
export function prism(outer, holes, z0, z1, bevel = 0, grow = 0) {
  const h = z1 - z0;
  const b = Math.min(bevel, h / 3);
  const opts = b > 0 || grow
    ? { depth: Math.max(h - 2 * b, 0.001), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: grow - b, bevelSegments: b > 0 ? 2 : 1, curveSegments: 1 }
    : { depth: h, bevelEnabled: false, curveSegments: 1 };
  const g = new THREE.ExtrudeGeometry(shapeFrom(outer, holes), opts);
  g.rotateX(-Math.PI / 2); g.translate(0, z0 + (opts.bevelEnabled ? b : 0), 0);
  return finish(g);
}

// minimum width of a polygon (approx, via its principal axes) — used to decide if bevels are safe
export function minWidth(r) {
  const a = principalAngle(r); const u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of r) { const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
  return Math.min(u1 - u0, v1 - v0);
}

// ---------------------------------------------------------------- vertical panels with openings
// A planar wall between plan points a -> b, from z0 to z1, `t` thick, centred on the line.
// holes: [{u0, u1, v0, v1, arch: 'pointed'|'round'|null}] in panel coordinates (u along a->b, v = height).
export function panel(a, b, z0, z1, t, holes = [], offset = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const s = new THREE.Shape([new THREE.Vector2(0, z0), new THREE.Vector2(len, z0), new THREE.Vector2(len, z1), new THREE.Vector2(0, z1)]);
  // openings are clamped to the panel: a hole that crosses the outline (e.g. a sill below the panel's base) is
  // silently dropped by the triangulator, which closes the doorway while the walk colliders still let you through
  for (const h of holes) {
    const c = { ...h, u0: Math.max(h.u0, 0), u1: Math.min(h.u1, len), v0: Math.max(h.v0, z0), v1: Math.min(h.v1, z1) };
    if (c.u1 - c.u0 > 1e-3 && c.v1 - c.v0 > 1e-3) s.holes.push(openingPath(c));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 10 });
  return finish(placeOnSegment(g, a, b, t, offset));
}
// flat shape (in panel u/v coordinates) standing on segment a->b, pushed `offset` along the left normal
export function panelShape(a, b, shape, offset = 0, depth = 0) {
  const g = depth > 0 ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }) : new THREE.ShapeGeometry(shape, 10);
  return finish(placeOnSegment(g, a, b, depth, offset));
}
function placeOnSegment(g, a, b, t, offset) {
  const ex = new THREE.Vector3(b[0] - a[0], 0, -(b[1] - a[1])).normalize();
  const ey = new THREE.Vector3(0, 1, 0);
  const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();      // right-handed, points to the right of a->b
  const m = new THREE.Matrix4().makeBasis(ex, ey, ez);
  const origin = new THREE.Vector3(a[0], 0, -a[1]).addScaledVector(ez, -t / 2 - offset);
  m.setPosition(origin);
  g.applyMatrix4(m);
  return g;
}
export function openingPath(h, Cls = THREE.Path) {
  const p = new Cls(); const w = h.u1 - h.u0, cx = (h.u0 + h.u1) / 2;
  if (!h.arch) { p.moveTo(h.u0, h.v0); p.lineTo(h.u0, h.v1); p.lineTo(h.u1, h.v1); p.lineTo(h.u1, h.v0); p.lineTo(h.u0, h.v0); return p; }
  const rise = h.arch === 'round' ? w / 2 : w * 0.62;
  const spring = h.v1 - rise;
  p.moveTo(h.u0, h.v0); p.lineTo(h.u0, spring);
  if (h.arch === 'round') p.absarc(cx, spring, w / 2, Math.PI, 0, true);
  else { p.quadraticCurveTo(h.u0, h.v1 - rise * 0.15, cx, h.v1); p.quadraticCurveTo(h.u1, h.v1 - rise * 0.15, h.u1, spring); }
  p.lineTo(h.u1, h.v0); p.lineTo(h.u0, h.v0);
  return p;
}
export function openingShape(h) { return openingPath(h, THREE.Shape); }

// horizontal face at height z (normal up, or down when flip)
export function flat(outer, holes, z, flip = false) {
  const g = new THREE.ShapeGeometry(shapeFrom(outer, holes), 1);
  g.rotateX(flip ? Math.PI / 2 : -Math.PI / 2);
  if (flip) { // after flipping, plan y maps to +Z: mirror so it lands on -north again
    g.scale(1, 1, -1);
    const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
    g.computeVertexNormals();
  }
  g.translate(0, z, 0);
  return finish(g);
}

// offset a polyline both sides -> closed polygon of given thickness
export function strip(path, t, offset = 0) {
  const L = [], R = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const a = path[Math.max(i - 1, 0)], b = path[Math.min(i + 1, n - 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    L.push([p[0] + nx * (t / 2 + offset), p[1] + ny * (t / 2 + offset)]);
    R.push([p[0] - nx * (t / 2 - offset), p[1] - ny * (t / 2 - offset)]);
  }
  return L.concat(R.reverse());
}

export function wall(path, t, z0, z1, offset = 0) {
  return prism(strip(path, t, offset), [], z0, z1);
}

// axis-aligned-in-plan box from a to b (plan points), width w, heights z0..z1
export function beam(a, b, w, z0, z1) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(len, z1 - z0, w);
  g.rotateY(Math.atan2(dy, dx));
  g.translate((a[0] + b[0]) / 2, (z0 + z1) / 2, -(a[1] + b[1]) / 2);
  return finish(g);
}

export function post(p, w, z0, z1, d = w) {
  const g = new THREE.BoxGeometry(w, z1 - z0, d);
  g.translate(p[0], (z0 + z1) / 2, -p[1]);
  return finish(g);
}

export function cyl(p, r, z0, z1, seg = 12, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, z1 - z0, seg);
  g.translate(p[0], (z0 + z1) / 2, -p[1]);
  return finish(g);
}

// vertical quad along a plan segment (glass panes)
export function pane(a, b, z0, z1) {
  const g = new THREE.BufferGeometry();
  const A = [a[0], z0, -a[1]], B = [b[0], z0, -b[1]], C = [b[0], z1, -b[1]], D = [a[0], z1, -a[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, z0, len, z0, len, z1, 0, z0, len, z1, 0, z1], 2));
  g.computeVertexNormals();
  return g;
}

export function merge(list) {
  if (!list.length) return null;
  return mergeGeometries(list.map(finish), false);
}

// resample a polyline at roughly equal spacing, returning points + cumulative length
export function resample(path, step) {
  const segs = []; let total = 0;
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); segs.push(l); total += l; }
  const n = Math.max(1, Math.round(total / step));
  const out = [];
  for (let k = 0; k <= n; k++) out.push(pointAt(path, segs, (k / n) * total));
  return { pts: out, total };
}
function pointAt(path, segs, d) {
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(d / segs[i], 1) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    d -= segs[i];
  }
  return path[path.length - 1];
}

// ---------------------------------------------------------------- 2D analysis
export function polyArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function centroid(r) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; const f = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; a += f; }
  return a ? [cx / (3 * a), cy / (3 * a)] : r[0];
}
export function inside(pt, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
}
export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx, y = a[1] + t * dy;
  return [Math.hypot(p[0] - x, p[1] - y), x, y];
}
export function ringDist(p, r) {
  let d = Infinity;
  for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length])[0]);
  return d;
}
// intersections of an infinite line (p + t*dir) with polygon edges -> sorted t values
export function lineCuts(p, dir, r) {
  const ts = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
    const u = ((a[0] - p[0]) * dir[1] - (a[1] - p[1]) * dir[0]) / den;
    if (u >= 0 && u < 1) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}
// principal axis angle of a polygon (radians)
export function principalAngle(r) {
  const c = centroid(r); let sxx = 0, syy = 0, sxy = 0;
  for (const p of r) { const x = p[0] - c[0], y = p[1] - c[1]; sxx += x * x; syy += y * y; sxy += x * y; }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}
