import { Vec3, normalize, vec3 } from '../math/vec3';
import { fbm } from '../math/seeded-noise';
import type { CelestialBody } from '../models/celestial-body.model';
import { PlanetGrid, Tile } from '../models/planet-grid.model';
import { BiomeRules, biomeRules } from './terrain-biomes';
import { TerrainConfig, TerrainKind } from './terrain-types';

/*
 * Gameplay half of the hex-kit terrain (T8, T5): terrain class of every tile and the roads of the ruined
 * settlement. Build rules read these (`Tile.terrain`, `Tile.road`), so this file is ported bit for bit to
 * Rust (`game-core/src/math/terrain.rs`): plain float arithmetic in a fixed order, no `**`, no `atan2`,
 * first minimum wins. The biome thresholds are data (`BIOMES`, `biomeRules`). The render-only half (kit
 * tile per hexagon, decor) is `dressTerrain`.
 */

/** Terrain style (biome, seed and the config's overrides) plus the settlement direction. */
export interface ClassifyOptions extends TerrainConfig {
  /** Direction (body frame) the settlement faces; usually towards the sun at t = 0. */
  aim?: Vec3;
}

/** The style part of `ClassifyOptions` (drops `aim`), keys in the world JSON order, absent keys left out. */
export function terrainConfigOf(o: TerrainConfig): TerrainConfig {
  return {
    biome: o.biome,
    seed: o.seed,
    ...(o.ground !== undefined ? { ground: o.ground } : {}),
    ...(o.basin !== undefined ? { basin: o.basin } : {}),
    ...(o.basinLevel !== undefined ? { basinLevel: o.basinLevel } : {}),
    ...(o.landingCap !== undefined ? { landingCap: o.landingCap } : {}),
  };
}

/** Rings 1–3 around the settlement centre, each in breadth-first order over `Tile.neighbors`. */
export interface SettlementRings {
  r1: number[];
  r2: number[];
  r3: number[];
}

export interface TerrainClassification {
  /** Final class per tile (after the settlement clearing; road tiles are the ground, grass in medieval). */
  kinds: TerrainKind[];
  /** Road tiles of the settlement, in ascending index order. */
  road: Set<number>;
  /** Centre tile of the settlement (castle); null without one. */
  settlementCenter: number | null;
  /** Rings around the centre; null without a settlement. */
  rings: SettlementRings | null;
}

/** Settlement direction when none is given (the PoC showcase). */
export const DEFAULT_AIM = normalize(vec3(), vec3(0.35, 0.45, 0.82));

/** Direction the settlement of a body faces: the sun as seen from the body at t = 0, lifted to y = 0.9 (not normalised). */
export function terrainAim(body: Pick<CelestialBody, 'initialAngle'>): Vec3 {
  return vec3(-Math.cos(body.initialAngle), 0.9, -Math.sin(body.initialAngle));
}

/** Free for settlement buildings and roads: a hexagon without a deposit. */
const freeTile = (t: Tile): boolean => t.kind === 'HEX' && !t.deposit;

/**
 * Class of one tile from three smooth noise fields on its normal plus the latitude (chain in
 * `terrain-biomes.ts`, first rule wins).
 */
export function tileKind(normal: Vec3, seed: number, rules: BiomeRules): TerrainKind {
  const n = normal;
  const p = (k: number): Vec3 => vec3(n.x * k + 7, n.y * k + 7, n.z * k + 7);
  const f1 = fbm(seed, p(2.6));
  const f2 = fbm(seed + 11, p(3.4));
  const f3 = fbm(seed + 23, p(4.2));
  const lat = Math.abs(n.y);
  if (f1 < rules.basinLevel) return rules.basin;
  if (rules.polar !== null && lat > rules.polar) return 'snow';
  if (rules.rock !== null && f2 > rules.rock) return 'rock';
  if (rules.forest !== null && f3 > rules.forest && (rules.forestLat === null || lat < rules.forestLat)) return 'forest';
  return rules.ground;
}

/**
 * Classes from the noise chain (`tileKind`), then one fix-up per tile: with `landingCap`, every tile where
 * `normal.y > landingCap` becomes the plain ground (the landing zone around the +Y pole, where the first
 * port goes: no basin, and no snow, rock or forest surcharge, so the canvas port costs what the canvas
 * says); elsewhere a basin becomes the ground on a pentagon and on a deposit tile.
 */
export function noiseKinds(grid: PlanetGrid, config: TerrainConfig): TerrainKind[] {
  const tiles = grid.tiles;
  const rules = biomeRules(config);
  const cap = config.landingCap;
  const kinds: TerrainKind[] = tiles.map((t) => tileKind(t.normal, config.seed, rules));
  tiles.forEach((t, i) => {
    if (cap !== undefined && t.normal.y > cap) kinds[i] = rules.ground;
    else if (kinds[i] === rules.basin && (t.kind === 'PENT' || t.deposit !== null)) kinds[i] = rules.ground;
  });
  return kinds;
}

/** Rings 1–3 around tile `c` (breadth-first over `Tile.neighbors`, in neighbour order). */
export function settlementRings(grid: PlanetGrid, c: number): SettlementRings {
  const tiles = grid.tiles;
  const seen = new Set<number>([c]);
  const rings: number[][] = [[c]];
  for (let r = 1; r <= 3; r++) {
    const next: number[] = [];
    for (const t of rings[r - 1]!) {
      for (const nb of tiles[t]!.neighbors) {
        if (!seen.has(nb)) {
          seen.add(nb);
          next.push(nb);
        }
      }
    }
    rings.push(next);
  }
  return { r1: rings[1]!, r2: rings[2]!, r3: rings[3]! };
}

/**
 * Settlement centre: the hexagon facing `aim` best, with no pentagon within two rings, penalised by the
 * deposits within two rings (they cannot hold buildings). First maximum in tile order; null when no
 * hexagon qualifies (GP(n,0) with n ≤ 4).
 */
export function findSettlementCenter(grid: PlanetGrid, aim: Vec3): number | null {
  const tiles = grid.tiles;
  let center = -1;
  let best = -Infinity;
  tiles.forEach((t, i) => {
    if (t.kind !== 'HEX') return;
    const { r1, r2 } = settlementRings(grid, i);
    if ([...r1, ...r2].some((j) => tiles[j]!.kind === 'PENT')) return;
    const near = [i, ...r1, ...r2];
    const score = t.normal.x * aim.x + t.normal.y * aim.y + t.normal.z * aim.z - 0.06 * near.filter((j) => tiles[j]!.deposit).length;
    if (score > best) {
      best = score;
      center = i;
    }
  });
  return center < 0 ? null : center;
}

/**
 * The settlement clears its ground: no basin, rock or snow within two rings, no forest in ring 1; cleared
 * tiles become the ground.
 */
export function clearSettlement(kinds: TerrainKind[], center: number, rings: SettlementRings, rules: BiomeRules): void {
  for (const i of [center, ...rings.r1, ...rings.r2]) if (kinds[i] === rules.basin || kinds[i] === 'rock' || kinds[i] === 'snow') kinds[i] = rules.ground;
  for (const i of rings.r1) if (kinds[i] === 'forest') kinds[i] = rules.ground;
}

/**
 * Whether ring-2 tile `i` (position `k` in the ring) gets a settlement building, on the cleared classes.
 * Every third one (k % 3 = 0) is a house on a road.
 */
export function ring2Built(grid: PlanetGrid, cleared: ReadonlyArray<TerrainKind>, i: number, k: number): boolean {
  return freeTile(grid.tiles[i]!) && !(cleared[i] === 'forest' && k % 2 !== 0);
}

/**
 * Roads of the settlement on the cleared classes: every free ring-1 tile, the ring-2 house tiles, and four
 * spokes from the outer ring towards the castle (greedy along the free neighbour closest to the centre,
 * first minimum in neighbour order). Insertion order: ring 1, ring 2, spokes.
 */
function settlementRoads(grid: PlanetGrid, cleared: ReadonlyArray<TerrainKind>, center: number, rings: SettlementRings): Set<number> {
  const tiles = grid.tiles;
  const free = (i: number): boolean => freeTile(tiles[i]!);
  const { r1, r2, r3 } = rings;
  const road = new Set<number>();
  for (const i of r1) if (free(i)) road.add(i);
  r2.forEach((i, k) => {
    if (ring2Built(grid, cleared, i, k) && k % 3 === 0) road.add(i);
  });

  const cc = tiles[center]!.center;
  const dist2 = (i: number): number => {
    const c = tiles[i]!.center;
    const dx = c.x - cc.x;
    const dy = c.y - cc.y;
    const dz = c.z - cc.z;
    return dx * dx + dy * dy + dz * dz;
  };
  r3.filter((_, k) => k % 4 === 0)
    .slice(0, 4)
    .forEach((target) => {
      let cur = target;
      for (let step = 0; step < 4; step++) {
        if (!free(cur)) break;
        road.add(cur);
        // stable sort: the first of equally close neighbours wins
        const next = tiles[cur]!.neighbors.filter((j) => free(j)).sort((a, b) => dist2(a) - dist2(b))[0];
        if (next === undefined || dist2(next) >= dist2(cur)) break;
        cur = next;
        if (r1.includes(cur)) {
          road.add(cur);
          break;
        }
      }
    });
  return road;
}

/**
 * Terrain classes and settlement roads of a body. Pure and deterministic: the same grid and options give
 * the same classification. Steps: noise classes with the basin fix-ups (`noiseKinds`) → (biomes with a
 * settlement) centre facing `aim` → clearing within two rings → roads → road tiles become the ground.
 *
 * Rules that keep it compatible with the game: no basin on a deposit tile or a pentagon, no road on a
 * deposit tile or a pentagon.
 */
export function classifyTerrain(grid: PlanetGrid, opts: ClassifyOptions): TerrainClassification {
  const rules = biomeRules(opts);
  const kinds = noiseKinds(grid, opts);
  const center = rules.settlement ? findSettlementCenter(grid, opts.aim ?? DEFAULT_AIM) : null;
  if (center === null) return { kinds, road: new Set(), settlementCenter: null, rings: null };
  const rings = settlementRings(grid, center);
  clearSettlement(kinds, center, rings, rules);
  const roads = settlementRoads(grid, kinds, center, rings);
  // a road tile is plain ground
  for (const i of roads) kinds[i] = rules.ground;
  return { kinds, road: new Set([...roads].sort((a, b) => a - b)), settlementCenter: center, rings };
}

/**
 * The grid with its terrain: `Tile.terrain` on every tile, `Tile.road` on road tiles and
 * `PlanetGrid.terrain` with the style and the settlement centre. New tile objects; the input is not changed.
 */
export function withTerrain(grid: PlanetGrid, config: TerrainConfig, aim: Vec3): PlanetGrid {
  const style = terrainConfigOf(config);
  const c = classifyTerrain(grid, { ...style, aim });
  return {
    ...grid,
    tiles: grid.tiles.map((t, i): Tile => ({ ...t, terrain: c.kinds[i]!, ...(c.road.has(i) ? { road: true as const } : {}) })),
    terrain: { ...style, settlementCenter: c.settlementCenter },
  };
}

/** The classification a grid carries (`withTerrain`); null for a grid without terrain. */
export function gridClassification(grid: PlanetGrid): (TerrainConfig & TerrainClassification) | null {
  const t = grid.terrain;
  if (!t) return null;
  return {
    ...terrainConfigOf(t),
    kinds: grid.tiles.map((x) => x.terrain ?? biomeRules(t).ground),
    road: new Set(grid.tiles.filter((x) => x.road).map((x) => x.index)),
    settlementCenter: t.settlementCenter,
    rings: t.settlementCenter === null ? null : settlementRings(grid, t.settlementCenter),
  };
}
