//! The shared market of the galaxy (B6, plan 05-SOCIAL §3–4): hubs with order books, the players'
//! credits and goods in the hubs, shipments between colonies and hubs, and — when configured (R-7) —
//! the NPC factions that host the hubs and make the market. Pure and deterministic: the time comes
//! in as an argument (the server passes its clock, unix ms), so the same calls give the same market.
//!
//! Trade rules:
//! - a buy order holds `price × quantity × (1 + fee)` credits, a sell order holds its goods (taken
//!   from the account's stock in that hub); a cancelled or expired order gives back what is left;
//! - an incoming order meets the best price of the other side first (earlier orders first at one
//!   price, players before the faction at one price) and trades at the waiting side's price; never
//!   with orders of the same account;
//! - each side pays the hub fee, `fee` of the trade's value (a sink, EKO-5);
//! - with NPC factions the hub's host buys at 0.8·P and sells at 1.25·P (economy doc 4.6), at most
//!   `depth` units of each material each way between two of its updates; trades with it move P
//!   ([`GalaxySim::trade`]); without factions only players' orders meet;
//! - goods travel `handling + distance × seconds_per_ly` between the colony's star and the hub's;
//!   what arrives at a colony waits until its world takes it (`delivered`), or goes back to the hub
//!   when the world cannot (`returned`).

use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};

use game_core::economy::Economy;
use game_core::galaxy::stars::{LY_PER_PARSEC, STARS};
use game_core::math::js;
use game_core::models::resource::{Qty, add_stock, amount_of, can_afford, format_cost, missing_for, subtract_stock};

use crate::contract::{MarketHub, MarketQuote, SimulatedPlayer};
use crate::galaxy::{GalaxyOptions, GalaxySim, GalaxySimState, HubDef};

mod corporation;
pub use corporation::*;

/// Hubs of the server's galaxy (05-SOCIAL S-9): the canvas two, Procyon and Epsilon Eridani.
pub const GALAXY_HUBS: [HubDef; 4] = [
    ("hub-sirius", "Syriusz", "Sirius A"),
    ("hub-sol", "Słońce", "Sol (Sun)"),
    ("hub-procyon", "Procyon", "Procyon A"),
    ("hub-eridani", "Epsilon Eridani", "Epsilon Eridani"),
];

/// The NPC faction hosting each hub (05-SOCIAL §4).
pub const HUB_FACTIONS: [(&str, &str); 4] = [
    ("hub-sirius", "Konsorcjum Orion"),
    ("hub-sol", "Unia Lagrange"),
    ("hub-procyon", "Kolektyw Hel-3"),
    ("hub-eridani", "Spółka Kriogen"),
];

/// Star of a colony whose world names none (the canvas world is at Tau Ceti).
pub const DEFAULT_HOME_STAR: &str = "Tau Ceti";

/// Smallest amount that counts (goods and credits are fractional).
const EPS: f64 = 1e-9;
/// Trades kept in the state (the newest).
const TRADES_KEPT: usize = 500;
/// Trades of an account in its view.
const TRADES_SHOWN: usize = 20;
/// Price levels of each side per material in a hub's book view.
const BOOK_LEVELS: usize = 5;
/// Faction updates a long-sleeping server catches up at most.
const MAX_NPC_UPDATES: u32 = 1000;

// Reputation with a faction (05-SOCIAL §4): in [−100, 100].
const REP_MIN: f64 = -100.0;
const REP_MAX: f64 = 100.0;
/// For a delivered contract (a premium one gives half more).
pub const REP_PER_CONTRACT: f64 = 5.0;
/// For a taken contract that was not delivered in time.
pub const REP_PENALTY: f64 = 5.0;
/// Per credit traded with the faction (0.5 per 1000 kr).
const REP_PER_KR: f64 = 0.0005;
/// Above 0, reputation fades by this much per day.
const REP_DECAY_PER_DAY: f64 = 1.0;
/// Premium contracts need this reputation (05-SOCIAL §4: 75).
pub const PREMIUM_REP: f64 = 75.0;
/// Contracts an account may hold at once.
const MAX_TAKEN: usize = 3;
/// Delivered and failed contracts kept for the views.
const CONTRACTS_KEPT: usize = 200;

/// The faction's duty on trades with it, by the trader's reputation (05-SOCIAL §3.1: 0–10%):
/// below 0 → 10%, then 5%, from 25 halved, from 75 none.
pub fn tariff(rep: f64) -> f64 {
    if rep < 0.0 {
        0.10
    } else if rep < 25.0 {
        0.05
    } else if rep < PREMIUM_REP {
        0.025
    } else {
        0.0
    }
}

pub fn is_hub(id: &str) -> bool {
    GALAXY_HUBS.iter().any(|(h, _, _)| *h == id)
}

fn hub_def(id: &str) -> Option<&'static HubDef> {
    GALAXY_HUBS.iter().find(|(h, _, _)| *h == id)
}

fn faction_of(hub: &str) -> Option<&'static str> {
    HUB_FACTIONS.iter().find(|(h, _)| *h == hub).map(|(_, f)| *f)
}

/// Light years between two stars of the register (an unknown name counts as the default home star).
pub fn distance_ly(a: &str, b: &str) -> f64 {
    let pos =
        |name: &str| STARS.iter().find(|s| s.name == name).or_else(|| STARS.iter().find(|s| s.name == DEFAULT_HOME_STAR)).map(|s| s.pos);
    match (pos(a), pos(b)) {
        (Some(p), Some(q)) => {
            let (dx, dy, dz) = (p.x - q.x, p.y - q.y, p.z - q.z);
            (dx * dx + dy * dy + dz * dz).sqrt() * LY_PER_PARSEC
        }
        _ => 0.0,
    }
}

fn round2(n: f64) -> f64 {
    js::round(n * 100.0) / 100.0
}

fn round3(n: f64) -> f64 {
    js::round(n * 1000.0) / 1000.0
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcConfig {
    pub seed: i32,
    /// Simulated commanders of the factions (shown on the galaxy map, marked as NPC).
    pub players: usize,
    /// Real seconds between two updates of prices and depth.
    pub update_seconds: f64,
    /// Units of each material a faction buys and sells per update, each way.
    pub depth: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MarketConfig {
    /// Hub fee each side pays, as a fraction of the trade's value.
    pub fee: f64,
    /// Credits of a new account.
    pub start_credits: f64,
    pub seconds_per_ly: f64,
    /// Loading and unloading of a shipment [s].
    pub handling_seconds: f64,
    /// Lifetime of an order [s].
    pub order_seconds: f64,
    /// Open orders per account.
    pub max_orders: usize,
    /// Time a faction's contract stays open, and a taken one has to be delivered [s].
    pub contract_seconds: f64,
    /// Open contracts each faction keeps in its hub.
    pub contracts_per_hub: usize,
    /// Corporations (S2): founding cost and sizes.
    pub corp: CorpConfig,
    /// NPC factions (R-7); `None`: a market of players only (no contracts, duties or reputation changes).
    pub npc: Option<NpcConfig>,
}

impl Default for MarketConfig {
    /// Production: 2 h per light year (05-SOCIAL S-10), orders for 7 days, contracts for 2 days,
    /// factions every 10 minutes.
    fn default() -> MarketConfig {
        MarketConfig {
            fee: 0.02,
            start_credits: 1000.0,
            seconds_per_ly: 7200.0,
            handling_seconds: 1800.0,
            order_seconds: 7.0 * 24.0 * 3600.0,
            max_orders: 50,
            contract_seconds: 48.0 * 3600.0,
            contracts_per_hub: 3,
            corp: CorpConfig::default(),
            npc: Some(NpcConfig { seed: 20_261_107, players: 6, update_seconds: 600.0, depth: 50.0 }),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    pub account: String,
    pub hub_id: String,
    pub material: String,
    pub side: Side,
    /// Limit per unit [kr].
    pub price: f64,
    pub quantity: f64,
    pub remaining: f64,
    /// Credits a buy order still holds.
    pub held: f64,
    /// Unix ms.
    pub placed_at: f64,
    pub expires_at: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Trade {
    pub id: String,
    pub hub_id: String,
    pub material: String,
    pub price: f64,
    pub quantity: f64,
    /// Accounts; `None`: the hub's faction.
    pub buyer: Option<String>,
    pub seller: Option<String>,
    pub at: f64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    ToHub,
    ToColony,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Shipment {
    pub id: String,
    pub account: String,
    pub direction: Direction,
    pub hub_id: String,
    pub body_id: String,
    pub cargo: Qty,
    pub departs_at: f64,
    pub arrives_at: f64,
    /// At the colony, waiting for its world to take it.
    #[serde(default)]
    pub arrived: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    pub credits: f64,
    /// Goods the account keeps in each hub.
    pub stock: IndexMap<String, Qty>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub callsign: String,
    /// Star of the account's colony (where its shipments start and end).
    pub star: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NpcState {
    pub sim: GalaxySimState,
    /// Unix ms the factions' clock started; their model minutes count from it.
    pub epoch: f64,
    /// Units the faction still buys (bids) and sells (asks) until its next update, per hub and material.
    pub bids_left: IndexMap<String, Qty>,
    pub asks_left: IndexMap<String, Qty>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ContractState {
    Open,
    Taken,
    Delivered,
    /// A taken contract not delivered in time.
    Failed,
}

/// A faction's contract (05-SOCIAL §3.3): deliver `quantity` of `material` to its hub by `deadline`
/// for `reward` credits (above the market) and reputation. Taken by one account, which then has
/// until the deadline; open ones that nobody takes lapse.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Contract {
    pub id: String,
    pub hub_id: String,
    pub faction: String,
    pub material: String,
    pub quantity: f64,
    pub reward: f64,
    /// Reputation for delivering it.
    pub rep: f64,
    /// Reputation needed to take it (premium: 75).
    pub min_rep: f64,
    pub issued_at: f64,
    pub deadline: f64,
    pub state: ContractState,
    pub taker: Option<String>,
}

/// Everything the market keeps (the server writes it to `galaxy.json`). Fields added after the
/// first version default, so older files load.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeState {
    /// Unix ms of the last advance.
    pub time: f64,
    pub next_id: u64,
    pub profiles: IndexMap<String, Profile>,
    pub wallets: IndexMap<String, Wallet>,
    pub orders: Vec<Order>,
    pub trades: Vec<Trade>,
    pub shipments: Vec<Shipment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub npc: Option<NpcState>,
    /// Open and taken contracts, then the last delivered and failed ones.
    #[serde(default)]
    pub contracts: Vec<Contract>,
    /// Reputation of each account with each faction.
    #[serde(default)]
    pub reputation: IndexMap<String, IndexMap<String, f64>>,
    /// Generator of the factions' contracts (Mulberry32 state).
    #[serde(default)]
    pub contract_rng: i32,
    /// Unix ms reputation last faded.
    #[serde(default)]
    pub reputation_time: f64,
    #[serde(default)]
    pub corporations: Vec<Corporation>,
    #[serde(default)]
    pub invitations: Vec<Invitation>,
    /// Shipments to hubs already taken (`account:shipment` → Unix ms), kept for
    /// [`DEPARTURES_KEPT_MS`] so a departure reported again is not a second one.
    #[serde(default)]
    pub departures: IndexMap<String, f64>,
}

/// How long the market remembers a departure [ms]: a week, far longer than any log tail a restored
/// world reports again.
pub const DEPARTURES_KEPT_MS: f64 = 7.0 * 24.0 * 3600.0 * 1000.0;

/// One price level of a hub's book.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookLevel {
    pub material: String,
    pub side: Side,
    pub price: f64,
    pub quantity: f64,
    /// The hub's faction (its quote), not players' orders.
    pub npc: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HubView {
    /// Id, name, star and quotes (best bid and ask of each material), as the snapshot's hubs.
    #[serde(flatten)]
    pub market: MarketHub,
    pub faction: Option<String>,
    /// From the viewer's colony.
    pub distance_ly: f64,
    pub travel_seconds: f64,
    /// The viewer's goods in this hub.
    pub stock: Qty,
    pub book: Vec<BookLevel>,
    /// The viewer's reputation with the host faction and the duty it charges them.
    pub reputation: f64,
    pub tariff: f64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GalaxyPlayer {
    #[serde(flatten)]
    pub player: SimulatedPlayer,
    /// A faction's commander, not a person.
    pub npc: bool,
}

/// What one account sees of the galaxy (pushed to its clients).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GalaxyView {
    pub account: String,
    pub credits: f64,
    pub fee: f64,
    /// NPC factions run the hubs.
    pub npc: bool,
    pub hubs: Vec<HubView>,
    pub orders: Vec<Order>,
    pub shipments: Vec<Shipment>,
    pub trades: Vec<Trade>,
    /// Others in the galaxy: faction commanders and players (not the viewer).
    pub players: Vec<GalaxyPlayer>,
    /// Open contracts of every hub and the viewer's taken, delivered and failed ones (newest first).
    pub contracts: Vec<Contract>,
    /// The viewer's corporation, the invitations to them, and every corporation.
    pub corporation: Option<CorpView>,
    pub invitations: Vec<InvitationView>,
    pub corporations: Vec<CorpSummary>,
    pub time: f64,
}

/// An order after it met the book: what is left of it (`remaining` 0: filled) and its trades.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Placed {
    pub order: Order,
    pub trades: Vec<Trade>,
}

/// What an advance changed.
#[derive(Default, Debug, PartialEq)]
pub struct Changes {
    pub accounts: IndexSet<String>,
    /// Faction prices and depth were updated (every view changed).
    pub quotes: bool,
    /// Shipments arrived at colonies ([`Exchange::deliveries`]).
    pub deliveries: bool,
    /// Contracts were issued or lapsed (every view changed).
    pub contracts: bool,
}

pub type ExResult<T> = Result<T, String>;

pub struct Exchange {
    cfg: MarketConfig,
    state: ExchangeState,
    npc: Option<GalaxySim>,
    values: IndexMap<String, f64>,
}

fn npc_options(n: &NpcConfig) -> GalaxyOptions {
    GalaxyOptions { seed: n.seed, players: n.players, update_every: n.update_seconds / 60.0, hubs: &GALAXY_HUBS }
}

impl Exchange {
    /// The market from its saved state (or a new one at `now`). Factions switched off drop their
    /// state; switched on, they start (or continue) their clock.
    pub fn new(economy: &Economy, cfg: MarketConfig, saved: Option<ExchangeState>, now: f64) -> Exchange {
        let values: IndexMap<String, f64> = economy.values.iter().map(|(k, v)| (k.clone(), v.v)).collect();
        let mut state = saved.unwrap_or_else(|| ExchangeState { time: now, ..ExchangeState::default() });
        let saved_npc = state.npc.take();
        let mut ex = Exchange { npc: None, values, state, cfg };
        if let Some(n) = ex.cfg.npc {
            let (sim_state, epoch, bids, asks) = match saved_npc {
                Some(s) => (Some(s.sim), s.epoch, s.bids_left, s.asks_left),
                None => (None, now, IndexMap::new(), IndexMap::new()),
            };
            ex.npc = Some(GalaxySim::new(economy, npc_options(&n), sim_state));
            ex.state.npc = Some(NpcState { sim: ex.npc.as_ref().expect("just made").save(), epoch, bids_left: bids, asks_left: asks });
            if ex.state.npc.as_ref().is_some_and(|s| s.bids_left.is_empty()) {
                ex.refill();
            }
            if ex.state.contract_rng == 0 {
                ex.state.contract_rng = n.seed.wrapping_add(0x2545_f491);
            }
            ex.issue_contracts();
        }
        if ex.state.reputation_time == 0.0 {
            ex.state.reputation_time = ex.state.time;
        }
        ex
    }

    // ---- reputation, duties, contracts ----

    /// The account's reputation with a faction.
    pub fn reputation(&self, account: &str, faction: &str) -> f64 {
        self.state.reputation.get(account).and_then(|r| r.get(faction)).copied().unwrap_or(0.0)
    }

    fn add_reputation(&mut self, account: &str, faction: &str, delta: f64) {
        let r = self.state.reputation.entry(account.to_string()).or_default();
        let cur = r.get(faction).copied().unwrap_or(0.0);
        r.insert(faction.to_string(), (cur + delta).clamp(REP_MIN, REP_MAX));
    }

    /// The duty the hub's faction charges the account (none without factions).
    pub fn tariff_of(&self, account: &str, hub_id: &str) -> f64 {
        match (self.npc.is_some(), faction_of(hub_id)) {
            (true, Some(f)) => tariff(self.reputation(account, f)),
            _ => 0.0,
        }
    }

    /// Each faction tops its hub up to `contracts_per_hub` open contracts: a material of the
    /// catalog, worth 300–900 kr at its price (at most the faction's depth in units), paid 30% above
    /// it (premium: 60%, needs reputation 75).
    fn issue_contracts(&mut self) -> bool {
        let Some(sim) = self.npc.as_ref() else { return false };
        let materials: Vec<String> = self.values.keys().cloned().collect();
        if materials.is_empty() {
            return false;
        }
        let mut rng = game_core::sim::scenarios::Rng::new(self.state.contract_rng);
        let mut issued = Vec::new();
        for (hub, _, _) in GALAXY_HUBS {
            let Some(faction) = faction_of(hub) else { continue };
            let open: Vec<&Contract> = self.state.contracts.iter().filter(|c| c.hub_id == hub && c.state == ContractState::Open).collect();
            let mut has_premium = open.iter().any(|c| c.min_rep >= PREMIUM_REP);
            for k in open.len()..self.cfg.contracts_per_hub {
                let material = materials[rng.int(materials.len())].clone();
                let price = sim.price(hub, &material).unwrap_or(1.0).max(0.01);
                // at most the faction's depth: what one update of a hub's market can supply
                let depth = self.cfg.npc.map(|n| n.depth).unwrap_or(50.0).max(1.0);
                let quantity = (rng.range(300.0, 900.0) / price).ceil().clamp(1.0, depth);
                // one premium contract per hub, in its last slot
                let premium = !has_premium && k + 1 == self.cfg.contracts_per_hub && self.cfg.contracts_per_hub > 1;
                has_premium |= premium;
                let reward = round2(quantity * price * if premium { 1.6 } else { 1.3 });
                issued.push(Contract {
                    id: String::new(),
                    hub_id: hub.to_string(),
                    faction: faction.to_string(),
                    material,
                    quantity,
                    reward,
                    rep: if premium { REP_PER_CONTRACT * 1.5 } else { REP_PER_CONTRACT },
                    min_rep: if premium { PREMIUM_REP } else { 0.0 },
                    issued_at: self.state.time,
                    deadline: self.state.time + self.cfg.contract_seconds * 1000.0,
                    state: ContractState::Open,
                    taker: None,
                });
            }
        }
        self.state.contract_rng = rng.state;
        let any = !issued.is_empty();
        for mut c in issued {
            c.id = self.new_id("contract");
            self.state.contracts.push(c);
        }
        any
    }

    /// Takes an open contract: the account has until its deadline to deliver.
    pub fn take_contract(&mut self, account: &str, contract_id: &str) -> ExResult<Contract> {
        let taken = self.state.contracts.iter().filter(|c| c.state == ContractState::Taken && c.taker.as_deref() == Some(account)).count();
        let Some(i) = self.state.contracts.iter().position(|c| c.id == contract_id) else {
            return Err(format!("nie ma kontraktu {contract_id}"));
        };
        let c = &self.state.contracts[i];
        if c.state != ContractState::Open {
            return Err("kontrakt nie jest już otwarty".to_string());
        }
        let rep = self.reputation(account, &c.faction);
        if rep < c.min_rep {
            return Err(format!("kontrakt wymaga reputacji {} u frakcji {} (masz {})", c.min_rep, c.faction, js::round(rep)));
        }
        if taken >= MAX_TAKEN {
            return Err(format!("najwyżej {MAX_TAKEN} przyjęte kontrakty naraz"));
        }
        let deadline = self.state.time + self.cfg.contract_seconds * 1000.0;
        let c = &mut self.state.contracts[i];
        c.state = ContractState::Taken;
        c.taker = Some(account.to_string());
        c.deadline = c.deadline.max(deadline);
        Ok(c.clone())
    }

    /// Delivers a taken contract from the account's goods in its hub: the reward and the reputation.
    pub fn deliver_contract(&mut self, account: &str, contract_id: &str) -> ExResult<Contract> {
        let Some(i) = self
            .state
            .contracts
            .iter()
            .position(|c| c.id == contract_id && c.state == ContractState::Taken && c.taker.as_deref() == Some(account))
        else {
            return Err(format!("nie masz przyjętego kontraktu {contract_id}"));
        };
        let c = self.state.contracts[i].clone();
        let want: Qty = [(c.material.clone(), c.quantity)].into_iter().collect();
        let have = self.wallet(account).stock.get(&c.hub_id).cloned().unwrap_or_default();
        if !can_afford(&have, &want) {
            return Err(format!("w hubie brakuje {}", format_cost(&missing_for(&have, &want))));
        }
        let s = self.stock_mut(account, &c.hub_id);
        *s = subtract_stock(s, &want);
        self.wallet_mut(account).credits += c.reward;
        self.add_reputation(account, &c.faction, c.rep);
        self.state.contracts[i].state = ContractState::Delivered;
        self.trim_contracts();
        Ok(self.state.contracts.iter().find(|x| x.id == c.id).cloned().unwrap_or(c))
    }

    /// Keeps the newest closed contracts only.
    fn trim_contracts(&mut self) {
        let closed = self.state.contracts.iter().filter(|c| matches!(c.state, ContractState::Delivered | ContractState::Failed)).count();
        let mut extra = closed.saturating_sub(CONTRACTS_KEPT);
        self.state.contracts.retain(|c| {
            if extra > 0 && matches!(c.state, ContractState::Delivered | ContractState::Failed) {
                extra -= 1;
                false
            } else {
                true
            }
        });
    }

    /// Deadlines: open contracts lapse, taken ones fail (the taker loses reputation); reputation
    /// above 0 fades. Returns the accounts whose contracts or reputation changed.
    fn age_contracts(&mut self, now: f64, ch: &mut Changes) {
        let mut failed = Vec::new();
        let before = self.state.contracts.len();
        self.state.contracts.retain_mut(|c| match c.state {
            ContractState::Open if c.deadline <= now => false,
            ContractState::Taken if c.deadline <= now => {
                c.state = ContractState::Failed;
                failed.push((c.taker.clone().unwrap_or_default(), c.faction.clone()));
                true
            }
            _ => true,
        });
        if self.state.contracts.len() != before || !failed.is_empty() {
            ch.contracts = true;
        }
        for (account, faction) in failed {
            self.add_reputation(&account, &faction, -REP_PENALTY);
            ch.accounts.insert(account);
        }
        self.trim_contracts();
        let days = (now - self.state.reputation_time) / 86_400_000.0;
        if days >= 1.0 / 24.0 {
            self.state.reputation_time = now;
            for (account, r) in self.state.reputation.iter_mut() {
                for v in r.values_mut() {
                    if *v > 0.0 {
                        *v = (*v - REP_DECAY_PER_DAY * days).max(0.0);
                        ch.accounts.insert(account.clone());
                    }
                }
            }
        }
    }

    pub fn config(&self) -> &MarketConfig {
        &self.cfg
    }

    pub fn has_npc(&self) -> bool {
        self.npc.is_some()
    }

    /// The state to keep.
    /// Shipments (travelling or waiting at colonies), open orders and corporations: the service's gauges.
    pub fn counts(&self) -> (usize, usize, usize) {
        (self.state.shipments.len(), self.state.orders.len(), self.state.corporations.len())
    }

    pub fn save(&self) -> ExchangeState {
        let mut s = self.state.clone();
        if let (Some(sim), Some(n)) = (&self.npc, s.npc.as_mut()) {
            n.sim = sim.save();
        }
        s
    }

    fn new_id(&mut self, prefix: &str) -> String {
        self.state.next_id += 1;
        format!("{prefix}-{}", self.state.next_id)
    }

    fn wallet_mut(&mut self, account: &str) -> &mut Wallet {
        let start = self.cfg.start_credits;
        self.state.wallets.entry(account.to_string()).or_insert_with(|| Wallet { credits: start, stock: IndexMap::new() })
    }

    /// The account's credits and goods (a new account starts with `start_credits`).
    pub fn wallet(&self, account: &str) -> Wallet {
        self.state.wallets.get(account).cloned().unwrap_or(Wallet { credits: self.cfg.start_credits, stock: IndexMap::new() })
    }

    /// Who the account is and where its colony is (on connection and when its world starts).
    pub fn profile(&mut self, account: &str, callsign: Option<&str>, star: Option<&str>) {
        self.wallet_mut(account);
        let p = self
            .state
            .profiles
            .entry(account.to_string())
            .or_insert_with(|| Profile { callsign: account.to_string(), star: DEFAULT_HOME_STAR.to_string() });
        if let Some(c) = callsign {
            p.callsign = c.to_string();
        }
        if let Some(s) = star {
            p.star = s.to_string();
        }
    }

    fn star_of(&self, account: &str) -> String {
        self.state.profiles.get(account).map(|p| p.star.clone()).unwrap_or_else(|| DEFAULT_HOME_STAR.to_string())
    }

    /// Seconds a shipment takes between a star and a hub.
    pub fn travel_seconds(&self, star: &str, hub_id: &str) -> f64 {
        let hub_star = hub_def(hub_id).map(|h| h.2).unwrap_or(DEFAULT_HOME_STAR);
        self.cfg.handling_seconds + distance_ly(star, hub_star) * self.cfg.seconds_per_ly
    }

    fn stock_mut(&mut self, account: &str, hub_id: &str) -> &mut Qty {
        self.wallet_mut(account).stock.entry(hub_id.to_string()).or_default()
    }

    // ---- orders ----

    /// A faction's quote the incoming side can trade with: its ask for a buyer, its bid for a seller,
    /// and the units it still has for that.
    fn npc_quote(&self, hub: &str, material: &str, incoming: Side) -> Option<(f64, f64)> {
        let sim = self.npc.as_ref()?;
        let p = sim.price(hub, material)?;
        let n = self.state.npc.as_ref()?;
        let (price, left) = match incoming {
            Side::Buy => (round2(1.25 * p), n.asks_left.get(hub).map(|q| amount_of(q, material)).unwrap_or(0.0)),
            Side::Sell => (round2(0.8 * p), n.bids_left.get(hub).map(|q| amount_of(q, material)).unwrap_or(0.0)),
        };
        (left > EPS).then_some((price, left))
    }

    /// Best waiting player order the incoming order (at `idx`) can meet: lowest ask for a buy,
    /// highest bid for a sell, earliest first at one price, never the same account's.
    fn best_maker(&self, idx: usize) -> Option<usize> {
        let o = &self.state.orders[idx];
        let candidates = self.state.orders.iter().enumerate().filter(|(j, r)| {
            *j != idx && r.hub_id == o.hub_id && r.material == o.material && r.side != o.side && r.account != o.account && r.remaining > EPS
        });
        // `min_by` keeps the first of equal elements: the earliest order at the best price
        match o.side {
            Side::Buy => candidates.min_by(|(_, a), (_, b)| a.price.total_cmp(&b.price)).map(|(j, _)| j),
            Side::Sell => candidates.min_by(|(_, a), (_, b)| b.price.total_cmp(&a.price)).map(|(j, _)| j),
        }
    }

    fn record_trade(&mut self, hub: &str, material: &str, price: f64, q: f64, buyer: Option<String>, seller: Option<String>) -> Trade {
        let t = Trade {
            id: self.new_id("trade"),
            hub_id: hub.to_string(),
            material: material.to_string(),
            price,
            quantity: q,
            buyer,
            seller,
            at: self.state.time,
        };
        self.state.trades.push(t.clone());
        if self.state.trades.len() > TRADES_KEPT {
            let extra = self.state.trades.len() - TRADES_KEPT;
            self.state.trades.drain(..extra);
        }
        t
    }

    /// The incoming order at `idx` meets the book until its limit, its quantity or the book ends.
    fn match_order(&mut self, idx: usize) -> Vec<Trade> {
        let fee = self.cfg.fee;
        // the faction's duty on the taker's trades with it (players trade without it)
        let duty = self.tariff_of(&self.state.orders[idx].account, &self.state.orders[idx].hub_id);
        let mut trades = Vec::new();
        let mut npc_units = 0.0; // bought from the faction (> 0) or sold to it (< 0)
        let mut npc_value = 0.0; // credits traded with it
        loop {
            let o = self.state.orders[idx].clone();
            if o.remaining <= EPS {
                break;
            }
            let maker = self.best_maker(idx);
            let maker_price = maker.map(|j| self.state.orders[j].price);
            let npc = self.npc_quote(&o.hub_id, &o.material, o.side);
            // players before the faction at one price
            let use_npc = match (maker_price, npc) {
                (_, None) => false,
                (None, Some(_)) => true,
                (Some(m), Some((n, _))) => match o.side {
                    Side::Buy => n < m,
                    Side::Sell => n > m,
                },
            };
            let price = if use_npc { npc.map(|(p, _)| p) } else { maker_price };
            let Some(price) = price else { break };
            let crosses = match o.side {
                Side::Buy => price <= o.price,
                Side::Sell => price >= o.price,
            };
            if !crosses {
                break;
            }
            let available =
                if use_npc { npc.map(|(_, left)| left).unwrap_or(0.0) } else { self.state.orders[maker.expect("maker")].remaining };
            let q = round3(o.remaining.min(available));
            if q <= EPS {
                break;
            }
            let value = price * q;
            let (buyer, seller) = if use_npc {
                let n = self.state.npc.as_mut().expect("factions");
                let left = match o.side {
                    Side::Buy => n.asks_left.entry(o.hub_id.clone()).or_default(),
                    Side::Sell => n.bids_left.entry(o.hub_id.clone()).or_default(),
                };
                let cur = amount_of(left, &o.material);
                left.insert(o.material.clone(), (cur - q).max(0.0));
                npc_units += if o.side == Side::Buy { q } else { -q };
                npc_value += value;
                match o.side {
                    Side::Buy => (Some(o.account.clone()), None),
                    Side::Sell => (None, Some(o.account.clone())),
                }
            } else {
                let j = maker.expect("maker");
                let m = &mut self.state.orders[j];
                m.remaining = round3(m.remaining - q);
                if m.side == Side::Buy {
                    m.held -= value * (1.0 + fee);
                }
                let maker_account = m.account.clone();
                match o.side {
                    Side::Buy => (Some(o.account.clone()), Some(maker_account)),
                    Side::Sell => (Some(maker_account), Some(o.account.clone())),
                }
            };
            // the taker's charges: the fee, and the duty when the faction is the other side
            let charge = if use_npc { fee + duty } else { fee };
            {
                let taker = &mut self.state.orders[idx];
                taker.remaining = round3(taker.remaining - q);
                if taker.side == Side::Buy {
                    taker.held -= value * (1.0 + charge);
                }
            }
            if let Some(b) = &buyer {
                let s = self.stock_mut(b, &o.hub_id);
                let cur = amount_of(s, &o.material);
                s.insert(o.material.clone(), round3(cur + q));
            }
            if let Some(s) = &seller {
                let rate = if s == &o.account { charge } else { fee };
                self.wallet_mut(s).credits += value * (1.0 - rate);
            }
            trades.push(self.record_trade(&o.hub_id, &o.material, price, q, buyer, seller));
        }
        if npc_units != 0.0 {
            let (hub, material, account) =
                (self.state.orders[idx].hub_id.clone(), self.state.orders[idx].material.clone(), self.state.orders[idx].account.clone());
            let depth = self.cfg.npc.map(|n| n.depth).unwrap_or(0.0);
            if let Some(sim) = self.npc.as_mut() {
                sim.trade(&hub, &material, npc_units, depth);
            }
            if let Some(faction) = faction_of(&hub) {
                self.add_reputation(&account, faction, npc_value * REP_PER_KR);
            }
        }
        // a buy that paid less than its limit gets the difference back now
        let o = &self.state.orders[idx];
        if o.side == Side::Buy {
            let keep = o.price * o.remaining * (1.0 + fee);
            if o.held > keep {
                let back = o.held - keep;
                let account = o.account.clone();
                self.state.orders[idx].held = keep;
                self.wallet_mut(&account).credits += back;
            }
        }
        trades
    }

    /// Removes filled orders, giving back what a filled buy still held (rounding).
    fn sweep_filled(&mut self) {
        let (filled, open): (Vec<Order>, Vec<Order>) = std::mem::take(&mut self.state.orders).into_iter().partition(|o| o.remaining <= EPS);
        self.state.orders = open;
        for o in filled {
            self.release(&o);
        }
    }

    /// Gives back what an order holds: credits of a buy, goods of a sell.
    fn release(&mut self, o: &Order) {
        match o.side {
            Side::Buy => {
                let held = o.held.max(0.0);
                self.wallet_mut(&o.account).credits += held;
            }
            Side::Sell => {
                if o.remaining > EPS {
                    let s = self.stock_mut(&o.account, &o.hub_id);
                    let cur = amount_of(s, &o.material);
                    s.insert(o.material.clone(), round3(cur + o.remaining));
                }
            }
        }
    }

    /// Places a limit order at `now`; it trades at once as far as the book allows, the rest waits.
    #[allow(clippy::too_many_arguments)]
    pub fn place(
        &mut self,
        account: &str,
        hub_id: &str,
        material: &str,
        side: Side,
        quantity: f64,
        price: f64,
        now: f64,
    ) -> ExResult<Placed> {
        if !is_hub(hub_id) {
            return Err(format!("nieznany hub {hub_id}"));
        }
        if !self.values.contains_key(material) {
            return Err(format!("nieznany materiał {material}"));
        }
        let quantity = round3(quantity);
        let price = round2(price);
        if !quantity.is_finite() || quantity <= 0.0 {
            return Err("ilość musi być dodatnia".to_string());
        }
        if !price.is_finite() || price <= 0.0 || price > 1e9 {
            return Err("cena musi być dodatnia".to_string());
        }
        if self.state.orders.iter().filter(|o| o.account == account).count() >= self.cfg.max_orders {
            return Err(format!("najwyżej {} otwartych zleceń", self.cfg.max_orders));
        }
        self.state.time = self.state.time.max(now);
        // a buy holds enough for the faction's duty too (it may fill from the faction at once)
        let charge = self.cfg.fee + self.tariff_of(account, hub_id);
        let held = match side {
            Side::Buy => {
                let need = price * quantity * (1.0 + charge);
                let w = self.wallet_mut(account);
                if w.credits + EPS < need {
                    return Err(format!("brakuje kredytów: zlecenie wiąże {} kr, masz {} kr", round2(need), round2(w.credits)));
                }
                w.credits -= need;
                need
            }
            Side::Sell => {
                let have = self.wallet(account).stock.get(hub_id).cloned().unwrap_or_default();
                let want: Qty = [(material.to_string(), quantity)].into_iter().collect();
                if !can_afford(&have, &want) {
                    return Err(format!("w hubie brakuje {}", format_cost(&missing_for(&have, &want))));
                }
                let s = self.stock_mut(account, hub_id);
                *s = subtract_stock(s, &want);
                0.0
            }
        };
        let order = Order {
            id: self.new_id("order"),
            account: account.to_string(),
            hub_id: hub_id.to_string(),
            material: material.to_string(),
            side,
            price,
            quantity,
            remaining: quantity,
            held,
            placed_at: now,
            expires_at: now + self.cfg.order_seconds * 1000.0,
        };
        self.state.orders.push(order);
        let idx = self.state.orders.len() - 1;
        let trades = self.match_order(idx);
        let order = self.state.orders[idx].clone();
        self.sweep_filled();
        Ok(Placed { order, trades })
    }

    pub fn cancel(&mut self, account: &str, order_id: &str) -> ExResult<Order> {
        let Some(i) = self.state.orders.iter().position(|o| o.id == order_id && o.account == account) else {
            return Err(format!("nie ma zlecenia {order_id}"));
        };
        let o = self.state.orders.remove(i);
        self.release(&o);
        Ok(o)
    }

    // ---- shipments ----

    /// A world sent cargo to a hub (`SHIPMENT_DEPARTED`). The same shipment again (a world restored
    /// from its log reports the departures of its log tail once more) is `None`, also after it
    /// arrived: departures are remembered for [`DEPARTURES_KEPT_MS`].
    pub fn departed(
        &mut self,
        account: &str,
        shipment_id: &str,
        body_id: &str,
        hub_id: &str,
        cargo: &Qty,
        now: f64,
    ) -> ExResult<Option<Shipment>> {
        if !is_hub(hub_id) {
            return Err(format!("nieznany hub {hub_id}"));
        }
        let id = format!("{account}:{shipment_id}");
        if self.state.departures.contains_key(&id) || self.state.shipments.iter().any(|s| s.id == id) {
            return Ok(None);
        }
        self.state.departures.insert(id.clone(), now);
        self.profile(account, None, None);
        let s = Shipment {
            id,
            account: account.to_string(),
            direction: Direction::ToHub,
            hub_id: hub_id.to_string(),
            body_id: body_id.to_string(),
            cargo: cargo.clone(),
            departs_at: now,
            arrives_at: now + self.travel_seconds(&self.star_of(account), hub_id) * 1000.0,
            arrived: false,
        };
        self.state.shipments.push(s.clone());
        Ok(Some(s))
    }

    /// Sends goods from a hub to the account's colony body.
    pub fn ship_home(&mut self, account: &str, hub_id: &str, body_id: &str, cargo: &Qty, now: f64) -> ExResult<Shipment> {
        if !is_hub(hub_id) {
            return Err(format!("nieznany hub {hub_id}"));
        }
        if body_id.is_empty() {
            return Err("brak celu wysyłki".to_string());
        }
        let cargo: Qty = cargo.iter().map(|(k, q)| (k.clone(), round3(*q))).collect();
        if cargo.is_empty() || !cargo.values().all(|q| q.is_finite() && *q > 0.0) {
            return Err("ładunek musi mieć dodatnie ilości".to_string());
        }
        let have = self.wallet(account).stock.get(hub_id).cloned().unwrap_or_default();
        if !can_afford(&have, &cargo) {
            return Err(format!("w hubie brakuje {}", format_cost(&missing_for(&have, &cargo))));
        }
        let s = self.stock_mut(account, hub_id);
        *s = subtract_stock(s, &cargo);
        let s = Shipment {
            id: self.new_id("freight"),
            account: account.to_string(),
            direction: Direction::ToColony,
            hub_id: hub_id.to_string(),
            body_id: body_id.to_string(),
            arrives_at: now + self.travel_seconds(&self.star_of(account), hub_id) * 1000.0,
            cargo,
            departs_at: now,
            arrived: false,
        };
        self.state.shipments.push(s.clone());
        Ok(s)
    }

    /// Shipments at colonies waiting for their worlds.
    pub fn deliveries(&self) -> Vec<Shipment> {
        self.state.shipments.iter().filter(|s| s.arrived).cloned().collect()
    }

    /// The world took the shipment.
    pub fn delivered(&mut self, shipment_id: &str) -> Option<Shipment> {
        let i = self.state.shipments.iter().position(|s| s.id == shipment_id && s.arrived)?;
        Some(self.state.shipments.remove(i))
    }

    /// The world could not take it: the goods go back to the hub's stock.
    pub fn returned(&mut self, shipment_id: &str) -> Option<Shipment> {
        let s = self.delivered(shipment_id)?;
        let stock = self.stock_mut(&s.account, &s.hub_id);
        *stock = add_stock(stock, &s.cargo, 1.0);
        Some(s)
    }

    // ---- time ----

    /// Every faction's stock of quotes back to `depth`.
    fn refill(&mut self) {
        let Some(depth) = self.cfg.npc.map(|n| n.depth) else { return };
        let full: Qty = self.values.keys().map(|m| (m.clone(), depth)).collect();
        if let Some(n) = self.state.npc.as_mut() {
            for (hub, _, _) in GALAXY_HUBS {
                n.bids_left.insert(hub.to_string(), full.clone());
                n.asks_left.insert(hub.to_string(), full.clone());
            }
        }
    }

    /// Time passes to `now`: shipments arrive, orders expire, factions update.
    pub fn advance(&mut self, now: f64) -> Changes {
        let mut ch = Changes::default();
        self.state.time = self.state.time.max(now);
        let now = self.state.time;
        self.state.departures.retain(|_, t| *t + DEPARTURES_KEPT_MS > now);
        // shipments
        let mut i = 0;
        while i < self.state.shipments.len() {
            let s = &self.state.shipments[i];
            if s.arrived || s.arrives_at > now {
                i += 1;
                continue;
            }
            ch.accounts.insert(s.account.clone());
            match s.direction {
                Direction::ToHub => {
                    let s = self.state.shipments.remove(i);
                    let stock = self.stock_mut(&s.account, &s.hub_id);
                    *stock = add_stock(stock, &s.cargo, 1.0);
                }
                Direction::ToColony => {
                    self.state.shipments[i].arrived = true;
                    ch.deliveries = true;
                    i += 1;
                }
            }
        }
        // orders
        let (expired, open): (Vec<Order>, Vec<Order>) =
            std::mem::take(&mut self.state.orders).into_iter().partition(|o| o.expires_at <= now);
        self.state.orders = open;
        for o in expired {
            ch.accounts.insert(o.account.clone());
            self.release(&o);
        }
        // contracts and reputation
        self.age_contracts(now, &mut ch);
        // factions: prices and depth; new contracts in place of the lapsed and delivered ones
        if let (Some(sim), Some(n)) = (self.npc.as_mut(), self.state.npc.as_ref()) {
            let minutes = (now - n.epoch) / 60_000.0;
            sim.fast_forward(minutes, MAX_NPC_UPDATES);
            if sim.advance(minutes) {
                ch.quotes = true;
            }
        }
        if ch.quotes {
            self.refill();
            if self.issue_contracts() {
                ch.contracts = true;
            }
        }
        ch
    }

    // ---- views ----

    fn quotes(&self, hub: &str) -> Vec<MarketQuote> {
        let fac = self.npc.as_ref().and_then(|sim| sim.hubs().into_iter().find(|h| h.id == hub));
        self.values
            .keys()
            .map(|mat| {
                let best = |side: Side| {
                    let prices =
                        self.state.orders.iter().filter(|o| o.hub_id == hub && &o.material == mat && o.side == side).map(|o| o.price);
                    match side {
                        Side::Buy => prices.reduce(f64::max),
                        Side::Sell => prices.reduce(f64::min),
                    }
                };
                let npc_bid = self.npc_quote(hub, mat, Side::Sell).map(|(p, _)| p);
                let npc_ask = self.npc_quote(hub, mat, Side::Buy).map(|(p, _)| p);
                let bid = [best(Side::Buy), npc_bid].into_iter().flatten().reduce(f64::max).unwrap_or(0.0);
                let ask = [best(Side::Sell), npc_ask].into_iter().flatten().reduce(f64::min).unwrap_or(0.0);
                let change = fac.as_ref().and_then(|h| h.quotes.iter().find(|q| &q.material == mat)).map(|q| q.change).unwrap_or(0.0);
                MarketQuote { material: mat.clone(), value: round2(self.values[mat]), bid, ask, change }
            })
            .collect()
    }

    fn book(&self, hub: &str) -> Vec<BookLevel> {
        let mut out = Vec::new();
        for mat in self.values.keys() {
            for side in [Side::Buy, Side::Sell] {
                let mut levels: IndexMap<String, (f64, f64)> = IndexMap::new();
                for o in self.state.orders.iter().filter(|o| o.hub_id == hub && &o.material == mat && o.side == side) {
                    let e = levels.entry(format!("{:.2}", o.price)).or_insert((o.price, 0.0));
                    e.1 += o.remaining;
                }
                let mut levels: Vec<(f64, f64)> = levels.into_values().collect();
                match side {
                    Side::Buy => levels.sort_by(|a, b| b.0.total_cmp(&a.0)),
                    Side::Sell => levels.sort_by(|a, b| a.0.total_cmp(&b.0)),
                }
                for (price, quantity) in levels.into_iter().take(BOOK_LEVELS) {
                    out.push(BookLevel { material: mat.clone(), side, price, quantity: round3(quantity), npc: false });
                }
                // the faction's quote: it buys (its bid) what a seller brings, sells (its ask) to a buyer
                let incoming = if side == Side::Buy { Side::Sell } else { Side::Buy };
                if let Some((price, left)) = self.npc_quote(hub, mat, incoming) {
                    out.push(BookLevel { material: mat.clone(), side, price, quantity: round3(left), npc: true });
                }
            }
        }
        out
    }

    /// Hubs as the snapshot has them (quotes only), for every viewer.
    pub fn hubs(&self) -> Vec<MarketHub> {
        GALAXY_HUBS
            .iter()
            .map(|(id, name, star)| MarketHub {
                id: id.to_string(),
                name: name.to_string(),
                star: star.to_string(),
                quotes: self.quotes(id),
            })
            .collect()
    }

    /// Faction commanders and players, except `viewer`.
    pub fn players(&self, viewer: &str) -> Vec<GalaxyPlayer> {
        let mut out: Vec<GalaxyPlayer> = self
            .npc
            .as_ref()
            .map(|sim| sim.players().into_iter().map(|player| GalaxyPlayer { player, npc: true }).collect())
            .unwrap_or_default();
        for (id, p) in &self.state.profiles {
            if id == viewer {
                continue;
            }
            out.push(GalaxyPlayer {
                player: SimulatedPlayer {
                    id: id.clone(),
                    name: p.callsign.clone(),
                    corporation: self.corporation_name(id),
                    home_star: p.star.clone(),
                    colonies: 1.0,
                    score: 0.0,
                },
                npc: false,
            });
        }
        out
    }

    pub fn view(&self, account: &str) -> GalaxyView {
        let wallet = self.wallet(account);
        let star = self.star_of(account);
        let hubs = self
            .hubs()
            .into_iter()
            .map(|market| {
                let hub_star = hub_def(&market.id).map(|h| h.2).unwrap_or(DEFAULT_HOME_STAR);
                HubView {
                    faction: if self.npc.is_some() { faction_of(&market.id).map(String::from) } else { None },
                    distance_ly: round2(distance_ly(&star, hub_star)),
                    travel_seconds: self.travel_seconds(&star, &market.id),
                    stock: wallet.stock.get(&market.id).cloned().unwrap_or_default().into_iter().filter(|(_, q)| *q > EPS).collect(),
                    book: self.book(&market.id),
                    reputation: faction_of(&market.id).map(|f| round2(self.reputation(account, f))).unwrap_or(0.0),
                    tariff: self.tariff_of(account, &market.id),
                    market,
                }
            })
            .collect();
        let mine = |a: &Option<String>| a.as_deref() == Some(account);
        let trades: Vec<Trade> =
            self.state.trades.iter().rev().filter(|t| mine(&t.buyer) || mine(&t.seller)).take(TRADES_SHOWN).cloned().collect();
        let contracts: Vec<Contract> = self
            .state
            .contracts
            .iter()
            .rev()
            .filter(|c| c.state == ContractState::Open || mine(&c.taker))
            .take(TRADES_SHOWN + GALAXY_HUBS.len() * self.cfg.contracts_per_hub)
            .cloned()
            .collect();
        GalaxyView {
            account: account.to_string(),
            credits: round2(wallet.credits),
            fee: self.cfg.fee,
            npc: self.npc.is_some(),
            hubs,
            orders: self.state.orders.iter().filter(|o| o.account == account).cloned().collect(),
            shipments: self.state.shipments.iter().filter(|s| s.account == account).cloned().collect(),
            trades,
            players: self.players(account),
            contracts,
            corporation: self.corp_view(account),
            invitations: self.invitations_of(account),
            corporations: self.corp_summaries(),
            time: self.state.time,
        }
    }
}

/// Markets for the tests of this module and its children.
#[cfg(test)]
mod tests_support {
    use super::*;
    use game_core::economy::{EconomyParams, compute_economy};

    pub fn market_with(f: impl FnOnce(&mut MarketConfig)) -> Exchange {
        let mut cfg = MarketConfig { seconds_per_ly: 1.0, handling_seconds: 10.0, ..MarketConfig::default() };
        f(&mut cfg);
        Exchange::new(&compute_economy(EconomyParams::default()), cfg, None, 1_000_000.0)
    }

    /// Goods straight into an account's stock in a hub (as an arrived shipment).
    pub fn put_in_hub(m: &mut Exchange, account: &str, hub: &str, goods: Qty) {
        let s = m.stock_mut(account, hub);
        *s = add_stock(s, &goods, 1.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_core::economy::{EconomyParams, compute_economy};
    use game_core::models::resource::qty;

    const T0: f64 = 1_000_000.0;

    fn eco() -> Economy {
        compute_economy(EconomyParams::default())
    }

    fn market(npc: bool) -> Exchange {
        let mut cfg = MarketConfig { seconds_per_ly: 1.0, handling_seconds: 10.0, ..MarketConfig::default() };
        if !npc {
            cfg.npc = None;
        }
        Exchange::new(&eco(), cfg, None, T0)
    }

    /// Gives an account goods in a hub as a shipment would.
    fn deliver_to_hub(m: &mut Exchange, account: &str, hub: &str, cargo: Qty) {
        m.departed(account, &format!("cargo-{}", m.state.next_id + 100), "tc-e", hub, &cargo, m.state.time).unwrap();
        let later = m.state.time + 3_600_000.0 * 24.0;
        m.advance(later);
    }

    fn credits(m: &Exchange, a: &str) -> f64 {
        m.wallet(a).credits
    }

    fn stock(m: &Exchange, a: &str, hub: &str, mat: &str) -> f64 {
        m.wallet(a).stock.get(hub).map(|s| amount_of(s, mat)).unwrap_or(0.0)
    }

    #[test]
    fn two_players_trade_inside_the_factions_spread() {
        let mut m = market(true);
        let hub = "hub-sirius";
        m.profile("acc-1", Some("Kestrel"), Some("Tau Ceti"));
        m.profile("acc-2", Some("Wega"), Some("Tau Ceti"));
        deliver_to_hub(&mut m, "acc-1", hub, qty([("FER", 40.0)]));
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 40.0);

        let q = m.quotes(hub).into_iter().find(|q| q.material == "FER").unwrap();
        assert!(q.bid > 0.0 && q.ask > q.bid, "the faction quotes: {q:?}");
        let mid = round2((q.bid + q.ask) / 2.0);

        // the seller waits inside the spread: nobody meets that at once
        let sold = m.place("acc-1", hub, "FER", Side::Sell, 30.0, mid, m.state.time).unwrap();
        assert!(sold.trades.is_empty());
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 10.0, "30 held by the order");
        assert_eq!(m.quotes(hub).into_iter().find(|q| q.material == "FER").unwrap().ask, mid, "the best ask is the player's");

        // the buyer pays the seller's price, below the faction's ask
        let c1 = credits(&m, "acc-1");
        let c2 = credits(&m, "acc-2");
        let bought = m.place("acc-2", hub, "FER", Side::Buy, 20.0, q.ask, m.state.time).unwrap();
        assert_eq!(bought.trades.len(), 1);
        let t = &bought.trades[0];
        assert_eq!((t.price, t.quantity, t.buyer.as_deref(), t.seller.as_deref()), (mid, 20.0, Some("acc-2"), Some("acc-1")));
        assert_eq!(bought.order.remaining, 0.0);
        let value = mid * 20.0;
        assert!((credits(&m, "acc-2") - (c2 - value * 1.02)).abs() < 1e-6, "paid the price and the fee, the rest of the hold is back");
        assert!((credits(&m, "acc-1") - (c1 + value * 0.98)).abs() < 1e-6, "got the price less the fee");
        assert_eq!(stock(&m, "acc-2", hub, "FER"), 20.0);
        assert_eq!(m.state.orders.len(), 1, "10 units of the sell order wait");
        assert!(m.view("acc-1").trades.iter().any(|x| x.id == t.id));
        assert!(m.view("acc-2").players.iter().any(|p| p.player.name == "Kestrel" && !p.npc));

        // cancelling gives the rest back
        let left = m.cancel("acc-1", &sold.order.id).unwrap();
        assert_eq!(left.remaining, 10.0);
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 20.0);
        assert!(m.cancel("acc-2", &sold.order.id).is_err());
    }

    #[test]
    fn the_faction_trades_its_depth_and_its_price_moves() {
        let mut m = market(true);
        let hub = "hub-sol";
        let before = m.npc.as_ref().unwrap().price(hub, "KRI").unwrap();
        let ask = round2(1.25 * before);
        // more than the depth at a high limit: the faction sells 50, the rest waits
        let out = m.place("acc-1", hub, "KRI", Side::Buy, 60.0, ask * 2.0, T0).unwrap();
        assert_eq!(out.trades.len(), 1);
        assert_eq!((out.trades[0].price, out.trades[0].quantity, out.trades[0].seller.clone()), (ask, 50.0, None));
        assert_eq!(out.order.remaining, 10.0);
        let after = m.npc.as_ref().unwrap().price(hub, "KRI").unwrap();
        assert!(after > before, "buying from the faction raises P: {before} → {after}");
        // the rest holds credits for 10 units at its limit; the 50 were paid at the ask, with the
        // fee and the faction's duty (5% at reputation 0)
        let c = credits(&m, "acc-1");
        assert!((c - (1000.0 - ask * 50.0 * 1.07 - ask * 2.0 * 10.0 * 1.02)).abs() < 1e-6, "{c}");
        assert!((m.reputation("acc-1", "Unia Lagrange") - ask * 50.0 * REP_PER_KR).abs() < 1e-9, "trade volume builds reputation");

        // the faction's next update brings its depth back
        assert!(m.npc_quote(hub, "KRI", Side::Buy).is_none());
        let ch = m.advance(T0 + 601_000.0);
        assert!(ch.quotes);
        assert!(m.npc_quote(hub, "KRI", Side::Buy).is_some());
    }

    #[test]
    fn checks_money_goods_and_never_trades_with_itself() {
        let mut m = market(true);
        let hub = "hub-sirius";
        assert!(m.place("acc-1", hub, "FER", Side::Buy, 1e6, 100.0, T0).unwrap_err().starts_with("brakuje kredytów"));
        assert!(m.place("acc-1", hub, "FER", Side::Sell, 5.0, 10.0, T0).unwrap_err().starts_with("w hubie brakuje FER"));
        assert!(m.place("acc-1", "hub-x", "FER", Side::Buy, 1.0, 1.0, T0).is_err());
        assert!(m.place("acc-1", hub, "XYZ", Side::Buy, 1.0, 1.0, T0).is_err());
        assert!(m.place("acc-1", hub, "FER", Side::Buy, -1.0, 1.0, T0).is_err());
        assert!(m.place("acc-1", hub, "FER", Side::Buy, 1.0, f64::NAN, T0).is_err());

        let mut m = market(false);
        deliver_to_hub(&mut m, "acc-1", hub, qty([("FER", 10.0)]));
        let now = m.state.time;
        m.place("acc-1", hub, "FER", Side::Sell, 10.0, 5.0, now).unwrap();
        let own = m.place("acc-1", hub, "FER", Side::Buy, 10.0, 6.0, now).unwrap();
        assert!(own.trades.is_empty(), "an account does not meet its own order");
        assert_eq!(m.state.orders.len(), 2);
    }

    #[test]
    fn without_factions_only_players_meet_and_orders_expire() {
        let mut m = market(false);
        let hub = "hub-procyon";
        assert!(m.quotes(hub).iter().all(|q| q.bid == 0.0 && q.ask == 0.0));
        assert!(m.view("acc-1").players.is_empty());
        assert!(m.view("acc-1").hubs.iter().all(|h| h.faction.is_none()));
        let now = m.state.time;
        let waiting = m.place("acc-2", hub, "SIL", Side::Buy, 5.0, 7.0, now).unwrap();
        assert!(waiting.trades.is_empty());
        assert!((credits(&m, "acc-2") - (1000.0 - 35.0 * 1.02)).abs() < 1e-9);
        deliver_to_hub(&mut m, "acc-1", hub, qty([("SIL", 8.0)]));
        let sold = m.place("acc-1", hub, "SIL", Side::Sell, 8.0, 6.0, m.state.time).unwrap();
        assert_eq!(sold.trades.len(), 1);
        assert_eq!((sold.trades[0].price, sold.trades[0].quantity), (7.0, 5.0), "at the waiting buyer's price");
        assert_eq!(stock(&m, "acc-2", hub, "SIL"), 5.0);
        // the unsold 3 wait; after 7 days they come back
        assert_eq!(stock(&m, "acc-1", hub, "SIL"), 0.0);
        let ch = m.advance(m.state.time + 8.0 * 24.0 * 3_600_000.0);
        assert!(ch.accounts.contains("acc-1"));
        assert_eq!(stock(&m, "acc-1", hub, "SIL"), 3.0);
        assert!(m.state.orders.is_empty());
    }

    #[test]
    fn shipments_take_their_time_both_ways() {
        let mut m = market(true);
        m.profile("acc-1", Some("Kestrel"), Some("Tau Ceti"));
        let hub = "hub-eridani";
        let travel = m.travel_seconds("Tau Ceti", hub);
        let d = distance_ly("Tau Ceti", "Epsilon Eridani");
        // the register's positions (W10 directions), not the real 5.5 ly
        assert!(d > 1.0 && d < 4.0, "Tau Ceti – Epsilon Eridani: {d}");
        assert!((distance_ly("Tau Ceti", "Sol (Sun)") - 11.9).abs() < 0.2, "{}", distance_ly("Tau Ceti", "Sol (Sun)"));
        assert!((travel - (10.0 + d)).abs() < 1e-9);

        let s = m.departed("acc-1", "cargo-7", "tc-e", hub, &qty([("FER", 12.0)]), T0).unwrap().expect("a new shipment");
        assert_eq!(s.id, "acc-1:cargo-7");
        assert!(m.departed("acc-1", "cargo-7", "tc-e", hub, &qty([("FER", 12.0)]), T0).unwrap().is_none(), "idempotent");
        m.advance(T0 + travel * 1000.0 - 1.0);
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 0.0, "still on the way");
        let ch = m.advance(T0 + travel * 1000.0);
        assert!(ch.accounts.contains("acc-1"));
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 12.0);
        // reported again after it arrived (a world restored from its log): nothing twice
        assert!(m.departed("acc-1", "cargo-7", "tc-e", hub, &qty([("FER", 12.0)]), T0).unwrap().is_none());
        m.advance(T0 + 2.0 * travel * 1000.0);
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 12.0);

        let now = m.state.time;
        assert!(m.ship_home("acc-1", hub, "tc-e", &qty([("FER", 20.0)]), now).is_err());
        let home = m.ship_home("acc-1", hub, "tc-e", &qty([("FER", 5.0)]), now).unwrap();
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 7.0);
        assert!(m.deliveries().is_empty());
        let ch = m.advance(now + travel * 1000.0);
        assert!(ch.deliveries);
        assert_eq!(m.deliveries().len(), 1);
        assert_eq!(m.returned(&home.id).unwrap().cargo, qty([("FER", 5.0)]));
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 12.0, "a world that cannot take it sends it back");

        let again = m.ship_home("acc-1", hub, "tc-e", &qty([("FER", 2.0)]), now).unwrap();
        m.advance(now + 2.0 * travel * 1000.0);
        assert!(m.delivered(&again.id).is_some());
        assert!(m.deliveries().is_empty());
        assert_eq!(stock(&m, "acc-1", hub, "FER"), 10.0);
    }

    /// 05-SOCIAL S1: the factions' contracts pay above the market and give reputation; a taken one
    /// not delivered in time costs reputation; reputation fades and sets the duty.
    #[test]
    fn contracts_pay_and_build_reputation() {
        assert_eq!((tariff(-1.0), tariff(0.0), tariff(30.0), tariff(80.0)), (0.10, 0.05, 0.025, 0.0));
        let mut m = market(true);
        let hub = "hub-sirius";
        let open = |m: &Exchange| m.state.contracts.iter().filter(|c| c.state == ContractState::Open).count();
        assert_eq!(open(&m), 12, "3 per hub from the start");
        let c = m.state.contracts.iter().find(|c| c.hub_id == hub && c.min_rep == 0.0).unwrap().clone();
        let price = m.npc.as_ref().unwrap().price(hub, &c.material).unwrap();
        assert!((c.reward - round2(c.quantity * price * 1.3)).abs() < 1e-9, "{c:?}");
        assert!(m.state.contracts.iter().all(|x| x.quantity >= 1.0 && x.quantity <= 50.0), "within the faction's depth");
        let premium = m.state.contracts.iter().find(|x| x.hub_id == hub && x.min_rep == PREMIUM_REP).unwrap().id.clone();
        assert!(m.take_contract("acc-1", &premium).unwrap_err().contains("wymaga reputacji 75"));

        assert!(m.deliver_contract("acc-1", &c.id).is_err(), "taken first");
        m.take_contract("acc-1", &c.id).unwrap();
        assert!(m.take_contract("acc-2", &c.id).is_err(), "one taker");
        assert!(!m.view("acc-2").contracts.iter().any(|x| x.id == c.id), "others no longer see it");
        assert!(m.deliver_contract("acc-1", &c.id).unwrap_err().starts_with("w hubie brakuje"));
        deliver_to_hub(&mut m, "acc-1", hub, [(c.material.clone(), c.quantity + 1.0)].into_iter().collect());
        let before = credits(&m, "acc-1");
        let done = m.deliver_contract("acc-1", &c.id).unwrap();
        assert_eq!(done.state, ContractState::Delivered);
        assert!((credits(&m, "acc-1") - (before + c.reward)).abs() < 1e-9);
        assert_eq!(stock(&m, "acc-1", hub, &c.material), 1.0);
        assert_eq!(m.reputation("acc-1", "Konsorcjum Orion"), REP_PER_CONTRACT);
        assert!(m.view("acc-1").contracts.iter().any(|x| x.id == c.id && x.state == ContractState::Delivered));

        // taken and missed: the reputation goes back down; the faction issues new ones
        let next =
            m.state.contracts.iter().find(|x| x.hub_id == hub && x.state == ContractState::Open && x.min_rep == 0.0).unwrap().id.clone();
        m.take_contract("acc-1", &next).unwrap();
        let ch = m.advance(m.state.time + 49.0 * 3_600_000.0);
        assert!(ch.contracts && ch.accounts.contains("acc-1"));
        assert_eq!(m.state.contracts.iter().find(|x| x.id == next).unwrap().state, ContractState::Failed);
        assert_eq!(m.reputation("acc-1", "Konsorcjum Orion"), 0.0, "5 − 5 (and no fading below 0)");
        assert_eq!(open(&m), 12, "new contracts in place of the lapsed ones");

        // fading: 1 a day above 0; the duty follows the reputation
        m.add_reputation("acc-1", "Unia Lagrange", 30.0);
        assert_eq!(m.tariff_of("acc-1", "hub-sol"), 0.025);
        m.advance(m.state.time + 2.0 * 86_400_000.0);
        assert!((m.reputation("acc-1", "Unia Lagrange") - 28.0).abs() < 1e-9);
        let v = m.view("acc-1");
        let sol = v.hubs.iter().find(|h| h.market.id == "hub-sol").unwrap();
        assert_eq!((sol.reputation, sol.tariff), (28.0, 0.025));

        // without factions: no contracts, no duty
        let off = market(false);
        assert!(off.state.contracts.is_empty());
        assert_eq!(off.tariff_of("acc-1", hub), 0.0);
    }

    /// The saved state continues as the uninterrupted market (the factions' clock and prices too),
    /// and switching the factions off keeps players' goods and orders.
    #[test]
    fn state_round_trips_and_factions_can_be_switched_off() {
        let mut a = market(true);
        a.profile("acc-1", Some("Kestrel"), None);
        deliver_to_hub(&mut a, "acc-1", "hub-sol", qty([("FER", 9.0)]));
        let now = a.state.time;
        a.place("acc-1", "hub-sol", "FER", Side::Sell, 4.0, 999.0, now).unwrap();
        let json = serde_json::to_string(&a.save()).unwrap();
        let saved: ExchangeState = serde_json::from_str(&json).unwrap();
        let cfg = a.config().clone();
        let mut b = Exchange::new(&eco(), cfg.clone(), Some(saved.clone()), now + 5.0);
        assert_eq!(b.save(), a.save());
        for t in 1..=5 {
            let at = now + t as f64 * 400_000.0;
            assert_eq!(a.advance(at), b.advance(at));
        }
        assert_eq!(serde_json::to_string(&a.save()).unwrap(), serde_json::to_string(&b.save()).unwrap());
        assert_eq!(a.view("acc-1"), b.view("acc-1"));

        let off = Exchange::new(&eco(), MarketConfig { npc: None, ..cfg }, Some(saved), now);
        assert!(!off.has_npc() && off.save().npc.is_none());
        assert_eq!(off.state.orders.len(), 1);
        assert_eq!(off.wallet("acc-1"), a.wallet("acc-1"));
    }
}
