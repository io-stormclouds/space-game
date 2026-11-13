//! The streams of [`Rng`](super::Rng) that the generator uses: one purpose, one stream (the rule of
//! `Rng`: two purposes never share a stream).
//!
//! A stream number is the purpose in the high 32 bits and an index within the purpose in the low 32
//! bits, so the purposes can never overlap. Purposes 1 and 2 belong to the stars of a cell (E1-04),
//! purpose 3 to the planetary systems (E1-05); a later purpose takes the next free number.

/// Purpose 1: how many star candidates a cell draws.
pub(super) const STAR_COUNT: u64 = 1 << 32;

/// Purpose 2: star candidate `index` of a cell (position, class, place within the class).
pub(super) fn star_candidate(index: u32) -> u64 {
    (2 << 32) | u64::from(index)
}

/// Purpose 3: the planetary system of the star with `StarKey::index` = `index` (everything
/// `generate_system` draws, task E1-05).
pub(super) fn system(index: u16) -> u64 {
    (3 << 32) | u64::from(index)
}
