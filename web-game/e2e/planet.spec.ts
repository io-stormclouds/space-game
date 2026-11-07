import { expect, test, type Page } from '@playwright/test';

// Planet interactions of the 3D PoC in web-game: the tile panel, building on the selected tile
// (landing pad, catalog aimed at the tile), a rover sent to a tile, orders for the selected ship.

type Point = { x: number; y: number };
type Hook = { screenOf(id: string): Point | null; screenOfUnit(id: string): Point | null; frontTiles(id: string): Array<Point & { index: number }> };
const card = (page: Page) => page.locator('.hud-cmd');
const panel = (page: Page) => page.locator('wg-selection-panel');
const log = (page: Page) => page.locator('wg-log-panel');

async function ready(page: Page, preset: string): Promise<void> {
  await page.goto(`/#/scenariusz-${preset}`);
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(900); // the camera flight to the start view
}

/** Near-side tiles of a body that a click would reach (not under a HUD panel). */
function clickable(page: Page, bodyId: string): Promise<Array<Point & { index: number }>> {
  return page.evaluate((id) => {
    const w = (window as Window & { wgWorld?: Hook }).wgWorld;
    return (w?.frontTiles(id) ?? []).filter((p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS');
  }, bodyId);
}

/** Clicks near-side tiles until one opens the tile panel and its deposit line passes `accept`. */
async function pickTile(page: Page, bodyId: string, accept: (deposit: string) => boolean, skip: ReadonlySet<number> = new Set()): Promise<number> {
  for (const t of (await clickable(page, bodyId)).filter((x) => !skip.has(x.index)).slice(0, 80)) {
    await page.mouse.click(t.x, t.y);
    const head = panel(page).locator(`[data-tile="${t.index}"]`);
    try {
      await head.waitFor({ timeout: 600 });
    } catch {
      continue; // a building, a rover or a neighbouring tile took the click
    }
    const deposit = panel(page).locator('[data-tile-deposit]');
    await deposit.waitFor({ timeout: 3_000 });
    if (accept((await deposit.textContent()) ?? '')) return t.index;
  }
  throw new Error(`no suitable tile on the near side of ${bodyId}`);
}

const plain = (d: string) => d.includes('Brak złoża');

test('planet: tile panel; a landing pad and a solar panel on selected tiles; a rover sent to a tile', async ({ page }) => {
  test.setTimeout(150_000);
  await ready(page, 'kolonia');
  await page.getByRole('group', { name: 'Tempo czasu' }).getByRole('button', { name: '×600' }).click();

  // the tile panel of the 3D PoC: tile number and shape, deposit, what fits here
  const padTile = await pickTile(page, 'tc-e', plain);
  await expect(panel(page)).toContainText(/sześciokąt|pięciokąt/);
  await expect(panel(page).locator('[data-tile-fits]')).toContainText('Lądowisko');
  await expect(card(page)).toContainText(`Pole ${padTile}`);

  // landing pad here, in one key press
  await expect(card(page).getByRole('button', { name: /^Lądowisko tutaj/ })).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('d');
  await expect(log(page)).toContainText('Zlecono budowę: Lądowisko');
  await expect(log(page)).toContainText('Ukończono: Lądowisko', { timeout: 30_000 });
  await expect(panel(page)).toContainText('Stoi tu: Lądowisko'); // the tile panel shows what stands on it

  // the catalog opened from a tile aims at it: the ghost starts there, Enter builds there
  const solarTile = await pickTile(page, 'tc-e', plain, new Set([padTile]));
  await page.keyboard.press('b');
  await expect(panel(page)).toContainText('Budowa · Tau Ceti e');
  await panel(page).getByRole('button', { name: /^Panel słoneczny/ }).click();
  await expect(card(page)).toContainText(`POLE ${solarTile}`);
  await page.keyboard.press('Enter');
  await expect(log(page)).toContainText('Zlecono budowę: Panel słoneczny');
  // the rovers are free again (an idle rover would otherwise be taken by the panel's construction)
  await expect(log(page)).toContainText('Ukończono: Panel słoneczny', { timeout: 30_000 });

  // a rover sent to another tile from the tile card ("Wyślij łazik", J)
  const roverTile = await pickTile(page, 'tc-e', plain, new Set([padTile, solarTile]));
  await expect(card(page).getByRole('button', { name: /^Wyślij łazik/ })).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await page.keyboard.press('j');
  await page.locator('wg-system-map [data-body="tc-e"]').first().click({ force: true });
  await expect(panel(page).locator('[data-rover]').filter({ hasText: `Pole ${roverTile}` })).toHaveCount(1, { timeout: 30_000 });
});

test('PoC world: the selected ship gets its own card; a flight shows its target and arrival', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page, 'planeta-matka');
  await page.keyboard.press('2');
  await page.waitForTimeout(900);
  const ship = await page.evaluate(() => (window as Window & { wgWorld?: Hook }).wgWorld?.screenOfUnit('ship-1') ?? null);
  expect(ship).not.toBeNull();
  await page.mouse.click(ship!.x, ship!.y);
  await expect(card(page)).toContainText('Astraeus-1');
  await expect(card(page).getByRole('button', { name: /^Wróć do bazy/ })).toHaveAccessibleDescription('Statek już tam jest');

  // "Leć do…" (E), then a body on the scene: the order goes to Astraeus-1, not to a mothership
  await page.keyboard.press('e');
  const target = await page.evaluate(() => {
    const w = (window as Window & { wgWorld?: Hook }).wgWorld;
    for (const [id, name] of [['asteroid', 'Asteroida'], ['moon', 'Księżyc']] as const) {
      const p = w?.screenOf(id);
      if (p && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return { ...p, name };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  await expect(panel(page)).toContainText(target!.name);
  await expect(panel(page).locator('[data-ship="eta"]')).toBeVisible();
  await expect(card(page).getByRole('button', { name: /^Wróć do bazy/ })).toHaveAccessibleDescription('Statek jest w locie');
});
