import { BodyId } from '../../shared/ids';
import { TileId } from './planet-grid.model';
import { Cost, ResourceKind } from './resource.model';

export type StructureKind =
  | 'MINE'
  | 'ICE_EXTRACTOR'
  | 'SILICITE_EXTRACTOR'
  | 'SOLAR'
  | 'WIND'
  | 'HABITAT'
  | 'DEPOT'
  | 'LANDING_PAD';

export interface StructureInfo {
  name: string;
  description: string;
  cost: Cost;
  /** Negative = consumes power, positive = produces it. */
  power: number;
  /** Extractors need a deposit of this resource on their tile and pull it at `rate` per second. */
  extracts?: ResourceKind;
  rate?: number;
}

export const STRUCTURE_INFO: Record<StructureKind, StructureInfo> = {
  MINE: { name: 'Kopalnia Ferrytu', description: 'Wydobywa Ferryt ze złoża na kafelku.', cost: { FERRITE: 15 }, power: -3, extracts: 'FERRITE', rate: 2 },
  ICE_EXTRACTOR: { name: 'Ekstraktor Kriolu', description: 'Topi lód ze złoża Kriolu.', cost: { FERRITE: 15 }, power: -3, extracts: 'CRYOL', rate: 2 },
  SILICITE_EXTRACTOR: { name: 'Wieża Silicytu', description: 'Wydobywa kryształy Silicytu.', cost: { FERRITE: 15, CRYOL: 5 }, power: -3, extracts: 'SILICITE', rate: 2 },
  SOLAR: { name: 'Panel słoneczny', description: 'Produkuje 5 mocy.', cost: { SILICITE: 10 }, power: 5 },
  WIND: { name: 'Turbina wiatrowa', description: 'Produkuje 10 mocy.', cost: { FERRITE: 15, SILICITE: 10 }, power: 10 },
  HABITAT: { name: 'Habitat', description: 'Moduł mieszkalny załogi.', cost: { FERRITE: 20, SILICITE: 10 }, power: -2 },
  DEPOT: { name: 'Magazyn', description: 'Skład surowców.', cost: { FERRITE: 15, CRYOL: 5 }, power: -1 },
  LANDING_PAD: { name: 'Lądowisko', description: 'Statek ląduje tutaj zamiast wisieć na orbicie.', cost: { FERRITE: 30, CRYOL: 10 }, power: -2 },
};

/** Order of the build menu. */
export const BUILDABLE_KINDS: ReadonlyArray<StructureKind> = [
  'MINE',
  'ICE_EXTRACTOR',
  'SILICITE_EXTRACTOR',
  'SOLAR',
  'WIND',
  'HABITAT',
  'DEPOT',
  'LANDING_PAD',
];

export interface Structure {
  id: string;
  kind: StructureKind;
  bodyId: BodyId;
  tileId: TileId;
  /** Game time of construction. */
  builtAt: number;
}
