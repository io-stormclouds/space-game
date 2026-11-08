//! JavaScript number semantics that leak into game results. Reproduced bit for bit where the
//! operation is built from IEEE basic operations, so TS and Rust agree exactly.

/// `Math.hypot(...)` as V8 computes it: normalise by the largest magnitude, Kahan-sum the squares,
/// `sqrt(sum) * max`. Plain `sqrt(a² + b² + c²)` differs in the last bit.
pub fn hypot(values: &[f64]) -> f64 {
    let mut max = 0.0_f64;
    let mut any_nan = false;
    for &v in values {
        if v.is_nan() {
            any_nan = true;
        } else {
            let a = v.abs();
            if a > max {
                max = a;
            }
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if any_nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0_f64;
    let mut compensation = 0.0_f64;
    for &v in values {
        let n = v.abs() / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

#[inline]
pub fn hypot2(a: f64, b: f64) -> f64 {
    hypot(&[a, b])
}

#[inline]
pub fn hypot3(a: f64, b: f64, c: f64) -> f64 {
    hypot(&[a, b, c])
}

/// `Math.round`: half rounds towards +∞ (Rust's `round` rounds half away from zero).
#[inline]
pub fn round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// `Number.prototype.toFixed(d)` for the magnitudes that occur in the game, as a string.
/// Negative zero prints without a sign, like JavaScript.
pub fn to_fixed(x: f64, digits: usize) -> String {
    let x = if x == 0.0 { 0.0 } else { x };
    if digits == 0 {
        // ties go to the larger integer in JS; `(x + 0.5).floor()` does the same for x ≥ 0 and
        // for negative x picks the larger of the two candidates as well.
        let n = (x + 0.5).floor();
        let n = if n == 0.0 { 0.0 } else { n };
        return format!("{n}");
    }
    format!("{x:.digits$}")
}

/// `+x.toFixed(d)`: round to `d` decimals through the decimal string, as the TS model does.
pub fn to_fixed_number(x: f64, digits: usize) -> f64 {
    to_fixed(x, digits).parse().unwrap_or(x)
}

/// `Number.prototype.toString()` for finite numbers in the ranges the game formats (no exponent):
/// Rust's `Display` prints the shortest round-trip representation as well.
pub fn number_to_string(x: f64) -> String {
    let x = if x == 0.0 { 0.0 } else { x };
    format!("{x}")
}

/// `Math.imul`: 32-bit integer multiplication with wrap-around.
#[inline]
pub fn imul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// `x | 0`: ToInt32 of a double.
#[inline]
pub fn to_int32(x: f64) -> i32 {
    if !x.is_finite() {
        return 0;
    }
    let t = x.trunc();
    // modulo 2^32 into the i32 range
    let m = t.rem_euclid(4294967296.0);
    let u = m as u32;
    u as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hypot_matches_plain_cases() {
        assert_eq!(hypot3(3.0, 4.0, 0.0), 5.0);
        assert_eq!(hypot(&[0.0, 0.0]), 0.0);
        assert!((hypot3(1.0, 1.0, 1.0) - 3.0_f64.sqrt()).abs() < 1e-15);
    }

    #[test]
    fn to_fixed_behaves_like_js() {
        assert_eq!(to_fixed(0.5, 0), "1");
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(-0.0, 6), "0.000000");
        assert_eq!(to_fixed(1.0 / 3.0, 6), "0.333333");
        assert_eq!(to_fixed_number(12.0 * 0.9, 2), 10.8);
        assert_eq!(number_to_string(3.0), "3");
        assert_eq!(number_to_string(2.5), "2.5");
    }

    #[test]
    fn int32_wraps() {
        assert_eq!(to_int32(4294967297.0), 1);
        assert_eq!(to_int32(-1.0), -1);
        assert_eq!(to_int32(2147483648.0), i32::MIN);
        assert_eq!(imul(0x7fff_ffff, 2), -2);
    }
}
