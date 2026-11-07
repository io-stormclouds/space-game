import { expect, test, type Page } from '@playwright/test';

// F0 acceptance: the empty shell shows the resource bar, a frame and the command card from the
// design system, without console errors and without horizontal scrolling.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('shell shows the resource bar, frame and command card', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  const bar = page.getByRole('banner', { name: 'Surowce' });
  await expect(bar).toBeVisible();
  await expect(bar.locator('.hud-res')).toHaveCount(8);
  await expect(bar.locator('.hud-res[data-state="low"] .hud-res__code')).toHaveText('KAR');
  await expect(bar.locator('.hud-res').filter({ hasText: 'ENE' })).toContainText('21,5/28MW');

  await expect(page.getByRole('heading', { name: 'Widok świata' })).toBeVisible();

  const card = page.getByRole('region', { name: 'CMD: Port kosmiczny · poz. 2' });
  await expect(card).toBeVisible();
  await expect(card.locator('.hud-cmd__cell')).toHaveCount(8);
  await expect(card.getByRole('button')).toHaveCount(6);
  await expect(card.locator('.hud-cmd__cell--empty')).toHaveCount(2);

  const fontReady = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('12px "JetBrains Mono"', 'Łazik');
  });
  expect(fontReady).toBe(true);

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

// W17: desktop only; 1280 is a common laptop width below the canvas' 1440.
test('no horizontal page scroll at laptop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: /^CMD:/ })).toBeInViewport();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test('hotkey runs a command and the inspector describes it', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: /^CMD:/ });

  await page.keyboard.press('q');
  await expect(card.locator('.hud-cmd__insp-title')).toHaveText('Produkuj łazik');
  await expect(card.locator('.hud-cmd__insp-cost')).toHaveText(/FER 20\s*SIL 5/);
  await expect(page.locator('.shell__log-value')).toHaveText('Produkuj łazik');
});

test('a blocked command explains why and does not run', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: /^CMD:/ });
  const upgrade = card.getByRole('button', { name: 'Rozbuduj do L3' });

  await expect(upgrade).toHaveAttribute('aria-disabled', 'true');
  await expect(upgrade).toHaveAccessibleDescription('BRAK: FER 2088 · SIL 1012 · STA 145');

  await page.keyboard.press('u');
  await expect(card.locator('.hud-cmd__insp-reason')).toHaveText('BRAK: FER 2088 · SIL 1012 · STA 145');
  // Playwright waits for aria-disabled elements to become enabled; a player can still click it.
  await upgrade.click({ force: true });
  await expect(page.locator('.shell__log-value')).toHaveCount(0);
});
