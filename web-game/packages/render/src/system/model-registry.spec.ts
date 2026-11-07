import { INITIAL_BODIES, TAU_CETI_BODIES, buildGoldbergGrid, tileWidth } from '@space-game/domain';
import {
  ALL_MODEL_IDS,
  DEFAULT_PARTS,
  KIND_MODELS,
  MODELS,
  baseLift,
  fitScale,
  footprintSpan,
  modelDir,
  modelUrl,
  modelsForKind,
  partsForKind,
} from './model-registry';

describe('model registry (PoC model-registry.spec, catalog kinds)', () => {
  it('maps catalog kinds to KayKit models', () => {
    const first = (k: string) => partsForKind(k)[0]!.model;
    for (const k of ['MIN', 'ICE', 'SIT', 'REGX']) expect(first(k), k).toBe('drill_structure');
    expect(first('SOL')).toBe('solarpanel');
    expect(first('WND')).toBe('windturbine_tall');
    expect(first('HAB')).toBe('basemodule_A');
    expect(first('DEP')).toBe('cargodepot_A');
    expect(first('SKL')).toBe('cargodepot_A');
    expect(first('TNK')).toBe('water_storage');
    expect(first('LAND')).toBe('landingpad_small');
    expect(modelsForKind('HQ')).toEqual(['structure_tall', 'landingpad_small']);
    for (const k of ['SMT', 'CON', 'SIR', 'LST', 'ATN', 'unknown-kind']) expect(partsForKind(k), k).toBe(DEFAULT_PARTS);
  });

  it('HQ puts the tower on the anchor and the pad on the other two port tiles', () => {
    expect(KIND_MODELS['HQ']).toEqual([
      { model: 'structure_tall', at: [0] },
      { model: 'landingpad_small', at: [1, 2] },
    ]);
  });

  it('every mapped model exists in the registry', () => {
    for (const parts of Object.values(KIND_MODELS)) for (const p of parts) expect(ALL_MODEL_IDS).toContain(p.model);
    expect(ALL_MODEL_IDS).toHaveLength(14);
  });

  it('fits every structure inside its tile on every gridded body of both scenarios', () => {
    for (const body of [...INITIAL_BODIES, ...TAU_CETI_BODIES].filter((b) => b.surfaceGrid)) {
      const grid = buildGoldbergGrid(body.id, body.radius, body.surfaceGrid!.frequency);
      const w = tileWidth(grid);
      for (const id of new Set(Object.values(KIND_MODELS).flatMap((p) => p.map((x) => x.model)))) {
        const spec = MODELS[id];
        const s = fitScale(spec, w);
        expect(spec.footprint * s, `${body.id} ${id}`).toBeLessThan(w);
        expect(spec.footprint * s, `${body.id} ${id}`).toBeGreaterThan(w * 0.5);
        // a building, not a tower: never taller than half the body radius
        expect(spec.height * s, `${body.id} ${id}`).toBeLessThan(body.radius / 2);
      }
    }
  });

  it('scales larger footprints up: 1 < 3 < 7 tiles', () => {
    expect(footprintSpan(1)).toBe(1);
    expect(footprintSpan(3)).toBeGreaterThan(footprintSpan(1));
    expect(footprintSpan(7)).toBeGreaterThan(footprintSpan(3));
    // a 7-tile footprint (flower) is about 3 tiles across; its model must stay inside
    expect(footprintSpan(7)).toBeLessThan(3);
  });

  it('lifts models with a sunken pivot so their lowest point sits on the surface', () => {
    expect(baseLift({ ...MODELS.drill_structure, baseOffset: 0.87 }, 2)).toBeCloseTo(1.74, 6);
    expect(baseLift(MODELS.dropship, 3)).toBe(0);
  });

  it('builds asset urls under the app assets base', () => {
    expect(modelUrl('assets/', 'dropship')).toBe('assets/kaykit/dropship.gltf');
    expect(modelUrl('/assets', 'drill_structure')).toBe('/assets/kaykit/drill_structure.gltf');
    expect(modelUrl('', 'rock_A')).toBe('kaykit/rock_A.gltf');
    expect(modelDir('assets/')).toBe('assets/kaykit/');
  });
});
