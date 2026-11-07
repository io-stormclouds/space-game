import { expect, test, type Locator, type Page } from '@playwright/test';

// F3 acceptance: the canvas "Play" flow runs in the browser on the mock server (Web Worker), from the
// main page to a colony that extracts FER, SIL and KRI. Commands have hotkeys and blocked ones say why.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// hud-command-card is display: contents; its frame is the section .hud-cmd
const card = (page: Page) => page.locator('.hud-cmd');
const selectBody = (page: Page, id: string) => page.locator(`wg-system-map [data-body="${id}"]`).first().click({ force: true });
const cmd = (page: Page, label: string | RegExp): Locator => card(page).getByRole('button', { name: label });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const goal = (page: Page, n: number) => page.locator('wg-mission-panel li').nth(n);

async function fast(page: Page): Promise<void> {
  await page.getByRole('group', { name: 'Tempo czasu' }).getByRole('button', { name: '×600' }).click();
}

test('Play flow: main page → login → arrival → scan → port → first colony', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Znany wszechświat' })).toBeVisible();
  await expect(page.locator('.card')).toContainText('477'); // fusion capsules to Tau Ceti
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Identyfikacja dowódcy' })).toBeVisible();
  await page.keyboard.press('Enter');

  // Arrival: Arka-1 card, colony blocked until the scan
  await expect(card(page)).toContainText('Arka-1');
  await expect(cmd(page, 'Załóż kolonię')).toHaveAttribute('aria-disabled', 'true');
  await expect(cmd(page, 'Załóż kolonię')).toHaveAccessibleDescription('Najpierw zeskanuj układ');
  await expect(page.getByRole('status')).toContainText('Przybycie do układu zakończone');
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await fast(page);
  await page.keyboard.press('q'); // Skanuj układ
  await expect(goal(page, 0)).toHaveClass(/is-done/, { timeout: 20_000 });

  // Scan results: choose Tau Ceti e
  const scan = page.locator('wg-scan-panel');
  await scan.locator('li', { hasText: 'Tau Ceti e' }).click();
  await expect(page.locator('wg-selection-panel')).toContainText('642 kafelki');
  await page.keyboard.press('Enter'); // Wybierz na start
  await expect(goal(page, 1)).toHaveClass(/is-done/);

  // The Ark flies to the planet (Esc: no selection → the Ark's card); then the port from the hold
  await page.keyboard.press('Escape');
  await expect(card(page)).toContainText('Arka-1');
  await expect(cmd(page, 'Załóż kolonię')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await page.keyboard.press('c'); // Załóż kolonię → placement mode
  await expect(card(page)).toContainText('Postaw port');
  await page.keyboard.press('a'); // nearest valid tiles
  await expect(goal(page, 2)).toHaveClass(/is-done/, { timeout: 30_000 });

  // Shuttle down from the Ark, then build with the rovers
  await selectBody(page, 'tc-e');
  const panel = page.locator('wg-selection-panel');
  await panel.locator('[data-structure^="HQ@"]').click();
  await expect(card(page)).toContainText('Port kosmiczny');
  await page.keyboard.press('t'); // Wezwij prom
  await expect(page.locator('wg-top-bar')).toContainText('FER', { timeout: 20_000 });
  await expect
    .poll(async () => Number((await page.locator('wg-top-bar .hud-res').first().locator('.hud-res__value').textContent())?.replace(/\D/g, '')), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(80);

  for (const name of ['Turbina wiatrowa', 'Habitat', 'Kopalnia', 'Ekstraktor Kriolu', 'Wieża Silicytu']) {
    await selectBody(page, 'tc-e');
    await panel.locator('[data-structure^="HQ@"]').click({ timeout: 5_000 });
    await expect(card(page)).toContainText('Port kosmiczny');
    await page.keyboard.press('b'); // Buduj
    await page.locator('wg-selection-panel').getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(cmd(page, 'Najbliższe pole')).toBeVisible(); // placement card is up
    await page.keyboard.press('a'); // nearest valid tile
    await expect(page.locator('wg-log-panel')).toContainText(`Zlecono budowę: ${name}`);
  }
  await expect(goal(page, 3)).toHaveClass(/is-done/, { timeout: 60_000 });
  await expect(page.locator('wg-log-panel')).toContainText('Ukończono: Wieża Silicytu');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('preset address enters the game in the middle: #/scenariusz-kolonia', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/#/scenariusz-kolonia');
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 60_000 });
  for (let i = 0; i < 4; i++) await expect(goal(page, i)).toHaveClass(/is-done/);
  await expect(page.locator('wg-top-bar')).toContainText('Kol · Tau Ceti e');
  await expect(page.locator('wg-selection-panel')).toContainText('Wieża Silicytu');
  expect(errors).toEqual([]);
});

test('keys: views 1–3, Space pause, ` overlay; every command has a hotkey; focus is visible', async ({ page }) => {
  await page.goto('/#/scenariusz-przybycie');
  await expect(card(page)).toContainText('Arka-1');
  const views = page.getByRole('navigation', { name: 'Przełącznik widoku' });
  await page.keyboard.press('3');
  await expect(views.getByRole('button', { name: 'Galaktyka' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('2');
  await expect(views.getByRole('button', { name: 'Układ' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press(' ');
  await expect(page.getByRole('group', { name: 'Tempo czasu' }).getByRole('button', { name: 'Wznów' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('perf-overlay')).toBeVisible();
  await page.keyboard.press('`');
  await expect(page.getByTestId('perf-overlay')).toHaveCount(0);

  const shortcuts = await card(page).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-keyshortcuts')));
  expect(shortcuts.length).toBe(8);
  expect(shortcuts.every((k) => !!k)).toBe(true);

  const scanButton = cmd(page, 'Skanuj układ');
  await scanButton.focus();
  const outline = await page.evaluate(() => {
    const face = document.activeElement?.querySelector('.rts-btn__face');
    return face ? getComputedStyle(face, '::before').outlineStyle + '|' + getComputedStyle(face, '::before').borderStyle : '';
  });
  expect(outline).not.toBe('none|none');
});

test('no horizontal page scroll at laptop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/scenariusz-przybycie');
  await expect(card(page)).toContainText('Arka-1');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await expect(card(page)).toBeInViewport();
});
