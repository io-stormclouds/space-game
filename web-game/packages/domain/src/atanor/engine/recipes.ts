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
 *   KRZ input (2,-1); output (0,1).
 * Reference solution: 2 arms (length 1), 1 bonder, 1 transmuter, 6 ticks per product, area 8.
 * AT5: the output moved from (0,-1) to (0,1). Arm-2 used to deliver by rotating the pair around its
 * base, which drove its gripper onto (0,0), where arm-1's gripper had just released PLA*
 * (ARM_COLLISION). Now arm-2 pivots PLA* around its own gripper onto the output; no gripper moves.
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
      { q: 0, r: 1 },
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
    // Orbit of (1,-1): dir0 (2,-1) KRZ input, dir1 (1,0) bonder.
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
      'PIVOT_CCW',  // 3: PLA* (0,0) -> (0,1) around the gripper (1,0), on the output: delivered
      'ROTATE_CCW', // 4: back at the KRZ input
      'EMPTY',      // 5
      'REPEAT',     // 6
    ],
  },
};

/**
 * A_MET — Metamateriał osłonowy. STP 1 + KOM 1 + BET 2 -> MET 1, Fabryka atanorowa L2.
 * Molecule (§8.3 "pierścień 4 atomów, 4 wiązania"): a rhombus STP–BET–KOM–BET. STP and KOM sit on
 * the long diagonal; the two BET are neighbours on the short diagonal but NOT bonded to each other.
 *
 * Layout (L2 board, radius 3):
 *   STP input (0,0) — the hub; BET input (1,-1); KOM input (0,2); output (1,1).
 *   Bonders (0,0)-(1,0), (1,0)-(1,1), (0,1)-(1,1); no bonder on the short diagonal (1,0)-(0,1).
 * Reference solution: 3 arms (length 1), 3 bonders, 7 ticks per product, area 9.
 *   arm-1 (hub, base (-1,0)) holds STP and pivots STP–BET by 60° so that (1,0) is free again;
 *   arm-2 (base (2,-1)) brings BET to (1,0) twice; arm-3 (base (1,2)) brings KOM onto the output
 *   (1,1) in the same tick as the 2nd BET: four bonds close the ring and the output takes it.
 */
export const LEVEL_A_MET: LevelConfig = {
  id: 'recipe-a-met',
  kind: 'recipe',
  name: 'Metamateriał osłonowy (MET)',
  description:
    'Zamknij pierścień czterech atomów: Stop tytanowy (STP), Beton (BET), Kompozyt (KOM), Beton (BET). STP i KOM leżą naprzeciw siebie, dwa atomy BET stykają się, ale nie są związane.',
  targetRequired: 6,
  recipe: {
    recipeId: 'A_MET',
    buildingLevel: 2,
    inputs: { STP: 1, KOM: 1, BET: 2 },
    outputs: { MET: 1 },
    docReference: { cycles: 16, area: 14, arms: 3 },
  },
  glyphs: [
    createInputGlyph('in-stp', { q: 0, r: 0 }, 'STP', 1),
    createInputGlyph('in-bet', { q: 1, r: -1 }, 'BET', 1),
    createInputGlyph('in-kom', { q: 0, r: 2 }, 'KOM', 1),
    createOutputGlyph(
      'out-met',
      { q: 1, r: 1 },
      {
        name: 'Metamateriał osłonowy (MET)',
        elements: ['STP', 'BET', 'KOM', 'BET'],
        relativeHexOffsets: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
          { q: 1, r: 1 },
          { q: 0, r: 1 },
        ],
        bonds: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ],
      },
      { material: 'MET', quantity: 1 }
    ),
    // Reference solution glyphs
    createBonderGlyph('bonder-stp-bet', { q: 0, r: 0 }, { q: 1, r: 0 }),
    createBonderGlyph('bonder-bet-kom', { q: 1, r: 0 }, { q: 1, r: 1 }),
    createBonderGlyph('bonder-kom-bet', { q: 0, r: 1 }, { q: 1, r: 1 }),
  ],
  initialArms: [
    // Hub: gripper on the STP input (0,0); never turns, only pivots the molecule.
    createArm({ id: 'arm-1', basePos: { q: -1, r: 0 }, rotation: 0, length: 1 }),
    // Orbit of (2,-1): dir3 (1,-1) BET input, dir2 (1,0) bonder.
    createArm({ id: 'arm-2', basePos: { q: 2, r: -1 }, rotation: 3, length: 1 }),
    // Orbit of (1,2): dir3 (0,2) KOM input, dir4 (1,1) output.
    createArm({ id: 'arm-3', basePos: { q: 1, r: 2 }, rotation: 3, length: 1 }),
  ],
  defaultInstructions: {
    'arm-1': [
      'GRAB',      // 0: STP at (0,0)
      'EMPTY',     // 1: BET arrives at (1,0): bond STP-BET
      'PIVOT_CW',  // 2: BET (1,0) -> (0,1) around STP
      'EMPTY',     // 3..6: hold; the output releases the gripper on slot 5
      'EMPTY',
      'EMPTY',
      'EMPTY',
      'REPEAT',    // 7
    ],
    'arm-2': [
      'GRAB',       // 0: 1st BET at (1,-1)
      'ROTATE_CCW', // 1: -> (1,0)
      'DROP',       // 2: release before the hub pivots
      'ROTATE_CW',  // 3: back to the BET input
      'GRAB',       // 4: 2nd BET
      'ROTATE_CCW', // 5: -> (1,0): bonds STP-BET and BET-KOM; ring delivered
      'ROTATE_CW',  // 6: back to the BET input
      'REPEAT',     // 7
    ],
    'arm-3': [
      'EMPTY',      // 0..3
      'EMPTY',
      'EMPTY',
      'EMPTY',
      'GRAB',       // 4: KOM at (0,2)
      'ROTATE_CW',  // 5: -> (1,1) on the output: bonds to both BET; ring delivered
      'ROTATE_CCW', // 6: back to the KOM input
      'REPEAT',     // 7
    ],
  },
};

/**
 * A_KAP — Kapsuła fuzyjna. HE3 5 + DEU 10 + NAD 1 -> KAP 1, Fabryka atanorowa L3.
 * Molecule (§8.3 "gwiazda: S w środku, He, D, D wokół"): NAD in the centre bonded to HE3, DEU and
 * DEU on alternate sides (a "Y", like NAD). Portions: HE3 5 u per atom, DEU 5 u per atom.
 *
 * Layout (L3 board, radius 4):
 *   NAD input (0,0) — the hub; HE3 input (1,-1), portion 5; DEU input (1,1), portion 5;
 *   one bonder (0,0)-(1,0); output (1,0) on the bonder's outer cell (the "station").
 * Reference solution: 3 arms, 1 bonder, 7 ticks per product, area 11.
 *   arm-1 (hub, base (2,-2), length 2) holds NAD and pivots the molecule by 120° (2 pivots) after
 *   each atom, so the station (1,0) is free again; arm-2 (base (2,-1)) brings HE3 to the station,
 *   arm-3 (base (2,0)) brings DEU twice. The 2nd DEU completes the star on the output.
 *   The hub arm's body passes over the HE3 input (allowed: arm bodies do not collide).
 */
export const LEVEL_A_KAP: LevelConfig = {
  id: 'recipe-a-kap',
  kind: 'recipe',
  name: 'Kapsuła fuzyjna (KAP)',
  description:
    'Zbuduj gwiazdę: Nadprzewodnik (NAD) w środku, wokół niego porcja Helu-3 (HE3) i dwie porcje Deuteru (DEU), co drugi sąsiad. Gotową cząsteczkę dostarcz do portu wyjściowego.',
  targetRequired: 6,
  recipe: {
    recipeId: 'A_KAP',
    buildingLevel: 3,
    inputs: { HE3: 5, DEU: 10, NAD: 1 },
    outputs: { KAP: 1 },
    docReference: { cycles: 18, area: 16, arms: 3 },
  },
  glyphs: [
    createInputGlyph('in-nad', { q: 0, r: 0 }, 'NAD', 1),
    createInputGlyph('in-he3', { q: 1, r: -1 }, 'HE3', 5),
    createInputGlyph('in-deu', { q: 1, r: 1 }, 'DEU', 5),
    createOutputGlyph(
      'out-kap',
      { q: 1, r: 0 },
      {
        name: 'Kapsuła fuzyjna (KAP)',
        elements: ['NAD', 'HE3', 'DEU', 'DEU'],
        relativeHexOffsets: [
          { q: 0, r: 0 },
          { q: 0, r: -1 },
          { q: 1, r: 0 },
          { q: -1, r: 1 },
        ],
        bonds: [
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      },
      { material: 'KAP', quantity: 1 }
    ),
    // Reference solution glyphs
    createBonderGlyph('bonder-station', { q: 0, r: 0 }, { q: 1, r: 0 }),
  ],
  initialArms: [
    // Hub: base (2,-2), length 2, dir2 -> gripper on the NAD input (0,0).
    createArm({ id: 'arm-1', basePos: { q: 2, r: -2 }, rotation: 2, length: 2 }),
    // Orbit of (2,-1): dir3 (1,-1) HE3 input, dir2 (1,0) station.
    createArm({ id: 'arm-2', basePos: { q: 2, r: -1 }, rotation: 3, length: 1 }),
    // Orbit of (2,0): dir2 (1,1) DEU input, dir3 (1,0) station.
    createArm({ id: 'arm-3', basePos: { q: 2, r: 0 }, rotation: 2, length: 1 }),
  ],
  defaultInstructions: {
    'arm-1': [
      'EMPTY',     // 0: (steady state: the star is delivered this tick, a new NAD appears)
      'GRAB',      // 1: NAD at (0,0); HE3 arrives at the station: bond NAD-HE3
      'PIVOT_CW',  // 2: HE3 -> (0,1)
      'PIVOT_CW',  // 3: HE3 -> (-1,1); DEU arrives at the station: bond NAD-DEU
      'PIVOT_CW',  // 4: HE3 -> (-1,0), DEU -> (0,1)
      'PIVOT_CW',  // 5: HE3 -> (0,-1), DEU -> (-1,1)
      'EMPTY',     // 6
      'REPEAT',    // 7
    ],
    'arm-2': [
      'GRAB',       // 0: HE3 at (1,-1)
      'ROTATE_CCW', // 1: -> station (1,0)
      'DROP',       // 2: release before the hub pivots
      'ROTATE_CW',  // 3: back to the HE3 input
      'EMPTY',      // 4..6
      'EMPTY',
      'EMPTY',
      'REPEAT',     // 7
    ],
    'arm-3': [
      'ROTATE_CW',  // 0: 2nd DEU -> station: star complete, delivered (first loop: empty move)
      'ROTATE_CCW', // 1: back to the DEU input
      'GRAB',       // 2: 1st DEU
      'ROTATE_CW',  // 3: -> station: bond NAD-DEU
      'DROP',       // 4: release before the hub pivots
      'ROTATE_CCW', // 5: back to the DEU input
      'GRAB',       // 6: 2nd DEU
      'REPEAT',     // 7
    ],
  },
};

/**
 * A_PRO — Procesor kwantowy. KWA 1 + UKL 2 + NAD 1 -> PRO 1, Fabryka atanorowa L4 (multi-gripper
 * arms, §8.1). Molecule (§8.3 "Q* w środku, U, U, S wokół"): KWA* in the centre bonded to UKL, UKL
 * and NAD on alternate sides (a "Y"); KWA becomes KWA* on the transmutation glyph.
 *
 * Layout (L4 board, radius 5): the assembly hub is (0,0).
 *   Inputs on the odd neighbours of the hub: UKL (0,1), UKL (-1,0) (two ports, one shared UKL
 *   buffer as for any material, A1), NAD (1,-1); KWA input (2,-1).
 *   Bonders from (0,0) to the even neighbours (1,0), (-1,1), (0,-1); transmutation KWA -> KWA* on
 *   (1,0); output (0,-1).
 * Reference solution: 2 arms, 3 bonders, 1 transmuter, 6 ticks per product, area 9.
 *   arm-1 is a 3-gripper arm (120°) based on the hub: it turns its grippers onto the three odd
 *   inputs, grabs UKL, UKL and NAD at once and with one more turn sets them on the three bonders
 *   around KWA*. arm-2 (piston, base (2,0)) takes KWA through the transmuter at (1,0) and extends
 *   into the hub. The multi-gripper arm is what makes one turn enough (3 atoms per GRAB).
 *   KWA* rests on arm-1's base hex (allowed: atoms do not collide with arm bases).
 */
export const LEVEL_A_PRO: LevelConfig = {
  id: 'recipe-a-pro',
  kind: 'recipe',
  name: 'Procesor kwantowy (PRO)',
  description:
    'Przeprowadź Kwantyt (KWA) przez glif transmutacji (KWA → KWA*) do środka i otocz go dwoma Układami scalonymi (UKL) i Nadprzewodnikiem (NAD), co drugi sąsiad. Ramię wielochwytakowe chwyta kilka atomów naraz.',
  targetRequired: 6,
  recipe: {
    recipeId: 'A_PRO',
    buildingLevel: 4,
    inputs: { KWA: 1, UKL: 2, NAD: 1 },
    outputs: { PRO: 1 },
    docReference: { cycles: 24, area: 20, arms: 4 },
  },
  glyphs: [
    createInputGlyph('in-ukl-1', { q: 0, r: 1 }, 'UKL', 1),
    createInputGlyph('in-ukl-2', { q: -1, r: 0 }, 'UKL', 1),
    createInputGlyph('in-nad', { q: 1, r: -1 }, 'NAD', 1),
    createInputGlyph('in-kwa', { q: 2, r: -1 }, 'KWA', 1),
    createOutputGlyph(
      'out-pro',
      { q: 0, r: -1 },
      {
        name: 'Procesor kwantowy (PRO)',
        elements: ['KWA*', 'NAD', 'UKL', 'UKL'],
        relativeHexOffsets: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
          { q: -1, r: 1 },
          { q: 0, r: -1 },
        ],
        bonds: [
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      },
      { material: 'PRO', quantity: 1 }
    ),
    // Reference solution glyphs
    createBonderGlyph('bonder-e', { q: 0, r: 0 }, { q: 1, r: 0 }),
    createBonderGlyph('bonder-sw', { q: 0, r: 0 }, { q: -1, r: 1 }),
    createBonderGlyph('bonder-nw', { q: 0, r: 0 }, { q: 0, r: -1 }),
    createTransmuteGlyph('transmute-kwa', { q: 1, r: 0 }, 'KWA', 'KWA*'),
  ],
  initialArms: [
    // 3 grippers at dir0, dir2, dir4 of the hub (the bonder cells); one turn puts them on the inputs.
    createArm({ id: 'arm-1', basePos: { q: 0, r: 0 }, rotation: 0, length: 1, grippers: 3 }),
    // Piston on (2,0) pointing at the hub (dir3), extended (length 2): gripper on (0,0).
    // Length 1: dir3 (1,0) transmuter, dir4 (2,-1) KWA input.
    createArm({ id: 'arm-2', basePos: { q: 2, r: 0 }, rotation: 3, length: 2, isPiston: true }),
  ],
  defaultInstructions: {
    'arm-1': [
      'ROTATE_CW',  // 0: grippers -> the odd inputs (0,1), (-1,0), (1,-1)
      'GRAB',       // 1: UKL, UKL, NAD at once
      'EMPTY',      // 2..4: wait for KWA*
      'EMPTY',
      'EMPTY',
      'ROTATE_CW',  // 5: UKL -> (-1,1), UKL -> (0,-1), NAD -> (1,0): three bonds, star delivered
      'REPEAT',     // 6
    ],
    'arm-2': [
      'RETRACT',    // 0: gripper (0,0) -> (1,0) as arm-1's gripper leaves it
      'ROTATE_CW',  // 1: -> KWA input (2,-1)
      'GRAB',       // 2: KWA
      'ROTATE_CCW', // 3: -> (1,0): KWA becomes KWA*
      'EXTEND',     // 4: KWA* -> hub (0,0)
      'EMPTY',      // 5: hold KWA* while the star closes (the output releases the gripper)
      'REPEAT',     // 6
    ],
  },
};

/** Economy recipe levels (Fabryka atanorowa). */
export const RECIPE_LEVELS: readonly LevelConfig[] = [LEVEL_A_NAD, LEVEL_A_KAT, LEVEL_A_MET, LEVEL_A_KAP, LEVEL_A_PRO];
