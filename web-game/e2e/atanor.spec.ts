import { expect, test, type Page } from '@playwright/test';

// The Atanor as the view of one Fabryka atanorowa (docs/atanor-expansion-design.md, AT1–AT4):
// opened from the building's card on the planet, back with Esc.

type Point = { x: number; y: number };
type Hook = {
  frontTiles(id: string): Array<Point & { index: number }>;
  structures(kind: string): Array<{ id: string; bodyId: string; tiles: number[] }>;
};
const card = (page: Page) => page.locator('.hud-cmd');
const panel = (page: Page) => page.locator('wg-selection-panel');
const perf = async (page: Page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-perf]')].map((e) => [e.getAttribute('data-perf')!, e.textContent!.trim()])));

async function ready(page: Page): Promise<void> {
  await page.goto('/#/scenariusz-fabryka');
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(900); // the camera flight to the start view
}

/** Clicks the Fabryka atanorowa on the planet (one of its 7 tiles on the near side). */
async function selectFactory(page: Page): Promise<void> {
  const hits = await page.evaluate(() => {
    const w = (window as Window & { wgWorld?: Hook }).wgWorld!;
    const atn = w.structures('ATN')[0]!;
    return w.frontTiles(atn.bodyId).filter((p) => atn.tiles.includes(p.index) && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS');
  });
  expect(hits.length).toBeGreaterThan(0);
  await page.mouse.click(hits[0]!.x, hits[0]!.y);
  await expect(card(page)).toContainText('Fabryka atanorowa');
}

test('the machine opens from the factory card on the planet and Esc goes back', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await selectFactory(page);
  await expect(card(page).getByRole('button', { name: /^Maszyna/ })).toBeVisible();
  await page.keyboard.press('a');

  // the building's view: its body and level, the recipe of the building, one WebGL context
  await expect(card(page)).toContainText('Tau Ceti e · Fabryka atanorowa L1');
  await expect(panel(page).locator('[data-atanor="where"]')).toContainText('A_NAD · budynek L1');
  await expect.poll(async () => (await perf(page))['view'], { timeout: 15_000 }).toBe('atanor');
  expect((await perf(page))['contexts']).toBe('1');
  // no recipe switch in a building (only in the sandbox), and the second card row has its label (K4)
  await expect(card(page).getByRole('button', { name: /^Następna receptura/ })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: /^Wróć/ })).toBeVisible();

  // pause and one step
  const ticks = panel(page).locator('[data-atanor="ticks"]');
  await expect.poll(async () => Number(await ticks.textContent()), { timeout: 15_000 }).toBeGreaterThan(2);
  await page.keyboard.press('p');
  const paused = Number(await ticks.textContent());
  await page.waitForTimeout(1200);
  expect(Number(await ticks.textContent())).toBe(paused);
  await page.keyboard.press('k');
  await expect(ticks).toHaveText(String(paused + 1));

  // Esc: back to the planet with the factory still selected
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await perf(page))['view'], { timeout: 15_000 }).toBe('planet');
  await expect(card(page)).toContainText('Fabryka atanorowa · poz. 1');
});
