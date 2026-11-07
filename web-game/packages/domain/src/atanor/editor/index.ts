// Machine editor (AT2): pure operations on a solution, used by the client editor and checked again
// by the server when a machine is deployed (AT4).
export {
  allowedTools,
  deleteColumn,
  elementAt,
  extendTrack,
  hintSolution,
  insertColumn,
  levelTransmutations,
  limitsOf,
  maxArmLength,
  moveArm,
  pasteCommands,
  placeArm,
  placeGlyph,
  programIssues,
  programLength,
  removeAt,
  rotateAt,
  setArmLength,
  setCommand,
  solutionKey,
} from './solution-edit';
export type { ArmSpec, EditContext, EditIssue, EditResult, EditTool, ElementRef, ProgramIssue, ProgramIssueCode } from './solution-edit';
