import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { CELL, LEVEL_HEIGHT, SNAP, type Rect, type XZ } from '../domain/grid';

const UNIT_QUAD = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Many flat rectangles of one colour lying on the deck (fills, outline strips, markers). */
class RectBatch {
  mesh: InstancedMesh;
  private readonly m = new Matrix4();

  constructor(
    private readonly parent: Group,
    private readonly material: MeshBasicMaterial,
    private readonly lift: number,
    capacity = 64,
  ) {
    this.mesh = this.make(capacity);
  }

  private make(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(UNIT_QUAD, this.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    this.parent.add(mesh);
    return mesh;
  }

  set(rects: readonly Rect[], y: number): void {
    if (rects.length > this.mesh.instanceMatrix.count) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.make(Math.max(rects.length, this.mesh.instanceMatrix.count * 2));
    }
    rects.forEach((r, i) => {
      this.m.makeScale(Math.max(r.maxX - r.minX, 1e-3), 1, Math.max(r.maxZ - r.minZ, 1e-3));
      this.m.setPosition((r.minX + r.maxX) / 2, y + this.lift, (r.minZ + r.maxZ) / 2);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = rects.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.material.dispose();
  }
}

/** Rectangle outline as four strips. */
export function outline(r: Rect, t = 0.07): Rect[] {
  return [
    { minX: r.minX - t, maxX: r.maxX + t, minZ: r.minZ - t, maxZ: r.minZ + t },
    { minX: r.minX - t, maxX: r.maxX + t, minZ: r.maxZ - t, maxZ: r.maxZ + t },
    { minX: r.minX - t, maxX: r.minX + t, minZ: r.minZ, maxZ: r.maxZ },
    { minX: r.maxX - t, maxX: r.maxX + t, minZ: r.minZ, maxZ: r.maxZ },
  ];
}

const flat = (color: number, opacity: number, depthTest = false) =>
  new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false, depthTest });

/**
 * Editor marks on the active deck: cell grid, 0.5 m sub-grid around the cursor, drag area,
 * hover and selection outlines, issue markers. Colours follow the HUD design system:
 * amber = interaction, red = critical, neutral grey-blue = structure.
 */
export class OverlayView {
  readonly group = new Group();
  private readonly grid: LineSegments;
  private readonly subgrid: LineSegments;
  private readonly fill = new RectBatch(this.group, flat(0xffb000, 0.14), 0.06);
  private readonly hover = new RectBatch(this.group, flat(0xffffff, 0.85), 0.07);
  private readonly selection = new RectBatch(this.group, flat(0xffb000, 1), 0.08);
  private readonly errors = new RectBatch(this.group, flat(0xff5a4a, 0.9), 0.09);
  private readonly warnings = new RectBatch(this.group, flat(0xffb000, 0.55), 0.085);
  private y = 0;

  constructor(extentCells = 40) {
    this.group.name = 'overlay';
    this.grid = this.lines(extentCells * CELL, CELL, 0x6a7b8f, 0.62);
    this.subgrid = this.lines(CELL * 1.5, SNAP, 0x8a939d, 0.4);
    this.subgrid.visible = false;
    this.group.add(this.grid, this.subgrid);
  }

  private lines(half: number, step: number, color: number, opacity: number): LineSegments {
    const pos: number[] = [];
    for (let v = -half; v <= half + 1e-6; v += step) {
      pos.push(-half, 0, v, half, 0, v, v, 0, -half, v, 0, half);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const l = new LineSegments(g, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    l.renderOrder = 5;
    l.frustumCulled = false;
    return l;
  }

  setLevel(level: number): void {
    this.y = level * LEVEL_HEIGHT;
    this.grid.position.y = this.y + 0.035;
    this.subgrid.position.y = this.y + 0.04;
  }

  setGridVisible(v: boolean): void {
    this.grid.visible = v;
  }

  /** Fine 0.5 m grid around a point (object placement), or hidden. */
  setSubgrid(at: XZ | null): void {
    this.subgrid.visible = !!at;
    if (at) this.subgrid.position.set(Math.round(at.x / CELL) * CELL, this.y + 0.04, Math.round(at.z / CELL) * CELL);
  }

  setFill(rects: readonly Rect[]): void {
    this.fill.set(rects, this.y);
  }

  setHover(rects: readonly Rect[]): void {
    this.hover.set(rects.flatMap((r) => outline(r, 0.045)), this.y);
  }

  setSelection(rects: readonly Rect[]): void {
    this.selection.set(rects.flatMap((r) => outline(r, 0.08)), this.y);
  }

  setIssues(errors: readonly Rect[], warnings: readonly Rect[]): void {
    this.errors.set(errors, this.y);
    this.warnings.set(warnings, this.y);
  }

  dispose(): void {
    for (const b of [this.fill, this.hover, this.selection, this.errors, this.warnings]) b.dispose();
    for (const l of [this.grid, this.subgrid]) {
      l.geometry.dispose();
      (l.material as LineBasicMaterial).dispose();
    }
  }
}
