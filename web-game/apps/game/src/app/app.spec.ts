import { TestBed } from '@angular/core/testing';
import type { BodyId, TileInfo } from '@space-game/api';
import { createInThreadGameApi } from '@space-game/mock-server';
import { CommandsService } from './game/commands';
import { GAME_API } from './game/game-api';
import { GameService } from './game/game.service';
import { UiState, placementPreview } from './game/ui-state';
import { TopBar } from './hud/top-bar';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('HUD on the mock server (in-thread GameApi)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: GAME_API, useValue: () => createInThreadGameApi({ autoRun: false }).api }],
    });
  });

  it('shows the Arka-1 card: scan available, colony blocked with its reason', async () => {
    const game = TestBed.inject(GameService);
    await game.start('tau-ceti');
    const card = TestBed.inject(CommandsService).card();
    expect(card.context).toBe('Arka-1');
    const scan = card.slots.find((s) => s?.id === 'scan')!;
    expect(scan).toMatchObject({ hotkey: 'Q', label: 'Skanuj układ' });
    expect(scan.disabledReason).toBeUndefined();
    expect(card.slots.find((s) => s?.id === 'colony')).toMatchObject({ disabledReason: 'Najpierw zeskanuj układ' });
    // every command has a hotkey (F3 done criterion)
    expect(card.slots.filter((s) => s && !s.hotkey)).toEqual([]);
  });

  it('runs the scan from the card and updates the log and the card', async () => {
    const game = TestBed.inject(GameService);
    await game.start('tau-ceti');
    const commands = TestBed.inject(CommandsService);
    commands.card().slots.find((s) => s?.id === 'scan')!.onActivate!();
    await settle();
    await settle();
    expect(game.world()!.scan.state).toBe('RUNNING');
    expect(game.log().map((l) => l.event.type)).toContain('SCAN_STARTED');
    expect(commands.card().slots.find((s) => s?.id === 'scan')!.disabledReason).toBe('Trwa skan układu');
  });

  it('top bar shows the Ark hold before the colony and the clock', async () => {
    const game = TestBed.inject(GameService);
    await game.start('tau-ceti');
    const fixture = TestBed.createComponent(TopBar);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const codes = Array.from(el.querySelectorAll('.hud-res__code')).map((c) => c.textContent);
    expect(codes.slice(0, 3)).toEqual(['STA', 'FER', 'SIL']);
    expect(el.querySelector('.hud-resbar__name')!.textContent).toBe('Układ Tau Ceti');
    expect(el.querySelector('.hud-micro')!.textContent).toContain('Dzień 1 · 00:00');
    expect(TestBed.inject(UiState).view()).toBe('system');
  });

  it('placement card: the price of the ghost from its check (terrain, T8), else the catalog; BAD_TERRAIN says why', async () => {
    const game = TestBed.inject(GameService);
    await game.start('tau-ceti');
    const ui = TestBed.inject(UiState);
    const commands = TestBed.inject(CommandsService);
    const place = () => commands.card().slots.find((s) => s?.id === 'place')!;
    ui.placement.set({ kind: 'SOL', rotation: 0, preview: null });
    expect(place()).toMatchObject({ label: 'Panel słoneczny', description: 'SIL 10 · 1 min' });
    ui.placement.set({ kind: 'SOL', rotation: 0, preview: placementPreview('SOL', 7, { ok: true, tiles: [7], cost: { SIL: 11 }, buildTime: 1.5 }) });
    expect(place().description).toBe('SIL 11 · 2 min');
    expect(place().disabledReason).toBeUndefined();
    ui.placement.set({ kind: 'SOL', rotation: 0, preview: placementPreview('SOL', 8, { ok: false, reason: 'BAD_TERRAIN', detail: 'woda', tiles: [8] }) });
    expect(place()).toMatchObject({ description: 'SIL 10 · 1 min', disabledReason: 'Teren nie nadaje się pod budowę: woda' });
  });

  it('catalog opened from a forest tile of Tau Ceti c: 1-tile kinds at the tile price, larger ones "zależy od pól" (T8)', async () => {
    const game = TestBed.inject(GameService);
    await game.start('tau-ceti');
    const ui = TestBed.inject(UiState);
    const commands = TestBed.inject(CommandsService);
    let forest: TileInfo | null = null;
    for (let i = 0; !forest; i++) {
      const ti = await game.tileInfo('tc-c' as BodyId, i);
      if (!ti) break;
      if (ti.terrain?.kind === 'forest' && !ti.terrain.road && !ti.deposit) forest = ti;
    }
    expect(forest).not.toBeNull();
    ui.select({ kind: 'TILE', bodyId: forest!.bodyId, tileIndex: forest!.index });
    commands.tile.set(forest);
    const rows = () => commands.buildList();
    const sol = () => rows().find((b) => b.id === 'SOL')!;
    expect(commands.buildTile()).toBe(forest);
    expect(sol()).toMatchObject({ cost: [{ code: 'SIL', amount: 11 }], minutes: 1.5, perTiles: false });
    const large = rows().filter((b) => b.footprint > 1);
    expect(large.length).toBeGreaterThan(0);
    for (const b of large) {
      expect(b.perTiles, b.id).toBe(true);
      expect(b.cost.map((c) => [c.code, c.amount]), b.id).toEqual(Object.entries(game.catalog()!.buildings.find((x) => x.id === b.id)!.levels[0]!.cost));
    }
    // not aimed at a tile: catalog prices
    ui.select({ kind: 'NONE' });
    expect(sol()).toMatchObject({ cost: [{ code: 'SIL', amount: 10 }], minutes: 1, perTiles: false });
    expect(rows().some((b) => b.perTiles)).toBe(false);
  });
});
