import { HexCoord, hexAllNeighbors, hexDistance, hexEquals } from '../grid/hex';
import { BonderGlyph, Glyph, InputReagentGlyph, OutputProductGlyph, TransmuteGlyph, UnbonderGlyph } from './types';
import { AtomType } from '../graph/molecule';

export function createInputGlyph(id: string, pos: HexCoord, element: AtomType): InputReagentGlyph {
  return {
    id,
    type: 'INPUT',
    pos: { ...pos },
    element,
  };
}

export function createOutputGlyph(
  id: string,
  pos: HexCoord,
  targetPattern: OutputProductGlyph['targetPattern']
): OutputProductGlyph {
  return {
    id,
    type: 'OUTPUT',
    pos: { ...pos },
    targetPattern,
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

