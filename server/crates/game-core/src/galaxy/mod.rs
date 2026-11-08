//! The galaxy register (`galaxy/stars.ts`): the 41 stars of the galaxy PoC with positions made
//! consistent with their distances (W10 A). Simulated players and the market (`galaxy-sim.ts`) stay
//! on the server side as test data (plan 02 §5.2, B3).

pub mod stars;

pub use stars::*;
