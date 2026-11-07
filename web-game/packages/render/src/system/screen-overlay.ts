import * as THREE from 'three';
import { LineBuffer } from './buffers';

/** Writable list of numbers (a scratch Float32Array per frame, or an array in tests). */
type Out = { [i: number]: number; length: number };

/**
 * Corner brackets around a square of half-size `half` centred on (x, y), in pixels: 4 corners ×
 * 2 arms = 8 segments as x0,y0,x1,y1 quadruples written into `out` from `o`; returns o + 32.
 * Pure; tested.
 */
export function writeBracket(out: Out, o: number, x: number, y: number, half: number, arm = Math.max(4, half * 0.4)): number {
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      const cx = x + sx * half;
      const cy = y + sy * half;
      out[o++] = cx; out[o++] = cy; out[o++] = cx - sx * arm; out[o++] = cy;
      out[o++] = cx; out[o++] = cy; out[o++] = cx; out[o++] = cy - sy * arm;
    }
  }
  return o;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Diamond marker (4 segments) of radius r around (x, y); returns o + 16. */
export function writeDiamond(out: Out, o: number, x: number, y: number, r: number): number {
  // corners top, right, bottom, left
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    out[o++] = x + DX[k]! * r; out[o++] = y + DY[k]! * r;
    out[o++] = x + DX[j]! * r; out[o++] = y + DY[j]! * r;
  }
  return o;
}

/** Screen position of a world point. `visible` is false behind the camera. */
export interface ScreenPoint {
  x: number;
  y: number;
  /** Distance from the camera [world units]. */
  depth: number;
  visible: boolean;
}

export function projectPoint(p: THREE.Vector3, camera: THREE.PerspectiveCamera, width: number, height: number, tmp: THREE.Vector3, out: ScreenPoint): ScreenPoint {
  out.depth = p.distanceTo(camera.position);
  tmp.copy(p).project(camera);
  out.visible = tmp.z > -1 && tmp.z < 1;
  out.x = ((tmp.x + 1) / 2) * width;
  out.y = ((1 - tmp.y) / 2) * height;
  return out;
}

/** Apparent radius in pixels of a sphere of `radius` at `depth` (perspective camera). */
export function pixelRadius(radius: number, depth: number, camera: THREE.PerspectiveCamera, height: number): number {
  const t = Math.tan((camera.fov * Math.PI) / 360);
  return depth > 1e-6 ? (radius / (depth * t)) * (height / 2) : Infinity;
}

/**
 * Distance along a ray to where it crosses the ring [inner, outer] around `centre` in the plane
 * y = centre.y, or null. Used to pick a belt without testing every rock.
 */
export function ringHit(ray: THREE.Ray, centre: THREE.Vector3, inner: number, outer: number): number | null {
  const dy = ray.direction.y;
  if (Math.abs(dy) < 1e-9) return null;
  const t = (centre.y - ray.origin.y) / dy;
  if (t <= 0) return null;
  const x = ray.origin.x + ray.direction.x * t - centre.x;
  const z = ray.origin.z + ray.direction.z * t - centre.z;
  const r = Math.hypot(x, z);
  return r >= inner && r <= outer ? t : null;
}

/**
 * Pixel-space vector layer drawn after the scene with an orthographic camera (y down, origin
 * top-left): selection brackets, hover brackets and unit markers. One LineSegments, one draw call.
 */
export class ScreenOverlay {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private readonly material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false });
  private readonly buffer = new LineBuffer(this.material, 512, true, 'ScreenOverlay');
  private n = 0;
  private readonly color = new THREE.Color();
  private readonly scratch = new Float32Array(32);

  constructor() {
    this.scene.add(this.buffer.lines);
  }

  resize(width: number, height: number): void {
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
  }

  begin(): void {
    this.n = 0;
  }

  bracket(x: number, y: number, half: number, hex: number): void {
    this.segments(this.scratch, writeBracket(this.scratch, 0, x, y, half), hex);
  }

  diamond(x: number, y: number, r: number, hex: number): void {
    this.segments(this.scratch, writeDiamond(this.scratch, 0, x, y, r), hex);
  }

  /** The first `length` numbers of `xy` as x0,y0,x1,y1 segment quadruples in pixels. */
  segments(xy: Out, length: number, hex: number): void {
    const verts = length / 2;
    this.buffer.ensure(this.n + verts, true);
    this.color.setHex(hex);
    const p = this.buffer.positions;
    const c = this.buffer.colors!;
    for (let i = 0; i < length; i += 2) {
      const o = this.n * 3;
      p[o] = xy[i]!;
      p[o + 1] = -xy[i + 1]!;
      p[o + 2] = 0;
      c[o] = this.color.r;
      c[o + 1] = this.color.g;
      c[o + 2] = this.color.b;
      this.n++;
    }
  }

  end(): void {
    this.buffer.commit(this.n);
  }

  get empty(): boolean {
    return this.n === 0;
  }

  get vertexCount(): number {
    return this.n;
  }

  dispose(): void {
    this.buffer.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
