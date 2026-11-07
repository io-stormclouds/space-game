// Ported from poc/space-atanor/src/core/engine/simulation.ts.
// Changes:
//  - `ticksExecuted` counts executed ticks; getStats().cycles returns it (fix: the PoC returned
//    the timeline position `currentCycle`, which wraps to 0 on REPEAT — the "CYKLE" bug).
//  - `completedAtTick`, delivery ticks, jam reason.
//  - Optional finite input supply (doc §8.5 p. 1): when an input port is empty and its buffer
//    has no portion, the whole machine waits (the step does not execute a tick).
//  - getSnapshot() for the UI; consumed / produced material counters.
//  - Area also counts atom positions right after the motion phase (fix: the output hex of a
//    delivered product was never counted), getVisitedHexes().
//  - AT5: area also counts the hexes swept by moving atoms and grippers inside a tick (POC-5 B);
//    optional board radius (OFF_BOARD JAM, A8); every gripper of a multi-gripper arm; jam details.
import { HexCoord, hexEquals, hexFromKey, hexKey } from '../grid/hex';
import { MoleculeGraph } from '../graph/molecule';
import {
  ArmCommand,
  ArmState,
  AtanorSnapshot,
  Glyph,
  InputReagentGlyph,
  JamDetail,
  JamReason,
  LevelConfig,
  SimulationStepResult,
} from './types';
import { cloneArm, getArmCost, getGripperPositions, setHeldAtomIds } from './arm';
import { getGlyphCost } from './glyph';
import { executeTick, spawnAtInput, TickContext } from './pipeline';

export interface SimulationOptions {
  /**
   * Finite input buffers in material units per atom element / material code,
   * e.g. `{ MIE: 4, PLA: 2, H2: 20 }`. Omit for unlimited inputs (PoC behaviour).
   * Buffers are shared by all input ports of the same element.
   */
  readonly supply?: Readonly<Record<string, number>>;
  /**
   * Board = hexes within this distance of (0,0): a moving atom or gripper outside it jams with
   * OFF_BOARD (A8). Overrides `LevelConfig.boardRadius`; both missing = unlimited board (PoC).
   * The Fabryka atanorowa board of each building level is `ATANOR_BUILDING_LEVELS[i].boardRadius`.
   */
  readonly boardRadius?: number;
}

export interface SimulationStats {
  /** Ticks executed since reset (fixed CYKLE metric; the PoC returned the timeline position). */
  readonly cycles: number;
  /** Timeline slot the next tick will execute (what the PoC showed as "CYKLE"). */
  readonly timelinePosition: number;
  /** Tick on which the target was reached, null before that. */
  readonly completedAtTick: number | null;
  /**
   * PoC cost points of the machine as built (arms incl. extra grippers + glyphs; tracks are free
   * as in the PoC).
   */
  readonly cost: number;
  /**
   * Unique hexes visited by arm bases, grippers and atoms at tick ends (PoC definition), plus
   * atom positions right after the motion phase (so delivered products count too), plus the hexes
   * swept by moving atoms and grippers inside each tick (sampled path, POC-5 B).
   */
  readonly area: number;
  readonly arms: number;
  /** Hexes covered by tracks (tracks cost nothing in PoC points; see machineMaterials()). */
  readonly trackHexes: number;
  readonly productsDelivered: number;
  readonly targetRequired: number;
  readonly hasCrashed: boolean;
  readonly crashMessage?: string;
  readonly jamReason: JamReason | null;
  readonly isCompleted: boolean;
  readonly starvedSteps: number;
}

export class SimulationEngine {
  public level: LevelConfig;
  public instructions: Record<string, (ArmCommand | null)[]>;
  /** Timeline slot (playhead) the next tick will execute. Wraps to 0 on REPEAT — not a counter. */
  public currentCycle = 0;
  public maxTimelineLength = 16;
  public productsDelivered = 0;
  public hasCrashed = false;
  public crashMessage?: string;
  public jamReason: JamReason | null = null;
  /** Atoms, arms, hex and moment of the JAM; null without a JAM. */
  public jamDetail: JamDetail | null = null;
  public isCompleted = false;
  /** Ticks executed since reset — the CYKLE counter. Never wraps. */
  public ticksExecuted = 0;
  /** Tick on which productsDelivered reached targetRequired, null before that. */
  public completedAtTick: number | null = null;
  /** True when the last step() did not run because an input was empty. */
  public isStarved = false;
  /** step() calls that did not run because an input was empty. */
  public starvedSteps = 0;

  private graph = new MoleculeGraph();
  private arms: ArmState[] = [];
  private atomCounter = 0;
  private visitedHexes = new Set<string>();
  private history: SimulationStepResult[] = [];
  private deliveryTicks: number[] = [];
  private readonly initialSupply: Readonly<Record<string, number>> | null;
  /** Board radius (OFF_BOARD JAM); null = unlimited. */
  public readonly boardRadius: number | null;
  private buffers: Map<string, number> | null = null;
  private consumed: Record<string, number> = {};
  private produced: Record<string, number> = {};

  constructor(level: LevelConfig, options: SimulationOptions = {}) {
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
    this.initialSupply = options.supply ? { ...options.supply } : null;
    this.boardRadius = options.boardRadius ?? level.boardRadius ?? null;
    this.reset();
  }

  public reset(): void {
    this.currentCycle = 0;
    this.productsDelivered = 0;
    this.hasCrashed = false;
    this.crashMessage = undefined;
    this.jamReason = null;
    this.jamDetail = null;
    this.isCompleted = false;
    this.ticksExecuted = 0;
    this.completedAtTick = null;
    this.isStarved = false;
    this.starvedSteps = 0;
    this.atomCounter = 0;
    this.visitedHexes.clear();
    this.history = [];
    this.deliveryTicks = [];
    this.buffers = this.initialSupply ? new Map(Object.entries(this.initialSupply)) : null;
    this.consumed = {};
    this.produced = {};

    // Reset arms to initial positions and empty grippers
    this.arms = this.level.initialArms.map(cloneArm);
    for (const arm of this.arms) {
      setHeldAtomIds(arm, []);
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

    // Populate initial Reagent inputs (subject to supply)
    this.fillInputs();

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

    // Finite supply: a tick runs only when every input port presents an atom.
    if (this.buffers && !this.fillInputs()) {
      this.isStarved = true;
      this.starvedSteps += 1;
      return { ...this.getCurrentStepResult(), starved: true };
    }
    this.isStarved = false;

    // Check if any arm has a REPEAT marker at currentCycle
    let shouldRepeat = false;
    for (const arm of this.arms) {
      const tape = this.instructions[arm.id] || [];
      if (tape[this.currentCycle] === 'REPEAT') {
        shouldRepeat = true;
        break;
      }
    }

    // If repeat triggered or end of timeline reached, wrap the playhead (the world is not reset).
    if (shouldRepeat || this.currentCycle >= this.maxTimelineLength) {
      this.currentCycle = 0;
    }

    const deliveredBefore = this.productsDelivered;
    const ctx: TickContext = {
      cycle: this.currentCycle,
      tick: this.ticksExecuted + 1,
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
      jamReason: this.jamReason,
      jamDetail: this.jamDetail,
      boardRadius: this.boardRadius,
      takeInput: glyph => this.takeInput(glyph),
      onDelivered: glyph => {
        if (glyph.product) {
          this.produced[glyph.product.material] = (this.produced[glyph.product.material] ?? 0) + glyph.product.quantity;
        }
      },
      visit: pos => this.visitedHexes.add(hexKey(pos)),
    };

    const result = executeTick(ctx);

    this.ticksExecuted += 1;
    this.atomCounter = ctx.atomCounter;
    this.productsDelivered = ctx.productsDelivered;
    this.hasCrashed = ctx.hasCrashed;
    this.crashMessage = ctx.crashMessage;
    this.jamReason = ctx.jamReason ?? null;
    this.jamDetail = ctx.jamDetail ?? null;
    this.isCompleted = result.isLevelCompleted;
    for (let i = deliveredBefore; i < this.productsDelivered; i++) {
      this.deliveryTicks.push(this.ticksExecuted);
    }
    if (this.isCompleted && this.completedAtTick === null) {
      this.completedAtTick = this.ticksExecuted;
    }

    this.recordVisitedArea();
    this.history.push(result);

    this.currentCycle += 1;
    return result;
  }

  /**
   * Add material to an input buffer (finite supply only; ignored for unlimited inputs).
   * reset() restores the buffers given in the constructor options.
   */
  public addSupply(material: string, units: number): void {
    if (!this.buffers || !(units > 0)) return;
    this.buffers.set(material, (this.buffers.get(material) ?? 0) + units);
  }

  /** Remaining input buffers, or null for unlimited inputs. */
  public getSupply(): Record<string, number> | null {
    return this.buffers ? Object.fromEntries(this.buffers) : null;
  }

  /** Material units taken from inputs since reset. */
  public getConsumed(): Record<string, number> {
    return { ...this.consumed };
  }

  /** Economy products credited by outputs since reset. */
  public getProduced(): Record<string, number> {
    return { ...this.produced };
  }

  /** Hexes counted in the area metric, in the order they were first visited. */
  public getVisitedHexes(): HexCoord[] {
    return [...this.visitedHexes].map(hexFromKey);
  }

  /** Tick numbers (1-based) on which each product was delivered. */
  public getDeliveryTicks(): readonly number[] {
    return [...this.deliveryTicks];
  }

  private takeInput(glyph: InputReagentGlyph): boolean {
    const portion = glyph.portion ?? 1;
    if (this.buffers) {
      const available = this.buffers.get(glyph.element) ?? 0;
      if (available < portion) return false;
      this.buffers.set(glyph.element, available - portion);
    }
    this.consumed[glyph.element] = (this.consumed[glyph.element] ?? 0) + portion;
    return true;
  }

  /** Dispense atoms on vacant input hexes. Returns true when every input hex is occupied. */
  private fillInputs(): boolean {
    const ctx = { graph: this.graph, atomCounter: this.atomCounter, takeInput: (g: InputReagentGlyph) => this.takeInput(g) };
    let allOccupied = true;
    for (const glyph of this.level.glyphs) {
      if (glyph.type === 'INPUT' && !spawnAtInput(ctx, glyph)) {
        allOccupied = false;
      }
    }
    this.atomCounter = ctx.atomCounter;
    return allOccupied;
  }

  private recordVisitedArea(): void {
    for (const arm of this.arms) {
      this.visitedHexes.add(hexKey(arm.basePos));
      for (const gripper of getGripperPositions(arm)) this.visitedHexes.add(hexKey(gripper));
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
      tick: this.ticksExecuted,
      commandsExecuted: executedCommands,
      collisionDetected: this.hasCrashed,
      ...(this.crashMessage !== undefined ? { collisionMessage: this.crashMessage } : {}),
      jamReason: this.jamReason,
      ...(this.jamDetail ? { jamDetail: this.jamDetail } : {}),
      starved: this.isStarved,
      productsDelivered: this.productsDelivered,
      isLevelCompleted: this.isCompleted,
      atoms: this.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
      bonds: this.graph.getBonds().map(b => ({ ...b })),
      arms: this.arms.map(cloneArm),
    };
  }

  public getSnapshot(): AtanorSnapshot {
    return {
      levelId: this.level.id,
      ticks: this.ticksExecuted,
      timelinePosition: this.currentCycle,
      atoms: this.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
      bonds: this.graph.getBonds().map(b => ({ ...b })),
      molecules: this.graph.getMolecules(),
      arms: this.arms.map(cloneArm),
      delivered: this.productsDelivered,
      target: this.level.targetRequired,
      completed: this.isCompleted,
      completedAtTick: this.completedAtTick,
      jam: this.hasCrashed
        ? {
            reason: this.jamReason ?? 'ATOM_COLLISION',
            message: this.crashMessage ?? '',
            ...(this.jamDetail ? { detail: this.jamDetail } : {}),
          }
        : null,
      starved: this.isStarved,
      starvedSteps: this.starvedSteps,
      supply: this.getSupply(),
      consumed: this.getConsumed(),
      produced: this.getProduced(),
    };
  }

  public getStats(): SimulationStats {
    // Cost of the machine as built (initial arms): a piston's cost no longer changes while it
    // extends (the PoC summed the live arms).
    let cost = 0;
    for (const arm of this.level.initialArms) {
      cost += getArmCost(arm);
    }
    for (const glyph of this.level.glyphs) {
      cost += getGlyphCost(glyph);
    }
    const trackHexes = new Set((this.level.tracks ?? []).flatMap(t => t.path.map(hexKey))).size;

    return {
      cycles: this.ticksExecuted,
      timelinePosition: this.currentCycle,
      completedAtTick: this.completedAtTick,
      cost,
      area: this.visitedHexes.size,
      arms: this.arms.length,
      trackHexes,
      productsDelivered: this.productsDelivered,
      targetRequired: this.level.targetRequired,
      hasCrashed: this.hasCrashed,
      ...(this.crashMessage !== undefined ? { crashMessage: this.crashMessage } : {}),
      jamReason: this.jamReason,
      isCompleted: this.isCompleted,
      starvedSteps: this.starvedSteps,
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
