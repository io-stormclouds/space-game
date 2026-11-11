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

/**
 * Waits for the scene instead of the clock: the camera has stopped when a body it does not follow (the
 * star of the system view) keeps its place on the page for 300 ms and 5 rendered frames. The camera
 * flight advances by frames (at most 0.1 s of it per frame), so on a loaded machine it lasts longer than
 * its nominal 0.7 s, and a click aimed after a fixed wait lands where the body no longer is.
 */
async function cameraAtRest(page: Page, bodyId: string): Promise<void> {
  const rested = await page.evaluate(async (id) => {
    const w = (window as Window & { wgWorld?: Hook }).wgWorld;
    const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    const deadline = performance.now() + 30_000;
    let anchor: { x: number; y: number; since: number; frames: number } | null = null;
    while (performance.now() < deadline) {
      await nextFrame();
      const p = w?.screenOf(id) ?? null;
      if (p && anchor && Math.hypot(p.x - anchor.x, p.y - anchor.y) <= 1) {
        anchor.frames += 1;
        if (anchor.frames >= 5 && performance.now() - anchor.since >= 300) return true;
      } else {
        anchor = p ? { x: p.x, y: p.y, since: performance.now(), frames: 0 } : null;
      }
    }
    return false;
  }, bodyId);
  expect(rested, `the camera comes to rest (${bodyId} keeps its place on the page)`).toBe(true);
}

/** Near-side tiles of a body that a click would reach (not under a HUD panel). */
function clickable(page: Page, bodyId: string): Promise<Array<Point & { index: number }>> {
  return page.evaluate((id) => {
    const w = (window as Window & { wgWorld?: Hook }).wgWorld;
    return (w?.frontTiles(id) ?? []).filter((p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS');
  }, bodyId);
}

/**
 * Clicks near-side tiles until one opens the tile panel, can be built on (T5: Tau Ceti e has lakes; the
 * terrain line of an unbuildable tile is marked `.al`) and its deposit line passes `accept`.
 */
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
    if ((await panel(page).locator('[data-tile-terrain].al').count()) > 0) continue; // water: nothing fits
    if (accept((await deposit.textContent()) ?? '')) return t.index;
  }
  throw new Error(`no suitable tile on the near side of ${bodyId}`);
}

const plain = (d: string) => d.includes('Brak złoża');

test('planet: tile panel; a landing pad and a solar panel on selected tiles; a rover sent to a tile', async ({ page }) => {
  test.setTimeout(150_000);
  await ready(page, 'kolonia');
  await page.getByRole('group', { name: 'Tempo czasu' }).getByRole('button', { name: '×600' }).click();
  // T5: the first buildings of the preset stand on the snow of Tau Ceti e's top (cost × 1.2), so the
  // colony has FER 24 left; the mine brings 2 a minute, and the pad needs 30–42 (by terrain): let it mine
  await page.waitForTimeout(1_500);

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
  await cameraAtRest(page, 'sun'); // the flight to the system view, however long it takes
  const ship = await page.evaluate(() => (window as Window & { wgWorld?: Hook }).wgWorld?.screenOfUnit('ship-1') ?? null);
  expect(ship).not.toBeNull();
  await page.mouse.click(ship!.x, ship!.y);
  await expect(card(page)).toContainText('Astraeus-1');
  await expect(card(page).getByRole('button', { name: /^Wróć do bazy/ })).toHaveAccessibleDescription('Statek już tam jest');

  // "Leć do…" (E), then the asteroid on the dock map: the order goes to Astraeus-1, not to a mothership.
  // The target is chosen on the map because this world has no body on the scene that a click reaches
  // reliably (measured, docs/reports/tasks/E1-02.md): in the system view the asteroid lies below the page,
  // and the moon is 7 px from the ship, inside the 12 px in which a click picks the ship; the flight to
  // the moon also ends within two seconds, sooner than the three checks below take on a loaded machine.
  await page.keyboard.press('e');
  await page.locator('wg-system-map [data-body="asteroid"]').first().click({ force: true });
  await expect(panel(page)).toContainText('Asteroida');
  await expect(panel(page).locator('[data-ship="eta"]')).toBeVisible();
  await expect(card(page).getByRole('button', { name: /^Wróć do bazy/ })).toHaveAccessibleDescription('Statek jest w locie');
});
