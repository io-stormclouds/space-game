import * as Atanor from '../../atanor';
import { fits, powerBalance } from '../economy/colony';
import type { AtanorMachine, AtanorProgramMetrics } from '../models/atanor-machine.model';
import { DomainEvent } from '../models/domain-event.model';
import { Cost, Stockpile, canAfford } from '../models/resource.model';
import { Structure, isWorking } from '../models/structure.model';
import { WorldState, machineOf, patchMachine, storageOf } from '../reducer';
import { Rules } from '../rules';

/** The Fabryka atanorowa (building kind of the Atanor machines). */
export const ATANOR_KIND = 'ATN';
/** At most this many engine ticks per machine in one simulation step (against long frames). */
const MAX_TICKS_PER_STEP = 240;

interface CachedEngine {
  key: string;
  engine: Atanor.SimulationEngine;
}

export interface AtanorUpdate {
  world: WorldState;
  events: DomainEvent[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Positive part of a − b per material. */
function minus(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Cost {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a)) {
    const d = round(v - (b[k] ?? 0));
    if (d > 0) out[k] = d;
  }
  return out;
}

function nonEmpty(s: Readonly<Record<string, number>>): boolean {
  return Object.values(s).some((v) => v > 0);
}

/**
 * Production of the Fabryka atanorowa from the player's machine (AT4, A17,
 * docs/atanor-expansion-design.md §3.2–3.3). Each deployed program runs on the real Atanor engine:
 * one tick every `atanorTick[level]` minutes × power efficiency (Z4) × 50 % while upgrading.
 * A tick runs only when the body's storage holds a portion for every input port of each material
 * (the ports refill at the end of a tick) and the product fits (Z3); otherwise the machine waits.
 * Waiting skips time, not commands, so the engine state is a function of the ticks run: the same
 * as the trial's, and rebuilt by replaying them after a load. Atoms entering the machine leave
 * storage; delivered molecules arrive as products.
 */
export class AtanorSystem {
  private readonly engines = new Map<string, CachedEngine>();

  constructor(private readonly rules: Rules) {}

  /** Board of a building level (§8.1). */
  private boardRadius(level: number): number | undefined {
    return Atanor.getAtanorBuildingLevel(level)?.boardRadius;
  }

  levelOf(recipe: string): Atanor.LevelConfig | undefined {
    return Atanor.findRecipeLevel(recipe);
  }

  /** Extra power of a program (§8.1: 0.5 MW per hex of area, 1 MW per arm on top of the building). */
  private metricsOf(m: Atanor.ThroughputMetrics): AtanorProgramMetrics {
    const p = this.rules.economy.params;
    return { cyclesPerOutput: m.cyclesPerOutput!, area: m.area, arms: m.arms, extraPower: round(p.atanorPowerPerHex * m.area + p.atanorPowerPerArm * m.arms) };
  }

  /** Value of materials [kr] at the base values of the economy model. */
  private valueOf(cost: Cost): number {
    return Object.entries(cost).reduce((s, [code, q]) => s + q * (this.rules.economy.values.get(code)?.V ?? 0), 0);
  }

  saveDraft(world: WorldState, structureId: string, solution: Atanor.AtanorSolution): DomainEvent {
    const s = world.structures.find((x) => x.id === structureId);
    if (!s || s.kind !== ATANOR_KIND) return { type: 'COMMAND_REJECTED', reason: 'NO_STRUCTURE' };
    return { type: 'ATANOR_DRAFT_SAVED', structureId, recipe: s.recipe ?? 'A_NAD', solution };
  }

  /**
   * Deploys a program (§3.2): checked against the building level and measured (it must reach a
   * repeating cycle with deliveries); the materials of new elements are paid now, removed ones
   * return when it is ready (A18), and the time grows with the value of the machine (A19).
   */
  deploy(world: WorldState, structureId: string, solution: Atanor.AtanorSolution): DomainEvent {
    const s = world.structures.find((x) => x.id === structureId);
    if (!s || s.kind !== ATANOR_KIND || !isWorking(s)) return { type: 'COMMAND_REJECTED', reason: 'NO_STRUCTURE' };
    const recipe = s.recipe ?? 'A_NAD';
    const level = this.levelOf(recipe);
    if (!level) return { type: 'COMMAND_REJECTED', reason: 'NO_RECIPE', detail: recipe };
    const m = machineOf(world, s.id, recipe);
    if (m.deploy) return { type: 'COMMAND_REJECTED', reason: 'BUSY' };
    const issues = Atanor.validateMachine(level, solution, s.level);
    if (issues.length) return { type: 'COMMAND_REJECTED', reason: 'MACHINE_INVALID', detail: issues[0]!.message };
    const program = Atanor.programIssues(solution);
    if (program.length) return { type: 'COMMAND_REJECTED', reason: 'MACHINE_INVALID', detail: `${program[0]!.armId} @${program[0]!.column}: ${program[0]!.code}` };
    const radius = this.boardRadius(s.level);
    const measured = Atanor.measureAtanorSolution(level, solution, 2000, radius !== undefined ? { boardRadius: radius } : {});
    if (!measured.ok || measured.cyclesPerOutput === null) return { type: 'COMMAND_REJECTED', reason: 'MACHINE_NOT_PRODUCING', detail: measured.problem ?? undefined };

    const before = m.program ? Atanor.machineMaterials(m.program) : {};
    const after = Atanor.machineMaterials(solution);
    const cost = minus(after, before);
    const refund = minus(before, after);
    if (!canAfford(storageOf(world, s.bodyId), cost)) {
      const pool = storageOf(world, s.bodyId);
      const short = Object.entries(cost).filter(([k, q]) => (pool[k] ?? 0) < q).map(([k, q]) => `${k} ${round(q - (pool[k] ?? 0))}`);
      return { type: 'COMMAND_REJECTED', reason: 'NO_RESOURCES', detail: `brakuje ${short.join(' · ')}` };
    }
    const minutes = Math.max(1, round(this.valueOf(cost) * this.rules.economy.params.atanorDeployMinPerKr));
    return {
      type: 'ATANOR_DEPLOY_STARTED',
      structureId: s.id,
      recipe,
      cost,
      deployment: { solution, metrics: this.metricsOf(measured), remaining: minutes, total: minutes, refund },
    };
  }

  update(world: WorldState, dt: number): AtanorUpdate {
    const events: DomainEvent[] = [];
    let next = world;
    const pools = new Map<string, Stockpile>();
    const pool = (bodyId: string) => pools.get(bodyId) ?? storageOf(next, bodyId as never);
    for (const s of world.structures) {
      if (s.kind !== ATANOR_KIND || !isWorking(s)) continue;
      const m = world.machines?.[s.id];
      if (!m) continue;
      const speed = powerBalance(next, this.rules, s.bodyId).efficiency[this.rules.spec(s.kind, s.level).priority] * (s.state === 'UPGRADING' ? 0.5 : 1);
      let machine: AtanorMachine = m;

      // deployment in progress: the old program keeps working (§3.2)
      if (machine.deploy) {
        const remaining = round(machine.deploy.remaining - dt);
        if (remaining <= 0) {
          const returned = this.returned(machine);
          events.push({ type: 'ATANOR_DEPLOYED', structureId: s.id, returned });
          this.engines.delete(s.id);
          continue; // the new program starts in the next step
        }
        machine = { ...machine, deploy: { ...machine.deploy, remaining } };
      }

      if (machine.program && machine.state !== 'JAM') machine = this.work(s, machine, dt * speed, pool(s.bodyId), next, events, pools);
      if (machine !== m) next = patchMachine(next, s.id, machine.recipe, () => machine);
    }
    return { world: next, events };
  }

  /** Atoms inside the machine go back to storage (A23) with the refund of removed elements (A18). */
  private returned(m: AtanorMachine): Stockpile {
    const level = this.levelOf(m.recipe);
    const perProduct = level?.recipe?.inputs ?? {};
    const inside: Record<string, number> = {};
    for (const [code, q] of Object.entries(m.consumed)) {
      const left = round(q - (perProduct[code] ?? 0) * m.delivered);
      if (left > 0) inside[code] = left;
    }
    const out: Record<string, number> = { ...inside };
    for (const [code, q] of Object.entries(m.deploy?.refund ?? {})) out[code] = round((out[code] ?? 0) + q);
    return out;
  }

  /** Runs the ticks due in this step; storage changes go out as ATANOR_CONSUMED / ATANOR_DELIVERED. */
  private work(s: Structure, m: AtanorMachine, work: number, start: Stockpile, world: WorldState, events: DomainEvent[], pools: Map<string, Stockpile>): AtanorMachine {
    const level = this.levelOf(m.recipe);
    if (!level || !m.program || !m.metrics) return m;
    const engine = this.engine(s, m, level);
    const tick = this.rules.economy.params.atanorTick[Math.max(1, s.level)] ?? 1;
    let progress = m.progress + work / tick;
    // the most one tick can take: a portion for every input port of a material (they refill together)
    const refill: Record<string, number> = {};
    for (const g of Atanor.getLevelPorts(level)) if (g.type === 'INPUT') refill[g.element] = (refill[g.element] ?? 0) + (g.portion ?? 1);
    // room for what all outputs can deliver in one tick; each delivery credits the recipe's output
    const product: Record<string, number> = {};
    for (const g of Atanor.getLevelPorts(level)) if (g.type === 'OUTPUT' && g.product) product[g.product.material] = (product[g.product.material] ?? 0) + g.product.quantity;
    const perDelivery: Readonly<Record<string, number>> = level.recipe?.outputs ?? product;

    let poolNow: Record<string, number> = { ...start };
    let charged: Record<string, number> = { ...m.consumed };
    const consumedTotal = (): Record<string, number> => engine.getConsumed();
    const pending = () => minus(consumedTotal(), charged); // atoms already on the ports, not yet paid
    let state: AtanorMachine['state'] = 'RUNNING';
    let ticks = m.ticks;
    let delivered = 0;
    const deliveredBefore = engine.productsDelivered;
    let consumedNow: Record<string, number> = {};
    for (let n = 0; progress >= 1 && n < MAX_TICKS_PER_STEP; n++) {
      const need: Record<string, number> = { ...pending() };
      for (const [k, q] of Object.entries(refill)) need[k] = round((need[k] ?? 0) + q);
      if (!canAfford(poolNow, need)) {
        state = 'WAITING';
        break;
      }
      const probe = { ...world, storage: { ...world.storage, [s.bodyId]: poolNow } };
      if (!fits(probe, this.rules, s.bodyId, product)) {
        state = 'FULL';
        break;
      }
      const step = engine.step();
      ticks += 1;
      progress -= 1;
      // pay for the atoms that entered (initial ones included), credit the delivered products
      const paid = pending();
      poolNow = Object.fromEntries(Object.entries({ ...poolNow }).map(([k, v]) => [k, round(v - (paid[k] ?? 0))]));
      for (const [k, q] of Object.entries(paid)) consumedNow[k] = round((consumedNow[k] ?? 0) + q);
      charged = { ...consumedTotal() };
      const made = engine.productsDelivered - deliveredBefore - delivered;
      if (made > 0) {
        delivered += made;
        poolNow = { ...poolNow };
        for (const [k, q] of Object.entries(perDelivery)) poolNow[k] = round((poolNow[k] ?? 0) + q * made);
      }
      if (step.collisionDetected || engine.hasCrashed) {
        state = 'JAM';
        break;
      }
    }
    if (state !== 'RUNNING') progress = Math.min(progress, 1);
    pools.set(s.bodyId, poolNow);
    if (nonEmpty(consumedNow)) events.push({ type: 'ATANOR_CONSUMED', structureId: s.id, consumed: consumedNow });
    if (delivered > 0) {
      const produced: Record<string, number> = {};
      for (const [k, q] of Object.entries(perDelivery)) produced[k] = round(q * delivered);
      events.push({ type: 'ATANOR_DELIVERED', structureId: s.id, produced, count: delivered });
    }
    // consumed and delivered totals are applied by the reducer from the events above
    return { ...m, ticks, progress: round(progress), state };
  }

  /** The machine's engine at `m.ticks`: cached, or rebuilt by replaying the ticks (after a load). */
  private engine(s: Structure, m: AtanorMachine, level: Atanor.LevelConfig): Atanor.SimulationEngine {
    const key = `${m.recipe}|${Atanor.solutionKey(m.program!)}`;
    const cached = this.engines.get(s.id);
    if (cached && cached.key === key && cached.engine.ticksExecuted === m.ticks) return cached.engine;
    const radius = this.boardRadius(s.level);
    const engine = Atanor.createAtanorSimulation(level, { solution: m.program!, ...(radius !== undefined ? { boardRadius: radius } : {}) });
    for (let i = 0; i < m.ticks; i++) engine.step();
    this.engines.set(s.id, { key, engine });
    return engine;
  }
}
