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
  time: number;
}

export type GalaxyOp =
  | { op: 'view' }
  | { op: 'placeOrder'; hubId: string; material: string; side: Side; quantity: number; price: number }
  | { op: 'cancelOrder'; orderId: string }
  | { op: 'shipHome'; hubId: string; bodyId: string; cargo: Record<string, number> };

/** An order after it met the book: what is left of it (remaining 0: filled) and its trades. */
export interface Placed {
  order: MarketOrder;
  trades: Trade[];
}

export type GalaxyReply = GalaxyView | Placed | MarketOrder | Shipment;
