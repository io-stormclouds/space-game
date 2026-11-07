import { HexCoord } from '../grid/hex';
import { Atom, AtomType, Bond } from '../graph/molecule';

export type ArmCommand =
  | 'GRAB'
  | 'DROP'
  | 'ROTATE_CW'
  | 'ROTATE_CCW'
  | 'PIVOT_CW'
  | 'PIVOT_CCW'
  | 'EXTEND'
  | 'RETRACT'
  | 'TRACK_POS'
  | 'TRACK_NEG'
  | 'REPEAT'
  | 'EMPTY';

export interface ArmState {
  readonly id: string;
  basePos: HexCoord;
  rotation: number; // 0..5 (indices of HEX_DIRECTIONS)
  length: number;   // 1, 2, 3
  isPiston: boolean;
  isHolding: boolean;
  heldAtomId: string | null;
  trackId?: string | null; // Track the base may slide along (optional)
  trackIndex?: number;      // Current index on the track path
}

export type GlyphType = 'BONDER' | 'UNBONDER' | 'INPUT' | 'OUTPUT' | 'TRANSMUTE';

export interface BaseGlyph {
  readonly id: string;
  readonly type: GlyphType;
  readonly pos: HexCoord;
}

export interface BonderGlyph extends BaseGlyph {
  readonly type: 'BONDER';
  readonly pos2: HexCoord; // Adjacent hex where bond is formed between pos and pos2
}

export interface UnbonderGlyph extends BaseGlyph {
  readonly type: 'UNBONDER';
  readonly pos2: HexCoord;
}

export interface InputReagentGlyph extends BaseGlyph {
  readonly type: 'INPUT';
  readonly element: AtomType;
}

export interface OutputProductGlyph extends BaseGlyph {
  readonly type: 'OUTPUT';
  readonly targetPattern: {
    readonly name: string;
    readonly elements: AtomType[];
    readonly relativeHexOffsets: HexCoord[];
    readonly bonds: [number, number][];
  };
}

/**
 * Transmute glyph: any atom of `fromElement` resting on this glyph is converted
 * into `toElement` during the reaction phase.
 */
export interface TransmuteGlyph extends BaseGlyph {
  readonly type: 'TRANSMUTE';
  readonly fromElement: AtomType;
  readonly toElement: AtomType;
}

export type Glyph =
  | BonderGlyph
  | UnbonderGlyph
  | InputReagentGlyph
  | OutputProductGlyph
  | TransmuteGlyph;
export interface TrackSegment {
  readonly id: string;
  readonly path: HexCoord[]; // Sequence of connected hexes
}

export interface LevelConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly targetRequired: number;
  glyphs: Glyph[];
  tracks?: TrackSegment[];
  initialArms: ArmState[];
  defaultInstructions: Record<string, (ArmCommand | null)[]>; // armId -> list of commands
}

export interface SimulationStepResult {
  readonly cycle: number;
  readonly commandsExecuted: Record<string, ArmCommand>;
  readonly collisionDetected: boolean;
  readonly collisionMessage?: string;
  readonly productsDelivered: number;
  readonly isLevelCompleted: boolean;
  readonly atoms: Atom[];
  readonly bonds: Bond[];
  readonly arms: ArmState[];
}

