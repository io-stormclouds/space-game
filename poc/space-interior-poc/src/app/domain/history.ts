import { applyChange, invertChange, isEmptyChange, type Change, type Layout } from './layout';

/** One undoable edit. A whole drag (rectangle, line, move) is one command. */
export interface Command {
  readonly label: string;
  readonly change: Change;
}

export interface History {
  readonly past: readonly Command[];
  readonly future: readonly Command[];
}

export const HISTORY_LIMIT = 200;
export const EMPTY_HISTORY: History = { past: [], future: [] };

export interface Step {
  readonly layout: Layout;
  readonly history: History;
  /** The command that was done/undone/redone, if any. */
  readonly command?: Command;
}

export function execute(layout: Layout, history: History, command: Command): Step {
  if (isEmptyChange(command.change)) return { layout, history };
  return {
    layout: applyChange(layout, command.change),
    history: { past: [...history.past, command].slice(-HISTORY_LIMIT), future: [] },
    command,
  };
}

export function undo(layout: Layout, history: History): Step {
  const command = history.past.at(-1);
  if (!command) return { layout, history };
  return {
    layout: applyChange(layout, invertChange(command.change)),
    history: { past: history.past.slice(0, -1), future: [command, ...history.future] },
    command,
  };
}

export function redo(layout: Layout, history: History): Step {
  const command = history.future[0];
  if (!command) return { layout, history };
  return {
    layout: applyChange(layout, command.change),
    history: { past: [...history.past, command], future: history.future.slice(1) },
    command,
  };
}
