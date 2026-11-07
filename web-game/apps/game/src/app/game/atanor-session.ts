import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { AtanorMachine } from '@space-game/api';
import type { AtanorCommand, AtanorEditor, AtanorEditIssue, AtanorSolution, AtanorTool, AtanorViewInput } from '@space-game/render';
import { GameService } from './game.service';
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

const DESIGN_FORMAT = 'web-game-atanor-design';

/** A design file (AT6): shared outside the game and verified by measuring it again. */
export interface AtanorDesignFile {
  format: typeof DESIGN_FORMAT;
  version: 1;
  recipe: string;
  buildingLevel: number | null;
  solution: AtanorSolution;
  claimed: { cycles: number | null; area: number; arms: number };
}

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
  private readonly game = inject(GameService);
  private readonly drafts = new Map<string, AtanorSolution>();
  /** Editor version last saved to the world as the building's draft. */
  private savedVersion = -1;

  /** The open building's machine in the world (AT4): program, deployment, ticks, state. */
  readonly machine = computed<AtanorMachine | null>(() => {
    const id = this.ui.atanorSite();
    return id ? (this.game.world()?.machines?.[id] ?? null) : null;
  });
  /** The view shows the working machine (its program at the world's ticks) instead of the draft. */
  readonly watch = signal(false);
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
    const m = this.machine();
    if (this.watch() && m?.program) {
      return { ...base, editor: { solution: m.program, version: -1, ghost: null, selectedId: null }, production: { ticks: m.ticks, progress: m.progress } };
    }
    return { ...base, editor: this.editorRef?.viewState() ?? null };
  }

  /** V: the working machine ↔ the draft. */
  toggleWatch(): void {
    if (!this.machine()?.program && !this.watch()) return;
    if (this.trial()) this.stopTrial();
    const was = this.watch();
    this.watch.set(!was);
    if (was) this.ui.atanor()?.reset(); // the draft at rest again
  }

  /** Numbers a loaded design file claims (AT6); the view measures the design again to verify them. */
  readonly imported = signal<{ cycles: number | null; area: number; arms: number } | null>(null);

  /** The draft as a design file (AT6): recipe, building level, machine and the numbers it claims. */
  exportDesign(numbers: { cycles: number | null; area: number; arms: number }): { name: string; text: string } | null {
    const e = this.editorRef;
    if (!e) return null;
    const recipe = e.level.recipe?.recipeId ?? e.level.id;
    const file: AtanorDesignFile = { format: DESIGN_FORMAT, version: 1, recipe, buildingLevel: e.buildingLevel, solution: e.solution, claimed: numbers };
    return { name: `atanor-${recipe}.json`, text: JSON.stringify(file, null, 2) };
  }

  /** Loads a design file into the editor (one undoable step); refuses foreign files and other recipes. */
  importDesign(text: string): 'OK' | 'NOT_A_DESIGN' | 'OTHER_RECIPE' {
    const e = this.editorRef;
    if (!e) return 'NOT_A_DESIGN';
    let file: Partial<AtanorDesignFile>;
    try {
      file = JSON.parse(text) as Partial<AtanorDesignFile>;
    } catch {
      return 'NOT_A_DESIGN';
    }
    const s = file.solution as Partial<AtanorSolution> | undefined;
    if (file.format !== DESIGN_FORMAT || !s || !Array.isArray(s.arms) || !Array.isArray(s.glyphs) || !Array.isArray(s.tracks) || typeof s.program !== 'object' || s.program === null) return 'NOT_A_DESIGN';
    if (file.recipe !== (e.level.recipe?.recipeId ?? e.level.id)) return 'OTHER_RECIPE';
    this.edit((x) => x.load(s as AtanorSolution));
    this.imported.set(file.claimed ?? null);
    return 'OK';
  }

  /** Keeps the draft with the building in the world (save files), when it changed (AT4). */
  saveDraft(): void {
    const e = this.editorRef;
    const site = this.ui.atanorSite();
    if (!e || !site || e.version === this.savedVersion) return;
    this.savedVersion = e.version;
    void this.game.command({ type: 'SAVE_ATANOR_DRAFT', structureId: site, solution: e.solution });
  }

  /** Deploys the draft as the building's machine (§3.2); the server checks it again. */
  async deploy(): Promise<boolean> {
    const e = this.editorRef;
    const site = this.ui.atanorSite();
    if (!e || !site) return false;
    this.saveDraft();
    const r = await this.game.command({ type: 'DEPLOY_ATANOR', structureId: site, solution: e.solution });
    if (r.ok) this.stopTrial();
    return r.ok;
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

  /** Esc in the Atanor view: drop the tool, then end the trial or the watching, then leave the view. */
  escape(): void {
    const e = this.editorRef;
    if (e && e.tool !== 'SELECT') this.setTool('SELECT');
    else if (this.trial()) this.stopTrial();
    else if (this.watch()) this.watch.set(false);
    else {
      this.saveDraft();
      this.ui.closeAtanor();
    }
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
    this.saveDraft(); // the previous building's draft, before switching
    this.key = key;
    const { createAtanorEditor } = await import('@space-game/render');
    if (this.key !== key) return; // a newer open overtook this one
    this.draftKey = site ? `${site}|${input.level}` : null;
    // the draft of this session, else the one saved with the world (a loaded game), else A21
    const stored = site ? this.game.world()?.machines?.[site] : undefined;
    const fromWorld = stored && stored.recipe === input.level ? stored.draft : null;
    this.editorRef = createAtanorEditor(input.level, input.buildingLevel, (this.draftKey ? this.drafts.get(this.draftKey) : null) ?? fromWorld);
    this.savedVersion = this.editorRef?.version ?? -1;
    this.variants.set(this.variantStore.get(this.variantKey()) ?? []);
    this.trial.set(false);
    this.watch.set(false);
    this.imported.set(null);
    this.changes.update((n) => n + 1);
  }
}
