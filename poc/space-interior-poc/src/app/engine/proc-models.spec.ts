import { MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { PROC_MODELS, type ProcModelId } from '../domain/catalog/models';
import { buildProcModel } from './proc-models';

describe('built models', () => {
  it('match the bounds and triangle counts the domain declares for them', () => {
    for (const id of Object.keys(PROC_MODELS) as ProcModelId[]) {
      const info = PROC_MODELS[id];
      const model = buildProcModel(id, () => new MeshBasicMaterial());
      const box = model.geometry.boundingBox!;
      expect(box.min.toArray().map((v) => +v.toFixed(3)), id).toEqual([...info.min]);
      expect(box.max.toArray().map((v) => +v.toFixed(3)), id).toEqual([...info.max]);
      expect(model.geometry.index!.count / 3, id).toBe(info.tris);
      expect(model.materials).toHaveLength(info.materials.length);
      // Every vertex samples the atlas inside it.
      const uv = model.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThan(0);
        expect(uv.getY(i)).toBeLessThan(1);
      }
    }
  });
});
