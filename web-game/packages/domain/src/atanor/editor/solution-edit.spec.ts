import { describe, expect, it } from 'vitest';
import { getLevelPorts, getReferenceSolution, emptySolution, measureAtanorSolution } from '../api';
import { validateMachine } from '../engine/building';
import { LEVEL_A_KAT, LEVEL_A_NAD } from '../engine/recipes';
import { hexEquals, hexNeighbor } from '../grid/hex';
import type { AtanorSolution } from '../engine/types';
import {
  allowedTools,
  deleteColumn,
  elementAt,
  extendTrack,
  hintSolution,
  insertColumn,
  placeArm,
  placeGlyph,
  programIssues,
  programLength,
  removeAt,
  rotateAt,
  setCommand,
  solutionKey,
  type EditResult,
} from './solution-edit';

const L1 = { level: LEVEL_A_NAD, buildingLevel: 1 };
const ok = (r: EditResult): AtanorSolution => {
  if (!r.ok) throw new Error(`edit failed: ${r.issue}`);
  return r.solution;
};

describe('machine editor (AT2)', () => {
  it('places arms within the limits of the building level (§8.1)', () => {
    let s = emptySolution();
    s = ok(placeArm(L1, s, { hex: { q: 1, r: 1 }, rotation: 0, length: 1 }));
    expect(s.arms).toHaveLength(1);
    expect(s.program[s.arms[0]!.id]).toEqual([]);
    expect(placeArm(L1, s, { hex: { q: 1, r: 1 }, rotation: 0, length: 1 })).toEqual({ ok: false, issue: 'OCCUPIED' });
    expect(placeArm(L1, s, { hex: { q: 3, r: 0 }, rotation: 0, length: 1 })).toEqual({ ok: false, issue: 'OFF_BOARD' });
    expect(placeArm(L1, s, { hex: { q: 0, r: 1 }, rotation: 0, length: 3 })).toEqual({ ok: false, issue: 'TOO_LONG' });
    expect(placeArm(L1, s, { hex: { q: 0, r: 1 }, rotation: 0, length: 1, grippers: 2 })).toEqual({ ok: false, issue: 'LOCKED' });
    const port = getLevelPorts(LEVEL_A_NAD)[0]!;
    expect(placeArm(L1, s, { hex: port.pos, rotation: 0, length: 1 })).toEqual({ ok: false, issue: 'PORT' });
    s = ok(placeArm(L1, s, { hex: { q: 1, r: 0 }, rotation: 0, length: 2 }));
    s = ok(placeArm(L1, s, { hex: { q: 2, r: -2 }, rotation: 0, length: 1, piston: true }));
    expect(placeArm(L1, s, { hex: { q: -2, r: 2 }, rotation: 0, length: 1 })).toEqual({ ok: false, issue: 'TOO_MANY_ARMS' });
  });

  it('offers only the tools the building level and the recipe allow', () => {
    expect(allowedTools(L1)).toEqual(['ARM', 'PISTON', 'BONDER', 'UNBONDER', 'DELETE']);
    expect(allowedTools({ level: LEVEL_A_KAT, buildingLevel: 2 })).toContain('TRANSMUTE');
    expect(allowedTools({ level: LEVEL_A_KAT, buildingLevel: 3 })).toEqual(expect.arrayContaining(['TRANSMUTE', 'TRACK']));
    expect(placeGlyph(L1, emptySolution(), 'TRANSMUTE', { q: 0, r: 1 }, 0)).toEqual({ ok: false, issue: 'NO_TRANSMUTATION' });
    const kat = ok(placeGlyph({ level: LEVEL_A_KAT, buildingLevel: 2 }, emptySolution(), 'TRANSMUTE', { q: 1, r: 1 }, 0));
    expect(kat.glyphs[0]).toMatchObject({ type: 'TRANSMUTE', fromElement: 'PLA', toElement: 'PLA*' });
    expect(extendTrack(L1, emptySolution(), { q: 0, r: 1 })).toEqual({ ok: false, issue: 'LOCKED' });
  });

  it('places, turns and removes bonders; ports cannot be removed', () => {
    let s = ok(placeGlyph(L1, emptySolution(), 'BONDER', { q: 1, r: 1 }, 3));
    const g = s.glyphs[0]!;
    expect(g.type === 'BONDER' && hexEquals(g.pos2, hexNeighbor({ q: 1, r: 1 }, 3))).toBe(true);
    expect(elementAt(LEVEL_A_NAD, s, hexNeighbor({ q: 1, r: 1 }, 3))).toEqual({ kind: 'GLYPH', id: g.id, port: false });
    s = ok(rotateAt(L1, s, { q: 1, r: 1 }, 1));
    const turned = s.glyphs[0]!;
    expect(turned.type === 'BONDER' && hexEquals(turned.pos2, hexNeighbor({ q: 1, r: 1 }, 4))).toBe(true);
    expect(removeAt(L1, s, getLevelPorts(LEVEL_A_NAD)[0]!.pos)).toEqual({ ok: false, issue: 'PORT' });
    s = ok(removeAt(L1, s, { q: 1, r: 1 }));
    expect(s.glyphs).toEqual([]);
    expect(removeAt(L1, s, { q: 1, r: 1 })).toEqual({ ok: false, issue: 'NOTHING_HERE' });
  });

  it('draws tracks from L3; an arm on a track rides it; removing an end shortens it', () => {
    const L3 = { level: LEVEL_A_NAD, buildingLevel: 3 };
    let s = ok(extendTrack(L3, emptySolution(), { q: 2, r: 1 }));
    s = ok(extendTrack(L3, s, { q: 3, r: 0 }));
    s = ok(extendTrack(L3, s, { q: 3, r: -1 }));
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0]!.path).toHaveLength(3);
    s = ok(placeArm(L3, s, { hex: { q: 3, r: 0 }, rotation: 3, length: 1 }));
    expect(s.arms[0]).toMatchObject({ trackId: s.tracks[0]!.id, trackIndex: 1 });
    s = ok(removeAt(L3, ok(removeAt(L3, s, { q: 3, r: 0 })), { q: 3, r: -1 }));
    expect(s.tracks[0]!.path).toEqual([{ q: 2, r: 1 }, { q: 3, r: 0 }]);
  });

  it('edits the program: cells, inserted and deleted columns, commands an arm cannot run', () => {
    let s = ok(placeArm(L1, emptySolution(), { hex: { q: 1, r: 1 }, rotation: 0, length: 1 }));
    const id = s.arms[0]!.id;
    s = setCommand(s, id, 0, 'GRAB');
    s = setCommand(s, id, 2, 'EXTEND');
    expect(s.program[id]).toEqual(['GRAB', null, 'EXTEND']);
    expect(programLength(s)).toBe(3);
    expect(programIssues(s)).toEqual([{ armId: id, column: 2, code: 'NO_PISTON' }]);
    s = insertColumn(s, 1);
    expect(s.program[id]).toEqual(['GRAB', null, null, 'EXTEND']);
    s = deleteColumn(s, 3);
    expect(s.program[id]).toEqual(['GRAB']);
    s = setCommand(s, id, 0, null);
    expect(s.program[id]).toEqual([]);
  });

  it('rebuilds the A_NAD reference machine from its hint with editor operations only', () => {
    const ref = getReferenceSolution(LEVEL_A_NAD);
    let s = hintSolution(ref);
    expect(s.arms).toHaveLength(ref.arms.length);
    expect(Object.values(s.program).every((t) => t.length === 0)).toBe(true);
    for (const g of ref.glyphs) {
      if (g.type !== 'BONDER' && g.type !== 'UNBONDER') throw new Error('A_NAD uses bonders only');
      const dir = [0, 1, 2, 3, 4, 5].find((d) => hexEquals(hexNeighbor(g.pos, d), g.pos2))!;
      s = ok(placeGlyph(L1, s, g.type, g.pos, dir));
    }
    for (const [armId, tape] of Object.entries(ref.program)) tape.forEach((cmd, col) => (s = setCommand(s, armId, col, cmd)));
    expect(validateMachine(LEVEL_A_NAD, s, 1)).toEqual([]);
    const built = measureAtanorSolution(LEVEL_A_NAD, s);
    const reference = measureAtanorSolution(LEVEL_A_NAD, ref);
    expect(built.ok).toBe(true);
    expect({ cycles: built.cyclesPerOutput, area: built.area, arms: built.arms }).toEqual({ cycles: reference.cyclesPerOutput, area: reference.area, arms: reference.arms });
    expect(solutionKey(s)).not.toBe(solutionKey(hintSolution(ref)));
  });
});
