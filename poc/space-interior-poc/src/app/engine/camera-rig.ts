import { MOUSE, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const STEP = Math.PI / 4;
/** Angle normalised to (−π, π]. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Editor camera: orbit around a target on the active deck.
 * Left button belongs to the tools; middle = rotate, right = pan, wheel = zoom to cursor.
 * Without a middle button: Alt + left drag or Shift + right drag rotates.
 * Q / E turn the view in 45° steps (Sims-style), with a short ease; the compass turns it freely.
 *
 * Heading: azimuth of the camera around the target, 0 = looking towards −Z ("north" up on screen),
 * growing clockwise as seen from above.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(38, 1, 0.1, 1200);
  readonly controls: OrbitControls;
  private turn: { from: number; to: number; t: number } | null = null;
  private move: { from: Vector3; to: Vector3; t: number } | null = null;

  /** Runs before OrbitControls' own listener: Alt makes the left button orbit for this gesture. */
  private readonly onDownCapture = (e: PointerEvent) => {
    this.controls.mouseButtons.LEFT = (e.altKey ? MOUSE.ROTATE : -1) as MOUSE;
  };

  constructor(private readonly dom: HTMLElement) {
    this.camera.position.set(-6, 46, 52);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.set(22, 0, 10);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.14;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 240;
    this.controls.maxPolarAngle = 1.48;
    this.controls.mouseButtons = { LEFT: -1 as MOUSE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    this.controls.keyPanSpeed = 24;
    this.controls.update();
    dom.addEventListener('pointerdown', this.onDownCapture, { capture: true });
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  /** Current heading in radians (−π…π]. */
  get heading(): number {
    const o = this.camera.position.clone().sub(this.controls.target);
    return Math.atan2(o.x, o.z);
  }

  get topDown(): boolean {
    return this.controls.getPolarAngle() < 0.2;
  }

  /** 45° step left (−) or right (+), landing on the 45° grid. Presses during a turn add up. */
  turnBy(deg: number): void {
    const base = this.turn ? this.turn.to : this.heading;
    this.turnTo(Math.round((base + STEP * Math.sign(deg)) / STEP) * STEP);
  }

  /** Eased turn to an absolute heading, the short way round. */
  turnTo(heading: number): void {
    const from = this.heading;
    this.turn = { from, to: from + wrap(heading - from), t: 0 };
  }

  /** Immediate rotation by an angle (compass drag). Cancels an eased turn. */
  orbitBy(rad: number): void {
    this.turn = null;
    this.setHeading(this.heading + rad);
  }

  toggleTopDown(): void {
    this.setPolar(this.topDown ? 0.95 : 0.001);
  }

  setPolar(phi: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(off);
    s.phi = phi;
    this.camera.position.copy(this.controls.target).add(new Vector3().setFromSpherical(s));
    this.controls.update();
  }

  /** Glides the target (and camera with it) to a point. */
  focus(x: number, y: number, z: number, distance?: number): void {
    this.move = { from: this.controls.target.clone(), to: new Vector3(x, y, z), t: 0 };
    if (distance) {
      const off = this.camera.position.clone().sub(this.controls.target).setLength(distance);
      this.camera.position.copy(this.controls.target).add(off);
    }
  }

  setTargetHeight(y: number): void {
    const dy = y - this.controls.target.y;
    this.controls.target.y += dy;
    this.camera.position.y += dy;
  }

  update(dt: number): void {
    if (this.turn) {
      this.turn.t = Math.min(1, this.turn.t + dt / 0.22);
      const k = 1 - Math.pow(1 - this.turn.t, 3);
      this.setHeading(this.turn.from + (this.turn.to - this.turn.from) * k);
      if (this.turn.t >= 1) this.turn = null;
    }
    if (this.move) {
      this.move.t = Math.min(1, this.move.t + dt / 0.35);
      const k = 1 - Math.pow(1 - this.move.t, 3);
      const next = this.move.from.clone().lerp(this.move.to, k);
      const delta = next.clone().sub(this.controls.target);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      if (this.move.t >= 1) this.move = null;
    }
    this.controls.update();
  }

  /** Horizontal view direction (camera → target), normalised. */
  forwardXZ(): { x: number; z: number } {
    const dx = this.controls.target.x - this.camera.position.x;
    const dz = this.controls.target.z - this.camera.position.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onDownCapture, { capture: true });
    this.controls.dispose();
  }

  private setHeading(theta: number): void {
    const s = new Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    s.theta = theta;
    this.camera.position.copy(this.controls.target).add(new Vector3().setFromSpherical(s));
  }
}
