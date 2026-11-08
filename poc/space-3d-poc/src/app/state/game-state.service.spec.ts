import { TestBed } from '@angular/core/testing';
import { INITIAL_STOCKPILE } from '../game/config/initial-world';
import { ASTEROID_ID, MOON_ID, PLANET_ID, SHIP_ID } from '../game/config/initial-world';
import { TransferPlan } from '../game/models/transfer.model';
import { vec3 } from '../game/math/vec3';
import { GameStateService } from './game-state.service';

describe('GameStateService', () => {
  let state: GameStateService;

  const plan = (to = MOON_ID, fuelCost = 20): TransferPlan => ({
    shipId: SHIP_ID,
    fromBodyId: PLANET_ID,
    toBodyId: to,
    startTime: 0,
    startPos: vec3(),
    leadPos: vec3(),
    cruiseSpeed: 150,
    estimatedDuration: 5,
    fuelCost,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(GameStateService);
  });

  it('starts with the initial world', () => {
    expect(state.spacecraft()).toHaveLength(1);
    expect(state.homeBase().id).toBe(PLANET_ID);
    expect(state.stockpile()).toEqual(INITIAL_STOCKPILE);
    expect(state.structures().filter((s) => s.bodyId === PLANET_ID).map((s) => s.kind)).toEqual(['LANDING_PAD', 'SOLAR']);
    // each showcase colony brings its own landing pad and solar panel
    expect(state.structures().filter((s) => s.bodyId !== PLANET_ID).map((s) => s.kind)).toEqual(['LANDING_PAD', 'SOLAR', 'LANDING_PAD', 'SOLAR', 'LANDING_PAD', 'SOLAR']);
    expect(state.rovers()).toHaveLength(1);
    expect(state.selectedShip()).toBeNull();
  });

  it('applies TRANSFER_STARTED: charges fuel and switches to IN_TRANSIT', () => {
    state.apply([{ type: 'TRANSFER_STARTED', shipId: SHIP_ID, plan: plan() }]);
    expect(state.ship(SHIP_ID)).toMatchObject({ state: 'IN_TRANSIT', fuel: 80, currentBodyId: null, targetBodyId: MOON_ID });
  });

  it('arrival at a body with resources starts MINING, elsewhere DOCKED', () => {
    state.apply([{ type: 'TRANSFER_STARTED', shipId: SHIP_ID, plan: plan(ASTEROID_ID) }]);
    state.apply([{ type: 'TRANSFER_ARRIVED', shipId: SHIP_ID, bodyId: ASTEROID_ID }]);
    expect(state.ship(SHIP_ID)?.state).toBe('MINING');

    state.apply([{ type: 'TRANSFER_STARTED', shipId: SHIP_ID, plan: plan(MOON_ID) }]);
    state.apply([{ type: 'TRANSFER_ARRIVED', shipId: SHIP_ID, bodyId: MOON_ID }]);
    expect(state.ship(SHIP_ID)?.state).toBe('DOCKED');
  });

  it('mining moves minerals from body to ship, unloading moves them to the global store', () => {
    state.apply([
      { type: 'MINING_TICK', shipId: SHIP_ID, bodyId: ASTEROID_ID, resource: 'FERRITE', amount: 10 },
      { type: 'MINING_TICK', shipId: SHIP_ID, bodyId: ASTEROID_ID, resource: 'FERRITE', amount: 10 },
    ]);
    expect(state.ship(SHIP_ID)?.cargo.FERRITE).toBe(20);
    expect(state.body(ASTEROID_ID)?.resources?.FERRITE).toBe(480);

    const cargo = state.ship(SHIP_ID)!.cargo;
    state.apply([{ type: 'CARGO_UNLOADED', shipId: SHIP_ID, cargo }, { type: 'REFUELED', shipId: SHIP_ID }]);
    expect(state.ship(SHIP_ID)).toMatchObject({ cargo: { FERRITE: 0, CRYOL: 0, SILICITE: 0 }, fuel: 100 });
    expect(state.stockpile().FERRITE).toBe(INITIAL_STOCKPILE.FERRITE + 20);
  });

  it('does not replace signal values when nothing changed', () => {
    const before = state.spacecraft();
    state.apply([{ type: 'COMMAND_REJECTED', shipId: SHIP_ID, reason: 'NO_FUEL' }]);
    expect(state.spacecraft()).toBe(before);
  });

  it('toggles pause and restores the previous speed', () => {
    state.setTimeScale(3);
    state.togglePause();
    expect(state.isPaused()).toBe(true);
    state.togglePause();
    expect(state.timeScale()).toBe(3);
  });
});
