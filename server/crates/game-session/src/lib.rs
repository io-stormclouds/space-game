//! One player's game behind the `GameApi` contract (`web-game/packages/api/src/contract.ts`).
//!
//! Port of `web-game/packages/mock-server`: [`GameSession`] is `MockServer` (fixed-step clock,
//! command log, save/load/replay, the UI's queries), [`GalaxySim`] the simulated players and
//! market, [`Host`] the `ServerHost` that turns requests into replies and pushes (snapshot ~10 Hz,
//! events, frame). The same code runs in the browser worker (`game-wasm`, plan 02 B3) and in the
//! network server (`game-server`, B4), so both behave like the TypeScript mock.
//!
//! No I/O and no clock of its own: the caller passes the time (`now_ms`) and a step timer.

#![forbid(unsafe_code)]

pub mod contract;
pub mod galaxy;
pub mod host;
pub mod session;
pub mod sync;

pub use contract::*;
pub use galaxy::*;
pub use host::*;
pub use session::*;
pub use sync::*;
