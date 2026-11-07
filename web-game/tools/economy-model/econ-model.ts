// Economy model for docs/economy-expansion-design.md: formats every generated table.
// Data and calculations live in packages/domain/src/economy (one source with the game).
// Time unit of the model = 1 minute of real time (PoC runs the same rules ×60 faster).
import { STARS as STAR_DATA } from '../../packages/domain/src/galaxy/stars';
import { writeFileSync } from 'node:fs';
import {
  BUILDINGS,
  ERA_NAMES,
  FUEL_PER_LY,
  MATERIALS,
  STARSHIP_MODULES,
  STARSHIP_UPGRADES,
  STORAGE_CLASSES,
  VEHICLES,
  addQty,
  computeEconomy,
} from '../../packages/domain/src/economy/index';

type Q = Record<string, number>;
const ECO = computeEconomy();
const MATS = MATERIALS;
const RECIPES = ECO.recipes;
const STORES = STORAGE_CLASSES;
const BUILD = BUILDINGS;
const VEH = VEHICLES;
type B = (typeof BUILD)[number];
const M = new Map(MATS.map((m) => [m.id, m]));
const nm = (id: string) => M.get(id)!.name;
const VAL = ECO.values;
const ALT = ECO.alternatives;
const K = ECO.eraK;
const PAYBACK_TARGET_MIN = ECO.params.paybackTargetMin;
const addQ = (a: Q, b: Readonly<Q>, k: number) => addQty(a, b, k);
const baseCost = ECO.baseCost;
const cost = ECO.cost;
const btime = ECO.buildTime;
const powerL = ECO.power;
const grossOut = ECO.grossOut;
const SHIP = STARSHIP_MODULES;
const UPG = STARSHIP_UPGRADES;
const C_T_SHIP = ECO.params.shipMinute;

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
