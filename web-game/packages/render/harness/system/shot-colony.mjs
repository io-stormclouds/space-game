// Shot of a colony through the system harness (T7B: Tau Ceti c, medieval skin next to the ruins).
// Start the harness first:  npx vite packages/render/harness/system --port 4431
// Then (from web-game/):    node packages/render/harness/system/shot-colony.mjs [out.png] [url] [k]
// Default: ../docs/img/structures/t7b-tau-ceti-c.png from http://localhost:4431/?colony=c, the camera
// k = 2.0 body radii from the centre, aimed at the colony. Adds render-only standing buildings of
// more kinds and levels around the port (`systemHarness.stress(n, { near: true })`). GPU Chromium.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, '../../../../../docs/img/structures/t7b-tau-ceti-c.png'));
const url = process.argv[3] ?? 'http://localhost:4431/?colony=c';
const K = Number(process.argv[4] ?? 2.0);
const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
/** Medieval models that must have replaced their placeholder boxes before the shot. */
const MEDIEVAL_IDS = ['castle', 'house', 'mill', 'farm_plot', 'market', 'archeryrange', 'barracks', 'mine', 'well', 'watchtower'];

async function launch() {
  try {
    return await chromium.launch({ args });
  } catch (err) {
    const exe = process.env.CHROME_PATH ?? 'C:\\Users\\reque\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
    console.warn(`launch failed (${err.message.split('\n')[0]}), trying ${exe}`);
    return chromium.launch({ args, executablePath: exe });
  }
}

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.warn(`console.${m.type()}:`, m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.systemHarness !== undefined, null, { timeout: 60_000 });
  const body = await page.evaluate(async () => {
    const h = window.systemHarness;
    await h.ready;
    h.pause(true);
    // bodies do not spin: the Tau Ceti c settlement faces the star at t = 0 and the night side later;
    // draw the played world at the orbit position of t = 0 so the colony is in daylight
    if (new URLSearchParams(location.search).get('colony') === 'c') h.input.frame = { ...h.input.frame, time: 0 };
    // a small colony: the played sites plus standing buildings of other kinds and levels near the port
    h.stress(10, { near: true, kinds: ['HAB', 'FARM', 'DEP', 'SKL', 'WND', 'HAB', 'GAR', 'TNK', 'FARM', 'SOL'], levels: [1, 3, 5, 3] });
    return h.input.focusBodyId;
  });
  // terrain tiles built (bodies with terrain) and, for the medieval skin, its models in place of the boxes
  await page.waitForFunction(
    ({ body, ids }) => {
      const scene = window.systemHarness.view()?.internals;
      const parts = scene?.bodyParts(body);
      if (!parts?.structures) return false;
      return (parts.terrain ? parts.terrain.ready : true) && (parts.structures.skin !== 'medieval' || ids.every((id) => scene.kit.isLoaded(id)));
    },
    { body, ids: MEDIEVAL_IDS },
    { timeout: 60_000 },
  );
  const info = await page.evaluate(
    async ({ body, k, SUN_LEAN }) => {
      const h = window.systemHarness;
      const scene = h.view().internals;
      const parts = scene.bodyParts(body);
      const rig = scene.rig;
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      const R = h.sim.grids.get(body).radius;
      const centre = parts.group.getWorldPosition(rig.camera.position.clone());
      const c = parts.structures.centroid.clone();
      // the star sits at the origin and bodies do not spin: the lit side is towards -centre
      const sun = centre.clone().negate().normalize();
      if (k > 0) {
        // look at the colony from its sunlit side, tilted so the buildings stand against the ground
        const dir = c.clone().addScaledVector(sun, SUN_LEAN).normalize();
        rig.controls.target.copy(centre).addScaledVector(c, R * 0.4);
        rig.camera.position.copy(centre).addScaledVector(dir, R * k);
        rig.controls.update();
      }
      document.getElementById('hud').style.display = 'none';
      document.getElementById('keys').style.display = 'none';
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
      const s = h.stats();
      return { sunOnColony: +c.dot(sun).toFixed(2), structures: h.input.snapshot.world.structures.filter((x) => x.bodyId === body).map((x) => `${x.kind}:L${x.level}:${x.state}`), drawCalls: s.drawCalls, triangles: s.triangles };
    },
    { body, k: K, SUN_LEAN: Number(process.env.SUN_LEAN ?? 0.6) },
  );
  console.log(JSON.stringify(info));
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`saved ${out}`);
} finally {
  await browser.close();
}
