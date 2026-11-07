import { HexCoord, hexEquals, hexKey } from '../grid/hex';
import { MoleculeGraph } from '../graph/molecule';
import { ArmCommand, ArmState, Glyph, LevelConfig, SimulationStepResult } from './types';
import { cloneArm, getArmCost, getGripperPosition } from './arm';
import { getGlyphCost } from './glyph';
import { executeTick, TickContext } from './pipeline';

export class SimulationEngine {
  public level: LevelConfig;
  public instructions: Record<string, (ArmCommand | null)[]>;
  public currentCycle = 0;
  public maxTimelineLength = 16;
  public productsDelivered = 0;
  public hasCrashed = false;
  public crashMessage?: string;
  public isCompleted = false;

  private graph = new MoleculeGraph();
  private arms: ArmState[] = [];
  private atomCounter = 0;
  private visitedHexes = new Set<string>();
  private history: SimulationStepResult[] = [];

  constructor(level: LevelConfig) {
    this.level = {
      ...level,
      initialArms: level.initialArms.map(cloneArm),
      glyphs: [...level.glyphs],
      defaultInstructions: { ...level.defaultInstructions },
    };
    this.instructions = {};
    for (const [armId, tape] of Object.entries(this.level.defaultInstructions)) {
      this.instructions[armId] = [...tape];
    }
    this.reset();
  }

  public reset(): void {
    this.currentCycle = 0;
    this.productsDelivered = 0;
    this.hasCrashed = false;
    this.crashMessage = undefined;
    this.isCompleted = false;
    this.atomCounter = 0;
    this.visitedHexes.clear();
    this.history = [];

    // Reset arms to initial positions and empty grippers
    this.arms = this.level.initialArms.map(cloneArm);
    for (const arm of this.arms) {
      arm.isHolding = false;
      arm.heldAtomId = null;
      // If the arm sits on a track, resolve its starting index from its base position.
      if (arm.trackId) {
        const track = (this.level.tracks ?? []).find(t => t.id === arm.trackId);
        if (track) {
          const idx = track.path.findIndex(p => hexEquals(p, arm.basePos));
          arm.trackIndex = idx >= 0 ? idx : 0;
          if (idx >= 0) {
            arm.basePos = { ...track.path[idx] };
          }
        }
      }
    }

    // Reset graph
    this.graph = new MoleculeGraph();

    // Populate initial Reagent inputs
    for (const glyph of this.level.glyphs) {
      if (glyph.type === 'INPUT') {
        this.atomCounter += 1;
        this.graph.addAtom({
          id: `atom_${this.atomCounter}`,
          element: glyph.element,
          pos: { ...glyph.pos },
        });
      }
    }

    this.recordVisitedArea();
  }

  public setInstruction(armId: string, cycle: number, cmd: ArmCommand | null): void {
    if (!this.instructions[armId]) {
      this.instructions[armId] = [];
    }
    while (this.instructions[armId].length <= cycle) {
      this.instructions[armId].push(null);
    }
    this.instructions[armId][cycle] = cmd;
  }

  public clearInstruction(armId: string, cycle: number): void {
    if (this.instructions[armId] && cycle < this.instructions[armId].length) {
      this.instructions[armId][cycle] = null;
    }
  }

  public getInstruction(armId: string, cycle: number): ArmCommand | null {
    return this.instructions[armId]?.[cycle] ?? null;
  }

  public step(): SimulationStepResult {
    if (this.hasCrashed) {
      return this.getCurrentStepResult();
    }

    // Check if any arm has a REPEAT marker at currentCycle
    let shouldRepeat = false;
    for (const arm of this.arms) {
      const tape = this.instructions[arm.id] || [];
      if (tape[this.currentCycle] === 'REPEAT') {
        shouldRepeat = true;
        break;
      }
    }

    // If repeat triggered or end of timeline reached
    if (shouldRepeat || this.currentCycle >= this.maxTimelineLength) {
      this.currentCycle = 0;
      // Do not reset the whole world if repeating seamlessly, just wrap cycle pointer!
      // But if user requested explicit loop repeat:
    }

    const ctx: TickContext = {
      cycle: this.currentCycle,
      graph: this.graph,
      arms: this.arms,
      instructions: this.instructions,
      glyphs: this.level.glyphs,
      tracks: this.level.tracks ?? [],
      atomCounter: this.atomCounter,
      productsDelivered: this.productsDelivered,
      targetRequired: this.level.targetRequired,
      hasCrashed: this.hasCrashed,
      crashMessage: this.crashMessage,
    };

    const result = executeTick(ctx);

    this.atomCounter = ctx.atomCounter;
    this.productsDelivered = ctx.productsDelivered;
    this.hasCrashed = ctx.hasCrashed;
    this.crashMessage = ctx.crashMessage;
    this.isCompleted = result.isLevelCompleted;

    this.recordVisitedArea();
    this.history.push(result);

    this.currentCycle += 1;
    return result;
  }

  private recordVisitedArea(): void {
    for (const arm of this.arms) {
      this.visitedHexes.add(hexKey(arm.basePos));
      this.visitedHexes.add(hexKey(getGripperPosition(arm)));
    }
    for (const atom of this.graph.getAtoms()) {
      this.visitedHexes.add(hexKey(atom.pos));
    }
  }

  public getCurrentStepResult(): SimulationStepResult {
    const executedCommands: Record<string, ArmCommand> = {};
    for (const arm of this.arms) {
      const tape = this.instructions[arm.id] || [];
      executedCommands[arm.id] = (tape[this.currentCycle] ?? 'EMPTY') as ArmCommand;
    }

    return {
      cycle: this.currentCycle,
      commandsExecuted: executedCommands,
      collisionDetected: this.hasCrashed,
      collisionMessage: this.crashMessage,
      productsDelivered: this.productsDelivered,
      isLevelCompleted: this.isCompleted,
      atoms: this.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
      bonds: this.graph.getBonds().map(b => ({ ...b })),
      arms: this.arms.map(cloneArm),
    };
  }

  public getStats() {
    let cost = 0;
    for (const arm of this.arms) {
      cost += getArmCost(arm);
    }
    for (const glyph of this.level.glyphs) {
      cost += getGlyphCost(glyph);
    }

    return {
      cycles: this.currentCycle,
      cost,
      area: this.visitedHexes.size,
      productsDelivered: this.productsDelivered,
      targetRequired: this.level.targetRequired,
      hasCrashed: this.hasCrashed,
      crashMessage: this.crashMessage,
      isCompleted: this.isCompleted,
    };
  }

  public addArm(arm: ArmState): void {
    const existing = this.level.initialArms.find(a => a.id === arm.id);
    if (existing) return;
    this.level.initialArms.push(cloneArm(arm));
    this.arms.push(cloneArm(arm));
    if (!this.instructions[arm.id]) {
      this.instructions[arm.id] = [];
    }
  }

  public removeArm(armId: string): void {
    this.level.initialArms = this.level.initialArms.filter(a => a.id !== armId);
    this.arms = this.arms.filter(a => a.id !== armId);
    delete this.instructions[armId];
  }

  public rotateArm(armId: string, deltaSteps: number): void {
    const initArm = this.level.initialArms.find(a => a.id === armId);
    if (initArm) {
      initArm.rotation = ((initArm.rotation + deltaSteps) % 6 + 6) % 6;
    }
    const liveArm = this.arms.find(a => a.id === armId);
    if (liveArm) {
      liveArm.rotation = ((liveArm.rotation + deltaSteps) % 6 + 6) % 6;
    }
  }

  public setArmLength(armId: string, length: number): void {
    const initArm = this.level.initialArms.find(a => a.id === armId);
    if (initArm) initArm.length = length;
    const liveArm = this.arms.find(a => a.id === armId);
    if (liveArm) liveArm.length = length;
  }

  public moveArm(armId: string, newPos: HexCoord): void {
    const initArm = this.level.initialArms.find(a => a.id === armId);
    if (initArm) initArm.basePos = { ...newPos };
    const liveArm = this.arms.find(a => a.id === armId);
    if (liveArm) liveArm.basePos = { ...newPos };
  }

  public addGlyph(glyph: Glyph): void {
    this.level.glyphs.push(glyph);
  }

  public removeGlyph(glyphId: string): void {
    this.level.glyphs = this.level.glyphs.filter(g => g.id !== glyphId);
  }

  public getGraph(): MoleculeGraph {
    return this.graph;
  }

  public getArms(): ArmState[] {
    return this.arms;
  }
}
