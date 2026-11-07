import { BodyId } from '../../shared/ids';
import { Cost } from './resource.model';

export type BodyKind = 'STAR' | 'PLANET' | 'MOON' | 'ASTEROID';

export interface CelestialBody {
  id: BodyId;
  name: string;
  kind: BodyKind;
  radius: number;
  /** null = centre of the system (the star). */
  parentId: BodyId | null;
  /** Orbit radius relative to the parent; 0 for the central body. */
  orbitRadius: number;
  /** Constant angular velocity ω [rad/s]. */
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
  surfaceGrid?: { frequency: number; depositSeed?: number };
  /** Irregular, seeded mesh instead of a sphere (asteroids). */
  shape?: { seed: number; roughness: number };
}
