import { Atanor } from '@space-game/domain';
import { color as DS } from '@space-game/hud-design-system/core';
import { describe, expect, it } from 'vitest';
import type { View } from '../view';
import { isAtanorControls } from './controls';
import { boardHexes, boardRadius, fitHexLayout, hexCorners, hexStep, hexToScreen, levelHexes, resolveAtanorLevel, screenToHex } from './layout';
import { armPose, interpolateMachine, moleculeIndex, rotationDelta, REACTION_T, SPAWN_T } from './motion';
import { POC_TICKS_PER_SECOND, clampTicksPerSecond, dueTicks, toReadout } from './readout';
import { ATANOR_PALETTE, ATANOR_TEXT_PL, atomFill, atomLabel, cssToPixi, inputPortLabel, outputPortLabel, resolveAtanorPalette } from './style';

const NAD = Atanor.findRecipeLevel('A_NAD')!;
const KAT = Atanor.findRecipeLevel('A_KAT')!;
/** PoC level 2 with its original program (W09: JAM after 9 ticks). */
const BROKEN_L2: Atanor.LevelConfig = {
  ...Atanor.LEVEL_2_WATER,
  defaultInstructions: Object.fromEntries(Object.entries(Atanor.LEVEL_2_POC_BROKEN_PROGRAM).map(([k, v]) => [k, [...v]])),
};

describe('level lookup', () => {
  it('accepts recipe ids, level ids and PoC aliases', () => {
    expect(resolveAtanorLevel(undefined)?.id).toBe('recipe-a-nad');
    expect(resolveAtanorLevel('A_NAD')?.id).toBe('recipe-a-nad');
    expect(resolveAtanorLevel('a_kat')?.id).toBe('recipe-a-kat');
    expect(resolveAtanorLevel('level-3-transmute')?.id).toBe('level-3-transmute');
    expect(resolveAtanorLevel('L4')?.id).toBe('level-4-track');
    expect(resolveAtanorLevel('A_XYZ')).toBeNull();
    expect(resolveAtanorLevel('  ')).toBeNull();
  });
});

describe('board geometry', () => {
  it('uses the building board radius (L1 = 19 hexes, L2 = 37) and covers PoC levels', () => {
    expect(boardRadius(NAD)).toBe(2);
    expect(boardHexes(2)).toHaveLength(19);
    expect(boardRadius(KAT)).toBe(3);
    expect(boardHexes(3)).toHaveLength(37);
    for (const level of Atanor.listAtanorLevels()) {
      const r = boardRadius(level);
      for (const h of levelHexes(level)) expect(Atanor.hexDistance({ q: 0, r: 0 }, h)).toBeLessThanOrEqual(r);
    }
  });

  it('fits the board into the free area and centres it', () => {
    const L = fitHexLayout(1000, 600, 2, { top: 50, right: 20, bottom: 30, left: 20 });
    // Height-bound: (3R + 2 + 0.6) hexes in 520 px.
    expect(L.size).toBeCloseTo(520 / 8.6, 6);
    expect(L.origin.x).toBeCloseTo(500);
    const xs = boardHexes(2).map((h) => hexToScreen(h, L).x);
    const ys = boardHexes(2).map((h) => hexToScreen(h, L).y);
    expect(Math.min(...xs) - (Math.sqrt(3) / 2) * L.size).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(Math.max(...xs) + (Math.sqrt(3) / 2) * L.size).toBeLessThanOrEqual(980 + 1e-6);
    expect(Math.min(...ys) - L.size * 1.6).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(Math.max(...ys) + L.size).toBeLessThanOrEqual(570 + 1e-6);
    // Width-bound and clamped sizes.
    expect(fitHexLayout(300, 2000, 2).size).toBeCloseTo((300 - 48) / (Math.sqrt(3) * 5), 6);
    expect(fitHexLayout(20, 20, 6).size).toBe(8);
    expect(fitHexLayout(5000, 5000, 1).size).toBe(72);
  });

  it('maps hexes to pixels and back (pointy-top, E = +x, SE = +60°)', () => {
    const L = fitHexLayout(800, 600, 2);
    const o = hexToScreen({ q: 0, r: 0 }, L);
    expect(o).toEqual(L.origin);
    const e = hexToScreen({ q: 1, r: 0 }, L);
    expect(e.x - o.x).toBeCloseTo(hexStep(L));
    expect(e.y).toBeCloseTo(o.y);
    const se = hexToScreen({ q: 0, r: 1 }, L);
    expect(Math.atan2(se.y - o.y, se.x - o.x)).toBeCloseTo(Math.PI / 3);
    for (const h of boardHexes(2)) {
      const p = hexToScreen(h, L);
      expect(screenToHex(p.x + 3, p.y - 2, L)).toEqual(h);
    }
  });

  it('builds pointy-top corners', () => {
    const pts = hexCorners(0, 0, 10);
    expect(pts).toHaveLength(12);
    // Corner 4 (240° − 30° = 210°)... the top corner is index 5 (270°).
    expect(pts[10]).toBeCloseTo(0);
    expect(pts[11]).toBeCloseTo(-10);
    for (let i = 0; i < 12; i += 2) expect(Math.hypot(pts[i]!, pts[i + 1]!)).toBeCloseTo(10);
  });
});

describe('motion', () => {
  const L = fitHexLayout(800, 600, 3);

  it('takes the short way round', () => {
    expect(rotationDelta(0, 1)).toBe(1);
    expect(rotationDelta(0, 5)).toBe(-1);
    expect(rotationDelta(5, 0)).toBe(1);
    expect(rotationDelta(2, 2)).toBe(0);
  });

  it('turns and extends arms smoothly', () => {
    const a = Atanor.createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 0, length: 1 });
    const b = { ...a, rotation: 1, length: 2 };
    const mid = armPose(a, b, 0.5, L);
    expect(mid.angle).toBeCloseTo(Math.PI / 6);
    const reach = Math.hypot(mid.gripper.x - mid.base.x, mid.gripper.y - mid.base.y);
    expect(reach).toBeCloseTo(1.5 * hexStep(L));
  });

  it('groups atoms into molecules', () => {
    const m = moleculeIndex(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [
        { atom1Id: 'a', atom2Id: 'b' },
        { atom1Id: 'c', atom2Id: 'b' },
      ],
    );
    expect([...m.get('a')!].sort()).toEqual(['a', 'b', 'c']);
    expect(m.get('a')).toBe(m.get('c'));
    expect([...m.get('d')!]).toEqual(['d']);
  });

  it('keeps a carried molecule rigid on its gripper and lands on the engine state', () => {
    const sim = Atanor.createAtanorSimulation(NAD);
    let prev = sim.getCurrentStepResult();
    let checkedCarry = 0;
    for (let i = 0; i < 40; i++) {
      const curr = sim.step();
      // t = 1 reproduces the engine state; t = 0 the previous one.
      const end = interpolateMachine(prev, curr, 1, L);
      expect(end.atoms.map((a) => a.id).sort()).toEqual(curr.atoms.map((a) => a.id).sort());
      for (const a of curr.atoms) {
        const p = hexToScreen(a.pos, L);
        const pose = end.atoms.find((x) => x.id === a.id)!;
        expect(pose.x).toBeCloseTo(p.x, 6);
        expect(pose.y).toBeCloseTo(p.y, 6);
        expect(pose.element).toBe(a.element);
      }
      const start = interpolateMachine(prev, curr, 0, L);
      for (const a of prev.atoms) {
        const p = hexToScreen(a.pos, L);
        const pose = start.atoms.find((x) => x.id === a.id)!;
        expect(pose.x).toBeCloseTo(p.x, 6);
      }
      // Mid-tick: an atom held by a rotating arm stays on the gripper (the PoC lerped it off).
      const mid = interpolateMachine(prev, curr, 0.5, L);
      for (const arm of prev.arms) {
        const cmd = curr.commandsExecuted[arm.id];
        if (!arm.isHolding || !arm.heldAtomId || (cmd !== 'ROTATE_CW' && cmd !== 'ROTATE_CCW')) continue;
        const grip = mid.arms.find((a) => a.id === arm.id)!.gripper;
        const held = mid.atoms.find((a) => a.id === arm.heldAtomId)!;
        expect(Math.hypot(held.x - grip.x, held.y - grip.y)).toBeLessThan(1e-6);
        checkedCarry += 1;
      }
      prev = curr;
    }
    expect(checkedCarry).toBeGreaterThan(5);
  });

  it('fades spawned atoms in and delivered ones out, and flags the delivery', () => {
    const sim = Atanor.createAtanorSimulation(NAD);
    let prev = sim.getCurrentStepResult();
    let curr = sim.step();
    while (curr.productsDelivered === 0) {
      prev = curr;
      curr = sim.step();
    }
    const vanished = prev.atoms.filter((a) => !curr.atoms.some((c) => c.id === a.id)).map((a) => a.id);
    expect(vanished.length).toBe(4);
    const early = interpolateMachine(prev, curr, 0.5, L);
    expect(early.delivered).toBe(true);
    for (const id of vanished) expect(early.atoms.find((a) => a.id === id)?.alpha).toBe(1);
    const late = interpolateMachine(prev, curr, 1, L);
    for (const id of vanished) expect(late.atoms.some((a) => a.id === id)).toBe(false);
    const spawned = curr.atoms.filter((c) => !prev.atoms.some((a) => a.id === c.id)).map((a) => a.id);
    const before = interpolateMachine(prev, curr, SPAWN_T, L);
    for (const id of spawned) expect(before.atoms.some((a) => a.id === id)).toBe(false);
    // New bonds appear with the reaction phase.
    expect(REACTION_T).toBeGreaterThan(SPAWN_T - 0.5);
  });

  it('marks colliding atoms on a jam', () => {
    const sim = Atanor.createAtanorSimulation(BROKEN_L2);
    let prev = sim.getCurrentStepResult();
    let curr = prev;
    for (let i = 0; i < 30 && !sim.hasCrashed; i++) {
      prev = curr;
      curr = sim.step();
    }
    expect(sim.hasCrashed).toBe(true);
    const pose = interpolateMachine(prev, curr, 1, L);
    expect(pose.jamAtoms.length).toBeGreaterThanOrEqual(2);
    const hexes = new Set(pose.jamAtoms.map((id) => curr.atoms.find((a) => a.id === id)!.pos).map((p) => `${p.q},${p.r}`));
    expect(hexes.size).toBe(1);
  });
});

describe('readout', () => {
  it('maps engine snapshot, stats and measured throughput', () => {
    const sim = Atanor.createAtanorSimulation(NAD);
    for (let i = 0; i < 30; i++) sim.step();
    const r = toReadout({
      level: NAD,
      snapshot: sim.getSnapshot(),
      stats: sim.getStats(),
      metrics: Atanor.measureAtanorSolution(NAD),
      playing: true,
      ticksPerSecond: 2,
    });
    expect(r).toMatchObject({
      levelId: 'recipe-a-nad',
      kind: 'recipe',
      recipeId: 'A_NAD',
      buildingLevel: 1,
      playing: true,
      ticksPerSecond: 2,
      ticks: 30,
      target: 6,
      jam: null,
      starved: false,
      // A3: measured A_NAD 12 / 12 / 2 (doc §8.3: 12 / 9 / 2).
      cyclesPerOutput: 12,
      area: 12,
      arms: 2,
      docReference: { cycles: 12, area: 9, arms: 2 },
      spec: { level: 1, cycles: 12, area: 12, arms: 2 },
      throughputProblem: null,
    });
    expect(r.delivered).toBe(sim.getSnapshot().delivered);
    expect(r.produced['NAD'] ?? 0).toBe(r.delivered);
    expect(r.inputsPerOutput).toEqual({ MIE: 2, PLA: 1, H2: 10 });
    expect(r.areaSoFar).toBeLessThanOrEqual(r.area);
  });

  it('reports PoC levels and jams', () => {
    const level = BROKEN_L2;
    const sim = Atanor.createAtanorSimulation(level);
    Atanor.runAtanorSimulation(sim, 100);
    const r = toReadout({ level, snapshot: sim.getSnapshot(), stats: sim.getStats(), metrics: Atanor.measureAtanorSolution(level), playing: false, ticksPerSecond: 1 });
    expect(r.kind).toBe('poc');
    expect(r.recipeId).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.jam?.reason).toBe('ATOM_COLLISION');
    expect(r.jam?.message.length).toBeGreaterThan(0);
    expect(r.throughputProblem).toBe('JAM');
    expect(r.cyclesPerOutput).toBeNull();
  });

  it('runs the tick clock at the chosen rate', () => {
    const clock = { phase: 0 };
    expect(dueTicks(clock, 0.3, POC_TICKS_PER_SECOND)).toBe(0);
    expect(dueTicks(clock, 0.3, POC_TICKS_PER_SECOND)).toBe(1);
    expect(clock.phase).toBeCloseTo(0, 6);
    expect(dueTicks(clock, 1, 10)).toBe(10);
    expect(dueTicks(clock, 100, 120, 240)).toBe(240);
    expect(clock.phase).toBeLessThan(1);
    expect(dueTicks(clock, -1, 10)).toBe(0);
    expect(clampTicksPerSecond(0)).toBe(0.1);
    expect(clampTicksPerSecond(1e6)).toBe(120);
    expect(clampTicksPerSecond(Number.NaN)).toBeCloseTo(1000 / 600);
  });
});

describe('style', () => {
  it('mirrors the design-system tokens', () => {
    for (const key of Object.keys(ATANOR_PALETTE) as Array<keyof typeof ATANOR_PALETTE>) {
      expect(ATANOR_PALETTE[key].replace(/\s/g, '')).toBe(DS[key].replace(/\s/g, ''));
    }
    expect(resolveAtanorPalette((v) => (v === '--hud-color-signal' ? '#4FFFB0' : '')).signal).toBe('#4FFFB0');
  });

  it('converts CSS colours for PixiJS', () => {
    expect(cssToPixi('#FFB000')).toEqual({ color: 0xffb000, alpha: 1 });
    expect(cssToPixi('#fff')).toEqual({ color: 0xffffff, alpha: 1 });
    expect(cssToPixi('rgba(255, 176, 0, 0.14)')).toEqual({ color: 0xffb000, alpha: 0.14 });
  });

  it('labels atoms with material codes (A5) and gives every atom type a flat fill', () => {
    for (const code of [...Atanor.ATANOR_MATERIAL_CODES, ...Atanor.ACTIVATED_ATOM_TYPES]) expect(atomLabel(code)).toBe(code);
    expect(atomLabel('QUICKSILVER')).toBe('Hg');
    for (const t of [...Atanor.POC_ATOM_TYPES, ...Atanor.ATANOR_MATERIAL_CODES, ...Atanor.ACTIVATED_ATOM_TYPES, 'XYZ']) {
      expect(atomFill(t)).toMatch(/^#[0-9A-F]{6}$/i);
      expect(atomLabel(t).length).toBeLessThanOrEqual(4);
    }
  });

  it('labels the ports', () => {
    expect(inputPortLabel(ATANOR_TEXT_PL, 'H2', 10)).toBe('WEJ H2 ×10');
    expect(inputPortLabel(ATANOR_TEXT_PL, 'MIE')).toBe('WEJ MIE');
    expect(outputPortLabel(ATANOR_TEXT_PL, { material: 'NAD', quantity: 1 }, 'x')).toBe('WYJ NAD');
    expect(outputPortLabel(ATANOR_TEXT_PL, undefined, 'Lekcja z bardzo długą nazwą')).toBe('WYJ Lekcja z ba…');
  });
});

describe('controls guard', () => {
  it('recognises views with the HUD controls', () => {
    const base: View = { kind: 'galaxy', usesThree: true, mount() {}, update() {}, pick: () => ({ kind: 'EMPTY' }), resize() {}, dispose() {} };
    expect(isAtanorControls(base)).toBe(false);
    expect(isAtanorControls(null)).toBe(false);
    const fn = () => undefined;
    const withControls = { ...base, play: fn, pause: fn, step: fn, reset: fn, setLevel: () => true, setTicksPerSecond: fn, readout: fn, levels: () => [] };
    expect(isAtanorControls(withControls)).toBe(true);
  });
});
