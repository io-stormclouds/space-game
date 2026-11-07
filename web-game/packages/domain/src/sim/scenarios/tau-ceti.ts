import { bodyId, shipId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { Spacecraft } from '../models/spacecraft.model';
import { DEFAULT_COLONIZATION, Scenario } from '../scenario';

// Default scenario (W06 A): Arka-1 arrives at Tau Ceti — the canvas flow "Przybycie → Skanowanie →
// Port kosmiczny → Kolonia".
// FACT (canvas boards Arrival, Scan, Spaceport): hold contents, units on board, scan 15 min, planet
//   profiles (grid sizes, atmosphere, insolation, deposits, shuttle launch fuel), port cost and time.
// FACT (stars.data.ts): Tau Ceti G8.5V, luminosity 0.52, 5 planets.
// PROPOSAL: orbit radii and periods (from the canvas insolation: r = 900·√(0.52 / insolation),
//   period ∝ r^1.5 like the PoC planet), deposit seeds, body colours, Ark fuel.

const TWO_PI = Math.PI * 2;
const LUMINOSITY = 0.52;

export const TAU_CETI_ID = bodyId('tau-ceti');
export const TC_B = bodyId('tc-b');
export const TC_C = bodyId('tc-c');
export const TC_D = bodyId('tc-d');
export const TC_E = bodyId('tc-e');
export const TC_F = bodyId('tc-f');
export const TC_BELT = bodyId('tc-belt');
export const ARK_ID = shipId('arka-1');

/** Orbit radius giving the canvas insolation around a 0.52 L☉ star. */
const orbitFor = (insolation: number) => Math.round(900 * Math.sqrt(LUMINOSITY / insolation));
/** Period scaled from the PoC planet (240 min at 900) with Kepler's r^1.5. */
const periodFor = (r: number) => 240 * Math.pow(r / 900, 1.5);
/** Tile width stays ~6–8 units like the PoC: radius ∝ grid frequency (50 at n = 8). */
const radiusFor = (n: number) => (50 * n) / 8;

interface PlanetData {
  id: ReturnType<typeof bodyId>;
  name: string;
  unknown: string;
  n: number;
  seed: number;
  insolation: number;
  atmosphere: CelestialBody['atmosphere'];
  phase: number;
  color: number;
  profile: NonNullable<CelestialBody['profile']>;
}

const PLANETS: PlanetData[] = [
  {
    id: TC_B, name: 'Tau Ceti b', unknown: 'Obiekt 1', n: 5, seed: 101, insolation: 2.1, atmosphere: 'none', phase: 0.4, color: 0xb0724a,
    profile: { type: 'gorąca planeta skalista', temperature: 'wysoka', water: 'brak', rating: 'trudny', shuttleLaunchFuel: 4,
      note: 'Bogata w metale, ale bez lodu i węgla: woda i paliwo musiałyby przylatywać z innych ciał.',
      deposits: { KUP: 80, TYT: 55, URA: 25 } },
  },
  {
    id: TC_C, name: 'Tau Ceti c', unknown: 'Obiekt 2', n: 5, seed: 102, insolation: 1.4, atmosphere: 'trace', phase: 2.2, color: 0x9a8a78,
    profile: { type: 'skalista, śladowa atmosfera', temperature: 'umiarkowana', water: 'brak', rating: 'średni', shuttleLaunchFuel: 5,
      note: 'Dobre metale i słońce, brak lodu. Lepsza jako druga kolonia przemysłowa.',
      deposits: { TYT: 70, FER: 50, KUP: 35 } },
  },
  {
    id: TC_D, name: 'Tau Ceti d', unknown: 'Obiekt 3', n: 6, seed: 103, insolation: 0.9, atmosphere: 'none', phase: 4.1, color: 0x8b8f96,
    profile: { type: 'skalista bez atmosfery', temperature: 'chłodna', water: 'śladowo', rating: 'średni', shuttleLaunchFuel: 6,
      note: 'Ferryt i Silicyt, mało wody. Niska grawitacja nadaje się na wyrzutnię masy.',
      deposits: { FER: 65, SIL: 60, REG: 90 } },
  },
  {
    id: TC_E, name: 'Tau Ceti e', unknown: 'Obiekt 4', n: 8, seed: 104, insolation: 0.7, atmosphere: 'dense', phase: 1.3, color: 0x4f7a5a,
    profile: { type: 'superziemia z atmosferą', temperature: 'umiarkowana', water: 'lód, dużo', rating: 'zalecana', shuttleLaunchFuel: 12,
      note: 'Pełny zestaw surowców T0 i atmosfera do turbin wiatrowych. Najprostszy start, ale droższy start promu z powierzchni.',
      deposits: { FER: 60, SIL: 55, KRI: 75, KAR: 45, KUP: 15 } },
  },
  {
    id: TC_F, name: 'Tau Ceti f', unknown: 'Obiekt 5', n: 6, seed: 105, insolation: 0.4, atmosphere: 'thin', phase: 5.3, color: 0xa9c4d6,
    profile: { type: 'chłodna planeta lodowa', temperature: 'bardzo niska', water: 'lód, bardzo dużo', rating: 'trudny', shuttleLaunchFuel: 7,
      note: 'Źródło wody i paliwa na później. Słabe słońce: energia z reaktorów.',
      deposits: { KRI: 95, KAR: 50 } },
  },
];

/** Deposit weights from the scan profile; regolith is everywhere, not a deposit. */
const weightsOf = (deposits: Readonly<Record<string, number>>) =>
  Object.fromEntries(Object.entries(deposits).filter(([code]) => code !== 'REG'));

const STAR: CelestialBody = {
  id: TAU_CETI_ID,
  name: 'Tau Ceti',
  kind: 'STAR',
  radius: 50,
  parentId: null,
  orbitRadius: 0,
  orbitSpeed: 0,
  initialAngle: 0,
  orbitalAltitudeFactor: 1.6,
  isHomeBase: false,
  color: 0xffdd90,
  luminosity: LUMINOSITY,
};

const BELT_ORBIT = orbitFor(0.3);
const BELT: CelestialBody = {
  id: TC_BELT,
  name: 'Pas pyłowy',
  kind: 'BELT',
  radius: 14,
  parentId: TAU_CETI_ID,
  orbitRadius: BELT_ORBIT,
  orbitSpeed: TWO_PI / periodFor(BELT_ORBIT),
  initialAngle: 3.4,
  orbitalAltitudeFactor: 1.25,
  isHomeBase: false,
  color: 0x6b5a48,
  insolation: 0.3,
  profile: {
    type: 'dysk asteroid i pyłu', temperature: '—', water: '—', rating: 'wyprawy',
    note: 'Masywny dysk pyłowy Tau Ceti: Platynit i Ferryt z wypraw górniczych. Nie da się na nim budować.',
    deposits: { PLA: 40, FER: 70, KAR: 55 },
  },
};

export const TAU_CETI_BODIES: ReadonlyArray<CelestialBody> = [
  STAR,
  ...PLANETS.map((p): CelestialBody => {
    const r = orbitFor(p.insolation);
    return {
      id: p.id,
      name: p.name,
      kind: 'PLANET',
      radius: radiusFor(p.n),
      parentId: TAU_CETI_ID,
      orbitRadius: r,
      orbitSpeed: TWO_PI / periodFor(r),
      initialAngle: p.phase,
      orbitalAltitudeFactor: 1.25,
      isHomeBase: false,
      color: p.color,
      surfaceGrid: { frequency: p.n, depositSeed: p.seed, depositWeights: weightsOf(p.profile.deposits) },
      atmosphere: p.atmosphere,
      insolation: p.insolation,
      revealed: false,
      unknownName: p.unknown,
      profile: p.profile,
    };
  }),
  BELT,
];

/** Arka-1 (canvas "Przybycie"): hold 2000 / 2000 j., 2 rovers, 1 shuttle, 1 probe on board. */
export const ARKA_1: Spacecraft = {
  id: ARK_ID,
  name: 'Arka-1',
  role: 'MOTHERSHIP',
  fuel: 100,
  maxFuel: 100,
  cargo: { STA: 600, FER: 400, SIL: 300, KRI: 200, BET: 200, ZYW: 180, UKL: 60, PRE: 20, SLN: 40 },
  maxCargo: 2000,
  state: 'DOCKED',
  currentBodyId: TAU_CETI_ID,
  targetBodyId: null,
  transfer: null,
  onboard: { rovers: 2, shuttles: 1, probes: 1 },
};

export const TAU_CETI_SCENARIO: Scenario = {
  id: 'tau-ceti',
  name: 'Tau Ceti: przybycie Arki-1',
  bodies: TAU_CETI_BODIES,
  ships: [ARKA_1],
  storage: {},
  colonization: DEFAULT_COLONIZATION,
  // The port L1 is not "na starcie" here: it is landed from the hold (canvas: STA 120 · BET 80 · UKL 10 · 12 min).
  overrides: { HQ: { 1: { cost: DEFAULT_COLONIZATION.portCost, time: DEFAULT_COLONIZATION.portBuildMinutes } } },
  scanned: false,
  structures: () => [],
  rovers: () => [],
};
