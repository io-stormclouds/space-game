import { BezierPath } from './bezier-path';
import { distance, length, vec3 } from './vec3';

describe('BezierPath', () => {
  it('starts at P0 and ends at P2', () => {
    const p = BezierPath.arc(vec3(0, 0, 0), vec3(100, 0, 0), 0.2);
    expect(p.pointAt(0, vec3())).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.pointAt(1, vec3())).toEqual({ x: 100, y: 0, z: 0 });
  });

  it('lifts the control point by liftFactor × |P2−P0|', () => {
    const p = BezierPath.arc(vec3(0, 0, 0), vec3(100, 0, 0), 0.2);
    expect(p.p1).toEqual({ x: 50, y: 20, z: 0 });
    expect(p.pointAt(0.5, vec3()).y).toBeCloseTo(10); // apex of quadratic = p1.y / 2
  });

  it('approximates arc length: straight line when there is no lift, longer otherwise', () => {
    const straight = new BezierPath(vec3(0, 0, 0), vec3(50, 0, 0), vec3(100, 0, 0));
    expect(straight.approxLength(64)).toBeCloseTo(100, 6);
    const arc = BezierPath.arc(vec3(0, 0, 0), vec3(100, 0, 0), 0.2);
    expect(arc.approxLength(64)).toBeGreaterThan(100);
    expect(arc.approxLength(64)).toBeLessThan(110);
  });

  it('returns unit tangents pointing along the direction of travel', () => {
    const p = BezierPath.arc(vec3(0, 0, 0), vec3(100, 0, 0), 0.2);
    const t0 = p.tangentAt(0, vec3());
    expect(length(t0)).toBeCloseTo(1);
    expect(t0.x).toBeGreaterThan(0);
    expect(t0.y).toBeGreaterThan(0); // climbing at launch
    const t1 = p.tangentAt(1, vec3());
    expect(t1.y).toBeLessThan(0); // descending at arrival
  });

  it('setEnd moves only the end point until relift is called', () => {
    const p = BezierPath.arc(vec3(0, 0, 0), vec3(100, 0, 0), 0.2);
    p.setEnd(vec3(0, 0, 100));
    expect(p.p2).toEqual({ x: 0, y: 0, z: 100 });
    expect(p.p1).toEqual({ x: 50, y: 20, z: 0 });
    p.relift(0.2);
    expect(p.p1).toEqual({ x: 0, y: 20, z: 50 });
  });

  it('samples evenly in u from start to end', () => {
    const p = BezierPath.arc(vec3(0, 0, 0), vec3(100, 0, 0), 0);
    const out = [vec3(), vec3(), vec3(), vec3(), vec3()];
    p.sample(out);
    expect(out[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(out[4]).toEqual({ x: 100, y: 0, z: 0 });
    expect(distance(out[1], out[2])).toBeCloseTo(25);
  });
});
