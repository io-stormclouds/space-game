import type {
  BodyId,
  ColonyReadout,
  Command,
  Cost,
  DomainEvent,
  EconomyParams,
  EconomyTables,
  NominalFlows,
  Objective,
  RejectReason,
  TerrainKind,
  TerrainRules,
  WorldState,
} from '@space-game/domain';
import type { GalaxyOp, GalaxyReply, GalaxyView } from './galaxy';

// GameApi: the only way the UI talks to the game (F2). Today the mock server implements it in a
// Web Worker (W03 A); later a real, authoritative server can implement the same contract.
// Everything that crosses it is plain, structured-clone-safe data.

/**
 * Playable scenarios and the load levels of F5 (generated from them, deterministic). `load-m-teren`
 * (T4: M with the colony beside the ruins of Tau Ceti c) is a performance preset of the TS mock only.
 */
export type ScenarioId = 'tau-ceti' | 'planeta-matka' | 'fabryka' | 'load-s' | 'load-m' | 'load-l' | 'load-m-teren';

export const TEMPO_PRESETS = [1, 10, 60, 600] as const;
export type Tempo = number;

/** Sliding statistics of the simulation step, for the performance overlay. */
export interface StepStats {
  /** Mean / max step time over the last second [ms]. */
  meanMs: number;
  maxMs: number;
  /** Steps per second actually run. */
  stepsPerSecond: number;
  /** Model minutes per real second at the current tempo. */
  minutesPerSecond: number;
}

export interface SimulatedPlayer {
  id: string;
  name: string;
  corporation: string;
  /** Name of the star of the player's main colony (galaxy board "Kolonie innych graczy"). */
  homeStar: string;
  colonies: number;
  score: number;
}

export interface MarketQuote {
  material: string;
  /** Base value V [kr]. */
  value: number;
  /** Hub buys from players at this price [kr]. */
  bid: number;
  /** Hub sells at this price [kr]. */
  ask: number;
  /** Change since the previous quote [%]. */
  change: number;
}

export interface MarketHub {
  id: string;
  name: string;
  star: string;
  quotes: MarketQuote[];
}

/** What the UI renders. Sent at about 10 Hz, after commands and on demand. */
export interface GameSnapshot {
  scenarioId: ScenarioId;
  world: WorldState;
  /** Storage, power, crew of every body with structures. */
  colonies: Readonly<Record<BodyId, ColonyReadout>>;
  objectives: Objective[];
  players: SimulatedPlayer[];
  hubs: MarketHub[];
  tempo: Tempo;
  paused: boolean;
  /** Steps run since the start (the replay clock). */
  step: number;
  stats: StepStats;
}

/** Positions that change every frame, for the renderer (not for HUD state). */
export interface FrameData {
  time: number;
  /** Rover id → local position on its body [x, y, z]. */
  rovers: Record<string, [number, number, number]>;
  /** Ship id → progress 0..1 of its current flight. */
  transit: Record<string, number>;
}

export interface RecordedCommand {
  /** Step index at which the command was applied. */
  step: number;
  command: Command;
}

/** Save file (JSON). `world` restores the game; `commands` replays it from the scenario start. */
export interface SaveFile {
  format: 'space-game-save';
  version: 1;
  scenarioId: ScenarioId;
  /** Economy parameters in force (F6 designer panel). */
  economy?: EconomyParams;
  /** Fixed step length in real seconds and the tempo history needed for replay. */
  stepSeconds: number;
  /** Tempo changes: from step `step` on, each step advances `tempo` × stepSeconds / 60 minutes. */
  tempos: Array<{ step: number; tempo: Tempo }>;
  step: number;
  world: WorldState;
  commands: RecordedCommand[];
  /** Simulated players and market state. */
  meta: unknown;
}

/** Snapshot after a replay, with how many recorded commands the replayed world rejected (F6: other parameters). */
export interface ReplayResult extends GameSnapshot {
  replayStats: { commands: number; rejected: number };
}

export interface CommandResult {
  ok: boolean;
  events: DomainEvent[];
}

/** Static catalog for the UI (names, costs, times), computed by the server from its economy. */
export interface CatalogMaterial {
  id: string;
  name: string;
  tier: string;
  cls: string;
  unit: string;
}

export interface CatalogLevel {
  level: number;
  cost: Readonly<Record<string, number>>;
  /** Minutes. */
  buildTime: number;
  /** MW, positive produces. */
  power: number;
  /** Crew needed (positive) or living space (negative). */
  crew: number;
  storage: Readonly<Record<string, number>>;
  /** Speed of production at this level relative to L1 (×1,6 per level, doc §5.2 E). */
  outputFactor: number;
}

export interface CatalogBuilding {
  id: string;
  name: string;
  era: number;
  category: string;
  /** Tiles on the surface; 0 for orbital and vehicles. */
  footprint: number;
  maxLevel: number;
  /** Can be ordered with BUILD in this scenario (E0–E1 surface buildings). */
  buildable: boolean;
  levels: CatalogLevel[];
  /** Deposit materials it extracts, with the L1 rate per minute. */
  extracts: Array<{ material: string; rate: number }>;
  recipes: string[];
}

export interface CatalogRecipe {
  id: string;
  building: string;
  inp: Readonly<Record<string, number>>;
  out: Readonly<Record<string, number>>;
  /** Minutes per batch. */
  time: number;
  power: number;
}

export interface CatalogStar {
  name: string;
  spectralClass: string;
  /** Light years from Sol. */
  distance: number;
  luminosity: number;
  temperature: number;
  planets: number;
  color: string;
  description: string;
  /** Position in parsecs from Sol (W10: consistent with `distance`). */
  pos: { x: number; y: number; z: number };
}

export interface CatalogView {
  stars: CatalogStar[];
  materials: CatalogMaterial[];
  buildings: CatalogBuilding[];
  recipes: CatalogRecipe[];
  rover: { cost: Readonly<Record<string, number>>; buildTime: number };
  colonization: {
    scanMinutes: number;
    portCost: Readonly<Record<string, number>>;
    portBuildMinutes: number;
    shuttleCapacity: number;
    shuttleTripMinutes: number;
  };
  /** What terrain does to building (T8): buildable classes, cost and time in % per class and on a road. */
  terrain: TerrainRules;
}

export interface Availability {
  ok: boolean;
  reason?: RejectReason;
  detail?: string;
}

/** Result of checking a building on a tile (the placement ghost). */
export interface BuildPreview extends Availability {
  /** Tile indices the footprint would cover (empty when it does not fit). */
  tiles: number[];
  /**
   * Materials the order takes, after the terrain under the footprint (T8). Present once the check got
   * past BAD_TERRAIN (footprint fits on free, buildable tiles): when `ok`, and also on a later rejection
   * (NO_DEPOSIT, NO_ATMOSPHERE, NO_ROVER, NO_RESOURCES, NO_POWER, NO_CREW; for PORT: NO_RESOURCES, with
   * the port cost checked against the mothership's hold). Absent on earlier rejections.
   */
  cost?: Cost;
  /** Minutes one rover needs to build it (catalog time × terrain time %); present together with `cost`. */
  buildTime?: number;
}

/** Terrain of a tile (T8); numbers are the tile's own (a road's on a road tile). */
export interface TileTerrainInfo {
  kind: TerrainKind;
  /** Polish name to show: the road's ("droga") on a road tile, the class's ("las") otherwise. */
  name: string;
  road: boolean;
  /** Whether a footprint may cover it (water: no, BAD_TERRAIN). */
  buildable: boolean;
  /** Materials and construction time in % of the catalog. */
  costPct: number;
  timePct: number;
}

/** One surface tile for the tile panel and card (3D PoC `tile-panel`). */
export interface TileInfo {
  bodyId: BodyId;
  index: number;
  kind: 'HEX' | 'PENT';
  deposit: { material: string; initial: number; remaining: number } | null;
  /** Terrain class of the tile; null on bodies without terrain. */
  terrain: TileTerrainInfo | null;
  /** Structure standing on the tile, if any. */
  structureId: string | null;
  /** Every buildable kind checked on this tile (rotation 0); extractors name what they would take here. */
  options: Array<{ kind: string; ok: boolean; reason?: RejectReason; detail?: string; extracts?: string }>;
}

/** F6: the economy document's tables (default parameters) next to the tables of other parameters. */
export interface EconomyReport {
  /** Parameters the `current` tables were computed from. */
  params: EconomyParams;
  /** Parameters of the document (Załącznik A). */
  defaults: EconomyParams;
  doc: EconomyTables;
  current: EconomyTables;
}

export type Unsubscribe = () => void;

export interface GameApi {
  /** Starts a scenario from its beginning (or the given economy parameters). */
  start(scenarioId: ScenarioId, economy?: EconomyParams): Promise<GameSnapshot>;
  /** Validates and applies a player order at the next step boundary. */
  command(cmd: Command): Promise<CommandResult>;
  setTempo(tempo: Tempo): void;
  pause(): void;
  resume(): void;
  /** While paused: advance by exactly `steps` fixed steps. */
  stepOnce(steps?: number): Promise<GameSnapshot>;
  save(): Promise<SaveFile>;
  load(file: SaveFile): Promise<GameSnapshot>;
  /** Re-runs the scenario with the file's commands; resolves with the replayed snapshot. */
  replay(file: SaveFile): Promise<ReplayResult>;
  /** Latest snapshot, or a fresh one. */
  snapshot(): Promise<GameSnapshot>;
  /** Names, costs and times of the current economy. */
  catalog(): Promise<CatalogView>;
  /** Whether each kind could be ordered on the body now (menu cards, blocked commands). */
  availability(bodyId: BodyId, kinds: string[]): Promise<Record<string, Availability>>;
  /** Check of one building on one tile, for the placement ghost (the PORT kind checks the spaceport). */
  previewBuild(bodyId: BodyId, tileIndex: number, kind: string, rotation: number): Promise<BuildPreview>;
  /** Nearest valid tile to the colony's port for `kind` (auto placement; extractors: on a `material` deposit), or null. */
  suggestTile(bodyId: BodyId, kind: string, material?: string): Promise<{ tileIndex: number; rotation: number } | null>;
  /** A surface tile: shape, deposit left, what stands there, what could be built there. */
  tileInfo(bodyId: BodyId, tileIndex: number): Promise<TileInfo | null>;
  /** Document tables vs the tables of `params` (default: the economy of the running game). Starts nothing. */
  economyReport(params?: EconomyParams): Promise<EconomyReport>;
  /** Rates the body should reach by the document (full power, free storage), for comparison with measured ones. */
  nominalFlows(bodyId: BodyId): Promise<NominalFlows>;
  onSnapshot(listener: (s: GameSnapshot) => void): Unsubscribe;
  onEvents(listener: (events: DomainEvent[]) => void): Unsubscribe;
  onFrame(listener: (f: FrameData) => void): Unsubscribe;
  /** The galaxy's market (B6, `galaxy.ts`): only with the game server; elsewhere it fails with NO_TRADE. */
  galaxy<T extends GalaxyReply = GalaxyReply>(op: GalaxyOp): Promise<T>;
  /** The player's view of the galaxy after every change (the last one at once, when there is one). */
  onGalaxy(listener: (v: GalaxyView) => void): Unsubscribe;
  dispose(): void;
}
