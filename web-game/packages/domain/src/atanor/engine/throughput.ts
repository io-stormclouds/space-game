// Throughput metrics of an Atanor machine (doc §8.4, §8.5 p. 3, POC-5 recommendation B):
// "cycles per product in steady state". New in web-game (the PoC had no such metric).
//
// A machine is deterministic, so once its full state (playhead, arms, atoms, bonds) repeats it
// loops forever. The loop length divided by the products delivered in it is the steady-state
// cycles per product, independent of warm-up and of `targetRequired`.
import { hexKey } from '../grid/hex';
import { JamReason } from './types';
import { SimulationEngine } from './simulation';

export type ThroughputProblem =
  /** The machine jammed before its loop was found. */
  | 'JAM'
  /** The machine loops without delivering anything. */
  | 'NO_OUTPUT'
  /** No repeated state within `maxTicks`. */
  | 'NO_LOOP'
  /** An input ran dry (only with finite supply; measure with unlimited inputs instead). */
  | 'STARVED';

export interface ThroughputMetrics {
  readonly ok: boolean;
  readonly problem: ThroughputProblem | null;
  readonly jam: { readonly reason: JamReason; readonly message: string } | null;
  /** Steady-state ticks per delivered product (may be fractional). */
  readonly cyclesPerOutput: number | null;
  /** Length of the repeating loop in ticks. */
  readonly periodTicks: number | null;
  /** Products delivered per loop. */
  readonly outputsPerPeriod: number | null;
  /** Ticks before the loop starts. */
  readonly warmupTicks: number | null;
  /** Tick of the first delivery. */
  readonly firstOutputTick: number | null;
  /** Tick on which `targetRequired` products were delivered (OM-style "cycles"). */
  readonly ticksToTarget: number | null;
  /** Steady-state material units taken from inputs per product. */
  readonly inputsPerOutput: Record<string, number> | null;
  /** PoC area (unique hexes visited by bases, grippers and atoms) over the measured run. */
  readonly area: number;
  readonly arms: number;
  /** PoC cost points. */
  readonly cost: number;
  readonly ticksSimulated: number;
}

/**
 * Canonical machine state without atom IDs (IDs keep growing). Two states with the same key
 * evolve identically.
 */
export function machineStateKey(engine: SimulationEngine): string {
  const graph = engine.getGraph();
  const posOf = (atomId: string | null): string => {
    const atom = atomId ? graph.getAtom(atomId) : undefined;
    return atom ? hexKey(atom.pos) : '-';
  };
  const arms = [...engine.getArms()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(a => `${a.id}@${hexKey(a.basePos)}/${a.rotation}/${a.length}/${a.trackIndex ?? ''}/${a.isHolding ? posOf(a.heldAtomId) : '-'}`);
  const atoms = graph.getAtoms().map(a => `${hexKey(a.pos)}:${a.element}`).sort();
  const bonds = graph
    .getBonds()
    .map(b => {
      const p1 = posOf(b.atom1Id);
      const p2 = posOf(b.atom2Id);
      return p1 < p2 ? `${p1}~${p2}` : `${p2}~${p1}`;
    })
    .sort();
  return `${engine.currentCycle}|${arms.join(';')}|${atoms.join(';')}|${bonds.join(';')}`;
}

function diffPerOutput(now: Record<string, number>, before: Record<string, number>, outputs: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [material, units] of Object.entries(now)) {
    const delta = units - (before[material] ?? 0);
    if (delta !== 0) result[material] = delta / outputs;
  }
  return result;
}

/**
 * Resets `engine` and runs it until its loop is found and the target is reached (or it jams,
 * starves or hits `maxTicks`). Use an engine with unlimited inputs.
 */
export function measureThroughput(engine: SimulationEngine, maxTicks = 2000): ThroughputMetrics {
  engine.reset();
  const seen = new Map<string, { tick: number; delivered: number; consumed: Record<string, number> }>();
  seen.set(machineStateKey(engine), { tick: 0, delivered: 0, consumed: engine.getConsumed() });

  let loop: { start: number; period: number; outputs: number; inputs: Record<string, number> | null } | null = null;
  let problem: ThroughputProblem | null = null;

  while (engine.ticksExecuted < maxTicks) {
    const result = engine.step();
    if (result.starved) {
      problem = 'STARVED';
      break;
    }
    if (engine.hasCrashed) {
      problem = 'JAM';
      break;
    }
    if (!loop) {
      const key = machineStateKey(engine);
      const previous = seen.get(key);
      if (previous) {
        const outputs = engine.productsDelivered - previous.delivered;
        loop = {
          start: previous.tick,
          period: engine.ticksExecuted - previous.tick,
          outputs,
          inputs: outputs > 0 ? diffPerOutput(engine.getConsumed(), previous.consumed, outputs) : null,
        };
        if (outputs === 0) {
          problem = 'NO_OUTPUT';
          break;
        }
      } else {
        seen.set(key, { tick: engine.ticksExecuted, delivered: engine.productsDelivered, consumed: engine.getConsumed() });
      }
    }
    if (loop && engine.isCompleted) break;
  }
  if (!loop && !problem) problem = 'NO_LOOP';

  const stats = engine.getStats();
  const deliveries = engine.getDeliveryTicks();
  const productive = loop !== null && loop.outputs > 0;
  return {
    ok: problem === null,
    problem,
    jam: engine.hasCrashed ? { reason: engine.jamReason ?? 'ATOM_COLLISION', message: engine.crashMessage ?? '' } : null,
    cyclesPerOutput: productive && loop ? loop.period / loop.outputs : null,
    periodTicks: loop ? loop.period : null,
    outputsPerPeriod: loop ? loop.outputs : null,
    warmupTicks: loop ? loop.start : null,
    firstOutputTick: deliveries.length > 0 ? deliveries[0] : null,
    ticksToTarget: engine.completedAtTick,
    inputsPerOutput: productive && loop ? loop.inputs : null,
    area: stats.area,
    arms: stats.arms,
    cost: stats.cost,
    ticksSimulated: engine.ticksExecuted,
  };
}
