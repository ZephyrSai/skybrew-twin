// Export the twin as a single .glb for Unreal Engine 5 / Twinmotion / D5 / Blender.
// Exports what is currently visible (so toggle furniture / context first), with every surface's
// current finish as a PBR material named after the surface (e.g. "indoor_floor") — easy to remap.
// Instanced furniture uses EXT_mesh_gpu_instancing, which Unreal, Blender and Twinmotion import.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export async function exportGLB(root, { skip, onStatus } = {}) {
  onStatus?.('Preparing export…');
  const hidden = [];
  root.traverse((o) => { if (o.visible && skip?.(o)) { o.visible = false; hidden.push(o); } });
  try {
    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024, includeCustomExtensions: false });
    const blob = new Blob([glb], { type: 'model/gltf-binary' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'mykonos-twin.glb'; a.click();
    onStatus?.(`Exported mykonos-twin.glb (${(blob.size / 1e6).toFixed(1)} MB)`);
  } finally {
    for (const o of hidden) o.visible = true;
  }
}
