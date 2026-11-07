import * as THREE from 'three';
import type { PlanetGrid } from '@space-game/domain';
import { DS, SCENE, depositTint, mixHex, muteBodyColor } from './palette';

const HOVER_GAIN = 1.35;
/** How far the selected tile is pulled towards the signal colour (the outline does the rest). */
const SELECTED_MIX = 0.35;
const SELECTED_COLOR = new THREE.Color(DS.signal);
const DEPOSIT_MIX = 0.55;
const EXHAUSTED_MIX = 0.18;
/** Tile borders sit just above the surface so they never z-fight with it. */
export const EDGE_LIFT = 1.003;

/**
 * Goldberg surface of a body as ONE non-indexed mesh (fan triangles per tile, per-vertex colours)
 * plus one LineSegments for the tile edges (PoC `engine/planet-grid-view.ts`). `faceIndex` of a
 * raycast hit maps straight to a tile. Colours change only on hover/selection/depletion, never
 * per frame. Changes vs PoC: limited palette (muted body hue, muted deposit tints by material
 * code), Lambert flat shading, exhausted deposits fade.
 */
export class PlanetGridView {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  readonly edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly tileEdge: number;

  private readonly faceToTile: Int32Array;
  private readonly tileStart: Int32Array;
  private readonly tileCount: Int32Array;
  private readonly colors: Float32Array;
  private readonly baseColors: Float32Array;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly exhausted = new Set<number>();
  private hover: number | null = null;
  private selected: number | null = null;
  private readonly tmp = new THREE.Color();
  private readonly baseHex: number;

  constructor(
    readonly grid: PlanetGrid,
    bodyColor: number,
  ) {
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
    this.baseHex = muteBodyColor(bodyColor);

    let tri = 0;
    let e = 0;
    for (const tile of tiles) {
      const n = tile.vertices.length;
      this.tileStart[tile.index] = tri * 3;
      this.tileCount[tile.index] = n * 3;
      this.tileBase(tile.index, this.tmp);
      for (let i = 0; i < n; i++) {
        const a = tile.center;
        const b = tile.vertices[i]!;
        const c = tile.vertices[(i + 1) % n]!;
        const o = tri * 9;
        positions[o] = a.x;
        positions[o + 1] = a.y;
        positions[o + 2] = a.z;
        positions[o + 3] = b.x;
        positions[o + 4] = b.y;
        positions[o + 5] = b.z;
        positions[o + 6] = c.x;
        positions[o + 7] = c.y;
        positions[o + 8] = c.z;
        for (let v = 0; v < 3; v++) {
          normals[o + v * 3] = tile.normal.x;
          normals[o + v * 3 + 1] = tile.normal.y;
          normals[o + v * 3 + 2] = tile.normal.z;
          this.baseColors[o + v * 3] = this.tmp.r;
          this.baseColors[o + v * 3 + 1] = this.tmp.g;
          this.baseColors[o + v * 3 + 2] = this.tmp.b;
        }
        this.faceToTile[tri] = tile.index;
        tri++;
        edgePositions[e] = b.x * EDGE_LIFT;
        edgePositions[e + 1] = b.y * EDGE_LIFT;
        edgePositions[e + 2] = b.z * EDGE_LIFT;
        edgePositions[e + 3] = c.x * EDGE_LIFT;
        edgePositions[e + 4] = c.y * EDGE_LIFT;
        edgePositions[e + 5] = c.z * EDGE_LIFT;
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

    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh.name = `${grid.bodyId}_Grid`;

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    edgeGeo.computeBoundingSphere();
    this.edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: SCENE.gridEdge, transparent: true, opacity: 0.45 }));
    this.edges.name = `${grid.bodyId}_GridEdges`;
    this.tileEdge = grid.tileEdge;
  }

  get triangleCount(): number {
    return this.faceToTile.length;
  }

  /** Tile index for a raycast `faceIndex`; -1 when out of range. */
  tileAtFace(faceIndex: number): number {
    return faceIndex >= 0 && faceIndex < this.faceToTile.length ? this.faceToTile[faceIndex]! : -1;
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

  /** Marks deposits whose remaining amount reached 0; their tint fades. */
  setExhausted(index: number, exhausted: boolean): void {
    if (exhausted === this.exhausted.has(index)) return;
    if (exhausted) this.exhausted.add(index);
    else this.exhausted.delete(index);
    this.tileBase(index, this.tmp);
    const o = this.tileStart[index]! * 3;
    for (let v = 0; v < this.tileCount[index]!; v++) {
      this.baseColors[o + v * 3] = this.tmp.r;
      this.baseColors[o + v * 3 + 1] = this.tmp.g;
      this.baseColors[o + v * 3 + 2] = this.tmp.b;
    }
    this.paint(index);
  }

  /** Current colour of a tile's first vertex (for tests). */
  colorOf(index: number): THREE.Color {
    const o = this.tileStart[index]! * 3;
    return new THREE.Color(this.colors[o], this.colors[o + 1], this.colors[o + 2]);
  }

  /**
   * Writes the borders of the given tiles as line-segment pairs (local frame, lifted by `lift`)
   * into `out` from `offset`; returns the new offset. Used by the selection / placement overlays.
   */
  writeOutline(tiles: Iterable<number>, out: Float32Array, offset: number, lift = 1.006): number {
    let o = offset;
    for (const index of tiles) {
      const t = this.grid.tiles[index];
      if (!t) continue;
      const n = t.vertices.length;
      for (let i = 0; i < n; i++) {
        if (o + 6 > out.length) return o;
        const b = t.vertices[i]!;
        const c = t.vertices[(i + 1) % n]!;
        out[o] = b.x * lift;
        out[o + 1] = b.y * lift;
        out[o + 2] = b.z * lift;
        out[o + 3] = c.x * lift;
        out[o + 4] = c.y * lift;
        out[o + 5] = c.z * lift;
        o += 6;
      }
    }
    return o;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.edges.geometry.dispose();
    this.edges.material.dispose();
  }

  /** Base colour of a tile: muted body hue, subtle per-tile variation, deposit tint. */
  private tileBase(index: number, out: THREE.Color): THREE.Color {
    const tile = this.grid.tiles[index]!;
    // subtle deterministic variation so neighbouring tiles read as separate faces (PoC)
    const k = ((tile.index * 2654435761) >>> 0) % 7;
    const gain = tile.kind === 'PENT' ? 0.78 : 0.9 + k * 0.03;
    let hex = this.baseHex;
    if (tile.deposit) hex = mixHex(hex, depositTint(tile.deposit.resource), this.exhausted.has(index) ? EXHAUSTED_MIX : DEPOSIT_MIX);
    return out.setHex(hex).multiplyScalar(gain);
  }

  private paint(index: number): void {
    const start = this.tileStart[index]!;
    const count = this.tileCount[index]!;
    const o = start * 3;
    this.tmp.setRGB(this.baseColors[o]!, this.baseColors[o + 1]!, this.baseColors[o + 2]!);
    if (index === this.selected) this.tmp.lerp(SELECTED_COLOR, SELECTED_MIX);
    else if (index === this.hover) this.tmp.multiplyScalar(HOVER_GAIN);
    for (let v = 0; v < count; v++) {
      this.colors[o + v * 3] = this.tmp.r;
      this.colors[o + v * 3 + 1] = this.tmp.g;
      this.colors[o + v * 3 + 2] = this.tmp.b;
    }
    this.colorAttr.addUpdateRange(o, count * 3);
    this.colorAttr.needsUpdate = true;
  }
}
