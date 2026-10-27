// Procedural clouds for the realtime sky. Two layers are computed per pixel, so nothing is stretched or
// smeared, at any viewing angle:
//   * scattered altocumulus 2 km up, lit from the sun's side: darker, self-shadowed cores, bright edges
//     toward the sun, warm undersides at sunset;
//   * thin cirrus streaks 8 km up, which keep their pink glow after the sun has set.
// The layers are drawn on a camera-centred dome and fade into a horizon haze that matches the sky colour.
// Abu Dhabi in October is mostly clear, so the default is 'few'.
import * as THREE from 'three';

export const CLOUD_PRESETS = {
  clear: { label: 'Clear', cover: 0, cirrus: 0.15 },
  few: { label: 'Few (typical Oct evening)', cover: 0.22, cirrus: 0.28 },
  scattered: { label: 'Scattered', cover: 0.45, cirrus: 0.3 },
  broken: { label: 'Broken', cover: 0.7, cirrus: 0.25 },
};

const vertexShader = /* glsl */`
  uniform float radius;
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + vDir * radius, 1.0);
  }`;

const fragmentShader = /* glsl */`
  uniform vec3 sunDir, sunCol, ambCol, hazeCol;
  uniform float cover, cirrus;
  uniform vec2 wind;
  varying vec3 vDir;

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
  }
  float gnoise(vec2 p) {                                    // gradient noise, quintic fade
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(hash22(i), f), b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), d = dot(hash22(i + vec2(1.0)), f - vec2(1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);               // rotate + double the frequency each octave
  // octaves smaller than a pixel fade out (fw = footprint of one pixel), so the far field doesn't shimmer
  float fbm(vec2 p, float fw, int oct) {
    float s = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 7; i++) {
      if (i >= oct || fw * f > 0.6) break;                    // the rest would be sub-pixel: skip the work
      s += a * (1.0 - smoothstep(0.15, 0.6, fw * f)) * gnoise(p);
      p = ROT * p; f *= 2.0; a *= 0.5;
    }
    return 0.5 + s * 1.6;                                    // ≈ 0..1, mean 0.5, sd ≈ 0.16
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0), mu = dot(d, sunDir);
    vec2 sxz = normalize(sunDir.xz + vec2(1e-4));

    // ---- altocumulus, 2 km up (layer coordinates in km)
    float t1 = 2.0 / (up + 0.025);
    vec2 p = d.xz * t1 * 0.42 + wind;
    float fw1 = length(fwidth(p));
    float th = mix(0.66, 0.36, cover);
    // a gentle domain warp curls the cloud edges like real convection cells
    vec2 warp = vec2(gnoise(p * 0.55 + 7.3), gnoise(p * 0.55 - 3.1)) * 0.55;
    float n = cover > 0.0 ? fbm(p + warp, fw1, 6) : 0.0;
    float dens = smoothstep(th, th + 0.22, n);
    vec3 c1 = vec3(0.0); float a1 = 0.0;
    if (dens > 0.0) {
      // optical depth toward the sun (a low sun crosses more of the layer)
      vec2 off = sxz * 0.07 / max(sunDir.y + 0.2, 0.2);
      float dens2 = smoothstep(th, th + 0.22, fbm(p + warp + off, fw1, 3));
      // high sun: we look at the shaded base, light has crossed the cloud. Low sun: it shines straight onto
      // the base we're looking at, which is why sunset clouds glow from underneath
      float sunLow = 1.0 - smoothstep(0.03, 0.4, sunDir.y);
      float tr = exp(-mix(2.6, 0.55, sunLow) * dens2);
      float powder = 1.0 - exp(-5.0 * dens);
      // forward scattering: bright rims toward the sun, a softer sunlit face when the sun is behind you
      float phase = 0.75 + 0.9 * pow(max(mu, 0.0), 5.0) + 1.6 * pow(max(mu, 0.0), 50.0);
      vec3 lit = sunCol * tr * mix(1.0, powder, 0.6) * phase;
      lit = max(mix(vec3(dot(lit, vec3(0.2126, 0.7152, 0.0722))), lit, 1.3), 0.0);   // AgX mutes warm light; restore some
      c1 = ambCol * (1.0 - 0.45 * dens) + lit;
      a1 = pow(smoothstep(0.0, 0.8, dens), 1.3) * 0.95;          // wispy, see-through edges
      c1 = mix(c1, hazeCol, 1.0 - exp(-t1 / 30.0));         // aerial perspective
    }

    // ---- cirrus, 8 km up: long wind-aligned streaks
    float t2 = 8.0 / (up + 0.025);
    vec2 q = d.xz * t2 * 0.08 + wind * 0.35;
    q = mat2(0.94, 0.34, -0.34, 0.94) * q; q.x *= 0.55;
    float fw2 = length(fwidth(q));
    vec3 c2 = vec3(0.0); float a2 = 0.0;
    if (cirrus > 0.0) {
      q += vec2(gnoise(q * 0.7 + 1.7), gnoise(q * 0.7 - 5.2)) * 0.8;   // wisps curl instead of running dead straight
      float cs = fbm(q * vec2(1.0, 1.8), fw2, 4);
      a2 = smoothstep(0.7 - 0.2 * cirrus, 0.95, cs) * cirrus * 0.42;
      c2 = ambCol * 0.8 + sunCol * (0.85 + 1.6 * pow(max(mu, 0.0), 4.0));
      c2 = mix(c2, hazeCol, 1.0 - exp(-t2 / 60.0));
    }

    // altocumulus in front of cirrus; both melt into the horizon haze
    float horizon = smoothstep(0.0, 0.07, up);
    float a = a1 + a2 * (1.0 - a1);
    vec3 col = a > 0.0 ? (c1 * a1 + c2 * a2 * (1.0 - a1)) / a : vec3(0.0);
    gl_FragColor = vec4(col, a * horizon);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const RADIUS = 5000;                                         // dome radius (< camera.far)
// Direct sunlight reaching the cloud layer: Beer–Lambert through a hazy Gulf atmosphere. Air mass from
// Kasten & Young; per-channel optical depth (Rayleigh + dust) reddens and dims the sun as it sets.
const TAU = [0.075, 0.13, 0.25];
function sunlight(el) {
  const deg = THREE.MathUtils.radToDeg(el);
  if (deg < -3.5) return new THREE.Color(0, 0, 0);
  const m = 1 / (Math.sin(Math.max(el, 0) + 0.002) + 0.50572 * Math.pow(Math.max(deg, 0) + 6.07995, -1.6364));
  const fade = THREE.MathUtils.smoothstep(deg, -3.5, 0.5);       // the layer drops into the earth's shadow
  return new THREE.Color(...TAU.map((t, i) => Math.exp(-t * m) / Math.exp(-TAU[i]) * fade));
}

export class Clouds {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) },
        ambCol: { value: new THREE.Color(0.5, 0.55, 0.65) }, hazeCol: { value: new THREE.Color(0.7, 0.7, 0.75) },
        cover: { value: CLOUD_PRESETS.few.cover }, cirrus: { value: CLOUD_PRESETS.few.cirrus },
        wind: { value: new THREE.Vector2(3.1, -1.7) }, radius: { value: RADIUS },
      },
      vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.geo = new THREE.SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    this.skyAmb = new THREE.Color(0.5, 0.55, 0.65);           // last sampled skylight on the clouds (before city glow)
    this.mesh = this.makeMesh();
    this.preset = 'few';
  }
  // another dome sharing the same material (for the sky scene the environment map is captured from)
  makeMesh() { const m = new THREE.Mesh(this.geo, this.mat); m.frustumCulled = false; m.renderOrder = -1; return m; }
  setPreset(id) {
    const p = CLOUD_PRESETS[id] || CLOUD_PRESETS.few; this.preset = id;
    this.mat.uniforms.cover.value = p.cover; this.mat.uniforms.cirrus.value = p.cirrus;
  }
  // sky = { zenith, horizon } radiance sampled from the Sky shader (main.js), so the shaded side of a cloud
  // takes the colour of the sky around it
  update(sunDir, el, sky, gain = 1) {
    const u = this.mat.uniforms;
    u.sunDir.value.copy(sunDir);
    // clouds 2–8 km up see the sun ~1.5–3° higher than the ground does, so they glow after sunset
    u.sunCol.value.copy(sunlight(el + THREE.MathUtils.degToRad(1.5))).multiplyScalar(2.4);   // direct sun ≫ skylight on a cloud
    if (sky) {
      const z = sky.zenith.clone().multiplyScalar(gain), h = sky.horizon.clone().multiplyScalar(gain);
      const lum = 0.2126 * z.r + 0.7152 * z.g + 0.0722 * z.b;
      this.skyAmb.setRGB(lum, lum, lum).lerp(z, 0.35).multiplyScalar(1.2).add(h.clone().multiplyScalar(0.3));
      u.hazeCol.value.copy(h);
    }
    // a faint orange city glow on the cloud base after dark
    const night = 1 - THREE.MathUtils.smoothstep(el, -0.1, 0.02);
    u.ambCol.value.copy(this.skyAmb).add(new THREE.Color(0.012, 0.007, 0.004).multiplyScalar(night));
  }
  tick(dt) { this.mat.uniforms.wind.value.x += dt * 0.0035; this.mat.uniforms.wind.value.y += dt * 0.0012; }
}
