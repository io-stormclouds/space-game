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
use game_session::exchange::{Exchange, ExchangeState, Role, Side};

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
    PlaceOrder {
        hub_id: String,
        material: String,
        side: Side,
        quantity: f64,
        price: f64,
    },
    CancelOrder {
        order_id: String,
    },
    ShipHome {
        hub_id: String,
        body_id: String,
        cargo: Qty,
    },
    TakeContract {
        contract_id: String,
    },
    DeliverContract {
        contract_id: String,
    },
    // corporations (S2)
    FoundCorporation {
        name: String,
        tag: String,
        hub_id: String,
    },
    Invite {
        callsign: String,
    },
    AcceptInvitation {
        corp_id: String,
    },
    DeclineInvitation {
        corp_id: String,
    },
    LeaveCorporation,
    SetRole {
        account: String,
        role: Role,
    },
    Expel {
        account: String,
    },
    Deposit {
        #[serde(default)]
        credits: f64,
        #[serde(default)]
        goods: Qty,
        #[serde(default)]
        note: String,
    },
    Withdraw {
        #[serde(default)]
        credits: f64,
        #[serde(default)]
        goods: Qty,
        #[serde(default)]
        note: String,
    },
    PostNotice {
        text: String,
    },
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

enum WriterOp {
    Write(Box<ExchangeState>),
    Flush(std::sync::mpsc::Sender<()>),
}

/// Writes `galaxy.json` off the service's loop, one state after another (never two writers of the
/// file at once), atomically.
fn spawn_writer(path: PathBuf) -> std::sync::mpsc::Sender<WriterOp> {
    let (tx, rx) = std::sync::mpsc::channel::<WriterOp>();
    std::thread::Builder::new()
        .name("galaxy-io".into())
        .spawn(move || {
            for op in rx {
                match op {
                    WriterOp::Write(state) => match serde_json::to_vec(&state) {
                        Ok(bytes) => {
                            if let Err(e) = write_atomic(&path, &bytes) {
                                eprintln!("galaxy: cannot write {}: {e}", path.display());
                            }
                        }
                        Err(e) => eprintln!("galaxy: cannot serialise: {e}"),
                    },
                    WriterOp::Flush(done) => {
                        let _ = done.send(());
                    }
                }
            }
        })
        .expect("spawn galaxy-io thread");
    tx
}

pub struct GalaxyService {
    exchange: Exchange,
    writer: std::sync::mpsc::Sender<WriterOp>,
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
            writer: spawn_writer(galaxy_path(cfg)),
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
            GalaxyOp::TakeContract { contract_id } => ex.take_contract(account, &contract_id).map(|c| reply_ok(id, c)),
            GalaxyOp::DeliverContract { contract_id } => ex.deliver_contract(account, &contract_id).map(|c| reply_ok(id, c)),
            GalaxyOp::FoundCorporation { name, tag, hub_id } => {
                ex.found_corporation(account, &name, &tag, &hub_id, now).map(|c| reply_ok(id, c))
            }
            GalaxyOp::Invite { callsign } => ex.invite(account, &callsign, now).map(|c| reply_ok(id, c)),
            GalaxyOp::AcceptInvitation { corp_id } => ex.accept_invitation(account, &corp_id, now).map(|c| reply_ok(id, c)),
            GalaxyOp::DeclineInvitation { corp_id } => ex.decline_invitation(account, &corp_id).map(|v| reply_ok(id, v)),
            GalaxyOp::LeaveCorporation => ex.leave_corporation(account).map(|s| reply_ok(id, s)),
            GalaxyOp::SetRole { account: member, role } => ex.set_role(account, &member, role).map(|c| reply_ok(id, c)),
            GalaxyOp::Expel { account: member } => ex.expel(account, &member).map(|c| reply_ok(id, c)),
            GalaxyOp::Deposit { credits, goods, note } => ex.deposit(account, credits, &goods, &note, now).map(|c| reply_ok(id, c)),
            GalaxyOp::Withdraw { credits, goods, note } => ex.withdraw(account, credits, &goods, &note, now).map(|c| reply_ok(id, c)),
            GalaxyOp::PostNotice { text } => ex.post_notice(account, &text, now).map(|c| reply_ok(id, c)),
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

    /// The state to the writer thread (at most once a second for ordinary changes; at once for the
    /// shipments, whose other half is in a world's log).
    fn write(&mut self, now: f64) {
        self.dirty = false;
        self.last_write_ms = now;
        let _ = self.writer.send(WriterOp::Write(Box::new(self.exchange.save())));
    }

    /// Writes and waits for the disk (shutdown).
    fn write_now(&mut self) {
        self.write(wall_ms());
        let (done, wait) = std::sync::mpsc::channel();
        if self.writer.send(WriterOp::Flush(done)).is_ok() {
            let _ = wait.recv();
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
                    let (shipments, orders, corporations) = self.exchange.counts();
                    let m = &crate::metrics::METRICS;
                    m.galaxy_shipments.store(shipments as u64, std::sync::atomic::Ordering::Relaxed);
                    m.galaxy_orders.store(orders as u64, std::sync::atomic::Ordering::Relaxed);
                    m.galaxy_corporations.store(corporations as u64, std::sync::atomic::Ordering::Relaxed);
                    if !ch.accounts.is_empty() || ch.quotes || ch.deliveries || ch.contracts {
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
                        crate::metrics::inc(&crate::metrics::METRICS.galaxy_ops);
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
                            Ok(Some(_)) => {
                                self.write(wall_ms());
                                self.push_all();
                            }
                            // reported again by a restored world: already taken
                            Ok(None) => {}
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
                            self.write(wall_ms());
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
