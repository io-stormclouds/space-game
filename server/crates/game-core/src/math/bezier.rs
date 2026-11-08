//! Quadratic Bézier curve P0 → P1 → P2 (`bezier-path.ts`).

use super::vec3::{Vec3, vec3};

#[derive(Clone, Debug, PartialEq)]
pub struct BezierPath {
    pub p0: Vec3,
    pub p1: Vec3,
    pub p2: Vec3,
}

impl BezierPath {
    pub fn new(p0: Vec3, p1: Vec3, p2: Vec3) -> BezierPath {
        BezierPath { p0, p1, p2 }
    }

    /// Curve whose control point is the midpoint lifted along +Y by liftFactor × |P2−P0|.
    pub fn arc(p0: Vec3, p2: Vec3, lift_factor: f64) -> BezierPath {
        let d = p0.distance(p2);
        let p1 = vec3((p0.x + p2.x) / 2.0, (p0.y + p2.y) / 2.0 + d * lift_factor, (p0.z + p2.z) / 2.0);
        BezierPath { p0, p1, p2 }
    }

    pub fn set_end(&mut self, p2: Vec3) {
        self.p2 = p2;
    }

    /// Moves the control point so it stays the lifted midpoint of the current P0/P2.
    pub fn relift(&mut self, lift_factor: f64) {
        let d = self.p0.distance(self.p2);
        self.p1 = vec3((self.p0.x + self.p2.x) / 2.0, (self.p0.y + self.p2.y) / 2.0 + d * lift_factor, (self.p0.z + self.p2.z) / 2.0);
    }

    pub fn point_at(&self, u: f64) -> Vec3 {
        let s = 1.0 - u;
        let a = s * s;
        let b = 2.0 * s * u;
        let c = u * u;
        vec3(
            a * self.p0.x + b * self.p1.x + c * self.p2.x,
            a * self.p0.y + b * self.p1.y + c * self.p2.y,
            a * self.p0.z + b * self.p1.z + c * self.p2.z,
        )
    }

    /// Unit tangent dP/du.
    pub fn tangent_at(&self, u: f64) -> Vec3 {
        let s = 1.0 - u;
        vec3(
            2.0 * s * (self.p1.x - self.p0.x) + 2.0 * u * (self.p2.x - self.p1.x),
            2.0 * s * (self.p1.y - self.p0.y) + 2.0 * u * (self.p2.y - self.p1.y),
            2.0 * s * (self.p1.z - self.p0.z) + 2.0 * u * (self.p2.z - self.p1.z),
        )
        .normalize()
    }

    /// Polyline approximation of the arc length.
    pub fn approx_length(&self, segments: usize) -> f64 {
        let mut len = 0.0;
        let mut a = self.point_at(0.0);
        for i in 1..=segments {
            let b = self.point_at(i as f64 / segments as f64);
            len += a.distance(b);
            a = b;
        }
        len
    }

    /// `n` evenly spaced (in u) samples.
    pub fn sample(&self, n: usize) -> Vec<Vec3> {
        (0..n).map(|i| self.point_at(if n == 1 { 0.0 } else { i as f64 / (n - 1) as f64 })).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_and_lift() {
        let p = BezierPath::arc(vec3(0.0, 0.0, 0.0), vec3(100.0, 0.0, 0.0), 0.2);
        assert_eq!(p.point_at(0.0), vec3(0.0, 0.0, 0.0));
        assert_eq!(p.point_at(1.0), vec3(100.0, 0.0, 0.0));
        assert_eq!(p.p1, vec3(50.0, 20.0, 0.0));
        assert!((p.point_at(0.5).y - 10.0).abs() < 1e-9);
    }

    #[test]
    fn lengths_and_tangents() {
        let straight = BezierPath::new(vec3(0.0, 0.0, 0.0), vec3(50.0, 0.0, 0.0), vec3(100.0, 0.0, 0.0));
        assert!((straight.approx_length(64) - 100.0).abs() < 1e-6);
        let arc = BezierPath::arc(vec3(0.0, 0.0, 0.0), vec3(100.0, 0.0, 0.0), 0.2);
        let l = arc.approx_length(64);
        assert!(l > 100.0 && l < 110.0);
        let t0 = arc.tangent_at(0.0);
        assert!((t0.length() - 1.0).abs() < 1e-9);
        assert!(t0.x > 0.0 && t0.y > 0.0);
        assert!(arc.tangent_at(1.0).y < 0.0);
    }

    #[test]
    fn set_end_and_relift() {
        let mut p = BezierPath::arc(vec3(0.0, 0.0, 0.0), vec3(100.0, 0.0, 0.0), 0.2);
        p.set_end(vec3(0.0, 0.0, 100.0));
        assert_eq!(p.p2, vec3(0.0, 0.0, 100.0));
        assert_eq!(p.p1, vec3(50.0, 20.0, 0.0));
        p.relift(0.2);
        assert_eq!(p.p1, vec3(0.0, 20.0, 50.0));
    }

    #[test]
    fn samples_evenly() {
        let p = BezierPath::arc(vec3(0.0, 0.0, 0.0), vec3(100.0, 0.0, 0.0), 0.0);
        let out = p.sample(5);
        assert_eq!(out[0], vec3(0.0, 0.0, 0.0));
        assert_eq!(out[4], vec3(100.0, 0.0, 0.0));
        assert!((out[1].distance(out[2]) - 25.0).abs() < 1e-9);
    }
}
