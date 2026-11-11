import { expect, test, type Locator, type Page } from '@playwright/test';

// S3 (05-SOCIAL §5–7): a corporation's terminal built from goods bought in its seat hub (through the
// hub panel, F3), then given in the corporation panel (F4); an alliance founded; the season's
// rankings (F7) show the player and the corporation. Through the game server (chromium-remote);
// two corporations completing an alliance's gate and a season turning are in the server's WebSocket
// test. Without the server the rankings say that they need it.

test.describe.configure({ timeout: 120_000 });

const attr = async (l: Locator, name: string) => Number(await l.getAttribute(name));

async function buy(page: Page, hubId: string, material: string, quantity: number): Promise<void> {
  // F3 toggles: open the hub panel only when it is closed
  const toggle = page.locator('header [data-action="hub"]');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await page.keyboard.press('F3');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const hub = page.locator('[data-hub]');
  await expect(hub).toBeVisible();
  await hub.locator(`[data-hub-id="${hubId}"]`).click();
  const row = hub.locator(`tr[data-material="${material}"]`);
  await row.click();
  const trade = hub.locator('[data-trade]');
  await trade.locator('[data-input="quantity"]').fill(String(quantity));
  await trade.locator('[data-input="price"]').fill(String(await attr(row, 'data-ask')));
  await trade.locator('[data-action="buy"]').click();
  await expect(hub.locator('[data-message]')).toHaveText(`Zrealizowano ${quantity}`);
}

test('a terminal from bought goods, an alliance, the rankings (remote only)', async ({ page }, info) => {
  await page.goto('/#/scenariusz-kolonia');
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  if (info.project.name !== 'chromium-remote') {
    await page.keyboard.press('F7');
    await expect(page.locator('[data-rankings] [data-offline]')).toContainText('na serwerze');
    return;
  }
  const n = Date.now().toString(36).slice(-3).toUpperCase();
  await page.keyboard.press('F4');
  const corp = page.locator('[data-corp]');
  await corp.locator('[data-input="name"]').fill(`Stocznia ${n}`);
  await corp.locator('[data-input="tag"]').fill(`S${n}`);
  await corp.locator('[data-input="seat"]').selectOption('hub-sol');
  await corp.locator('[data-action="found"]').click();
  await expect(corp.locator('[data-corp-name]')).toHaveText(`Stocznia ${n}`);

  // the terminal in the seat hub: what it needs (dev scale) …
  await corp.locator('[data-input="mega-kind"]').selectOption('terminal');
  await corp.locator('[data-action="start-project"]').click();
  await expect(corp.locator('[data-projects-message]')).toHaveText('Megaprojekt rozpoczęty');
  const project = corp.locator('[data-project="terminal"]');
  await expect(project).toHaveAttribute('data-done', 'false');
  const needs: Array<[string, number]> = [];
  for (const el of await project.locator('[data-need]').all()) {
    const m = (await el.getAttribute('data-need'))!;
    const need = Number((await el.textContent())!.split('/')[1]!.trim().replace(',', '.'));
    needs.push([m, need]);
  }
  expect(needs.map(([m]) => m).sort()).toEqual(['BET', 'PRZ', 'STA', 'UKL']);

  // … bought from the faction in the hub, then given
  for (const [m, q] of needs) await buy(page, 'hub-sol', m, q);
  await page.keyboard.press('F4');
  await expect(project.locator('[data-action="give"]')).toBeEnabled();
  await project.locator('[data-action="give"]').click();
  await expect(corp.locator('[data-projects-message]')).toHaveText('Megaprojekt ukończony');
  await expect(project).toHaveAttribute('data-done', 'true');
  await expect(project).toContainText('prowizja członków w hubie −1 pp');

  // an alliance of the chief's corporation
  await corp.locator('[data-input="alliance-name"]').fill(`Pakt ${n}`);
  await corp.locator('[data-action="found-alliance"]').click();
  await expect(corp.locator('[data-alliance]')).toHaveAttribute('data-alliance-name', `Pakt ${n}`);
  await expect(corp.locator(`[data-alliance-member="S${n}"]`)).toContainText('prowadzi');

  // the season's rankings: the player and the corporation are there
  await page.keyboard.press('F7');
  const ranks = page.locator('[data-rankings]');
  await expect(ranks.locator('[data-season]')).toHaveAttribute('data-number', /\d+/);
  await expect(ranks.locator('[data-list="corporations"]')).toContainText(`Stocznia ${n} [S${n}]`);
  await expect(ranks.locator('[data-list="netWorth"] li').first()).not.toHaveText('nikt jeszcze');
  await expect(ranks.locator('[data-mine]')).toHaveAttribute('data-place', /[1-9]/);
});
