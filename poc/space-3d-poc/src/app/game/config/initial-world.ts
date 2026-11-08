import { BodyId, bodyId, roverId, shipId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { Stockpile, emptyStockpile } from '../models/resource.model';
import { Rover } from '../models/rover.model';
import { Spacecraft } from '../models/spacecraft.model';

const TWO_PI = Math.PI * 2;

export const SUN_ID = bodyId('sun');
export const PLANET_ID = bodyId('planet');
export const MOON_ID = bodyId('moon');
export const ASTEROID_ID = bodyId('asteroid');
export const SHIP_ID = shipId('ship-1');
export const ROVER_ID = roverId('rover-1');

/** Showcase colonies: three identical planets dressed with KayKit, Kenney and a mix of both (art-style comparison). */
export const COLONY_A_ID = bodyId('colony-a');
export const COLONY_B_ID = bodyId('colony-b');
export const COLONY_C_ID = bodyId('colony-c');
export const COLONY_IDS: ReadonlyArray<BodyId> = [COLONY_A_ID, COLONY_B_ID, COLONY_C_ID];

/**
 * Same orbit, radius, grid and deposit seed for all three, so their layouts are tile-for-tile identical.
 * They fly in formation 12° apart (~260 units): close enough to see side by side, lit almost the same.
 */
const COLONY_ORBIT = 1250;
const COLONY_PHASE = Math.PI * 0.85;
const COLONY_SPACING = (12 * Math.PI) / 180;
const COLONY_PERIOD = 3600;
const COLONY_SURFACE = { frequency: 8, depositSeed: 31 };
const COLONY_COLOR = 0x7c8597;

/** What the colony starts with: enough for one extractor and one habitat without a dependency loop. */
export const INITIAL_STOCKPILE: Stockpile = { FERRITE: 40, CRYOL: 10, SILICITE: 20 };

export const INITIAL_BODIES: ReadonlyArray<CelestialBody> = [
  {
    id: SUN_ID,
    name: 'Słońce',
    kind: 'STAR',
    radius: 60,
    parentId: null,
    orbitRadius: 0,
    orbitSpeed: 0,
    initialAngle: 0,
    orbitalAltitudeFactor: 1.25,
    isHomeBase: false,
    color: 0xffd36a,
  },
  {
    id: PLANET_ID,
    name: 'Planeta Matka',
    kind: 'PLANET',
    radius: 50,
    parentId: SUN_ID,
    orbitRadius: 900,
    orbitSpeed: TWO_PI / 240,
    initialAngle: 0,
    orbitalAltitudeFactor: 1.25,
    isHomeBase: true,
    color: 0x3b82f6,
    surfaceGrid: { frequency: 8, depositSeed: 11 },
  },
  {
    id: MOON_ID,
    name: 'Księżyc',
    kind: 'MOON',
    radius: 15,
    parentId: PLANET_ID,
    orbitRadius: 160,
    orbitSpeed: TWO_PI / 40,
    initialAngle: Math.PI / 2,
    orbitalAltitudeFactor: 1.25,
    isHomeBase: false,
    color: 0x9ca3af,
    surfaceGrid: { frequency: 3, depositSeed: 23 },
  },
  {
    id: ASTEROID_ID,
    name: 'Asteroida',
    kind: 'ASTEROID',
    radius: 12,
    parentId: SUN_ID,
    orbitRadius: 1500,
    orbitSpeed: TWO_PI / 600,
    initialAngle: Math.PI / 3,
    orbitalAltitudeFactor: 1.25,
    isHomeBase: false,
    resources: { FERRITE: 500 },
    color: 0xb45309,
    shape: { seed: 7, roughness: 0.3 },
  },
  colony(COLONY_A_ID, 'Kolonia A · KayKit', COLONY_PHASE - COLONY_SPACING),
  colony(COLONY_B_ID, 'Kolonia B · Kenney', COLONY_PHASE),
  colony(COLONY_C_ID, 'Kolonia C · mieszana', COLONY_PHASE + COLONY_SPACING),
];

export const INITIAL_SHIPS: ReadonlyArray<Spacecraft> = [
  {
    id: SHIP_ID,
    name: 'Astraeus-1',
    fuel: 100,
    maxFuel: 100,
    cargo: emptyStockpile(),
    maxCargo: 50,
    state: 'DOCKED',
    currentBodyId: PLANET_ID,
    targetBodyId: null,
    transfer: null,
  },
];

/** The rover starts on the home planet's landing pad; its tile is resolved in `world.ts`. */
export const INITIAL_ROVER: Omit<Rover, 'tileIndex'> = {
  id: ROVER_ID,
  name: 'Łazik R-1',
  bodyId: PLANET_ID,
  state: 'IDLE',
  path: [],
};

function colony(id: BodyId, name: string, initialAngle: number): CelestialBody {
  return {
    id,
    name,
    kind: 'PLANET',
    radius: 50,
    parentId: SUN_ID,
    orbitRadius: COLONY_ORBIT,
    orbitSpeed: TWO_PI / COLONY_PERIOD,
    initialAngle,
    orbitalAltitudeFactor: 1.25,
    isHomeBase: false,
    color: COLONY_COLOR,
    surfaceGrid: { ...COLONY_SURFACE },
  };
}
