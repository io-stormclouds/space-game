import type { BodyId, Command, DomainEvent, EconomyParams, NominalFlows } from '@space-game/domain';
import type {
  Availability,
  BuildPreview,
  CatalogView,
  CommandResult,
  EconomyReport,
  FrameData,
  GameApi,
  GameSnapshot,
  ReplayResult,
  SaveFile,
  ScenarioId,
  Tempo,
  TileInfo,
  Unsubscribe,
} from './contract';
import type { ReplyValue, Request, WorkerLike, WorkerMessage } from './protocol';

/** GameApi over a Web Worker that runs the mock server (W03 A). */
export function createWorkerGameApi(worker: WorkerLike): GameApi {
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: ReplyValue) => void; reject: (e: Error) => void }>();
  const snapshotListeners = new Set<(s: GameSnapshot) => void>();
  const eventListeners = new Set<(e: DomainEvent[]) => void>();
  const frameListeners = new Set<(f: FrameData) => void>();
  let latest: GameSnapshot | null = null;

  const onMessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'reply': {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.value);
        else p.reject(new Error(msg.error));
        return;
      }
      case 'snapshot':
        latest = msg.snapshot;
        for (const l of snapshotListeners) l(msg.snapshot);
        return;
      case 'events':
        for (const l of eventListeners) l(msg.events);
        return;
      case 'frame':
        for (const l of frameListeners) l(msg.frame);
        return;
    }
  };
  worker.addEventListener('message', onMessage);

  const call = <T extends ReplyValue>(request: Request): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: ReplyValue) => void, reject });
      worker.postMessage({ id, request });
    });
  const subscribe = <T>(set: Set<T>, listener: T): Unsubscribe => {
    set.add(listener);
    return () => set.delete(listener);
  };

  return {
    start: (scenarioId: ScenarioId, economy?: EconomyParams) => call<GameSnapshot>({ kind: 'start', scenarioId, economy }),
    command: (command: Command) => call<CommandResult>({ kind: 'command', command }),
    setTempo: (tempo: Tempo) => void call({ kind: 'setTempo', tempo }),
    pause: () => void call({ kind: 'pause' }),
    resume: () => void call({ kind: 'resume' }),
    stepOnce: (steps = 1) => call<GameSnapshot>({ kind: 'stepOnce', steps }),
    save: () => call<SaveFile>({ kind: 'save' }),
    load: (file: SaveFile) => call<GameSnapshot>({ kind: 'load', file }),
    replay: (file: SaveFile) => call<ReplayResult>({ kind: 'replay', file }),
    snapshot: () => (latest ? Promise.resolve(latest) : call<GameSnapshot>({ kind: 'snapshot' })),
    catalog: () => call<CatalogView>({ kind: 'catalog' }),
    availability: (bodyId: BodyId, kinds: string[]) => call<Record<string, Availability>>({ kind: 'availability', bodyId, kinds }),
    previewBuild: (bodyId: BodyId, tileIndex: number, buildingKind: string, rotation: number) =>
      call<BuildPreview>({ kind: 'previewBuild', bodyId, tileIndex, buildingKind, rotation }),
    suggestTile: (bodyId: BodyId, buildingKind: string, material?: string) =>
      call<{ tileIndex: number; rotation: number } | null>({ kind: 'suggestTile', bodyId, buildingKind, ...(material ? { material } : {}) }),
    tileInfo: (bodyId: BodyId, tileIndex: number) => call<TileInfo | null>({ kind: 'tileInfo', bodyId, tileIndex }),
    economyReport: (economy?: EconomyParams) => call<EconomyReport>({ kind: 'economyReport', ...(economy ? { economy } : {}) }),
    nominalFlows: (bodyId: BodyId) => call<NominalFlows>({ kind: 'nominalFlows', bodyId }),
    onSnapshot: (l) => subscribe(snapshotListeners, l),
    onEvents: (l) => subscribe(eventListeners, l),
    onFrame: (l) => subscribe(frameListeners, l),
    dispose() {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('GameApi disposed'));
      pending.clear();
    },
  };
}
