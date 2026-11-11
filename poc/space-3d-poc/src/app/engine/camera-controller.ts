import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** OrbitControls that follow a moving focus point without changing the player's viewing offset. */
export class CameraController {
  private controls!: OrbitControls;
  private readonly lastTarget = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private initialised = false;
  /** Offset from the focus point to apply on the next follow (a deliberate view change). */
  private pendingOffset: THREE.Vector3 | null = null;
  /** Surface (first-person) view: eye stands on the sphere at `normal`, looks around by yaw/pitch. */
  private surface: { normal: THREE.Vector3; radius: number } | null = null;
  private yaw = 0;
  private pitch = 0.15;
  private dragging = false;
  private abort: AbortController | null = null;
  private readonly east = new THREE.Vector3();
  private readonly north = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private static readonly EYE_HEIGHT = 2.5;
  /** Walking speed in world units per second (Shift = ×3). */
  private static readonly WALK_SPEED = 25;
  private readonly keys = new Set<string>();
  private readonly axis = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private lastWalk = 0;

  attach(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): void {
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 30000;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.enablePan = false;
    this.camera = camera;
    this.abort = new AbortController();
    const { signal } = this.abort;
    canvas.addEventListener('pointerdown', (e) => { if (this.surface && e.button === 0) this.dragging = true; }, { signal });
    window.addEventListener('pointerup', () => { this.dragging = false; }, { signal });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
        this.keys.add(e.key.toLowerCase());
      },
      { signal },
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
    window.addEventListener(
      'pointermove',
      (e) => {
        if (!this.surface || !this.dragging) return;
        this.yaw -= e.movementX * 0.004;
        this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.004, -1.4, 1.4);
      },
      { signal },
    );
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.surface) return;
        camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 20, 120);
        camera.updateProjectionMatrix();
      },
      { signal, passive: true },
    );
  }

  get inSurfaceView(): boolean {
    return this.surface !== null;
  }

  /** Switches to the on-planet view at a tile normal (body-local, unit). */
  enterSurface(normal: THREE.Vector3, radius: number): void {
    this.surface = { normal: normal.clone().normalize(), radius };
    this.yaw = 0;
    this.pitch = 0.15;
    this.controls.enabled = false;
  }

  /** Back to the orbit camera, hovering above the spot the player stood on. */
  exitSurface(distance = 150): void {
    const s = this.surface;
    if (!s) return;
    this.surface = null;
    this.dragging = false;
    this.controls.enabled = true;
    this.camera.up.set(0, 1, 0);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.pendingOffset = s.normal.clone().setLength(distance);
  }

  /** Keeps the camera's offset relative to the focus point as that point moves. */
  follow(target: THREE.Vector3): void {
    if (this.surface) {
      this.followSurface(target);
      return;
    }
    if (!this.initialised) {
      this.lastTarget.copy(target);
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(new THREE.Vector3(0, 120, 260));
      this.initialised = true;
    } else if (this.pendingOffset) {
      this.camera.position.copy(target).add(this.pendingOffset);
      this.controls.target.copy(target);
      this.lastTarget.copy(target);
      this.pendingOffset = null;
    } else {
      this.delta.subVectors(target, this.lastTarget);
      this.camera.position.add(this.delta);
      this.controls.target.copy(target);
      this.lastTarget.copy(target);
    }
    this.controls.update();
  }

  private followSurface(center: THREE.Vector3): void {
    const { normal: n, radius } = this.surface!;
    this.east.set(0, 1, 0).cross(n);
    if (this.east.lengthSq() < 1e-6) this.east.set(1, 0, 0);
    this.east.normalize();
    this.north.crossVectors(n, this.east);
    this.walk(n, radius);
    this.east.set(0, 1, 0).cross(n);
    if (this.east.lengthSq() < 1e-6) this.east.set(1, 0, 0);
    this.east.normalize();
    this.north.crossVectors(n, this.east);
    this.pos.copy(center).addScaledVector(n, radius + CameraController.EYE_HEIGHT);
    const cp = Math.cos(this.pitch);
    this.dir
      .copy(this.north).multiplyScalar(Math.cos(this.yaw) * cp)
      .addScaledVector(this.east, Math.sin(this.yaw) * cp)
      .addScaledVector(n, Math.sin(this.pitch));
    this.camera.up.copy(n);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.pos.x + this.dir.x, this.pos.y + this.dir.y, this.pos.z + this.dir.z);
    this.lastTarget.copy(center);
    this.controls.target.copy(center);
  }

  /** W/S move along the view heading, A/D strafe; the stand point slides over the sphere (normal is updated in place). */
  private walk(n: THREE.Vector3, radius: number): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastWalk) / 1000, 0.1);
    this.lastWalk = now;
    const f = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0);
    const r = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);
    if (!f && !r) return;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    // heading (forward) and right tangents at the current spot
    this.fwd.copy(this.north).multiplyScalar(cy).addScaledVector(this.east, sy);
    this.dir.copy(this.fwd).multiplyScalar(f).addScaledVector(this.axis.crossVectors(this.fwd, n), r);
    const len = this.dir.length();
    if (len < 1e-6) return;
    this.dir.divideScalar(len);
    const speed = CameraController.WALK_SPEED * (this.keys.has('shift') ? 3 : 1);
    const angle = (speed * dt) / (radius + CameraController.EYE_HEIGHT);
    this.axis.crossVectors(n, this.dir).normalize();
    n.applyAxisAngle(this.axis, angle).normalize();
  }

  /** On the next frame, puts the camera at focus + offset (then it follows as usual). */
  viewFrom(offset: THREE.Vector3): void {
    this.pendingOffset = offset.clone();
  }

  detach(): void {
    this.abort?.abort();
    this.controls?.dispose();
    this.initialised = false;
  }

  private camera!: THREE.PerspectiveCamera;
}
