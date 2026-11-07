import type { BodyId, FrameData, GameSnapshot } from '@space-game/api';
import type { WebGLRenderer } from 'three';

// Contract between the app and the scenes (F4). The app owns the animation loop and calls
// `RenderHost.update` every frame with the latest snapshot; scenes keep no game state.

export type ViewKind = 'planet' | 'system' | 'galaxy' | 'atanor';

export type PickResult =
  | { kind: 'EMPTY' }
  | { kind: 'BODY'; bodyId: BodyId }
  | { kind: 'TILE'; bodyId: BodyId; tileIndex: number }
  | { kind: 'STRUCTURE'; bodyId: BodyId; structureId: string; tileIndex: number }
  | { kind: 'SHIP'; shipId: string }
  | { kind: 'ROVER'; roverId: string; bodyId: BodyId }
  | { kind: 'STAR'; starName: string };

/** Ghost of a building being placed (canvas "duch na polu"). */
export interface Placement {
  kind: string;
  /** Tiles the footprint covers on the focus body (empty when it does not fit). */
  tiles: number[];
  valid: boolean;
}

export type Selection =
  | { kind: 'NONE' }
  | { kind: 'BODY'; bodyId: BodyId }
  | { kind: 'TILE'; bodyId: BodyId; tileIndex: number }
  | { kind: 'STRUCTURE'; structureId: string }
  | { kind: 'SHIP'; shipId: string }
  | { kind: 'ROVER'; roverId: string }
  | { kind: 'STAR'; starName: string };

export interface ViewInput {
  snapshot: GameSnapshot;
  frame: FrameData | null;
  /** Body the planet camera looks at (the system camera centres on the star and fits all orbits). */
  focusBodyId: BodyId | null;
  selection: Selection;
  hover: PickResult | null;
  placement: Placement | null;
  /** Atanor view: recipe level id to show (e.g. 'A_NAD'). */
  atanorLevel?: string;
}

export interface RenderStats {
  view: ViewKind | null;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Live WebGL contexts owned by the host (must never exceed 1). */
  contexts: number;
}

/** Everything a view gets from the host. Three.js views share one renderer. */
export interface ViewContext {
  container: HTMLElement;
  /** Shared Three.js renderer; null for views that bring their own (Atanor/PixiJS). */
  three: WebGLRenderer | null;
  /** Base URL of static assets (KayKit models), e.g. 'assets/'. */
  assetsBase: string;
  width: number;
  height: number;
}

export interface View {
  readonly kind: ViewKind | ViewKind[];
  /** Whether the view renders with the shared Three.js renderer (false = brings its own context). */
  readonly usesThree: boolean;
  mount(ctx: ViewContext): Promise<void> | void;
  /** Switch between kinds served by the same view (planet ↔ system camera presets, W12 A). */
  setKind?(kind: ViewKind): void;
  update(input: ViewInput, dtSeconds: number): void;
  pick(x: number, y: number, input: ViewInput): PickResult;
  resize(width: number, height: number): void;
  /** Frees every GPU resource it created (geometries, materials, textures, contexts). */
  dispose(): void;
  /** Counters for the overlay; Three.js views may leave them to the host. */
  stats?(): Partial<RenderStats>;
}

export type ViewFactory = () => View | Promise<View>;
