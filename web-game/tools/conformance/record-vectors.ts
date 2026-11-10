// Records numeric vectors from the TypeScript domain for the Rust port (plan 02 §5): grids, orbits,
// intercepts, curves, noise, starting worlds and the economy tables. Checked by
// `cargo run -p conformance -- vectors <file>` in server/.
//   node --import tsx tools/conformance/record-vectors.ts [out.json]
// To record from a given git revision, pass a tsconfig whose `paths` point at an exported copy of
// the packages (see tools/conformance/README.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BezierPath,
  INITIAL_BODIES,
  OrbitSolver,
  POC_SCENARIO,
  Rules,
  Simulation,
  TAU_CETI_BODIES,
  TAU_CETI_SCENARIO,
  asteroidShape,
  buildGoldbergGrid,
  classifyTerrain,
  computeEconomy,
  economyTables,
  footprintTiles,
  inconsistentSourceStars,
  lightYearsBetween,
  maxStarRadius,
  STARS,
  terrainAim,
  type CelestialBody,
  type TerrainConfig,
  type Vec3,
} from '@space-game/domain';
// not exported from the package index; these files are pure functions without state
import { geodesicSphere } from '../../packages/domain/src/sim/math/geodesic';
import { solveLeadIntercept } from '../../packages/domain/src/sim/math/lead-intercept';
import { fbm, hash3 } from '../../packages/domain/src/sim/math/seeded-noise';
// the Atanor engine is not exported from the package index either (the client imports it by path)
import {
  ATANOR_LEVELS,
  LEVEL_1_DIMER,
  LEVEL_2_POC_BROKEN_PROGRAM,
  LEVEL_2_WATER,
  LEVEL_A_KAT,
  LEVEL_A_NAD,
  createArm,
  createAtanorSimulation,
  getAtanorBuildingLevel,
  getReferenceSolution,
  machineMaterials,
  measureAtanorSolution,
  solutionKey,
  validateMachine,
  type ArmCommand,
  type AtanorSolution,
} from '../../packages/domain/src/atanor';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? resolve(here, '../../../server/conformance/vectors/vectors.json');
const arr = (v: Vec3) => [v.x, v.y, v.z];

const geo = geodesicSphere(4);
const geodesic4 = { vertices: geo.vertices.map(arr), faces: geo.faces };

const gridBodies: Array<{ scenario: string; body: CelestialBody }> = [
  ...INITIAL_BODIES.filter((b) => b.surfaceGrid).map((body) => ({ scenario: 'poc', body })),
  ...TAU_CETI_BODIES.filter((b) => b.surfaceGrid).map((body) => ({ scenario: 'tau-ceti', body })),
];
const builtGrids = gridBodies.map(({ body }) =>
  buildGoldbergGrid(
    body.id,
    body.radius,
    body.surfaceGrid!.frequency,
    body.surfaceGrid!.depositSeed,
    body.surfaceGrid!.depositWeights,
  ),
);
const grids = builtGrids.map((grid, i) => {
  const body = gridBodies[i]!.body;
  return {
    bodyId: grid.bodyId,
    radius: grid.radius,
    frequency: grid.frequency,
    depositSeed: body.surfaceGrid!.depositSeed ?? null,
    depositWeights: body.surfaceGrid!.depositWeights ?? null,
    tileEdge: grid.tileEdge,
    tiles: grid.tiles.map((t) => ({
      index: t.index,
      kind: t.kind,
      center: arr(t.center),
      normal: arr(t.normal),
      vertices: t.vertices.map(arr),
      neighbors: t.neighbors,
      deposit: t.deposit,
    })),
  };
});

// terrain classes and settlement roads (T8, `classifyTerrain`): every grid body of both scenarios in
// three styles, the settlement facing the body's sun at t = 0 as `buildWorldGrids` aims it. Classes are
// compared as exact strings (one ulp in the noise may flip a class).
const TERRAIN_STYLES: TerrainConfig[] = [
  { biome: 'medieval', seed: 2 },
  { biome: 'mixed', seed: 7 },
  { biome: 'medieval', seed: 11 },
];
const terrain = builtGrids.flatMap((grid, i) => {
  const { scenario, body } = gridBodies[i]!;
  const aim = terrainAim(body);
  return TERRAIN_STYLES.map((style) => {
    const c = classifyTerrain(grid, { biome: style.biome, seed: style.seed, aim });
    return {
      grid: i,
      scenario,
      bodyId: body.id,
      biome: style.biome,
      seed: style.seed,
      aim: arr(aim),
      kinds: c.kinds,
      road: [...c.road].sort((a, b) => a - b),
      settlementCenter: c.settlementCenter,
    };
  });
});

const solvers = {
  poc: new OrbitSolver(INITIAL_BODIES),
  'tau-ceti': new OrbitSolver(TAU_CETI_BODIES),
};
const times = [0, 17, 99.5, 1000, 12345.678];
const orbits = [];
for (const [scenario, bodies] of [
  ['poc', INITIAL_BODIES],
  ['tau-ceti', TAU_CETI_BODIES],
] as const) {
  const solver = solvers[scenario];
  for (const b of bodies) {
    for (const t of times) {
      orbits.push({
        scenario,
        bodyId: b.id,
        t,
        world: arr(solver.worldPosition(b.id, t, { x: 0, y: 0, z: 0 })),
        docking: arr(solver.dockingPosition(b.id, t, { x: 0, y: 0, z: 0 })),
        orbit: arr(solver.orbitPosition(b.id, t, { x: 0, y: 0, z: 0 })),
        maxLinearSpeed: solver.maxLinearSpeed(b.id),
      });
    }
  }
}

const leads = [];
const leadCases: Array<{
  scenario: 'poc' | 'tau-ceti';
  from: string;
  to: string;
  t: number;
  orbit: boolean;
}> = [
  { scenario: 'poc', from: 'planet', to: 'asteroid', t: 12, orbit: false },
  { scenario: 'poc', from: 'asteroid', to: 'moon', t: 3, orbit: false },
  { scenario: 'poc', from: 'planet', to: 'moon', t: 250.25, orbit: false },
  { scenario: 'poc', from: 'moon', to: 'planet', t: 77, orbit: false },
  { scenario: 'tau-ceti', from: 'tau-ceti', to: 'tc-e', t: 15.25, orbit: true },
  { scenario: 'tau-ceti', from: 'tc-e', to: 'tc-f', t: 400, orbit: true },
  { scenario: 'tau-ceti', from: 'tc-e', to: 'tc-b', t: 1234.5, orbit: false },
];
for (const c of leadCases) {
  const solver = solvers[c.scenario];
  const start = solver.stationPosition(c.from, c.t, { x: 0, y: 0, z: 0 }, c.orbit);
  const r = solveLeadIntercept(start, c.to as never, c.t, 150, solver, { orbit: c.orbit });
  leads.push({
    scenario: c.scenario,
    start: arr(start),
    targetId: c.to,
    t: c.t,
    orbit: c.orbit,
    leadPos: arr(r.leadPos),
    flightTime: r.flightTime,
    iterations: r.iterations,
  });
}

const p0 = solvers.poc.dockingPosition('planet' as never, 0, { x: 0, y: 0, z: 0 });
const p2 = solvers.poc.dockingPosition('asteroid' as never, 7, { x: 0, y: 0, z: 0 });
const path = BezierPath.arc(p0, p2, 0.2);
const samples: Vec3[] = Array.from({ length: 48 }, () => ({ x: 0, y: 0, z: 0 }));
path.sample(samples);
const bezier = {
  p0: arr(p0),
  p2: arr(p2),
  lift: 0.2,
  p1: arr(path.p1),
  samples: samples.map(arr),
  length64: path.approxLength(64),
  tangent0: arr(path.tangentAt(0, { x: 0, y: 0, z: 0 })),
  tangent1: arr(path.tangentAt(1, { x: 0, y: 0, z: 0 })),
};

const asteroidBody = INITIAL_BODIES.find((b) => b.id === 'asteroid')!;
const shape = asteroidShape(asteroidBody);
const asteroid = { seed: shape.seed, vertices: shape.vertices.map(arr), faces: shape.faces };

const noise = {
  hash3: [] as Array<{ args: number[]; value: number }>,
  fbm: [] as Array<{ seed: number; p: number[]; value: number }>,
};
for (let i = 0; i < 64; i++) {
  const args = [i % 7, i * 13 - 100, (i * 29) % 17, -i * 3];
  noise.hash3.push({ args, value: hash3(args[0]!, args[1]!, args[2]!, args[3]!) });
  const p = { x: Math.sin(i) * 10, y: Math.cos(i * 1.3) * 10 + 37.3, z: i * 0.37 };
  noise.fbm.push({ seed: 7, p: arr(p), value: fbm(7, p) });
}

const footprints = [];
const planetGrid = builtGrids[0]!;
const pent = planetGrid.tiles.find((t) => t.kind === 'PENT')!;
const hex = planetGrid.tiles.find((t) => t.kind === 'HEX')!;
for (const [anchor, size, rotation] of [
  [hex.index, 1, 0],
  [hex.index, 3, 0],
  [hex.index, 3, 4],
  [hex.index, 3, -1],
  [hex.index, 3, 7],
  [hex.index, 7, 0],
  [pent.index, 3, 2],
  [pent.index, 7, 0],
  [hex.index, 5, 0],
  [99999, 1, 0],
] as const) {
  footprints.push({
    grid: 0,
    anchor,
    size,
    rotation,
    tiles: footprintTiles(planetGrid, anchor, size, rotation),
  });
}

const pocWorld = new Simulation(POC_SCENARIO).world;
const tauCetiWorld = new Simulation(TAU_CETI_SCENARIO).world;

const eco = computeEconomy();
const rules = new Rules();
const specs = [];
for (const b of [...eco.buildings, ...eco.vehicles]) {
  for (let L = 1; L <= b.maxL; L++) {
    const s = rules.spec(b.id, L);
    specs.push({
      kind: s.kind,
      level: s.level,
      cost: s.cost,
      buildTime: s.buildTime,
      power: s.power,
      crew: s.crew,
      storage: s.storage,
      priority: s.priority,
      outputFactor: s.outputFactor,
      footprint: s.footprint,
    });
  }
}
const economy = {
  eraK: eco.eraK,
  values: Object.fromEntries(eco.values),
  alternatives: Object.fromEntries(eco.alternatives),
  tables: economyTables(eco),
  specs,
  buildable: rules.buildableKinds(),
};

// Atanor engine (AT1–AT5): the reference machines of all levels on their boards, a jam of every
// kind, an unlimited and a bounded board, finite supply. Each case records the measurement, the bill
// of materials, the key, the building checks, every step and the final snapshot.
interface AtanorCase {
  name: string;
  levelId: string;
  solution: AtanorSolution | null;
  boardRadius: number | null;
  supply: Record<string, number> | null;
  ticks: number;
}
function atanorCase(c: AtanorCase) {
  const level = ATANOR_LEVELS.find((l) => l.id === c.levelId)!;
  const solution = c.solution ?? getReferenceSolution(level);
  const board = c.boardRadius !== null ? { boardRadius: c.boardRadius } : {};
  const measure = measureAtanorSolution(level, solution, 2000, board);
  const sim = createAtanorSimulation(level, {
    solution,
    ...board,
    ...(c.supply ? { supply: c.supply } : {}),
  });
  const steps = [];
  for (let i = 0; i < c.ticks; i++) {
    const s = sim.step();
    steps.push({
      cycle: s.cycle,
      tick: s.tick,
      commandsExecuted: s.commandsExecuted,
      collisionDetected: s.collisionDetected,
      collisionMessage: s.collisionMessage ?? null,
      jamReason: s.jamReason,
      jamDetail: s.jamDetail ?? null,
      starved: s.starved,
      productsDelivered: s.productsDelivered,
      isLevelCompleted: s.isLevelCompleted,
    });
  }
  const stats = sim.getStats();
  const validate = Object.fromEntries(
    [1, 2, 3, 4, 5].map((l) => [l, validateMachine(level, solution, l)]),
  );
  return {
    ...c,
    solution,
    measure,
    materials: machineMaterials(solution),
    key: solutionKey(solution),
    validate,
    steps,
    snapshot: sim.getSnapshot(),
    stats: { ...stats, crashMessage: stats.crashMessage ?? null },
  };
}
const tape = (cmds: string[]) => cmds as (ArmCommand | null)[];
const nadRef = getReferenceSolution(LEVEL_A_NAD);
const katRef = getReferenceSolution(LEVEL_A_KAT);
const atanorCases: AtanorCase[] = [
  ...ATANOR_LEVELS.map((l) => ({
    name: `ref:${l.id}`,
    levelId: l.id,
    solution: null,
    boardRadius: l.recipe ? getAtanorBuildingLevel(l.recipe.buildingLevel)!.boardRadius : null,
    supply: null,
    ticks: 40,
  })),
  // the PoC program of level 2: ATOM_COLLISION after 9 ticks
  {
    name: 'broken-water',
    levelId: LEVEL_2_WATER.id,
    solution: {
      ...getReferenceSolution(LEVEL_2_WATER),
      program: Object.fromEntries(
        Object.entries(LEVEL_2_POC_BROKEN_PROGRAM).map(([k, v]) => [k, [...v]]),
      ),
    },
    boardRadius: null,
    supply: null,
    ticks: 20,
  },
  // arm-2 delivers by turning the pair around its base instead of pivoting (the pre-AT5 program)
  {
    name: 'kat-arm-collision',
    levelId: LEVEL_A_KAT.id,
    solution: {
      ...katRef,
      program: {
        ...katRef.program,
        'arm-2': tape([
          'GRAB',
          'ROTATE_CW',
          'EMPTY',
          'ROTATE_CCW',
          'ROTATE_CCW',
          'EMPTY',
          'REPEAT',
        ]),
      },
    },
    boardRadius: 3,
    supply: null,
    ticks: 20,
  },
  // the NAD machine on a board too small for it
  {
    name: 'nad-off-board',
    levelId: LEVEL_A_NAD.id,
    solution: null,
    boardRadius: 1,
    supply: null,
    ticks: 20,
  },
  // arm-1 keeps holding the 2nd MIE and turns while arm-2 holds the same molecule still
  {
    name: 'nad-molecule-conflict',
    levelId: LEVEL_A_NAD.id,
    solution: {
      ...nadRef,
      program: {
        ...nadRef.program,
        'arm-1': nadRef.program['arm-1']!.map((c, i) => (i === 8 ? 'ROTATE_CW' : c)),
      },
    },
    boardRadius: null,
    supply: null,
    ticks: 20,
  },
  // a length-2 arc over the B input: arm-2 parks a B at (3,-1), arm-1 swings it past the refilled port
  {
    name: 'dimer-trajectory-collision',
    levelId: LEVEL_1_DIMER.id,
    solution: {
      arms: [
        createArm({ id: 'arm-1', basePos: { q: 1, r: -1 }, rotation: 5, length: 2 }),
        createArm({ id: 'arm-2', basePos: { q: 3, r: 0 }, rotation: 3, length: 1 }),
      ],
      glyphs: [],
      tracks: [],
      program: {
        'arm-1': tape([
          'EMPTY',
          'EMPTY',
          'EMPTY',
          'EMPTY',
          'ROTATE_CW',
          'GRAB',
          'ROTATE_CW',
          'REPEAT',
        ]),
        'arm-2': tape([
          'GRAB',
          'ROTATE_CW',
          'DROP',
          'ROTATE_CCW',
          'EMPTY',
          'EMPTY',
          'EMPTY',
          'REPEAT',
        ]),
      },
    },
    boardRadius: null,
    supply: null,
    ticks: 12,
  },
  // finite inputs: the machine starves after two products' worth of MIE and PLA
  {
    name: 'nad-finite-supply',
    levelId: LEVEL_A_NAD.id,
    solution: null,
    boardRadius: 2,
    supply: { MIE: 4, PLA: 2, H2: 20 },
    ticks: 60,
  },
];
const atanor = atanorCases.map(atanorCase);

// the 41 stars with positions made consistent with their distances (W10 A), and a few distances
const stars = {
  stars: STARS,
  maxStarRadius: maxStarRadius(),
  inconsistent: inconsistentSourceStars().map((s) => s.id),
  distances: STARS.slice(1, 9).map((s) => [STARS[0]!.id, s.id, lightYearsBetween(STARS[0]!, s)]),
};

const vectors = {
  geodesic4,
  grids,
  terrain,
  orbits,
  leads,
  bezier,
  asteroid,
  noise,
  footprints,
  pocWorld,
  tauCetiWorld,
  economy,
  atanor,
  stars,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(vectors) + '\n', 'utf8');
console.log(
  `vectors: ${grids.length} grids, ${terrain.length} terrain classifications, ${orbits.length} orbit samples, ${leads.length} intercepts, ${specs.length} specs → ${out}`,
);
