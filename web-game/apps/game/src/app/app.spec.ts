import { TestBed } from '@angular/core/testing';
import { createInThreadGameApi } from '@space-game/mock-server';
import { CommandsService } from './game/commands';
import { GAME_API } from './game/game-api';
import { GameService } from './game/game.service';
import { UiState } from './game/ui-state';
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
});
