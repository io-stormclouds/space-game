import { INITIAL_BODIES, Rules, TAU_CETI_BODIES, buildGoldbergGrid, tileWidth } from '@space-game/domain';
import {
  ALL_MODEL_IDS,
  BELT_MODELS,
  DEFAULT_PARTS,
  DEPOSIT_MODEL,
  KIND_TIERS,
  MODELS,
  ROVER_MODEL,
  SHIP_MODEL,
  baseLift,
  fitScale,
  footprintSpan,
  levelTier,
  modelDir,
  modelUrl,
  modelsForKind,
  partsFor,
  partsForKind,
  type ModelPart,
} from './model-registry';

const rules = new Rules();
/** The 18 kinds the player can build (era ≤ PLAYABLE_ERA, on the surface, not the port). */
const BUILDABLE = rules.buildableKinds();
const LEVELS = [1, 3, 5];
const models = (parts: ReadonlyArray<ModelPart>) => parts.map((p) => p.model);

describe('model registry (PoC model-registry.spec, catalog kinds, level tiers)', () => {
  it('splits levels into three look tiers: L1–2, L3–4, L5 (T-21); a site at L0 looks like L1', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(levelTier)).toEqual([1, 1, 1, 2, 2, 3, 3]);
    for (const k of [...BUILDABLE, 'HQ', 'ATN']) {
      expect(partsFor(k, 0), k).toBe(partsFor(k, 1));
      expect(partsFor(k, 2), k).toBe(partsFor(k, 1));
      expect(partsFor(k, 4), k).toBe(partsFor(k, 3));
      expect(partsForKind(k), k).toBe(partsFor(k, 1));
    }
  });

  it('gives each of the 18 buildable kinds and the port its own parts at L1, L3 and L5, never the fallback', () => {
    expect([...BUILDABLE].sort()).toEqual(['CON', 'DEP', 'FARM', 'GAR', 'HAB', 'ICE', 'LAND', 'LST', 'MIN', 'MLT', 'REGX', 'SIR', 'SIT', 'SKL', 'SMT', 'SOL', 'TNK', 'WND']);
    for (const k of [...BUILDABLE, 'HQ']) {
      expect(KIND_TIERS[k], k).toBeDefined();
      const size = rules.spec(k).footprint;
      for (const level of LEVELS) {
        const parts = partsFor(k, level);
        expect(parts.length, `${k} L${level}`).toBeGreaterThan(0);
        expect(parts, `${k} L${level}`).not.toBe(DEFAULT_PARTS);
        expect(models(parts), `${k} L${level}: structure_tall as a stand-in`).not.toEqual(['structure_tall']);
        for (const p of parts) {
          expect(MODELS[p.model], `${k} L${level} ${p.model}`).toBeDefined();
          for (const i of p.at ?? []) expect(i, `${k} L${level} ${p.model} at`).toBeLessThan(size);
        }
      }
    }
  });

  it('upgrades change the look where the plan says so (§8.1)', () => {
    const changesAtL3 = ['HQ', 'LAND', 'HAB', 'FARM', 'DEP', 'SKL', 'MLT', 'SOL', 'WND', 'MIN', 'ICE', 'SIT'];
    const changesAtL5 = ['HQ', 'HAB', 'FARM', 'DEP', 'SKL', 'SMT', 'SIR'];
    for (const k of changesAtL3) expect(partsFor(k, 3), k).not.toEqual(partsFor(k, 1));
    for (const k of changesAtL5) expect(partsFor(k, 5), k).not.toEqual(partsFor(k, 3));
    // the plan's "same at every level" kinds keep one look
    for (const k of ['GAR', 'TNK', 'REGX', 'CON', 'LST']) expect(new Set(LEVELS.map((l) => partsFor(k, l))).size, k).toBe(1);
    // examples of the mapping
    expect(models(partsFor('HAB', 1))).toEqual(['basemodule_A']);
    expect(models(partsFor('HAB', 3))).toEqual(['basemodule_B']);
    expect(models(partsFor('DEP', 5))).toEqual(['cargodepot_C']);
    expect(models(partsFor('FARM', 5))).toEqual(['space_farm_large_sprinkler']);
    expect(models(partsFor('WND', 1))).toEqual(['windturbine_low']);
    expect(models(partsFor('WND', 3))).toEqual(['windturbine_tall']);
    expect(models(partsFor('MIN', 3))).toEqual(['terrain_mining', 'drill_structure']);
    expect(models(partsFor('LAND', 3))).toEqual(['landingpad_large', 'lights', 'lights']);
  });

  it('HQ puts the tower on the anchor and the pad on the other two port tiles; L5 a domed module and the large pad', () => {
    expect(partsFor('HQ', 1)).toEqual([
      { model: 'structure_tall', at: [0] },
      { model: 'landingpad_small', at: [1, 2] },
    ]);
    expect(partsFor('HQ', 5).slice(0, 2)).toEqual([
      { model: 'basemodule_E', at: [0] },
      { model: 'landingpad_large', at: [1, 2] },
    ]);
    expect(models(partsFor('HQ', 3))).toEqual(['structure_tall', 'landingpad_small', 'lights', 'lights']);
  });

  it('preloads the models of every tier', () => {
    expect(modelsForKind('HAB')).toEqual(['basemodule_A', 'basemodule_B', 'basemodule_E']);
    expect(modelsForKind('HQ')).toEqual(['structure_tall', 'landingpad_small', 'lights', 'basemodule_E', 'landingpad_large']);
    expect(modelsForKind('unknown-kind')).toEqual(['structure_low']);
    for (const k of [...BUILDABLE, 'HQ']) {
      for (const level of LEVELS) for (const p of partsFor(k, level)) expect(modelsForKind(k), k).toContain(p.model);
    }
  });

  it('preset kinds: the Atanor factory is a complex on its flower of 7; other kinds stand on a low structure', () => {
    const atn = partsFor('ATN', 1);
    expect(atn[0]).toEqual({ model: 'basemodule_E', at: [0] });
    // a hall on every ring tile and a tunnel from the centre to it
    for (let k = 1; k <= 6; k++) {
      expect(atn.some((p) => p.at?.length === 1 && p.at[0] === k), `ring ${k}`).toBe(true);
      expect(atn.some((p) => p.model === 'tunnel_straight_B' && p.at?.join() === `0,${k}`), `tunnel ${k}`).toBe(true);
    }
    expect(models(partsFor('GAS', 1))).toEqual(['eco_module']);
    for (const k of ['FIS', 'ELY', 'ASM', 'CRY', 'unknown-kind']) expect(partsFor(k, 3), k).toBe(DEFAULT_PARTS);
    expect(models(DEFAULT_PARTS)).toEqual(['structure_low']);
  });

  it('every registry model has a use: a structure part, the ship, the rover, deposits or belts', () => {
    const used = new Set<string>([SHIP_MODEL, ROVER_MODEL, DEPOSIT_MODEL, ...BELT_MODELS, ...models(DEFAULT_PARTS)]);
    for (const tiers of Object.values(KIND_TIERS)) for (const parts of tiers) for (const p of parts) used.add(p.model);
    expect([...used].sort()).toEqual([...ALL_MODEL_IDS].sort());
    expect(ALL_MODEL_IDS).toHaveLength(36);
  });

  it('sinks the mining pit until its top is flush with the surface and puts the LST crate on the lander frame', () => {
    const pit = partsFor('REGX', 1).find((p) => p.model === 'terrain_mining')!;
    const spec = MODELS.terrain_mining;
    const s = fitScale(spec, 1, pit.fill);
    // the lowest point (authored y = −baseOffset) on the surface: the top face (authored y = 1) is
    // (1 + baseOffset)·s above it, then the part's offset (frame widths; the frame is 1 wide here)
    const top = (1 + spec.baseOffset) * s + pit.offset!.y!;
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(0.03);
    const [lander, crate] = partsFor('LST', 1);
    expect(lander!.model).toBe('lander_base');
    expect(crate!.offset!.y).toBeCloseTo(MODELS.lander_base.height * fitScale(MODELS.lander_base, 1), 6);
  });

  it('fits every part inside its frame on every gridded body of both scenarios', () => {
    const kinds = Object.keys(KIND_TIERS);
    for (const body of [...INITIAL_BODIES, ...TAU_CETI_BODIES].filter((b) => b.surfaceGrid)) {
      const grid = buildGoldbergGrid(body.id, body.radius, body.surfaceGrid!.frequency);
      const w = tileWidth(grid);
      for (const k of kinds) {
        const size = rules.has(k) ? rules.spec(k).footprint : 1;
        for (const level of LEVELS) {
          let widest = 0;
          for (const p of partsFor(k, level)) {
            const span = footprintSpan(p.at ? p.at.length : size) * w;
            const spec = MODELS[p.model];
            const s = fitScale(spec, span, p.fill);
            const where = `${body.id} ${k} L${level} ${p.model}`;
            expect(spec.footprint * s, where).toBeLessThan(span);
            // a building, not a tower: never taller than half the body radius
            expect(spec.height * s, where).toBeLessThan(body.radius / 2);
            widest = Math.max(widest, spec.footprint * s);
          }
          // the main part fills a good share of a tile (two tanks side by side: half each)
          expect(widest, `${body.id} ${k} L${level}`).toBeGreaterThanOrEqual(w * 0.5 - 1e-9);
        }
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
    // a tunnel floats 0.2 above its pivot: lowered onto the surface
    expect(baseLift(MODELS.tunnel_straight_B, 1)).toBeCloseTo(-0.2, 6);
  });

  it('a part may override the fill of its model', () => {
    expect(fitScale(MODELS.lights, 2)).toBeCloseTo((2 * MODELS.lights.fill) / MODELS.lights.footprint, 9);
    expect(fitScale(MODELS.lights, 2, 0.2)).toBeCloseTo(0.4 / MODELS.lights.footprint, 9);
  });

  it('builds asset urls under the app assets base', () => {
    expect(modelUrl('assets/', 'dropship')).toBe('assets/kaykit/dropship.gltf');
    expect(modelUrl('/assets', 'drill_structure')).toBe('/assets/kaykit/drill_structure.gltf');
    expect(modelUrl('', 'rock_A')).toBe('kaykit/rock_A.gltf');
    expect(modelDir('assets/')).toBe('assets/kaykit/');
  });
});
