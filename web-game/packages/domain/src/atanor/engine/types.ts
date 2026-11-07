// Ported from poc/space-atanor/src/core/engine/types.ts.
// Additions: input portions, output products, level kind and recipe metadata, jam reasons,
// tick counter and starvation flag in step results, solution and snapshot types.
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
  /**
   * Material units taken from the input buffer for each atom this port dispenses
   * (e.g. 10 u of H2 per H2 atom). Default 1. Only matters with finite supply.
   */
  readonly portion?: number;
}

/** What one delivered molecule is worth in the economy (e.g. 1 NAD). */
export interface OutputProduct {
  readonly material: string;
  readonly quantity: number;
}

export interface OutputProductGlyph extends BaseGlyph {
  readonly type: 'OUTPUT';
  readonly targetPattern: {
    readonly name: string;
    readonly elements: AtomType[];
    readonly relativeHexOffsets: HexCoord[];
    readonly bonds: [number, number][];
  };
  /** Economy product credited for each delivered molecule (recipe levels only). */
  readonly product?: OutputProduct;
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

/** Glyphs owned by the level (the building's ports). The player cannot move or delete them. */
export type PortGlyph = InputReagentGlyph | OutputProductGlyph;

export interface TrackSegment {
  readonly id: string;
  readonly path: HexCoord[]; // Sequence of connected hexes
}

/** `poc` = alchemical teaching levels from the PoC; `recipe` = economy recipe (Fabryka atanorowa). */
export type AtanorLevelKind = 'poc' | 'recipe';

/** Economy metadata of a recipe level (econ-model.ts `atanor(...)` entries, doc §8.3). */
export interface AtanorRecipeInfo {
  /** Recipe id in the economy catalog, e.g. `A_NAD`. */
  readonly recipeId: string;
  /** Minimum level of the Fabryka atanorowa building (§8.1). */
  readonly buildingLevel: number;
  /** Material units consumed per product, as in the economy catalog. */
  readonly inputs: Readonly<Record<string, number>>;
  /** Material units produced per delivered molecule. */
  readonly outputs: Readonly<Record<string, number>>;
  /**
   * Provisional reference numbers from the economy doc §8.3 / econ-model (cycles per product,
   * area, arms). They are NOT measured; compare with `measureAtanorSolution()`.
   */
  readonly docReference: { readonly cycles: number; readonly area: number; readonly arms: number };
}

export interface LevelConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly targetRequired: number;
  /** Missing = `poc` (levels created ad hoc in tests). */
  readonly kind?: AtanorLevelKind;
  readonly recipe?: AtanorRecipeInfo;
  glyphs: Glyph[];
  tracks?: TrackSegment[];
  initialArms: ArmState[];
  defaultInstructions: Record<string, (ArmCommand | null)[]>; // armId -> list of commands
}

/** Why the simulation stopped with a JAM. */
export type JamReason =
  /** Two atoms ended a tick on the same hex (PoC rule). */
  | 'ATOM_COLLISION'
  /** Arms holding the same molecule tried to move it in different ways (or one moved, one held still). */
  | 'MOLECULE_CONFLICT';

export interface SimulationStepResult {
  /** Timeline slot that was executed (wraps on REPEAT). Not a counter — see `tick`. */
  readonly cycle: number;
  /** Ticks executed since reset, this one included (the CYKLE counter; never wraps). */
  readonly tick: number;
  readonly commandsExecuted: Record<string, ArmCommand>;
  readonly collisionDetected: boolean;
  readonly collisionMessage?: string;
  readonly jamReason: JamReason | null;
  /** True when the step did not run because an input port was empty (finite supply). */
  readonly starved: boolean;
  readonly productsDelivered: number;
  readonly isLevelCompleted: boolean;
  readonly atoms: Atom[];
  readonly bonds: Bond[];
  readonly arms: ArmState[];
}

/**
 * What the player builds on a level: arms, own glyphs (bonders, unbonders, transmuters),
 * tracks and the program. Ports (INPUT/OUTPUT) come from the level.
 */
export interface AtanorSolution {
  readonly arms: ArmState[];
  readonly glyphs: Glyph[];
  readonly tracks: TrackSegment[];
  readonly program: Record<string, (ArmCommand | null)[]>;
}

/** Read-only view of a running simulation for the UI. */
export interface AtanorSnapshot {
  readonly levelId: string;
  /** Ticks executed since reset (CYKLE). */
  readonly ticks: number;
  /** Timeline slot that the next tick will execute (the playhead). */
  readonly timelinePosition: number;
  readonly atoms: Atom[];
  readonly bonds: Bond[];
  readonly molecules: { atomIds: string[]; bondIds: string[] }[];
  readonly arms: ArmState[];
  readonly delivered: number;
  readonly target: number;
  readonly completed: boolean;
  /** Tick on which `delivered` reached `target` (OM-style "cycles"), null before that. */
  readonly completedAtTick: number | null;
  readonly jam: { readonly reason: JamReason; readonly message: string } | null;
  readonly starved: boolean;
  readonly starvedSteps: number;
  /** Remaining input buffers in material units; null = unlimited inputs. */
  readonly supply: Record<string, number> | null;
  /** Material units taken from inputs since reset. */
  readonly consumed: Record<string, number>;
  /** Economy products credited by outputs since reset. */
  readonly produced: Record<string, number>;
}
