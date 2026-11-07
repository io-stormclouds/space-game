import type { StorageClass } from '../../economy';
import { BodyId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { Structure, isWorking } from '../models/structure.model';
import { WorldState, storageOf } from '../reducer';
import { PowerPriority, Rules } from '../rules';

/** Reference orbit of insolation ×1 (Planeta Matka, doc 4.3). */
const REFERENCE_ORBIT = 900;

/** Solar multiplier of a body: explicit, else star luminosity × (900 / orbit of its root planet)². */
export function insolationOf(bodies: ReadonlyArray<CelestialBody>, bodyId: BodyId): number {
  const byId = new Map(bodies.map((b) => [b.id, b]));
  let b = byId.get(bodyId);
  if (!b) return 0;
  if (b.insolation !== undefined) return b.insolation;
  while (b.parentId && byId.get(b.parentId)?.parentId) b = byId.get(b.parentId)!;
  const star = b.parentId ? byId.get(b.parentId) : b;
  const r = b.parentId ? b.orbitRadius : REFERENCE_ORBIT;
  return (star?.luminosity ?? 1) * Math.pow(REFERENCE_ORBIT / Math.max(r, 1), 2);
}

export interface PowerBalance {
  produced: number;
  consumed: number;
  /** produced − consumed. */
  available: number;
  /** Demand per priority. */
  demand: Record<PowerPriority, number>;
  /** Share of the demand each priority gets (1 = full power). */
  efficiency: Record<PowerPriority, number>;
}

/**
 * The level a structure counts at. `committed` also counts what is planned or being built (used to
 * validate orders, so two orders cannot spend the same power); otherwise only what works.
 */
function countedLevel(s: Structure, committed: boolean): number {
  if (committed) return Math.max(s.level, s.targetLevel);
  return isWorking(s) ? s.level : 0;
}

/** Power of one body (doc 4.3): per-body grid, P1 protected, P2 and P3 share what is left. */
export function powerBalance(world: WorldState, rules: Rules, bodyId: BodyId, committed = false): PowerBalance {
  const insolation = insolationOf(world.bodies, bodyId);
  let produced = 0;
  const demand: Record<PowerPriority, number> = { 1: 0, 2: 0, 3: 0 };
  for (const s of world.structures) {
    if (s.bodyId !== bodyId) continue;
    const L = countedLevel(s, committed);
    if (L <= 0) continue;
    const spec = rules.spec(s.kind, L);
    if (spec.power >= 0) produced += spec.isSolar ? spec.power * insolation : spec.power;
    else demand[spec.priority] -= spec.power;
  }
  const consumed = demand[1] + demand[2] + demand[3];
  const share = (need: number, supply: number) => (need <= 0 ? 1 : Math.max(0, Math.min(1, supply / need)));
  const e1 = share(demand[1], produced);
  const rest = Math.max(0, produced - demand[1]);
  const e23 = share(demand[2] + demand[3], rest);
  return { produced, consumed, available: produced - consumed, demand, efficiency: { 1: e1, 2: e23, 3: e23 } };
}

/** Power still missing to add `kind` at `level` (committed balance); 0 when it fits or produces. */
export function powerShortfall(world: WorldState, rules: Rules, bodyId: BodyId, kind: string, level = 1): number {
  const spec = rules.spec(kind, level);
  const prev = level > 1 ? rules.spec(kind, level - 1).power : 0;
  const extra = spec.power - prev;
  if (extra >= 0) return 0;
  return Math.max(0, -extra - powerBalance(world, rules, bodyId, true).available);
}

export interface CrewBalance {
  /** Living space from the HQ and habitats. */
  capacity: number;
  /** Crew the buildings need. */
  demand: number;
  available: number;
}

/** Crew acts as a second power (doc 4.5). */
export function crewBalance(world: WorldState, rules: Rules, bodyId: BodyId, committed = false): CrewBalance {
  let capacity = 0;
  let demand = 0;
  for (const s of world.structures) {
    if (s.bodyId !== bodyId) continue;
    const L = countedLevel(s, committed);
    if (L <= 0) continue;
    const crew = rules.spec(s.kind, L).crew;
    if (crew < 0) capacity -= crew;
    else demand += crew;
  }
  return { capacity, demand, available: capacity - demand };
}

export function crewShortfall(world: WorldState, rules: Rules, bodyId: BodyId, kind: string, level = 1): number {
  const crew = rules.spec(kind, level).crew - (level > 1 ? rules.spec(kind, level - 1).crew : 0);
  if (crew <= 0) return 0;
  return Math.max(0, crew - crewBalance(world, rules, bodyId, true).available);
}

/** Storage capacity of a body per storage class (working storage buildings and the HQ). */
export function storageCapacity(world: WorldState, rules: Rules, bodyId: BodyId): Partial<Record<StorageClass, number>> {
  const cap: Partial<Record<StorageClass, number>> = {};
  for (const s of world.structures) {
    if (s.bodyId !== bodyId || !isWorking(s)) continue;
    for (const [cls, q] of Object.entries(rules.spec(s.kind, s.level).storage)) {
      cap[cls as StorageClass] = (cap[cls as StorageClass] ?? 0) + q;
    }
  }
  return cap;
}

export function storageUse(world: WorldState, rules: Rules, bodyId: BodyId): Partial<Record<StorageClass, number>> {
  const use: Partial<Record<StorageClass, number>> = {};
  for (const [code, q] of Object.entries(storageOf(world, bodyId))) {
    const cls = rules.classOf(code);
    use[cls] = (use[cls] ?? 0) + q;
  }
  return use;
}

/**
 * Free space for `material` on a body. Bodies with no storage building at all keep an unlimited
 * pool, so the PoC test world (no HQ before F1) and outposts still work.
 */
export function freeSpace(world: WorldState, rules: Rules, bodyId: BodyId, material: string): number {
  const cap = storageCapacity(world, rules, bodyId);
  if (Object.keys(cap).length === 0) return Infinity;
  const cls = rules.classOf(material);
  return Math.max(0, (cap[cls] ?? 0) - (storageUse(world, rules, bodyId)[cls] ?? 0));
}

/** Whether all of `add` fits into the body's storage. */
export function fits(world: WorldState, rules: Rules, bodyId: BodyId, add: Readonly<Record<string, number>>): boolean {
  const cap = storageCapacity(world, rules, bodyId);
  if (Object.keys(cap).length === 0) return true;
  const use = storageUse(world, rules, bodyId);
  const need: Partial<Record<StorageClass, number>> = {};
  for (const [code, q] of Object.entries(add)) {
    const cls = rules.classOf(code);
    need[cls] = (need[cls] ?? 0) + q;
  }
  return Object.entries(need).every(([cls, q]) => (use[cls as StorageClass] ?? 0) + q <= (cap[cls as StorageClass] ?? 0));
}

/** Highest HQ level on the body, else anywhere (outposts follow the main colony); 1 without any HQ. */
export function levelCeiling(world: WorldState, bodyId: BodyId): number {
  const hq = world.structures.filter((s) => s.kind === 'HQ' && s.level > 0);
  const own = hq.filter((s) => s.bodyId === bodyId);
  const pool = own.length ? own : hq;
  return pool.length ? Math.max(...pool.map((s) => s.level)) : 1;
}
