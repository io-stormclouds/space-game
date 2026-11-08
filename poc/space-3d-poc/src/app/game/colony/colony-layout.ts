import { BodyId } from '../../shared/ids';
import { hash3 } from '../math/seeded-noise';
import { Vec3, normalize, vec3 } from '../math/vec3';
import { PlanetGrid, Tile, tileId } from '../models/planet-grid.model';
import { ResourceKind } from '../models/resource.model';
import { Structure, StructureKind } from '../models/structure.model';

/**
 * Showcase colony: a deterministic "developed planet" layout over a Goldberg grid.
 *
 * Pure data, no Three.js and no art style: it says WHAT stands on each tile (a building kind, small
 * props in the tile corners, corridors and pipelines between tiles). The engine maps each kind to a
 * model of the body's style (KayKit, Kenney or mixed), so three planets with the same grid get a
 * tile-for-tile identical layout and differ only in art — which is the point of the comparison.
 *
 * Only the landing pad and one solar panel are real game structures (like on the home planet: the
 * ship can land there). Everything else is dressing: no cost, no power, no extraction, and building
 * a real structure on a dressed tile clears the dressing (like deposit rocks).
 */

/** Building-sized dressing: the game's structure kinds plus purely visual ones. */
export type DressKind = StructureKind | 'COMMAND' | 'GARAGE' | 'COMMS' | 'DEFENSE' | 'FARM' | 'STORAGE' | 'LAUNCH';

/** Small props that sit in a tile corner (several can share a tile with a building). */
export type PropKind = 'CREW' | 'CARGO' | 'VEHICLE' | 'ANTENNA' | 'ROCKS' | 'CRATER' | 'BOULDER' | 'CRYSTALS';

export type LinkKind = 'CORRIDOR' | 'PIPE';

export interface PropPlacement {
  kind: PropKind;
  /** Which tile vertex the prop leans towards; `radial` 0 = tile centre, 1 = at that vertex. */
  corner: number;
  radial: number;
  /** Rotation about the surface normal, radians. */
  yaw: number;
  /** Multiplier on the prop's fitted size. */
  scale: number;
}

export interface ColonyTile {
  tileIndex: number;
  /** BFS distance from the colony centre, in tiles. */
  ring: number;
  building: DressKind | null;
  /** True when `building` is a real game structure (in `realStructures`), not dressing. */
  real: boolean;
  props: PropPlacement[];
}

/** Connection between two neighbouring tiles. */
export interface ColonyLink {
  a: number;
  b: number;
  kind: LinkKind;
}

export interface ColonyLayout {
  bodyId: BodyId;
  centerTile: number;
  /** Only tiles with something on them, by tile index. */
  tiles: ReadonlyMap<number, ColonyTile>;
  links: ReadonlyArray<ColonyLink>;
  /** Game structures (landing pad, solar panel) that belong in the initial world. */
  realStructures: ReadonlyArray<Structure>;
}

export const DRESS_INFO: Record<Exclude<DressKind, StructureKind>, { name: string; description: string }> = {
  COMMAND: { name: 'Centrum dowodzenia', description: 'Serce kolonii: sterownia i łączność z orbitą.' },
  GARAGE: { name: 'Hangar pojazdów', description: 'Garaż łazików i warsztat.' },
  COMMS: { name: 'Antena łączności', description: 'Łącze z Planetą Matką.' },
  DEFENSE: { name: 'Wieżyczka obronna', description: 'Obrona obwodu kolonii.' },
  FARM: { name: 'Farma', description: 'Uprawy pod kopułą.' },
  STORAGE: { name: 'Składowisko', description: 'Kontenery i beczki z zapasami.' },
  LAUNCH: { name: 'Wyrzutnia', description: 'Rakieta towarowa na stanowisku startowym.' },
};

const EXTRACTOR_FOR: Record<ResourceKind, StructureKind> = { FERRITE: 'MINE', CRYOL: 'ICE_EXTRACTOR', SILICITE: 'SILICITE_EXTRACTOR' };

/** Buildings linked by corridors into one walkable base. */
const CORE: ReadonlySet<DressKind> = new Set<DressKind>(['LANDING_PAD', 'COMMAND', 'HABITAT', 'DEPOT', 'GARAGE', 'STORAGE', 'FARM']);
const EXTRACTORS: ReadonlySet<DressKind> = new Set<DressKind>(['MINE', 'ICE_EXTRACTOR', 'SILICITE_EXTRACTOR']);

/** Ring programme, in azimuth order around the centre. */
const RING_1: ReadonlyArray<DressKind> = ['COMMAND', 'HABITAT', 'DEPOT', 'HABITAT', 'SOLAR', 'GARAGE'];
const RING_2: ReadonlyArray<DressKind> = [
  'HABITAT', 'STORAGE', 'HABITAT', 'FARM', 'DEPOT', 'COMMS', 'HABITAT', 'STORAGE', 'HABITAT', 'LAUNCH', 'DEPOT', 'FARM',
];
/** Ring 3: first half is the power belt, second half a mixed outer district. */
const RING_3_POWER: ReadonlyArray<DressKind> = ['SOLAR', 'WIND', 'SOLAR'];
const RING_3_OUTER: ReadonlyArray<DressKind> = ['FARM', 'STORAGE', 'DEFENSE', 'HABITAT', 'STORAGE', 'GARAGE'];

/** Industry reaches this far from the centre (deposits further out stay untouched). */
const INDUSTRY_RINGS = 6;
/** Perimeter turrets. */
const DEFENSE_RING = 5;

/**
 * Tile to centre a colony on: the hexagon whose normal is closest to `towards` (body-local frame).
 * Pentagons are skipped so the landing pad and the first ring always have six neighbours.
 */
export function colonyCenter(grid: PlanetGrid, towards: Vec3): Tile {
  const d = normalize(vec3(), towards);
  let best = grid.tiles[0];
  let bestDot = -Infinity;
  for (const t of grid.tiles) {
    if (t.kind !== 'HEX') continue;
    const dot = t.normal.x * d.x + t.normal.y * d.y + t.normal.z * d.z;
    if (dot > bestDot) {
      bestDot = dot;
      best = t;
    }
  }
  return best;
}

/** BFS ring of every tile from `start`. */
export function tileRings(grid: PlanetGrid, start: number): Int32Array {
  const ring = new Int32Array(grid.tiles.length).fill(-1);
  ring[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const n of grid.tiles[i].neighbors) {
      if (ring[n] >= 0) continue;
      ring[n] = ring[i] + 1;
      queue.push(n);
    }
  }
  return ring;
}

export function planColony(grid: PlanetGrid, centerIndex: number, seed = 1): ColonyLayout {
  const tiles = grid.tiles;
  const center = tiles[centerIndex];
  const ring = tileRings(grid, centerIndex);
  const azimuth = azimuths(grid, center);
  const rnd = (i: number, salt: number) => hash3(seed, i, salt, 7);

  const out = new Map<number, ColonyTile>();
  const put = (index: number, building: DressKind | null, real = false): ColonyTile => {
    const t: ColonyTile = { tileIndex: index, ring: ring[index], building, real, props: [] };
    out.set(index, t);
    return t;
  };
  const byRing = (r: number) =>
    tiles.filter((t) => ring[t.index] === r).sort((a, b) => azimuth[a.index] - azimuth[b.index]);

  // 0: spaceport
  put(centerIndex, 'LANDING_PAD', true);

  // 1–3: base districts; a deposit tile always gets its extractor instead
  const program: Array<[number, (k: number, n: number) => DressKind | null]> = [
    [1, (k) => RING_1[k % RING_1.length]],
    [2, (k) => RING_2[k % RING_2.length]],
    [3, (k, n) => (k < n / 2 ? RING_3_POWER[k % RING_3_POWER.length] : RING_3_OUTER[(k - Math.ceil(n / 2)) % RING_3_OUTER.length])],
  ];
  let solarReal = false;
  for (const [r, pick] of program) {
    const ringTiles = byRing(r);
    ringTiles.forEach((t, k) => {
      if (t.deposit) return void put(t.index, EXTRACTOR_FOR[t.deposit.resource]);
      const kind = pick(k, ringTiles.length);
      const real = kind === 'SOLAR' && r === 1 && !solarReal;
      if (real) solarReal = true;
      put(t.index, kind, real);
    });
  }

  // 4..6: industry on every deposit, perimeter turrets on ring 5
  for (const t of tiles) {
    const r = ring[t.index];
    if (r < 4 || r > INDUSTRY_RINGS) continue;
    if (t.deposit) put(t.index, EXTRACTOR_FOR[t.deposit.resource]);
  }
  byRing(DEFENSE_RING).forEach((t, k) => {
    if (!out.has(t.index) && k % 5 === 0) put(t.index, 'DEFENSE');
  });
  byRing(4).forEach((t, k) => {
    if (!out.has(t.index) && k % 8 === 3) put(t.index, 'COMMS');
  });

  // accents in the corners of building tiles
  for (const ct of out.values()) {
    const n = tiles[ct.tileIndex].vertices.length;
    const corner = Math.floor(rnd(ct.tileIndex, 1) * n);
    const yaw = rnd(ct.tileIndex, 2) * Math.PI * 2;
    const accent = accentFor(ct.building);
    if (accent && rnd(ct.tileIndex, 3) < accent.chance) {
      ct.props.push({ kind: accent.kind, corner, radial: 0.78, yaw, scale: 1 });
      if (accent.kind === 'CARGO' && rnd(ct.tileIndex, 4) < 0.5) {
        ct.props.push({ kind: 'CARGO', corner: (corner + 3) % n, radial: 0.78, yaw: yaw + 1.3, scale: 0.85 });
      }
    }
  }

  // life between the buildings: crews, cargo and vehicles on free tiles near the base
  for (const t of tiles) {
    const r = ring[t.index];
    if (r < 1 || r > 4 || out.has(t.index) || t.deposit) continue;
    if (rnd(t.index, 5) > 0.45) continue;
    const kinds: PropKind[] = ['CREW', 'CARGO', 'VEHICLE', 'CARGO'];
    const ct = put(t.index, null);
    const count = 1 + Math.floor(rnd(t.index, 6) * 2);
    for (let i = 0; i < count; i++) {
      ct.props.push({
        kind: kinds[Math.floor(rnd(t.index, 10 + i) * kinds.length)],
        corner: Math.floor(rnd(t.index, 20 + i) * t.vertices.length),
        radial: 0.15 + rnd(t.index, 30 + i) * 0.5,
        yaw: rnd(t.index, 40 + i) * Math.PI * 2,
        scale: 1,
      });
    }
  }

  // wilderness: scattered rocks, craters and crystals over the rest of the planet
  for (const t of tiles) {
    if (ring[t.index] < 3 || out.has(t.index) || t.deposit) continue;
    const roll = rnd(t.index, 50);
    if (roll > 0.16) continue;
    const kind: PropKind = roll < 0.06 ? 'ROCKS' : roll < 0.1 ? 'CRATER' : roll < 0.14 ? 'BOULDER' : 'CRYSTALS';
    put(t.index, null).props.push({
      kind,
      corner: Math.floor(rnd(t.index, 51) * t.vertices.length),
      radial: rnd(t.index, 52) * 0.35,
      yaw: rnd(t.index, 53) * Math.PI * 2,
      scale: 0.8 + rnd(t.index, 54) * 0.6,
    });
  }

  const links = planLinks(grid, ring, azimuth, out);

  const realStructures: Structure[] = [];
  for (const ct of out.values()) {
    if (!ct.real || !ct.building) continue;
    const id = tileId(grid.bodyId, ct.tileIndex);
    realStructures.push({ id: `${ct.building}@${id}`, kind: ct.building as StructureKind, bodyId: grid.bodyId, tileId: id, builtAt: 0 });
  }
  // the pad first, so `landingPadTile` and ordering match the home planet
  realStructures.sort((a, b) => (a.kind === 'LANDING_PAD' ? -1 : b.kind === 'LANDING_PAD' ? 1 : 0));

  return { bodyId: grid.bodyId, centerTile: centerIndex, tiles: out, links, realStructures };
}

/**
 * Corridors: a spanning tree over the core buildings, each linked to one core neighbour one ring
 * closer to the centre (radial streets, no mesh of every adjacent pair). Pipelines: every extractor
 * runs a pipe tile by tile towards the centre until it meets a building.
 */
function planLinks(grid: PlanetGrid, ring: Int32Array, azimuth: Float64Array, out: Map<number, ColonyTile>): ColonyLink[] {
  const links: ColonyLink[] = [];
  const isCore = (i: number) => {
    const b = out.get(i)?.building;
    return !!b && CORE.has(b);
  };
  const towardsCentre = (i: number, filter: (n: number) => boolean): number | null => {
    let best: number | null = null;
    let bestDiff = Infinity;
    for (const n of grid.tiles[i].neighbors) {
      if (ring[n] !== ring[i] - 1 || !filter(n)) continue;
      const diff = Math.abs(angleDiff(azimuth[n], azimuth[i]));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = n;
      }
    }
    return best;
  };

  for (const ct of out.values()) {
    if (ct.ring === 0 || !isCore(ct.tileIndex)) continue;
    const parent = towardsCentre(ct.tileIndex, isCore);
    if (parent !== null) links.push({ a: parent, b: ct.tileIndex, kind: 'CORRIDOR' });
  }

  const piped = new Set<string>();
  for (const ct of out.values()) {
    if (!ct.building || !EXTRACTORS.has(ct.building)) continue;
    let cur = ct.tileIndex;
    while (ring[cur] > 0) {
      const next = towardsCentre(cur, () => true);
      if (next === null) break;
      const key = cur < next ? `${cur}-${next}` : `${next}-${cur}`;
      if (piped.has(key)) break; // joined an existing pipeline
      piped.add(key);
      links.push({ a: next, b: cur, kind: 'PIPE' });
      const b = out.get(next)?.building;
      if (b && !EXTRACTORS.has(b)) break; // reached a building
      cur = next;
    }
  }
  return links;
}

function accentFor(kind: DressKind | null): { kind: PropKind; chance: number } | null {
  switch (kind) {
    case 'HABITAT':
      return { kind: 'CREW', chance: 0.6 };
    case 'DEPOT':
    case 'STORAGE':
    case 'LANDING_PAD':
      return { kind: 'CARGO', chance: 0.9 };
    case 'GARAGE':
      return { kind: 'VEHICLE', chance: 1 };
    case 'COMMAND':
      return { kind: 'ANTENNA', chance: 1 };
    case 'MINE':
    case 'ICE_EXTRACTOR':
    case 'SILICITE_EXTRACTOR':
      return { kind: 'CARGO', chance: 0.4 };
    default:
      return null;
  }
}

/** Azimuth of every tile around the centre, measured in the centre's tangent plane. */
function azimuths(grid: PlanetGrid, center: Tile): Float64Array {
  const n = center.normal;
  const ref = Math.abs(n.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalize(vec3(), vec3(ref.y * n.z - ref.z * n.y, ref.z * n.x - ref.x * n.z, ref.x * n.y - ref.y * n.x));
  const v = vec3(n.y * u.z - n.z * u.y, n.z * u.x - n.x * u.z, n.x * u.y - n.y * u.x);
  const out = new Float64Array(grid.tiles.length);
  for (const t of grid.tiles) {
    const p = t.normal;
    out[t.index] = Math.atan2(p.x * v.x + p.y * v.y + p.z * v.z, p.x * u.x + p.y * u.y + p.z * u.z);
  }
  return out;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
