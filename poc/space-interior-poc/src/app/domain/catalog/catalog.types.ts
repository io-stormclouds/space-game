import type { ModelId } from './models';

/** How an edge element behaves for rooms, air and movement. */
export type EdgeKind = 'wall' | 'door' | 'glass' | 'railing';

export interface EdgeKindRules {
  readonly label: string;
  /** Holds air: a floor edge closed by it is not a hull breach. */
  readonly airtight: boolean;
  /** Splits rooms (flood fill stops here). */
  readonly boundary: boolean;
  /** Crew can walk through. */
  readonly passable: boolean;
  /** Wall-mounted items can hang on it. */
  readonly mountable: boolean;
}

export const EDGE_KINDS: Readonly<Record<EdgeKind, EdgeKindRules>> = {
  wall: { label: 'Ściana', airtight: true, boundary: true, passable: false, mountable: true },
  door: { label: 'Drzwi', airtight: true, boundary: true, passable: true, mountable: false },
  glass: { label: 'Szkło', airtight: true, boundary: true, passable: false, mountable: false },
  railing: { label: 'Barierka', airtight: false, boundary: false, passable: false, mountable: false },
};

/** Layer of a free-standing object. Objects collide only with their own layer. */
export type ObjectLayer = 'floor' | 'surface' | 'wall' | 'ceiling';

/**
 * How a floor piece joins decks:
 * - 'stairs': a ramp; you walk on from the cell in front of it and step off one deck higher onto
 *   the cell behind it (kit ramps rise towards their local −Z). The deck above needs an opening.
 * - 'lift': a lift stop; stops in the same cell on adjacent decks form a shaft.
 */
export type Connector = 'stairs' | 'lift';

export type Placement =
  /** Fills size × size cells of the deck. */
  | {
      readonly kind: 'floor';
      readonly size: 1 | 2;
      /** Solid volume (deck block, ramp, catwalk): nothing can stand on it at its own level. */
      readonly noObjects?: boolean;
      /** Its top is a walkable floor of the level above (deck block). */
      readonly raisesDeck?: boolean;
      readonly connector?: Connector;
    }
  | { readonly kind: 'ceiling'; readonly size: 1 }
  /** Sits on `span` consecutive cell edges. */
  | { readonly kind: 'edge'; readonly edge: EdgeKind; readonly span: 1 | 2 }
  | {
      readonly kind: 'object';
      readonly layer: ObjectLayer;
      /** Footprint override in metres (local X × local Z); default = measured bounds rounded to 0.5 m. */
      readonly footprint?: readonly [number, number];
      /** 'bounds' centres the footprint on the measured bounds; 'model' keeps the model pivot. */
      readonly pivot?: 'bounds' | 'model';
      /** Height of the model origin above the deck (wall items), metres. */
      readonly mountY?: number;
      /** Wall items: how far the model sinks into the wall face, metres. */
      readonly inset?: number;
      /** Tables etc.: surface items placed on it are lifted to this height. */
      readonly surfaceHeight?: number;
    };

export type CategoryId =
  | 'floors'
  | 'walls'
  | 'doors'
  | 'windows'
  | 'structure'
  | 'vertical'
  | 'crew'
  | 'command'
  | 'engineering'
  | 'medical'
  | 'hydroponics'
  | 'mess'
  | 'wall-mounts'
  | 'lighting'
  | 'decor';

export type RoomTypeId =
  | 'bridge'
  | 'quarters'
  | 'medbay'
  | 'hydroponics'
  | 'engineering'
  | 'mess'
  | 'briefing'
  | 'storage'
  | 'stairwell'
  | 'lift'
  | 'corridor'
  | 'generic';

/** What a piece contributes to the ship (feeds the game economy later). */
export interface ShipStats {
  readonly berths: number;
  readonly power: number;
  readonly food: number;
  readonly care: number;
  readonly storage: number;
}

/**
 * Light a piece gives off (lamps, but also screens, consoles, reactors — in the kit's night renders
 * most of the light comes from screens). Used by the renderer's night lighting; also game data
 * ("is this room lit?").
 */
export interface LightSpec {
  /** Linear-ish hex colour; 'variant' takes it from the variant key (blue, red, …). */
  readonly color: number | 'variant';
  /** Relative strength (≈ candela at the night preset's multiplier 1). */
  readonly intensity: number;
  /** Height of the light above the deck, metres. */
  readonly height: number;
  /** How far in front of the piece the light sits (screens light what faces them), metres. */
  readonly forward?: number;
  /** Cut-off distance, metres. */
  readonly reach?: number;
}

export interface Variant {
  /** Globally unique: `${entry.id}/${key}`. This is what a placed piece stores. */
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly model: ModelId;
  /** Chip colour in the catalog (the object's real colour, not a UI accent). */
  readonly swatch: string;
  readonly stats?: Partial<ShipStats>;
}

export interface CatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly category: CategoryId;
  readonly placement: Placement;
  readonly variants: readonly Variant[];
  readonly hint?: string;
  /** Room-type votes of one piece. */
  readonly tags?: Partial<Record<RoomTypeId, number>>;
  readonly stats?: Partial<ShipStats>;
  readonly light?: LightSpec;
}

export interface CategoryInfo {
  readonly id: CategoryId;
  readonly label: string;
  readonly group: 'build' | 'furnish';
}
