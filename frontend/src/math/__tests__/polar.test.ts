import { describe, it, expect } from 'vitest';
import {
  normalizeAngle,
  clamp,
  clampRadius,
  polarToCartesianUnit,
  cartesianUnitToPolar,
  polarToCanvas,
  canvasToPolar,
  circularDistance,
  signedCircularDelta,
  projectPureHue,
} from '../coordinates';
import {
  linear,
  easeInOutCubic,
  interpolateAngle,
  interpolatePolar,
  interpolatePureHue,
} from '../easing';
import {
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  hexToRgb,
  getTargetColorName,
} from '../color_convert';

describe('Polar Coordinates Math', () => {
  describe('normalizeAngle', () => {
    it('normalizes angles within [0, 360)', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(45)).toBe(45);
      expect(normalizeAngle(180)).toBe(180);
      expect(normalizeAngle(359.9)).toBe(359.9);
    });

    it('wraps 360 and multiples of 360 to 0', () => {
      expect(normalizeAngle(360)).toBe(0);
      expect(normalizeAngle(720)).toBe(0);
      expect(normalizeAngle(1080)).toBe(0);
    });

    it('corrects negative angles', () => {
      expect(normalizeAngle(-30)).toBe(330);
      expect(normalizeAngle(-180)).toBe(180);
      expect(normalizeAngle(-360)).toBe(0);
      expect(normalizeAngle(-450)).toBe(270);
    });

    it('handles edge cases safely', () => {
      expect(normalizeAngle(NaN)).toBe(0);
      expect(normalizeAngle(-0)).toBe(0);
    });
  });

  describe('clamp and clampRadius', () => {
    it('clamps numeric values to given range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(NaN, 0, 10)).toBe(0);
    });

    it('clamps radius to [0.0, 1.0]', () => {
      expect(clampRadius(0.5)).toBe(0.5);
      expect(clampRadius(-0.2)).toBe(0.0);
      expect(clampRadius(1.5)).toBe(1.0);
    });
  });

  describe('polarToCartesianUnit and cartesianUnitToPolar', () => {
    it('converts cardinal angles correctly', () => {
      // theta = 0 (+X)
      const p0 = polarToCartesianUnit({ theta: 0, r: 1.0 });
      expect(p0.x).toBeCloseTo(1.0, 4);
      expect(p0.y).toBeCloseTo(0.0, 4);

      // theta = 90 (+Y)
      const p90 = polarToCartesianUnit({ theta: 90, r: 1.0 });
      expect(p90.x).toBeCloseTo(0.0, 4);
      expect(p90.y).toBeCloseTo(1.0, 4);

      // theta = 180 (-X)
      const p180 = polarToCartesianUnit({ theta: 180, r: 1.0 });
      expect(p180.x).toBeCloseTo(-1.0, 4);
      expect(p180.y).toBeCloseTo(0.0, 4);

      // theta = 270 (-Y)
      const p270 = polarToCartesianUnit({ theta: 270, r: 1.0 });
      expect(p270.x).toBeCloseTo(0.0, 4);
      expect(p270.y).toBeCloseTo(-1.0, 4);
    });

    it('converts center correctly', () => {
      const center = polarToCartesianUnit({ theta: 120, r: 0.0 });
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);

      const back = cartesianUnitToPolar({ x: 0, y: 0 });
      expect(back.r).toBe(0);
      expect(back.theta).toBe(0);
    });

    it('performs roundtrip conversion accurately', () => {
      const testCases = [
        { theta: 30, r: 0.8 },
        { theta: 135, r: 0.5 },
        { theta: 225, r: 1.0 },
        { theta: 315, r: 0.25 },
      ];

      for (const tc of testCases) {
        const cart = polarToCartesianUnit(tc);
        const polar = cartesianUnitToPolar(cart);
        expect(polar.theta).toBeCloseTo(tc.theta, 3);
        expect(polar.r).toBeCloseTo(tc.r, 3);
      }
    });
  });

  describe('Canvas mapping', () => {
    const center = { x: 200, y: 200 };
    const maxRadius = 150;

    it('maps polar point to canvas pixels', () => {
      // 0 deg -> right from center
      const pt0 = polarToCanvas({ theta: 0, r: 1.0 }, center, maxRadius);
      expect(pt0.x).toBe(350);
      expect(pt0.y).toBe(200);

      // center
      const ptCenter = polarToCanvas({ theta: 60, r: 0.0 }, center, maxRadius);
      expect(ptCenter.x).toBe(200);
      expect(ptCenter.y).toBe(200);
    });

    it('performs canvas roundtrip mapping accurately', () => {
      const original = { theta: 240, r: 0.7 };
      const canvasPt = polarToCanvas(original, center, maxRadius);
      const recovered = canvasToPolar(canvasPt, center, maxRadius);

      expect(recovered.theta).toBeCloseTo(original.theta, 2);
      expect(recovered.r).toBeCloseTo(original.r, 2);
    });
  });

  describe('circularDistance', () => {
    it('calculates shortest angular distance', () => {
      expect(circularDistance(0, 0)).toBe(0);
      expect(circularDistance(10, 50)).toBe(40);
      expect(circularDistance(50, 10)).toBe(40);
      expect(circularDistance(0, 180)).toBe(180);
      expect(circularDistance(180, 0)).toBe(180);
    });

    it('correctly handles wrapping around 0/360 boundary', () => {
      expect(circularDistance(350, 10)).toBe(20);
      expect(circularDistance(10, 350)).toBe(20);
      expect(circularDistance(355, 5)).toBe(10);
    });
  });

  describe('signedCircularDelta', () => {
    it('computes signed directional difference', () => {
      expect(signedCircularDelta(10, 30)).toBe(20);
      expect(signedCircularDelta(30, 10)).toBe(-20);
      expect(signedCircularDelta(0, 0)).toBe(0);
    });

    it('handles 0/360 wraparound directionally', () => {
      // 350 -> 10 is +20 forward
      expect(signedCircularDelta(350, 10)).toBe(20);
      // 10 -> 350 is -20 backward
      expect(signedCircularDelta(10, 350)).toBe(-20);
    });

    it('handles 180 boundary', () => {
      expect(signedCircularDelta(0, 180)).toBe(180);
    });
  });

  describe('projectPureHue', () => {
    it('projects low saturation points to outer circumference r=1.0 preserving theta', () => {
      const darkCast = { theta: 42.5, r: 0.08 };
      const projected = projectPureHue(darkCast);

      expect(projected.theta).toBe(42.5);
      expect(projected.r).toBe(1.0);
    });

    it('normalizes angle if out of range', () => {
      const outOfRange = { theta: -30, r: 0.5 };
      const projected = projectPureHue(outOfRange);

      expect(projected.theta).toBe(330);
      expect(projected.r).toBe(1.0);
    });
  });
});

describe('Easing and Interpolation', () => {
  it('linear easing produces continuous progress', () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
    expect(linear(-0.1)).toBe(0);
    expect(linear(1.2)).toBe(1);
  });

  it('easeInOutCubic is symmetric and bounded', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('interpolateAngle smoothly interpolates across 0/360 boundary', () => {
    const midway = interpolateAngle(350, 10, 0.5, linear);
    expect(midway).toBe(0);
  });

  it('interpolatePolar interpolates angle and radius', () => {
    const start = { theta: 10, r: 0.2 };
    const target = { theta: 50, r: 0.8 };

    const mid = interpolatePolar(start, target, 0.5, linear);
    expect(mid.theta).toBeCloseTo(30, 4);
    expect(mid.r).toBeCloseTo(0.5, 4);
  });

  it('interpolatePureHue smoothly animates toward r=1.0 preserving theta', () => {
    const sample = { theta: 215, r: 0.2 };

    const atStart = interpolatePureHue(sample, 0, linear);
    expect(atStart.theta).toBe(215);
    expect(atStart.r).toBeCloseTo(0.2, 4);

    const atMid = interpolatePureHue(sample, 0.5, linear);
    expect(atMid.theta).toBe(215);
    expect(atMid.r).toBeCloseTo(0.6, 4);

    const atEnd = interpolatePureHue(sample, 1.0, linear);
    expect(atEnd.theta).toBe(215);
    expect(atEnd.r).toBe(1.0);
  });
});

describe('Color Space Conversions', () => {
  it('converts primary RGB colors to HSL and back', () => {
    // Red
    const red = { r: 255, g: 0, b: 0 };
    const redHsl = rgbToHsl(red);
    expect(redHsl.h).toBe(0);
    expect(redHsl.s).toBe(1.0);
    expect(redHsl.l).toBe(0.5);
    expect(hslToRgb(redHsl)).toEqual(red);

    // Green
    const green = { r: 0, g: 255, b: 0 };
    const greenHsl = rgbToHsl(green);
    expect(greenHsl.h).toBe(120);
    expect(greenHsl.s).toBe(1.0);
    expect(greenHsl.l).toBe(0.5);
    expect(hslToRgb(greenHsl)).toEqual(green);

    // Blue
    const blue = { r: 0, g: 0, b: 255 };
    const blueHsl = rgbToHsl(blue);
    expect(blueHsl.h).toBe(240);
    expect(blueHsl.s).toBe(1.0);
    expect(blueHsl.l).toBe(0.5);
    expect(hslToRgb(blueHsl)).toEqual(blue);
  });

  it('handles neutrals (black, white, gray)', () => {
    const black = { r: 0, g: 0, b: 0 };
    const blackHsl = rgbToHsl(black);
    expect(blackHsl.s).toBe(0);
    expect(blackHsl.l).toBe(0);

    const white = { r: 255, g: 255, b: 255 };
    const whiteHsl = rgbToHsl(white);
    expect(whiteHsl.s).toBe(0);
    expect(whiteHsl.l).toBe(1.0);

    const gray = { r: 128, g: 128, b: 128 };
    const grayHsl = rgbToHsl(gray);
    expect(grayHsl.s).toBe(0);
    expect(grayHsl.l).toBeCloseTo(0.502, 2);
  });

  it('converts between RGB and Hex', () => {
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000');
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('invalid')).toBeNull();
  });

  describe('getTargetColorName', () => {
    it('accurately identifies photographic color names across 12 sectors', () => {
      expect(getTargetColorName(0)).toBe('Red');
      expect(getTargetColorName(350)).toBe('Red');
      expect(getTargetColorName(30)).toBe('Orange');
      expect(getTargetColorName(60)).toBe('Yellow');
      expect(getTargetColorName(90)).toBe('Yellow-Green');
      expect(getTargetColorName(120)).toBe('Green');
      expect(getTargetColorName(150)).toBe('Teal');
      expect(getTargetColorName(180)).toBe('Cyan');
      expect(getTargetColorName(210)).toBe('Sky Blue');
      expect(getTargetColorName(240)).toBe('Blue');
      expect(getTargetColorName(270)).toBe('Purple');
      expect(getTargetColorName(310)).toBe('Magenta');
      expect(getTargetColorName(330)).toBe('Rose');
    });

    it('handles negative or >360 angles by normalizing', () => {
      expect(getTargetColorName(-30)).toBe('Rose');
      expect(getTargetColorName(390)).toBe('Orange');
      expect(getTargetColorName(720)).toBe('Red');
    });
  });
});
