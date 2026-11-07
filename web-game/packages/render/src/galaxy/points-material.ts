import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
import type { Rgba, Vec3 } from './galaxy-model';

// One shader for stars and markers: screen-space point sprites (size in CSS px, no attenuation)
// drawn as flat shapes, no glow (W14 C). Colours are sRGB and written as is, so the DS hex values
// reach the screen unchanged. Depth is off: layers are ordered by renderOrder, which keeps the
// map readable at any distance and makes depth precision irrelevant.

/** Shape codes understood by the fragment shader. */
export const SHAPE = { disc: 0, ring: 1, square: 2, diamond: 3, brackets: 4 } as const;
export type ShapeName = keyof typeof SHAPE;

const vertexShader = /* glsl */ `
attribute float size;
attribute float shape;
attribute vec4 tint;
uniform float pixelRatio;
varying vec4 vTint;
varying float vShape;
varying float vSize;
void main() {
  vTint = tint;
  vShape = shape;
  vSize = size * pixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = vSize;
}
`;

const fragmentShader = /* glsl */ `
uniform float pixelRatio;
varying vec4 vTint;
varying float vShape;
varying float vSize;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float px = 2.0 / max(vSize, 1.0);       // one device pixel in point coordinates
  float stroke = px * pixelRatio * 1.0;   // 1 CSS px line
  float a = 0.0;
  if (vShape < 0.5) {
    float r = length(p);
    a = 1.0 - smoothstep(1.0 - px * 1.5, 1.0, r);
  } else if (vShape < 1.5) {
    float r = length(p);
    float w = stroke * 1.5;
    a = (1.0 - smoothstep(1.0 - px, 1.0, r)) * smoothstep(1.0 - w - px, 1.0 - w, r);
  } else if (vShape < 2.5) {
    float m = max(abs(p.x), abs(p.y));
    a = step(1.0 - stroke, m);
  } else if (vShape < 3.5) {
    float m = abs(p.x) + abs(p.y);
    float w = stroke * 1.42;
    a = (1.0 - smoothstep(1.0 - px, 1.0, m)) * smoothstep(1.0 - w - px, 1.0 - w, m);
  } else {
    float m = max(abs(p.x), abs(p.y));
    float corner = step(0.5, abs(p.x)) * step(0.5, abs(p.y));
    a = step(1.0 - stroke, m) * corner;
  }
  a *= vTint.a;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vTint.rgb, a);
}
`;

export function createPointsMaterial(pixelRatio: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { pixelRatio: { value: pixelRatio } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

export interface PointSpec {
  position: Vec3;
  size: number;
  shape: ShapeName;
  color: Rgba;
}

/** Fixed-capacity point buffer; `write` refills it without reallocating. */
export class PointBuffer {
  readonly geometry = new BufferGeometry();
  readonly points: Points;
  private readonly pos: BufferAttribute;
  private readonly size: BufferAttribute;
  private readonly shape: BufferAttribute;
  private readonly tint: BufferAttribute;

  constructor(
    readonly capacity: number,
    material: ShaderMaterial,
  ) {
    this.pos = new BufferAttribute(new Float32Array(capacity * 3), 3);
    this.size = new BufferAttribute(new Float32Array(capacity), 1);
    this.shape = new BufferAttribute(new Float32Array(capacity), 1);
    this.tint = new BufferAttribute(new Float32Array(capacity * 4), 4);
    this.geometry.setAttribute('position', this.pos);
    this.geometry.setAttribute('size', this.size);
    this.geometry.setAttribute('shape', this.shape);
    this.geometry.setAttribute('tint', this.tint);
    this.geometry.setDrawRange(0, 0);
    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  write(specs: ReadonlyArray<PointSpec>): void {
    const n = Math.min(specs.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const s = specs[i]!;
      this.pos.setXYZ(i, s.position[0], s.position[1], s.position[2]);
      this.size.setX(i, s.size);
      this.shape.setX(i, SHAPE[s.shape]);
      this.tint.setXYZW(i, s.color.r, s.color.g, s.color.b, s.color.a);
    }
    for (const a of [this.pos, this.size, this.shape, this.tint]) a.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
