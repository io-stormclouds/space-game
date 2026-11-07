import { describe, expect, it } from 'vitest';
import { LEVEL_1_DIMER } from '../core/engine/levels';
import { SimulationEngine } from '../core/engine/simulation';
import { createArm } from '../core/engine/arm';
import { createBonderGlyph } from '../core/engine/glyph';

describe('Hardware Editing API', () => {
  it('should add and remove arms', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    const before = engine.level.initialArms.length;

    engine.addArm(
      createArm({ id: 'arm-extra', basePos: { q: 5, r: 5 }, rotation: 0, length: 1 })
    );
    expect(engine.level.initialArms.length).toBe(before + 1);
    expect(engine.instructions['arm-extra']).toBeDefined();

    engine.removeArm('arm-extra');
    expect(engine.level.initialArms.length).toBe(before);
    expect(engine.instructions['arm-extra']).toBeUndefined();
  });

  it('should move, rotate and resize an arm', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    engine.moveArm('arm-1', { q: 4, r: -2 });
    engine.rotateArm('arm-1', 2);
    engine.setArmLength('arm-1', 3);

    const init = engine.level.initialArms.find(a => a.id === 'arm-1')!;
    expect(init.basePos).toEqual({ q: 4, r: -2 });
    expect(init.rotation).toBe(5); // started at 3, +2 => 5
    expect(init.length).toBe(3);
  });

  it('should add and remove glyphs', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    const before = engine.level.glyphs.length;
    engine.addGlyph(createBonderGlyph('bonder-x', { q: 2, r: 2 }, { q: 3, r: 2 }));
    expect(engine.level.glyphs.length).toBe(before + 1);
    engine.removeGlyph('bonder-x');
    expect(engine.level.glyphs.length).toBe(before);
  });
});
