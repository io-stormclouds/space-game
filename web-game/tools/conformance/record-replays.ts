// Records golden replays (plan 02 §5.1): scripted games on the mock server, saved as the mock's
// `SaveFile` plus the events of every step. `cargo run -p conformance -- replay <dir>` in server/
// replays each save through game-core and compares the world, the events and the rejected count.
//   node --import tsx tools/conformance/record-replays.ts [outDir] [revision]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, DomainEvent, WorldState } from '@space-game/domain';
import {
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
    return r.ok;
  }

  step(): void {
    const b = this.bucket();
    b.events.push(...this.server.step());
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

  plainTile(body: string) {
    return this.freeTiles(body).find((t) => !t.deposit && t.neighbors.length === 6)!.id;
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
  const anchor = grid.tiles.find(
    (t) =>
      t.neighbors.length === 6 && [t.index, ...t.neighbors].every((i) => !grid.tiles[i]!.deposit),
  )!;
  r.cmd({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: anchor.id });
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
  const ferrite = () =>
    grid.tiles.filter((t) => t.deposit?.resource === 'FER' && !used().has(t.id));
  const free = () => grid.tiles.find((t) => !t.deposit && !used().has(t.id))!;
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
  // a Huta (3 tiles) needs FER 160 · SIL 80: wait for ore, build, let it run
  r.cmd({ type: 'BUILD', bodyId: PLANET_ID, tileId: ferrite()[0]!.id, kind: 'MIN' });
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
        (i) => !used().has(grid.tiles[i]!.id) && !grid.tiles[i]!.deposit,
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
obciazenie('load-s', 600);
obciazenie('load-m', 60);
