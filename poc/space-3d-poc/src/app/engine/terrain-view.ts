import * as THREE from 'three';
import { PlanetGrid } from '../game/models/planet-grid.model';
import { RESOURCE_INFO } from '../game/models/resource.model';
import { TerrainPlan } from '../game/terrain/terrain-types';
import { TileFrame, buildTileFrames, kitScale } from '../game/terrain/tile-frame';
import { warpPoint } from '../game/terrain/tile-warp';
import { vec3 } from '../game/math/vec3';
import { KitModel } from './hex-kit';
import { PlanetGridView } from './planet-grid-view';
import { SurfaceView } from './surface-view';
import { groundTone } from './terrain-tones';

const HOVER_GAIN = 1.35;
const SELECTED = new THREE.Color(0x22d3ee);
const SELECTED_MIX = 0.5;
const DEPOSIT_MIX = 0.5;
/** The kit tile's water surface lies this far below its top, in kit units (× scale). */
const WATER_Y = 0.9;
/** Bevel of the kit tile rim: the outline of a tile lies this far below its top (× scale). */
const RIM_DROP = 0.05;
/** The flat top of a kit tile reaches this fraction of the corner radius. */
const PLATE_INSET = 0.95;

/**
 * Surface of a gridded body dressed with KayKit hex tiles. Every hexagon gets a kit tile warped onto its
 * Goldberg outline (no gaps between neighbours); the twelve pentagons get a plain bevelled plate instead of
 * a tile. One non-indexed mesh with vertex colours; the colour of a tile changes on hover and selection only.
 *
 * Picking: raycasts hit a hidden, cheap proxy (the flat fan grid of `PlanetGridView`, 3.8k triangles at
 * n = 8) instead of the 40–50k triangle terrain, so hover stays cheap. Its outlines are the tile outlines.
 * Until `applyKit` is called every hexagon is drawn as a flat fan, so the planet is usable while the kit
 * files load.
 */
export class TerrainView implements SurfaceView {
  readonly mesh: THREE.Mesh;
  readonly visual: THREE.Mesh;
  readonly extras: THREE.Object3D[];
  readonly tileEdge: number;
  /** Scale of the kit hexagon on this grid (kit units → world units). */
  readonly scale: number;
  readonly frames: ReadonlyArray<TileFrame>;

  private readonly proxy: PlanetGridView;
  private tileStart = new Int32Array(0);
  private tileCount = new Int32Array(0);
  private colors = new Float32Array(0);
  private baseColors = new Float32Array(0);
  private colorAttr: THREE.BufferAttribute | null = null;
  private triangles = 0;
  private hover: number | null = null;
  private selected: number | null = null;
  private readonly tmp = new THREE.Color();
  private readonly tmp2 = new THREE.Color();

  constructor(readonly grid: PlanetGrid, readonly plan: TerrainPlan, baseColor: number) {
    this.proxy = new PlanetGridView(grid, baseColor);
    this.proxy.mesh.visible = false;
    this.mesh = this.proxy.mesh;
    this.tileEdge = grid.tileEdge;
    this.frames = buildTileFrames(grid);
    this.scale = kitScale(this.frames);
    this.visual = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.02 }),
    );
    this.visual.name = `${grid.bodyId}_Terrain`;
    this.extras = [this.visual];
    this.build(null);
  }

  /** Draws the hexagons with their kit tiles (`kit` maps file id → model). Missing models stay flat fans. */
  applyKit(kit: ReadonlyMap<string, KitModel>): void {
    this.build(kit);
  }

  /** Triangles of the visible terrain (the pickable proxy has `triangleCount`). */
  get terrainTriangles(): number {
    return this.triangles;
  }

  get triangleCount(): number {
    return this.proxy.triangleCount;
  }

  tileAtFace(faceIndex: number): number {
    return this.proxy.tileAtFace(faceIndex);
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

  /** Vertex range of a tile in the terrain geometry (for tests). */
  rangeOf(index: number): { start: number; count: number } {
    return { start: this.tileStart[index], count: this.tileCount[index] };
  }

  dispose(): void {
    this.visual.geometry.dispose();
    (this.visual.material as THREE.Material).dispose();
    this.proxy.dispose();
  }

  private build(kit: ReadonlyMap<string, KitModel> | null): void {
    const { grid, plan, frames, scale: s } = this;
    const R = grid.radius;
    const pos: number[] = [];
    const col: number[] = [];
    this.tileStart = new Int32Array(grid.tiles.length);
    this.tileCount = new Int32Array(grid.tiles.length);
    const c = new THREE.Color();
    const out = vec3();
    const normal = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const d = new THREE.Vector3();

    for (const tile of grid.tiles) {
      const f = frames[tile.index];
      const kind = plan.kinds[tile.index];
      const variant = plan.variants[tile.index];
      const model = kit && variant ? kit.get(variant.id) : undefined;
      const jitter = 0.92 + (((tile.index * 2654435761) >>> 0) % 7) * 0.025;
      const deposit = tile.deposit ? this.tmp2.setHex(RESOURCE_INFO[tile.deposit.resource].color) : null;
      const start = pos.length / 3;
      normal.set(tile.normal.x, tile.normal.y, tile.normal.z);

      const push = (x: number, y: number, z: number, tone: THREE.Color): void => {
        pos.push(x, y, z);
        col.push(tone.r, tone.g, tone.b);
      };
      /** Triangle wound counter-clockwise seen from outside. */
      const tri = (p: number[], q: number[], r: number[], tone: THREE.Color): void => {
        a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
        d.crossVectors(a, b);
        const flip = d.dot(normal) < 0;
        const [u, v] = flip ? [r, q] : [q, r];
        push(p[0], p[1], p[2], tone);
        push(u[0], u[1], u[2], tone);
        push(v[0], v[1], v[2], tone);
      };

      if (model && variant) {
        for (const part of model.parts) {
          c.setHex(groundTone(part.mat, kind));
          if (part.mat !== 'Water') c.multiplyScalar(jitter);
          if (deposit && part.mat === 'Green') c.lerp(deposit, DEPOSIT_MIX);
          const lowerWater = part.mat === 'Water';
          const p = part.pos;
          for (let i = 0; i < p.length; i += 3) {
            const y = lowerWater ? Math.min(p[i + 1], WATER_Y) : p[i + 1];
            warpPoint(f, variant.k0, p[i], y, p[i + 2], R, s, out);
            push(out.x, out.y, out.z, c);
          }
        }
      } else {
        c.setHex(groundTone('Green', kind)).multiplyScalar(jitter);
        if (deposit) c.lerp(deposit, DEPOSIT_MIX);
        const n = f.m;
        if (tile.kind === 'PENT') {
          // bevelled plate: flat top inset like the kit's top face, rim dropped like the kit's bevel
          const ctr = [f.center.x, f.center.y, f.center.z];
          const top: number[][] = [];
          const rim: number[][] = [];
          for (const v of f.corners) {
            const t = [f.center.x + (v.x - f.center.x) * PLATE_INSET, f.center.y + (v.y - f.center.y) * PLATE_INSET, f.center.z + (v.z - f.center.z) * PLATE_INSET];
            const kt = R / Math.hypot(t[0], t[1], t[2]);
            top.push([t[0] * kt, t[1] * kt, t[2] * kt]);
            const kr = (R - RIM_DROP * s) / Math.hypot(v.x, v.y, v.z);
            rim.push([v.x * kr, v.y * kr, v.z * kr]);
          }
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            tri(ctr, top[i], top[j], c);
            tri(top[i], rim[i], rim[j], c);
            tri(top[i], rim[j], top[j], c);
          }
        } else {
          const ctr = [f.center.x, f.center.y, f.center.z];
          for (let i = 0; i < n; i++) {
            const v = f.corners[i];
            const w = f.corners[(i + 1) % n];
            tri(ctr, [v.x, v.y, v.z], [w.x, w.y, w.z], c);
          }
        }
      }
      this.tileStart[tile.index] = start;
      this.tileCount[tile.index] = pos.length / 3 - start;
    }

    this.baseColors = Float32Array.from(col);
    this.colors = Float32Array.from(col);
    this.triangles = pos.length / 9;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', this.colorAttr);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this.visual.geometry.dispose();
    this.visual.geometry = geometry;
    if (this.hover !== null) this.paint(this.hover);
    if (this.selected !== null) this.paint(this.selected);
  }

  private paint(index: number): void {
    if (!this.colorAttr) return;
    const start = this.tileStart[index];
    const count = this.tileCount[index];
    const o = start * 3;
    for (let v = 0; v < count; v++) {
      const k = o + v * 3;
      this.tmp.setRGB(this.baseColors[k], this.baseColors[k + 1], this.baseColors[k + 2]);
      if (index === this.selected) this.tmp.lerp(SELECTED, SELECTED_MIX);
      else if (index === this.hover) this.tmp.multiplyScalar(HOVER_GAIN);
      this.colors[k] = this.tmp.r;
      this.colors[k + 1] = this.tmp.g;
      this.colors[k + 2] = this.tmp.b;
    }
    this.colorAttr.addUpdateRange(o, count * 3);
    this.colorAttr.needsUpdate = true;
  }
}

