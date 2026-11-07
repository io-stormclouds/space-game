// Ported from poc/space-atanor/src/core/engine/glyph.ts.
// Changes: optional input `portion` and output `product` (economy), isPortGlyph(), glyphCells().
import { HexCoord, hexDistance } from '../grid/hex';
import {
  BonderGlyph,
  Glyph,
  InputReagentGlyph,
  OutputProduct,
  OutputProductGlyph,
  PortGlyph,
  TransmuteGlyph,
  UnbonderGlyph,
} from './types';
import { AtomType } from '../graph/molecule';

export function createInputGlyph(id: string, pos: HexCoord, element: AtomType, portion?: number): InputReagentGlyph {
  if (portion !== undefined && !(portion > 0)) {
    throw new Error(`Input portion must be positive: ${portion}`);
  }
  return {
    id,
    type: 'INPUT',
    pos: { ...pos },
    element,
    ...(portion !== undefined ? { portion } : {}),
  };
}

export function createOutputGlyph(
  id: string,
  pos: HexCoord,
  targetPattern: OutputProductGlyph['targetPattern'],
  product?: OutputProduct
): OutputProductGlyph {
  return {
    id,
    type: 'OUTPUT',
    pos: { ...pos },
    targetPattern,
    ...(product ? { product: { ...product } } : {}),
  };
}

export function createBonderGlyph(id: string, pos1: HexCoord, pos2: HexCoord): BonderGlyph {
  if (hexDistance(pos1, pos2) !== 1) {
    throw new Error(`Bonder glyph positions must be adjacent hexes: ${JSON.stringify(pos1)} and ${JSON.stringify(pos2)}`);
  }
  return {
    id,
    type: 'BONDER',
    pos: { ...pos1 },
    pos2: { ...pos2 },
  };
}

export function createUnbonderGlyph(id: string, pos1: HexCoord, pos2: HexCoord): UnbonderGlyph {
  if (hexDistance(pos1, pos2) !== 1) {
    throw new Error(`Unbonder glyph positions must be adjacent hexes: ${JSON.stringify(pos1)} and ${JSON.stringify(pos2)}`);
  }
  return {
    id,
    type: 'UNBONDER',
    pos: { ...pos1 },
    pos2: { ...pos2 },
  };
}

export function createTransmuteGlyph(
  id: string,
  pos: HexCoord,
  fromElement: AtomType,
  toElement: AtomType
): TransmuteGlyph {
  return {
    id,
    type: 'TRANSMUTE',
    pos: { ...pos },
    fromElement,
    toElement,
  };
}

/** INPUT and OUTPUT glyphs belong to the level (building ports), the rest to the player. */
export function isPortGlyph(glyph: Glyph): glyph is PortGlyph {
  return glyph.type === 'INPUT' || glyph.type === 'OUTPUT';
}

/** Hexes covered by a glyph (two for bonders/unbonders). */
export function glyphCells(glyph: Glyph): HexCoord[] {
  if (glyph.type === 'BONDER' || glyph.type === 'UNBONDER') {
    return [glyph.pos, glyph.pos2];
  }
  return [glyph.pos];
}

export function getGlyphCost(glyph: Glyph): number {
  switch (glyph.type) {
    case 'BONDER':
      return 10;
    case 'UNBONDER':
      return 10;
    case 'TRANSMUTE':
      return 20;
    case 'INPUT':
    case 'OUTPUT':
    default:
      return 0; // Reagents and Products are free level components
  }
}
