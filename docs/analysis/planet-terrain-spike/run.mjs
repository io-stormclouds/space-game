import { chromium } from '../../../web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SPIKE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SPIKE, '..', '..', '..');
const NM = path.join(REPO, 'web-game', 'node_modules');
const RES = path.join(REPO, 'resources', 'kaykit', 'Models');
const OUT = path.join(SPIKE, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const views = (process.argv[2] || 'catalog,mixed-warp,mixed-flat,winter-warp,dry-warp,medieval-warp,medieval-warp-zoom').split(',');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  let file;
  if (u.pathname.startsWith('/nm/')) file = NM + u.pathname.slice(3);
  else if (u.pathname.startsWith('/assets/')) file = RES + u.pathname.slice(7);
  else file = SPIKE + (u.pathname === '/' ? '/index.html' : u.pathname);
  if (!fs.existsSync(file)) { console.log('404', u.pathname); return route.fulfill({ status: 404, body: 'nf' }); }
  return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': types[path.extname(file)] || 'application/octet-stream' } });
});
const results = {};
for (const v of views) {
  const [preset, mode, zoom] = v.split('-'); const zoomQ = zoom === 'far' ? '&zoom=4.2' : zoom ? '&zoom=1.6' : '';
  const url = preset === 'catalog' ? 'http://spike.local/?catalog=1' : `http://spike.local/?preset=${preset}&mode=${mode}${zoomQ}`;
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.spikeDone === true, null, { timeout: 120000 });
  const stats = await page.evaluate(() => window.spikeStats);
  await page.screenshot({ path: path.join(OUT, `${v}.png`) });
  results[v] = stats;
  console.log(v, `${Date.now() - t0} ms`, JSON.stringify(stats));
}
fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(results, null, 2));
await browser.close();
