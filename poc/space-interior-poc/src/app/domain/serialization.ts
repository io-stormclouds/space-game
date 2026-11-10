import { CELL, LEVEL_HEIGHT, normRot } from './grid';
import type { Layout, Piece } from './layout';
import { resolveItem } from './catalog/catalog';

/**
 * File format of a design. Versioned from day one so later versions can migrate old files.
 * Pieces only; rooms, issues and stats are always derived on load.
 */
export const LAYOUT_FORMAT = 'space-interior-layout';
export const LAYOUT_VERSION = 1;

export interface PieceJson {
  id: string;
  item: string;
  level: number;
  x: number;
  z: number;
  rot: number;
}

export interface LayoutFileV1 {
  format: typeof LAYOUT_FORMAT;
  version: 1;
  name: string;
  grid: { cell: number; levelHeight: number };
  pieces: PieceJson[];
}

export function serializeLayout(layout: Layout): LayoutFileV1 {
  const pieces = [...layout.pieces.values()]
    .map((p): PieceJson => ({ id: p.id, item: p.item, level: p.level, x: p.x, z: p.z, rot: p.rot }))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return { format: LAYOUT_FORMAT, version: LAYOUT_VERSION, name: layout.name, grid: { cell: CELL, levelHeight: LEVEL_HEIGHT }, pieces };
}

export interface ParseResult {
  readonly layout: Layout;
  readonly warnings: readonly string[];
}

/** Reads a design file. Throws on a foreign or newer format; skips (and reports) broken pieces. */
export function parseLayout(data: unknown): ParseResult {
  if (!data || typeof data !== 'object') throw new Error('To nie jest plik projektu.');
  const file = data as Partial<LayoutFileV1>;
  if (file.format !== LAYOUT_FORMAT) throw new Error('Nieznany format pliku.');
  if (typeof file.version !== 'number' || file.version > LAYOUT_VERSION) {
    throw new Error(`Wersja pliku ${String(file.version)} jest nowsza niż obsługiwana (${LAYOUT_VERSION}).`);
  }
  if (file.grid && (file.grid.cell !== CELL || file.grid.levelHeight !== LEVEL_HEIGHT)) {
    throw new Error('Plik używa innej siatki.');
  }
  const warnings: string[] = [];
  const pieces = new Map<string, Piece>();
  let seq = 0;
  let unknown = 0;
  for (const raw of Array.isArray(file.pieces) ? file.pieces : []) {
    const ok =
      raw &&
      typeof raw.id === 'string' &&
      /^p\d+$/.test(raw.id) &&
      typeof raw.item === 'string' &&
      [raw.level, raw.x, raw.z, raw.rot].every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!ok || pieces.has(raw.id)) {
      warnings.push(`Pominięto uszkodzony element ${JSON.stringify(raw).slice(0, 60)}`);
      continue;
    }
    if (!resolveItem(raw.item)) unknown++;
    pieces.set(raw.id, { id: raw.id, item: raw.item, level: Math.round(raw.level), x: raw.x, z: raw.z, rot: normRot(raw.rot) });
    seq = Math.max(seq, Number(raw.id.slice(1)));
  }
  if (unknown) warnings.push(`${unknown} element(ów) spoza katalogu — zachowane, ale niewidoczne.`);
  return { layout: { name: typeof file.name === 'string' ? file.name : 'Projekt', pieces, seq }, warnings };
}
