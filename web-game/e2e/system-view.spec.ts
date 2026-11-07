import { expect, test, type Page } from '@playwright/test';

// Układ view: choosing a planet zooms in on it (planet view, where the colony is built); the star
// can be selected but is no flight target.

type Point = { x: number; y: number };
const card = (page: Page) => page.locator('.hud-cmd');
const views = (page: Page) => page.getByRole('navigation', { name: 'Przełącznik widoku' });

/** Page position of a body (dev hook of the world view), only if the click would reach the scene. */
async function onScene(page: Page, id: string): Promise<Point | null> {
  return page.evaluate((id) => {
    const p = (window as Window & { wgWorld?: { screenOf(id: string): Point | null } }).wgWorld?.screenOf(id) ?? null;
    return p && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS' ? p : null;
  }, id);
}

async function firstOnScene(page: Page, ids: string[]): Promise<{ id: string; at: Point }> {
  for (const id of ids) {
    const at = await onScene(page, id);
    if (at) return { id, at };
  }
  throw new Error(`none of ${ids.join(', ')} is clickable on the scene`);
}

test('Układ: a planet click zooms in on it; the star is selected but refuses a flight', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/#/scenariusz-kolonia');
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  await page.keyboard.press('2');
  await expect(views(page).getByRole('button', { name: 'Układ' })).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => onScene(page, 'tau-ceti'), { timeout: 10_000 }).not.toBeNull();
  await page.waitForTimeout(900); // the 0.7 s camera flight to the overview

  // the star: selected in the overview, no zoom; a flight order there is refused
  const star = (await onScene(page, 'tau-ceti'))!;
  await page.mouse.click(star.x, star.y);
  await expect(page.locator('wg-selection-panel')).toContainText('Tau Ceti');
  await expect(views(page).getByRole('button', { name: 'Układ' })).toHaveAttribute('aria-current', 'page');
  await page.mouse.click(star.x, star.y, { button: 'right' });
  await expect(page.locator('wg-log-panel')).toContainText('Odrzucono: Na gwieździe nie można wylądować (Tau Ceti)');

  // another planet: zoom in; building there waits for a port
  const other = await firstOnScene(page, ['tc-f', 'tc-d', 'tc-c', 'tc-b']);
  await page.mouse.click(other.at.x, other.at.y);
  await expect(views(page).getByRole('button', { name: 'Planeta' })).toHaveAttribute('aria-current', 'page');
  await expect(card(page)).toContainText(`Skaner · Tau Ceti ${other.id.slice(-1)}`);
  await expect(card(page).getByRole('button', { name: /^Buduj/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(card(page).getByRole('button', { name: /^Buduj/ })).toHaveAccessibleDescription('Najpierw postaw port kosmiczny');

  // the colony planet: zoom in from the overview and open the build catalog with B
  await page.keyboard.press('2');
  await expect(views(page).getByRole('button', { name: 'Układ' })).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(900);
  await page.locator('wg-system-map [data-body="tc-e"]').first().click({ force: true }); // the dock map selects without zooming
  await expect(views(page).getByRole('button', { name: 'Układ' })).toHaveAttribute('aria-current', 'page');
  await expect(card(page).getByRole('button', { name: /^Buduj/ })).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('b');
  await expect(page.locator('wg-selection-panel')).toContainText('Budowa · Tau Ceti e');
});
