// GameApi: contract between the UI and the game, and its Web Worker client.
// The UI imports game types from here (types only), never the domain's logic (F2 rule).
export * from './contract';
export * from './protocol';
export { createWorkerGameApi } from './worker-client';

export type {
  BodyId,
  CelestialBody,
  ColonyReadout,
  Command,
  CommandType,
  Cost,
  DomainEvent,
  AtanorMeasured,
  AtanorRow,
  BuildingRow,
  EconomyParams,
  EconomyTables,
  MaterialRow,
  NominalFlows,
  Objective,
  PlanetGrid,
  RejectReason,
  Rover,
  RoverId,
  ShipId,
  Spacecraft,
  Stockpile,
  Structure,
  StructureKind,
  Tile,
  TileId,
  WorldState,
  AtanorMachine,
  AtanorMachineState,
  AtanorDeployment,
  AtanorProgramMetrics,
} from '@space-game/domain';
