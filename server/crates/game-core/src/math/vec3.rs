//! Lightweight vector type (`vec3.ts`). Lengths use the JavaScript `Math.hypot` algorithm so
//! fuel costs and flight times agree with the TypeScript domain to the last bit.

use serde::{Deserialize, Serialize};

use super::js;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[inline]
pub const fn vec3(x: f64, y: f64, z: f64) -> Vec3 {
    Vec3 { x, y, z }
}

impl std::ops::Add for Vec3 {
    type Output = Vec3;
    #[inline]
    fn add(self, b: Vec3) -> Vec3 {
        vec3(self.x + b.x, self.y + b.y, self.z + b.z)
    }
}

impl std::ops::Sub for Vec3 {
    type Output = Vec3;
    #[inline]
    fn sub(self, b: Vec3) -> Vec3 {
        vec3(self.x - b.x, self.y - b.y, self.z - b.z)
    }
}

impl Vec3 {
    pub const ZERO: Vec3 = vec3(0.0, 0.0, 0.0);

    #[inline]
    pub fn scale(self, s: f64) -> Vec3 {
        vec3(self.x * s, self.y * s, self.z * s)
    }

    #[inline]
    pub fn dot(self, b: Vec3) -> f64 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }

    /// `Math.hypot(x, y, z)`
    #[inline]
    pub fn length(self) -> f64 {
        js::hypot3(self.x, self.y, self.z)
    }

    #[inline]
    pub fn distance(self, b: Vec3) -> f64 {
        js::hypot3(self.x - b.x, self.y - b.y, self.z - b.z)
    }

    /// `l > 1e-12 ? a × (1 / l) : (0, 0, 1)` — multiplication by the reciprocal, as in TS.
    #[inline]
    pub fn normalize(self) -> Vec3 {
        let l = self.length();
        if l > 1e-12 { self.scale(1.0 / l) } else { vec3(0.0, 0.0, 1.0) }
    }

    #[inline]
    pub fn lerp(self, b: Vec3, t: f64) -> Vec3 {
        vec3(self.x + (b.x - self.x) * t, self.y + (b.y - self.y) * t, self.z + (b.z - self.z) * t)
    }

    /// Serialised shape `[x, y, z]` used by the conformance vectors.
    pub fn to_array(self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }

    pub fn from_array(a: [f64; 3]) -> Vec3 {
        vec3(a[0], a[1], a[2])
    }
}

/// `Math.hypot(a.x - b.x, …)` in the order `distance(a, b)` uses it.
#[inline]
pub fn distance(a: Vec3, b: Vec3) -> f64 {
    a.distance(b)
}

#[inline]
pub fn length(a: Vec3) -> f64 {
    a.length()
}
