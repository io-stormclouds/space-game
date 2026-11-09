//! Galaxy service (plan 02 §3, 05-SOCIAL §8): one task owns the shared market
//! ([`Exchange`]: hubs, order books, credits, shipments, NPC factions) and talks to connections and
//! worlds by messages. It runs on the server's clock (unix ms), not on any world's steps.
//!
//! - A client's request `{"id","galaxy":{"op":…}}` gets a `{"type":"reply"}` like a world request;
//!   after every change each connected client gets its `{"type":"galaxy","view"}` (the view is per
//!   account: own credits, goods, orders, shipments).
//! - Worlds report cargo sent to a hub (`SHIPMENT_DEPARTED`); shipments that reach a colony go to its
//!   world as a `HUB_DELIVERY` system command (the world is woken when asleep). A delivery is
//!   retried until its world answers; the world takes each shipment once (its log is checked), or
//!   refuses it, and then the goods go back to the hub.
//! - The state is written to `DATA_DIR/galaxy.json` (atomically) at most every second when it
//!   changed, and on shutdown.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Weak};
use std::time::Duration;

use serde::Deserialize;
use tokio::sync::{mpsc, oneshot};

use game_core::economy::{EconomyParams, compute_economy};
use game_core::models::resource::Qty;
use game_session::exchange::{Exchange, ExchangeState, Side};

use crate::AppState;
use crate::accounts::write_atomic;
use crate::config::Config;
use crate::world::{ClientId, Wire, WorldMsg, wall_ms};

pub enum GalaxyMsg {
    Connect {
        account: String,
        callsign: String,
        client: ClientId,
        tx: mpsc::UnboundedSender<Wire>,
    },
    Disconnect {
        client: ClientId,
    },
    /// A client's galaxy request (`op` is the JSON of [`GalaxyOp`]).
    Op {
        account: String,
        client: ClientId,
        id: u64,
        op: serde_json::Value,
    },
    /// A world runs: the star its colony is at.
    Home {
        account: String,
        star: String,
    },
    /// A world sent cargo to a hub.
    Departed {
        account: String,
        shipment_id: String,
        body_id: String,
        hub_id: String,
        cargo: Qty,
    },
    /// A world's answer to a delivery: taken, refused, or no answer (`None`: try again).
    Delivered {
        shipment_id: String,
        taken: Option<bool>,
    },
    /// Write the state and stop (shutdown).
    Stop {
        done: oneshot::Sender<()>,
    },
}

#[derive(Deserialize, Debug)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum GalaxyOp {
    View,
    PlaceOrder { hub_id: String, material: String, side: Side, quantity: f64, price: f64 },
    CancelOrder { order_id: String },
    ShipHome { hub_id: String, body_id: String, cargo: Qty },
}

pub fn galaxy_path(cfg: &Config) -> PathBuf {
    cfg.data_dir.join("galaxy.json")
}

/// The market from `galaxy.json` (a new one when there is none; an unreadable file is kept aside).
pub fn open_exchange(cfg: &Config, now: f64) -> Exchange {
    let path = galaxy_path(cfg);
    let saved = match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<ExchangeState>(&text) {
            Ok(s) => Some(s),
            Err(e) => {
                let aside = path.with_extension(format!("broken-{}.json", now as u64));
                eprintln!("galaxy: cannot read {} ({e}); keeping it as {} and starting a new market", path.display(), aside.display());
                let _ = std::fs::rename(&path, &aside);
                None
            }
        },
        Err(_) => None,
    };
    Exchange::new(&compute_economy(EconomyParams::default()), cfg.market.clone(), saved, now)
}

fn reply_ok(id: u64, value: impl serde::Serialize) -> String {
    serde_json::json!({ "type": "reply", "id": id, "ok": true, "value": value }).to_string()
}

fn reply_err(id: u64, error: &str) -> String {
    serde_json::json!({ "type": "reply", "id": id, "ok": false, "error": error }).to_string()
}

pub struct GalaxyService {
    exchange: Exchange,
    path: PathBuf,
    tick_ms: u64,
    clients: HashMap<ClientId, (String, mpsc::UnboundedSender<Wire>)>,
    /// Deliveries sent to worlds and not answered yet.
    in_flight: HashSet<String>,
    dirty: bool,
    last_write_ms: f64,
}

impl GalaxyService {
    pub fn new(cfg: &Config) -> GalaxyService {
        GalaxyService {
            exchange: open_exchange(cfg, wall_ms()),
            path: galaxy_path(cfg),
            tick_ms: cfg.galaxy_tick_ms(),
            clients: HashMap::new(),
            in_flight: HashSet::new(),
            dirty: true,
            last_write_ms: 0.0,
        }
    }

    pub fn exchange(&self) -> &Exchange {
        &self.exchange
    }

    /// One request of an account; the reply's JSON.
    pub fn op(&mut self, account: &str, id: u64, op: serde_json::Value, now: f64) -> String {
        let op: GalaxyOp = match serde_json::from_value(op) {
            Ok(op) => op,
            Err(e) => return reply_err(id, &format!("bad galaxy request: {e}")),
        };
        let ex = &mut self.exchange;
        let out = match op {
            GalaxyOp::View => return reply_ok(id, ex.view(account)),
            GalaxyOp::PlaceOrder { hub_id, material, side, quantity, price } => {
                ex.place(account, &hub_id, &material, side, quantity, price, now).map(|p| reply_ok(id, p))
            }
            GalaxyOp::CancelOrder { order_id } => ex.cancel(account, &order_id).map(|o| reply_ok(id, o)),
            GalaxyOp::ShipHome { hub_id, body_id, cargo } => ex.ship_home(account, &hub_id, &body_id, &cargo, now).map(|s| reply_ok(id, s)),
        };
        match out {
            Ok(r) => {
                self.dirty = true;
                r
            }
            Err(e) => reply_err(id, &e),
        }
    }

    /// Each connected client gets its account's view.
    fn push_all(&self) {
        let mut views: HashMap<&str, Wire> = HashMap::new();
        for (account, tx) in self.clients.values() {
            let json = views
                .entry(account.as_str())
                .or_insert_with(|| serde_json::json!({ "type": "galaxy", "view": self.exchange.view(account) }).to_string().into());
            let _ = tx.send(json.clone());
        }
    }

    fn write(&mut self, now: f64) {
        self.dirty = false;
        self.last_write_ms = now;
        let state = self.exchange.save();
        let path = self.path.clone();
        // small (credits, orders, shipments): written off the loop, atomically
        tokio::task::spawn_blocking(move || match serde_json::to_vec(&state) {
            Ok(bytes) => {
                if let Err(e) = write_atomic(&path, &bytes) {
                    eprintln!("galaxy: cannot write {}: {e}", path.display());
                }
            }
            Err(e) => eprintln!("galaxy: cannot serialise: {e}"),
        });
    }

    fn write_now(&mut self) {
        self.dirty = false;
        match serde_json::to_vec(&self.exchange.save()) {
            Ok(bytes) => {
                if let Err(e) = write_atomic(&self.path, &bytes) {
                    eprintln!("galaxy: cannot write {}: {e}", self.path.display());
                }
            }
            Err(e) => eprintln!("galaxy: cannot serialise: {e}"),
        }
    }

    /// Sends arrived shipments to their worlds (each once until answered).
    fn deliver(&mut self, state: &Weak<AppState>, me: &mpsc::UnboundedSender<GalaxyMsg>) {
        let Some(state) = state.upgrade() else { return };
        for s in self.exchange.deliveries() {
            if !self.in_flight.insert(s.id.clone()) {
                continue;
            }
            let (state, me) = (state.clone(), me.clone());
            tokio::spawn(async move {
                let world = state.world(&s.account).await;
                let (done, answer) = oneshot::channel();
                let msg = WorldMsg::Deliver { shipment_id: s.id.clone(), body_id: s.body_id.clone(), cargo: s.cargo.clone(), done };
                let taken = if world.send(msg).await.is_ok() {
                    tokio::time::timeout(Duration::from_secs(10), answer).await.ok().and_then(|r| r.ok())
                } else {
                    None
                };
                let _ = me.send(GalaxyMsg::Delivered { shipment_id: s.id, taken });
            });
        }
    }

    pub async fn run(mut self, mut rx: mpsc::UnboundedReceiver<GalaxyMsg>, me: mpsc::UnboundedSender<GalaxyMsg>, state: Weak<AppState>) {
        let mut tick = tokio::time::interval(Duration::from_millis(self.tick_ms));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                _ = tick.tick() => {
                    let now = wall_ms();
                    let ch = self.exchange.advance(now);
                    if !ch.accounts.is_empty() || ch.quotes || ch.deliveries {
                        self.dirty = true;
                        self.push_all();
                    }
                    if !self.exchange.deliveries().is_empty() {
                        self.deliver(&state, &me);
                    }
                    if self.dirty && now - self.last_write_ms >= 1000.0 {
                        self.write(now);
                    }
                }
                msg = rx.recv() => match msg {
                    None => { self.write_now(); return; }
                    Some(GalaxyMsg::Connect { account, callsign, client, tx }) => {
                        self.exchange.profile(&account, Some(&callsign), None);
                        let view = serde_json::json!({ "type": "galaxy", "view": self.exchange.view(&account) }).to_string();
                        let _ = tx.send(view.into());
                        self.clients.insert(client, (account, tx));
                        self.dirty = true;
                    }
                    Some(GalaxyMsg::Disconnect { client }) => {
                        self.clients.remove(&client);
                    }
                    Some(GalaxyMsg::Op { account, client, id, op }) => {
                        let reply = self.op(&account, id, op, wall_ms());
                        if let Some((_, tx)) = self.clients.get(&client) {
                            let _ = tx.send(reply.into());
                        }
                        if self.dirty {
                            self.push_all();
                        }
                    }
                    Some(GalaxyMsg::Home { account, star }) => {
                        self.exchange.profile(&account, None, Some(&star));
                        self.dirty = true;
                    }
                    Some(GalaxyMsg::Departed { account, shipment_id, body_id, hub_id, cargo }) => {
                        match self.exchange.departed(&account, &shipment_id, &body_id, &hub_id, &cargo, wall_ms()) {
                            Ok(_) => {
                                self.dirty = true;
                                self.push_all();
                            }
                            // the world checks the hub before it lets the cargo go; this is a bug
                            Err(e) => eprintln!("galaxy: shipment {shipment_id} of {account} lost: {e}"),
                        }
                    }
                    Some(GalaxyMsg::Delivered { shipment_id, taken }) => {
                        self.in_flight.remove(&shipment_id);
                        let done = match taken {
                            Some(true) => self.exchange.delivered(&shipment_id),
                            Some(false) => {
                                println!("galaxy: shipment {shipment_id} refused by its world; the goods go back to the hub");
                                self.exchange.returned(&shipment_id)
                            }
                            None => None, // retried on the next tick
                        };
                        if done.is_some() {
                            self.dirty = true;
                            self.push_all();
                        }
                    }
                    Some(GalaxyMsg::Stop { done }) => {
                        self.write_now();
                        let _ = done.send(());
                        return;
                    }
                }
            }
        }
    }
}

/// Starts the service of an app state.
pub fn spawn(cfg: &Config, state: &Arc<AppState>, rx: mpsc::UnboundedReceiver<GalaxyMsg>) {
    let service = GalaxyService::new(cfg);
    println!(
        "galaxy: {} · {} accounts · NPC factions {}",
        galaxy_path(cfg).display(),
        service.exchange.save().wallets.len(),
        if service.exchange.has_npc() { "on" } else { "off" }
    );
    tokio::spawn(service.run(rx, state.galaxy.clone(), Arc::downgrade(state)));
}
