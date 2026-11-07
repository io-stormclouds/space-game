// Framework-free API of the Atanor engine for the game (no Angular, no PixiJS, no DOM).
import { cloneArm } from './engine/arm';
import { isPortGlyph } from './engine/glyph';
import { POC_LEVELS } from './engine/levels';
import { RECIPE_LEVELS } from './engine/recipes';
import { SimulationEngine, SimulationOptions } from './engine/simulation';
import { measureThroughput, ThroughputMetrics } from './engine/throughput';
import {
  ArmCommand,
  AtanorLevelKind,
  AtanorSnapshot,
  AtanorSolution,
  Glyph,
  LevelConfig,
  PortGlyph,
  TrackSegment,
} from './engine/types';

/** All levels: the 4 PoC teaching levels, then the economy recipes. */
export const ATANOR_LEVELS: readonly LevelConfig[] = [...POC_LEVELS, ...RECIPE_LEVELS];

export function levelKind(level: LevelConfig): AtanorLevelKind {
  return level.kind ?? 'poc';
}

export function listAtanorLevels(kind?: AtanorLevelKind): readonly LevelConfig[] {
  return kind ? ATANOR_LEVELS.filter(l => levelKind(l) === kind) : ATANOR_LEVELS;
}

/** Economy recipe levels for the Fabryka atanorowa. */
export function listRecipeLevels(): readonly LevelConfig[] {
  return RECIPE_LEVELS;
}

export function getAtanorLevel(id: string): LevelConfig | undefined {
  return ATANOR_LEVELS.find(l => l.id === id);
}

/** Level for an economy recipe id, e.g. `A_NAD`. */
export function findRecipeLevel(recipeId: string): LevelConfig | undefined {
  return RECIPE_LEVELS.find(l => l.recipe?.recipeId === recipeId);
}

/** Input and output ports of a level (fixed; the player builds around them). */
export function getLevelPorts(level: LevelConfig): PortGlyph[] {
  return level.glyphs.filter(isPortGlyph);
}

function cloneGlyph(glyph: Glyph): Glyph {
  return { ...glyph };
}

function cloneTrack(track: TrackSegment): TrackSegment {
  return { id: track.id, path: track.path.map(p => ({ ...p })) };
}

function cloneProgram(program: Readonly<Record<string, readonly (ArmCommand | null)[]>>): Record<string, (ArmCommand | null)[]> {
  const copy: Record<string, (ArmCommand | null)[]> = {};
  for (const [armId, tape] of Object.entries(program)) copy[armId] = [...tape];
  return copy;
}

/** The machine shipped with the level (PoC default solution / recipe reference solution). */
export function getReferenceSolution(level: LevelConfig): AtanorSolution {
  return {
    arms: level.initialArms.map(cloneArm),
    glyphs: level.glyphs.filter(g => !isPortGlyph(g)).map(cloneGlyph),
    tracks: (level.tracks ?? []).map(cloneTrack),
    program: cloneProgram(level.defaultInstructions),
  };
}

/** Nothing built yet: no arms, glyphs, tracks or program. */
export function emptySolution(): AtanorSolution {
  return { arms: [], glyphs: [], tracks: [], program: {} };
}

/** Level ports + player solution as one engine config. Port glyphs in the solution are ignored. */
export function composeLevel(level: LevelConfig, solution: AtanorSolution): LevelConfig {
  return {
    ...level,
    glyphs: [...getLevelPorts(level).map(cloneGlyph), ...solution.glyphs.filter(g => !isPortGlyph(g)).map(cloneGlyph)],
    tracks: solution.tracks.map(cloneTrack),
    initialArms: solution.arms.map(cloneArm),
    defaultInstructions: cloneProgram(solution.program),
  };
}

export interface CreateSimulationOptions extends SimulationOptions {
  /** Player machine; default = the level's reference solution. */
  readonly solution?: AtanorSolution;
}

/**
 * New simulation of `level` running `options.solution` (default: the reference solution).
 * Step it with `sim.step()`, read it with `sim.getSnapshot()` / `sim.getStats()`.
 * `options.boardRadius` (e.g. `getAtanorBuildingLevel(n).boardRadius`) jams atoms and grippers
 * that leave the board (OFF_BOARD); without it the board is unlimited, as in the PoC.
 */
export function createAtanorSimulation(level: LevelConfig, options: CreateSimulationOptions = {}): SimulationEngine {
  const solution = options.solution ?? getReferenceSolution(level);
  return new SimulationEngine(composeLevel(level, solution), {
    ...(options.supply ? { supply: options.supply } : {}),
    ...(options.boardRadius !== undefined ? { boardRadius: options.boardRadius } : {}),
  });
}

/**
 * Steps until the target is reached, the machine jams or starves, or `maxTicks` ticks ran.
 * Returns the final snapshot.
 */
export function runAtanorSimulation(sim: SimulationEngine, maxTicks = 1000): AtanorSnapshot {
  while (sim.ticksExecuted < maxTicks && !sim.isCompleted && !sim.hasCrashed) {
    if (sim.step().starved) break;
  }
  return sim.getSnapshot();
}

/**
 * Steady-state throughput of a solution, measured with unlimited inputs. `options.boardRadius`
 * measures on a bounded board (a machine leaving it reports a JAM with reason OFF_BOARD).
 */
export function measureAtanorSolution(
  level: LevelConfig,
  solution?: AtanorSolution,
  maxTicks = 2000,
  options: { readonly boardRadius?: number } = {}
): ThroughputMetrics {
  const sim = createAtanorSimulation(level, {
    ...(solution ? { solution } : {}),
    ...(options.boardRadius !== undefined ? { boardRadius: options.boardRadius } : {}),
  });
  return measureThroughput(sim, maxTicks);
}

/**
 * Measured metrics in the shape of the economy catalog's `AtanorSpec` ({ level, cycles, area, arms },
 * economy/catalog-data.ts), from which the economy model derives time per product
 * (cycles × takt) and power (base + 0.5 MW/hex + 1 MW/arm). Null when the machine does not produce.
 */
export function toAtanorSpec(
  buildingLevel: number,
  metrics: ThroughputMetrics
): { level: number; cycles: number; area: number; arms: number } | null {
  if (!metrics.ok || metrics.cyclesPerOutput === null) return null;
  return { level: buildingLevel, cycles: metrics.cyclesPerOutput, area: metrics.area, arms: metrics.arms };
}
