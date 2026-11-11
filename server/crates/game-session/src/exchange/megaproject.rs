//! Megaprojects (05-SOCIAL §5–6, S3): works built in a hub from the members' goods, with a lasting
//! bonus once complete.
//! - **Terminal korporacyjny** (a corporation's, in its seat hub): the members' hub fee there is one
//!   percentage point lower.
//! - **Brama** (a corporation's or an alliance's, in any hub): the members' shipments to and from
//!   that hub take 30% less time. An alliance's gate costs twice as much and serves every
//!   corporation of the alliance.
//!
//! The research station (+5% recipe speed in the members' worlds) needs a bonus inside the worlds'
//! simulation and comes later. Requirements are scaled by `megaproject_scale` (dev: small, so a test
//! completes one); quantities round up to whole units.
//!
//! Rules: the chief or an officer starts a corporation's project, the chief of the leading
//! corporation an alliance's; one project of a kind per owner. Any member (of the corporation, or of
//! any corporation of the alliance) contributes goods from their own stock in the project's hub; a
//! contribution takes only what is still needed. Contributions stay recorded per account and
//! corporation (the value at the factions' prices P), for the view and the rankings.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use game_core::models::resource::{Qty, amount_of, format_cost, subtract_stock};

use super::corporation::Role;
use super::{ExResult, Exchange, is_hub, round2};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MegaKind {
    Terminal,
    Gate,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Corporation,
    Alliance,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Contribution {
    pub at: f64,
    pub account: String,
    pub corp_id: String,
    pub goods: Qty,
    /// At the factions' prices when given [kr].
    pub value: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Megaproject {
    pub id: String,
    pub kind: MegaKind,
    pub scope: Scope,
    /// The corporation's or the alliance's id.
    pub owner: String,
    pub hub_id: String,
    pub started_at: f64,
    pub required: Qty,
    pub progress: Qty,
    pub contributions: Vec<Contribution>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<f64>,
}

/// A corporation's share of a project.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShareView {
    pub corp_id: String,
    pub name: String,
    pub tag: String,
    pub value: f64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MegaView {
    pub id: String,
    pub kind: MegaKind,
    pub scope: Scope,
    pub owner_name: String,
    pub hub_id: String,
    pub started_at: f64,
    pub required: Qty,
    pub progress: Qty,
    /// 0–1 over all units.
    pub done: f64,
    pub completed_at: Option<f64>,
    /// By corporation, largest first.
    pub shares: Vec<ShareView>,
    /// What the viewer gave.
    pub mine: f64,
}

/// Fee points a completed terminal takes off its members' fee in its hub.
pub const TERMINAL_FEE_CUT: f64 = 0.01;
/// What remains of a shipment's time through a completed gate's hub.
pub const GATE_TIME: f64 = 0.7;

/// Requirements of a kind at scale 1 (an alliance's twice these).
fn base_requirements(kind: MegaKind) -> &'static [(&'static str, f64)] {
    match kind {
        MegaKind::Terminal => &[("STA", 400.0), ("BET", 300.0), ("PRZ", 80.0), ("UKL", 40.0)],
        MegaKind::Gate => &[("STA", 800.0), ("BEL", 200.0), ("SLN", 60.0), ("NAD", 20.0)],
    }
}

fn complete(p: &Megaproject) -> bool {
    p.required.iter().all(|(m, q)| amount_of(&p.progress, m) + 1e-9 >= *q)
}

impl Exchange {
    /// What a project of this kind and scope needs.
    pub fn megaproject_requirements(&self, kind: MegaKind, scope: Scope) -> Qty {
        let factor = self.cfg.social.megaproject_scale * if scope == Scope::Alliance { 2.0 } else { 1.0 };
        base_requirements(kind).iter().map(|(m, q)| (m.to_string(), (q * factor).ceil().max(1.0))).collect()
    }

    pub fn start_megaproject(&mut self, account: &str, kind: MegaKind, scope: Scope, hub_id: &str, now: f64) -> ExResult<MegaView> {
        if !is_hub(hub_id) {
            return Err(format!("nieznany hub {hub_id}"));
        }
        let (ci, role) = self.membership(account)?;
        let corp = &self.state.corporations[ci];
        let owner = match scope {
            Scope::Corporation => {
                if role == Role::Member {
                    return Err("megaprojekt korporacji zaczyna szef albo oficer".to_string());
                }
                if kind == MegaKind::Terminal && corp.hub_id != hub_id {
                    return Err("terminal stawia się w hubie siedziby korporacji".to_string());
                }
                corp.id.clone()
            }
            Scope::Alliance => {
                if kind != MegaKind::Gate {
                    return Err("sojusz buduje bramę; terminal jest projektem korporacji".to_string());
                }
                let a = self.alliance_of_corp(&corp.id).ok_or_else(|| "twoja korporacja nie jest w sojuszu".to_string())?;
                if role != Role::Chief || self.state.alliances[a].leader != corp.id {
                    return Err("projekt sojuszu zaczyna szef korporacji prowadzącej".to_string());
                }
                self.state.alliances[a].id.clone()
            }
        };
        if self.state.megaprojects.iter().any(|p| p.owner == owner && p.kind == kind) {
            return Err("ten megaprojekt już jest (jeden danego rodzaju)".to_string());
        }
        let id = self.new_id("mega");
        let required = self.megaproject_requirements(kind, scope);
        self.state.megaprojects.push(Megaproject {
            id: id.clone(),
            kind,
            scope,
            owner,
            hub_id: hub_id.to_string(),
            started_at: now,
            required,
            progress: Qty::new(),
            contributions: Vec::new(),
            completed_at: None,
        });
        Ok(self.mega_view(account, &id).expect("just started"))
    }

    /// May the account give to the project (a member of its corporation or alliance)?
    fn may_contribute(&self, account: &str, p: &Megaproject) -> bool {
        let Some(ci) = self.corp_index(account) else { return false };
        let corp_id = &self.state.corporations[ci].id;
        match p.scope {
            Scope::Corporation => &p.owner == corp_id,
            Scope::Alliance => self.alliance_of_corp(corp_id).is_some_and(|a| self.state.alliances[a].id == p.owner),
        }
    }

    /// Goods from the account's stock in the project's hub, as far as they are still needed.
    pub fn contribute(&mut self, account: &str, project_id: &str, goods: &Qty, now: f64) -> ExResult<MegaView> {
        let Some(pi) = self.state.megaprojects.iter().position(|p| p.id == project_id) else {
            return Err("nie ma takiego megaprojektu".to_string());
        };
        if !self.may_contribute(account, &self.state.megaprojects[pi]) {
            return Err("to nie jest projekt twojej korporacji ani sojuszu".to_string());
        }
        let p = &self.state.megaprojects[pi];
        if p.completed_at.is_some() {
            return Err("megaprojekt jest już ukończony".to_string());
        }
        if goods.is_empty() || !goods.values().all(|q| q.is_finite() && *q > 0.0) {
            return Err("wkład: dodatnie ilości towarów".to_string());
        }
        let have = self.wallet(account).stock.get(&p.hub_id).cloned().unwrap_or_default();
        let mut taken = Qty::new();
        for (m, q) in goods {
            let Some(need) = p.required.get(m) else { return Err(format!("{m} nie jest potrzebny w tym projekcie")) };
            let left = (need - amount_of(&p.progress, m)).max(0.0);
            let take = q.min(left);
            if take <= 1e-9 {
                continue;
            }
            if amount_of(&have, m) + 1e-9 < take {
                return Err(format!("w hubie brakuje {}", format_cost(&[(m.clone(), take - amount_of(&have, m))].into_iter().collect())));
            }
            taken.insert(m.clone(), take);
        }
        if taken.is_empty() {
            return Err("tych towarów projekt już nie potrzebuje".to_string());
        }
        let hub = p.hub_id.clone();
        let s = self.stock_mut(account, &hub);
        *s = subtract_stock(s, &taken);
        let value: f64 = taken.iter().map(|(m, q)| q * self.values.get(m).copied().unwrap_or(0.0)).sum();
        let corp_id = self.corp_index(account).map(|i| self.state.corporations[i].id.clone()).unwrap_or_default();
        let p = &mut self.state.megaprojects[pi];
        for (m, q) in &taken {
            *p.progress.entry(m.clone()).or_insert(0.0) += q;
        }
        p.contributions.push(Contribution { at: now, account: account.to_string(), corp_id, goods: taken, value: round2(value) });
        if complete(p) {
            p.completed_at = Some(now);
        }
        Ok(self.mega_view(account, project_id).expect("a project"))
    }

    /// Completed projects serving the account: its corporation's and its alliance's.
    fn completed_for(&self, account: &str) -> Vec<&Megaproject> {
        let Some(ci) = self.corp_index(account) else { return Vec::new() };
        let corp_id = &self.state.corporations[ci].id;
        let alliance = self.alliance_of_corp(corp_id).map(|a| self.state.alliances[a].id.clone());
        self.state
            .megaprojects
            .iter()
            .filter(|p| p.completed_at.is_some())
            .filter(|p| match p.scope {
                Scope::Corporation => &p.owner == corp_id,
                Scope::Alliance => alliance.as_ref() == Some(&p.owner),
            })
            .collect()
    }

    /// The account's hub fee in a hub (a terminal there lowers it).
    pub fn fee_for(&self, account: &str, hub_id: &str) -> f64 {
        let cut = self.completed_for(account).iter().any(|p| p.kind == MegaKind::Terminal && p.hub_id == hub_id);
        if cut { (self.cfg.fee - TERMINAL_FEE_CUT).max(0.0) } else { self.cfg.fee }
    }

    /// Seconds the account's shipments take between its colony and a hub (a gate there shortens them).
    pub fn travel_for(&self, account: &str, hub_id: &str) -> f64 {
        let base = self.travel_seconds(&self.star_of(account), hub_id);
        let gate = self.completed_for(account).iter().any(|p| p.kind == MegaKind::Gate && p.hub_id == hub_id);
        if gate { base * GATE_TIME } else { base }
    }

    /// A dissolved corporation's projects go (its share in an alliance's project stays recorded).
    pub(super) fn corporation_projects_dissolved(&mut self, corp_id: &str) {
        self.state.megaprojects.retain(|p| !(p.scope == Scope::Corporation && p.owner == corp_id));
    }

    pub(super) fn alliances_dissolved(&mut self, alliance_ids: &[String]) {
        self.state.megaprojects.retain(|p| !(p.scope == Scope::Alliance && alliance_ids.contains(&p.owner)));
    }

    fn mega_view(&self, account: &str, project_id: &str) -> Option<MegaView> {
        let p = self.state.megaprojects.iter().find(|p| p.id == project_id)?;
        let owner_name = match p.scope {
            Scope::Corporation => self.state.corporations.iter().find(|c| c.id == p.owner).map(|c| c.name.clone()),
            Scope::Alliance => self.state.alliances.iter().find(|a| a.id == p.owner).map(|a| a.name.clone()),
        }
        .unwrap_or_default();
        let mut by_corp: IndexMap<String, f64> = IndexMap::new();
        for c in &p.contributions {
            *by_corp.entry(c.corp_id.clone()).or_insert(0.0) += c.value;
        }
        let mut shares: Vec<ShareView> = by_corp
            .into_iter()
            .map(|(corp_id, value)| {
                let c = self.state.corporations.iter().find(|c| c.id == corp_id);
                ShareView {
                    name: c.map(|c| c.name.clone()).unwrap_or_else(|| "(rozwiązana)".to_string()),
                    tag: c.map(|c| c.tag.clone()).unwrap_or_default(),
                    corp_id,
                    value: round2(value),
                }
            })
            .collect();
        shares.sort_by(|a, b| b.value.total_cmp(&a.value));
        let need: f64 = p.required.values().sum();
        let have: f64 = p.required.iter().map(|(m, q)| amount_of(&p.progress, m).min(*q)).sum();
        Some(MegaView {
            id: p.id.clone(),
            kind: p.kind,
            scope: p.scope,
            owner_name,
            hub_id: p.hub_id.clone(),
            started_at: p.started_at,
            required: p.required.clone(),
            progress: p.progress.clone(),
            done: if need > 0.0 { (have / need).min(1.0) } else { 1.0 },
            completed_at: p.completed_at,
            shares,
            mine: round2(p.contributions.iter().filter(|c| c.account == account).map(|c| c.value).sum()),
        })
    }

    /// The projects of the account's corporation and alliance.
    pub fn megaprojects_of(&self, account: &str) -> Vec<MegaView> {
        let ids: Vec<String> = self.state.megaprojects.iter().filter(|p| self.may_contribute(account, p)).map(|p| p.id.clone()).collect();
        ids.iter().filter_map(|id| self.mega_view(account, id)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests_support::{market_with, put_in_hub};
    use super::*;

    const T0: f64 = 1_000_000.0;

    fn goods(items: &[(&str, f64)]) -> Qty {
        items.iter().map(|(m, q)| (m.to_string(), *q)).collect()
    }

    /// A corporation of one chief, founded in `hub` (founding goods given first).
    fn corp(m: &mut Exchange, account: &str, callsign: &str, name: &str, tag: &str, hub: &str) -> String {
        m.profile(account, Some(callsign), None);
        put_in_hub(m, account, hub, goods(&[("STA", 100.0)]));
        m.found_corporation(account, name, tag, hub, T0).unwrap().id
    }

    /// 05-SOCIAL S3 gate (first half): a megaproject completed by the contributions of two
    /// corporations: an alliance of two builds a gate, and its bonus serves both.
    #[test]
    fn an_alliance_of_two_corporations_builds_a_gate() {
        let mut m = market_with(|cfg| {
            cfg.start_credits = 20_000.0;
            cfg.social.megaproject_scale = 0.05;
            cfg.social.alliance_leave_seconds = 60.0;
        });
        let hub = "hub-sol";
        corp(&mut m, "acc-1", "Kestrel", "Konsorcjum Kestrel", "KST", hub);
        corp(&mut m, "acc-2", "Wega", "Gildia Wega", "WGA", "hub-sirius");
        m.profile("acc-3", Some("Lyra"), None);

        // the alliance: founded by a chief, the other corporation invited by tag and accepted by its chief
        assert!(m.found_alliance("acc-3", "Pakt", T0).is_err(), "no corporation, no alliance");
        let a = m.found_alliance("acc-1", "Pakt Orionu", T0).unwrap();
        assert!(a.leads && a.chief);
        assert!(m.invite_corporation("acc-1", "XXX", T0).unwrap_err().contains("nie ma"));
        m.invite_corporation("acc-1", "wga", T0).unwrap();
        assert_eq!(m.alliance_invitations_of("acc-2").len(), 1);
        let a = m.accept_alliance("acc-2", &a.id, T0 + 1.0).unwrap();
        assert_eq!(a.members.len(), 2);
        assert!(!a.leads, "Wega's corporation follows");
        assert_eq!(m.alliance_summaries()[0].corporations, 2);

        // the gate: started by the leader's chief, twice the cost of a corporation's
        assert!(m.start_megaproject("acc-2", MegaKind::Gate, Scope::Alliance, hub, T0).unwrap_err().contains("prowadzącej"));
        assert!(m.start_megaproject("acc-1", MegaKind::Terminal, Scope::Alliance, hub, T0).is_err());
        let p = m.start_megaproject("acc-1", MegaKind::Gate, Scope::Alliance, hub, T0).unwrap();
        assert_eq!(p.required, goods(&[("STA", 80.0), ("BEL", 20.0), ("SLN", 6.0), ("NAD", 2.0)]));
        assert!(m.start_megaproject("acc-1", MegaKind::Gate, Scope::Alliance, "hub-procyon", T0).is_err(), "one gate per owner");

        // both corporations bring goods to the hub and give; what is not needed is not taken
        put_in_hub(&mut m, "acc-1", hub, goods(&[("STA", 100.0), ("BEL", 20.0)]));
        put_in_hub(&mut m, "acc-2", hub, goods(&[("SLN", 6.0), ("NAD", 5.0)]));
        assert!(m.contribute("acc-3", &p.id, &goods(&[("STA", 1.0)]), T0).is_err(), "not a member");
        assert!(m.contribute("acc-1", &p.id, &goods(&[("FER", 1.0)]), T0).unwrap_err().contains("nie jest potrzebny"));
        assert!(m.contribute("acc-1", &p.id, &goods(&[("SLN", 1.0)]), T0).unwrap_err().contains("brakuje"));
        let v = m.contribute("acc-1", &p.id, &goods(&[("STA", 100.0), ("BEL", 20.0)]), T0 + 2.0).unwrap();
        assert_eq!(v.progress["STA"], 80.0, "only what is needed");
        assert_eq!(m.wallet("acc-1").stock[hub]["STA"], 20.0, "20 of the 100 offered stay");
        assert!(v.completed_at.is_none());
        let before = m.travel_for("acc-2", hub);
        let v = m.contribute("acc-2", &p.id, &goods(&[("SLN", 6.0), ("NAD", 5.0)]), T0 + 3.0).unwrap();
        assert_eq!(v.completed_at, Some(T0 + 3.0));
        assert_eq!(v.done, 1.0);
        assert_eq!(m.wallet("acc-2").stock[hub]["NAD"], 3.0);
        let names: Vec<&str> = v.shares.iter().map(|s| s.tag.as_str()).collect();
        assert_eq!(names.len(), 2, "two corporations gave: {names:?}");
        assert!(v.shares.iter().all(|s| s.value > 0.0));
        assert!(m.contribute("acc-1", &p.id, &goods(&[("STA", 1.0)]), T0).unwrap_err().contains("ukończony"));

        // the bonus: shipments of both corporations to that hub take 30% less, elsewhere not
        assert!((m.travel_for("acc-2", hub) - before * GATE_TIME).abs() < 1e-9);
        assert!((m.travel_for("acc-1", hub) - m.travel_seconds("Tau Ceti", hub) * GATE_TIME).abs() < 1e-9);
        assert_eq!(m.travel_for("acc-1", "hub-sirius"), m.travel_seconds("Tau Ceti", "hub-sirius"));
        assert_eq!(m.travel_for("acc-3", hub), m.travel_seconds("Tau Ceti", hub), "not a member");
        assert_eq!(m.megaprojects_of("acc-2").len(), 1);

        // leaving takes the notice period; then the gate no longer serves that corporation
        m.leave_alliance("acc-2", T0 + 10.0).unwrap();
        assert!(m.alliance_view("acc-2").unwrap().members.iter().any(|x| x.leaving_at == Some(T0 + 10.0 + 60_000.0)));
        m.advance(T0 + 10.0 + 59_000.0);
        assert!(m.travel_for("acc-2", hub) < before, "still a member");
        m.advance(T0 + 10.0 + 61_000.0);
        assert!(m.alliance_view("acc-2").is_none());
        assert_eq!(m.travel_for("acc-2", hub), before);
        assert!(m.travel_for("acc-1", hub) < m.travel_seconds("Tau Ceti", hub), "the alliance keeps its gate");
        // the last corporation out dissolves the alliance, and its project goes
        m.leave_alliance("acc-1", T0 + 70_000.0).unwrap();
        assert!(m.alliance_summaries().is_empty());
        assert!(m.megaprojects_of("acc-1").is_empty());
    }

    /// A corporation's terminal in its seat lowers its members' fee there by a point.
    #[test]
    fn a_terminal_cuts_the_fee_in_its_hub() {
        let mut m = market_with(|cfg| {
            cfg.start_credits = 20_000.0;
            cfg.social.megaproject_scale = 0.05;
        });
        let hub = "hub-sol";
        corp(&mut m, "acc-1", "Kestrel", "Konsorcjum Kestrel", "KST", hub);
        assert!(m.start_megaproject("acc-1", MegaKind::Terminal, Scope::Corporation, "hub-sirius", T0).unwrap_err().contains("siedziby"));
        let p = m.start_megaproject("acc-1", MegaKind::Terminal, Scope::Corporation, hub, T0).unwrap();
        put_in_hub(&mut m, "acc-1", hub, p.required.clone());
        assert_eq!(m.fee_for("acc-1", hub), 0.02);
        m.contribute("acc-1", &p.id, &p.required, T0 + 1.0).unwrap();
        assert!((m.fee_for("acc-1", hub) - 0.01).abs() < 1e-12);
        assert_eq!(m.fee_for("acc-1", "hub-sirius"), 0.02);
        // an order placed now pays the lower fee; the view shows it
        assert!((m.view("acc-1").hubs.iter().find(|h| h.market.id == hub).unwrap().fee - 0.01).abs() < 1e-12);
        let o = m.place("acc-1", hub, "FER", super::super::Side::Buy, 1.0, 0.01, T0 + 2.0).unwrap().order;
        assert_eq!(o.fee, Some(0.01));
        // the corporation dissolved: the terminal goes with it
        m.leave_corporation("acc-1", T0 + 3.0).unwrap();
        assert_eq!(m.fee_for("acc-1", hub), 0.02);
    }
}
