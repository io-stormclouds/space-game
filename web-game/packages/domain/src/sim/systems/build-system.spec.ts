import { MOON_ID, PLANET_ID } from '../config/initial-world';
import { INITIAL_STRUCTURES, POC_RULES, WORLD_GRIDS, createInitialWorld, topTile } from '../config/world';
import { crewBalance, powerBalance } from '../economy/colony';
import { DomainEvent } from '../models/domain-event.model';
import { tileId } from '../models/planet-grid.model';
import { WorldState, reduce, storageOf } from '../reducer';
import { BuildSystem } from './build-system';

// Ported from the 3D PoC and changed by the unified rules (web-game/docs/UNIFICATION.md, section 4):
// a BUILD order now creates a construction site paid from the body's storage (a rover builds it),
// power and crew are reserved at the order, the preset starts with the port L1 (+5 MW, 5 crew),
// building ids come from the catalog (MINE → MIN, ICE_EXTRACTOR → ICE, HABITAT → HAB…).

describe('BuildSystem', () => {
  const system = new BuildSystem(WORLD_GRIDS, POC_RULES);
  const grid = WORLD_GRIDS.get(PLANET_ID)!;
  const used = new Set(INITIAL_STRUCTURES.flatMap((s) => s.tiles));
  const freeTiles = () => grid.tiles.filter((t) => !t.deposit && !used.has(t.id));
  const freeTile = () => freeTiles()[0]!;
  const depositTiles = (resource: string) => grid.tiles.filter((t) => t.deposit?.resource === resource && !used.has(t.id));
  const depositTile = (resource: string) => depositTiles(resource)[0]!;
  const rich = (): WorldState => ({ ...createInitialWorld(), storage: { [PLANET_ID]: { FER: 500, KRI: 200, SIL: 300 } } });
  const ok = (w: WorldState, e: DomainEvent): WorldState => {
    expect(e.type).toBe('CONSTRUCTION_ORDERED');
    return reduce(w, e);
  };

  it('starts with a landing pad, a solar panel and the port: 10 MW produced, 2 consumed; living space 5', () => {
    const w = createInitialWorld();
    expect(powerBalance(w, POC_RULES, PLANET_ID)).toMatchObject({ produced: 10, consumed: 2, available: 8 });
    expect(crewBalance(w, POC_RULES, PLANET_ID)).toEqual({ capacity: 5, demand: 2, available: 3 });
    expect(INITIAL_STRUCTURES.map((s) => s.kind)).toEqual(['LAND', 'SOL', 'HQ']);
    expect(INITIAL_STRUCTURES[0]!.tileId).toBe(topTile(grid).id);
    expect(INITIAL_STRUCTURES[2]!.tiles).toHaveLength(3);
  });

  it('orders a mine on a Ferryt deposit: a site paid from the planet storage', () => {
    const w = createInitialWorld();
    const tile = depositTile('FER');
    const e = system.build(w, PLANET_ID, tile.id, 'MIN', 12);
    const after = ok(w, e);
    expect(storageOf(after, PLANET_ID)['FER']).toBe(storageOf(w, PLANET_ID)['FER']! - 15);
    expect(after.structures).toHaveLength(4);
    expect(after.structures[3]).toMatchObject({ kind: 'MIN', bodyId: PLANET_ID, tileId: tile.id, builtAt: 12, state: 'PLANNED', level: 0 });
  });

  it('rejects an extractor without a matching deposit', () => {
    const w = createInitialWorld();
    expect(system.build(w, PLANET_ID, freeTile().id, 'MIN', 0)).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_DEPOSIT' });
    const cryol = depositTile('KRI');
    expect(system.build(w, PLANET_ID, cryol.id, 'MIN', 0)).toMatchObject({ reason: 'NO_DEPOSIT', detail: 'wymaga złoża: Ferryt, Karbonit, Kupryt, Tytanit, Uranit' });
    expect(system.build(w, PLANET_ID, cryol.id, 'ICE', 0).type).toBe('CONSTRUCTION_ORDERED');
  });

  it('rejects a second structure on the same tile, also while the first is only a site', () => {
    let w = createInitialWorld();
    const tile = freeTile();
    w = ok(w, system.build(w, PLANET_ID, tile.id, 'HAB', 0));
    const e = system.build(w, PLANET_ID, tile.id, 'HAB', 1);
    expect(e).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'TILE_OCCUPIED' });
    expect(reduce(w, e)).toBe(w);
  });

  it('rejects when materials are short, naming the shortfall in codes', () => {
    const w: WorldState = { ...createInitialWorld(), storage: { [PLANET_ID]: { FER: 10 } } };
    const e = system.build(w, PLANET_ID, freeTile().id, 'HAB', 0);
    expect(e).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_RESOURCES', detail: 'brakuje FER 10 · SIL 10' });
  });

  it('reserves power at the order: the third mine waits for a wind turbine (planned producers count)', () => {
    let w = rich();
    w = ok(w, system.build(w, PLANET_ID, freeTiles()[0]!.id, 'HAB', 0)); // 8 → 6 MW, crew 3 → 13
    const [a, b, c] = depositTiles('FER');
    w = ok(w, system.build(w, PLANET_ID, a!.id, 'MIN', 0)); // 6 → 3
    w = ok(w, system.build(w, PLANET_ID, b!.id, 'MIN', 0)); // 3 → 0
    expect(system.build(w, PLANET_ID, c!.id, 'MIN', 1)).toMatchObject({ reason: 'NO_POWER', detail: 'brakuje 3 MW' });
    expect(system.availability(w, PLANET_ID, 'SOL').ok).toBe(true);
    w = ok(w, system.build(w, PLANET_ID, freeTiles()[1]!.id, 'WND', 2));
    expect(system.build(w, PLANET_ID, c!.id, 'MIN', 3).type).toBe('CONSTRUCTION_ORDERED');
  });

  it('reserves crew: two mines need 4, the port gives 5 minus the pad', () => {
    let w = rich();
    const [a, b] = depositTiles('FER');
    w = ok(w, system.build(w, PLANET_ID, a!.id, 'MIN', 0));
    expect(system.build(w, PLANET_ID, b!.id, 'MIN', 0)).toMatchObject({ reason: 'NO_CREW', detail: 'brakuje 1 os.' });
  });

  it('needs a dense atmosphere for wind, a rover on the body and a buildable kind', () => {
    const w = rich();
    const moon = WORLD_GRIDS.get(MOON_ID)!;
    expect(system.build(w, MOON_ID, moon.tiles[0]!.id, 'WND', 0)).toMatchObject({ reason: 'NO_ATMOSPHERE' });
    expect(system.build(w, MOON_ID, moon.tiles.find((t) => !t.deposit)!.id, 'HAB', 0)).toMatchObject({ reason: 'NO_ROVER' });
    expect(system.build(w, PLANET_ID, freeTile().id, 'HQ', 0)).toMatchObject({ reason: 'NOT_BUILDABLE' });
    expect(system.build(w, PLANET_ID, freeTile().id, 'ELY', 0)).toMatchObject({ reason: 'NOT_BUILDABLE' }); // era E2
  });

  it('places a 3-tile Huta (E1) on two touching neighbours and refuses levels above the port', () => {
    let w: WorldState = { ...rich(), storage: { [PLANET_ID]: { FER: 500, SIL: 300 } } };
    const anchor = grid.tiles.find((t) => t.neighbors.length === 6 && [t.index, ...t.neighbors].every((i) => !used.has(grid.tiles[i]!.id) && !grid.tiles[i]!.deposit))!;
    const habitat = freeTiles().find((t) => t.id !== anchor.id && !anchor.neighbors.includes(t.index))!;
    w = ok(w, system.build(w, PLANET_ID, habitat.id, 'HAB', 0)); // the Huta needs 4 crew
    const e = system.build(w, PLANET_ID, anchor.id, 'SMT', 0);
    w = ok(w, e);
    const site = (e as Extract<DomainEvent, { type: 'CONSTRUCTION_ORDERED' }>).structure;
    expect(site.tiles).toHaveLength(3);
    expect(grid.tiles[Number(site.tiles[1]!.split(':')[1])]!.neighbors).toContain(Number(site.tiles[2]!.split(':')[1]));
    expect(site.recipe).toBe('R_STA');
    const port = w.structures.find((s) => s.kind === 'HQ')!;
    const solar = w.structures.find((s) => s.kind === 'SOL')!;
    expect(system.upgrade(w, solar.id)).toMatchObject({ reason: 'LEVEL_CAP', detail: 'port L1' });
    expect(system.upgrade(w, port.id)).not.toMatchObject({ reason: 'LEVEL_CAP' }); // the port sets the cap
  });

  it('rejects bodies without a grid and unknown tiles', () => {
    const w = createInitialWorld();
    expect(system.build(w, 'asteroid' as never, tileId('asteroid' as never, 0), 'HAB', 0)).toMatchObject({ reason: 'NO_GRID' });
    expect(system.build(w, PLANET_ID, tileId(PLANET_ID, 9999), 'HAB', 0)).toMatchObject({ reason: 'NO_GRID' });
  });
});
