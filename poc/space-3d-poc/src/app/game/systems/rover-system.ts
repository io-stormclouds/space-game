import { BodyId, RoverId } from '../../shared/ids';
import { GameConstants } from '../config/game-constants';
import { FrameSnapshot } from '../frame-snapshot';
import { Vec3, normalize, scale, set, vec3 } from '../math/vec3';
import { DomainEvent } from '../models/domain-event.model';
import { PlanetGrid, Tile } from '../models/planet-grid.model';
import { Rover } from '../models/rover.model';
import { Structure } from '../models/structure.model';

interface ActiveDrive {
  /** Tiles still to pass, destination last. */
  path: number[];
  from: number;
  /** 0..1 along the current segment. */
  u: number;
  pos: Vec3;
  forward: Vec3;
}

/** Height of the rover's pivot above the tile surface, as a fraction of the body radius. */
const ROVER_LIFT = 0.005;

/**
 * Moves rovers tile to tile over the Goldberg grid. Paths are BFS over `neighbors`; each segment is
 * a great-circle arc between tile centres. Continuous positions go to the snapshot, never to state.
 */
export class RoverSystem {
  private readonly active = new Map<RoverId, ActiveDrive>();
  private readonly tmpA = vec3();
  private readonly tmpB = vec3();

  constructor(
    private readonly grids: ReadonlyMap<BodyId, PlanetGrid>,
    private readonly cfg: GameConstants,
  ) {}

  /** Shortest tile path (excluding `from`, including `to`), or null. Tiles with structures block, except landing pads and the destination. */
  findPath(bodyId: BodyId, from: number, to: number, structures: ReadonlyArray<Structure>): number[] | null {
    const grid = this.grids.get(bodyId);
    if (!grid || from === to) return grid && from === to ? [] : null;
    const blocked = new Set<number>();
    for (const s of structures) {
      if (s.bodyId !== bodyId || s.kind === 'LANDING_PAD') continue;
      const idx = Number(s.tileId.slice(s.tileId.lastIndexOf(':') + 1));
      blocked.add(idx);
    }
    if (blocked.has(to)) return null;
    const prev = new Int32Array(grid.tiles.length).fill(-1);
    const seen = new Uint8Array(grid.tiles.length);
    const queue = [from];
    seen[from] = 1;
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      if (cur === to) break;
      for (const n of grid.tiles[cur].neighbors) {
        if (seen[n] || (blocked.has(n) && n !== to)) continue;
        seen[n] = 1;
        prev[n] = cur;
        queue.push(n);
      }
    }
    if (!seen[to]) return null;
    const path: number[] = [];
    for (let cur = to; cur !== from; cur = prev[cur]) path.push(cur);
    return path.reverse();
  }

  /** Registers a drive along `path` for a rover standing on `rover.tileIndex`. */
  start(rover: Rover, path: ReadonlyArray<number>): void {
    const grid = this.grids.get(rover.bodyId);
    if (!grid || path.length === 0) return;
    const drive: ActiveDrive = { path: [...path], from: rover.tileIndex, u: 0, pos: vec3(), forward: vec3(0, 0, 1) };
    this.placeAt(grid.tiles[rover.tileIndex], grid, drive.pos);
    this.active.set(rover.id, drive);
  }

  isActive(id: RoverId): boolean {
    return this.active.has(id);
  }

  /** Advances drives and writes every rover's local position into the snapshot. */
  update(rovers: ReadonlyArray<Rover>, dt: number, snap: FrameSnapshot): DomainEvent[] {
    const events: DomainEvent[] = [];
    for (const rover of rovers) {
      const grid = this.grids.get(rover.bodyId);
      if (!grid) continue;
      let pos = snap.roverLocalPos.get(rover.id);
      let fwd = snap.roverForward.get(rover.id);
      if (!pos) snap.roverLocalPos.set(rover.id, (pos = vec3()));
      if (!fwd) snap.roverForward.set(rover.id, (fwd = vec3(0, 0, 1)));

      const drive = this.active.get(rover.id);
      if (!drive || rover.state !== 'MOVING') {
        const tile = grid.tiles[rover.tileIndex];
        this.placeAt(tile, grid, pos);
        this.tangentTowards(tile, grid.tiles[tile.neighbors[0]], fwd);
        continue;
      }

      let remaining = this.cfg.roverSpeed * dt;
      while (remaining > 0 && drive.path.length > 0) {
        const a = grid.tiles[drive.from];
        const b = grid.tiles[drive.path[0]];
        const segLen = this.arcLength(a, b, grid.radius);
        const left = (1 - drive.u) * segLen;
        if (remaining >= left) {
          remaining -= left;
          drive.from = drive.path.shift()!;
          drive.u = 0;
        } else {
          drive.u += remaining / segLen;
          remaining = 0;
        }
      }

      if (drive.path.length === 0) {
        this.placeAt(grid.tiles[drive.from], grid, pos);
        this.active.delete(rover.id);
        events.push({ type: 'ROVER_ARRIVED', roverId: rover.id, tileIndex: drive.from });
      } else {
        const a = grid.tiles[drive.from];
        const b = grid.tiles[drive.path[0]];
        this.slerpSurface(a, b, drive.u, grid, pos);
        this.tangentTowards(a, b, fwd, drive.u);
      }
    }
    return events;
  }

  /** Surface point on the great-circle arc between two tile centres, lifted off the surface. */
  private slerpSurface(a: Tile, b: Tile, u: number, grid: PlanetGrid, out: Vec3): Vec3 {
    set(this.tmpA, a.normal.x + (b.normal.x - a.normal.x) * u, a.normal.y + (b.normal.y - a.normal.y) * u, a.normal.z + (b.normal.z - a.normal.z) * u);
    normalize(this.tmpA, this.tmpA);
    return scale(out, this.tmpA, grid.radius * (1 + ROVER_LIFT));
  }

  private placeAt(tile: Tile, grid: PlanetGrid, out: Vec3): Vec3 {
    return scale(out, tile.normal, grid.radius * (1 + ROVER_LIFT));
  }

  /** Unit tangent at the current point, pointing from a towards b along the arc. */
  private tangentTowards(a: Tile, b: Tile, out: Vec3, u = 0): Vec3 {
    // direction = (b − a) projected onto the tangent plane of the current normal
    set(this.tmpA, a.normal.x + (b.normal.x - a.normal.x) * u, a.normal.y + (b.normal.y - a.normal.y) * u, a.normal.z + (b.normal.z - a.normal.z) * u);
    normalize(this.tmpA, this.tmpA);
    set(this.tmpB, b.normal.x - a.normal.x, b.normal.y - a.normal.y, b.normal.z - a.normal.z);
    const d = this.tmpB.x * this.tmpA.x + this.tmpB.y * this.tmpA.y + this.tmpB.z * this.tmpA.z;
    set(out, this.tmpB.x - d * this.tmpA.x, this.tmpB.y - d * this.tmpA.y, this.tmpB.z - d * this.tmpA.z);
    return normalize(out, out);
  }

  private arcLength(a: Tile, b: Tile, radius: number): number {
    const dot = Math.max(-1, Math.min(1, a.normal.x * b.normal.x + a.normal.y * b.normal.y + a.normal.z * b.normal.z));
    return Math.max(1e-6, Math.acos(dot) * radius);
  }
}
