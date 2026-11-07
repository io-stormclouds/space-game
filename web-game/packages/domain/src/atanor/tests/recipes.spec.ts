// Economy recipe levels (W08 A, Z2; AT5): A_NAD, A_KAT, A_MET, A_KAP and A_PRO with reference solutions.
import { describe, expect, it } from 'vitest';
import {
  createAtanorSimulation,
  getReferenceSolution,
  listRecipeLevels,
  measureAtanorSolution,
  runAtanorSimulation,
  toAtanorSpec,
} from '../api';
import { gripperCount } from '../engine/arm';
import { getAtanorBuildingLevel, machineMaterials, validateMachine } from '../engine/building';
import { LEVEL_A_KAP, LEVEL_A_KAT, LEVEL_A_MET, LEVEL_A_NAD, LEVEL_A_PRO } from '../engine/recipes';
import { OutputProductGlyph } from '../engine/types';
import { isMaterialAtom } from '../graph/atom-types';
import { AtomType, MoleculeGraph } from '../graph/molecule';
import { hexDistance } from '../grid/hex';

/** Elements of the first delivered molecule (the atoms that vanished on the delivery tick). */
function firstProductElements(level: typeof LEVEL_A_NAD): string[] | null {
  const sim = createAtanorSimulation(level);
  let previous = sim.getSnapshot();
  for (let i = 0; i < 60; i++) {
    sim.step();
    const now = sim.getSnapshot();
    if (now.delivered > previous.delivered) {
      const left = new Set(now.atoms.map(a => a.id));
      return previous.atoms.filter(a => !left.has(a.id)).map(a => a.element).sort();
    }
    previous = now;
  }
  return null;
}

function outputPattern(level: typeof LEVEL_A_NAD): OutputProductGlyph['targetPattern'] {
  const out = level.glyphs.find((g): g is OutputProductGlyph => g.type === 'OUTPUT');
  return out!.targetPattern;
}

/** Does the output accept the pattern's own molecule with `extraBonds` and other `elements`? */
function acceptsWith(
  pattern: OutputProductGlyph['targetPattern'],
  extraBonds: [number, number][] = [],
  elements: readonly AtomType[] = pattern.elements
): boolean {
  const graph = new MoleculeGraph();
  elements.forEach((element, i) => graph.addAtom({ id: `a${i}`, element, pos: pattern.relativeHexOffsets[i] }));
  for (const [i, j] of [...pattern.bonds, ...extraBonds]) graph.addBond(`a${i}`, `a${j}`);
  const { atoms, bonds } = graph.getConnectedComponent('a0');
  return graph.matchesTarget(atoms, bonds, pattern);
}

/** Star pattern: atom 0 in the centre bonded to the 3 others, which are 2 apart from each other. */
function expectStar(pattern: OutputProductGlyph['targetPattern'], centre: string): void {
  const p = pattern.relativeHexOffsets;
  expect(pattern.elements[0]).toBe(centre);
  expect(pattern.bonds).toEqual([[0, 1], [0, 2], [0, 3]]);
  for (const i of [1, 2, 3]) {
    expect(hexDistance(p[0], p[i])).toBe(1);
    for (const j of [1, 2, 3]) if (j > i) expect(hexDistance(p[i], p[j])).toBe(2);
  }
}

describe('Recipe A_NAD (Nadprzewodnik)', () => {
  it('reference solution delivers 6 NAD without a JAM', () => {
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_NAD));

    expect(snapshot.jam).toBeNull();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.delivered).toBe(6);
    expect(snapshot.produced).toEqual({ NAD: 6 });
  });

  it('reference solution: 12 cycles per product, 2 arms, area 13 (swept hex, AT5), recipe inputs per product', () => {
    const metrics = measureAtanorSolution(LEVEL_A_NAD);

    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(12);
    expect(metrics.firstOutputTick).toBe(9);
    expect(metrics.arms).toBe(2);
    expect(metrics.area).toBe(13); // 12 before AT5: the MIE swinging onto the output passes (0,1)
    expect(metrics.inputsPerOutput).toEqual(LEVEL_A_NAD.recipe?.inputs);
    expect(toAtanorSpec(1, metrics)).toEqual({ level: 1, cycles: 12, area: 13, arms: 2 });
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

  it('delivers by pivoting PLA* around arm-2’s gripper (no gripper moves onto arm-1’s)', () => {
    expect(LEVEL_A_KAT.defaultInstructions['arm-2'][3]).toBe('PIVOT_CCW');
    const sim = createAtanorSimulation(LEVEL_A_KAT);
    for (let i = 0; i < 4; i++) sim.step();
    expect(sim.productsDelivered).toBe(1);
    expect(sim.hasCrashed).toBe(false);
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

describe('Recipe A_MET (Metamateriał osłonowy)', () => {
  it('reference solution delivers 6 MET without a JAM', () => {
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_MET));
    expect(snapshot.jam).toBeNull();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.produced).toEqual({ MET: 6 });
  });

  it('reference solution: 7 cycles per product, 3 arms, area 9, recipe inputs per product', () => {
    const metrics = measureAtanorSolution(LEVEL_A_MET);
    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(7);
    expect(metrics.arms).toBe(3);
    expect(metrics.area).toBe(9);
    expect(metrics.inputsPerOutput).toEqual({ STP: 1, KOM: 1, BET: 2 });
    expect(metrics.inputsPerOutput).toEqual(LEVEL_A_MET.recipe?.inputs);
  });

  it('closes a ring of 4 bonds; the two BET touch without a bond', () => {
    const sim = createAtanorSimulation(LEVEL_A_MET);
    for (let i = 0; i < 5; i++) sim.step();
    expect(sim.productsDelivered).toBe(0);
    sim.step(); // tick 6: the 2nd BET and KOM arrive together, the ring closes and leaves
    expect(sim.productsDelivered).toBe(1);
    expect(firstProductElements(LEVEL_A_MET)).toEqual(['BET', 'BET', 'KOM', 'STP']);

    // Rhombus STP-BET-KOM-BET: STP and KOM 2 apart, the two BET neighbours but not bonded.
    const pattern = outputPattern(LEVEL_A_MET);
    const p = pattern.relativeHexOffsets;
    expect(pattern.elements).toEqual(['STP', 'BET', 'KOM', 'BET']);
    expect(pattern.bonds).toEqual([[0, 1], [1, 2], [2, 3], [3, 0]]);
    expect(hexDistance(p[0], p[2])).toBe(2);
    expect(hexDistance(p[1], p[3])).toBe(1);
    expect(acceptsWith(pattern)).toBe(true);
    expect(acceptsWith(pattern, [[1, 3]])).toBe(false); // a BET-BET bond spoils the product
  });
});

describe('Recipe A_KAP (Kapsuła fuzyjna)', () => {
  it('reference solution delivers 6 KAP without a JAM', () => {
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_KAP));
    expect(snapshot.jam).toBeNull();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.produced).toEqual({ KAP: 6 });
  });

  it('reference solution: 7 cycles per product, 3 arms, area 11; portions HE3 5 u and DEU 5 u per atom', () => {
    const metrics = measureAtanorSolution(LEVEL_A_KAP);
    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(7);
    expect(metrics.arms).toBe(3);
    expect(metrics.area).toBe(11);
    expect(metrics.inputsPerOutput).toEqual({ HE3: 5, DEU: 10, NAD: 1 });
    expect(metrics.inputsPerOutput).toEqual(LEVEL_A_KAP.recipe?.inputs);
    const portions = Object.fromEntries(
      LEVEL_A_KAP.glyphs.flatMap(g => (g.type === 'INPUT' ? [[g.element, g.portion ?? 1]] : []))
    );
    expect(portions).toEqual({ NAD: 1, HE3: 5, DEU: 5 });
  });

  it('builds the star: NAD in the centre, HE3, DEU, DEU on alternate sides', () => {
    expect(firstProductElements(LEVEL_A_KAP)).toEqual(['DEU', 'DEU', 'HE3', 'NAD']);
    expectStar(outputPattern(LEVEL_A_KAP), 'NAD');
  });
});

describe('Recipe A_PRO (Procesor kwantowy)', () => {
  it('reference solution delivers 6 PRO without a JAM', () => {
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_PRO));
    expect(snapshot.jam).toBeNull();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.produced).toEqual({ PRO: 6 });
  });

  it('reference solution: 6 cycles per product, 2 arms (one with 3 grippers), area 9, recipe inputs per product', () => {
    const metrics = measureAtanorSolution(LEVEL_A_PRO);
    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(6);
    // The 3-gripper arm turns by 120° per product: the full state repeats every 3 products.
    expect(metrics.periodTicks).toBe(18);
    expect(metrics.outputsPerPeriod).toBe(3);
    expect(metrics.arms).toBe(2);
    expect(metrics.area).toBe(9);
    expect(metrics.inputsPerOutput).toEqual(LEVEL_A_PRO.recipe?.inputs);
    expect(LEVEL_A_PRO.initialArms.map(gripperCount)).toEqual([3, 1]);
  });

  it('cost stays the cost of the built machine while the piston moves (fix e)', () => {
    const sim = createAtanorSimulation(LEVEL_A_PRO);
    const costs = new Set<number>();
    const lengths = new Set<number>();
    for (let i = 0; i < 12; i++) {
      sim.step();
      costs.add(sim.getStats().cost);
      lengths.add(sim.getArms().find(a => a.id === 'arm-2')!.length);
    }
    expect([...lengths].sort()).toEqual([1, 2]);
    expect([...costs]).toEqual([130]);
  });

  it('builds KWA* (transmuted) with UKL, UKL and NAD around it', () => {
    expect(firstProductElements(LEVEL_A_PRO)).toEqual(['KWA*', 'NAD', 'UKL', 'UKL']);
    expectStar(outputPattern(LEVEL_A_PRO), 'KWA*');
    // KWA without transmutation is not accepted.
    const pattern = outputPattern(LEVEL_A_PRO);
    expect(acceptsWith(pattern)).toBe(true);
    expect(acceptsWith(pattern, [], ['KWA', ...pattern.elements.slice(1)])).toBe(false);
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

  it('reference solutions fit the building level of their recipe and run on its board', () => {
    for (const level of listRecipeLevels()) {
      const buildingLevel = level.recipe?.buildingLevel ?? 0;
      expect(validateMachine(level, getReferenceSolution(level), buildingLevel)).toEqual([]);
      const boardRadius = getAtanorBuildingLevel(buildingLevel)!.boardRadius;
      const snapshot = runAtanorSimulation(createAtanorSimulation(level, { boardRadius }));
      expect({ id: level.id, jam: snapshot.jam?.reason ?? null, completed: snapshot.completed }).toEqual({
        id: level.id,
        jam: null,
        completed: true,
      });
    }
    const codes = validateMachine(LEVEL_A_KAT, getReferenceSolution(LEVEL_A_KAT), 1).map(i => i.code);
    expect(codes).toContain('RECIPE_LOCKED');
    expect(codes).toContain('GLYPH_LOCKED');
    // MET also uses the radius-3 board of L2 (arm-3's base (1,2)).
    expect(validateMachine(LEVEL_A_MET, getReferenceSolution(LEVEL_A_MET), 1).map(i => i.code)).toEqual(['RECIPE_LOCKED', 'OFF_BOARD']);
    expect(validateMachine(LEVEL_A_KAP, getReferenceSolution(LEVEL_A_KAP), 2).map(i => i.code)).toEqual(['RECIPE_LOCKED']);
  });

  it('measured numbers and machine materials of the reference solutions', () => {
    const table = listRecipeLevels().map(level => {
      const m = measureAtanorSolution(level);
      return [level.recipe!.recipeId, level.recipe!.buildingLevel, m.cyclesPerOutput, m.area, m.arms, m.cost];
    });
    expect(table).toEqual([
      ['A_NAD', 1, 12, 13, 2, 70],
      ['A_KAT', 2, 6, 8, 2, 70],
      ['A_MET', 2, 7, 9, 3, 90],
      ['A_KAP', 3, 7, 11, 3, 80],
      ['A_PRO', 4, 6, 9, 2, 130],
    ]);
    expect(machineMaterials(getReferenceSolution(LEVEL_A_MET))).toEqual({ STA: 12, SLN: 3, PRZ: 6, UKL: 3 });
    expect(machineMaterials(getReferenceSolution(LEVEL_A_KAP))).toEqual({ STA: 14, SLN: 3, PRZ: 2, UKL: 1 });
    // 3-gripper arm: +2 × 2 STA (proposal); piston of length 2: +2 STA, +1 SLN.
    expect(machineMaterials(getReferenceSolution(LEVEL_A_PRO))).toEqual({ STA: 14, SLN: 3, PRZ: 6, UKL: 4, NAD: 1 });
  });
});
