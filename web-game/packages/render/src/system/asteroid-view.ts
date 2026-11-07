import * as THREE from 'three';
import { depletionScale, type AsteroidShape } from '@space-game/domain';
import { muteBodyColor } from './palette';

/**
 * Irregular, flat-shaded rock (PoC `engine/asteroid-view.ts`). Shrinks uniformly as its minerals
 * are extracted; the logical radius (docking altitude) does not change.
 */
export class AsteroidView {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;

  constructor(
    readonly shape: AsteroidShape,
    color: number,
    private readonly initialMinerals: number,
  ) {
    const positions = new Float32Array(shape.faces.length * 9);
    let o = 0;
    for (const [a, b, c] of shape.faces) {
      for (const i of [a, b, c]) {
        const v = shape.vertices[i]!;
        positions[o++] = v.x;
        positions[o++] = v.y;
        positions[o++] = v.z;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals(); // non-indexed → flat per triangle
    geometry.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: muteBodyColor(color), flatShading: true }));
    this.mesh.name = `${shape.bodyId}_Rock`;
  }

  get scale(): number {
    return this.mesh.scale.x;
  }

  setDepletion(minerals: number): void {
    this.mesh.scale.setScalar(depletionScale(minerals, this.initialMinerals));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
