import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type {
  Availability,
  BodyId,
  BuildPreview,
  CatalogView,
  Command,
  CommandResult,
  DomainEvent,
  EconomyParams,
  EconomyReport,
  FrameData,
  GameApi,
  GameSnapshot,
  NominalFlows,
  ReplayResult,
  SaveFile,
  ScenarioId,
  Tempo,
  TileInfo,
} from '@space-game/api';
import { TEXT } from '../i18n/pl';
import { GAME_API } from './game-api';

export interface LogEntry {
  /** Game time [min]. */
  time: number;
  event: DomainEvent;
}

const LOG_SIZE = 60;

/**
 * The app's only door to the game (F2: the UI never imports the domain's logic). Snapshots arrive
 * from the worker at ~10 Hz into a signal; per-frame positions go to `frame`, outside Signals,
 * so change detection does not run every frame (rule from the 3D PoC).
 */
@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly api: GameApi = inject(GAME_API)();
  private readonly text = inject(TEXT);
  readonly snapshot = signal<GameSnapshot | null>(null);
  /** Names, costs and times of the running economy (loaded at start). */
  readonly catalog = signal<CatalogView | null>(null);
  readonly log = signal<ReadonlyArray<LogEntry>>([]);
  /** Last command rejection, for the inspector and toasts. */
  readonly lastRejection = signal<Extract<DomainEvent, { type: 'COMMAND_REJECTED' }> | null>(null);
  /** Latest per-frame positions (mutable, read by the renderer). */
  frame: FrameData | null = null;

  readonly world = computed(() => this.snapshot()?.world ?? null);
  readonly time = computed(() => this.snapshot()?.world.time ?? 0);
  /** Body of the player's colony: the chosen site, else the home base, else none. */
  readonly colonyBodyId = computed<BodyId | null>(() => {
    const w = this.world();
    if (!w) return null;
    return w.colony.siteBodyId ?? w.bodies.find((b) => b.isHomeBase)?.id ?? null;
  });

  constructor() {
    const off = [
      this.api.onSnapshot((s) => this.snapshot.set(s)),
      this.api.onEvents((events) => this.record(events)),
      this.api.onFrame((f) => (this.frame = f)),
    ];
    inject(DestroyRef).onDestroy(() => {
      off.forEach((o) => o());
      this.api.dispose();
    });
  }

  /** Starts a scenario; `economy` = parameters of the designer panel (F6), absent = the document's. */
  async start(scenarioId: ScenarioId, economy?: EconomyParams): Promise<GameSnapshot> {
    this.log.set([]);
    this.lastRejection.set(null);
    const s = await this.api.start(scenarioId, economy);
    this.economy.set(economy ?? null);
    this.snapshot.set(s);
    this.catalog.set(this.localize(await this.api.catalog()));
    this.restarted.forEach((l) => l());
    return s;
  }

  /** Economy parameters of the running game; null = the document's (Załącznik A). */
  readonly economy = signal<EconomyParams | null>(null);
  private readonly eventTaps = new Set<(events: DomainEvent[], time: number) => void>();
  private readonly restarted = new Set<() => void>();

  /** Every event batch from the worker, with the game time (designer telemetry). */
  onEvents(listener: (events: DomainEvent[], time: number) => void): () => void {
    this.eventTaps.add(listener);
    return () => this.eventTaps.delete(listener);
  }

  /** Called after start, load and replay: the world was replaced. */
  onRestart(listener: () => void): () => void {
    this.restarted.add(listener);
    return () => this.restarted.delete(listener);
  }

  tileInfo(bodyId: BodyId, tileIndex: number): Promise<TileInfo | null> {
    return this.api.tileInfo(bodyId, tileIndex);
  }

  economyReport(params?: EconomyParams): Promise<EconomyReport> {
    return this.api.economyReport(params);
  }

  nominalFlows(bodyId: BodyId): Promise<NominalFlows> {
    return this.api.nominalFlows(bodyId);
  }

  /** Display names from the dictionary where the UI differs from the catalog (HQ → Port kosmiczny). */
  private localize(cat: CatalogView): CatalogView {
    const names = this.text.buildingNames;
    return { ...cat, buildings: cat.buildings.map((b) => (names[b.id] ? { ...b, name: names[b.id]! } : b)) };
  }

  availability(bodyId: BodyId, kinds: string[]): Promise<Record<string, Availability>> {
    return this.api.availability(bodyId, kinds);
  }

  previewBuild(bodyId: BodyId, tileIndex: number, kind: string, rotation: number): Promise<BuildPreview> {
    return this.api.previewBuild(bodyId, tileIndex, kind, rotation);
  }

  suggestTile(bodyId: BodyId, kind: string, material?: string): Promise<{ tileIndex: number; rotation: number } | null> {
    return this.api.suggestTile(bodyId, kind, material);
  }

  /** Catalog without starting a game (the main page lists the stars). */
  async loadCatalog(): Promise<CatalogView> {
    const cat = this.catalog() ?? this.localize(await this.api.catalog());
    this.catalog.set(cat);
    return cat;
  }

  async command(cmd: Command): Promise<CommandResult> {
    const result = await this.api.command(cmd);
    const rejected = result.events.find((e) => e.type === 'COMMAND_REJECTED');
    this.lastRejection.set(rejected ?? null);
    return result;
  }

  setTempo(tempo: Tempo): void {
    this.api.setTempo(tempo);
    this.patch({ tempo, paused: false });
    this.api.resume();
  }

  togglePause(): void {
    const paused = !this.snapshot()?.paused;
    if (paused) this.api.pause();
    else this.api.resume();
    this.patch({ paused });
  }

  async stepOnce(steps = 1): Promise<void> {
    this.snapshot.set(await this.api.stepOnce(steps));
  }

  save(): Promise<SaveFile> {
    return this.api.save();
  }

  async load(file: SaveFile): Promise<void> {
    await this.replaced(this.api.load(file), file);
  }

  /** Re-runs the file's commands from the scenario start (with the file's economy). */
  async replay(file: SaveFile): Promise<ReplayResult['replayStats']> {
    const result = this.api.replay(file);
    await this.replaced(result, file);
    return (await result).replayStats;
  }

  private async replaced(next: Promise<GameSnapshot>, file: SaveFile): Promise<void> {
    const s = await next;
    this.log.set([]);
    this.lastRejection.set(null);
    this.economy.set(file.economy ?? null);
    this.snapshot.set(s);
    this.catalog.set(this.localize(await this.api.catalog()));
    this.restarted.forEach((l) => l());
  }

  private patch(p: Partial<GameSnapshot>): void {
    const s = this.snapshot();
    if (s) this.snapshot.set({ ...s, ...p });
  }

  private record(events: DomainEvent[]): void {
    const time = this.time();
    this.eventTaps.forEach((l) => l(events, time));
    const worth = events.filter((e) => LOGGED.has(e.type));
    if (!worth.length) return;
    this.log.update((l) => [...worth.map((event) => ({ time, event })).reverse(), ...l].slice(0, LOG_SIZE));
  }
}

/** Events shown in the colony log (not ticks). */
const LOGGED = new Set<DomainEvent['type']>([
  'SCAN_STARTED',
  'SCAN_COMPLETED',
  'COLONY_SITE_CHOSEN',
  'SPACEPORT_PLACED',
  'COLONY_FOUNDED',
  'TRANSFER_STARTED',
  'TRANSFER_ARRIVED',
  'CONSTRUCTION_ORDERED',
  'STRUCTURE_BUILT',
  'STRUCTURE_UPGRADED',
  'CONSTRUCTION_CANCELLED',
  'STRUCTURE_DEMOLISHED',
  'DEPOSIT_DEPLETED',
  'SHUTTLE_LAUNCHED',
  'SHUTTLE_UNLOADED',
  'ROVER_PRODUCED',
  'CARGO_UNLOADED',
  'COMMAND_REJECTED',
]);
