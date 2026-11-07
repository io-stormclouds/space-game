import { tileId } from '../models/planet-grid.model';
import {
  DEFAULT_COLONIZATION,
  Scenario,
  findFreeFootprint,
  standingStructure,
  topTile,
} from '../scenario';
import { INITIAL_BODIES, INITIAL_ROVER, INITIAL_SHIPS, INITIAL_STOCKPILE, PLANET_ID } from '../config/initial-world';

/**
 * Test preset "Planeta Matka" (W06 A): the 3D PoC world, where the ported PoC tests run.
 * Unified rule: the economy doc starts era E0 with the port (HQ) L1 standing, so the preset has one
 * (it provides 5 MW, living space for 5 and storage); the PoC had only the landing pad and the panel.
 */
export const POC_SCENARIO: Scenario = {
  id: 'planeta-matka',
  name: 'Planeta Matka (preset PoC)',
  bodies: INITIAL_BODIES,
  ships: INITIAL_SHIPS,
  storage: { [PLANET_ID]: INITIAL_STOCKPILE },
  colonization: DEFAULT_COLONIZATION,
  scanned: true,
  structures(grids, rules) {
    const grid = grids.get(PLANET_ID);
    if (!grid) return [];
    const pad = topTile(grid);
    const solar = pad.neighbors.find((n) => !grid.tiles[n]!.deposit) ?? pad.neighbors[0]!;
    const taken = new Set([pad.index, solar]);
    const hq = findFreeFootprint(grid, rules.spec('HQ').footprint, taken, 3);
    return [
      standingStructure('LAND', PLANET_ID, [pad.index]),
      standingStructure('SOL', PLANET_ID, [solar]),
      ...(hq ? [standingStructure('HQ', PLANET_ID, hq)] : []),
    ];
  },
  rovers(grids) {
    const grid = grids.get(INITIAL_ROVER.bodyId);
    return grid ? [{ ...INITIAL_ROVER, tileIndex: topTile(grid).index }] : [];
  },
};

/** Id of the PoC landing pad (top tile of the planet). */
export function pocPadId(grid: Parameters<typeof topTile>[0]): string {
  return `LAND@${tileId(PLANET_ID, topTile(grid).index)}`;
}
