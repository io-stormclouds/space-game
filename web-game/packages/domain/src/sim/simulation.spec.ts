import { BodyId } from '../shared/ids';
import { DomainEvent } from './models/domain-event.model';
import { Tile, TileId } from './models/planet-grid.model';
import { colonyObjectives } from './objectives';
import { WorldState, storageOf } from './reducer';
import { ARK_ID, TAU_CETI_ID, TAU_CETI_SCENARIO, TC_B, TC_BELT, TC_E } from './scenarios/tau-ceti';
import { Command, Simulation } from './simulation';
import { tileIndexOf } from './systems/rover-system';

/** Drives the canvas flow headlessly; the same script must give the same world every time. */
class Flow {
  readonly sim = new Simulation(TAU_CETI_SCENARIO);
  readonly log: DomainEvent[] = [];

  get world(): WorldState {
    return this.sim.world;
  }

  send(cmd: Command): DomainEvent[] {
    const events = this.sim.dispatch(cmd);
    this.log.push(...events);
    return events;
  }

  ok(cmd: Command): void {
    const events = this.send(cmd);
    const rejected = events.find((e) => e.type === 'COMMAND_REJECTED');
    if (rejected) throw new Error(`${cmd.type} rejected: ${JSON.stringify(rejected)}`);
  }

  runUntil(pred: () => boolean, maxMinutes: number, dt = 0.25): number {
    const start = this.sim.time;
    while (!pred()) {
      this.log.push(...this.sim.step(dt));
      if (this.sim.time - start > maxMinutes) throw new Error(`timeout after ${maxMinutes} min`);
    }
    return this.sim.time - start;
  }

  freeTiles(body: BodyId): Tile[] {
    const used = new Set(this.world.structures.flatMap((s) => s.tiles));
    return this.sim.grids.get(body)!.tiles.filter((t) => !used.has(t.id));
  }

  depositTile(body: BodyId, material: string): TileId {
    return this.freeTiles(body).find((t) => t.deposit?.resource === material)!.id;
  }

  plainTile(body: BodyId): TileId {
    return this.freeTiles(body).find((t) => !t.deposit && t.neighbors.length === 6)!.id;
  }
}

/** The whole first session of the canvas, as a script. Returns the flow for assertions. */
function playFirstSession(stopAfterPort = false): Flow {
  const f = new Flow();
  f.ok({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  f.runUntil(() => f.world.scan.state === 'DONE', 30);
  f.ok({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
  f.ok({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E });
  f.runUntil(() => f.world.ships[0]!.state === 'DOCKED', 60);
  const grid = f.sim.grids.get(TC_E)!;
  const anchor = grid.tiles.find((t) => t.neighbors.length === 6 && [t.index, ...t.neighbors].every((i) => !grid.tiles[i]!.deposit))!;
  f.ok({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: anchor.id });
  if (stopAfterPort) return f;
  f.runUntil(() => f.world.colony.foundedAt !== null, 60);
  f.ok({ type: 'CALL_SHUTTLE', bodyId: TC_E, cargo: { FER: 150, SIL: 80, KRI: 20 } });
  f.runUntil(() => (storageOf(f.world, TC_E)['FER'] ?? 0) >= 150, 30);
  f.ok({ type: 'BUILD', bodyId: TC_E, tileId: f.plainTile(TC_E), kind: 'WND' });
  f.ok({ type: 'BUILD', bodyId: TC_E, tileId: f.plainTile(TC_E), kind: 'HAB' });
  f.ok({ type: 'BUILD', bodyId: TC_E, tileId: f.depositTile(TC_E, 'FER'), kind: 'MIN' });
  f.ok({ type: 'BUILD', bodyId: TC_E, tileId: f.depositTile(TC_E, 'KRI'), kind: 'ICE' });
  f.ok({ type: 'BUILD', bodyId: TC_E, tileId: f.depositTile(TC_E, 'SIL'), kind: 'SIT' });
  f.runUntil(() => colonyObjectives(f.world, f.sim.rules, f.sim.grids).every((o) => o.done), 240);
  f.runUntil(() => f.sim.time >= 300, 300); // let the colony work until minute 300
  return f;
}

describe('Canvas flow on the unified domain (W06 A: Tau Ceti)', () => {
  it('arrival: Arka-1 in the system, five unknown objects, nothing done yet', () => {
    const f = new Flow();
    const ark = f.world.ships[0]!;
    expect(ark).toMatchObject({ name: 'Arka-1', role: 'MOTHERSHIP', state: 'DOCKED', currentBodyId: TAU_CETI_ID, maxCargo: 2000 });
    expect(Object.values(ark.cargo).reduce((s, q) => s + q, 0)).toBe(2000);
    expect(ark.onboard).toEqual({ rovers: 2, shuttles: 1, probes: 1 });
    const hidden = f.world.bodies.filter((b) => b.revealed === false);
    expect(hidden.map((b) => b.unknownName)).toEqual(['Obiekt 1', 'Obiekt 2', 'Obiekt 3', 'Obiekt 4', 'Obiekt 5']);
    expect(colonyObjectives(f.world, f.sim.rules, f.sim.grids).map((o) => o.done)).toEqual([false, false, false, false]);
    // grids from the scan board: b, c 252 tiles; d, f 362; e 642
    expect(f.sim.grids.get(TC_B)!.tiles).toHaveLength(252);
    expect(f.sim.grids.get(TC_E)!.tiles).toHaveLength(642);
    expect(f.sim.grids.has(TC_BELT)).toBe(false);
  });

  it('enforces the order of the flow: scan before choosing, the Ark in orbit before the port', () => {
    const f = new Flow();
    expect(f.send({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E })[0]).toMatchObject({ reason: 'NOT_SCANNED' });
    f.ok({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
    expect(f.send({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E })[0]).toMatchObject({ reason: 'SCAN_RUNNING' });
    const scanTime = f.runUntil(() => f.world.scan.state === 'DONE', 30);
    expect(scanTime).toBeGreaterThanOrEqual(15);
    expect(scanTime).toBeLessThan(15.5);
    expect(f.world.bodies.every((b) => b.revealed !== false)).toBe(true);
    expect(f.send({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_BELT })[0]).toMatchObject({ reason: 'NO_GRID' });
    f.ok({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
    const tile = f.plainTile(TC_E);
    expect(f.send({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: tile })[0]).toMatchObject({ reason: 'NO_SHIP' });
    expect(f.send({ type: 'BUILD', bodyId: TC_E, tileId: tile, kind: 'SOL' })[0]).toMatchObject({ reason: 'NO_ROVER' });
  });

  it('port: landed from the hold with two rovers, built in 12 min, the colony is founded', () => {
    const f = playFirstSession(true);
    const ark = f.world.ships[0]!;
    expect(ark.cargo).toMatchObject({ STA: 480, BET: 120, UKL: 50 });
    expect(ark.onboard?.rovers).toBe(0);
    expect(f.world.rovers.filter((r) => r.bodyId === TC_E)).toHaveLength(2);
    const port = f.world.structures.find((s) => s.kind === 'HQ')!;
    expect(port).toMatchObject({ state: 'PLANNED', tiles: expect.any(Array) });
    expect(port.tiles).toHaveLength(3);
    const building = f.runUntil(() => f.world.colony.foundedAt !== null, 60);
    expect(building).toBeGreaterThanOrEqual(12);
    expect(building).toBeLessThan(14); // drive to the site + 12 min
    expect(f.world.bodies.find((b) => b.id === TC_E)!.isHomeBase).toBe(true);
    expect(f.sim.colonyOf(TC_E).power.produced).toBe(5);
    expect(f.sim.colonyOf(TC_E).capacity).toEqual({ sypkie: 2000, sztukowe: 2000 });
  });

  it('first colony: shuttle supplies, rovers build wind, habitat and three extractors; FER, SIL, KRI flow in', () => {
    const f = playFirstSession();
    expect(colonyObjectives(f.world, f.sim.rules, f.sim.grids).every((o) => o.done)).toBe(true);
    const store = storageOf(f.world, TC_E);
    for (const code of ['FER', 'SIL', 'KRI']) {
      expect(f.log.some((e) => e.type === 'EXTRACTION_TICK' && e.resource === code)).toBe(true);
    }
    expect(store['KRI']).toBeGreaterThan(20 - 5);
    const kinds = f.world.structures.filter((s) => s.bodyId === TC_E).map((s) => `${s.kind}:${s.state}`);
    expect(kinds).toEqual(['HQ:ACTIVE', 'WND:ACTIVE', 'HAB:ACTIVE', 'MIN:ACTIVE', 'ICE:ACTIVE', 'SIT:ACTIVE']);
    const colony = f.sim.colonyOf(TC_E);
    expect(colony.power).toMatchObject({ produced: 15, consumed: 11 });
    expect(colony.crew).toMatchObject({ capacity: 15, demand: 6 });
    // the shuttle took exactly what it brought down from the hold
    expect(f.world.ships[0]!.cargo['FER']).toBe(400 - 150);
  });

  it('is deterministic: the same script gives the same world', () => {
    const a = playFirstSession();
    const b = playFirstSession();
    expect(JSON.stringify(b.world)).toBe(JSON.stringify(a.world));
    expect(b.log).toEqual(a.log);
  });

  it('continues a saved game: JSON round trip mid-construction gives the same result', () => {
    const straight = playFirstSession(true);
    straight.runUntil(() => straight.world.rovers.some((r) => r.state === 'BUILDING'), 10);
    const saved = JSON.parse(JSON.stringify(straight.world)) as WorldState;
    const loaded = new Simulation(TAU_CETI_SCENARIO, { world: saved });
    for (let i = 0; i < 80; i++) {
      straight.sim.step(0.25);
      loaded.step(0.25);
    }
    expect(JSON.stringify(loaded.world)).toBe(JSON.stringify(straight.world));
    expect(loaded.world.colony.foundedAt).not.toBeNull();
  });

  it('a second rover on the same site halves the remaining time', () => {
    const solo = playFirstSession(true);
    const duo = playFirstSession(true);
    const port = duo.world.structures.find((s) => s.kind === 'HQ')!;
    duo.runUntil(() => duo.world.rovers.some((r) => r.job === port.id && r.state === 'BUILDING'), 5);
    const helper = duo.world.rovers.find((r) => !r.job)!;
    duo.ok({ type: 'ASSIGN_ROVER', roverId: helper.id, structureId: port.id });
    const tSolo = solo.runUntil(() => solo.world.colony.foundedAt !== null, 60);
    const tDuo = duo.runUntil(() => duo.world.colony.foundedAt !== null, 60);
    expect(tDuo).toBeLessThan(tSolo * 0.75);
    expect(tileIndexOf(port.tileId)).toBeGreaterThanOrEqual(0);
  });
});
