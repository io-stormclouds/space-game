//! Space Game domain in Rust: a port of `web-game/packages/domain` (TypeScript).
//!
//! Rules of the port (plan `docs/plan/02-BACKEND-RUST.md` §5):
//! - the same data model, serialised to the same JSON (camelCase, optional fields omitted);
//! - the same order of operations, so that a replay of the same commands in the same steps gives the
//!   same world; JavaScript number semantics are reproduced where they leak into results
//!   (`Math.hypot`, `toFixed`, key order of objects);
//! - no I/O, no async, no randomness: everything is a pure function of the inputs.
//!
//! Module layout follows the TypeScript sources so a reader can hold both side by side.

#![forbid(unsafe_code)]

pub mod atanor;
pub mod economy;
pub mod galaxy;
pub mod ids;
pub mod math;
pub mod models;
pub mod sim;

pub use ids::*;
pub use models::*;
pub use sim::*;
