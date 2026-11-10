import * as THREE from 'three';
import { PlanetGrid } from '../game/models/planet-grid.model';
import { RESOURCE_INFO } from '../game/models/resource.model';
import { SurfaceView } from './surface-view';

const HOVER_GAIN = 1.5;
const SELECTED = new THREE.Color(0x22d3ee);
const EDGE_COLOR = 0x0b1220;

/**
 * Goldberg polyhedron surface of a body as ONE non-indexed mesh (fan triangles per tile, flat normals,
 * per-vertex colours) plus one LineSegments for the tile edges. `faceIndex` of a raycast hit maps
 * straight to a tile. Colours change only on hover/selection, never per frame.
 */
export class PlanetGridView implements SurfaceView {
  readonly mesh: THREE.Mesh;
  readonly edges: THREE.LineSegments;
  readonly tileEdge: number;

  private readonly faceToTile: Int32Array;
  private readonly tileStart: Int32Array;
  private readonly tileCount: Int32Array;
  private readonly colors: Float32Array;
  private readonly baseColors: Float32Array;
  private readonly colorAttr: THREE.BufferAttribute;
  private hover: number | null = null;
  private selected: number | null = null;
  private readonly tmp = new THREE.Color();

  constructor(readonly grid: PlanetGrid, baseColor: number) {
    const tiles = grid.tiles;
    const triCount = tiles.reduce((s, t) => s + t.vertices.length, 0);
    const positions = new Float32Array(triCount * 9);
    const normals = new Float32Array(triCount * 9);
    this.colors = new Float32Array(triCount * 9);
    this.baseColors = new Float32Array(triCount * 9);
    this.faceToTile = new Int32Array(triCount);
    this.tileStart = new Int32Array(tiles.length);
    this.tileCount = new Int32Array(tiles.length);
    const edgePositions = new Float32Array(triCount * 6);
    const lift = 1 + 0.003;

    const base = new THREE.Color(baseColor);
    const shade = new THREE.Color();
    let tri = 0;
    let e = 0;
    for (const tile of tiles) {
      const n = tile.vertices.length;
      this.tileStart[tile.index] = tri * 3;
      this.tileCount[tile.index] = n * 3;
      // subtle deterministic variation so neighbouring tiles read as separate faces
      const k = ((tile.index * 2654435761) >>> 0) % 7; // 0..6
      const gain = tile.kind === 'PENT' ? 0.78 : 0.9 + k * 0.03;
      shade.copy(base).multiplyScalar(gain);
      // deposits are tinted with their resource colour so they read at a glance
      if (tile.deposit) shade.lerp(this.tmp.setHex(RESOURCE_INFO[tile.deposit.resource].color), 0.45);
      for (let i = 0; i < n; i++) {
        const a = tile.center;
        const b = tile.vertices[i];
        const c = tile.vertices[(i + 1) % n];
        const o = tri * 9;
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], o);
        for (let v = 0; v < 3; v++) {
          normals.set([tile.normal.x, tile.normal.y, tile.normal.z], o + v * 3);
          this.baseColors.set([shade.r, shade.g, shade.b], o + v * 3);
        }
        this.faceToTile[tri] = tile.index;
        tri++;
        edgePositions.set([b.x * lift, b.y * lift, b.z * lift, c.x * lift, c.y * lift, c.z * lift], e);
        e += 6;
      }
    }
    this.colors.set(this.baseColors);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', this.colorAttr);
    geometry.computeBoundingSphere();

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.02 }),
    );
    this.mesh.name = `${grid.bodyId}_Grid`;

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    this.edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.35 }));
    this.edges.name = `${grid.bodyId}_GridEdges`;
    this.tileEdge = grid.tileEdge;
  }

  get extras(): ReadonlyArray<THREE.Object3D> {
    return [this.edges];
  }

  get tileCountTotal(): number {
    return this.grid.tiles.length;
  }

  get triangleCount(): number {
    return this.faceToTile.length;
  }

  /** Tile index for a raycast `faceIndex`; -1 when out of range. */
  tileAtFace(faceIndex: number): number {
    return faceIndex >= 0 && faceIndex < this.faceToTile.length ? this.faceToTile[faceIndex] : -1;
  }

  setHover(index: number | null): void {
    if (index === this.hover) return;
    const prev = this.hover;
    this.hover = index;
    if (prev !== null) this.paint(prev);
    if (index !== null) this.paint(index);
  }

  setSelected(index: number | null): void {
    if (index === this.selected) return;
    const prev = this.selected;
    this.selected = index;
    if (prev !== null) this.paint(prev);
    if (index !== null) this.paint(index);
  }

  /** Current colour of a tile's first vertex (for tests). */
  colorOf(index: number): THREE.Color {
    const o = this.tileStart[index] * 3;
    return new THREE.Color(this.colors[o], this.colors[o + 1], this.colors[o + 2]);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
  }

  private paint(index: number): void {
    const start = this.tileStart[index];
    const count = this.tileCount[index];
    const o = start * 3;
    if (index === this.selected) {
      this.tmp.copy(SELECTED);
    } else {
      this.tmp.setRGB(this.baseColors[o], this.baseColors[o + 1], this.baseColors[o + 2]);
      if (index === this.hover) this.tmp.multiplyScalar(HOVER_GAIN);
    }
    for (let v = 0; v < count; v++) {
      this.colors[o + v * 3] = this.tmp.r;
      this.colors[o + v * 3 + 1] = this.tmp.g;
      this.colors[o + v * 3 + 2] = this.tmp.b;
    }
    this.colorAttr.addUpdateRange(o, count * 3);
    this.colorAttr.needsUpdate = true;
  }
}
