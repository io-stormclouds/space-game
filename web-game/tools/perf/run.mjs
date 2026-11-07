// F5: performance runs of the load scenarios S, M, L against the production build, in Chromium.
// Writes tools/perf/results/latest.json, a Chromium trace of scenario M, and docs/PERF-REPORT.md.
// Usage (from web-game/): npm run perf            (builds first)
//                         node tools/perf/run.mjs  (uses the existing dist/)
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, totalmem, platform, release } from 'node:os';
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

const PORT = 4430;
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS ?? 5000);
const WARMUP_MS = Number(process.env.PERF_WARMUP_MS ?? 2500);
const SCENARIOS = [
  { id: 'S', preset: 'obciazenie-s', views: ['planet', 'system', 'galaxy'] },
  { id: 'M', preset: 'obciazenie-m', views: ['planet', 'system', 'galaxy'] },
  { id: 'L', preset: 'obciazenie-l', views: ['planet', 'system', 'galaxy'] },
  { id: 'Atanor', preset: 'kolonia', views: ['atanor'] },
];
const KEYS = { planet: '1', system: '2', galaxy: '3' };

/** The Atanor has no view key (A16): the sandbox opens from the designer panel (F2). */
async function openView(page, view) {
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
  fps: { S: 58, M: 30, source: 'W18 B (60 w S, 30 w M; 58 = tolerancja vsync)' },
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

/** What to do when a metric is over its budget, by view (proposals for the backlog). */
const REMEDY = {
  triangles: {
    planet: 'pomijać budynki z niewidocznej półkuli (dziś InstancedMesh rysuje wszystkie) i dodać LOD modeli KayKit przy oddaleniu',
    system: 'w widoku układu rysować budynki jako uproszczone bryły (LOD) albo tylko na ciałach bliżej kamery',
    galaxy: 'zmniejszyć liczbę punktów albo rozmiar sprite’ów',
  },
  drawCalls: {
    planet: 'scalić rodzaje budynków ciała w jeden BatchedMesh (dziś jedna InstancedMesh na parę ciało × model)',
    system: 'scalić nakładki orbit i etykiet',
    galaxy: 'scalić warstwy pierścieni i znaczników',
  },
  fps: { planet: 'profil śladu Chromium; najpierw trójkąty i draw calls', system: 'jw.', galaxy: 'jw.' },
};

async function main() {
  mkdirSync(results, { recursive: true });
  const server = await serve(dist, PORT);
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-precise-memory-info'] });
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
    await page.goto(`http://localhost:${PORT}/#/scenariusz-${sc.preset}`);
    await page.waitForSelector('.game[data-ready="true"]', { timeout: 120_000 });
    const startMs = Date.now() - t0;
    for (const view of sc.views) {
      await openView(page, view);
      await page.waitForTimeout(WARMUP_MS);
      const tracing = sc.id === 'M' && view === 'system';
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
      });
      console.log(sc.id, view, `fps ${frames.fps.toFixed(1)} p95 ${frames.p95.toFixed(1)} ms, calls ${o.calls}, tris ${o.triangles}, step ${o.step}`);
    }
  }
  await browser.close();
  server.close();

  const download = downloadSize();
  const data = { date: new Date().toISOString(), machine, sampleMs: SAMPLE_MS, warmupMs: WARMUP_MS, runs, download, errors, budgets: BUDGETS };
  writeFileSync(join(results, 'latest.json'), JSON.stringify(data, null, 2));
  writeFileSync(join(root, 'docs/PERF-REPORT.md'), report(data));
  console.log(`report: docs/PERF-REPORT.md (${runs.length} runs, ${errors.length} errors)`);
}

const MB = (b) => b / 2 ** 20;
const f1 = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toLocaleString('pl-PL'));
const int = (n) => Math.round(n).toLocaleString('pl-PL');

function verdict(value, { warn, fail }, higherIsBetter = false) {
  if (higherIsBetter) return value >= warn ? 'OK' : 'PRZEKROCZONY';
  return value > fail ? 'PRZEKROCZONY' : value > warn ? 'UWAGA' : 'OK';
}

/** docs/PERF-REPORT.md: one table scenario × metric × budget, plus remediation tasks. */
function report(d) {
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
    `Pomiar: build produkcyjny, ${d.warmupMs / 1000} s rozgrzewki i ${d.sampleMs / 1000} s próbkowania klatek na widok, tempo ×60. Scenariusze (\`packages/mock-server/src/load.ts\`): S — świat PoC, 20 budowli, 1 statek, 1 łazik; M — Tau Ceti, 300 budowli, 40 statków w locie, 20 łazików, 12 graczy; L — Tau Ceti, 1500 budowli (80% kafelków), 200 statków, 100 łazików, 60 graczy.`,
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
    if (fpsBudget) checks.push(['FPS', r.fps >= fpsBudget ? 'OK' : 'PRZEKROCZONY', `${f1(r.fps)}, budżet ≥ ${fpsBudget}`, REMEDY.fps[r.view]]);
    checks.push(['draw calls', verdict(r.drawCalls, b.drawCalls), `${r.drawCalls}, uwaga od ${b.drawCalls.warn}, limit ${b.drawCalls.fail}`, REMEDY.drawCalls[r.view]]);
    checks.push(['trójkąty', verdict(r.triangles, b.triangles), `${int(r.triangles)}, uwaga od ${int(b.triangles.warn)}, limit ${int(b.triangles.fail)}`, REMEDY.triangles[r.view]]);
    if (r.contexts > 1) checks.push(['konteksty', 'PRZEKROCZONY', `${r.contexts} > 1`, 'sprawdzić RenderHost i PixiJS']);
    const bad = checks.filter((c) => c[1] !== 'OK');
    for (const [metric, v, detail, remedy] of bad) tasks.push(`- [ ] **${r.scenario} · ${r.view} · ${metric}** (${v}: ${detail}) → ${remedy ?? 'do analizy'}`);
    const mark = bad.some((c) => c[1] === 'PRZEKROCZONY') ? 'PRZEKROCZONY' : bad.length ? 'UWAGA' : 'OK';
    push(`| ${r.scenario} | ${r.view} | ${f1(r.fps)} | ${f1(r.p50)} / ${f1(r.p95)} / ${f1(r.p99)} | ${r.drawCalls} | ${int(r.triangles)} | ${r.geometries} / ${r.textures} | ${r.contexts} | ${f1(r.stepMeanMs)} / ${f1(r.stepMaxMs)} | ${f1(r.heapMB)} | ${int(r.startMs)} | ${mark} |`);
  }
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
    `| FPS | S ≥ ${d.budgets.fps.S}, M ≥ ${d.budgets.fps.M}, L tylko pomiar | ${d.budgets.fps.source} |`,
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
