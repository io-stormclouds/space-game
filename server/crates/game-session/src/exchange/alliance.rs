//! Alliances (05-SOCIAL §6, S3): pacts of 2–5 corporations, for megaprojects larger than one
//! corporation can carry (an alliance's gate serves every member). Diplomacy is only "in the
//! alliance" or not; there is no hostility without PvP (S-8).
//!
//! Rules:
//! - the chief of a corporation outside any alliance founds one (the name is unique); their
//!   corporation leads it;
//! - the leader's chief invites a corporation by its tag; that corporation's chief accepts (or
//!   declines); at most `alliance_max_corps` corporations, one alliance per corporation;
//! - a chief takes the corporation out with a notice period (`alliance_leave_seconds`, 48 h): it stays
//!   a member until then; the last corporation out dissolves the alliance, and a leader that leaves
//!   hands the lead to the oldest member;
//! - a dissolved corporation leaves at once.

use serde::{Deserialize, Serialize};

use super::corporation::Role;
use super::{Changes, ExResult, Exchange};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllianceMember {
    pub corp_id: String,
    pub joined_at: f64,
    /// Out at this time (a notice given).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leaving_at: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Alliance {
    pub id: String,
    pub name: String,
    pub founded_at: f64,
    /// The leading corporation.
    pub leader: String,
    pub members: Vec<AllianceMember>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllianceInvitation {
    pub alliance_id: String,
    pub corp_id: String,
    pub by: String,
    pub at: f64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllianceMemberView {
    pub corp_id: String,
    pub name: String,
    pub tag: String,
    pub joined_at: f64,
    pub leaving_at: Option<f64>,
    pub leader: bool,
}

/// The viewer's alliance (through their corporation).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllianceView {
    pub id: String,
    pub name: String,
    pub founded_at: f64,
    pub members: Vec<AllianceMemberView>,
    /// Tags of the corporations invited and not answered yet.
    pub invited: Vec<String>,
    /// The viewer is the chief of the leading corporation (invites, starts projects).
    pub leads: bool,
    /// The viewer is the chief of their corporation (accepts, leaves).
    pub chief: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllianceSummary {
    pub id: String,
    pub name: String,
    pub corporations: usize,
}

/// An invitation of the viewer's corporation (shown to its chief).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllianceInvitationView {
    pub alliance_id: String,
    pub name: String,
    pub by: String,
    pub at: f64,
}

fn valid_name(n: &str) -> bool {
    let len = n.chars().count();
    (3..=32).contains(&len) && n.chars().all(|c| c.is_alphanumeric() || " -_.".contains(c))
}

impl Exchange {
    pub(super) fn alliance_of_corp(&self, corp_id: &str) -> Option<usize> {
        self.state.alliances.iter().position(|a| a.members.iter().any(|m| m.corp_id == corp_id))
    }

    /// The index of the corporation whose chief the account is.
    fn chief_corp(&self, account: &str) -> ExResult<usize> {
        let (i, role) = self.membership(account)?;
        if role != Role::Chief {
            return Err("w sprawach sojuszu decyduje szef korporacji".to_string());
        }
        Ok(i)
    }

    pub fn found_alliance(&mut self, account: &str, name: &str, now: f64) -> ExResult<AllianceView> {
        let i = self.chief_corp(account)?;
        let name = name.trim().to_string();
        if !valid_name(&name) {
            return Err("nazwa sojuszu: 3–32 znaki (litery, cyfry, spacja, - _ .)".to_string());
        }
        let corp_id = self.state.corporations[i].id.clone();
        if self.alliance_of_corp(&corp_id).is_some() {
            return Err("twoja korporacja jest już w sojuszu".to_string());
        }
        if self.state.alliances.iter().any(|a| a.name.to_lowercase() == name.to_lowercase()) {
            return Err(format!("sojusz „{name}” już istnieje"));
        }
        let id = self.new_id("alliance");
        self.state.alliance_invitations.retain(|v| v.corp_id != corp_id);
        self.state.alliances.push(Alliance {
            id,
            name,
            founded_at: now,
            leader: corp_id.clone(),
            members: vec![AllianceMember { corp_id, joined_at: now, leaving_at: None }],
        });
        Ok(self.alliance_view(account).expect("just founded"))
    }

    pub fn invite_corporation(&mut self, account: &str, tag: &str, now: f64) -> ExResult<AllianceView> {
        let i = self.chief_corp(account)?;
        let my_corp = self.state.corporations[i].id.clone();
        let a = self.alliance_of_corp(&my_corp).ok_or_else(|| "twoja korporacja nie jest w sojuszu".to_string())?;
        if self.state.alliances[a].leader != my_corp {
            return Err("zaprasza szef korporacji prowadzącej sojusz".to_string());
        }
        let tag = tag.trim().to_uppercase();
        let Some(target) = self.state.corporations.iter().find(|c| c.tag == tag).map(|c| c.id.clone()) else {
            return Err(format!("nie ma korporacji [{tag}]"));
        };
        if self.alliance_of_corp(&target).is_some() {
            return Err(format!("korporacja [{tag}] jest już w sojuszu"));
        }
        let max = self.cfg.social.alliance_max_corps;
        if self.state.alliances[a].members.len() >= max {
            return Err(format!("sojusz ma już {max} korporacji"));
        }
        let alliance_id = self.state.alliances[a].id.clone();
        if !self.state.alliance_invitations.iter().any(|v| v.alliance_id == alliance_id && v.corp_id == target) {
            self.state.alliance_invitations.push(AllianceInvitation { alliance_id, corp_id: target, by: account.to_string(), at: now });
        }
        Ok(self.alliance_view(account).expect("a member"))
    }

    pub fn accept_alliance(&mut self, account: &str, alliance_id: &str, now: f64) -> ExResult<AllianceView> {
        let i = self.chief_corp(account)?;
        let corp_id = self.state.corporations[i].id.clone();
        if !self.state.alliance_invitations.iter().any(|v| v.alliance_id == alliance_id && v.corp_id == corp_id) {
            return Err("twoja korporacja nie ma takiego zaproszenia".to_string());
        }
        if self.alliance_of_corp(&corp_id).is_some() {
            return Err("twoja korporacja jest już w sojuszu".to_string());
        }
        let max = self.cfg.social.alliance_max_corps;
        let Some(a) = self.state.alliances.iter_mut().find(|a| a.id == alliance_id) else {
            self.state.alliance_invitations.retain(|v| v.alliance_id != alliance_id);
            return Err("tego sojuszu już nie ma".to_string());
        };
        if a.members.len() >= max {
            return Err(format!("sojusz ma już {max} korporacji"));
        }
        a.members.push(AllianceMember { corp_id: corp_id.clone(), joined_at: now, leaving_at: None });
        self.state.alliance_invitations.retain(|v| v.corp_id != corp_id);
        Ok(self.alliance_view(account).expect("just joined"))
    }

    pub fn decline_alliance(&mut self, account: &str, alliance_id: &str) -> ExResult<Vec<AllianceInvitationView>> {
        let i = self.chief_corp(account)?;
        let corp_id = self.state.corporations[i].id.clone();
        let before = self.state.alliance_invitations.len();
        self.state.alliance_invitations.retain(|v| !(v.alliance_id == alliance_id && v.corp_id == corp_id));
        if self.state.alliance_invitations.len() == before {
            return Err("twoja korporacja nie ma takiego zaproszenia".to_string());
        }
        Ok(self.alliance_invitations_of(account))
    }

    /// The chief gives notice: the corporation is out after the notice period (at once when it is
    /// the last one: the alliance is dissolved).
    pub fn leave_alliance(&mut self, account: &str, now: f64) -> ExResult<AllianceSummary> {
        let i = self.chief_corp(account)?;
        let corp_id = self.state.corporations[i].id.clone();
        let a = self.alliance_of_corp(&corp_id).ok_or_else(|| "twoja korporacja nie jest w sojuszu".to_string())?;
        let notice = self.cfg.social.alliance_leave_seconds * 1000.0;
        let alone = self.state.alliances[a].members.len() == 1;
        let m = self.state.alliances[a].members.iter_mut().find(|m| m.corp_id == corp_id).expect("a member");
        if m.leaving_at.is_some() && !alone {
            return Err("wypowiedzenie już złożone".to_string());
        }
        m.leaving_at = Some(if alone { now } else { now + notice });
        let mut ch = Changes::default();
        self.age_alliances(now, &mut ch);
        let a = &self.state.alliances.get(a).filter(|x| x.members.iter().any(|m| m.corp_id == corp_id));
        Ok(match a {
            Some(a) => AllianceSummary { id: a.id.clone(), name: a.name.clone(), corporations: a.members.len() },
            None => AllianceSummary { id: String::new(), name: String::new(), corporations: 0 },
        })
    }

    /// Notices that ran out take effect; empty alliances go; a leader that left hands over the lead.
    pub(super) fn age_alliances(&mut self, now: f64, ch: &mut Changes) {
        let mut changed = false;
        for a in self.state.alliances.iter_mut() {
            let before = a.members.len();
            a.members.retain(|m| m.leaving_at.is_none_or(|t| t > now));
            if a.members.len() != before {
                changed = true;
                if !a.members.iter().any(|m| m.corp_id == a.leader)
                    && let Some(next) = a.members.iter().min_by(|x, y| x.joined_at.total_cmp(&y.joined_at))
                {
                    a.leader = next.corp_id.clone();
                }
            }
        }
        let gone: Vec<String> = self.state.alliances.iter().filter(|a| a.members.is_empty()).map(|a| a.id.clone()).collect();
        if !gone.is_empty() {
            self.state.alliances.retain(|a| !a.members.is_empty());
            self.state.alliance_invitations.retain(|v| !gone.contains(&v.alliance_id));
            self.alliances_dissolved(&gone);
        }
        if changed {
            ch.contracts = true; // every view shows the alliances
        }
    }

    /// A dissolved corporation leaves its alliance at once.
    pub(super) fn corporation_dissolved(&mut self, corp_id: &str, now: f64) {
        self.state.alliance_invitations.retain(|v| v.corp_id != corp_id);
        if let Some(a) = self.alliance_of_corp(corp_id) {
            for m in self.state.alliances[a].members.iter_mut().filter(|m| m.corp_id == corp_id) {
                m.leaving_at = Some(now);
            }
            let mut ch = Changes::default();
            self.age_alliances(now, &mut ch);
        }
        self.corporation_projects_dissolved(corp_id);
    }

    pub fn alliance_view(&self, account: &str) -> Option<AllianceView> {
        let ci = self.corp_index(account)?;
        let corp = &self.state.corporations[ci];
        let a = &self.state.alliances[self.alliance_of_corp(&corp.id)?];
        let chief = corp.members.iter().any(|m| m.account == account && m.role == Role::Chief);
        let members = a
            .members
            .iter()
            .filter_map(|m| {
                let c = self.state.corporations.iter().find(|c| c.id == m.corp_id)?;
                Some(AllianceMemberView {
                    corp_id: c.id.clone(),
                    name: c.name.clone(),
                    tag: c.tag.clone(),
                    joined_at: m.joined_at,
                    leaving_at: m.leaving_at,
                    leader: c.id == a.leader,
                })
            })
            .collect();
        let invited = self
            .state
            .alliance_invitations
            .iter()
            .filter(|v| v.alliance_id == a.id)
            .filter_map(|v| self.state.corporations.iter().find(|c| c.id == v.corp_id).map(|c| c.tag.clone()))
            .collect();
        Some(AllianceView {
            id: a.id.clone(),
            name: a.name.clone(),
            founded_at: a.founded_at,
            members,
            invited,
            leads: chief && a.leader == corp.id,
            chief,
        })
    }

    pub fn alliance_summaries(&self) -> Vec<AllianceSummary> {
        self.state
            .alliances
            .iter()
            .map(|a| AllianceSummary { id: a.id.clone(), name: a.name.clone(), corporations: a.members.len() })
            .collect()
    }

    /// Invitations of the corporation whose chief the account is.
    pub fn alliance_invitations_of(&self, account: &str) -> Vec<AllianceInvitationView> {
        let Ok(i) = self.chief_corp(account) else { return Vec::new() };
        let corp_id = &self.state.corporations[i].id;
        self.state
            .alliance_invitations
            .iter()
            .filter(|v| &v.corp_id == corp_id)
            .filter_map(|v| {
                let a = self.state.alliances.iter().find(|a| a.id == v.alliance_id)?;
                Some(AllianceInvitationView { alliance_id: a.id.clone(), name: a.name.clone(), by: self.callsign_of(&v.by), at: v.at })
            })
            .collect()
    }
}
