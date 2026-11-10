import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  PMREMGenerator,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ModelId } from '../domain/catalog/models';
import type { KitLibrary } from './kit-library';

/**
 * Renders catalog icons from the loaded kit (no image assets to keep in sync). Uses its own small
 * renderer and yields to the browser between batches so the editor stays responsive.
 */
export async function renderThumbnails(
  kit: KitLibrary,
  items: readonly { id: string; model: ModelId }[],
  onEach: (id: string, url: string) => void,
  size = 112,
): Promise<void> {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.6;
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 4, 3);
  scene.add(new HemisphereLight(0xdfe8ff, 0x1d232b, 1.2), sun);
  const camera = new PerspectiveCamera(28, 1, 0.05, 200);
  const box = new Box3();
  const center = new Vector3();
  const sizeV = new Vector3();
  const dir = new Vector3(-0.9, 0.85, 1.25).normalize();

  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const model = kit.get(it.model);
      if (!model) continue;
      const mesh = new Mesh(model.geometry, model.materials as never);
      scene.add(mesh);
      box.copy(model.geometry.boundingBox!);
      box.getCenter(center);
      box.getSize(sizeV);
      const radius = Math.max(sizeV.length() / 2, 0.15);
      const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.02;
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = dist / 50;
      camera.far = dist * 4;
      camera.updateProjectionMatrix();
      camera.lookAt(center);
      renderer.render(scene, camera);
      onEach(it.id, renderer.domElement.toDataURL('image/png'));
      scene.remove(mesh);
      if (i % 6 === 5) await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  } finally {
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
