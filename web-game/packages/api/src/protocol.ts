import type { BodyId, Command, DomainEvent, EconomyParams, NominalFlows } from '@space-game/domain';
import type {
  Availability,
  BuildPreview,
  CatalogView,
  CommandResult,
  EconomyReport,
  FrameData,
  GameSnapshot,
  SaveFile,
  ScenarioId,
  Tempo,
} from './contract';

// Messages between the UI thread and the mock server in a Web Worker. Requests carry an id; the
// worker answers each with a `reply` of the same id. Pushes (snapshot, events, frame) have no id.

export type Request =
  | { kind: 'start'; scenarioId: ScenarioId; economy?: EconomyParams }
  | { kind: 'command'; command: Command }
  | { kind: 'setTempo'; tempo: Tempo }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stepOnce'; steps: number }
  | { kind: 'save' }
  | { kind: 'load'; file: SaveFile }
  | { kind: 'replay'; file: SaveFile }
  | { kind: 'snapshot' }
  | { kind: 'catalog' }
  | { kind: 'availability'; bodyId: BodyId; kinds: string[] }
  | { kind: 'previewBuild'; bodyId: BodyId; tileIndex: number; buildingKind: string; rotation: number }
  | { kind: 'suggestTile'; bodyId: BodyId; buildingKind: string; material?: string }
  | { kind: 'economyReport'; economy?: EconomyParams }
  | { kind: 'nominalFlows'; bodyId: BodyId };

export type RequestMessage = { id: number; request: Request };

export type ReplyValue =
  | GameSnapshot
  | CommandResult
  | SaveFile
  | CatalogView
  | Record<string, Availability>
  | BuildPreview
  | { tileIndex: number; rotation: number }
  | EconomyReport
  | NominalFlows
  | null;

export type WorkerMessage =
  | { type: 'reply'; id: number; ok: true; value: ReplyValue }
  | { type: 'reply'; id: number; ok: false; error: string }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'events'; events: DomainEvent[] }
  | { type: 'frame'; frame: FrameData };

/** The part of a Worker the client needs (also lets tests pass a fake). */
export interface WorkerLike {
  postMessage(message: RequestMessage): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<WorkerMessage>) => void): void;
  removeEventListener(type: 'message', listener: (e: MessageEvent<WorkerMessage>) => void): void;
  terminate(): void;
}
