//! Corporations (05-SOCIAL §5, S2): small groups of players (2–20) with a seat in one hub, roles
//! (one chief, up to 3 officers, members), a treasury of credits and goods in the seat hub, a ledger
//! of every deposit and withdrawal, and a notice board. A child module of `exchange`: the treasury
//! moves the same wallets and hub stocks as the market.
//!
//! Rules:
//! - founding costs `founding_credits` and `founding_goods` from the founder's stock in the seat hub
//!   (a sink, EKO-5); names and tags are unique; an account is in one corporation at a time;
//! - the chief and officers invite by callsign; the invited player accepts (or declines);
//! - anyone deposits (credits, or goods from their stock in the seat hub); the chief and officers
//!   withdraw (to their wallet and their stock in the seat hub); both go into the ledger;
//! - the chief appoints officers and members, and can hand the chief's role over; officers expel
//!   members, the chief anyone; a chief leaves only alone: the corporation is then dissolved and its
//!   treasury goes to them.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use game_core::models::resource::{Qty, add_stock, can_afford, format_cost, missing_for, subtract_stock};

use super::{ExResult, Exchange, is_hub, round2};

/// Ledger entries kept per corporation (the newest).
const LEDGER_KEPT: usize = 200;
/// Notices kept per corporation (the newest).
const BOARD_KEPT: usize = 50;
/// Ledger entries and notices in a member's view.
const SHOWN: usize = 30;
const NOTICE_MAX: usize = 280;
const NOTE_MAX: usize = 80;

#[derive(Clone, Debug, PartialEq)]
pub struct CorpConfig {
    pub founding_credits: f64,
    /// Goods the founder pays from their stock in the seat hub.
    pub founding_goods: Qty,
    pub max_members: usize,
    pub max_officers: usize,
}

impl Default for CorpConfig {
    /// 05-SOCIAL §5: 2–20 members; founding 5000 kr + 100 STA in the hub.
    fn default() -> CorpConfig {
        CorpConfig {
            founding_credits: 5000.0,
            founding_goods: [("STA".to_string(), 100.0)].into_iter().collect(),
            max_members: 20,
            max_officers: 3,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Chief,
    Officer,
    Member,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub account: String,
    pub role: Role,
    pub joined_at: f64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LedgerKind {
    Deposit,
    Withdrawal,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub at: f64,
    pub account: String,
    pub kind: LedgerKind,
    pub credits: f64,
    pub goods: Qty,
    pub note: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub at: f64,
    pub account: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Corporation {
    pub id: String,
    pub name: String,
    pub tag: String,
    /// Seat: the hub of the treasury's goods.
    pub hub_id: String,
    pub founded_at: f64,
    pub members: Vec<Member>,
    pub credits: f64,
    pub stock: Qty,
    pub ledger: Vec<LedgerEntry>,
    pub board: Vec<Notice>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Invitation {
    pub corp_id: String,
    pub account: String,
    pub by: String,
    pub at: f64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemberView {
    pub account: String,
    pub callsign: String,
    pub role: Role,
    pub joined_at: f64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LedgerView {
    pub at: f64,
    pub callsign: String,
    pub kind: LedgerKind,
    pub credits: f64,
    pub goods: Qty,
    pub note: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoticeView {
    pub at: f64,
    pub callsign: String,
    pub text: String,
}

/// The viewer's corporation.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CorpView {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub hub_id: String,
    pub founded_at: f64,
    /// The viewer's role.
    pub role: Role,
    pub members: Vec<MemberView>,
    pub credits: f64,
    pub stock: Qty,
    /// Newest first.
    pub ledger: Vec<LedgerView>,
    pub board: Vec<NoticeView>,
    /// Players invited and not answered yet.
    pub invited: Vec<String>,
}

/// Any corporation, as everyone sees it.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CorpSummary {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub hub_id: String,
    pub members: usize,
}

/// An invitation to the viewer.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InvitationView {
    pub corp_id: String,
    pub name: String,
    pub tag: String,
    pub by: String,
    pub at: f64,
}

/// Printable text of a notice or note: no control characters, at most `max` characters.
fn clean(text: &str, max: usize) -> String {
    text.trim().chars().filter(|c| !c.is_control()).take(max).collect()
}

fn valid_name(n: &str) -> bool {
    let len = n.chars().count();
    (3..=32).contains(&len) && n.chars().all(|c| c.is_alphanumeric() || " -_.".contains(c))
}

fn valid_tag(t: &str) -> bool {
    (3..=4).contains(&t.len()) && t.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

fn positive_goods(goods: &Qty) -> bool {
    goods.values().all(|q| q.is_finite() && *q > 0.0)
}

impl Exchange {
    pub(super) fn callsign_of(&self, account: &str) -> String {
        self.state.profiles.get(account).map(|p| p.callsign.clone()).unwrap_or_else(|| account.to_string())
    }

    pub(super) fn account_by_callsign(&self, callsign: &str) -> Option<String> {
        let want = callsign.trim().to_lowercase();
        self.state.profiles.iter().find(|(_, p)| p.callsign.to_lowercase() == want).map(|(id, _)| id.clone())
    }

    pub(super) fn corp_index(&self, account: &str) -> Option<usize> {
        self.state.corporations.iter().position(|c| c.members.iter().any(|m| m.account == account))
    }

    /// The account's corporation and role, or an error.
    pub(super) fn membership(&self, account: &str) -> ExResult<(usize, Role)> {
        let i = self.corp_index(account).ok_or_else(|| "nie należysz do korporacji".to_string())?;
        let role = self.state.corporations[i].members.iter().find(|m| m.account == account).map(|m| m.role).expect("a member");
        Ok((i, role))
    }

    /// Name of the account's corporation (empty without one).
    pub fn corporation_name(&self, account: &str) -> String {
        self.corp_index(account).map(|i| self.state.corporations[i].name.clone()).unwrap_or_default()
    }

    pub fn found_corporation(&mut self, account: &str, name: &str, tag: &str, hub_id: &str, now: f64) -> ExResult<CorpView> {
        let name = name.trim().to_string();
        let tag = tag.trim().to_uppercase();
        if !valid_name(&name) {
            return Err("nazwa korporacji: 3–32 znaki (litery, cyfry, spacja, - _ .)".to_string());
        }
        if !valid_tag(&tag) {
            return Err("znacznik: 3–4 wielkie litery lub cyfry".to_string());
        }
        if !is_hub(hub_id) {
            return Err(format!("nieznany hub {hub_id}"));
        }
        if self.corp_index(account).is_some() {
            return Err("już należysz do korporacji".to_string());
        }
        if self.state.corporations.iter().any(|c| c.name.to_lowercase() == name.to_lowercase()) {
            return Err(format!("korporacja „{name}” już istnieje"));
        }
        if self.state.corporations.iter().any(|c| c.tag == tag) {
            return Err(format!("znacznik {tag} jest zajęty"));
        }
        let cost = self.cfg.corp.founding_credits;
        let goods = self.cfg.corp.founding_goods.clone();
        let wallet = self.wallet(account);
        if wallet.credits + 1e-9 < cost {
            return Err(format!("założenie kosztuje {} kr, masz {} kr", round2(cost), round2(wallet.credits)));
        }
        let have = wallet.stock.get(hub_id).cloned().unwrap_or_default();
        if !can_afford(&have, &goods) {
            return Err(format!("założenie wymaga w tym hubie także {}", format_cost(&missing_for(&have, &goods))));
        }
        self.wallet_mut(account).credits -= cost;
        let s = self.stock_mut(account, hub_id);
        *s = subtract_stock(s, &goods);
        let id = self.new_id("corp");
        self.state.invitations.retain(|v| v.account != account);
        self.state.corporations.push(Corporation {
            id,
            name,
            tag,
            hub_id: hub_id.to_string(),
            founded_at: now,
            members: vec![Member { account: account.to_string(), role: Role::Chief, joined_at: now }],
            credits: 0.0,
            stock: Qty::new(),
            ledger: Vec::new(),
            board: Vec::new(),
        });
        Ok(self.corp_view(account).expect("just founded"))
    }

    pub fn invite(&mut self, account: &str, callsign: &str, now: f64) -> ExResult<CorpView> {
        let (i, role) = self.membership(account)?;
        if role == Role::Member {
            return Err("zapraszają szef i oficerowie".to_string());
        }
        let Some(target) = self.account_by_callsign(callsign) else { return Err(format!("nieznany dowódca {}", callsign.trim())) };
        if self.corp_index(&target).is_some() {
            return Err(format!("{} należy już do korporacji", self.callsign_of(&target)));
        }
        let corp_id = self.state.corporations[i].id.clone();
        if self.state.corporations[i].members.len() >= self.cfg.corp.max_members {
            return Err(format!("korporacja ma już {} członków", self.cfg.corp.max_members));
        }
        if !self.state.invitations.iter().any(|v| v.corp_id == corp_id && v.account == target) {
            self.state.invitations.push(Invitation { corp_id, account: target, by: account.to_string(), at: now });
        }
        Ok(self.corp_view(account).expect("a member"))
    }

    pub fn accept_invitation(&mut self, account: &str, corp_id: &str, now: f64) -> ExResult<CorpView> {
        if !self.state.invitations.iter().any(|v| v.corp_id == corp_id && v.account == account) {
            return Err("nie masz takiego zaproszenia".to_string());
        }
        if self.corp_index(account).is_some() {
            return Err("już należysz do korporacji".to_string());
        }
        let max = self.cfg.corp.max_members;
        let Some(c) = self.state.corporations.iter_mut().find(|c| c.id == corp_id) else {
            self.state.invitations.retain(|v| v.corp_id != corp_id);
            return Err("tej korporacji już nie ma".to_string());
        };
        if c.members.len() >= max {
            return Err(format!("korporacja ma już {max} członków"));
        }
        c.members.push(Member { account: account.to_string(), role: Role::Member, joined_at: now });
        // one corporation at a time: the other invitations go
        self.state.invitations.retain(|v| v.account != account);
        Ok(self.corp_view(account).expect("just joined"))
    }

    pub fn decline_invitation(&mut self, account: &str, corp_id: &str) -> ExResult<Vec<InvitationView>> {
        let before = self.state.invitations.len();
        self.state.invitations.retain(|v| !(v.corp_id == corp_id && v.account == account));
        if self.state.invitations.len() == before {
            return Err("nie masz takiego zaproszenia".to_string());
        }
        Ok(self.invitations_of(account))
    }

    /// Leaves the corporation; a chief alone dissolves it and takes its treasury (it leaves its
    /// alliance at once, its megaprojects go).
    pub fn leave_corporation(&mut self, account: &str, now: f64) -> ExResult<CorpSummary> {
        let (i, role) = self.membership(account)?;
        let summary = self.summary(i);
        if role == Role::Chief {
            if self.state.corporations[i].members.len() > 1 {
                return Err("przekaż funkcję szefa, zanim odejdziesz".to_string());
            }
            let c = self.state.corporations.remove(i);
            self.state.invitations.retain(|v| v.corp_id != c.id);
            self.wallet_mut(account).credits += c.credits;
            let s = self.stock_mut(account, &c.hub_id);
            *s = add_stock(s, &c.stock, 1.0);
            self.corporation_dissolved(&c.id, now);
            return Ok(CorpSummary { members: 0, ..summary });
        }
        self.state.corporations[i].members.retain(|m| m.account != account);
        Ok(CorpSummary { members: summary.members - 1, ..summary })
    }

    /// The chief sets a member's role; `Chief` hands the role over (the old chief becomes an officer,
    /// or a member when the officers are full).
    pub fn set_role(&mut self, account: &str, member: &str, role: Role) -> ExResult<CorpView> {
        let (i, mine) = self.membership(account)?;
        if mine != Role::Chief {
            return Err("role nadaje szef".to_string());
        }
        if member == account {
            return Err("nie możesz zmienić własnej roli".to_string());
        }
        let max_officers = self.cfg.corp.max_officers;
        let c = &mut self.state.corporations[i];
        if !c.members.iter().any(|m| m.account == member) {
            return Err("to nie jest członek twojej korporacji".to_string());
        }
        let officers = c.members.iter().filter(|m| m.role == Role::Officer && m.account != member).count();
        match role {
            Role::Officer if officers >= max_officers => return Err(format!("najwyżej {max_officers} oficerów")),
            Role::Chief => {
                let me = if officers < max_officers { Role::Officer } else { Role::Member };
                for m in c.members.iter_mut() {
                    if m.account == account {
                        m.role = me;
                    }
                }
            }
            _ => {}
        }
        for m in c.members.iter_mut() {
            if m.account == member {
                m.role = role;
            }
        }
        Ok(self.corp_view(account).expect("a member"))
    }

    /// Officers expel members; the chief anyone but themselves.
    pub fn expel(&mut self, account: &str, member: &str) -> ExResult<CorpView> {
        let (i, mine) = self.membership(account)?;
        let Some(target) = self.state.corporations[i].members.iter().find(|m| m.account == member).map(|m| m.role) else {
            return Err("to nie jest członek twojej korporacji".to_string());
        };
        let allowed = member != account
            && match mine {
                Role::Chief => true,
                Role::Officer => target == Role::Member,
                Role::Member => false,
            };
        if !allowed {
            return Err("nie możesz usunąć tego członka".to_string());
        }
        self.state.corporations[i].members.retain(|m| m.account != member);
        Ok(self.corp_view(account).expect("a member"))
    }

    fn log(&mut self, i: usize, entry: LedgerEntry) {
        let ledger = &mut self.state.corporations[i].ledger;
        ledger.push(entry);
        if ledger.len() > LEDGER_KEPT {
            let extra = ledger.len() - LEDGER_KEPT;
            ledger.drain(..extra);
        }
    }

    /// A member pays credits and/or goods (from their stock in the seat hub) into the treasury.
    pub fn deposit(&mut self, account: &str, credits: f64, goods: &Qty, note: &str, now: f64) -> ExResult<CorpView> {
        let (i, _) = self.membership(account)?;
        if !credits.is_finite() || credits < 0.0 || !positive_goods(goods) || (credits == 0.0 && goods.is_empty()) {
            return Err("wpłata: dodatnie kredyty lub towary".to_string());
        }
        let hub = self.state.corporations[i].hub_id.clone();
        let wallet = self.wallet(account);
        if wallet.credits + 1e-9 < credits {
            return Err(format!("masz tylko {} kr", round2(wallet.credits)));
        }
        let have = wallet.stock.get(&hub).cloned().unwrap_or_default();
        if !can_afford(&have, goods) {
            return Err(format!("w hubie siedziby brakuje {}", format_cost(&missing_for(&have, goods))));
        }
        self.wallet_mut(account).credits -= credits;
        let s = self.stock_mut(account, &hub);
        *s = subtract_stock(s, goods);
        let c = &mut self.state.corporations[i];
        c.credits += credits;
        c.stock = add_stock(&c.stock, goods, 1.0);
        let entry = LedgerEntry {
            at: now,
            account: account.to_string(),
            kind: LedgerKind::Deposit,
            credits,
            goods: goods.clone(),
            note: clean(note, NOTE_MAX),
        };
        self.log(i, entry);
        Ok(self.corp_view(account).expect("a member"))
    }

    /// The chief or an officer takes credits and/or goods out of the treasury.
    pub fn withdraw(&mut self, account: &str, credits: f64, goods: &Qty, note: &str, now: f64) -> ExResult<CorpView> {
        let (i, role) = self.membership(account)?;
        if role == Role::Member {
            return Err("wypłacają szef i oficerowie".to_string());
        }
        if !credits.is_finite() || credits < 0.0 || !positive_goods(goods) || (credits == 0.0 && goods.is_empty()) {
            return Err("wypłata: dodatnie kredyty lub towary".to_string());
        }
        let c = &self.state.corporations[i];
        if c.credits + 1e-9 < credits {
            return Err(format!("w skarbcu jest {} kr", round2(c.credits)));
        }
        if !can_afford(&c.stock, goods) {
            return Err(format!("w skarbcu brakuje {}", format_cost(&missing_for(&c.stock, goods))));
        }
        let hub = c.hub_id.clone();
        let c = &mut self.state.corporations[i];
        c.credits -= credits;
        c.stock = subtract_stock(&c.stock, goods);
        self.wallet_mut(account).credits += credits;
        let s = self.stock_mut(account, &hub);
        *s = add_stock(s, goods, 1.0);
        let entry = LedgerEntry {
            at: now,
            account: account.to_string(),
            kind: LedgerKind::Withdrawal,
            credits,
            goods: goods.clone(),
            note: clean(note, NOTE_MAX),
        };
        self.log(i, entry);
        Ok(self.corp_view(account).expect("a member"))
    }

    pub fn post_notice(&mut self, account: &str, text: &str, now: f64) -> ExResult<CorpView> {
        let (i, _) = self.membership(account)?;
        let text = clean(text, NOTICE_MAX);
        if text.is_empty() {
            return Err("puste ogłoszenie".to_string());
        }
        let board = &mut self.state.corporations[i].board;
        board.push(Notice { at: now, account: account.to_string(), text });
        if board.len() > BOARD_KEPT {
            let extra = board.len() - BOARD_KEPT;
            board.drain(..extra);
        }
        Ok(self.corp_view(account).expect("a member"))
    }

    fn summary(&self, i: usize) -> CorpSummary {
        let c = &self.state.corporations[i];
        CorpSummary { id: c.id.clone(), name: c.name.clone(), tag: c.tag.clone(), hub_id: c.hub_id.clone(), members: c.members.len() }
    }

    pub fn corp_summaries(&self) -> Vec<CorpSummary> {
        (0..self.state.corporations.len()).map(|i| self.summary(i)).collect()
    }

    pub fn invitations_of(&self, account: &str) -> Vec<InvitationView> {
        self.state
            .invitations
            .iter()
            .filter(|v| v.account == account)
            .filter_map(|v| {
                let c = self.state.corporations.iter().find(|c| c.id == v.corp_id)?;
                Some(InvitationView {
                    corp_id: c.id.clone(),
                    name: c.name.clone(),
                    tag: c.tag.clone(),
                    by: self.callsign_of(&v.by),
                    at: v.at,
                })
            })
            .collect()
    }

    pub fn corp_view(&self, account: &str) -> Option<CorpView> {
        let i = self.corp_index(account)?;
        let c = &self.state.corporations[i];
        let role = c.members.iter().find(|m| m.account == account)?.role;
        let rank = |r: Role| match r {
            Role::Chief => 0,
            Role::Officer => 1,
            Role::Member => 2,
        };
        let mut members: Vec<MemberView> = c
            .members
            .iter()
            .map(|m| MemberView {
                account: m.account.clone(),
                callsign: self.callsign_of(&m.account),
                role: m.role,
                joined_at: m.joined_at,
            })
            .collect();
        members.sort_by_key(|m| rank(m.role));
        Some(CorpView {
            id: c.id.clone(),
            name: c.name.clone(),
            tag: c.tag.clone(),
            hub_id: c.hub_id.clone(),
            founded_at: c.founded_at,
            role,
            members,
            credits: round2(c.credits),
            stock: c.stock.iter().filter(|(_, q)| **q > 1e-9).map(|(k, q)| (k.clone(), *q)).collect::<IndexMap<_, _>>(),
            ledger: c
                .ledger
                .iter()
                .rev()
                .take(SHOWN)
                .map(|e| LedgerView {
                    at: e.at,
                    callsign: self.callsign_of(&e.account),
                    kind: e.kind,
                    credits: e.credits,
                    goods: e.goods.clone(),
                    note: e.note.clone(),
                })
                .collect(),
            board: c
                .board
                .iter()
                .rev()
                .take(SHOWN)
                .map(|n| NoticeView { at: n.at, callsign: self.callsign_of(&n.account), text: n.text.clone() })
                .collect(),
            invited: self.state.invitations.iter().filter(|v| v.corp_id == c.id).map(|v| self.callsign_of(&v.account)).collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests_support::{market_with, put_in_hub};
    use super::*;

    const T0: f64 = 1_000_000.0;

    /// 05-SOCIAL S2 gate: a corporation of 3 accounts, a deposit and a withdrawal in the ledger.
    #[test]
    fn three_accounts_a_treasury_and_its_ledger() {
        let mut m = market_with(|cfg| cfg.start_credits = 10_000.0);
        for (a, c) in [("acc-1", "Kestrel"), ("acc-2", "Wega"), ("acc-3", "Lyra")] {
            m.profile(a, Some(c), None);
        }
        let hub = "hub-sol";
        assert!(m.found_corporation("acc-1", "Konsorcjum Kestrel", "KST", hub, T0).unwrap_err().contains("STA"), "needs the goods too");
        put_in_hub(&mut m, "acc-1", hub, [("STA".to_string(), 120.0), ("FER".to_string(), 30.0)].into_iter().collect());
        assert!(m.found_corporation("acc-1", "x", "KST", hub, T0).is_err());
        assert!(m.found_corporation("acc-1", "Konsorcjum Kestrel", "kestrel", hub, T0).is_err());
        let v = m.found_corporation("acc-1", "Konsorcjum Kestrel", "kst", hub, T0).unwrap();
        assert_eq!((v.tag.as_str(), v.role, v.members.len()), ("KST", Role::Chief, 1));
        assert_eq!(m.wallet("acc-1").credits, 5000.0, "founding costs 5000 kr");
        assert!(m.found_corporation("acc-2", "Inna", "KST", hub, T0).unwrap_err().contains("zajęty"));

        // invitations by callsign
        assert!(m.invite("acc-1", "nikt", T0).is_err());
        m.invite("acc-1", "wega", T0).unwrap();
        m.invite("acc-1", "Lyra", T0).unwrap();
        assert_eq!(m.invitations_of("acc-2").len(), 1);
        assert_eq!(m.invitations_of("acc-2")[0].by, "Kestrel");
        let corp = v.id.clone();
        m.accept_invitation("acc-2", &corp, T0 + 1.0).unwrap();
        m.accept_invitation("acc-3", &corp, T0 + 2.0).unwrap();
        assert!(m.invitations_of("acc-3").is_empty());
        assert_eq!(m.corp_view("acc-1").unwrap().members.len(), 3);
        assert_eq!(m.players("acc-1").iter().find(|p| p.player.name == "Wega").unwrap().player.corporation, "Konsorcjum Kestrel");

        // deposits by anyone, withdrawals by the chief and officers
        m.deposit("acc-2", 300.0, &Qty::new(), "na start", T0 + 3.0).unwrap();
        m.deposit("acc-1", 0.0, &[("FER".to_string(), 30.0)].into_iter().collect(), "", T0 + 4.0).unwrap();
        assert!(m.withdraw("acc-3", 50.0, &Qty::new(), "", T0 + 5.0).unwrap_err().contains("szef i oficerowie"));
        m.set_role("acc-1", "acc-3", Role::Officer).unwrap();
        let v = m.withdraw("acc-3", 50.0, &[("FER".to_string(), 10.0)].into_iter().collect(), "paliwo", T0 + 6.0).unwrap();
        assert_eq!(v.credits, 250.0);
        assert_eq!(v.stock["FER"], 20.0);
        assert_eq!(m.wallet("acc-3").credits, 10_050.0);
        assert_eq!(m.wallet("acc-3").stock[hub]["FER"], 10.0, "into the seat hub");
        assert!(m.withdraw("acc-3", 1e6, &Qty::new(), "", T0).unwrap_err().contains("w skarbcu"));
        let ledger: Vec<(String, LedgerKind, f64)> = v.ledger.iter().map(|e| (e.callsign.clone(), e.kind, e.credits)).collect();
        assert_eq!(
            ledger,
            vec![
                ("Lyra".into(), LedgerKind::Withdrawal, 50.0),
                ("Kestrel".into(), LedgerKind::Deposit, 0.0),
                ("Wega".into(), LedgerKind::Deposit, 300.0)
            ]
        );
        assert_eq!(v.ledger[0].note, "paliwo");

        // the board, roles and leaving
        m.post_notice("acc-2", "  zbiórka w hubie\u{7}  ", T0 + 7.0).unwrap();
        assert_eq!(m.corp_view("acc-1").unwrap().board[0].text, "zbiórka w hubie");
        assert!(m.post_notice("acc-2", "   ", T0).is_err());
        assert!(m.expel("acc-3", "acc-1").is_err(), "an officer does not expel the chief");
        assert!(m.leave_corporation("acc-1", T0).unwrap_err().contains("przekaż"));
        m.set_role("acc-1", "acc-2", Role::Chief).unwrap();
        let v = m.corp_view("acc-2").unwrap();
        assert_eq!(v.role, Role::Chief);
        assert_eq!(v.members.iter().find(|x| x.account == "acc-1").unwrap().role, Role::Officer);
        m.leave_corporation("acc-1", T0).unwrap();
        m.expel("acc-2", "acc-3").unwrap();
        // alone, the chief dissolves it and takes the treasury
        let before = m.wallet("acc-2").credits;
        let gone = m.leave_corporation("acc-2", T0).unwrap();
        assert_eq!(gone.members, 0);
        assert!(m.corp_summaries().is_empty());
        assert_eq!(m.wallet("acc-2").credits, before + 250.0);
        assert_eq!(m.wallet("acc-2").stock[hub]["FER"], 20.0);

        // the state survives JSON
        let json = serde_json::to_string(&m.save()).unwrap();
        let back: super::super::ExchangeState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, m.save());
    }
}
