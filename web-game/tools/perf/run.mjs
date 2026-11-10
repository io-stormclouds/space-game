// F5: performance runs of the load scenarios S, M, L (and T4's teren-M) against the production build, in Chromium.
// Writes tools/perf/results/latest.json, a Chromium trace of scenario M, and docs/PERF-REPORT.md.
// Usage (from web-game/): npm run perf            (builds first)
//                         node tools/perf/run.mjs  (uses the existing dist/)
// Environment: PERF_PORT (static server, default 4435), PLAYWRIGHT_CHROME (Chromium executable; without it
// Playwright's own build, else the newest one in %LOCALAPPDATA%/ms-playwright), PERF_SAMPLE_MS / PERF_WARMUP_MS,
// PERF_BASELINE (results file to compare with; default results/baseline-T4.json when present), PERF_NOTE (a line
// for the report, e.g. that the run was taken under CPU load), PERF_ONLY (comma-separated scenario ids, a quick
// partial run), PERF_DETAIL=full (the "before" of T4 and T4b: the app opened with `?detail=full`, no hemisphere
// culling, no decor LOD and no structure/unit proxies; writes results/baseline-T4.json, or PERF_OUT, and leaves
// latest.json, the trace and the report alone), PERF_REPORT_ONLY=1 (no run: the report again from latest.json and
// the baseline).
// T4/T4b before/after: PERF_DETAIL=full node tools/perf/run.mjs, then node tools/perf/run.mjs (the same dist/).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, homedir, totalmem, platform, release } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { serve } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const dist = join(root, 'dist/game/browser');
const results = join(here, 'results');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('@playwright/test');

// 4430 is taken by other apps on the dev machine: check the port is free before a run
const PORT = Number(process.env.PERF_PORT ?? 4435);
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS ?? 5000);
const WARMUP_MS = Number(process.env.PERF_WARMUP_MS ?? 2500);
const FULL_DETAIL = process.env.PERF_DETAIL === 'full';
const ONLY = process.env.PERF_ONLY ? new Set(process.env.PERF_ONLY.split(',')) : null;
const ALL_SCENARIOS = [
  { id: 'S', preset: 'obciazenie-s', views: ['planet', 'system', 'galaxy'] },
  { id: 'M', preset: 'obciazenie-m', views: ['planet', 'system', 'galaxy'] },
  { id: 'L', preset: 'obciazenie-l', views: ['planet', 'system', 'galaxy'] },
  // T4: M with the colony beside the ruins of Tau Ceti c (terrain, decor, medieval structures in focus);
  // planet-far zooms out into the decor LOD band (between the terrain and the near threshold)
  { id: 'teren-M', preset: 'teren-m', views: ['planet', 'planet-far', 'system'] },
  { id: 'Atanor', preset: 'kolonia', views: ['atanor'] },
];
const SCENARIOS = ONLY ? ALL_SCENARIOS.filter((s) => ONLY.has(s.id)) : ALL_SCENARIOS;
const KEYS = { planet: '1', system: '2', galaxy: '3' };
/**
 * Wheel steps out from the default planet distance (3.4 R, ≈ 284 px apparent radius at 900 px): deltaY 100 each,
 * OrbitControls dolly ×1/0.95^1.2 per step, so 11 steps give ≈ 6.7 R ≈ 144 px, the middle of the decor LOD band
 * (80–200 px, `DECOR_LOD_PX` in system-scene.ts).
 */
const FAR_WHEEL_STEPS = 11;

/** PLAYWRIGHT_CHROME, else Playwright's own Chromium, else the newest build in the ms-playwright cache. */
async function launchChromium(args) {
  if (process.env.PLAYWRIGHT_CHROME) return chromium.launch({ args, executablePath: process.env.PLAYWRIGHT_CHROME });
  try {
    return await chromium.launch({ args });
  } catch (e) {
    const cache = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'), 'ms-playwright');
    const found = existsSync(cache)
      ? readdirSync(cache)
          .filter((d) => /^chromium-\d+$/.test(d))
          .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
          .map((d) => join(cache, d, 'chrome-win64', 'chrome.exe'))
          .find((f) => existsSync(f))
      : undefined;
    if (!found) throw e;
    console.warn(`Playwright's Chromium is missing; using ${found} (set PLAYWRIGHT_CHROME to choose)`);
    return chromium.launch({ args, executablePath: found });
  }
}

/** The Atanor has no view key (A16): the sandbox opens from the designer panel (F2). */
async function openView(page, view) {
  if (view === 'planet-far') {
    await page.keyboard.press(KEYS.planet);
    const box = await page.locator('.render-host__canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < FAR_WHEEL_STEPS; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(40);
    }
    return;
  }
  if (view !== 'atanor') return page.keyboard.press(KEYS[view]);
  await page.keyboard.press('F2');
  await page.click('wg-designer-panel [data-tab="atanor"]');
  await page.click('wg-designer-panel [data-action="open-atanor"]');
  await page.keyboard.press('F2');
}

// Budgets: init.md (download, draw calls, triangles) and W18 B (FPS: 60 in S, 30 in M; L measured only).
const BUDGETS = {
  downloadMB: { warn: 15, fail: 25, source: 'init.md' },
  drawCalls: { warn: 100, fail: 150, source: 'init.md' },
  triangles: { warn: 200_000, fail: 400_000, source: 'init.md' },
  fps: { S: 58, M: 30, 'teren-M': 30, source: 'W18 B (60 w S, 30 w M; 58 = tolerancja vsync)' },
  // T4: shares of the 200k "uwaga" line for a planet in focus (reported, not a gate: the totals above are)
  detail: { terrain: 50_000, decor: 60_000, structures: 90_000, source: 'T4 (§10 planu terenu): suma = próg uwagi 200 tys.' },
};

function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** Download size of the build: code (js/css/html/fonts) and 3D assets, raw and gzip, initial vs total. */
function downloadSize() {
  const files = listFiles(dist).filter((f) => !f.endsWith('stats.json') && !f.endsWith('3rdpartylicenses.txt'));
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const initial = new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]));
  const sum = (list) => list.reduce((s, f) => ({ raw: s.raw + statSync(f).size, gzip: s.gzip + gzipSync(readFileSync(f)).length }), { raw: 0, gzip: 0 });
  const code = files.filter((f) => /\.(js|css|html|woff2?)$/.test(f));
  const assets = files.filter((f) => /assets[\\/]kaykit/.test(f));
  const fontsUsed = code.filter((f) => /jetbrains-mono-latin(-ext)?-(400|500|700)-normal-[A-Z0-9]+\.woff2$/.test(f));
  return {
    initial: sum(code.filter((f) => initial.has(relative(dist, f).replaceAll('\\', '/')))),
    code: sum(code.filter((f) => !/\.woff2?$/.test(f))),
    fontsLoaded: sum(fontsUsed),
    assets: sum(assets),
    total: sum(files),
    files: files.length,
  };
}

async function sampleFrames(page, ms) {
  return page.evaluate(async (ms) => {
    const deltas = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const end = last + ms;
      const tick = (now) => {
        deltas.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    deltas.shift();
    const sorted = [...deltas].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
    return { frames: deltas.length, fps: 1000 / mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: sorted[sorted.length - 1] };
  }, ms);
}

const overlay = (page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-perf]')].map((e) => [e.getAttribute('data-perf'), e.textContent.trim()])));
/** "31 216" → 31216, "0,2 ms" → 0.2, "13 / 0" → 13 (first number). */
const num = (s) => parseFloat(String(s ?? '0').split('/')[0].replace(/\s/g, '').replace(',', '.')) || 0;

/** What to do when a metric is over its budget, by view (proposals for the backlog; T4 culling, decor LOD and T4b proxies are in). */
const REMEDY = {
  triangles: {
    planet:
      'zostają pełne modele na ciele w fokusie (budowle w widocznej czaszy, statki zadokowane przy nim, łaziki na nim): pośredni LOD budowli w fokusie albo lżejsze modele (medieval 1,6–2,3 tys. trójkątów na część, łazik 1118, statek 914); odcinanie półkuli, LOD dekoru i bryły zastępcze daleko już są (T4, T4b)',
    system: 'jednostki są już bryłami zastępczymi (T4b), budowle się nie rysują: reszta to sfery i orbity',
    galaxy: 'zmniejszyć liczbę punktów albo rozmiar sprite’ów',
  },
  drawCalls: {
    planet: 'BatchedMesh budowli na ciało (dziś jedna InstancedMesh na parę ciało × model); T4: poniżej limitu 150, odłożony',
    system: 'scalić nakładki orbit i etykiet',
    galaxy: 'scalić warstwy pierścieni i znaczników',
  },
  fps: { planet: 'profil śladu Chromium; najpierw trójkąty i draw calls', system: 'jw.', galaxy: 'jw.' },
};

async function main() {
  if (process.env.PERF_REPORT_ONLY) {
    // the report again from latest.json (a PERF_NOTE given now is stored with it)
    const latest = JSON.parse(readFileSync(join(results, 'latest.json'), 'utf8'));
    if (process.env.PERF_NOTE) {
      latest.note = process.env.PERF_NOTE;
      writeFileSync(join(results, 'latest.json'), JSON.stringify(latest, null, 2));
    }
    return writeReport(latest);
  }
  mkdirSync(results, { recursive: true });
  const server = await serve(dist, PORT);
  const browser = await launchChromium(['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-precise-memory-info']);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`http://localhost:${PORT}/`);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? 'brak WebGL';
  });
  const machine = { cpu: cpus()[0]?.model.trim(), cores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()}`, browser: `Chromium ${browser.version()}`, gpu, viewport: '1440×900' };

  const runs = [];
  for (const sc of SCENARIOS) {
    // a fresh document: a hash change alone keeps the game screen (and its "ready" mark) alive
    await page.goto('about:blank');
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/${FULL_DETAIL ? '?detail=full' : ''}#/scenariusz-${sc.preset}`);
    await page.waitForSelector('.game[data-ready="true"]', { timeout: 120_000 });
    const startMs = Date.now() - t0;
    for (const view of sc.views) {
      await openView(page, view);
      await page.waitForTimeout(WARMUP_MS);
      const tracing = sc.id === 'M' && view === 'system' && !FULL_DETAIL;
      if (tracing) await browser.startTracing(page, { path: join(results, 'trace-M-system.json'), screenshots: false });
      const frames = await sampleFrames(page, SAMPLE_MS);
      if (tracing) await browser.stopTracing();
      await page.waitForTimeout(300);
      const o = await overlay(page);
      const heapMB = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 2 ** 20 : null));
      const step = (o.step ?? '0 / 0').split('/').map((x) => num(x));
      runs.push({
        scenario: sc.id,
        view,
        startMs,
        ...frames,
        drawCalls: num(o.calls),
        triangles: num(o.triangles),
        geometries: num(o.gpu),
        textures: Number(String(o.gpu ?? '0 / 0').split('/')[1] ?? 0),
        contexts: num(o.contexts),
        stepMeanMs: step[0],
        stepMaxMs: step[1] ?? step[0],
        heapMB: heapMB === null ? null : Math.round(heapMB * 10) / 10,
        // T4 counters (planet/system view only)
        terrainTriangles: o.terrain === undefined ? null : num(o.terrain),
        decorTriangles: o.decor === undefined ? null : num(o.decor),
        structureTriangles: o.structures === undefined ? null : num(o.structures),
        // T4b: ships and rovers (full models or proxies)
        unitTriangles: o.units === undefined ? null : num(o.units),
        instances: o.instances === undefined ? null : num(o.instances),
      });
      const detail = o.terrain === undefined ? '' : ` (terrain ${o.terrain}, decor ${o.decor}, structures ${o.structures}, units ${o.units}, instances ${o.instances})`;
      console.log(sc.id, view, `fps ${frames.fps.toFixed(1)} p50 ${frames.p50.toFixed(1)} p95 ${frames.p95.toFixed(1)} ms, calls ${o.calls}, tris ${o.triangles}${detail}, step ${o.step}`);
    }
  }
  await browser.close();
  server.close();

  const download = downloadSize();
  const note = process.env.PERF_NOTE ?? (FULL_DETAIL ? 'pomiar bazowy T4/T4b: `?detail=full`, bez odcinania półkuli, LOD dekoru i brył zastępczych' : null);
  const data = { date: new Date().toISOString(), machine, sampleMs: SAMPLE_MS, warmupMs: WARMUP_MS, detail: FULL_DETAIL ? 'full' : 'culled', note, runs, download, errors, budgets: BUDGETS };
  if (FULL_DETAIL) {
    const out = process.env.PERF_OUT ?? join(results, 'baseline-T4.json');
    writeFileSync(out, JSON.stringify(data, null, 2));
    console.log(`baseline: ${relative(root, out)} (${runs.length} runs, ${errors.length} errors); report and latest.json untouched`);
    return;
  }
  writeFileSync(join(results, 'latest.json'), JSON.stringify(data, null, 2));
  writeReport(data);
}

/** docs/PERF-REPORT.md from a results file, against the T4 baseline when there is one (PERF_REPORT_ONLY: no run). */
function writeReport(data) {
  const baselineFile = process.env.PERF_BASELINE ?? join(results, 'baseline-T4.json');
  const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : null;
  writeFileSync(join(root, 'docs/PERF-REPORT.md'), report(data, baseline));
  console.log(`report: docs/PERF-REPORT.md (${data.runs.length} runs, ${data.errors.length} errors)`);
}

const MB = (b) => b / 2 ** 20;
const f1 = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toLocaleString('pl-PL'));
const int = (n) => Math.round(n).toLocaleString('pl-PL');

function verdict(value, { warn, fail }, higherIsBetter = false) {
  if (higherIsBetter) return value >= warn ? 'OK' : 'PRZEKROCZONY';
  return value > fail ? 'PRZEKROCZONY' : value > warn ? 'UWAGA' : 'OK';
}

const key = (r) => `${r.scenario}·${r.view}`;
const cnt = (n) => (n === null || n === undefined ? '—' : int(n));
/** "a → b (−x %)" for a before/after cell; plain value without a baseline. */
function delta(before, after, fmt = int) {
  if (after === null || after === undefined) return '—';
  if (before === null || before === undefined) return fmt(after);
  const pct = before ? Math.round(((after - before) / before) * 100) : 0;
  return `${fmt(before)} → **${fmt(after)}**${before ? ` (${pct > 0 ? '+' : ''}${pct} %)` : ''}`;
}

/** T4: what the planet detail put into the frame, by category, against the shares of the 200k line. */
function detailTable(d) {
  const b = d.budgets.detail;
  const rows = d.runs.filter((r) => r.terrainTriangles !== null && r.terrainTriangles !== undefined && r.view !== 'galaxy');
  if (!rows.length) return [];
  const mark = (v, limit) => (v > limit ? `${int(v)} (UWAGA)` : int(v));
  return [
    '',
    '## Szczegół planety: trójkąty po kategoriach (T4, T4b)',
    '',
    `Liczniki z nakładki \`[data-perf]\` (\`terrain\`, \`decor\`, \`structures\`, \`units\`, \`instances\`): co teren z kafelków, dekor (drzewa, skały, ruiny), budowle graczy (ze skałami złóż; z daleka pudełka zastępcze) i jednostki (statki, łaziki; z daleka bryły zastępcze) włożyły do klatki. Udziały w progu uwagi (teren ≤ ${int(b.terrain)}, dekor ≤ ${int(b.decor)}, budowle ≤ ${int(b.structures)}) to wskazówka, nie bramka: bramką są sumy wyżej.`,
    '',
    '| Scenariusz | Widok | Teren | Dekor | Budowle | Jednostki | Instancje | Pozostałe (sfery, orbity, nakładki) |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const rest = r.triangles - r.terrainTriangles - r.decorTriangles - r.structureTriangles - (r.unitTriangles ?? 0);
      return `| ${r.scenario} | ${r.view} | ${mark(r.terrainTriangles, b.terrain)} | ${mark(r.decorTriangles, b.decor)} | ${mark(r.structureTriangles, b.structures)} | ${cnt(r.unitTriangles)} | ${cnt(r.instances)} | ${int(Math.max(0, rest))} |`;
    }),
  ];
}

/** Before/after T4 (or any baseline run): draw calls, triangles, frame times, categories. */
function compareTable(d, base) {
  if (!base) return [];
  const before = new Map(base.runs.map((r) => [key(r), r]));
  const rows = d.runs.filter((r) => r.view !== 'atanor' && r.view !== 'galaxy');
  return [
    '',
    '## Przed / po T4 i T4b',
    '',
    `Bazowy pomiar: ${base.date.slice(0, 16).replace('T', ' ')} (\`${process.env.PERF_BASELINE ? relative(root, process.env.PERF_BASELINE).replaceAll('\\', '/') : 'tools/perf/results/baseline-T4.json'}\`, ${base.detail === 'full' ? 'ten sam build otwarty z `?detail=full`: bez odcinania półkuli, LOD dekoru i brył zastępczych budowli i jednostek' : 'build sprzed zmian T4'})${base.note && base.detail !== 'full' ? `; ${base.note}` : ''}${base.machine?.gpu && base.machine.gpu !== d.machine.gpu ? `; **inny GPU**: ${base.machine.gpu}` : ''}. Po: ten przebieg. Komórki: przed → **po** (zmiana).`,
    '',
    '| Scenariusz | Widok | Draw calls | Trójkąty | Klatka p50 / p95 [ms] | Teren | Dekor | Budowle | Jednostki | Instancje |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const p = before.get(key(r));
      const frames = p ? `${f1(p.p50)} / ${f1(p.p95)} → **${f1(r.p50)} / ${f1(r.p95)}**` : `${f1(r.p50)} / ${f1(r.p95)}`;
      return `| ${r.scenario} | ${r.view} | ${delta(p?.drawCalls, r.drawCalls)} | ${delta(p?.triangles, r.triangles)} | ${frames} | ${delta(p?.terrainTriangles, r.terrainTriangles)} | ${delta(p?.decorTriangles, r.decorTriangles)} | ${delta(p?.structureTriangles, r.structureTriangles)} | ${delta(p?.unitTriangles, r.unitTriangles)} | ${delta(p?.instances, r.instances)} |`;
    }),
    ...t4Notes(d, before),
  ];
}

/**
 * T4 and T4b decisions, from this run's numbers and the baseline (render/src/system/hemisphere-culler.ts,
 * terrain-decor.ts, structure-layer.ts, units-layer.ts).
 */
function t4Notes(d, before) {
  const planet = d.runs.filter((r) => r.view.startsWith('planet'));
  if (!planet.length) return [];
  const system = d.runs.filter((r) => r.view === 'system');
  const warn = d.budgets.triangles.warn;
  /** Range of the drop of a category over some runs [%]. */
  const dropOf = (runs, field) => {
    const p = runs.map((r) => [before.get(key(r))?.[field], r[field]]).filter(([b, a]) => b > 0 && a !== null && a !== undefined);
    if (!p.length) return '—';
    const v = p.map(([b, a]) => Math.round((1 - a / b) * 100));
    return Math.min(...v) === Math.max(...v) ? `${v[0]} %` : `${Math.min(...v)}–${Math.max(...v)} %`;
  };
  const over = d.runs.filter((r) => r.triangles > warn && r.terrainTriangles !== null && r.terrainTriangles !== undefined);
  const biggest = (r) =>
    [
      ['budowle', r.structureTriangles],
      ['jednostki', r.unitTriangles ?? 0],
      ['dekor', r.decorTriangles],
      ['teren', r.terrainTriangles],
    ].sort((a, b) => b[1] - a[1]);
  const maxBy = (f) => planet.reduce((a, r) => (f(r) > f(a) ? r : a));
  const calls = maxBy((r) => r.drawCalls);
  const terrain = maxBy((r) => r.terrainTriangles ?? 0);
  const fail = d.budgets.drawCalls.fail;
  /** Range of the drop of a category over the planet views [%], e.g. "16–24 %". */
  const drop = (field) => {
    const p = planet.map((r) => [before.get(key(r))?.[field], r[field]]).filter(([b, a]) => b > 0 && a !== null && a !== undefined);
    if (!p.length) return '—';
    const v = p.map(([b, a]) => Math.round((1 - a / b) * 100));
    return `${Math.min(...v)}–${Math.max(...v)} %`;
  };
  return [
    '',
    'Co zrobiono i co z tego wynika:',
    '',
    `- **Odcinanie półkuli** (\`HemisphereCuller\`, \`CulledInstances\`): budowle, skały złóż i dekor rysują tylko instancje, które mogą wystawać nad horyzont (test zachowawczy: wierzchołki pudełka modelu, \`acos(R/d) + acos(R/r_szczytu)\` i zapas 3° na ruch kamery między przeliczeniami co 2° obrotu lub 1° zoomu). Wysokie modele na małych ciałach z dużymi kafelkami widać daleko za horyzontem (dom medieval na Tau Ceti c ma ok. 10 % R wysokości, więc wystaje zza horyzontu jeszcze ok. 25° dalej), dlatego w widokach planety ubywa ${drop('decorTriangles')} trójkątów dekoru (tylko T4), nie połowa.`,
    '- **LOD dekoru** w paśmie 80–200 px promienia (wejście < 200 px, wyjście > 220 px): wszystkie drzewa jako `detail_treeA`, połowa według `hash3`, jedna instancja zamiast trzech modeli; ruiny, skały i góry bez zmian (rysowane tylko z widocznej czaszy). Na Tau Ceti c dekor to głównie ruiny, więc pasmo ujmuje niewiele ponad samo odcinanie (`planet-far`).',
    `- **Bryły zastępcze budowli (T4b)**: ciało poniżej 80 px promienia (powrót powyżej 88 px; tam teren przechodzi w siatkę wachlarzy) rysuje każdą część budowli i skałę złoża jako pudełko 12 trójkątów (\`kit.proxyBox\` pod macierzą części razy \`boxMatrix(kit.box(model))\`, to samo pudełko co picking; wzrost budowy skaluje je w Y), w średnim kolorze wierzchołków modelu (\`kit.tone\`), wszystko w jednej InstancedMesh na ciało z odcinaniem półkuli. W widokach planety trójkątów budowli ubywa razem ${drop('structureTriangles')} (T4 + T4b), draw calli ${dropOf(planet, 'drawCalls')}.`,
    `- **Bryły zastępcze jednostek (T4b)**: statek krótszy niż 8 px na ekranie (powrót od 10 px) albo zadokowany przy dalekim ciele to grot 8 trójkątów, łazik krótszy niż 8 px albo na dalekim ciele to pudełko 12 trójkątów (oba w pudełku modelu i jego średnim kolorze); jednostka poza kadrem (sfera o promieniu jej długości poza ostrosłupem widzenia) i łazik za horyzontem swojego ciała nie są rysowane. Picking jednostek bez zmian (po pozycji na ekranie). Trójkątów jednostek ubywa ${dropOf(planet, 'unitTriangles')} w widokach planety i ${dropOf(system, 'unitTriangles')} w widoku układu.`,
    '- **Przełącznik A/B**: `?detail=full` (`cullDetail: false`, `PERF_DETAIL=full`) wyłącza T4 i T4b razem; to kolumna „przed”.',
    `- **BatchedMesh budowli**: niepotrzebny do limitu, największa liczba draw calli w widoku planety to ${calls.drawCalls} (${calls.scenario} · ${calls.view}), limit ${fail}${calls.drawCalls > fail ? ' — **PRZEKROCZONY, do zrobienia**' : '; przy uwadze (> 100) zostaje w zadaniach'}.`,
    `- **Siatka terenu**: tylko pomiar, najwięcej ${int(terrain.terrainTriangles ?? 0)} trójkątów (${terrain.scenario} · ${terrain.view}) w 1 draw callu na ciało; podział na kawałki z odcinaniem nie jest potrzebny.`,
    over.length
      ? `- **Co zostaje ponad progiem uwagi (${int(warn)})**: ${over.map((r) => `${r.scenario} · ${r.view} ${int(r.triangles)} (${biggest(r).slice(0, 2).map(([n, v]) => `${n} ${int(v)}`).join(', ')})`).join('; ')}. To pełne modele na ciele w fokusie (budowle w widocznej czaszy, statki zadokowane przy nim, łaziki na nim); propozycje w zadaniach naprawczych.`
      : `- **Nic nie przekracza progu uwagi** (${int(warn)} trójkątów) w widokach planety i układu.`,
  ];
}

/** docs/PERF-REPORT.md: one table scenario × metric × budget, plus remediation tasks. */
function report(d, baseline = null) {
  const lines = [];
  const tasks = [];
  const push = (...l) => lines.push(...l);
  push(
    '# Raport wydajności web-game (F5)',
    '',
    `Wygenerowany przez \`tools/perf/run.mjs\` (${d.date.slice(0, 10)}). Surowe dane: \`tools/perf/results/latest.json\`, ślad Chromium scenariusza M w widoku układu: \`tools/perf/results/trace-M-system.json\` (do otwarcia w DevTools → Performance).`,
    '',
    '## Sprzęt (P6: ten komputer)',
    '',
    `| CPU | Rdzenie | RAM | System | Przeglądarka | GPU (WebGL) | Okno |`,
    `|---|---|---|---|---|---|---|`,
    `| ${d.machine.cpu} | ${d.machine.cores} | ${d.machine.memoryGB} GB | ${d.machine.os} | ${d.machine.browser} | ${d.machine.gpu} | ${d.machine.viewport} |`,
    '',
    `Pomiar: build produkcyjny, ${d.warmupMs / 1000} s rozgrzewki i ${d.sampleMs / 1000} s próbkowania klatek na widok, tempo ×60. Scenariusze (\`packages/mock-server/src/load.ts\`): S — świat PoC, 20 budowli, 1 statek, 1 łazik; M — Tau Ceti, 300 budowli, 40 statków w locie, 20 łazików, 12 graczy; L — Tau Ceti, 1400 budowli (83 % kafelków do zabudowy), 200 statków, 100 łazików, 60 graczy; teren-M (T4, \`#/scenariusz-teren-m\`) — świat M i kolonia gracza (port + 23 budowle L1/L3/L5, skórka medieval) obok ruin osady na Tau Ceti c, kamera na kolonii; widok \`planet-far\` to ten sam fokus oddalony o ${FAR_WHEEL_STEPS} kroków kółka (pasmo LOD dekoru).`,
    ...(d.note ? ['', `**Uwaga do pomiaru:** ${d.note}`] : []),
    '',
    '## Wyniki: scenariusz × metryka × budżet',
    '',
    '| Scenariusz | Widok | FPS | Klatka p50 / p95 / p99 [ms] | Draw calls | Trójkąty | Geometrie / tekstury | Konteksty | Krok sym. śr. / maks. [ms] | Sterta JS [MB] | Start [ms] | Ocena |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of d.runs) {
    const checks = [];
    const fpsBudget = d.budgets.fps[r.scenario];
    const b = d.budgets;
    const remedy = (metric) => REMEDY[metric][r.view] ?? REMEDY[metric][r.view.split('-')[0]];
    if (fpsBudget) checks.push(['FPS', r.fps >= fpsBudget ? 'OK' : 'PRZEKROCZONY', `${f1(r.fps)}, budżet ≥ ${fpsBudget}`, remedy('fps')]);
    checks.push(['draw calls', verdict(r.drawCalls, b.drawCalls), `${r.drawCalls}, uwaga od ${b.drawCalls.warn}, limit ${b.drawCalls.fail}`, remedy('drawCalls')]);
    checks.push(['trójkąty', verdict(r.triangles, b.triangles), `${int(r.triangles)}, uwaga od ${int(b.triangles.warn)}, limit ${int(b.triangles.fail)}`, remedy('triangles')]);
    if (r.contexts > 1) checks.push(['konteksty', 'PRZEKROCZONY', `${r.contexts} > 1`, 'sprawdzić RenderHost i PixiJS']);
    const bad = checks.filter((c) => c[1] !== 'OK');
    for (const [metric, v, detail, remedy] of bad) tasks.push(`- [ ] **${r.scenario} · ${r.view} · ${metric}** (${v}: ${detail}) → ${remedy ?? 'do analizy'}`);
    const mark = bad.some((c) => c[1] === 'PRZEKROCZONY') ? 'PRZEKROCZONY' : bad.length ? 'UWAGA' : 'OK';
    push(`| ${r.scenario} | ${r.view} | ${f1(r.fps)} | ${f1(r.p50)} / ${f1(r.p95)} / ${f1(r.p99)} | ${r.drawCalls} | ${int(r.triangles)} | ${r.geometries} / ${r.textures} | ${r.contexts} | ${f1(r.stepMeanMs)} / ${f1(r.stepMaxMs)} | ${f1(r.heapMB)} | ${int(r.startMs)} | ${mark} |`);
  }
  push(...detailTable(d), ...compareTable(d, baseline));
  const dl = d.download;
  const dlMB = MB(dl.code.raw + dl.assets.raw + dl.fontsLoaded.raw);
  const dlVerdict = verdict(dlMB, d.budgets.downloadMB);
  if (dlVerdict !== 'OK') tasks.push(`- [ ] **pobranie** (${dlVerdict}): ${f1(dlMB)} MB > ${d.budgets.downloadMB.warn} MB`);
  push(
    '',
    '## Rozmiar pobrania',
    '',
    '| Część | Bez kompresji | gzip |',
    '|---|---|---|',
    `| Paczka startowa (strona główna, logowanie) | ${f1(MB(dl.initial.raw))} MB | ${f1(MB(dl.initial.gzip))} MB |`,
    `| Cały kod (z leniwymi częściami: gra, Three.js, PixiJS, worker) | ${f1(MB(dl.code.raw))} MB | ${f1(MB(dl.code.gzip))} MB |`,
    `| Fonty pobierane przy polskim tekście (latin + latin-ext, 3 grubości) | ${f1(MB(dl.fontsLoaded.raw))} MB | ${f1(MB(dl.fontsLoaded.gzip))} MB |`,
    `| Modele KayKit | ${f1(MB(dl.assets.raw))} MB | ${f1(MB(dl.assets.gzip))} MB |`,
    `| **Pierwsza sesja razem** (kod + fonty + modele) | **${f1(dlMB)} MB** | ${f1(MB(dl.code.gzip + dl.fontsLoaded.gzip + dl.assets.gzip))} MB |`,
    `| Wszystkie pliki buildu (${dl.files}) | ${f1(MB(dl.total.raw))} MB | ${f1(MB(dl.total.gzip))} MB |`,
    '',
    `Budżet (\`init.md\`): pierwsze pobranie poniżej 15–25 MB → **${dlVerdict}**.`,
    '',
    '## Budżety',
    '',
    '| Metryka | Budżet | Źródło |',
    '|---|---|---|',
    `| Pierwsze pobranie | uwaga > ${d.budgets.downloadMB.warn} MB, przekroczenie > ${d.budgets.downloadMB.fail} MB | ${d.budgets.downloadMB.source} |`,
    `| Draw calls na klatkę | uwaga > ${d.budgets.drawCalls.warn}, przekroczenie > ${d.budgets.drawCalls.fail} | ${d.budgets.drawCalls.source} |`,
    `| Trójkąty na klatkę | uwaga > 200 tys., przekroczenie > 400 tys. | ${d.budgets.triangles.source} |`,
    `| FPS | S ≥ ${d.budgets.fps.S}, M i teren-M ≥ ${d.budgets.fps.M}, L tylko pomiar | ${d.budgets.fps.source} |`,
    ...(d.budgets.detail ? [`| Trójkąty po kategoriach (planeta w fokusie) | teren ≤ ${int(d.budgets.detail.terrain)}, dekor ≤ ${int(d.budgets.detail.decor)}, budowle ≤ ${int(d.budgets.detail.structures)}; tylko raport | ${d.budgets.detail.source} |`] : []),
    '| Krok symulacji, pamięć, start | bez budżetu (W18 B ustala tylko FPS); wartości do decyzji | — |',
    '',
    '## Zadania naprawcze',
    '',
    ...(tasks.length ? tasks : ['Brak: żaden budżet nie został przekroczony.']),
    '',
    d.errors.length ? `Błędy konsoli w przebiegu: ${d.errors.length} (zob. latest.json).` : 'Błędy konsoli w przebiegu: brak.',
    '',
  );
  return lines.join('\n');
}

await main();
