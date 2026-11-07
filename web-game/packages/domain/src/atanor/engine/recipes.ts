// Economy recipe levels for the Fabryka atanorowa (decision W08 A, assumption Z2).
// Recipes, inputs and outputs: web-game/tools/economy-model/econ-model.ts `atanor(...)` entries;
// molecules: docs/economy-expansion-design.md §8.3. Port layouts and reference solutions are
// PROVISIONAL (designed here, EXP-6): an economy designer should review them in the editor.
import { createArm } from './arm';
import { createBonderGlyph, createInputGlyph, createOutputGlyph, createTransmuteGlyph } from './glyph';
import { LevelConfig } from './types';

/**
 * A_NAD — Nadprzewodnik. MIE 2 + PLA 1 + H2 10 -> NAD 1, Fabryka atanorowa L1.
 * Molecule (§8.3 "łańcuch Cu–Pt–Cu z H przy Pt", 3 bonds): PLA in the centre bonded to
 * MIE, MIE and H2 on alternate sides (a "Y"; the doc does not fix the angles).
 *
 * Layout on the L1 board (radius 2):
 *   PLA input (0,0) — also the centre of three bonders to (1,0), (-1,1), (0,-1);
 *   MIE input (2,-1), one portion = 1 MIE;  H2 input (-2,0), one portion = 10 H2;
 *   output (-1,2).
 * Reference solution: 2 arms (length 1), 3 bonders, 12 ticks per product, area 12.
 *   arm-1 (base (1,-1)) brings the 1st MIE to (1,0), the 2nd MIE the long way round to (0,-1);
 *   arm-2 (base (-1,0)) brings H2 to (-1,1), then rotates the finished molecule onto the output.
 */
export const LEVEL_A_NAD: LevelConfig = {
  id: 'recipe-a-nad',
  kind: 'recipe',
  name: 'Nadprzewodnik (NAD)',
  description:
    'Połącz Platynit (PLA) z dwiema porcjami Miedzi (MIE) i porcją Wodoru (H2): PLA w środku, trzy wiązania. Gotową cząsteczkę dostarcz do portu wyjściowego.',
  targetRequired: 6,
  recipe: {
    recipeId: 'A_NAD',
    buildingLevel: 1,
    inputs: { MIE: 2, PLA: 1, H2: 10 },
    outputs: { NAD: 1 },
    docReference: { cycles: 12, area: 9, arms: 2 },
  },
  glyphs: [
    createInputGlyph('in-pla', { q: 0, r: 0 }, 'PLA', 1),
    createInputGlyph('in-mie', { q: 2, r: -1 }, 'MIE', 1),
    createInputGlyph('in-h2', { q: -2, r: 0 }, 'H2', 10),
    createOutputGlyph(
      'out-nad',
      { q: -1, r: 2 },
      {
        name: 'Nadprzewodnik (NAD)',
        elements: ['PLA', 'MIE', 'MIE', 'H2'],
        relativeHexOffsets: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
          { q: 0, r: -1 },
          { q: -1, r: 1 },
        ],
        bonds: [
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      },
      { material: 'NAD', quantity: 1 }
    ),
    // Reference solution glyphs
    createBonderGlyph('bonder-e', { q: 0, r: 0 }, { q: 1, r: 0 }),
    createBonderGlyph('bonder-sw', { q: 0, r: 0 }, { q: -1, r: 1 }),
    createBonderGlyph('bonder-nw', { q: 0, r: 0 }, { q: 0, r: -1 }),
  ],
  initialArms: [
    // Orbit of (1,-1): dir0 (2,-1) MIE input, dir1 (1,0), dir3 (0,-1), dir4 (1,-2), dir5 (2,-2).
    createArm({ id: 'arm-1', basePos: { q: 1, r: -1 }, rotation: 0, length: 1 }),
    // Orbit of (-1,0): dir3 (-2,0) H2 input, dir2 (-2,1), dir1 (-1,1).
    createArm({ id: 'arm-2', basePos: { q: -1, r: 0 }, rotation: 3, length: 1 }),
  ],
  defaultInstructions: {
    'arm-1': [
      'GRAB',       // 0: MIE at (2,-1)
      'ROTATE_CW',  // 1: MIE -> (1,0): bond PLA-MIE
      'DROP',       // 2
      'ROTATE_CCW', // 3: back to the MIE input
      'GRAB',       // 4: 2nd MIE
      'ROTATE_CCW', // 5: -> (2,-2)
      'ROTATE_CCW', // 6: -> (1,-2)
      'ROTATE_CCW', // 7: -> (0,-1): bond PLA-MIE, molecule complete
      'DROP',       // 8: release before arm-2 moves the molecule
      'ROTATE_CW',  // 9
      'ROTATE_CW',  // 10
      'ROTATE_CW',  // 11: dir0 again
      'REPEAT',     // 12
    ],
    'arm-2': [
      'GRAB',       // 0: H2 at (-2,0)
      'ROTATE_CCW', // 1: H2 -> (-2,1)
      'ROTATE_CCW', // 2: H2 -> (-1,1): bond PLA-H2
      'EMPTY',      // 3..7: hold the growing molecule in place
      'EMPTY',
      'EMPTY',
      'EMPTY',
      'EMPTY',
      'ROTATE_CW',  // 8: whole molecule around (-1,0); MIE lands on the output (-1,2): delivered
      'ROTATE_CW',  // 9: back to the H2 input (dir3)
      'EMPTY',      // 10
      'EMPTY',      // 11
      'REPEAT',     // 12
    ],
  },
};

/**
 * A_KAT — Katalizator. PLA 1 + KRZ 1 -> KAT 1, Fabryka atanorowa L2 (needs the transmutation glyph).
 * Molecule (§8.3): PLA* – KRZ; PLA becomes PLA* on the transmutation glyph.
 *
 * Layout (fits the L2 board, radius 3; uses only radius 2):
 *   PLA input (-2,1); transmutation PLA -> PLA* at (-1,0); bonder (0,0)-(1,0);
 *   KRZ input (2,-1); output (0,-1).
 * Reference solution: 2 arms (length 1), 1 bonder, 1 transmuter, 6 ticks per product, area 8.
 */
export const LEVEL_A_KAT: LevelConfig = {
  id: 'recipe-a-kat',
  kind: 'recipe',
  name: 'Katalizator (KAT)',
  description:
    'Przeprowadź Platynit (PLA) przez glif transmutacji (PLA → PLA*), połącz go z Krzemem (KRZ) i dostarcz parę PLA*–KRZ do portu wyjściowego.',
  targetRequired: 6,
  recipe: {
    recipeId: 'A_KAT',
    buildingLevel: 2,
    inputs: { PLA: 1, KRZ: 1 },
    outputs: { KAT: 1 },
    docReference: { cycles: 10, area: 8, arms: 2 },
  },
  glyphs: [
    createInputGlyph('in-pla', { q: -2, r: 1 }, 'PLA', 1),
    createInputGlyph('in-krz', { q: 2, r: -1 }, 'KRZ', 1),
    createOutputGlyph(
      'out-kat',
      { q: 0, r: -1 },
      {
        name: 'Katalizator (KAT)',
        elements: ['PLA*', 'KRZ'],
        relativeHexOffsets: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
        bonds: [[0, 1]],
      },
      { material: 'KAT', quantity: 1 }
    ),
    // Reference solution glyphs
    createTransmuteGlyph('transmute-pla', { q: -1, r: 0 }, 'PLA', 'PLA*'),
    createBonderGlyph('bonder-1', { q: 0, r: 0 }, { q: 1, r: 0 }),
  ],
  initialArms: [
    // Orbit of (-1,1): dir3 (-2,1) PLA input, dir4 (-1,0) transmuter, dir5 (0,0) bonder.
    createArm({ id: 'arm-1', basePos: { q: -1, r: 1 }, rotation: 3, length: 1 }),
    // Orbit of (1,-1): dir0 (2,-1) KRZ input, dir1 (1,0) bonder, dir2 (0,0), dir3 (0,-1) output.
    createArm({ id: 'arm-2', basePos: { q: 1, r: -1 }, rotation: 0, length: 1 }),
  ],
  defaultInstructions: {
    'arm-1': [
      'GRAB',       // 0: PLA at (-2,1)
      'ROTATE_CW',  // 1: -> (-1,0): PLA becomes PLA*
      'ROTATE_CW',  // 2: -> (0,0): bond PLA*-KRZ
      'DROP',       // 3: release before arm-2 moves the pair
      'ROTATE_CCW', // 4
      'ROTATE_CCW', // 5: back at the PLA input
      'REPEAT',     // 6
    ],
    'arm-2': [
      'GRAB',       // 0: KRZ at (2,-1)
      'ROTATE_CW',  // 1: -> (1,0)
      'EMPTY',      // 2: wait for PLA*
      'ROTATE_CW',  // 3: pair -> KRZ (0,0), PLA* (0,-1) on the output: delivered
      'ROTATE_CCW', // 4
      'ROTATE_CCW', // 5: back at the KRZ input
      'REPEAT',     // 6
    ],
  },
};

/** Economy recipe levels (Fabryka atanorowa). */
export const RECIPE_LEVELS: readonly LevelConfig[] = [LEVEL_A_NAD, LEVEL_A_KAT];
