import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { resolveItem } from '../domain/catalog/catalog';
import { normRot, type Rot } from '../domain/grid';
import { EMPTY_HISTORY, execute, redo, undo, type History } from '../domain/history';
import { createLayout, isEmptyChange, type Layout } from '../domain/layout';
import { LayoutIndex } from '../domain/layout-index';
import { planRemove, planTransform, rotateStep, type Plan } from '../domain/planners';
import { computeRooms, type Room } from '../domain/rooms';
import { buildSampleLayout } from '../domain/sample-layout';
import { parseLayout, serializeLayout } from '../domain/serialization';
import { summarize } from '../domain/stats';
import { computeIssues } from '../domain/validation';
import type { WallMode } from '../engine/editor-engine';
import { LIGHTING_PRESETS, type Lighting, type LightingPreset } from '../engine/lighting-presets';

export type ToolId = 'select' | 'room' | 'floor' | 'edge' | 'object' | 'erase' | 'eyedropper';

/** Night tuning: only the values that differ from the reference night preset. */
export type NightTuning = Partial<LightingPreset>;

/** Highest deck the editor offers (decks 0…MAX_DECK). */
export const MAX_DECK = 3;

export interface Toast {
  readonly text: string;
  readonly kind: 'info' | 'error';
  readonly at: number;
}

const AUTOSAVE_KEY = 'space-interior-poc:autosave';
const NIGHT_KEY = 'space-interior-poc:night';

/** Drops keys equal to the reference night (and unknown ones), so the tuning stays a small diff. */
function cleanTuning(t: NightTuning): NightTuning {
  const ref = LIGHTING_PRESETS.night as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (k in ref && typeof v === typeof ref[k] && v !== ref[k]) out[k] = v;
  }
  return out as NightTuning;
}

/**
 * The only place design state changes. Everything the UI shows is a Signal; rooms, issues and
 * stats are `computed` from the layout, so they can never drift from it. Edits arrive as domain
 * plans and go through the undo history.
 */
@Injectable({ providedIn: 'root' })
export class EditorStore {
  // ── document ──
  readonly layout = signal<Layout>(createLayout());
  readonly history = signal<History>(EMPTY_HISTORY);
  readonly index = computed(() => new LayoutIndex(this.layout()));
  readonly rooms = computed(() => computeRooms(this.index()));
  readonly issues = computed(() => computeIssues(this.index(), this.rooms()));
  readonly summary = computed(() => summarize(this.index(), this.rooms(), this.issues()));
  readonly canUndo = computed(() => this.history().past.length > 0);
  readonly canRedo = computed(() => this.history().future.length > 0);

  // ── tools ──
  readonly tool = signal<ToolId>('select');
  readonly floorItem = signal('floor-metal/plain');
  /** Floor the room tool lays: the last plain floor picked (never stairs or a lift). */
  readonly roomFloorItem = signal('floor-metal/plain');
  readonly wallItem = signal('wall/grey');
  readonly edgeItem = signal('wall/grey');
  readonly objectItem = signal('bunk-single/blue');
  readonly rot = signal<Rot>(0);
  /** Edge tool: flips which side new walls face when both sides are open. */
  readonly flip = signal(false);
  readonly plan = signal<Plan | null>(null);
  readonly hint = signal('');

  // ── view ──
  readonly level = signal(0);
  readonly wallMode = signal<WallMode>('cutaway');
  readonly lighting = signal<Lighting>('day');
  readonly showGrid = signal(true);
  readonly showLabels = signal(true);
  readonly showCeilings = signal(false);
  /** Night tuning panel; the tuning is kept per browser (a viewer preference, not part of the design). */
  readonly tuningOpen = signal(false);
  readonly nightTuning = signal<NightTuning>(this.loadTuning());
  /** Decks that have anything on them. */
  readonly usedDecks = computed(() => new Set(this.index().levels));

  // ── selection & feedback ──
  readonly selection = signal<readonly string[]>([]);
  readonly selectedRoomId = signal<string | null>(null);
  readonly hoverId = signal<string | null>(null);
  readonly cursor = signal<{ x: number; z: number } | null>(null);
  readonly toast = signal<Toast | null>(null);
  readonly kitProgress = signal({ done: 0, total: 0 });
  readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  readonly perf = signal({ fps: 0, drawCalls: 0, instances: 0, programs: 0 });
  /** Camera requests from the UI (issue list, room list); the viewport consumes them. */
  readonly focusRequest = signal<{ x: number; z: number; level: number; n: number } | null>(null);

  readonly activeItem = computed(() => {
    switch (this.tool()) {
      case 'floor':
        return this.floorItem();
      case 'room':
        return this.roomFloorItem();
      case 'edge':
        return this.edgeItem();
      case 'object':
        return this.objectItem();
      default:
        return null;
    }
  });

  readonly selectedPieces = computed(() => {
    const index = this.index();
    return this.selection()
      .map((id) => index.get(id))
      .filter((p) => !!p);
  });

  readonly selectedRoom = computed<Room | undefined>(() => {
    const id = this.selectedRoomId();
    return id ? this.rooms().find((r) => r.id === id) : undefined;
  });

  constructor() {
    this.restore();
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const layout = this.layout();
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeLayout(layout)));
        } catch {
          /* storage full or blocked: autosave is a convenience */
        }
      }, 400);
    });
    effect(() => {
      const t = this.nightTuning();
      try {
        if (Object.keys(t).length) localStorage.setItem(NIGHT_KEY, JSON.stringify(t));
        else localStorage.removeItem(NIGHT_KEY);
      } catch {
        /* blocked storage: the tuning just does not persist */
      }
    });
    // Selection never points at pieces that no longer exist.
    effect(() => {
      const index = this.index();
      const sel = untracked(() => this.selection());
      const alive = sel.filter((id) => index.get(id));
      if (alive.length !== sel.length) this.selection.set(alive);
    });
  }

  // ── edits ──
  commit(plan: Plan | null): boolean {
    if (!plan) return false;
    if (isEmptyChange(plan.change)) {
      if (plan.rejected.length) this.notify(plan.reason ?? 'Nie można tu postawić', 'error');
      return false;
    }
    const step = execute(this.layout(), this.history(), { label: plan.label, change: plan.change });
    this.layout.set(step.layout);
    this.history.set(step.history);
    if (plan.rejected.length) this.notify(`Część pominięta: ${plan.reason ?? 'kolizja'}`, 'info');
    return true;
  }

  undo(): void {
    const step = undo(this.layout(), this.history());
    if (!step.command) return;
    this.layout.set(step.layout);
    this.history.set(step.history);
    this.notify(`Cofnięto: ${step.command.label}`);
  }

  redo(): void {
    const step = redo(this.layout(), this.history());
    if (!step.command) return;
    this.layout.set(step.layout);
    this.history.set(step.history);
    this.notify(`Ponowiono: ${step.command.label}`);
  }

  deleteSelection(): void {
    const ids = this.selection();
    if (ids.length) this.commit(planRemove(this.index(), ids, ids.length > 1 ? `Usuń (${ids.length})` : 'Usuń'));
    this.selection.set([]);
  }

  rotateSelection(): void {
    const ids = this.selection();
    if (!ids.length) return;
    const plan = planTransform(this.index(), ids, rotateStep, 'Obrót');
    if (!this.commit(plan) && plan.reason) this.notify(plan.reason, 'error');
  }

  // ── tools ──
  setTool(tool: ToolId): void {
    this.tool.set(tool);
    this.plan.set(null);
    this.hint.set('');
  }

  /** Picks a catalog variant and the tool that places it. */
  selectItem(variantId: string): void {
    const item = resolveItem(variantId);
    if (!item) return;
    const p = item.entry.placement;
    if (p.kind === 'floor' || p.kind === 'ceiling') {
      this.floorItem.set(variantId);
      const plain = p.kind === 'floor' && !p.connector && !p.noObjects;
      if (plain) this.roomFloorItem.set(variantId);
      this.setTool(this.tool() === 'room' && plain ? 'room' : 'floor');
    } else if (p.kind === 'edge') {
      this.edgeItem.set(variantId);
      if (p.edge === 'wall') this.wallItem.set(variantId);
      this.setTool(this.tool() === 'room' && p.edge === 'wall' ? 'room' : 'edge');
    } else {
      this.objectItem.set(variantId);
      this.setTool('object');
    }
  }

  rotateTool(): void {
    if (this.tool() === 'edge') this.flip.update((f) => !f);
    else this.rot.update((r) => normRot(r + 1));
  }

  setLevel(level: number): void {
    this.level.set(Math.max(0, Math.min(MAX_DECK, level)));
    this.selection.set([]);
    this.selectedRoomId.set(null);
  }

  // ── night tuning ──
  tuneNight(patch: NightTuning): void {
    this.nightTuning.update((t) => cleanTuning({ ...t, ...patch }));
  }

  /** Replaces the whole tuning (a preset); {} = the reference night. */
  setNightTuning(t: NightTuning): void {
    this.nightTuning.set(cleanTuning(t));
  }

  toggleTuning(): void {
    const open = !this.tuningOpen();
    this.tuningOpen.set(open);
    if (open) this.lighting.set('night'); // tuning is for the night; show it
  }

  private loadTuning(): NightTuning {
    try {
      const raw = localStorage.getItem(NIGHT_KEY);
      return raw ? cleanTuning(JSON.parse(raw) as NightTuning) : {};
    } catch {
      return {};
    }
  }

  // ── files ──
  newLayout(): void {
    this.replace(createLayout(), 'Nowy projekt');
  }

  loadSample(): void {
    this.replace(buildSampleLayout().layout, 'Wczytano przykład');
  }

  importText(text: string): void {
    try {
      const { layout, warnings } = parseLayout(JSON.parse(text));
      this.replace(layout, warnings.length ? `Wczytano z uwagami: ${warnings[0]}` : `Wczytano „${layout.name}”`);
    } catch (e) {
      this.notify(e instanceof Error ? e.message : 'Nie udało się wczytać pliku', 'error');
    }
  }

  exportText(): string {
    return JSON.stringify(serializeLayout(this.layout()), null, 1);
  }

  rename(name: string): void {
    this.layout.update((l) => ({ ...l, name: name.trim() || 'Projekt' }));
  }

  private replace(layout: Layout, message: string): void {
    this.layout.set(layout);
    this.history.set(EMPTY_HISTORY);
    this.selection.set([]);
    this.selectedRoomId.set(null);
    this.plan.set(null);
    this.level.set(0);
    this.notify(message);
  }

  private restore(): void {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const { layout } = parseLayout(JSON.parse(saved));
        if (layout.pieces.size) {
          this.layout.set(layout);
          return;
        }
      }
    } catch {
      /* broken autosave: fall back to the sample */
    }
    this.layout.set(buildSampleLayout().layout);
  }

  notify(text: string, kind: Toast['kind'] = 'info'): void {
    this.toast.set({ text, kind, at: Date.now() });
  }

  focus(x: number, z: number, level: number): void {
    if (level !== this.level()) this.setLevel(level);
    this.focusRequest.update((r) => ({ x, z, level, n: (r?.n ?? 0) + 1 }));
  }
}
