import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Plane,
  PMREMGenerator,
  PointLight,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CATALOG_MODELS, lightOf } from '../domain/catalog/catalog';
import { LEVEL_HEIGHT, cellOf, edgeCells, frontOf, type EdgeRef, type Rect, type XZ } from '../domain/grid';
import type { IndexedPiece, LayoutIndex } from '../domain/layout-index';
import type { Plan } from '../domain/planners';
import { CameraRig } from './camera-rig';
import { GhostView } from './ghost-view';
import { KitLibrary } from './kit-library';
import { KitMaterials } from './kit-materials';
import { LayoutView, pieceMatrix } from './layout-view';
import { OverlayView } from './overlay-view';
import { LIGHT_POOL_MAX, LIGHTING_PRESETS, type Lighting, type LightingPreset } from './lighting-presets';

export { LIGHT_POOL_MAX, LIGHTING_PRESETS, type Lighting, type LightingPreset } from './lighting-presets';

export type WallMode = 'up' | 'cutaway' | 'down';

/** Height walls are cut to in cutaway / walls-down views, metres above the deck. */
const CUT_HEIGHT = 1.15;
/** Everything above this (ceilings, ceiling lamps) is hidden in edit views. */
const CEILING_CUT = 3.0;

/**
 * Owns the Three.js side of the editor: renderer, scene, camera, the layout/ghost/overlay views
 * and lighting. Holds NO design state: the Angular layer pushes the current index, plan, selection
 * and view options in; tools ask it to pick.
 */
export class EditorEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig: CameraRig;
  readonly materials = new KitMaterials('assets/molten/atlas.png');
  readonly kit = new KitLibrary('assets/molten/models', this.materials);
  private readonly layoutView = new LayoutView(this.kit);
  private readonly ghost = new GhostView(this.kit);
  readonly overlay = new OverlayView();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hemi = new HemisphereLight(0xdfe8ff, 0x1d232b, 1.15);
  private readonly sun = new DirectionalLight(0xfff4e6, 1.5);
  private readonly pool: PointLight[] = [];
  private readonly envMap: Texture;
  private readonly raycaster = new Raycaster();
  private readonly timer = new Timer();
  private readonly resizeObserver: ResizeObserver;
  private frameHandle = 0;
  private index?: LayoutIndex;
  private plan: Plan | null = null;
  private level = 0;
  private wallMode: WallMode = 'cutaway';
  private lighting: Lighting = 'day';
  private preset: LightingPreset = LIGHTING_PRESETS.day;
  private showCeilings = false;
  private cutKey = '';
  private lightsDirty = true;
  private fps = 0;
  private frames = 0;
  private fpsTime = 0;
  /** Called every frame after render (room labels follow the camera). */
  onFrame?: () => void;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.info.autoReset = false; // count every pass of a frame (bloom renders several)
    this.scene.background = new Color(0x0b0c10);

    const pmrem = new PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.sun.position.set(-30, 60, 40);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    for (let i = 0; i < LIGHT_POOL_MAX; i++) {
      const l = new PointLight(0xffffff, 0, 10, 2);
      l.visible = i < this.preset.lights;
      this.pool.push(l);
      this.scene.add(l);
    }
    this.scene.add(this.layoutView.group, this.ghost.group, this.overlay.group);

    this.rig = new CameraRig(canvas);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.32, 0.18, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.overlay.setLevel(0);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  start(): void {
    const loop = () => {
      this.frameHandle = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  async loadKit(onProgress: (done: number, total: number) => void): Promise<void> {
    let last = 0;
    await this.kit.loadAll(CATALOG_MODELS, (done, total) => {
      onProgress(done, total);
      // Show pieces as their models arrive, but not on every single file.
      if (this.index && (done - last >= 12 || done === total)) {
        last = done;
        this.layoutView.sync(this.index);
        this.cutKey = '';
        this.lightsDirty = true;
      }
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.layoutView.dispose();
    this.ghost.dispose();
    this.overlay.dispose();
    this.kit.dispose();
    this.materials.dispose();
    this.envMap.dispose();
    this.composer.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.rig.resize(w, h);
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.renderer.info.reset();
    this.rig.update(dt);
    this.updateCut();
    if (this.preset.fixtures > 0 && this.lightsDirty) this.placeFixtureLights();
    if (this.preset.bloom) this.composer.render(dt);
    else this.renderer.render(this.scene, this.rig.camera);
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    this.onFrame?.();
  }

  // ── state in ───────────────────────────────────────────────────────────
  setLayout(index: LayoutIndex): void {
    this.index = index;
    this.layoutView.sync(index);
    this.ghost.show(this.plan, index);
    this.cutKey = '';
    this.lightsDirty = true;
  }

  setPlan(plan: Plan | null): void {
    this.plan = plan;
    if (this.index) this.ghost.show(plan, this.index);
  }

  setLevel(level: number): void {
    const dy = (level - this.level) * LEVEL_HEIGHT;
    this.level = level;
    this.overlay.setLevel(level);
    this.layoutView.setMaxLevel(level);
    if (dy) this.rig.setTargetHeight(this.rig.controls.target.y + dy);
    this.cutKey = '';
    this.lightsDirty = true;
  }

  setWallMode(mode: WallMode): void {
    this.wallMode = mode;
    this.cutKey = '';
  }

  setCeilings(show: boolean): void {
    this.showCeilings = show;
    this.cutKey = '';
  }

  /** Day or night; `nightTuning` patches the night preset (the night tuning panel). */
  setLighting(mode: Lighting, nightTuning: Partial<LightingPreset> = {}): void {
    this.lighting = mode;
    this.applyPreset(mode === 'night' ? { ...LIGHTING_PRESETS.night, ...nightTuning } : LIGHTING_PRESETS.day);
  }

  get lightingMode(): Lighting {
    return this.lighting;
  }

  /** Live tweak of the current preset, e.g. `__interior.engine.tune({ hemi: 0.5 })`. */
  tune(patch: Partial<LightingPreset>): LightingPreset {
    this.applyPreset({ ...this.preset, ...patch });
    return this.preset;
  }

  private applyPreset(p: LightingPreset): void {
    this.preset = p;
    (this.scene.background as Color).setHex(p.background);
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemi;
    this.sun.intensity = p.sun;
    this.scene.environmentIntensity = p.env;
    this.renderer.toneMappingExposure = p.exposure;
    this.materials.setGlow(p.emissive, p.holo);
    this.bloom.strength = p.bloomStrength;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    const count = Math.max(0, Math.min(LIGHT_POOL_MAX, Math.round(p.lights)));
    this.pool.forEach((l, i) => {
      l.intensity = 0;
      l.visible = i < count; // a change of count recompiles the lit materials once
    });
    this.lightsDirty = true;
  }

  setSelection(rects: readonly Rect[]): void {
    this.overlay.setSelection(rects);
  }

  setHover(rects: readonly Rect[]): void {
    this.overlay.setHover(rects);
  }

  setFill(rects: readonly Rect[]): void {
    this.overlay.setFill(rects);
  }

  // ── picking ────────────────────────────────────────────────────────────
  private setRay(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
  }

  /** Point on the active deck plane under the cursor. */
  pickGround(clientX: number, clientY: number): XZ | null {
    this.setRay(clientX, clientY);
    const plane = new Plane(new Vector3(0, 1, 0), -this.level * LEVEL_HEIGHT);
    const p = this.raycaster.ray.intersectPlane(plane, new Vector3());
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Visible piece under the cursor (cut-away parts and hidden decks are skipped). */
  pickPiece(clientX: number, clientY: number, filter?: (id: string) => boolean): string | null {
    this.setRay(clientX, clientY);
    return this.layoutView.raycast(this.raycaster, filter)?.id ?? null;
  }

  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new Vector3(x, y, z).project(this.rig.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }

  cameraXZ(): XZ {
    return { x: this.rig.camera.position.x, z: this.rig.camera.position.z };
  }

  focus(x: number, z: number, distance?: number): void {
    this.rig.focus(x, this.level * LEVEL_HEIGHT, z, distance);
  }

  stats(): { fps: number; drawCalls: number; instances: number; programs: number } {
    const v = this.layoutView.stats();
    return { fps: this.fps, ...v, drawCalls: this.renderer.info.render.calls, programs: this.renderer.info.programs?.length ?? 0 };
  }

  // ── cutaway ────────────────────────────────────────────────────────────
  private updateCut(): void {
    const f = this.rig.forwardXZ();
    const topDown = this.rig.controls.getPolarAngle() < 0.18;
    const key = `${this.wallMode}|${this.level}|${this.showCeilings}|${topDown}|${Math.round(Math.atan2(f.x, f.z) * 18)}`;
    if (key === this.cutKey || !this.index) return;
    this.cutKey = key;
    const index = this.index;
    const occludes = (e: EdgeRef): boolean => {
      if (topDown) return false;
      const s = e.axis === 'x' ? f.z : f.x;
      if (Math.abs(s) < 0.2) return false;
      const far = edgeCells(e)[s > 0 ? 1 : 0];
      return index.isFloored(e.level, far.x, far.z) || index.isSolid(e.level, far.x, far.z);
    };
    this.layoutView.applyCut((ip: IndexedPiece) => {
      const level = ip.piece.level;
      const base = level * LEVEL_HEIGHT;
      const s = ip.shape;
      // Ceilings and what hangs from them show only with "Sufity" on (they would hide the room from
      // above); their lights stay on either way.
      const ceilingThing = s.kind === 'ceiling' || (s.kind === 'object' && s.layer === 'ceiling');
      if (ceilingThing) return this.showCeilings && level === this.level ? 0 : base + CEILING_CUT;
      if (level !== this.level) return 0;
      if (this.wallMode === 'up') return 0;
      // A lift's posts and frame are as tall as walls: cut with them in the walls-down view.
      if (s.kind === 'floor' && s.connector === 'lift') return this.wallMode === 'down' ? base + CUT_HEIGHT : 0;
      if (s.kind === 'edge') {
        if (s.edgeKind === 'railing') return 0;
        return this.wallMode === 'down' || s.edges.some(occludes) ? base + CUT_HEIGHT : 0;
      }
      if (s.kind === 'wall-object') {
        return this.wallMode === 'down' || s.edges.some(occludes) ? base + CUT_HEIGHT : 0;
      }
      return 0;
    });
  }

  // ── fixture lights: a fixed pool of point lights on the emitters that matter most for the view ──
  private placeFixtureLights(): void {
    this.lightsDirty = false;
    const index = this.index;
    if (!index) return;
    const target = this.rig.controls.target;
    const scale = this.preset.fixtures;
    const lights: { p: Vector3; spec: NonNullable<ReturnType<typeof lightOf>>; score: number }[] = [];
    // A lower deck's light counts only where no visible deck above covers it (no shadows: it would
    // light the upper deck through its floor).
    const covered = (level: number, x: number, z: number) => {
      const c = cellOf(x, z);
      for (let l = level + 1; l <= this.level; l++) if (index.isFloored(l, c.x, c.z) || index.floorAt(l, c.x, c.z)) return true;
      return false;
    };
    for (const ip of index.pieces.values()) {
      if (ip.piece.level > this.level) continue;
      const spec = lightOf(ip.item);
      if (!spec) continue;
      // Light sits at the piece's footprint centre, pushed out of its front (screens light what faces them).
      const m = pieceMatrix(ip, index);
      const p = new Vector3().setFromMatrixPosition(m);
      if (ip.shape.kind === 'object') {
        p.x = (ip.shape.rect.minX + ip.shape.rect.maxX) / 2;
        p.z = (ip.shape.rect.minZ + ip.shape.rect.maxZ) / 2;
      }
      const f = frontOf(ip.piece.rot);
      const fwd = spec.forward ?? 0;
      p.set(p.x + f.x * fwd, ip.piece.level * LEVEL_HEIGHT + spec.height, p.z + f.z * fwd);
      if (ip.piece.level < this.level && covered(ip.piece.level, p.x, p.z)) continue;
      const d2 = p.distanceToSquared(target);
      lights.push({ p, spec, score: spec.intensity / (1 + d2 / 400) });
    }
    lights.sort((a, b) => b.score - a.score);
    let i = 0;
    for (const l of this.pool) {
      const fx = l.visible ? lights[i++] : undefined;
      if (!fx) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(fx.p);
      l.color.setHex(fx.spec.color);
      l.intensity = fx.spec.intensity * scale;
      l.distance = (fx.spec.reach ?? 10) * this.preset.reach;
    }
  }

  /** Re-aims the night lights at the fixtures around the current view. */
  refreshLights(): void {
    this.lightsDirty = true;
  }
}
