import type {
  BodyId,
  ColonyReadout,
  Command,
  DomainEvent,
  EconomyParams,
  Objective,
  RejectReason,
  WorldState,
} from '@space-game/domain';

// GameApi: the only way the UI talks to the game (F2). Today the mock server implements it in a
// Web Worker (W03 A); later a real, authoritative server can implement the same contract.
// Everything that crosses it is plain, structured-clone-safe data.

export type ScenarioId = 'tau-ceti' | 'planeta-matka';

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
  replay(file: SaveFile): Promise<GameSnapshot>;
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
  onSnapshot(listener: (s: GameSnapshot) => void): Unsubscribe;
  onEvents(listener: (events: DomainEvent[]) => void): Unsubscribe;
  onFrame(listener: (f: FrameData) => void): Unsubscribe;
  dispose(): void;
}
