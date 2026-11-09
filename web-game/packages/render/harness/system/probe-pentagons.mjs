// T6 probe: looks straight down at every pentagon of a terrain body from several camera distances and
// measures the share of near-black pixels in the middle of the view (docs/planet-terrain-poc-wnioski-i-plan.md §7).
// Run the harness first:  npx vite packages/render/harness/system --port 4431
// Then (from web-game/):  node packages/render/harness/system/probe-pentagons.mjs [bodyId] [outDir]
// Uses the GPU (ANGLE D3D11) like tools/perf/run.mjs. Exit code 1 when a view is darker than the limit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const BODY = process.argv[2] ?? 'tc-c';
const OUT = process.argv[3] ?? null;
const URL = process.env.PROBE_URL ?? 'http://localhost:4431/';
/** Camera distance from the body centre, in body radii (the scene clamps to its own minimum). */
const DISTANCES = [1.25, 1.45, 2.2];
/** Share of near-black pixels (all channels < 12) in the central crop above which a view fails. */
const DARK_LIMIT = 0.02;
const CROP = 160;

const launch = { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] };
if (process.env.PLAYWRIGHT_CHROME) launch.executablePath = process.env.PLAYWRIGHT_CHROME;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);
await page.waitForFunction(() => window.systemHarness !== undefined);
await page.evaluate(async (body) => {
  const h = window.systemHarness;
  await h.ready;
  h.pause(true);
  h.focus(body);
}, BODY);
// wait until the hex-kit terrain of the body is built and shown
await page.waitForFunction((body) => window.systemHarness.view()?.internals?.bodyParts(body)?.terrain?.ready === true, BODY, { timeout: 30000 });

const pentagons = await page.evaluate((body) => window.systemHarness.sim.grids.get(body).tiles.filter((t) => t.kind === 'PENT').map((t) => t.index), BODY);
const results = [];
for (const index of pentagons) {
  for (const k of DISTANCES) {
    const shot = await page.evaluate(
      async ({ body, index, k }) => {
        const h = window.systemHarness;
        const scene = h.view().internals;
        const parts = scene.bodyParts(body);
        const tile = h.sim.grids.get(body).tiles[index];
        const R = h.sim.grids.get(body).radius;
        const rig = scene.rig;
        const centre = parts.group.getWorldPosition(rig.camera.position.clone());
        const surface = parts.group.localToWorld(rig.camera.position.clone().set(tile.normal.x * R, tile.normal.y * R, tile.normal.z * R));
        const dir = surface.clone().sub(centre).normalize();
        rig.controls.target.copy(centre);
        rig.camera.position.copy(centre).addScaledVector(dir, R * k);
        rig.controls.update();
        for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
        return { distance: rig.camera.position.distanceTo(centre) / R };
      },
      { body: BODY, index, k },
    );
    const png = await page.screenshot({ clip: { x: 480 - CROP / 2, y: 320 - CROP / 2, width: CROP, height: CROP } });
    const dark = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 12 && d[i + 1] < 12 && d[i + 2] < 12) n++;
      return n / (d.length / 4);
    }, png.toString('base64'));
    results.push({ index, k, distance: +shot.distance.toFixed(3), dark: +dark.toFixed(4) });
    if (OUT && k === DISTANCES[0]) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `pent-${BODY}-${index}.png`), await page.screenshot());
    }
  }
}
await browser.close();

const bad = results.filter((r) => r.dark > DARK_LIMIT);
console.log(JSON.stringify({ body: BODY, views: results.length, maxDark: Math.max(...results.map((r) => r.dark)), minDistance: Math.min(...results.map((r) => r.distance)), bad, errors }, null, 1));
process.exit(bad.length || errors.length ? 1 : 0);
