import {
  Simulation,
  TAU_CETI_SCENARIO,
  TC_E,
  findFreeFootprint,
  roverId as toRoverId,
  standingStructure,
  type Economy,
  type Rover,
  type Structure,
  type WorldState,
} from '@space-game/domain';

// Scenario "fabryka" (AT1, A16): a late colony on Tau Ceti e with a Fabryka atanorowa L1, so the
// building view of the Atanor can be opened from the planet. The factory is an era 3 building and
// the playable catalogue ends at era 1 (W07 B), so the scenario places it, like the F5 load worlds.

/** Storage at t = 0: recipe inputs of A_NAD / A_KAT and the materials of a machine (§8.2). */
export const FACTORY_STORAGE: Readonly<Record<string, number>> = {
  MIE: 120,
  PLA: 30,
  H2: 600,
  KRZ: 40,
  STA: 200,
  SLN: 20,
  PRZ: 60,
  UKL: 20,
  STP: 10,
  NAD: 2,
  FER: 400,
  SIL: 200,
  KRI: 100,
  BET: 100,
};

/** Builds the "fabryka" world on top of Tau Ceti (scanned, Tau Ceti e founded). */
export function buildFactory(economy: Economy): Simulation {
  const sim = new Simulation(TAU_CETI_SCENARIO, { economy });
  const grid = sim.grids.get(TC_E)!;
  const taken = new Set<number>();
  const place = (kind: string, size: number, level = 1, minRing = 0): Structure => {
    const tiles = findFreeFootprint(grid, size, taken, minRing);
    if (!tiles) throw new Error(`fabryka: no place for ${kind}`);
    for (const t of tiles) for (const n of [t, ...grid.tiles[t]!.neighbors]) taken.add(n); // a free ring between buildings
    return standingStructure(kind, TC_E, tiles, level);
  };

  const hq = place('HQ', 3, 3);
  const atn: Structure = { ...place('ATN', 7, 1, 2), recipe: 'A_NAD', batch: null };
  const structures: Structure[] = [
    hq,
    atn,
    place('WND', 1),
    place('WND', 1),
    place('SOL', 1),
    place('SOL', 1),
    place('HAB', 1),
    place('GAS', 1),
    place('CRY', 1),
  ];

  // two rovers on free tiles next to the port
  const used = new Set(structures.flatMap((s) => s.tiles));
  const near = grid.tiles.filter((t) => !used.has(t.id)).sort((a, b) => b.normal.y - a.normal.y);
  const rovers: Rover[] = [0, 1].map((i) => ({
    id: toRoverId(`fabryka-rover-${i + 1}`),
    name: `Łazik F-${i + 1}`,
    bodyId: TC_E,
    tileIndex: near[i]!.index,
    state: 'IDLE',
    path: [],
    job: null,
  }));

  const w: WorldState = sim.world;
  sim.load({
    ...w,
    scan: { state: 'DONE', at: 0 },
    bodies: w.bodies.map((b) => ({ ...b, revealed: true, isHomeBase: b.id === TC_E })),
    colony: { siteBodyId: TC_E, foundedAt: 0 },
    structures,
    rovers,
    storage: { [TC_E]: { ...FACTORY_STORAGE } },
    ships: w.ships.map((s) => ({ ...s, currentBodyId: TC_E })),
    nextId: 1000,
  });
  return sim;
}
