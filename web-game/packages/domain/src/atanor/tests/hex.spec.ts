import { describe, expect, it } from 'vitest';
import {
  hexAdd,
  hexDistance,
  hexEquals,
  hexRotateAround,
  hexRotateCCW,
  hexRotateCW,
  hexSubtract,
  hexToPixel,
  pixelToHex,
} from '../grid/hex';

describe('Hexagonal Grid Math', () => {
  it('should compute distance correctly', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 2 })).toBe(2);
    expect(hexDistance({ q: -1, r: 1 }, { q: 1, r: -1 })).toBe(2);
    expect(hexDistance({ q: -2, r: 1 }, { q: 2, r: -2 })).toBe(4);
  });

  it('should rotate vector 60 degrees clockwise and counter-clockwise around origin', () => {
    const east = { q: 1, r: 0 };
    // CW rotations (6 steps)
    const se = hexRotateCW(east); // dir 1: (0, 1)
    expect(se).toEqual({ q: 0, r: 1 });

    const sw = hexRotateCW(se); // dir 2: (-1, 1)
    expect(sw).toEqual({ q: -1, r: 1 });

    const w = hexRotateCW(sw); // dir 3: (-1, 0)
    expect(w).toEqual({ q: -1, r: 0 });

    const nw = hexRotateCW(w); // dir 4: (0, -1)
    expect(nw).toEqual({ q: 0, r: -1 });

    const ne = hexRotateCW(nw); // dir 5: (1, -1)
    expect(ne).toEqual({ q: 1, r: -1 });

    const backEast = hexRotateCW(ne); // dir 0: (1, 0)
    expect(backEast).toEqual({ q: 1, r: 0 });

    // CCW rotation
    expect(hexRotateCCW(se)).toEqual(east);
  });

  it('should rotate arbitrary point around an arbitrary center', () => {
    const center = { q: 2, r: 3 };
    const pt = { q: 3, r: 3 }; // 1 step East of center

    const rotatedCW = hexRotateAround(pt, center, 1);
    expect(hexDistance(center, rotatedCW)).toBe(1);
    expect(rotatedCW).toEqual({ q: 2, r: 4 }); // 1 step SE of center

    // Full 360 degree rotation (6 steps of 60) should return to initial point
    const fullCircle = hexRotateAround(pt, center, 6);
    expect(fullCircle).toEqual(pt);
  });

  it('should convert hex to pixel and back to hex cleanly', () => {
    const size = 32;
    const origin = { x: 400, y: 300 };
    const hex = { q: 3, r: -2 };

    const px = hexToPixel(hex, size, origin);
    const convertedHex = pixelToHex(px, size, origin);

    expect(convertedHex).toEqual(hex);
  });
});
