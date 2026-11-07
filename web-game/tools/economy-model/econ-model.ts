// Economy model v2 for docs/economy-expansion-design.md — every number in the doc's tables comes from here.
// Time unit of the model = 1 minute of real time (PoC runs the same rules ×60 faster).
import { STAR_DATA } from '../../../poc/space-galaxy-poc/star-map/src/app/data/stars.data';
import { writeFileSync } from 'node:fs';

const C_E = 0.1; // kr per MW·min (settlement price of energy)
const C_T = 0.1; // kr per machine-minute (facility amortisation)
const C_T_SHIP = 1.0; // kr per ship-minute

type Cls = 'sypkie' | 'sztukowe' | 'płynne' | 'gazowe' | 'kriogeniczne' | 'radioaktywne' | 'egzotyczne';
interface Mat { id: string; name: string; tier: string; cls: Cls; unit: string; src: string; use: string }
const MATS: Mat[] = [
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
const M = new Map(MATS.map((m) => [m.id, m]));
const nm = (id: string) => M.get(id)!.name;

type Q = Record<string, number>;
interface Recipe { id: string; building: string; inp: Q; out: Q; by?: Q; co?: Q; time: number; power: number; primary: boolean; ct?: number; atanor?: { level: number; cycles: number; area: number; arms: number } }
const TICK = [0, 1.0, 0.9, 0.8, 0.7, 0.6];
const ATN_BASE = (L: number) => 6 * Math.pow(1.45, L - 1);
function atanor(id: string, inp: Q, out: Q, level: number, cycles: number, area: number, arms: number): Recipe {
  return { id, building: `Fabryka atanorowa L${level}`, inp, out, time: +(cycles * TICK[level]).toFixed(2), power: +(ATN_BASE(level) + 0.5 * area + arms).toFixed(1), primary: true, atanor: { level, cycles, area, arms } };
}
const ext = (id: string, building: string, mat: string, rate: number, power: number): Recipe => ({ id, building, inp: {}, out: { [mat]: rate }, time: 1, power, primary: true });

const RECIPES: Recipe[] = [
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
  { id: 'X_PLA', building: 'Górnik asteroidowy — wyprawa na asteroidę M', inp: { PAL: 60 }, out: { PLA: 5 }, by: { FER: 95 }, time: 75, power: 0, primary: true, ct: C_T_SHIP },
  { id: 'X_GAS', building: 'Platforma czerpalna', inp: {}, out: { HE3: 2, DEU: 8 }, co: { HE3: 0.75, DEU: 0.25 }, time: 10, power: 40, primary: true },
  { id: 'X_HE3R', building: 'Separator He-3 (Księżyc)', inp: { REG: 40 }, out: { HE3: 1 }, time: 10, power: 20, primary: false },
  { id: 'X_DEUW', building: 'Separator deuteru', inp: { WOD: 200 }, out: { DEU: 1 }, time: 20, power: 15, primary: false },
  { id: 'X_KWA', building: 'Górnik asteroidowy Mk III — wyprawa kometarna', inp: { PAL: 150 }, out: { KWA: 5 }, by: { KRI: 60 }, time: 300, power: 0, primary: true, ct: C_T_SHIP },
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

interface Val { V: number; E: number; T: number; raw: Q }
const VAL = new Map<string, Val>();
const ALT = new Map<string, Val>();
const addQ = (a: Q, b: Q, k: number) => { for (const [id, q] of Object.entries(b)) a[id] = (a[id] ?? 0) + q * k; };
function evalRecipe(r: Recipe): Map<string, Val> | null {
  for (const id of [...Object.keys(r.inp), ...Object.keys(r.by ?? {})]) if (!VAL.has(id)) return null;
  const ct = r.ct ?? C_T;
  let V = r.power * r.time * C_E + r.time * ct, E = r.power * r.time, T = r.time;
  const raw: Q = {};
  for (const [id, q] of Object.entries(r.inp)) { const v = VAL.get(id)!; V += q * v.V; E += q * v.E; T += q * v.T; addQ(raw, v.raw, q); }
  const shares: Q = {};
  if (r.co) Object.assign(shares, r.co);
  else {
    let s = 0;
    for (const [id, q] of Object.entries(r.by ?? {})) s += Math.min(0.9, (q * VAL.get(id)!.V) / V);
    for (const id of Object.keys(r.out)) shares[id] = 1 - s;
  }
  const res = new Map<string, Val>();
  for (const [id, q] of Object.entries(r.out)) {
    const rq: Q = {};
    if (Object.keys(r.inp).length === 0) rq[id] = 1; else addQ(rq, raw, shares[id] / q);
    res.set(id, { V: (V * shares[id]) / q, E: (E * shares[id]) / q, T: (T * shares[id]) / q, raw: rq });
  }
  return res;
}
let pending = RECIPES.filter((r) => r.primary);
for (let g = 0; pending.length && g < 50; g++) pending = pending.filter((r) => { const res = evalRecipe(r); if (!res) return true; for (const [id, v] of res) VAL.set(id, v); return false; });
if (pending.length) throw new Error('unresolved ' + pending.map((r) => r.id));
for (const r of RECIPES.filter((x) => !x.primary)) for (const [id, v] of evalRecipe(r)!) ALT.set(r.id + ':' + id, v);

const f = (n: number, d = 2) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('pl-PL') : Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1).replace('.', ',') : n.toFixed(d).replace('.', ','));
const fq = (n: number) => (Number.isInteger(n) ? n.toLocaleString('pl-PL') : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ','));
const qstr = (q: Q) => Object.entries(q).map(([id, n]) => `${fq(n)} ${nm(id)}`).join(' + ');
const kr = (q: Q) => Object.entries(q).reduce((s, [id, n]) => s + n * VAL.get(id)!.V, 0);
const fmtT = (min: number) => (min < 1 ? `${Math.round(min * 60)} s` : min < 120 ? `${Math.round(min)} min` : min < 2880 ? `${(min / 60).toFixed(1).replace('.', ',')} h` : `${(min / 1440).toFixed(1).replace('.', ',')} d`);

const out: string[] = [];
const H = (s: string) => out.push('', `### ${s}`, '');

H('GEN: materiały');
out.push('| Materiał | Poziom | Klasa składowania | Proces (budynek: wejście → wyjście; czas; moc) | Wartość bazowa [kr/j.] | Energia wbudowana [MW·min/j.] | Czas wbudowany [maszyno-min/j.] |');
out.push('|---|---|---|---|---|---|---|');
for (const m of MATS) {
  const r = RECIPES.find((x) => x.primary && x.out[m.id] !== undefined)!;
  const v = VAL.get(m.id)!;
  const proc = Object.keys(r.inp).length === 0
    ? `${r.building}: ${r.co ? qstr(r.out) + ' (koprodukty)' : fq(r.out[m.id]) + ' ' + m.unit} na min; ${fq(r.power)} MW`
    : `${r.building}: ${qstr(r.inp)} → ${qstr(r.out)}${r.by ? ` (+ uboczne: ${qstr(r.by)})` : r.co ? ' (koprodukty)' : ''}; ${fq(r.time)} min; ${fq(r.power)} MW`;
  out.push(`| **${m.name}** | ${m.tier} | ${m.cls} | ${proc} | ${f(v.V)} | ${f(v.E, 1)} | ${f(v.T, 1)} |`);
}
H('GEN: alternatywy');
for (const [k, v] of ALT) { const [rid, mid] = k.split(':'); out.push(`- ${rid} → ${nm(mid)}: ${f(v.V)} kr/j. (×${f(v.V / VAL.get(mid)!.V, 1)} wartości z procesu podstawowego)`); }
const basket = ['STA', 'MIE', 'KRZ', 'BET', 'POL', 'BEL', 'SLN', 'UKL', 'STP', 'KOM', 'NAD'];
const RHO = basket.reduce((s, id) => s + VAL.get(id)!.V / VAL.get(id)!.E, 0) / basket.length;
out.push(`- ρ (średnia wartość / energia wbudowana, koszyk T1–T3) = ${f(RHO, 3)} kr na MW·min`);

// ---------- storage ----------
interface Store { cls: Cls; building: string; cap: number; unit: string; base: number; per1000: number; loss: string; ex: string[] }
const STORES: Store[] = [
  { cls: 'sypkie', building: 'Składowisko', cap: 20000, unit: 'j.', base: 0, per1000: 0, loss: 'brak (na Pyrosie Kriol topnieje 5%/h bez zadaszenia)', ex: ['FER', 'REG'] },
  { cls: 'sztukowe', building: 'Magazyn', cap: 5000, unit: 'j.', base: 0.5, per1000: 0, loss: 'brak; bez mocy stoi automatyka wydawania', ex: ['STA', 'UKL'] },
  { cls: 'płynne', building: 'Zbiornik płynów', cap: 10000, unit: 'u', base: 0.2, per1000: 0.02, loss: 'na ciałach bez atmosfery woda zamarza → zbiornik zablokowany do ogrzania', ex: ['WOD'] },
  { cls: 'gazowe', building: 'Zbiornik ciśnieniowy', cap: 10000, unit: 'u', base: 0.5, per1000: 0.1, loss: '0,5%/h ulatnia się', ex: ['H2', 'O2'] },
  { cls: 'kriogeniczne', building: 'Kriomagazyn', cap: 20000, unit: 'u / j.', base: 1, per1000: 0.15, loss: '2%/h odparowania; Nadprzewodnik traci 1%/h', ex: ['PAL', 'HE3', 'NAD', 'KAP'] },
  { cls: 'radioaktywne', building: 'Bunkier osłonowy', cap: 500, unit: 'j.', base: 1, per1000: 2, loss: 'brak; poza bunkrem składowanie zabronione', ex: ['URA', 'PRE'] },
  { cls: 'egzotyczne', building: 'Pułapka magnetyczna', cap: 10, unit: 'j.', base: 2, per1000: 5000, loss: 'Antymateria: anihilacja zawartości i zniszczenie budynku; Kwantyt: rozpad 1%/h', ex: ['ANT', 'KWA'] },
];
H('GEN: składowanie');
out.push('| Klasa | Budynek (L1) | Pojemność L1 | Moc bazowa | Moc na 1000 j. zapełnienia | Pełny magazyn L1 | Parytet składowania* | Straty bez zasilania |');
out.push('|---|---|---|---|---|---|---|---|');
for (const s of STORES) {
  const full = s.base + (s.per1000 * s.cap) / 1000;
  const par = s.ex.map((id) => {
    if (s.per1000 === 0) return `${nm(id)}: ∞`;
    const perUnitHour = (s.per1000 / 1000) * 60; // MW·min per unit per hour
    return `${nm(id)}: ${fmtT((VAL.get(id)!.E / perUnitHour) * 60)}`;
  }).join('; ');
  out.push(`| ${s.cls} | ${s.building} | ${s.cap.toLocaleString('pl-PL')} ${s.unit} | ${fq(s.base)} MW | ${fq(s.per1000)} MW | ${f(full, 1)} MW | ${par} | ${s.loss} |`);
}

// ---------- buildings ----------
type Era = 0 | 1 | 2 | 3 | 4;
interface B { id: string; name: string; cat: string; era: Era; fp: string; maxL: number; c1: Q; ex: Record<number, Q>; p1: number; pg?: number; crew: number; t1: number; rec?: string; explicit?: Q[]; explicitT?: number[] }
const BUILD: B[] = [
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
const VEH: B[] = [
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

// ---------- era multipliers from payback targets ----------
const ERA_NAMES = ['E0 Lądowanie', 'E1 Kolonia', 'E2 Industrializacja', 'E3 Orbita i asteroidy', 'E4 Układ zewnętrzny'];
const PAYBACK_TARGET_MIN = [8, 30, 120, 240, 480];
function baseCost(b: B, L: number): Q {
  if (b.explicit) return { ...b.explicit[L - 1] };
  const q: Q = {};
  addQ(q, b.c1, Math.pow(2, L - 1));
  for (let k = 2; k <= L; k++) if (b.ex[k]) addQ(q, b.ex[k], Math.pow(2, L - k));
  return q;
}
function grossOut(b: B): number { // kr per minute at L1 (gross output value), minus fuel for reactors
  if (b.p1 > 0 && !b.rec) {
    let fuel = 0;
    if (b.id === 'FIS') fuel = VAL.get('PRE')!.V / 120;
    if (b.id === 'FUS') fuel = VAL.get('KAP')!.V / 300;
    const ins = b.id === 'SAT' ? 0.8 : 1; // beaming loss
    return b.p1 * ins * C_E - fuel;
  }
  if (!b.rec) return 0;
  const r = RECIPES.find((x) => x.id === b.rec)!;
  return Object.entries(r.out).reduce((s, [id, q]) => s + q * VAL.get(id)!.V, 0) / r.time;
}
const nice = (x: number) => { const steps = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]; return steps.reduce((a, s) => (Math.abs(Math.log(s / x)) < Math.abs(Math.log(a / x)) ? s : a), 1); };
const K: number[] = [];
for (let e = 0; e <= 4; e++) {
  const pb = BUILD.filter((b) => b.era === e && !b.explicit && grossOut(b) > 0).map((b) => kr(baseCost(b, 1)) / grossOut(b)).sort((a, b) => a - b);
  const med = pb[Math.floor(pb.length / 2)];
  K[e] = e === 0 ? 1 : nice(PAYBACK_TARGET_MIN[e] / med);
}
const cost = (b: B, L: number): Q => { const q = baseCost(b, L); const k = b.explicit ? 1 : K[b.era]; for (const id of Object.keys(q)) q[id] = Math.round(q[id] * k); return q; };
const btime = (b: B, L: number) => (b.explicitT ? b.explicitT[L - 1] : b.t1 * Math.pow(1.8, L - 1));
const powerL = (b: B, L: number) => (b.p1 > 0 ? b.p1 * Math.pow(b.pg ?? 1.6, L - 1) : b.p1 * Math.pow(1.45, L - 1));

H('GEN: mnożniki ery');
out.push('| Era | Docelowy czas zwrotu budynku produkcyjnego L1 | Mediana bez mnożnika | Mnożnik kosztu k |');
out.push('|---|---|---|---|');
for (let e = 0; e <= 4; e++) {
  const pb = BUILD.filter((b) => b.era === e && !b.explicit && grossOut(b) > 0).map((b) => kr(baseCost(b, 1)) / grossOut(b)).sort((a, b) => a - b);
  out.push(`| ${ERA_NAMES[e]} | ${fmtT(PAYBACK_TARGET_MIN[e])} | ${fmtT(pb[Math.floor(pb.length / 2)])} | ×${fq(K[e])} |`);
}
H('GEN: czas zwrotu');
out.push('| Budynek | Era | Wartość produkcji L1 [kr/min] | Koszt L1 [kr] | Zwrot L1 | Przyrost produkcji L4→L5 [kr/min] | Koszt L5 [kr] | Zwrot rozbudowy do L5 |');
out.push('|---|---|---|---|---|---|---|---|');
for (const b of BUILD.filter((b) => grossOut(b) > 0 && !b.explicit)) {
  const g = grossOut(b), c1 = kr(cost(b, 1));
  const gr = b.p1 > 0 ? (b.pg ?? 1.6) : 1.6;
  const Lm = b.maxL;
  const inc = g * (Math.pow(gr, Lm - 1) - Math.pow(gr, Lm - 2));
  const cL = kr(cost(b, Lm));
  out.push(`| ${b.name} | E${b.era} | ${f(g)} | ${f(c1)} | ${fmtT(c1 / g)} | ${f(inc)} (L${Lm - 1}→L${Lm}) | ${f(cL)} (L${Lm}) | ${fmtT(cL / inc)} |`);
}

const table = (list: B[], title: string) => {
  H(`GEN: ${title} — koszty poziomów`);
  out.push('| Nazwa | Era (k) | L1 | L2 | L3 | L4 | L5 |');
  out.push('|---|---|---|---|---|---|---|');
  for (const b of list) {
    const cells: string[] = [];
    for (let L = 1; L <= 5; L++) cells.push(L <= b.maxL ? (b.explicit && L === 1 ? 'na starcie' : qstr(cost(b, L))) : '—');
    out.push(`| ${b.name} | E${b.era} (×${b.explicit ? '—' : fq(K[b.era])}) | ${cells.join(' | ')} |`);
  }
  H(`GEN: ${title} — wartość, czas, moc`);
  out.push('| Nazwa | Kafelki | Wartość poziomu L1 → Lmax [kr] | Czas budowy L1 → Lmax | Moc L1 → Lmax [MW] | Załoga L1 |');
  out.push('|---|---|---|---|---|---|');
  for (const b of list) {
    const v: string[] = [], t: string[] = [], p: string[] = [];
    for (let L = 1; L <= b.maxL; L++) { v.push(b.explicit && L === 1 ? '—' : f(kr(cost(b, L)), 0)); t.push(b.explicitT && L === 1 ? '—' : fmtT(btime(b, L))); const pw = powerL(b, L); p.push((pw > 0 ? '+' : '') + f(pw, 1)); }
    out.push(`| ${b.name} | ${b.fp} | ${v.join(' → ')} | ${t.join(' → ')} | ${p.join(' → ')} | ${b.crew < 0 ? `zapewnia ${-b.crew}` : b.crew} |`);
  }
};
table(BUILD, 'budynki');
table(VEH, 'pojazdy');

// ---------- milestones vs reference colony ----------
const REF_P = [10, 40, 150, 500, 1500, 3000];
const SHARE = 0.6;
const ratePerH = (e: number) => SHARE * REF_P[e] * 60 * RHO;
const SHIP: Record<string, Q> = {
  'Kadłub': { BEL: 1600, STP: 1200, KOM: 800 },
  'Osłona radiacyjna': { MET: 480, BET: 3200 },
  'Habitat hibernacyjny': { UKL: 600, POL: 1200, ZYW: 3000 },
  'Napęd fuzyjny Mk I (5 ly)': { NAD: 600, STP: 800, SLN: 400, UKL: 240 },
  'Komputer nawigacyjny': { PRO: 60, UKL: 400 },
};
const UPG: Record<string, Q> = {
  'Napęd Mk II (9 ly)': { NAD: 400, STP: 400 },
  'Napęd Mk III (12,5 ly)': { NAD: 400, PRO: 24 },
  'Napęd Mk IV — antymateria (17 ly)': { ANT: 60, NAD: 400, PRO: 24 },
};
const FUEL_PER_LY: Q = { KAP: 40 };
const expand = (q: Q) => { const raw: Q = {}; let E = 0, T = 0, V = 0; for (const [id, n] of Object.entries(q)) { const v = VAL.get(id)!; addQ(raw, v.raw, n); E += n * v.E; T += n * v.T; V += n * v.V; } return { raw, E, T, V }; };
const shipAll: Q = {}; for (const q of Object.values(SHIP)) addQ(shipAll, q, 1);
const dockAll: Q = {}; for (let L = 1; L <= 5; L++) addQ(dockAll, cost(BUILD.find((b) => b.id === 'DOCK')!, L), 1);
H('GEN: kamienie milowe');
out.push(`Kolonia referencyjna: moc ${REF_P.map((p, i) => `E${i} ${p} MW`).join(', ')}; ${SHARE * 100}% mocy na produkcję; ρ = ${f(RHO, 3)} kr/MW·min.`);
out.push('');
out.push('| Kamień milowy | Budowany w erze | Wartość [kr] | Godziny produkcji kolonii referencyjnej | Czas budowy |');
out.push('|---|---|---|---|---|');
const HQ = BUILD.find((b) => b.id === 'HQ')!;
const ms: [string, number, number, number][] = [
  ['HQ L2 (wejście w E1→E2)', 1, kr(cost(HQ, 2)), btime(HQ, 2)],
  ['HQ L3 (wejście w E3)', 2, kr(cost(HQ, 3)), btime(HQ, 3)],
  ['Stacja orbitalna L1', 2, kr(cost(BUILD.find((b) => b.id === 'ORB')!, 1)), btime(BUILD.find((b) => b.id === 'ORB')!, 1)],
  ['HQ L4 (wejście w E4)', 3, kr(cost(HQ, 4)), btime(HQ, 4)],
  ['Fabryka atanorowa L1→L3', 3, [1, 2, 3].reduce((s, L) => s + kr(cost(BUILD.find((b) => b.id === 'ATN')!, L)), 0), [1, 2, 3].reduce((s, L) => s + btime(BUILD.find((b) => b.id === 'ATN')!, L), 0)],
  ['HQ L5 (wejście w E5)', 4, kr(cost(HQ, 5)), btime(HQ, 5)],
  ['Dok gwiezdny L1→L5', 5, kr(dockAll), [1, 2, 3, 4, 5].reduce((s, L) => s + btime(BUILD.find((b) => b.id === 'DOCK')!, L), 0)],
  ['Gwiazdolot — rdzeń', 5, expand(shipAll).V, 0],
  ['Paliwo do Proximy (170 Kapsuł)', 5, 170 * VAL.get('KAP')!.V, 0],
];
for (const [n, e, v, t] of ms) out.push(`| ${n} | E${e} | ${f(v, 0)} | ${f(v / ratePerH(e), 1)} h | ${t ? fmtT(t) : 'wg wydajności Doku'} |`);

H('GEN: gwiazdolot');
out.push('| Moduł | Materiały | Wartość [kr] | Energia wbudowana [MW·h] | Czas wbudowany [maszyno-h] |');
out.push('|---|---|---|---|---|');
for (const [k, q] of Object.entries(SHIP)) { const e = expand(q); out.push(`| ${k} | ${qstr(q)} | ${f(e.V, 0)} | ${f(e.E / 60, 0)} | ${f(e.T / 60, 0)} |`); }
const tot = expand(shipAll);
out.push(`| **Rdzeń razem** | | **${f(tot.V, 0)}** | **${f(tot.E / 60, 0)}** | **${f(tot.T / 60, 0)}** |`);
for (const [k, q] of Object.entries(UPG)) { const e = expand(q); out.push(`| ${k} | ${qstr(q)} | ${f(e.V, 0)} | ${f(e.E / 60, 0)} | ${f(e.T / 60, 0)} |`); }
const fu = expand(FUEL_PER_LY);
out.push(`| Paliwo na 1 ly | ${qstr(FUEL_PER_LY)} | ${f(fu.V, 0)} | ${f(fu.E / 60, 0)} | ${f(fu.T / 60, 0)} |`);
out.push('', '- **Surowce rdzenia rozwinięte do T0** (Platynit i Kwantyt z wypraw są tu ujęte jako zużyte na nie paliwo, czyli Kriol): ' + Object.entries(tot.raw).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nm(id)} ${Math.round(n).toLocaleString('pl-PL')}`).join(', '));
out.push('- **Surowce paliwa na 1 ly:** ' + Object.entries(fu.raw).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nm(id)} ${Math.round(n).toLocaleString('pl-PL')}`).join(', '));
// bottlenecks: atanor-hours & expeditions
const nadNeed = 600, proNeed = 60, kapProx = 170;
const atnMin = (rid: string) => RECIPES.find((r) => r.id === rid)!.time;
out.push(`- Nadprzewodnik do rdzenia: ${nadNeed} × ${fq(atnMin('A_NAD'))} min = ${fmtT(nadNeed * atnMin('A_NAD'))} pracy jednej Fabryki atanorowej (rozwiązanie referencyjne, L1)`);
out.push(`- Procesor kwantowy: ${proNeed} × ${fq(atnMin('A_PRO'))} min = ${fmtT(proNeed * atnMin('A_PRO'))}; Kwantyt ${proNeed} j. = ${Math.ceil(proNeed / 5)} wypraw kometarnych po 5 h`);
out.push(`- Kapsuły do Proximy: ${kapProx} × ${fq(atnMin('A_KAP'))} min = ${fmtT(kapProx * atnMin('A_KAP'))}; Hel-3 ${kapProx * 5} u = ${fmtT((kapProx * 5) / 0.2)} pracy Platformy L1`);

// ---------- transport ----------
H('GEN: transport');
const meanDist = (r1: number, r2: number) => { let s = 0; const n = 3600; for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n; s += Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(t)); } return s / n; };
const routes: [string, number][] = [['Planeta ↔ Księżyc', 160], ['Planeta ↔ Pyros', meanDist(900, 450)], ['Planeta ↔ Pas asteroid', meanDist(900, 1500)], ['Planeta ↔ Gigas/Glacja', meanDist(900, 2600)]];
const ships: [string, number, number][] = [['Astraeus Mk I', 50, 150], ['Frachtowiec Mk I', 400, 110], ['Frachtowiec Mk III', 1600, 130]];
out.push('| Trasa (średni dystans) | Statek | Paliwo w obie strony | Czas w obie strony | Koszt transportu [kr/j.] | Narzut na Stal | Narzut na Nadprzewodnik |');
out.push('|---|---|---|---|---|---|---|');
for (const [rn, d] of routes) for (const [sn, cap, v] of ships) {
  const fuel = 2 * d * 0.02 * 1.5; // loaded trip factor
  const tmin = (2 * d) / v;
  const c = (fuel * VAL.get('PAL')!.V + tmin * C_T_SHIP) / cap;
  out.push(`| ${rn} (${f(d, 0)} j.) | ${sn} | ${f(fuel, 0)} u | ${fmtT(tmin)} | ${f(c, 3)} | ${f((c / VAL.get('STA')!.V) * 100, 1)}% | ${f((c / VAL.get('NAD')!.V) * 100, 2)}% |`);
}

// ---------- chains per hour ----------
function chain(target: string, perHour: number) {
  const need = new Map<string, number>(); const flow = new Map<string, number>();
  const visit = (mat: string, r: number) => {
    flow.set(mat, (flow.get(mat) ?? 0) + r);
    const rec = RECIPES.find((x) => x.primary && x.out[mat] !== undefined)!;
    need.set(rec.id, (need.get(rec.id) ?? 0) + r / (rec.out[mat] / rec.time));
    for (const [id, q] of Object.entries(rec.inp)) visit(id, (q / rec.out[mat]) * r);
  };
  visit(target, perHour / 60);
  H(`GEN: łańcuch ${nm(target)} ${perHour}/h`);
  out.push('| Proces | Budynek | Budynki L1 (dokładnie) | Moc [MW] | Przepływ |');
  out.push('|---|---|---|---|---|');
  let tot = 0;
  for (const [rid, n] of need) {
    const rec = RECIPES.find((x) => x.id === rid)!; const p = n * rec.power; tot += p;
    const mat = Object.keys(rec.out).find((k) => flow.has(k))!;
    out.push(`| ${rid} | ${rec.building} | ${f(n, 2)} | ${f(p, 1)} | ${nm(mat)} ${f(flow.get(mat)! * 60, 0)}/h (${f(flow.get(mat)!, 2)}/min) |`);
  }
  out.push(`| **Razem** | | | **${f(tot, 1)}** | |`);
}
chain('STA', 600);
chain('PAL', 3000);
chain('NAD', 20);

// ---------- stars ----------
H('GEN: gwiazdy');
const bands = [[5, 'Mk I'], [9, 'Mk II'], [12.5, 'Mk III'], [17, 'Mk IV']] as const;
out.push('| Gwiazda | Dystans [ly] | Klasa | Jasność [L☉] | Znane planety | Wymagany napęd | Kapsuły fuzyjne | Mnożnik paneli |');
out.push('|---|---|---|---|---|---|---|---|');
for (const s of STAR_DATA.filter((s) => s.distance > 0 && s.distance <= 17).sort((a, b) => a.distance - b.distance)) {
  const band = bands.find(([d]) => s.distance <= d)![1];
  out.push(`| ${s.name} | ${String(s.distance).replace('.', ',')} | ${s.spectralClass} | ${String(s.luminosity).replace('.', ',')} | ${s.planets ?? '—'} | ${band} | ${Math.ceil(s.distance * FUEL_PER_LY.KAP)} | ×${f(Math.min(8, Math.max(0.05, s.luminosity)), 2)} |`);
}

H('GEN: nasłonecznienie');
for (const [n, r] of [['Pyros', 450], ['Planeta Matka i Księżyc', 900], ['Pas asteroid', 1500], ['Gigas i Glacja', 2600]] as const) out.push(`- ${n} (orbita ${r}): ×${f(Math.pow(900 / r, 2), 2)} → Panel L1 ${f(5 * Math.pow(900 / r, 2), 1)} MW, L5 ${f(5 * Math.pow(1.7, 4) * Math.pow(900 / r, 2), 1)} MW`);

writeFileSync(process.argv[2], out.join('\n'), 'utf8');
console.log('ok', out.length, 'K=', K.join(','), 'rho=', RHO.toFixed(4));
