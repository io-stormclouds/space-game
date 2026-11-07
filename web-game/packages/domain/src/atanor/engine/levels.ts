// Ported from poc/space-atanor/src/core/engine/levels.ts.
// The 4 alchemical teaching levels of the PoC (kind: 'poc'). Game recipes live in recipes.ts.
// Changes: `kind: 'poc'`; LEVEL_2_WATER default program fixed (it ended in a JAM, POC-4);
// ALL_LEVELS renamed to POC_LEVELS.
import { ArmCommand, LevelConfig } from './types';
import { createArm } from './arm';
import { createBonderGlyph, createInputGlyph, createOutputGlyph, createTransmuteGlyph } from './glyph';

export const LEVEL_1_DIMER: LevelConfig = {
  id: 'level-1-dimer',
  kind: 'poc',
  name: 'Lekcja 1: Synteza Dimeru Alchemicznego (A-B)',
  description:
    'Podstawowy poziom szkoleniowy. Skonfiguruj ramiona tak, aby pobrać atom Cynobru (A) oraz Rtęci (B), połączyć je na glifie wiązania i przekazać gotową cząsteczkę do Ujścia.',
  targetRequired: 6,
  glyphs: [
    // Reagent A at (-3, 0)
    createInputGlyph('input-a', { q: -3, r: 0 }, 'A'),
    // Reagent B at (2, 0)
    createInputGlyph('input-b', { q: 2, r: 0 }, 'B'),
    // Bonder Glyph connecting (-1, 0) and (0, 0)
    createBonderGlyph('bonder-1', { q: -1, r: 0 }, { q: 0, r: 0 }),
    // Output Sink at (0, 1) expecting Atom B at root and Atom A at relative offset (-1, 1)
    createOutputGlyph('output-1', { q: 0, r: 1 }, {
      name: 'Dimer A-B',
      elements: ['B', 'A'],
      relativeHexOffsets: [
        { q: 0, r: 0 },
        { q: -1, r: 1 },
      ],
      bonds: [[0, 1]],
    }),
  ],
  initialArms: [
    // Arm 1 (Feeder Alpha): Base at (-2, 0), length 1, facing direction 3 (-1, 0) towards (-3, 0)
    createArm({
      id: 'arm-1',
      basePos: { q: -2, r: 0 },
      rotation: 3,
      length: 1,
    }),
    // Arm 2 (Assembler Beta): Base at (1, 0), length 1, facing direction 0 (1, 0) towards (2, 0)
    createArm({
      id: 'arm-2',
      basePos: { q: 1, r: 0 },
      rotation: 0,
      length: 1,
    }),
  ],
  defaultInstructions: {
    'arm-1': [
      'GRAB',       // 0: Grab Atom A at (-3, 0)
      'ROTATE_CW',  // 1: Rotate to dir 4
      'ROTATE_CW',  // 2: Rotate to dir 5
      'ROTATE_CW',  // 3: Rotate to dir 0 (atom is now at bonder hex (-1, 0))
      'DROP',       // 4: Drop atom on bonder
      'ROTATE_CCW', // 5: Rotate back to dir 5
      'ROTATE_CCW', // 6: Rotate back to dir 4
      'ROTATE_CCW', // 7: Rotate back to dir 3 (ready at Input A)
      'EMPTY',      // 8: Wait
      'REPEAT',     // 9: Loop repeat
    ],
    'arm-2': [
      'GRAB',       // 0: Grab Atom B at (2, 0)
      'ROTATE_CCW', // 1: Rotate to dir 5
      'ROTATE_CCW', // 2: Rotate to dir 4
      'ROTATE_CCW', // 3: Rotate to dir 3 (atom is now at bonder hex (0, 0) - BOND FORMED!)
      'ROTATE_CCW', // 4: Move bonded molecule to dir 2: Atom B to (0, 1) [Output Sink consumes it!]
      'ROTATE_CW',  // 5: Rotate back to dir 3
      'ROTATE_CW',  // 6: Rotate back to dir 4
      'ROTATE_CW',  // 7: Rotate back to dir 5
      'ROTATE_CW',  // 8: Rotate back to dir 0 (ready at Input B)
      'REPEAT',     // 9: Loop repeat
    ],
  },
};

/**
 * Default program of LEVEL_2_WATER as shipped in the PoC. It never completes: both arms rotate
 * away from the bonder (WATER ends on (0,0) instead of (-1,0), SALT on (1,-2)), nobody reaches the
 * output (0,-1), and on the second loop arm-2 carries a new SALT onto the SALT it dropped on
 * (1,-2) -> JAM after 9 ticks with 0/6 products. Kept for the regression test.
 */
export const LEVEL_2_POC_BROKEN_PROGRAM: Readonly<Record<string, readonly (ArmCommand | null)[]>> = {
  'arm-1': ['GRAB', 'ROTATE_CW', 'ROTATE_CW', 'DROP', 'ROTATE_CCW', 'ROTATE_CCW', 'REPEAT'],
  'arm-2': ['GRAB', 'ROTATE_CCW', 'ROTATE_CCW', 'DROP', 'ROTATE_CW', 'ROTATE_CW', 'REPEAT'],
};

export const LEVEL_2_WATER: LevelConfig = {
  id: 'level-2-salt-water',
  kind: 'poc',
  name: 'Lekcja 2: Kinematyka Płynów (Woda i Sól)',
  description:
    'Zbuduj aparat transmutujący żywioły w cząsteczkę Soli z Wodą. Wykorzystaj rotacje kątowe i koordynację wielu ramion.',
  targetRequired: 6,
  glyphs: [
    createInputGlyph('input-water', { q: -2, r: 1 }, 'WATER'),
    createInputGlyph('input-salt', { q: 2, r: -1 }, 'SALT'),
    createBonderGlyph('bonder-w', { q: -1, r: 0 }, { q: 0, r: 0 }),
    createOutputGlyph('output-w', { q: 0, r: -1 }, {
      name: 'Aqua Salis',
      elements: ['SALT', 'WATER'],
      relativeHexOffsets: [
        { q: 0, r: 0 },
        { q: -1, r: 0 },
      ],
      bonds: [[0, 1]],
    }),
  ],
  initialArms: [
    createArm({
      id: 'arm-1',
      basePos: { q: -1, r: 1 },
      rotation: 3,
      length: 1,
    }),
    createArm({
      id: 'arm-2',
      basePos: { q: 1, r: -1 },
      rotation: 0,
      length: 1,
    }),
  ],
  // Fixed program (the layout is unchanged). Arm-1 orbit around (-1,1): dir3 (-2,1) input WATER,
  // dir4 (-1,0) bonder. Arm-2 orbit around (1,-1): dir0 (2,-1) input SALT, dir1 (1,0),
  // dir2 (0,0) bonder, dir3 (0,-1) output. 7 ticks per product.
  defaultInstructions: {
    'arm-1': [
      'GRAB',       // 0: grab WATER at (-2,1)
      'ROTATE_CW',  // 1: WATER -> (-1,0) (bonder)
      'DROP',       // 2: release; SALT arrives at (0,0) this tick -> bond WATER-SALT
      'ROTATE_CCW', // 3: back to the WATER input
      'EMPTY',      // 4
      'EMPTY',      // 5
      'EMPTY',      // 6
      'REPEAT',     // 7
    ],
    'arm-2': [
      'GRAB',       // 0: grab SALT at (2,-1)
      'ROTATE_CW',  // 1: SALT -> (1,0)
      'ROTATE_CW',  // 2: SALT -> (0,0) (bonder) -> bond with WATER at (-1,0)
      'ROTATE_CW',  // 3: molecule -> SALT (0,-1) on the output, WATER (0,-2): delivered
      'ROTATE_CCW', // 4: back towards the SALT input
      'ROTATE_CCW', // 5
      'ROTATE_CCW', // 6: dir0, ready at (2,-1)
      'REPEAT',     // 7
    ],
  },
};

/**
 * Level 3: Transmutation.
 * The player must ferry a LEAD atom onto a TRANSMUTE glyph (LEAD -> GOLD) and
 * then deliver the resulting GOLD atom into the output sink.
 */
export const LEVEL_3_TRANSMUTE: LevelConfig = {
  id: 'level-3-transmute',
  kind: 'poc',
  name: 'Lekcja 3: Transmutacja Ołowiu w Złoto (Pb → Au)',
  description:
    'Przenieś atom Ołowiu (Pb) z źródła na Glif Transmutacji, gdzie zamieni się w Złoto (Au), a następnie dostarcz go do Ujścia. Glif TRANSMUTE modyfikuje pierwiastek atomu w miejscu, zachowując jego wiązania.',
  targetRequired: 5,
  glyphs: [
    // Source: LEAD at (-2, 0)
    createInputGlyph('input-lead', { q: -2, r: 0 }, 'LEAD'),
    // Transmutation glyph at (0, 0): LEAD -> GOLD
    createTransmuteGlyph('transmute-1', { q: 0, r: 0 }, 'LEAD', 'GOLD'),
    // Output sink at (-1, 1) expecting a single GOLD atom at the root
    createOutputGlyph('output-gold', { q: -1, r: 1 }, {
      name: 'Złoto (Au)',
      elements: ['GOLD'],
      relativeHexOffsets: [{ q: 0, r: 0 }],
      bonds: [],
    }),
  ],
  initialArms: [
    // Arm base at (-1, 0); its length-1 orbit ring passes through the source (-2,0),
    // the transmute glyph (0,0) and the output (-1,1).
    createArm({
      id: 'arm-1',
      basePos: { q: -1, r: 0 },
      rotation: 3,
      length: 1,
    }),
  ],
  defaultInstructions: {
    'arm-1': [
      'GRAB',       // 0: Grab LEAD at (-2, 0) [gripper dir3]
      'ROTATE_CW',  // 1: atom -> (-1,-1)
      'ROTATE_CW',  // 2: atom -> (0,-1)
      'ROTATE_CW',  // 3: atom -> (0,0)  [TRANSMUTE LEAD->GOLD]
      'ROTATE_CW',  // 4: atom -> (-1,1) [OUTPUT consumes GOLD]
      'DROP',       // 5: Release (atom already consumed)
      'ROTATE_CCW', // 6: back toward source
      'ROTATE_CCW', // 7
      'ROTATE_CCW', // 8
      'ROTATE_CCW', // 9: dir 3 (ready at source)
      'REPEAT',     // 10: Loop
    ],
  },
};

/**
 * Level 4: Tracks.
 * A single arm rides a horizontal track, picking up a LEAD atom and sliding it
 * (together with the held molecule) across to the output sink.
 */
export const LEVEL_4_TRACK: LevelConfig = {
  id: 'level-4-track',
  kind: 'poc',
  name: 'Lekcja 4: Szyny Transportowe (Sliding Rail)',
  description:
    'Ramię porusza się po szynie (TRACK_POS / TRACK_NEG). Chwyć atom Ołowiu na jednym końcu szyny, a następnie przesuń podstawę ramienia, aby dostarczyć atom do ujścia.',
  targetRequired: 5,
  glyphs: [
    createInputGlyph('input-lead', { q: -2, r: 0 }, 'LEAD'),
    createOutputGlyph('output-lead', { q: 2, r: 0 }, {
      name: 'Ołów (Pb)',
      elements: ['LEAD'],
      relativeHexOffsets: [{ q: 0, r: 0 }],
      bonds: [],
    }),
  ],
  tracks: [
    {
      id: 'track-main',
      path: [
        { q: -1, r: 0 },
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
      ],
    },
  ],
  initialArms: [
    {
      ...createArm({
        id: 'arm-1',
        basePos: { q: -1, r: 0 },
        rotation: 3,
        length: 1,
      }),
      trackId: 'track-main',
      trackIndex: 0,
    },
  ],
  defaultInstructions: {
    'arm-1': [
      'GRAB',      // 0: Grab LEAD at (-2,0) [gripper dir3]
      'TRACK_POS', // 1: slide base -> (0,0), atom -> (1,0)-... follows
      'TRACK_POS', // 2: base -> (1,0)
      'TRACK_POS', // 3: base -> (2,0)
      'TRACK_POS', // 4: base -> (3,0), atom -> (2,0) [OUTPUT consumes it]
      'DROP',      // 5: release
      'TRACK_NEG', // 6: slide back
      'TRACK_NEG', // 7
      'TRACK_NEG', // 8
      'TRACK_NEG', // 9: back to start
      'REPEAT',    // 10: loop
    ],
  },
};

/** The 4 alchemical PoC levels (teaching levels, not economy recipes). */
export const POC_LEVELS: readonly LevelConfig[] = [
  LEVEL_1_DIMER,
  LEVEL_2_WATER,
  LEVEL_3_TRANSMUTE,
  LEVEL_4_TRACK,
];
