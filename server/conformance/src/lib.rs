//! Conformance of `game-core` with the TypeScript domain (plan 02 §5): golden replays and numeric
//! vectors recorded by `web-game/tools/conformance/*.ts`, replayed here and compared. Also the
//! galaxy generator's vectors (`galaxy`, task E1-09): recorded natively, compared natively and on `wasm32`.
//!
//! The binary (`conformance replay <dir>`, `conformance vectors <file>`, `conformance galaxy <file>`)
//! prints a report; the integration tests in `tests/` run the same checks under `cargo test`.

pub mod bench;
pub mod compare;
pub mod galaxy;
pub mod replay;
pub mod vectors;
