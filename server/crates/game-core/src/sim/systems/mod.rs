//! Game systems (`sim/systems/*.ts`). Each one reads the world and returns domain events; the
//! reducer applies them. Systems that need continuous state between steps (drives, flights,
//! accumulators) keep it in their own struct, exactly like the TypeScript classes.

pub mod atanor;
pub mod build;
pub mod colony;
pub mod construction;
pub mod docking;
pub mod extraction;
pub mod hub;
pub mod mining;
pub mod production;
pub mod rover;
pub mod transfer;

pub use atanor::AtanorSystem;
pub use extraction::ExtractionSystem;
pub use mining::MiningSystem;
pub use rover::{DriveState, RoverSystem};
pub use transfer::TransferSystem;
