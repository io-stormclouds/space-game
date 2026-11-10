import type {
  Availability,
  BuildPreview,
  CatalogBuilding,
  CatalogLevel,
  CatalogView,
  CommandResult,
  EconomyReport,
  FrameData,
  GameSnapshot,
  RecordedCommand,
  ReplayResult,
  SaveFile,
  ScenarioId,
  StepStats,
  Tempo,
  TileInfo,
} from '@space-game/api';
import {
  POC_SCENARIO,
  SECONDS_PER_MODEL_MINUTE,
  Simulation,
  TAU_CETI_SCENARIO,
  DEFAULT_ECONOMY_PARAMS,
  colonyObjectives,
  computeEconomy,
  economyTables,
  footprintTiles,
  nominalFlows,
  type NominalFlows,
  STARS,
  scaleTime,
  tileId as tileIdOf,
  tileIndexOf,
  tileTerrain,
  topTile,
  type BodyId,
  type ColonyReadout,
  type Command,
  type Cost,
  type DomainEvent,
  type EconomyParams,
  type Scenario,
  type WorldState,
} from '@space-game/domain';
import { DEFAULT_GALAXY_OPTIONS, GalaxySim, type GalaxySimOptions, type GalaxySimState } from './galaxy-sim';
import { buildFactory } from './factory';
import { LOAD_SPECS, buildLoad, type LoadLevel } from './load';

export const SCENARIOS: Readonly<Record<ScenarioId, Scenario>> = {
  'tau-ceti': TAU_CETI_SCENARIO,
  'planeta-matka': POC_SCENARIO,
  fabryka: TAU_CETI_SCENARIO,
  'load-s': LOAD_SPECS.S.base,
  'load-m': LOAD_SPECS.M.base,
  'load-l': LOAD_SPECS.L.base,
};

const LOAD_LEVELS: Partial<Record<ScenarioId, LoadLevel>> = { 'load-s': 'S', 'load-m': 'M', 'load-l': 'L' };

export interface MockServerOptions {
  /** Real seconds per fixed step. */
  stepSeconds?: number;
  /** Upper bound of steps per `advance` call (against the spiral of death). */
  maxStepsPerAdvance?: number;
  galaxy?: GalaxySimOptions;
  /** Clock for step timing (performance.now in browsers and workers). */
  now?: () => number;
}

interface Meta {
  galaxy: GalaxySimState;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The mock game server (W03 A). Fixed-step simulation: each step advances
 * `stepSeconds × tempo / 60` model minutes. Commands are applied between steps and logged with the
 * step index, so `replay` reproduces the world exactly. Framework-free; the worker wraps it.
 */
export class MockServer {
  readonly stepSeconds: number;
  private readonly maxSteps: number;
  private readonly clock: () => number;
  private readonly galaxyOptions: GalaxySimOptions;
  private scenarioId: ScenarioId = 'tau-ceti';
  private economyParams: EconomyParams | undefined;
  private sim!: Simulation;
  private galaxy!: GalaxySim;
  private tempo: Tempo = 60;
  private tempos: Array<{ step: number; tempo: Tempo }> = [];
  private paused = false;
  private stepIndex = 0;
  private commands: RecordedCommand[] = [];
  private accumulator = 0;
  private readonly timings: Array<{ at: number; ms: number }> = [];

  constructor(opts: MockServerOptions = {}) {
    this.stepSeconds = opts.stepSeconds ?? 1 / 60;
    this.maxSteps = opts.maxStepsPerAdvance ?? 8;
    this.clock = opts.now ?? now;
    this.galaxyOptions = opts.galaxy ?? DEFAULT_GALAXY_OPTIONS;
    this.start('tau-ceti');
  }

  get simulation(): Simulation {
    return this.sim;
  }

  /** Model minutes one step advances at the current tempo. */
  get stepMinutes(): number {
    return (this.stepSeconds * this.tempo) / SECONDS_PER_MODEL_MINUTE;
  }

  start(scenarioId: ScenarioId, economy?: EconomyParams, tempo: Tempo = 60): GameSnapshot {
    const scenario = SCENARIOS[scenarioId];
    if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
    this.scenarioId = scenarioId;
    this.economyParams = economy;
    const eco = computeEconomy(economy);
    const level = LOAD_LEVELS[scenarioId];
    this.sim = level ? buildLoad(level, eco) : scenarioId === 'fabryka' ? buildFactory(eco) : new Simulation(scenario, { economy: eco });
    this.galaxy = new GalaxySim(eco, level === 'S' || !level ? this.galaxyOptions : { ...this.galaxyOptions, players: level === 'L' ? 60 : 12 });
    this.tempo = tempo;
    this.tempos = [{ step: 0, tempo }];
    this.stepIndex = 0;
    this.commands = [];
    this.accumulator = 0;
    this.paused = false;
    return this.snapshot();
  }

  /** Applies a command now, between steps, and records it for replay. */
  command(cmd: Command): CommandResult {
    this.commands.push({ step: this.stepIndex, command: structuredClone(cmd) });
    const events = this.sim.dispatch(cmd);
    return { ok: !events.some((e) => e.type === 'COMMAND_REJECTED'), events };
  }

  setTempo(tempo: Tempo): void {
    if (!(tempo > 0)) throw new Error(`tempo must be positive: ${tempo}`);
    if (tempo === this.tempo) return;
    this.tempo = tempo;
    const last = this.tempos[this.tempos.length - 1]!;
    if (last.step === this.stepIndex) last.tempo = tempo;
    else this.tempos.push({ step: this.stepIndex, tempo });
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Runs one fixed step regardless of pause. */
  step(): DomainEvent[] {
    const t0 = this.clock();
    const events = this.sim.step(this.stepMinutes);
    this.galaxy.advance(this.sim.time);
    this.stepIndex++;
    const t1 = this.clock();
    this.timings.push({ at: t1, ms: t1 - t0 });
    while (this.timings.length && t1 - this.timings[0]!.at > 1000) this.timings.shift();
    return events;
  }

  /** Runs `n` steps (used while paused: "krok"). */
  stepMany(n: number): DomainEvent[] {
    const out: DomainEvent[] = [];
    for (let i = 0; i < n; i++) out.push(...this.step());
    return out;
  }

  /** Real time passed → fixed steps (unless paused). Excess beyond `maxStepsPerAdvance` is dropped. */
  advance(realSeconds: number): DomainEvent[] {
    if (this.paused) return [];
    this.accumulator += Math.max(0, realSeconds);
    const n = Math.min(this.maxSteps, Math.floor(this.accumulator / this.stepSeconds + 1e-9));
    this.accumulator = n === this.maxSteps ? 0 : this.accumulator - n * this.stepSeconds;
    return this.stepMany(n);
  }

  stats(): StepStats {
    const n = this.timings.length;
    const meanMs = n ? this.timings.reduce((s, x) => s + x.ms, 0) / n : 0;
    const maxMs = n ? Math.max(...this.timings.map((x) => x.ms)) : 0;
    return {
      meanMs,
      maxMs,
      stepsPerSecond: n,
      minutesPerSecond: this.paused ? 0 : this.tempo / SECONDS_PER_MODEL_MINUTE,
    };
  }

  snapshot(): GameSnapshot {
    const world = this.sim.world;
    const colonies: Record<BodyId, ColonyReadout> = {};
    const bodies = new Set<BodyId>([
      ...world.structures.map((s) => s.bodyId),
      ...(Object.keys(world.storage) as BodyId[]),
    ]);
    for (const b of bodies) colonies[b] = this.sim.colonyOf(b);
    return {
      scenarioId: this.scenarioId,
      world,
      colonies,
      objectives: colonyObjectives(world, this.sim.rules, this.sim.grids),
      players: this.galaxy.players(),
      hubs: this.galaxy.hubs(),
      tempo: this.tempo,
      paused: this.paused,
      step: this.stepIndex,
      stats: this.stats(),
    };
  }

  /** F6: document tables (default parameters) next to the tables of `params` (default: the running economy). */
  economyReport(params?: EconomyParams): EconomyReport {
    const current = params ? computeEconomy(params) : this.sim.rules.economy;
    return {
      params: current.params,
      defaults: DEFAULT_ECONOMY_PARAMS,
      doc: economyTables(this.docEconomy),
      current: economyTables(current),
    };
  }

  private readonly docEconomy = computeEconomy();

  nominalFlows(bodyId: BodyId): NominalFlows {
    return nominalFlows(this.sim.world, this.sim.rules, this.sim.grids, bodyId);
  }

  catalog(): CatalogView {
    const rules = this.sim.rules;
    const eco = rules.economy;
    const buildings: CatalogBuilding[] = [...eco.buildings, ...eco.vehicles].map((b) => {
      const levels: CatalogLevel[] = [];
      for (let L = 1; L <= b.maxL; L++) {
        const s = rules.spec(b.id, L);
        levels.push({ level: L, cost: s.cost, buildTime: s.buildTime, power: s.power, crew: s.crew, storage: s.storage, outputFactor: s.outputFactor });
      }
      return {
        id: b.id,
        name: b.name,
        era: b.era,
        category: b.cat,
        footprint: rules.spec(b.id).footprint,
        maxLevel: b.maxL,
        buildable: rules.isBuildable(b.id),
        levels,
        extracts: rules.extraction(b.id).map((e) => ({ material: e.material, rate: e.rate })),
        recipes: rules.processes(b.id).map((r) => r.id),
      };
    });
    const c = this.sim.scenario.colonization;
    return {
      stars: STARS.map((s) => ({
        name: s.name,
        spectralClass: s.spectralClass,
        distance: s.distance,
        luminosity: s.luminosity,
        temperature: s.temperature,
        planets: s.planets ?? 0,
        color: s.color,
        description: s.description,
        pos: s.pos,
      })),
      materials: eco.materials.map((m) => ({ id: m.id, name: m.name, tier: m.tier, cls: m.cls, unit: m.unit })),
      buildings,
      recipes: eco.recipes.map((r) => ({ id: r.id, building: r.building, inp: r.inp, out: r.out, time: r.time, power: r.power })),
      rover: rules.vehicle('ROV'),
      colonization: {
        scanMinutes: c.scanMinutes,
        portCost: c.portCost,
        portBuildMinutes: c.portBuildMinutes,
        shuttleCapacity: c.shuttleCapacity,
        shuttleTripMinutes: c.shuttleTripMinutes,
      },
      terrain: rules.terrain(),
    };
  }

  availability(bodyId: BodyId, kinds: string[]): Record<string, Availability> {
    const out: Record<string, Availability> = {};
    for (const key of kinds) {
      // "MIN@2" asks about level 2 (upgrades); plain ids about level 1.
      const [kind, level] = key.split('@') as [string, string | undefined];
      const a = this.sim.builder.availability(this.sim.world, bodyId, kind, level ? Number(level) : 1);
      const kindKey = key;
      out[kindKey] = a.ok ? { ok: true } : { ok: false, reason: a.reason, ...(a.detail ? { detail: a.detail } : {}) };
    }
    return out;
  }

  /**
   * Placement ghost: BUILD check, or the spaceport check for the pseudo-kind 'PORT'. Past the terrain
   * stage it adds the terrain-adjusted `cost` and `buildTime` (also when a later stage rejects).
   */
  previewBuild(bodyId: BodyId, tileIndex: number, kind: string, rotation: number): BuildPreview {
    const tileId = tileIdOf(bodyId, tileIndex);
    const grid = this.sim.grids.get(bodyId);
    const rules = this.sim.rules;
    const priced = (k: string, c: { cost?: Cost; timePct?: number }) =>
      c.cost && c.timePct !== undefined ? { cost: c.cost, buildTime: scaleTime(rules.spec(k, 1).buildTime, c.timePct) } : {};
    if (kind === 'PORT') {
      const check = this.sim.colony.checkSpaceport(this.sim.world, bodyId, tileId, rotation);
      const tiles = grid ? footprintTiles(grid, tileIndex, rules.spec('HQ').footprint, rotation) ?? [] : [];
      return check.ok
        ? { ok: true, tiles, ...priced('HQ', check) }
        : { ok: false, reason: check.reason, ...(check.detail ? { detail: check.detail } : {}), tiles, ...priced('HQ', check) };
    }
    const check = this.sim.builder.check(this.sim.world, bodyId, tileId, kind, rotation);
    if (check.ok) return { ok: true, tiles: check.tiles.map(tileIndexOf), ...priced(kind, check) };
    const size = rules.has(kind) ? rules.spec(kind).footprint : 1;
    const tiles = grid ? footprintTiles(grid, tileIndex, size, rotation) ?? [] : [];
    return { ok: false, reason: check.reason, ...(check.detail ? { detail: check.detail } : {}), tiles, ...priced(kind, check) };
  }

  /**
   * One surface tile for the tile panel (3D PoC `tile-panel`): shape, deposit with what is left,
   * terrain (class, road, cost and time %), what stands on it, and every buildable kind checked here
   * (rotation 0), extractors with the material they would take from this tile.
   */
  tileInfo(bodyId: BodyId, tileIndex: number): TileInfo | null {
    const tile = this.sim.grids.get(bodyId)?.tiles[tileIndex];
    if (!tile) return null;
    const w = this.sim.world;
    const rules = this.sim.rules;
    const owner = w.structures.find((s) => s.bodyId === bodyId && s.tiles.includes(tile.id));
    const options = rules.buildableKinds().map((kind) => {
      const p = this.previewBuild(bodyId, tileIndex, kind, 0);
      const ext = rules.extraction(kind);
      const anywhere = rules.extractsAnywhere(kind);
      const match = tile.deposit ? ext.find((e) => e.material === tile.deposit!.resource) : anywhere;
      return {
        kind,
        ok: p.ok,
        ...(p.reason ? { reason: p.reason } : {}),
        ...(p.detail ? { detail: p.detail } : {}),
        ...(match ? { extracts: match.material } : {}),
      };
    });
    return {
      bodyId,
      index: tile.index,
      kind: tile.kind,
      deposit: tile.deposit ? { material: tile.deposit.resource, initial: tile.deposit.amount, remaining: w.deposits[tile.id] ?? tile.deposit.amount } : null,
      terrain: tileTerrain(tile, rules.terrain()),
      structureId: owner?.id ?? null,
      options,
    };
  }

  /**
   * Nearest valid tile to the body's port (or its top tile) for `kind`; rotations tried in order.
   * With `material`, only tiles whose deposit is that material (a Kopalnia on Ferryt, not Kupryt).
   */
  suggestTile(bodyId: BodyId, kind: string, material?: string): { tileIndex: number; rotation: number } | null {
    const grid = this.sim.grids.get(bodyId);
    if (!grid) return null;
    const port = this.sim.world.structures.find((s) => s.kind === 'HQ' && s.bodyId === bodyId);
    const start = port ? tileIndexOf(port.tileId) : topTile(grid).index;
    const seen = new Set([start]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q]!;
      const tile = grid.tiles[index]!;
      const wanted = !material || tile.deposit?.resource === material;
      for (let rotation = 0; wanted && rotation < tile.neighbors.length; rotation++) {
        if (this.previewBuild(bodyId, index, kind, rotation).ok) return { tileIndex: index, rotation };
        if (kind !== 'PORT' && this.sim.rules.spec(kind).footprint === 1) break;
      }
      for (const n of tile.neighbors) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return null;
  }

  frame(): FrameData {
    const snap = this.sim.snapshot;
    const rovers: FrameData['rovers'] = {};
    for (const [id, p] of snap.roverLocalPos) rovers[id] = [p.x, p.y, p.z];
    const transit: FrameData['transit'] = {};
    for (const [id, u] of snap.transitProgress) transit[id] = u;
    return { time: this.sim.time, rovers, transit };
  }

  save(): SaveFile {
    const meta: Meta = { galaxy: this.galaxy.save() };
    return structuredClone({
      format: 'space-game-save',
      version: 1,
      scenarioId: this.scenarioId,
      ...(this.economyParams ? { economy: this.economyParams } : {}),
      stepSeconds: this.stepSeconds,
      tempos: this.tempos,
      step: this.stepIndex,
      world: this.sim.world,
      commands: this.commands,
      meta,
    } satisfies SaveFile);
  }

  /** Continues a saved game from its world. */
  load(file: SaveFile): GameSnapshot {
    this.assertFile(file);
    const scenario = SCENARIOS[file.scenarioId];
    const eco = computeEconomy(file.economy);
    this.scenarioId = file.scenarioId;
    this.economyParams = file.economy;
    this.sim = new Simulation(scenario, { economy: eco, world: structuredClone(file.world) as WorldState });
    this.galaxy = new GalaxySim(eco, this.galaxyOptions, (file.meta as Meta | undefined)?.galaxy);
    this.tempos = structuredClone(file.tempos);
    this.tempo = this.tempos[this.tempos.length - 1]?.tempo ?? 60;
    this.stepIndex = file.step;
    this.commands = structuredClone(file.commands);
    this.accumulator = 0;
    return this.snapshot();
  }

  /** Re-runs the scenario from its start with the file's commands and tempos, up to its step. */
  replay(file: SaveFile): ReplayResult {
    this.assertFile(file);
    if (file.stepSeconds !== this.stepSeconds) throw new Error(`step length differs: ${file.stepSeconds} vs ${this.stepSeconds}`);
    this.start(file.scenarioId, file.economy, file.tempos[0]?.tempo ?? 60);
    const tempos = [...file.tempos];
    const commands = [...file.commands];
    let ti = 1;
    let ci = 0;
    let rejected = 0;
    for (let s = 0; s <= file.step; s++) {
      while (ti < tempos.length && tempos[ti]!.step === s) this.setTempo(tempos[ti++]!.tempo);
      while (ci < commands.length && commands[ci]!.step === s) if (!this.command(commands[ci++]!.command).ok) rejected++;
      if (s < file.step) this.step();
    }
    return { ...this.snapshot(), replayStats: { commands: commands.length, rejected } };
  }

  private assertFile(file: SaveFile): void {
    if (file?.format !== 'space-game-save' || file.version !== 1) throw new Error('not a space-game save file (v1)');
    if (!SCENARIOS[file.scenarioId]) throw new Error(`unknown scenario ${file.scenarioId}`);
  }
}
