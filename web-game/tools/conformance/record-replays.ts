// Records golden replays (plan 02 §5.1): scripted games on the mock server, saved as the mock's
// `SaveFile` plus the events of every step. Scripts that show a rule (`teren`) throw when the mock
// does not do what they expect. `cargo run -p conformance -- replay <dir>` in server/
// replays each save through game-core and compares the world, the events and the rejected count.
//   node --import tsx tools/conformance/record-replays.ts [outDir] [revision]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, Cost, DomainEvent, TerrainKind, TileId, WorldState } from '@space-game/domain';
import {
  TC_C,
  TC_E,
  TC_F,
  TAU_CETI_ID,
  ARK_ID,
  colonyObjectives,
  storageOf,
  PLANET_ID,
  MOON_ID,
  ASTEROID_ID,
  SHIP_ID,
  footprintTiles,
  tileBuildable,
  tileId,
} from '@space-game/domain';
import { MockServer } from '@space-game/mock-server';
// the Atanor engine is not exported from the package index (the client imports it by path)
import {
  createArm,
  createUnbonderGlyph,
  emptySolution,
  findRecipeLevel,
  getReferenceSolution,
  hintSolution,
} from '../../packages/domain/src/atanor';

type ScenarioId = 'tau-ceti' | 'planeta-matka' | 'fabryka' | 'load-s' | 'load-m' | 'load-l';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? resolve(here, '../../../server/conformance/replays');
const revision = process.argv[3] ?? 'working-tree';

interface StepEvents {
  step: number;
  events: DomainEvent[];
}

/** Drives the mock like the UI would: commands between steps, fixed steps at the current tempo. */
class Recorder {
  readonly server: MockServer;
  readonly events: StepEvents[] = [];
  rejected = 0;
  /** Events of the last command, of the last step, and the game minutes of the last step (for checks). */
  lastCommand: DomainEvent[] = [];
  lastStep: DomainEvent[] = [];
  lastDt = 0;

  constructor(scenario: ScenarioId) {
    this.server = new MockServer();
    this.server.start(scenario);
  }

  get world(): WorldState {
    return this.server.simulation.world;
  }

  private bucket(): StepEvents {
    const step = this.server.snapshot().step;
    const last = this.events[this.events.length - 1];
    if (last && last.step === step) return last;
    const b = { step, events: [] };
    this.events.push(b);
    return b;
  }

  cmd(command: Command): boolean {
    const r = this.server.command(command);
    if (!r.ok) this.rejected++;
    this.bucket().events.push(...r.events);
    this.lastCommand = r.events;
    return r.ok;
  }

  step(): void {
    const b = this.bucket();
    const t0 = this.world.time;
    this.lastStep = this.server.step();
    this.lastDt = this.world.time - t0;
    b.events.push(...this.lastStep);
  }

  steps(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  until(pred: () => boolean, maxSteps: number): void {
    for (let i = 0; i < maxSteps && !pred(); i++) this.step();
    if (!pred()) throw new Error(`condition not reached after ${maxSteps} steps`);
  }

  setTempo(tempo: number): void {
    this.server.setTempo(tempo);
  }

  freeTiles(body: string) {
    const used = new Set(this.world.structures.flatMap((s) => s.tiles));
    return this.server.simulation.grids.get(body as never)!.tiles.filter((t) => !used.has(t.id));
  }

  depositTile(body: string, material: string) {
    return this.freeTiles(body).find((t) => t.deposit?.resource === material)!.id;
  }

  /** A free hexagon without a deposit that can be built on (T5: lakes on Tau Ceti e and the PoC planet). */
  plainTile(body: string) {
    return this.freeTiles(body).find((t) => !t.deposit && t.neighbors.length === 6 && tileBuildable(t))!.id;
  }

  /** A free hexagon of a terrain class (T8), off the settlement roads and without a deposit. */
  terrainTile(body: string, kind: TerrainKind) {
    return this.freeTiles(body).find((t) => t.terrain === kind && !t.road && !t.deposit && t.neighbors.length === 6)!.id;
  }

  /** A free tile of the settlement roads (T8). */
  roadTile(body: string) {
    return this.freeTiles(body).find((t) => t.road)!.id;
  }

  write(name: string): void {
    const dir = join(outDir, name);
    mkdirSync(dir, { recursive: true });
    const save = this.server.save();
    // drop empty buckets (a step without events), keep order
    const events = this.events.filter((b) => b.events.length > 0);
    writeFileSync(join(dir, 'save.json'), JSON.stringify(save) + '\n', 'utf8');
    writeFileSync(
      join(dir, 'expected.json'),
      JSON.stringify({
        world: save.world,
        events,
        rejected: this.rejected,
        source: {
          revision,
          recordedAt: new Date().toISOString(),
          steps: save.step,
          commands: save.commands.length,
        },
      }) + '\n',
      'utf8',
    );
    console.log(
      `${name}: ${save.step} steps, ${save.commands.length} commands (${this.rejected} rejected), ${events.length} steps with events`,
    );
  }
}

/** The canvas first session (W06 A), as in full-loop / simulation specs. */
function kanwaPierwszaSesja(): void {
  const r = new Recorder('tau-ceti');
  r.cmd({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  r.until(() => r.world.scan.state === 'DONE', 30 * 60);
  r.cmd({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
  r.cmd({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E });
  r.until(() => r.world.ships[0]!.state === 'DOCKED', 60 * 60);
  const grid = r.server.simulation.grids.get(TC_E)!;
  // the first hexagon clear of deposits around it whose footprint can be built on (T5: Tau Ceti e has
  // lakes, none in its landing cap where this lands)
  const anchor = grid.tiles.find(
    (t) =>
      t.neighbors.length === 6 &&
      [t.index, ...t.neighbors].every((i) => !grid.tiles[i]!.deposit) &&
      (footprintTiles(grid, t.index, 3, 0) ?? [-1]).every((i) => i >= 0 && tileBuildable(grid.tiles[i]!)),
  )!;
  if (!r.cmd({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: anchor.id })) throw new Error('kanwa: the port did not land');
  r.until(() => r.world.colony.foundedAt !== null, 60 * 60);
  r.cmd({ type: 'CALL_SHUTTLE', bodyId: TC_E, cargo: { FER: 150, SIL: 80, KRI: 20 } });
  r.until(() => (storageOf(r.world, TC_E)['FER'] ?? 0) >= 150, 30 * 60);
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: r.plainTile(TC_E), kind: 'WND' });
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: r.plainTile(TC_E), kind: 'HAB' });
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: r.depositTile(TC_E, 'FER'), kind: 'MIN' });
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: r.depositTile(TC_E, 'KRI'), kind: 'ICE' });
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: r.depositTile(TC_E, 'SIL'), kind: 'SIT' });
  r.until(
    () =>
      colonyObjectives(r.world, r.server.simulation.rules, r.server.simulation.grids).every(
        (o) => o.done,
      ),
    240 * 60,
  );
  r.until(() => r.world.time >= 300, 300 * 60);
  // a landing pad and a flight of the mothership to f (D33), then back
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: r.plainTile(TC_E), kind: 'LAND' });
  r.until(() => r.world.structures.some((s) => s.kind === 'LAND' && s.state === 'ACTIVE'), 60 * 60);
  r.cmd({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_F });
  r.until(() => r.world.ships[0]!.state === 'DOCKED', 200 * 60);
  r.cmd({ type: 'PRODUCE_ROVER', bodyId: TC_E }); // ROVER_LIMIT: port L1 allows 2 rovers (D2) and two landed
  r.steps(60);
  // the first session goes through on the terrain of Tau Ceti e (T5): one refusal, none of them terrain
  const refusals = r.events.flatMap((b) => b.events).filter((e) => e.type === 'COMMAND_REJECTED');
  if (refusals.length !== 1 || refusals.some((e) => e.reason === 'BAD_TERRAIN'))
    throw new Error(`kanwa: refusals ${JSON.stringify(refusals)}`);
  r.write('kanwa-pierwsza-sesja');
}

/** The PoC loop: planet → moon → asteroid (mining) → planet, then a rover drive. */
function pocPetla(): void {
  const r = new Recorder('planeta-matka');
  const ship = () => r.world.ships.find((s) => s.id === SHIP_ID)!;
  r.cmd({ type: 'MOVE_SHIP', shipId: SHIP_ID, to: MOON_ID });
  r.until(() => ship().state !== 'IN_TRANSIT', 600 * 60);
  r.cmd({ type: 'MOVE_SHIP', shipId: SHIP_ID, to: ASTEROID_ID });
  r.until(() => ship().state === 'MINING', 600 * 60);
  r.until(() => ship().state === 'DOCKED', 600 * 60);
  r.cmd({ type: 'MOVE_SHIP', shipId: SHIP_ID, to: PLANET_ID });
  r.until(() => ship().state !== 'IN_TRANSIT', 600 * 60);
  const grid = r.server.simulation.grids.get(PLANET_ID)!;
  const rover = r.world.rovers[0]!;
  const used = new Set(r.world.structures.flatMap((s) => s.tiles));
  const target = grid.tiles[rover.tileIndex]!.neighbors.find((n) => !used.has(grid.tiles[n]!.id))!;
  r.cmd({ type: 'MOVE_ROVER', roverId: rover.id, tileIndex: target });
  r.until(() => r.world.rovers[0]!.state === 'IDLE', 60 * 60);
  // the far side of the planet: a long BFS path
  const far = grid.tiles.reduce(
    (best, t) => (t.normal.y < best.normal.y ? t : best),
    grid.tiles[0]!,
  );
  r.cmd({ type: 'MOVE_ROVER', roverId: rover.id, tileIndex: far.index });
  r.steps(30 * 60);
  r.write('poc-petla');
}

/** Economy on the PoC planet: sites, power and crew gates, upgrade, cancel, demolish, production. */
function pocEkonomia(): void {
  const r = new Recorder('planeta-matka');
  const grid = r.server.simulation.grids.get(PLANET_ID)!;
  const used = () => new Set(r.world.structures.flatMap((s) => s.tiles));
  // on grass (T5: the PoC planet has terrain), so the costs below are the catalog numbers
  const grass = (t: (typeof grid.tiles)[number]) => t.terrain === 'grass' && !t.road;
  const ferrite = () =>
    grid.tiles.filter((t) => t.deposit?.resource === 'FER' && grass(t) && !used().has(t.id));
  const free = () => grid.tiles.find((t) => !t.deposit && grass(t) && !used().has(t.id))!;
  // FER 40 · KRI 10 · SIL 20: one mine (FER 15), then a habitat (FER 20 · SIL 10), the rest refused
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: ferrite()[0]!.id, kind: 'MIN' });
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: ferrite()[0]!.id, kind: 'MIN' }); // NO_CREW
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: free().id, kind: 'HAB' });
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: ferrite()[0]!.id, kind: 'MIN' }); // NO_RESOURCES
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: free().id, kind: 'WND' }); // NO_RESOURCES
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: free().id, kind: 'ELY' }); // NOT_BUILDABLE
  r.cmd({ type: 'BUILD', bodyId: MOON_ID, tileId: grid.tiles[0]!.id, kind: 'HAB' }); // NO_GRID (tile of another body)
  r.until(() => r.world.structures.every((s) => s.state === 'ACTIVE'), 120 * 60);
  // extraction fills the storage; a second mine, an upgrade attempt above the port cap, cancel and demolish
  r.until(() => (storageOf(r.world, PLANET_ID)['FER'] ?? 0) >= 60, 240 * 60);
  const mine = r.world.structures.find((s) => s.kind === 'MIN')!;
  r.cmd({ type: 'UPGRADE', structureId: mine.id }); // LEVEL_CAP (port L1)
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: ferrite()[0]!.id, kind: 'MIN' });
  const site = r.world.structures.find((s) => s.state === 'PLANNED')!;
  r.cmd({ type: 'CANCEL_CONSTRUCTION', structureId: site.id });
  r.cmd({ type: 'DEMOLISH', structureId: mine.id });
  r.cmd({ type: 'DEMOLISH', structureId: mine.id }); // NO_STRUCTURE
  r.cmd({ type: 'SET_RECIPE', structureId: 'nic', recipe: 'R_STA' }); // NO_STRUCTURE
  r.cmd({ type: 'PRODUCE_ROVER', bodyId: PLANET_ID });
  r.cmd({ type: 'PRODUCE_ROVER', bodyId: PLANET_ID }); // BUSY
  r.until(() => r.world.rovers.length === 2, 10 * 60);
  // a Huta (3 tiles) needs FER 160 · SIL 80: wait for ore, build, let it run (a fresh deposit on any
  // terrain: the grass ones left are partly mined)
  r.cmd({
    type: 'BUILD',
    bodyId: PLANET_ID,
    tileId: grid.tiles.find((t) => t.deposit?.resource === 'FER' && !used().has(t.id))!.id,
    kind: 'MIN',
  });
  r.cmd({
    type: 'BUILD',
    bodyId: PLANET_ID,
    tileId: grid.tiles.find((t) => t.deposit?.resource === 'SIL' && !used().has(t.id))!.id,
    kind: 'SIT',
  });
  r.until(
    () =>
      (storageOf(r.world, PLANET_ID)['FER'] ?? 0) >= 160 &&
      (storageOf(r.world, PLANET_ID)['SIL'] ?? 0) >= 80,
    600 * 60,
  );
  const anchor = grid.tiles.find(
    (t) =>
      t.neighbors.length === 6 &&
      [t.index, ...t.neighbors].every(
        (i) => !used().has(grid.tiles[i]!.id) && !grid.tiles[i]!.deposit && grass(grid.tiles[i]!),
      ),
  )!;
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: anchor.id, kind: 'SMT' }); // NO_CREW or ordered
  r.steps(60 * 60);
  r.write('poc-ekonomia');
}

/** Tempo changes while a scan and a flight run: the schedule must replay exactly. */
function tempoZmiany(): void {
  const r = new Recorder('tau-ceti');
  r.cmd({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  r.setTempo(600);
  r.until(() => r.world.scan.state === 'DONE', 30 * 60);
  r.setTempo(10);
  r.cmd({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
  r.cmd({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E });
  r.steps(120);
  r.setTempo(60);
  r.until(() => r.world.ships[0]!.state === 'DOCKED', 60 * 60);
  r.setTempo(1);
  r.steps(60);
  r.write('tempo-zmiany');
}

/** Refusals of the flow order, a star as a target, unknown ids. */
function odmowy(): void {
  const r = new Recorder('tau-ceti');
  r.cmd({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E }); // NOT_SCANNED
  r.cmd({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TAU_CETI_ID }); // NOT_LANDABLE
  r.cmd({ type: 'MOVE_SHIP', shipId: 'nikt', to: TC_E }); // NO_SHIP
  r.cmd({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  r.cmd({ type: 'SCAN_SYSTEM', shipId: ARK_ID }); // SCAN_RUNNING
  r.cmd({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E }); // SCAN_RUNNING
  r.cmd({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: 'tc-e:0' }); // NO_COLONY_SITE
  r.cmd({ type: 'CALL_SHUTTLE', bodyId: TC_E, cargo: { FER: 10 } }); // NO_COLONY
  r.cmd({ type: 'MOVE_ROVER', roverId: 'rover-x', tileIndex: 1 }); // NO_ROVER
  r.cmd({ type: 'ASSIGN_ROVER', roverId: 'rover-x', structureId: 'nic' }); // NO_STRUCTURE
  r.cmd({ type: 'UPGRADE', structureId: 'nic' }); // NO_STRUCTURE
  r.steps(5);
  r.until(() => r.world.scan.state === 'DONE', 30 * 60);
  r.cmd({ type: 'CHOOSE_COLONY_SITE', bodyId: 'tc-belt' }); // NO_GRID
  r.cmd({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
  r.cmd({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: 'tc-e:0' }); // NO_SHIP (the Ark is at the star)
  r.cmd({ type: 'BUILD', bodyId: TC_E, tileId: 'tc-e:0', kind: 'SOL' }); // NO_ROVER
  r.steps(5);
  r.write('odmowy');
}

/**
 * The Fabryka atanorowa (AT4): a draft, refusals of every kind, deployment and production of NAD,
 * a second program with an extra element (paid) and back (refunded, atoms inside returned), the
 * machine waiting when MIE runs out, demolition of the factory (its machine goes with it).
 */
function fabryka(): void {
  const r = new Recorder('fabryka');
  const atn = () => r.world.structures.find((s) => s.kind === 'ATN')!;
  const machine = () => r.world.machines?.[atn().id];
  const level = findRecipeLevel('A_NAD')!;
  const ref = getReferenceSolution(level);
  r.cmd({ type: 'SAVE_ATANOR_DRAFT', structureId: 'nic', solution: ref }); // NO_STRUCTURE
  r.cmd({ type: 'SAVE_ATANOR_DRAFT', structureId: atn().id, solution: hintSolution(ref) });
  r.cmd({ type: 'DEPLOY_ATANOR', structureId: 'nic', solution: ref }); // NO_STRUCTURE
  r.cmd({
    type: 'DEPLOY_ATANOR',
    structureId: atn().id,
    solution: { ...ref, arms: [...ref.arms, createArm({ id: 'arm-3', basePos: { q: 3, r: 0 } })] },
  }); // MACHINE_INVALID: off the L1 board
  r.cmd({
    type: 'DEPLOY_ATANOR',
    structureId: atn().id,
    solution: {
      ...ref,
      program: { ...ref.program, 'arm-1': ['EXTEND', ...ref.program['arm-1']!.slice(1)] },
    },
  }); // MACHINE_INVALID: NO_PISTON
  r.cmd({ type: 'DEPLOY_ATANOR', structureId: atn().id, solution: emptySolution() }); // MACHINE_NOT_PRODUCING
  r.cmd({ type: 'DEPLOY_ATANOR', structureId: atn().id, solution: ref });
  r.cmd({ type: 'DEPLOY_ATANOR', structureId: atn().id, solution: ref }); // BUSY
  r.until(() => machine()?.program != null, 60 * 60);
  r.until(() => (machine()?.delivered ?? 0) >= 3, 600 * 60);
  // a second program: an extra unbonder out of the molecule's way (+2 PRZ +1 UKL), then back to the reference (refund)
  const withUnbonder = {
    ...ref,
    glyphs: [...ref.glyphs, createUnbonderGlyph('unbonder-x', { q: 1, r: 1 }, { q: 2, r: 0 })],
  };
  r.cmd({ type: 'DEPLOY_ATANOR', structureId: atn().id, solution: withUnbonder });
  r.until(() => machine()!.deploy === null, 60 * 60);
  r.until(() => (machine()?.delivered ?? 0) >= 2, 600 * 60);
  r.cmd({ type: 'DEPLOY_ATANOR', structureId: atn().id, solution: ref });
  r.until(() => machine()!.deploy === null, 60 * 60);
  // the inputs run out (MIE 120 = 60 products): the machine waits
  r.until(() => machine()!.state === 'WAITING', 3000 * 60);
  r.steps(30);
  r.cmd({ type: 'DEMOLISH', structureId: atn().id });
  r.steps(5);
  r.write('fabryka');
}

/** Throws when `ok` is false: the replay must show the rule it is named after. */
function expect(ok: boolean, what: string): void {
  if (!ok) throw new Error(`teren: ${what}`);
}

/** The first event of `type` among `events`; throws without one. */
function eventOf<T extends DomainEvent['type']>(events: DomainEvent[], type: T, what: string): Extract<DomainEvent, { type: T }> {
  const e = events.find((x) => x.type === type);
  expect(e !== undefined, `${what}: expected ${type}, got ${JSON.stringify(events).slice(0, 300)}`);
  return e as Extract<DomainEvent, { type: T }>;
}

/** `ceil(q · pct / 100)` per material, written out here so the replay checks the rule, not the code. */
function terrainCost(cost: Cost, pct: number): Cost {
  return Object.fromEntries(Object.entries(cost).map(([k, q]) => [k, Math.ceil((q * pct) / 100)]));
}

const sameCost = (a: Cost, b: Cost): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Terrain in play on Tau Ceti c (T8, docs/planet-terrain-poc-wnioski-i-plan.md §9.4): the port refused
 * on a dried lake bed (`dune`, T-26: BAD_TERRAIN), landed on the settlement road (cost × 85 %, time ×
 * 75 %); a shuttle; solar panels on a road and in a forest, a habitat on rock, a panel refused on a dune;
 * the forest site cancelled (75 % of its terrain cost back); everything else built in its terrain time.
 * tc-c has a trace atmosphere, so no wind turbines.
 */
function teren(): void {
  const r = new Recorder('tau-ceti');
  const sim = r.server.simulation;
  const rules = sim.rules.terrain();
  const grid = sim.grids.get(TC_C)!;
  expect(grid.terrain?.biome === 'medieval', 'tc-c has the medieval terrain');
  // cost and time % of a tile: a road's on a road, its class's otherwise
  const pctOf = (index: number) => {
    const t = grid.tiles[index]!;
    return t.road ? rules.road : rules.kinds[t.terrain!];
  };
  r.cmd({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  r.until(() => r.world.scan.state === 'DONE', 30 * 60);
  r.cmd({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_C });
  r.cmd({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_C });
  r.until(() => r.world.ships[0]!.state === 'DOCKED', 60 * 60);

  // the port on a dried lake bed (T-26: the lakes of Tau Ceti c are dunes): refused
  const lake = grid.tiles.find((t) => t.terrain === 'dune' && footprintTiles(grid, t.index, 3, 0))!;
  r.cmd({ type: 'PLACE_SPACEPORT', bodyId: TC_C, tileId: lake.id });
  const wet = eventOf(r.lastCommand, 'COMMAND_REJECTED', 'port on a dune');
  expect(wet.reason === 'BAD_TERRAIN' && wet.detail === rules.kinds.dune.name, `port on a dune: ${wet.reason} ${wet.detail}`);

  // the port on three road tiles (else on grass): cheaper and faster than the catalog
  let anchor: { index: number; rotation: number } | null = null;
  for (const want of [(i: number) => grid.tiles[i]!.road === true, (i: number) => grid.tiles[i]!.terrain === 'grass' && !grid.tiles[i]!.deposit]) {
    for (const t of grid.tiles) {
      for (let rotation = 0; !anchor && rotation < t.neighbors.length; rotation++) {
        const tiles = footprintTiles(grid, t.index, 3, rotation);
        if (tiles && tiles.every(want)) anchor = { index: t.index, rotation };
      }
      if (anchor) break;
    }
    if (anchor) break;
  }
  expect(anchor !== null, 'a place for the port');
  const portPct = pctOf(anchor!.index);
  r.cmd({ type: 'PLACE_SPACEPORT', bodyId: TC_C, tileId: tileId(TC_C, anchor!.index), rotation: anchor!.rotation });
  const placed = eventOf(r.lastCommand, 'SPACEPORT_PLACED', 'port on the road');
  const portCost = sim.scenario.colonization.portCost;
  expect(sameCost(placed.cost, terrainCost(portCost, portPct.costPct)), `port cost ${JSON.stringify(placed.cost)}`);
  expect(portPct.costPct === 100 || !sameCost(placed.cost, portCost), 'the road changes the port cost');
  expect((placed.structure.timePct ?? 100) === portPct.timePct, `port time ${placed.structure.timePct}`);
  r.until(() => r.world.colony.foundedAt !== null, 60 * 60);

  r.cmd({ type: 'CALL_SHUTTLE', bodyId: TC_C, cargo: { FER: 60, SIL: 60 } });
  r.until(() => (storageOf(r.world, TC_C)['SIL'] ?? 0) >= 60, 30 * 60);

  // three sites at their terrain prices, one refused on a dune
  const order = (kind: string, tile: TileId, what: string) => {
    r.cmd({ type: 'BUILD', bodyId: TC_C, tileId: tile, kind });
    const e = eventOf(r.lastCommand, 'CONSTRUCTION_ORDERED', what);
    const pct = pctOf(grid.tiles.find((t) => t.id === tile)!.index);
    const base = sim.rules.spec(kind, 1);
    expect(sameCost(e.cost, terrainCost(base.cost, pct.costPct)), `${what}: cost ${JSON.stringify(e.cost)}`);
    expect(sameCost(e.structure.paid, e.cost), `${what}: paid`);
    expect((e.structure.timePct ?? 100) === pct.timePct && e.structure.timePct !== 100, `${what}: timePct ${e.structure.timePct}`);
    return { id: e.structure.id, time: (base.buildTime * pct.timePct) / 100, paid: e.cost };
  };
  const road = order('SOL', r.roadTile(TC_C), 'SOL on a road');
  const forest = order('SOL', r.terrainTile(TC_C, 'forest'), 'SOL in a forest');
  const rock = order('HAB', r.terrainTile(TC_C, 'rock'), 'HAB on rock');
  r.cmd({ type: 'BUILD', bodyId: TC_C, tileId: r.terrainTile(TC_C, 'dune'), kind: 'SOL' });
  const sunk = eventOf(r.lastCommand, 'COMMAND_REJECTED', 'SOL on a dune');
  expect(sunk.reason === 'BAD_TERRAIN' && sunk.detail === rules.kinds.dune.name, `SOL on a dune: ${sunk.reason} ${sunk.detail}`);

  // the forest site cancelled: 75 % (rounded down) of what it cost after the terrain
  r.cmd({ type: 'CANCEL_CONSTRUCTION', structureId: forest.id });
  const back = eventOf(r.lastCommand, 'CONSTRUCTION_CANCELLED', 'cancel in the forest');
  expect(Object.entries(forest.paid).every(([k, q]) => back.refund[k] === Math.floor(q * 0.75)), `refund ${JSON.stringify(back.refund)}`);
  const baseRefund = Object.entries(sim.rules.spec('SOL', 1).cost).map(([k, q]) => [k, Math.floor(q * 0.75)]);
  expect(!sameCost(back.refund, Object.fromEntries(baseRefund)), 'the forest refund follows the terrain cost');

  // everything built; one rover per site, so a site takes its catalog time × the terrain % (± one step)
  const started = new Map<string, number>();
  const built = new Map<string, number>();
  r.until(() => {
    for (const e of r.lastStep) {
      if (e.type === 'CONSTRUCTION_STARTED' && !started.has(e.structureId)) started.set(e.structureId, r.world.time - r.lastDt);
      if (e.type === 'STRUCTURE_BUILT') {
        built.set(e.structure.id, r.world.time);
        expect(e.structure.timePct === undefined, `${e.structure.id}: timePct dropped when built`);
      }
    }
    return r.world.structures.every((s) => s.state === 'ACTIVE');
  }, 60 * 60);
  for (const site of [road, rock]) {
    const took = built.get(site.id)! - started.get(site.id)!;
    expect(Math.abs(took - site.time) <= r.lastDt + 1e-9, `${site.id}: took ${took} min, terrain time ${site.time}`);
  }
  r.steps(60);
  r.write('teren');
}

/** A load world of F5 runs for a while: hundreds of buildings, ships in flight, rovers driving. */
function obciazenie(level: 'load-s' | 'load-m', steps: number): void {
  const r = new Recorder(level);
  r.steps(steps);
  r.write(level);
}

mkdirSync(outDir, { recursive: true });
kanwaPierwszaSesja();
pocPetla();
pocEkonomia();
tempoZmiany();
odmowy();
fabryka();
teren();
obciazenie('load-s', 600);
obciazenie('load-m', 60);
