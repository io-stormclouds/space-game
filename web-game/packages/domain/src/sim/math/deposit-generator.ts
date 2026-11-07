import { Deposit } from '../models/planet-grid.model';
import { MaterialCode } from '../models/resource.model';
import { hash3 } from './seeded-noise';

export interface DepositOptions {
  /** Chance that a tile seeds a cluster. */
  seedChance: number;
  /** Chance that each neighbour of a seed tile joins the cluster. */
  spreadChance: number;
}

export const DEFAULT_DEPOSIT_OPTIONS: DepositOptions = { seedChance: 0.035, spreadChance: 0.5 };

/** The PoC's three resources, equally likely, in the PoC order (keeps PoC deposits identical). */
export const POC_DEPOSIT_WEIGHTS: Readonly<Record<MaterialCode, number>> = { FER: 1, KRI: 1, SIL: 1 };

/**
 * Deterministic deposits: a few seed tiles, each spreading to some of its neighbours with the
 * same material. Roughly 10–15% of tiles end up with a deposit. Pure function of (seed, grid, weights).
 */
export function generateDeposits(
  neighbors: ReadonlyArray<ReadonlyArray<number>>,
  seed: number,
  opts: DepositOptions = DEFAULT_DEPOSIT_OPTIONS,
  weights: Readonly<Record<MaterialCode, number>> = POC_DEPOSIT_WEIGHTS,
): Map<number, Deposit> {
  const out = new Map<number, Deposit>();
  const pick = picker(weights);
  const n = neighbors.length;
  for (let i = 0; i < n; i++) {
    if (hash3(seed, i, 0, 0) >= opts.seedChance) continue;
    const resource = pick(hash3(seed, i, 1, 0));
    if (!out.has(i)) out.set(i, { resource, amount: 200 + Math.round(hash3(seed, i, 2, 0) * 30) * 10 });
    for (const nb of neighbors[i]!) {
      if (out.has(nb)) continue;
      if (hash3(seed, nb, 3, i) < opts.spreadChance) {
        out.set(nb, { resource, amount: 100 + Math.round(hash3(seed, nb, 4, i) * 20) * 10 });
      }
    }
  }
  return out;
}

/** Maps h ∈ [0,1) to a material by cumulative weight; equal weights reduce to the PoC's floor(h·n). */
function picker(weights: Readonly<Record<MaterialCode, number>>): (h: number) => MaterialCode {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  if (entries.length === 0) throw new Error('deposit weights are empty');
  const equal = entries.every(([, w]) => w === entries[0]![1]);
  if (equal) return (h) => entries[Math.min(entries.length - 1, Math.floor(h * entries.length))]![0];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return (h) => {
    let acc = 0;
    for (const [code, w] of entries) {
      acc += w / total;
      if (h < acc) return code;
    }
    return entries[entries.length - 1]![0];
  };
}
