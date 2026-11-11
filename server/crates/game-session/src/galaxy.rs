//! Simulated players and market (`mock-server/src/galaxy-sim.ts`, W11 B). Not a multiplayer: data
//! for the social screens of the canvas and load for the UI. Deterministic from the seed; the state
//! (with the generator's) goes into the save file's `meta.galaxy`.
//!
//! FACT (economy doc 4.6): the hub buys at 0.8·P, sells at 1.25·P, P = V · clamp((demand/supply)^0.3, 0.5, 3).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use game_core::economy::Economy;
use game_core::galaxy::stars::STARS;
use game_core::math::js;
use game_core::sim::scenarios::Rng;

use crate::contract::{MarketHub, MarketQuote, SimulatedPlayer};

/// A hub: id, name (Polish), star.
pub type HubDef = (&'static str, &'static str, &'static str);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GalaxyOptions {
    pub seed: i32,
    pub players: usize,
    /// Model minutes between market and player updates.
    pub update_every: f64,
    /// Hubs with a market.
    pub hubs: &'static [HubDef],
}

/// The canvas hubs (the mock's).
pub const CANVAS_HUBS: [HubDef; 2] = [("hub-sirius", "Syriusz", "Sirius A"), ("hub-sol", "Słońce", "Sol (Sun)")];

pub const DEFAULT_GALAXY_OPTIONS: GalaxyOptions = GalaxyOptions { seed: 20_261_107, players: 6, update_every: 10.0, hubs: &CANVAS_HUBS };

const CALLSIGNS: [&str; 12] =
    ["Ares", "Lyra", "Kestrel", "Wega", "Orion", "Nadir", "Halley", "Kepler", "Rigel", "Tycho", "Cassini", "Hydra"];
const CORPORATIONS: [&str; 6] =
    ["Konsorcjum Orion", "Kolektyw Hel-3", "Gildia Ferrytu", "Spółka Kriogen", "Syndykat Kwantyt", "Unia Lagrange"];
const CANVAS_HOMES: [&str; 2] = ["Procyon A", "Alpha Centauri"];
/// How far one trade moves a ratio: buying (or selling) `depth` units from a faction multiplies its
/// demand/supply ratio by e^±0.1 (the price by about ±3%).
pub const TRADE_IMPACT: f64 = 0.1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct MarketState {
    /// demand/supply ratio per material.
    pub ratio: IndexMap<String, f64>,
    pub price: IndexMap<String, f64>,
    pub change: IndexMap<String, f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GalaxySimState {
    pub rng: i32,
    pub last_update: f64,
    pub players: Vec<SimulatedPlayer>,
    pub markets: IndexMap<String, MarketState>,
}

pub struct GalaxySim {
    rng: Rng,
    opts: GalaxyOptions,
    /// Material ids in catalog order and their base values V.
    materials: Vec<String>,
    values: IndexMap<String, f64>,
    state: GalaxySimState,
}

fn round2(n: f64) -> f64 {
    js::round(n * 100.0) / 100.0
}

impl GalaxySim {
    pub fn new(economy: &Economy, opts: GalaxyOptions, saved: Option<GalaxySimState>) -> GalaxySim {
        let materials: Vec<String> = economy.materials().iter().map(|m| m.id.clone()).collect();
        let values: IndexMap<String, f64> = economy.values.iter().map(|(k, v)| (k.clone(), v.v)).collect();
        let rng = Rng::new(saved.as_ref().map(|s| s.rng).unwrap_or(opts.seed));
        let mut sim = GalaxySim {
            rng,
            opts,
            materials,
            values,
            state: GalaxySimState { rng: 0, last_update: 0.0, players: Vec::new(), markets: IndexMap::new() },
        };
        sim.state = match saved {
            Some(s) => s,
            None => sim.initial(),
        };
        // a hub added since the state was saved opens with a market of its own
        for (id, _, _) in opts.hubs {
            if !sim.state.markets.contains_key(*id) {
                let m = sim.fresh_market();
                sim.state.markets.insert(id.to_string(), m);
            }
        }
        sim.state.rng = sim.rng.state;
        sim
    }

    fn fresh_market(&mut self) -> MarketState {
        let mut m = MarketState::default();
        for mat in self.materials.clone() {
            let r = self.rng.range(0.7, 1.4);
            m.price.insert(mat.clone(), self.price_of(&mat, r));
            m.ratio.insert(mat.clone(), r);
            m.change.insert(mat, 0.0);
        }
        m
    }

    fn initial(&mut self) -> GalaxySimState {
        let excluded = ["Tau Ceti", "Sirius A", "Sirius B", CANVAS_HOMES[0], CANVAS_HOMES[1]];
        let mut homes: Vec<String> = CANVAS_HOMES.iter().map(|s| s.to_string()).collect();
        homes.extend(
            STARS.iter().filter(|s| s.distance > 0.0 && s.distance < 20.0 && !excluded.contains(&s.name.as_str())).map(|s| s.name.clone()),
        );
        let mut players = Vec::with_capacity(self.opts.players);
        for i in 0..self.opts.players {
            let n = CALLSIGNS.len();
            let suffix = if i >= n { format!(" {}", i / n + 1) } else { String::new() };
            let colonies = 1.0 + self.rng.int(3) as f64;
            let score = js::round(self.rng.range(800.0, 4000.0));
            players.push(SimulatedPlayer {
                id: format!("npc-{}", i + 1),
                name: format!("Dowódca {}{}", CALLSIGNS[i % n], suffix),
                corporation: CORPORATIONS[i % CORPORATIONS.len()].to_string(),
                home_star: homes[i % homes.len()].clone(),
                colonies,
                score,
            });
        }
        let mut markets = IndexMap::new();
        for (id, _, _) in self.opts.hubs {
            let m = self.fresh_market();
            markets.insert(id.to_string(), m);
        }
        GalaxySimState { rng: self.rng.state, last_update: 0.0, players, markets }
    }

    /// Price P of a material at a hub [kr].
    pub fn price(&self, hub: &str, material: &str) -> Option<f64> {
        self.state.markets.get(hub)?.price.get(material).copied()
    }

    /// Base value V of a material [kr].
    pub fn value(&self, material: &str) -> Option<f64> {
        self.values.get(material).copied()
    }

    /// A trade with the hub's faction moves its demand/supply ratio: `units` bought from it (> 0)
    /// raise the price, sold to it (< 0) lower it; `depth` is the faction's depth per update.
    pub fn trade(&mut self, hub: &str, material: &str, units: f64, depth: f64) {
        if depth <= 0.0 || units == 0.0 {
            return;
        }
        let Some(r) = self.state.markets.get(hub).and_then(|m| m.ratio.get(material)).copied() else { return };
        let r = (r * libm::exp(TRADE_IMPACT * units / depth)).clamp(0.25, 4.0);
        let p = self.price_of(material, r);
        let m = self.state.markets.get_mut(hub).expect("hub exists");
        m.ratio.insert(material.to_string(), r);
        m.price.insert(material.to_string(), p);
    }

    /// Model minute of the last update.
    pub fn last_update(&self) -> f64 {
        self.state.last_update
    }

    /// Skips updates beyond `max` before `t` (a server that slept long does not replay months of
    /// random walk); then [`GalaxySim::advance`] runs at most `max`.
    pub fn fast_forward(&mut self, t: f64, max: u32) {
        let pending = ((t - self.state.last_update) / self.opts.update_every).floor();
        if pending > max as f64 {
            self.state.last_update += (pending - max as f64) * self.opts.update_every;
        }
    }

    fn price_of(&self, material: &str, ratio: f64) -> f64 {
        let v = self.values.get(material).copied().unwrap_or(1.0);
        v * libm::pow(ratio, 0.3).clamp(0.5, 3.0)
    }

    /// Advances to game time `t` [model minutes]; updates every `update_every` minutes.
    pub fn advance(&mut self, t: f64) -> bool {
        let mut changed = false;
        while t - self.state.last_update >= self.opts.update_every {
            self.state.last_update += self.opts.update_every;
            self.update();
            changed = true;
        }
        self.state.rng = self.rng.state;
        changed
    }

    fn update(&mut self) {
        for i in 0..self.state.players.len() {
            let colonies = self.state.players[i].colonies;
            let add = js::round(self.rng.range(5.0, 40.0) * colonies);
            self.state.players[i].score += add;
            if self.rng.next() < 0.01 {
                self.state.players[i].colonies += 1.0;
            }
        }
        let hub_ids: Vec<String> = self.state.markets.keys().cloned().collect();
        for hub in hub_ids {
            let ids: Vec<String> = self.state.markets[&hub].ratio.keys().cloned().collect();
            for id in ids {
                let step = libm::exp(self.rng.range(-0.06, 0.06));
                let market = &self.state.markets[&hub];
                let r = (market.ratio[&id] * step).clamp(0.25, 4.0);
                let p = self.price_of(&id, r);
                let market = self.state.markets.get_mut(&hub).expect("hub exists");
                let old = market.price[&id];
                market.ratio.insert(id.clone(), r);
                market.change.insert(id.clone(), ((p - old) / old) * 100.0);
                market.price.insert(id, p);
            }
        }
    }

    /// Players by score, best first (stable for equal scores, like `Array.prototype.sort`).
    pub fn players(&self) -> Vec<SimulatedPlayer> {
        let mut out = self.state.players.clone();
        out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        out
    }

    pub fn hubs(&self) -> Vec<MarketHub> {
        self.opts
            .hubs
            .iter()
            .map(|(id, name, star)| {
                let m = &self.state.markets[*id];
                let quotes = self
                    .materials
                    .iter()
                    .map(|mat| {
                        let p = m.price[mat];
                        MarketQuote {
                            material: mat.clone(),
                            value: round2(self.values.get(mat).copied().unwrap_or(0.0)),
                            bid: round2(0.8 * p),
                            ask: round2(1.25 * p),
                            change: round2(m.change[mat]),
                        }
                    })
                    .collect();
                MarketHub { id: id.to_string(), name: name.to_string(), star: star.to_string(), quotes }
            })
            .collect()
    }

    pub fn save(&self) -> GalaxySimState {
        let mut s = self.state.clone();
        s.rng = self.rng.state;
        s
    }
}
