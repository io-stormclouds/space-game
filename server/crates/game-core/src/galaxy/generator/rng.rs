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

const GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

/// 2^53: the number of values `next_f64` can return.
const TWO_POW_53: f64 = 9_007_199_254_740_992.0;

// The SplitMix64 finaliser.
fn mix(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

// Folds one part of the key into the hash.
fn absorb(h: u64, v: u64) -> u64 {
    mix((h ^ v).wrapping_add(GAMMA))
}

// A cell coordinate as u32 (two's complement), widened to u64: no sign extension.
fn coord(v: i32) -> u64 {
    u64::from(v as u32)
}

/// One stream of numbers: a pure function of (seed, cell, stream). How streams are assigned to stars
/// and systems is up to the generator; two purposes must never share a stream.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// The stream `stream` of `cell` in the galaxy `seed`.
    pub fn for_cell(seed: u64, cell: CellCoord, stream: u64) -> Rng {
        let h = absorb(seed, coord(cell.x));
        let h = absorb(h, coord(cell.y));
        let h = absorb(h, coord(cell.z));
        Rng { state: absorb(h, stream) }
    }

    /// The next 64 bits.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(GAMMA);
        mix(self.state)
    }

    /// Uniform in [0, 1), from the top 53 bits of `next_u64`.
    pub fn next_f64(&mut self) -> f64 {
        // at most 53 significant bits, so the conversion and the division by a power of two are exact
        (self.next_u64() >> 11) as f64 / TWO_POW_53
    }
}
