//! Sessions (plan 02 §8, R-25). A login over HTTP gets a random token in an `HttpOnly` cookie; the
//! server keeps only its hash (BLAKE2s) with the account and the expiry, in `DATA_DIR/sessions.json`,
//! so a copy of the file logs nobody in. A WebSocket logs in with a one-time ticket (30 s) that the
//! client gets for its cookie (`POST /api/ticket`): the socket's hello never carries the password,
//! and a page of another site cannot open the game in the player's name (it cannot read the ticket).
//!
//! Limits: failed logins of one callsign (5 in 15 min lock it until the window ends) and new accounts
//! (registrations and guests) per minute on the whole server.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Mutex;

use axum::http::HeaderMap;
use blake2::{Blake2s256, Digest};
use serde::{Deserialize, Serialize};

use crate::accounts::write_atomic;

/// Name of the session cookie.
pub const COOKIE: &str = "sg_session";
/// Lifetime of a WebSocket ticket [s].
pub const TICKET_SECONDS: u64 = 30;
/// Failed logins of one callsign within the window that lock it.
pub const MAX_FAILURES: u32 = 5;
/// The window of failed logins [s].
pub const FAILURE_WINDOW_SECONDS: u64 = 15 * 60;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub account: String,
    /// Unix seconds.
    pub created: u64,
    pub expires: u64,
}

struct Ticket {
    account: String,
    expires: u64,
}

pub struct SessionStore {
    path: PathBuf,
    lifetime: u64,
    signups_per_minute: u32,
    /// Token hash → session.
    sessions: Mutex<BTreeMap<String, Session>>,
    tickets: Mutex<HashMap<String, Ticket>>,
    /// Callsign key → (failures, first failure of the window).
    failures: Mutex<HashMap<String, (u32, u64)>>,
    /// Times of the new accounts of the last minute.
    signups: Mutex<VecDeque<u64>>,
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// 32 random bytes from the operating system, as hex.
pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("random bytes from the OS");
    hex(&bytes)
}

fn digest(token: &str) -> String {
    hex(&Blake2s256::digest(token.as_bytes()))
}

/// The session token of a request's cookie.
pub fn cookie_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().strip_prefix(COOKIE)?.strip_prefix('='))
        .find(|t| !t.is_empty())
        .map(str::to_string)
}

impl SessionStore {
    /// `lifetime` of a session [s]; `signups_per_minute` 0 = no limit.
    pub fn open(path: PathBuf, lifetime: u64, signups_per_minute: u32) -> std::io::Result<SessionStore> {
        let mut sessions: BTreeMap<String, Session> = match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
                // sessions are not worth a server that does not start: everyone logs in again
                eprintln!("sessions: unreadable {} ({e}), starting empty", path.display());
                BTreeMap::new()
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => return Err(e),
        };
        let now = now_secs();
        sessions.retain(|_, s| s.expires > now);
        Ok(SessionStore {
            path,
            lifetime,
            signups_per_minute,
            sessions: Mutex::new(sessions),
            tickets: Mutex::new(HashMap::new()),
            failures: Mutex::new(HashMap::new()),
            signups: Mutex::new(VecDeque::new()),
        })
    }

    fn save(&self, sessions: &BTreeMap<String, Session>) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(sessions).map_err(std::io::Error::other)?;
        write_atomic(&self.path, text.as_bytes())
    }

    /// A new session of the account; the token goes to the cookie, only its hash is kept.
    pub fn create(&self, account: &str) -> std::io::Result<String> {
        let token = random_token();
        let now = now_secs();
        let mut sessions = self.sessions.lock().expect("sessions lock");
        sessions.retain(|_, s| s.expires > now);
        sessions.insert(digest(&token), Session { account: account.to_string(), created: now, expires: now + self.lifetime });
        self.save(&sessions)?;
        Ok(token)
    }

    /// Live sessions.
    pub fn count(&self) -> usize {
        let now = now_secs();
        self.sessions.lock().expect("sessions lock").values().filter(|s| s.expires > now).count()
    }

    /// The account of a live session.
    pub fn account_of(&self, token: &str) -> Option<String> {
        let sessions = self.sessions.lock().expect("sessions lock");
        sessions.get(&digest(token)).filter(|s| s.expires > now_secs()).map(|s| s.account.clone())
    }

    pub fn revoke(&self, token: &str) -> std::io::Result<()> {
        let mut sessions = self.sessions.lock().expect("sessions lock");
        if sessions.remove(&digest(token)).is_some() {
            self.save(&sessions)?;
        }
        Ok(())
    }

    /// A one-time ticket for the WebSocket hello.
    pub fn ticket(&self, account: &str) -> String {
        let ticket = random_token();
        let now = now_secs();
        let mut tickets = self.tickets.lock().expect("tickets lock");
        tickets.retain(|_, t| t.expires >= now);
        tickets.insert(ticket.clone(), Ticket { account: account.to_string(), expires: now + TICKET_SECONDS });
        ticket
    }

    /// The account of a ticket, used up.
    pub fn redeem(&self, ticket: &str) -> Option<String> {
        let t = self.tickets.lock().expect("tickets lock").remove(ticket)?;
        (t.expires >= now_secs()).then_some(t.account)
    }

    /// `Err(seconds)` while the callsign is locked after too many failed logins.
    pub fn check_failures(&self, key: &str) -> Result<(), u64> {
        let now = now_secs();
        let mut failures = self.failures.lock().expect("failures lock");
        match failures.get(key) {
            Some(&(_, first)) if now >= first + FAILURE_WINDOW_SECONDS => {
                failures.remove(key);
                Ok(())
            }
            Some(&(n, first)) if n >= MAX_FAILURES => Err(first + FAILURE_WINDOW_SECONDS - now),
            _ => Ok(()),
        }
    }

    pub fn failed(&self, key: &str) {
        let now = now_secs();
        let mut failures = self.failures.lock().expect("failures lock");
        let entry = failures.entry(key.to_string()).or_insert((0, now));
        if now >= entry.1 + FAILURE_WINDOW_SECONDS {
            *entry = (0, now);
        }
        entry.0 += 1;
    }

    pub fn succeeded(&self, key: &str) {
        self.failures.lock().expect("failures lock").remove(key);
    }

    /// Counts a new account; `false` when the server made its limit of the last minute.
    pub fn signup(&self) -> bool {
        if self.signups_per_minute == 0 {
            return true;
        }
        let now = now_secs();
        let mut signups = self.signups.lock().expect("signups lock");
        while signups.front().is_some_and(|t| *t + 60 <= now) {
            signups.pop_front();
        }
        if signups.len() >= self.signups_per_minute as usize {
            return false;
        }
        signups.push_back(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sessions_tickets_and_failed_logins() {
        let dir = std::env::temp_dir().join(format!("sg-sessions-{}", std::process::id()));
        let path = dir.join("sessions.json");
        let _ = std::fs::remove_file(&path);
        let store = SessionStore::open(path.clone(), 3600, 2).unwrap();
        let token = store.create("acc-1").unwrap();
        assert_eq!(store.account_of(&token).as_deref(), Some("acc-1"));
        assert_eq!(store.account_of("nope"), None);
        let file = std::fs::read_to_string(&path).unwrap();
        assert!(!file.contains(&token), "only the hash of the token is stored");
        // survives a restart, ends with a logout
        let reopened = SessionStore::open(path.clone(), 3600, 2).unwrap();
        assert_eq!(reopened.account_of(&token).as_deref(), Some("acc-1"));
        reopened.revoke(&token).unwrap();
        assert_eq!(reopened.account_of(&token), None);
        // a ticket is good once
        let t = store.ticket("acc-1");
        assert_eq!(store.redeem(&t).as_deref(), Some("acc-1"));
        assert_eq!(store.redeem(&t), None);
        // five failures lock the callsign, a success clears them
        for _ in 0..MAX_FAILURES {
            assert!(store.check_failures("kestrel").is_ok());
            store.failed("kestrel");
        }
        let wait = store.check_failures("kestrel").unwrap_err();
        assert!(wait > 0 && wait <= FAILURE_WINDOW_SECONDS);
        assert!(store.check_failures("wega").is_ok());
        store.succeeded("kestrel");
        assert!(store.check_failures("kestrel").is_ok());
        // new accounts per minute
        assert!(store.signup() && store.signup());
        assert!(!store.signup());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_cookie_is_found_among_others() {
        let mut h = HeaderMap::new();
        h.insert(axum::http::header::COOKIE, "theme=dark; sg_session=abc123; x=1".parse().unwrap());
        assert_eq!(cookie_token(&h).as_deref(), Some("abc123"));
        let mut h = HeaderMap::new();
        h.insert(axum::http::header::COOKIE, "sg_session_old=zzz".parse().unwrap());
        assert_eq!(cookie_token(&h), None);
    }
}
