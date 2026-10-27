// Material library + surface registry.
//
// Every mesh in the twin is tagged with a *surface* name (e.g. "indoor_floor").
// A surface points at a *finish* (e.g. "terrazzo_sand"). The interior phase swaps
// finishes per surface with setFinish(surface, finishId) — geometry never changes.
//
// Finishes are procedural (canvas) so the twin runs offline with no asset pipeline;
// any finish can later be replaced by a photo/PBR texture set with the same id.
import * as THREE from 'three';
import { photoMaterial } from './assets.js';

const TEX_CACHE = new Map();
let anisotropy = 4;
export function setAnisotropy(a) { anisotropy = a; }

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(key, size, draw, { repeatM = 1, srgb = true } = {}) {
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.userData.tileM = repeatM;               // metres covered by one tile
  t.repeat.set(1 / repeatM, 1 / repeatM);
  TEX_CACHE.set(key, t);
  return t;
}

// tangent-space normal map from a texture's own luminance (dark joints/grain read as recessed)
const NORMAL_CACHE = new Map();
function normalFrom(tex, strength) {
  const key = `${tex.uuid}:${strength}`;
  if (NORMAL_CACHE.has(key)) return NORMAL_CACHE.get(key);
  const src = tex.image, n = src.width, m = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, n, m).data;
  const H = new Float32Array(n * m);
  for (let i = 0; i < n * m; i++) H[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  const c = document.createElement('canvas'); c.width = n; c.height = m;
  const g = c.getContext('2d', { willReadFrequently: true }); const img = g.createImageData(n, m);
  for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
    const h = (xx, yy) => H[((yy + m) % m) * n + ((xx + n) % n)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * n + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy;
  t.colorSpace = THREE.NoColorSpace; t.repeat.copy(tex.repeat);
  NORMAL_CACHE.set(key, t);
  return t;
}

const shade = (hex, f) => {
  const c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return `#${c.getHexString()}`;
};

// ----------------------------------------------------------------- texture painters
const painters = {
  terrazzo: (base, chips, seed) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 7; i++) {
      g.fillStyle = chips[(r() * chips.length) | 0];
      const s = 0.8 + r() * r() * 4;
      g.beginPath(); g.ellipse(r() * n, r() * n, s, s * (0.5 + r() * 0.6), r() * 3, 0, 7); g.fill();
    }
  },
  pavers: (base, seed, w = 6, h = 3) => (g, n) => {
    const r = rng(seed); const cw = n / w, ch = n / h;
    g.fillStyle = '#8a8a86'; g.fillRect(0, 0, n, n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const off = (j % 2) * cw * 0.5;
      g.fillStyle = shade(base, (r() - 0.5) * 0.08);
      g.fillRect(i * cw + off + 2, j * ch + 2, cw - 4, ch - 4);
      g.fillRect(i * cw + off + 2 - n, j * ch + 2, cw - 4, ch - 4);
      for (let k = 0; k < 120; k++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
        g.fillRect(i * cw + off + r() * cw, j * ch + r() * ch, 2, 2);
      }
    }
  },
  boards: (base, seed, boards = 8, gap = '#3a2a1c', grain = 0.08) => (g, n) => {
    const r = rng(seed); const bw = n / boards;
    g.fillStyle = gap; g.fillRect(0, 0, n, n);
    for (let i = 0; i < boards; i++) {
      let y = 0;
      while (y < n) {
        const len = n * (0.35 + r() * 0.65);
        g.fillStyle = shade(base, (r() - 0.5) * grain * 2);
        g.fillRect(i * bw + 1.5, y + 1.5, bw - 3, len - 3);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(40,20,5,${0.05 + r() * 0.07})`; g.lineWidth = 1;
          const x = i * bw + 3 + r() * (bw - 6);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + len); g.stroke();
        }
        y += len;
      }
    }
  },
  reeds: (seed) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = '#c6a57a'; g.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 3 + r() * 2) {
      g.fillStyle = shade('#dcc196', (r() - 0.5) * 0.16);
      g.fillRect(x, 0, 2.2 + r() * 1.5, n);
      if (r() < 0.25) { g.fillStyle = 'rgba(70,45,20,0.35)'; g.fillRect(x, r() * n, 3, 2); }
    }
    for (let y = 0; y < n; y += n / 4) { g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(0, y, n, 2); }
  },
  plaster: (base, seed) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 3; i++) {            // soft trowel marks
      g.fillStyle = `rgba(${r() < 0.5 ? '120,110,95' : '255,255,255'},${r() * 0.018})`;
      g.beginPath(); g.ellipse(r() * n, r() * n, 6 + r() * 22, 3 + r() * 9, r() * 3, 0, 7); g.fill();
    }
  },
  noise: (base, amp, seed, speck = 1.5) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < n * n / 6; i++) {
      g.fillStyle = shade(base, (r() - 0.5) * amp);
      g.fillRect(r() * n, r() * n, speck, speck);
    }
  },
  slats: (base, seed, count = 24) => (g, n) => {
    const r = rng(seed); const w = n / count;
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < count; i++) { g.fillStyle = shade(base, (r() - 0.5) * 0.15); g.fillRect(i * w + 1, 0, w - 2, n); }
  },
  leaves: (seed) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = '#3d6a33'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = shade('#4a7f3c', (r() - 0.5) * 0.14);
      g.beginPath(); g.ellipse(r() * n, r() * n, 2 + r() * 5, 1 + r() * 2.5, r() * 3, 0, 7); g.fill();
    }
  },
  ledgestone: (seed) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, n, n);
    let y = 0;
    while (y < n) {
      const h = 5 + r() * 9; let x = -r() * 40;
      while (x < n) {
        const w = 30 + r() * 90;
        const tone = shade(['#a7845e', '#9a7b58', '#b29068', '#8f7253', '#a3896c', '#97806a'][(r() * 6) | 0], (r() - 0.5) * 0.06);
        g.fillStyle = tone; g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 1, y + 1, w - 2, 2);
        x += w;
      }
      y += h;
    }
  },
  tiles: (base, grout, seed, k = 4) => (g, n) => {
    const r = rng(seed); const c = n / k;
    g.fillStyle = grout; g.fillRect(0, 0, n, n);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      g.fillStyle = shade(base, (r() - 0.5) * 0.1); g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
    }
  },
  pebbles: (seed) => (g, n) => {
    const r = rng(seed);
    g.fillStyle = '#d9d4ca'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = shade('#ece8df', (r() - 0.5) * 0.12);
      g.beginPath(); g.ellipse(r() * n, r() * n, 6 + r() * 10, 4 + r() * 6, r() * 3, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.stroke();
    }
  },
};

// Tileable wave normals: ~30 crests in every direction with a falling spectrum (amplitude ∝ 1/k), so a
// large sea doesn't line up into bands. Wave vectors are integers so the tile still wraps seamlessly.
function waterNormal(tileM = 6, seed = 7) {
  return canvasTex(`water_n_${tileM}_${seed}`, 256, (g, n) => {
    const img = g.createImageData(n, n); const r = rng(seed);
    const waves = [];
    while (waves.length < 30) {
      const kx = Math.round((r() - 0.5) * 20), ky = Math.round((r() - 0.5) * 20), k = Math.hypot(kx, ky);
      if (k >= 1.5) waves.push([r() * 6.28, kx, ky, (0.6 + r() * 0.8) / k]);
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let dx = 0, dy = 0;
      for (const [ph, kx, ky, a] of waves) {
        const t = (x * kx + y * ky) / n * 6.283 + ph; const c = Math.cos(t) * a;
        dx += c * kx * 0.09; dy += c * ky * 0.09;
      }
      const i = (y * n + x) * 4;
      img.data[i] = 128 + dx * 127; img.data[i + 1] = 128 + dy * 127; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeatM: tileM, srgb: false });
}

// ----------------------------------------------------------------- finish catalogue
// Each finish: { label, make() -> THREE.Material }. Keep labels human — they show in the UI.
const F = {};
const std = (o) => {
  const { bump, ...rest } = o;
  if (bump && rest.map) { rest.normalMap = normalFrom(rest.map, bump); rest.normalScale = new THREE.Vector2(1, 1); }
  return new THREE.MeshStandardMaterial(rest);
};
const tex = (key, size, painter, repeatM) => canvasTex(key, size, painter, { repeatM });

F.terrazzo_sand = { label: 'Terrazzo – sand', make: () => std({ bump: 0.6, map: tex('terrazzo_sand', 1024, painters.terrazzo('#ebe4d6', ['#d3c9b6', '#f7f4ee', '#c4b59c', '#ddd2bf'], 3), 1.6), roughness: 0.42, metalness: 0 }) };
F.terrazzo_white = { label: 'Terrazzo – white', make: () => std({ bump: 0.6, map: tex('terrazzo_white', 512, painters.terrazzo('#f1efea', ['#cfcac0', '#ffffff', '#b9b2a6'], 5), 1.2), roughness: 0.4 }) };
F.limestone = { label: 'Limestone tiles', make: () => std({ bump: 2.2, map: tex('limestone', 512, painters.pavers('#d8d0c0', 11, 2, 2), 1.2), roughness: 0.6 }) };
F.oak_floor = { label: 'Oak boards', make: () => std({ bump: 1.6, map: tex('oak', 512, painters.boards('#b48a5a', 13, 6, '#6b4a2a', 0.06), 1.2), roughness: 0.55 }) };
F.pavers_grey = { label: 'Grey stone pavers', make: () => std({ bump: 3.2, map: tex('pavers_grey', 512, painters.pavers('#9d9c97', 21), 1.8), roughness: 0.85 }) };
F.pavers_sand = { label: 'Sand stone pavers', make: () => std({ bump: 3.2, map: tex('pavers_sand', 512, painters.pavers('#cbbd9f', 22), 1.8), roughness: 0.85 }) };
F.teak_deck = { label: 'Teak decking', make: () => std({ bump: 2.2, map: tex('teak', 512, painters.boards('#9a6236', 31, 7, '#3a2210', 0.1), 1.0), roughness: 0.6 }) };
F.composite_grey = { label: 'Grey composite deck', make: () => std({ bump: 2.2, map: tex('composite', 512, painters.boards('#6e6b67', 32, 7, '#2e2c2a', 0.06), 1.0), roughness: 0.7 }) };
F.plaster_white = { label: 'White lime plaster', make: () => std({ bump: 1.2, map: tex('plaster_white', 256, painters.plaster('#f4f2ee', 41), 2.5), roughness: 0.92 }) };
F.plaster_warm = { label: 'Warm white plaster', make: () => std({ bump: 1.2, map: tex('plaster_warm', 256, painters.plaster('#efe7da', 42), 2.5), roughness: 0.92 }) };
F.plaster_sand = { label: 'Sand plaster', make: () => std({ bump: 1.2, map: tex('plaster_sand', 256, painters.plaster('#dcc9a8', 43), 2.5), roughness: 0.92 }) };
F.reed_ceiling = { label: 'Reed / bamboo ceiling', make: () => std({ bump: 2.5, map: tex('reeds', 512, painters.reeds(51), 1.0), roughness: 0.8, side: THREE.DoubleSide }) };
F.white_ceiling = { label: 'White plaster ceiling', make: () => std({ color: '#f2f0ec', roughness: 0.95, side: THREE.DoubleSide }) };
F.timber_slats = { label: 'Timber slats', make: () => std({ bump: 2.5, map: tex('slats', 256, painters.slats('#8a5a34', 61), 0.6), roughness: 0.6 }) };
F.pebble_wall = { label: 'White pebble wall', make: () => std({ bump: 4, map: tex('pebbles', 512, painters.pebbles(71), 1.0), roughness: 0.8 }) };
F.black_metal = { label: 'Black powder-coat (RAL 9005)', make: () => std({ color: '#1b1b1c', roughness: 0.45, metalness: 0.6 }) };
F.bronze_metal = { label: 'Bronze metal', make: () => std({ color: '#5a4630', roughness: 0.4, metalness: 0.8 }) };
F.glass_clear = { label: 'Clear glass', make: () => std({ color: '#cfe6e4', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }) };
F.glass_grey = { label: 'Grey reflective glass (spec)', make: () => std({ color: '#7c8a8a', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 }) };
F.glass_dark = { label: 'Dark glass', make: () => std({ color: '#1d2830', roughness: 0.05, metalness: 0.6, envMapIntensity: 2 }) };
F.sand = { label: 'Beach sand', make: () => std({ bump: 1.2, map: tex('sand', 256, painters.noise('#d8bd88', 0.07, 81), 3), roughness: 1 }) };
F.lawn = { label: 'Lawn', make: () => std({ bump: 1.5, map: tex('grass', 256, painters.noise('#6f9448', 0.1, 82, 2), 2), roughness: 1 }) };
F.landscape = { label: 'Landscape paving', make: () => std({ map: tex('land', 256, painters.noise('#c8bfae', 0.08, 83), 3), roughness: 0.95 }) };
F.foliage = { label: 'Foliage', make: () => std({ bump: 2, map: tex('leaves', 256, painters.leaves(91), 1.2), roughness: 0.9 }) };
F.gravel = { label: 'White gravel', make: () => std({ bump: 2, map: tex('gravel', 256, painters.noise('#d4d0c8', 0.3, 92, 3), 0.8), roughness: 1 }) };
F.sea = {
  // swell on the base layer, ripples (other scale, other angle) on the clearcoat: the two never tile in step,
  // and the clearcoat gives water's Fresnel sky reflection, strongest toward the horizon
  label: 'Sea', make: () => {
    const ripples = waterNormal(7, 23); ripples.rotation = 0.7;
    return new THREE.MeshPhysicalMaterial({
      color: '#2a8b98', roughness: 0.4, metalness: 0, specularIntensity: 0.25,
      normalMap: waterNormal(41, 11), normalScale: new THREE.Vector2(0.22, 0.22),
      clearcoat: 1, clearcoatRoughness: 0.07, clearcoatNormalMap: ripples, clearcoatNormalScale: new THREE.Vector2(0.16, 0.16),
      transparent: true, opacity: 0.93, envMapIntensity: 1,
    });
  },
};
F.pool = {
  label: 'Pool water', make: () => std({ color: '#48c9d8', roughness: 0.12, metalness: 0.05, normalMap: waterNormal(5), normalScale: new THREE.Vector2(0.12, 0.12), transparent: true, opacity: 0.82, envMapIntensity: 0.8 }),
};
// soft goods
F.fabric_ecru = { label: 'Ecru linen', make: () => std({ bump: 0.8, map: tex('ecru', 128, painters.noise('#ece4d4', 0.06, 101), 0.4), roughness: 1 }) };
F.fabric_white = { label: 'White canvas', make: () => std({ bump: 0.8, map: tex('fabwhite', 128, painters.noise('#f6f4ef', 0.05, 102), 0.4), roughness: 1 }) };
F.fabric_taupe = { label: 'Taupe outdoor fabric', make: () => std({ bump: 0.8, map: tex('taupe', 128, painters.noise('#9c8f7e', 0.08, 103), 0.4), roughness: 1 }) };
F.fabric_terracotta = { label: 'Terracotta linen', make: () => std({ bump: 0.8, map: tex('terra', 128, painters.noise('#c0714a', 0.08, 104), 0.4), roughness: 1 }) };
F.fabric_olive = { label: 'Olive linen', make: () => std({ bump: 0.8, map: tex('olive', 128, painters.noise('#7d7a52', 0.08, 105), 0.4), roughness: 1 }) };
F.fabric_aegean = { label: 'Aegean blue linen', make: () => std({ bump: 0.8, map: tex('aegean', 128, painters.noise('#2f5f8f', 0.08, 106), 0.4), roughness: 1 }) };
F.rattan = { label: 'Natural rattan', make: () => std({ bump: 2, map: tex('rattan', 128, painters.slats('#b08a55', 111, 16), 0.15), roughness: 0.85 }) };
F.rope_white = { label: 'White rope weave', make: () => std({ bump: 2, map: tex('rope', 128, painters.slats('#ebe5d8', 112, 20), 0.12), roughness: 0.95 }) };
F.teak_furniture = { label: 'Teak', make: () => std({ bump: 1.4, map: tex('teakf', 256, painters.boards('#8f5c34', 121, 4, '#5a3a20', 0.05), 0.8), roughness: 0.55 }) };
F.white_lacquer = { label: 'White lacquer', make: () => std({ color: '#f3f1ec', roughness: 0.35 }) };
F.marble_white = { label: 'White marble', make: () => std({ bump: 0.4, map: tex('marble', 256, painters.terrazzo('#f2f0ec', ['#d9d6d0', '#e6e3dd'], 131), 1), roughness: 0.25 }) };
F.ceramic_terracotta = { label: 'Terracotta', make: () => std({ color: '#b8683f', roughness: 0.8 }) };
F.lamp_rattan = { label: 'Rattan lamp', make: () => std({ color: '#a47b4b', roughness: 0.9, emissive: '#ffb066', emissiveIntensity: 0 }) };
F.lamp_globe = { label: 'Opal globe', make: () => std({ color: '#fbf6ee', roughness: 0.3, emissive: '#ffd9a0', emissiveIntensity: 0 }) };
F.bark = { label: 'Bark', make: () => std({ color: '#6b5440', roughness: 1 }) };
F.palm_frond = { label: 'Palm frond', make: () => std({ color: '#4f7a33', roughness: 0.9, side: THREE.DoubleSide }) };
F.context = { label: 'Context massing', make: () => std({ color: '#e9e5dd', roughness: 0.95 }) };
F.tower = {
  label: 'Skyline', make: () => {
    // glass towers: banded floors + random lit windows (emissive at dusk)
    const map = canvasTex('tower', 256, (g, n) => {
      const r = rng(161);
      g.fillStyle = '#6f8796'; g.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 16) {
        g.fillStyle = '#c9d3d8'; g.fillRect(0, y, n, 2);
        for (let x = 0; x < n; x += 8) { g.fillStyle = shade('#7f97a6', (r() - 0.5) * 0.12); g.fillRect(x + 1, y + 3, 6, 12); }
      }
    });
    const em = canvasTex('tower_em', 256, (g, n) => {
      const r = rng(162);
      g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 16) for (let x = 0; x < n; x += 8) if (r() < 0.35) { g.fillStyle = r() < 0.7 ? '#ffd9a0' : '#f4f6ff'; g.fillRect(x + 1, y + 3, 6, 12); }
    });
    return std({ map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.25, metalness: 0.4 });
  },
};

F.terracotta_tiles = { label: 'Terracotta tiles', make: () => std({ bump: 3, map: tex('terracotta', 256, painters.tiles('#b8663c', '#7b4a32', 141), 1.2), roughness: 0.75 }) };
F.limestone_treads = { label: 'Limestone', make: () => std({ bump: 2.2, map: tex('limetread', 256, painters.tiles('#e2d9c6', '#b9ae98', 142, 2), 1.2), roughness: 0.7 }) };
F.ledgestone = { label: 'Stacked ledgestone', make: () => std({ bump: 4.5, map: tex('ledgestone', 512, painters.ledgestone(143), 0.75), roughness: 0.9 }) };
F.screed = { label: 'Concrete screed (stripped)', make: () => std({ bump: 1.2, map: tex('screed', 256, painters.noise('#a9a59d', 0.12, 144, 2), 2), roughness: 0.95 }) };
// fixed (not offered in the finishes panel)
F.door_timber = { label: 'Dark timber', make: () => std({ bump: 1.6, map: tex('doortimber', 256, painters.boards('#4a2c1a', 151, 5, '#2a170c', 0.06), 0.8), roughness: 0.55 }) };
F.black_stone = { label: 'Black stone', make: () => std({ color: '#2b2d30', roughness: 0.35, metalness: 0.1 }) };
F.black_metal_fixed = { label: 'Black metal', make: () => std({ color: '#151515', roughness: 0.5, metalness: 0.6 }) };
F.iron_rail = { label: 'Wrought iron', make: () => std({ color: '#151515', roughness: 0.5, metalness: 0.6 }) };
F.dome = { label: 'Dome', make: () => std({ color: '#f3efe8', roughness: 0.9, side: THREE.DoubleSide }) };
F.white_ceiling_fixed = { label: 'White ceiling', make: () => std({ color: '#efece6', roughness: 0.95, side: THREE.DoubleSide }) };
F.glass_dark_trans = { label: 'Dark glass', make: () => std({ color: '#26343b', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 }) };
F.limestone_fixed = { label: 'Limestone', make: () => std({ color: '#e6e0d2', roughness: 0.7 }) };
F.timber_beam = { label: 'Timber pole', make: () => std({ color: '#8a6440', roughness: 0.8 }) };
F.cove_light = { label: 'Cove light', make: () => std({ color: '#fff3dd', emissive: '#ffcf8a', emissiveIntensity: 0, roughness: 1 }) };

export const FINISHES = F;

// ----------------------------------------------------------------- surfaces (what the design panel edits)
// group -> shown together in the UI; choices -> finishes offered for that surface
export const SURFACES = {
  indoor_floor:   { label: 'Indoor floor',          group: 'Indoor',   finish: 'terrazzo_sand', choices: ['terrazzo_sand', 'terrazzo_white', 'limestone', 'oak_floor'] },
  indoor_walls:   { label: 'Indoor walls',          group: 'Indoor',   finish: 'plaster_white', choices: ['plaster_white', 'plaster_warm', 'plaster_sand', 'pebble_wall'] },
  indoor_ceiling: { label: 'Indoor ceiling',        group: 'Indoor',   finish: 'reed_ceiling',  choices: ['reed_ceiling', 'white_ceiling', 'timber_slats'] },
  columns:        { label: 'Columns',               group: 'Indoor',   finish: 'plaster_white', choices: ['plaster_white', 'plaster_warm', 'plaster_sand', 'timber_slats'] },
  bar_front:      { label: 'Bar front',             group: 'Indoor',   finish: 'timber_slats',  choices: ['timber_slats', 'pebble_wall', 'plaster_white', 'rattan'] },
  bar_top:        { label: 'Bar top',               group: 'Indoor',   finish: 'marble_white',  choices: ['marble_white', 'white_lacquer', 'teak_furniture'] },
  planters:       { label: 'Planters / low walls',  group: 'Indoor',   finish: 'plaster_white', choices: ['plaster_white', 'plaster_sand', 'timber_slats'] },
  smoking_floor:  { label: 'Smoking pods floor',    group: 'Smoking pods', finish: 'terrazzo_sand', choices: ['terrazzo_sand', 'terrazzo_white', 'limestone', 'teak_deck'] },
  smoking_ceiling:{ label: 'Smoking pods ceiling',  group: 'Smoking pods', finish: 'reed_ceiling', choices: ['reed_ceiling', 'white_ceiling', 'timber_slats'] },
  partitions:     { label: 'Pod partitions',        group: 'Smoking pods', finish: 'glass_clear', choices: ['glass_clear', 'glass_grey', 'rope_white', 'timber_slats'] },
  frames:         { label: 'Glazing frames',        group: 'Facade',   finish: 'black_metal',   choices: ['black_metal', 'bronze_metal', 'white_lacquer'] },
  glazing:        { label: 'Glazing',               group: 'Facade',   finish: 'glass_clear',   choices: ['glass_clear', 'glass_grey'] },
  facade:         { label: 'Exterior walls',        group: 'Facade',   finish: 'plaster_white', choices: ['plaster_white', 'plaster_warm', 'plaster_sand'] },
  courtyard_floor:{ label: 'Courtyard paving',      group: 'Courtyard', finish: 'pavers_grey',  choices: ['pavers_grey', 'pavers_sand', 'limestone', 'terrazzo_sand'] },
  courtyard_walls:{ label: 'Courtyard low walls',   group: 'Courtyard', finish: 'plaster_white', choices: ['plaster_white', 'plaster_sand'] },
  pergola_roof:   { label: 'Pergola roof slats',    group: 'Courtyard', finish: 'timber_slats', choices: ['timber_slats', 'rattan', 'white_lacquer', 'black_metal'] },
  platform_deck:  { label: 'Platform deck',         group: 'Courtyard', finish: 'teak_deck',    choices: ['teak_deck', 'composite_grey', 'limestone'] },
  stair_treads:   { label: 'Stair treads',          group: 'Stair & upper floor', finish: 'terracotta_tiles', choices: ['terracotta_tiles', 'limestone_treads', 'oak_floor', 'terrazzo_sand'] },
  stone_cladding: { label: 'Stair hall walls',      group: 'Stair & upper floor', finish: 'ledgestone', choices: ['ledgestone', 'plaster_white', 'plaster_sand', 'pebble_wall'] },
  landing_walls:  { label: 'Landing & door jamb',   group: 'Stair & upper floor', finish: 'ledgestone', choices: ['ledgestone', 'plaster_white', 'plaster_sand'] },
  upper_floor:    { label: 'Upper floor',           group: 'Stair & upper floor', finish: 'screed', choices: ['screed', 'terrazzo_sand', 'oak_floor', 'limestone'] },
  beach_deck:     { label: 'Beach deck',            group: 'Beach',    finish: 'composite_grey', choices: ['composite_grey', 'teak_deck', 'limestone'] },
  upholstery:     { label: 'Upholstery',            group: 'Furniture', finish: 'fabric_ecru',  choices: ['fabric_ecru', 'fabric_white', 'fabric_taupe', 'fabric_terracotta', 'fabric_olive', 'fabric_aegean'] },
  outdoor_fabric: { label: 'Outdoor cushions',      group: 'Furniture', finish: 'fabric_white', choices: ['fabric_white', 'fabric_ecru', 'fabric_taupe', 'fabric_terracotta', 'fabric_aegean'] },
  furniture_frame:{ label: 'Furniture frames',      group: 'Furniture', finish: 'rattan',       choices: ['rattan', 'teak_furniture', 'rope_white', 'white_lacquer', 'black_metal'] },
  tabletops:      { label: 'Table tops',            group: 'Furniture', finish: 'teak_furniture', choices: ['teak_furniture', 'marble_white', 'white_lacquer'] },
};

// One shared material instance per surface, so a finish swap is a single property copy.
const SURFACE_MAT = new Map();
const FIXED_MAT = new Map();

export function surfaceMaterial(surface) {
  if (!SURFACE_MAT.has(surface)) {
    const s = SURFACES[surface];
    const m = FINISHES[s.finish].make();
    m.name = surface;
    SURFACE_MAT.set(surface, m);
  }
  return SURFACE_MAT.get(surface);
}

// materials that are not user-editable (sand, sea, foliage...)
export function fixedMaterial(finish) {
  if (!FIXED_MAT.has(finish)) {
    const m = FINISHES[finish].make(); m.name = finish; FIXED_MAT.set(finish, m);
  }
  return FIXED_MAT.get(finish);
}

const LISTENERS = new Set();
export function onFinishChange(fn) { LISTENERS.add(fn); }

export function setFinish(surface, finishId) {
  const s = SURFACES[surface]; if (!s || !FINISHES[finishId]) return;
  s.finish = finishId;
  const target = surfaceMaterial(surface);
  const fresh = FINISHES[finishId].make();
  // copy the visual properties onto the shared instance (keeps every mesh pointer valid)
  for (const k of ['color', 'map', 'roughness', 'metalness', 'transparent', 'opacity', 'depthWrite', 'side', 'normalMap', 'normalScale',
    'roughnessMap', 'aoMap', 'aoMapIntensity', 'alphaMap', 'alphaTest', 'emissive', 'envMapIntensity']) {
    if (fresh[k] !== undefined) target[k] = fresh[k]?.clone && !(fresh[k] instanceof THREE.Texture) ? fresh[k].clone() : fresh[k];
  }
  for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'alphaMap']) if (!fresh[k]) target[k] = null;
  target.needsUpdate = true;
  LISTENERS.forEach((fn) => fn(surface, finishId));
}

export function currentScheme() {
  return Object.fromEntries(Object.entries(SURFACES).map(([k, v]) => [k, v.finish]));
}
export function applyScheme(scheme) {
  for (const [k, v] of Object.entries(scheme || {})) setFinish(k, v);
}

// lamp materials (driven by time of day)
export function lampMaterials() {
  return [fixedMaterial('lamp_rattan'), fixedMaterial('lamp_globe'), fixedMaterial('cove_light'), fixedMaterial('tower')];
}

// ---------------------------------------------------------------- photo-scanned finishes (assets/web)
// Registered at startup when the downloaded library is present. They become the default finish of
// their surface; the procedural finishes above stay selectable (and are the fallback when offline).

const PHOTO = [
  // finish id,               texture set,             label,                                   options
  ['ph_white_plaster',        'PaintedPlaster017',     'White lime plaster (photo)',            { tileM: 2.0, neutral: true, tint: '#f6f3ec', normal: 0.7 }],
  ['ph_rough_plaster',        'white_plaster_02',      'Hand-trowelled plaster (photo)',        { tileM: 1.8, neutral: true, tint: '#f1ebe0', normal: 0.8 }],
  ['ph_painted_plaster',      'painted_plaster_wall',  'Exterior lime wash (photo)',            { tileM: 2.5, neutral: true, tint: '#f4f0e8', normal: 0.8 }],
  ['ph_sand_plaster',         'PaintedPlaster017',     'Sand plaster (photo, tinted)',          { tileM: 2.0, neutral: true, tint: '#e3cfae', normal: 0.7 }],
  ['ph_reed',                 'Wicker013',             'Reed slat ceiling (photo)',             { tileM: 0.9, side: THREE.DoubleSide }],
  ['ph_rattan',               'Wicker010A',            'Rattan weave (photo)',                  { tileM: 0.3 }],
  ['ph_stone_pavers',         'marble_01',             'Grey stone pavers (photo, tinted)',     { tileM: 2.4, neutral: true, tint: '#aeaca7' }],
  ['ph_limestone',            'marble_01',             'Limestone tiles (photo)',               { tileM: 2.4 }],
  ['ph_flagstone',            'stone_tiles_02',        'Crazy-paving flagstone (photo)',        { tileM: 2.4 }],
  ['ph_travertine',           'Travertine009',         'Travertine (photo)',                    { tileM: 1.2 }],
  ['ph_terrazzo_bold',        'Terrazzo018',           'Bold terrazzo (photo)',                 { tileM: 1.0 }],
  ['ph_teak_planks',          'brown_planks_03',       'Teak planks (photo, tinted)',           { tileM: 2.0, neutral: true, tint: '#c48a5a' }],
  ['ph_grey_planks',          'brown_planks_03',       'Weathered grey deck (photo)',           { tileM: 2.0 }],
  ['ph_linen',                'rough_linen',           'Ecru linen (photo)',                    { tileM: 0.5, neutral: true, tint: '#ece3d2' }],
  ['ph_linen_white',          'rough_linen',           'White linen (photo)',                   { tileM: 0.5, neutral: true, tint: '#fbf8f1' }],
  ['ph_linen_terracotta',     'rough_linen',           'Terracotta linen (photo)',              { tileM: 0.5, neutral: true, tint: '#c98260' }],
  ['ph_linen_olive',          'rough_linen',           'Olive linen (photo)',                   { tileM: 0.5, neutral: true, tint: '#9a9566' }],
  ['ph_linen_aegean',         'rough_linen',           'Aegean blue linen (photo)',             { tileM: 0.5, neutral: true, tint: '#5f8fbf' }],
  ['ph_ledgestone',           'castle_wall_slates',    'Warm stacked stone (photo, tinted)',    { tileM: 1.5, neutral: true, tint: '#d9b98f' }],
  ['ph_slate',                'castle_wall_slates',    'Grey stacked slate (photo)',            { tileM: 1.5 }],
  ['ph_concrete',             'concrete_floor_02',     'Concrete screed (photo)',               { tileM: 2.5 }],
  ['ph_terracotta',           'Travertine009',         'Terracotta (photo, tinted)',            { tileM: 1.2, tint: '#d98a5f' }],
];
const PHOTO_DEFAULTS = {
  indoor_walls: 'ph_white_plaster', indoor_ceiling: 'ph_reed', columns: 'ph_white_plaster', bar_top: 'ph_travertine',
  planters: 'ph_white_plaster', smoking_ceiling: 'ph_reed', facade: 'ph_painted_plaster', courtyard_floor: 'ph_stone_pavers',
  courtyard_walls: 'ph_white_plaster', platform_deck: 'ph_teak_planks', beach_deck: 'ph_grey_planks', upholstery: 'ph_linen',
  outdoor_fabric: 'ph_linen_white', furniture_frame: 'ph_rattan', tabletops: 'ph_teak_planks', stair_treads: 'ph_terracotta',
  stone_cladding: 'ph_ledgestone', landing_walls: 'ph_ledgestone', upper_floor: 'ph_concrete',
  // indoor / pod floors stay on the procedural fine beige terrazzo (closest to the video); photo floors are offered
};
const PHOTO_OFFER = { indoor_floor: ['ph_travertine', 'ph_limestone', 'ph_terrazzo_bold', 'ph_concrete'], smoking_floor: ['ph_travertine', 'ph_limestone', 'ph_terrazzo_bold'] };
// fixed (non-editable) materials upgraded in place
const PHOTO_FIXED = {
  sand: ['sand_01', { tileM: 3 }], lawn: ['leafy_grass', { tileM: 2.5 }], gravel: ['ganges_river_pebbles', { tileM: 1.2 }],
  bark: ['palm_tree_bark', { tileM: 1.5 }], limestone_fixed: ['Travertine009', { tileM: 1.2 }],
  teak_deck: ['brown_planks_03', { tileM: 2, neutral: true, tint: '#c48a5a' }], rope: ['Rope001', { tileM: 0.25 }],
};

export function registerPhotoFinishes(index) {
  if (!index) return 0;
  let n = 0;
  for (const [fid, set, label, opts] of PHOTO) {
    if (!index.textures.find((t) => t.id === set)) continue;
    FINISHES[fid] = { label, make: () => photoMaterial(set, opts) };
    n++;
  }
  for (const [surface, list] of Object.entries(PHOTO_OFFER)) {
    const s = SURFACES[surface]; if (s) s.choices = [...new Set([...s.choices, ...list.filter((f) => FINISHES[f])])];
  }
  for (const [surface, fid] of Object.entries(PHOTO_DEFAULTS)) {
    const s = SURFACES[surface]; if (!s || !FINISHES[fid]) continue;
    s.choices = [fid, ...PHOTO.filter(([id]) => id !== fid && FINISHES[id] && relatedTo(surface, id)).map(([id]) => id), ...s.choices];
    s.choices = [...new Set(s.choices)];
    s.finish = fid;
  }
  for (const [fid, [set, opts]] of Object.entries(PHOTO_FIXED)) {
    if (!index.textures.find((t) => t.id === set)) continue;
    const label = FINISHES[fid]?.label || fid; FINISHES[fid] = { label, make: () => photoMaterial(set, opts) };
  }
  return n;
}
// which extra photo finishes make sense as alternatives on a surface
function relatedTo(surface, fid) {
  const floors = ['ph_travertine', 'ph_limestone', 'ph_stone_pavers', 'ph_flagstone', 'ph_terrazzo_bold', 'ph_teak_planks', 'ph_concrete'];
  const walls = ['ph_white_plaster', 'ph_rough_plaster', 'ph_painted_plaster', 'ph_sand_plaster', 'ph_ledgestone', 'ph_slate'];
  const soft = ['ph_linen', 'ph_linen_white', 'ph_linen_terracotta', 'ph_linen_olive', 'ph_linen_aegean'];
  const map = {
    courtyard_floor: floors, upper_floor: floors, platform_deck: ['ph_grey_planks', 'ph_travertine'], beach_deck: ['ph_teak_planks', 'ph_travertine'],
    indoor_walls: walls, facade: walls, courtyard_walls: walls, columns: walls, planters: walls, stone_cladding: walls, landing_walls: walls,
    indoor_ceiling: ['ph_white_plaster'], smoking_ceiling: ['ph_white_plaster'], upholstery: soft, outdoor_fabric: soft,
    furniture_frame: ['ph_teak_planks'], tabletops: ['ph_travertine', 'ph_limestone'], bar_top: ['ph_limestone', 'ph_teak_planks'],
    stair_treads: ['ph_travertine', 'ph_limestone', 'ph_teak_planks'],
  };
  return (map[surface] || []).includes(fid);
}
