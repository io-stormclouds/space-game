//! `cargo test -p conformance`: the recorded vectors and replays must match game-core.

use std::path::Path;

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn numeric_vectors_match_the_typescript_domain() {
    assert!(conformance::vectors::run(&root().join("vectors/vectors.json")), "vectors differ; see the report above");
}

#[test]
fn golden_replays_match_the_typescript_mock() {
    assert!(conformance::replay::run_dir(&root().join("replays")), "replays differ; see the report above");
}

/// Plan 08 E1-09: the galaxy generator gives the text recorded in `vectors/galaxy-gen.json`, byte for
/// byte (50 cells, 200 systems). The same file is the expectation of the `wasm32` build
/// (`web-game/packages/wasm-host/src/galaxy-gen.spec.ts`).
#[test]
fn galaxy_generator_matches_its_recorded_vectors() {
    assert!(conformance::galaxy::run(&root().join("vectors/galaxy-gen.json")), "galaxy vectors differ; see the report above");
}
