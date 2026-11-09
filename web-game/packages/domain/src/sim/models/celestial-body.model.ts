import { BodyId } from '../../shared/ids';
import type { TerrainConfig } from '../terrain/terrain-types';
import { Cost } from './resource.model';

export type BodyKind = 'STAR' | 'PLANET' | 'MOON' | 'ASTEROID' | 'BELT';
export type Atmosphere = 'none' | 'trace' | 'thin' | 'dense';

/** What a scan tells the player about a body (canvas board "Skanowanie"). Content data, Polish. */
export interface BodyProfile {
  type: string;
  temperature: string;
  water: string;
  note: string;
  /** "zalecana", "średni", "trudny", "wyprawy". */
  rating: string;
  /** Surface share of each deposit material [%], as the scan reports it. */
  deposits: Readonly<Record<string, number>>;
  /** Fuel to launch a shuttle from the surface [u]. */
  shuttleLaunchFuel?: number;
}

export interface CelestialBody {
  id: BodyId;
  name: string;
  kind: BodyKind;
  radius: number;
  /** null = centre of the system (the star). */
  parentId: BodyId | null;
  /** Orbit radius relative to the parent; 0 for the central body. */
  orbitRadius: number;
  /** Constant angular velocity ω [rad per model minute]. */
  orbitSpeed: number;
  /** Initial phase φ [rad]. */
  initialAngle: number;
  /** Docking altitude = radius × this factor. */
  orbitalAltitudeFactor: number;
  /** Unloads cargo and refuels ships. */
  isHomeBase: boolean;
  /** Minable by a docked ship (asteroids). */
  resources?: Cost;
  color: number;
  /** Goldberg GP(n,0) surface grid; tiles = 10·n² + 2. Only bodies with a grid can be built on. */
  surfaceGrid?: {
    frequency: number;
    depositSeed?: number;
    /** Relative weights of deposit materials; default FER, KRI and SIL equally (PoC). */
    depositWeights?: Readonly<Record<string, number>>;
    /**
     * Hex-kit terrain: tile classes and settlement roads generated from this style (`buildWorldGrids`),
     * which change what building costs and how long it takes (`TERRAIN_RULES`). Absent = plain tiles.
     */
    terrain?: TerrainConfig;
  };
  /** Irregular, seeded mesh instead of a sphere (asteroids). */
  shape?: { seed: number; roughness: number };
  /** Wind turbines need a dense atmosphere. Default 'none'. */
  atmosphere?: Atmosphere;
  /** Solar multiplier; when absent: star luminosity × (900 / orbit radius of the root planet)². */
  insolation?: number;
  /** Stars only: luminosity in L☉ (default 1). */
  luminosity?: number;
  /** Unknown until the system scan; default true. */
  revealed?: boolean;
  /** Display name before the scan, e.g. "Obiekt 3". */
  unknownName?: string;
  profile?: BodyProfile;
}
