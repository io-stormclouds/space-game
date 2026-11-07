// Economy recipe levels (W08 A, Z2): A_NAD and A_KAT with reference solutions.
import { describe, expect, it } from 'vitest';
import {
  createAtanorSimulation,
  getReferenceSolution,
  listRecipeLevels,
  measureAtanorSolution,
  runAtanorSimulation,
  toAtanorSpec,
} from '../api';
import { validateMachine } from '../engine/building';
import { LEVEL_A_KAT, LEVEL_A_NAD } from '../engine/recipes';
import { isMaterialAtom } from '../graph/atom-types';

describe('Recipe A_NAD (Nadprzewodnik)', () => {
  it('reference solution delivers 6 NAD without a JAM', () => {
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_NAD));

    expect(snapshot.jam).toBeNull();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.delivered).toBe(6);
    expect(snapshot.produced).toEqual({ NAD: 6 });
  });

  it('reference solution: 12 cycles per product, 2 arms, area 12, recipe inputs per product', () => {
    const metrics = measureAtanorSolution(LEVEL_A_NAD);

    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(12);
    expect(metrics.firstOutputTick).toBe(9);
    expect(metrics.arms).toBe(2);
    expect(metrics.area).toBe(12);
    expect(metrics.inputsPerOutput).toEqual(LEVEL_A_NAD.recipe?.inputs);
    expect(toAtanorSpec(1, metrics)).toEqual({ level: 1, cycles: 12, area: 12, arms: 2 });
  });

  it('builds the Y molecule: PLA bonded to MIE, MIE and H2', () => {
    const sim = createAtanorSimulation(LEVEL_A_NAD);
    for (let i = 0; i < 8; i++) sim.step();
    const snapshot = sim.getSnapshot();
    const molecule = snapshot.molecules.find(m => m.atomIds.length === 4);
    expect(molecule?.bondIds.length).toBe(3);
    const elements = molecule?.atomIds.map(id => snapshot.atoms.find(a => a.id === id)?.element).sort();
    expect(elements).toEqual(['H2', 'MIE', 'MIE', 'PLA']);
  });
});

describe('Recipe A_KAT (Katalizator)', () => {
  it('reference solution transmutes PLA into PLA* and delivers 6 KAT', () => {
    const sim = createAtanorSimulation(LEVEL_A_KAT);
    sim.step();
    sim.step(); // PLA rests on the transmutation glyph
    expect(sim.getSnapshot().atoms.some(a => a.element === 'PLA*')).toBe(true);

    const snapshot = runAtanorSimulation(sim);
    expect(snapshot.jam).toBeNull();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.produced).toEqual({ KAT: 6 });
  });

  it('reference solution: 6 cycles per product, 2 arms, area 8, recipe inputs per product', () => {
    const metrics = measureAtanorSolution(LEVEL_A_KAT);

    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(6);
    expect(metrics.arms).toBe(2);
    expect(metrics.area).toBe(8);
    expect(metrics.inputsPerOutput).toEqual(LEVEL_A_KAT.recipe?.inputs);
  });

  it('the output does not accept PLA-KRZ without transmutation', () => {
    const reference = getReferenceSolution(LEVEL_A_KAT);
    const solution = { ...reference, glyphs: reference.glyphs.filter(g => g.type !== 'TRANSMUTE') };
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_KAT, { solution }), 50);

    expect(snapshot.delivered).toBe(0);
    expect(snapshot.produced).toEqual({});
    expect(measureAtanorSolution(LEVEL_A_KAT, solution).ok).toBe(false);
  });
});

describe('Recipe levels', () => {
  it('use economy material atoms only and credit the recipe output', () => {
    for (const level of listRecipeLevels()) {
      expect(level.kind).toBe('recipe');
      for (const glyph of level.glyphs) {
        if (glyph.type === 'INPUT') expect(isMaterialAtom(glyph.element)).toBe(true);
        if (glyph.type === 'OUTPUT') {
          expect(glyph.targetPattern.elements.every(isMaterialAtom)).toBe(true);
          expect({ [glyph.product?.material ?? '?']: glyph.product?.quantity }).toEqual(level.recipe?.outputs);
        }
      }
    }
  });

  it('reference solutions fit the building level of their recipe', () => {
    for (const level of listRecipeLevels()) {
      const buildingLevel = level.recipe?.buildingLevel ?? 0;
      expect(validateMachine(level, getReferenceSolution(level), buildingLevel)).toEqual([]);
    }
    const codes = validateMachine(LEVEL_A_KAT, getReferenceSolution(LEVEL_A_KAT), 1).map(i => i.code);
    expect(codes).toContain('RECIPE_LOCKED');
    expect(codes).toContain('GLYPH_LOCKED');
  });
});
