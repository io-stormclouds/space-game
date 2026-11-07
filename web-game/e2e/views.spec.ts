import { expect, test, type Page } from '@playwright/test';

// F4 acceptance: System and Galaxy are reachable from the HUD, the Atanor from the designer's
// sandbox (A16: a building's Atanor opens from its card, see atanor.spec.ts); the overlay shows draw
// calls and triangles for each; after 20 view switches the GPU counters return to the baseline;
// never more than one WebGL context (W13 A).

const perf = async (page: Page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-perf]')].map((e) => [e.getAttribute('data-perf')!, e.textContent!.trim()])));

const KINDS: Record<string, string> = { Planeta: 'planet', 'Układ': 'system', Galaktyka: 'galaxy', Atanor: 'atanor' };

/** The Atanor sandbox from the designer panel (F2 → Atanor → open), panel closed again. */
async function openSandbox(page: Page): Promise<void> {
  await page.keyboard.press('F2');
  const p = page.locator('wg-designer-panel');
  await p.locator('[data-tab="atanor"]').click();
  await p.locator('[data-action="open-atanor"]').click();
  await page.keyboard.press('F2');
}

/** Switches view and waits until the overlay reports that view with something drawn. */
async function showView(page: Page, key: string, name: string): Promise<Record<string, string>> {
  if (name === 'Atanor') await openSandbox(page);
  else {
    await page.keyboard.press(key);
    const views = page.getByRole('navigation', { name: 'Przełącznik widoku' });
    await expect(views.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
  }
  await expect
    .poll(async () => {
      const p = await perf(page);
      return p['view'] === KINDS[name] && Number(p['calls'] ?? 0) > 0;
    }, { timeout: 15_000 })
    .toBe(true);
  return perf(page);
}

/** GPU counters once models have finished loading (no change for a second). */
async function settledGpu(page: Page): Promise<string> {
  let last = '';
  let same = 0;
  for (let i = 0; i < 40 && same < 4; i++) {
    await page.waitForTimeout(300);
    const g = (await perf(page))['gpu'] ?? '';
    same = g === last ? same + 1 : 0;
    last = g;
  }
  return last;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/scenariusz-kolonia');
  await expect(page.locator('.game[data-ready="true"]')).toHaveCount(1, { timeout: 60_000 });
});

test('each view is reachable from the HUD and reports its counters with one WebGL context', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the switch has three views; `4` no longer opens anything (A16)
  await expect(page.getByRole('navigation', { name: 'Przełącznik widoku' }).getByRole('button')).toHaveCount(3);
  for (const [key, name] of [['1', 'Planeta'], ['2', 'Układ'], ['3', 'Galaktyka'], ['', 'Atanor']] as const) {
    const p = await showView(page, key, name);
    expect(Number(p['calls'])).toBeGreaterThan(0);
    expect(Number(p['calls'])).toBeLessThanOrEqual(150); // init.md budget
    expect(Number(p['triangles']!.replace(/\s/g, ''))).toBeLessThanOrEqual(400_000);
    expect(p['contexts']).toBe('1');
  }
  expect(errors).toEqual([]);
});

test('after 20 view switches the geometry and texture counts return to the baseline', async ({ page }) => {
  test.setTimeout(120_000);
  // The baseline is the state after one full cycle: the planet view builds tile edges and building
  // models lazily, when the camera gets close, so the first visit allocates more than a quick glance.
  const cycle: Array<[string, string]> = [['3', 'Galaktyka'], ['', 'Atanor'], ['1', 'Planeta'], ['2', 'Układ']];
  for (const [key, name] of cycle) {
    await showView(page, key, name);
    await settledGpu(page);
  }
  const baseline = await settledGpu(page);
  for (let i = 0; i < 20; i++) {
    const [key, name] = cycle[i % cycle.length]!;
    const p = await showView(page, key, name);
    expect(p['contexts']).toBe('1');
    await settledGpu(page);
  }
  await showView(page, '2', 'Układ');
  expect(await settledGpu(page)).toBe(baseline);
});

