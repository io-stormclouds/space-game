import * as THREE from 'three';
import { PlanetGrid } from '../game/models/planet-grid.model';

/**
 * What the scene needs from the surface of a gridded body. `mesh` is the pickable surface (a raycast
 * `faceIndex` maps to a tile through `tileAtFace`); `extras` are objects to add to the body group next to it.
 */
export interface SurfaceView {
  readonly grid: PlanetGrid;
  readonly mesh: THREE.Mesh;
  readonly extras: ReadonlyArray<THREE.Object3D>;
  readonly tileEdge: number;
  readonly triangleCount: number;
  tileAtFace(faceIndex: number): number;
  setHover(index: number | null): void;
  setSelected(index: number | null): void;
  colorOf(index: number): THREE.Color;
  dispose(): void;
}
