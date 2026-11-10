import type { Command } from '@space-game/domain';
import type { MarketHub, SimulatedPlayer } from './contract';

// The galaxy's market through the game server (plan 05-SOCIAL §3–4, server B6): hubs with order
// books, the player's credits and goods in the hubs, shipments between the colony and the hubs, and
// the NPC factions that host the hubs (R-7; the server can run without them). The same JSON as
// `server/crates/game-session/src/exchange.rs`. Only the server has a galaxy: the mock and the
// offline WebAssembly game answer `galaxy` requests with an error (NO_TRADE).

/** Answer of a world without the galaxy service (the same text as the Rust host's). */
export const NO_TRADE = 'handel z hubami działa tylko w grze na serwerze';

export type Side = 'buy' | 'sell';

export interface MarketOrder {
  id: string;
  account: string;
  hubId: string;
  material: string;
  side: Side;
  /** Limit per unit [kr]. */
  price: number;
  quantity: number;
  remaining: number;
  /** Credits a buy order still holds. */
  held: number;
  /** Unix ms. */
  placedAt: number;
  expiresAt: number;
}

export interface Trade {
  id: string;
  hubId: string;
  material: string;
  price: number;
  quantity: number;
  /** Accounts; null: the hub's faction. */
  buyer: string | null;
  seller: string | null;
  at: number;
}

export interface Shipment {
  id: string;
  account: string;
  direction: 'toHub' | 'toColony';
  hubId: string;
  bodyId: string;
  cargo: Record<string, number>;
  departsAt: number;
  arrivesAt: number;
  /** At the colony, waiting for the world to take it. */
  arrived: boolean;
}

export interface BookLevel {
  material: string;
  side: Side;
  price: number;
  quantity: number;
  /** The faction's quote, not players' orders. */
  npc: boolean;
}

/** A hub as the player sees it: quotes (best bid and ask per material), the book, own goods. */
export interface HubView extends MarketHub {
  faction: string | null;
  distanceLy: number;
  travelSeconds: number;
  stock: Record<string, number>;
  book: BookLevel[];
  /** The player's reputation with the host faction (−100…100) and the duty it charges them. */
  reputation: number;
  tariff: number;
}

export type ContractState = 'open' | 'taken' | 'delivered' | 'failed';

/** A faction's contract (05-SOCIAL §3.3): deliver goods to its hub by the deadline. */
export interface Contract {
  id: string;
  hubId: string;
  faction: string;
  material: string;
  quantity: number;
  /** Credits on delivery (above the market). */
  reward: number;
  /** Reputation on delivery. */
  rep: number;
  /** Reputation needed to take it (premium contracts: 75). */
  minRep: number;
  issuedAt: number;
  deadline: number;
  state: ContractState;
  taker: string | null;
}

export interface GalaxyPlayer extends SimulatedPlayer {
  /** A faction's commander, not a person. */
  npc: boolean;
}

/** What the player sees of the galaxy; pushed after every change of the market. */
export interface GalaxyView {
  account: string;
  credits: number;
  /** Hub fee each side pays (fraction of the value). */
  fee: number;
  /** NPC factions run the hubs. */
  npc: boolean;
  hubs: HubView[];
  orders: MarketOrder[];
  shipments: Shipment[];
  trades: Trade[];
  /** Faction commanders and other players (not the viewer). */
  players: GalaxyPlayer[];
  /** Open contracts of every hub and the player's own (taken, delivered, failed), newest first. */
  contracts: Contract[];
  time: number;
}

export type GalaxyOp =
  | { op: 'view' }
  | { op: 'placeOrder'; hubId: string; material: string; side: Side; quantity: number; price: number }
  | { op: 'cancelOrder'; orderId: string }
  | { op: 'shipHome'; hubId: string; bodyId: string; cargo: Record<string, number> }
  | { op: 'takeContract'; contractId: string }
  | { op: 'deliverContract'; contractId: string };

/** An order after it met the book: what is left of it (remaining 0: filled) and its trades. */
export interface Placed {
  order: MarketOrder;
  trades: Trade[];
}

export type GalaxyReply = GalaxyView | Placed | MarketOrder | Shipment | Contract;

/**
 * The world's command that sends cargo from the colony's storage to a hub (R-21). Only the Rust world
 * knows it (the TS domain does not), so it is built here and goes through `GameApi.command`.
 */
export function shipToHubCommand(bodyId: string, hubId: string, cargo: Record<string, number>): Command {
  return { type: 'SHIP_TO_HUB', bodyId, hubId, cargo } as unknown as Command;
}
