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

  attach(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): void {
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 6000;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.enablePan = false;
    this.camera = camera;
  }

  /** Keeps the camera's offset relative to the focus point as that point moves. */
  follow(target: THREE.Vector3): void {
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

  /** On the next frame, puts the camera at focus + offset (then it follows as usual). */
  viewFrom(offset: THREE.Vector3): void {
    this.pendingOffset = offset.clone();
  }

  detach(): void {
    this.controls?.dispose();
    this.initialised = false;
  }

  private camera!: THREE.PerspectiveCamera;
}
