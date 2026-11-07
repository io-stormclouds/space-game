import { LY_PER_PARSEC, STARS, inconsistentSourceStars, lightYearsBetween, maxStarRadius } from './stars';

describe('star catalog (W10 A)', () => {
  it('has the 41 stars of the galaxy PoC, Sol at the origin', () => {
    expect(STARS).toHaveLength(41);
    const sol = STARS.find((s) => s.distance === 0)!;
    expect(sol.pos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('places every star at its catalog distance, in the source direction', () => {
    for (const s of STARS) {
      const len = Math.hypot(s.pos.x, s.pos.y, s.pos.z);
      expect(len * LY_PER_PARSEC).toBeCloseTo(s.distance, 6);
      const src = Math.hypot(s.x, s.y, s.z);
      if (src > 0) expect((s.pos.x * s.x + s.pos.y * s.y + s.pos.z * s.z) / (len * src)).toBeCloseTo(1, 9);
    }
  });

  it('lists the source inconsistencies it fixed (Vega and Deneb among them)', () => {
    const names = inconsistentSourceStars().map((s) => s.name);
    expect(names.some((n) => n.startsWith('Vega'))).toBe(true);
    expect(names.some((n) => n.startsWith('Deneb'))).toBe(true);
    const vega = STARS.find((s) => s.name.startsWith('Vega'))!;
    expect(vega.distance).toBe(25.04);
    expect(vega.sourceDistance).toBeGreaterThan(38);
  });

  it('keeps Tau Ceti as the canvas uses it: G8.5V, 11.91 ly, 5 planets', () => {
    const tc = STARS.find((s) => s.name === 'Tau Ceti')!;
    expect(tc).toMatchObject({ spectralClass: 'G8.5V', distance: 11.91, planets: 5, luminosity: 0.52 });
    const sol = STARS.find((s) => s.distance === 0)!;
    expect(lightYearsBetween(sol, tc)).toBeCloseTo(11.91, 6);
  });

  it('reports the radius the galaxy camera must reach (Deneb, 2615 ly)', () => {
    expect(maxStarRadius() * LY_PER_PARSEC).toBeCloseTo(2615, 0);
  });
});
