// Framework-free part of ResourcePanel: the readout model and its state rules.
// Shared by the React component here and by the Angular port in web-game.

export type ResourceState = 'nominal' | 'low' | 'critical';

export interface ResourceReadout {
  id: string;
  /** Three-letter tactical code shown in the micro label, e.g. "MET". */
  code: string;
  /** Full name, e.g. "Metal". */
  label: string;
  value: number;
  /**
   * `stock`: an amount in storage (`max` = capacity, optional).
   * `load`: usage against a limit — energy drawn / produced, population / cap.
   */
  kind?: 'stock' | 'load';
  max?: number;
  unit?: string;
  /** Change per minute; shown signed in the label row. */
  rate?: number;
  /** `stock` only: thresholds for the low and critical states. */
  lowBelow?: number;
  criticalBelow?: number;
}

/** Number of segments in a readout meter. */
export const RESOURCE_METER_SEGMENTS = 10;

/** Derives the readout state: loads go critical at the limit, stocks below their thresholds. */
export function resourceState(r: ResourceReadout): ResourceState {
  if (r.kind === 'load' && r.max) {
    const ratio = r.value / r.max;
    if (ratio >= 1) return 'critical';
    if (ratio >= 0.9) return 'low';
    return 'nominal';
  }
  if (r.criticalBelow !== undefined && r.value <= r.criticalBelow) return 'critical';
  if (r.lowBelow !== undefined && r.value <= r.lowBelow) return 'low';
  return 'nominal';
}

/** Fill ratio 0..1 of the meter, or `undefined` when the readout has no `max`. */
export function resourceRatio(r: ResourceReadout): number | undefined {
  return r.max ? Math.min(1, r.value / r.max) : undefined;
}
