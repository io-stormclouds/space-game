import { bodyId, roverId, shipId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { Stockpile, emptyStockpile } from '../models/resource.model';
import { Rover } from '../models/rover.model';
import { Spacecraft } from '../models/spacecraft.model';

// The 3D PoC world: test preset "Planeta Matka" (W06 A). Time unit = model minute (Z6), so the
// PoC's numbers are unchanged: an orbit period of 240 is 240 min, the ship flies 150 units/min.

const TWO_PI = Math.PI * 2;

export const SUN_ID = bodyId('sun');
export const PLANET_ID = bodyId('planet');
export const MOON_ID = bodyId('moon');
export const ASTEROID_ID = bodyId('asteroid');
export const SHIP_ID = shipId('ship-1');
export const ROVER_ID = roverId('rover-1');

/** What the colony starts with: enough for one extractor and one habitat without a dependency loop. */
export const INITIAL_STOCKPILE: Stockpile = { FER: 40, KRI: 10, SIL: 20 };

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
    luminosity: 1,
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
    // hex-kit terrain (T-25): the PoC showcase style; the dry landing cap (n.y > 0.9: the top tile, two rings
    // and part of the third) keeps the standing pad, panel and port of the preset off a lake, where they
    // stood before T5 (it dries two lakes of mixed/7 under the port)
    surfaceGrid: { frequency: 8, depositSeed: 11, terrain: { biome: 'mixed', seed: 7, landingCap: 0.9 } },
    atmosphere: 'dense',
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
    surfaceGrid: { frequency: 3, depositSeed: 23, terrain: { biome: 'dry', seed: 8, ground: 'regolith' } },
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
    resources: { FER: 500 },
    color: 0xb45309,
    shape: { seed: 7, roughness: 0.3 },
  },
];

export const INITIAL_SHIPS: ReadonlyArray<Spacecraft> = [
  {
    id: SHIP_ID,
    name: 'Astraeus-1',
    role: 'SHIP',
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

/** The rover starts on the home planet's landing pad; its tile is resolved by the scenario. */
export const INITIAL_ROVER: Omit<Rover, 'tileIndex'> = {
  id: ROVER_ID,
  name: 'Łazik R-1',
  bodyId: PLANET_ID,
  state: 'IDLE',
  path: [],
  job: null,
};
