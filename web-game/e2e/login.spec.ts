import { expect, test, type Page } from '@playwright/test';

// R-25: accounts on the game server (chromium-remote). A commander registers on the login page and
// plays, logs out, is refused with a wrong code and logs in again; the session is the server's
// HttpOnly cookie (the page asks the server who is logged in). Offline (mock, wasm) any identifier
// enters the game.

const ready = (page: Page) => page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
const button = (page: Page, label: string) => page.locator('form.auth button', { hasText: label });

async function sessionOf(page: Page): Promise<{ callsign: string } | null> {
  const r = await page.request.get('/api/session');
  return r.status() === 200 ? ((await r.json()) as { callsign: string }) : null;
}

test('login page: register, play, log out, a wrong code, log in again (remote)', async ({ page }, info) => {
  await page.goto('/#/logowanie');
  if (info.project.name !== 'chromium-remote') {
    await page.locator('#login-id').fill('Kestrel');
    await button(page, 'Zaloguj i przejmij statek').click();
    await page.waitForURL(/#\/gra/);
    await ready(page);
    return;
  }
  const callsign = `Pilot-${Date.now().toString(36).slice(-5)}`;
  const error = page.locator('[data-login-error]');

  // a new account: the code is needed
  await page.locator('#login-id').fill(callsign);
  await button(page, 'Załóż konto').click();
  await expect(error).toHaveText('Podaj znak wywoławczy i kod dostępu');
  await page.locator('#login-code').fill('haslo-123');
  await button(page, 'Załóż konto').click();
  await page.waitForURL(/#\/gra/);
  await ready(page);
  expect((await sessionOf(page))?.callsign).toBe(callsign);

  // logged in: the login page offers to continue or to log out
  await page.goto('/#/logowanie');
  await expect(page.locator('[data-session]')).toHaveAttribute('data-callsign', callsign);
  await button(page, 'Wyloguj').click();
  await expect(page.locator('#login-id')).toBeVisible();
  expect(await sessionOf(page)).toBeNull();

  // a wrong code is refused by the server; the right one logs in
  await page.locator('#login-id').fill(callsign.toLowerCase());
  await page.locator('#login-code').fill('zle-haslo');
  await page.keyboard.press('Enter');
  await expect(error).toHaveText('błędny kod dostępu');
  await page.locator('#login-code').fill('haslo-123');
  await button(page, 'Zaloguj i przejmij statek').click();
  await page.waitForURL(/#\/gra/);
  await ready(page);
  expect((await sessionOf(page))?.callsign).toBe(callsign);
});
