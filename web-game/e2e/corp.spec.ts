import { expect, test, type Page } from '@playwright/test';

// S2: the corporation panel (F4). Through the game server (chromium-remote): a corporation founded,
// credits paid into its treasury and taken out by the chief, both in the ledger; a notice on the
// board; the chief alone dissolves it. Several accounts are in the WebSocket test of the server.
// Without the server the panel says that corporations need it.

const corpPanel = (page: Page) => page.locator('[data-corp]');

test('the corporation panel: found, deposit, withdraw, notice, dissolve (remote only)', async ({ page }, info) => {
  await page.goto('/#/scenariusz-kolonia');
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  await page.keyboard.press('F4');
  const corp = corpPanel(page);
  await expect(corp).toBeVisible();
  if (info.project.name !== 'chromium-remote') {
    await expect(corp.locator('[data-offline]')).toContainText('na serwerze');
    return;
  }
  // F3 swaps it for the hub panel and back
  await page.keyboard.press('F3');
  await expect(page.locator('[data-hub]')).toBeVisible();
  await expect(corp).toHaveCount(0);
  await page.keyboard.press('F4');
  await expect(corp).toBeVisible();

  // a unique name and tag per run (guest accounts share the server)
  const n = Date.now().toString(36).slice(-3).toUpperCase();
  await corp.locator('[data-input="name"]').fill(`Gildia ${n}`);
  await corp.locator('[data-input="tag"]').fill(`G${n}`);
  await corp.locator('[data-input="seat"]').selectOption('hub-sol');
  await corp.locator('[data-action="found"]').click();
  await expect(corp.locator('[data-message]')).toHaveText('Korporacja założona');
  await expect(corp.locator('[data-corp-name]')).toHaveText(`Gildia ${n}`);
  await expect(corp.locator('[data-list="members"] [data-role="chief"]')).toHaveCount(1);
  await expect(corp.locator('[data-list="corporations"]')).toContainText(`Gildia ${n} [G${n}]`);

  // the treasury: a deposit and a withdrawal, both in the ledger (newest first)
  const treasury = corp.locator('[data-treasury]');
  await corp.locator('[data-input="amount"]').fill('120');
  await corp.locator('[data-input="note"]').fill('na start');
  await corp.locator('[data-action="deposit"]').click();
  await expect(corp.locator('[data-message]')).toHaveText('Wpłata w dzienniku');
  await expect(treasury).toHaveAttribute('data-credits', '120');
  await corp.locator('[data-input="amount"]').fill('45');
  await corp.locator('[data-action="withdraw"]').click();
  await expect(corp.locator('[data-message]')).toHaveText('Wypłata w dzienniku');
  await expect(treasury).toHaveAttribute('data-credits', '75');
  const ledger = corp.locator('[data-list="ledger"] li');
  await expect(ledger).toHaveCount(2);
  await expect(ledger.nth(0)).toHaveAttribute('data-kind', 'withdrawal');
  await expect(ledger.nth(1)).toContainText('wpłata 120,00 kr · na start');

  // the board
  await corp.locator('[data-input="notice"]').fill('Zbiórka w hubie Słońce');
  await corp.locator('[data-action="post"]').click();
  await expect(corp.locator('[data-list="board"]')).toContainText('Zbiórka w hubie Słońce');

  // alone, the chief dissolves it: the treasury goes back
  await corp.locator('[data-action="leave"]').click();
  await expect(corp.locator('[data-message]')).toHaveText('Opuszczono korporację');
  await expect(corp.locator('[data-action="found"]')).toBeVisible();
  await expect(corp.locator('[data-list="corporations"]')).not.toContainText(`Gildia ${n}`);
});
