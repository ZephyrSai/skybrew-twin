// Practical lighting: the warm, uneven light of the Skybrew renders (pools under pendants, glowing bars,
// uplit columns, sconce scallops) instead of the flat sky-fill the base twin had.
//   * LightRig: a fixed pool of point lights (constant count, so changing theme or time never recompiles
//     shaders) that each theme re-aims at its own pendants, bar, stage and DJ booth. These are real lights,
//     so photo mode traces them too.
//   * Light-pool decals: cheap additive gradients on floors / walls / columns for the realtime view; photo
//     mode skips them (userData.noPhoto) and relies on the real lights.
// Level k: 0 = daylight (lamps barely on) … 1 = evening / night (lamps on).
import * as THREE from 'three';

const WARM = new THREE.Color('#ffb36b');                   // ≈ 2700 K
let POOL = null, SCALLOP = null, UPLIGHT = null;
function grad(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d', { willReadFrequently: true }), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const additive = (map) => new THREE.MeshBasicMaterial({ map, color: WARM, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide, toneMapped: true });
export function poolMaterial() {
  return (POOL ||= additive(grad(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); })));
}
// sconce scallop: bright at the source (v = 0), fanning out and fading over the plane
export function scallopMaterial() {
  return (SCALLOP ||= additive(grad(64, 128, (g, w, h) => { for (let y = 0; y < h; y++) { const t = y / h, half = w * (0.12 + 0.38 * t), a = (1 - t) ** 1.6 * 0.85; const r = g.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, h - 1 - y, w, 1); } })));
}
// column uplight sleeve: bright at the floor, fading up the shaft
export function uplightMaterial() {
  return (UPLIGHT ||= additive(grad(8, 128, (g, w, h) => { const r = g.createLinearGradient(0, h, 0, 0); r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); })));
}
export function poolGeometry() { const g = new THREE.CircleGeometry(1, 36); g.rotateX(-Math.PI / 2); return g; }
// a w × h plane (local XY, faces +Z) whose v runs 0 at the source edge (top if down = true) to 1
export function scallopGeometry(w, h, down = true) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, down ? uv.getY(i) : 1 - uv.getY(i));
  g.translate(0, down ? -h / 2 : h / 2, 0); return g;
}
export function setDecalLevel(k) {
  if (POOL) POOL.opacity = 0.42 * k; if (SCALLOP) SCALLOP.opacity = 0.55 * k; if (UPLIGHT) UPLIGHT.opacity = 0.5 * k;
}

export class LightRig {
  constructor(lights) {
    this.lights = lights;                                   // the venue's point lights (photo mode uses them)
    for (const l of lights) { l.decay = 2; l.distance = 11; l.color.copy(WARM); }
    this.power = lights.map(() => 0);
    this.free = lights.map((l) => ({ p: [l.position.x, -l.position.z], h: l.position.y, power: 18 }));
  }
  // spots: [{ p:[x,y], h, power (cd at full level), dist?, color? }]; unused lights park dark
  place(spots) {
    this.lights.forEach((l, i) => {
      const s = spots[i];
      if (!s) { this.power[i] = 0; return; }
      l.position.set(s.p[0], s.h, -s.p[1]); l.distance = s.dist || 11; l.color.set(s.color || WARM); this.power[i] = s.power;
      (this.colors ||= [])[i] = l.color.clone();
    });
  }
  set(k) { this.k = k; this.lights.forEach((l, i) => { if (!this.held?.has(i)) l.intensity = this.power[i] * k; }); setDecalLevel(k); }
  // the club show borrows a light (colour + intensity multiplier on its placed power) and hands it back
  override(i, color, mult) { (this.held ||= new Map()).set(i, true); const l = this.lights[i]; if (!l) return; l.color.copy(color); l.intensity = this.power[i] * mult; }
  release(i) { if (!this.held?.delete(i)) return; const l = this.lights[i]; l.color.copy(this.colors?.[i] || WARM); l.intensity = this.power[i] * (this.k ?? 1); }
}
