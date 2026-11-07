// Fabryka atanorowa: what each building level allows (doc §8.1), machine validation
// (doc §8.5 p. 5 "limity zależne od poziomu budynku") and the machine's bill of materials (§8.2).
// New in web-game. Takt and power per level live in the economy module (economy-model.ts).
import { HexCoord, hexDistance, hexKey } from '../grid/hex';
import { glyphCells, isPortGlyph } from './glyph';
import { AtanorSolution, GlyphType, LevelConfig } from './types';

export type PlayerGlyphType = Exclude<GlyphType, 'INPUT' | 'OUTPUT'>;

export interface AtanorBuildingLevel {
  readonly level: number;
  /** Board = hexes within this distance of (0,0). */
  readonly boardRadius: number;
  readonly boardHexes: number;
  readonly maxArms: number;
  readonly maxArmLength: number;
  readonly pistons: boolean;
  readonly glyphs: readonly PlayerGlyphType[];
  readonly tracks: boolean;
  /** L4+: multi-gripper arms (§8.1). Not implemented by the engine yet. */
  readonly multiArms: boolean;
  /** L5: second board with its own program (§8.1). Not implemented by the engine yet. */
  readonly boards: number;
}

/** §8.1 table "Poziomy budynku = możliwości maszyny". */
export const ATANOR_BUILDING_LEVELS: readonly AtanorBuildingLevel[] = [
  { level: 1, boardRadius: 2, boardHexes: 19, maxArms: 3, maxArmLength: 2, pistons: true, glyphs: ['BONDER', 'UNBONDER'], tracks: false, multiArms: false, boards: 1 },
  { level: 2, boardRadius: 3, boardHexes: 37, maxArms: 4, maxArmLength: 2, pistons: true, glyphs: ['BONDER', 'UNBONDER', 'TRANSMUTE'], tracks: false, multiArms: false, boards: 1 },
  { level: 3, boardRadius: 4, boardHexes: 61, maxArms: 6, maxArmLength: 3, pistons: true, glyphs: ['BONDER', 'UNBONDER', 'TRANSMUTE'], tracks: true, multiArms: false, boards: 1 },
  { level: 4, boardRadius: 5, boardHexes: 91, maxArms: 8, maxArmLength: 3, pistons: true, glyphs: ['BONDER', 'UNBONDER', 'TRANSMUTE'], tracks: true, multiArms: true, boards: 1 },
  { level: 5, boardRadius: 6, boardHexes: 127, maxArms: 10, maxArmLength: 3, pistons: true, glyphs: ['BONDER', 'UNBONDER', 'TRANSMUTE'], tracks: true, multiArms: true, boards: 2 },
];

export function getAtanorBuildingLevel(level: number): AtanorBuildingLevel | undefined {
  return ATANOR_BUILDING_LEVELS.find(l => l.level === level);
}

export type MachineIssueCode =
  | 'UNKNOWN_BUILDING_LEVEL'
  | 'RECIPE_LOCKED'
  | 'TOO_MANY_ARMS'
  | 'ARM_TOO_LONG'
  | 'PISTON_LOCKED'
  | 'GLYPH_LOCKED'
  | 'TRACKS_LOCKED'
  | 'OFF_BOARD';

export interface MachineIssue {
  readonly code: MachineIssueCode;
  readonly message: string;
  /** Arm, glyph or track id the issue refers to. */
  readonly elementId?: string;
}

const ORIGIN: HexCoord = { q: 0, r: 0 };

/**
 * Checks a machine (level ports + player solution) against the limits of a building level.
 * Static placement only: grippers and moving atoms are not checked (open question in README).
 */
export function validateMachine(level: LevelConfig, solution: AtanorSolution, buildingLevel: number): MachineIssue[] {
  const limits = getAtanorBuildingLevel(buildingLevel);
  if (!limits) {
    return [{ code: 'UNKNOWN_BUILDING_LEVEL', message: `Unknown Fabryka atanorowa level ${buildingLevel}` }];
  }
  const issues: MachineIssue[] = [];
  const offBoard = (pos: HexCoord) => hexDistance(pos, ORIGIN) > limits.boardRadius;

  if (level.recipe && level.recipe.buildingLevel > buildingLevel) {
    issues.push({
      code: 'RECIPE_LOCKED',
      message: `Recipe ${level.recipe.recipeId} needs building level ${level.recipe.buildingLevel}`,
    });
  }
  if (solution.arms.length > limits.maxArms) {
    issues.push({ code: 'TOO_MANY_ARMS', message: `${solution.arms.length} arms, max ${limits.maxArms}` });
  }
  for (const arm of solution.arms) {
    if (arm.length > limits.maxArmLength) {
      issues.push({ code: 'ARM_TOO_LONG', message: `Arm length ${arm.length}, max ${limits.maxArmLength}`, elementId: arm.id });
    }
    if (arm.isPiston && !limits.pistons) {
      issues.push({ code: 'PISTON_LOCKED', message: 'Pistons are not available', elementId: arm.id });
    }
    if (arm.trackId && !limits.tracks) {
      issues.push({ code: 'TRACKS_LOCKED', message: 'Tracks are not available', elementId: arm.id });
    }
    if (offBoard(arm.basePos)) {
      issues.push({ code: 'OFF_BOARD', message: `Arm base ${hexKey(arm.basePos)} is off the board`, elementId: arm.id });
    }
  }
  for (const glyph of [...level.glyphs.filter(isPortGlyph), ...solution.glyphs]) {
    if (!isPortGlyph(glyph) && !limits.glyphs.includes(glyph.type)) {
      issues.push({ code: 'GLYPH_LOCKED', message: `${glyph.type} is not available`, elementId: glyph.id });
    }
    const outside = glyphCells(glyph).find(offBoard);
    if (outside) {
      issues.push({ code: 'OFF_BOARD', message: `Glyph cell ${hexKey(outside)} is off the board`, elementId: glyph.id });
    }
  }
  for (const track of solution.tracks) {
    if (!limits.tracks) {
      issues.push({ code: 'TRACKS_LOCKED', message: 'Tracks are not available', elementId: track.id });
    }
    const outside = track.path.find(offBoard);
    if (outside) {
      issues.push({ code: 'OFF_BOARD', message: `Track cell ${hexKey(outside)} is off the board`, elementId: track.id });
    }
  }
  return issues;
}

function add(bill: Record<string, number>, material: string, units: number): void {
  bill[material] = (bill[material] ?? 0) + units;
}

/**
 * Materials needed to build the machine (§8.2): arm L1 = 4 STA + 1 SLN; length 2 +2 STA;
 * length 3 +4 STA + 1 STP; piston +1 SLN; Bonder/Unbonder 2 PRZ + 1 UKL; transmutation
 * 1 NAD + 1 UKL; track 1 STA per hex (proposed in §8.2, free in the PoC). Ports are free.
 */
export function machineMaterials(solution: AtanorSolution): Record<string, number> {
  const bill: Record<string, number> = {};
  for (const arm of solution.arms) {
    add(bill, 'STA', 4);
    add(bill, 'SLN', 1);
    if (arm.length === 2) add(bill, 'STA', 2);
    if (arm.length === 3) {
      add(bill, 'STA', 4);
      add(bill, 'STP', 1);
    }
    if (arm.isPiston) add(bill, 'SLN', 1);
  }
  for (const glyph of solution.glyphs) {
    if (glyph.type === 'BONDER' || glyph.type === 'UNBONDER') {
      add(bill, 'PRZ', 2);
      add(bill, 'UKL', 1);
    } else if (glyph.type === 'TRANSMUTE') {
      add(bill, 'NAD', 1);
      add(bill, 'UKL', 1);
    }
  }
  const trackHexes = new Set(solution.tracks.flatMap(t => t.path.map(hexKey))).size;
  if (trackHexes > 0) add(bill, 'STA', trackHexes);
  return bill;
}
