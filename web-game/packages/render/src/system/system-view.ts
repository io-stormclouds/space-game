import type { PickResult, RenderStats, View, ViewContext, ViewInput, ViewKind } from '../view';
import type { FetchBytes } from './model-library';
import { SystemScene } from './system-scene';

export interface SystemViewOptions {
  /** Reads model files; default `fetch` (tests read them from disk). */
  fetchBytes?: FetchBytes;
  /** false = keep the placeholder boxes, no network (tests, quick previews). */
  loadModels?: boolean;
  /** false = no hemisphere culling, no decor LOD and no structure/unit proxies (T4/T4b "before" measurements); default true. */
  cullDetail?: boolean;
}

const EMPTY: PickResult = { kind: 'EMPTY' };

/**
 * View serving `planet` and `system` (W12 A): one continuous Three.js scene on the host's shared
 * renderer; `setKind` only switches the camera preset, it never recreates GPU resources.
 * Everything the scene builds is created in `mount` and freed in `dispose`, so one instance can be
 * mounted again after a dispose.
 */
export class SystemView implements View {
  readonly kind: ViewKind[] = ['planet', 'system'];
  readonly usesThree = true;
  private scene: SystemScene | null = null;
  private current: ViewKind = 'planet';

  constructor(private readonly opts: SystemViewOptions = {}) {}

  /**
   * Resolves when the KayKit models requested so far have loaded (or failed and kept their
   * placeholders): Space Base Bits at mount, the medieval skin once a medieval body is shown.
   */
  get ready(): Promise<void> {
    return this.scene?.ready ?? Promise.resolve();
  }

  /** The live scene (tests, harness); null when not mounted. */
  get internals(): SystemScene | null {
    return this.scene;
  }

  mount(ctx: ViewContext): void {
    if (!ctx.three) throw new Error('SystemView needs the shared Three.js renderer');
    this.scene?.dispose();
    this.scene = new SystemScene({
      container: ctx.container,
      renderer: ctx.three,
      assetsBase: ctx.assetsBase,
      width: ctx.width,
      height: ctx.height,
      fetchBytes: this.opts.fetchBytes,
      loadModels: this.opts.loadModels,
      cullDetail: this.opts.cullDetail,
    });
    this.scene.setMode(this.current === 'system' ? 'system' : 'planet');
  }

  setKind(kind: ViewKind): void {
    if (kind !== 'planet' && kind !== 'system') return;
    this.current = kind;
    this.scene?.setMode(kind);
  }

  update(input: ViewInput, dtSeconds: number): void {
    this.scene?.update(input, dtSeconds);
  }

  pick(x: number, y: number, input: ViewInput): PickResult {
    return this.scene?.pick(x, y, input) ?? EMPTY;
  }

  resize(width: number, height: number): void {
    this.scene?.resize(width, height);
  }

  dispose(): void {
    this.scene?.dispose();
    this.scene = null;
  }

  /** Both render passes of the last frame (the host's `renderer.info` only sees the last one). */
  stats(): Partial<RenderStats> {
    if (!this.scene) return {};
    const f = this.scene.frameStats;
    return {
      drawCalls: f.drawCalls,
      triangles: f.triangles,
      detail: {
        terrainTriangles: f.terrainTriangles,
        decorTriangles: f.decorTriangles,
        structureTriangles: f.structureTriangles,
        unitTriangles: f.unitTriangles,
        instances: f.instances,
      },
    };
  }
}
