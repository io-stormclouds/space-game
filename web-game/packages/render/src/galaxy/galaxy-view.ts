import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  type ShaderMaterial,
  type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STARS, type Star } from '@space-game/domain';
import type { PickResult, View, ViewContext, ViewInput } from '../view';
import {
  RANGE_RINGS,
  START_DIRECTION,
  buildMarkers,
  cameraLimits,
  circleSegments,
  distance,
  estimateLabelSize,
  findStar,
  marksKey,
  parseCssColor,
  pickNearest,
  placeLabels,
  resolveMarks,
  resolvePalette,
  selectLabels,
  sphereSilhouette,
  starLook,
  starScenePosition,
  type CameraLimits,
  type GalaxyMarks,
  type GalaxyPalette,
  type LabelBox,
  type ScreenStar,
  type StarLook,
  type Vec3,
} from './galaxy-model';
import { GALAXY_TEXT_PL, LabelOverlay, type GalaxyText, type LabelTone } from './labels';
import { PointBuffer, createPointsMaterial, type PointSpec } from './points-material';

// Galaxy map (F4), ported from poc/space-galaxy-poc/star-map star-canvas.component.ts.
// Draw calls: grid, drop lines, 2 range rings, stars, markers = 6 (PoC: ~185, one mesh, one glow
// sprite and one label sprite per star).

export interface GalaxyViewOptions {
  /** UI texts (defaults: Polish). */
  text?: Partial<GalaxyText>;
  /** Most star labels at once (marked stars always get one). Default 16. */
  maxLabels?: number;
  /** Star catalogue (default: the domain's 41 stars). */
  stars?: ReadonlyArray<Star>;
  /** Display name of a catalogue star (e.g. the app's dictionary: 'Sol (Sun)' -> 'Słońce'). */
  starName?: (catalogueName: string) => string;
}

/** Fallback before the first snapshot (W06 A: the default scenario lands at Tau Ceti). */
const DEFAULT_COLONY = 'Tau Ceti';
const GRID_STEP = 5;
const GRID_EXTENT = 25;
const DROP_RADIUS = 25;

interface Disposable {
  dispose(): void;
}

export class GalaxyView implements View {
  readonly kind = 'galaxy' as const;
  readonly usesThree = true;

  private readonly stars: ReadonlyArray<Star>;
  private readonly text: GalaxyText;
  private readonly maxLabels: number;
  private readonly starName: ((catalogueName: string) => string) | undefined;
  private readonly positions = new Map<string, Vec3>();
  private looks = new Map<string, StarLook>();

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private material: ShaderMaterial | null = null;
  private starBuf: PointBuffer | null = null;
  private markerBuf: PointBuffer | null = null;
  private rings: Array<{ line: LineSegments; r: number; label: string; tone: LabelTone }> = [];
  private plane: LineSegments | null = null;
  private drops: LineSegments | null = null;
  private labels: LabelOverlay | null = null;
  private palette: GalaxyPalette = resolvePalette();
  private limits: CameraLimits | null = null;
  private readonly owned: Disposable[] = [];

  private width = 1;
  private height = 1;
  private focusName = '';
  private focus: Vec3 = [0, 0, 0];
  private lastSnapshot: unknown = null;
  private marks: GalaxyMarks = { colony: null, hubs: new Map(), others: new Map(), unresolved: [] };
  private markerKey = '';
  private readonly markerSize = new Map<string, number>();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  constructor(opts: GalaxyViewOptions = {}) {
    this.stars = opts.stars ?? STARS;
    this.text = { ...GALAXY_TEXT_PL, ...opts.text };
    this.maxLabels = opts.maxLabels ?? 16;
    this.starName = opts.starName;
    for (const s of this.stars) this.positions.set(s.name, starScenePosition(s));
  }

  mount(ctx: ViewContext): void {
    if (!ctx.three) throw new Error('galaxy view needs the shared Three.js renderer');
    this.renderer = ctx.three;
    this.width = Math.max(1, ctx.width);
    this.height = Math.max(1, ctx.height);
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(ctx.container) : null;
    this.palette = resolvePalette(style ? (v) => style.getPropertyValue(v) : undefined);
    this.looks = new Map(this.stars.map((s) => [s.name, starLook(s, this.palette)]));

    const scene = new Scene();
    scene.background = new Color(this.palette.void);
    this.scene = scene;
    this.camera = new PerspectiveCamera(45, this.width / this.height, 0.05, 10);

    this.material = this.own(createPointsMaterial(this.renderer.getPixelRatio()));
    this.starBuf = this.own(new PointBuffer(this.stars.length, this.material));
    this.starBuf.points.renderOrder = 3;
    this.markerBuf = this.own(new PointBuffer(this.stars.length * 4 + 4, this.material));
    this.markerBuf.points.renderOrder = 4;
    scene.add(this.starBuf.points, this.markerBuf.points);

    // Range rings: one unit circle, scaled to the sphere outline every frame.
    const circle = this.own(new BufferGeometry());
    circle.setAttribute('position', new Float32BufferAttribute(circleSegments(96), 3));
    for (const ring of RANGE_RINGS) {
      const c = parseCssColor(this.palette[ring.edge])!;
      const mat = this.own(
        new LineDashedMaterial({
          color: new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace),
          dashSize: (Math.PI * 2) / 128,
          gapSize: (Math.PI * 2) / 128,
          transparent: true,
          opacity: c.a,
          depthTest: false,
          depthWrite: false,
        }),
      );
      const line = new LineSegments(circle, mat);
      line.computeLineDistances();
      line.renderOrder = 2;
      line.frustumCulled = false;
      scene.add(line);
      this.rings.push({ line, r: ring.ly, label: ring.label, tone: ring.labelColor === 'signal' ? 'signal' : 'dim' });
    }

    this.labels = new LabelOverlay(ctx.container, this.palette);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.6;
    // 26 ly → ~7000 ly in about 35 wheel steps (PoC: zoom 0.3–8, Deneb out of reach).
    this.controls.zoomSpeed = 3;
    this.writeStars();
    this.setFocus(DEFAULT_COLONY);
  }

  update(input: ViewInput, _dt: number): void {
    const { renderer, scene, camera, controls } = this;
    if (!renderer || !scene || !camera || !controls) return;

    if (input.snapshot && input.snapshot !== this.lastSnapshot) {
      this.lastSnapshot = input.snapshot;
      this.marks = resolveMarks(input.snapshot, this.stars);
      if (this.marks.colony && this.marks.colony !== this.focusName) this.setFocus(this.marks.colony);
    }
    const selected = input.selection.kind === 'STAR' ? (findStar(input.selection.starName, this.stars)?.name ?? null) : null;
    const hovered = input.hover?.kind === 'STAR' ? (findStar(input.hover.starName, this.stars)?.name ?? null) : null;
    const key = `${marksKey(this.marks)}|${selected ?? ''}|${hovered ?? ''}`;
    if (key !== this.markerKey) {
      this.markerKey = key;
      this.writeMarkers(selected, hovered);
    }

    controls.update();
    camera.updateMatrixWorld();
    this.updateRings();
    renderer.render(scene, camera);
    this.updateLabels(selected, hovered);
  }

  pick(x: number, y: number, _input: ViewInput): PickResult {
    const name = pickNearest(this.screenStars(), x, y, 6);
    return name ? { kind: 'STAR', starName: name } : { kind: 'EMPTY' };
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (this.camera) {
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.controls?.dispose();
    this.controls = null;
    for (const d of this.owned.splice(0)) d.dispose();
    this.disposeFocusGeometry();
    this.labels?.dispose();
    this.labels = null;
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.material = null;
    this.starBuf = null;
    this.markerBuf = null;
    this.rings = [];
    this.renderer = null;
    this.lastSnapshot = null;
    this.markerKey = '';
    this.focusName = '';
  }

  // -------------------------------------------------------------------------------------------

  /** Camera, grid and drop lines around the player's colony star. */
  private setFocus(name: string): void {
    const star = findStar(name, this.stars);
    const camera = this.camera;
    const controls = this.controls;
    if (!star || !camera || !controls || !this.scene) return;
    this.focusName = star.name;
    this.focus = this.positions.get(star.name)!;
    const lim = cameraLimits(this.focus, camera.fov);
    this.limits = lim;
    camera.near = lim.near;
    camera.far = lim.far;
    camera.updateProjectionMatrix();
    controls.minDistance = lim.minDistance;
    controls.maxDistance = lim.maxDistance;
    const [fx, fy, fz] = this.focus;
    controls.target.set(fx, fy, fz);
    camera.position.set(
      fx + START_DIRECTION[0] * lim.startDistance,
      fy + START_DIRECTION[1] * lim.startDistance,
      fz + START_DIRECTION[2] * lim.startDistance,
    );
    camera.lookAt(fx, fy, fz);
    controls.update();
    this.buildFocusGeometry();
  }

  private buildFocusGeometry(): void {
    this.disposeFocusGeometry();
    const scene = this.scene;
    if (!scene) return;
    const [fx, fy, fz] = this.focus;

    // Reference plane through the colony (domain z = const), 5 ly grid.
    const grid: number[] = [];
    for (let v = -GRID_EXTENT; v <= GRID_EXTENT; v += GRID_STEP) {
      grid.push(fx - GRID_EXTENT, fy, fz + v, fx + GRID_EXTENT, fy, fz + v);
      grid.push(fx + v, fy, fz - GRID_EXTENT, fx + v, fy, fz + GRID_EXTENT);
    }
    this.plane = this.lines(grid, this.palette.lineFaint, 0);
    scene.add(this.plane);

    // Drop lines from nearby stars to the plane (depth cue the PoC also had).
    const drops: number[] = [];
    for (const s of this.stars) {
      const p = this.positions.get(s.name)!;
      if (s.name === this.focusName || distance(p, this.focus) > DROP_RADIUS) continue;
      drops.push(p[0], p[1], p[2], p[0], fy, p[2]);
    }
    this.drops = this.lines(drops, this.palette.line, 1);
    scene.add(this.drops);
  }

  private lines(points: number[], css: string, order: number): LineSegments {
    const c = parseCssColor(css) ?? { r: 0.5, g: 0.5, b: 0.5, a: 0.2 };
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(points, 3));
    const mat = new LineBasicMaterial({
      color: new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace),
      transparent: true,
      opacity: c.a,
      depthTest: false,
      depthWrite: false,
    });
    const line = new LineSegments(geo, mat);
    line.renderOrder = order;
    line.frustumCulled = false;
    return line;
  }

  private disposeFocusGeometry(): void {
    for (const l of [this.plane, this.drops]) {
      if (!l) continue;
      l.removeFromParent();
      l.geometry.dispose();
      (l.material as LineBasicMaterial).dispose();
    }
    this.plane = null;
    this.drops = null;
  }

  private writeStars(): void {
    const specs: PointSpec[] = this.stars.map((s) => {
      const look = this.looks.get(s.name)!;
      return { position: this.positions.get(s.name)!, size: look.size, shape: look.shape, color: look.color };
    });
    this.starBuf?.write(specs);
  }

  private writeMarkers(selected: string | null, hovered: string | null): void {
    // The colony dot itself turns signal (board: filled amber dot inside the square frame).
    const specs: PointSpec[] = [];
    const colony = this.marks.colony;
    if (colony) {
      const look = this.looks.get(colony)!;
      specs.push({ position: this.positions.get(colony)!, size: look.size, shape: 'disc', color: parseCssColor(this.palette.signal)! });
    }
    this.markerSize.clear();
    for (const m of buildMarkers(this.marks, selected, hovered)) {
      const p = this.positions.get(m.starName);
      if (!p) continue;
      this.markerSize.set(m.starName, Math.max(m.size, this.markerSize.get(m.starName) ?? 0));
      specs.push({ position: p, size: m.size, shape: m.shape, color: parseCssColor(this.palette[m.color])! });
    }
    this.markerBuf?.write(specs);
  }

  private updateRings(): void {
    const camera = this.camera!;
    const center = this.tmp.set(this.focus[0], this.focus[1], this.focus[2]);
    const d = camera.position.distanceTo(center);
    const toCam = this.tmp2.copy(camera.position).sub(center).normalize();
    for (const ring of this.rings) {
      const s = sphereSilhouette(ring.r, d);
      ring.line.visible = s !== null;
      if (!s) continue;
      ring.line.position.copy(center).addScaledVector(toCam, s.offset);
      ring.line.quaternion.copy(camera.quaternion);
      ring.line.scale.setScalar(s.radius);
    }
  }

  private project(p: Vec3): { x: number; y: number } | null {
    const v = this.tmp.set(p[0], p[1], p[2]).project(this.camera!);
    if (v.z < -1 || v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  private screenStars(): ScreenStar[] {
    if (!this.camera) return [];
    this.camera.updateMatrixWorld();
    const out: ScreenStar[] = [];
    for (const s of this.stars) {
      const p = this.project(this.positions.get(s.name)!);
      if (p) out.push({ name: s.name, x: p.x, y: p.y, r: (this.looks.get(s.name)?.size ?? 6) / 2 });
    }
    return out;
  }

  private tagOf(name: string): { tag: string | null; tone: LabelTone } {
    if (name === this.marks.colony) return { tag: this.text.colony, tone: 'signal' };
    if (this.marks.hubs.has(name)) return { tag: this.text.hub, tone: 'normal' };
    const n = this.marks.others.get(name);
    if (n) return { tag: n > 1 ? this.text.otherColonies(n) : this.text.otherColony, tone: 'dim' };
    return { tag: null, tone: 'normal' };
  }

  private updateLabels(selected: string | null, hovered: string | null): void {
    const labels = this.labels;
    const camera = this.camera;
    if (!labels || !camera) return;
    const marked = new Set<string>([...this.marks.hubs.keys(), ...this.marks.others.keys()]);
    if (this.marks.colony) marked.add(this.marks.colony);
    if (selected) marked.add(selected);
    if (hovered) marked.add(hovered);
    const camDist = camera.position.distanceTo(this.tmp.set(this.focus[0], this.focus[1], this.focus[2]));
    const wanted = selectLabels(this.stars, this.focus, camDist, marked, this.maxLabels);

    const boxes: LabelBox[] = [];
    const info = new Map<string, { tag: string | null; tagTone: LabelTone; tone: LabelTone }>();
    for (const w of wanted) {
      const p = this.project(this.positions.get(w.name)!);
      if (!p) continue;
      const { tag, tone: tagTone } = this.tagOf(w.name);
      const size = estimateLabelSize(this.displayName(w.name), tag);
      const look = this.looks.get(w.name);
      // Clear of the marker frame (brackets, square, diamond) or of the dot.
      const gap = Math.max(8, (look?.size ?? 6) / 2 + 6, (this.markerSize.get(w.name) ?? 0) / 2 + 3);
      const tone: LabelTone = w.name === selected || w.name === hovered || w.name === this.marks.colony ? 'signal' : 'normal';
      boxes.push({ name: w.name, ax: p.x, ay: p.y, gap, w: size.w, h: size.h, force: w.marked });
      info.set(w.name, { tag, tagTone, tone });
    }
    // Order: colony, selection, hover, range rings, other marked stars, then the rest.
    const rank = (b: LabelBox) =>
      b.name === this.marks.colony ? 0 : b.name === selected ? 1 : b.name === hovered ? 2 : b.fixed ? 3 : b.force ? 4 : 5;
    // Ring labels sit on the outline top, right of centre (board).
    for (const ring of this.rings) {
      if (!ring.line.visible) continue;
      const top = this.tmp2.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(ring.line.scale.x).add(ring.line.position);
      const p = this.project([top.x, top.y, top.z]);
      if (!p) continue;
      const key = `ring:${ring.label}`;
      const size = estimateLabelSize(ring.label, null);
      boxes.push({ name: key, ax: p.x, ay: p.y - 11, gap: 8, w: size.w, h: size.h, force: false, fixed: true });
      info.set(key, { tag: null, tagTone: 'normal', tone: ring.tone });
    }
    boxes.sort((a, b) => rank(a) - rank(b));
    const shown = placeLabels(boxes, this.width, this.height);
    for (const [key, at] of shown) {
      const i = info.get(key)!;
      const text = key.startsWith('ring:') ? key.slice(5) : this.displayName(key);
      labels.show(key, text, i.tone, at.x, at.y, i.tag, i.tagTone);
    }
    labels.hideExcept(new Set(shown.keys()));
  }

  private displayName(name: string): string {
    return this.starName ? this.starName(name) : name;
  }

  private own<T extends Disposable>(d: T): T {
    this.owned.push(d);
    return d;
  }

  // -------------------------------------------------------------------------------------------
  // Introspection for the harness and tests

  /** Current camera limits (W09: far plane reaches Deneb). */
  get cameraLimits(): CameraLimits | null {
    return this.limits;
  }

  /** Camera distance from the focus star [ly]. */
  get cameraDistance(): number {
    return this.camera && this.controls ? this.camera.position.distanceTo(this.controls.target) : 0;
  }

  /** Star labels currently in the DOM overlay. */
  visibleLabels(): string[] {
    return this.labels?.visibleKeys() ?? [];
  }

  /** Container-pixel position of a star, null when off-screen (harness clicks). */
  screenPositionOf(name: string): { x: number; y: number } | null {
    const p = this.positions.get(findStar(name, this.stars)?.name ?? '');
    if (!p || !this.camera) return null;
    this.camera.updateMatrixWorld();
    return this.project(p);
  }

  /** Moves the camera to a distance from the focus along the current view direction. */
  setCameraDistance(d: number): void {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return;
    const dir = this.tmp.copy(camera.position).sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, d);
    controls.update();
  }

  /** Places the camera at `d` from the focus along `dir` (scene axes). */
  viewFrom(dir: Vec3, d: number): void {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return;
    const v = this.tmp.set(dir[0], dir[1], dir[2]).normalize();
    camera.position.copy(controls.target).addScaledVector(v, d);
    controls.update();
  }

  /** Turns the camera to look from the focus toward a star (harness check of the far plane). */
  lookToward(name: string, d: number): void {
    const p = this.positions.get(findStar(name, this.stars)?.name ?? '');
    const camera = this.camera;
    const controls = this.controls;
    if (!p || !camera || !controls) return;
    const dir = this.tmp.set(this.focus[0] - p[0], this.focus[1] - p[1], this.focus[2] - p[2]).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, d);
    controls.update();
  }
}

export function createGalaxyView(opts: GalaxyViewOptions = {}): View {
  return new GalaxyView(opts);
}
