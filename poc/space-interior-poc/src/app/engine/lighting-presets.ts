/**
 * Lighting presets: plain data (no Three.js), so the state layer can read the reference values
 * the night tuning panel compares against.
 */

export type Lighting = 'day' | 'night';

/**
 * Point lights shared by all fixtures. The pool is fixed so that editing never recompiles shaders;
 * only changing how many are on (`lights`) does, once.
 */
export const LIGHT_POOL_MAX = 32;

/** Everything that differs between day and night. Night tuning (and `tune()` in the dev console) patches it. */
export interface LightingPreset {
  readonly background: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemi: number;
  readonly sun: number;
  readonly env: number;
  readonly exposure: number;
  /** Emissive / holo material strength. */
  readonly emissive: number;
  readonly holo: number;
  readonly bloom: boolean;
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  readonly bloomThreshold: number;
  /** Multiplier on catalog light intensities; 0 = fixture lights off. */
  readonly fixtures: number;
  /** Multiplier on catalog light reach. */
  readonly reach: number;
  /** Point lights in use (≤ LIGHT_POOL_MAX), given to the fixtures that matter most for the view. */
  readonly lights: number;
}

/**
 * Night is matched against the kit's "Layout Example Dark" render: dark teal background, a cool
 * teal ambient that keeps every wall readable in its own colour, light coming from the fixtures
 * and screens in their own colour, and only a faint glow around the brightest emitters.
 */
export const LIGHTING_PRESETS: Readonly<Record<Lighting, LightingPreset>> = {
  day: {
    background: 0x0b0c10,
    hemiSky: 0xdfe8ff,
    hemiGround: 0x1d232b,
    hemi: 1.15,
    sun: 1.5,
    env: 0.55,
    exposure: 1.05,
    emissive: 1.4,
    holo: 1.2,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    fixtures: 0,
    reach: 1,
    lights: 20,
  },
  night: {
    // ACES tone mapping also applies to the background in the bloom path and shifts dark colours
    // towards cyan, so this is set brighter/greyer than the target: it renders as rgb(11, 21, 23),
    // the reference is rgb(10, 21, 22).
    background: 0x1c2729,
    hemiSky: 0x5d9cc0,
    hemiGround: 0x0e1418,
    // Almost no fill: in the reference nearly all light comes from fixtures and screens.
    hemi: 0.05,
    sun: 0,
    env: 0.02,
    exposure: 1,
    emissive: 1.9,
    holo: 1.7,
    bloom: true,
    // Only real HDR emitters bloom (threshold above 1), with a tight radius: no haze over the deck.
    bloomStrength: 0.32,
    bloomRadius: 0.18,
    bloomThreshold: 1.05,
    fixtures: 1.15,
    reach: 1,
    lights: 20,
  },
};
