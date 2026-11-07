import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'planet' | 'system';

/** Where the current mode wants to look this frame. */
export interface CameraGoal {
  target: THREE.Vector3;
  /** Identity of the target (focus body id, or the star): a change starts a transition. */
  key: string;
  /** Default spherical offset for a fresh target. */
  distance: number;
  phi: number;
  theta: number;
  minDistance: number;
  maxDistance: number;
}

export const TRANSITION_SECONDS = 0.7;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Camera of the planet/system scene (PoC `CameraController`, extended):
 * - OrbitControls: drag rotates, wheel zooms, no pan; the offset to the target is kept while the
 *   target moves (it follows a body along its orbit);
 * - two presets: `planet` (close orbit around the focus body) and `system` (overview centred on the
 *   star); switching or refocusing flies there in TRANSITION_SECONDS (target lerp, log-distance);
 * - each mode remembers the player's last angle and zoom, so going back restores it.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 100000);
  readonly controls: OrbitControls | null;
  private mode: CameraMode = 'planet';
  /** The player's last view per mode, and of which target. */
  private readonly saved: Record<CameraMode, { key: string; offset: THREE.Spherical } | null> = { planet: null, system: null };
  private readonly lastTarget = new THREE.Vector3();
  private key: string | null = null;
  private started = false;
  private transition: { t: number; fromTarget: THREE.Vector3; from: THREE.Spherical; to: THREE.Spherical } | null = null;
  private readonly offset = new THREE.Vector3();
  private readonly sph = new THREE.Spherical();
  private readonly tmp = new THREE.Vector3();

  constructor(dom: HTMLElement | null) {
    this.camera.position.set(0, 120, 260);
    if (dom) {
      const c = new OrbitControls(this.camera, dom);
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.enablePan = false;
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      c.zoomSpeed = 1.2;
      this.controls = c;
    } else {
      this.controls = null;
    }
  }

  get currentMode(): CameraMode {
    return this.mode;
  }

  get transitioning(): boolean {
    return this.transition !== null;
  }

  /** Switches the preset; the next `update` flies to it. Remembers the player's view of the old mode. */
  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    if (this.key !== null) this.saved[this.mode] = { key: this.key, offset: this.currentOffset(new THREE.Spherical()) };
    this.mode = mode;
    this.key = null; // the next update starts a flight
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, goal: CameraGoal): void {
    if (!this.started) {
      this.started = true;
      this.key = goal.key;
      this.applyLimits(goal);
      this.place(goal.target, this.offsetFor(goal));
      return;
    }
    if (goal.key !== this.key) {
      this.key = goal.key;
      this.transition = { t: 0, fromTarget: this.lastTarget.clone(), from: this.currentOffset(new THREE.Spherical()), to: this.offsetFor(goal) };
      if (this.controls) this.controls.enabled = false;
    }
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + Math.max(0, dt) / TRANSITION_SECONDS);
      const e = smooth(tr.t);
      this.tmp.lerpVectors(tr.fromTarget, goal.target, e);
      this.sph.radius = Math.exp(Math.log(Math.max(tr.from.radius, 1e-3)) * (1 - e) + Math.log(Math.max(tr.to.radius, 1e-3)) * e);
      this.sph.phi = tr.from.phi + (tr.to.phi - tr.from.phi) * e;
      this.sph.theta = tr.from.theta + shortestAngle(tr.from.theta, tr.to.theta) * e;
      // OrbitControls stay out of the flight: their limits belong to the mode we leave
      this.place(this.tmp, this.sph, false);
      if (tr.t >= 1) {
        this.transition = null;
        this.applyLimits(goal);
        if (this.controls) {
          this.controls.enabled = true;
          this.controls.target.copy(goal.target);
          this.controls.update();
        }
      }
      return;
    }
    // follow: keep the player's offset while the target moves
    this.offset.subVectors(goal.target, this.lastTarget);
    this.camera.position.add(this.offset);
    this.lastTarget.copy(goal.target);
    this.applyLimits(goal);
    if (this.controls) {
      this.controls.target.copy(goal.target);
      this.controls.update();
    } else {
      this.camera.lookAt(goal.target);
    }
  }

  /** Distance from the camera to its target (tests, stats). */
  get distance(): number {
    return this.camera.position.distanceTo(this.lastTarget);
  }

  get target(): THREE.Vector3 {
    return this.lastTarget;
  }

  dispose(): void {
    this.controls?.dispose();
  }

  private place(target: THREE.Vector3, s: THREE.Spherical, syncControls = true): void {
    this.lastTarget.copy(target);
    this.offset.setFromSpherical(s);
    this.camera.position.copy(target).add(this.offset);
    this.camera.lookAt(target);
    if (this.controls && syncControls) {
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  private applyLimits(goal: CameraGoal): void {
    if (!this.controls) return;
    this.controls.minDistance = goal.minDistance;
    this.controls.maxDistance = goal.maxDistance;
  }

  /** The saved view of this mode when it was of the same target, else the goal's default. */
  private offsetFor(goal: CameraGoal): THREE.Spherical {
    const saved = this.saved[this.mode];
    if (saved && saved.key === goal.key) return saved.offset.clone();
    return new THREE.Spherical(goal.distance, goal.phi, goal.theta);
  }

  private currentOffset(out: THREE.Spherical): THREE.Spherical {
    this.offset.subVectors(this.camera.position, this.lastTarget);
    return out.setFromVector3(this.offset);
  }
}

/** Signed difference b − a wrapped to (−π, π]. */
export function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
