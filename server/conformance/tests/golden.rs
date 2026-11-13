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

/// E1-09: the galaxy generator gives the bytes recorded natively (the same file is checked on
/// `wasm32` by `web-game/packages/wasm-host/src/galaxy-gen.spec.ts`).
#[test]
fn galaxy_generator_matches_its_recorded_vectors() {
    assert!(
        conformance::galaxy::run(&root().join("vectors/galaxy-gen.json")),
        "the galaxy generator differs from vectors/galaxy-gen.json; see the report above"
    );
}
