import { ERA_NAMES } from './catalog-data';
import type { Economy } from './economy-model';

// F6 designer panel: the numbers of the economy document's tables (doc chapters 3–5 and 8) in plain
// rows, so the panel can put the document's values (default parameters) next to the current ones.

export interface MaterialRow {
  id: string;
  name: string;
  tier: string;
  /** Base value [kr], embodied energy [MW·min], machine time [min]. */
  V: number;
  E: number;
  T: number;
}

export interface BuildingRow {
  id: string;
  name: string;
  era: number;
  /** L1 cost with the era multiplier, valued in kr. */
  costKr: number;
  /** L1 build time [min]. */
  buildTime: number;
  /** L1 power [MW], positive produces. */
  power: number;
  /** L1 crew (negative = living space). */
  crew: number;
  /** Gross output value at L1 [kr/min]; 0 for buildings that make nothing. */
  grossOut: number;
  /** Payback of the L1 cost from its output [min]; null when it makes nothing. */
  paybackMin: number | null;
}

export interface AtanorRow {
  recipeId: string;
  /** Minimum level of the Fabryka atanorowa. */
  level: number;
  product: string;
  cycles: number;
  area: number;
  arms: number;
  /** Minutes per product batch and MW while running. */
  time: number;
  power: number;
  /** Base value of the product [kr]. */
  productValue: number;
}

export interface EconomyTables {
  eras: ReadonlyArray<{ era: number; name: string; k: number }>;
  materials: MaterialRow[];
  buildings: BuildingRow[];
  atanor: AtanorRow[];
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Rows of the document's tables for one economy. Pure. */
export function economyTables(eco: Economy): EconomyTables {
  const materials = eco.materials.map((m) => {
    const v = eco.values.get(m.id)!;
    return { id: m.id, name: m.name, tier: m.tier, V: round(v.V, 3), E: round(v.E, 2), T: round(v.T, 2) };
  });
  const buildings = eco.buildings.map((b) => {
    const costKr = eco.kr(eco.cost(b, 1));
    const grossOut = eco.grossOut(b);
    return {
      id: b.id,
      name: b.name,
      era: b.era,
      costKr: round(costKr, 1),
      buildTime: round(eco.buildTime(b, 1), 2),
      power: round(eco.power(b, 1), 2),
      crew: round(eco.crew(b, 1), 2),
      grossOut: round(grossOut, 3),
      paybackMin: grossOut > 0 ? round(costKr / grossOut, 1) : null,
    };
  });
  const atanor = eco.recipes
    .filter((r) => r.atanor)
    .map((r) => {
      const product = Object.keys(r.out)[0]!;
      const a = r.atanor!;
      return {
        recipeId: r.id,
        level: a.level,
        product,
        cycles: a.cycles,
        area: a.area,
        arms: a.arms,
        time: r.time,
        power: r.power,
        productValue: round(eco.values.get(product)!.V, 3),
      };
    });
  const eras = eco.eraK.map((k, era) => ({ era, name: ERA_NAMES[era] ?? `E${era}`, k }));
  return { eras, materials, buildings, atanor };
}
