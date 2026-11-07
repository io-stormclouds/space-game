import { expect, test, type Page } from '@playwright/test';

// The Atanor as the view of one Fabryka atanorowa (docs/atanor-expansion-design.md, AT1–AT4):
// opened from the building's card on the planet, back with Esc.

type Point = { x: number; y: number };
type Hook = {
  frontTiles(id: string): Array<Point & { index: number }>;
  structures(kind: string): Array<{ id: string; bodyId: string; tiles: number[] }>;
  atanorHex(q: number, r: number): Point | null;
};
const hex = (page: Page, q: number, r: number) => page.evaluate(([q, r]) => (window as Window & { wgWorld?: Hook }).wgWorld!.atanorHex(q, r)!, [q, r] as const);
const cell = (page: Page, arm: string, col: number) => page.locator(`[data-arm="${arm}"] [data-col="${col}"]`);
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

  // the design rests at tick 0 until the trial; pause and one step in the trial
  const ticks = panel(page).locator('[data-atanor="ticks"]');
  await page.waitForTimeout(1000);
  await expect(ticks).toHaveText('0');
  await page.keyboard.press('t');
  await expect(card(page)).toContainText('Próba');
  await expect.poll(async () => Number(await ticks.textContent()), { timeout: 15_000 }).toBeGreaterThan(2);
  await page.keyboard.press('p');
  await page.waitForTimeout(500); // the readout refreshes at ~4 Hz
  const paused = Number(await ticks.textContent());
  await page.waitForTimeout(1200);
  expect(Number(await ticks.textContent())).toBe(paused);
  await page.keyboard.press('k');
  await expect(ticks).toHaveText(String(paused + 1));

  // Esc ends the trial, the next Esc goes back to the planet with the factory still selected
  await page.keyboard.press('Escape');
  await expect(card(page)).toContainText('Projekt');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await perf(page))['view'], { timeout: 15_000 }).toBe('planet');
  await expect(card(page)).toContainText('Fabryka atanorowa · poz. 1');
});

test('design file (AT6): the sandbox reference exported, loaded into the building, measured again; a foreign file refused', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  // the sandbox shows the A_NAD reference: export it
  await page.keyboard.press('F2');
  await page.locator('wg-designer-panel [data-tab="atanor"]').click();
  await page.locator('wg-designer-panel [data-action="open-atanor"]').click();
  await page.keyboard.press('F2');
  const machine = page.locator('wg-atanor-machine');
  await expect(panel(page).locator('[data-atanor="cycles"]')).toHaveText('12');
  const [download] = await Promise.all([page.waitForEvent('download'), machine.locator('[data-action="export-design"]').click()]);
  expect(download.suggestedFilename()).toBe('atanor-A_NAD.json');
  const chunks: Buffer[] = [];
  for await (const c of (await download.createReadStream())!) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(JSON.parse(text)).toMatchObject({ format: 'web-game-atanor-design', recipe: 'A_NAD', claimed: { cycles: 12, area: 13, arms: 2 } });

  // into the factory's machine (it starts from the hint): the file's numbers are measured again
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  await selectFactory(page);
  await page.keyboard.press('a');
  await expect(panel(page).locator('[data-atanor="cycles"]')).toHaveText('—');
  const input = machine.locator('[data-input="design-file"]');
  await input.setInputFiles({ name: 'atanor-A_NAD.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(machine.locator('[data-machine="file"]')).toContainText('zgodne');
  await expect(panel(page).locator('[data-atanor="cycles"]')).toHaveText('12');
  await input.setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"web-game-save"}') });
  await expect(machine.locator('[data-machine="file"]')).toContainText('To nie jest plik projektu');
});

test('editor: the A_NAD machine built from the hint on the board and the timeline produces in the trial', async ({ page }) => {
  test.setTimeout(150_000);
  await ready(page);
  await selectFactory(page);
  await page.keyboard.press('a');
  await expect(card(page)).toContainText('Projekt');

  // the building level decides the tools (§8.1): no transmutation for A_NAD, tracks from L3
  await expect(card(page).getByRole('button', { name: /^Transmutacja/ })).toHaveAccessibleDescription('Receptura nie wymaga transmutacji');
  await expect(card(page).getByRole('button', { name: /^Szyna/ })).toHaveAccessibleDescription('Od poziomu L3 budynku');
  // the hint (A21): the reference arms, no program, nothing measured yet
  await expect(page.locator('[data-arm]')).toHaveCount(2);
  await expect(panel(page).locator('[data-atanor="cycles"]')).toHaveText('—');

  // three bonders around the PLA port (0,0): directions 0, 2 and 4 (R turns the ghost)
  await page.keyboard.press('d');
  for (const turns of [0, 2, 2]) {
    for (let i = 0; i < turns; i++) await page.keyboard.press('r');
    const p = await hex(page, 0, 0);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  }
  // a bonder whose second hex is off the L1 board (radius 2): refused with the reason
  await page.keyboard.press('r');
  await page.keyboard.press('r'); // direction 0 again
  const edge = await hex(page, 2, 0);
  await page.mouse.click(edge.x, edge.y);
  await expect(card(page)).toContainText('Poza planszą tego poziomu budynku');
  await page.mouse.click(5, 450, { button: 'right' }); // tool away

  // the reference program typed with the PoC palette keys (the cursor moves on)
  await cell(page, 'arm-1', 0).click({ button: 'right' });
  await page.keyboard.type('qewrqrrrweeex');
  await cell(page, 'arm-2', 0).click({ button: 'right' });
  await page.keyboard.type('qrr');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('ee');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('x');
  await expect(panel(page).locator('[data-atanor="cycles"]')).toHaveText('12'); // like the reference

  // AT3, panel "Maszyna": 12 cycles × takt 1,0 min (L1) = 12 min, 5 per hour; the economy prices
  // this machine; no producer of PLA on the body: the bottleneck, with the hours of stock left
  const machine = page.locator('wg-atanor-machine');
  await expect(machine.locator('[data-machine="time"]')).toHaveText('12 min');
  await expect(machine.locator('[data-machine="per-hour"]')).toHaveText('5');
  await expect(machine.locator('[data-machine="unit-value"]')).toContainText('kr');
  await expect(machine.locator('[data-machine="margin"]')).toContainText('%');
  await expect(machine.locator('[data-machine="bottleneck"]')).toContainText('Wąskie gardło');
  await expect(machine.locator('[data-machine="materials"]')).toContainText('STA');
  await machine.locator('[data-action="save-variant"]').click();
  await expect(machine.locator('[data-variant]')).toHaveCount(1);

  // undo and redo (Ctrl+Z / Ctrl+Y) of the last command
  await page.keyboard.press('Control+z');
  await expect(cell(page, 'arm-2', 12)).toHaveText('');
  await page.keyboard.press('Control+y');
  await expect(cell(page, 'arm-2', 12)).toHaveText('⮌');

  // the trial delivers products
  await card(page).getByRole('button', { name: /^Próba/ }).click();
  await expect.poll(async () => Number((await panel(page).locator('[data-atanor="delivered"]').textContent())?.split('/')[0]), { timeout: 40_000 }).toBeGreaterThan(0);

  // the draft stays with the building: back to the planet and in again
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await perf(page))['view'], { timeout: 15_000 }).toBe('planet');
  await page.keyboard.press('a');
  await expect(panel(page).locator('[data-atanor="cycles"]')).toHaveText('12');

  // AT4: deploy from the trial (W); the machine is built in game time, then produces in the world
  await page.keyboard.press('t');
  await expect(card(page).getByRole('button', { name: /^Wdróż/ })).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
  await page.keyboard.press('w');
  await expect(machine.locator('[data-machine="deploying"]')).toBeVisible();
  await expect(card(page)).toContainText('Projekt'); // the trial ends with the deployment
  await page.getByRole('group', { name: 'Tempo czasu' }).getByRole('button', { name: '×600' }).click();
  await expect(machine.locator('[data-machine="production"]')).toHaveAttribute('data-state', 'RUNNING', { timeout: 40_000 });
  await expect(machine.locator('[data-machine="deploying"]')).toHaveCount(0);
  await expect.poll(async () => Number((await machine.locator('[data-machine="delivered"]').textContent())?.match(/(\d+) szt\./)?.[1] ?? 0), { timeout: 40_000 }).toBeGreaterThan(0);

  // V: the working machine (the view follows the world's ticks), V again: the draft
  await page.keyboard.press('v');
  await expect(card(page)).toContainText('Produkcja');
  await expect.poll(async () => Number(await panel(page).locator('[data-atanor="ticks"]').textContent()), { timeout: 15_000 }).toBeGreaterThan(5);
  await page.keyboard.press('v');
  await expect(card(page)).toContainText('Projekt');
});
