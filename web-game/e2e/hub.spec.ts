import { expect, test, type Locator, type Page } from '@playwright/test';

// B6: the hub panel (F3). Through the game server (chromium-remote): goods go from the colony to
// the nearest hub, are sold to its faction, bought back, and come home into the colony's storage.
// Without the server (mock, WASM offline) the panel says that trade needs it.

const hubPanel = (page: Page) => page.locator('[data-hub]');

async function openHub(page: Page): Promise<Locator> {
  await page.goto('/#/scenariusz-kolonia');
  await page.locator('.game[data-ready="true"]').waitFor({ timeout: 90_000 });
  await page.keyboard.press('F3');
  await expect(hubPanel(page)).toBeVisible();
  return hubPanel(page);
}

const attr = async (l: Locator, name: string) => Number(await l.getAttribute(name));

test('the hub panel: ship to a hub, sell to its faction, buy back and bring home (remote only)', async ({ page }, info) => {
  const hub = await openHub(page);
  if (info.project.name !== 'chromium-remote') {
    await expect(hub.locator('[data-offline]')).toContainText('na serwerze');
    return;
  }
  // paused: the colony's storage changes only by the shipments
  const pause = page.locator('header [role="group"] button').first();
  if ((await pause.getAttribute('aria-pressed')) !== 'true') await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const credits = hub.locator('[data-credits]');
  await expect(credits).toHaveAttribute('data-value', '1000');
  // Epsilon Eridani is the nearest hub to Tau Ceti: a shipment takes seconds in DEV_MODE
  await hub.locator('[data-hub-id="hub-eridani"]').click();
  await expect(hub.locator('[data-hub-info]')).toContainText('Spółka Kriogen');

  // a material the colony has enough of
  const rows = hub.locator('tr[data-material]');
  await expect(rows.first()).toBeVisible();
  let row: Locator | null = null;
  for (let i = 0; i < (await rows.count()); i++) {
    const r = rows.nth(i);
    if ((await attr(r, 'data-colony')) >= 20 && (await attr(r, 'data-bid')) > 0) {
      row = r;
      break;
    }
  }
  expect(row, 'a material with stock in the colony').not.toBeNull();
  const material = (await row!.getAttribute('data-material'))!;
  const before = await attr(row!, 'data-colony');
  await row!.click();
  const trade = hub.locator('[data-trade]');
  await trade.locator('[data-input="quantity"]').fill('10');

  // colony → hub
  await trade.locator('[data-action="ship-to-hub"]').click();
  await expect(hub.locator('[data-message]')).toHaveText('Ładunek wysłany');
  await expect(row!).toHaveAttribute('data-colony', String(before - 10));
  await expect(hub.locator('[data-list="shipments"] [data-direction="toHub"]')).toHaveCount(1);
  await expect(row!).toHaveAttribute('data-stock', '10', { timeout: 30_000 });

  // sold to the faction at its bid: credits go up
  const bid = await attr(row!, 'data-bid');
  await trade.locator('[data-input="price"]').fill(String(bid));
  await trade.locator('[data-action="sell"]').click();
  await expect(hub.locator('[data-message]')).toHaveText('Zrealizowano 10');
  await expect(row!).toHaveAttribute('data-stock', '0');
  await expect.poll(async () => attr(credits, 'data-value')).toBeGreaterThan(1000);
  await expect(hub.locator('[data-list="trades"] li').first()).toContainText(`sprzedano 10 ${material}`);

  // bought back at its ask, then home
  const ask = await attr(row!, 'data-ask');
  await trade.locator('[data-input="quantity"]').fill('5');
  await trade.locator('[data-input="price"]').fill(String(ask));
  await trade.locator('[data-action="buy"]').click();
  await expect(hub.locator('[data-message]')).toHaveText('Zrealizowano 5');
  await expect(row!).toHaveAttribute('data-stock', '5');
  await trade.locator('[data-action="ship-home"]').click();
  await expect(hub.locator('[data-list="shipments"] [data-direction="toColony"]')).toHaveCount(1);
  await expect(row!).toHaveAttribute('data-stock', '0');
  // the delivery lands in the colony's storage (a HUB_DELIVERY in the world's log)
  await expect(row!).toHaveAttribute('data-colony', String(before - 10 + 5), { timeout: 30_000 });
  await expect(hub.locator('[data-list="shipments"] [data-shipment]')).toHaveCount(0);

  // an order inside the spread waits in the book and can be cancelled
  await trade.locator('[data-input="quantity"]').fill('1');
  await trade.locator('[data-input="price"]').fill('0.01');
  await trade.locator('[data-action="buy"]').click();
  await expect(hub.locator('[data-message]')).toHaveText('Zlecenie czeka w księdze');
  await expect(hub.locator('[data-list="orders"] [data-order]')).toHaveCount(1);
  await hub.locator('[data-list="orders"] [data-action="cancel"]').click();
  await expect(hub.locator('[data-list="orders"] [data-order]')).toHaveCount(0);
});

test("a faction's contract: taken, its goods bought in the hub, delivered and paid (remote only)", async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-remote', 'contracts come from the galaxy service');
  const hub = await openHub(page);
  const credits = hub.locator('[data-credits]');
  await expect(credits).toHaveAttribute('data-value', '1000');

  // the cheapest ordinary contract of all hubs (what its goods cost at the faction's ask with the fee and duty)
  let best: { hubId: string; id: string; material: string; quantity: number; cost: number } | null = null;
  for (const hubId of ['hub-sirius', 'hub-sol', 'hub-procyon', 'hub-eridani']) {
    await hub.locator(`[data-hub-id="${hubId}"]`).click();
    const rows = hub.locator('[data-list="contracts"] [data-contract][data-state="open"][data-min-rep="0"]');
    await expect(rows.first()).toBeVisible();
    for (let i = 0; i < (await rows.count()); i++) {
      const r = rows.nth(i);
      const material = (await r.getAttribute('data-material'))!;
      const quantity = await attr(r, 'data-quantity');
      const ask = await attr(hub.locator(`tr[data-material="${material}"]`), 'data-ask');
      const cost = quantity * ask * 1.07;
      if (!best || cost < best.cost) best = { hubId, id: (await r.getAttribute('data-contract'))!, material, quantity, cost };
    }
  }
  expect(best!.cost, 'an affordable contract').toBeLessThan(1000);
  const c = best!;
  await hub.locator(`[data-hub-id="${c.hubId}"]`).click();
  const row = hub.locator(`[data-contract="${c.id}"]`);
  await row.locator('[data-action="take"]').click();
  await expect(hub.locator('[data-message]')).toContainText('Kontrakt przyjęty');
  await expect(row).toHaveAttribute('data-state', 'taken');

  // the goods from the faction in that hub
  const quote = hub.locator(`tr[data-material="${c.material}"]`);
  await quote.click();
  const trade = hub.locator('[data-trade]');
  await trade.locator('[data-input="quantity"]').fill(String(c.quantity));
  await trade.locator('[data-input="price"]').fill(String(await attr(quote, 'data-ask')));
  await trade.locator('[data-action="buy"]').click();
  await expect(hub.locator('[data-message]')).toHaveText(`Zrealizowano ${c.quantity.toLocaleString('pl-PL')}`);
  await expect(quote).toHaveAttribute('data-stock', String(c.quantity));

  const before = await attr(credits, 'data-value');
  const reward = await attr(row, 'data-reward');
  await row.locator('[data-action="deliver"]').click();
  await expect(hub.locator('[data-message]')).toContainText('Kontrakt rozliczony');
  await expect(row).toHaveAttribute('data-state', 'delivered');
  await expect(quote).toHaveAttribute('data-stock', '0');
  await expect.poll(async () => Math.abs((await attr(credits, 'data-value')) - (before + reward))).toBeLessThan(0.011);
  await expect.poll(async () => attr(hub.locator('[data-standing]'), 'data-reputation')).toBeGreaterThanOrEqual(5);
});
