// Readout of the Atanor view for the HUD (pure; no PixiJS).
import { Atanor } from '@space-game/domain';

export interface AtanorReadout {
  levelId: string;
  levelName: string;
  kind: Atanor.AtanorLevelKind;
  /** Economy recipe id ('A_NAD'), null for the PoC teaching levels. */
  recipeId: string | null;
  /** Minimum Fabryka atanorowa level for the recipe, null for PoC levels. */
  buildingLevel: number | null;
  /** Level of the building the machine stands in; null in the sandbox (AT1). */
  siteLevel: number | null;
  playing: boolean;
  ticksPerSecond: number;
  /** Ticks executed since reset (CYKLE; never wraps, W09). */
  ticks: number;
  /** Timeline slot the next tick executes (the playhead; wraps on REPEAT). */
  timelinePosition: number;
  delivered: number;
  target: number;
  completed: boolean;
  completedAtTick: number | null;
  jam: { reason: Atanor.JamReason; message: string } | null;
  starved: boolean;
  /** Steady-state ticks per product of the running solution (A13: may be fractional). */
  cyclesPerOutput: number | null;
  periodTicks: number | null;
  outputsPerPeriod: number | null;
  warmupTicks: number | null;
  /** Why the throughput could not be measured (JAM, NO_OUTPUT, NO_LOOP, STARVED). */
  throughputProblem: Atanor.ThroughputProblem | null;
  /** Area of the solution (measured run, PoC definition with the W09 output-hex fix). */
  area: number;
  /** Area visited so far in this run. */
  areaSoFar: number;
  arms: number;
  /** PoC cost points. */
  cost: number;
  /** Steady-state input units per product. */
  inputsPerOutput: Record<string, number> | null;
  /** Economy products credited since reset (e.g. { NAD: 3 }). */
  produced: Record<string, number>;
  /** Input units taken since reset. */
  consumed: Record<string, number>;
  /** Provisional numbers of the economy doc §8.3, for comparison (A3). */
  docReference: { cycles: number; area: number; arms: number } | null;
  /** Measured numbers in the shape of the economy catalogue's AtanorSpec. */
  spec: { level: number; cycles: number; area: number; arms: number } | null;
}

export interface ReadoutSource {
  level: Atanor.LevelConfig;
  snapshot: Atanor.AtanorSnapshot;
  stats: Atanor.SimulationStats;
  metrics: Atanor.ThroughputMetrics | null;
  playing: boolean;
  ticksPerSecond: number;
  siteLevel?: number | null;
}

export function toReadout(src: ReadoutSource): AtanorReadout {
  const { level, snapshot: s, stats, metrics: m } = src;
  const buildingLevel = level.recipe?.buildingLevel ?? null;
  return {
    levelId: level.id,
    levelName: level.name,
    kind: Atanor.levelKind(level),
    recipeId: level.recipe?.recipeId ?? null,
    buildingLevel,
    siteLevel: src.siteLevel ?? null,
    playing: src.playing,
    ticksPerSecond: src.ticksPerSecond,
    ticks: s.ticks,
    timelinePosition: s.timelinePosition,
    delivered: s.delivered,
    target: s.target,
    completed: s.completed,
    completedAtTick: s.completedAtTick,
    jam: s.jam ? { reason: s.jam.reason, message: s.jam.message } : null,
    starved: s.starved,
    cyclesPerOutput: m?.cyclesPerOutput ?? null,
    periodTicks: m?.periodTicks ?? null,
    outputsPerPeriod: m?.outputsPerPeriod ?? null,
    warmupTicks: m?.warmupTicks ?? null,
    throughputProblem: m?.problem ?? null,
    area: m ? m.area : stats.area,
    areaSoFar: stats.area,
    arms: stats.arms,
    cost: stats.cost,
    inputsPerOutput: m?.inputsPerOutput ? { ...m.inputsPerOutput } : null,
    produced: { ...s.produced },
    consumed: { ...s.consumed },
    docReference: level.recipe ? { ...level.recipe.docReference } : null,
    spec: m && buildingLevel !== null ? Atanor.toAtanorSpec(buildingLevel, m) : null,
  };
}

export interface TickClock {
  /** Progress 0..1 of the animation of the latest tick (1 = at rest). */
  phase: number;
}

/**
 * Advances the tick clock by `dt` seconds at `ticksPerSecond`. Returns how many engine ticks
 * are due now (at most `maxTicks`); the caller runs them and stops early when the engine stops.
 */
export function dueTicks(clock: TickClock, dt: number, ticksPerSecond: number, maxTicks = 240): number {
  clock.phase += Math.max(0, dt) * Math.max(0, ticksPerSecond);
  let n = 0;
  while (clock.phase >= 1 && n < maxTicks) {
    clock.phase -= 1;
    n += 1;
  }
  if (n >= maxTicks) clock.phase = Math.min(clock.phase, 0.999);
  return n;
}

/** Ticks per second at the PoC's 1× (600 ms per tick). */
export const POC_TICKS_PER_SECOND = 1000 / 600;

export function clampTicksPerSecond(n: number): number {
  if (!Number.isFinite(n)) return POC_TICKS_PER_SECOND;
  return Math.max(0.1, Math.min(120, n));
}
