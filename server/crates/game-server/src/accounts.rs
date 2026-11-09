//! Accounts (plan 02 §7 `accounts`, §8): callsign + password hashed with argon2id, kept in
//! `DATA_DIR/accounts.json`. One account = one player's world (Model C). A PostgreSQL adapter replaces
//! the file later; the API stays.

use std::collections::BTreeMap;
use std::path::PathBuf;

use argon2::Argon2;
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub callsign: String,
    pub password_hash: String,
    /// Unix seconds.
    pub created: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    BadCallsign,
    WeakPassword,
    UnknownAccount,
    WrongPassword,
    Storage(String),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            AuthError::BadCallsign => "znak wywoławczy: 3–24 znaki (litery, cyfry, - _ .)",
            AuthError::WeakPassword => "kod dostępu: co najmniej 6 znaków",
            AuthError::UnknownAccount => "nieznany dowódca",
            AuthError::WrongPassword => "błędny kod dostępu",
            AuthError::Storage(e) => e,
        })
    }
}

pub struct AccountStore {
    path: PathBuf,
    accounts: Mutex<BTreeMap<String, Account>>,
}

fn key(callsign: &str) -> String {
    callsign.trim().to_lowercase()
}

fn valid_callsign(c: &str) -> bool {
    let n = c.chars().count();
    (3..=24).contains(&n) && c.chars().all(|ch| ch.is_alphanumeric() || "-_.".contains(ch))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

impl AccountStore {
    pub fn open(path: PathBuf) -> std::io::Result<AccountStore> {
        let accounts = match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).map_err(std::io::Error::other)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => return Err(e),
        };
        Ok(AccountStore { path, accounts: Mutex::new(accounts) })
    }

    /// Checks the password; with `create`, an unknown callsign becomes a new account (dev mode, first login).
    pub async fn authenticate(&self, callsign: &str, password: &str, create: bool) -> Result<Account, AuthError> {
        let callsign = callsign.trim();
        if !valid_callsign(callsign) {
            return Err(AuthError::BadCallsign);
        }
        let mut accounts = self.accounts.lock().await;
        if let Some(a) = accounts.get(&key(callsign)) {
            let hash = PasswordHash::new(&a.password_hash).map_err(|e| AuthError::Storage(e.to_string()))?;
            return match Argon2::default().verify_password(password.as_bytes(), &hash) {
                Ok(()) => Ok(a.clone()),
                Err(_) => Err(AuthError::WrongPassword),
            };
        }
        if !create {
            return Err(AuthError::UnknownAccount);
        }
        if password.chars().count() < 6 {
            return Err(AuthError::WeakPassword);
        }
        let salt = SaltString::generate(&mut OsRng);
        let password_hash =
            Argon2::default().hash_password(password.as_bytes(), &salt).map_err(|e| AuthError::Storage(e.to_string()))?.to_string();
        let account =
            Account { id: format!("acc-{}", accounts.len() + 1), callsign: callsign.to_string(), password_hash, created: now_secs() };
        accounts.insert(key(callsign), account.clone());
        let text = serde_json::to_string_pretty(&*accounts).map_err(|e| AuthError::Storage(e.to_string()))?;
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| AuthError::Storage(e.to_string()))?;
        }
        write_atomic(&self.path, text.as_bytes()).map_err(|e| AuthError::Storage(e.to_string()))?;
        Ok(account)
    }
}

/// Writes through a temporary file and a rename, so a crash never leaves half a file.
pub fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn create_then_login() {
        let dir = std::env::temp_dir().join(format!("sg-acc-{}", std::process::id()));
        let path = dir.join("accounts.json");
        let _ = std::fs::remove_file(&path);
        let store = AccountStore::open(path.clone()).unwrap();
        assert_eq!(store.authenticate("Kestrel", "secret1", false).await.unwrap_err(), AuthError::UnknownAccount);
        assert_eq!(store.authenticate("x", "secret1", true).await.unwrap_err(), AuthError::BadCallsign);
        assert_eq!(store.authenticate("Kestrel", "123", true).await.unwrap_err(), AuthError::WeakPassword);
        let a = store.authenticate("Kestrel", "secret1", true).await.unwrap();
        assert_eq!(store.authenticate("kestrel", "secret1", false).await.unwrap().id, a.id);
        assert_eq!(store.authenticate("Kestrel", "wrong!!", true).await.unwrap_err(), AuthError::WrongPassword);
        let reopened = AccountStore::open(path).unwrap();
        assert_eq!(reopened.authenticate("KESTREL", "secret1", false).await.unwrap().id, a.id);
        let _ = std::fs::remove_dir_all(dir);
    }
}
