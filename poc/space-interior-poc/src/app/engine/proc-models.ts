import { BoxGeometry, BufferAttribute, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ProcModelId } from '../domain/catalog/models';
import type { KitModel } from './kit-library';
import type { KitMaterialName } from './kit-materials';

/**
 * Models the kit lacks, built from boxes that sample the kit's own 8 × 8 gradient atlas, so they
 * use the five shared kit materials (cutaway, night glow and instancing work unchanged).
 * Their bounds and triangle counts are declared in domain/catalog/models.ts.
 */

/** A point of the atlas: swatch column and row, `t` = how far down the swatch's gradient (0 = lightest). */
const swatch = (col: number, row: number, t = 0.5): readonly [number, number] => [(col + 0.5) / 8, (row + t) / 8];

const STEEL = swatch(3, 7, 0.4);
const FRAME = swatch(5, 0, 0.55);
const DARK = swatch(7, 0, 0.5);
const GLOW: Record<string, readonly [number, number]> = {
  Blue: swatch(1, 6, 0.25),
  Green: swatch(5, 6, 0.25),
  Orange: swatch(1, 3, 0.4),
  White: swatch(0, 7, 0.15),
};

interface Part {
  readonly size: readonly [number, number, number];
  readonly at: readonly [number, number, number];
  readonly material: KitMaterialName;
  readonly uv: readonly [number, number];
  /** Rotation about X before moving into place (sloped rails). */
  readonly tilt?: number;
}

/** A bar of square section `t` from one point to another in the YZ plane at `x`. */
function bar(x: number, from: readonly [number, number], to: readonly [number, number], t: number, uv: readonly [number, number]): Part {
  const [y0, z0] = from;
  const [y1, z1] = to;
  const dy = y1 - y0;
  const dz = z1 - z0;
  return {
    size: [t, t, Math.hypot(dy, dz)],
    at: [x, (y0 + y1) / 2, (z0 + z1) / 2],
    tilt: Math.atan2(-dy, dz),
    material: 'Atlas Metallic',
    uv,
  };
}

/**
 * Stairs over one cell, rising one deck towards local −Z like the kit ramps: 16 solid steps of
 * 0.25 m (a steep ship's stair), a glowing strip on every nosing and a handrail each side that
 * runs on to the deck above.
 */
function stairsParts(glow: readonly [number, number]): Part[] {
  const steps = 16;
  const rise = 4 / steps;
  const run = 4 / steps;
  const half = 1.5;
  const parts: Part[] = [];
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise;
    const front = 2 - i * run;
    parts.push({ size: [2 * half, top, run], at: [0, top / 2, front - run / 2], material: 'Atlas Metallic', uv: STEEL });
    parts.push({ size: [2 * half - 0.2, 0.02, 0.05], at: [0, top + 0.01, front - 0.04], material: 'Atlas Emissive', uv: glow });
  }
  const rail = 0.9;
  for (const sx of [-1, 1]) {
    const x = sx * (half - 0.06);
    parts.push(bar(x, [rise + rail, 1.85], [4 + rail, -1.9], 0.06, FRAME));
    // Posts on the first, middle and last step.
    for (const [z, y] of [
      [1.85, rise],
      [-0.1, 9 * rise],
      [-1.9, 4],
    ] as const) {
      parts.push({ size: [0.05, rail, 0.05], at: [x, y + rail / 2, z], material: 'Atlas Metallic', uv: FRAME });
    }
  }
  return parts;
}

/**
 * Lift stop, one deck high: a platform with a glowing ring, four guide posts with light strips
 * and a top frame. Stops stacked in one cell read as one shaft; the walls round it are ordinary
 * edge pieces (glass and a door) placed by the lift planner.
 */
function liftParts(glow: readonly [number, number]): Part[] {
  const parts: Part[] = [
    { size: [3.56, 0.15, 3.56], at: [0, -0.065, 0], material: 'Atlas Metallic', uv: STEEL },
    { size: [2.4, 0.02, 2.4], at: [0, 0.02, 0], material: 'Atlas', uv: DARK },
    { size: [2.8, 0.02, 0.08], at: [0, 0.02, 1.4], material: 'Atlas Emissive', uv: glow },
    { size: [2.8, 0.02, 0.08], at: [0, 0.02, -1.4], material: 'Atlas Emissive', uv: glow },
    { size: [0.08, 0.02, 2.8], at: [1.4, 0.02, 0], material: 'Atlas Emissive', uv: glow },
    { size: [0.08, 0.02, 2.8], at: [-1.4, 0.02, 0], material: 'Atlas Emissive', uv: glow },
    { size: [3.28, 0.18, 0.16], at: [0, 3.89, 1.76], material: 'Atlas Metallic', uv: FRAME },
    { size: [3.28, 0.18, 0.16], at: [0, 3.89, -1.76], material: 'Atlas Metallic', uv: FRAME },
    { size: [0.16, 0.18, 3.28], at: [1.76, 3.89, 0], material: 'Atlas Metallic', uv: FRAME },
    { size: [0.16, 0.18, 3.28], at: [-1.76, 3.89, 0], material: 'Atlas Metallic', uv: FRAME },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ size: [0.24, 4, 0.24], at: [sx * 1.76, 2, sz * 1.76], material: 'Atlas Metallic', uv: FRAME });
      parts.push({ size: [0.05, 3.4, 0.05], at: [sx * 1.615, 2, sz * 1.615], material: 'Atlas Emissive', uv: glow });
    }
  }
  return parts;
}

function partsOf(id: ProcModelId): Part[] {
  const glow = GLOW[id.slice(id.lastIndexOf('_') + 1)] ?? GLOW['Blue'];
  return id.startsWith('Stairs_') ? stairsParts(glow) : liftParts(glow);
}

/** Flattens parts into one indexed geometry with one group per material (like a loaded kit model). */
export function buildProcModel(id: ProcModelId, material: (name: KitMaterialName) => Material): KitModel {
  const byMaterial = new Map<KitMaterialName, BufferGeometry[]>();
  for (const p of partsOf(id)) {
    const g = new BoxGeometry(...p.size);
    if (p.tilt) g.rotateX(p.tilt);
    g.translate(...p.at);
    const uv = new Float32Array(g.getAttribute('position').count * 2);
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] = p.uv[0];
      uv[i + 1] = p.uv[1];
    }
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    const list = byMaterial.get(p.material);
    if (list) list.push(g);
    else byMaterial.set(p.material, [g]);
  }
  const parts: BufferGeometry[] = [];
  const materials: Material[] = [];
  for (const [name, list] of byMaterial) {
    parts.push(mergeGeometries(list, false)!);
    materials.push(material(name));
    for (const g of list) g.dispose();
  }
  const geometry = mergeGeometries(parts, true)!;
  for (const g of parts) g.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { id, geometry, materials };
}
