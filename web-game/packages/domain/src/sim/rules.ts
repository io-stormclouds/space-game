import {
  STORAGE_CLASSES,
  TERRAIN_RULES,
  computeEconomy,
  type BuildingDef,
  type Economy,
  type Recipe,
  type StorageClass,
  type TerrainRules,
} from '../economy';
import { Cost } from './models/resource.model';
import { StructureKind } from './models/structure.model';

/** Highest era whose buildings the player can build (W07 B: E0–E1 playable, the rest is data). */
export const PLAYABLE_ERA = 1;

/** Living-space/storage provided by the HQ (Port kosmiczny) at L1; the canvas shows 3600 at L2 = 2000 × 1.8. */
export const HQ_STORAGE_L1 = 2000;
const HQ_STORAGE_CLASSES: readonly StorageClass[] = ['sypkie', 'sztukowe'];

/** P1: life support, cryogenics, magnetic traps. P3: logistics. Everything else P2 (doc 4.3). */
const P1_KINDS = new Set(['HAB', 'CRY', 'TRAP']);

export type PowerPriority = 1 | 2 | 3;

export interface Extraction {
  material: string;
  /** Units per minute at L1. */
  rate: number;
  recipeId: string;
}

export interface StructureSpec {
  kind: StructureKind;
  name: string;
  era: number;
  /** Tiles on the surface (1, 3, 7); 0 for orbital or vehicles. */
  footprint: number;
  maxLevel: number;
  level: number;
  cost: Cost;
  /** Minutes. */
  buildTime: number;
  /** MW, positive produces. Solar is before insolation. */
  power: number;
  /** Crew it needs (positive) or living space it provides (negative). */
  crew: number;
  priority: PowerPriority;
  /** Output multiplier of this level (×1.6 per level). */
  outputFactor: number;
  storage: Partial<Record<StorageClass, number>>;
  isSolar: boolean;
  needsAtmosphere: boolean;
  isLandingPad: boolean;
  isHQ: boolean;
}

export interface LevelOverride {
  cost?: Cost;
  time?: number;
}
/** Per-scenario changes of single levels, e.g. the Tau Ceti port L1 costs what the canvas shows. */
export type RuleOverrides = Readonly<Record<StructureKind, Readonly<Record<number, LevelOverride>>>>;

const STORAGE_BY_BUILDING = new Map(STORAGE_CLASSES.map((s) => [s.building, s]));

/** Game-facing view of the economy catalog. Pure; one instance per simulation. */
export class Rules {
  private readonly classes = new Map<string, StorageClass>();
  private readonly extractionCache = new Map<StructureKind, Extraction[]>();
  private readonly processCache = new Map<StructureKind, Recipe[]>();

  constructor(
    readonly economy: Economy = computeEconomy(),
    private readonly overrides: RuleOverrides = {},
  ) {
    for (const m of economy.materials) this.classes.set(m.id, m.cls);
  }

  def(kind: StructureKind): BuildingDef {
    return this.economy.building(kind);
  }

  has(kind: StructureKind): boolean {
    return [...this.economy.buildings, ...this.economy.vehicles].some((b) => b.id === kind);
  }

  classOf(material: string): StorageClass {
    return this.classes.get(material) ?? 'sztukowe';
  }

  materialName(code: string): string {
    return this.economy.material(code).name;
  }

  spec(kind: StructureKind, level = 1): StructureSpec {
    const b = this.def(kind);
    const L = Math.max(1, level);
    const o = this.overrides[kind]?.[L];
    const fp = Number(b.fp);
    const p = this.economy.params;
    const storage: Partial<Record<StorageClass, number>> = {};
    const store = STORAGE_BY_BUILDING.get(b.name);
    const grow = Math.pow(p.storageGrowth, L - 1);
    if (store) storage[store.cls] = store.cap * grow;
    if (kind === 'HQ') for (const c of HQ_STORAGE_CLASSES) storage[c] = HQ_STORAGE_L1 * grow;
    return {
      kind,
      name: b.name,
      era: b.era,
      footprint: Number.isFinite(fp) ? fp : 0,
      maxLevel: b.maxL,
      level: L,
      cost: o?.cost ?? this.economy.cost(b, L),
      buildTime: o?.time ?? this.economy.buildTime(b, L),
      power: this.economy.power(b, L),
      crew: this.economy.crew(b, L),
      priority: P1_KINDS.has(kind) ? 1 : b.cat === 'L' ? 3 : 2,
      outputFactor: Math.pow(p.producerPowerGrowth, L - 1),
      storage,
      isSolar: kind === 'SOL',
      needsAtmosphere: kind === 'WND',
      isLandingPad: kind === 'LAND' || kind === 'HQ',
      isHQ: kind === 'HQ',
    };
  }

  /** Surface building the player may order with BUILD (the HQ comes from PLACE_SPACEPORT). */
  isBuildable(kind: StructureKind): boolean {
    if (!this.economy.buildings.some((b) => b.id === kind)) return false;
    const s = this.spec(kind);
    return s.footprint > 0 && s.era <= PLAYABLE_ERA && !s.isHQ;
  }

  buildableKinds(): StructureKind[] {
    return this.economy.buildings.filter((b) => this.isBuildable(b.id)).map((b) => b.id);
  }

  /** Deposit materials an extractor can work, with L1 rates (Kopalnia: FER, KAR, KUP, TYT, URA). */
  extraction(kind: StructureKind): Extraction[] {
    let list = this.extractionCache.get(kind);
    if (!list) {
      const name = this.def(kind).name;
      list = this.economy.recipes
        .filter((r) => r.building === name && Object.keys(r.inp).length === 0 && !r.shipTime)
        .flatMap((r) => Object.entries(r.out).map(([material, q]) => ({ material, rate: q / r.time, recipeId: r.id })));
      this.extractionCache.set(kind, list);
    }
    return list;
  }

  /** Regolith excavators work any tile without a deposit. */
  extractsAnywhere(kind: StructureKind): Extraction | null {
    return this.extraction(kind).find((e) => e.material === 'REG') ?? null;
  }

  /** Recipes with inputs the building runs at L1 (Huta: R_STA, R_MIE). */
  processes(kind: StructureKind): Recipe[] {
    let list = this.processCache.get(kind);
    if (!list) {
      const name = this.def(kind).name;
      list = this.economy.recipes.filter((r) => r.building === name && Object.keys(r.inp).length > 0);
      this.processCache.set(kind, list);
    }
    return list;
  }

  recipe(id: string): Recipe {
    return this.economy.recipe(id);
  }

  /** What terrain does to building: buildable classes, cost and time in % (catalog data). */
  terrain(): TerrainRules {
    return TERRAIN_RULES;
  }

  /** Construction rover (ROV) or another vehicle at L1. */
  vehicle(kind: StructureKind): { cost: Cost; buildTime: number } {
    const b = this.economy.building(kind);
    return { cost: this.economy.cost(b, 1), buildTime: this.economy.buildTime(b, 1) };
  }
}
