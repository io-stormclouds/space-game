//! Structural comparison of two JSON values with the tolerance rules of plan 02 §2.2 (RR3):
//! integers and everything discrete bit for bit, other numbers within a relative/absolute tolerance.

use serde_json::Value;

#[derive(Clone, Copy, Debug)]
pub struct Tolerance {
    pub abs: f64,
    pub rel: f64,
}

impl Default for Tolerance {
    fn default() -> Self {
        Tolerance { abs: 1e-9, rel: 1e-9 }
    }
}

pub struct Diff {
    pub path: String,
    pub message: String,
}

pub fn compare(expected: &Value, actual: &Value, tol: Tolerance) -> Vec<Diff> {
    let mut out = Vec::new();
    walk("$", expected, actual, tol, &mut out);
    out
}

fn walk(path: &str, e: &Value, a: &Value, tol: Tolerance, out: &mut Vec<Diff>) {
    match (e, a) {
        (Value::Object(eo), Value::Object(ao)) => {
            for (k, ev) in eo {
                match ao.get(k) {
                    Some(av) => walk(&format!("{path}.{k}"), ev, av, tol, out),
                    None => out.push(Diff { path: format!("{path}.{k}"), message: format!("missing in Rust; TS has {}", short(ev)) }),
                }
            }
            for k in ao.keys() {
                if !eo.contains_key(k) {
                    out.push(Diff { path: format!("{path}.{k}"), message: format!("extra in Rust: {}", short(&ao[k])) });
                }
            }
        }
        (Value::Array(ea), Value::Array(aa)) => {
            if ea.len() != aa.len() {
                out.push(Diff { path: path.to_string(), message: format!("array length TS {} vs Rust {}", ea.len(), aa.len()) });
            }
            for (i, (ev, av)) in ea.iter().zip(aa.iter()).enumerate() {
                walk(&format!("{path}[{i}]"), ev, av, tol, out);
            }
        }
        (Value::Number(en), Value::Number(an)) => {
            let (x, y) = (en.as_f64().unwrap_or(f64::NAN), an.as_f64().unwrap_or(f64::NAN));
            let both_int = x.fract() == 0.0 && y.fract() == 0.0;
            let ok = if both_int { x == y } else { (x - y).abs() <= tol.abs + tol.rel * x.abs().max(y.abs()) };
            if !ok {
                out.push(Diff { path: path.to_string(), message: format!("TS {x} vs Rust {y}") });
            }
        }
        _ => {
            if e != a {
                out.push(Diff { path: path.to_string(), message: format!("TS {} vs Rust {}", short(e), short(a)) });
            }
        }
    }
}

fn short(v: &Value) -> String {
    let s = v.to_string();
    if s.len() > 80 { format!("{}…", &s[..80]) } else { s }
}

pub fn report(name: &str, diffs: &[Diff], max: usize) -> bool {
    if diffs.is_empty() {
        println!("OK   {name}");
        return true;
    }
    println!("FAIL {name}: {} difference(s)", diffs.len());
    for d in diffs.iter().take(max) {
        println!("     {}: {}", d.path, d.message);
    }
    if diffs.len() > max {
        println!("     … {} more", diffs.len() - max);
    }
    false
}
