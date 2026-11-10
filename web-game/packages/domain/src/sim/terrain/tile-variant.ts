import { hash3 } from '../math/seeded-noise';
import { BIOMES, BiomeDress, isBasin } from './terrain-biomes';
import { TerrainKind, TileVariant } from './terrain-types';
import { TileFrame } from './tile-frame';

/**
 * Exits of the road kit tiles `roadB…M` as a mask over the kit's six sides (side k = flat at k·60° from
 * +X), measured on the files by projecting the road surface onto the side apothems. `roadA` has no exit.
 */
export const ROAD_MASKS: Readonly<Record<string, string>> = {
  B: '100100', C: '110000', D: '101000', E: '110100', F: '100101', G: '101010',
  H: '111000', I: '111010', J: '110110', K: '111100', L: '011111', M: '111111',
};

/** Water sides of the shore tiles: A = two adjacent sides, B and C = one side (C with a deeper bay), D = pond. */
export const SHORE_MASKS: Readonly<Record<string, string>> = { A: '110000', B: '000100', C: '000100' };

/**
 * Kit tile for a hexagonal tile (never called for pentagons). Order: basin, road, shore, pond, transition.
 * Every basin class (water, ice, dune) is a `hex_water` tile and the shore tiles of its land neighbours
 * treat it as water; ponds and raised transitions follow the biome (`BiomeDress`; default: `mixed`).
 * Kit side k lies between kit corners k − 1 and k, and kit corner c sits on `corners[(k0 + c) % 6]`, so kit
 * side k is tile edge `(k0 + k + 5) % 6`; a transition's raised half faces kit side 0 (tile edge `(k0 + 5) % 6`).
 */
export function chooseVariant(
  i: number,
  frame: TileFrame,
  kinds: ReadonlyArray<TerrainKind>,
  road: ReadonlySet<number>,
  seed: number,
  dress: BiomeDress = BIOMES.mixed.dress,
): TileVariant {
  const kind = kinds[i]!;
  if (isBasin(kind)) return { id: 'hex_water', k0: 0 };

  if (road.has(i)) {
    const want: number[] = frame.edgeNb.map((nb) => (road.has(nb) ? 1 : 0));
    if (want.every((w) => !w)) return { id: 'hex_forest_roadA', k0: 0 };
    let best: { id: string; k0: number; s: number } | null = null;
    for (const [letter, mask] of Object.entries(ROAD_MASKS)) {
      for (let k0 = 0; k0 < 6; k0++) {
        let score = 0;
        let bad = 0;
        for (let k = 0; k < 6; k++) {
          const edge = (k0 + k + 5) % 6;
          const has = +mask[k];
          if (has && want[edge]) score++;
          else if (has !== want[edge]) bad++;
        }
        const s = score * 3 - bad * 2;
        if (!best || s > best.s) best = { id: `hex_forest_road${letter}`, k0, s };
      }
    }
    return { id: best!.id, k0: best!.k0 };
  }

  const water: number[] = frame.edgeNb.map((nb) => (isBasin(kinds[nb]) ? 1 : 0));
  const nWater = water.reduce((a, b) => a + b, 0);
  if (nWater > 0 && nWater <= 2) {
    for (const [letter, mask] of Object.entries(SHORE_MASKS)) {
      if (mask.split('').reduce((a, b) => a + +b, 0) !== nWater) continue;
      // B and C are alternatives for one water side (C has a deeper bay): the hash picks one, the other is skipped
      if ((letter === 'B' || letter === 'C') && (letter === 'C') !== (hash3(seed, i, 12, 0) >= 0.5)) continue;
      for (let k0 = 0; k0 < 6; k0++) {
        let ok = true;
        for (let k = 0; k < 6; k++) {
          if (+mask[k] !== water[(k0 + k + 5) % 6]) {
            ok = false;
            break;
          }
        }
        if (ok) return { id: `hex_forest_water${letter}`, k0 };
      }
    }
  }
  if (nWater === 0 && kind === dress.pond && hash3(seed, i, 13, 0) > 0.96) {
    return { id: 'hex_forest_waterD', k0: Math.floor(hash3(seed, i, 14, 0) * 6) };
  }

  // a raised half towards a rock (A) or snow (B) neighbour, never towards its own class
  const raised = dress.transitionOn.includes(kind);
  const eRock = raised && kind !== 'rock' ? frame.edgeNb.findIndex((nb) => kinds[nb] === 'rock') : -1;
  const eSnow = raised && kind !== 'snow' ? frame.edgeNb.findIndex((nb) => kinds[nb] === 'snow') : -1;
  if (eSnow >= 0 && hash3(seed, i, 6, 0) > 0.3) return { id: 'hex_forest_transitionB', k0: (eSnow + 1) % 6 };
  if (eRock >= 0 && hash3(seed, i, 7, 0) > 0.45) return { id: 'hex_forest_transitionA', k0: (eRock + 1) % 6 };
  return { id: 'hex_forest', k0: 0 };
}
