import { describe, expect, it } from 'vitest';
import { Atanor } from '@space-game/domain';
import { AtanorEditor, createAtanorEditor, initialDraft } from './editor';

const nad = () => Atanor.findRecipeLevel('A_NAD')!;

describe('Atanor editor state (AT2)', () => {
  it('starts a building project from the hint (A21) and the sandbox from the reference', () => {
    const inBuilding = initialDraft(nad(), true);
    expect(inBuilding.arms.length).toBeGreaterThan(0);
    expect(inBuilding.glyphs).toEqual([]);
    expect(Object.values(inBuilding.program).every((t) => t.length === 0)).toBe(true);
    expect(initialDraft(Atanor.findRecipeLevel('A_KAT')!, true)).toEqual(Atanor.emptySolution());
    expect(Atanor.solutionKey(initialDraft(nad(), false))).toBe(Atanor.solutionKey(Atanor.getReferenceSolution(nad())));
  });

  it('cycles the arm length within the building limit and toggles bonder / unbonder', () => {
    const e = createAtanorEditor('A_NAD', 1)!;
    e.setTool('ARM');
    expect(e.armLength).toBe(1);
    e.setTool('ARM');
    expect(e.armLength).toBe(2);
    e.setTool('ARM');
    expect(e.armLength).toBe(1); // L1 allows arms up to 2
    e.setTool('BONDER');
    e.setTool('BONDER');
    expect(e.tool).toBe('UNBONDER');
    e.setTool('TRACK'); // locked on L1
    expect(e.tool).toBe('UNBONDER');
    expect(e.lockOf('TRACK')).toEqual({ level: 3 });
    expect(e.lockOf('TRANSMUTE')).toEqual({ recipe: true });
    expect(e.lockOf('ARM')).toBeNull();
  });

  it('shows a ghost that says whether the element fits, and keeps the reason of a refused edit', () => {
    const e = new AtanorEditor(nad(), 1);
    e.setTool('BONDER');
    e.setHover({ q: 1, r: 0 }); // (1,0)–(2,0), both on the L1 board
    expect(e.ghost()).toMatchObject({ tool: 'BONDER', hex: { q: 1, r: 0 }, valid: true });
    e.setHover({ q: 2, r: 1 }); // distance 3: off the L1 board (radius 2)
    expect(e.ghost()?.valid).toBe(false);
    expect(e.apply({ q: 2, r: 1 })).toBe(false);
    expect(e.issue).toBe('OFF_BOARD');
    e.setTool('SELECT');
    expect(e.ghost()).toBeNull();
  });

  it('undoes and redoes board and timeline edits; an edit after an undo drops the redo branch', () => {
    const e = new AtanorEditor(nad(), 1);
    const start = Atanor.solutionKey(e.solution);
    e.setTool('BONDER');
    expect(e.apply({ q: 0, r: 0 })).toBe(true);
    const arm = e.solution.arms[0]!.id;
    e.setCommand(arm, 0, 'GRAB');
    expect(e.solution.program[arm]).toEqual(['GRAB']);
    expect(e.solution.glyphs).toHaveLength(1);
    e.undo();
    expect(e.solution.program[arm]).toEqual([]);
    e.undo();
    expect(Atanor.solutionKey(e.solution)).toBe(start);
    expect(e.canUndo).toBe(false);
    e.redo();
    expect(e.solution.glyphs).toHaveLength(1);
    expect(e.canRedo).toBe(true);
    e.setCommand(arm, 1, 'DROP');
    expect(e.canRedo).toBe(false);
    const v = e.version;
    e.setCommand(arm, 3, null); // no change: no history entry
    expect(e.version).toBe(v);
  });

  it('turns the ghost with R while a tool is active and the selected arm without one', () => {
    const e = new AtanorEditor(nad(), 1);
    const arm = e.solution.arms[0]!;
    e.setTool('ARM');
    e.rotate();
    expect(e.rotation).toBe(1);
    e.setTool('SELECT');
    e.apply(arm.basePos);
    expect(e.selected).toEqual({ kind: 'ARM', id: arm.id });
    e.rotate();
    expect(e.solution.arms[0]!.rotation).toBe((arm.rotation + 1) % 6);
  });
});
