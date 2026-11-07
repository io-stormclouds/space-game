// Editing a machine (AT2, docs/atanor-expansion-design.md §5.1–5.2): pure operations on an
// AtanorSolution. Every operation returns a new solution or the reason it cannot be done; the
// input is never changed. Rules taken from the PoC editor (poc/space-atanor game-state.service.ts:
// one arm base per hex, ports cannot be removed) plus the building limits of §8.1.
import { cloneArm, createArm } from '../engine/arm';
import { createBonderGlyph, createTransmuteGlyph, createUnbonderGlyph, glyphCells, isPortGlyph } from '../engine/glyph';
import { getAtanorBuildingLevel, type AtanorBuildingLevel } from '../engine/building';
import type { ArmCommand, ArmState, AtanorSolution, Glyph, LevelConfig, TrackSegment } from '../engine/types';
import type { AtomType } from '../graph/molecule';
import { HexCoord, hexDistance, hexEquals, hexKey, hexNeighbor } from '../grid/hex';

export type EditTool = 'ARM' | 'PISTON' | 'MULTI' | 'BONDER' | 'UNBONDER' | 'TRANSMUTE' | 'TRACK' | 'DELETE';

export type EditIssue =
  /** Another element stands on the hex. */
  | 'OCCUPIED'
  /** The hex belongs to an input or output port (fixed by the recipe, A20). */
  | 'PORT'
  /** Outside the board of the building level. */
  | 'OFF_BOARD'
  /** The building level does not allow the element (§8.1). */
  | 'LOCKED'
  /** As many arms as the building level allows. */
  | 'TOO_MANY_ARMS'
  /** Longer than the building level allows. */
  | 'TOO_LONG'
  /** The recipe needs no transmutation. */
  | 'NO_TRANSMUTATION'
  /** Nothing to remove or rotate there. */
  | 'NOTHING_HERE';

export type EditResult = { readonly ok: true; readonly solution: AtanorSolution; readonly elementId?: string } | { readonly ok: false; readonly issue: EditIssue };

/** Board and limits the editor works with: a building level, or the level's own content (sandbox). */
export interface EditContext {
  readonly level: LevelConfig;
  /** Fabryka atanorowa level (§8.1); null = no limits (PoC levels in the sandbox). */
  readonly buildingLevel: number | null;
}

export type ElementRef =
  | { readonly kind: 'ARM'; readonly id: string }
  | { readonly kind: 'GLYPH'; readonly id: string; readonly port: boolean }
  | { readonly kind: 'TRACK'; readonly id: string };

const ORIGIN: HexCoord = { q: 0, r: 0 };
const ARM_LENGTHS = [1, 2, 3] as const;

export function limitsOf(ctx: EditContext): AtanorBuildingLevel | null {
  return ctx.buildingLevel !== null ? getAtanorBuildingLevel(ctx.buildingLevel) ?? null : null;
}

/** Tools the building level allows (all of them without limits). */
export function allowedTools(ctx: EditContext): EditTool[] {
  const lim = limitsOf(ctx);
  const tools: EditTool[] = ['ARM', 'PISTON', 'MULTI', 'BONDER', 'UNBONDER', 'TRANSMUTE', 'TRACK', 'DELETE'];
  if (!lim) return tools.filter((t) => t !== 'TRANSMUTE' || levelTransmutations(ctx.level).length > 0);
  return tools.filter((t) => {
    if (t === 'PISTON') return lim.pistons;
    if (t === 'MULTI') return lim.multiArms;
    if (t === 'TRACK') return lim.tracks;
    if (t === 'TRANSMUTE') return lim.glyphs.includes('TRANSMUTE') && levelTransmutations(ctx.level).length > 0;
    if (t === 'BONDER' || t === 'UNBONDER') return lim.glyphs.includes(t);
    return true;
  });
}

/** Longest arm the building level allows. */
export function maxArmLength(ctx: EditContext): number {
  return limitsOf(ctx)?.maxArmLength ?? 3;
}

/** Transmutations the level needs (from its reference machine), e.g. PLA → PLA*. */
export function levelTransmutations(level: LevelConfig): Array<{ from: AtomType; to: AtomType }> {
  const out: Array<{ from: AtomType; to: AtomType }> = [];
  for (const g of level.glyphs) {
    if (g.type === 'TRANSMUTE' && !out.some((t) => t.from === g.fromElement && t.to === g.toElement)) out.push({ from: g.fromElement, to: g.toElement });
  }
  return out;
}

/**
 * What stands on a hex, in the order a click acts on it: arm base, the player's latest glyph
 * there, a port, a track.
 */
export function elementAt(level: LevelConfig, solution: AtanorSolution, hex: HexCoord): ElementRef | null {
  const arm = solution.arms.find((a) => hexEquals(a.basePos, hex));
  if (arm) return { kind: 'ARM', id: arm.id };
  const glyph = [...solution.glyphs].reverse().find((g) => !isPortGlyph(g) && glyphCells(g).some((c) => hexEquals(c, hex)));
  if (glyph) return { kind: 'GLYPH', id: glyph.id, port: false };
  const port = level.glyphs.find((g) => isPortGlyph(g) && glyphCells(g).some((c) => hexEquals(c, hex)));
  if (port) return { kind: 'GLYPH', id: port.id, port: true };
  const track = solution.tracks.find((t) => t.path.some((p) => hexEquals(p, hex)));
  if (track) return { kind: 'TRACK', id: track.id };
  return null;
}

function offBoard(ctx: EditContext, hex: HexCoord): boolean {
  const lim = limitsOf(ctx);
  return lim !== null && hexDistance(hex, ORIGIN) > lim.boardRadius;
}

function nextId(prefix: string, taken: ReadonlyArray<{ id: string }>): string {
  const ids = new Set(taken.map((e) => e.id));
  let i = taken.length + 1;
  while (ids.has(`${prefix}-${i}`)) i += 1;
  return `${prefix}-${i}`;
}

/**
 * Can this element take the hex? Rules read from the reference machines: three bonders of A_NAD
 * share the PLA input hex, the L4 track runs over the output port. So:
 * - an arm base needs a hex without arm base, glyph cell or port (a track is fine: the arm rides it);
 * - a bonder or unbonder cell may lie on an input port or on another bonder (not on the same pair),
 *   but not on an arm base, an output port or a transmuter;
 * - a transmuter needs a hex without arm base, glyph cell or port.
 */
function cellIssue(ctx: EditContext, solution: AtanorSolution, hex: HexCoord, kind: 'ARM' | 'BOND' | 'TRANSMUTE'): EditIssue | null {
  if (offBoard(ctx, hex)) return 'OFF_BOARD';
  if (solution.arms.some((a) => hexEquals(a.basePos, hex))) return 'OCCUPIED';
  for (const g of ctx.level.glyphs) {
    if (!isPortGlyph(g) || !glyphCells(g).some((c) => hexEquals(c, hex))) continue;
    if (!(kind === 'BOND' && g.type === 'INPUT')) return 'PORT';
  }
  for (const g of solution.glyphs) {
    if (isPortGlyph(g) || !glyphCells(g).some((c) => hexEquals(c, hex))) continue;
    if (!(kind === 'BOND' && (g.type === 'BONDER' || g.type === 'UNBONDER'))) return 'OCCUPIED';
  }
  return null;
}

function samePair(a: Glyph, b: Glyph): boolean {
  if ((a.type !== 'BONDER' && a.type !== 'UNBONDER') || (b.type !== 'BONDER' && b.type !== 'UNBONDER')) return false;
  return (hexEquals(a.pos, b.pos) && hexEquals(a.pos2, b.pos2)) || (hexEquals(a.pos, b.pos2) && hexEquals(a.pos2, b.pos));
}

function withSolution(s: AtanorSolution, patch: Partial<AtanorSolution>): AtanorSolution {
  return {
    arms: (patch.arms ?? s.arms).map(cloneArm),
    glyphs: (patch.glyphs ?? s.glyphs).map((g) => ({ ...g })),
    tracks: (patch.tracks ?? s.tracks).map((t) => ({ id: t.id, path: t.path.map((p) => ({ ...p })) })),
    program: Object.fromEntries(Object.entries(patch.program ?? s.program).map(([k, v]) => [k, [...v]])),
  };
}

export interface ArmSpec {
  readonly hex: HexCoord;
  readonly rotation: number;
  readonly length: number;
  readonly piston?: boolean;
  /** 2, 3 or 6 for a multi-gripper arm (L4+). */
  readonly grippers?: number;
}

/** Places an arm; on a track hex the arm rides that track. Its program starts empty. */
export function placeArm(ctx: EditContext, solution: AtanorSolution, spec: ArmSpec): EditResult {
  const lim = limitsOf(ctx);
  if (lim && solution.arms.length >= lim.maxArms) return { ok: false, issue: 'TOO_MANY_ARMS' };
  if (spec.length > maxArmLength(ctx) || !ARM_LENGTHS.includes(spec.length as 1 | 2 | 3)) return { ok: false, issue: 'TOO_LONG' };
  if (spec.piston && lim && !lim.pistons) return { ok: false, issue: 'LOCKED' };
  if ((spec.grippers ?? 1) > 1 && lim && !lim.multiArms) return { ok: false, issue: 'LOCKED' };
  const issue = cellIssue(ctx, solution, spec.hex, 'ARM');
  if (issue) return { ok: false, issue };
  const id = nextId('arm', solution.arms);
  const arm: ArmState = createArm({
    id,
    basePos: spec.hex,
    rotation: ((spec.rotation % 6) + 6) % 6,
    length: spec.length,
    isPiston: !!spec.piston,
    ...((spec.grippers ?? 1) > 1 ? { grippers: spec.grippers } : {}),
  });
  const track = solution.tracks.find((t) => t.path.some((p) => hexEquals(p, spec.hex)));
  if (track) {
    arm.trackId = track.id;
    arm.trackIndex = track.path.findIndex((p) => hexEquals(p, spec.hex));
  }
  return { ok: true, solution: withSolution(solution, { arms: [...solution.arms, arm], program: { ...solution.program, [id]: [] } }), elementId: id };
}

/** Places a glyph: bonders over the hex and its neighbour in `rotation`, a transmuter on one hex. */
export function placeGlyph(ctx: EditContext, solution: AtanorSolution, type: 'BONDER' | 'UNBONDER' | 'TRANSMUTE', hex: HexCoord, rotation: number): EditResult {
  if (!allowedTools(ctx).includes(type)) return { ok: false, issue: type === 'TRANSMUTE' && levelTransmutations(ctx.level).length === 0 ? 'NO_TRANSMUTATION' : 'LOCKED' };
  const id = nextId(type.toLowerCase(), [...ctx.level.glyphs, ...solution.glyphs]);
  let glyph: Glyph;
  if (type === 'TRANSMUTE') {
    const t = levelTransmutations(ctx.level)[0]!;
    glyph = createTransmuteGlyph(id, hex, t.from, t.to);
  } else {
    const pos2 = hexNeighbor(hex, ((rotation % 6) + 6) % 6);
    glyph = type === 'BONDER' ? createBonderGlyph(id, hex, pos2) : createUnbonderGlyph(id, hex, pos2);
  }
  for (const cell of glyphCells(glyph)) {
    const issue = cellIssue(ctx, solution, cell, type === 'TRANSMUTE' ? 'TRANSMUTE' : 'BOND');
    if (issue) return { ok: false, issue };
  }
  if (solution.glyphs.some((g) => samePair(g, glyph))) return { ok: false, issue: 'OCCUPIED' };
  return { ok: true, solution: withSolution(solution, { glyphs: [...solution.glyphs, glyph] }), elementId: id };
}

/**
 * Track tool: a hex next to an end of a track extends it, any other free hex starts a new track.
 * An arm standing on the hex starts riding the track.
 */
export function extendTrack(ctx: EditContext, solution: AtanorSolution, hex: HexCoord): EditResult {
  if (!allowedTools(ctx).includes('TRACK')) return { ok: false, issue: 'LOCKED' };
  if (offBoard(ctx, hex)) return { ok: false, issue: 'OFF_BOARD' };
  // tracks run under glyphs and ports (the L4 track crosses the output port), not twice over a hex
  if (solution.tracks.some((t) => t.path.some((p) => hexEquals(p, hex)))) return { ok: false, issue: 'OCCUPIED' };
  let tracks: TrackSegment[];
  let id: string;
  const end = solution.tracks.find((t) => hexDistance(t.path[t.path.length - 1]!, hex) === 1);
  const start = end ? null : solution.tracks.find((t) => hexDistance(t.path[0]!, hex) === 1);
  if (end) {
    id = end.id;
    tracks = solution.tracks.map((t) => (t.id === end.id ? { id: t.id, path: [...t.path, { ...hex }] } : t));
  } else if (start) {
    id = start.id;
    tracks = solution.tracks.map((t) => (t.id === start.id ? { id: t.id, path: [{ ...hex }, ...t.path] } : t));
  } else {
    id = nextId('track', solution.tracks);
    tracks = [...solution.tracks, { id, path: [{ ...hex }] }];
  }
  const track = tracks.find((t) => t.id === id)!;
  const arms = solution.arms.map((a) => {
    if (a.trackId !== id && !hexEquals(a.basePos, hex)) return a;
    const c = cloneArm(a);
    c.trackId = id;
    c.trackIndex = track.path.findIndex((p) => hexEquals(p, c.basePos));
    return c;
  });
  return { ok: true, solution: withSolution(solution, { tracks, arms }), elementId: id };
}

/** Removes what stands on the hex (arm, own glyph, track hex). Ports stay (PoC rule). */
export function removeAt(ctx: EditContext, solution: AtanorSolution, hex: HexCoord): EditResult {
  const at = elementAt(ctx.level, solution, hex);
  if (!at) return { ok: false, issue: 'NOTHING_HERE' };
  if (at.kind === 'GLYPH' && at.port) return { ok: false, issue: 'PORT' };
  if (at.kind === 'ARM') {
    const program = { ...solution.program };
    delete program[at.id];
    return { ok: true, solution: withSolution(solution, { arms: solution.arms.filter((a) => a.id !== at.id), program }), elementId: at.id };
  }
  if (at.kind === 'GLYPH') return { ok: true, solution: withSolution(solution, { glyphs: solution.glyphs.filter((g) => g.id !== at.id) }), elementId: at.id };
  // a track: an end hex shortens it, an inner hex removes the whole track
  const track = solution.tracks.find((t) => t.id === at.id)!;
  const i = track.path.findIndex((p) => hexEquals(p, hex));
  const path = i === 0 ? track.path.slice(1) : i === track.path.length - 1 ? track.path.slice(0, -1) : [];
  const tracks = path.length ? solution.tracks.map((t) => (t.id === track.id ? { id: t.id, path } : t)) : solution.tracks.filter((t) => t.id !== track.id);
  const arms = solution.arms.map((a) => {
    if (a.trackId !== track.id) return a;
    const c = cloneArm(a);
    const j = path.findIndex((p) => hexEquals(p, c.basePos));
    if (j < 0) {
      c.trackId = null;
      delete c.trackIndex;
    } else c.trackIndex = j;
    return c;
  });
  return { ok: true, solution: withSolution(solution, { tracks, arms }), elementId: track.id };
}

/** Turns the arm or the bonder on the hex by `steps` × 60° (bonders turn around their first hex). */
export function rotateAt(ctx: EditContext, solution: AtanorSolution, hex: HexCoord, steps: number): EditResult {
  const at = elementAt(ctx.level, solution, hex);
  if (!at || at.kind === 'TRACK') return { ok: false, issue: 'NOTHING_HERE' };
  if (at.kind === 'GLYPH' && at.port) return { ok: false, issue: 'PORT' };
  if (at.kind === 'ARM') {
    const arms = solution.arms.map((a) => {
      if (a.id !== at.id) return a;
      const c = cloneArm(a);
      c.rotation = (((c.rotation + steps) % 6) + 6) % 6;
      return c;
    });
    return { ok: true, solution: withSolution(solution, { arms }), elementId: at.id };
  }
  const g = solution.glyphs.find((x) => x.id === at.id)!;
  if (g.type !== 'BONDER' && g.type !== 'UNBONDER') return { ok: false, issue: 'NOTHING_HERE' };
  const dir = [0, 1, 2, 3, 4, 5].find((d) => hexEquals(hexNeighbor(g.pos, d), g.pos2))!;
  const pos2 = hexNeighbor(g.pos, (((dir + steps) % 6) + 6) % 6);
  const others = withSolution(solution, { glyphs: solution.glyphs.filter((x) => x.id !== g.id) });
  const issue = cellIssue(ctx, others, pos2, 'BOND');
  if (issue) return { ok: false, issue };
  const turned = { ...g, pos2 };
  if (others.glyphs.some((x) => samePair(x, turned))) return { ok: false, issue: 'OCCUPIED' };
  return { ok: true, solution: withSolution(solution, { glyphs: solution.glyphs.map((x) => (x.id === g.id ? turned : x)) }), elementId: g.id };
}

/** Sets an arm's length (1–3, within the building limit). */
export function setArmLength(ctx: EditContext, solution: AtanorSolution, armId: string, length: number): EditResult {
  if (length > maxArmLength(ctx) || length < 1) return { ok: false, issue: 'TOO_LONG' };
  const arms = solution.arms.map((a) => {
    if (a.id !== armId) return a;
    const c = cloneArm(a);
    c.length = length;
    return c;
  });
  return { ok: true, solution: withSolution(solution, { arms }), elementId: armId };
}

/** Moves an arm's base to another free hex (it leaves its track unless the hex is on one). */
export function moveArm(ctx: EditContext, solution: AtanorSolution, armId: string, hex: HexCoord): EditResult {
  const rest = withSolution(solution, { arms: solution.arms.filter((a) => a.id !== armId) });
  const issue = cellIssue(ctx, rest, hex, 'ARM');
  if (issue) return { ok: false, issue };
  const track = solution.tracks.find((t) => t.path.some((p) => hexEquals(p, hex)));
  const arms = solution.arms.map((a) => {
    if (a.id !== armId) return a;
    const c = cloneArm(a);
    c.basePos = { ...hex };
    c.trackId = track?.id ?? null;
    if (track) c.trackIndex = track.path.findIndex((p) => hexEquals(p, hex));
    else delete c.trackIndex;
    return c;
  });
  return { ok: true, solution: withSolution(solution, { arms }), elementId: armId };
}

// ---------------------------------------------------------------------------------------------
// Program (timeline)

/** Columns of the program: the longest tape (cells after it are empty). */
export function programLength(solution: AtanorSolution): number {
  return Math.max(0, ...Object.values(solution.program).map((t) => t.length));
}

function trimTape(tape: (ArmCommand | null)[]): (ArmCommand | null)[] {
  let n = tape.length;
  while (n > 0 && (tape[n - 1] === null || tape[n - 1] === undefined)) n -= 1;
  return tape.slice(0, n);
}

/** Sets (or clears with null) one cell of an arm's tape. */
export function setCommand(solution: AtanorSolution, armId: string, column: number, command: ArmCommand | null): AtanorSolution {
  const tape = [...(solution.program[armId] ?? [])];
  while (tape.length <= column) tape.push(null);
  tape[column] = command;
  return withSolution(solution, { program: { ...solution.program, [armId]: trimTape(tape) } });
}

/** Writes `commands` into an arm's tape from `column` on (paste). */
export function pasteCommands(solution: AtanorSolution, armId: string, column: number, commands: ReadonlyArray<ArmCommand | null>): AtanorSolution {
  let s = solution;
  commands.forEach((c, i) => (s = setCommand(s, armId, column + i, c)));
  return s;
}

/** Inserts an empty column before `column` in every tape (PoC timelines are shared across arms). */
export function insertColumn(solution: AtanorSolution, column: number): AtanorSolution {
  const program: Record<string, (ArmCommand | null)[]> = {};
  for (const [id, tape] of Object.entries(solution.program)) {
    program[id] = column < tape.length ? trimTape([...tape.slice(0, column), null, ...tape.slice(column)]) : [...tape];
  }
  return withSolution(solution, { program });
}

/** Removes `column` from every tape. */
export function deleteColumn(solution: AtanorSolution, column: number): AtanorSolution {
  const program: Record<string, (ArmCommand | null)[]> = {};
  for (const [id, tape] of Object.entries(solution.program)) program[id] = trimTape([...tape.slice(0, column), ...tape.slice(column + 1)]);
  return withSolution(solution, { program });
}

export type ProgramIssueCode =
  /** EXTEND / RETRACT on an arm without a piston. */
  | 'NO_PISTON'
  /** TRACK_* on an arm that does not ride a track. */
  | 'NO_TRACK';

export interface ProgramIssue {
  readonly armId: string;
  readonly column: number;
  readonly code: ProgramIssueCode;
}

/** Commands the arm cannot execute, found before the run (§5.2). */
export function programIssues(solution: AtanorSolution): ProgramIssue[] {
  const out: ProgramIssue[] = [];
  for (const arm of solution.arms) {
    (solution.program[arm.id] ?? []).forEach((cmd, column) => {
      if ((cmd === 'EXTEND' || cmd === 'RETRACT') && !arm.isPiston) out.push({ armId: arm.id, column, code: 'NO_PISTON' });
      if ((cmd === 'TRACK_POS' || cmd === 'TRACK_NEG') && !arm.trackId) out.push({ armId: arm.id, column, code: 'NO_TRACK' });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Start of a project (A21, POC-4 option C)

/** The reference machine's arms without a program: the hint for the first recipe. */
export function hintSolution(reference: AtanorSolution): AtanorSolution {
  return withSolution(reference, { glyphs: [], tracks: [], program: Object.fromEntries(reference.arms.map((a) => [a.id, []])) });
}

/** Stable key of a solution (drafts, caches, "changed since the trial"). */
export function solutionKey(solution: AtanorSolution): string {
  const arms = solution.arms.map((a) => `${a.id}@${hexKey(a.basePos)}r${a.rotation}l${a.length}${a.isPiston ? 'p' : ''}${a.grippers ?? 1}${a.trackId ?? ''}`);
  const glyphs = solution.glyphs.map((g) => `${g.type}:${glyphCells(g).map(hexKey).join('-')}`);
  const tracks = solution.tracks.map((t) => `${t.id}:${t.path.map(hexKey).join('-')}`);
  const program = Object.keys(solution.program)
    .sort()
    .map((k) => `${k}=${(solution.program[k] ?? []).map((c) => c ?? '_').join(',')}`);
  return [arms.join(';'), glyphs.join(';'), tracks.join(';'), program.join(';')].join('|');
}
