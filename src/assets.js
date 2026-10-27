// Downloaded asset library (assets/web, built by pipeline/optimise_assets.mjs):
// photo-scanned finishes, glTF furniture/plants, HDR skies. Everything degrades gracefully: if
// assets/web is missing the twin keeps its procedural finishes and placeholder furniture.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = 'assets/web/';
let INDEX = null;
const texCache = new Map();
const tl = new THREE.TextureLoader();
const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const hdr = new HDRLoader().setDataType(THREE.HalfFloatType);

export async function loadIndex() {
  try { const r = await fetch(`${BASE}index.json`); INDEX = r.ok ? await r.json() : null; } catch { INDEX = null; }
  return INDEX;
}
export const assetIndex = () => INDEX;

function tex(url, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const key = `${url}|${repeat}`;
  if (!texCache.has(key)) {
    const t = tl.load(BASE + url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

// A PBR material from a downloaded texture set. tileM = metres covered by one tile on the surface.
export function photoMaterial(id, { tileM, tint, neutral = false, roughness = 1, normal = 1, ao = 0.8, side, alphaTest } = {}) {
  const e = INDEX?.textures.find((t) => t.id === id);
  if (!e) return null;
  const rep = 1 / (tileM || e.tile_m || 1);
  const colour = neutral && e.maps.includes('color_neutral') ? 'color_neutral' : 'color';
  const m = new THREE.MeshStandardMaterial({
    map: tex(`tex/${id}/${colour}.jpg`, { srgb: true, repeat: rep }),
    normalMap: tex(`tex/${id}/normal.jpg`, { repeat: rep }),
    roughnessMap: tex(`tex/${id}/orm.jpg`, { repeat: rep }),
    aoMap: tex(`tex/${id}/orm.jpg`, { repeat: rep }),
    aoMapIntensity: ao, roughness, metalness: 0, normalScale: new THREE.Vector2(normal, normal),
    color: tint || '#ffffff', side: side ?? THREE.FrontSide,
  });
  if (e.maps.includes('alpha') && alphaTest) { m.alphaMap = tex(`tex/${id}/alpha.jpg`, { repeat: rep }); m.alphaTest = alphaTest; m.side = THREE.DoubleSide; }
  return m;
}

const modelCache = new Map();
export function loadModel(id) {
  if (!INDEX?.models.find((m) => m.id === id)) return Promise.resolve(null);
  if (!modelCache.has(id)) modelCache.set(id, gltf.loadAsync(`${BASE}models/${id}.glb`).then((g) => g.scene).catch((e) => { console.warn('model', id, e); return null; }));
  return modelCache.get(id);
}

const hdrCache = new Map();
export function loadSky(id, res = '2k') {
  const e = INDEX?.hdri.find((h) => h.id === id);
  if (!e) return Promise.resolve(null);
  const key = `${id}@${res}`;
  if (!hdrCache.has(key)) {
    hdrCache.set(key, hdr.loadAsync(BASE + e.files[res]).then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.userData.sun = findSun(t); t.userData.horizon = horizonColour(t);
      return t;
    }));
  }
  return hdrCache.get(key);
}

// brightest region of an equirect HDR -> sun direction (three.js equirect convention) + elevation
function findSun(t) {
  // weighted centre of the brightest 0.05% of the upper hemisphere (robust to bright cloud edges)
  const { data, width: W, height: H } = t.image;
  const half = data instanceof Uint16Array; const f = half ? THREE.DataUtils.fromHalfFloat : (x) => x;
  const lum = [];
  for (let y = 0; y < H / 2; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4; lum.push([f(data[i]) * 0.2126 + f(data[i + 1]) * 0.7152 + f(data[i + 2]) * 0.0722, x, y]);
  }
  lum.sort((a, b) => b[0] - a[0]);
  const top = lum.slice(0, Math.max(8, Math.floor(lum.length * 0.0005)));
  // average on the unit sphere so the seam at u = 0/1 doesn't break the mean
  const v = new THREE.Vector3(); let wsum = 0;
  for (const [l, x, y] of top) {
    const u = (x + 0.5) / W, vv = 1 - (y + 0.5) / H, el = (vv - 0.5) * Math.PI, ang = (u - 0.5) * 2 * Math.PI;
    v.x += l * Math.cos(el) * Math.cos(ang); v.y += l * Math.sin(el); v.z += l * Math.cos(el) * Math.sin(ang); wsum += l;
  }
  v.normalize();
  return { el: Math.asin(v.y), ang: Math.atan2(v.z, v.x), dir: v.clone(), peak: top[0][0] };
}
function horizonColour(t) {
  const { data, width: W, height: H } = t.image; const half = data instanceof Uint16Array; const f = half ? THREE.DataUtils.fromHalfFloat : (x) => x;
  const y = Math.floor(H * 0.47); let r = 0, g = 0, b = 0, n = 0;
  for (let x = 0; x < W; x += 4) { const i = (y * W + x) * 4; r += f(data[i]); g += f(data[i + 1]); b += f(data[i + 2]); n++; }
  return new THREE.Color(r / n, g / n, b / n);
}

export const SKY_PRESETS = [
  { id: 'procedural', label: 'Procedural – follows the time slider' },
  { id: 'belfast_sunset_puresky', label: 'Golden hour (photo sky)' },
  { id: 'kloppenheim_06_puresky', label: 'Late afternoon (photo sky)' },
  { id: 'satara_night_no_lamps', label: 'Night (photo sky)' },
];
