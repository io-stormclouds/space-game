// Screenshot of the structure contact sheet (T7A, T7B). Start the harness first:
//   npx vite packages/render/harness/models --port 4432
// then: node packages/render/harness/models/shot.mjs [out.png] [url]
// Default output: ../docs/img/structures/t7a-sheet.png (repo docs). The medieval skin (T7B):
//   node packages/render/harness/models/shot.mjs ../docs/img/structures/t7b-sheet-medieval.png "http://localhost:4432/?skin=medieval"
// GPU Chromium (ANGLE d3d11).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, '../../../../../docs/img/structures/t7a-sheet.png'));
const url = process.argv[3] ?? 'http://localhost:4432/';
const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];

async function launch() {
  try {
    return await chromium.launch({ args });
  } catch (err) {
    // the bundled browser may be missing: fall back to an installed Playwright Chromium
    const exe = process.env.CHROME_PATH ?? 'C:\\Users\\reque\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
    console.warn(`launch failed (${err.message.split('\n')[0]}), trying ${exe}`);
    return chromium.launch({ args, executablePath: exe });
  }
}

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.warn(`console.${m.type()}:`, m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.modelsHarness?.done === true, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.getElementById('hud').style.display = 'none'; // counters are for the live page, not the sheet
    window.modelsHarness.render();
  });
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`saved ${out}`);
} finally {
  await browser.close();
}
