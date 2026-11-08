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
