import {
  POC_SCENARIO,
  Simulation,
  TAU_CETI_SCENARIO,
  TC_C,
  TC_E,
  dressTerrain,
  footprintTiles,
  shipId as toShipId,
  roverId as toRoverId,
  standingStructure,
  tileBuildable,
  tileIndexOf,
  type BodyId,
  type Economy,
  type Rover,
  type Scenario,
  type Spacecraft,
  type Structure,
  type WorldState,
} from '@space-game/domain';
import { Rng } from './rng';

// Load scenarios of F5 (plan, section "Wydajność"):
// S — like the PoC: the home planet with moon and asteroid, about 20 buildings, 1 ship, 1 rover;
// M — a late colony: 7 bodies, a few hundred buildings, a few dozen ships and vehicles, 41 stars, market;
// L — overload: 2000 buildings, 200 ships.
// MT — M with the colony moved to the medieval Tau Ceti c (T4: terrain, ruins and the player's
//      medieval buildings in one view): the M world unchanged plus a colony beside the ruins.
// Generated deterministically from a seed, so every run measures the same world.

export type LoadLevel = 'S' | 'M' | 'L' | 'MT';

export interface LoadSpec {
  base: Scenario;
  /** Buildings spread over the bodies (the terrain colony comes on top). */
  structures: number;
  ships: number;
  rovers: number;
  /** A colony beside the settlement ruins of this body; the colony site moves there (camera focus). */
  terrainColony?: { body: BodyId; buildings: number };
}

export const LOAD_SPECS: Readonly<Record<LoadLevel, LoadSpec>> = {
  S: { base: POC_SCENARIO, structures: 20, ships: 1, rovers: 1 },
  M: { base: TAU_CETI_SCENARIO, structures: 300, ships: 40, rovers: 20 },
  // "np. 2000 budowli": all grid bodies of Tau Ceti have 1870 tiles, about 1690 buildable since every body
  // has terrain (T5); 1400 (83 % of those) leaves rovers a way through (1500 filled Tau Ceti e to 60 %,
  // past the point where its free tiles still connect, and only a quarter of the rovers could drive).
  L: { base: TAU_CETI_SCENARIO, structures: 1400, ships: 200, rovers: 100 },
  MT: { base: TAU_CETI_SCENARIO, structures: 300, ships: 40, rovers: 20, terrainColony: { body: TC_C, buildings: 24 } },
};

/** Kinds of the terrain colony after its port, in turn; levels go round L1 / L3 / L5 (every look tier). */
const COLONY_KINDS = ['HAB', 'FARM', 'WND', 'DEP', 'SKL', 'TNK', 'GAR', 'HAB', 'SOL', 'FARM', 'LAND', 'HAB'];
const COLONY_LEVELS = [1, 3, 5];

/** One-tile kinds spread over the bodies; extractors go on deposits they can work. */
const FILLERS = ['SOL', 'HAB', 'DEP', 'SKL', 'WND', 'LAND'];

/**
 * Builds the world of a load level: the base scenario with the colony founded (Tau Ceti), then
 * standing buildings on free tiles of every revealed grid body, ships in flight between bodies
 * and rovers driving on the colony planet. Returns a Simulation ready to step.
 */
export function buildLoad(level: LoadLevel, economy: Economy, seed = 5150): Simulation {
  const spec = LOAD_SPECS[level];
  const sim = new Simulation(spec.base, { economy });
  const rng = new Rng(seed);
  let w: WorldState = sim.world;

  if (spec.base === TAU_CETI_SCENARIO) {
    // the canvas flow done: scanned, Tau Ceti e founded, with a port
    const grid = sim.grids.get(TC_E)!;
    const anchor = grid.tiles.find((t) => t.neighbors.length === 6 && !t.deposit)!;
    const port = standingStructure('HQ', TC_E, footprintTiles(grid, anchor.index, 3)!);
    w = {
      ...w,
      scan: { state: 'DONE', at: 0 },
      bodies: w.bodies.map((b) => ({ ...b, revealed: true, isHomeBase: b.id === TC_E })),
      colony: { siteBodyId: TC_E, foundedAt: 0 },
      structures: [port],
      storage: { [TC_E]: { FER: 1500, SIL: 1000, KRI: 800, STA: 600, BET: 400 } },
      ships: w.ships.map((s) => ({ ...s, currentBodyId: TC_E })),
    };
  }

  // buildings on free tiles, bodies in turn; never on terrain that cannot be built on (water, T8)
  const bodies = [...sim.grids.keys()];
  const used = new Set(w.structures.flatMap((s) => s.tiles));
  const terrain = sim.rules.terrain();
  const free = new Map<BodyId, number[]>(
    bodies.map((b) => [b, sim.grids.get(b)!.tiles.filter((t) => !used.has(t.id) && tileBuildable(t, terrain)).map((t) => t.index)]),
  );
  const structures: Structure[] = [...w.structures];
  for (let i = structures.length, guard = 0; i < spec.structures && guard < spec.structures * 4; guard++) {
    const body = bodies[rng.int(bodies.length)]!;
    const list = free.get(body)!;
    if (!list.length) continue;
    const index = list.splice(rng.int(list.length), 1)[0]!;
    const tile = sim.grids.get(body)!.tiles[index]!;
    const kind = tile.deposit ? extractorFor(tile.deposit.resource) : FILLERS[rng.int(FILLERS.length)]!;
    const s = standingStructure(kind, body, [index]);
    if (structures.some((x) => x.id === s.id)) continue;
    structures.push(s);
    i++;
  }
  // MT: the colony beside the ruins (no random draws: the rest of the world stays the M world)
  if (spec.terrainColony) {
    const { body, buildings } = spec.terrainColony;
    structures.push(...terrainColony(sim, body, buildings, structures));
    w = { ...w, colony: { ...w.colony, siteBodyId: body } };
  }

  // ships: copies of a transport, fuel for any hop; ordered to fly after the world is set
  const bodyIds = w.bodies.filter((b) => b.kind !== 'STAR').map((b) => b.id);
  const ships: Spacecraft[] = [...w.ships];
  const transports = ships.filter((s) => s.role === 'SHIP').length;
  for (let i = transports; i < spec.ships; i++) {
    ships.push({
      id: toShipId(`load-ship-${i}`),
      name: `Frachtowiec-${i}`,
      role: 'SHIP',
      fuel: 10_000,
      maxFuel: 10_000,
      cargo: {},
      maxCargo: 400,
      state: 'DOCKED',
      currentBodyId: bodyIds[rng.int(bodyIds.length)]!,
      targetBodyId: null,
      transfer: null,
    });
  }

  // rovers on the colony planet (or the PoC home planet)
  const home = (spec.base === TAU_CETI_SCENARIO ? TC_E : bodies[0]) as BodyId;
  const homeFree = free.get(home)!; // tiles left without buildings: rovers start and drive there
  const pickFree = () => homeFree[rng.int(homeFree.length)]!;
  const rovers: Rover[] = [...w.rovers];
  for (let i = rovers.length; i < spec.rovers; i++) {
    rovers.push({ id: toRoverId(`load-rover-${i}`), name: `Łazik L-${i}`, bodyId: home, tileIndex: pickFree(), state: 'IDLE', path: [], job: null });
  }

  sim.load({ ...w, structures, ships, rovers, nextId: 10_000 });

  // set everything in motion: ships fly to another body, rovers drive somewhere
  for (const s of sim.world.ships) {
    if (s.role !== 'SHIP') continue;
    const to = bodyIds.filter((b) => b !== s.currentBodyId)[rng.int(bodyIds.length - 1)]!;
    sim.dispatch({ type: 'MOVE_SHIP', shipId: s.id, to });
  }
  for (const r of sim.world.rovers) {
    sim.dispatch({ type: 'MOVE_ROVER', roverId: r.id, tileIndex: pickFree() });
  }
  return sim;
}

/**
 * A colony beside the settlement ruins of a terrain body: the port on the first free 3-tile footprint
 * nearest the settlement centre, then one-tile buildings on the nearest free tiles (extractors on
 * deposits), never on a tile with a ruin building, a structure or unbuildable terrain. Deterministic.
 */
export function terrainColony(sim: Simulation, body: BodyId, count: number, existing: ReadonlyArray<Structure>): Structure[] {
  const grid = sim.grids.get(body);
  if (!grid?.terrain) throw new Error(`terrainColony: ${body} has no terrain`);
  const plan = dressTerrain(grid);
  const rules = sim.rules.terrain();
  const ruins = new Set(plan.decor.filter((d) => !d.model.startsWith('detail_') && d.model !== 'mountain').map((d) => d.tile));
  const used = new Set(existing.filter((s) => s.bodyId === body).flatMap((s) => s.tiles.map(tileIndexOf)));
  const ok = (i: number) => !used.has(i) && !ruins.has(i) && tileBuildable(grid.tiles[i]!, rules);
  // tiles by ring around the centre (breadth-first over neighbours: deterministic)
  const start = plan.settlementCenter ?? 0;
  const order = [start];
  const seen = new Set(order);
  for (let k = 0; k < order.length; k++) {
    for (const n of grid.tiles[order[k]!]!.neighbors) {
      if (seen.has(n)) continue;
      seen.add(n);
      order.push(n);
    }
  }
  const out: Structure[] = [];
  const take = (s: Structure) => {
    out.push(s);
    for (const t of s.tiles) used.add(tileIndexOf(t));
  };
  for (const a of order) {
    const fp = footprintTiles(grid, a, 3);
    if (fp && fp.every((i) => ok(i) && !grid.tiles[i]!.deposit)) {
      take(standingStructure('HQ', body, fp));
      break;
    }
  }
  let k = 0;
  for (const i of order) {
    if (out.length >= count) break;
    if (!ok(i)) continue;
    const t = grid.tiles[i]!;
    const kind = t.deposit ? extractorFor(t.deposit.resource) : COLONY_KINDS[k % COLONY_KINDS.length]!;
    take(standingStructure(kind, body, [i], COLONY_LEVELS[k % COLONY_LEVELS.length]));
    k++;
  }
  return out;
}

function extractorFor(material: string): string {
  if (material === 'KRI') return 'ICE';
  if (material === 'SIL') return 'SIT';
  return 'MIN';
}
