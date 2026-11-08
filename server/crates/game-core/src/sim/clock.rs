//! Game clock in model minutes (`systems/game-clock.ts`).

/// Real seconds per model minute at tempo ×1 (Z6: the model's time unit is one minute).
pub const SECONDS_PER_MODEL_MINUTE: f64 = 60.0;

/// Tempo at which the game runs like the 3D PoC (one model minute per real second).
pub const POC_TEMPO: f64 = 60.0;

/// Pausing or changing tempo never desynchronises anything.
#[derive(Clone, Debug)]
pub struct GameClock {
    time: f64,
    /// Upper bound on one real frame [s], against the spiral of death.
    time_clamp: f64,
}

impl GameClock {
    pub fn new(time_clamp: f64) -> GameClock {
        GameClock { time: 0.0, time_clamp }
    }

    pub fn time(&self) -> f64 {
        self.time
    }

    /// Advances by min(realDelta, clamp) × tempo / 60 and returns that delta in model minutes.
    pub fn advance(&mut self, real_delta_sec: f64, tempo: f64) -> f64 {
        let dt = (real_delta_sec.max(0.0).min(self.time_clamp) * tempo) / SECONDS_PER_MODEL_MINUTE;
        self.time += dt;
        dt
    }

    pub fn reset(&mut self, t: f64) {
        self.time = t;
    }
}
