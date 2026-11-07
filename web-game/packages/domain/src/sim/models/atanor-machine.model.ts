import type { AtanorSolution } from '../../atanor/engine/types';
import type { Cost, Stockpile } from './resource.model';

/**
 * Why a deployed machine is not ticking: RUNNING works; WAITING lacks an input (§8.5 p. 1);
 * FULL has no room for the product (Z3); IDLE has no program yet; JAM stopped (should not happen
 * after a successful trial, kept as a guard).
 */
export type AtanorMachineState = 'IDLE' | 'RUNNING' | 'WAITING' | 'FULL' | 'JAM';

/** Numbers of a program measured when it was deployed (A17: production and power come from them). */
export interface AtanorProgramMetrics {
  cyclesPerOutput: number;
  area: number;
  arms: number;
  /** Power of the machine on top of the building's own [MW]: 0.5 per hex + 1 per arm (§8.1). */
  extraPower: number;
}

/** A program being deployed (§3.2): the old one keeps working until it is ready. */
export interface AtanorDeployment {
  solution: AtanorSolution;
  metrics: AtanorProgramMetrics;
  /** Minutes left and in total (A19: proportional to the value of the machine's materials). */
  remaining: number;
  total: number;
  /** Materials of removed elements, returned when the deployment ends (A18: 100 %). */
  refund: Cost;
}

/** The machine of one Fabryka atanorowa (AT4), part of the world state. */
export interface AtanorMachine {
  structureId: string;
  recipe: string;
  /** The working program; null until the first deployment. */
  program: AtanorSolution | null;
  metrics: AtanorProgramMetrics | null;
  /** The player's last saved draft (kept in save files). */
  draft: AtanorSolution | null;
  deploy: AtanorDeployment | null;
  /** Engine ticks of the program since its deployment (the engine state is a function of this). */
  ticks: number;
  /** 0..1 of the way to the next tick. */
  progress: number;
  state: AtanorMachineState;
  /** Material units taken from storage since the deployment (atoms that entered the machine). */
  consumed: Stockpile;
  /** Products delivered since the deployment. */
  delivered: number;
}
