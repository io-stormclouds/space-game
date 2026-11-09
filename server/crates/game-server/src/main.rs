//! `game-server`: see the crate docs and `server/README.md` (configuration by environment).

#[tokio::main]
async fn main() -> std::io::Result<()> {
    game_server::serve(game_server::Config::from_env()).await
}
