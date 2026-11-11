import { describe, expect, it } from 'vitest';
import { CATALOG, resolveItem } from './catalog/catalog';
import { MODELS } from './catalog/models';
import { cellSides, edgeCells, edgeRot, edgesOnLine, frontOf, nearestEdge, rotateXZ, type Rot } from './grid';
import { EMPTY_HISTORY, execute, redo, undo } from './history';
import { applyChange, createLayout, type Layout } from './layout';
import { LayoutIndex } from './layout-index';
import { footprintOf } from './placement';
import {
  planEdgeLine,
  planFloorErase,
  planLift,
  planPlace,
  planRemove,
  planRoom,
  planStairs,
  planTileRect,
  planTransform,
  rotateStep,
} from './planners';
import { computeRooms, roomLinks } from './rooms';
import { checkPlacement } from './rules';
import { parseLayout, serializeLayout } from './serialization';
import { computeIssues } from './validation';

const idx = (l: Layout) => new LayoutIndex(l);
const room = (l: Layout, x0: number, z0: number, x1: number, z1: number, floor = 'floor-metal/plain', wall = 'wall/grey') =>
  applyChange(l, planRoom(idx(l), 0, { x: x0, z: z0 }, { x: x1, z: z1 }, floor, wall).change);
const place = (l: Layout, item: string, x: number, z: number, rot: Rot = 0, level = 0) => planPlace(idx(l), { item, level, x, z, rot });

describe('grid', () => {
  it('rotates local vectors the way Three.js rotation.y does, front = local +Z', () => {
    for (const r of [0, 1, 2, 3] as Rot[]) expect(rotateXZ(0, 1, r)).toEqual(frontOf(r));
    expect(rotateXZ(1, 0, 1)).toEqual({ x: 0, z: -1 });
  });

  it('pairs each cell side with the neighbour across it', () => {
    for (const { edge, neighbor } of cellSides(0, 3, 5)) {
      const cells = edgeCells(edge);
      expect(cells).toContainEqual({ x: 3, z: 5 });
      expect(cells).toContainEqual(neighbor);
    }
  });

  it('edge rotation faces the requested side', () => {
    expect(frontOf(edgeRot('x', 1))).toEqual({ x: 0, z: 1 });
    expect(frontOf(edgeRot('z', -1))).toEqual({ x: -1, z: 0 });
  });

  it('finds the nearest edge and a straight run of edges', () => {
    expect(nearestEdge(0, 5, 4.3).edge).toEqual({ level: 0, axis: 'x', x: 1, z: 1 });
    expect(nearestEdge(0, 7.8, 6).edge).toEqual({ level: 0, axis: 'z', x: 2, z: 1 });
    expect(edgesOnLine(0, { x: 3, z: 1 }, { x: 0, z: 2 })).toHaveLength(3);
  });
});

describe('catalog', () => {
  it('maps every variant to a measured kit model (or a built one)', () => {
    for (const e of CATALOG) for (const v of e.variants) expect(MODELS[v.model], v.id).toBeDefined();
  });

  it('rounds footprints to the 0.5 m sub-grid', () => {
    const bunk = footprintOf(resolveItem('bunk-double/blue')!);
    expect(bunk).toMatchObject({ w: 2, d: 2.5 });
    expect(bunk.ox).toBeCloseTo(-0.25, 2);
    expect(footprintOf(resolveItem('generator/std')!)).toMatchObject({ w: 5, d: 5 });
    expect(footprintOf(resolveItem('lava-lamp/std')!)).toMatchObject({ w: 0.5, d: 0.5 });
  });
});

describe('placement rules', () => {
  const base = room(createLayout(), 0, 0, 1, 1); // 8 × 8 m room, walls on the perimeter

  it('needs floor under the whole footprint', () => {
    expect(place(base, 'cryo-tube/on', 4, 4).change.add).toHaveLength(1);
    const outside = place(base, 'cryo-tube/on', 12, 4);
    expect(outside.change.add).toHaveLength(0);
    expect(outside.reason).toBe('Poza podłogą');
  });

  it('keeps the clearance band along walls free', () => {
    expect(place(base, 'cryo-tube/on', 1.5, 4).change.add).toHaveLength(1); // 0.5 … 2.5
    expect(place(base, 'cryo-tube/on', 1, 4).reason).toMatch(/Za blisko/);
  });

  it('rejects overlapping furniture but allows decor on a table', () => {
    const withTable = applyChange(base, place(base, 'cafeteria-table/plain', 4, 4).change);
    expect(place(withTable, 'chair/std', 4, 4).reason).toMatch(/Koliduje/);
    const lamp = place(withTable, 'lava-lamp/std', 4, 4);
    expect(lamp.change.add).toHaveLength(1);
    const lit = applyChange(withTable, lamp.change);
    expect(idx(lit).transform(lamp.change.add[0].id)!.y).toBeCloseTo(0.92);
  });

  it('hangs wall items only on walls', () => {
    expect(place(base, 'wall-display/blue', 2, 0, 0).change.add).toHaveLength(1);
    expect(place(base, 'wall-display/blue', 2, 4, 0).reason).toBe('Wymaga ściany');
    const withDoor = applyChange(base, planEdgeLine(idx(base), 0, { x: 0, z: 0 }, { x: 1, z: 0 }, 'door/grey', 1).change);
    expect(place(withDoor, 'wall-display/blue', 2, 0, 0).reason).toMatch(/Nie da się zawiesić/);
  });

  it('a wall cannot be drawn through furniture', () => {
    const l = applyChange(base, place(base, 'cryo-tube/on', 4, 4).change);
    const plan = planEdgeLine(idx(l), 0, { x: 1, z: 0 }, { x: 1, z: 2 }, 'wall/grey', 1);
    expect(plan.rejected.length).toBeGreaterThan(0);
    expect(plan.reason).toMatch(/Blokuje/);
  });
});

describe('planners', () => {
  it('room tool lays floor and inward-facing perimeter walls', () => {
    const l = room(createLayout(), 0, 0, 1, 1);
    const index = idx(l);
    expect(index.floors.size).toBe(4);
    expect(index.edges.size).toBe(8);
    const north = index.edgeAt({ level: 0, axis: 'x', x: 0, z: 0 })!;
    expect(frontOf(north.piece.rot)).toEqual({ x: 0, z: 1 }); // faces into the room
  });

  it('a door replaces the wall and drops the screen hanging on it (one undo restores all)', () => {
    let l = room(createLayout(), 0, 0, 1, 1);
    l = applyChange(l, place(l, 'wall-display/blue', 2, 0, 0).change);
    const before = l;
    const door = planEdgeLine(idx(l), 0, { x: 0, z: 0 }, { x: 1, z: 0 }, 'door/grey', 1);
    expect(door.change.remove.map((p) => p.item).sort()).toEqual(['wall-display/blue', 'wall/grey']);
    const step = execute(l, EMPTY_HISTORY, { label: 'door', change: door.change });
    const back = undo(step.layout, step.history);
    const byId = (l: Layout) => [...l.pieces.values()].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(back.layout)).toEqual(byId(before));
    expect(redo(back.layout, back.history).layout.pieces.size).toBe(step.layout.pieces.size);
  });

  it('erasing floor removes what stood on it', () => {
    let l = room(createLayout(), 0, 0, 1, 1);
    l = applyChange(l, place(l, 'chair/std', 2, 2).change);
    const plan = planFloorErase(idx(l), 0, { x: 0, z: 0 }, { x: 0, z: 0 });
    expect(plan.change.remove.map((p) => p.item)).toContain('chair/std');
  });

  it('2×2 tiles replace the four small tiles under them', () => {
    const l = room(createLayout(), 0, 0, 1, 1);
    const plan = planTileRect(idx(l), 0, { x: 0, z: 0 }, { x: 1, z: 1 }, 'floor-command/std', 0);
    expect(plan.change.add).toHaveLength(1);
    expect(plan.change.remove).toHaveLength(4);
  });

  it('moves a piece unless the target is taken; rotation flips walls', () => {
    let l = room(createLayout(), 0, 0, 1, 1);
    const chair = place(l, 'chair/std', 2, 2).change.add[0];
    l = applyChange(l, place(l, 'chair/std', 2, 2).change);
    l = applyChange(l, place(l, 'chair/std', 4, 2).change);
    expect(planTransform(idx(l), [chair.id], (p) => ({ ...p, x: 4 }), 'move').change.add).toHaveLength(0);
    expect(planTransform(idx(l), [chair.id], (p) => ({ ...p, z: 5 }), 'move').change.add).toHaveLength(1);
    const wall = idx(l).edgeAt({ level: 0, axis: 'x', x: 0, z: 0 })!.piece;
    expect(rotateStep(wall).rot).toBe((wall.rot + 2) % 4);
  });
});

describe('rooms and issues', () => {
  it('a closed room is sealed; an open edge is a hull breach', () => {
    const l = room(createLayout(), 0, 0, 1, 1);
    const rooms = computeRooms(idx(l));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].breaches).toHaveLength(0);
    const wall = idx(l).edgeAt({ level: 0, axis: 'z', x: 0, z: 0 })!.piece;
    const open = applyChange(l, planRemove(idx(l), [wall.id]).change);
    const r2 = computeRooms(idx(open));
    expect(r2[0].breaches).toHaveLength(1);
    expect(computeIssues(idx(open), r2).map((i) => i.code)).toContain('HULL_BREACH');
  });

  it('doors split rooms and connect them; a room without a door is reported', () => {
    let l = room(createLayout(), 0, 0, 0, 0);
    l = room(l, 1, 0, 1, 0);
    expect(computeRooms(idx(l))).toHaveLength(2);
    expect(computeIssues(idx(l), computeRooms(idx(l))).map((i) => i.code)).toContain('ROOM_NO_DOOR');
    l = applyChange(l, planEdgeLine(idx(l), 0, { x: 1, z: 0 }, { x: 1, z: 1 }, 'door/grey', 1).change);
    const rooms = computeRooms(idx(l));
    expect(rooms).toHaveLength(2);
    expect(computeIssues(idx(l), rooms)).toHaveLength(0);
  });

  it('classifies rooms by their furniture', () => {
    let l = room(createLayout(), 0, 0, 1, 1, 'floor-carpet/blue');
    l = applyChange(l, place(l, 'bunk-single/blue', 2, 2).change);
    expect(computeRooms(idx(l))[0].type).toBe('quarters');
    expect(computeRooms(idx(room(createLayout(), 0, 0, 3, 0)))[0].type).toBe('corridor');
  });

  it('a deck block lifts the floor one level; an open mezzanine edge wants a railing', () => {
    let l = room(createLayout(), 0, 0, 1, 0); // 2 cells on level 0
    l = applyChange(l, planTileRect(idx(l), 0, { x: 0, z: 0 }, { x: 0, z: 0 }, 'deck-block/std', 0).change);
    const index = idx(l);
    expect(index.isFloored(1, 0, 0)).toBe(true);
    expect(index.isFloored(0, 0, 0)).toBe(false);
    const up = computeRooms(index).find((r) => r.level === 1)!;
    expect(up.drops).toHaveLength(1); // edge towards the lower room at x = 1
    expect(checkPlacement(index, { id: 'x', item: 'chair/std', level: 1, x: 2, z: 2, rot: 0 }).ok).toBe(true);
  });
});

describe('between decks', () => {
  const roomAt = (l: Layout, level: number, x0: number, z0: number, x1: number, z1: number) =>
    applyChange(l, planRoom(idx(l), level, { x: x0, z: z0 }, { x: x1, z: z1 }, 'floor-metal/plain', 'wall/grey').change);
  const codes = (l: Layout) => computeIssues(idx(l), computeRooms(idx(l))).map((i) => i.code);

  // Deck 0: 3 × 2 cells; deck 1: 2 × 2 over its west part. Stairs in (1, 0) climb west.
  let two = roomAt(createLayout(), 0, 0, 0, 2, 1);
  two = roomAt(two, 1, 0, 0, 1, 1);
  const stairs = planStairs(idx(two), 0, { x: 1, z: 0 }, 1, 'ramp/grey');
  const climbed = applyChange(two, stairs.change);

  it('stairs open the deck above and rail the opening, except where they arrive', () => {
    expect(stairs.rejected).toHaveLength(0);
    expect(stairs.change.add.map((p) => p.item).sort()).toEqual(['railing/std', 'ramp/grey']);
    // The ramp replaces the floor tile it stands on; the tile above it goes for the opening.
    expect(stairs.change.remove.map((p) => `${p.level}:${p.item}`).sort()).toEqual(['0:floor-metal/plain', '1:floor-metal/plain']);
    const index = idx(climbed);
    expect(index.isFloored(1, 1, 0)).toBe(false);
    expect(index.stairs[0].link).toMatchObject({ entry: { level: 0, x: 2, z: 0 }, landing: { level: 1, x: 0, z: 0 } });
  });

  it('stairs join the rooms of both decks; the arrival edge is not a drop', () => {
    const index = idx(climbed);
    const rooms = computeRooms(index);
    expect(rooms.map((r) => `${r.level}:${r.type}:${r.cells.length}`).sort()).toEqual(['0:stairwell:6', '1:generic:3']);
    expect(rooms.find((r) => r.level === 1)!.drops).toHaveLength(0);
    expect(roomLinks(index, rooms).map((l) => l.kind)).toEqual(['stairs']);
    expect(codes(climbed)).toEqual([]);
  });

  it('reports stairs that end at a wall or under a floor, and the deck they no longer reach', () => {
    const top = idx(climbed).stairs[0].link.topEdge;
    const walled = applyChange(climbed, planEdgeLine(idx(climbed), 1, { x: top.x, z: top.z }, { x: top.x, z: top.z + 1 }, 'wall/grey', 1).change);
    expect(codes(walled)).toEqual(expect.arrayContaining(['STAIRS_BROKEN', 'ROOM_NO_DOOR']));
    const covered = applyChange(climbed, planTileRect(idx(climbed), 1, { x: 1, z: 0 }, { x: 1, z: 0 }, 'floor-metal/plain', 0).change);
    expect(computeIssues(idx(covered), computeRooms(idx(covered))).find((i) => i.code === 'STAIRS_BROKEN')?.detail).toMatch(/otwór/);
  });

  it('a lift is a small room per deck; stops one above the other make a shaft', () => {
    let l = roomAt(createLayout(), 0, 0, 0, 1, 0);
    l = roomAt(l, 1, 0, 0, 1, 0);
    const plan = planLift(idx(l), [0, 1], { x: 1, z: 0 }, 3, 'lift/blue');
    expect(plan.rejected).toHaveLength(0);
    expect(plan.change.add.filter((p) => p.item === 'door/grey')).toHaveLength(2); // front of each stop
    l = applyChange(l, plan.change);
    const index = idx(l);
    expect(index.liftShaft(0, 1, 0)).toEqual([0, 1]);
    const rooms = computeRooms(index);
    expect(rooms.filter((r) => r.type === 'lift')).toHaveLength(2);
    expect(roomLinks(index, rooms).map((k) => k.kind).sort()).toEqual(['door', 'door', 'lift']);
    expect(codes(l)).toEqual([]);
    const upper = index.liftAt(1, 1, 0)!.piece;
    const single = applyChange(l, planRemove(index, [upper.id]).change);
    expect(codes(single)).toEqual(expect.arrayContaining(['LIFT_SINGLE', 'ROOM_CUT_OFF']));
  });
});

describe('serialization', () => {
  it('round-trips a design and refuses foreign files', () => {
    const l = room(createLayout('Test'), 0, 0, 2, 1);
    const json = JSON.parse(JSON.stringify(serializeLayout(l)));
    const back = parseLayout(json);
    expect(back.warnings).toHaveLength(0);
    expect([...back.layout.pieces.values()]).toEqual([...l.pieces.values()]);
    expect(back.layout.seq).toBe(l.seq);
    expect(() => parseLayout({ format: 'x' })).toThrow();
    expect(() => parseLayout({ ...json, version: 99 })).toThrow();
  });
});
