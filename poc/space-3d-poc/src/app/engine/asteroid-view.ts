import * as THREE from 'three';
import { AsteroidShape, depletionScale } from '../game/math/asteroid-shape';

/** Irregular, flat-shaded rock. Shrinks uniformly as its minerals are extracted. */
export class AsteroidView {
  readonly mesh: THREE.Mesh;

  constructor(readonly shape: AsteroidShape, color: number, private readonly initialMinerals: number) {
    const positions = new Float32Array(shape.faces.length * 9);
    let o = 0;
    for (const [a, b, c] of shape.faces) {
      for (const i of [a, b, c]) {
        const v = shape.vertices[i];
        positions[o++] = v.x;
        positions[o++] = v.y;
        positions[o++] = v.z;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals(); // non-indexed → flat per triangle
    geometry.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, metalness: 0.05 }));
    this.mesh.name = `${shape.bodyId}_Rock`;
  }

  /** Current visual scale factor. */
  get scale(): number {
    return this.mesh.scale.x;
  }

  setDepletion(minerals: number): void {
    const s = depletionScale(minerals, this.initialMinerals);
    this.mesh.scale.setScalar(s);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
