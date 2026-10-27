// Material library for the Skybrew themes (Bali / Riviera), painted from the contractor's render pack.
// Every texture is procedural (canvas) so it tiles cleanly at true scale; relief comes from a painted height
// map turned into a normal map, and glazed / polished surfaces get their own roughness map.
//   mat(key)            -> a shared MeshStandard/PhysicalMaterial for dressing and props (UVs in metres)
//   mat(key, {rep})     -> same look, texture repeat overridden (for primitives with 0..1 UVs)
// Colours are sampled from the renders (see THEMES.md for the per-render notes).
import * as THREE from 'three';
import { photoMaterial, assetIndex } from './assets.js';

let ANISO = 8;
export const setKitAnisotropy = (a) => { ANISO = a; };

// ------------------------------------------------------------------ canvas helpers
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// texture-source canvases ask for CPU backing (willReadFrequently): Safari otherwise keeps every 2D canvas in GPU memory,
// next to the texture uploaded from it — with hundreds of painted canvases that alone can cost Safari its WebGL context
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function shade(hex, f) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return `#${c.getHexString()}`; }
function mix(a, b, t) { return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`; }

function texture(c, { srgb = true, tileM = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const [tx, ty] = Array.isArray(tileM) ? tileM : [tileM, tileM];
  t.repeat.set(1 / tx, 1 / ty); t.userData.tileM = [tx, ty];
  return t;
}
// height canvas (white = proud) -> tangent-space normal map
function normalFrom(hc, strength) {
  const n = hc.width, m = hc.height; const d = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, n, m).data;
  const H = new Float32Array(n * m); for (let i = 0; i < n * m; i++) H[i] = d[i * 4] / 255;
  const out = canvas(n, m); const g = out.getContext('2d', { willReadFrequently: true }); const img = g.createImageData(n, m);
  for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
    const h = (xx, yy) => H[((yy + m) % m) * n + ((xx + n) % n)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return out;
}
// paint colour + height (+ roughness / alpha) in one pass: draw(ctx, n, r) gets { c, h, ro, a } 2D contexts
function paint(size, seed, draw, { rough = false, alpha = false, hBase = '#808080', roBase = '#ffffff', w } = {}) {
  const W = w || size;
  const cc = canvas(W, size), hc = canvas(W, size), rc = rough ? canvas(W, size) : null, ac = alpha ? canvas(W, size) : null;
  const ctx = { c: cc.getContext('2d', { willReadFrequently: true }), h: hc.getContext('2d', { willReadFrequently: true }), ro: rc?.getContext('2d', { willReadFrequently: true }), a: ac?.getContext('2d', { willReadFrequently: true }) };
  ctx.h.fillStyle = hBase; ctx.h.fillRect(0, 0, W, size);
  if (rc) { ctx.ro.fillStyle = roBase; ctx.ro.fillRect(0, 0, W, size); }
  if (ac) { ctx.a.fillStyle = '#000'; ctx.a.fillRect(0, 0, W, size); }
  draw(ctx, size, rng(seed), W);
  return { color: cc, height: hc, rough: rc, alpha: ac };
}

// ------------------------------------------------------------------ painters (one per finish in the renders)
const P = {};
// Balinese ikat cushion: indigo stepped diamonds with feathered (bleeding) edges on natural cotton
P.ikat = () => paint(512, 11, ({ c, h }, n, r) => {
  c.fillStyle = '#efe8da'; c.fillRect(0, 0, n, n);
  const cell = n / 4;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const cx = i * cell + (j % 2) * cell / 2, cy = j * cell * 0.9;
    for (let k = 0; k < 90; k++) {                   // horizontal streaks = ikat's blurred resist edge
      const t = (k / 90) * 2 - 1, half = (1 - Math.abs(t)) * cell * 0.46;
      const y = cy + t * cell * 0.46, j0 = (r() - 0.5) * 7;
      c.fillStyle = `rgba(32,48,92,${0.82 + r() * 0.18})`;
      c.fillRect(cx - half + j0, y, half * 2 + (r() - 0.5) * 6, 2.2);
      if (Math.abs(t) < 0.42) { c.fillStyle = '#efe8da'; const hh = (0.42 - Math.abs(t)) * cell * 0.5; c.fillRect(cx - hh + (r() - 0.5) * 4, y, hh * 2, 2.2); }
    }
  }
  for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,40,60'},0.05)`; c.fillRect(r() * n, r() * n, 1, 2); }
  for (let y = 0; y < n; y += 2) { h.fillStyle = y % 4 ? '#7a7a7a' : '#868686'; h.fillRect(0, y, n, 1); }
});
P.stripes = (a, b, count, seed = 3) => paint(256, seed, ({ c, h }, n, r) => {
  const w = n / count;
  for (let i = 0; i < count; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(i * w, 0, w, n); }
  for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.05})`; c.fillRect(r() * n, r() * n, 1, 1); }
  for (let y = 0; y < n; y += 2) { h.fillStyle = y % 4 ? '#7c7c7c' : '#848484'; h.fillRect(0, y, n, 1); }
});
P.linen = (base, seed = 5) => paint(256, seed, ({ c, h }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 2600; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.08); c.fillRect(r() * n, r() * n, 1 + r() * 6, 1); c.fillRect(r() * n, r() * n, 1, 1 + r() * 6); }
  for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) { h.fillStyle = (x + y) % 4 ? '#6f6f6f' : '#909090'; h.fillRect(x, y, 2, 2); }
});
P.velvet = (base, seed = 7) => paint(256, seed, ({ c, h }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 400; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.06); c.beginPath(); c.ellipse(r() * n, r() * n, 4 + r() * 14, 2 + r() * 8, r() * 3, 0, 7); c.fill(); }
});
// terrazzo: angular chips in a cement base; polished = low roughness, chips slightly glossier
P.terrazzo = (base, chips, density, maxChip, seed) => paint(512, seed, ({ c, h, ro }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < n * n / 30; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.06); c.fillRect(r() * n, r() * n, 2, 2); }
  for (let i = 0; i < density; i++) {
    const s = 1 + r() * r() * maxChip, x = r() * n, y = r() * n, k = 3 + ((r() * 4) | 0);
    c.fillStyle = chips[(r() * chips.length) | 0];
    c.beginPath();
    for (let v = 0; v < k; v++) { const a = (v / k) * 6.283 + r() * 0.8, rr = s * (0.6 + r() * 0.6); c[v ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill(); ro.fillStyle = '#c8c8c8'; ro.fill();
  }
}, { rough: true });
// glazed ceramic tiles; bond: 'stack' | 'running' | 'herringbone'; colours chosen per tile
P.tiles = ({ cols, rows, palette, grout = '#e9e4dc', bond = 'stack', size = 512, seed = 9, glaze = 0.24, gf = 0.06, w }) => paint(size, seed, ({ c, h, ro }, n, r, W) => {
  c.fillStyle = grout; c.fillRect(0, 0, W, n); h.fillStyle = '#3a3a3a'; h.fillRect(0, 0, W, n); ro.fillStyle = '#e6e6e6'; ro.fillRect(0, 0, W, n);
  const tile = (x, y, tw, th, col) => {
    const gw = Math.max(1.5, Math.min(tw, th) * gf);                // grout width (fraction of the tile)
    const g = c.createLinearGradient(x, y, x + tw, y + th);
    g.addColorStop(0, shade(col, 0.06)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.07));
    c.fillStyle = g; c.fillRect(x + gw / 2, y + gw / 2, tw - gw, th - gw);
    for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(255,255,255,${r() * 0.07})`; c.beginPath(); c.ellipse(x + r() * tw, y + r() * th, tw * 0.2, th * 0.12, r() * 3, 0, 7); c.fill(); }
    c.strokeStyle = `rgba(0,0,0,0.12)`; c.lineWidth = 1.5; c.strokeRect(x + gw / 2 + 1, y + gw / 2 + 1, tw - gw - 2, th - gw - 2);
    const hg = h.createRadialGradient(x + tw / 2, y + th / 2, 0, x + tw / 2, y + th / 2, Math.max(tw, th) * 0.7);
    hg.addColorStop(0, '#d8d8d8'); hg.addColorStop(1, '#a8a8a8'); h.fillStyle = hg; h.fillRect(x + gw / 2, y + gw / 2, tw - gw, th - gw);
    ro.fillStyle = `rgb(${(glaze * 255) | 0},${(glaze * 255) | 0},${(glaze * 255) | 0})`; ro.fillRect(x + gw / 2, y + gw / 2, tw - gw, th - gw);
  };
  const pick = () => palette[(r() * palette.length) | 0];
  if (bond === 'herringbone') {
    // chevron of glazed bricks (ST01 Riviera render): columns slope alternately up / down at 45°,
    // rows alternate blue and white. u = column width, hgt = vertical brick pitch; tiles wrap.
    const u = W / 4, hgt = n / 8, gw = 3;
    const brick = (g, x0, y, sgn, fill) => {
      g.beginPath(); g.moveTo(x0 + gw, y + gw - sgn * gw); g.lineTo(x0 + u - gw, y - sgn * (u - gw) + gw); g.lineTo(x0 + u - gw, y - sgn * (u - gw) + hgt - gw); g.lineTo(x0 + gw, y + hgt - gw - sgn * gw); g.closePath();
      g.fillStyle = fill; g.fill();
    };
    for (let i = 0; i < 4; i++) {
      const sgn = i % 2 ? -1 : 1, x0 = i * u;
      for (let k = -4; k < 16; k++) {
        const y = k * hgt + (sgn > 0 ? 0 : -u + hgt * 0);
        const col = palette[((k % 2) + 2) % 2];
        for (const oy of [0, n, -n]) {
          brick(c, x0, y + oy + (sgn > 0 ? u : 0), sgn, shade(col, (r() - 0.5) * 0.06));
          brick(h, x0, y + oy + (sgn > 0 ? u : 0), sgn, '#c8c8c8');
          brick(ro, x0, y + oy + (sgn > 0 ? u : 0), sgn, `rgb(${(glaze * 255) | 0},${(glaze * 255) | 0},${(glaze * 255) | 0})`);
        }
      }
    }
    return;
  }
  const tw = W / cols, th = n / rows;
  for (let j = 0; j < rows; j++) {
    const off = bond === 'running' ? (j % 2) * tw / 2 : 0;
    for (let i = -1; i <= cols; i++) tile(i * tw + off, j * th, tw, th, pick());
  }
}, { rough: true, w });
// trowelled, polished concrete: soft cloudy mottling, a few aggregate specks, faint trowel arcs
P.concrete = (base, seed = 19) => paint(512, seed, ({ c, h, ro }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) { const x = r() * n, y = r() * n, rr = 30 + r() * 110; const g = c.createRadialGradient(x, y, 0, x, y, rr); const t = shade(base, (r() - 0.5) * 0.06); g.addColorStop(0, t); g.addColorStop(1, `${t}00`); /* fade to the same colour, not to black */ c.fillStyle = g; c.globalAlpha = 0.5; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  c.globalAlpha = 1;
  for (let i = 0; i < 2200; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '60,55,48' : '250,245,235'},${0.1 + r() * 0.2})`; c.beginPath(); c.arc(r() * n, r() * n, 0.5 + r() * 1.4, 0, 7); c.fill(); }
  for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(255,255,255,${0.01 + r() * 0.015})`; c.lineWidth = 6 + r() * 14; c.beginPath(); c.arc(r() * n, r() * n, 60 + r() * 160, r() * 6, r() * 6 + 1.2); c.stroke(); }
  for (let i = 0; i < 120; i++) { ro.fillStyle = `rgba(${170 + r() * 60 | 0},${170 + r() * 60 | 0},${170 + r() * 60 | 0},0.25)`; ro.beginPath(); ro.arc(r() * n, r() * n, 20 + r() * 70, 0, 7); ro.fill(); }
}, { rough: true, roBase: '#b4b4b4' });
// white Carrara-style marble: near-white base, soft clouding, a few long grey veins with feathered halos
P.marble = (seed = 27) => paint(512, seed, ({ c, h, ro }, n, r) => {
  c.fillStyle = '#f3f1ec'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 60; i++) { const x = r() * n, y = r() * n, rr = 40 + r() * 120, g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, 'rgba(214,212,207,0.35)'); g.addColorStop(1, 'rgba(214,212,207,0)'); c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  for (let v = 0; v < 7; v++) {
    let x = r() * n, y = -20, a = 1.2 + (r() - 0.5) * 0.8; const pts = [];
    while (y < n + 20 && pts.length < 400) { pts.push([x, y]); a += (r() - 0.5) * 0.35; x += Math.cos(a) * 6; y += Math.abs(Math.sin(a)) * 6 + 1; }
    for (const [w, al] of [[7, 0.05], [3, 0.12], [1.1, 0.4]]) {
      for (const ox of [0, n, -n]) { c.strokeStyle = `rgba(118,120,124,${al * (0.5 + r() * 0.5)})`; c.lineWidth = w; c.beginPath(); pts.forEach(([px, py], i) => c[i ? 'lineTo' : 'moveTo'](px + ox, py)); c.stroke(); }
    }
  }
}, { rough: true, roBase: '#5a5a5a' });
P.lava = (seed = 21) => paint(512, seed, ({ c, h, ro }, n, r) => {
  c.fillStyle = '#3c3a37'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 1400; i++) { c.fillStyle = shade('#45423e', (r() - 0.5) * 0.12); c.beginPath(); c.ellipse(r() * n, r() * n, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, 7); c.fill(); }
  for (let i = 0; i < 5200; i++) {                  // vesicles
    const x = r() * n, y = r() * n, s = 0.6 + r() * r() * 4.5;
    c.fillStyle = 'rgba(16,15,14,0.85)'; c.beginPath(); c.ellipse(x, y, s, s * (0.6 + r() * 0.5), r() * 3, 0, 7); c.fill();
    h.fillStyle = '#303030'; h.beginPath(); h.ellipse(x, y, s, s, 0, 0, 7); h.fill();
  }
  for (let i = 0; i < 9000; i++) { const v = (r() * 60 + 90) | 0; h.fillStyle = `rgb(${v},${v},${v})`; h.fillRect(r() * n, r() * n, 2, 2); }
});
// stacked lava-stone wall (DJ wall / bar wall in the Bali FF renders): irregular courses, deep joints
P.lavaWall = (seed = 23) => paint(512, seed, ({ c, h }, n, r) => {
  c.fillStyle = '#1b1a19'; c.fillRect(0, 0, n, n); h.fillStyle = '#202020'; h.fillRect(0, 0, n, n);
  let y = 0;
  while (y < n) {
    const ch = 26 + r() * 30; let x = -r() * 60;
    while (x < n) {
      const cw = 40 + r() * 90, tone = shade('#4a4743', (r() - 0.5) * 0.14);
      const pad = 3;
      for (const ox of [0, n, -n]) {
        c.fillStyle = tone; c.beginPath(); c.roundRect(x + ox + pad, y + pad, cw - pad * 2, Math.min(ch, n - y) - pad * 2, 6); c.fill();
        const g = h.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, '#d0d0d0'); g.addColorStop(0.5, '#b4b4b4'); g.addColorStop(1, '#8c8c8c');
        h.fillStyle = g; h.beginPath(); h.roundRect(x + ox + pad, y + pad, cw - pad * 2, Math.min(ch, n - y) - pad * 2, 6); h.fill();
      }
      for (let k = 0; k < 60; k++) { c.fillStyle = 'rgba(15,14,13,0.7)'; c.beginPath(); c.arc(x + r() * cw, y + r() * ch, 0.6 + r() * 2, 0, 7); c.fill(); }
      x += cw;
    }
    y += ch;
  }
});
// rounded lava pebbles (dance-floor ring inlay in the Bali FF renders)
P.pebblesDark = (seed = 25) => paint(512, seed, ({ c, h, ro }, n, r) => {
  c.fillStyle = '#121110'; c.fillRect(0, 0, n, n); h.fillStyle = '#1a1a1a'; h.fillRect(0, 0, n, n); ro.fillStyle = '#f0f0f0'; ro.fillRect(0, 0, n, n);
  for (let i = 0; i < 1500; i++) {
    const x = r() * n, y = r() * n, a = 5 + r() * 9, b = a * (0.55 + r() * 0.35), rot = r() * 3;
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
      c.fillStyle = shade('#3b3936', (r() - 0.5) * 0.18); c.beginPath(); c.ellipse(x + ox, y + oy, a, b, rot, 0, 7); c.fill();
      const g = h.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, a); g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#707070');
      h.fillStyle = g; h.beginPath(); h.ellipse(x + ox, y + oy, a, b, rot, 0, 7); h.fill();
      ro.fillStyle = '#5a5a5a'; ro.beginPath(); ro.ellipse(x + ox, y + oy, a, b, rot, 0, 7); ro.fill();
    }
  }
}, { rough: true });
// cream paras sandstone with a carved geometric relief (Bali stage wall, tasting-room medallion)
P.carvedRelief = (base = '#dfd0b3', seed = 31) => paint(512, seed, ({ c, h }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 3000; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.06); c.fillRect(r() * n, r() * n, 2, 2); }
  const cell = n / 4;
  const motif = (g, light, dark) => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = i * cell + cell / 2, y = j * cell + cell / 2;
      g.save(); g.translate(x, y);
      g.strokeStyle = dark; g.lineWidth = cell * 0.07;
      g.beginPath(); g.moveTo(0, -cell / 2); g.lineTo(cell / 2, 0); g.lineTo(0, cell / 2); g.lineTo(-cell / 2, 0); g.closePath(); g.stroke();
      g.fillStyle = light;
      for (let p = 0; p < 4; p++) { g.save(); g.rotate(p * Math.PI / 2); g.beginPath(); g.ellipse(0, -cell * 0.17, cell * 0.08, cell * 0.16, 0, 0, 7); g.fill(); g.restore(); }
      g.beginPath(); g.arc(0, 0, cell * 0.07, 0, 7); g.fill();
      g.restore();
    }
  };
  motif(h, '#e8e8e8', '#4a4a4a');
  motif(c, shade(base, 0.04), shade(base, -0.16));
});
// vertical split bamboo (bar fronts, column wraps): ~45 mm culms, nodes every ~320 mm, honey tone
P.splitBamboo = (seed = 41) => paint(512, seed, ({ c, h }, n, r) => {
  const k = 22, w = n / k;                          // tile = 1 m
  c.fillStyle = '#3b2814'; c.fillRect(0, 0, n, n); h.fillStyle = '#202020'; h.fillRect(0, 0, n, n);
  for (let i = 0; i < k; i++) {
    const tone = shade('#c79a58', (r() - 0.5) * 0.12), x = i * w;
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, shade(tone, -0.16)); g.addColorStop(0.35, shade(tone, 0.06)); g.addColorStop(1, shade(tone, -0.12));
    c.fillStyle = g; c.fillRect(x + 1, 0, w - 2, n);
    const hg = h.createLinearGradient(x, 0, x + w, 0); hg.addColorStop(0, '#606060'); hg.addColorStop(0.5, '#e0e0e0'); hg.addColorStop(1, '#606060');
    h.fillStyle = hg; h.fillRect(x + 1, 0, w - 2, n);
    for (let y = r() * 160; y < n; y += 150 + r() * 30) {
      c.fillStyle = shade(tone, -0.2); c.fillRect(x + 1, y, w - 2, 4); c.fillStyle = shade(tone, 0.1); c.fillRect(x + 1, y + 4, w - 2, 2);
      h.fillStyle = '#ffffff'; h.fillRect(x + 1, y, w - 2, 5);
    }
    for (let s = 0; s < 6; s++) { c.strokeStyle = `rgba(90,60,25,${0.1 + r() * 0.12})`; c.lineWidth = 1; const xx = x + 3 + r() * (w - 6); c.beginPath(); c.moveTo(xx, 0); c.lineTo(xx, n); c.stroke(); }
  }
});
// woven bamboo mat (anyaman) for ceiling infill: over-under strips; tone sets natural vs dark-stained
P.wovenBamboo = (tone = '#b58c58', seed = 43) => paint(512, seed, ({ c, h }, n, r) => {
  const k = 16, s = n / k;
  c.fillStyle = shade(tone, -0.3); c.fillRect(0, 0, n, n);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const over = (Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0, x = i * s, y = j * s;
    const t = shade(tone, (r() - 0.5) * 0.1 + (over ? 0.04 : -0.04));
    const g = over ? c.createLinearGradient(x, 0, x + s, 0) : c.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, shade(t, -0.1)); g.addColorStop(0.5, t); g.addColorStop(1, shade(t, -0.1));
    c.fillStyle = g; c.fillRect(x + 1, y + 1, s - 2, s - 2);
    h.fillStyle = over ? '#d0d0d0' : '#909090'; h.fillRect(x + 1, y + 1, s - 2, s - 2);
  }
});
P.wood = (base, seed, { boards = 1, figure = 0.1, dark = 0.25, vertical = true } = {}) => paint(512, seed, ({ c, h }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  const bw = n / boards;
  for (let b = 0; b < boards; b++) {
    c.fillStyle = shade(base, (r() - 0.5) * figure); c.fillRect(b * bw, 0, bw, n);
    for (let k = 0; k < 70; k++) {
      c.strokeStyle = `rgba(${dark > 0.3 ? '30,15,5' : '70,40,15'},${0.05 + r() * 0.12})`; c.lineWidth = 0.6 + r() * 1.8;
      const x = b * bw + r() * bw; c.beginPath(); c.moveTo(x, 0);
      for (let y = 0; y <= n; y += 32) c.lineTo(x + Math.sin(y / 60 + k) * 3 + (r() - 0.5) * 2, y);
      c.stroke();
    }
    if (boards > 1) { c.fillStyle = 'rgba(25,12,4,0.55)'; c.fillRect(b * bw, 0, 2, n); h.fillStyle = '#404040'; h.fillRect(b * bw, 0, 3, n); }
  }
  for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(40,20,8,${0.08 + r() * 0.1})`; c.beginPath(); c.ellipse(r() * n, r() * n, 3 + r() * 6, 8 + r() * 20, 0, 0, 7); c.fill(); }
});
// fluted (reeded) walnut panel: Riviera DJ wall
P.fluted = (base = '#5a3a24', seed = 51) => paint(512, seed, ({ c, h }, n, r) => {
  const k = 24, w = n / k;
  for (let i = 0; i < k; i++) {
    const x = i * w; const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(base, -0.1)); g.addColorStop(0.5, shade(base, 0.06)); g.addColorStop(1, shade(base, -0.12));
    c.fillStyle = g; c.fillRect(x, 0, w, n);
    const hg = h.createLinearGradient(x, 0, x + w, 0); hg.addColorStop(0, '#404040'); hg.addColorStop(0.5, '#f0f0f0'); hg.addColorStop(1, '#404040');
    h.fillStyle = hg; h.fillRect(x, 0, w, n);
  }
  for (let k2 = 0; k2 < 80; k2++) { c.strokeStyle = `rgba(20,10,4,${0.05 + r() * 0.1})`; c.lineWidth = 1; const x = r() * n; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 6, n / 3, x - 6, n * 2 / 3, x, n); c.stroke(); }
});
// cane webbing (Vienna straw): octagonal holes -> alpha
P.cane = (seed = 61) => paint(256, seed, ({ c, h, a }, n) => {
  c.fillStyle = '#d4b27a'; c.fillRect(0, 0, n, n);
  const s = n / 8;
  a.strokeStyle = '#fff'; c.strokeStyle = '#c49c5e';
  for (const g of [a, c]) {
    g.lineWidth = s * 0.16;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, n); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(n, i * s); g.stroke();
    }
    g.lineWidth = s * 0.12;
    for (let i = -8; i <= 16; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s + n, n); g.stroke();
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s - n, n); g.stroke();
    }
  }
  h.drawImage(a.canvas, 0, 0);
}, { alpha: true });
// carved teak lattice (Bali screens / balustrade): interlocking circles and diamonds -> alpha
P.lattice = (seed = 63) => paint(512, seed, ({ c, h, a }, n) => {
  c.fillStyle = '#8a5a30'; c.fillRect(0, 0, n, n);
  const k = 4, s = n / k;
  for (const g of [a, h]) {
    g.strokeStyle = '#fff'; g.lineWidth = s * 0.075;
    for (let j = 0; j <= k; j++) for (let i = 0; i <= k; i++) {
      g.beginPath(); g.arc(i * s, j * s, s * 0.5, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(i * s + s / 2, j * s); g.lineTo(i * s + s, j * s + s / 2); g.lineTo(i * s + s / 2, j * s + s); g.lineTo(i * s, j * s + s / 2); g.closePath(); g.stroke();
    }
    g.lineWidth = s * 0.1; g.strokeRect(0, 0, n, n);
  }
  c.globalCompositeOperation = 'multiply'; c.drawImage(P._woodGrain(), 0, 0, n, n); c.globalCompositeOperation = 'source-over';
}, { alpha: true });
P._woodGrain = () => P.wood('#a06a3a', 64, { figure: 0.06 }).color;
// alang-alang thatch fringe: dense straw strands with a ragged lower edge -> alpha (v = 0 is the hem)
P.thatch = (seed = 71) => paint(512, seed, ({ c, h, a }, n, r) => {
  c.fillStyle = '#a07c48'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 2600; i++) {
    const x = r() * n, y0 = r() * n * 0.25, y1 = n * (0.72 + r() * 0.28), tone = shade(['#c9a463', '#b48d52', '#d8b97c', '#9c7742'][(r() * 4) | 0], (r() - 0.5) * 0.08);
    const lean = (r() - 0.5) * 10;
    c.strokeStyle = tone; c.lineWidth = 1 + r() * 1.6; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + lean, y1); c.stroke();
    a.strokeStyle = '#fff'; a.lineWidth = 1.2 + r() * 1.6; a.beginPath(); a.moveTo(x, y0); a.lineTo(x + lean, y1); a.stroke();
    h.strokeStyle = r() < 0.5 ? '#c0c0c0' : '#606060'; h.lineWidth = 1.4; h.beginPath(); h.moveTo(x, y0); h.lineTo(x + lean, y1); h.stroke();
  }
  a.fillStyle = '#fff'; a.fillRect(0, 0, n, n * 0.62);
}, { alpha: true });
P.thatchRoof = (seed = 73) => paint(512, seed, ({ c, h }, n, r) => {
  c.fillStyle = '#a7834e'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 4200; i++) { const x = r() * n, y = r() * n, L = 20 + r() * 50; c.strokeStyle = shade('#c3a066', (r() - 0.5) * 0.18); c.lineWidth = 1 + r() * 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 6, y + L); c.stroke(); h.strokeStyle = r() < 0.5 ? '#c8c8c8' : '#585858'; h.beginPath(); h.moveTo(x, y); h.lineTo(x, y + L); h.stroke(); }
});
P.bambooBlind = (seed = 75) => paint(256, seed, ({ c, h, a }, n, r) => {
  c.fillStyle = '#b8945e'; c.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 4) { c.fillStyle = shade('#c6a36a', (r() - 0.5) * 0.12); c.fillRect(0, y, n, 3); a.fillStyle = '#fff'; a.fillRect(0, y, n, 3.2); h.fillStyle = '#d0d0d0'; h.fillRect(0, y, n, 3); }
  for (const x of [n * 0.2, n * 0.8]) { c.fillStyle = '#6a4a28'; c.fillRect(x, 0, 3, n); a.fillStyle = '#fff'; a.fillRect(x, 0, 3, n); }
}, { alpha: true });
P.terracottaTiles = (seed = 81, tile = 0.3) => paint(512, seed, ({ c, h, ro }, n, r) => {
  const k = Math.round(1 / tile * 1.2) || 4, s = n / k;     // tile = 1.2 m texture tile
  c.fillStyle = '#b8a48c'; c.fillRect(0, 0, n, n); h.fillStyle = '#404040'; h.fillRect(0, 0, n, n); ro.fillStyle = '#ffffff'; ro.fillRect(0, 0, n, n);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const col = ['#c4703f', '#b8653a', '#cc7c4a', '#bd6c43', '#c97a4f', '#b2603a'][(r() * 6) | 0];
    const g = c.createRadialGradient(i * s + s / 2, j * s + s / 2, s * 0.1, i * s + s / 2, j * s + s / 2, s * 0.75);
    g.addColorStop(0, shade(col, 0.04)); g.addColorStop(1, shade(col, -0.08));
    c.fillStyle = g; c.fillRect(i * s + 2.5, j * s + 2.5, s - 5, s - 5);
    for (let q = 0; q < 40; q++) { c.fillStyle = `rgba(${r() < 0.6 ? '90,40,20' : '240,200,170'},${r() * 0.12})`; c.beginPath(); c.arc(i * s + r() * s, j * s + r() * s, 1 + r() * 4, 0, 7); c.fill(); }
    h.fillStyle = '#c4c4c4'; h.fillRect(i * s + 2.5, j * s + 2.5, s - 5, s - 5);
    ro.fillStyle = '#a8a8a8'; ro.fillRect(i * s + 2.5, j * s + 2.5, s - 5, s - 5);
  }
}, { rough: true });
P.clay = (base = '#c06a3e', bloom = true, seed = 83) => paint(256, seed, ({ c, h }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.12); c.beginPath(); c.arc(r() * n, r() * n, 2 + r() * 8, 0, 7); c.fill(); }
  if (bloom) for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(240,226,206,${0.05 + r() * 0.12})`; c.beginPath(); c.ellipse(r() * n, r() * n, 4 + r() * 22, 2 + r() * 10, r() * 3, 0, 7); c.fill(); }
  for (let i = 0; i < 6000; i++) { const v = (r() * 50 + 100) | 0; h.fillStyle = `rgb(${v},${v},${v})`; h.fillRect(r() * n, r() * n, 2, 2); }
});
P.jute = (seed = 85) => paint(256, seed, ({ c, h }, n, r) => {
  c.fillStyle = '#b39b72'; c.fillRect(0, 0, n, n);
  const s = n / 16;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const g = c.createLinearGradient(i * s, j * s, i * s + s, j * s + s); const t = shade('#c2a97e', (r() - 0.5) * 0.08);
    g.addColorStop(0, shade(t, -0.12)); g.addColorStop(0.5, t); g.addColorStop(1, shade(t, -0.12));
    c.fillStyle = g; c.beginPath(); c.ellipse(i * s + s / 2, j * s + s / 2, s * 0.55, s * 0.32, (i + j) % 2 ? 0.7 : -0.7, 0, 7); c.fill();
    h.fillStyle = '#d0d0d0'; h.beginPath(); h.ellipse(i * s + s / 2, j * s + s / 2, s * 0.5, s * 0.28, (i + j) % 2 ? 0.7 : -0.7, 0, 7); h.fill();
  }
}, { hBase: '#404040' });
P.plasterWarm = (base, seed = 87, trowel = 0.03) => paint(512, seed, ({ c, h }, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2.4; i++) {
    const x = r() * n, y = r() * n, a = 10 + r() * 46, b = 4 + r() * 16, rot = r() * 3;
    c.fillStyle = `rgba(${r() < 0.5 ? '150,120,80' : '255,250,240'},${r() * trowel})`; c.beginPath(); c.ellipse(x, y, a, b, rot, 0, 7); c.fill();
    const v = (110 + r() * 40) | 0; h.fillStyle = `rgba(${v},${v},${v},0.35)`; h.beginPath(); h.ellipse(x, y, a, b, rot, 0, 7); h.fill();
  }
});
P.slatsWhite = (seed = 89) => paint(256, seed, ({ c, h }, n, r) => {
  const k = 10, w = n / k; c.fillStyle = '#b9b5ad'; c.fillRect(0, 0, n, n); h.fillStyle = '#303030'; h.fillRect(0, 0, n, n);
  for (let i = 0; i < k; i++) { c.fillStyle = shade('#f1eee8', (r() - 0.5) * 0.04); c.fillRect(i * w + 2, 0, w - 4, n); h.fillStyle = '#d8d8d8'; h.fillRect(i * w + 2, 0, w - 4, n); }
});
P.leafCards = (kind, seed = 91) => paint(512, seed, ({ c, a }, n, r) => {
  // a sprite sheet: one leaf / frond per texture, drawn on transparent (alpha) background
  const leaf = (g, fill) => {
    g.fillStyle = fill; g.strokeStyle = fill;
    if (kind === 'monstera') {
      g.save(); g.translate(n / 2, n * 0.95);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-n * 0.5, -n * 0.1, -n * 0.48, -n * 0.85, 0, -n * 0.9); g.bezierCurveTo(n * 0.48, -n * 0.85, n * 0.5, -n * 0.1, 0, 0); g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 7; k++) { const t = 0.2 + k * 0.1, y = -n * t; for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(sgn * n * 0.06, y); g.lineTo(sgn * n * 0.5, y - n * 0.07); g.lineTo(sgn * n * 0.5, y - n * 0.05); g.lineTo(sgn * n * 0.08, y + n * 0.02); g.fill(); } }
      for (let k = 0; k < 4; k++) for (const sgn of [-1, 1]) { g.beginPath(); g.ellipse(sgn * n * 0.14, -n * (0.3 + k * 0.13), n * 0.022, n * 0.035, 0, 0, 7); g.fill(); }
      g.globalCompositeOperation = 'source-over'; g.restore();
    } else if (kind === 'olive') {               // three fanned sprigs of narrow, silvery leaves
      for (const [rot, L] of [[-0.45, 0.8], [0, 0.95], [0.5, 0.75]]) {
        g.save(); g.translate(n / 2, n); g.rotate(rot); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -n * L); g.stroke();
        for (let k = 0; k < 18; k++) {
          const t = (k + 1) / 19, y = -n * L * t;
          for (const sgn of [-1, 1]) { g.save(); g.translate(0, y); g.rotate(sgn * (0.6 + r() * 0.35)); g.beginPath(); g.ellipse(0, -18, 6.5, 19, 0, 0, 7); g.fill(); g.restore(); }
        }
        g.restore();
      }
    } else if (kind === 'fern' || kind === 'palm') {
      const leaflets = kind === 'fern' ? 34 : 24;
      g.save(); g.translate(n / 2, n);
      g.lineWidth = kind === 'olive' ? 3 : 4; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(n * 0.04, -n * 0.5, 0, -n * 0.98); g.stroke();
      for (let k = 0; k < leaflets; k++) {
        const t = (k + 1) / (leaflets + 1), y = -n * 0.96 * t, len = (kind === 'palm' ? n * 0.42 : kind === 'fern' ? n * 0.3 : n * 0.16) * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 6;
        for (const sgn of [-1, 1]) {
          g.save(); g.translate(n * 0.02 * Math.sin(t * 3), y); g.rotate(sgn * (kind === 'olive' ? 1.0 : 1.15) + (r() - 0.5) * 0.15);
          g.beginPath(); g.ellipse(0, -len / 2, kind === 'palm' ? 5 : kind === 'olive' ? 5 : 7, len / 2, 0, 0, 7); g.fill(); g.restore();
        }
      }
      g.restore();
    } else if (kind === 'paddle') {               // bird of paradise / banana-ish paddle leaf
      g.save(); g.translate(n / 2, n);
      g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -n * 0.45); g.stroke();
      g.beginPath(); g.ellipse(0, -n * 0.7, n * 0.16, n * 0.28, 0, 0, 7); g.fill(); g.restore();
    } else if (kind === 'frangipani') {           // a rosette of leaves with a cluster of white-yellow flowers
      g.save(); g.translate(n / 2, n / 2);
      for (let k = 0; k < 9; k++) { g.save(); g.rotate((k / 9) * 6.28 + r() * 0.3); g.beginPath(); g.ellipse(0, -n * 0.22, n * 0.07, n * 0.22, 0, 0, 7); g.fill(); g.restore(); }
      g.restore();
    }
  };
  const tone = { monstera: '#2f5a2a', fern: '#4f7f34', palm: '#4c7a36', olive: '#8a9b74', paddle: '#3f6a3a', frangipani: '#3e6b30' }[kind];
  leaf(c, tone); leaf(a, '#fff');
  // veins + light variation on the colour layer
  c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,220' : '0,20,0'},${r() * 0.08})`; c.fillRect(r() * n, r() * n, 6, 6); }
  if (kind === 'frangipani') for (let k = 0; k < 7; k++) {
    const x = n / 2 + (r() - 0.5) * n * 0.22, y = n / 2 + (r() - 0.5) * n * 0.22;
    for (let p = 0; p < 5; p++) { c.save(); c.translate(x, y); c.rotate(p * 1.256); c.fillStyle = '#fbf6ea'; c.beginPath(); c.ellipse(0, -9, 6, 10, 0.4, 0, 7); c.fill(); c.restore(); }
    c.fillStyle = '#f2c94c'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
    a.fillStyle = '#fff'; a.beginPath(); a.arc(x, y, 18, 0, 7); a.fill();
  }
  c.globalCompositeOperation = 'source-over';
}, { alpha: true });
// two original Riviera travel posters (ST01 Riviera render: framed posters on the plaster wall)
P.poster = (variant) => paint(512, 101 + variant, ({ c }, n) => {
  const W = n * 0.7, x0 = (n - W) / 2;
  c.fillStyle = '#f3ead8'; c.fillRect(0, 0, n, n);
  c.save(); c.beginPath(); c.rect(x0, 30, W, n - 60); c.clip();
  const sky = c.createLinearGradient(0, 30, 0, n * 0.55); sky.addColorStop(0, variant ? '#f2b56b' : '#8fc3e0'); sky.addColorStop(1, variant ? '#f6d9a3' : '#d9ecf2');
  c.fillStyle = sky; c.fillRect(x0, 30, W, n * 0.5);
  c.fillStyle = variant ? '#e9784a' : '#f5d36b'; c.beginPath(); c.arc(x0 + W * 0.7, n * 0.3, n * 0.07, 0, 7); c.fill();
  c.fillStyle = '#2c6a8e'; c.fillRect(x0, n * 0.52, W, n * 0.5);
  for (let k = 0; k < 8; k++) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x0 + (k * 37) % W, n * 0.58 + k * 18, 40, 3); }
  c.fillStyle = variant ? '#7d7b4f' : '#c2683f'; c.beginPath(); c.moveTo(x0, n * 0.52); c.quadraticCurveTo(x0 + W * 0.3, n * 0.35, x0 + W * 0.55, n * 0.52); c.fill();
  c.fillStyle = '#f3ead8'; c.beginPath(); c.moveTo(x0 + W * 0.35, n * 0.78); c.lineTo(x0 + W * 0.65, n * 0.78); c.lineTo(x0 + W * 0.6, n * 0.84); c.lineTo(x0 + W * 0.4, n * 0.84); c.fill();
  c.fillStyle = '#f3ead8'; c.beginPath(); c.moveTo(x0 + W * 0.5, n * 0.62); c.lineTo(x0 + W * 0.5, n * 0.78); c.lineTo(x0 + W * 0.62, n * 0.76); c.fill();
  c.restore();
  c.fillStyle = '#1f3a5f'; c.font = `600 ${n * 0.06}px Georgia, 'Times New Roman', serif`; c.textAlign = 'center';
  c.fillText(variant ? 'CAP FERRAT' : 'ANTIBES', n / 2, n - 34);
});
// chalk-on-slate (Bali) / flip-board (Riviera) beer lists; names from the Riviera render
P.beerBoard = (riviera) => paint(512, 111, ({ c }, n) => {
  c.fillStyle = riviera ? '#1d2433' : '#2b2d2c'; c.fillRect(0, 0, n, n);
  const beers = riviera ? ['RIVIERA LAGER', 'CITRUS WIT', 'COASTAL IPA', 'OLIVE SAISON', 'SUNSET ALE', 'BELGIAN BLONDE', 'TERRACOTTA RED', 'MIDNIGHT STOUT']
    : ['Ubud Pale Ale', 'Frangipani Wit', 'Lava Stone Stout', 'Bamboo Lager', 'Tropical IPA', 'Seminyak Sour', 'Coconut Porter', 'Teak Amber'];
  c.fillStyle = riviera ? '#d9b46a' : '#f2efe6'; c.textAlign = 'left';
  c.font = riviera ? `700 ${n * 0.07}px 'Helvetica Neue', Arial, sans-serif` : `italic 600 ${n * 0.075}px 'Marker Felt', 'Chalkboard', 'Comic Sans MS', cursive`;
  c.fillText(riviera ? 'ON TAP' : 'On Tap Today', n * 0.08, n * 0.12);
  c.font = riviera ? `600 ${n * 0.052}px 'Helvetica Neue', Arial, sans-serif` : `${n * 0.055}px 'Chalkboard', 'Marker Felt', cursive`;
  beers.forEach((b, i) => {
    if (riviera) { c.fillStyle = '#0f1420'; c.fillRect(n * 0.06, n * (0.18 + i * 0.1) - n * 0.055, n * 0.88, n * 0.075); c.fillStyle = '#f4f1e8'; }
    c.fillText(b, n * 0.09, n * (0.18 + i * 0.1));
  });
});
P.halo = () => { const cc = canvas(256); const g = cc.getContext('2d', { willReadFrequently: true }); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,190,120,0.9)'); gr.addColorStop(0.45, 'rgba(255,160,80,0.35)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return { color: cc }; };
P.beam = () => { const cc = canvas(64, 256); const g = cc.getContext('2d', { willReadFrequently: true }); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,200,140,0.55)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); return { color: cc }; };

// ------------------------------------------------------------------ material registry
const PAINTED = new Map();
function painted(key, fn) { if (!PAINTED.has(key)) PAINTED.set(key, fn()); return PAINTED.get(key); }
// build a material from a painted set; tileM = metres per texture tile; nrm = normal strength
function fromPaint(set, { tileM = 1, nrm = 2, rough = 0.8, metal = 0, color = '#ffffff', alpha = false, side, physical, ...extra } = {}) {
  const Ctor = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Ctor({ map: texture(set.color, { tileM }), roughness: rough, metalness: metal, color, ...extra });
  if (set.height && nrm) { m.normalMap = texture(normalFrom(set.height, nrm), { srgb: false, tileM }); }
  if (set.rough) { m.roughnessMap = texture(set.rough, { srgb: false, tileM }); }
  if (alpha && set.alpha) { m.alphaMap = texture(set.alpha, { srgb: false, tileM }); m.alphaTest = 0.45; m.side = THREE.DoubleSide; }
  if (side !== undefined) m.side = side;
  if (physical) Object.assign(m, physical);
  return m;
}
const solid = (o) => new THREE.MeshStandardMaterial(o);
const photo = (id, o) => (assetIndex()?.textures.find((t) => t.id === id) ? photoMaterial(id, o) : null);

// key -> () => material. UVs are metres unless noted. Shared by both themes where the renders agree.
const DEF = {
  // ---- metals
  copper: () => solid({ color: '#c9774a', metalness: 0.85, roughness: 0.3, emissive: '#3a1a0a', emissiveIntensity: 0.6 }),   // 'softly lit' tanks (GF04)
  copper_hammered: () => fromPaint(painted('hammer', () => P.lava(29)), { tileM: 0.25, nrm: 0.6, rough: 0.32, metal: 1, color: '#b8703f' }),
  stainless: () => solid({ color: '#cdd2d6', metalness: 0.72, roughness: 0.3 }),   // some diffuse body: fully metallic it went black in dim rooms
  brass: () => solid({ color: '#c9a35c', metalness: 0.82, roughness: 0.32 }),      // brushed; a little diffuse so it reads indoors
  brass_polished: () => solid({ color: '#d4ae63', metalness: 0.85, roughness: 0.24 }),
  brass_logo: () => solid({ color: '#d1a95c', metalness: 0.8, roughness: 0.36, emissive: '#6a4512', emissiveIntensity: 0.5 }),   // backlit brushed-brass letters
  sign_glow: () => solid({ color: '#ffe2b0', metalness: 0.1, roughness: 0.45, emissive: '#ffb450', emissiveIntensity: 1.0 }),   // lit sign letters (glow follows the time of day)
  bronze: () => solid({ color: '#6a4628', metalness: 0.85, roughness: 0.5 }),
  bronze_dark: () => solid({ color: '#3d2d20', metalness: 0.85, roughness: 0.45 }),
  black_steel: () => solid({ color: '#1c1c1d', metalness: 0.65, roughness: 0.48 }),
  charcoal: () => solid({ color: '#1c1c1e', metalness: 0, roughness: 0.92 }),
  navy_iron: () => solid({ color: '#1e2c48', metalness: 0.6, roughness: 0.4 }),
  chrome: () => solid({ color: '#e4e6e8', metalness: 1, roughness: 0.12 }),
  black_matte: () => solid({ color: '#141414', roughness: 0.7 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#d7e4e2', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
  // ---- light emitters (intensity driven by time of day, see Themes.setNight)
  glow_warm: () => solid({ color: '#ffd8a8', emissive: '#ffb062', emissiveIntensity: 1.2, roughness: 0.6 }),
  led_strip: () => solid({ color: '#2a1a0a', emissive: '#ffa850', emissiveIntensity: 2.0, roughness: 0.8 }),
  candle: () => solid({ color: '#fff1d6', emissive: '#ffb45e', emissiveIntensity: 2.4, roughness: 0.5 }),
  opal: () => solid({ color: '#fbf6ee', roughness: 0.25, emissive: '#ffd9a0', emissiveIntensity: 0.15 }),
  bottle_amber: () => solid({ color: '#7a3b0c', roughness: 0.15, metalness: 0.1, emissive: '#5a2a06', emissiveIntensity: 0.6 }),
  bottle_green: () => solid({ color: '#2d4a24', roughness: 0.15, metalness: 0.1, emissive: '#18300f', emissiveIntensity: 0.6 }),
  bottle_clear: () => solid({ color: '#c9d6d4', roughness: 0.1, metalness: 0.1, emissive: '#6d746f', emissiveIntensity: 0.5 }),
  halo: () => new THREE.MeshBasicMaterial({ map: texture(painted('halo', P.halo).color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', opacity: 0.6, toneMapped: true }),
  beam: () => new THREE.MeshBasicMaterial({ map: texture(painted('beam', P.beam).color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.0 }),
  // ---- plants & pots
  leaf_monstera: () => fromPaint(painted('lf_m', () => P.leafCards('monstera', 92)), { alpha: true, nrm: 0, rough: 0.55 }),
  leaf_fern: () => fromPaint(painted('lf_f', () => P.leafCards('fern', 93)), { alpha: true, nrm: 0, rough: 0.7 }),
  leaf_palm: () => fromPaint(painted('lf_p', () => P.leafCards('palm', 94)), { alpha: true, nrm: 0, rough: 0.65 }),
  leaf_olive: () => fromPaint(painted('lf_o', () => P.leafCards('olive', 95)), { alpha: true, nrm: 0, rough: 0.8 }),
  leaf_paddle: () => fromPaint(painted('lf_b', () => P.leafCards('paddle', 96)), { alpha: true, nrm: 0, rough: 0.55 }),
  leaf_frangipani: () => fromPaint(painted('lf_fr', () => P.leafCards('frangipani', 97)), { alpha: true, nrm: 0, rough: 0.6 }),
  bark_olive: () => solid({ color: '#6e6656', roughness: 1 }),
  bark_frangipani: () => solid({ color: '#8d8a80', roughness: 0.95 }),
  stem: () => solid({ color: '#5e6b3b', roughness: 0.9 }),
  soil: () => solid({ color: '#2c2219', roughness: 1 }),
  terracotta_pot: () => fromPaint(painted('clay', () => P.clay()), { tileM: [1, 1], nrm: 1.2, rough: 0.95 }),
  lava_pot: () => fromPaint(painted('lava', () => P.lava()), { tileM: [0.6, 0.6], nrm: 2.5, rough: 0.95, color: '#a7a39c' }),
  white_pot: () => solid({ color: '#f1efea', roughness: 0.6 }),
  // ---- soft goods
  linen: () => fromPaint(painted('linen', () => P.linen('#ebe3d3')), { tileM: 0.25, nrm: 0.8, rough: 1 }),
  linen_white: () => fromPaint(painted('linen_w', () => P.linen('#f4f1ea', 6)), { tileM: 0.25, nrm: 0.8, rough: 1 }),
  ikat: () => fromPaint(painted('ikat', P.ikat), { tileM: 0.5, nrm: 0.6, rough: 1 }),
  stripe_cushion: () => fromPaint(painted('st_c', () => P.stripes('#f4efe4', '#1f3d6b', 8)), { tileM: 0.4, nrm: 0.6, rough: 1 }),
  stripe_awning: () => fromPaint(painted('st_a', () => P.stripes('#f4efe4', '#203d6e', 4, 4)), { tileM: [0.5, 0.5], nrm: 0.4, rough: 0.95, side: THREE.DoubleSide }),
  olive_velvet: () => fromPaint(painted('velvet_o', () => P.velvet('#5c6638')), { tileM: 0.4, nrm: 0, rough: 0.85, physical: { sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#9aa36a') } }),
  terracotta_velvet: () => fromPaint(painted('velvet_t', () => P.velvet('#b4583a', 8)), { tileM: 0.4, nrm: 0, rough: 0.85, physical: { sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#e08b66') } }),
  sheer: () => new THREE.MeshStandardMaterial({ map: texture(painted('linen_w', () => P.linen('#f4f1ea', 6)).color, { tileM: 0.25 }), color: '#fbf8f2', transparent: true, opacity: 0.55, roughness: 1, side: THREE.DoubleSide, depthWrite: false }),
  linen_curtain: () => fromPaint(painted('linen', () => P.linen('#ebe3d3')), { tileM: 0.3, nrm: 0.6, rough: 1, side: THREE.DoubleSide }),
  jute: () => fromPaint(painted('jute', P.jute), { tileM: 0.5, nrm: 2, rough: 1 }),
  // ---- woods
  teak: () => photo('brown_planks_03', { tileM: 1.6, neutral: true, tint: '#b87a48', roughness: 0.7 }) || fromPaint(painted('teak', () => P.wood('#a86b3b', 121)), { tileM: 0.8, nrm: 1, rough: 0.55 }),
  teak_solid: () => fromPaint(painted('teak', () => P.wood('#a86b3b', 121)), { tileM: 0.8, nrm: 1, rough: 0.5 }),
  teak_carved: () => fromPaint(painted('relief_t', () => P.carvedRelief('#8f5e34', 32)), { tileM: 1.0, nrm: 6, rough: 0.6 }),
  teak_boards: () => fromPaint(painted('teakb', () => P.wood('#9a6235', 122, { boards: 6 })), { tileM: 1.0, nrm: 1.5, rough: 0.55 }),
  teak_dark: () => fromPaint(painted('teakd', () => P.wood('#5a3920', 123, { dark: 0.5 })), { tileM: 0.8, nrm: 1, rough: 0.5 }),
  walnut: () => fromPaint(painted('walnut', () => P.wood('#5b3a22', 124, { dark: 0.5 })), { tileM: 0.8, nrm: 1, rough: 0.45 }),
  walnut_fluted: () => fromPaint(painted('fluted', () => P.fluted()), { tileM: 0.72, nrm: 4, rough: 0.45 }),
  honey_wood: () => fromPaint(painted('honey', () => P.wood('#b9824a', 125, { figure: 0.05 })), { tileM: 0.6, nrm: 0.6, rough: 0.45 }),
  oak_stage: () => fromPaint(painted('oaks', () => P.wood('#a87a4c', 126, { boards: 8 })), { tileM: 1.2, nrm: 1.2, rough: 0.5 }),
  // ---- woven / natural (props use primitives: rep = texture repeats across the 0..1 UV range)
  rattan_lamp: () => { const m = mat('rattan').clone(); m.emissive = new THREE.Color('#ff9a48'); m.emissiveMap = m.map; m.emissiveIntensity = 0; m.side = THREE.DoubleSide; return m; },
  rattan: () => photo('Wicker010A', { tileM: 1, tint: '#e8c99a', roughness: 0.9 }) || fromPaint(painted('wb_n', () => P.wovenBamboo('#c7a06a', 44)), { nrm: 2, rough: 0.9 }),
  seagrass: () => fromPaint(painted('wb_s', () => P.wovenBamboo('#b9a372', 45)), { nrm: 2.5, rough: 0.95 }),
  cane: () => fromPaint(painted('cane', P.cane), { alpha: true, nrm: 1.5, rough: 0.7 }),
  lattice: () => fromPaint(painted('lattice', P.lattice), { tileM: 0.8, alpha: true, nrm: 2, rough: 0.6 }),
  thatch_fringe: () => fromPaint(painted('thatch', P.thatch), { tileM: [0.9, 0.9], alpha: true, nrm: 1.5, rough: 1 }),
  thatch_roof: () => fromPaint(painted('thatchr', P.thatchRoof), { tileM: 1.2, nrm: 2, rough: 1, side: THREE.DoubleSide }),
  bamboo_blind: () => fromPaint(painted('blind', P.bambooBlind), { tileM: [1, 0.3], alpha: true, nrm: 1, rough: 0.9 }),
  bamboo_pole: () => fromPaint(painted('splitb', P.splitBamboo), { tileM: [0.35, 1], nrm: 3, rough: 0.55 }),
  split_bamboo: () => fromPaint(painted('splitb', P.splitBamboo), { tileM: 1, nrm: 3, rough: 0.55 }),
  woven_bamboo_dark: () => fromPaint(painted('wb_d', () => P.wovenBamboo('#7a5534', 46)), { tileM: 0.6, nrm: 2, rough: 0.9 }),
  rope: () => fromPaint(painted('jute', P.jute), { tileM: 0.08, nrm: 3, rough: 1, color: '#d8c39a' }),
  // ---- stone, plaster, tiles
  lava_stone: () => fromPaint(painted('lava', () => P.lava()), { tileM: 0.8, nrm: 3, rough: 0.95 }),
  lava_wall: () => fromPaint(painted('lavawall', () => P.lavaWall()), { tileM: 1.6, nrm: 4, rough: 0.95 }),
  lava_pebbles: () => fromPaint(painted('pebd', () => P.pebblesDark()), { tileM: 0.6, nrm: 4, rough: 0.6 }),
  sandstone_relief: () => fromPaint(painted('relief', () => P.carvedRelief()), { tileM: 1.0, nrm: 6, rough: 0.9 }),
  sandstone_stacked: () => photo('castle_wall_slates', { tileM: 1.8, neutral: true, tint: '#f7dbb0', normal: 1.3 }) || fromPaint(painted('relief', () => P.carvedRelief()), { tileM: 1.0, nrm: 4 }),
  plaster_ochre: () => fromPaint(painted('pl_o', () => P.plasterWarm('#dcb987', 88, 0.05)), { tileM: 1.6, nrm: 3, rough: 0.95 }),
  plaster_lime: () => fromPaint(painted('pl_l', () => P.plasterWarm('#efe4d1', 89, 0.035)), { tileM: 1.6, nrm: 2.5, rough: 0.95 }),
  plaster_white: () => fromPaint(painted('pl_w', () => P.plasterWarm('#f3efe8', 90, 0.02)), { tileM: 1.6, nrm: 1.5, rough: 0.95 }),
  tile_blue: () => fromPaint(painted('t_bsq', () => P.tiles({ cols: 10, rows: 10, palette: ['#1e4c6b', '#1a4562', '#235674', '#173f5a', '#285e7e'], grout: '#d3cfc6', gf: 0.035, seed: 131 })), { tileM: 1.0, nrm: 3, rough: 1, envMapIntensity: 0.55 }),   // deep glossy Riviera blue, fine pale grout (GF03 render)
  tile_blue_vert: () => fromPaint(painted('t_bv', () => P.tiles({ cols: 13, rows: 3, palette: ['#173f5c', '#1b4866', '#153a55', '#1f5070', '#194360'], grout: '#0e1d29', seed: 132 })), { tileM: 1.0, nrm: 3, rough: 1, envMapIntensity: 0.55 }),
  tile_herringbone: () => fromPaint(painted('t_hb', () => P.tiles({ palette: ['#244f7c', '#ede6d8'], grout: '#d9d2c4', bond: 'herringbone', seed: 133 })), { tileM: 0.9, nrm: 2.5, rough: 1, envMapIntensity: 0.55 }),
  tile_subway: () => fromPaint(painted('t_sw', () => P.tiles({ cols: 6, rows: 12, palette: ['#f6f5f1', '#f1efe9', '#f8f7f4'], grout: '#d6d3cc', bond: 'running', seed: 134 })), { tileM: 0.9, nrm: 2.5, rough: 1, envMapIntensity: 0.55 }),
  terracotta_tiles: () => fromPaint(painted('ttiles', () => P.terracottaTiles()), { tileM: 1.2, nrm: 2.5, rough: 1 }),
  terrazzo_sand: () => fromPaint(painted('tz_s', () => P.terrazzo('#e6d9c3', ['#c2683f', '#a9542f', '#7d7b4f', '#2c6a8e', '#f6f2ea', '#8a8178', '#d79a6a'], 5200, 5, 141)), { tileM: 1.0, nrm: 0, rough: 0.32 }),
  terrazzo_white: () => fromPaint(painted('tz_w', () => P.terrazzo('#f3efe6', ['#c2683f', '#7d7b4f', '#2c6a8e', '#d9a067', '#9a948b'], 2200, 9, 142)), { tileM: 0.8, nrm: 0, rough: 0.25 }),
  terrazzo_dark: () => fromPaint(painted('tz_d', () => P.terrazzo('#121214', ['#e9e6df', '#8d8983', '#c9a35c', '#4f4b46', '#3a3835', '#d8d3c8'], 2600, 3, 143)), { tileM: 1.0, nrm: 0, rough: 0.16 }),
  slats_white: () => fromPaint(painted('slw', P.slatsWhite), { tileM: [1, 1], nrm: 2, rough: 0.8, side: THREE.DoubleSide }),
  concrete_light: () => fromPaint(painted('conc_l', () => P.concrete('#e8e0d3', 19)), { tileM: 2.8, nrm: 0.25, rough: 0.55, envMapIntensity: 0.8 }),
  // the Bali renders' hall floor (GF08/GF09/GF03): warm sand-greige trowelled concrete, polished to a soft reflection
  concrete_sand: () => fromPaint(painted('conc_s', () => P.concrete('#c6b49c', 23)), { tileM: 2.8, nrm: 0.25, rough: 0.34, envMapIntensity: 0.9 }),
  limestone_slabs: () => photo('marble_01', { tileM: 2.4, tint: '#fff5e8', roughness: 0.42 }) || fromPaint(painted('lime_s', () => P.tiles({ cols: 4, rows: 4, palette: ['#ddccb2', '#d8c6aa', '#e2d3bb', '#d4c1a4'], grout: '#bfae94', gf: 0.012, glaze: 0.45, seed: 135 })), { tileM: 2.4, nrm: 1, rough: 1 }),
  concrete_dark: () => fromPaint(painted('conc_d', () => P.concrete('#6a5f53', 20)), { tileM: 2.8, nrm: 0.25, rough: 0.32 }),
  marble_white: () => fromPaint(painted('marble_w', () => P.marble()), { tileM: 0.9, nrm: 0, rough: 0.2 }),   // (marble_01 is a beige limestone floor with joints: wrong for tabletops)
  poster_a: () => fromPaint(painted('pa', () => P.poster(0)), { nrm: 0, rough: 0.5 }),
  poster_b: () => fromPaint(painted('pb', () => P.poster(1)), { nrm: 0, rough: 0.5 }),
  board_bali: () => fromPaint(painted('bb', () => P.beerBoard(false)), { nrm: 0, rough: 0.9 }),
  board_riviera: () => fromPaint(painted('br', () => P.beerBoard(true)), { nrm: 0, rough: 0.6 }),
};
const MATS = new Map();
export function mat(key, { rep } = {}) {
  const k = rep ? `${key}@${rep.join('x')}` : key;
  if (MATS.has(k)) return MATS.get(k);
  if (!DEF[key]) throw new Error(`theme material ${key}?`);
  let m;
  if (rep) {
    const base = mat(key); m = base.clone();
    for (const t of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'aoMap', 'emissiveMap']) if (base[t]) { m[t] = base[t].clone(); m[t].repeat.set(rep[0], rep[1]); m[t].needsUpdate = true; }
  } else { m = DEF[key](); m.name = `theme:${key}`; }
  MATS.set(k, m);
  return m;
}
export const hasMat = (key) => !!DEF[key];
// materials whose glow follows the time of day: [material, day intensity, night intensity]
export const GLOWS = [['glow_warm', 0.25, 2.2], ['sign_glow', 0.7, 3.4], ['rattan_lamp', 0, 0.9], ['led_strip', 0.4, 2.6], ['candle', 0.6, 2.6], ['opal', 0.08, 1.8],
  ['bottle_amber', 0.25, 1.1], ['bottle_green', 0.25, 1.0], ['bottle_clear', 0.2, 0.9]];
// every live material (incl. repeat variants) whose glow follows the time of day: [material, day, night]
export function glowMaterials() {
  const out = [];
  for (const [k, m] of MATS) { const g = GLOWS.find(([key]) => key === k.split('@')[0]); if (g) out.push([m, g[1], g[2]]); }
  return out;
}
