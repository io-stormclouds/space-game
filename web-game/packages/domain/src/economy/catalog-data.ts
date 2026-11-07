// Economy catalog — the single source of the material, recipe, building and vehicle data.
// docs/economy-expansion-design.md is generated from it (web-game/tools/economy-model), and the
// game reads it through `computeEconomy()`. Change numbers here, then run `npm run econ:docs`.
// Units: time in model minutes (assumption Z6), power in MW, amounts in units (j.) or u.

export type StorageClass = 'sypkie' | 'sztukowe' | 'płynne' | 'gazowe' | 'kriogeniczne' | 'radioaktywne' | 'egzotyczne';
export type Tier = 'T0' | 'T0R' | 'T0X' | 'T1' | 'T2' | 'T3' | 'T4';
/** Amounts per material code, e.g. `{ FER: 4, KAR: 2 }`. */
export type Qty = Readonly<Record<string, number>>;

export interface Material {
  id: string;
  name: string;
  tier: Tier;
  cls: StorageClass;
  unit: string;
  /** Where it comes from (T0 only). */
  src: string;
  use: string;
}

export interface AtanorSpec {
  level: number;
  cycles: number;
  area: number;
  arms: number;
}

export interface RecipeData {
  id: string;
  building: string;
  inp: Qty;
  out: Qty;
  /** By-products that lower the main product's value. */
  by?: Qty;
  /** Value shares of co-products (instead of by-products). */
  co?: Qty;
  /** Minutes per batch; computed from `atanor` for Atanor recipes. */
  time?: number;
  /** MW while running; computed from `atanor` for Atanor recipes. */
  power?: number;
  /** The process that sets the material's base value (alternatives are `false`). */
  primary: boolean;
  /** Machine time is ship time (expeditions), priced at `shipMinute`. */
  shipTime?: boolean;
  atanor?: AtanorSpec;
}

export interface StorageClassInfo {
  cls: StorageClass;
  building: string;
  cap: number;
  unit: string;
  /** MW at any fill. */
  base: number;
  /** MW per 1000 units stored. */
  per1000: number;
  loss: string;
  /** Example materials for the parity column. */
  ex: string[];
}

export type Era = 0 | 1 | 2 | 3 | 4;
/** I infrastructure, M storage, E energy, W extraction, P processing, F factories, L logistics, O orbit, V vehicles. */
export type BuildingCategory = 'I' | 'M' | 'E' | 'W' | 'P' | 'F' | 'L' | 'O' | 'V';

export interface BuildingDef {
  id: string;
  name: string;
  cat: string;
  era: Era;
  /** Footprint in tiles ('1', '3', '7') or a placement note ('orbita'). */
  fp: string;
  maxL: number;
  /** L1 cost before the era multiplier. */
  c1: Qty;
  /** Materials added at level k (they keep doubling on later levels). */
  ex: Readonly<Record<number, Qty>>;
  /** MW at L1: positive produces, negative consumes. */
  p1: number;
  /** Power growth per level for producers (default `producerPowerGrowth`). */
  pg?: number;
  /** Crew at L1; negative = provides living space. */
  crew: number;
  /** Build time at L1 [min]. */
  t1: number;
  /** Recipe it runs at L1. */
  rec?: string;
  /** Hand-set costs per level (HQ), bypassing the formula and the era multiplier. */
  explicit?: Qty[];
  explicitT?: number[];
}

const ext = (id: string, building: string, mat: string, rate: number, power: number): RecipeData => ({
  id,
  building,
  inp: {},
  out: { [mat]: rate },
  time: 1,
  power,
  primary: true,
});

function atanor(id: string, inp: Qty, out: Qty, level: number, cycles: number, area: number, arms: number): RecipeData {
  return { id, building: `Fabryka atanorowa L${level}`, inp, out, primary: true, atanor: { level, cycles, area, arms } };
}

export const ERA_NAMES = ['E0 Lądowanie', 'E1 Kolonia', 'E2 Industrializacja', 'E3 Orbita i asteroidy', 'E4 Układ zewnętrzny'] as const;

/** Fusion capsules per light year of starship travel. */
export const FUEL_PER_LY: Qty = { KAP: 40 };

export const MATERIALS: ReadonlyArray<Material> = [
  { id: 'FER', name: 'Ferryt', tier: 'T0', cls: 'sypkie', unit: 'j.', src: 'Planeta, asteroidy M', use: 'Stal, wczesne budowle' },
  { id: 'SIL', name: 'Silicyt', tier: 'T0', cls: 'sypkie', unit: 'j.', src: 'Planeta, Księżyc', use: 'Krzem, panele' },
  { id: 'KRI', name: 'Kriol', tier: 'T0', cls: 'sypkie', unit: 'j.', src: 'Planeta, bieguny Księżyca, Glacja, kometa', use: 'Woda → Wodór, Tlen, Paliwo' },
  { id: 'KAR', name: 'Karbonit', tier: 'T0', cls: 'sypkie', unit: 'j.', src: 'Planeta, asteroidy C, Glacja', use: 'Stal, Polimer, Kompozyt, Żywność' },
  { id: 'REG', name: 'Regolit', tier: 'T0', cls: 'sypkie', unit: 'j.', src: 'każdy kafelek bez złoża', use: 'Beton regolitowy, He-3 (Księżyc)' },
  { id: 'KUP', name: 'Kupryt', tier: 'T0R', cls: 'sypkie', unit: 'j.', src: 'Planeta (rzadko), Pyros', use: 'Miedź' },
  { id: 'TYT', name: 'Tytanit', tier: 'T0R', cls: 'sypkie', unit: 'j.', src: 'Księżyc, Pyros', use: 'Tytan' },
  { id: 'URA', name: 'Uranit', tier: 'T0R', cls: 'radioaktywne', unit: 'j.', src: 'Planeta (rzadko), Pyros', use: 'Pręty paliwowe' },
  { id: 'PLA', name: 'Platynit', tier: 'T0R', cls: 'sypkie', unit: 'j.', src: 'asteroidy M (wyprawa górnicza)', use: 'Nadprzewodnik, Katalizator' },
  { id: 'HE3', name: 'Hel-3', tier: 'T0R', cls: 'kriogeniczne', unit: 'u', src: 'Gigas (czerpak), regolit Księżyca (śladowo)', use: 'Kapsuła fuzyjna' },
  { id: 'DEU', name: 'Deuter', tier: 'T0R', cls: 'kriogeniczne', unit: 'u', src: 'Gigas (czerpak), woda (śladowo)', use: 'Kapsuła fuzyjna' },
  { id: 'KWA', name: 'Kwantyt', tier: 'T0X', cls: 'egzotyczne', unit: 'j.', src: 'jądro komety Kerys (wyprawa)', use: 'Procesor kwantowy, Antymateria' },
  { id: 'STA', name: 'Stal', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'konstrukcje' },
  { id: 'MIE', name: 'Miedź', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'Przewód, Nadprzewodnik' },
  { id: 'TIT', name: 'Tytan', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'Stop tytanowy' },
  { id: 'KRZ', name: 'Krzem', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'elektronika, PV' },
  { id: 'WOD', name: 'Woda', tier: 'T1', cls: 'płynne', unit: 'u', src: '', use: 'elektroliza, beton, życie' },
  { id: 'H2', name: 'Wodór', tier: 'T1', cls: 'gazowe', unit: 'u', src: '', use: 'Paliwo, Polimer, Tytan' },
  { id: 'O2', name: 'Tlen', tier: 'T1', cls: 'gazowe', unit: 'u', src: '', use: 'Paliwo, życie' },
  { id: 'PAL', name: 'Paliwo', tier: 'T1', cls: 'kriogeniczne', unit: 'u', src: '', use: 'loty statków' },
  { id: 'BET', name: 'Beton regolitowy', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'fundamenty, osłony' },
  { id: 'POL', name: 'Polimer', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'elektronika, izolacja' },
  { id: 'PRE', name: 'Pręt paliwowy', tier: 'T1', cls: 'radioaktywne', unit: 'j.', src: '', use: 'Reaktor rozszczepienia' },
  { id: 'ZYW', name: 'Żywność', tier: 'T1', cls: 'sztukowe', unit: 'j.', src: '', use: 'załoga, koloniści' },
  { id: 'BEL', name: 'Belka konstrukcyjna', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'duże budowle, kadłuby' },
  { id: 'PRZ', name: 'Przewód', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'Silnik, Układ, PV' },
  { id: 'SLN', name: 'Silnik', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'pojazdy, taśmy L2, pompy' },
  { id: 'UKL', name: 'Układ scalony', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'automatyka, statki' },
  { id: 'OPV', name: 'Ogniwo PV', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'Panel L3+, satelity' },
  { id: 'STP', name: 'Stop tytanowy', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'statki, reaktory' },
  { id: 'KOM', name: 'Kompozyt węglowy', tier: 'T2', cls: 'sztukowe', unit: 'j.', src: '', use: 'kadłuby, zbiorniki' },
  { id: 'NAD', name: 'Nadprzewodnik', tier: 'T3', cls: 'kriogeniczne', unit: 'j.', src: '', use: 'L4 budowli, napędy, fuzja' },
  { id: 'KAT', name: 'Katalizator', tier: 'T3', cls: 'sztukowe', unit: 'j.', src: '', use: 'L4 przetwórstwa' },
  { id: 'MET', name: 'Metamateriał osłonowy', tier: 'T3', cls: 'sztukowe', unit: 'j.', src: '', use: 'L4 budowli, osłony statków' },
  { id: 'KAP', name: 'Kapsuła fuzyjna', tier: 'T4', cls: 'kriogeniczne', unit: 'j.', src: '', use: 'paliwo fuzyjne, napęd gwiazdolotu' },
  { id: 'PRO', name: 'Procesor kwantowy', tier: 'T4', cls: 'sztukowe', unit: 'j.', src: '', use: 'L5 budowli, nawigacja' },
  { id: 'ANT', name: 'Antymateria', tier: 'T4', cls: 'egzotyczne', unit: 'j.', src: '', use: 'napęd Mk IV' },
];

export const RECIPE_DATA: ReadonlyArray<RecipeData> = [
  ext('X_FER', 'Kopalnia', 'FER', 2, 3),
  ext('X_SIL', 'Wieża Silicytu', 'SIL', 2, 3),
  ext('X_KRI', 'Ekstraktor Kriolu', 'KRI', 2, 3),
  ext('X_KAR', 'Kopalnia', 'KAR', 1.5, 3),
  ext('X_REG', 'Koparka regolitu', 'REG', 3, 2),
  ext('X_KUP', 'Kopalnia', 'KUP', 1, 3),
  ext('X_TYT', 'Kopalnia', 'TYT', 1, 3),
  ext('X_URA', 'Kopalnia', 'URA', 0.25, 3),
  { id: 'R_WOD', building: 'Topielnik lodu', inp: { KRI: 2 }, out: { WOD: 20 }, time: 2, power: 4, primary: true },
  { id: 'R_ELE', building: 'Elektrolizer', inp: { WOD: 20 }, out: { H2: 20, O2: 10 }, co: { H2: 0.5, O2: 0.5 }, time: 4, power: 12, primary: true },
  { id: 'R_PAL', building: 'Skraplacz paliwa', inp: { H2: 20, O2: 10 }, out: { PAL: 10 }, time: 3, power: 10, primary: true },
  { id: 'X_PLA', building: 'Górnik asteroidowy — wyprawa na asteroidę M', inp: { PAL: 60 }, out: { PLA: 5 }, by: { FER: 95 }, time: 75, power: 0, primary: true, shipTime: true },
  { id: 'X_GAS', building: 'Platforma czerpalna', inp: {}, out: { HE3: 2, DEU: 8 }, co: { HE3: 0.75, DEU: 0.25 }, time: 10, power: 40, primary: true },
  { id: 'X_HE3R', building: 'Separator He-3 (Księżyc)', inp: { REG: 40 }, out: { HE3: 1 }, time: 10, power: 20, primary: false },
  { id: 'X_DEUW', building: 'Separator deuteru', inp: { WOD: 200 }, out: { DEU: 1 }, time: 20, power: 15, primary: false },
  { id: 'X_KWA', building: 'Górnik asteroidowy Mk III — wyprawa kometarna', inp: { PAL: 150 }, out: { KWA: 5 }, by: { KRI: 60 }, time: 300, power: 0, primary: true, shipTime: true },
  { id: 'R_STA', building: 'Huta', inp: { FER: 4, KAR: 2 }, out: { STA: 2 }, time: 4, power: 6, primary: true },
  { id: 'R_MIE', building: 'Huta', inp: { KUP: 4 }, out: { MIE: 2 }, time: 4, power: 6, primary: true },
  { id: 'R_KRZ', building: 'Rafineria krzemu', inp: { SIL: 4, KAR: 1 }, out: { KRZ: 2 }, time: 5, power: 8, primary: true },
  { id: 'R_TIT', building: 'Huta L3', inp: { TYT: 4, H2: 20 }, out: { TIT: 1 }, by: { FER: 2, WOD: 10 }, time: 8, power: 12, primary: true },
  { id: 'R_BET', building: 'Betoniarnia', inp: { REG: 6, WOD: 10 }, out: { BET: 2 }, time: 3, power: 4, primary: true },
  { id: 'R_POL', building: 'Zakład chemiczny', inp: { KAR: 2, H2: 20 }, out: { POL: 2 }, time: 5, power: 8, primary: true },
  { id: 'R_PRE', building: 'Zakład wzbogacania', inp: { URA: 10 }, out: { PRE: 1 }, time: 20, power: 30, primary: true },
  { id: 'R_ZYW', building: 'Farma hydroponiczna', inp: { WOD: 20, KAR: 1 }, out: { ZYW: 1 }, time: 10, power: 6, primary: true },
  { id: 'R_BEL', building: 'Montownia', inp: { STA: 3 }, out: { BEL: 2 }, time: 3, power: 5, primary: true },
  { id: 'R_PRZ', building: 'Montownia', inp: { MIE: 1 }, out: { PRZ: 3 }, time: 2, power: 4, primary: true },
  { id: 'R_SLN', building: 'Montownia', inp: { STA: 2, PRZ: 4 }, out: { SLN: 1 }, time: 6, power: 6, primary: true },
  { id: 'R_UKL', building: 'Fabryka elektroniki', inp: { KRZ: 1, PRZ: 3, POL: 1 }, out: { UKL: 1 }, time: 6, power: 10, primary: true },
  { id: 'R_OPV', building: 'Fabryka elektroniki', inp: { KRZ: 2, PRZ: 2 }, out: { OPV: 1 }, time: 5, power: 8, primary: true },
  { id: 'R_STP', building: 'Huta L3', inp: { TIT: 1, STA: 2 }, out: { STP: 2 }, time: 6, power: 14, primary: true },
  { id: 'R_KOM', building: 'Zakład chemiczny L2', inp: { KAR: 3, POL: 2 }, out: { KOM: 1 }, time: 8, power: 10, primary: true },
  atanor('A_NAD', { MIE: 2, PLA: 1, H2: 10 }, { NAD: 1 }, 1, 12, 9, 2),
  atanor('A_KAT', { PLA: 1, KRZ: 1 }, { KAT: 1 }, 2, 10, 8, 2),
  atanor('A_MET', { STP: 1, KOM: 1, BET: 2 }, { MET: 1 }, 2, 16, 14, 3),
  atanor('A_KAP', { HE3: 5, DEU: 10, NAD: 1 }, { KAP: 1 }, 3, 18, 16, 3),
  atanor('A_PRO', { KWA: 1, UKL: 2, NAD: 1 }, { PRO: 1 }, 4, 24, 20, 4),
  { id: 'R_ANT', building: 'Akcelerator cząstek', inp: { H2: 50, KWA: 1 }, out: { ANT: 1 }, time: 60, power: 200, primary: true },
];

export const STORAGE_CLASSES: ReadonlyArray<StorageClassInfo> = [
  { cls: 'sypkie', building: 'Składowisko', cap: 20000, unit: 'j.', base: 0, per1000: 0, loss: 'brak (na Pyrosie Kriol topnieje 5%/h bez zadaszenia)', ex: ['FER', 'REG'] },
  { cls: 'sztukowe', building: 'Magazyn', cap: 5000, unit: 'j.', base: 0.5, per1000: 0, loss: 'brak; bez mocy stoi automatyka wydawania', ex: ['STA', 'UKL'] },
  { cls: 'płynne', building: 'Zbiornik płynów', cap: 10000, unit: 'u', base: 0.2, per1000: 0.02, loss: 'na ciałach bez atmosfery woda zamarza → zbiornik zablokowany do ogrzania', ex: ['WOD'] },
  { cls: 'gazowe', building: 'Zbiornik ciśnieniowy', cap: 10000, unit: 'u', base: 0.5, per1000: 0.1, loss: '0,5%/h ulatnia się', ex: ['H2', 'O2'] },
  { cls: 'kriogeniczne', building: 'Kriomagazyn', cap: 20000, unit: 'u / j.', base: 1, per1000: 0.15, loss: '2%/h odparowania; Nadprzewodnik traci 1%/h', ex: ['PAL', 'HE3', 'NAD', 'KAP'] },
  { cls: 'radioaktywne', building: 'Bunkier osłonowy', cap: 500, unit: 'j.', base: 1, per1000: 2, loss: 'brak; poza bunkrem składowanie zabronione', ex: ['URA', 'PRE'] },
  { cls: 'egzotyczne', building: 'Pułapka magnetyczna', cap: 10, unit: 'j.', base: 2, per1000: 5000, loss: 'Antymateria: anihilacja zawartości i zniszczenie budynku; Kwantyt: rozpad 1%/h', ex: ['ANT', 'KWA'] },
];

export const BUILDINGS: ReadonlyArray<BuildingDef> = [
  { id: 'HQ', name: 'Centrum dowodzenia', cat: 'I', era: 0, fp: '3', maxL: 5, c1: {}, ex: {}, p1: 5, pg: 1.6, crew: -5, t1: 0,
    explicit: [{}, { FER: 600, SIL: 300, STA: 60 }, { FER: 2400, SIL: 1200, STA: 600, BEL: 300, UKL: 60 }, { STA: 3000, BEL: 1500, UKL: 300, STP: 300, NAD: 60, MET: 40 }, { STA: 15000, BEL: 7000, UKL: 1500, STP: 1500, NAD: 400, MET: 300, PRO: 40, KAP: 60 }],
    explicitT: [0, 30, 120, 360, 960] },
  { id: 'LAND', name: 'Lądowisko', cat: 'I', era: 0, fp: '1', maxL: 3, c1: { FER: 30, KRI: 10 }, ex: { 2: { STA: 20 }, 3: { BEL: 10, SLN: 4 } }, p1: -2, crew: 2, t1: 5 },
  { id: 'HAB', name: 'Habitat', cat: 'I', era: 0, fp: '1', maxL: 5, c1: { FER: 20, SIL: 10 }, ex: { 2: { STA: 10, BET: 10 }, 3: { POL: 20, UKL: 4 }, 4: { MET: 4 }, 5: { PRO: 1 } }, p1: -2, crew: -10, t1: 3 },
  { id: 'FARM', name: 'Farma hydroponiczna', cat: 'I', era: 1, fp: '1', maxL: 4, c1: { FER: 15, SIL: 15 }, ex: { 2: { KRZ: 5 }, 3: { POL: 10, UKL: 2 }, 4: { KAT: 2 } }, p1: -6, crew: 2, t1: 5, rec: 'R_ZYW' },
  { id: 'GAR', name: 'Garaż pojazdów', cat: 'I', era: 1, fp: '1', maxL: 3, c1: { FER: 30, SIL: 10 }, ex: { 2: { STA: 20 }, 3: { SLN: 6, UKL: 4 } }, p1: -2, crew: 3, t1: 8 },
  { id: 'DEP', name: 'Magazyn', cat: 'M', era: 0, fp: '1', maxL: 5, c1: { FER: 15, KRI: 5 }, ex: { 2: { STA: 10 }, 3: { BEL: 10 }, 4: { MET: 2 }, 5: { PRO: 1 } }, p1: -0.5, crew: 1, t1: 2 },
  { id: 'SKL', name: 'Składowisko', cat: 'M', era: 0, fp: '1', maxL: 5, c1: { FER: 10 }, ex: { 2: { BET: 10 }, 3: { BEL: 8 }, 4: { MET: 2 }, 5: { PRO: 1 } }, p1: 0, crew: 0, t1: 2 },
  { id: 'TNK', name: 'Zbiornik płynów', cat: 'M', era: 1, fp: '1', maxL: 4, c1: { FER: 20 }, ex: { 2: { STA: 10 }, 3: { POL: 10, SLN: 2 }, 4: { KOM: 10, NAD: 1 } }, p1: -0.2, crew: 0, t1: 3 },
  { id: 'GAS', name: 'Zbiornik ciśnieniowy', cat: 'M', era: 2, fp: '1', maxL: 4, c1: { STA: 15 }, ex: { 2: { POL: 5 }, 3: { SLN: 3 }, 4: { KOM: 10, NAD: 1 } }, p1: -0.5, crew: 0, t1: 5 },
  { id: 'CRY', name: 'Kriomagazyn', cat: 'M', era: 2, fp: '1', maxL: 4, c1: { STA: 20, POL: 10 }, ex: { 2: { KRZ: 10 }, 3: { UKL: 4, KOM: 5 }, 4: { NAD: 4 } }, p1: -1, crew: 1, t1: 15 },
  { id: 'BNK', name: 'Bunkier osłonowy', cat: 'M', era: 2, fp: '1', maxL: 3, c1: { BET: 40, STA: 10 }, ex: { 2: { BET: 20 }, 3: { MET: 4 } }, p1: -1, crew: 1, t1: 15 },
  { id: 'TRAP', name: 'Pułapka magnetyczna', cat: 'M', era: 4, fp: '1', maxL: 3, c1: { NAD: 10, UKL: 10, STP: 10 }, ex: { 2: { PRO: 1 }, 3: { PRO: 1 } }, p1: -2, crew: 2, t1: 60 },
  { id: 'AKU', name: 'Akumulator', cat: 'M', era: 2, fp: '1', maxL: 5, c1: { MIE: 10, KRZ: 5 }, ex: { 2: { PRZ: 10 }, 3: { UKL: 4 }, 4: { NAD: 2 }, 5: { PRO: 1 } }, p1: 0, crew: 0, t1: 5 },
  { id: 'SOL', name: 'Panel słoneczny', cat: 'E', era: 0, fp: '1', maxL: 5, c1: { SIL: 10 }, ex: { 2: { KRZ: 5 }, 3: { OPV: 6 }, 4: { NAD: 2 }, 5: { PRO: 1 } }, p1: 5, pg: 1.7, crew: 0, t1: 1 },
  { id: 'WND', name: 'Turbina wiatrowa', cat: 'E', era: 0, fp: '1', maxL: 3, c1: { FER: 15, SIL: 10 }, ex: { 2: { STA: 10 }, 3: { SLN: 4, KOM: 4 } }, p1: 10, pg: 1.6, crew: 0, t1: 2 },
  { id: 'FIS', name: 'Reaktor rozszczepienia', cat: 'E', era: 2, fp: '3', maxL: 4, c1: { STA: 60, BET: 80 }, ex: { 2: { BEL: 20 }, 3: { UKL: 10, STP: 10 }, 4: { NAD: 6 } }, p1: 60, pg: 1.6, crew: 8, t1: 45 },
  { id: 'FUS', name: 'Reaktor fuzyjny', cat: 'E', era: 4, fp: '7', maxL: 3, c1: { STP: 80, NAD: 20, BEL: 60 }, ex: { 2: { MET: 10 }, 3: { PRO: 4 } }, p1: 400, pg: 1.6, crew: 12, t1: 180 },
  { id: 'REC', name: 'Rektenna', cat: 'E', era: 3, fp: '3', maxL: 3, c1: { STA: 30, PRZ: 40 }, ex: { 2: { UKL: 6 }, 3: { NAD: 4 } }, p1: 0, crew: 2, t1: 30 },
  { id: 'MIN', name: 'Kopalnia', cat: 'W', era: 0, fp: '1', maxL: 5, c1: { FER: 15 }, ex: { 2: { STA: 10 }, 3: { SLN: 3 }, 4: { KAT: 1 }, 5: { PRO: 1 } }, p1: -3, crew: 2, t1: 2, rec: 'X_FER' },
  { id: 'ICE', name: 'Ekstraktor Kriolu', cat: 'W', era: 0, fp: '1', maxL: 5, c1: { FER: 15 }, ex: { 2: { STA: 10 }, 3: { SLN: 3 }, 4: { KAT: 1 }, 5: { PRO: 1 } }, p1: -3, crew: 2, t1: 2, rec: 'X_KRI' },
  { id: 'SIT', name: 'Wieża Silicytu', cat: 'W', era: 0, fp: '1', maxL: 5, c1: { FER: 15, KRI: 5 }, ex: { 2: { STA: 10 }, 3: { SLN: 3 }, 4: { KAT: 1 }, 5: { PRO: 1 } }, p1: -3, crew: 2, t1: 2, rec: 'X_SIL' },
  { id: 'REGX', name: 'Koparka regolitu', cat: 'W', era: 1, fp: '1', maxL: 3, c1: { FER: 10 }, ex: { 2: { STA: 5 }, 3: { SLN: 2 } }, p1: -2, crew: 1, t1: 1, rec: 'X_REG' },
  { id: 'HE3S', name: 'Separator He-3', cat: 'W', era: 3, fp: '3', maxL: 3, c1: { STA: 40, KRZ: 20 }, ex: { 2: { UKL: 6 }, 3: { KAT: 2 } }, p1: -20, crew: 3, t1: 45, rec: 'X_HE3R' },
  { id: 'SMT', name: 'Huta', cat: 'P', era: 1, fp: '3', maxL: 5, c1: { FER: 40, SIL: 20 }, ex: { 2: { BET: 20 }, 3: { BEL: 10, SLN: 4 }, 4: { KAT: 2, MET: 2 }, 5: { PRO: 1 } }, p1: -6, crew: 4, t1: 10, rec: 'R_STA' },
  { id: 'SIR', name: 'Rafineria krzemu', cat: 'P', era: 1, fp: '3', maxL: 5, c1: { STA: 5, SIL: 20 }, ex: { 2: { BET: 15 }, 3: { SLN: 3, UKL: 2 }, 4: { KAT: 2 }, 5: { PRO: 1 } }, p1: -8, crew: 4, t1: 15, rec: 'R_KRZ' },
  { id: 'MLT', name: 'Topielnik lodu', cat: 'P', era: 1, fp: '1', maxL: 4, c1: { FER: 20 }, ex: { 2: { STA: 10 }, 3: { SLN: 2 }, 4: { NAD: 1 } }, p1: -4, crew: 1, t1: 3, rec: 'R_WOD' },
  { id: 'ELY', name: 'Elektrolizer', cat: 'P', era: 2, fp: '3', maxL: 5, c1: { STA: 30, MIE: 10 }, ex: { 2: { PRZ: 10 }, 3: { UKL: 4 }, 4: { KAT: 2 }, 5: { PRO: 1 } }, p1: -12, crew: 3, t1: 15, rec: 'R_ELE' },
  { id: 'LIQ', name: 'Skraplacz paliwa', cat: 'P', era: 2, fp: '3', maxL: 4, c1: { STA: 30, POL: 10 }, ex: { 2: { SLN: 4 }, 3: { UKL: 4, KOM: 4 }, 4: { NAD: 3 } }, p1: -10, crew: 3, t1: 15, rec: 'R_PAL' },
  { id: 'CON', name: 'Betoniarnia', cat: 'P', era: 1, fp: '1', maxL: 4, c1: { FER: 20, SIL: 10 }, ex: { 2: { STA: 10 }, 3: { SLN: 2 }, 4: { MET: 1 } }, p1: -4, crew: 2, t1: 5, rec: 'R_BET' },
  { id: 'CHM', name: 'Zakład chemiczny', cat: 'P', era: 2, fp: '3', maxL: 5, c1: { STA: 30, KRZ: 10 }, ex: { 2: { POL: 10 }, 3: { UKL: 4 }, 4: { KAT: 3 }, 5: { PRO: 1 } }, p1: -8, crew: 4, t1: 15, rec: 'R_POL' },
  { id: 'ENR', name: 'Zakład wzbogacania', cat: 'P', era: 2, fp: '3', maxL: 3, c1: { STA: 60, BET: 60, UKL: 6 }, ex: { 2: { STP: 10 }, 3: { NAD: 4 } }, p1: -30, crew: 6, t1: 45, rec: 'R_PRE' },
  { id: 'DSEP', name: 'Separator deuteru', cat: 'P', era: 3, fp: '3', maxL: 3, c1: { STA: 40, UKL: 4 }, ex: { 2: { KAT: 2 }, 3: { NAD: 2 } }, p1: -15, crew: 3, t1: 45 },
  { id: 'ASM', name: 'Montownia', cat: 'F', era: 2, fp: '3', maxL: 5, c1: { STA: 30, BET: 20 }, ex: { 2: { PRZ: 10 }, 3: { SLN: 4, UKL: 2 }, 4: { NAD: 2 }, 5: { PRO: 1 } }, p1: -5, crew: 5, t1: 15, rec: 'R_BEL' },
  { id: 'ELF', name: 'Fabryka elektroniki', cat: 'F', era: 2, fp: '3', maxL: 5, c1: { STA: 30, KRZ: 20, PRZ: 20 }, ex: { 2: { POL: 10 }, 3: { UKL: 6 }, 4: { NAD: 3 }, 5: { PRO: 1 } }, p1: -10, crew: 6, t1: 20, rec: 'R_UKL' },
  { id: 'ATN', name: 'Fabryka atanorowa', cat: 'F', era: 3, fp: '7', maxL: 5, c1: { STA: 80, BET: 60, UKL: 20, SLN: 10 }, ex: { 2: { STP: 20 }, 3: { NAD: 10 }, 4: { MET: 10, KAT: 5 }, 5: { PRO: 4 } }, p1: -6, crew: 10, t1: 90, rec: 'A_NAD' },
  { id: 'ACC', name: 'Akcelerator cząstek', cat: 'F', era: 4, fp: '7', maxL: 3, c1: { STP: 120, NAD: 60, PRO: 4 }, ex: { 2: { PRO: 4 }, 3: { PRO: 4 } }, p1: -200, crew: 15, t1: 240, rec: 'R_ANT' },
  { id: 'PUMP', name: 'Pompa', cat: 'L', era: 2, fp: '1', maxL: 3, c1: { STA: 4, SLN: 1 }, ex: { 2: { POL: 2 }, 3: { UKL: 1 } }, p1: -1, crew: 0, t1: 1 },
  { id: 'LST', name: 'Stacja załadunkowa', cat: 'L', era: 1, fp: '1', maxL: 3, c1: { STA: 15, FER: 20 }, ex: { 2: { SLN: 2 }, 3: { UKL: 2 } }, p1: -1, crew: 1, t1: 5 },
  { id: 'MDR', name: 'Wyrzutnia masy', cat: 'L', era: 3, fp: '7', maxL: 3, c1: { STP: 60, NAD: 10, BEL: 60 }, ex: { 2: { MET: 6 }, 3: { PRO: 2 } }, p1: -80, crew: 8, t1: 180 },
  { id: 'ORB', name: 'Stacja orbitalna', cat: 'O', era: 2, fp: 'orbita', maxL: 5, c1: { STA: 120, BEL: 60, UKL: 10, POL: 40 }, ex: { 2: { SLN: 10 }, 3: { STP: 40 }, 4: { MET: 10, NAD: 6 }, 5: { PRO: 3 } }, p1: -10, crew: 10, t1: 120 },
  { id: 'YRD', name: 'Stocznia orbitalna', cat: 'O', era: 3, fp: 'orbita', maxL: 4, c1: { STA: 200, BEL: 120, SLN: 20, UKL: 20 }, ex: { 2: { STP: 60 }, 3: { NAD: 10, KOM: 40 }, 4: { MET: 20, PRO: 2 } }, p1: -20, crew: 15, t1: 180 },
  { id: 'TRD', name: 'Terminal handlowy', cat: 'O', era: 3, fp: 'moduł stacji', maxL: 3, c1: { STA: 40, UKL: 10 }, ex: { 2: { KOM: 10 }, 3: { PRO: 1 } }, p1: -5, crew: 3, t1: 45 },
  { id: 'SAT', name: 'Satelita energetyczny', cat: 'O', era: 3, fp: 'orbita', maxL: 3, c1: { OPV: 40, STP: 10, UKL: 6 }, ex: { 2: { NAD: 4 }, 3: { PRO: 1 } }, p1: 30, pg: 1.7, crew: 0, t1: 60 },
  { id: 'GASP', name: 'Platforma czerpalna', cat: 'O', era: 4, fp: 'orbita Gigasa', maxL: 3, c1: { STP: 60, KOM: 40, UKL: 10 }, ex: { 2: { NAD: 6 }, 3: { KAT: 6 } }, p1: -40, crew: 8, t1: 240, rec: 'X_GAS' },
  { id: 'DOCK', name: 'Dok gwiezdny', cat: 'O', era: 4, fp: 'orbita', maxL: 5, c1: { BEL: 400, STP: 200, UKL: 40 }, ex: { 2: { NAD: 40 }, 3: { MET: 40 }, 4: { PRO: 6 }, 5: { KAP: 40 } }, p1: -60, crew: 30, t1: 240 },
];

export const VEHICLES: ReadonlyArray<BuildingDef> = [
  { id: 'ROV', name: 'Łazik konstrukcyjny', cat: 'V', era: 0, fp: '—', maxL: 3, c1: { FER: 20, SIL: 5 }, ex: { 2: { STA: 10, SLN: 1 }, 3: { UKL: 2 } }, p1: -0.5, crew: 1, t1: 3 },
  { id: 'TRK', name: 'Ciężarówka', cat: 'V', era: 1, fp: '—', maxL: 3, c1: { STA: 20, FER: 20 }, ex: { 2: { SLN: 2 }, 3: { UKL: 2 } }, p1: -1, crew: 1, t1: 5 },
  { id: 'CNV', name: 'Konwój ciężki', cat: 'V', era: 2, fp: '—', maxL: 3, c1: { STA: 60, SLN: 6, UKL: 4 }, ex: { 2: { BEL: 20 }, 3: { KOM: 10 } }, p1: -3, crew: 2, t1: 20 },
  { id: 'DRN', name: 'Dron logistyczny', cat: 'V', era: 3, fp: '—', maxL: 2, c1: { KOM: 2, SLN: 1, UKL: 1 }, ex: { 2: { NAD: 1 } }, p1: -0.3, crew: 0, t1: 5 },
  { id: 'SHU', name: 'Prom orbitalny', cat: 'V', era: 2, fp: '—', maxL: 3, c1: { STA: 30, SLN: 4, POL: 10 }, ex: { 2: { KOM: 10 }, 3: { UKL: 4 } }, p1: 0, crew: 2, t1: 30 },
  { id: 'AST', name: 'Statek transportowy Astraeus', cat: 'V', era: 0, fp: '—', maxL: 3, c1: { STA: 40, SLN: 6, UKL: 4 }, ex: { 2: { KOM: 20 }, 3: { STP: 20, NAD: 2 } }, p1: 0, crew: 3, t1: 60 },
  { id: 'FRT', name: 'Frachtowiec', cat: 'V', era: 3, fp: '—', maxL: 3, c1: { BEL: 80, STP: 20, SLN: 10, UKL: 6 }, ex: { 2: { STP: 20 }, 3: { NAD: 6 } }, p1: 0, crew: 5, t1: 120 },
  { id: 'TKS', name: 'Tankowiec', cat: 'V', era: 3, fp: '—', maxL: 3, c1: { BEL: 60, STP: 30, KOM: 20, UKL: 6 }, ex: { 2: { POL: 40 }, 3: { NAD: 6 } }, p1: 0, crew: 5, t1: 120 },
  { id: 'MNR', name: 'Górnik asteroidowy', cat: 'V', era: 3, fp: '—', maxL: 3, c1: { BEL: 40, STA: 40, SLN: 8, UKL: 4 }, ex: { 2: { STP: 20, KAT: 1 }, 3: { NAD: 4 } }, p1: 0, crew: 4, t1: 90 },
  { id: 'PRB', name: 'Sonda', cat: 'V', era: 3, fp: '—', maxL: 3, c1: { KOM: 10, UKL: 6, OPV: 4 }, ex: { 2: { NAD: 1 }, 3: { PRO: 1, KAP: 10 } }, p1: 0, crew: 0, t1: 45 },
];

export const STARSHIP_MODULES: Readonly<Record<string, Qty>> = {
  'Kadłub': { BEL: 1600, STP: 1200, KOM: 800 },
  'Osłona radiacyjna': { MET: 480, BET: 3200 },
  'Habitat hibernacyjny': { UKL: 600, POL: 1200, ZYW: 3000 },
  'Napęd fuzyjny Mk I (5 ly)': { NAD: 600, STP: 800, SLN: 400, UKL: 240 },
  'Komputer nawigacyjny': { PRO: 60, UKL: 400 },
};

export const STARSHIP_UPGRADES: Readonly<Record<string, Qty>> = {
  'Napęd Mk II (9 ly)': { NAD: 400, STP: 400 },
  'Napęd Mk III (12,5 ly)': { NAD: 400, PRO: 24 },
  'Napęd Mk IV — antymateria (17 ly)': { ANT: 60, NAD: 400, PRO: 24 },
};
