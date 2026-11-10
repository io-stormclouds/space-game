// Biome shots (T5 phase 3): every body with terrain from orbit and up close, through the system harness.
// Start the harness first:  npx vite packages/render/harness/system --port 4433
// Then (from web-game/):    node packages/render/harness/system/shot-biomes.mjs [outDir] [baseUrl] [bodies]
// Default: ../docs/img/planet-terrain/biome-<body>-{orbit,close}.png from http://localhost:4433/, bodies
// tc-b,tc-c,tc-d,tc-e,tc-f (Tau Ceti) and planet,moon (`?scenario=planeta-matka`, saved as poc-planet,
// poc-moon). Bodies do not spin and the star sits at the origin, so both shots look at the lit side.
// Prints, per body, the frame counters of the default planet view (3.4 R), of the orbit and of the close-up
// shot (`systemHarness.stats()`: triangles, draw calls and the planet detail by category). GPU Chromium.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../../../../../docs/img/planet-terrain'));
const base = process.argv[3] ?? 'http://localhost:4433/';
const only = process.argv[4]?.split(',');
const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];

/** Page → bodies; `file` names the shot. */
const PAGES = [
  { query: '', bodies: ['tc-b', 'tc-c', 'tc-d', 'tc-e', 'tc-f'].map((id) => ({ id, file: id })) },
  { query: '?scenario=planeta-matka', bodies: [{ id: 'planet', file: 'poc-planet' }, { id: 'moon', file: 'poc-moon' }] },
];

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
const report = {};
try {
  mkdirSync(outDir, { recursive: true });
  for (const { query, bodies } of PAGES) {
    const todo = bodies.filter((b) => !only || only.includes(b.id) || only.includes(b.file));
    if (!todo.length) continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.warn(`console.${m.type()}:`, m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) console.warn(`HTTP ${r.status()} ${r.url()}`);
    });
    await page.goto(base + query);
    await page.waitForFunction(() => window.systemHarness !== undefined, null, { timeout: 60_000 });
    await page.evaluate(async () => {
      const h = window.systemHarness;
      await h.ready;
      h.pause(true);
      // bodies do not spin: at t = 0 the Tau Ceti c settlement faces the star (shot-colony.mjs), so draw
      // every body at its orbit position of t = 0
      h.input.frame = { ...h.input.frame, time: 0 };
      document.getElementById('hud').style.display = 'none';
      document.getElementById('keys').style.display = 'none';
      // the shot camera: the rig keeps following the body centre, so the shot pose is put back after it
      const rig = h.view().internals.rig;
      const update = rig.update.bind(rig);
      rig.update = (dt, goal) => {
        update(dt, goal);
        const s = window.__shot;
        if (s) {
          rig.camera.position.copy(s.position);
          rig.camera.up.set(0, 1, 0);
          if (s.up) rig.camera.up.copy(s.up);
          rig.camera.lookAt(s.target);
          rig.camera.up.set(0, 1, 0);
        }
      };
    });
    for (const body of todo) {
      const frames = (n) =>
        page.evaluate(async (n) => {
          for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
        }, n);
      await page.evaluate((id) => {
        window.__shot = null;
        window.systemHarness.focus(id);
      }, body.id);
      await frames(3); // the rig starts its flight on the next update
      // the flight to the body is over, its hex-kit terrain is built and its decor placed
      await page.waitForFunction(
        (id) => {
          const scene = window.systemHarness.view()?.internals;
          const parts = scene?.bodyParts(id);
          return scene?.focusId === id && !!parts?.terrain?.ready && !!parts.terrainDecor && !scene.rig.transition;
        },
        body.id,
        { timeout: 60_000 },
      );
      await frames(6);
      // the frame counters (all bodies) and the body's own share: its terrain, decor and structures drawn now,
      // and its whole decor at full detail (every instance, no culling)
      const stats = () =>
        page.evaluate((id) => {
          const h = window.systemHarness;
          const parts = h.view().internals.bodyParts(id);
          const decor = { triangles: 0, instances: 0 };
          parts.terrainDecor.drawn(decor);
          const structures = { triangles: 0, instances: 0 };
          if (parts.structures?.group.visible) parts.structures.drawn(structures);
          const terrain = parts.terrain.visual.visible ? parts.terrain.terrainTriangles : 0;
          return {
            ...h.stats(),
            own: { triangles: terrain + decor.triangles + structures.triangles, terrain, decor: decor.triangles, structures: structures.triangles, decorFull: parts.terrainDecor.triangles },
          };
        }, body.id);
      const focusView = await stats();
      const pose = (kind) =>
        page.evaluate(
          ({ id, kind }) => {
            const h = window.systemHarness;
            const scene = h.view().internals;
            const parts = scene.bodyParts(id);
            const R = h.sim.grids.get(id).radius;
            const V = scene.rig.camera.position.constructor; // THREE.Vector3 of the page
            const centre = parts.group.getWorldPosition(new V());
            // the star sits at the origin: the lit side faces -centre
            const sun = centre.clone().negate().normalize();
            const up = new V(0, 1, 0);
            const side = new V().crossVectors(sun, up).normalize();
            if (kind === 'orbit') {
              // the lit face a little off the star, the terminator on one side, the +Y cap in view
              const dir = sun.clone().multiplyScalar(0.85).addScaledVector(up, 0.4).addScaledVector(side, 0.45).normalize();
              window.__shot = { position: centre.clone().addScaledVector(dir, R * 3.0), target: centre.clone() };
            } else {
              // up close: the sunlit tile with the most decor around it (Kenney models count double, ruins
              // triple), seen at a slant from about 0.4 R above the ground, looking north across it with the
              // local normal as the camera's up (the horizon stays level, in the upper third)
              const grid = h.sim.grids.get(id);
              const decor = parts.terrainDecor;
              const weight = (mesh) => (mesh.includes('kenney') ? 2 : /^Decor_(detail_|mountain|lod_)/.test(mesh) ? 1 : 3);
              const items = (i) => decor.slotsOn(i).reduce((n, s) => n + weight(s.mesh), 0);
              let best = null;
              let bestScore = -1;
              for (const t of grid.tiles) {
                const n = new V(t.normal.x, t.normal.y, t.normal.z).applyQuaternion(parts.group.quaternion);
                const lit = n.dot(sun);
                if (lit < 0.55) continue;
                const score = items(t.index) * 2 + t.neighbors.reduce((s, k) => s + items(k), 0) + lit;
                if (score > bestScore) {
                  bestScore = score;
                  best = n;
                }
              }
              const a = best ?? sun.clone();
              const north = up.clone().addScaledVector(a, -up.dot(a)).normalize();
              const position = centre.clone().addScaledVector(a, R * 1.38).addScaledVector(north, -R * 0.4);
              window.__shot = { position, target: centre.clone().addScaledVector(a, R).addScaledVector(north, R * 0.04), up: a };
            }
            // body labels only from orbit
            document.querySelector('.system-view__labels').style.visibility = kind === 'orbit' ? 'visible' : 'hidden';
            return { R };
          },
          { id: body.id, kind },
        );
      const shots = {};
      for (const kind of ['orbit', 'close']) {
        await pose(kind);
        await frames(8);
        shots[kind] = await stats();
        const file = resolve(outDir, `biome-${body.file}-${kind}.png`);
        await page.screenshot({ path: file });
        console.log(`saved ${file}`);
      }
      report[body.file] = { focus: focusView, orbit: shots.orbit, close: shots.close };
      console.log(JSON.stringify({ body: body.file, focus: focusView, orbit: shots.orbit, close: shots.close }));
    }
    await page.close();
  }
} finally {
  await browser.close();
}
