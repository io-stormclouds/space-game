#!/usr/bin/env node
// Jedna bramka jakosci projektu: zielona (exit 0) albo czerwona (exit 1).
//
//   node tools/gate.mjs                 # fast: typy + testy jednostkowe + rust fmt/clippy/test (tylko dla zmienionych obszarow)
//   node tools/gate.mjs --area=web      # tylko web-game (typecheck + vitest)
//   node tools/gate.mjs --area=rust     # tylko server/ (fmt, clippy, test workspace)
//   node tools/gate.mjs --area=docs     # generowane dokumenty ekonomii + testy narzedzi (tools/*.test.mjs)
//   node tools/gate.mjs --full          # + ng test, build, e2e (wolne; nie rownolegle z cargo)
//   node tools/gate.mjs --base=main     # obszary wg `git diff <base>...HEAD` (domyslnie: wszystkie)
//
// Port e2e (--full): E2E_PORT, a gdy nie jest ustawiony, pierwszy wolny z puli agentow 4441-4449.
// Porty 4420 i 4430 naleza do czlowieka (jego ng serve i PoC wnetrz): bramka ich odmawia (tools/e2e-port.mjs).
//
// Wynik: tabela krokow i zapis docs/reports/gate-last.json (dla agentow i przegladu).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pickPort } from './e2e-port.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const env = { ...process.env };
const cargoBin = join(homedir(), '.cargo', 'bin');
env.PATH = `${cargoBin}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
env.MSYS_NO_PATHCONV = '1';
env.E2E_CHANNEL ??= 'chrome'; // brak pobranego Chromium Playwrighta na tej maszynie

function changedAreas() {
  if (!args.base) return new Set(['web', 'rust', 'docs']);
  const r = spawnSync('git', ['diff', '--name-only', `${args.base}...HEAD`], { cwd: root, encoding: 'utf8' });
  const files = r.stdout.split('\n').filter(Boolean);
  const areas = new Set();
  for (const f of files) {
    if (f.startsWith('web-game/') || f.startsWith('design-system/')) areas.add('web');
    if (f.startsWith('server/')) areas.add('rust');
    if (f.startsWith('docs/') || f.startsWith('web-game/packages/economy') || f.startsWith('tools/')) areas.add('docs');
  }
  return areas;
}

const wanted = args.area ? new Set(String(args.area).split(',')) : changedAreas();
const steps = [];
const add = (area, name, cmd, argv, cwd, opts = {}) => {
  if (wanted.has(area)) steps.push({ area, name, cmd, argv, cwd: join(root, cwd), ...opts });
};
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

add('web', 'web:typecheck', npm, ['run', 'typecheck'], 'web-game');
// moduł WASM jest ignorowany przez git: przestarzały plik daje fałszywe porażki replica.spec
add('web', 'web:wasm-build', npm, ['run', 'wasm:build'], 'web-game');
add('web', 'web:unit (vitest)', npm, ['run', 'test:unit'], 'web-game');
add('rust', 'rust:fmt', 'cargo', ['fmt', '--all', '--', '--check'], 'server');
add('rust', 'rust:clippy', 'cargo', ['clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'], 'server');
add('rust', 'rust:test', 'cargo', ['test', '--workspace'], 'server');
add('docs', 'docs:econ-check', npm, ['run', 'econ:check'], 'web-game');
add('docs', 'tools:test (node --test)', 'node', ['--test', 'tools/*.test.mjs'], '.');
if (args.full) {
  add('web', 'web:app-tests (ng test)', npm, ['run', 'test:app'], 'web-game');
  add('web', 'web:build', npm, ['run', 'build'], 'web-game');
  // e2e z jednym workerem: domyslne 6 workerow daje timeouty na laptopie; nie uruchamiaj rownolegle z cargo
  add('web', 'web:e2e', npm, ['run', 'e2e', '--', '--workers=2', '--retries=1'], 'web-game');
}

const results = [];
let failed = false;
let e2ePort = null;
const E2E_STEP = 'web:e2e';
// Playwright bierze istniejacy serwer na swoim porcie, wiec port e2e musi byc wlasny, nigdy 4420 ani 4430.
// Zly E2E_PORT konczy bramke od razu; port z puli jest wybierany tuz przed krokiem e2e (po kilku minutach
// innych krokow port wolny na starcie moglby byc juz zajety).
async function claimE2ePort() {
  try {
    e2ePort = await pickPort({ requested: env.E2E_PORT });
    return true;
  } catch (e) {
    failed = true;
    results.push({ step: 'web:e2e-port', ok: false, ms: 0, tail: e.message });
    console.log(`> web:e2e-port ... BLAD\n${e.message}`);
    return false;
  }
}
const runnable = steps.some((s) => s.name === E2E_STEP) && env.E2E_PORT && !(await claimE2ePort()) ? [] : steps;
for (const s of runnable) {
  if (s.name === E2E_STEP) {
    if (!(await claimE2ePort())) break;
    env.E2E_PORT = String(e2ePort);
  }
  const t0 = Date.now();
  process.stdout.write(`> ${s.name}${s.name === E2E_STEP ? ` (port ${e2ePort})` : ''} ... `);
  const r = spawnSync(s.cmd, s.argv, { cwd: s.cwd, env, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  results.push({ step: s.name, ok, ms, tail: ok ? '' : `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n') });
  console.log(ok ? `ok (${(ms / 1000).toFixed(1)} s)` : `BLAD (${(ms / 1000).toFixed(1)} s)`);
  if (!ok) {
    failed = true;
    console.log(results.at(-1).tail);
    if (!args['keep-going']) break;
  }
}

mkdirSync(join(root, 'docs', 'reports'), { recursive: true });
writeFileSync(join(root, 'docs', 'reports', 'gate-last.json'), JSON.stringify({ at: new Date().toISOString(), areas: [...wanted], full: !!args.full, e2ePort, ok: !failed, results }, null, 2));
if (steps.length === 0) console.log('Brak krokow dla wybranych obszarow.');
console.log(failed ? '\nBRAMKA: CZERWONA' : '\nBRAMKA: ZIELONA');
process.exit(failed ? 1 : 0);
