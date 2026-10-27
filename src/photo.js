// Photo mode: progressive GPU path tracing of the current view (three-gpu-pathtracer).
// Same geometry and finishes as the walkthrough — soft shadows, bounce light, true reflections.
// Instanced furniture is unpacked into plain meshes (the tracer ignores instance transforms) and the
// live sky is captured into a cube map so light and background match the time-of-day slider.
import * as THREE from 'three';
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const _p = new THREE.Vector3();

export class PhotoMode extends EventTarget {
  constructor(renderer, camera, { venueRoot, skyScene, sun, lights, skip, photoSky }) {
    super();
    Object.assign(this, { renderer, camera, venueRoot, skyScene, sun, lights, skip, photoSky });
    this.active = false; this.target = 600;
  }

  async enter() {
    if (this.active || this.busy) return;
    this.busy = true;
    this._emit('preparing');
    await new Promise((r) => setTimeout(r, 30));            // let the UI paint
    const scene = new THREE.Scene();

    // environment + background: the chosen photo sky (4K HDRI), else the live procedural sky
    const hdri = this.photoSky ? await this.photoSky() : null;
    if (hdri?.texture) {
      scene.environment = hdri.texture; scene.background = hdri.texture; scene.environmentIntensity = 1;
      scene.environmentRotation.copy(hdri.rotation); scene.backgroundRotation.copy(hdri.rotation);
    } else {
      const cubeRT = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType })   // 1024: the clouds stay sharp in the background;
      new THREE.CubeCamera(1, 20000, cubeRT).update(this.renderer, this.skyScene);
      scene.environment = cubeRT.texture; scene.background = cubeRT.texture; scene.environmentIntensity = 1;
      this.cubeRT = cubeRT;
    }

    // geometry: a flat, non-indexed copy of everything visible (instanced meshes unpacked)
    this.venueRoot.updateMatrixWorld(true);
    const m4 = new THREE.Matrix4();
    this.venueRoot.traverseVisible((o) => {
      if (!o.isMesh || this.skip(o) || !o.parent?.visible) return;
      if (o.isInstancedMesh) {
        const base = clean(o.geometry);
        const parts = [];
        const maxD = o.userData.photoMaxDist;               // far city trees: only the ones near the camera
        const ic = o.instanceColor, c = new THREE.Color();      // per-instance colours (the crowd) -> vertex colours
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4);
          if (Math.abs(m4.determinant()) < 1e-12) continue;    // hidden instance (zero scale)
          m4.premultiply(o.matrixWorld);
          if (maxD && _p.setFromMatrixPosition(m4).distanceTo(this.camera.position) > maxD) continue;
          const g = base.clone().applyMatrix4(m4);
          if (ic) { o.getColorAt(i, c); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) { a[3 * k] = c.r; a[3 * k + 1] = c.g; a[3 * k + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
          parts.push(g);
        }
        const merged = mergeNonIndexed(parts);
        if (merged) { let mat = o.material; if (ic) { mat = o.material.clone(); mat.vertexColors = true; } scene.add(new THREE.Mesh(merged, mat)); }
      } else {
        const g = clean(o.geometry).clone().applyMatrix4(o.matrixWorld);
        scene.add(new THREE.Mesh(g, o.material));
      }
    });
    // lights: sun (if up) + the evening point lights that are on
    if (!hdri?.texture && this.sun.visible && this.sun.intensity > 0.01) {
      const s = new THREE.DirectionalLight(this.sun.color, this.sun.intensity);
      s.position.copy(this.sun.position); s.target.position.copy(this.sun.target.position);
      scene.add(s, s.target);
    }
    for (const l of this.lights) if (l.intensity > 0.5) { const p = l.clone(); p.position.copy(l.getWorldPosition(new THREE.Vector3())); scene.add(p); }
    this.scene = scene;

    const pt = new WebGLPathTracer(this.renderer);
    pt.bounces = 6; pt.transmissiveBounces = 6; pt.filterGlossyFactor = 0.6; pt.minSamples = 1;
    pt.tiles.set(3, 3); pt.renderScale = Math.min(1, 1.5 / this.renderer.getPixelRatio()); pt.textureSize.set(1024, 1024); pt.fadeDuration = 0;
    // edge-aware denoise while the image is young; fades out as samples converge
    const dq = new FullScreenQuad(new DenoiseMaterial({ map: null, blending: THREE.NoBlending, premultipliedAlpha: this.renderer.getContextAttributes().premultipliedAlpha }));
    pt.renderToCanvasCallback = (target, renderer, quad) => {
      const n = pt.samples; const auto = renderer.autoClear; renderer.autoClear = false;
      if (this.denoise && n < 400) {
        const k = Math.min(n / 400, 1);
        dq.material.map = target.texture; dq.material.sigma = THREE.MathUtils.lerp(3.2, 1.2, k);
        dq.material.threshold = THREE.MathUtils.lerp(0.1, 0.04, k); dq.material.kSigma = 1.2; dq.render(renderer);
      } else quad.render(renderer);
      renderer.autoClear = auto;
    };
    this.denoise = true;
    this.pt = pt;
    this._emit('preparing', 60); await new Promise((r) => setTimeout(r, 30));
    pt.setScene(scene, this.camera);                        // builds the BVH (a few seconds, main thread)
    this.active = true; this.busy = false; this._emit('rendering');
  }

  render() {
    if (!this.active) return false;
    if (this.pt.samples < this.target) this.pt.renderSample();
    this._emit(this.pt.samples >= this.target ? 'done' : 'rendering');
    return true;
  }

  // the camera must not move while tracing; call this if it does (resets accumulation)
  cameraChanged() { if (this.active) this.pt.updateCamera(); }

  save() {
    const a = document.createElement('a'); a.href = this.renderer.domElement.toDataURL('image/png');
    a.download = `mykonos-photo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`; a.click();
  }

  exit() {
    if (!this.active && !this.busy) return;
    this.active = false; this.busy = false;
    this.pt?.dispose?.(); this.pt = null;
    this.scene?.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.scene = null; this.cubeRT?.dispose(); this.cubeRT = null;
    this._emit('off');
  }

  _emit(state, progress) {
    this.dispatchEvent(new CustomEvent('state', { detail: { state, progress, samples: Math.floor(this.pt?.samples ?? 0), target: this.target } }));
  }
}

function clean(g) {
  let n = g.index ? g.toNonIndexed() : g;
  if (n === g) n = g.clone();
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.clearGroups();
  return n;
}
function mergeNonIndexed(list) {
  if (!list.length) return null;
  const total = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ...(list.every((g) => g.attributes.color) ? [['color', 3]] : [])]) {
    const arr = new Float32Array(total * size); let off = 0;
    for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
