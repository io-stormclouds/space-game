import type { CatalogBuilding, CatalogView, DomainEvent, TileTerrainInfo, WorldState } from '@space-game/api';
import type { Dictionary } from '../i18n/pl';

const num = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

/** "STA 120 · BET 80 · UKL 10" (canvas style). */
export function costText(cost: Readonly<Record<string, number>>): string {
  const parts = Object.entries(cost)
    .filter(([, q]) => q > 0)
    .map(([code, q]) => `${code} ${num.format(Math.ceil(q))}`);
  return parts.length ? parts.join(' · ') : '—';
}

/** Change against the catalog of a terrain %: 110 → "+10 %", 85 → "−15 %" (no-break space before %). */
export function pctChange(pct: number): string {
  const d = pct - 100;
  return `${d < 0 ? '−' : '+'}${num.format(Math.abs(d))} %`;
}

/**
 * Materials after the terrain: `Math.ceil(q * pct / 100)` per material, key order kept. Same rounding
 * as the domain's `scaleCost` (T8 §9.2), which the app does not import (README: no domain logic in
 * the app), so a slot shows what BUILD will take.
 */
export function terrainCost(cost: Readonly<Record<string, number>>, pct: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(cost)) out[code] = Math.ceil((q * pct) / 100);
  return out;
}

/**
 * Terrain row of the tile panel (T8): "las · koszt +10 %, czas +50 %", "droga · koszt −15 %, czas −25 %",
 * "trawa" (catalog cost and time), "woda · nie można budować"; '' on a body without terrain.
 */
export function terrainLine(t: Dictionary, terrain: TileTerrainInfo | null): string {
  if (!terrain) return '';
  if (!terrain.buildable) return `${terrain.name} · ${t.selection.terrainNoBuild}`;
  const mods = [
    terrain.costPct !== 100 ? t.selection.terrainCost(pctChange(terrain.costPct)) : '',
    terrain.timePct !== 100 ? t.selection.terrainTime(pctChange(terrain.timePct)) : '',
  ].filter((m) => m !== '');
  return mods.length ? `${terrain.name} · ${mods.join(', ')}` : terrain.name;
}

/**
 * L1 cost and time of a building as a tile shows them before the placement check (quick slots, the
 * catalog opened from a tile). A 1-tile building covers just this tile, so it pays the tile's terrain %;
 * a 3- or 7-tile one keeps the catalog numbers, flagged `perTiles` on a body with terrain (the other
 * tiles of its footprint decide; the placement ghost has the exact price).
 */
export function tileBuildCost(building: CatalogBuilding | undefined, terrain: TileTerrainInfo | null): { cost: Record<string, number>; minutes: number; perTiles: boolean } {
  const l1 = building?.levels[0];
  const cost = { ...(l1?.cost ?? {}) };
  const minutes = l1?.buildTime ?? 0;
  if (!terrain) return { cost, minutes, perTiles: false };
  if ((building?.footprint ?? 1) > 1) return { cost, minutes, perTiles: true };
  return { cost: terrainCost(cost, terrain.costPct), minutes: terrain.timePct === 100 ? minutes : (minutes * terrain.timePct) / 100, perTiles: false };
}

/** "Dzień 1 · 19:40" from model minutes. */
export function clockText(t: Dictionary, minutes: number): string {
  const total = Math.floor(minutes);
  const day = Math.floor(total / 1440) + 1;
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${t.hud.day} ${day} · ${hh}:${mm}`;
}

/** "19:40" of a log line. */
export function clockShort(minutes: number): string {
  const total = Math.floor(minutes);
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Index of a tile id `${bodyId}:${index}` (the domain's tileIndexOf, without importing the domain). */
export function tileIndexFromId(id: string): number {
  return Number(id.slice(id.lastIndexOf(':') + 1));
}

export function bodyName(world: WorldState | null, id: string | null | undefined): string {
  if (!world || !id) return '—';
  const b = world.bodies.find((x) => x.id === id);
  if (!b) return id;
  return b.revealed === false ? (b.unknownName ?? b.name) : b.name;
}

export function buildingName(catalog: CatalogView | null, kind: string): string {
  return catalog?.buildings.find((b) => b.id === kind)?.name ?? kind;
}

export function structureName(world: WorldState | null, catalog: CatalogView | null, id: string): string {
  const s = world?.structures.find((x) => x.id === id);
  return s ? buildingName(catalog, s.kind) : id;
}

/** One line of the colony log, or null for events the log does not show. */
export function describeEvent(t: Dictionary, e: DomainEvent, world: WorldState | null, catalog: CatalogView | null): { text: string; alert: boolean } | null {
  const ship = (id: string) => world?.ships.find((s) => s.id === id)?.name ?? id;
  const ev = t.events;
  switch (e.type) {
    case 'SCAN_STARTED':
      return { text: ev.SCAN_STARTED(), alert: false };
    case 'SCAN_COMPLETED':
      return { text: ev.SCAN_COMPLETED(e.bodyIds.length), alert: false };
    case 'COLONY_SITE_CHOSEN':
      return { text: ev.COLONY_SITE_CHOSEN(bodyName(world, e.bodyId)), alert: false };
    case 'TRANSFER_STARTED':
      return { text: ev.TRANSFER_STARTED(ship(e.shipId), bodyName(world, e.plan.toBodyId)), alert: false };
    case 'TRANSFER_ARRIVED':
      return { text: ev.TRANSFER_ARRIVED(ship(e.shipId), bodyName(world, e.bodyId)), alert: false };
    case 'SPACEPORT_PLACED':
      return { text: ev.SPACEPORT_PLACED(bodyName(world, e.structure.bodyId)), alert: false };
    case 'COLONY_FOUNDED':
      return { text: ev.COLONY_FOUNDED(bodyName(world, e.bodyId)), alert: false };
    case 'CONSTRUCTION_ORDERED':
      return { text: ev.CONSTRUCTION_ORDERED(buildingName(catalog, e.structure.kind)), alert: false };
    case 'STRUCTURE_BUILT':
      return { text: ev.STRUCTURE_BUILT(buildingName(catalog, e.structure.kind)), alert: false };
    case 'STRUCTURE_UPGRADED':
      return { text: ev.STRUCTURE_UPGRADED(structureName(world, catalog, e.structureId), e.level), alert: false };
    case 'CONSTRUCTION_CANCELLED':
      return { text: ev.CONSTRUCTION_CANCELLED(structureName(world, catalog, e.structureId)), alert: false };
    case 'STRUCTURE_DEMOLISHED':
      return { text: ev.STRUCTURE_DEMOLISHED(e.structureId.split('@')[0] ?? e.structureId), alert: false };
    case 'DEPOSIT_DEPLETED':
      return { text: ev.DEPOSIT_DEPLETED(Number(e.tileId.split(':')[1])), alert: true };
    case 'SHUTTLE_LAUNCHED':
      return { text: ev.SHUTTLE_LAUNCHED(costText(e.trip.cargo)), alert: false };
    case 'SHUTTLE_UNLOADED':
      return { text: ev.SHUTTLE_UNLOADED(costText(e.cargo)), alert: false };
    case 'ROVER_PRODUCED':
      return { text: ev.ROVER_PRODUCED(e.rover.name), alert: false };
    case 'CARGO_UNLOADED':
      return { text: ev.CARGO_UNLOADED(ship(e.shipId), costText(e.cargo)), alert: false };
    case 'COMMAND_REJECTED':
      return { text: ev.COMMAND_REJECTED(t.reject[e.reason], e.detail ?? ''), alert: true };
    case 'ATANOR_DEPLOY_STARTED':
      return { text: ev.ATANOR_DEPLOY_STARTED(e.recipe, Math.round(e.deployment.total * 10) / 10, costText(e.cost)), alert: false };
    case 'ATANOR_DEPLOYED':
      return { text: ev.ATANOR_DEPLOYED(structureName(world, catalog, e.structureId)), alert: false };
    default:
      return null;
  }
}

/** Reason line for a blocked command: "Za mało mocy: brakuje 3 MW". */
export function reasonText(t: Dictionary, reason: keyof Dictionary['reject'] | undefined, detail?: string): string {
  if (!reason) return '';
  return detail ? `${t.reject[reason]}: ${detail}` : t.reject[reason];
}
