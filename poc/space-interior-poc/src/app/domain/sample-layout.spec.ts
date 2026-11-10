import { describe, expect, it } from 'vitest';
import { LayoutIndex } from './layout-index';
import { computeRooms, roomLinks } from './rooms';
import { buildSampleLayout } from './sample-layout';
import { summarize } from './stats';
import { computeIssues } from './validation';

describe('sample corvette', () => {
  const { layout, problems } = buildSampleLayout();
  const index = new LayoutIndex(layout);
  const rooms = computeRooms(index);
  const issues = computeIssues(index, rooms);

  it('is built without a single rejected piece', () => {
    expect(problems).toEqual([]);
  });

  it('is airtight, reachable and free of placement errors', () => {
    expect(issues.map((i) => `${i.code}: ${i.detail}`)).toEqual([]);
  });

  it('has every room recognised by its furniture', () => {
    const types = rooms.map((r) => `${r.level}:${r.type}`).sort();
    expect(types).toEqual(
      [
        ...['bridge', 'briefing', 'corridor', 'engineering', 'hydroponics', 'medbay', 'mess', 'quarters', 'storage', 'stairwell', 'lift'].map((t) => `0:${t}`),
        '1:quarters',
        '1:mess',
        '1:lift',
        '2:bridge',
        '2:lift',
      ].sort(),
    );
  });

  it('joins its three decks by stairs and a lift', () => {
    const kinds = roomLinks(index, rooms).map((l) => l.kind);
    expect(kinds.filter((k) => k === 'stairs')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'lift')).toHaveLength(2);
  });

  it('adds up to a ship', () => {
    const s = summarize(index, rooms, issues);
    expect(s.sealed).toBe(true);
    expect(s.decks).toEqual([0, 1, 2]);
    expect(s).toMatchObject({ stairs: 1, lifts: 1, liftStops: 3 });
    expect(s.stats.berths).toBe(7);
    expect(s.stats.power).toBeGreaterThan(0);
  });
});
