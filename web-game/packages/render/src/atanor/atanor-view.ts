import type * as PixiModule from 'pixi.js';
import type { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Atanor } from '@space-game/domain';
import type { PickResult, RenderStats, View, ViewContext, ViewInput } from '../view';
import type { AtanorControls } from './controls';
import type { AtanorGhost } from './editor';
import { boardHexes, boardRadius, fitHexLayout, hexCorners, hexStep, hexToScreen, resolveAtanorLevel, screenToHex, DEFAULT_ATANOR_LEVEL, type HexLayout, type Insets } from './layout';
import { interpolateMachine, type MachinePose } from './motion';
import { POC_TICKS_PER_SECOND, clampTicksPerSecond, dueTicks, toReadout, type AtanorReadout, type TickClock } from './readout';
import {
  ATANOR_TEXT_PL,
  atomFill,
  atomLabel,
  cssToPixi,
  inputPortLabel,
  outputPortLabel,
  resolveAtanorPalette,
  type AtanorPalette,
  type AtanorText,
} from './style';

// Atanor board (F4, W08 A, W13 A), ported from poc/space-atanor/src/renderer/pixiRenderer.ts.
// Differences from the PoC renderer: own PixiJS Application per mount (destroyed with its WebGL
// context on dispose), no internal ticker (the app's frame loop drives it), persistent layers
// (the PoC created new Graphics and Text objects every frame and never destroyed them), DS
// palette and square shapes instead of brass, gems and glints, material-code atom labels.

export type Pixi = typeof PixiModule;

export interface AtanorViewOptions {
  /** Level shown at mount until `input.atanorLevel` says otherwise. Default 'A_NAD'. */
  level?: string;
  /** Start running at mount. Default true. */
  autoplay?: boolean;
  /** Default: PoC 1× (600 ms per tick). */
  ticksPerSecond?: number;
  /**
   * Stop when the level's target is reached (puzzle mode). Default false: in the building the
   * machine produces without end (A7).
   */
  stopAtTarget?: boolean;
  /** Free space around the board for the HUD [px]. */
  insets?: Partial<Insets>;
  text?: Partial<AtanorText>;
}

const FONT = '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace';
const MAX_TICKS_PER_FRAME = 240;

interface DrawCounter {
  calls: number;
  triangles: number;
}

/** Text objects reused across frames (the PoC created new ones every frame). */
class TextPool {
  private readonly live = new Map<string, Text>();
  private readonly free: Text[] = [];
  private used = new Set<string>();

  constructor(
    private readonly PIXI: Pixi,
    private readonly style: TextStyle,
    private readonly parent: Container,
  ) {}

  begin(): void {
    this.used = new Set();
  }

  get(key: string, text: string): Text {
    let t = this.live.get(key);
    if (!t) {
      t = this.free.pop() ?? new this.PIXI.Text({ text, style: this.style });
      t.anchor.set(0.5);
      this.parent.addChild(t);
      this.live.set(key, t);
    }
    if (t.text !== text) t.text = text;
    t.visible = true;
    this.used.add(key);
    return t;
  }

  end(): void {
    for (const [key, t] of this.live) {
      if (this.used.has(key)) continue;
      this.live.delete(key);
      t.visible = false;
      this.free.push(t);
    }
    while (this.free.length > 24) this.free.pop()!.destroy();
  }

  get size(): number {
    return this.live.size + this.free.length;
  }

  destroy(): void {
    for (const t of [...this.live.values(), ...this.free]) t.destroy();
    this.live.clear();
    this.free.length = 0;
  }
}

export class AtanorView implements View, AtanorControls {
  readonly kind = 'atanor' as const;
  readonly usesThree = false;

  private readonly text: AtanorText;
  private readonly insets: Insets;
  private readonly stopAtTarget: boolean;
  private readonly autoplay: boolean;
  private palette: AtanorPalette = resolveAtanorPalette();

  private app: Application | null = null;
  private container: HTMLElement | null = null;
  private board: Graphics | null = null;
  private dyn: Graphics | null = null;
  private staticLabels: Container | null = null;
  private atomTexts: TextPool | null = null;
  private armTexts: TextPool | null = null;
  private atomStyle: TextStyle | null = null;
  private armStyle: TextStyle | null = null;
  private jamText: Text | null = null;
  private counter: DrawCounter = { calls: 0, triangles: 0 };
  private lastDraw: DrawCounter = { calls: 0, triangles: 0 };
  private disposed = false;

  private width = 1;
  private height = 1;
  private layout: HexLayout = fitHexLayout(1, 1, 2);

  private level: Atanor.LevelConfig;
  /** The machine shown (AT2 editor draft); null = the level's reference solution. */
  private solution: Atanor.AtanorSolution | null = null;
  private solutionKey: string | null = null;
  /** Level ports + the shown machine (what the board draws). */
  private composed: Atanor.LevelConfig;
  private ghost: AtanorGhost | null = null;
  private selectedId: string | null = null;
  private engine: Atanor.SimulationEngine;
  private metrics: Atanor.ThroughputMetrics | null = null;
  private readonly metricsCache = new Map<string, Atanor.ThroughputMetrics>();
  private prev: Atanor.SimulationStepResult;
  private curr: Atanor.SimulationStepResult;
  private readonly clock: TickClock = { phase: 1 };
  private playing = false;
  private tps: number;
  private lastInputLevel: string | undefined | null = null;
  /** Level of the building the machine stands in (AT1); null in the sandbox. */
  private siteLevel: number | null = null;
  private dirty = true;

  constructor(
    private readonly PIXI: Pixi,
    opts: AtanorViewOptions = {},
  ) {
    this.text = { ...ATANOR_TEXT_PL, ...opts.text };
    this.insets = { top: 24, right: 24, bottom: 24, left: 24, ...opts.insets };
    this.stopAtTarget = opts.stopAtTarget ?? false;
    this.autoplay = opts.autoplay ?? true;
    this.tps = clampTicksPerSecond(opts.ticksPerSecond ?? POC_TICKS_PER_SECOND);
    const level = resolveAtanorLevel(opts.level ?? DEFAULT_ATANOR_LEVEL) ?? resolveAtanorLevel(DEFAULT_ATANOR_LEVEL)!;
    this.level = level;
    this.composed = level;
    this.engine = Atanor.createAtanorSimulation(level);
    this.prev = this.curr = this.engine.getCurrentStepResult();
  }

  async mount(ctx: ViewContext): Promise<void> {
    const { PIXI } = this;
    this.disposed = false;
    this.container = ctx.container;
    this.width = Math.max(1, ctx.width);
    this.height = Math.max(1, ctx.height);
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(ctx.container) : null;
    this.palette = resolveAtanorPalette(style ? (v) => style.getPropertyValue(v) : undefined);

    await loadFont();
    // PixiJS probes the GPU with extra WebGL contexts (getTestContext, compressed formats) and
    // leaves some alive; W13 A allows one context, so they are lost after the first render.
    const probes = captureWebGLContexts();
    const app = new PIXI.Application();
    await app.init({
      width: this.width,
      height: this.height,
      background: this.palette.void,
      antialias: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false,
      sharedTicker: false,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    if (this.disposed) {
      loseContexts(probes.stop(), null);
      app.destroy(true, { children: true, texture: true, textureSource: true });
      return;
    }
    this.app = app;
    app.canvas.className = 'atanor-view__canvas';
    app.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    ctx.container.appendChild(app.canvas);
    this.instrument(app);

    this.board = new PIXI.Graphics();
    this.staticLabels = new PIXI.Container();
    this.dyn = new PIXI.Graphics();
    const atomLayer = new PIXI.Container();
    const armLayer = new PIXI.Container();
    this.atomStyle = new PIXI.TextStyle({ fontFamily: FONT, fontSize: 11, fontWeight: '700', fill: this.palette.text, letterSpacing: 0.5 });
    this.armStyle = new PIXI.TextStyle({ fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: this.palette.textDim });
    this.atomTexts = new TextPool(PIXI, this.atomStyle, atomLayer);
    this.armTexts = new TextPool(PIXI, this.armStyle, armLayer);
    this.jamText = new PIXI.Text({
      text: '',
      style: new PIXI.TextStyle({ fontFamily: FONT, fontSize: 12, fontWeight: '700', fill: this.palette.alert, letterSpacing: 1.6 }),
    });
    this.jamText.anchor.set(0.5);
    this.jamText.visible = false;
    app.stage.addChild(this.board, this.staticLabels, this.dyn, armLayer, atomLayer, this.jamText);

    this.metrics ??= this.measure(this.level, this.solution);
    this.relayout();
    if (this.autoplay && !this.playing) this.play();
    this.dirty = true;
    // First render compiles the shaders (the last GPU probes), then drop the probe contexts.
    this.draw();
    app.renderer.render(app.stage);
    loseContexts(probes.stop(), app.canvas);
  }

  update(input: ViewInput, dtSeconds: number): void {
    const wanted = input.atanor?.level ?? input.atanorLevel;
    if (wanted !== this.lastInputLevel) {
      this.lastInputLevel = wanted;
      const level = resolveAtanorLevel(wanted ?? DEFAULT_ATANOR_LEVEL);
      if (level && level.id !== this.level.id) this.setLevel(level.id);
    }
    const site = input.atanor?.buildingLevel ?? null;
    if (site !== this.siteLevel) {
      this.siteLevel = site;
      this.relayout();
    }
    const ed = input.atanor?.editor ?? null;
    const sol = ed?.solution ?? null;
    if (sol !== this.solution) {
      // snapshots come from the worker as copies: compare the design, not the object
      const key = sol ? Atanor.solutionKey(sol) : null;
      if (key !== this.solutionKey) this.showSolution(sol, key);
      else this.solution = sol;
    }
    const ghost = ed?.ghost ?? null;
    if (!sameGhost(ghost, this.ghost) || (ed?.selectedId ?? null) !== this.selectedId) {
      this.ghost = ghost;
      this.selectedId = ed?.selectedId ?? null;
      this.dirty = true;
    }
    const prod = input.atanor?.production ?? null;
    if (prod) this.follow(prod.ticks, prod.progress);
    else this.advance(dtSeconds);
    if (!this.app || !this.dirty) return;
    this.draw();
    this.counter.calls = 0;
    this.counter.triangles = 0;
    this.app.renderer.render(this.app.stage);
    this.lastDraw = { ...this.counter };
    this.dirty = this.playing || this.clock.phase < 1;
  }

  /** A hex of the board under the pointer (container pixels), for the editor (AT2). */
  pick(x: number, y: number, _input: ViewInput): PickResult {
    const h = screenToHex(x, y, this.layout);
    if (Atanor.hexDistance(h, { q: 0, r: 0 }) > this.layout.radius) return { kind: 'EMPTY' };
    return { kind: 'ATANOR_HEX', q: h.q, r: h.r };
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (!this.app) return;
    this.app.renderer.resize(this.width, this.height);
    this.relayout();
  }

  dispose(): void {
    this.disposed = true;
    this.playing = false;
    this.atomTexts?.destroy();
    this.armTexts?.destroy();
    this.atomTexts = this.armTexts = null;
    if (this.app) {
      const app = this.app;
      this.app = null;
      // Removes the canvas and loses the WebGL context (GlContextSystem.destroy → loseContext).
      app.destroy(true, { children: true, texture: true, textureSource: true });
    }
    this.board = this.dyn = null;
    this.staticLabels = null;
    this.jamText = null;
    this.atomStyle = this.armStyle = null;
    this.container = null;
    this.lastInputLevel = null;
    this.lastDraw = { calls: 0, triangles: 0 };
  }

  stats(): Partial<RenderStats> {
    return {
      contexts: this.app ? 1 : 0,
      drawCalls: this.lastDraw.calls,
      triangles: Math.round(this.lastDraw.triangles),
      textures: (this.atomTexts?.size ?? 0) + (this.armTexts?.size ?? 0) + (this.staticLabels?.children.length ?? 0) + 1,
      geometries: 0,
    };
  }

  // -------------------------------------------------------------------------------------------
  // AtanorControls

  play(): void {
    if (this.engine.hasCrashed || (this.stopAtTarget && this.engine.isCompleted)) this.resetEngine();
    this.playing = true;
    if (this.clock.phase >= 1) {
      if (this.tick()) this.clock.phase = 0;
      else this.playing = false;
    }
    this.dirty = true;
  }

  pause(): void {
    this.playing = false;
    this.dirty = true;
  }

  step(): void {
    this.playing = false;
    if (this.tick()) this.clock.phase = 0;
    this.dirty = true;
  }

  reset(): void {
    this.playing = false;
    this.resetEngine();
  }

  setLevel(id: string): boolean {
    const level = resolveAtanorLevel(id);
    if (!level) return false;
    const wasPlaying = this.playing;
    this.level = level;
    this.solution = null;
    this.solutionKey = null;
    this.composed = level;
    this.engine = Atanor.createAtanorSimulation(level);
    this.metrics = this.measure(level, null);
    this.playing = false;
    this.resetEngine();
    this.relayout();
    if (wasPlaying) this.play();
    return true;
  }

  /**
   * Production view (AT4): the engine replica catches up with the world's ticks of the program
   * (the machine is deterministic, so the replica equals the server's) and the pose interpolates
   * the last tick with the progress towards the next one.
   */
  private follow(ticks: number, progress: number): void {
    this.playing = false;
    if (this.engine.ticksExecuted > ticks) this.resetEngine();
    let moved = false;
    for (let guard = 0; this.engine.ticksExecuted < ticks && guard < 100_000; guard++) {
      this.prev = this.curr;
      this.curr = this.engine.step();
      moved = true;
    }
    const phase = Math.max(0, Math.min(1, progress));
    if (moved || phase !== this.clock.phase) {
      this.clock.phase = phase;
      this.dirty = true;
    }
  }

  /** Shows another machine on the same level: a change of the design resets the run (PoC). */
  private showSolution(solution: Atanor.AtanorSolution | null, key: string | null): void {
    this.solution = solution;
    this.solutionKey = key;
    this.composed = solution ? Atanor.composeLevel(this.level, solution) : this.level;
    this.engine = Atanor.createAtanorSimulation(this.level, solution ? { solution } : {});
    this.metrics = this.measure(this.level, solution);
    this.playing = false;
    this.resetEngine();
    this.relayout();
  }

  setTicksPerSecond(n: number): void {
    this.tps = clampTicksPerSecond(n);
  }

  readout(): AtanorReadout {
    this.metrics ??= this.measure(this.level, this.solution);
    return toReadout({
      level: this.level,
      snapshot: this.engine.getSnapshot(),
      stats: this.engine.getStats(),
      metrics: this.metrics,
      playing: this.playing,
      ticksPerSecond: this.tps,
      siteLevel: this.siteLevel,
      jamColumn: this.engine.hasCrashed ? this.curr.cycle : null,
    });
  }

  levels(): Array<{ id: string; name: string; recipeId: string | null }> {
    return [...Atanor.listRecipeLevels(), ...Atanor.listAtanorLevels('poc')].map((l) => ({ id: l.id, name: l.name, recipeId: l.recipe?.recipeId ?? null }));
  }

  // -------------------------------------------------------------------------------------------

  /** Throughput of the shown machine, measured once per design on a separate engine. */
  private measure(level: Atanor.LevelConfig, solution: Atanor.AtanorSolution | null): Atanor.ThroughputMetrics {
    const key = `${level.id}|${solution ? Atanor.solutionKey(solution) : 'reference'}`;
    let m = this.metricsCache.get(key);
    if (!m) {
      m = Atanor.measureAtanorSolution(level, solution ?? undefined);
      if (this.metricsCache.size > 64) this.metricsCache.clear();
      this.metricsCache.set(key, m);
    }
    return m;
  }

  private resetEngine(): void {
    this.engine.reset();
    this.prev = this.curr = this.engine.getCurrentStepResult();
    this.clock.phase = 1;
    this.dirty = true;
  }

  /** One engine tick; false when the machine cannot run (jam, or target in puzzle mode). */
  private tick(): boolean {
    if (this.engine.hasCrashed) return false;
    if (this.stopAtTarget && this.engine.isCompleted) return false;
    this.prev = this.curr;
    this.curr = this.engine.step();
    return true;
  }

  private advance(dt: number): void {
    if (this.playing) {
      const n = dueTicks(this.clock, dt, this.tps, MAX_TICKS_PER_FRAME);
      for (let i = 0; i < n; i++) {
        if (!this.tick()) {
          this.playing = false;
          this.clock.phase = 1;
          break;
        }
        if (this.engine.hasCrashed) {
          this.playing = false;
          break;
        }
      }
      this.dirty = true;
    } else if (this.clock.phase < 1) {
      this.clock.phase = Math.min(1, this.clock.phase + Math.max(0, dt) * Math.max(this.tps, 4));
      this.dirty = true;
    }
  }

  private relayout(): void {
    this.layout = fitHexLayout(this.width, this.height, boardRadius(this.composed, this.siteLevel), this.insets);
    this.drawStatic();
    this.dirty = true;
  }

  private drawStatic(): void {
    const { board, staticLabels, PIXI } = this;
    if (!board || !staticLabels) return;
    const L = this.layout;
    const s = L.size;
    const pal = this.palette;
    const c = (k: keyof AtanorPalette) => cssToPixi(pal[k]);
    board.clear();
    for (const child of staticLabels.removeChildren()) child.destroy();

    for (const h of boardHexes(L.radius)) {
      const p = hexToScreen(h, L);
      board.poly(hexCorners(p.x, p.y, s, 0.97)).fill(c('hull')).stroke({ ...c('line'), width: 1 });
    }

    // Port and glyph labels sit inside the top of their hex, above the atom square, so they
    // never spill onto a neighbouring hex.
    const labelStyle = new PIXI.TextStyle({ fontFamily: FONT, fontSize: Math.max(8, Math.round(s * 0.16)), fontWeight: '700', fill: pal.textDim, letterSpacing: 0.5 });
    const label = (text: string, x: number, y: number, fill?: string) => {
      const t = new PIXI.Text({ text, style: fill ? labelStyle.clone() : labelStyle });
      if (fill) t.style.fill = fill;
      t.anchor.set(0.5, 0.5);
      t.position.set(Math.round(x), Math.round(y - s * 0.5));
      staticLabels.addChild(t);
    };

    for (const t of this.composed.tracks ?? []) {
      for (let i = 0; i + 1 < t.path.length; i++) {
        const a = hexToScreen(t.path[i]!, L);
        const b = hexToScreen(t.path[i + 1]!, L);
        board.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ ...c('metal'), width: Math.max(3, s * 0.12) });
      }
      for (const h of t.path) {
        const p = hexToScreen(h, L);
        const k = s * 0.12;
        board.rect(p.x - k, p.y - k, 2 * k, 2 * k).fill(c('graphite')).stroke({ ...c('metal'), width: 1 });
      }
    }

    for (const g of this.composed.glyphs) {
      const p = hexToScreen(g.pos, L);
      switch (g.type) {
        case 'BONDER':
        case 'UNBONDER': {
          // Twin rails between the two cells (arms are single thick beams).
          const q = hexToScreen(g.pos2, L);
          const nx = -(q.y - p.y) / hexStep(L);
          const ny = (q.x - p.x) / hexStep(L);
          const off = s * 0.09;
          const tone = c(g.type === 'BONDER' ? 'metal' : 'textFaint');
          for (const sgn of [-1, 1]) {
            board.moveTo(p.x + nx * off * sgn, p.y + ny * off * sgn).lineTo(q.x + nx * off * sgn, q.y + ny * off * sgn).stroke({ ...tone, width: 1.5 });
          }
          const k = s * 0.09;
          board.rect(q.x - k, q.y - k, 2 * k, 2 * k).stroke({ ...tone, width: 1.5 });
          if (g.type === 'UNBONDER') {
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2;
            board.moveTo(mx - nx * s * 0.22, my - ny * s * 0.22).lineTo(mx + nx * s * 0.22, my + ny * s * 0.22).stroke({ ...c('textDim'), width: 1.5 });
          }
          break;
        }
        case 'TRANSMUTE':
          board.poly(hexCorners(p.x, p.y, s, 0.7)).stroke({ ...c('textDim'), width: 1.5 });
          label(`${atomLabel(g.fromElement)}→${atomLabel(g.toElement)}`, p.x, p.y);
          break;
        case 'INPUT':
          board.poly(hexCorners(p.x, p.y, s, 0.86)).stroke({ ...c('text'), width: 1.5 });
          label(inputPortLabel(this.text, g.element, g.portion ?? 1), p.x, p.y);
          break;
        case 'OUTPUT': {
          // Port frame in signal (important data).
          board.poly(hexCorners(p.x, p.y, s, 0.88)).stroke({ ...c('signal'), width: 2 });
          label(outputPortLabel(this.text, g.product, g.targetPattern.name), p.x, p.y, pal.signal);
          break;
        }
      }
    }
    if (this.atomStyle) this.atomStyle.fontSize = Math.max(9, Math.round(s * 0.26));
    if (this.armStyle) this.armStyle.fontSize = Math.max(8, Math.round(s * 0.2));
    if (this.jamText) this.jamText.position.set(L.origin.x, Math.max(14, L.origin.y - s * (1.5 * L.radius + 1.35)));
  }

  private draw(): void {
    const { dyn, atomTexts, armTexts } = this;
    if (!dyn || !atomTexts || !armTexts) return;
    const L = this.layout;
    const s = L.size;
    const c = (k: keyof AtanorPalette) => cssToPixi(this.palette[k]);
    const pose: MachinePose = interpolateMachine(this.prev, this.curr, this.clock.phase, L);
    dyn.clear();
    atomTexts.begin();
    armTexts.begin();

    if (pose.delivered && this.clock.phase >= 0.85) {
      for (const g of this.level.glyphs) {
        if (g.type !== 'OUTPUT') continue;
        const p = hexToScreen(g.pos, L);
        dyn.poly(hexCorners(p.x, p.y, s, 0.88)).fill(c('signalDim'));
      }
    }

    pose.arms.forEach((arm, i) => {
      // one beam per gripper (multi-gripper arms of L4 have 2, 3 or 6)
      arm.grippers.forEach((g, j) => {
        dyn.moveTo(arm.base.x, arm.base.y).lineTo(g.x, g.y).stroke({ ...c('metal'), width: Math.max(4, s * 0.16) });
        dyn.moveTo(arm.base.x, arm.base.y).lineTo(g.x, g.y).stroke({ ...c('textDim'), width: 1 });
        const kg = s * 0.13;
        if (arm.held[j]) dyn.rect(g.x - kg, g.y - kg, 2 * kg, 2 * kg).fill(c('text'));
        else dyn.rect(g.x - kg, g.y - kg, 2 * kg, 2 * kg).stroke({ ...c('textDim'), width: 1.5 });
      });
      const kb = s * 0.24;
      dyn.rect(arm.base.x - kb, arm.base.y - kb, 2 * kb, 2 * kb).fill(c('graphite')).stroke({ ...c('metal'), width: 1.5 });
      armTexts.get(arm.id, arm.isPiston ? `P${i + 1}` : String(i + 1)).position.set(Math.round(arm.base.x), Math.round(arm.base.y));
    });

    for (const b of pose.bonds) {
      dyn.moveTo(b.a.x, b.a.y).lineTo(b.b.x, b.b.y).stroke({ ...c('text'), width: Math.max(2, s * 0.07), alpha: b.alpha });
    }

    const jam = new Set(pose.jamAtoms);
    const ka = s * 0.36;
    for (const a of pose.atoms) {
      const fill = cssToPixi(atomFill(a.element));
      dyn.rect(a.x - ka, a.y - ka, 2 * ka, 2 * ka).fill({ ...fill, alpha: a.alpha }).stroke({ ...c('text'), width: 1, alpha: 0.55 * a.alpha });
      if (jam.has(a.id)) dyn.rect(a.x - ka - 3, a.y - ka - 3, 2 * ka + 6, 2 * ka + 6).stroke({ ...c('alert'), width: 2 });
      const t = atomTexts.get(a.id, atomLabel(a.element));
      t.position.set(Math.round(a.x), Math.round(a.y));
      t.alpha = a.alpha;
    }
    this.drawSelection(dyn, L);
    this.drawGhost(dyn, L);
    atomTexts.end();
    armTexts.end();

    const jamState = this.engine.hasCrashed ? this.engine.getSnapshot().jam : null;
    if (this.jamText) {
      this.jamText.visible = jamState !== null;
      if (jamState) this.jamText.text = `${this.text.jam} · ${jamState.reason}`;
    }
  }

  /** Frame around the selected arm base or glyph (editor, AT2). */
  private drawSelection(g: Graphics, L: HexLayout): void {
    const id = this.selectedId;
    if (!id) return;
    const s = L.size;
    const sig = cssToPixi(this.palette.signal);
    const arm = this.solution?.arms.find((a) => a.id === id);
    const glyph = this.composed.glyphs.find((x) => x.id === id);
    const cells = arm ? [arm.basePos] : glyph ? Atanor.glyphCells(glyph) : [];
    for (const h of cells) {
      const p = hexToScreen(h, L);
      g.poly(hexCorners(p.x, p.y, s, 0.94)).stroke({ ...sig, width: 2 });
    }
  }

  /** Ghost of the active tool on the hovered hex: signal when it fits, alert when it does not. */
  private drawGhost(g: Graphics, L: HexLayout): void {
    const gh = this.ghost;
    if (!gh) return;
    const s = L.size;
    const tone = cssToPixi(gh.valid ? this.palette.signal : this.palette.alert);
    const p = hexToScreen(gh.hex, L);
    const stroke = { ...tone, width: 2, alpha: 0.9 };
    switch (gh.tool) {
      case 'ARM':
      case 'PISTON':
      case 'MULTI': {
        const grippers = gh.tool === 'MULTI' ? 2 : 1;
        for (let i = 0; i < grippers; i++) {
          const dir = (gh.rotation + (i * 6) / grippers) % 6;
          const q = hexToScreen(Atanor.hexAdd(gh.hex, Atanor.hexScale(Atanor.hexDirection(dir), gh.length)), L);
          g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ ...stroke, width: Math.max(3, s * 0.12) });
          const k = s * 0.13;
          g.rect(q.x - k, q.y - k, 2 * k, 2 * k).stroke(stroke);
        }
        const kb = s * 0.24;
        g.rect(p.x - kb, p.y - kb, 2 * kb, 2 * kb).stroke(stroke);
        break;
      }
      case 'BONDER':
      case 'UNBONDER': {
        const q = hexToScreen(Atanor.hexNeighbor(gh.hex, gh.rotation), L);
        g.poly(hexCorners(p.x, p.y, s, 0.8)).stroke(stroke);
        g.poly(hexCorners(q.x, q.y, s, 0.8)).stroke(stroke);
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke(stroke);
        break;
      }
      case 'TRANSMUTE':
        g.poly(hexCorners(p.x, p.y, s, 0.7)).stroke(stroke);
        break;
      case 'TRACK': {
        const k = s * 0.16;
        g.rect(p.x - k, p.y - k, 2 * k, 2 * k).stroke(stroke);
        break;
      }
      case 'DELETE': {
        const k = s * 0.4;
        g.moveTo(p.x - k, p.y - k).lineTo(p.x + k, p.y + k).moveTo(p.x + k, p.y - k).lineTo(p.x - k, p.y + k).stroke(stroke);
        break;
      }
    }
  }

  /** Counts GL draw calls of this view's own context (PixiJS has no renderer.info). */
  private instrument(app: Application): void {
    const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    if (!gl) return;
    const counter = this.counter;
    const wrap = (name: 'drawElements' | 'drawArrays' | 'drawElementsInstanced' | 'drawArraysInstanced', countArg: number) => {
      const original = (gl as unknown as Record<string, unknown>)[name];
      if (typeof original !== 'function') return;
      (gl as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: number[]) {
        counter.calls += 1;
        if (args[0] === gl.TRIANGLES) counter.triangles += (args[countArg] ?? 0) / 3;
        return (original as (...a: number[]) => unknown).apply(gl, args);
      };
    };
    wrap('drawElements', 1);
    wrap('drawArrays', 2);
    wrap('drawElementsInstanced', 1);
    wrap('drawArraysInstanced', 2);
  }

  // -------------------------------------------------------------------------------------------
  // Introspection for the harness

  /** Current hex layout (size and origin in container pixels). */
  get hexLayout(): HexLayout {
    return this.layout;
  }

  /** The PixiJS canvas while mounted. */
  get canvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null;
  }
}

function sameGhost(a: AtanorGhost | null, b: AtanorGhost | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.tool === b.tool && a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.rotation === b.rotation && a.length === b.length && a.valid === b.valid;
}

/** Records WebGL contexts created until `stop()` (scoped wrap of HTMLCanvasElement.getContext). */
function captureWebGLContexts(): { stop(): WebGLRenderingContext[] } {
  const seen: WebGLRenderingContext[] = [];
  const Canvas = (globalThis as { HTMLCanvasElement?: typeof HTMLCanvasElement }).HTMLCanvasElement;
  if (!Canvas) return { stop: () => seen };
  const proto = Canvas.prototype as unknown as { getContext: (this: HTMLCanvasElement, id: string, opts?: unknown) => unknown };
  const original = proto.getContext;
  const patched = function (this: HTMLCanvasElement, id: string, opts?: unknown) {
    const ctx = original.call(this, id, opts);
    if (ctx && (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') && !seen.includes(ctx as WebGLRenderingContext)) {
      seen.push(ctx as WebGLRenderingContext);
    }
    return ctx;
  };
  proto.getContext = patched;
  return {
    stop() {
      if (proto.getContext === patched) proto.getContext = original;
      return seen;
    },
  };
}

/** Loses every context except the one of `keep` (PixiJS caches what it learned from them). */
function loseContexts(contexts: WebGLRenderingContext[], keep: HTMLCanvasElement | null): void {
  for (const gl of contexts) {
    if (gl.canvas === keep || gl.isContextLost()) continue;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Waits (briefly) for the HUD font so canvas text does not rasterise in a fallback face. */
async function loadFont(): Promise<void> {
  const fonts = (globalThis.document as Document | undefined)?.fonts;
  if (!fonts?.load) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  await Promise.race([Promise.all([fonts.load(`700 12px ${FONT}`), fonts.load(`400 12px ${FONT}`)]).then(() => undefined), timeout]).catch(() => undefined);
}
