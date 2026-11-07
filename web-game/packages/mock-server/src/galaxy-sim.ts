import type { MarketHub, MarketQuote, SimulatedPlayer } from '@space-game/api';
import { STARS, type Economy } from '@space-game/domain';
import { Rng } from './rng';

// Simulated players and market (W11 B). Not a multiplayer: data for the social screens of the
// canvas and load for the UI and performance tests.
// FACT (canvas board "Galaktyka"): market hubs Syriusz A/B and Słońce; other players' colonies at
//   Procyon A and Alpha Centauri; the player is at Tau Ceti.
// FACT (economy doc 4.6): the hub buys at 0.8·P, sells at 1.25·P, P = V · clamp((demand/supply)^0.3, 0.5, 3).
// PROPOSAL: player names, corporations, further home stars, growth and the demand/supply walk.

export interface GalaxySimOptions {
  seed: number;
  players: number;
  /** Model minutes between market and player updates. */
  updateEvery: number;
}

export const DEFAULT_GALAXY_OPTIONS: GalaxySimOptions = { seed: 20261107, players: 6, updateEvery: 10 };

const CALLSIGNS = ['Ares', 'Lyra', 'Kestrel', 'Wega', 'Orion', 'Nadir', 'Halley', 'Kepler', 'Rigel', 'Tycho', 'Cassini', 'Hydra'];
const CORPORATIONS = ['Konsorcjum Orion', 'Kolektyw Hel-3', 'Gildia Ferrytu', 'Spółka Kriogen', 'Syndykat Kwantyt', 'Unia Lagrange'];
const CANVAS_HOMES = ['Procyon A', 'Alpha Centauri'];
const HUBS: Array<{ id: string; name: string; star: string }> = [
  { id: 'hub-sirius', name: 'Syriusz', star: 'Sirius A' },
  { id: 'hub-sol', name: 'Słońce', star: 'Sol (Sun)' },
];

interface MarketState {
  /** demand/supply ratio per material. */
  ratio: Record<string, number>;
  price: Record<string, number>;
  change: Record<string, number>;
}

export interface GalaxySimState {
  rng: number;
  lastUpdate: number;
  players: SimulatedPlayer[];
  markets: Record<string, MarketState>;
}

export class GalaxySim {
  private readonly rng: Rng;
  private state: GalaxySimState;

  constructor(
    private readonly economy: Economy,
    private readonly opts: GalaxySimOptions = DEFAULT_GALAXY_OPTIONS,
    saved?: GalaxySimState,
  ) {
    this.rng = new Rng(saved?.rng ?? opts.seed);
    this.state = saved ? structuredClone(saved) : this.initial();
    this.state.rng = this.rng.state;
  }

  private initial(): GalaxySimState {
    const homes = [
      ...CANVAS_HOMES,
      ...STARS.filter((s) => s.distance > 0 && s.distance < 20 && !['Tau Ceti', 'Sirius A', 'Sirius B', ...CANVAS_HOMES].includes(s.name)).map((s) => s.name),
    ];
    const players: SimulatedPlayer[] = [];
    for (let i = 0; i < this.opts.players; i++) {
      players.push({
        id: `npc-${i + 1}`,
        name: `Dowódca ${CALLSIGNS[i % CALLSIGNS.length]}${i >= CALLSIGNS.length ? ` ${Math.floor(i / CALLSIGNS.length) + 1}` : ''}`,
        corporation: CORPORATIONS[i % CORPORATIONS.length]!,
        homeStar: homes[i % homes.length]!,
        colonies: 1 + this.rng.int(3),
        score: Math.round(this.rng.range(800, 4000)),
      });
    }
    const markets: Record<string, MarketState> = {};
    for (const hub of HUBS) {
      const ratio: Record<string, number> = {};
      const price: Record<string, number> = {};
      const change: Record<string, number> = {};
      for (const m of this.economy.materials) {
        ratio[m.id] = this.rng.range(0.7, 1.4);
        price[m.id] = this.priceOf(m.id, ratio[m.id]!);
        change[m.id] = 0;
      }
      markets[hub.id] = { ratio, price, change };
    }
    return { rng: this.rng.state, lastUpdate: 0, players, markets };
  }

  private priceOf(material: string, ratio: number): number {
    const v = this.economy.values.get(material)?.V ?? 1;
    return v * Math.min(3, Math.max(0.5, Math.pow(ratio, 0.3)));
  }

  /** Advances to game time `t` [model minutes]; updates every `updateEvery` minutes. */
  advance(t: number): boolean {
    let changed = false;
    while (t - this.state.lastUpdate >= this.opts.updateEvery) {
      this.state.lastUpdate += this.opts.updateEvery;
      this.update();
      changed = true;
    }
    this.state.rng = this.rng.state;
    return changed;
  }

  private update(): void {
    for (const p of this.state.players) {
      p.score += Math.round(this.rng.range(5, 40) * p.colonies);
      if (this.rng.next() < 0.01) p.colonies += 1;
    }
    for (const market of Object.values(this.state.markets)) {
      for (const id of Object.keys(market.ratio)) {
        const r = market.ratio[id]! * Math.exp(this.rng.range(-0.06, 0.06));
        market.ratio[id] = Math.min(4, Math.max(0.25, r));
        const p = this.priceOf(id, market.ratio[id]!);
        market.change[id] = ((p - market.price[id]!) / market.price[id]!) * 100;
        market.price[id] = p;
      }
    }
  }

  players(): SimulatedPlayer[] {
    return this.state.players.map((p) => ({ ...p })).sort((a, b) => b.score - a.score);
  }

  hubs(): MarketHub[] {
    return HUBS.map((h) => {
      const m = this.state.markets[h.id]!;
      const quotes: MarketQuote[] = this.economy.materials.map((mat) => {
        const p = m.price[mat.id]!;
        return {
          material: mat.id,
          value: round2(this.economy.values.get(mat.id)?.V ?? 0),
          bid: round2(0.8 * p),
          ask: round2(1.25 * p),
          change: round2(m.change[mat.id]!),
        };
      });
      return { ...h, quotes };
    });
  }

  save(): GalaxySimState {
    return structuredClone({ ...this.state, rng: this.rng.state });
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
