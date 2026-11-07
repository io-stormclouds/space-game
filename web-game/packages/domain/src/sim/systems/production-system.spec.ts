import { PLANET_ID } from '../config/initial-world';
import { POC_RULES, WORLD_GRIDS, createInitialWorld } from '../config/world';
import { footprintTiles } from '../math/footprint';
import { WorldState, reduceAll, storageOf } from '../reducer';
import { standingStructure } from '../scenario';
import { ProductionSystem } from './production-system';

describe('ProductionSystem', () => {
  const grid = WORLD_GRIDS.get(PLANET_ID)!;
  const used = new Set(createInitialWorld().structures.flatMap((s) => s.tiles));
  const anchor = grid.tiles.find((t) => t.neighbors.length === 6 && [t.index, ...t.neighbors].every((i) => !used.has(grid.tiles[i]!.id)))!;
  const huta = { ...standingStructure('SMT', PLANET_ID, footprintTiles(grid, anchor.index, 3)!), recipe: 'R_STA', batch: null };
  const world = (store: Record<string, number>): WorldState => {
    const w = createInitialWorld();
    return { ...w, structures: [...w.structures, huta], storage: { [PLANET_ID]: store } };
  };
  const run = (w: WorldState, minutes: number, dt = 0.5) => {
    const sys = new ProductionSystem(POC_RULES);
    let cur = w;
    for (let t = 0; t < minutes; t += dt) {
      const u = sys.update(cur, dt);
      cur = reduceAll(u.world, u.events);
    }
    return cur;
  };

  it('Huta: 4 FER + 2 KAR → 2 STA in 4 min (canvas and doc recipe R_STA)', () => {
    // power: HQ 5 + SOL 5 = 10 MW against pad 2 + Huta 6 = 8 → full speed
    const after = run(world({ FER: 8, KAR: 4 }), 8.5);
    expect(storageOf(after, PLANET_ID)).toMatchObject({ FER: 0, KAR: 0, STA: 4 });
  });

  it('waits for inputs and does not start a batch without them', () => {
    const after = run(world({ FER: 3, KAR: 10 }), 10);
    expect(storageOf(after, PLANET_ID)).toMatchObject({ FER: 3, KAR: 10 });
    expect(after.structures.find((s) => s.id === huta.id)!.batch).toBeNull();
  });

  it('slows down under a power deficit (Z4)', () => {
    const base = world({ FER: 40, KAR: 20 });
    const extra = [...grid.tiles].filter((t) => !used.has(t.id) && !huta.tiles.includes(t.id)).slice(0, 3);
    const starved: WorldState = { ...base, structures: [...base.structures, ...extra.map((t) => standingStructure('HAB', PLANET_ID, [t.index]))] };
    // demand: pad 2 (P2) + Huta 6 (P2) + 3 habitats 6 (P1) = 14 > 10 produced; P1 first, P2 gets 4 / 8
    const full = storageOf(run(base, 12), PLANET_ID)['STA'] ?? 0;
    const slow = storageOf(run(starved, 12), PLANET_ID)['STA'] ?? 0;
    expect(slow).toBeLessThan(full);
    expect(slow).toBeGreaterThan(0);
  });
});
