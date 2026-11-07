/** Lightweight vector type for the game layer. No Three.js dependency. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  return set(out, a.x, a.y, a.z);
}

export function clone(a: Vec3): Vec3 {
  return vec3(a.x, a.y, a.z);
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  return set(out, a.x + b.x, a.y + b.y, a.z + b.z);
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  return set(out, a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  return set(out, a.x * s, a.y * s, a.z * s);
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function normalize(out: Vec3, a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-12 ? scale(out, a, 1 / l) : set(out, 0, 0, 1);
}

export function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  return set(out, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}
