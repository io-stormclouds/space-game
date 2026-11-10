import { roverId } from '../../shared/ids';
import { TERRAIN_RULES } from '../../economy/terrain-data';
import { MOON_ID, PLANET_ID } from '../config/initial-world';
import { POC_RULES, WORLD_GRIDS, createInitialWorld } from '../config/world';
import { footprintTiles } from '../math/footprint';
import { DomainEvent, REJECT_CODES } from '../models/domain-event.model';
import { PlanetGrid, Tile, tileId } from '../models/planet-grid.model';
import { Stockpile, scaleStock } from '../models/resource.model';
import { Structure } from '../models/structure.model';
import { WorldState, reduce, storageOf } from '../reducer';
import { findFreeFootprint, standingStructure } from '../scenario';
import { ARK_ID, TAU_CETI_SCENARIO, TC_C } from '../scenarios/tau-ceti';
import { Simulation } from '../simulation';
import { BuildSystem, CANCEL_REFUND, DEMOLISH_REFUND } from '../systems/build-system';
import { ConstructionSystem } from '../systems/construction-system';
import { scaleCost, siteTerrain, tileBuildable, tileTerrain } from './terrain-rules';

/*
 * T8: terrain changes building on Tau Ceti c (docs/planet-terrain-poc-wnioski-i-plan.md §9.1–9.2, T-15–T-17):
 * water cannot be built on (BAD_TERRAIN), forest / rock / snow raise cost and time, settlement roads lower
 * them; the footprint takes the maximum per tile, cost and time separately. Bodies without terrain keep
 * the catalog numbers exactly.
 */

const sim = new Simulation(TAU_CETI_SCENARIO);
const rules = sim.rules;
const builder = sim.builder;
const grid = sim.grids.get(TC_C)!;

/** Port (HQ L1, standing) on the first free buildable footprint: power 5 MW, living space 5. */
const HQ = standingStructure('HQ', TC_C, findFreeFootprint(grid, 3, new Set())!);
const hqTiles = new Set(HQ.tiles);
const RICH: Stockpile = { FER: 1000, SIL: 1000, KRI: 500 };

/** Tau Ceti c as a founded colony: scanned, port standing, one rover, a full storage. */
function colony(storage: Stockpile = RICH, structures: Structure[] = [HQ]): WorldState {
  const w = sim.world;
  return {
    ...w,
    scan: { state: 'DONE', at: 0 },
    colony: { siteBodyId: TC_C, foundedAt: 0 },
    bodies: w.bodies.map((b) => ({ ...b, revealed: true })),
    structures,
    storage: { [TC_C]: storage },
    rovers: [{ id: roverId('r-1'), name: 'Łazik R-1', bodyId: TC_C, tileIndex: Number(HQ.tiles[0]!.split(':')[1]), state: 'IDLE', path: [], job: null }],
  };
}

const free = (t: Tile): boolean => t.kind === 'HEX' && !t.deposit && !hqTiles.has(t.id);
const tileOf = (pred: (t: Tile) => boolean): Tile => {
  const t = grid.tiles.find((x) => free(x) && pred(x));
  if (!t) throw new Error('no such tile on Tau Ceti c');
  return t;
};
const WATER = tileOf((t) => t.terrain === 'water');
const GRASS = tileOf((t) => t.terrain === 'grass' && !t.road);
const FOREST = tileOf((t) => t.terrain === 'forest');
const ROCK = tileOf((t) => t.terrain === 'rock');
const SNOW = tileOf((t) => t.terrain === 'snow');
const ROAD = tileOf((t) => t.road === true);

const ordered = (e: DomainEvent): Structure => {
  expect(e.type).toBe('CONSTRUCTION_ORDERED');
  return (e as Extract<DomainEvent, { type: 'CONSTRUCTION_ORDERED' }>).structure;
};

/** First (anchor, rotation) whose 3-tile footprint is free and passes `pred`. */
function footprint(g: PlanetGrid, pred: (tiles: number[]) => boolean): { anchor: number; rotation: number; tiles: number[] } {
  for (const t of g.tiles) {
    if (!free(t)) continue;
    for (let r = 0; r < t.neighbors.length; r++) {
      const tiles = footprintTiles(g, t.index, 3, r);
      if (tiles && tiles.every((i) => free(g.tiles[i]!)) && pred(tiles)) return { anchor: t.index, rotation: r, tiles };
    }
  }
  throw new Error('no such footprint');
}

describe('terrain rules data (T-15)', () => {
  it('has the agreed table, water not buildable, roads cheaper and faster', () => {
    expect(TERRAIN_RULES).toEqual({
      kinds: {
        grass: { name: 'trawa', buildable: true, costPct: 100, timePct: 100 },
        forest: { name: 'las', buildable: true, costPct: 110, timePct: 150 },
        rock: { name: 'skała', buildable: true, costPct: 140, timePct: 125 },
        snow: { name: 'śnieg', buildable: true, costPct: 120, timePct: 140 },
        water: { name: 'woda', buildable: false, costPct: 100, timePct: 100 },
      },
      road: { name: 'droga', costPct: 85, timePct: 75 },
    });
    expect(rules.terrain()).toBe(TERRAIN_RULES);
    expect(REJECT_CODES[REJECT_CODES.length - 1]).toBe('BAD_TERRAIN');
  });

  it('scaleCost rounds every material up: SIL 10 → 11 forest, 14 rock, 12 snow, 9 road', () => {
    expect([110, 140, 120, 85, 100].map((p) => scaleCost({ SIL: 10 }, p))).toEqual([{ SIL: 11 }, { SIL: 14 }, { SIL: 12 }, { SIL: 9 }, { SIL: 10 }]);
    expect(scaleCost({ STA: 120, BET: 80, UKL: 10 }, 85)).toEqual({ STA: 102, BET: 68, UKL: 9 });
  });

  it('siteTerrain: road numbers on a road, class numbers otherwise, maximum per footprint, cost and time separately', () => {
    const at = (...tiles: Tile[]) => siteTerrain(grid, tiles.map((t) => t.index), TERRAIN_RULES);
    expect(at(GRASS)).toEqual({ buildable: true, costPct: 100, timePct: 100 });
    expect(at(ROAD)).toEqual({ buildable: true, costPct: 85, timePct: 75 });
    expect(at(ROAD, FOREST)).toEqual({ buildable: true, costPct: 110, timePct: 150 });
    expect(at(ROCK, SNOW)).toEqual({ buildable: true, costPct: 140, timePct: 140 });
    expect(at(GRASS, WATER)).toMatchObject({ buildable: false, badKind: 'water' });
    // tiles without terrain count 100 %
    const plain = WORLD_GRIDS.get(PLANET_ID)!;
    expect(siteTerrain(plain, [0, 1, 2])).toEqual({ buildable: true, costPct: 100, timePct: 100 });
    expect(plain.tiles.every((t) => tileBuildable(t) && tileTerrain(t) === null)).toBe(true);
  });

  it('tileTerrain names the road on a road tile and gives the tile its own numbers', () => {
    expect(tileTerrain(ROAD)).toEqual({ kind: 'grass', name: 'droga', road: true, buildable: true, costPct: 85, timePct: 75 });
    expect(tileTerrain(FOREST)).toEqual({ kind: 'forest', name: 'las', road: false, buildable: true, costPct: 110, timePct: 150 });
    expect(tileTerrain(WATER)).toMatchObject({ kind: 'water', name: 'woda', buildable: false });
  });
});

describe('building on Tau Ceti c terrain (T8)', () => {
  it('rejects water with BAD_TERRAIN naming the class, after TILE_OCCUPIED and before NO_DEPOSIT / NO_RESOURCES', () => {
    expect(builder.build(colony(), TC_C, WATER.id, 'SOL', 0)).toEqual({ type: 'COMMAND_REJECTED', reason: 'BAD_TERRAIN', detail: 'woda' });
    expect(builder.check(colony(), TC_C, WATER.id, 'MIN')).toEqual({ ok: false, reason: 'BAD_TERRAIN', detail: 'woda' }); // not NO_DEPOSIT
    expect(builder.check(colony({}), TC_C, WATER.id, 'HAB')).toMatchObject({ reason: 'BAD_TERRAIN' }); // not NO_RESOURCES
    const onWater = standingStructure('SOL', TC_C, [WATER.index]);
    expect(builder.check(colony(RICH, [HQ, onWater]), TC_C, WATER.id, 'HAB')).toMatchObject({ reason: 'TILE_OCCUPIED' });
  });

  it('rejects a footprint with any water tile, also when the anchor is dry', () => {
    const fp = footprint(grid, (tiles) => grid.tiles[tiles[0]!]!.terrain !== 'water' && tiles.some((i) => grid.tiles[i]!.terrain === 'water'));
    expect(builder.check(colony(), TC_C, tileId(TC_C, fp.anchor), 'SMT', fp.rotation)).toEqual({ ok: false, reason: 'BAD_TERRAIN', detail: 'woda' });
  });

  it('scales the cost per table and stores the time % only when it is not 100', () => {
    const cases: Array<[Tile, Stockpile, number | undefined]> = [
      [GRASS, { FER: 20, SIL: 10 }, undefined],
      [FOREST, { FER: 22, SIL: 11 }, 150],
      [ROCK, { FER: 28, SIL: 14 }, 125],
      [SNOW, { FER: 24, SIL: 12 }, 140],
      [ROAD, { FER: 17, SIL: 9 }, 75],
    ];
    for (const [tile, cost, timePct] of cases) {
      const w = colony();
      const e = builder.build(w, TC_C, tile.id, 'HAB', 5);
      const site = ordered(e);
      expect(e, tile.terrain).toMatchObject({ cost });
      expect(site.paid).toEqual(cost);
      expect(site.timePct).toBe(timePct);
      expect('timePct' in site).toBe(timePct !== undefined);
      // key order of the world JSON: timePct between builtAt and recipe
      const keys = Object.keys(site);
      if (timePct !== undefined) expect(keys.slice(keys.indexOf('builtAt'), keys.indexOf('builtAt') + 2)).toEqual(['builtAt', 'timePct']);
      const after = reduce(w, e);
      expect(storageOf(after, TC_C)).toEqual({ FER: 1000 - cost['FER']!, SIL: 1000 - cost['SIL']!, KRI: 500 });
    }
    expect(ordered(builder.build(colony(), TC_C, ROCK.id, 'SOL', 0)).paid).toEqual({ SIL: 14 });
  });

  it('puts the recipe after timePct for producers (key order)', () => {
    const fp = footprint(grid, (tiles) => tiles.every((i) => grid.tiles[i]!.terrain === 'forest' || grid.tiles[i]!.terrain === 'grass') && tiles.some((i) => grid.tiles[i]!.terrain === 'forest'));
    // crew and power for a Huta (4 crew, 6 MW): a habitat and two solar panels next to the port
    const spare = grid.tiles.filter((t) => free(t) && t.terrain === 'grass' && !fp.tiles.includes(t.index)).slice(0, 3);
    const w = colony(RICH, [HQ, standingStructure('HAB', TC_C, [spare[0]!.index]), standingStructure('SOL', TC_C, [spare[1]!.index]), standingStructure('SOL', TC_C, [spare[2]!.index])]);
    const site = ordered(builder.build(w, TC_C, tileId(TC_C, fp.anchor), 'SMT', 0, fp.rotation));
    expect(site.paid).toEqual({ FER: 176, SIL: 88 });
    expect(Object.keys(site).slice(-4)).toEqual(['builtAt', 'timePct', 'recipe', 'batch']);
  });

  it('carries the terrain cost on rejections after the terrain stage (the placement ghost shows the price)', () => {
    expect(builder.check(colony(), TC_C, FOREST.id, 'MIN')).toEqual({ ok: false, reason: 'NO_DEPOSIT', detail: 'wymaga złoża: Ferryt, Karbonit, Kupryt, Tytanit, Uranit', cost: { FER: 17 }, timePct: 150 });
    expect(builder.check(colony(), TC_C, ROCK.id, 'WND')).toEqual({ ok: false, reason: 'NO_ATMOSPHERE', cost: { FER: 21, SIL: 14 }, timePct: 125 });
    expect(builder.check(colony(), TC_C, ROAD.id, 'SOL')).toEqual({ ok: true, tiles: [ROAD.id], cost: { SIL: 9 }, timePct: 75 });
  });

  it('checks materials on the adjusted cost, and before power', () => {
    const base = { FER: 20, SIL: 10 };
    // exactly the catalog cost in storage: enough on grass, short on rock
    expect(builder.check(colony(base), TC_C, GRASS.id, 'HAB')).toMatchObject({ ok: true });
    expect(builder.check(colony(base), TC_C, ROCK.id, 'HAB')).toMatchObject({ ok: false, reason: 'NO_RESOURCES', detail: 'brakuje FER 8 · SIL 4' });
    // no port: no power for a habitat (−2 MW); the adjusted cost is checked first
    expect(builder.check(colony(base, []), TC_C, GRASS.id, 'HAB')).toMatchObject({ reason: 'NO_POWER' });
    expect(builder.check(colony(base, []), TC_C, ROCK.id, 'HAB')).toMatchObject({ reason: 'NO_RESOURCES' });
    // menu availability without a tile keeps the catalog cost
    expect(builder.availability(colony(base), TC_C, 'HAB')).toEqual({ ok: true });
    expect(builder.availability(colony(base), TC_C, 'HAB', 1, { FER: 28, SIL: 14 })).toMatchObject({ reason: 'NO_RESOURCES' });
  });

  it('cancel returns 75 % of the adjusted cost paid; demolition 50 % of the catalog cost (T-17)', () => {
    const order = builder.build(colony(), TC_C, ROCK.id, 'HAB', 0);
    const site = ordered(order);
    const w = reduce(colony(), order);
    const cancel = builder.cancel(w, site.id);
    expect(cancel).toEqual({ type: 'CONSTRUCTION_CANCELLED', structureId: site.id, refund: scaleStock({ FER: 28, SIL: 14 }, CANCEL_REFUND) });
    expect(cancel).toMatchObject({ refund: { FER: 21, SIL: 10 } });

    const built: Structure = { ...standingStructure('HAB', TC_C, [ROCK.index]) };
    const demolish = builder.demolish(colony(RICH, [HQ, built]), built.id);
    expect(demolish).toEqual({ type: 'STRUCTURE_DEMOLISHED', structureId: built.id, refund: scaleStock({ FER: 20, SIL: 10 }, DEMOLISH_REFUND) });
    expect(demolish).toMatchObject({ refund: { FER: 10, SIL: 5 } });
  });

  it('builds a new building in catalog time × timePct and drops timePct when finished; upgrades take the catalog time', () => {
    const construction = new ConstructionSystem(rules, sim.rovers);
    const base = rules.spec('HAB', 1).buildTime; // 3 min
    const working = (s: Structure): WorldState => {
      const w = colony(RICH, [HQ, s]);
      return { ...w, rovers: [{ ...w.rovers[0]!, state: 'BUILDING', job: s.id }] };
    };
    const forest = { ...ordered(builder.build(colony(), TC_C, FOREST.id, 'HAB', 0)), state: 'CONSTRUCTING' as const };
    expect(forest.timePct).toBe(150);
    // after the catalog time it is two thirds done
    const part = construction.progress(working(forest), base);
    expect(part.events).toEqual([]);
    expect(part.world.structures.find((s) => s.id === forest.id)!.progress).toBeCloseTo(2 / 3, 12);
    // after 1.5 × the catalog time it is finished, without timePct
    const done = construction.progress(working(forest), (base * 150) / 100);
    expect(done.events).toHaveLength(1);
    const built = (done.events[0] as Extract<DomainEvent, { type: 'STRUCTURE_BUILT' }>).structure;
    expect(built).toMatchObject({ state: 'ACTIVE', level: 1, progress: 0, paid: {} });
    expect('timePct' in built).toBe(false);
    expect(done.events[0]).toMatchObject({ cost: { FER: 22, SIL: 11 } });

    // a road is faster: 0.75 × the catalog time
    const road = { ...ordered(builder.build(colony(), TC_C, ROAD.id, 'HAB', 0)), state: 'CONSTRUCTING' as const };
    expect(construction.progress(working(road), (base * 75) / 100).events.map((e) => e.type)).toEqual(['STRUCTURE_BUILT']);
    expect(construction.progress(working(road), (base * 75) / 100 - 1e-6).events).toEqual([]);

    // an upgrade ignores timePct (a level-0 rule only)
    const up: Structure = { ...standingStructure('HAB', TC_C, [FOREST.index]), state: 'UPGRADING', targetLevel: 2, timePct: 150 };
    const t2 = rules.spec('HAB', 2).buildTime;
    expect(construction.progress(working(up), t2).events).toEqual([{ type: 'STRUCTURE_UPGRADED', structureId: up.id, level: 2 }]);
  });
});

describe('spaceport on Tau Ceti c terrain (T8)', () => {
  /** Arka-1 on the orbit of Tau Ceti c, site chosen, nothing built. */
  const landing = (cargo?: Stockpile): WorldState => {
    const w = colony(RICH, []);
    return {
      ...w,
      colony: { siteBodyId: TC_C, foundedAt: null },
      rovers: [],
      ships: w.ships.map((s) => (s.id === ARK_ID ? { ...s, state: 'DOCKED', currentBodyId: TC_C, ...(cargo ? { cargo } : {}) } : s)),
    };
  };
  const PORT = { STA: 120, BET: 80, UKL: 10 };
  const classes = (tiles: number[]) => tiles.map((i) => grid.tiles[i]!.terrain);

  it('does not land on water (any of the three tiles)', () => {
    const fp = footprint(grid, (tiles) => tiles.some((i) => grid.tiles[i]!.terrain === 'water'));
    expect(sim.colony.placeSpaceport(landing(), TC_C, tileId(TC_C, fp.anchor), fp.rotation)).toEqual({ type: 'COMMAND_REJECTED', reason: 'BAD_TERRAIN', detail: 'woda' });
  });

  it('pays the port cost scaled by the footprint and builds it in scaled time', () => {
    const fp = footprint(grid, (tiles) => classes(tiles).includes('rock') && classes(tiles).every((k) => k !== 'water'));
    const e = sim.colony.placeSpaceport(landing(), TC_C, tileId(TC_C, fp.anchor), fp.rotation);
    expect(e.type).toBe('SPACEPORT_PLACED');
    const placed = e as Extract<DomainEvent, { type: 'SPACEPORT_PLACED' }>;
    const pct = siteTerrain(grid, fp.tiles);
    expect(pct.costPct).toBe(140);
    expect(placed.cost).toEqual({ STA: 168, BET: 112, UKL: 14 });
    expect(placed.structure.paid).toEqual(placed.cost);
    expect(placed.structure.timePct).toBe(pct.timePct);
    // the hold must carry the scaled cost
    expect(sim.colony.placeSpaceport(landing(PORT), TC_C, tileId(TC_C, fp.anchor), fp.rotation)).toEqual({
      type: 'COMMAND_REJECTED',
      reason: 'NO_RESOURCES',
      detail: 'brakuje STA 48 · BET 32 · UKL 4',
    });
  });

  it('on plain grass costs exactly the canvas numbers and stores no timePct', () => {
    const fp = footprint(grid, (tiles) => tiles.every((i) => grid.tiles[i]!.terrain === 'grass' && !grid.tiles[i]!.road));
    const e = sim.colony.placeSpaceport(landing(PORT), TC_C, tileId(TC_C, fp.anchor), fp.rotation) as Extract<DomainEvent, { type: 'SPACEPORT_PLACED' }>;
    expect(e.type).toBe('SPACEPORT_PLACED');
    expect(e.cost).toEqual(PORT);
    expect('timePct' in e.structure).toBe(false);
  });
});

describe('grids and automatic placement with terrain', () => {
  it('findFreeFootprint skips tiles that cannot be built on', () => {
    for (const size of [1, 3, 7]) {
      const tiles = findFreeFootprint(grid, size, new Set())!;
      expect(tiles.every((i) => tileBuildable(grid.tiles[i]!))).toBe(true);
    }
    // only water left: nothing with terrain, a water tile without it
    const dry = new Set(grid.tiles.filter((t) => t.terrain !== 'water').map((t) => t.index));
    expect(findFreeFootprint(grid, 1, dry)).toBeNull();
    const plain: PlanetGrid = { ...grid, tiles: grid.tiles.map((t) => ({ ...t, terrain: undefined, road: undefined })), terrain: undefined };
    expect(grid.tiles[findFreeFootprint(plain, 1, dry)![0]!]!.terrain).toBe('water');
  });

  it('the simulation builds its grids from the bodies of the save: no terrain there, none in the rules', () => {
    const w = colony();
    const bare = {
      ...w,
      bodies: w.bodies.map((b) => (b.id === TC_C ? { ...b, surfaceGrid: { frequency: b.surfaceGrid!.frequency, depositSeed: b.surfaceGrid!.depositSeed, depositWeights: b.surfaceGrid!.depositWeights } } : b)),
    };
    const old = new Simulation(TAU_CETI_SCENARIO, { world: bare });
    expect(old.grids.get(TC_C)!.terrain).toBeUndefined();
    expect(old.builder.check(bare, TC_C, WATER.id, 'SOL')).toMatchObject({ ok: true, cost: { SIL: 10 }, timePct: 100 });
    // a save with terrain keeps it
    expect(new Simulation(TAU_CETI_SCENARIO, { world: w }).grids.get(TC_C)!.terrain).toEqual(grid.terrain);
  });
});

describe('bodies without terrain keep the catalog numbers exactly', () => {
  it('PoC planet and moon: cost of the catalog, no timePct, same site keys as before T8', () => {
    const planet = WORLD_GRIDS.get(PLANET_ID)!;
    expect(planet.terrain).toBeUndefined();
    expect(WORLD_GRIDS.get(MOON_ID)!.terrain).toBeUndefined();
    const w: WorldState = { ...createInitialWorld(), storage: { [PLANET_ID]: { FER: 500, KRI: 200, SIL: 300 } } };
    const used = new Set(w.structures.flatMap((s) => s.tiles));
    const tile = planet.tiles.find((t) => !t.deposit && !used.has(t.id))!;
    const poc = new BuildSystem(WORLD_GRIDS, POC_RULES);
    expect(poc.check(w, PLANET_ID, tile.id, 'HAB')).toEqual({ ok: true, tiles: [tile.id], cost: POC_RULES.spec('HAB').cost, timePct: 100 });
    const site = ordered(poc.build(w, PLANET_ID, tile.id, 'HAB', 3));
    expect(Object.keys(site)).toEqual(['id', 'kind', 'bodyId', 'tileId', 'tiles', 'level', 'targetLevel', 'state', 'progress', 'paid', 'builtAt']);
    expect(site.paid).toEqual({ FER: 20, SIL: 10 });
  });
});
