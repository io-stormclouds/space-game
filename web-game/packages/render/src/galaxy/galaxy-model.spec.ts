import { LY_PER_PARSEC, STARS, STARSHIP_MODULES, STARSHIP_UPGRADES, maxStarRadius } from '@space-game/domain';
import { color as DS } from '@space-game/hud-design-system/core';
import { MockServer } from '@space-game/mock-server';
import { describe, expect, it } from 'vitest';
import {
  GALAXY_PALETTE,
  RANGE_RINGS,
  START_DIRECTION,
  buildMarkers,
  cameraLimits,
  circleSegments,
  colonyStarName,
  distance,
  findStar,
  labelCandidates,
  LABEL_CLUSTER_PX,
  luminosityClass,
  parseCssColor,
  pickNearest,
  placeLabels,
  resolveMarks,
  resolvePalette,
  selectLabels,
  spectralType,
  sphereSilhouette,
  starLook,
  starScenePosition,
  starsWithin,
} from './galaxy-model';

const star = (name: string) => STARS.find((s) => s.name === name)!;

describe('palette', () => {
  it('mirrors the design-system tokens', () => {
    for (const key of Object.keys(GALAXY_PALETTE) as Array<keyof typeof GALAXY_PALETTE>) {
      expect(GALAXY_PALETTE[key].replace(/\s/g, '')).toBe(DS[key].replace(/\s/g, ''));
    }
  });

  it('parses hex and rgba colours', () => {
    expect(parseCssColor('#FFB000')).toEqual({ r: 1, g: 176 / 255, b: 0, a: 1 });
    expect(parseCssColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseCssColor('rgba(112, 128, 146, 0.24)')).toEqual({ r: 112 / 255, g: 128 / 255, b: 146 / 255, a: 0.24 });
    expect(parseCssColor('var(--x)')).toBeNull();
  });

  it('takes DS CSS variables when present (signal preset)', () => {
    const p = resolvePalette((v) => (v === '--hud-color-signal' ? ' #4FFFB0 ' : v === '--hud-color-text' ? 'bogus' : ''));
    expect(p.signal).toBe('#4FFFB0');
    expect(p.text).toBe(GALAXY_PALETTE.text);
  });
});

describe('star look', () => {
  it('reads spectral and luminosity classes', () => {
    expect(spectralType('G8.5V')).toBe('G');
    expect(spectralType('DA2')).toBe('WD');
    expect(spectralType('L7.5/T0.5')).toBe('BD');
    expect(spectralType('Y4')).toBe('BD');
    expect(luminosityClass('B8Ia')).toBe('I');
    expect(luminosityClass('K0IIIb')).toBe('III');
    expect(luminosityClass('F5IV-V')).toBe('IV');
    expect(luminosityClass('A9II')).toBe('II');
    expect(luminosityClass('M5.5Ve')).toBe('V');
    expect(luminosityClass('DA2')).toBeNull();
  });

  it('sizes dwarfs as the canvas board and enlarges giants', () => {
    expect(starLook(star('Sirius A')).size).toBe(10);
    expect(starLook(star('Tau Ceti')).size).toBe(9);
    expect(starLook(star('Epsilon Eridani')).size).toBe(7);
    expect(starLook(star('Lacaille 9352')).size).toBe(5);
    expect(starLook(star('Luhman 16'))).toMatchObject({ size: 6, shape: 'ring' });
    expect(starLook(star('Arcturus')).size).toBe(9);
    expect(starLook(star('Deneb')).size).toBe(14);
    for (const s of STARS) expect(starLook(s).size).toBeGreaterThanOrEqual(4);
  });

  it('desaturates catalogue colours toward the DS text colours', () => {
    const sat = (c: { r: number; g: number; b: number }) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    for (const s of STARS) {
      const look = starLook(s);
      expect(sat(look.color)).toBeLessThanOrEqual(sat(parseCssColor(s.color)!) * 0.3 + 0.08);
    }
    // M dwarfs mix toward textDim (darker than K/G dots).
    const m = starLook(star('Lacaille 9352')).color;
    const g = starLook(star('Tau Ceti')).color;
    expect(m.r + m.g + m.b).toBeLessThan(g.r + g.g + g.b);
  });
});

describe('scene mapping', () => {
  it('keeps the W10 distances and makes domain z the scene up axis', () => {
    for (const s of STARS) {
      expect(Math.hypot(...starScenePosition(s))).toBeCloseTo(s.distance, 6);
    }
    const p = starScenePosition({ pos: { x: 1, y: 2, z: 3 } });
    expect(p[0]).toBeCloseTo(LY_PER_PARSEC);
    expect(p[1]).toBeCloseTo(3 * LY_PER_PARSEC);
    expect(p[2]).toBeCloseTo(-2 * LY_PER_PARSEC);
  });

  it('lists the Mk I neighbourhood of Tau Ceti from domain positions', () => {
    const near = starsWithin(star('Tau Ceti'), 5).map((x) => x.star.name);
    expect(near).toEqual(['Epsilon Eridani', 'Lacaille 9352', 'YZ Ceti', 'BL Ceti']);
  });
});

describe('marks from the snapshot', () => {
  const snapshot = new MockServer().snapshot();

  it('derives the colony star from the scenario', () => {
    expect(colonyStarName(snapshot)).toBe('Tau Ceti');
    expect(colonyStarName({ ...snapshot, scenarioId: 'planeta-matka' })).toBe('Sol (Sun)');
  });

  it('falls back to the STAR body of the world', () => {
    const fake = { scenarioId: 'other' as never, players: [], hubs: [], world: { bodies: [{ kind: 'STAR', name: 'Słońce' }] as never } };
    expect(colonyStarName(fake)).toBe('Sol (Sun)');
  });

  it('resolves every mock hub and player home star', () => {
    const marks = resolveMarks(snapshot);
    expect(marks.unresolved).toEqual([]);
    expect([...marks.hubs.keys()].sort()).toEqual(['Sirius A', 'Sol (Sun)']);
    expect(marks.others.get('Procyon A')).toBeGreaterThanOrEqual(1);
    // The mock (and the board) say 'Alpha Centauri': resolved to the primary component.
    expect(snapshot.players.some((p) => p.homeStar === 'Alpha Centauri')).toBe(true);
    expect(marks.others.get('Alpha Centauri A')).toBeGreaterThanOrEqual(1);
    expect([...marks.others.values()].reduce((a, b) => a + b, 0)).toBe(snapshot.players.length);
  });

  it('reports unknown names instead of guessing', () => {
    const marks = resolveMarks({ scenarioId: 'tau-ceti', hubs: [{ id: 'h', name: 'X', star: 'Nowhere', quotes: [] }], players: [] });
    expect(marks.unresolved).toEqual(['Nowhere']);
    expect(findStar('sun')?.name).toBe('Sol (Sun)');
    expect(findStar('Alpha Centauri')?.name).toBe('Alpha Centauri A');
    expect(findStar('sirius')?.name).toBe('Sirius A');
    expect(findStar('Sirius B')?.name).toBe('Sirius B');
  });

  it('builds distinct markers, selection last', () => {
    const marks = resolveMarks(snapshot);
    const markers = buildMarkers(marks, 'Epsilon Eridani', 'YZ Ceti');
    expect(markers[0]).toMatchObject({ starName: 'Tau Ceti', shape: 'square', color: 'signal' });
    expect(markers.filter((m) => m.shape === 'diamond').map((m) => m.starName).sort()).toEqual(['Sirius A', 'Sol (Sun)']);
    expect(markers.some((m) => m.shape === 'ring' && m.starName === 'Procyon A')).toBe(true);
    expect(markers.at(-2)).toMatchObject({ starName: 'YZ Ceti', shape: 'brackets', color: 'text' });
    expect(markers.at(-1)).toMatchObject({ starName: 'Epsilon Eridani', shape: 'brackets', color: 'signal' });
    expect(buildMarkers(marks, 'Vega', 'Vega').filter((m) => m.starName === 'Vega')).toHaveLength(1);
  });
});

describe('range rings', () => {
  it('matches the board and the economy catalogue drive names', () => {
    expect(RANGE_RINGS.map((r) => r.ly)).toEqual([5, 9]);
    expect(Object.keys(STARSHIP_MODULES).some((k) => k.includes('Mk I (5 ly)'))).toBe(true);
    expect(Object.keys(STARSHIP_UPGRADES).some((k) => k.includes('Mk II (9 ly)'))).toBe(true);
    expect(RANGE_RINGS[0]).toMatchObject({ edge: 'signal' });
    expect(RANGE_RINGS[1]).toMatchObject({ edge: 'metal' });
  });

  it('builds a closed unit circle of segment pairs', () => {
    const c = circleSegments(8);
    expect(c.length).toBe(8 * 6);
    for (let i = 0; i < c.length; i += 3) expect(Math.hypot(c[i]!, c[i + 1]!)).toBeCloseTo(1, 6);
    expect(c[c.length - 3]).toBeCloseTo(c[0]!);
    expect(c[c.length - 2]).toBeCloseTo(c[1]!);
  });

  it('computes the outline of a range sphere', () => {
    const s = sphereSilhouette(5, 26)!;
    expect(s.radius).toBeCloseTo((5 * Math.sqrt(26 * 26 - 25)) / 26);
    expect(s.offset).toBeCloseTo(25 / 26);
    // Tangent point: |offset point| and outline radius form a right triangle with r.
    expect(s.radius ** 2 + s.offset ** 2).toBeCloseTo(25);
    expect(sphereSilhouette(9, 4)).toBeNull();
    // Far away the outline tends to the sphere radius.
    expect(sphereSilhouette(9, 1e6)!.radius).toBeCloseTo(9, 3);
  });
});

describe('camera limits (W09)', () => {
  const deneb = starScenePosition(star('Deneb'));
  for (const colony of ['Tau Ceti', 'Sol (Sun)']) {
    it(`reaches Deneb from ${colony}`, () => {
      const focus = starScenePosition(star(colony));
      const lim = cameraLimits(focus);
      // Worst case: camera at max zoom on the far side of the focus.
      expect(lim.far).toBeGreaterThan(lim.maxDistance + distance(focus, deneb));
      expect(lim.maxDistance).toBeGreaterThan(distance(focus, deneb));
      // At max zoom every star fits within the vertical half field of view.
      const half = (lim.fov / 2) * (Math.PI / 180);
      for (const s of STARS) {
        expect(Math.asin(Math.min(1, distance(focus, starScenePosition(s)) / lim.maxDistance))).toBeLessThan(half);
      }
      // Start framing: the Mk II ring fits the height with margin (~22 ly neighbourhood).
      const visible = 2 * lim.startDistance * Math.tan(half);
      expect(visible).toBeGreaterThan(18);
      expect(visible).toBeLessThan(26);
      expect(lim.near).toBeLessThan(lim.minDistance);
    });
  }

  it('exceeds the PoC far plane that clipped Deneb', () => {
    const pocFarLy = (5000 / 16) * LY_PER_PARSEC;
    expect(maxStarRadius() * LY_PER_PARSEC).toBeGreaterThan(pocFarLy);
    expect(Math.hypot(...START_DIRECTION)).toBeCloseTo(1);
  });
});

describe('labels', () => {
  const tau = starScenePosition(star('Tau Ceti'));

  it('always labels marked stars and fills up with the nearest', () => {
    const marked = new Set(['Tau Ceti', 'Sirius A', 'Deneb']);
    const labels = selectLabels(STARS, tau, 26, marked, 8);
    expect(labels).toHaveLength(8);
    expect(labels.filter((l) => l.marked).map((l) => l.name).sort()).toEqual(['Deneb', 'Sirius A', 'Tau Ceti']);
    const rest = labels.filter((l) => !l.marked).map((l) => l.name);
    expect(rest.slice(0, 2)).toEqual(['Epsilon Eridani', 'Lacaille 9352']);
    expect(rest).not.toContain('Rigel');
  });

  it('prefers luminous landmarks when zoomed far out', () => {
    const labels = selectLabels(STARS, tau, 3000, new Set(['Tau Ceti', 'Sol (Sun)']), 6).map((l) => l.name);
    expect(labels).toEqual(['Sol (Sun)', 'Tau Ceti', 'Deneb', 'Rigel', 'Betelgeuse', 'Canopus']);
  });

  it('never exceeds the limit with few marks', () => {
    expect(selectLabels(STARS, tau, 26, new Set(), 5)).toHaveLength(5);
    expect(selectLabels(STARS, tau, 26, new Set(STARS.map((s) => s.name)), 5)).toHaveLength(STARS.length);
  });

  it('tries the other sides before dropping a label', () => {
    const box = (name: string, ax: number, ay: number, force = false) => ({ name, ax, ay, gap: 8, w: 60, h: 14, force });
    const shown = placeLabels([box('a', 100, 100, true), box('b', 100, 104), box('c', 100, 140)], 800, 600);
    expect(shown.get('a')).toEqual({ x: 108, y: 95 });
    // b overlaps a on the right, so it goes left.
    expect(shown.get('b')).toEqual({ x: 32, y: 99 });
    expect(shown.get('c')).toEqual({ x: 108, y: 135 });
  });

  it('drops unforced overlaps, off-screen anchors and clustered forced labels', () => {
    const box = (name: string, ax: number, ay: number, force = false) => ({ name, ax, ay, gap: 8, w: 60, h: 14, force });
    // Blockers occupying all four sides of a label anchored at (200, 200).
    const wall = (gap: number, ax: number, ay: number, name: string) => ({ name, ax, ay, gap, w: 60, h: 14, force: true, fixed: true });
    const blockers = [wall(30, 178, 200, 'R'), wall(8, 124, 200, 'L'), wall(8, 162, 183, 'U'), wall(8, 162, 213, 'D')];
    expect(placeLabels(blockers, 800, 600).size).toBe(4);
    const shown = placeLabels([...blockers, box('x', 200, 200), box('y', 2000, 10, true), box('far', 500, 400, true)], 800, 600);
    expect(shown.has('x')).toBe(false);
    expect(shown.has('y')).toBe(false);
    expect(shown.has('far')).toBe(true);
    // A forced label with every side taken still shows, unless its star is in a cluster.
    expect(placeLabels([...blockers, box('f', 200, 200, true)], 800, 600).get('f')).toEqual({ x: 208, y: 195 });
    expect(placeLabels([...blockers, box('g', 180, 201, true)], 800, 600).has('g')).toBe(false);
    expect(LABEL_CLUSTER_PX).toBeGreaterThan(5);
  });

  it('keeps fixed labels on the right', () => {
    expect(labelCandidates({ name: 'r', ax: 0, ay: 20, gap: 8, w: 10, h: 10, force: false, fixed: true })).toEqual([{ x: 8, y: 15 }]);
  });
});

describe('picking', () => {
  it('returns the nearest star within a few pixels', () => {
    const pts = [
      { name: 'A', x: 100, y: 100, r: 5 },
      { name: 'B', x: 108, y: 100, r: 2.5 },
    ];
    expect(pickNearest(pts, 107, 100)).toBe('B');
    expect(pickNearest(pts, 101, 101)).toBe('A');
    expect(pickNearest(pts, 100, 110)).toBe('A');
    expect(pickNearest(pts, 100, 120)).toBeNull();
    expect(pickNearest([], 0, 0)).toBeNull();
  });
});
