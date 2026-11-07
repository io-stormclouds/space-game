// Game-facing API: level lists, simulations of a level + player solution, snapshots, machine rules.
import { describe, expect, it } from 'vitest';
import {
  composeLevel,
  createAtanorSimulation,
  emptySolution,
  findRecipeLevel,
  getAtanorLevel,
  getLevelPorts,
  getReferenceSolution,
  listAtanorLevels,
  listRecipeLevels,
} from '../api';
import { createArm } from '../engine/arm';
import { machineMaterials, validateMachine } from '../engine/building';
import { createInputGlyph } from '../engine/glyph';
import { LEVEL_2_WATER, LEVEL_4_TRACK, POC_LEVELS } from '../engine/levels';
import { LEVEL_A_KAT, LEVEL_A_NAD, LEVEL_A_PRO } from '../engine/recipes';

describe('Atanor API', () => {
  it('lists the 4 PoC levels and the recipe levels', () => {
    expect(listAtanorLevels('poc')).toEqual(POC_LEVELS);
    expect(POC_LEVELS.map(l => l.kind)).toEqual(['poc', 'poc', 'poc', 'poc']);
    expect(listRecipeLevels().map(l => l.recipe?.recipeId)).toEqual(['A_NAD', 'A_KAT', 'A_MET', 'A_KAP', 'A_PRO']);
    expect(listAtanorLevels()).toHaveLength(9);
    expect(findRecipeLevel('A_KAT')).toBe(LEVEL_A_KAT);
    expect(findRecipeLevel('A_PRO')).toBe(LEVEL_A_PRO);
    expect(findRecipeLevel('A_XYZ')).toBeUndefined();
    expect(getAtanorLevel('level-2-salt-water')).toBe(LEVEL_2_WATER);
  });

  it('simulates the level ports alone when nothing is built', () => {
    const sim = createAtanorSimulation(LEVEL_A_NAD, { solution: emptySolution() });
    for (let i = 0; i < 3; i++) sim.step();
    const snapshot = sim.getSnapshot();

    expect(snapshot.arms).toEqual([]);
    expect(snapshot.atoms.map(a => a.element).sort()).toEqual(['H2', 'MIE', 'PLA']);
    expect(snapshot.molecules).toHaveLength(3);
    expect(snapshot.ticks).toBe(3);
    expect(snapshot.jam).toBeNull();
  });

  it('snapshot exposes molecules, deliveries and economy counters', () => {
    const sim = createAtanorSimulation(LEVEL_A_NAD);
    for (let i = 0; i < 9; i++) sim.step();
    const snapshot = sim.getSnapshot();

    expect(snapshot.levelId).toBe('recipe-a-nad');
    expect(snapshot.delivered).toBe(1);
    expect(snapshot.target).toBe(6);
    expect(snapshot.completed).toBe(false);
    expect(snapshot.produced).toEqual({ NAD: 1 });
    expect(snapshot.consumed).toEqual({ PLA: 2, MIE: 3, H2: 20 });
    expect(snapshot.supply).toBeNull();
    expect(snapshot.arms.map(a => a.id)).toEqual(['arm-1', 'arm-2']);
    expect(snapshot.molecules.every(m => m.atomIds.length === 1)).toBe(true);
  });

  it('runs a player solution and does not mutate the level', () => {
    const solution = getReferenceSolution(LEVEL_A_NAD);
    solution.program['arm-2'] = []; // arm-2 idle: nothing is ever delivered
    const sim = createAtanorSimulation(LEVEL_A_NAD, { solution });
    for (let i = 0; i < 20; i++) sim.step();

    expect(sim.productsDelivered).toBe(0);
    expect(LEVEL_A_NAD.defaultInstructions['arm-2']).toHaveLength(13);
  });

  it('composeLevel keeps the level ports and ignores ports in the solution', () => {
    const solution = { ...emptySolution(), glyphs: [createInputGlyph('cheat', { q: 1, r: 1 }, 'PLA')] };
    const composed = composeLevel(LEVEL_A_NAD, solution);

    expect(composed.glyphs.map(g => g.id)).toEqual(getLevelPorts(LEVEL_A_NAD).map(g => g.id));
    expect(composed.initialArms).toEqual([]);
  });

  it('computes the machine bill of materials (§8.2)', () => {
    expect(machineMaterials(getReferenceSolution(LEVEL_A_NAD))).toEqual({ STA: 8, SLN: 2, PRZ: 6, UKL: 3 });
    expect(machineMaterials(getReferenceSolution(LEVEL_A_KAT))).toEqual({ STA: 8, SLN: 2, NAD: 1, UKL: 2, PRZ: 2 });
    // 1 arm + 5 track hexes
    expect(machineMaterials(getReferenceSolution(LEVEL_4_TRACK))).toEqual({ STA: 9, SLN: 1 });
  });

  it('validates a machine against the building level limits (§8.1)', () => {
    const solution = getReferenceSolution(LEVEL_A_NAD);
    const crowded = {
      ...solution,
      arms: [
        ...solution.arms,
        createArm({ id: 'arm-3', basePos: { q: 3, r: 0 } }),
        createArm({ id: 'arm-4', basePos: { q: 0, r: 1 }, length: 3 }),
      ],
    };
    const codes = validateMachine(LEVEL_A_NAD, crowded, 1).map(i => [i.code, i.elementId ?? '']);

    expect(codes).toContainEqual(['TOO_MANY_ARMS', '']);
    expect(codes).toContainEqual(['OFF_BOARD', 'arm-3']);
    expect(codes).toContainEqual(['ARM_TOO_LONG', 'arm-4']);
    expect(validateMachine(LEVEL_4_TRACK, getReferenceSolution(LEVEL_4_TRACK), 2).map(i => i.code)).toContain('TRACKS_LOCKED');
    expect(validateMachine(LEVEL_A_NAD, solution, 9).map(i => i.code)).toEqual(['UNKNOWN_BUILDING_LEVEL']);
  });
});
