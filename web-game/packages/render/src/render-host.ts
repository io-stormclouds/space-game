import { WebGLRenderer } from 'three';
import type { PickResult, RenderStats, View, ViewFactory, ViewInput, ViewKind } from './view';

export interface RenderHostOptions {
  assetsBase?: string;
  /** View factories by kind; Atanor's is a dynamic import so PixiJS loads only when needed. */
  views: Partial<Record<ViewKind, ViewFactory>>;
  /** Test hook: create the Three renderer (jsdom has no WebGL). */
  createRenderer?: (canvas?: HTMLCanvasElement) => WebGLRenderer;
}

/**
 * Owns the canvas area and the single Three.js renderer, and switches views (F4, W13 A):
 * - never two WebGL contexts at once: entering a view with its own context (Atanor/PixiJS)
 *   disposes the Three.js renderer and forces its context loss; leaving recreates it;
 * - the previous view is disposed before the next one mounts, so GPU counters return to the
 *   baseline after any number of switches (F4 done criterion).
 */
export class RenderHost {
  private three: WebGLRenderer | null = null;
  private view: View | null = null;
  private kind: ViewKind | null = null;
  private readonly cache = new Map<ViewFactory, View>();
  private switching: Promise<void> = Promise.resolve();
  private width = 1;
  private height = 1;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: RenderHostOptions,
  ) {
    this.measure();
  }

  get current(): ViewKind | null {
    return this.kind;
  }

  /** The mounted view instance (e.g. to reach the Atanor controls). */
  get currentView(): View | null {
    return this.view;
  }

  /** Switches to a view; resolves when it is mounted. Calls are serialised. */
  setView(kind: ViewKind): Promise<void> {
    this.switching = this.switching.then(() => this.doSetView(kind));
    return this.switching;
  }

  private async doSetView(kind: ViewKind): Promise<void> {
    if (this.kind === kind) return;
    const factory = this.opts.views[kind];
    if (!factory) throw new Error(`no view for ${kind}`);
    // Same view instance serving several kinds (planet ↔ system): only the camera changes.
    if (this.view && Array.isArray(this.view.kind) && this.view.kind.includes(kind) && this.view.setKind) {
      this.view.setKind(kind);
      this.kind = kind;
      return;
    }
    this.view?.dispose();
    this.view = null;
    this.kind = null;
    const next = await factory();
    if (next.usesThree) this.ensureThree();
    else this.releaseThree();
    await next.mount({
      container: this.container,
      three: next.usesThree ? this.three : null,
      assetsBase: this.opts.assetsBase ?? 'assets/',
      width: this.width,
      height: this.height,
    });
    next.setKind?.(kind);
    this.view = next;
    this.kind = kind;
    this.cache.set(factory, next);
  }

  update(input: ViewInput, dtSeconds: number): void {
    this.view?.update(input, dtSeconds);
  }

  pick(x: number, y: number, input: ViewInput): PickResult {
    return this.view?.pick(x, y, input) ?? { kind: 'EMPTY' };
  }

  resize(): void {
    this.measure();
    this.three?.setSize(this.width, this.height, false);
    this.view?.resize(this.width, this.height);
  }

  stats(): RenderStats {
    const info = this.three?.info;
    const own = this.view?.stats?.() ?? {};
    return {
      view: this.kind,
      drawCalls: own.drawCalls ?? info?.render.calls ?? 0,
      triangles: own.triangles ?? info?.render.triangles ?? 0,
      geometries: own.geometries ?? info?.memory.geometries ?? 0,
      textures: own.textures ?? info?.memory.textures ?? 0,
      contexts: (this.three ? 1 : 0) + (own.contexts ?? 0),
      ...(own.detail ? { detail: own.detail } : {}),
    };
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
    this.kind = null;
    this.releaseThree();
  }

  private ensureThree(): void {
    if (this.three) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'render-host__canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    this.three = this.opts.createRenderer
      ? this.opts.createRenderer(canvas)
      : new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.setSize(this.width, this.height, false);
    this.three.info.autoReset = true;
    this.container.appendChild(this.three.domElement);
  }

  private releaseThree(): void {
    if (!this.three) return;
    const r = this.three;
    this.three = null;
    r.dispose();
    r.forceContextLoss();
    r.domElement.remove();
  }

  private measure(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
  }
}
