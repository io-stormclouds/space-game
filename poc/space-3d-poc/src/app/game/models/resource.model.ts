/** The three resources of the PoC. Names are invented; colours match the KayKit cargo palette. */
export type ResourceKind = 'FERRITE' | 'CRYOL' | 'SILICITE';

export const RESOURCE_KINDS: ReadonlyArray<ResourceKind> = ['FERRITE', 'CRYOL', 'SILICITE'];

export interface ResourceInfo {
  name: string;
  /** Genitive form for cost strings ("20 Ferrytu"). */
  genitive: string;
  color: number;
  cssClass: string;
}

export const RESOURCE_INFO: Record<ResourceKind, ResourceInfo> = {
  FERRITE: { name: 'Ferryt', genitive: 'Ferrytu', color: 0xf97316, cssClass: 'text-orange-300' },
  CRYOL: { name: 'Kriol', genitive: 'Kriolu', color: 0x38bdf8, cssClass: 'text-sky-300' },
  SILICITE: { name: 'Silicyt', genitive: 'Silicytu', color: 0x4ade80, cssClass: 'text-green-300' },
};

export type Stockpile = Record<ResourceKind, number>;
/** A cost or a partial amount; missing kinds mean 0. */
export type Cost = Partial<Stockpile>;

export const emptyStockpile = (): Stockpile => ({ FERRITE: 0, CRYOL: 0, SILICITE: 0 });

export function stockpileOf(partial: Cost): Stockpile {
  return { ...emptyStockpile(), ...partial };
}

export function addStock(a: Stockpile, b: Cost): Stockpile {
  const out = { ...a };
  for (const k of RESOURCE_KINDS) out[k] += b[k] ?? 0;
  return out;
}

/** Subtracts, clamping at zero. */
export function subtractStock(a: Stockpile, b: Cost): Stockpile {
  const out = { ...a };
  for (const k of RESOURCE_KINDS) out[k] = Math.max(0, out[k] - (b[k] ?? 0));
  return out;
}

export function canAfford(a: Stockpile, cost: Cost): boolean {
  return RESOURCE_KINDS.every((k) => a[k] >= (cost[k] ?? 0));
}

/** What is short, per kind; empty when affordable. */
export function missingFor(a: Stockpile, cost: Cost): Cost {
  const out: Cost = {};
  for (const k of RESOURCE_KINDS) {
    const need = (cost[k] ?? 0) - a[k];
    if (need > 0) out[k] = need;
  }
  return out;
}

export function stockTotal(a: Cost): number {
  return RESOURCE_KINDS.reduce((s, k) => s + (a[k] ?? 0), 0);
}

export function isEmptyStock(a: Cost): boolean {
  return stockTotal(a) <= 0;
}

/** "20 Ferrytu + 10 Silicytu" */
export function formatCost(cost: Cost): string {
  const parts = RESOURCE_KINDS.filter((k) => (cost[k] ?? 0) > 0).map((k) => `${cost[k]} ${RESOURCE_INFO[k].genitive}`);
  return parts.length ? parts.join(' + ') : 'za darmo';
}
