import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { AtanorCommand, AtanorEditor, AtanorEditIssue, AtanorSolution, AtanorTool, AtanorViewInput } from '@space-game/render';
import { UiState } from './ui-state';

/** A palette entry of the timeline: a command, or clearing the cell (PoC command palette). */
export type PaletteCommand = AtanorCommand | 'CLEAR';

/** What the HUD shows of the editor; recomputed after every change. */
export interface AtanorEditorState {
  tool: AtanorTool;
  tools: AtanorTool[];
  rotation: number;
  armLength: number;
  maxArmLength: number;
  maxArms: number | null;
  canUndo: boolean;
  canRedo: boolean;
  issue: AtanorEditIssue | null;
  solution: AtanorSolution;
  selectedId: string | null;
  machineIssues: Array<{ code: string; message: string; elementId?: string }>;
  programIssues: Array<{ armId: string; column: number; code: string }>;
  materials: Record<string, number>;
  buildingLevel: number | null;
  /** Why a tool is locked: the building level that unlocks it, or the recipe does not need it. */
  locks: Partial<Record<AtanorTool, { level: number } | { recipe: true }>>;
}

const LOCKABLE: AtanorTool[] = ['ARM', 'PISTON', 'MULTI', 'BONDER', 'UNBONDER', 'TRANSMUTE', 'TRACK'];

/** A saved variant of the design with its numbers at the time it was saved (A24, §5.3). */
export interface AtanorVariant {
  id: number;
  solution: AtanorSolution;
  cycles: number | null;
  area: number;
  arms: number;
  /** MW at the building level. */
  power: number | null;
  /** Cost of one product with this machine [kr] (economy §4.1). */
  unitValue: number | null;
  /** Materials of the machine [kr]. */
  machineKr: number | null;
}

/**
 * The machine being designed in the Atanor view (AT2): one editor per open building (or the
 * sandbox), its drafts, the timeline palette and the trial run. Editing logic lives in the render
 * package's framework-free AtanorEditor (domain operations); this service only wires it to signals.
 * Drafts are kept per building and recipe for the session (AT4 stores them in the world).
 */
@Injectable({ providedIn: 'root' })
export class AtanorSession {
  private readonly ui = inject(UiState);
  private readonly drafts = new Map<string, AtanorSolution>();
  private editorRef: AtanorEditor | null = null;
  private key = '';
  private draftKey: string | null = null;
  /** Bumped after each editor change; signals that read the editor depend on it. */
  private readonly changes = signal(0);

  /** Trial run of the draft (unlimited inputs, own tempo, A22). */
  readonly trial = signal(false);
  /** Selected timeline command (PoC palette, default GRAB). */
  readonly command = signal<PaletteCommand>('GRAB');
  /** Saved variants of the open design (per building and recipe, or per sandbox level). */
  readonly variants = signal<AtanorVariant[]>([]);
  private readonly variantStore = new Map<string, AtanorVariant[]>();
  private nextVariant = 1;

  readonly state = computed<AtanorEditorState | null>(() => {
    this.changes();
    const e = this.editorRef;
    if (!e) return null;
    const issues = e.issues();
    return {
      tool: e.tool,
      tools: e.tools(),
      rotation: e.rotation,
      armLength: e.armLength,
      maxArmLength: e.maxArmLength,
      maxArms: e.maxArms,
      canUndo: e.canUndo,
      canRedo: e.canRedo,
      issue: e.issue,
      solution: e.solution,
      selectedId: e.selected?.id ?? null,
      machineIssues: issues.machine.map((i) => ({ code: i.code, message: i.message, ...(i.elementId ? { elementId: i.elementId } : {}) })),
      programIssues: issues.program.map((i) => ({ ...i })),
      materials: e.materials(),
      buildingLevel: e.buildingLevel,
      locks: Object.fromEntries(LOCKABLE.map((t) => [t, e.lockOf(t as never)]).filter(([, l]) => l !== null)),
    };
  });

  constructor() {
    effect(() => {
      const input = this.ui.atanorInput();
      const site = this.ui.atanorSite();
      untracked(() => void this.sync(input, site));
    });
    // a freshly mounted view starts at rest: the design is shown at tick 0 until "Próba"
    effect(() => {
      const view = this.ui.atanor();
      if (view && !untracked(() => this.trial())) view.reset();
    });
  }

  /** The view input with the editor's machine, ghost and selection (read every frame). */
  viewInput(): AtanorViewInput | null {
    const base = this.ui.atanorInput();
    if (!base) return null;
    return { ...base, editor: this.editorRef?.viewState() ?? null };
  }

  setTool(tool: AtanorTool): void {
    this.edit((e) => e.setTool(tool), false);
  }

  rotate(): void {
    this.edit((e) => e.rotate(1));
  }

  selectArm(armId: string | null): void {
    this.edit((e) => e.selectArm(armId), false);
  }

  hover(hex: { q: number; r: number } | null): void {
    this.editorRef?.setHover(hex);
  }

  /** Click on a board hex with the active tool. */
  apply(hex: { q: number; r: number }): void {
    this.edit((e) => e.apply(hex));
  }

  undo(): void {
    this.edit((e) => e.undo());
  }

  redo(): void {
    this.edit((e) => e.redo());
  }

  /** Timeline cell: the palette's command, or a cleared cell. */
  writeCell(armId: string, column: number, command: PaletteCommand | null = this.command()): void {
    this.edit((e) => e.setCommand(armId, column, command === 'CLEAR' ? null : command));
  }

  paste(armId: string, column: number, commands: ReadonlyArray<AtanorCommand | null>): void {
    this.edit((e) => e.paste(armId, column, commands));
  }

  insertColumn(column: number): void {
    this.edit((e) => e.insertColumn(column));
  }

  deleteColumn(column: number): void {
    this.edit((e) => e.deleteColumn(column));
  }

  /** Saves the current design with its numbers as a variant (same design twice is kept once). */
  saveVariant(numbers: Omit<AtanorVariant, 'id' | 'solution'>): void {
    const e = this.editorRef;
    if (!e) return;
    const list = this.variants();
    const same = list.find((v) => v.solution === e.solution);
    const next = same ? list.map((v) => (v === same ? { ...v, ...numbers } : v)) : [...list, { id: this.nextVariant++, solution: e.solution, ...numbers }];
    this.variants.set(next);
    this.variantStore.set(this.variantKey(), next);
  }

  /** Loads a variant into the editor (one undoable step). */
  loadVariant(id: number): void {
    const v = this.variants().find((x) => x.id === id);
    if (v) this.edit((e) => e.load(v.solution));
  }

  removeVariant(id: number): void {
    const next = this.variants().filter((v) => v.id !== id);
    this.variants.set(next);
    this.variantStore.set(this.variantKey(), next);
  }

  private variantKey(): string {
    return this.draftKey ?? this.key;
  }

  startTrial(): void {
    const view = this.ui.atanor();
    if (!view) return;
    view.reset();
    view.play();
    this.trial.set(true);
  }

  stopTrial(): void {
    this.ui.atanor()?.reset();
    this.trial.set(false);
  }

  /** Esc in the Atanor view: drop the tool, then end the trial, then leave the view. */
  escape(): void {
    const e = this.editorRef;
    if (e && e.tool !== 'SELECT') this.setTool('SELECT');
    else if (this.trial()) this.stopTrial();
    else this.ui.closeAtanor();
  }

  // -------------------------------------------------------------------------------------------

  /** Runs an editor operation; a change of the design ends the trial (the view resets, PoC). */
  private edit(op: (e: AtanorEditor) => unknown, endsTrial = true): void {
    const e = this.editorRef;
    if (!e) return;
    const before = e.version;
    op(e);
    if (endsTrial && e.version !== before && this.trial()) this.trial.set(false);
    if (this.draftKey) this.drafts.set(this.draftKey, e.solution);
    this.changes.update((n) => n + 1);
  }

  private async sync(input: AtanorViewInput | null, site: string | null): Promise<void> {
    if (!input) {
      this.trial.set(false);
      return;
    }
    const key = `${site ?? 'sandbox'}|${input.level}|${input.buildingLevel}`;
    if (key === this.key && this.editorRef) return;
    this.key = key;
    const { createAtanorEditor } = await import('@space-game/render');
    if (this.key !== key) return; // a newer open overtook this one
    this.draftKey = site ? `${site}|${input.level}` : null;
    this.editorRef = createAtanorEditor(input.level, input.buildingLevel, this.draftKey ? this.drafts.get(this.draftKey) : null);
    this.variants.set(this.variantStore.get(this.variantKey()) ?? []);
    this.trial.set(false);
    this.changes.update((n) => n + 1);
  }
}
