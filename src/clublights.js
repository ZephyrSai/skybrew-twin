// First-floor light show for the DJ pub (themes only): makes the dance floor read as a working club at night.
//   * 10 moving-head beams from the ceiling spots, sweeping in four patterns that change every 8 bars, each throwing
//     a rotating gobo (palm leaves in Bali, sun-rays in Riviera) where it lands;
//   * a mirror ball under the dome with ~260 light specks turning slowly over the walls, floor and ceiling;
//   * LED pixel rings chasing colour under the steel ceiling rings;
//   * a laser fan from above the DJ booth on the peaks;
//   * the centre practical light becomes a colour wash that pulses on the beat (a real light: it lights the dancers).
// All of it keeps time with people.js (BPM). Additive effects are realtime only (userData.noPhoto); the mirror ball
// and the coloured light are real, so photo mode keeps them. Modes: 'auto' (after sunset) | 'on' | 'off'.
import * as THREE from 'three';
import { BPM } from './people.js';

export const CLUB_MODES = [['auto', 'Auto (after sunset)'], ['on', 'On'], ['off', 'Off']];
const TAU = Math.PI * 2;
const PALETTES = {
  bali: ['#ffb347', '#ff7a1a', '#ff3d8b', '#ffd27a', '#1fd1c1', '#ff9a3c'],
  riviera: ['#ffcf7a', '#3b8cff', '#ff4fa3', '#ffffff', '#2fd3ff', '#ffb347'],
};

function canvasTex(n, draw) { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d', { willReadFrequently: true }), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
// gobo: what the moving head projects (white on black, tinted by the beam colour)
function goboTex(kind) {
  return canvasTex(256, (g, n) => {
    const c = n / 2; g.fillStyle = '#000'; g.fillRect(0, 0, n, n); g.translate(c, c);
    const disc = g.createRadialGradient(0, 0, 0, 0, 0, c); disc.addColorStop(0, 'rgba(255,255,255,0.95)'); disc.addColorStop(0.8, 'rgba(255,255,255,0.75)'); disc.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = disc; g.beginPath(); g.arc(0, 0, c, 0, TAU); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    if (kind === 'bali') {                                // palm fronds radiating from the centre
      for (let k = 0; k < 7; k++) {
        g.save(); g.rotate((k / 7) * TAU);
        for (let i = 0; i < 9; i++) { const y = -18 - i * 12; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 14, y, 18, 4.5, s * 0.5, 0, TAU); g.fill(); } }
        g.restore();
      }
    } else {                                              // Riviera: sun rays and a ring of dots
      for (let k = 0; k < 16; k++) { g.save(); g.rotate((k / 16) * TAU); g.beginPath(); g.moveTo(0, -24); g.lineTo(-7, -c); g.lineTo(7, -c); g.closePath(); g.fill(); g.restore(); }
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.beginPath(); g.arc(Math.cos(a) * 18, Math.sin(a) * 18, 4, 0, TAU); g.fill(); }
    }
  });
}
const dotTex = () => canvasTex(64, (g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, n, n); });
const sparkleTex = () => canvasTex(256, (g, n) => { g.fillStyle = '#000'; g.fillRect(0, 0, n, n); for (let i = 0; i < 900; i++) { const v = Math.random(); g.fillStyle = `rgba(255,255,255,${v * v})`; g.fillRect((Math.random() * 32 | 0) * 8, (Math.random() * 32 | 0) * 8, 7, 7); } });

// soft volumetric beam: bright at the lamp, fading to the floor and toward the cone's silhouette
// (pow() of the interpolated uv can go a hair below 0 at the rim: clamp, or one NaN pixel is smeared over the frame by bloom)
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, opacity: { value: 0 } },
    vertexShader: 'varying float vV; varying vec3 vN; varying vec3 vP; void main(){ vV = uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vV; varying vec3 vN; varying vec3 vP; void main(){ vec3 V = normalize(cameraPosition - vP); float l = length(vN); float f = l > 1e-5 ? abs(dot(vN / l, V)) : 0.0; float a = pow(clamp(vV, 0.0, 1.0), 1.7) * pow(clamp(f, 0.0, 1.0), 2.6) * opacity; gl_FragColor = vec4(color, clamp(a, 0.0, 1.0)); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const additive = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, ...extra });

export class ClubLights {
  constructor(venue, rig) {
    this.venue = venue; this.rig = rig;
    this.root = new THREE.Group(); this.root.name = 'club_lights'; venue.root.add(this.root);
    this.mode = 'auto'; this.evening = 0; this.theme = 'free'; this.themes = null; this.level = 0; this.t = 0;
    this.sets = {};                                       // theme id -> built show
  }
  setMode(m) { this.mode = m; }
  setEvening(k) { this.evening = k; }                    // k: night factor (0 until the sun is down)
  setTheme(id, themes) {
    this.theme = id; this.themes = themes;
    if (id !== 'free' && themes?.ff && !this.sets[id]) this.sets[id] = this._build(id, themes.ff);
    for (const [k, s] of Object.entries(this.sets)) s.group.visible = k === id;
  }
  // compile every show material ahead of time (non-blocking where the browser supports parallel shader compile)
  prewarm(renderer, camera, scene) {
    const hidden = []; this.root.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { renderer.compileAsync(this.root, camera, scene).catch(() => {}); } finally { for (const o of hidden) o.visible = false; }
  }
  get active() { return this.theme !== 'free' && !!this.sets[this.theme] && (this.mode === 'on' || (this.mode === 'auto' && this.evening > 0.5)); }

  _build(id, ff) {
    const { C, f0, RR, ceil, ja } = ff, at = (r, a) => [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)];
    const g = new THREE.Group(); g.name = `club_${id}`; this.root.add(g);
    const noPhoto = (o) => { o.userData.noPhoto = true; o.frustumCulled = false; return o; };
    const pal = (PALETTES[id] || PALETTES.bali).map((h) => new THREE.Color(h));
    // moving heads + gobos
    const cone = new THREE.ConeGeometry(1, 1, 28, 1, true); cone.translate(0, -0.5, 0);   // apex at the lamp, base 1 m below
    const goboMap = goboTex(id), heads = [];
    for (let k = 0; k < 10; k++) {
      const a = ja + Math.PI + (k - 4.5) * 0.42, r = k % 2 ? 4.2 : 7.6, lamp = at(r, a);
      const beam = noPhoto(new THREE.Mesh(cone, beamMaterial())); beam.renderOrder = 5;
      const gm = additive(goboMap); const gobo = noPhoto(new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), gm)); gobo.renderOrder = 4;
      g.add(beam, gobo);
      heads.push({ lamp: new THREE.Vector3(lamp[0], ceil - 0.55, -lamp[1]), beam, gobo, k, target: new THREE.Vector3(C[0], f0, -C[1]), aim: new THREE.Vector3(C[0], f0, -C[1]) });
    }
    // mirror ball on a rod under the dome, and its specks
    const ballY = ceil - 1.25, ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 3), new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: 0.95, roughness: 0.14, flatShading: true, emissive: '#ffffff', emissiveMap: sparkleTex(), emissiveIntensity: 0 }));
    ball.position.set(C[0], ballY, -C[1]); ball.castShadow = false;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ceil - ballY - 0.3, 6), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.6, roughness: 0.4 }));
    rod.position.set(C[0], (ceil + ballY + 0.3) / 2, -C[1]);
    g.add(ball, rod);
    const specks = new THREE.Group(); specks.position.set(C[0], 0, -C[1]); g.add(specks);
    const N = 260, dot = noPhoto(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.09), additive(dotTex(), { polygonOffset: false, side: THREE.DoubleSide }), N));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    const rWall = RR - 0.42; let n = 0, guard = 0;
    while (n < N && guard++ < 5000) {
      const u = Math.random() * 2 - 1, th = Math.random() * TAU, d = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u, Math.sqrt(1 - u * u) * Math.sin(th));
      const horiz = Math.hypot(d.x, d.z); let tW = horiz > 1e-3 ? rWall / horiz : Infinity, tF = d.y < 0 ? (f0 + 0.012 - ballY) / d.y : Infinity, tC = d.y > 0 ? (ceil - 0.03 - ballY) / d.y : Infinity;
      const tMin = Math.min(tW, tF, tC); p.copy(d).multiplyScalar(tMin); p.y += ballY;
      let normal;
      if (tMin === tW) { if (p.y < f0 + 0.3 || p.y > ceil - 0.2) continue; normal = new THREE.Vector3(-d.x, 0, -d.z).normalize(); }
      else if (tMin === tF) { if (Math.hypot(p.x, p.z) > rWall - 0.2) continue; normal = new THREE.Vector3(0, 1, 0); }
      else normal = new THREE.Vector3(0, -1, 0);
      q.setFromUnitVectors(Z, normal); const sc = 0.7 + Math.random() * 0.8 + tMin * 0.05; s.set(sc, sc, sc);
      m4.compose(p, q, s); dot.setMatrixAt(n++, m4);
    }
    dot.count = n; specks.add(dot);
    // LED pixel rings under the steel rings (96 + 40 pixels)
    const rings = [];
    for (const [rr, cnt] of [[6.6, 96], [3.2, 40]]) {
      const pix = noPhoto(new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.035, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true }), cnt));
      for (let i = 0; i < cnt; i++) { const a = (i / cnt) * TAU, pp = at(rr, a); m4.compose(p.set(pp[0], ceil - 0.39, -pp[1]), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI / 2), s.set(1, 1, 1)); pix.setMatrixAt(i, m4); pix.setColorAt(i, new THREE.Color(0)); }
      g.add(pix); rings.push({ pix, cnt, rr });
    }
    // laser fan from above the DJ
    const laserSrc = at(RR - 1.7, ja), LN = 14;
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LN * 6), 3));
    const laser = noPhoto(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#39ff88', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
    g.add(laser);
    return { group: g, heads, ball, specks, dot, rings, laser, laserSrc: new THREE.Vector3(laserSrc[0], f0 + 2.65, -laserSrc[1]), pal, ff, staticBeams: this._staticBeams(id) };
  }
  // the theme's fixed warm beams (themes.js) give way to the moving heads while the show runs
  _staticBeams(id) { const out = []; this.venue.root.traverse((o) => { if (o.isMesh && o.name === 'theme:beam' && o.parent?.name === `theme_${id}`) out.push(o); }); return out; }

  // eye: camera position; overview: orbit mode. The show is drawn (and borrows the centre light) only when you can
  // see it — on the first floor, or from the overview — so the ground floor never pays for it.
  update(dt, eye, overview = false) {
    const s = this.sets[this.theme];
    const want = this.active ? 1 : 0;
    this.level += Math.sign(want - this.level) * Math.min(Math.abs(want - this.level), dt * 0.8);
    if (!s) { this._release(); return; }
    const seen = overview || !eye || eye.y > s.ff.f0 + 0.3;
    s.group.visible = seen && this.level > 0.001 && this.venue.groups.upper?.visible !== false;   // hidden with the upper floor (overview cut-away)
    for (const b of s.staticBeams) b.visible = this.level < 0.5;
    if (!s.group.visible) { this._release(); return; }
    this.t += dt;
    const t = this.t, beats = t * (BPM / 60), beatFrac = beats % 1, bar = Math.floor(beats / 4), pattern = Math.floor(beats / 32) % 4;
    const pulse = 0.72 + 0.28 * (1 - beatFrac) ** 2, L = this.level, { C, f0 } = s.ff, cx = C[0], cz = -C[1];
    const colour = (i) => s.pal[(i + bar) % s.pal.length];
    // moving heads: targets per pattern, eased so jumps glide
    s.heads.forEach((h, i) => {
      const ph = i / s.heads.length;
      let x, z;
      if (pattern === 0) { const a = t * 0.6 + ph * TAU; x = cx + 3.2 * Math.cos(a); z = cz + 3.2 * Math.sin(a); }                                     // rotating fan
      else if (pattern === 1) { const w = Math.sin(beats * Math.PI / 4 + (i % 2) * Math.PI); x = cx + 3.6 * w * Math.cos(ph * Math.PI); z = cz + 2.2 * Math.sin(ph * TAU); }   // crossing
      else if (pattern === 2) { const k = Math.floor(beats + i * 0.37); const a = ((k * 2.399 + i) % TAU), rr = 1 + ((k * 7 + i * 3) % 40) / 10; x = cx + rr * Math.cos(a); z = cz + rr * Math.sin(a); }   // jump on the beat
      else { x = cx + 4.2 * Math.sin(t * 0.43 + i * 1.7); z = cz + 3.4 * Math.sin(t * 0.61 + i * 2.3); }                                                  // ballyhoo
      h.target.set(x, f0, z); h.aim.lerp(h.target, Math.min(1, dt * (pattern === 2 ? 9 : 4)));
      const dir = h.aim.clone().sub(h.lamp), len = dir.length(); dir.divideScalar(len);
      const rad = 0.07 + len * 0.075;                                                   // ~8° moving-head zoom
      h.beam.position.copy(h.lamp); h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); h.beam.scale.set(rad, len, rad);
      const c = colour(i);
      h.beam.material.uniforms.color.value.copy(c); h.beam.material.uniforms.opacity.value = 0.11 * L * pulse;
      h.gobo.position.set(h.aim.x, f0 + 0.016, h.aim.z); h.gobo.scale.setScalar(Math.max(0.55, rad * 1.25)); h.gobo.rotation.y = t * (i % 2 ? 0.9 : -0.7);
      h.gobo.material.color.copy(c); h.gobo.material.opacity = 0.42 * L * pulse;
    });
    // mirror ball and specks
    s.ball.rotation.y += dt * 0.5; s.specks.rotation.y = -t * 0.32 - 0.0; s.dot.material.opacity = 0.8 * L * (pattern === 3 ? 1 : 0.55);
    s.ball.material.emissiveIntensity = 0.35 * L;
    // LED rings: a chase of the bar's colours, the inner ring counter-rotating; brighter on the beat
    const tmp = new THREE.Color();
    for (const [ri, r] of s.rings.entries()) {
      for (let i = 0; i < r.cnt; i++) {
        const u = i / r.cnt, wave = 0.5 + 0.5 * Math.sin(TAU * (u * (ri ? 3 : 6) - beats * (ri ? -0.5 : 0.25)));
        tmp.copy(colour(Math.floor(u * 4) + ri)).multiplyScalar((0.15 + 2.4 * wave ** 3 * pulse) * L);
        r.pix.setColorAt(i, tmp);
      }
      r.pix.instanceColor.needsUpdate = true;
    }
    // lasers on the peaks (8 bars on, 8 off), sweeping over the heads
    const on = Math.floor(beats / 32) % 2 === 1 ? 1 : 0, pos = s.laser.geometry.attributes.position;
    for (let k = 0; k < 14; k++) {
      const a = Math.atan2(cz - s.laserSrc.z, cx - s.laserSrc.x) + (k / 13 - 0.5) * 1.3 + 0.25 * Math.sin(t * 0.8);
      const dy = 0.35 * Math.sin(t * 1.3 + k * 0.4) - 0.2;
      pos.setXYZ(2 * k, s.laserSrc.x, s.laserSrc.y, s.laserSrc.z);
      pos.setXYZ(2 * k + 1, s.laserSrc.x + Math.cos(a) * 22, s.laserSrc.y + dy * 4, s.laserSrc.z + Math.sin(a) * 22);
    }
    pos.needsUpdate = true; s.laser.material.opacity = 0.5 * L * on; s.laser.material.color.copy(s.pal[4]);
    // the centre practical light (LightRig #9) washes the floor in the bar's colour, pulsing on the beat
    this.rig.override(9, colour(0), 0.8 + 0.9 * pulse * L);
  }
  _release() { this.rig.release(9); }
}
