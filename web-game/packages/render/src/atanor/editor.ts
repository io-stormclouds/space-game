// Machine editor of the Atanor view (AT2): tool, ghost, selection and undo/redo over the pure
// operations of the domain (Atanor.placeArm, placeGlyph, …). Framework-free; the app wraps it in
// signals. PoC: poc/space-atanor game-state.service.ts (build tools, preview rotation, timeline
// edits), here with every element of §8.1, building limits and history.
import { Atanor } from '@space-game/domain';
import { resolveAtanorLevel } from './layout';

export type AtanorSolution = Atanor.AtanorSolution;
export type AtanorCommand = Atanor.ArmCommand;
export type AtanorTool = Atanor.EditTool | 'SELECT';
export type AtanorEditIssue = Atanor.EditIssue;

/** Ghost of the active tool on the hovered hex (drawn by the view). */
export interface AtanorGhost {
  tool: Atanor.EditTool;
  hex: { q: number; r: number };
  rotation: number;
  length: number;
  valid: boolean;
}

/** What the view needs from the editor each frame. */
export interface AtanorEditorView {
  solution: AtanorSolution;
  version: number;
  ghost: AtanorGhost | null;
  selectedId: string | null;
}

const HISTORY = 100;

/**
 * Start of a project (A21): in a building A_NAD gets the reference arms as a hint and the other
 * recipes an empty board; the sandbox (no building) shows the reference machine of every level.
 */
export function initialDraft(level: Atanor.LevelConfig, inBuilding: boolean): AtanorSolution {
  const ref = Atanor.getReferenceSolution(level);
  if (!inBuilding || Atanor.levelKind(level) === 'poc') return ref;
  return level.recipe?.recipeId === 'A_NAD' ? Atanor.hintSolution(ref) : Atanor.emptySolution();
}

export class AtanorEditor {
  readonly level: Atanor.LevelConfig;
  readonly buildingLevel: number | null;
  tool: AtanorTool = 'SELECT';
  rotation = 0;
  armLength = 1;
  selected: Atanor.ElementRef | null = null;
  /** Why the last edit did not happen (shown by the HUD), null after a successful one. */
  issue: AtanorEditIssue | null = null;
  version = 0;
  private history: AtanorSolution[];
  private index = 0;
  private hover: { q: number; r: number } | null = null;

  constructor(level: Atanor.LevelConfig, buildingLevel: number | null, solution?: AtanorSolution | null) {
    this.level = level;
    this.buildingLevel = buildingLevel;
    this.history = [solution ?? initialDraft(level, buildingLevel !== null)];
  }

  get solution(): AtanorSolution {
    return this.history[this.index]!;
  }

  get ctx(): Atanor.EditContext {
    return { level: this.level, buildingLevel: this.buildingLevel };
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  /** Longest arm the building level allows (§8.1). */
  get maxArmLength(): number {
    return Atanor.maxArmLength(this.ctx);
  }

  /** Arm limit of the building level (§8.1); null in the sandbox. */
  get maxArms(): number | null {
    return Atanor.limitsOf(this.ctx)?.maxArms ?? null;
  }

  /** Selects an arm (timeline row label) or clears the selection. */
  selectArm(armId: string | null): void {
    this.selected = armId && this.solution.arms.some((a) => a.id === armId) ? { kind: 'ARM', id: armId } : null;
  }

  /** Tools of the building level and recipe (§8.1). */
  tools(): Atanor.EditTool[] {
    return Atanor.allowedTools(this.ctx);
  }

  /**
   * Why a tool is not available: the building level that unlocks it (§8.1), or the recipe needs
   * no transmutation. Null when it is available.
   */
  lockOf(tool: Atanor.EditTool): { level: number } | { recipe: true } | null {
    if (this.tools().includes(tool)) return null;
    if (tool === 'TRANSMUTE' && Atanor.levelTransmutations(this.level).length === 0) return { recipe: true };
    const unlocks = (l: Atanor.AtanorBuildingLevel) =>
      tool === 'PISTON' ? l.pistons : tool === 'MULTI' ? l.multiArms : tool === 'TRACK' ? l.tracks : tool === 'TRANSMUTE' || tool === 'BONDER' || tool === 'UNBONDER' ? l.glyphs.includes(tool) : true;
    const at = Atanor.ATANOR_BUILDING_LEVELS.find(unlocks);
    return at ? { level: at.level } : { recipe: true };
  }

  /** Picks a tool; picking ARM again lengthens the arm (1 → 2 → 3 → 1 within the limit). */
  setTool(tool: AtanorTool): void {
    if (tool !== 'SELECT' && tool !== 'DELETE' && !this.tools().includes(tool)) return;
    if (tool === 'ARM' && this.tool === 'ARM') this.armLength = (this.armLength % Atanor.maxArmLength(this.ctx)) + 1;
    else if ((tool === 'BONDER' && this.tool === 'BONDER') || (tool === 'UNBONDER' && this.tool === 'UNBONDER')) {
      // the bonder slot toggles to the unbonder and back
      const other = tool === 'BONDER' ? 'UNBONDER' : 'BONDER';
      if (this.tools().includes(other)) tool = other;
    }
    this.tool = tool;
    this.issue = null;
  }

  /** R: turns the ghost, or the selected arm / bonder when no tool is active. */
  rotate(steps = 1): void {
    if (this.tool !== 'SELECT' && this.tool !== 'DELETE') {
      this.rotation = (((this.rotation + steps) % 6) + 6) % 6;
      return;
    }
    const hex = this.selectedHex();
    if (hex) this.commit(Atanor.rotateAt(this.ctx, this.solution, hex, steps));
  }

  /** The hovered hex (ghost), or null off the board. */
  setHover(hex: { q: number; r: number } | null): void {
    this.hover = hex;
  }

  ghost(): AtanorGhost | null {
    if (!this.hover || this.tool === 'SELECT') return null;
    const r = this.attempt(this.hover);
    return { tool: this.tool, hex: { ...this.hover }, rotation: this.rotation, length: this.armLength, valid: r?.ok ?? false };
  }

  /** A click on the board with the active tool; SELECT picks what stands there. */
  apply(hex: { q: number; r: number }): boolean {
    if (this.tool === 'SELECT') {
      this.selected = Atanor.elementAt(this.level, this.solution, hex);
      this.issue = null;
      return this.selected !== null;
    }
    const r = this.attempt(hex);
    return r ? this.commit(r) : false;
  }

  setCommand(armId: string, column: number, command: AtanorCommand | null): void {
    this.push(Atanor.setCommand(this.solution, armId, column, command));
  }

  paste(armId: string, column: number, commands: ReadonlyArray<AtanorCommand | null>): void {
    this.push(Atanor.pasteCommands(this.solution, armId, column, commands));
  }

  insertColumn(column: number): void {
    this.push(Atanor.insertColumn(this.solution, column));
  }

  deleteColumn(column: number): void {
    this.push(Atanor.deleteColumn(this.solution, column));
  }

  undo(): void {
    if (!this.canUndo) return;
    this.index -= 1;
    this.changed();
  }

  redo(): void {
    if (!this.canRedo) return;
    this.index += 1;
    this.changed();
  }

  /** Replaces the whole machine (e.g. a saved variant), as one undoable step. */
  load(solution: AtanorSolution): void {
    this.push(solution);
  }

  /** Building-level check (§8.1) and commands the arms cannot run (§5.2). */
  issues(): { machine: Atanor.MachineIssue[]; program: Atanor.ProgramIssue[] } {
    return {
      machine: this.buildingLevel !== null ? Atanor.validateMachine(this.level, this.solution, this.buildingLevel) : [],
      program: Atanor.programIssues(this.solution),
    };
  }

  /** Materials of the machine (§8.2). */
  materials(): Record<string, number> {
    return Atanor.machineMaterials(this.solution);
  }

  viewState(): AtanorEditorView {
    return { solution: this.solution, version: this.version, ghost: this.ghost(), selectedId: this.selected?.id ?? null };
  }

  // -------------------------------------------------------------------------------------------

  private selectedHex(): { q: number; r: number } | null {
    const sel = this.selected;
    if (!sel) return null;
    if (sel.kind === 'ARM') return this.solution.arms.find((a) => a.id === sel.id)?.basePos ?? null;
    if (sel.kind === 'GLYPH') return this.solution.glyphs.find((g) => g.id === sel.id)?.pos ?? null;
    return null;
  }

  private attempt(hex: { q: number; r: number }): Atanor.EditResult | null {
    const ctx = this.ctx;
    const s = this.solution;
    switch (this.tool) {
      case 'ARM':
        return Atanor.placeArm(ctx, s, { hex, rotation: this.rotation, length: this.armLength });
      case 'PISTON':
        return Atanor.placeArm(ctx, s, { hex, rotation: this.rotation, length: Math.min(this.armLength, Atanor.maxArmLength(ctx)), piston: true });
      case 'MULTI':
        return Atanor.placeArm(ctx, s, { hex, rotation: this.rotation, length: this.armLength, grippers: 2 });
      case 'BONDER':
      case 'UNBONDER':
      case 'TRANSMUTE':
        return Atanor.placeGlyph(ctx, s, this.tool, hex, this.rotation);
      case 'TRACK':
        return Atanor.extendTrack(ctx, s, hex);
      case 'DELETE':
        return Atanor.removeAt(ctx, s, hex);
      default:
        return null;
    }
  }

  private commit(r: Atanor.EditResult): boolean {
    if (!r.ok) {
      this.issue = r.issue;
      return false;
    }
    this.push(r.solution);
    if (r.elementId && this.tool !== 'DELETE') {
      const id = r.elementId;
      const arm = r.solution.arms.some((a) => a.id === id);
      const glyph = r.solution.glyphs.some((g) => g.id === id);
      this.selected = arm ? { kind: 'ARM', id } : glyph ? { kind: 'GLYPH', id, port: false } : this.selected;
    } else if (this.tool === 'DELETE') this.selected = null;
    return true;
  }

  private push(solution: AtanorSolution): void {
    if (Atanor.solutionKey(solution) === Atanor.solutionKey(this.solution)) return;
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(solution);
    if (this.history.length > HISTORY) this.history.shift();
    this.index = this.history.length - 1;
    this.issue = null;
    this.changed();
  }

  private changed(): void {
    this.version += 1;
    const sel = this.selected;
    if (sel && !(sel.kind === 'ARM' ? this.solution.arms.some((a) => a.id === sel.id) : sel.kind === 'GLYPH' ? sel.port || this.solution.glyphs.some((g) => g.id === sel.id) : true)) this.selected = null;
  }
}

/** Editor for a level id ('A_NAD', 'L1'…) in a building of `buildingLevel` (null = sandbox). */
export function createAtanorEditor(levelId: string, buildingLevel: number | null, solution?: AtanorSolution | null): AtanorEditor | null {
  const level = resolveAtanorLevel(levelId);
  return level ? new AtanorEditor(level, buildingLevel, solution) : null;
}
