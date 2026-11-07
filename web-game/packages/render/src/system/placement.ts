import {
  BezierPath,
  GAME_CONSTANTS,
  OrbitSolver,
  isWorking,
  landingPadTileOf,
  padDockingOffset,
  tileWidth,
  vec3,
  type BodyId,
  type CelestialBody,
  type PlanetGrid,
  type Structure,
  type TransferPlan,
  type Vec3,
  type WorldState,
} from '@space-game/domain';
import { footprintSpan } from './model-registry';

// Pure geometry for the scene: where things stand on a body, how a site looks, where a ship flies.
// Framework-free and Three-free; unit-tested in `placement.spec.ts`.

/** A place on a body's surface, in the body's local frame. */
export interface SurfaceFrame {
  /** On the sphere of the body's radius. */
  position: Vec3;
  /** Outward unit normal (= model up). */
  normal: Vec3;
  /** Unit tangent the model's +Z faces. */
  forward: Vec3;
  /** Width available to the model [world units]. */
  width: number;
}

export function createFrame(): SurfaceFrame {
  return { position: vec3(), normal: vec3(0, 1, 0), forward: vec3(0, 0, 1), width: 1 };
}

/**
 * Footprint centroid lifted onto the sphere, its normal, a deterministic tangent and the width it
 * offers (1, 3 or 7 tiles → `footprintSpan` tile widths). The tangent points at the anchor tile
 * (3 tiles), at the first neighbour (7 tiles) or at the first corner (1 tile).
 */
export function footprintFrame(grid: PlanetGrid, tiles: ReadonlyArray<number>, out: SurfaceFrame = createFrame(), span = footprintSpan(tiles.length)): SurfaceFrame {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let n = 0;
  for (const i of tiles) {
    const t = grid.tiles[i];
    if (!t) continue;
    cx += t.center.x;
    cy += t.center.y;
    cz += t.center.z;
    n++;
  }
  if (n === 0) {
    const top = grid.tiles[0]!;
    cx = top.center.x;
    cy = top.center.y;
    cz = top.center.z;
  }
  const len = Math.hypot(cx, cy, cz) || 1;
  out.normal.x = cx / len;
  out.normal.y = cy / len;
  out.normal.z = cz / len;
  out.position.x = out.normal.x * grid.radius;
  out.position.y = out.normal.y * grid.radius;
  out.position.z = out.normal.z * grid.radius;
  out.width = tileWidth(grid) * span;

  const anchor = grid.tiles[tiles[0] ?? 0] ?? grid.tiles[0]!;
  const second = tiles.length > 1 ? grid.tiles[tiles[1]!] : undefined;
  const candidates: Vec3[] = [];
  if (tiles.length >= 7 && second) candidates.push(second.center); // the flower: its centre is the anchor
  else {
    candidates.push(anchor.center);
    if (second) candidates.push(second.center);
  }
  candidates.push(anchor.vertices[0]!);
  for (const c of candidates) if (tangentTowards(out, c, grid.radius * 1e-4)) return out;
  // degenerate: any tangent
  tangentTowards(out, Math.abs(out.normal.y) < 0.9 ? vec3(0, grid.radius * 2, 0) : vec3(grid.radius * 2, 0, 0), 0);
  return out;
}

/** Sets `f.forward` to the tangent-plane direction from `f.position` to `p`; false when too short. */
function tangentTowards(f: SurfaceFrame, p: Vec3, minLength: number): boolean {
  const dx = p.x - f.position.x;
  const dy = p.y - f.position.y;
  const dz = p.z - f.position.z;
  const d = dx * f.normal.x + dy * f.normal.y + dz * f.normal.z;
  const tx = dx - d * f.normal.x;
  const ty = dy - d * f.normal.y;
  const tz = dz - d * f.normal.z;
  const l = Math.hypot(tx, ty, tz);
  if (l <= minLength) return false;
  f.forward.x = tx / l;
  f.forward.y = ty / l;
  f.forward.z = tz / l;
  return true;
}

/** Index of the footprint tile whose centre is nearest to a local point (pick on a model). */
export function nearestTile(grid: PlanetGrid, tiles: ReadonlyArray<number>, p: Vec3): number {
  let best = tiles[0] ?? -1;
  let bestD = Infinity;
  for (const i of tiles) {
    const c = grid.tiles[i]?.center;
    if (!c) continue;
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** How a structure is drawn in each state. */
export interface StructureLook {
  /** Solid model (InstancedMesh). */
  solid: boolean;
  /** Height of the solid part, 0..1 of the model (construction rises with progress). */
  height: number;
  /** Feature-edge outline of the full model (ghost of a planned site, scaffold of a working one). */
  outline: boolean;
}

/** Lowest visible part of a site that has just started. */
export const MIN_SITE_HEIGHT = 0.08;

export function structureLook(s: Pick<Structure, 'state' | 'progress'>): StructureLook {
  switch (s.state) {
    case 'PLANNED':
      return { solid: false, height: 0, outline: true };
    case 'CONSTRUCTING':
      return { solid: true, height: Math.max(MIN_SITE_HEIGHT, Math.min(1, Math.max(0, s.progress))), outline: true };
    case 'UPGRADING':
      return { solid: true, height: 1, outline: true };
    default:
      return { solid: true, height: 1, outline: false };
  }
}

/**
 * Docking point in the body's local frame, as the simulation sets it: above the first working
 * landing pad (`padDockingOffset`), else radius × orbitalAltitudeFactor above the centre.
 */
export function dockingOffsetOf(
  body: CelestialBody,
  grids: ReadonlyMap<BodyId, PlanetGrid>,
  working: ReadonlyArray<Structure>,
  out: Vec3 = vec3(),
  padLiftFactor = GAME_CONSTANTS.padLiftFactor,
): Vec3 {
  const grid = grids.get(body.id);
  const tile = grid ? landingPadTileOf(grids, working, body.id) : null;
  if (grid && tile) return padDockingOffset(grid, tile, padLiftFactor, out);
  out.x = 0;
  out.y = body.radius * body.orbitalAltitudeFactor;
  out.z = 0;
  return out;
}

/** Working structures only (pads count once built). */
export function workingStructures(world: Pick<WorldState, 'structures'>): Structure[] {
  return world.structures.filter(isWorking);
}

/** Flight progress u ∈ [0, 1] at game time t (TECH-1: a pure function of the plan). */
export function flightProgress(plan: Pick<TransferPlan, 'startTime' | 'estimatedDuration'>, t: number): number {
  const d = Math.max(plan.estimatedDuration, 1e-9);
  return Math.min(1, Math.max(0, (t - plan.startTime) / d));
}

/** The curve the simulation flies (`TransferSystem.register`). */
export function flightPath(plan: Pick<TransferPlan, 'startPos' | 'leadPos'>, arcLiftFactor = GAME_CONSTANTS.arcLiftFactor): BezierPath {
  return BezierPath.arc(plan.startPos, plan.leadPos, arcLiftFactor);
}

/** Identity of a flight across structured-clone snapshots. */
export function flightKey(plan: Pick<TransferPlan, 'shipId' | 'startTime' | 'toBodyId'>): string {
  return `${plan.shipId}@${plan.startTime}>${plan.toBodyId}`;
}

/** The system centre (the body without a parent). */
export function rootBody(bodies: ReadonlyArray<CelestialBody>): CelestialBody | undefined {
  return bodies.find((b) => b.parentId === null) ?? bodies[0];
}

/** Radius of the sphere around the centre that holds every orbit and body. */
export function systemExtent(bodies: ReadonlyArray<CelestialBody>): number {
  if (bodies.length === 0) return 1;
  const solver = new OrbitSolver(bodies);
  let r = 0;
  for (const b of bodies) r = Math.max(r, solver.maxWorldRadius(b.id) + b.radius * (b.kind === 'BELT' ? 3 : 1));
  return Math.max(r, 1);
}

/** Camera distance at which a sphere of `extent` fits a perspective view with some margin. */
export function fitDistance(extent: number, fovDeg: number, aspect: number, margin = 1.1): number {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-3));
  return (extent * margin) / Math.sin(Math.min(vHalf, hHalf));
}

/** What the planet camera looks at when the app gives no focus. */
export function defaultFocus(world: Pick<WorldState, 'bodies' | 'colony'>): BodyId | null {
  const b = world.bodies;
  return (
    world.colony.siteBodyId ??
    b.find((x) => x.isHomeBase)?.id ??
    b.find((x) => x.surfaceGrid && x.revealed !== false)?.id ??
    b.find((x) => x.kind === 'PLANET')?.id ??
    rootBody(b)?.id ??
    null
  );
}

/** Rover lift above the tile (RoverSystem.ROVER_LIFT, fraction of the radius). */
export const ROVER_LIFT = 0.005;

/** Rover position when the frame has none: its tile centre, lifted like the simulation does. */
export function roverRestPosition(grid: PlanetGrid, tileIndex: number, out: Vec3 = vec3()): Vec3 {
  const t = grid.tiles[tileIndex] ?? grid.tiles[0]!;
  const k = 1 + ROVER_LIFT;
  out.x = t.center.x * k;
  out.y = t.center.y * k;
  out.z = t.center.z * k;
  return out;
}
