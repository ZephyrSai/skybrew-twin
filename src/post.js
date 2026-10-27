// Realtime "cinematic" pipeline: MSAA HDR render -> ground-truth AO -> bloom (lamps, sun glints) -> tone map.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// AO is computed at half resolution, and without glass / sky / sprites (they would cast halos)
class SoftGTAOPass extends GTAOPass {
  constructor(scene, camera, w, h, hide) { super(scene, camera, w, h); this.hide = hide; }
  setSize(w, h) { super.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); }
  render(...args) {
    const hidden = [];
    this.hide((o) => { if (o.visible) { o.visible = false; hidden.push(o); } });
    super.render(...args);
    for (const o of hidden) o.visible = true;
  }
}

export class Post {
  // samples: MSAA of the HDR target (0 in the lite GPU budget: Safari drops the context on big multisampled float targets)
  constructor(renderer, scene, camera, hideForAO, { samples = 4 } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    // only the scene render needs MSAA: the passes after it work on its resolved image (render() keeps the scene in rt)
    this.rt = rt; this.composer.renderTarget2.samples = 0;
    this.ao = new SoftGTAOPass(scene, camera, size.x, size.y, hideForAO);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.4, 2.6);    // only lamps / hot glints, not sunlit plaster
    // a sun glint on mirror-smooth glass or metal can overflow the half-float buffer (Inf); the bloom blur would smear it
    // into NaN across the whole frame and the view goes black. Clamp it (and drop any NaN) as the bloom reads it
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv ); if ( any( isnan( texel ) ) ) texel = vec4( 0.0 ); texel.rgb = min( texel.rgb, vec3( 256.0 ) );');
    hp.needsUpdate = true;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.enabled = true;
  }
  setSize(w, h) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  render(dt) {
    if (this.enabled) { if (this.composer.readBuffer !== this.rt) this.composer.swapBuffers(); this.composer.render(dt); }
    else this.renderer.render(this.scene, this.camera);
  }
}
