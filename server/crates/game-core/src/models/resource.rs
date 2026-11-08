//! Amounts of materials by catalog code (`resource.model.ts`). Insertion order is kept, like a
//! JavaScript object, because it shows in texts ("brakuje FER 10 · SIL 10") and in float sums.

use indexmap::IndexMap;

use crate::math::js;

/// A missing code means 0.
pub type Qty = IndexMap<String, f64>;
pub type Stockpile = Qty;
pub type Cost = Qty;

pub fn empty_stockpile() -> Stockpile {
    Qty::new()
}

pub fn qty<const N: usize>(entries: [(&str, f64); N]) -> Qty {
    entries.iter().map(|(k, v)| (k.to_string(), *v)).collect()
}

pub fn amount_of(s: &Stockpile, code: &str) -> f64 {
    s.get(code).copied().unwrap_or(0.0)
}

/// `out[code] = (out[code] ?? 0) + q × k`
pub fn add_stock(a: &Stockpile, b: &Cost, k: f64) -> Stockpile {
    let mut out = a.clone();
    for (code, q) in b {
        let cur = out.get(code).copied().unwrap_or(0.0);
        out.insert(code.clone(), cur + q * k);
    }
    out
}

/// Subtracts, clamping at zero (a missing code becomes an explicit 0, as in TS).
pub fn subtract_stock(a: &Stockpile, b: &Cost) -> Stockpile {
    let mut out = a.clone();
    for (code, q) in b {
        let cur = out.get(code).copied().unwrap_or(0.0);
        out.insert(code.clone(), (cur - q).max(0.0));
    }
    out
}

pub fn can_afford(a: &Stockpile, cost: &Cost) -> bool {
    cost.iter().all(|(code, q)| amount_of(a, code) >= *q)
}

/// What is short, per code; empty when affordable.
pub fn missing_for(a: &Stockpile, cost: &Cost) -> Cost {
    let mut out = Qty::new();
    for (code, q) in cost {
        let need = q - amount_of(a, code);
        if need > 0.0 {
            out.insert(code.clone(), need);
        }
    }
    out
}

pub fn stock_total(a: &Cost) -> f64 {
    a.values().fold(0.0, |s, q| s + q)
}

pub fn is_empty_stock(a: &Cost) -> bool {
    stock_total(a) <= 0.0
}

/// Multiplies every amount, rounding down to whole units (refunds).
pub fn scale_stock(a: &Cost, k: f64) -> Stockpile {
    let mut out = Qty::new();
    for (code, q) in a {
        let v = (q * k).floor();
        if v > 0.0 {
            out.insert(code.clone(), v);
        }
    }
    out
}

/// "FER 20 · SIL 10", the canvas style of costs and shortfalls.
pub fn format_cost(cost: &Cost) -> String {
    let parts: Vec<String> =
        cost.iter().filter(|(_, q)| **q > 0.0).map(|(code, q)| format!("{code} {}", js::number_to_string(q.ceil()))).collect();
    if parts.is_empty() { "—".to_string() } else { parts.join(" · ") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stock_ops_match_ts() {
        let a = qty([("FER", 40.0), ("KRI", 10.0)]);
        let b = qty([("FER", 15.0), ("SIL", 5.0)]);
        let sub = subtract_stock(&a, &b);
        assert_eq!(sub.get("FER"), Some(&25.0));
        assert_eq!(sub.get("SIL"), Some(&0.0)); // explicit zero like `Math.max(0, undefined ?? 0 - q)`
        assert_eq!(format_cost(&missing_for(&qty([("FER", 10.0)]), &qty([("FER", 20.0), ("SIL", 10.0)]))), "FER 10 · SIL 10");
        assert_eq!(format_cost(&Qty::new()), "—");
        assert_eq!(scale_stock(&qty([("FER", 15.0), ("KRI", 1.0)]), 0.75), qty([("FER", 11.0)]));
    }
}
