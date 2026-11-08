import { COLONY_IDS, INITIAL_BODIES } from '../config/initial-world';
import { COLONY_LAYOUTS, WORLD_GRIDS, createInitialWorld, landingPadTile } from '../config/world';
import { powerBalance } from '../economy/power';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { STRUCTURE_INFO, StructureKind } from '../models/structure.model';
import { ColonyLayout, colonyCenter, planColony, tileRings } from './colony-layout';

const EXTRACTOR_OF: Record<string, StructureKind> = { FERRITE: 'MINE', CRYOL: 'ICE_EXTRACTOR', SILICITE: 'SILICITE_EXTRACTOR' };

describe('colony layout', () => {
  const grid = buildGoldbergGrid(COLONY_IDS[0], 50, 8, 31);
  const center = colonyCenter(grid, { x: 0.3, y: 1, z: 0.2 });
  const layout = planColony(grid, center.index);
  const ring = tileRings(grid, center.index);
  const buildings = [...layout.tiles.values()].filter((t) => t.building);

  it('centres on a hexagon and puts the landing pad there', () => {
    expect(center.kind).toBe('HEX');
    expect(layout.tiles.get(center.index)).toMatchObject({ building: 'LANDING_PAD', real: true, ring: 0 });
  });

  it('is deterministic', () => {
    const again = planColony(grid, center.index);
    expect([...again.tiles.entries()]).toEqual([...layout.tiles.entries()]);
    expect(again.links).toEqual(layout.links);
  });

  it('fills the first three rings completely and builds a sizeable base', () => {
    for (const t of grid.tiles) if (ring[t.index] >= 1 && ring[t.index] <= 3) expect(layout.tiles.get(t.index)?.building, `tile ${t.index}`).toBeTruthy();
    expect(buildings.length).toBeGreaterThan(45);
    const kinds = new Set(buildings.map((b) => b.building));
    for (const k of ['COMMAND', 'HABITAT', 'DEPOT', 'SOLAR', 'WIND', 'GARAGE', 'FARM', 'STORAGE', 'LAUNCH', 'COMMS', 'DEFENSE']) expect(kinds, k).toContain(k);
  });

  it('every deposit near the base gets the matching extractor, and only deposits get extractors', () => {
    for (const t of grid.tiles) {
      const b = layout.tiles.get(t.index)?.building;
      if (t.deposit && ring[t.index] <= 6) expect(b, `tile ${t.index}`).toBe(EXTRACTOR_OF[t.deposit.resource]);
      if (b && STRUCTURE_INFO[b as StructureKind]?.extracts) expect(t.deposit, `tile ${t.index}`).not.toBeNull();
    }
  });

  it('links only neighbours: corridors join core buildings into one tree rooted at the pad, pipes reach every extractor', () => {
    for (const l of layout.links) expect(grid.tiles[l.a].neighbors).toContain(l.b);
    const corridors = layout.links.filter((l) => l.kind === 'CORRIDOR');
    expect(corridors.length).toBeGreaterThan(15);
    // tree: one parent per child, parent one ring closer
    const children = corridors.map((l) => l.b);
    expect(new Set(children).size).toBe(children.length);
    for (const l of corridors) expect(ring[l.a]).toBe(ring[l.b] - 1);
    const piped = new Set(layout.links.filter((l) => l.kind === 'PIPE').flatMap((l) => [l.a, l.b]));
    for (const b of buildings) if (['MINE', 'ICE_EXTRACTOR', 'SILICITE_EXTRACTOR'].includes(b.building!) && b.ring > 0) expect(piped, `extractor ${b.tileIndex}`).toContain(b.tileIndex);
  });

  it('props stay inside their tile and dress the wilderness too', () => {
    const props = [...layout.tiles.values()].flatMap((t) => t.props.map((p) => ({ ...p, tile: t.tileIndex })));
    expect(props.length).toBeGreaterThan(60);
    for (const p of props) {
      expect(p.radial).toBeGreaterThanOrEqual(0);
      expect(p.radial).toBeLessThanOrEqual(0.85);
      expect(p.corner).toBeLessThan(grid.tiles[p.tile].vertices.length);
    }
    expect(props.some((p) => p.kind === 'CRATER' && ring[p.tile] > 6)).toBe(true);
  });

  it('only the pad and one solar panel are real structures', () => {
    expect(layout.realStructures.map((s) => s.kind)).toEqual(['LANDING_PAD', 'SOLAR']);
    for (const s of layout.realStructures) expect(layout.tiles.get(Number(s.tileId.split(':')[1]))?.real).toBe(true);
  });
});

describe('world colonies', () => {
  const layouts = COLONY_IDS.map((id) => COLONY_LAYOUTS.get(id)!) as ColonyLayout[];

  it('three colonies with tile-for-tile identical layouts (only the art style differs)', () => {
    expect(layouts).toHaveLength(3);
    const shape = (l: ColonyLayout) => [...l.tiles.values()].map((t) => [t.tileIndex, t.building, t.props.length]);
    expect(shape(layouts[1])).toEqual(shape(layouts[0]));
    expect(shape(layouts[2])).toEqual(shape(layouts[0]));
  });

  it('each colony base faces the sun at t = 0, and its pad becomes the docking point', () => {
    const world = createInitialWorld();
    for (const l of layouts) {
      const body = INITIAL_BODIES.find((b) => b.id === l.bodyId)!;
      const c = WORLD_GRIDS.get(l.bodyId)!.tiles[l.centerTile].normal;
      const sun = { x: -Math.cos(body.initialAngle), z: -Math.sin(body.initialAngle) };
      expect(c.x * sun.x + c.z * sun.z).toBeGreaterThan(0.4);
      expect(landingPadTile(world.structures, l.bodyId)?.index).toBe(l.centerTile);
      expect(powerBalance(world.structures, l.bodyId)).toEqual({ produced: 5, consumed: 2, available: 3 });
    }
  });
});
