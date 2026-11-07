import { INITIAL_BODIES } from '../game/config/initial-world';
import { buildGoldbergGrid, tileWidth } from '../game/math/goldberg-grid';
import { ALL_MODELS, SHIP_MODEL, STRUCTURE_MODELS, baseLift, fitScale, modelUrl } from './model-registry';

describe('model registry', () => {
  it('fits every structure inside a planet tile and a moon tile', () => {
    for (const body of INITIAL_BODIES.filter((b) => b.surfaceGrid)) {
      const grid = buildGoldbergGrid(body.id, body.radius, body.surfaceGrid!.frequency);
      const w = tileWidth(grid);
      for (const spec of Object.values(STRUCTURE_MODELS)) {
        const s = fitScale(spec, w);
        const footprint = spec.footprint * s;
        expect(footprint, spec.file).toBeLessThan(w);
        expect(footprint, spec.file).toBeGreaterThan(w * 0.5);
        // never taller than half the body radius, so it reads as a building not a tower
        expect(spec.height * s, spec.file).toBeLessThan(body.radius / 2);
      }
    }
    expect(ALL_MODELS.length).toBe(Object.keys(STRUCTURE_MODELS).length + 3);
  });

  it('lifts models with a sunken pivot so their lowest point sits on the surface', () => {
    expect(baseLift({ ...STRUCTURE_MODELS.MINE, baseOffset: 0.87 }, 2)).toBeCloseTo(1.74, 6);
    expect(baseLift(SHIP_MODEL, 3)).toBe(0);
  });

  it('builds asset urls under the base path', () => {
    expect(modelUrl('/assets/kaykit', SHIP_MODEL)).toBe('/assets/kaykit/dropship.gltf');
    expect(modelUrl('/assets/kaykit/', STRUCTURE_MODELS.MINE)).toBe('/assets/kaykit/drill_structure.gltf');
  });
});
