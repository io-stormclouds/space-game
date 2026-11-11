//! Keyed random numbers of the generator (task E1-03).
//!
//! CONTRACT, the same for every implementation. The acceptance test `rng_matches_recorded_values`
//! holds numbers computed from this description by an independent program.
//!
//! ```text
//! GAMMA        = 0x9E37_79B9_7F4A_7C15
//! mix(z)       : z = (z ^ (z >> 30)) * 0xBF58_476D_1CE4_E5B9
//!                z = (z ^ (z >> 27)) * 0x94D0_49BB_1331_11EB
//!                z ^ (z >> 31)                                   (the SplitMix64 finaliser)
//! absorb(h, v) = mix((h ^ v) + GAMMA)
//! state(key)   = absorb(absorb(absorb(absorb(seed, x), y), z), stream)
//!                x, y, z: the cell coordinates as u32 (two's complement), widened to u64
//! next_u64     : state = state + GAMMA; the result is mix(state)  (SplitMix64)
//! next_f64     : (next_u64() >> 11) / 2^53                        (uniform in [0, 1))
//! ```
//!
//! All arithmetic is on `u64` and wraps. There is no other state: no globals, no caches, no clock.

use super::CellCoord;

/// One stream of numbers: a pure function of (seed, cell, stream). How streams are assigned to stars
/// and systems is up to the generator; two purposes must never share a stream.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// The stream `stream` of `cell` in the galaxy `seed`.
    #[expect(unused_variables, reason = "skeleton: E1-03 implements it")]
    pub fn for_cell(seed: u64, cell: CellCoord, stream: u64) -> Rng {
        unimplemented!("E1-03")
    }

    /// The next 64 bits.
    pub fn next_u64(&mut self) -> u64 {
        unimplemented!("E1-03")
    }

    /// Uniform in [0, 1), from the top 53 bits of `next_u64`.
    pub fn next_f64(&mut self) -> f64 {
        unimplemented!("E1-03")
    }
}
