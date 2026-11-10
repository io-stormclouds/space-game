// Terrain building rules (T8, T5) — data, like the rest of the economy catalog: exported to the Rust crate
// with `npm run conformance:catalog` (catalog.json, key `terrain`) and read by `Rules.terrain()`.
// Values: docs/planet-terrain-poc-wnioski-i-plan.md §9.1 (T-15) and §11 (sand, dune, ice, regolith).
// Percentages are integers, so a cost `Math.ceil(q * pct / 100)` of an integer catalog cost is exact in
// both languages. Key order of `kinds` is the catalog JSON order.
import type { TerrainKind } from '../sim/terrain/terrain-types';

export interface TerrainKindRule {
  /** Polish name for the UI and the BAD_TERRAIN detail. */
  name: string;
  /** Whether a footprint may cover it (no: BAD_TERRAIN). */
  buildable: boolean;
  /** Construction materials in % of the catalog cost (unused when not buildable). */
  costPct: number;
  /** Construction time in % of the catalog time (unused when not buildable). */
  timePct: number;
}

export interface TerrainRules {
  kinds: Readonly<Record<TerrainKind, Readonly<TerrainKindRule>>>;
  /** Road of the ruined settlement: overrides the class of the tile (levelled ground, old foundations). */
  road: Readonly<{ name: string; costPct: number; timePct: number }>;
}

export const TERRAIN_RULES: TerrainRules = {
  kinds: {
    grass: { name: 'trawa', buildable: true, costPct: 100, timePct: 100 },
    // clearing is mostly rover work
    forest: { name: 'las', buildable: true, costPct: 110, timePct: 150 },
    // anchoring and blasting cost material
    rock: { name: 'skała', buildable: true, costPct: 140, timePct: 125 },
    // insulation and slow work in the cold
    snow: { name: 'śnieg', buildable: true, costPct: 120, timePct: 140 },
    water: { name: 'woda', buildable: false, costPct: 100, timePct: 100 },
    // loose ground: deeper foundations
    sand: { name: 'piasek', buildable: true, costPct: 110, timePct: 120 },
    // shifting sand and dried lake beds: no footing
    dune: { name: 'wydma', buildable: false, costPct: 100, timePct: 100 },
    // insulation from the ice and slow work in the cold
    ice: { name: 'lód', buildable: true, costPct: 125, timePct: 150 },
    // firm airless ground: the catalog numbers
    regolith: { name: 'regolit', buildable: true, costPct: 100, timePct: 100 },
  },
  road: { name: 'droga', costPct: 85, timePct: 75 },
};
