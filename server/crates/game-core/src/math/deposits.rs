//! Deterministic deposits on a grid (`deposit-generator.ts`).

use std::collections::HashMap;

use indexmap::IndexMap;

use super::noise::hash3;
use crate::models::grid::Deposit;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DepositOptions {
    /// Chance that a tile seeds a cluster.
    pub seed_chance: f64,
    /// Chance that each neighbour of a seed tile joins the cluster.
    pub spread_chance: f64,
}

pub const DEFAULT_DEPOSIT_OPTIONS: DepositOptions = DepositOptions { seed_chance: 0.035, spread_chance: 0.5 };

/// The PoC's three resources, equally likely, in the PoC order (keeps PoC deposits identical).
pub fn poc_deposit_weights() -> IndexMap<String, f64> {
    IndexMap::from([("FER".to_string(), 1.0), ("KRI".to_string(), 1.0), ("SIL".to_string(), 1.0)])
}

/// Deterministic deposits: a few seed tiles, each spreading to some of its neighbours with the same
/// material. Roughly 10–15% of tiles end up with a deposit. Pure function of (seed, grid, weights).
pub fn generate_deposits(
    neighbors: &[Vec<usize>],
    seed: f64,
    opts: DepositOptions,
    weights: &IndexMap<String, f64>,
) -> HashMap<usize, Deposit> {
    let mut out: HashMap<usize, Deposit> = HashMap::new();
    let pick = picker(weights);
    for (i, nbs) in neighbors.iter().enumerate() {
        let fi = i as f64;
        if hash3(seed, fi, 0.0, 0.0) >= opts.seed_chance {
            continue;
        }
        let resource = pick(hash3(seed, fi, 1.0, 0.0));
        out.entry(i)
            .or_insert_with(|| Deposit { resource: resource.clone(), amount: 200.0 + js_round(hash3(seed, fi, 2.0, 0.0) * 30.0) * 10.0 });
        for &nb in nbs {
            if out.contains_key(&nb) {
                continue;
            }
            if hash3(seed, nb as f64, 3.0, fi) < opts.spread_chance {
                out.insert(
                    nb,
                    Deposit { resource: resource.clone(), amount: 100.0 + js_round(hash3(seed, nb as f64, 4.0, fi) * 20.0) * 10.0 },
                );
            }
        }
    }
    out
}

#[inline]
fn js_round(x: f64) -> f64 {
    super::js::round(x)
}

/// Maps h ∈ [0,1) to a material by cumulative weight; equal weights reduce to the PoC's floor(h·n).
fn picker(weights: &IndexMap<String, f64>) -> Box<dyn Fn(f64) -> String + '_> {
    let entries: Vec<(&String, f64)> = weights.iter().filter(|(_, w)| **w > 0.0).map(|(k, w)| (k, *w)).collect();
    assert!(!entries.is_empty(), "deposit weights are empty");
    let first = entries[0].1;
    let equal = entries.iter().all(|&(_, w)| w == first);
    if equal {
        let len = entries.len();
        return Box::new(move |h: f64| {
            let idx = ((h * len as f64).floor() as usize).min(len - 1);
            entries[idx].0.clone()
        });
    }
    let total: f64 = entries.iter().fold(0.0, |s, &(_, w)| s + w);
    Box::new(move |h: f64| {
        let mut acc = 0.0;
        for &(code, w) in &entries {
            acc += w / total;
            if h < acc {
                return code.clone();
            }
        }
        entries[entries.len() - 1].0.clone()
    })
}
