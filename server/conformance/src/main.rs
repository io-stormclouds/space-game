//! ```text
//! conformance replay <dir>     every <dir>/<name>/{save.json, expected.json}: replay and compare
//! conformance vectors <file>   numeric vectors (grids, orbits, economy…) recorded from TS
//! conformance bench <scenario> <steps> [dt_minutes]   time per step of a scenario (default dt = 1)
//! ```
//! Exit code 1 when anything differs.

use std::path::PathBuf;
use std::process::ExitCode;

use conformance::{bench, replay, vectors};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let ok = match args.as_slice() {
        [cmd, path] if cmd == "replay" => replay::run_dir(&PathBuf::from(path)),
        [cmd, path] if cmd == "vectors" => vectors::run(&PathBuf::from(path)),
        [cmd, scenario, steps] if cmd == "bench" => bench::run(scenario, steps.parse().unwrap_or(1000), 1.0),
        [cmd, scenario, steps, dt] if cmd == "bench" => bench::run(scenario, steps.parse().unwrap_or(1000), dt.parse().unwrap_or(1.0)),
        _ => {
            eprintln!("usage: conformance replay <dir> | conformance vectors <file.json> | conformance bench <scenario> <steps> [dt]");
            false
        }
    };
    if ok { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}
