import { Injectable, signal, computed } from '@angular/core';
import { SimulationEngine } from '../../core/engine/simulation';
import { ALL_LEVELS, LEVEL_1_DIMER } from '../../core/engine/levels';
import { ArmCommand, ArmState, Glyph, LevelConfig, SimulationStepResult } from '../../core/engine/types';
import { HexCoord, hexEquals } from '../../core/grid/hex';
import { PixiRenderer, BuildTool } from '../../renderer/pixiRenderer';
import { createArm } from '../../core/engine/arm';
import { createBonderGlyph, createUnbonderGlyph } from '../../core/engine/glyph';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  private engine: SimulationEngine = new SimulationEngine(LEVEL_1_DIMER);
  private renderer: PixiRenderer | null = null;

  // Angular Signals for Reactive UI
  public readonly activeLevel = signal<LevelConfig>(LEVEL_1_DIMER);
  public readonly availableLevels = signal<LevelConfig[]>(ALL_LEVELS);

  public readonly currentCycle = signal<number>(0);
  public readonly isPlaying = signal<boolean>(false);
  public readonly speed = signal<number>(1); // 0.5x, 1x, 2x, 4x

  public readonly hasCrashed = signal<boolean>(false);
  public readonly crashMessage = signal<string | null>(null);

  public readonly productsDelivered = signal<number>(0);
  public readonly targetRequired = signal<number>(LEVEL_1_DIMER.targetRequired);

  public readonly cost = signal<number>(0);
  public readonly area = signal<number>(0);

  public readonly selectedCommand = signal<ArmCommand | 'CLEAR'>('GRAB');

  public readonly instructions = signal<Record<string, (ArmCommand | null)[]>>({});

  public readonly currentStep = signal<SimulationStepResult | null>(null);
  public readonly previousStep = signal<SimulationStepResult | null>(null);

  // Build/editing
  public readonly buildTool = signal<BuildTool>('SELECT');
  public readonly previewRotation = signal<number>(0);
  public readonly buildVersion = signal<number>(0); // bumped whenever the placed hardware changes
  public readonly statusMessage = signal<string | null>(null);

  // Animation frame loop
  private animFrameId: number | null = null;
  private lastTimestamp = 0;
  private animProgress = 1.0;
  private baseStepDuration = 600; // ms per step at 1x

  constructor() {
    this.syncFromEngine();
  }

  public attachRenderer(renderer: PixiRenderer): void {
    this.renderer = renderer;
    this.renderer.setGlyphs(this.activeLevel().glyphs);
    this.renderer.setTracks(this.engine.level.tracks ?? []);
    this.renderer.setBuildTool(this.buildTool());
    this.renderer.setPreviewRotation(this.previewRotation());
    const curr = this.engine.getCurrentStepResult();
    this.renderer.updateState(curr, curr, 1.0);
  }

  public setLevel(level: LevelConfig): void {
    this.pause();
    this.activeLevel.set(level);
    this.engine = new SimulationEngine(level);
    if (this.renderer) {
      this.renderer.setGlyphs(level.glyphs);
      this.renderer.setTracks(level.tracks ?? []);
    }
    this.reset();
    this.buildVersion.update(v => v + 1);
  }

  public togglePlay(): void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  public play(): void {
    if (this.hasCrashed()) {
      this.reset();
    }
    this.isPlaying.set(true);
    this.lastTimestamp = performance.now();
    this.animProgress = 0;
    this.startLoop();
  }

  public pause(): void {
    this.isPlaying.set(false);
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.renderer && this.currentStep()) {
      this.renderer.setProgress(1.0);
    }
  }

  public stepForward(): void {
    if (this.isPlaying()) {
      this.pause();
    }
    this.executeSingleStep();
    if (this.renderer && this.currentStep()) {
      this.renderer.updateState(this.previousStep(), this.currentStep()!, 1.0);
    }
  }

  public reset(): void {
    this.pause();
    this.engine.reset();
    this.syncFromEngine();

    const curr = this.engine.getCurrentStepResult();
    this.previousStep.set(curr);
    this.currentStep.set(curr);

    if (this.renderer) {
      this.renderer.updateState(curr, curr, 1.0);
    }
  }

  public setInstruction(armId: string, cycle: number, cmd: ArmCommand | null): void {
    this.engine.setInstruction(armId, cycle, cmd);
    this.syncInstructions();
  }

  public clearInstruction(armId: string, cycle: number): void {
    this.engine.clearInstruction(armId, cycle);
    this.syncInstructions();
  }

  public setSpeed(multiplier: number): void {
    this.speed.set(multiplier);
  }

  public setSelectedCommand(cmd: ArmCommand | 'CLEAR'): void {
    this.selectedCommand.set(cmd);
  }

  private executeSingleStep(): void {
    const prev = this.engine.getCurrentStepResult();
    this.previousStep.set(prev);

    const next = this.engine.step();
    this.currentStep.set(next);

    this.syncFromEngine();

    if (next.collisionDetected) {
      this.pause();
    }
  }

  private startLoop(): void {
    const loop = (timestamp: number) => {
      if (!this.isPlaying()) return;

      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      const duration = this.baseStepDuration / this.speed();
      this.animProgress += delta / duration;

      if (this.animProgress >= 1.0) {
        this.animProgress = 0;
        this.executeSingleStep();

        if (this.hasCrashed()) {
          if (this.renderer && this.currentStep()) {
            this.renderer.updateState(this.previousStep(), this.currentStep()!, 1.0);
          }
          return;
        }
      }

      if (this.renderer && this.currentStep()) {
        this.renderer.updateState(this.previousStep(), this.currentStep()!, this.animProgress);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private syncFromEngine(): void {
    this.currentCycle.set(this.engine.currentCycle);
    this.hasCrashed.set(this.engine.hasCrashed);
    this.crashMessage.set(this.engine.crashMessage ?? null);
    this.productsDelivered.set(this.engine.productsDelivered);
    this.targetRequired.set(this.engine.level.targetRequired);

    const stats = this.engine.getStats();
    this.cost.set(stats.cost);
    this.area.set(stats.area);

    this.syncInstructions();
  }

  private syncInstructions(): void {
    const copy: Record<string, (ArmCommand | null)[]> = {};
    for (const [armId, tape] of Object.entries(this.engine.instructions)) {
      copy[armId] = [...tape];
    }
    this.instructions.set(copy);
  }

  public getEngine(): SimulationEngine {
    return this.engine;
  }

  // ==========================================
  // BUILD / EDITING API
  // ==========================================

  public setBuildTool(tool: BuildTool): void {
    this.buildTool.set(tool);
    this.renderer?.setBuildTool(tool);
    this.statusMessage.set(null);
  }

  public setPreviewRotation(rotation: number): void {
    const norm = ((rotation % 6) + 6) % 6;
    this.previewRotation.set(norm);
    this.renderer?.setPreviewRotation(norm);
  }

  private nextId(prefix: string, existing: { id: string }[]): string {
    let i = existing.length + 1;
    const ids = new Set(existing.map(e => e.id));
    let id = `${prefix}-${i}`;
    while (ids.has(id)) {
      i += 1;
      id = `${prefix}-${i}`;
    }
    return id;
  }

  /**
   * Handle a click on a hex in the board, respecting the active build tool.
   */
  public handleBoardClick(hex: HexCoord): void {
    const tool = this.buildTool();
    switch (tool) {
      case 'SELECT':
        this.statusMessage.set(`Hex q:${hex.q}, r:${hex.r}`);
        return;
      case 'ARM_1':
        this.placeArm(hex, 1, false);
        return;
      case 'ARM_2':
        this.placeArm(hex, 2, false);
        return;
      case 'PISTON':
        this.placeArm(hex, 1, true);
        return;
      case 'BONDER':
        this.placeBonder(hex);
        return;
      case 'UNBONDER':
        this.placeUnbonder(hex);
        return;
      case 'DELETE':
        this.deleteAt(hex);
        return;
    }
  }

  private placeArm(basePos: HexCoord, length: number, isPiston: boolean): void {
    const arms = this.engine.level.initialArms;
    // Prevent overlapping an existing arm base.
    if (arms.some(a => hexEquals(a.basePos, basePos))) {
      this.statusMessage.set('Na tym polu stoi już ramię.');
      return;
    }
    const id = this.nextId('arm', arms);
    const arm = createArm({
      id,
      basePos,
      rotation: this.previewRotation(),
      length,
      isPiston,
    });
    this.engine.addArm(arm);
    this.engine.setInstruction(id, 0, 'GRAB');
    this.afterBuildChange();
    this.statusMessage.set(`Dodano ${isPiston ? 'tłok' : 'ramię'} ${id} (L${length}).`);
  }

  private placeBonder(hex: HexCoord): void {
    const pos2 = this.adjacentForPreview(hex);
    const glyphs = this.engine.level.glyphs;
    // Avoid duplicate bonder spanning the same pair.
    const exists = glyphs.some(
      g => (g.type === 'BONDER' || g.type === 'UNBONDER') &&
        ((hexEquals(g.pos, hex) && hexEquals((g as any).pos2, pos2)) ||
          (hexEquals(g.pos, pos2) && hexEquals((g as any).pos2, hex)))
    );
    if (exists) {
      this.statusMessage.set('Glif łączenia już tu istnieje.');
      return;
    }
    const id = this.nextId('bonder', glyphs);
    this.engine.addGlyph(createBonderGlyph(id, hex, pos2));
    this.afterBuildChange();
    this.statusMessage.set(`Dodano glif BONDER (${hex.q},${hex.r})<->(${pos2.q},${pos2.r}).`);
  }

  private placeUnbonder(hex: HexCoord): void {
    const pos2 = this.adjacentForPreview(hex);
    const glyphs = this.engine.level.glyphs;
    const id = this.nextId('unbonder', glyphs);
    this.engine.addGlyph(createUnbonderGlyph(id, hex, pos2));
    this.afterBuildChange();
    this.statusMessage.set(`Dodano glif UNBONDER (${hex.q},${hex.r})<->(${pos2.q},${pos2.r}).`);
  }

  private adjacentForPreview(hex: HexCoord): HexCoord {
    const dirs: HexCoord[] = [
      { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
      { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
    ];
    const d = dirs[this.previewRotation() % 6];
    return { q: hex.q + d.q, r: hex.r + d.r };
  }

  private deleteAt(hex: HexCoord): void {
    // Prefer deleting an arm whose base is here, otherwise a glyph.
    const arm = this.engine.level.initialArms.find(a => hexEquals(a.basePos, hex));
    if (arm) {
      this.engine.removeArm(arm.id);
      this.afterBuildChange();
      this.statusMessage.set(`Usunięto ramię ${arm.id}.`);
      return;
    }
    const glyph = this.engine.level.glyphs.find(g => {
      if (g.type === 'INPUT' || g.type === 'OUTPUT' || g.type === 'TRANSMUTE') {
        return hexEquals(g.pos, hex);
      }
      // BONDER / UNBONDER occupy two hexes
      return hexEquals(g.pos, hex) || hexEquals((g as any).pos2, hex);
    });
    if (glyph) {
      if (glyph.type === 'INPUT' || glyph.type === 'OUTPUT') {
        this.statusMessage.set('Nie można usunąć źródeł ani ujść poziomu.');
        return;
      }
      this.engine.removeGlyph(glyph.id);
      this.afterBuildChange();
      this.statusMessage.set(`Usunięto glif ${glyph.id}.`);
      return;
    }
    this.statusMessage.set('Brak komponentu do usunięcia.');
  }

  private afterBuildChange(): void {
    // Editing hardware invalidates the current run: reset to a clean state.
    this.reset();
    if (this.renderer) {
      this.renderer.setGlyphs(this.engine.level.glyphs);
      this.renderer.setTracks(this.engine.level.tracks ?? []);
    }
    this.buildVersion.update(v => v + 1);
  }

  public getPlacedArms(): ArmState[] {
    return this.engine.level.initialArms;
  }

  public getPlacedGlyphs(): Glyph[] {
    return this.engine.level.glyphs;
  }
}
