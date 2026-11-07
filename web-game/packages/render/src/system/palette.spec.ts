import { color as tokens } from '@space-game/hud-design-system/core';
import {
  ATLAS_TONES,
  DEPOSIT_TINTS,
  DS,
  MODEL_TONES,
  NEUTRAL_DEPOSIT,
  SCENE,
  atlasCell,
  atlasShade,
  atlasTone,
  cssHex,
  depositTint,
  hexToRgb,
  mixHex,
  muteBodyColor,
  muteStarColor,
  rgbToHex,
  saturation,
} from './palette';

const hex = (css: string) => parseInt(css.slice(1), 16);

describe('scene palette (W14 C: limited palette, DS tokens)', () => {
  it('uses the design-system tokens verbatim', () => {
    for (const key of ['void', 'hull', 'graphite', 'graphiteHi', 'metal', 'text', 'textDim', 'textFaint', 'signal', 'alert'] as const) {
      expect(cssHex(DS[key]), key).toBe(tokens[key].toLowerCase());
    }
    expect(SCENE.background).toBe(hex(tokens.void));
  });

  it('keeps signal for selection / valid placement and alert for invalid only', () => {
    const signalRoles = Object.entries(SCENE).filter(([, v]) => v === DS.signal).map(([k]) => k).sort();
    expect(signalRoles).toEqual(['flightPathSelected', 'placementValid', 'selection']);
    const alertRoles = Object.entries(SCENE).filter(([, v]) => v === DS.alert).map(([k]) => k);
    expect(alertRoles).toEqual(['placementInvalid']);
  });

  it('tints deposits by material code: distinct, muted, never signal or alert; unknown codes neutral', () => {
    const values = Object.values(DEPOSIT_TINTS);
    expect(new Set(values).size).toBe(values.length);
    for (const [code, v] of Object.entries(DEPOSIT_TINTS)) {
      expect(v, code).not.toBe(DS.signal);
      expect(v, code).not.toBe(DS.alert);
      expect(saturation(v), code).toBeLessThan(0.3);
    }
    for (const code of ['FER', 'SIL', 'KRI', 'KAR', 'KUP', 'TYT', 'URA', 'PLA']) expect(depositTint(code), code).toBe(DEPOSIT_TINTS[code]);
    expect(depositTint('XYZ')).toBe(NEUTRAL_DEPOSIT);
    expect(depositTint('REG')).toBe(NEUTRAL_DEPOSIT);
    expect(depositTint(undefined)).toBe(NEUTRAL_DEPOSIT);
  });

  it('mutes body colours: less saturated, deterministic, still distinct', () => {
    const tauCetiE = 0x4f7a5a;
    const pocPlanet = 0x3b82f6;
    for (const c of [tauCetiE, pocPlanet, 0xb0724a]) expect(saturation(muteBodyColor(c))).toBeLessThan(saturation(c));
    expect(muteBodyColor(pocPlanet)).toBe(muteBodyColor(pocPlanet));
    expect(muteBodyColor(tauCetiE)).not.toBe(muteBodyColor(pocPlanet));
    expect(saturation(muteStarColor(0xffdd90))).toBeLessThan(saturation(0xffdd90));
  });

  it('colour math round-trips', () => {
    expect(rgbToHex(hexToRgb(0x123456))).toBe(0x123456);
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(saturation(0x808080)).toBe(0);
    expect(cssHex(0x0b0c10)).toBe('#0b0c10');
  });

  it('maps the KayKit atlas (8 × 4 swatches) to model tones only, wrapping uv', () => {
    expect(ATLAS_TONES).toHaveLength(32);
    const tones = new Set<number>(Object.values(MODEL_TONES));
    for (const t of ATLAS_TONES) expect(tones.has(t)).toBe(true);
    expect(atlasCell(0, 0)).toBe(0);
    expect(atlasCell(0.99, 0.99)).toBe(31);
    expect(atlasCell(1.0625, 0)).toBe(0); // wraps
    expect(atlasCell(0.2, 0.3)).toBe(9); // col 1, row 1
    expect(atlasTone(0.15, 0.05)).toBe(MODEL_TONES.light); // white swatch
    expect(atlasTone(0.8, 0.9)).toBe(MODEL_TONES.cool); // solar cells
    // shade keeps the swatch gradient: lighter at the top of a cell
    expect(atlasShade(0.0)).toBeGreaterThan(atlasShade(0.24));
    expect(atlasShade(0.26)).toBeGreaterThan(atlasShade(0.49));
    for (const v of [0, 0.1, 0.3, 0.7, 0.999]) {
      expect(atlasShade(v)).toBeGreaterThanOrEqual(0.8);
      expect(atlasShade(v)).toBeLessThanOrEqual(1.15);
    }
  });
});
