import {
  BUILDINGS,
  MATERIALS,
  RECIPE_DATA,
  VEHICLES,
  type BuildingDef,
  type Material,
  type Qty,
  type RecipeData,
} from './catalog-data';

/** Model parameters (docs/economy-expansion-design.md, Załącznik A). Changing them recomputes everything. */
export interface EconomyParams {
  /** Price of energy [kr per MW·min]. */
  energyPrice: number;
  /** Machine-time cost [kr per machine-minute]. */
  machineMinute: number;
  /** Ship-time cost for expeditions [kr per ship-minute]. */
  shipMinute: number;
  /** Growth per level. */
  costGrowth: number;
  timeGrowth: number;
  producerPowerGrowth: number;
  consumerPowerGrowth: number;
  crewGrowth: number;
  /** Growth of living space (HQ, Habitat): 10 → 17 → 29 → 49 → 84 (doc 4.5). */
  livingSpaceGrowth: number;
  storageGrowth: number;
  /** Target payback of an L1 production building per era [min]; sets the era multiplier k. */
  paybackTargetMin: readonly number[];
  /** Atanor tick per factory level [min], index = level (0 unused). */
  atanorTick: readonly number[];
  /** Atanor base power at L1 [MW], ×`atanorPowerGrowth` per level, plus per hex and per arm. */
  atanorBasePower: number;
  atanorPowerGrowth: number;
  atanorPowerPerHex: number;
  atanorPowerPerArm: number;
  /**
   * Measured Atanor solutions per recipe (F6 designer panel, A3): replace the catalog's provisional
   * cycles / area / arms of the doc §8.3. Absent = the document's numbers.
   */
  atanor?: Readonly<Record<string, AtanorMeasured>>;
}

/** Numbers of a running Atanor solution, measured in the building view. */
export interface AtanorMeasured {
  cycles: number;
  area: number;
  arms: number;
}

export const DEFAULT_ECONOMY_PARAMS: EconomyParams = {
  energyPrice: 0.1,
  machineMinute: 0.1,
  shipMinute: 1.0,
  costGrowth: 2,
  timeGrowth: 1.8,
  producerPowerGrowth: 1.6,
  consumerPowerGrowth: 1.45,
  crewGrowth: 1.3,
  livingSpaceGrowth: 1.7,
  storageGrowth: 1.8,
  paybackTargetMin: [8, 30, 120, 240, 480],
  atanorTick: [0, 1.0, 0.9, 0.8, 0.7, 0.6],
  atanorBasePower: 6,
  atanorPowerGrowth: 1.45,
  atanorPowerPerHex: 0.5,
  atanorPowerPerArm: 1,
};

/** A recipe with its time and power resolved. */
export interface Recipe extends RecipeData {
  time: number;
  power: number;
}

/** Base value of a material: V [kr], embodied energy E [MW·min], machine time T [min], raw T0 inputs. */
export interface MaterialValue {
  V: number;
  E: number;
  T: number;
  raw: Record<string, number>;
}

export interface Economy {
  readonly params: EconomyParams;
  readonly materials: ReadonlyArray<Material>;
  readonly recipes: ReadonlyArray<Recipe>;
  readonly buildings: ReadonlyArray<BuildingDef>;
  readonly vehicles: ReadonlyArray<BuildingDef>;
  /** Base values from the primary process of each material. */
  readonly values: ReadonlyMap<string, MaterialValue>;
  /** Values via alternative processes, keyed `recipeId:materialId`. */
  readonly alternatives: ReadonlyMap<string, MaterialValue>;
  /** Era cost multipliers k, index = era. */
  readonly eraK: readonly number[];
  material(id: string): Material;
  recipe(id: string): Recipe;
  building(id: string): BuildingDef;
  /** Value of an amount of materials [kr]. */
  kr(q: Qty): number;
  /** Cost of level L before the era multiplier. */
  baseCost(b: BuildingDef, level: number): Record<string, number>;
  /** Cost of level L (rounded, with the era multiplier). */
  cost(b: BuildingDef, level: number): Record<string, number>;
  /** Build time of level L [min]. */
  buildTime(b: BuildingDef, level: number): number;
  /** Power of level L [MW], positive produces. */
  power(b: BuildingDef, level: number): number;
  /** Crew of level L; negative provides living space. */
  crew(b: BuildingDef, level: number): number;
  /** Gross output value at L1 [kr/min] (net of reactor fuel). */
  grossOut(b: BuildingDef): number;
}

export function addQty(a: Record<string, number>, b: Qty, k: number): void {
  for (const [id, q] of Object.entries(b)) a[id] = (a[id] ?? 0) + q * k;
}

function resolveRecipe(r: RecipeData, p: EconomyParams): Recipe {
  if (r.atanor) {
    const measured = p.atanor?.[r.id];
    const atanor = measured ? { ...r.atanor, cycles: measured.cycles, area: measured.area, arms: measured.arms } : r.atanor;
    const { level, cycles, area, arms } = atanor;
    const tick = p.atanorTick[level] ?? 1;
    const base = p.atanorBasePower * Math.pow(p.atanorPowerGrowth, level - 1);
    return {
      ...r,
      atanor,
      time: +(cycles * tick).toFixed(2),
      power: +(base + p.atanorPowerPerHex * area + p.atanorPowerPerArm * arms).toFixed(1),
    };
  }
  return { ...r, time: r.time ?? 1, power: r.power ?? 0 };
}

/** Computes material values, era multipliers and per-level building data from the catalog. Pure. */
export function computeEconomy(params: EconomyParams = DEFAULT_ECONOMY_PARAMS): Economy {
  const p = params;
  const recipes = RECIPE_DATA.map((r) => resolveRecipe(r, p));
  const materialById = new Map(MATERIALS.map((m) => [m.id, m]));
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const buildingById = new Map([...BUILDINGS, ...VEHICLES].map((b) => [b.id, b]));
  const VAL = new Map<string, MaterialValue>();
  const ALT = new Map<string, MaterialValue>();

  function evalRecipe(r: Recipe): Map<string, MaterialValue> | null {
    for (const id of [...Object.keys(r.inp), ...Object.keys(r.by ?? {})]) if (!VAL.has(id)) return null;
    const ct = r.shipTime ? p.shipMinute : p.machineMinute;
    let V = r.power * r.time * p.energyPrice + r.time * ct;
    let E = r.power * r.time;
    let T = r.time;
    const raw: Record<string, number> = {};
    for (const [id, q] of Object.entries(r.inp)) {
      const v = VAL.get(id)!;
      V += q * v.V;
      E += q * v.E;
      T += q * v.T;
      addQty(raw, v.raw, q);
    }
    const shares: Record<string, number> = {};
    if (r.co) Object.assign(shares, r.co);
    else {
      let s = 0;
      for (const [id, q] of Object.entries(r.by ?? {})) s += Math.min(0.9, (q * VAL.get(id)!.V) / V);
      for (const id of Object.keys(r.out)) shares[id] = 1 - s;
    }
    const res = new Map<string, MaterialValue>();
    for (const [id, q] of Object.entries(r.out)) {
      const share = shares[id] ?? 0;
      const rq: Record<string, number> = {};
      if (Object.keys(r.inp).length === 0) rq[id] = 1;
      else addQty(rq, raw, share / q);
      res.set(id, { V: (V * share) / q, E: (E * share) / q, T: (T * share) / q, raw: rq });
    }
    return res;
  }

  let pending = recipes.filter((r) => r.primary);
  for (let g = 0; pending.length && g < 50; g++) {
    pending = pending.filter((r) => {
      const res = evalRecipe(r);
      if (!res) return true;
      for (const [id, v] of res) VAL.set(id, v);
      return false;
    });
  }
  if (pending.length) throw new Error('unresolved recipes: ' + pending.map((r) => r.id).join(', '));
  for (const r of recipes.filter((x) => !x.primary)) for (const [id, v] of evalRecipe(r)!) ALT.set(r.id + ':' + id, v);

  const kr = (q: Qty) => Object.entries(q).reduce((s, [id, n]) => s + n * VAL.get(id)!.V, 0);

  function baseCost(b: BuildingDef, L: number): Record<string, number> {
    if (b.explicit) return { ...b.explicit[L - 1] };
    const q: Record<string, number> = {};
    addQty(q, b.c1, Math.pow(p.costGrowth, L - 1));
    for (let k = 2; k <= L; k++) {
      const add = b.ex[k];
      if (add) addQty(q, add, Math.pow(p.costGrowth, L - k));
    }
    return q;
  }

  function grossOut(b: BuildingDef): number {
    if (b.p1 > 0 && !b.rec) {
      let fuel = 0;
      if (b.id === 'FIS') fuel = VAL.get('PRE')!.V / 120;
      if (b.id === 'FUS') fuel = VAL.get('KAP')!.V / 300;
      const ins = b.id === 'SAT' ? 0.8 : 1; // beaming loss
      return b.p1 * ins * p.energyPrice - fuel;
    }
    if (!b.rec) return 0;
    const r = recipeById.get(b.rec)!;
    return Object.entries(r.out).reduce((s, [id, q]) => s + q * VAL.get(id)!.V, 0) / r.time;
  }

  const nice = (x: number) => {
    const steps = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
    return steps.reduce((a, s) => (Math.abs(Math.log(s / x)) < Math.abs(Math.log(a / x)) ? s : a), 1);
  };
  const eraK: number[] = [];
  for (let e = 0; e <= 4; e++) {
    const pb = BUILDINGS.filter((b) => b.era === e && !b.explicit && grossOut(b) > 0)
      .map((b) => kr(baseCost(b, 1)) / grossOut(b))
      .sort((a, b) => a - b);
    const med = pb[Math.floor(pb.length / 2)]!;
    eraK[e] = e === 0 ? 1 : nice((p.paybackTargetMin[e] ?? 1) / med);
  }

  return {
    params: p,
    materials: MATERIALS,
    recipes,
    buildings: BUILDINGS,
    vehicles: VEHICLES,
    values: VAL,
    alternatives: ALT,
    eraK,
    material(id) {
      const m = materialById.get(id);
      if (!m) throw new Error(`unknown material ${id}`);
      return m;
    },
    recipe(id) {
      const r = recipeById.get(id);
      if (!r) throw new Error(`unknown recipe ${id}`);
      return r;
    },
    building(id) {
      const b = buildingById.get(id);
      if (!b) throw new Error(`unknown building ${id}`);
      return b;
    },
    kr,
    baseCost,
    cost(b, L) {
      const q = baseCost(b, L);
      const k = b.explicit ? 1 : eraK[b.era]!;
      for (const id of Object.keys(q)) q[id] = Math.round(q[id]! * k);
      return q;
    },
    buildTime: (b, L) => (b.explicitT ? b.explicitT[L - 1]! : b.t1 * Math.pow(p.timeGrowth, L - 1)),
    power: (b, L) =>
      b.p1 > 0
        ? b.p1 * Math.pow(b.pg ?? p.producerPowerGrowth, L - 1)
        : b.p1 * Math.pow(p.consumerPowerGrowth, L - 1),
    crew: (b, L) => b.crew * Math.pow(b.crew < 0 ? p.livingSpaceGrowth : p.crewGrowth, L - 1),
    grossOut,
  };
}
