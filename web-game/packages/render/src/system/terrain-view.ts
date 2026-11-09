import * as THREE from 'three';
import { buildTileFrames, kitScale, vec3, warpPoint, type PlanetGrid, type TerrainPlan, type TileFrame } from '@space-game/domain';
import type { KitModel } from './hex-kit';
import { DS, depositTint, mixHex } from './palette';
import { groundTone } from './terrain-tones';

const HOVER_GAIN = 1.35;
const SELECTED_MIX = 0.35;
const SELECTED_COLOR = new THREE.Color(DS.signal);
const DEPOSIT_MIX = 0.55;
const EXHAUSTED_MIX = 0.18;
/** The kit tile's water surface lies this far below its top, in kit units. */
const WATER_Y = 0.9;
/** Bevel of the kit tile rim: the outline of a tile lies this far below its top (× scale). */
const RIM_DROP = 0.05;
/** The flat top of a kit tile reaches this fraction of the corner radius. */
const PLATE_INSET = 0.95;

/**
 * Terrain of a gridded body drawn with KayKit hex tiles (docs/planet-terrain-poc-wnioski-i-plan.md).
 * Every hexagon gets its kit tile warped onto the Goldberg outline (no gaps between neighbours); the
 * twelve pentagons get a plain bevelled plate. One non-indexed mesh with vertex colours; colours change
 * on hover, selection and depletion only.
 *
 * It only DRAWS. Picking, tile borders and outlines stay with `PlanetGridView`, whose flat fan mesh
 * (3.8k triangles at n = 8) is the cheap raycast proxy and the far LOD. `applyKit` builds the geometry
 * once the kit files have loaded; until then `ready` is false and the scene keeps showing the fan grid.
 */
export class TerrainView {
  readonly visual: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  /** Scale of the kit hexagon on this grid (kit units → world units). */
  readonly scale: number;
  readonly frames: ReadonlyArray<TileFrame>;

  private tileStart = new Int32Array(0);
  private tileCount = new Int32Array(0);
  private colors = new Float32Array(0);
  private baseColors = new Float32Array(0);
  /** Colour of each vertex without any deposit tint, and whether it is on the tile's top surface. */
  private plain = new Float32Array(0);
  private top = new Uint8Array(0);
  private colorAttr: THREE.BufferAttribute | null = null;
  private triangles = 0;
  private built = false;
  private hover: number | null = null;
  private selected: number | null = null;
  private readonly exhausted = new Set<number>();
  private readonly tmp = new THREE.Color();
  private readonly tint = new THREE.Color();

  constructor(
    readonly grid: PlanetGrid,
    readonly plan: TerrainPlan,
  ) {
    this.frames = buildTileFrames(grid);
    this.scale = kitScale(this.frames);
    this.visual = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.visual.name = `${grid.bodyId}_Terrain`;
    this.visual.visible = false;
  }

  /** True once the kit geometry is built. */
  get ready(): boolean {
    return this.built;
  }

  /** Triangles of the terrain geometry. */
  get terrainTriangles(): number {
    return this.triangles;
  }

  /** Builds the terrain from the loaded kit (`kit` maps file id → model). Missing models stay flat fans. */
  applyKit(kit: ReadonlyMap<string, KitModel>): void {
    this.build(kit);
    this.built = true;
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
    if (!this.built) return;
    this.rebase(index);
    this.paint(index);
  }

  /** Current colour of a tile's first vertex (for tests). */
  colorOf(index: number): THREE.Color {
    const o = this.tileStart[index]! * 3;
    return new THREE.Color(this.colors[o], this.colors[o + 1], this.colors[o + 2]);
  }

  /** Vertex range of a tile in the terrain geometry (for tests). */
  rangeOf(index: number): { start: number; count: number } {
    return { start: this.tileStart[index]!, count: this.tileCount[index]! };
  }

  dispose(): void {
    this.visual.geometry.dispose();
    this.visual.material.dispose();
  }

  private build(kit: ReadonlyMap<string, KitModel>): void {
    const { grid, plan, frames, scale: s } = this;
    const R = grid.radius;
    const pos: number[] = [];
    const col: number[] = [];
    const top: number[] = [];
    this.tileStart = new Int32Array(grid.tiles.length);
    this.tileCount = new Int32Array(grid.tiles.length);
    const c = new THREE.Color();
    const out = vec3();
    const normal = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const d = new THREE.Vector3();

    for (const tile of grid.tiles) {
      const f = frames[tile.index]!;
      const kind = plan.kinds[tile.index]!;
      const variant = plan.variants[tile.index];
      const model = variant ? kit.get(variant.id) : undefined;
      const jitter = 0.92 + (((tile.index * 2654435761) >>> 0) % 7) * 0.025;
      const start = pos.length / 3;
      normal.set(tile.normal.x, tile.normal.y, tile.normal.z);

      const push = (x: number, y: number, z: number, tone: THREE.Color, isTop: boolean): void => {
        pos.push(x, y, z);
        col.push(tone.r, tone.g, tone.b);
        top.push(isTop ? 1 : 0);
      };
      /** Triangle wound counter-clockwise seen from outside. */
      const tri = (p: number[], q: number[], r: number[], tone: THREE.Color): void => {
        a.set(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!);
        b.set(r[0]! - p[0]!, r[1]! - p[1]!, r[2]! - p[2]!);
        d.crossVectors(a, b);
        const [u, v] = d.dot(normal) < 0 ? [r, q] : [q, r];
        push(p[0]!, p[1]!, p[2]!, tone, true);
        push(u[0]!, u[1]!, u[2]!, tone, true);
        push(v[0]!, v[1]!, v[2]!, tone, true);
      };

      if (model && variant) {
        for (const part of model.parts) {
          c.setHex(groundTone(part.mat, kind));
          if (part.mat !== 'Water') c.multiplyScalar(jitter);
          const lowerWater = part.mat === 'Water';
          const isTop = part.mat === 'Green';
          const p = part.pos;
          for (let i = 0; i < p.length; i += 3) {
            const y = lowerWater ? Math.min(p[i + 1]!, WATER_Y) : p[i + 1]!;
            warpPoint(f, variant.k0, p[i]!, y, p[i + 2]!, R, s, out);
            push(out.x, out.y, out.z, c, isTop);
          }
        }
      } else {
        c.setHex(groundTone('Green', kind)).multiplyScalar(jitter);
        const n = f.m;
        const ctr = [f.center.x, f.center.y, f.center.z];
        if (tile.kind === 'PENT') {
          // bevelled plate: flat top inset like the kit's top face, rim dropped like the kit's bevel
          const topP: number[][] = [];
          const rim: number[][] = [];
          for (const v of f.corners) {
            const t = [f.center.x + (v.x - f.center.x) * PLATE_INSET, f.center.y + (v.y - f.center.y) * PLATE_INSET, f.center.z + (v.z - f.center.z) * PLATE_INSET];
            const kt = R / Math.hypot(t[0]!, t[1]!, t[2]!);
            topP.push([t[0]! * kt, t[1]! * kt, t[2]! * kt]);
            const kr = (R - RIM_DROP * s) / Math.hypot(v.x, v.y, v.z);
            rim.push([v.x * kr, v.y * kr, v.z * kr]);
          }
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            tri(ctr, topP[i]!, topP[j]!, c);
            tri(topP[i]!, rim[i]!, rim[j]!, c);
            tri(topP[i]!, rim[j]!, topP[j]!, c);
          }
        } else {
          for (let i = 0; i < n; i++) {
            const v = f.corners[i]!;
            const w = f.corners[(i + 1) % n]!;
            tri(ctr, [v.x, v.y, v.z], [w.x, w.y, w.z], c);
          }
        }
      }
      this.tileStart[tile.index] = start;
      this.tileCount[tile.index] = pos.length / 3 - start;
    }

    this.plain = Float32Array.from(col);
    this.top = Uint8Array.from(top);
    this.baseColors = Float32Array.from(col);
    this.colors = Float32Array.from(col);
    this.triangles = pos.length / 9;
    for (const tile of grid.tiles) if (tile.deposit) this.rebase(tile.index);
    this.colors.set(this.baseColors);

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

  /** Recomputes the base colour of a tile's top surface: plain colour mixed with its deposit tint. */
  private rebase(index: number): void {
    const tile = this.grid.tiles[index]!;
    const o = this.tileStart[index]! * 3;
    const mix = this.exhausted.has(index) ? EXHAUSTED_MIX : DEPOSIT_MIX;
    const tint = tile.deposit ? depositTint(tile.deposit.resource) : null;
    for (let v = 0; v < this.tileCount[index]!; v++) {
      const k = o + v * 3;
      if (tint !== null && this.top[this.tileStart[index]! + v]) {
        this.tmp.setRGB(this.plain[k]!, this.plain[k + 1]!, this.plain[k + 2]!);
        const hex = mixHex(this.tmp.getHex(), tint, mix);
        this.tint.setHex(hex);
        this.baseColors[k] = this.tint.r;
        this.baseColors[k + 1] = this.tint.g;
        this.baseColors[k + 2] = this.tint.b;
      } else {
        this.baseColors[k] = this.plain[k]!;
        this.baseColors[k + 1] = this.plain[k + 1]!;
        this.baseColors[k + 2] = this.plain[k + 2]!;
      }
    }
  }

  private paint(index: number): void {
    if (!this.colorAttr) return;
    const start = this.tileStart[index]!;
    const count = this.tileCount[index]!;
    const o = start * 3;
    for (let v = 0; v < count; v++) {
      const k = o + v * 3;
      this.tmp.setRGB(this.baseColors[k]!, this.baseColors[k + 1]!, this.baseColors[k + 2]!);
      if (index === this.selected) this.tmp.lerp(SELECTED_COLOR, SELECTED_MIX);
      else if (index === this.hover) this.tmp.multiplyScalar(HOVER_GAIN);
      this.colors[k] = this.tmp.r;
      this.colors[k + 1] = this.tmp.g;
      this.colors[k + 2] = this.tmp.b;
    }
    this.colorAttr.addUpdateRange(o, count * 3);
    this.colorAttr.needsUpdate = true;
  }
}
