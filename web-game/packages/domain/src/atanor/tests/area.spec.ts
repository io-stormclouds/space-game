// Area metric.
// Fix (d): the PoC sampled area only at the end of a tick, after outputs had consumed delivered
// molecules, so the hexes a product was delivered on were never counted.
// AT5 (POC-5 B): area also counts the hexes swept by moving atoms and grippers inside a tick.
import { describe, expect, it } from 'vitest';
import { hexDistance } from '../grid/hex';
import { createArm } from '../engine/arm';
import { LEVEL_1_DIMER, LEVEL_2_WATER } from '../engine/levels';
import { LEVEL_A_NAD } from '../engine/recipes';
import { SimulationEngine } from '../engine/simulation';
import { sweptHexes } from '../engine/trajectory';
import { LevelConfig } from '../engine/types';

describe('Area metric', () => {
  it('counts the hexes on which a product is delivered', () => {
    const engine = new SimulationEngine(LEVEL_A_NAD);
    for (let i = 0; i < 9; i++) engine.step(); // first NAD delivered on tick 9

    const output = { q: -1, r: 2 };
    // No gripper ever reaches the output hex: only the delivered MIE atom does.
    for (const arm of engine.getArms()) {
      expect(hexDistance(arm.basePos, output)).toBeGreaterThan(arm.length);
    }
    expect(engine.productsDelivered).toBe(1);
    expect(engine.getVisitedHexes()).toContainEqual(output);
  });

  it('level 1 area is 13: the delivered A atom at (-1,2) (fix d) and the hex (-1,1) it sweeps (AT5)', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    for (let i = 0; i < 60; i++) engine.step();

    expect(engine.getVisitedHexes()).toContainEqual({ q: -1, r: 2 });
    // Tick 5: arm-2 (base (1,0)) turns the dimer; A is 2 hexes from the base and passes (-1,1).
    expect(engine.getVisitedHexes()).toContainEqual({ q: -1, r: 1 });
    expect(engine.getStats().area).toBe(13); // PoC 11, fix (d) 12
  });

  it('counts the swept hex of a molecule turned around a distant centre (L2: 9 -> 10, A_NAD: 12 -> 13)', () => {
    const l2 = new SimulationEngine(LEVEL_2_WATER);
    for (let i = 0; i < 40; i++) l2.step();
    // WATER, √3 from arm-2's base (1,-1), passes (-1,-1) on the way to (0,-2).
    expect(l2.getVisitedHexes()).toContainEqual({ q: -1, r: -1 });
    expect(l2.getStats().area).toBe(10);

    const nad = new SimulationEngine(LEVEL_A_NAD);
    for (let i = 0; i < 12; i++) nad.step();
    // Tick 9: MIE at (1,0), 2 hexes from arm-2's base (-1,0), passes (0,1).
    expect(nad.getVisitedHexes()).toContainEqual({ q: 0, r: 1 });
    expect(nad.getStats().area).toBe(13);
  });

  it('a length-2 arm sweeps the hex between its start and end; a length-1 arm sweeps nothing new', () => {
    expect(sweptHexes({ kind: 'rotate', center: { q: 0, r: 0 }, steps: 1 }, { q: 2, r: 0 })).toEqual([
      { q: 2, r: 0 },
      { q: 1, r: 1 },
      { q: 0, r: 2 },
    ]);
    expect(sweptHexes({ kind: 'rotate', center: { q: 0, r: 0 }, steps: 1 }, { q: 1, r: 0 })).toEqual([
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ]);

    const level: LevelConfig = {
      id: 'test-long-arm',
      name: 'test',
      description: '',
      targetRequired: 1,
      glyphs: [],
      initialArms: [createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 0, length: 2 })],
      defaultInstructions: { a: ['ROTATE_CW'] },
    };
    const engine = new SimulationEngine(level);
    expect(engine.getStats().area).toBe(2); // base and gripper
    engine.step();
    // The empty gripper sweeps (1,1) on its way from (2,0) to (0,2).
    expect(engine.getVisitedHexes()).toContainEqual({ q: 1, r: 1 });
    expect(engine.getStats().area).toBe(4);
  });
});
