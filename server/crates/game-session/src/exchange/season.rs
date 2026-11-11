//! Rankings and seasons (05-SOCIAL §7, S3).
//!
//! Rankings of the season, computed on request: players by net worth in the galaxy (credits, what
//! their buy orders hold, goods in hubs, on sale and on the way, all at the economy's values V),
//! by trade volume and by reputation with the factions; corporations by their treasury and what
//! their members gave to megaprojects. The worlds' buildings and storage are not in the galaxy:
//! they join the net worth when worlds report them.
//!
//! A season lasts `season_seconds` (90 days; 0: until closed by hand, `closeSeason` in dev mode).
//! Closing it keeps the top places in the history and resets the market: wallets (back to the start
//! credits), goods, orders, trades, shipments, contracts, reputation, volume and megaprojects;
//! corporations and alliances stay, their treasuries empty. The server then starts every world anew
//! (05-SOCIAL §7: worlds and market reset; the history of rankings stays).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::{Direction, Exchange, Side, round2};

/// Places of each list in a ranking and in the history.
pub const RANK_SHOWN: usize = 10;
/// Seasons kept in the history.
const SEASONS_KEPT: usize = 20;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RankEntry {
    pub id: String,
    pub name: String,
    /// The player's corporation tag, or the corporation's own.
    pub tag: String,
    pub value: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeasonRecord {
    pub number: u32,
    pub started_at: f64,
    pub ended_at: f64,
    pub net_worth: Vec<RankEntry>,
    pub volume: Vec<RankEntry>,
    pub corporations: Vec<RankEntry>,
    pub megaprojects_completed: usize,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeasonView {
    pub number: u32,
    pub started_at: f64,
    /// Unix ms; none when the season ends only by hand.
    pub ends_at: Option<f64>,
}

/// The viewer's standing (place 0: not ranked).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Standing {
    pub net_worth: f64,
    pub net_worth_place: usize,
    pub volume: f64,
    pub reputation: f64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rankings {
    pub season: SeasonView,
    pub net_worth: Vec<RankEntry>,
    pub volume: Vec<RankEntry>,
    pub reputation: Vec<RankEntry>,
    pub corporations: Vec<RankEntry>,
    pub mine: Standing,
    /// Closed seasons, newest first.
    pub history: Vec<SeasonRecord>,
}

fn top(mut entries: Vec<RankEntry>) -> Vec<RankEntry> {
    entries.retain(|e| e.value > 0.0);
    entries.sort_by(|a, b| b.value.total_cmp(&a.value).then_with(|| a.name.cmp(&b.name)));
    entries.truncate(RANK_SHOWN);
    entries
}

impl Exchange {
    /// The season running (season 1 in markets saved before seasons).
    pub fn season(&self) -> SeasonView {
        let number = self.state.season.max(1);
        let s = self.cfg.social.season_seconds;
        SeasonView {
            number,
            started_at: self.state.season_started_at,
            ends_at: (s > 0.0).then_some(self.state.season_started_at + s * 1000.0),
        }
    }

    /// Credits traded by an account this season (both sides of every trade).
    pub(super) fn count_volume(&mut self, account: Option<&String>, value: f64) {
        if let Some(a) = account {
            *self.state.volume.entry(a.clone()).or_insert(0.0) += value;
        }
    }

    /// Net worth in the galaxy at the economy's values.
    pub fn net_worth(&self, account: &str) -> f64 {
        let v = |m: &str| self.values.get(m).copied().unwrap_or(0.0);
        let w = self.wallet(account);
        let mut total = w.credits;
        for stock in w.stock.values() {
            total += stock.iter().map(|(m, q)| q * v(m)).sum::<f64>();
        }
        for o in self.state.orders.iter().filter(|o| o.account == account) {
            total += match o.side {
                Side::Buy => o.held.max(0.0),
                Side::Sell => o.remaining * v(&o.material),
            };
        }
        for s in self.state.shipments.iter().filter(|s| s.account == account && s.direction == Direction::ToHub) {
            total += s.cargo.iter().map(|(m, q)| q * v(m)).sum::<f64>();
        }
        round2(total)
    }

    fn tag_of(&self, account: &str) -> String {
        self.corp_index(account).map(|i| self.state.corporations[i].tag.clone()).unwrap_or_default()
    }

    /// Accounts of real players (factions' commanders are not ranked).
    fn ranked_accounts(&self) -> Vec<String> {
        self.state.profiles.keys().cloned().collect()
    }

    fn player_entry(&self, account: &str, value: f64) -> RankEntry {
        RankEntry { id: account.to_string(), name: self.callsign_of(account), tag: self.tag_of(account), value: round2(value) }
    }

    fn corporation_entries(&self) -> Vec<RankEntry> {
        let v = |m: &str| self.values.get(m).copied().unwrap_or(0.0);
        self.state
            .corporations
            .iter()
            .map(|c| {
                let treasury = c.credits + c.stock.iter().map(|(m, q)| q * v(m)).sum::<f64>();
                let given: f64 = self
                    .state
                    .megaprojects
                    .iter()
                    .flat_map(|p| p.contributions.iter())
                    .filter(|x| x.corp_id == c.id)
                    .map(|x| x.value)
                    .sum();
                RankEntry { id: c.id.clone(), name: c.name.clone(), tag: c.tag.clone(), value: round2(treasury + given) }
            })
            .collect()
    }

    fn reputation_total(&self, account: &str) -> f64 {
        self.state.reputation.get(account).map(|r| r.values().sum()).unwrap_or(0.0)
    }

    pub fn rankings(&self, account: &str) -> Rankings {
        let accounts = self.ranked_accounts();
        let worth: Vec<RankEntry> = accounts.iter().map(|a| self.player_entry(a, self.net_worth(a))).collect();
        let mut order: Vec<&RankEntry> = worth.iter().filter(|e| e.value > 0.0).collect();
        order.sort_by(|a, b| b.value.total_cmp(&a.value).then_with(|| a.name.cmp(&b.name)));
        let place = order.iter().position(|e| e.id == account).map(|i| i + 1).unwrap_or(0);
        let volume = accounts.iter().map(|a| self.player_entry(a, self.state.volume.get(a).copied().unwrap_or(0.0))).collect();
        let reputation = accounts.iter().map(|a| self.player_entry(a, self.reputation_total(a))).collect();
        Rankings {
            season: self.season(),
            net_worth: top(worth.clone()),
            volume: top(volume),
            reputation: top(reputation),
            corporations: top(self.corporation_entries()),
            mine: Standing {
                net_worth: self.net_worth(account),
                net_worth_place: place,
                volume: round2(self.state.volume.get(account).copied().unwrap_or(0.0)),
                reputation: round2(self.reputation_total(account)),
            },
            history: self.state.seasons.iter().rev().cloned().collect(),
        }
    }

    /// Is the season over at `now` (an automatic end)?
    pub(super) fn season_due(&self, now: f64) -> bool {
        let s = self.cfg.social.season_seconds;
        s > 0.0 && now >= self.state.season_started_at + s * 1000.0
    }

    /// Ends the season at `now`: its record goes into the history, the market starts anew. Returns
    /// the record (the number of the next season is `record.number + 1`).
    pub fn close_season(&mut self, now: f64) -> SeasonRecord {
        let accounts = self.ranked_accounts();
        let record = SeasonRecord {
            number: self.state.season.max(1),
            started_at: self.state.season_started_at,
            ended_at: now,
            net_worth: top(accounts.iter().map(|a| self.player_entry(a, self.net_worth(a))).collect()),
            volume: top(accounts.iter().map(|a| self.player_entry(a, self.state.volume.get(a).copied().unwrap_or(0.0))).collect()),
            corporations: top(self.corporation_entries()),
            megaprojects_completed: self.state.megaprojects.iter().filter(|p| p.completed_at.is_some()).count(),
        };
        self.state.seasons.push(record.clone());
        if self.state.seasons.len() > SEASONS_KEPT {
            let extra = self.state.seasons.len() - SEASONS_KEPT;
            self.state.seasons.drain(..extra);
        }
        // the market anew: wallets refill with the start credits on first use
        let s = &mut self.state;
        s.wallets.clear();
        s.orders.clear();
        s.trades.clear();
        s.shipments.clear();
        s.contracts.clear();
        s.reputation = IndexMap::new();
        s.reputation_time = now;
        s.volume.clear();
        s.megaprojects.clear();
        for c in s.corporations.iter_mut() {
            c.credits = 0.0;
            c.stock.clear();
            c.ledger.clear();
        }
        s.season = s.season.max(1) + 1;
        s.season_started_at = now;
        for a in self.state.profiles.keys().cloned().collect::<Vec<_>>() {
            self.wallet_mut(&a);
        }
        self.refill();
        self.issue_contracts();
        record
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests_support::{market_with, put_in_hub};
    use super::*;
    use game_core::models::resource::Qty;

    const T0: f64 = 1_000_000.0;

    /// 05-SOCIAL S3 gate (second half): a season closed and the next one opened. The rankings of
    /// the closed season go into the history; the market starts anew; corporations stay.
    #[test]
    fn rankings_and_a_season_closed_and_opened() {
        let mut m = market_with(|cfg| {
            cfg.start_credits = 10_000.0;
            cfg.social.season_seconds = 3600.0;
        });
        assert_eq!(m.season().number, 1);
        assert_eq!(m.season().ends_at, Some(T0 + 3_600_000.0));
        let hub = "hub-sol";
        for (a, c) in [("acc-1", "Kestrel"), ("acc-2", "Wega")] {
            m.profile(a, Some(c), None);
        }
        put_in_hub(&mut m, "acc-1", hub, [("STA".to_string(), 100.0), ("FER".to_string(), 50.0)].into_iter().collect());
        m.found_corporation("acc-1", "Konsorcjum Kestrel", "KST", hub, T0).unwrap();
        // Kestrel sells to the faction, Wega buys from it
        let bid = m
            .view("acc-1")
            .hubs
            .iter()
            .find(|h| h.market.id == hub)
            .unwrap()
            .market
            .quotes
            .iter()
            .find(|q| q.material == "FER")
            .unwrap()
            .bid;
        m.place("acc-1", hub, "FER", Side::Sell, 50.0, bid, T0 + 1.0).unwrap();
        let ask = m
            .view("acc-2")
            .hubs
            .iter()
            .find(|h| h.market.id == hub)
            .unwrap()
            .market
            .quotes
            .iter()
            .find(|q| q.material == "STA")
            .unwrap()
            .ask;
        m.place("acc-2", hub, "STA", Side::Buy, 10.0, ask, T0 + 2.0).unwrap();
        m.deposit("acc-1", 500.0, &Qty::new(), "", T0 + 3.0).unwrap();

        let r = m.rankings("acc-2");
        assert_eq!(r.season.number, 1);
        assert_eq!(r.net_worth.len(), 2);
        assert_eq!(r.net_worth[0].name, "Wega", "Kestrel paid 5000 kr for the corporation and 500 into it");
        assert_eq!(r.mine.net_worth_place, 1);
        assert!(r.volume.iter().any(|e| e.name == "Kestrel" && e.tag == "KST" && e.value > 0.0));
        assert!(r.reputation.iter().all(|e| e.value > 0.0));
        assert_eq!(r.corporations[0].tag, "KST");
        assert!((r.corporations[0].value - 500.0).abs() < 1e-9);
        assert!(r.history.is_empty());

        // closed by hand: the record, then a new market
        let record = m.close_season(T0 + 10.0);
        assert_eq!((record.number, record.started_at, record.ended_at), (1, T0, T0 + 10.0));
        assert_eq!(record.net_worth[0].name, "Wega");
        assert_eq!(m.season().number, 2);
        assert_eq!(m.season().started_at, T0 + 10.0);
        for a in ["acc-1", "acc-2"] {
            assert_eq!(m.wallet(a).credits, 10_000.0, "start credits again");
            assert!(m.wallet(a).stock.values().all(|s| s.is_empty()));
            assert_eq!(m.net_worth(a), 10_000.0);
        }
        assert_eq!(m.corp_view("acc-1").unwrap().credits, 0.0, "the corporation stays, its treasury empty");
        let r = m.rankings("acc-1");
        assert!(r.volume.is_empty() && r.reputation.is_empty());
        assert_eq!(r.history.len(), 1);
        assert_eq!(r.history[0].number, 1);
        assert!(m.save().orders.is_empty() && m.save().trades.is_empty());
        assert!(!m.save().contracts.is_empty(), "the factions issue new contracts");

        // the season runs out by itself
        let ch = m.advance(T0 + 10.0 + 3_599_000.0);
        assert_eq!(ch.season, None);
        let ch = m.advance(T0 + 10.0 + 3_600_000.0);
        assert_eq!(ch.season, Some(3));
        assert_eq!(m.rankings("acc-1").history.iter().map(|s| s.number).collect::<Vec<_>>(), vec![2, 1]);
    }
}
