import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// F6: the designer panel on the colony preset (mock in the Web Worker).

const panel = (page: Page) => page.locator('[data-designer]');

async function openDesigner(page: Page): Promise<void> {
  await page.goto('/#/scenariusz-kolonia');
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  await page.keyboard.press('F2');
  await expect(panel(page)).toBeVisible();
}

async function setParam(page: Page, key: string, value: string): Promise<void> {
  const input = panel(page).locator(`[data-param="${key}"]`);
  await input.fill(value);
  await input.press('Tab');
}

test('a parameter changes the document-vs-draft tables; "nowa gra" restarts with it', async ({ page }) => {
  await openDesigner(page);
  const p = panel(page);
  await expect(p.locator('[data-economy]')).toHaveText('Ekonomia gry: dokument');

  await p.locator('[data-tab="tables"]').click();
  const eras = p.locator('[data-table="eras"] tbody tr');
  await expect(eras).toHaveCount(5);
  await expect(p.locator('[data-table="eras"] tr.is-changed')).toHaveCount(0);

  await p.locator('[data-tab="params"]').click();
  await setParam(page, 'energyPrice', '0.2');
  await expect(p.locator('label.is-changed')).toHaveCount(1);
  await expect(p.locator('label.is-changed')).toContainText('dok. 0,1');

  await p.locator('[data-tab="tables"]').click();
  await p.locator('[data-section="materials"]').click();
  await expect(p.locator('[data-table="materials"] tr.is-changed').first()).toBeVisible();

  await p.locator('[data-tab="params"]').click();
  await p.locator('[data-action="apply-new"]').click();
  await expect(p.locator('[data-message]')).toHaveText('Zastosowano parametry.');
  await expect(p.locator('[data-economy]')).toHaveText('Ekonomia gry: zmieniona (1 parametr)');
  // the scenario starts again from the arrival
  await expect(page.locator('.hud-resbar__name')).toHaveText('Układ Tau Ceti');
});

test('"odtwórz tę grę" replays the colony with dearer buildings and reports rejected commands', async ({ page }) => {
  await openDesigner(page);
  const p = panel(page);
  await setParam(page, 'costGrowth', '3');
  await setParam(page, 'payback.1', '120');
  await p.locator('[data-action="apply-replay"]').click();
  await expect(p.locator('[data-message]')).toHaveText(/^Odtworzono grę z nowymi parametrami\. Odrzucone rozkazy przy odtworzeniu: \d+\.$/, { timeout: 60_000 });
  await expect(p.locator('[data-economy]')).toHaveText('Ekonomia gry: zmieniona (2 parametry)');
});

test('flows: power chart with a hover readout, document vs measured rates, the event log', async ({ page }) => {
  await openDesigner(page);
  const p = panel(page);
  await page.locator('.seg button', { hasText: '×600' }).click();
  await p.locator('[data-tab="flows"]').click();

  const power = p.locator('[data-chart="power"]');
  await expect(power.locator('path.line')).toHaveCount(2, { timeout: 20_000 });
  const box = (await power.locator('svg').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect(power.locator('.tip')).toContainText('MW');
  await expect(p.locator('[data-chart^="stock-"]').first()).toBeVisible();

  const fer = p.locator('[data-table="rates"] tbody tr', { hasText: 'FER' }).filter({ hasText: 'wydobycie' });
  await expect(fer).toHaveCount(1, { timeout: 20_000 });
  await expect(p.locator('[data-flows-window]')).toContainText('Sprawność mocy P1');

  await p.locator('[data-tab="log"]').click();
  await expect(p.locator('[data-list="events"] li').first()).toBeVisible();
  await p.locator('[data-scope="ticks"]').click();
  await expect(p.locator('[data-list="events"] li', { hasText: 'EXTRACTION_TICK' }).first()).toBeVisible();
});

test('Atanor: the measured solution appears next to the document and goes into the draft', async ({ page }) => {
  await openDesigner(page);
  const p = panel(page);
  await p.locator('[data-tab="atanor"]').click();
  await p.locator('[data-action="open-atanor"]').click();
  await expect(p.locator('[data-atanor-now]')).toContainText('cykle na produkt', { timeout: 40_000 });
  await expect(p.locator('[data-table="atanor"] tr.is-changed')).toHaveCount(1);
  await p.locator('[data-action="use-measured"]').click();
  await p.locator('[data-tab="params"]').click();
  await expect(p.getByText('Zmierzone receptury Atanora w szkicu: 1')).toBeVisible();
});

test('save export and import: the file round-trips; a foreign file is refused', async ({ page }) => {
  await openDesigner(page);
  const p = panel(page);
  await p.locator('[data-tab="file"]').click();

  const [download] = await Promise.all([page.waitForEvent('download'), p.locator('[data-action="export-save"]').click()]);
  expect(download.suggestedFilename()).toMatch(/^space-game-tau-ceti-krok-\d+\.json$/);
  const text = readFileSync(await download.path(), 'utf8');
  const file = JSON.parse(text);
  expect(file).toMatchObject({ format: 'space-game-save', version: 1, scenarioId: 'tau-ceti' });
  expect(file.commands.length).toBeGreaterThan(5);

  // Playwright stores the download under a random name: upload it under the suggested one
  await p.locator('[data-input="load"]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(p.locator('[data-message]')).toHaveText(`Wczytano ${download.suggestedFilename()}.`);
  await expect(p.locator('[data-file-summary]')).toContainText('tau-ceti');

  await p.locator('[data-input="load"]').setInputFiles({ name: 'obcy.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(p.locator('[data-message]')).toHaveText('To nie jest plik zapisu web-game (format space-game-save, wersja 1).');
});
