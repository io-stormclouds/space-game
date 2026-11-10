import { statsOf } from './catalog/catalog';
import type { RoomTypeId, ShipStats } from './catalog/catalog.types';
import { cellKey, parseCellKey } from './grid';
import type { LayoutIndex } from './layout-index';
import type { Room } from './rooms';
import type { Issue } from './validation';

export interface ShipSummary {
  readonly stats: ShipStats;
  readonly area: number;
  readonly rooms: number;
  readonly roomTypes: Readonly<Partial<Record<RoomTypeId, number>>>;
  readonly pieces: number;
  readonly triangles: number;
  readonly levels: readonly number[];
  /** Decks that have at least one room. */
  readonly decks: readonly number[];
  readonly stairs: number;
  /** Lift shafts (unbroken runs of stops) and stops. */
  readonly lifts: number;
  readonly liftStops: number;
  readonly sealed: boolean;
  readonly errors: number;
  readonly warnings: number;
}

/** What the design adds up to — the hook into the game economy (crew, power, food…). */
export function summarize(index: LayoutIndex, rooms: readonly Room[], issues: readonly Issue[]): ShipSummary {
  const stats = { berths: 0, power: 0, food: 0, care: 0, storage: 0 };
  let triangles = 0;
  for (const ip of index.pieces.values()) {
    triangles += ip.item.info.tris;
    const s = statsOf(ip.item);
    for (const k of Object.keys(stats) as (keyof ShipStats)[]) stats[k] += s[k] ?? 0;
  }
  const roomTypes: Partial<Record<RoomTypeId, number>> = {};
  for (const r of rooms) roomTypes[r.type] = (roomTypes[r.type] ?? 0) + 1;
  for (const k of Object.keys(stats) as (keyof ShipStats)[]) stats[k] = Math.round(stats[k] * 10) / 10;
  // A shaft is counted at its lowest stop.
  let lifts = 0;
  for (const key of index.lifts.keys()) {
    const c = parseCellKey(key);
    if (!index.lifts.has(cellKey(c.level - 1, c.x, c.z))) lifts++;
  }
  return {
    stats,
    area: rooms.reduce((s, r) => s + r.area, 0),
    rooms: rooms.length,
    roomTypes,
    pieces: index.pieces.size,
    triangles,
    levels: [...index.levels].sort((a, b) => a - b),
    decks: [...new Set(rooms.map((r) => r.level))].sort((a, b) => a - b),
    stairs: index.stairs.length,
    lifts,
    liftStops: index.lifts.size,
    sealed: rooms.length > 0 && rooms.every((r) => r.breaches.length === 0),
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
  };
}
