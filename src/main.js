import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildVenue } from './builder.js';
import { Navigator } from './controls.js';
import { SURFACES, FINISHES, setFinish, currentScheme, applyScheme, lampMaterials, setAnisotropy, onFinishChange, fixedMaterial, registerPhotoFinishes } from './materials.js';
import { loadIndex, loadModel, loadSky, SKY_PRESETS } from './assets.js';
import { MODEL_FOR, prepareModel, buildModelFurniture, placeModel } from './furniture.js';
import * as Geo from './geom.js';
import { Clouds, CLOUD_PRESETS } from './sky.js';
import { Tour } from './tour.js';
import { Post } from './post.js';
import { PhotoMode } from './photo.js';
import { exportGLB } from './export.js';
import { Themes, THEME_LIST, TOUR_NOTES, registerThemeFinishes, migrateSchemes } from './themes.js';
import { setKitAnisotropy } from './themekit.js';
import { Elements } from './elements.js';
import { LightRig } from './lighting.js';
import * as Profiles from './profiles.js';
import { Crowd, PEOPLE_MODES, CROWD_LEVELS } from './people.js';
import { ClubLights, CLUB_MODES } from './clublights.js';
import { Minimap } from './minimap.js';

const $ = (s) => document.querySelector(s);
// ?safe: start without this browser's saved look, with people and club lights off and the fast pipeline
const QS = new URLSearchParams(location.search);
const SAFE = QS.has('safe');
// GPU budget. At full budget the twin asks the GPU for ~1.1 GB (textures ~0.5, MSAA HDR targets, 4K shadows). Safari
// gets the full look with textures capped at 2K (~0.8 GB). "Lite" — only in a browser that has lost the WebGL context
// here — caps the canvas at ~2 Mpx, drops MSAA on the HDR target, halves the shadow map and textures (~0.35 GB).
// ?lite forces it, ?full turns it off (and forgets a previous context loss). A context loss recorded before
// 27 Oct 2026 (value '1': Safari's own GPU state, cured by restarting the browser) is forgotten.
const IS_SAFARI = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
if (QS.has('full') || lsGet('skybrew.lite') === '1') lsSet('skybrew.lite', null);
const LITE = !QS.has('full') && (QS.has('lite') || lsGet('skybrew.lite') === '2');
// pixels: the budget's canvas size, times an adaptive scale that drops when the frame rate sags (see the loop)
let resScale = 1;
const pixelRatio = () => Math.max(0.75, resScale * Math.min(devicePixelRatio, 1.75, Math.sqrt((LITE ? 2.0e6 : 4.5e6) / Math.max(1, innerWidth * innerHeight))));
const SHADOW_HI = LITE ? 2048 : 4096, TEX_MAX = LITE ? 512 : IS_SAFARI ? 2048 : 4096;
// lite budget: image textures above TEX_MAX are redrawn at TEX_MAX (clones share the image, so once each); run after
// anything that adds textures (start, models, each theme). Already-uploaded ones re-upload at the smaller size.
const shrunk = new WeakSet();
function budgetTextures(root) {
  if (TEX_MAX >= 4096) return;
  root.traverse((o) => {
    for (const m of o.material ? [].concat(o.material) : []) for (const k in m) {
      const t = m[k]; if (!t?.isTexture || t.isRenderTargetTexture) continue;
      const im = t.image;
      if (!im || shrunk.has(im) || !(im.width > TEX_MAX || im.height > TEX_MAX)) continue;
      if (!(im instanceof HTMLImageElement || im instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap))) continue;
      const f = TEX_MAX / Math.max(im.width, im.height), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * f)); c.height = Math.max(1, Math.round(im.height * f));
      c.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0, c.width, c.height);
      shrunk.add(c); t.image = c; t.needsUpdate = true;
    }
  });
}
// on-screen diagnostics: the first errors (frame loop, shaders, GPU) plus the browser and GPU, so a blank view explains itself
const diagLines = [];
function diag(msg, action) {
  msg = String(msg).slice(0, 400);
  if (diagLines.length >= 6 || diagLines.includes(msg)) return;
  diagLines.push(msg);
  const box = $('#diag'); if (!box) return;
  let gpu = '?'; try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* no context */ }
  box.hidden = false;
  box.textContent = `The 3D view hit an error — a screenshot of this box tells us why.\n${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')}\nGPU: ${gpu} · ${innerWidth}×${innerHeight} @${devicePixelRatio} · budget ${LITE ? 'lite' : 'full'}\n\n${diagLines.join('\n')}`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.run; b.style.cssText = 'display:block;margin-top:8px'; box.appendChild(b); }
}
const where = (err) => (err?.stack || '').split('\n').find((l) => /\.js:\d+/.test(l))?.trim().replace(/^at /, '').replace(location.origin, '') || '';
addEventListener('error', (e) => diag(`Error: ${e.message} ${where(e.error)}`));
addEventListener('unhandledrejection', (e) => diag(`Unhandled: ${e.reason?.message || e.reason} ${where(e.reason)}`));
{ const ce = console.error.bind(console); console.error = (...a) => { ce(...a); const s = a.map((x) => (x?.message ? `${x.message} ${where(x)}` : String(x))).join(' '); if (/THREE|WebGL|shader|program|Error/i.test(s)) diag(s); }; }
const LAT = 24.4672, LON = 54.3695, TZ = 4;           // Le Méridien Abu Dhabi

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
// the sun's shadow map (~0.7 M triangles into a 4K map) is redrawn only when something that casts may have changed:
// any setting or key, the time of day, a theme, and ten times a second while people walk about — not every frame
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
let shadowDirty = true, shadowT = 0;
const shadowsChanged = () => { shadowDirty = true; };
for (const ev of ['input', 'change', 'keyup', 'click']) document.addEventListener(ev, shadowsChanged, true);   // settings, X / F keys, wall clicks
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 0.55;
$('#stage').appendChild(renderer.domElement);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

// physical haze: transmittance falls off as exp(-σ·d), not three's exp(-(σ·d)²)
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace('exp( - fogDensity * fogDensity * vFogDepth * vFogDepth )', 'exp( - fogDensity * vFogDepth )');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 6000);
// Gulf haze: ~10 km visibility, so the towers across the channel soften and the far city fades into the horizon
scene.fog = new THREE.FogExp2(0xcfe0e8, 0.00026);

const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
// a dusty Gulf atmosphere: hazier than three's defaults, with a bright forward-scattering glow round the sun
Object.assign(sky.material.uniforms.turbidity, { value: 4.6 });
Object.assign(sky.material.uniforms.rayleigh, { value: 2.0 });
Object.assign(sky.material.uniforms.mieCoefficient, { value: 0.0055 });
Object.assign(sky.material.uniforms.mieDirectionalG, { value: 0.86 });
// three r18x's Sky paints its own flat-projected clouds (they smear into streaks); ours are in sky.js
sky.material.uniforms.cloudCoverage.value = 0;
// Two additions to three's Sky (Preetham):
//  * twilight: Preetham goes black the moment the sun sets; real Gulf twilight is a long blue hour with an
//    orange afterglow low in the west, so add it back while the sun is 0–12° below the horizon;
//  * skyGain lifts the visible sky at golden hour (a camera exposes for the bright west sky). The copy that
//    lights the venue (skyForEnv) keeps gain 1 so the lighting stays physical.
function patchSky(s) {
  s.material.uniforms.skyGain = { value: 1 }; s.material.uniforms.twilight = { value: 0 }; s.material.uniforms.cityGlow = { value: 0 };
  s.material.fragmentShader = s.material.fragmentShader.replace('uniform float time;', 'uniform float time;\nuniform float skyGain;\nuniform float twilight;\nuniform float cityGlow;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', `if ( twilight > 0.0 ) {
				float hz = max( direction.y, 0.0 );
				vec2 dh = normalize( direction.xz + 1e-4 ), sh = normalize( vSunDirection.xz + 1e-4 );
				float toSun = max( dot( dh, sh ), 0.0 );
				vec3 blue = mix( vec3( 0.05, 0.055, 0.075 ), vec3( 0.014, 0.026, 0.06 ), pow( hz, 0.45 ) );
				vec3 glow = vec3( 0.3, 0.11, 0.035 ) * pow( toSun, 2.5 ) * exp( -hz * 7.0 ) + vec3( 0.05, 0.03, 0.04 ) * exp( -hz * 3.0 );
				texColor += ( blue + glow * twilight ) * twilight;
			}
			// light pollution: an Abu Dhabi night sky is never black — brown-orange low down, dim blue overhead
			texColor += mix( vec3( 0.022, 0.016, 0.012 ), vec3( 0.004, 0.006, 0.012 ), pow( max( direction.y, 0.0 ), 0.4 ) ) * cityGlow;
			gl_FragColor = vec4( texColor * skyGain, 1.0 );`);
}
patchSky(sky);

const clouds = new Clouds(); scene.add(clouds.mesh);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(SHADOW_HI, SHADOW_HI);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 45, bottom: -45, near: 1, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdbeeff, 0xd8c7a8, 1.2); scene.add(hemi);
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene(); const skyForEnv = new Sky(); skyForEnv.scale.setScalar(1000); skyScene.add(skyForEnv); patchSky(skyForEnv);
for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage']) skyForEnv.material.uniforms[k].value = sky.material.uniforms[k].value;
const envClouds = clouds.makeMesh(); skyScene.add(envClouds);   // reflections, environment light and photo mode see the clouds too
let envRT = null;

// Sky probe: reads the procedural sky's real radiance (zenith + 8 horizon bearings) after each time change, so
// the haze and the shaded side of the clouds take the actual sky colour instead of a guess
const probe = { rt: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), cam: new THREE.PerspectiveCamera(8, 1, 1, 5000), buf: new Uint16Array(64) };
const horizonPalette = Array.from({ length: 8 }, () => new THREE.Color(0xcfe0e8));
function probeSky(az, el) {
  probe.cam.position.set(0, 0, 0); probe.cam.lookAt(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
  renderer.setRenderTarget(probe.rt); renderer.render(skyScene, probe.cam); renderer.setRenderTarget(null);
  renderer.readRenderTargetPixels(probe.rt, 0, 0, 4, 4, probe.buf);
  const c = new THREE.Color(0, 0, 0); const f = THREE.DataUtils.fromHalfFloat;
  for (let i = 0; i < 16; i++) { c.r += f(probe.buf[i * 4]) / 16; c.g += f(probe.buf[i * 4 + 1]) / 16; c.b += f(probe.buf[i * 4 + 2]) / 16; }
  return c;
}
function sampleSky() {
  envClouds.visible = false;
  const horizon = new THREE.Color(0, 0, 0), zenith = new THREE.Color(0, 0, 0);
  const g = sky.material.uniforms.skyGain.value;
  for (let i = 0; i < 8; i++) { horizonPalette[i].copy(probeSky((i / 8) * Math.PI * 2, 0.03)).multiplyScalar(g); horizon.add(horizonPalette[i]); }
  for (let i = 0; i < 2; i++) zenith.add(probeSky(i * Math.PI + sunAz, 1.2));
  envClouds.visible = true;
  return { horizon: horizon.multiplyScalar(1 / 8), zenith: zenith.multiplyScalar(0.5 * g) };
}
// haze colour for the way the camera faces: the horizon sky behind distant buildings, averaged over the view
const _fw = new THREE.Vector3();
function hazeForView(out) {
  camera.getWorldDirection(_fw); const az = Math.atan2(_fw.x, -_fw.z);
  out.setRGB(0, 0, 0); let wsum = 0;
  for (let i = 0; i < 8; i++) {
    const w = Math.max(0, Math.cos(az - (i / 8) * Math.PI * 2)) ** 2 + 0.08; out.r += horizonPalette[i].r * w; out.g += horizonPalette[i].g * w; out.b += horizonPalette[i].b * w; wsum += w;
  }
  return out.multiplyScalar(0.95 / wsum);
}
let sunAz = 0, sunEl = 0.1; const sunDirNow = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ load + build
const V = await (await fetch('data/venue.json')).json();
const ASSETS = await loadIndex();                       // downloaded photo textures / models / skies (optional)
const photoFinishes = registerPhotoFinishes(ASSETS);
registerThemeFinishes();                                // Skybrew Bali / Riviera finishes join the surface registry
setKitAnisotropy(renderer.capabilities.getMaxAnisotropy());
const brand = await fetch('data/brand.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
const osm = await fetch('data/osm_buildings.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
const landscape = osm ? await fetch('data/osm_landscape.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
// the site DWG grid is rotated vs true north (registered against OpenStreetMap: pipeline/osm_register.py)
const GEO = await fetch('data/georef.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
const NORTH = GEO ? (GEO.rot_deg * Math.PI) / 180 : 0;      // add to a true bearing to get the drawing's bearing
const venue = buildVenue(V, { osm, landscape });
const elements = new Elements(venue);                   // walls you can turn into glass (X / click in overview)
const rig = new LightRig(venue.lights);                 // practical lights, re-aimed per theme
scene.add(venue.root);
budgetTextures(scene);
const nav = new Navigator(camera, renderer.domElement, venue);
nav.dragLook = new URLSearchParams(location.search).has('drag');
document.body.classList.toggle('draglook', nav.dragLook);
const minimap = new Minimap($('#minimap'), V, venue, (p) => nav.teleport(p, [p[0], p[1] + 5]), NORTH);
const t0 = performance.now();
const tour = new Tour(V, venue, nav, scene);
console.info(`guided route planned in ${Math.round(performance.now() - t0)} ms, ${tour.length.toFixed(0)} m`);
minimap.setRoute(tour.path, tour.stops.map((st, k) => tour.path[tour._indexAt(tour.stopS[k])]));
const crowd = new Crowd(venue, tour);                     // people: seated, standing, walking, dancing (people.js)
const club = new ClubLights(venue, rig);                  // first-floor light show (clublights.js)

// ------------------------------------------------------------------ downloaded models: furniture, plants, décor
// The parametric placeholders render first; real models replace them type by type as they load.
const SEATING_TYPES = new Set(['chair', 'armchair', 'sofa', 'loveseat', 'bar_stool']);
async function upgradeWithModels() {
  if (!ASSETS) return;
  const fy = (x, y) => venue.floorAt(x, y) ?? 0;
  const prep = new Map();                                  // model id -> prepared (shared by sofa + loveseat)
  const getPrep = async (id, opts = {}) => {
    const key = `${id}#${opts.node || ''}`;
    if (!prep.has(key)) prep.set(key, loadModel(id).then((s) => (s ? prepareModel(s.clone(), opts) : null)));
    return prep.get(key);
  };
  const byType = new Map();
  await Promise.all(Object.entries(MODEL_FOR).map(async ([type, { id, node }]) => {
    byType.set(type, await getPrep(id, { seating: SEATING_TYPES.has(type), longOnZ: true, node }));
  }));
  const models = new THREE.Group(); models.name = 'model_furniture';
  const covered = buildModelFurniture(venue.items, fy, byType, models);
  for (const im of [...venue.furnitureGroup.children]) if (covered.has(im.userData.type)) venue.furnitureGroup.remove(im);
  venue.groups.furniture.add(models);

  // plants: potted plants in the pods / courtyard, potted trees indoors (positions from the CAD plant symbols)
  const [pot2, pot4, pachira, shrub] = await Promise.all(['potted_plant_02', 'potted_plant_04', 'pachira_aquatica_01', 'shrub_04'].map((id) => getPrep(id)));
  const T = V.features.courtyard_tree;
  const plants = V.plants.filter((p) => Math.hypot(p.at[0] - T.center[0], p.at[1] - T.center[1]) > T.radius + 0.3);
  const inside = (p, z) => Geo.inside(p, venue.zones[z]);
  const group = new THREE.Group(); group.name = 'model_plants';
  const fit = (m, h) => (m ? h / m.size.y : 1);
  const sets = { pot2: [], pot4: [], pachira: [] };
  plants.forEach((p, i) => {
    const pl = { p: p.at, y: fy(...p.at), rot: i * 2.39 };
    if (inside(p.at, 'indoor') && pachira) sets.pachira.push({ ...pl, s: fit(pachira, 1.9) });
    else if (i % 2 && pot4) sets.pot4.push({ ...pl, s: fit(pot4, 1.0) });
    else if (pot2) sets.pot2.push({ ...pl, s: fit(pot2, 1.1) });
  });
  if (pot2 && sets.pot2.length) placeModel(pot2, sets.pot2, group, 'pot2');
  if (pot4 && sets.pot4.length) placeModel(pot4, sets.pot4, group, 'pot4');
  if (pachira && sets.pachira.length) placeModel(pachira, sets.pachira, group, 'pachira');
  venue.groups.plants.children.filter((c) => c.name === 'shrubs').forEach((c) => venue.groups.plants.remove(c));
  venue.groups.plants.add(group);

  // décor seen in video 1: wooden lanterns on the beach deck, wicker baskets by the indoor columns,
  // white sphere planters at the arrival court
  const [lantern, basket, vase] = await Promise.all(['wooden_lantern_01', 'wicker_basket_01', 'ceramic_vase_01'].map((id) => getPrep(id)));
  const decor = new THREE.Group(); decor.name = 'model_decor';
  if (lantern) {
    const deckTables = venue.items.filter((f) => f.zone === 'beach_deck' && f.type === 'table' && f.l > 1.5);
    const spots = deckTables.map((f, i) => {
      const a = (f.angle * Math.PI) / 180, d = f.l / 2 + 0.55;
      const p = [f.at[0] + Math.cos(a) * d * (i % 2 ? 1 : -1), f.at[1] + Math.sin(a) * d * (i % 2 ? 1 : -1)];
      return { p, y: fy(...p), rot: i, s: fit(lantern, 0.55) };
    });
    placeModel(lantern, spots, decor, 'lanterns');
  }
  if (basket) {
    const cols = V.solids.filter((s) => s.kind === 'column' && inside(Geo.centroid(s.outer), 'indoor'));
    placeModel(basket, cols.map((c, i) => { const q = Geo.centroid(c.outer); const p = [q[0] + 0.5, q[1] - 0.35]; return { p, y: fy(...p), rot: i * 1.7, s: fit(basket, 0.42) }; }), decor, 'baskets');
  }
  // (the white sphere planters at the arrival court are parametric now — builder.js; the downloaded vase has a
  //  narrow neck and the twiggy shrub model floated above it)
  void vase; void shrub;
  venue.groups.furniture.add(decor);
  console.info(`models in: furniture types ${[...covered].join(', ')}; plants ${plants.length}`);
}

// ------------------------------------------------------------------ photo skies (HDRI) — rotated to the real sun bearing
let skyMode = 'procedural', skyTex = null, skyEnvRT = null;
function solveTimeForElevation(el) {                    // afternoon time on 23 Oct with that sun elevation
  let lo = 12, hi = 18.6;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (sunAt(new Date(), mid).el > el) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
async function setSky(id) {
  skyMode = id; $('#skySel').value = id;
  $('#cloudRow').style.display = id === 'procedural' ? '' : 'none';   // photo skies bring their own clouds
  if (id === 'procedural') {
    scene.background = null; sky.visible = true; clouds.mesh.visible = true; skyTex = null;
    skyEnvRT?.dispose(); skyEnvRT = null; envDirty = true; applyTime(timeOfDay); return;
  }
  const t = await loadSky(id, '2k'); if (!t || skyMode !== id) return;
  const S = t.userData.sun;
  const night = id.includes('night');
  const h = night ? 20.5 : solveTimeForElevation(Math.max(0.01, S.el));
  applyTime(h, true);                                    // sun light + lamps for that moment, keep the photo sky
  const { az: azTrue, el } = sunAt(new Date(), h); const az = azTrue + NORTH;
  const world = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const rot = night ? 0 : S.ang - Math.atan2(world.z, world.x);
  scene.backgroundRotation.set(0, rot, 0); scene.environmentRotation.set(0, rot, 0);
  skyEnvRT?.dispose(); skyEnvRT = pmrem.fromEquirectangular(t);
  scene.environment = skyEnvRT.texture; scene.environmentIntensity = night ? 1.0 : 0.85;
  scene.background = t; scene.backgroundIntensity = 1;
  sky.visible = false; clouds.mesh.visible = false; skyTex = t;
  scene.fog.color.copy(t.userData.horizon).multiplyScalar(0.9);
  hemi.intensity *= 0.35;
  $('#time').value = h;
}

// ------------------------------------------------------------------ sun position (NOAA approximation)
function sunAt(date, hours) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const doy = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
  const g = (2 * Math.PI / 365) * (doy - 1 + (hours - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hours * 60 + eqt + 4 * LON - 60 * TZ;
  const ha = (tst / 4 - 180) * Math.PI / 180, lat = LAT * Math.PI / 180;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZ)));
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen)))));
  az = ha > 0 ? (az + Math.PI) % (2 * Math.PI) : (3 * Math.PI - az) % (2 * Math.PI);
  return { el: Math.PI / 2 - zen, az };                 // az clockwise from north
}

let restoring = false, saveTimer = 0;                   // profile autosave (see saveSoon)
let pickables = [], hoveredEl = null;                   // crosshair picking (surfaces + wall elements)
let themes = null;                                      // assigned once the venue + brand are loaded (see setTheme)
let timeOfDay = 17.5;                                   // evening by default (sunset ≈ 17:47 on 23 Oct)
function applyTime(h, keepSky = false) {
  timeOfDay = h; shadowDirty = true;
  if (!keepSky && skyMode !== 'procedural') { setSky('procedural'); return; }
  const { el, az: azTrue } = sunAt(new Date(), h); const az = azTrue + NORTH;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const day = THREE.MathUtils.smoothstep(el, -0.08, 0.12);
  const golden = 1 - THREE.MathUtils.smoothstep(el, 0.05, 0.45);
  const center = new THREE.Vector3(-2, 0, -2);
  sun.position.copy(center).addScaledVector(dir, 150); sun.target.position.copy(center);
  sun.intensity = 3.4 * day; sun.visible = el > -0.02;
  sun.color.setHSL(0.09, 0.6 * golden + 0.15, 0.62 + 0.25 * (1 - golden));
  hemi.intensity = 0.15 + 0.8 * day;                    // dimmer sky fill: interiors read lamp-lit, as in the renders
  hemi.color.setHSL(0.57, 0.5, 0.35 + 0.5 * day);
  for (const s of [sky, skyForEnv]) s.material.uniforms.sunPosition.value.copy(dir);
  renderer.toneMappingExposure = 0.44 + 0.16 * day;
  // the procedural sky is many times brighter at noon than at sunset: ease its reflected light down as the sun climbs
  envIntensity = 0.2 + 0.42 * golden;
  const night = 1 - THREE.MathUtils.smoothstep(el, -0.12, 0.2);     // lamps warm up from late afternoon
  for (const m of lampMaterials()) m.emissiveIntensity = 0.1 + 2.6 * night;
  fixedMaterial('tower').emissiveIntensity = 1.4 * Math.max(0, night - 0.25);
  venue.city?.setNight(night);
  sunAz = az; sunEl = el; sunDirNow.copy(dir);
  sky.material.uniforms.skyGain.value = 1 + 0.7 * golden * day;
  // blue hour: strongest just after sunset, gone once the sun is 12° down (nautical dusk)
  const tw = THREE.MathUtils.smoothstep(el, -0.21, -0.035) * (1 - THREE.MathUtils.smoothstep(el, -0.035, 0.05));
  const glow = 1 - THREE.MathUtils.smoothstep(el, -0.16, -0.03);
  for (const s of [sky, skyForEnv]) { s.material.uniforms.twilight.value = tw; s.material.uniforms.cityGlow.value = glow; }
  clouds.update(dir, el);
  // practical lamps: barely on at midday, fully on from golden hour (k drives real lights + light-pool decals)
  const evening = 1 - THREE.MathUtils.smoothstep(el, 0.02, 0.35);
  rig.set(0.15 + 0.85 * Math.max(evening, night));
  crowd.setEvening(Math.max(evening, night)); club.setEvening(night);   // the DJ pub fills from golden hour; the light show starts after sunset
  hemi.intensity += 0.25 * night; hemi.color.lerp(new THREE.Color(0x6f86b8), night);
  renderer.toneMappingExposure += 0.4 * night;
  themes?.setNight(night);
  envDirty = skyMode === 'procedural';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  $('#timeLabel').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
let envDirty = true, envTimer = 0, envIntensity = 0.9;
function updateEnv() {
  clouds.update(sunDirNow, sunEl, sampleSky());     // samples already carry skyGain
  envRT?.dispose(); envRT = pmrem.fromScene(skyScene, 0, 1, 2000);
  scene.environment = envRT.texture; scene.environmentIntensity = envIntensity;
}

// ------------------------------------------------------------------ realtime post + photo mode + export
const isOverlay = (o) => o.isSprite || o.isPoints || o.name === 'labels' || o.name === 'tour' || o === sky || o === clouds.mesh;
const post = new Post(renderer, scene, camera, (hide) => {
  scene.traverse((o) => { if ((o.isMesh && (o.material?.transparent || o.material?.alphaTest > 0)) || isOverlay(o)) hide(o); });
}, { samples: LITE ? 0 : 4 });
const photo = new PhotoMode(renderer, camera, {
  venueRoot: venue.root, skyScene, sun, lights: venue.lights,
  // with a photo sky, trace against its 4K version (the HDRI carries the sun, so no extra sun light)
  photoSky: async () => (skyMode === 'procedural' ? null : { texture: await loadSky(skyMode, '4k'), rotation: scene.environmentRotation.clone() }),
  skip: (o) => o.isSprite || o.userData.noPhoto,          // additive halos / light beams are realtime-only
});
// ---- view bar: full screen + hide menus (H)
const fsBtn = $('#fsBtn'), uiBtn = $('#uiBtn');
function setUiHidden(h) {
  document.body.classList.toggle('hideui', h);
  uiBtn.textContent = h ? '☰ Show menus' : '◱ Hide menus';
}
function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  Promise.resolve(req?.call(el, { navigationUI: 'hide' })).catch(() => toast('Full screen is blocked in this window. Use the browser’s own full screen (⌃⌘F on Mac, F11 on Windows).', 6000));
}
fsBtn.addEventListener('click', () => { toggleFullscreen(); fsBtn.blur(); });
uiBtn.addEventListener('click', () => { setUiHidden(!document.body.classList.contains('hideui')); uiBtn.blur(); });
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => { fsBtn.textContent = document.fullscreenElement || document.webkitFullscreenElement ? '⤡ Exit full screen' : '⛶ Full screen'; });
}
let toastTimer = 0;
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
// the quality you chose is what a profile keeps; the automatic switch to Standard on a slow frame rate is for this visit only
let userQuality = $('#quality').value;
$('#quality').addEventListener('change', (e) => { post.enabled = e.target.value === 'cinematic'; userQuality = e.target.value; saveSoon(); });
// colour: AgX (filmic, the natural sky) or Khronos PBR Neutral (finishes shown as specified, for colour checks)
let colourMode = 'filmic';
function setColourMode(m) {
  colourMode = m === 'true' ? 'true' : 'filmic'; $('#colourSel').value = colourMode;
  renderer.toneMapping = colourMode === 'true' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
  scene.traverse((o) => { for (const mm of o.material ? [].concat(o.material) : []) mm.needsUpdate = true; });
}
$('#colourSel').addEventListener('change', (e) => { setColourMode(e.target.value); saveSoon(); });
// people + club lights
{
  const fill = (sel, list, v) => { sel.innerHTML = list.map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); sel.value = v; };
  if (LITE) {
    const n = $('#gpuNote'); n.hidden = false; n.textContent = 'Lite GPU budget (this browser lost the 3D view here once): a smaller canvas and textures. ';
    const b = document.createElement('button'); b.textContent = 'Use full detail'; b.onclick = () => { lsSet('skybrew.lite', null); location.reload(); }; n.appendChild(b);
  }
  if (SAFE) { crowd.setMode('off'); club.setMode('off'); post.enabled = false; $('#quality').value = 'standard'; toast('Safe start: saved look not loaded, people and club lights off, Standard quality.', 6000); }
  fill($('#peopleSel'), PEOPLE_MODES, crowd.mode); fill($('#crowdSel'), CROWD_LEVELS, crowd.level); fill($('#clubSel'), CLUB_MODES, club.mode);
  $('#peopleSel').addEventListener('change', (e) => { crowd.setMode(e.target.value); $('#crowdSel').disabled = e.target.value === 'off'; saveSoon(); });
  $('#crowdSel').addEventListener('change', (e) => { crowd.setLevel(e.target.value); saveSoon(); });
  $('#clubSel').addEventListener('change', (e) => { club.setMode(e.target.value); saveSoon(); });
}
photo.addEventListener('state', ({ detail: d }) => {
  const box = $('#photo');
  if (d.state === 'off') { box.hidden = true; document.body.classList.remove('photo'); return; }
  box.hidden = false; document.body.classList.add('photo');
  if (d.state === 'preparing') { $('#photoStatus').textContent = `Building light paths… ${d.progress ?? 0}%`; $('#photoBar').style.width = `${d.progress ?? 0}%`; }
  else { $('#photoStatus').textContent = d.state === 'done' ? `Done · ${d.samples} samples` : `${d.samples} / ${d.target} samples`; $('#photoBar').style.width = `${Math.min(100, (d.samples / d.target) * 100)}%`; }
});
async function enterPhoto() {
  if (photo.active || photo.busy) return;
  tour.pause(); document.exitPointerLock?.();
  try { await photo.enter(); } catch (err) { console.error(err); photo.exit(); toast('Photo mode is not supported on this GPU / browser.'); }
}
$('#photoBtn').onclick = enterPhoto;
$('#photoSave').onclick = () => photo.save();
$('#photoExit').onclick = () => photo.exit();
$('#exportBtn').onclick = async () => {
  try { await exportGLB(venue.root, { skip: (o) => o.isSprite || o.name === 'labels', onStatus: (m) => toast(m, 6000) }); }
  catch (err) { console.error(err); toast('Export failed — see console.'); }
};

// ------------------------------------------------------------------ UI wiring
const G = venue.groups;
const toggles = {
  furniture: (v) => { G.furniture.visible = v; G.lamps.visible = v; },
  ceilings: (v) => { G.ceilings.visible = v; G.roofs.visible = v; },
  upper: (v) => { G.upper.visible = v; },
  doors: (v) => { G.doorsClosed.visible = v; G.doorsOpen.visible = !v; nav.setDoorsClosed(v); },
  context: (v) => { G.context.visible = v; },
  labels: (v) => { G.labels.visible = v && nav.mode === 'orbit'; },
  shadows: (v) => { sun.shadow.mapSize.set(v ? SHADOW_HI : 1024, v ? SHADOW_HI : 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; },
};
for (const [k, fn] of Object.entries(toggles)) {
  const el = $(`#t_${k}`); fn(el.checked); el.addEventListener('change', () => fn(el.checked));
}
$('#time').addEventListener('input', (e) => { applyTime(+e.target.value); saveSoon(); });
{
  const sel = $('#skySel'); const have = new Set((ASSETS?.hdri || []).map((h) => h.id));
  for (const p of SKY_PRESETS) if (p.id === 'procedural' || have.has(p.id)) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; sel.appendChild(o); }
  sel.addEventListener('change', () => { setSky(sel.value); saveSoon(); });
  const cs = $('#cloudSel');
  for (const [id, p] of Object.entries(CLOUD_PRESETS)) { const o = document.createElement('option'); o.value = id; o.textContent = p.label; cs.appendChild(o); }
  cs.value = clouds.preset;
  cs.addEventListener('change', () => { clouds.setPreset(cs.value); envDirty = skyMode === 'procedural'; saveSoon(); });
}
$('#time').value = timeOfDay; applyTime(timeOfDay);

const hsWrap = $('#hotspots');
venue.hotspots.forEach((h, i) => {
  const b = document.createElement('button'); b.innerHTML = `<kbd>${i + 1}</kbd>${h.label}`; if (i < 10) b.title = `Key ${(i + 1) % 10}`;   // keys 1–9, 0 = stop 10
  b.onclick = () => nav.teleport(h.p, h.look, true, h.ref); hsWrap.appendChild(b);
});
$('#modeWalk').onclick = () => nav.setMode('walk');
$('#modeOrbit').onclick = () => nav.setMode('orbit');
nav.addEventListener('mode', (e) => {
  document.body.dataset.mode = e.detail;
  $('#modeWalk').classList.toggle('on', e.detail === 'walk'); $('#modeOrbit').classList.toggle('on', e.detail === 'orbit');
  // overview: lift the lid so the plan reads; walk: put it back as the user left it
  const cut = e.detail === 'orbit' && $('#t_cutaway').checked;
  G.ceilings.visible = !cut && $('#t_ceilings').checked; G.roofs.visible = G.ceilings.visible; G.upper.visible = !cut && $('#t_upper').checked;
  G.labels.visible = e.detail === 'orbit' && $('#t_labels').checked;
});
nav.dispatchEvent(new CustomEvent('mode', { detail: nav.mode }));
$('#t_cutaway').addEventListener('change', () => nav.dispatchEvent(new CustomEvent('mode', { detail: nav.mode })));
nav.addEventListener('lock', (e) => document.body.classList.toggle('locked', e.detail));

// ---- guided walk card
function renderTour({ i, stop, playing, n }) {
  $('#tourStep').textContent = `${i + 1} / ${n}`;
  $('#tourTitle').textContent = stop.title; $('#tourText').textContent = stop.text;
  $('#tourPlay').innerHTML = playing ? '❚❚ Pause' : (i === 0 && !tour.started ? '▶ Start guided walk' : '▶ Continue');
  $('#tourPlay').classList.toggle('on', !playing);
  document.querySelectorAll('#tourDots i').forEach((d, k) => d.classList.toggle('on', k === i));
}
$('#tourDots').innerHTML = tour.stops.map((s) => `<i title="${s.title}"></i>`).join('');
document.querySelectorAll('#tourDots i').forEach((d, k) => d.onclick = () => tour.goTo(k));
tour.addEventListener('change', (e) => renderTour(e.detail));
$('#tourPlay').onclick = () => { tour.started = true; tour.toggle(); };
$('#tourNext').onclick = () => tour.next();
$('#tourPrev').onclick = () => tour.prev();
$('#t_route').addEventListener('change', (e) => tour.setVisible(e.target.checked));
renderTour({ i: 0, stop: tour.stops[0], playing: false, n: tour.stops.length });
// any manual movement takes over from the auto-walk
addEventListener('keydown', (e) => { if (tour.playing && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) tour.pause(); });
addEventListener('mousemove', (e) => { if (tour.playing && document.pointerLockElement && Math.hypot(e.movementX, e.movementY) > 6) tour.pause(); });

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.code === 'KeyG') { tour.started = true; tour.toggle(); }
  if (e.code === 'KeyN') tour.next();
  if (e.code === 'KeyB') tour.prev();
  if (e.code === 'KeyO') nav.setMode(nav.mode === 'orbit' ? 'walk' : 'orbit');
  if (e.code === 'KeyP') screenshot();
  if (e.code === 'KeyC') enterPhoto();
  if (e.code === 'Escape' && (photo.active || photo.busy)) photo.exit();
  if (e.code === 'KeyF' && hovered) cycleFinish(hovered);
  if (e.code === 'KeyX' && hoveredEl) { elements.toggle(hoveredEl); pick(); toast(elements.isGlass(hoveredEl) ? 'Now glass — see-through and reflective (Finishes → Glazing / Glazing frames).' : 'Back to a solid wall.', 2500); }
  if (e.code === 'KeyH') setUiHidden(!document.body.classList.contains('hideui'));
  const n = e.code.startsWith('Digit') ? +e.code.slice(5) : -1;
  if (n >= 0) { const h = venue.hotspots[n === 0 ? 9 : n - 1]; if (h) nav.teleport(h.p, h.look, true, h.ref); }
});

// ---- design panel: one select per surface, grouped
function buildDesignPanel() {
  const wrap = $('#design'); wrap.innerHTML = '';
  const groups = {};
  for (const [id, s] of Object.entries(SURFACES)) (groups[s.group] ||= []).push([id, s]);
  for (const [g, list] of Object.entries(groups)) {
    const h = document.createElement('h4'); h.textContent = g; wrap.appendChild(h);
    for (const [id, s] of list) {
      const row = document.createElement('label'); row.className = 'row';
      row.innerHTML = `<span>${s.label}</span>`;
      const sel = document.createElement('select'); sel.id = `s_${id}`;
      for (const f of s.choices) { const o = document.createElement('option'); o.value = f; o.textContent = FINISHES[f].label; sel.appendChild(o); }
      sel.value = s.finish; sel.onchange = () => setFinish(id, sel.value);
      row.appendChild(sel); wrap.appendChild(row);
    }
  }
}
buildDesignPanel();
onFinishChange((id, f) => { const s = $(`#s_${id}`); if (s) s.value = f; saveSoon(); });
const DEFAULTS = currentScheme();
// ---- themes: Free (as built) / Skybrew Bali / Skybrew Riviera (from the contractor's render pack)
themes = brand ? new Themes({ V, venue, brand, defaults: DEFAULTS }) : null;
const baseStops = tour.stops.map((s) => ({ text: s.text, title: s.title }));
const baseHot = venue.hotspots.map((h) => ({ ...h }));
const THEME_HOT = {                                   // where a theme moves / renames a viewpoint
  lounge: (t) => ({ label: 'Live-music stage & logo', p: [6.8, 3.8], look: t.site.stage.wallPoint }),
  upstairs: (t) => ({ label: 'First floor – DJ pub', look: (() => { const C = V.features.drum.center, a = t.site.ff.dj.am; return [C[0] + 12 * Math.cos(a), C[1] + 12 * Math.sin(a)]; })() }),
};
let addedColliders = 0;
async function setTheme(id, quiet = false) {
  if (!themes) return;
  if (id !== 'free' && !themes.built[id] && !quiet) { toast(`Building the ${THEME_LIST.find((t) => t.id === id).label} theme…`, 2500); await new Promise((r) => setTimeout(r, 60)); }
  await themes.set(id);
  afterTheme(id, quiet);
}
function afterTheme(id, quiet = false) {
  shadowDirty = true;
  rig.place(themes.lightSpots(id) || rig.free);
  const extra = themes.colliders(); if (extra.length > addedColliders) { nav.grid.add(extra.slice(addedColliders)); addedColliders = extra.length; }
  document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.theme === id));
  document.body.dataset.theme = id;
  // tour narration + viewpoints follow the theme
  tour.stops.forEach((s, k) => { const note = TOUR_NOTES[id]?.[s.id]; s.text = baseStops[k].text + (note ? `\n\n${note}` : ''); });
  renderTour({ i: tour.i, stop: tour.stops[tour.i], playing: tour.playing, n: tour.stops.length });
  venue.hotspots.forEach((h, k) => { Object.assign(h, baseHot[k], id !== 'free' && THEME_HOT[h.id] ? THEME_HOT[h.id](themes) : {}); const b = hsWrap.children[k]; if (b) b.innerHTML = `<kbd>${k + 1}</kbd>${h.label}`; });
  crowd.setTheme(id, themes); club.setTheme(id, themes); budgetTextures(scene);
  // compile the crowd's and the show's shaders in the background, so the first sight of them doesn't freeze the page
  // (against the composer's HDR buffer in Cinematic mode: materials compile a different variant there than on screen)
  const rt0 = renderer.getRenderTarget();
  try { if (post.enabled) renderer.setRenderTarget(post.composer.readBuffer); renderer.compileAsync(crowd.group, camera, scene).catch(() => {}); club.prewarm(renderer, camera, scene); }
  catch (e) { console.warn(e); } finally { renderer.setRenderTarget(rt0); }
  applyTime(timeOfDay, skyMode !== 'procedural');
  const u = new URL(location.href); if (id === 'free') u.searchParams.delete('theme'); else u.searchParams.set('theme', id); u.hash = ''; history.replaceState(null, '', u);
  saveSoon();
  if (!quiet && id !== 'free') toast(THEME_LIST.find((t) => t.id === id).title, 4000);
}
{
  const seg = $('#themeSeg');
  for (const t of THEME_LIST) { const b = document.createElement('button'); b.dataset.theme = t.id; b.textContent = t.label; b.title = t.title; b.onclick = () => { setTheme(t.id); b.blur(); }; seg.appendChild(b); }
  if (!themes) seg.hidden = true;
}
$('#resetScheme').onclick = () => applyScheme(themes ? themes.defaultScheme(themes.id) : DEFAULTS);
$('#toProfiles').onclick = () => document.querySelector('.tabs button[data-tab=profiles]').click();
if (themes) themes.glassed = (k) => elements.isGlass(k);

// ---- walls -> glass (elements.js): list in the Finishes tab, X in walk mode, click in overview
function renderGlassList() {
  let box = $('#glassList');
  if (!box) { box = document.createElement('div'); box.id = 'glassList'; $('#design').prepend(box); }
  const keys = Object.keys(elements.overrides());
  box.innerHTML = `<h4>Walls &amp; glass</h4><p class="note">Aim at any wall in walk mode and press <kbd>X</kbd> (or click it in Overview) to turn it into glass; it takes the Glazing and Glazing-frames finishes below.</p>` +
    keys.map((k) => `<div class="gl"><span>Glass · ${elements.label(k)} <small style="color:var(--muted)">${k.split('@')[1]}</small>${elements.defaults[k] ? ' <small style="color:var(--muted)">(site)</small>' : ''}</span><button data-k="${k}">Make wall</button></div>`).join('') +
    (Object.keys(elements.defaults).some((k) => !elements.isGlass(k)) ? `<div class="gl"><span class="note">Site glazing turned back to wall</span><button data-reset="1">Restore</button></div>` : '');
  box.querySelectorAll('button[data-k]').forEach((b) => { b.onclick = () => elements.set(b.dataset.k, 'wall'); });
  box.querySelector('button[data-reset]')?.addEventListener('click', () => elements.apply({ ...elements.overrides(), ...elements.defaults }));
}
elements.addEventListener('change', () => { refreshPickables(); renderGlassList(); themes?.refresh(); saveSoon(); });
elements.apply(elements.defaults);

// ---- profiles: the whole look (profiles.js) — browser storage, disk, share link
function capture(name, withCamera = $('#profCam').checked) {
  return {
    app: 'mykonos-twin', v: Profiles.PROFILE_VERSION, name: name || 'Autosave', saved: new Date().toISOString(),
    theme: themes ? themes.id : 'free', schemes: themes ? themes.allSchemes() : { free: currentScheme() }, glass: elements.overrides(),
    view: { time: +timeOfDay.toFixed(2), sky: skyMode, clouds: clouds.preset, quality: userQuality, doorsClosed: $('#t_doors').checked,
      colour: colourMode, people: crowd.mode, crowd: crowd.level, club: club.mode },
    camera: withCamera ? { mode: nav.mode, pos: [...nav.pos], foot: nav.foot, yaw: nav.yaw, pitch: nav.pitch } : undefined,
  };
}
function saveSoon() { if (restoring || SAFE) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { Profiles.autosave(capture('Autosave', true)); renderProfiles(); }, 700); }
async function applyProfile(p, { camera = true } = {}) {
  restoring = true;
  try {
    if (themes) { await themes.restore(migrateSchemes(p.schemes, p.v || 1), THEME_LIST.some((t) => t.id === p.theme) ? p.theme : 'free'); afterTheme(themes.id, true); }
    else if (p.schemes?.free) applyScheme(p.schemes.free);
    elements.apply(p.glass || {});
    const v = p.view || {};
    // before v4 a profile also kept the automatic switch to Standard (slow frames, the old Safari budget): start Cinematic
    const q = v.quality === 'standard' && (p.v || 1) < 4 ? 'cinematic' : v.quality;
    if (q) { $('#quality').value = q; userQuality = q; post.enabled = q === 'cinematic'; }
    if (v.colour && v.colour !== colourMode) setColourMode(v.colour);
    if (v.crowd) { crowd.setLevel(v.crowd); $('#crowdSel').value = v.crowd; }
    if (v.people) { crowd.setMode(v.people); $('#peopleSel').value = v.people; $('#crowdSel').disabled = v.people === 'off'; }
    if (v.club) { club.setMode(v.club); $('#clubSel').value = v.club; }
    if (v.clouds) { clouds.setPreset(v.clouds); $('#cloudSel').value = v.clouds; }
    if (typeof v.doorsClosed === 'boolean' && $('#t_doors').checked !== v.doorsClosed) { $('#t_doors').checked = v.doorsClosed; $('#t_doors').dispatchEvent(new Event('change')); }
    if (typeof v.time === 'number') { $('#time').value = v.time; applyTime(v.time); }
    if (v.sky && v.sky !== skyMode) await setSky(v.sky);
    const c = p.camera;
    if (camera && c?.pos) { if (c.mode === 'orbit') nav.setMode('orbit'); else { nav.setMode('walk', false); Object.assign(nav, { pos: [...c.pos], foot: c.foot, yaw: c.yaw, pitch: c.pitch }); nav.tween = null; } }
    $('#profNow').textContent = `${p.name || 'Profile'} · ${THEME_LIST.find((t) => t.id === (p.theme || 'free'))?.label || 'Free'} · saved ${new Date(p.saved || Date.now()).toLocaleString()}`;
  } finally { restoring = false; saveSoon(); }
}
function renderProfiles() {
  const list = Profiles.listProfiles(), box = $('#profList');
  if (!$('#profNow').textContent) $('#profNow').textContent = 'Unsaved changes are kept automatically in this browser.';
  box.innerHTML = list.length ? list.map((p, i) => `<div class="prof"><span><b>${p.name.replace(/</g, '&lt;')}</b><small>${THEME_LIST.find((t) => t.id === p.theme)?.label || 'Free'} · ${new Date(p.saved).toLocaleString()} · ${Object.keys(p.glass || {}).length} glass</small></span><button data-i="${i}" data-a="load">Load</button><button data-i="${i}" data-a="disk" title="Save to disk">⬇</button><button data-i="${i}" data-a="del" title="Delete">🗑</button></div>`).join('')
    : `<p class="note">${Profiles.storageAvailable() ? 'No saved looks yet.' : 'This browser blocks local storage (private mode?) — use Save to disk instead.'}</p>`;
  box.querySelectorAll('button').forEach((b) => { b.onclick = async () => {
    const p = Profiles.listProfiles()[+b.dataset.i]; if (!p) return;
    if (b.dataset.a === 'load') { await applyProfile(p); toast(`Loaded “${p.name}”.`); }
    if (b.dataset.a === 'disk') { const f = await Profiles.saveToDisk(p); if (f) toast(`Saved ${f}`); }
    if (b.dataset.a === 'del' && confirm(`Delete the saved look “${p.name}” from this browser?`)) { Profiles.deleteProfile(p.name); renderProfiles(); }
  }; });
}
$('#profSave').onclick = () => {
  const name = $('#profName').value.trim() || `${THEME_LIST.find((t) => t.id === (themes?.id || 'free')).label} – ${new Date().toLocaleString()}`;
  const p = capture(name); if (Profiles.saveProfile(p)) { toast(`Saved “${name}” in this browser.`); $('#profNow').textContent = `${name} · saved just now`; } else toast('This browser blocks local storage — use Save to disk.');
  renderProfiles();
};
$('#profDisk').onclick = async () => { const f = await Profiles.saveToDisk(capture($('#profName').value.trim() || 'Skybrew look')); if (f) toast(`Saved ${f}`); };
$('#profOpen').onclick = async () => { try { const p = await Profiles.openFile(); if (p) { await applyProfile(p); toast(`Opened “${p.name}”.`); } } catch (e) { toast(`Could not open that file: ${e.message}`); } };
$('#profLink').onclick = async () => {
  const url = await Profiles.toLink(capture($('#profName').value.trim() || 'Shared look'));
  try { await navigator.clipboard.writeText(url); toast('Link copied — it opens this exact look.'); } catch { prompt('Copy this link:', url); }
};
renderProfiles();
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.hidden = t.id !== b.dataset.tab);
};

// ---- crosshair picking: name the surface you're looking at, F cycles its finish
const ray = new THREE.Raycaster(); let hovered = null, pickTimer = 0;
function refreshPickables() {
  pickables = [];
  venue.root.traverse((o) => { if (o.isMesh && (o.userData.element || (o.userData.surface && !o.userData.surface.startsWith('fixed:')))) pickables.push(o); });
}
refreshPickables();
const visibleUp = (m) => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; };
function pick() {
  if (nav.mode !== 'walk') { hovered = null; hoveredEl = null; $('#pick').hidden = true; return; }
  ray.setFromCamera({ x: 0, y: 0 }, camera); ray.far = 25;
  const hit = ray.intersectObjects(pickables.filter(visibleUp), false)[0];
  const s = hit?.object.userData.surface; hovered = s && SURFACES[s] ? s : null; hoveredEl = hit?.object.userData.element || null;
  const el = $('#pick'); el.hidden = !hovered && !hoveredEl;
  const glass = hoveredEl && elements.isGlass(hoveredEl);
  el.innerHTML = (hovered ? `<b>${SURFACES[hovered].label}</b> · ${FINISHES[SURFACES[hovered].finish].label} <kbd>F</kbd>` : '') +
    (hoveredEl ? `${hovered ? ' · ' : ''}${glass ? 'glass' : elements.label(hoveredEl).toLowerCase()} → ${glass ? 'wall' : 'glass'} <kbd>X</kbd>` : '');
}
// overview / drag-look: click a wall to turn it into glass (or back)
{
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || document.pointerLockElement) return;
    if (nav.mode !== 'orbit' && !nav.dragLook) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera); ray.far = 400;
    const hit = ray.intersectObjects(pickables.filter(visibleUp), false).find((h) => h.object.userData.element);
    const pop = $('#elPop'); if (!hit) { pop.hidden = true; return; }
    const k = hit.object.userData.element, glass = elements.isGlass(k);
    $('#elPopName').textContent = glass ? `Glass (${elements.label(k).toLowerCase()})` : elements.label(k);
    $('#elPopInfo').textContent = `${k.split('@')[1]} · ${glass ? 'see-through, reflective' : 'solid'}${elements.defaults[k] ? ' · glass on site' : ''}`;
    $('#elPopGlass').textContent = glass ? 'Make it a wall' : 'Make it glass';
    $('#elPopGlass').onclick = () => { elements.toggle(k); pop.hidden = true; };
    Object.assign(pop.style, { left: `${Math.min(e.clientX + 12, innerWidth - 230)}px`, top: `${Math.min(e.clientY + 12, innerHeight - 110)}px` }); pop.hidden = false;
  });
  $('#elPopClose').onclick = () => { $('#elPop').hidden = true; };
}
function cycleFinish(id) {
  const s = SURFACES[id]; const i = s.choices.indexOf(s.finish);
  setFinish(id, s.choices[(i + 1) % s.choices.length]); pick();
}
function screenshot() {
  if (!photo.active) post.render(0);
  const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png');
  a.download = `mykonos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`; a.click();
}

// ------------------------------------------------------------------ start + loop
const start = venue.hotspots.find((h) => h.id === new URLSearchParams(location.search).get('at'));
if (start) nav.teleport(start.p, start.look, false, start.ref);
else nav.teleport(tour.stops[0].at, tour.stops[0].look, false);       // open at stop 1 of the guided walk
if (new URLSearchParams(location.search).get('mode') === 'orbit') nav.setMode('orbit');
document.body.dataset.mode = nav.mode;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight);
  if (photo.active) photo.cameraChanged();
});

const water = []; venue.root.traverse((o) => { if (o.userData.water) water.push(o.material); });
const timer = new THREE.Timer(); timer.connect?.(document); let fpsAcc = 0, fpsN = 0;
let slowFrames = 0, loopErrors = 0, fastSecs = 0, slowAt = 2, resTry = null, resHold = 0;
function applyPixelRatio() { if (photo.active || photo.busy) return; renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); }
// three.js only schedules the next frame after this callback returns, so never let it throw
renderer.setAnimationLoop((t) => { try { frame(t); } catch (err) { if (loopErrors++ < 5) console.error(err); diag(`Frame: ${err.message} ${where(err)}`); } });
function frame() {
  timer.update(); const dt = Math.min(timer.getDelta(), 0.1);
  if (photo.active || photo.busy) { photo.render(); return; }   // camera frozen while tracing
  if (!tour.playing) nav.update(dt); else if (nav.tween) nav.update(dt);
  tour.update(dt);
  for (const m of water) {
    if (m.normalMap) { m.normalMap.offset.x += dt * 0.006; m.normalMap.offset.y += dt * 0.004; }
    if (m.clearcoatNormalMap) { m.clearcoatNormalMap.offset.x -= dt * 0.011; m.clearcoatNormalMap.offset.y += dt * 0.007; }
  }
  clouds.tick(dt);
  // people and the light show can never take the view down: on an error they switch themselves off and say why
  try { crowd.update(dt, camera.position); } catch (err) { crowd.setMode('off'); $('#peopleSel').value = 'off'; diag(`People switched off after an error: ${err.message} ${where(err)}`); }
  try { club.update(dt, camera.position, nav.mode === 'orbit'); } catch (err) { club.setMode('off'); club.root.visible = false; $('#clubSel').value = 'off'; diag(`Club lights switched off after an error: ${err.message} ${where(err)}`); }
  if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) { diag('The camera position became invalid; the view was reset to the arrival court.'); resetView(); }
  if (skyMode === 'procedural') hazeForView(scene.fog.color);
  if (envDirty && (envTimer += dt) > 0.25) { updateEnv(); envDirty = false; envTimer = 0; }
  if ((pickTimer += dt) > 0.15) { pick(); pickTimer = 0; }
  minimap.draw(nav.mode === 'walk' ? nav.pos : [camera.position.x, -camera.position.z], nav.mode === 'walk' ? nav.yaw : Math.atan2(-(nav.orbit.target.x - camera.position.x), -(nav.orbit.target.z - camera.position.z)));
  shadowT += dt;
  if (shadowDirty || shadowT > 2 || (shadowT > 0.1 && crowd.mode === 'animated' && crowd.group.visible)) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; shadowT = 0; }
  post.render(dt);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) {
    const fps = fpsN / fpsAcc;
    $('#fps').textContent = `${Math.round(fps)} fps · ${post.enabled ? 'cinematic' : 'standard'}`;
    // only while the tab is actually visible and focused (a hidden or background tab gets few frames)
    const live = document.visibilityState === 'visible' && document.hasFocus();
    // adaptive resolution: below ~42 fps render fewer pixels (down to 60 % of the budget's), step back up after a while
    // of 58+ fps — but not straight back to a size that was too slow. The look (MSAA, AO, shadows, textures) stays
    // If a step down brings no gain, pixels weren't the bottleneck (a browser frame cap, battery saver, the CPU): put it
    // back and leave the resolution alone for a minute
    if (live) {
      if (resTry) { if (fps < resTry.fps * 1.08) { resScale = resTry.scale; applyPixelRatio(); resHold = 60; } resTry = null; }
      else if (resHold > 0) resHold--;
      else if (fps < 42 && resScale > 0.6) { resTry = { fps, scale: resScale }; slowAt = resScale; resScale = Math.max(0.6, resScale * 0.85); fastSecs = 0; applyPixelRatio(); }
      else if (fps > 58 && resScale < 1) { if (++fastSecs >= (resScale / 0.85 >= slowAt ? 20 : 4)) { resScale = Math.min(1, resScale / 0.85); fastSecs = 0; applyPixelRatio(); } }
      else fastSecs = 0;
    }
    // last resort on slow machines: the fast pipeline (once fewer pixels have stopped helping)
    slowFrames = post.enabled && fps < 24 && (resScale <= 0.61 || resHold > 0) && live ? slowFrames + 1 : 0;
    if (slowFrames >= 4) { post.enabled = false; $('#quality').value = 'standard'; toast('Switched to Standard quality for smoother walking.'); slowFrames = 0; }
    fpsAcc = 0; fpsN = 0;
  }
}
$('#loading').remove();
upgradeWithModels().catch((e) => console.error('model upgrade failed', e)).finally(() => { themes?.refresh(); budgetTextures(scene); shadowDirty = true; });
(async () => {
  // start-up look: a shared link (#p=…) > the autosave in this browser > ?theme= > Free
  const want = new URLSearchParams(location.search).get('theme');
  let p = null;
  try { p = await Profiles.fromHash(); } catch (e) { toast(`That link's look could not be read: ${e.message}`); }
  if (p) { await applyProfile(p); toast(`Opened the shared look “${p.name}”.`); return; }
  const auto = SAFE ? null : Profiles.loadAutosave();
  if (auto) { if (want && THEME_LIST.some((t) => t.id === want)) auto.theme = want; await applyProfile(auto, { camera: false }); return; }
  if (themes) setTheme(want && THEME_LIST.some((t) => t.id === want) ? want : 'free', true);
})();
if (photoFinishes) console.info(`photo finishes registered: ${photoFinishes}`);
if (venue.city) console.info('city', venue.city.stats);
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); photo.exit(); lsSet('skybrew.lite', '2');            // next start uses the lite GPU budget
  diag(LITE ? 'WebGL context lost even in the lite GPU budget. Reload; if it stays blank, quit and reopen the browser, or try Chrome.'
    : 'WebGL context lost: the browser ran out of GPU memory. The next start uses the lite GPU budget (smaller canvas and textures).', { label: 'Reload now', run: () => location.reload() });
});
function resetView() { const h = venue.hotspots[0]; nav.tween = null; nav.setMode('walk', false); nav.teleport(h.p, h.look, false, h.ref); }
// debug / automation hooks: jump straight to a view and render synchronously (no tween)
function renderNow() { nav.update(0); renderer.shadowMap.needsUpdate = true; post.render(0); }
window.__twin = { get themes() { return themes; },
  scene, camera, renderer, venue, nav, applyTime, setFinish, tour, post, photo, crowd, club, rig,
  step(n = 1, dt = 1 / 30) { nav.update(0); for (let i = 0; i < n; i++) { crowd.update(dt, camera.position); club.update(dt, camera.position, nav.mode === 'orbit'); } renderNow(); },   // advance animation without frames (hidden tab)
  walkTo(id) { const h = venue.hotspots.find((x) => x.id === id); nav.tween = null; nav.setMode('walk', false); nav.teleport(h.p, h.look, false, h.ref); renderNow(); },
  overview(pos = [16, 70, 62], target = [-3, 0, -2]) {
    nav.setMode('orbit', false); nav.tween = null;
    camera.position.set(...pos); nav.orbit.target.set(...target); camera.lookAt(nav.orbit.target); renderNow();
  },
};
