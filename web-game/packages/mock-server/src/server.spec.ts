import { ARK_ID, TC_E, computeEconomy, type BodyId } from '@space-game/domain';
import { GalaxySim } from './galaxy-sim';
import { createInThreadGameApi } from './in-thread';
import { MockServer } from './server';

/** A short session with commands, a tempo change and a pause: the material for replay. */
function playSession(server: MockServer): void {
  server.setTempo(600); // 10 model minutes per real second: 1/6 min per step
  server.command({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  server.stepMany(100); // ~16.7 min: scan done
  server.command({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
  server.command({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E });
  server.stepMany(400);
  server.setTempo(60);
  server.command({ type: 'BUILD', bodyId: TC_E, tileId: `${TC_E}:0` as never, kind: 'SOL' }); // rejected: no rover yet
  server.stepMany(50);
}

describe('MockServer', () => {
  it('advances fixed steps of stepSeconds × tempo / 60 model minutes', () => {
    const s = new MockServer();
    expect(s.stepMinutes).toBeCloseTo(1 / 60, 12); // tempo ×60 = PoC speed: 1 model minute per second
    s.stepMany(60);
    expect(s.simulation.time).toBeCloseTo(1, 9);
    s.setTempo(600);
    s.stepMany(6);
    expect(s.simulation.time).toBeCloseTo(2, 9);
  });

  it('turns real time into steps, respects pause and caps a long frame', () => {
    const s = new MockServer({ maxStepsPerAdvance: 8 });
    s.advance(0.05); // 3 steps of 1/60 s
    expect(s.snapshot().step).toBe(3);
    s.pause();
    s.advance(1);
    expect(s.snapshot().step).toBe(3);
    s.resume();
    s.advance(10); // background tab: capped at 8 steps, the rest dropped
    expect(s.snapshot().step).toBe(11);
    expect(s.stats().stepsPerSecond).toBeGreaterThan(0);
    expect(s.stats().meanMs).toBeGreaterThanOrEqual(0);
  });

  it('replays a saved command list to the identical world (F2 done criterion)', () => {
    const live = new MockServer();
    playSession(live);
    const file = live.save();
    expect(file.commands.map((c) => c.command.type)).toEqual(['SCAN_SYSTEM', 'CHOOSE_COLONY_SITE', 'MOVE_SHIP', 'BUILD']);
    expect(file.tempos).toEqual([
      { step: 0, tempo: 600 },
      { step: 500, tempo: 60 },
    ]);
    const replayed = new MockServer();
    const snap = replayed.replay(JSON.parse(JSON.stringify(file)));
    expect(snap.step).toBe(file.step);
    expect(JSON.stringify(snap.world)).toBe(JSON.stringify(file.world));
    expect(replayed.save().meta).toEqual(file.meta);
    expect(snap.world.ships[0]!.currentBodyId).toBe(TC_E);
  });

  it('loads a save file and continues exactly like the original', () => {
    const a = new MockServer();
    playSession(a);
    const b = new MockServer();
    b.load(JSON.parse(JSON.stringify(a.save())));
    a.stepMany(120);
    b.stepMany(120);
    expect(JSON.stringify(b.snapshot().world)).toBe(JSON.stringify(a.snapshot().world));
    expect(b.snapshot().players).toEqual(a.snapshot().players);
  });

  it('serves the catalog, availability and the placement preview to the UI', () => {
    const s = new MockServer();
    s.start('planeta-matka');
    const cat = s.catalog();
    expect(cat.materials).toHaveLength(37);
    expect(cat.buildings.find((b) => b.id === 'MIN')).toMatchObject({ name: 'Kopalnia', footprint: 1, buildable: true });
    expect(cat.buildings.find((b) => b.id === 'SMT')!.levels[0]!.cost).toEqual({ FER: 160, SIL: 80 });
    expect(cat.rover).toEqual({ cost: { FER: 20, SIL: 5 }, buildTime: 3 });
    const planet = 'planet' as BodyId;
    expect(s.availability(planet, ['SOL', 'SMT'])).toEqual({
      SOL: { ok: true },
      SMT: { ok: false, reason: 'NO_RESOURCES', detail: 'brakuje FER 120 · SIL 60' },
    });
    const grid = s.simulation.grids.get(planet)!;
    const deposit = grid.tiles.find((t) => t.deposit?.resource === 'FER')!;
    expect(s.previewBuild(planet, deposit.index, 'MIN', 0)).toEqual({ ok: true, tiles: [deposit.index] });
    expect(s.previewBuild(planet, deposit.index, 'SOL', 0)).toMatchObject({ ok: true });
    const pad = s.snapshot().world.structures.find((x) => x.kind === 'LAND')!;
    expect(s.previewBuild(planet, Number(pad.tileId.split(':')[1]), 'SOL', 0)).toMatchObject({ ok: false, reason: 'TILE_OCCUPIED' });
  });

  it('rejects files that are not saves', () => {
    expect(() => new MockServer().load({ format: 'x' } as never)).toThrow(/save file/);
  });

  it('reports colony readouts and canvas objectives in the snapshot', () => {
    const s = new MockServer();
    s.start('planeta-matka');
    const snap = s.snapshot();
    expect(snap.colonies['planet' as BodyId]!.power).toMatchObject({ produced: 10, consumed: 2 });
    expect(snap.objectives.map((o) => o.id)).toEqual(['scan', 'site', 'port', 'extract']);
  });
});

describe('GalaxySim (W11 B: simulated players and market)', () => {
  const eco = computeEconomy();

  it('starts the canvas players at Procyon A and Alpha Centauri and quotes every material at two hubs', () => {
    const g = new GalaxySim(eco);
    expect(g.players().map((p) => p.homeStar)).toEqual(expect.arrayContaining(['Procyon A', 'Alpha Centauri']));
    expect(g.players()).toHaveLength(6);
    const hubs = g.hubs();
    expect(hubs.map((h) => h.name)).toEqual(['Syriusz', 'Słońce']);
    expect(hubs[0]!.quotes).toHaveLength(37);
  });

  it('keeps prices within the doc bounds: bid = 0.8·P, ask = 1.25·P, P ∈ [0.5 V, 3 V]', () => {
    const g = new GalaxySim(eco);
    g.advance(24 * 60);
    for (const hub of g.hubs()) {
      for (const q of hub.quotes) {
        const p = q.bid / 0.8;
        expect(q.ask).toBeCloseTo(1.25 * p, 1);
        expect(p).toBeGreaterThanOrEqual(0.5 * q.value - 0.02);
        expect(p).toBeLessThanOrEqual(3 * q.value + 0.02);
      }
    }
  });

  it('is deterministic and survives save/load', () => {
    const a = new GalaxySim(eco);
    a.advance(600);
    const b = new GalaxySim(eco, undefined, a.save());
    a.advance(1200);
    b.advance(1200);
    expect(b.hubs()).toEqual(a.hubs());
    expect(b.players()).toEqual(a.players());
  });
});

describe('GameApi over the worker protocol (in-thread)', () => {
  it('starts, commands and pushes snapshots and events', async () => {
    const { api, host } = createInThreadGameApi({ autoRun: false });
    const events: string[] = [];
    api.onEvents((e) => events.push(...e.map((x) => x.type)));
    const snap = await api.start('tau-ceti');
    expect(snap.world.ships[0]!.name).toBe('Arka-1');
    const res = await api.command({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
    expect(res.ok).toBe(true);
    const rejected = await api.command({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
    expect(rejected).toMatchObject({ ok: false, events: [{ type: 'COMMAND_REJECTED', reason: 'NOT_SCANNED' }] });
    api.pause();
    const stepped = await api.stepOnce(60);
    expect(stepped.step).toBe(60);
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toContain('SCAN_STARTED');
    const file = await api.save();
    expect(file.format).toBe('space-game-save');
    host.tick(Date.now());
    api.dispose();
  });
});
