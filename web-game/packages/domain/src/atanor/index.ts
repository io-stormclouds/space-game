// Public API of the Atanor puzzle engine (ported from poc/space-atanor/src/core, see README.md).
// Framework-free and deterministic: no Angular, no PixiJS, no DOM, no Math.random.

// Game-facing API
export {
  ATANOR_LEVELS,
  composeLevel,
  createAtanorSimulation,
  emptySolution,
  findRecipeLevel,
  getAtanorLevel,
  getLevelPorts,
  getReferenceSolution,
  levelKind,
  listAtanorLevels,
  listRecipeLevels,
  measureAtanorSolution,
  runAtanorSimulation,
  toAtanorSpec,
} from './api';
export type { CreateSimulationOptions } from './api';

// Engine
export { SimulationEngine } from './engine/simulation';
export type { SimulationOptions, SimulationStats } from './engine/simulation';
export { executeTick } from './engine/pipeline';
export type { TickContext } from './engine/pipeline';
export {
  cloneArm,
  createArm,
  EXTRA_GRIPPER_COST,
  getArmCost,
  getGripperPosition,
  getGripperPositions,
  getHeldAtomIds,
  GRIPPER_COUNTS,
  gripperCount,
  gripperRotations,
  setHeldAtomIds,
} from './engine/arm';
export {
  distanceSquared,
  hexToPoint,
  motionEnd,
  motionPoint,
  pointToHex,
  sweptHexes,
  TRAJECTORY_CLEARANCE,
  TRAJECTORY_SUBSTEPS,
} from './engine/trajectory';
export type { Motion, Point } from './engine/trajectory';
export {
  createBonderGlyph,
  createInputGlyph,
  createOutputGlyph,
  createTransmuteGlyph,
  createUnbonderGlyph,
  getGlyphCost,
  glyphCells,
  isPortGlyph,
} from './engine/glyph';
export {
  LEVEL_1_DIMER,
  LEVEL_2_POC_BROKEN_PROGRAM,
  LEVEL_2_WATER,
  LEVEL_3_TRANSMUTE,
  LEVEL_4_TRACK,
  POC_LEVELS,
} from './engine/levels';
export { LEVEL_A_KAP, LEVEL_A_KAT, LEVEL_A_MET, LEVEL_A_NAD, LEVEL_A_PRO, RECIPE_LEVELS } from './engine/recipes';
export { machineStateKey, measureThroughput } from './engine/throughput';
export type { ThroughputMetrics, ThroughputProblem } from './engine/throughput';
export {
  ATANOR_BUILDING_LEVELS,
  EXTRA_GRIPPER_MATERIALS,
  getAtanorBuildingLevel,
  machineMaterials,
  validateMachine,
} from './engine/building';
export type { AtanorBuildingLevel, MachineIssue, MachineIssueCode, PlayerGlyphType } from './engine/building';
export type {
  ArmCommand,
  ArmState,
  AtanorLevelKind,
  AtanorRecipeInfo,
  AtanorSnapshot,
  AtanorSolution,
  BaseGlyph,
  BonderGlyph,
  Glyph,
  GlyphType,
  InputReagentGlyph,
  JamDetail,
  JamReason,
  LevelConfig,
  OutputProduct,
  OutputProductGlyph,
  PortGlyph,
  SimulationStepResult,
  TrackSegment,
  TransmuteGlyph,
  UnbonderGlyph,
} from './engine/types';

// Molecules and atoms
export { MoleculeGraph, createBondKey } from './graph/molecule';
export type { Atom, Bond, Molecule } from './graph/molecule';
export {
  ACTIVATED_ATOM_TYPES,
  ATANOR_MATERIAL_CODES,
  POC_ATOM_TYPES,
  isMaterialAtom,
} from './graph/atom-types';
export type {
  ActivatedAtomType,
  AtanorMaterialCode,
  AtomType,
  MaterialAtomType,
  PocAtomType,
} from './graph/atom-types';

// Hex grid
export {
  HEX_DIRECTIONS,
  hexAdd,
  hexAllNeighbors,
  hexCreate,
  hexDirection,
  hexDistance,
  hexEquals,
  hexFrom3D,
  hexFromKey,
  hexKey,
  hexNeighbor,
  hexRotateAround,
  hexRotateCCW,
  hexRotateCW,
  hexRound,
  hexScale,
  hexSubtract,
  hexTo3D,
  hexToPixel,
  pixelToHex,
} from './grid/hex';
export type { HexCoord, HexCoord3D } from './grid/hex';

// Machine editor (AT2)
export * from './editor/index';
