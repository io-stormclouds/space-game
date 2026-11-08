import { COLONY_A_ID, COLONY_B_ID, COLONY_C_ID, INITIAL_BODIES, PLANET_ID } from '../game/config/initial-world';
import { buildGoldbergGrid, tileWidth } from '../game/math/goldberg-grid';
import { BUILDABLE_KINDS } from '../game/models/structure.model';
import {
  ALL_MODELS,
  ModelSpec,
  ROCK_MODEL,
  SHIP_MODEL,
  STRUCTURE_MODELS,
  THEMES,
  baseLift,
  fitScale,
  modelUrl,
  packOf,
  partUrl,
  pickVariant,
  themeOf,
} from './model-registry';

/** Every building-sized spec of every theme: what the build bar places and the colony dressing. */
const buildingSpecs = (): ModelSpec[] =>
  Object.values(THEMES).flatMap((t) => [...Object.values(t.structures), ...Object.values(t.dressing).flat()]);

describe('model registry', () => {
  it('fits every building of every theme inside a planet tile and a moon tile', () => {
    for (const body of INITIAL_BODIES.filter((b) => b.surfaceGrid)) {
      const grid = buildGoldbergGrid(body.id, body.radius, body.surfaceGrid!.frequency);
      const w = tileWidth(grid);
      for (const spec of buildingSpecs()) {
        const s = fitScale(spec, w);
        const footprint = spec.footprint * s;
        expect(footprint, spec.file).toBeLessThan(w);
        expect(footprint, spec.file).toBeGreaterThan(w * 0.4);
        // never taller than half the body radius, so it reads as a building not a tower
        expect(spec.height * s, spec.file).toBeLessThan(body.radius / 2);
      }
    }
  });

  it('props and connectors stay small next to buildings', () => {
    for (const t of Object.values(THEMES)) {
      for (const spec of Object.values(t.props).flat()) expect(spec.fill, spec.file).toBeLessThanOrEqual(0.5);
      for (const spec of Object.values(t.links)) expect(spec.fill, spec.file).toBeLessThan(0.25);
    }
  });

  it('every theme has a model for every buildable kind and every dressing kind', () => {
    for (const t of Object.values(THEMES)) {
      for (const kind of BUILDABLE_KINDS) expect(t.structures[kind], `${t.id} ${kind}`).toBeDefined();
      for (const [kind, list] of Object.entries(t.dressing)) expect(list.length, `${t.id} ${kind}`).toBeGreaterThan(0);
    }
    // a structure the player builds looks like the same kind in the dressing
    for (const t of Object.values(THEMES)) for (const kind of BUILDABLE_KINDS) expect(t.dressing[kind]).toContain(t.structures[kind]);
  });

  it('themes: home planet stays KayKit, the colonies are KayKit / Kenney / mixed', () => {
    expect(themeOf(PLANET_ID).id).toBe('KAYKIT');
    expect(themeOf(PLANET_ID).structures).toBe(STRUCTURE_MODELS);
    expect([COLONY_A_ID, COLONY_B_ID, COLONY_C_ID].map((id) => themeOf(id).id)).toEqual(['KAYKIT', 'KENNEY', 'MIXED']);

    const packs = (id: 'KAYKIT' | 'KENNEY' | 'MIXED') => {
      const t = THEMES[id];
      const specs = [...buildingSpecs().filter((s) => Object.values(t.dressing).flat().includes(s)), ...Object.values(t.props).flat(), ...Object.values(t.links)];
      return new Set(specs.map(packOf));
    };
    expect([...packs('KAYKIT')]).toEqual(['kaykit']);
    expect([...packs('KENNEY')]).toEqual(['kenney']);
    expect(packs('MIXED')).toEqual(new Set(['kaykit', 'kenney']));
  });

  it('composites use a single pack (one material per instanced mesh)', () => {
    for (const spec of ALL_MODELS.filter((s) => s.parts)) {
      expect(new Set(spec.parts!.map((p) => p.pack)).size, spec.file).toBe(1);
    }
  });

  it('model ids are unique and the original specs are still listed', () => {
    const ids = ALL_MODELS.map((s) => s.file);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [...Object.values(STRUCTURE_MODELS), SHIP_MODEL, ROCK_MODEL]) expect(ALL_MODELS).toContain(s);
  });

  it('picks variants deterministically and returns null when a pack has nothing', () => {
    const v = ['a', 'b', 'c'];
    expect(pickVariant(v, 17, 2)).toBe(pickVariant(v, 17, 2));
    expect(new Set(Array.from({ length: 30 }, (_, i) => pickVariant(v, i))).size).toBe(3);
    expect(pickVariant([], 3)).toBeNull();
  });

  it('lifts models with a sunken pivot so their lowest point sits on the surface', () => {
    expect(baseLift({ ...STRUCTURE_MODELS.MINE, baseOffset: 0.87 }, 2)).toBeCloseTo(1.74, 6);
    expect(baseLift(SHIP_MODEL, 3)).toBe(0);
  });

  it('builds asset urls under the base path: KayKit .gltf, Kenney .glb', () => {
    expect(modelUrl('/assets/kaykit', SHIP_MODEL)).toBe('/assets/kaykit/dropship.gltf');
    expect(modelUrl('/assets/kaykit/', STRUCTURE_MODELS.MINE)).toBe('/assets/kaykit/drill_structure.gltf');
    expect(partUrl('/assets/kenney', { pack: 'kenney', file: 'hangar_roundB' })).toBe('/assets/kenney/hangar_roundB.glb');
  });
});
