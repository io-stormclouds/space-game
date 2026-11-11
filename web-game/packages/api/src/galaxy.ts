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
  /** The account's fee in the hub when placed (a terminal lowers it). */
  fee?: number;
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
  /** The player's hub fee here (the market's, less a corporate terminal's cut). */
  fee: number;
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

// ---- corporations (05-SOCIAL §5, S2) ----

export type CorpRole = 'chief' | 'officer' | 'member';

export interface CorpMember {
  account: string;
  callsign: string;
  role: CorpRole;
  joinedAt: number;
}

export interface CorpLedgerEntry {
  at: number;
  callsign: string;
  kind: 'deposit' | 'withdrawal';
  credits: number;
  goods: Record<string, number>;
  note: string;
}

export interface CorpNotice {
  at: number;
  callsign: string;
  text: string;
}

/** The player's corporation: seat hub, members by role, treasury, ledger and board (newest first). */
export interface CorpView {
  id: string;
  name: string;
  tag: string;
  hubId: string;
  foundedAt: number;
  /** The player's role. */
  role: CorpRole;
  members: CorpMember[];
  credits: number;
  stock: Record<string, number>;
  ledger: CorpLedgerEntry[];
  board: CorpNotice[];
  /** Callsigns invited and not answered yet. */
  invited: string[];
}

export interface CorpSummary {
  id: string;
  name: string;
  tag: string;
  hubId: string;
  members: number;
}

export interface CorpInvitation {
  corpId: string;
  name: string;
  tag: string;
  /** Callsign of who invited. */
  by: string;
  at: number;
}

// ---- alliances and megaprojects (05-SOCIAL §5–6, S3) ----

export interface AllianceMember {
  corpId: string;
  name: string;
  tag: string;
  joinedAt: number;
  /** Out at this time (notice given). */
  leavingAt: number | null;
  leader: boolean;
}

/** The alliance of the player's corporation. */
export interface AllianceView {
  id: string;
  name: string;
  foundedAt: number;
  members: AllianceMember[];
  /** Tags of the corporations invited and not answered yet. */
  invited: string[];
  /** The player is the chief of the leading corporation (invites, starts projects). */
  leads: boolean;
  /** The player is the chief of their corporation (accepts, leaves). */
  chief: boolean;
}

export interface AllianceSummary {
  id: string;
  name: string;
  corporations: number;
}

/** An invitation of the player's corporation (shown to its chief). */
export interface AllianceInvitation {
  allianceId: string;
  name: string;
  by: string;
  at: number;
}

/** Terminal: −1 pp of the members' fee in the seat hub; gate: −30% shipping time to and from its hub. */
export type MegaKind = 'terminal' | 'gate';
export type MegaScope = 'corporation' | 'alliance';

export interface MegaShare {
  corpId: string;
  name: string;
  tag: string;
  /** Value of the goods given [kr]. */
  value: number;
}

export interface MegaView {
  id: string;
  kind: MegaKind;
  scope: MegaScope;
  ownerName: string;
  hubId: string;
  startedAt: number;
  required: Record<string, number>;
  progress: Record<string, number>;
  /** 0–1. */
  done: number;
  completedAt: number | null;
  /** By corporation, largest first. */
  shares: MegaShare[];
  /** What the player gave [kr]. */
  mine: number;
}

// ---- rankings and seasons (05-SOCIAL §7, S3) ----

export interface SeasonView {
  number: number;
  startedAt: number;
  /** null: the season ends only when closed. */
  endsAt: number | null;
}

export interface RankEntry {
  id: string;
  name: string;
  /** The player's corporation tag, or the corporation's. */
  tag: string;
  value: number;
}

export interface SeasonRecord {
  number: number;
  startedAt: number;
  endedAt: number;
  netWorth: RankEntry[];
  volume: RankEntry[];
  corporations: RankEntry[];
  megaprojectsCompleted: number;
}

export interface Rankings {
  season: SeasonView;
  /** Credits, held credits and goods in the galaxy at the economy's values. */
  netWorth: RankEntry[];
  volume: RankEntry[];
  reputation: RankEntry[];
  corporations: RankEntry[];
  mine: { netWorth: number; netWorthPlace: number; volume: number; reputation: number };
  /** Closed seasons, newest first. */
  history: SeasonRecord[];
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
  /** The player's corporation (null: none), the invitations to them, and every corporation. */
  corporation: CorpView | null;
  invitations: CorpInvitation[];
  corporations: CorpSummary[];
  /** The alliance of the player's corporation, its invitations (to its chief), every alliance. */
  alliance: AllianceView | null;
  allianceInvitations: AllianceInvitation[];
  alliances: AllianceSummary[];
  /** Megaprojects of the player's corporation and alliance. */
  megaprojects: MegaView[];
  season: SeasonView;
  time: number;
}

export type GalaxyOp =
  | { op: 'view' }
  | { op: 'placeOrder'; hubId: string; material: string; side: Side; quantity: number; price: number }
  | { op: 'cancelOrder'; orderId: string }
  | { op: 'shipHome'; hubId: string; bodyId: string; cargo: Record<string, number> }
  | { op: 'takeContract'; contractId: string }
  | { op: 'deliverContract'; contractId: string }
  | { op: 'foundCorporation'; name: string; tag: string; hubId: string }
  | { op: 'invite'; callsign: string }
  | { op: 'acceptInvitation'; corpId: string }
  | { op: 'declineInvitation'; corpId: string }
  | { op: 'leaveCorporation' }
  | { op: 'setRole'; account: string; role: CorpRole }
  | { op: 'expel'; account: string }
  | { op: 'deposit'; credits?: number; goods?: Record<string, number>; note?: string }
  | { op: 'withdraw'; credits?: number; goods?: Record<string, number>; note?: string }
  | { op: 'postNotice'; text: string }
  | { op: 'foundAlliance'; name: string }
  | { op: 'inviteCorporation'; tag: string }
  | { op: 'acceptAlliance'; allianceId: string }
  | { op: 'declineAlliance'; allianceId: string }
  | { op: 'leaveAlliance' }
  | { op: 'startMegaproject'; kind: MegaKind; scope: MegaScope; hubId: string }
  | { op: 'contribute'; projectId: string; goods: Record<string, number> }
  | { op: 'rankings' }
  | { op: 'closeSeason' };

/** An order after it met the book: what is left of it (remaining 0: filled) and its trades. */
export interface Placed {
  order: MarketOrder;
  trades: Trade[];
}

export type GalaxyReply =
  | GalaxyView
  | Placed
  | MarketOrder
  | Shipment
  | Contract
  | CorpView
  | CorpSummary
  | CorpInvitation[]
  | AllianceView
  | AllianceSummary
  | AllianceInvitation[]
  | MegaView
  | Rankings
  | SeasonRecord;

/**
 * The world's command that sends cargo from the colony's storage to a hub (R-21). Only the Rust world
 * knows it (the TS domain does not), so it is built here and goes through `GameApi.command`.
 */
export function shipToHubCommand(bodyId: string, hubId: string, cargo: Record<string, number>): Command {
  return { type: 'SHIP_TO_HUB', bodyId, hubId, cargo } as unknown as Command;
}
