import type { View } from '../view';
import type { AtanorReadout } from './readout';

/** HUD controls of the Atanor view ("Fabryka atanorowa", W08 A). */
export interface AtanorControls {
  /** Runs the machine at the chosen ticks per second (restarts after a jam). */
  play(): void;
  pause(): void;
  /** Pauses and executes exactly one tick (animated). */
  step(): void;
  /** Pauses and resets the machine to tick 0. */
  reset(): void;
  /**
   * Shows a level by recipe id ('A_NAD', 'A_KAT') or level id ('level-1-dimer', 'L1'…'L4')
   * with its reference solution. Returns false (and keeps the current level) when unknown.
   */
  setLevel(id: string): boolean;
  /** Engine ticks per real second, clamped to 0.1..120 (PoC 1× = 1.67). */
  setTicksPerSecond(n: number): void;
  readout(): AtanorReadout;
  /** Levels the view can show: recipes first, then the 4 PoC teaching levels. */
  levels(): Array<{ id: string; name: string; recipeId: string | null }>;
}

export function isAtanorControls(view: View | null | undefined): view is View & AtanorControls {
  if (!view) return false;
  const v = view as Partial<AtanorControls>;
  return (
    typeof v.play === 'function' &&
    typeof v.pause === 'function' &&
    typeof v.step === 'function' &&
    typeof v.reset === 'function' &&
    typeof v.setLevel === 'function' &&
    typeof v.setTicksPerSecond === 'function' &&
    typeof v.readout === 'function'
  );
}
