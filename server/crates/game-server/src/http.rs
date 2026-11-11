//! HTTP API of accounts and sessions (plan 02 §6, §8, R-25): JSON in and out, the session in an
//! `HttpOnly` cookie (`SameSite=Strict`, `Secure` in production). The game itself goes over the
//! WebSocket, which logs in with a one-time ticket of `POST /api/ticket`.
//!
//! - `POST /api/register` `{callsign, password}` → a new account, logged in (`REGISTRATION`);
//! - `POST /api/login` `{callsign, password}` → logged in; failures of a callsign are limited;
//! - `POST /api/guest` → a guest account, logged in (`GUEST_ACCOUNTS`);
//! - `POST /api/logout` → the session ends, the cookie is cleared;
//! - `GET /api/session` → `{accountId, callsign, guest}` or 401;
//! - `POST /api/ticket` → `{ticket}` for the WebSocket hello, or 401.
//!
//! Errors are `{error}` in Polish with 400 (bad input), 401, 403 (switched off, another origin),
//! 409 (callsign taken), 429 (limits). A request with an `Origin` of another host is refused.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::accounts::{Account, AuthError, key};
use crate::sessions::{COOKIE, cookie_token};

#[derive(Deserialize)]
struct Credentials {
    callsign: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionView<'a> {
    account_id: &'a str,
    callsign: &'a str,
    guest: bool,
}

fn json(status: StatusCode, value: serde_json::Value) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")], value.to_string()).into_response()
}

fn error(status: StatusCode, msg: impl Into<String>) -> Response {
    json(status, serde_json::json!({ "error": msg.into() }))
}

fn auth_error(e: AuthError) -> Response {
    let status = match e {
        AuthError::BadCallsign | AuthError::WeakPassword => StatusCode::BAD_REQUEST,
        AuthError::UnknownAccount | AuthError::WrongPassword => StatusCode::UNAUTHORIZED,
        AuthError::Taken => StatusCode::CONFLICT,
        AuthError::Storage(ref s) => {
            eprintln!("accounts: {s}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    };
    error(status, e.to_string())
}

/// A request from a page of another host (its `Origin`) is not ours: the cookie must not act for it.
fn same_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true; // not a browser's cross-origin request (tools, same-origin GET)
    };
    let host = headers.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("");
    origin.split_once("://").map(|(_, h)| h) == Some(host)
}

fn cookie(state: &AppState, token: &str, max_age: u64) -> HeaderValue {
    let secure = if state.cfg.auth.cookie_secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}"))
        .expect("cookie is ASCII")
}

fn view(a: &Account) -> serde_json::Value {
    serde_json::to_value(SessionView { account_id: &a.id, callsign: &a.callsign, guest: a.guest }).expect("view serialises")
}

/// A new session of the account: its view and the cookie.
async fn logged_in(state: &AppState, account: &Account) -> Response {
    match state.sessions.create(&account.id).await {
        Ok(token) => {
            let mut r = json(StatusCode::OK, view(account));
            r.headers_mut().insert(header::SET_COOKIE, cookie(state, &token, state.cfg.auth.session_seconds));
            r
        }
        Err(e) => {
            eprintln!("sessions: {e}");
            error(StatusCode::INTERNAL_SERVER_ERROR, "nie udało się zapisać sesji")
        }
    }
}

fn credentials(body: &Bytes) -> Option<Credentials> {
    serde_json::from_slice(body).ok()
}

fn bad_credentials() -> Response {
    error(StatusCode::BAD_REQUEST, "oczekiwano {callsign, password}")
}

/// The account of the request's session cookie.
async fn session_account(state: &AppState, headers: &HeaderMap) -> Option<Account> {
    let id = state.sessions.account_of(&cookie_token(headers)?).await?;
    state.accounts.by_id(&id).await
}

const OTHER_ORIGIN: &str = "żądanie z innej strony";

pub async fn register(State(state): State<Arc<AppState>>, headers: HeaderMap, body: Bytes) -> Response {
    if !same_origin(&headers) {
        return error(StatusCode::FORBIDDEN, OTHER_ORIGIN);
    }
    if !state.cfg.auth.registration {
        return error(StatusCode::FORBIDDEN, "zakładanie kont jest wyłączone");
    }
    let Some(c) = credentials(&body) else { return bad_credentials() };
    if !state.sessions.signup() {
        return error(StatusCode::TOO_MANY_REQUESTS, "za dużo nowych kont na raz: spróbuj za minutę");
    }
    match state.accounts.register(&c.callsign, &c.password, false).await {
        Ok(a) => {
            println!("account {} registered", a.id);
            logged_in(&state, &a).await
        }
        Err(e) => auth_error(e),
    }
}

pub async fn login(State(state): State<Arc<AppState>>, headers: HeaderMap, body: Bytes) -> Response {
    if !same_origin(&headers) {
        return error(StatusCode::FORBIDDEN, OTHER_ORIGIN);
    }
    let Some(c) = credentials(&body) else { return bad_credentials() };
    let k = key(&c.callsign);
    if let Err(wait) = state.sessions.check_failures(&k) {
        return error(StatusCode::TOO_MANY_REQUESTS, locked_message(wait));
    }
    let m = &crate::metrics::METRICS;
    match state.accounts.authenticate(&c.callsign, &c.password, false).await {
        Ok(a) => {
            crate::metrics::inc(&m.logins_ok);
            state.sessions.succeeded(&k);
            logged_in(&state, &a).await
        }
        Err(e @ (AuthError::WrongPassword | AuthError::UnknownAccount)) => {
            crate::metrics::inc(&m.logins_refused);
            state.sessions.failed(&k);
            auth_error(e)
        }
        Err(e) => auth_error(e),
    }
}

/// `GET /metrics` (Prometheus text format): with `METRICS_TOKEN` as a bearer token; without a token
/// open in dev mode, off in production.
pub async fn metrics(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    match &state.cfg.auth.metrics_token {
        Some(token) => {
            let given = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "));
            if given != Some(token.as_str()) {
                return error(StatusCode::UNAUTHORIZED, "metryki: zły token");
            }
        }
        None if !state.cfg.dev_mode => return error(StatusCode::NOT_FOUND, "metryki wyłączone (METRICS_TOKEN)"),
        None => {}
    }
    let worlds_running = state.worlds.lock().await.values().filter(|tx| !tx.is_closed()).count();
    let moment = crate::metrics::Moment {
        worlds_running,
        accounts: state.accounts.count().await,
        sessions: state.sessions.count().await,
        uptime_seconds: state.started.elapsed().as_secs_f64(),
    };
    let body = crate::metrics::render(&crate::metrics::METRICS, &moment);
    ([(header::CONTENT_TYPE, "text/plain; version=0.0.4")], body).into_response()
}

/// The message of a callsign locked for `wait` seconds.
pub fn locked_message(wait: u64) -> String {
    format!("za dużo nieudanych prób logowania: spróbuj ponownie za {} min", wait.div_ceil(60).max(1))
}

pub async fn guest(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !same_origin(&headers) {
        return error(StatusCode::FORBIDDEN, OTHER_ORIGIN);
    }
    if !state.cfg.auth.guest_accounts {
        return error(StatusCode::FORBIDDEN, "gra bez konta jest wyłączona: załóż konto");
    }
    if !state.sessions.signup() {
        return error(StatusCode::TOO_MANY_REQUESTS, "za dużo nowych kont na raz: spróbuj za minutę");
    }
    match state.accounts.create_guest().await {
        Ok(a) => logged_in(&state, &a).await,
        Err(e) => auth_error(e),
    }
}

pub async fn logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !same_origin(&headers) {
        return error(StatusCode::FORBIDDEN, OTHER_ORIGIN);
    }
    if let Some(token) = cookie_token(&headers)
        && let Err(e) = state.sessions.revoke(&token).await
    {
        eprintln!("sessions: {e}");
    }
    let mut r = StatusCode::NO_CONTENT.into_response();
    r.headers_mut().insert(header::SET_COOKIE, cookie(&state, "", 0));
    r
}

pub async fn session(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    match session_account(&state, &headers).await {
        Some(a) => json(StatusCode::OK, view(&a)),
        None => error(StatusCode::UNAUTHORIZED, "nie zalogowano"),
    }
}

pub async fn ticket(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !same_origin(&headers) {
        return error(StatusCode::FORBIDDEN, OTHER_ORIGIN);
    }
    match session_account(&state, &headers).await {
        Some(a) => json(StatusCode::OK, serde_json::json!({ "ticket": state.sessions.ticket(&a.id) })),
        None => error(StatusCode::UNAUTHORIZED, "nie zalogowano"),
    }
}
