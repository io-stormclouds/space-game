import { Deposit } from '../models/planet-grid.model';
import { RESOURCE_KINDS, ResourceKind } from '../models/resource.model';
import { hash3 } from './seeded-noise';

export interface DepositOptions {
  /** Chance that a tile seeds a cluster. */
  seedChance: number;
  /** Chance that each neighbour of a seed tile joins the cluster. */
  spreadChance: number;
}

export const DEFAULT_DEPOSIT_OPTIONS: DepositOptions = { seedChance: 0.035, spreadChance: 0.5 };

/**
 * Deterministic deposits: a few seed tiles, each spreading to some of its neighbours with the
 * same resource. Roughly 10–15% of tiles end up with a deposit. Pure function of (seed, grid).
 */
export function generateDeposits(
  neighbors: ReadonlyArray<ReadonlyArray<number>>,
  seed: number,
  opts: DepositOptions = DEFAULT_DEPOSIT_OPTIONS,
): Map<number, Deposit> {
  const out = new Map<number, Deposit>();
  const n = neighbors.length;
  for (let i = 0; i < n; i++) {
    if (hash3(seed, i, 0, 0) >= opts.seedChance) continue;
    const resource = pickResource(hash3(seed, i, 1, 0));
    if (!out.has(i)) out.set(i, { resource, amount: 200 + Math.round(hash3(seed, i, 2, 0) * 30) * 10 });
    for (const nb of neighbors[i]) {
      if (out.has(nb)) continue;
      if (hash3(seed, nb, 3, i) < opts.spreadChance) {
        out.set(nb, { resource, amount: 100 + Math.round(hash3(seed, nb, 4, i) * 20) * 10 });
      }
    }
  }
  return out;
}

function pickResource(h: number): ResourceKind {
  const idx = Math.min(RESOURCE_KINDS.length - 1, Math.floor(h * RESOURCE_KINDS.length));
  return RESOURCE_KINDS[idx];
}
