import type { Axis, Rot } from './grid';
import { LayoutIndex } from './layout-index';
import { applyChange, createLayout, type Layout } from './layout';
import { planEdgeLine, planLift, planPlace, planRoom, planStairs, planTileRect, type Plan } from './planners';

/**
 * Demo design: a small research corvette on three decks, built with the same planners the editor
 * tools use, so it doubles as an end-to-end check of the domain (see sample-layout.spec.ts).
 *
 * Deck 0          x→ 0 1 2 3 4 5 6 7 8 9 10
 *            z 0       Q Q M M H H E E E        Q quarters  M mess  H hydroponics  E engineering
 *            z 1   B B Q Q M M H H E E E        B bridge (bow, glass to the west)
 *            z 2   B B C C C C C C C C C        C corridor
 *            z 3       D D R R R S S T L        D medbay  R briefing  S power storage
 *            z 4       D D R R R S S / T        T stair hall, / stairs up (west), L lift (door to C)
 *
 * Deck 1                      4 5 6 7 8 9 10
 *            z 3              O O O G G G L     O officers' quarters (glass to the south)
 *            z 4              O O O G G ·       G officers' mess gallery, · opening over the stairs
 *
 * Deck 2                              8 9 10
 *            z 3                      V V L     V observation deck (glass all round)
 *            z 4                      V V
 *
 * The lift (10, 3) serves decks 0–2; the stairs (9, 4) climb from the hall to the gallery.
 */
export function buildSampleLayout(): { layout: Layout; problems: string[] } {
  const b = new SampleBuilder('Korweta badawcza KB-7');

  // ── Deck 0 ──────────────────────────────────────────────────────────────
  b.room(0, 1, 1, 2, 'floor-metal/plain', 'wall/grey');
  b.tiles(0, 1, 0, 1, 'floor-command/std');
  b.room(2, 0, 3, 1, 'floor-carpet/blue', 'wall/blue');
  b.room(4, 0, 5, 1, 'floor-metal/tiles', 'wall/orange');
  b.room(6, 0, 7, 1, 'floor-hydro/std', 'wall/green');
  b.room(8, 0, 10, 1, 'floor-metal/grate', 'wall/red');
  b.tiles(9, 0, 9, 1, 'floor-hazard/a');
  b.room(2, 3, 3, 4, 'floor-metal/plain', 'wall/blue');
  b.tiles(2, 3, 2, 3, 'floor-medbay-large/std');
  b.room(4, 3, 6, 4, 'floor-carpet/grey', 'wall/grey');
  b.room(7, 3, 8, 4, 'floor-metal/grate', 'wall/grey');
  b.room(2, 2, 10, 2, 'floor-metal/plain', 'wall/grey');
  b.room(9, 3, 10, 4, 'floor-metal/tiles', 'wall/grey');

  // Doors onto the corridor, glass bow and a glass medbay front.
  b.edge('z', 2, 2, 'door/grey', 1);
  b.edge('x', 2, 2, 'door/blue', -1);
  b.edge('x', 4, 2, 'door/orange', -1);
  b.edge('x', 7, 2, 'door/green', -1);
  b.edge('x', 9, 2, 'door/red', -1);
  b.edge('x', 3, 3, 'door/blue', 1);
  b.edge('x', 4, 3, 'door/grey', 1);
  b.edge('x', 7, 3, 'door/grey', 1);
  b.edge('x', 9, 3, 'door/grey', 1);
  b.edge('z', 0, 1, 'glass/blue', 1);
  b.edge('z', 0, 2, 'glass/blue', 1);
  b.edge('x', 2, 3, 'glass/clear', 1);

  // Bridge
  b.obj('command-console/std', 3.5, 8, 1);
  b.wall('wall-display/blue', 2, 4, 0);
  b.wall('wall-display/blue', 6, 4, 0);
  b.wall('wall-display/green', 2, 12, 2);
  b.wall('wall-display/green', 6, 12, 2);

  // Quarters
  b.obj('bunk-double/blue', 9.5, 1.75, 0);
  b.obj('bunk-double/blue', 12, 1.75, 0);
  b.obj('bunk-single/blue', 14.75, 1.75, 0);
  b.obj('end-table/std', 15, 7, 0);
  b.obj('table-light/std', 15, 7, 0);
  b.wall('wall-light/white', 12, 0, 0);

  // Mess
  b.obj('cafeteria-table/plain', 18, 3, 0);
  b.obj('cafeteria-table/inset', 22, 3, 0);
  b.obj('chair/std', 18, 5, 2);
  b.obj('chair/std', 22, 5, 2);
  b.obj('ketchup/std', 17.75, 3, 0);
  b.obj('mayo/std', 22.25, 3, 0);

  // Hydroponics
  for (const x of [25.25, 27.75, 30.25]) b.obj('hydro-bed/full', x, 1.5, 0);
  b.obj('hydro-bed/empty', 25.25, 5, 0);
  b.obj('plant/std', 31, 5, 0);

  // Engineering
  b.obj('generator/std', 38, 3.5, 0);
  b.obj('pile-small/std', 33.25, 1.25, 0);
  b.obj('pile-small/std', 42.75, 1.25, 0);
  b.wall('wall-pipe/std', 34, 8, 2);
  b.wall('air-con/std', 42, 0, 0);

  // Medbay
  b.obj('cryo-tube/on', 9.5, 18.5, 0);
  b.obj('cryo-tube/off', 12, 18.5, 0);
  b.obj('biomonitor/green', 14.5, 19, 0);

  // Briefing
  b.obj('octo-table/std', 22, 16, 0);
  b.obj('briefing-screen/blue', 26.75, 16, 3);
  b.obj('chair/std', 18, 14.5, 1);
  b.obj('chair/std', 18, 17.5, 1);

  // Power storage
  for (const x of [29, 30.5, 32, 33.5, 35]) b.obj('battery/green', x, 19.25, 0);

  // Corridor lights on the panels between doors
  for (const x of [14, 22, 26, 34, 42]) b.wall('wall-light/white', x, 8, 0);

  // Stair hall: light on the far wall
  b.wall('wall-light/white', 42, 20, 2);

  // Ceiling lamps in rooms without a screen or lamp of their own (hidden in cutaway, still lit)
  for (const [x, z] of [
    [20, 4],
    [28, 4],
    [22, 16],
    [32, 16],
    [12, 4],
  ] as const) {
    b.obj('ceiling-light/std', x, z, 0);
  }

  // ── Deck 1: officers' quarters and mess over the briefing room and storage ──
  b.deck = 1;
  b.room(4, 3, 6, 4, 'floor-carpet/orange', 'wall/orange');
  b.room(7, 3, 9, 4, 'floor-metal/grate', 'wall/grey');
  b.edge('z', 7, 3, 'door/orange', -1);
  for (const x of [4, 5, 6]) b.edge('x', x, 5, 'glass/blue', -1);

  b.obj('bunk-single/orange', 17.25, 14.5, 0);
  b.obj('bunk-single/orange', 19.25, 14.5, 0);
  b.obj('end-table/std', 21.5, 13, 0);
  b.obj('lava-lamp/std', 21.5, 13, 0);
  b.obj('floor-lamp/std', 25.5, 13, 2);
  b.wall('wall-light/orange', 22, 12, 0);

  b.obj('cafeteria-table/inset', 30.5, 17.75, 0);
  b.obj('chair/std', 30.5, 15.5, 0);
  b.obj('chair/std', 32.5, 17.75, 3);
  b.obj('chess/std', 30.5, 18.25, 0);
  b.wall('wall-light/white', 30, 12, 0);
  b.wall('wall-light/white', 30, 20, 2);

  // ── Deck 2: observation deck ──
  b.deck = 2;
  b.room(8, 3, 9, 4, 'floor-metal/circles', 'glass/blue');
  b.obj('orrery/std', 36, 16, 0);
  b.obj('chair/std', 33, 13, 0);
  b.obj('chair/std', 33, 19, 2);

  // ── Between decks ──
  b.deck = 0;
  b.stairs(9, 4, 1, 'stairs/blue');
  b.lift(0, 10, 3, 2);
  b.lift(1, 10, 3, 3);
  b.lift(2, 10, 3, 3);

  return { layout: b.layout, problems: b.problems };
}

class SampleBuilder {
  layout: Layout;
  /** Deck the next calls build on. */
  deck = 0;
  readonly problems: string[] = [];

  constructor(name: string) {
    this.layout = createLayout(name);
  }

  private apply(plan: Plan, what: string): void {
    if (plan.rejected.length) this.problems.push(`${what}: ${plan.reason ?? 'odrzucone'}`);
    this.layout = applyChange(this.layout, plan.change);
  }

  private get index(): LayoutIndex {
    return new LayoutIndex(this.layout);
  }

  room(x0: number, z0: number, x1: number, z1: number, floor: string, wall: string): void {
    this.apply(planRoom(this.index, this.deck, { x: x0, z: z0 }, { x: x1, z: z1 }, floor, wall), `room ${this.deck}:${x0},${z0}`);
  }

  tiles(x0: number, z0: number, x1: number, z1: number, item: string, rot: Rot = 0): void {
    this.apply(planTileRect(this.index, this.deck, { x: x0, z: z0 }, { x: x1, z: z1 }, item, rot), `tiles ${item}`);
  }

  edge(axis: Axis, x: number, z: number, item: string, side: 1 | -1): void {
    const to = axis === 'x' ? { x: x + 1, z } : { x, z: z + 1 };
    this.apply(planEdgeLine(this.index, this.deck, { x, z }, to, item, side), `edge ${item} ${this.deck}:${axis}${x},${z}`);
  }

  obj(item: string, x: number, z: number, rot: Rot): void {
    this.apply(planPlace(this.index, { item, level: this.deck, x, z, rot }), `${item} @${this.deck}:${x},${z}`);
  }

  /** Wall item: (x, z) on the wall line, rot = the side it faces. */
  wall(item: string, x: number, z: number, rot: Rot): void {
    this.obj(item, x, z, rot);
  }

  stairs(x: number, z: number, rot: Rot, item: string): void {
    this.apply(planStairs(this.index, this.deck, { x, z }, rot, item), `stairs ${this.deck}:${x},${z}`);
  }

  /** One lift stop; `rot` points its door. */
  lift(level: number, x: number, z: number, rot: Rot, item = 'lift/blue'): void {
    this.apply(planLift(this.index, [level], { x, z }, rot, item), `lift ${level}:${x},${z}`);
  }
}
