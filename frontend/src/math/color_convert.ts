import { HSLColor, RGBColor } from '../types/color';
import { clamp, normalizeAngle } from './coordinates';

/**
 * Converts sRGB [0, 255] to HSL (h in [0, 360), s in [0.0, 1.0], l in [0.0, 1.0]).
 * Matches backend color_math.py algorithm.
 */
export function rgbToHsl(rgb: RGBColor): HSLColor {
  const r = clamp(rgb.r, 0, 255) / 255.0;
  const g = clamp(rgb.g, 0, 255) / 255.0;
  const b = clamp(rgb.b, 0, 255) / 255.0;

  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const delta = maxC - minC;

  const l = (maxC + minC) / 2.0;
  let h = 0.0;
  let s = 0.0;

  if (delta !== 0.0) {
    s = delta / (1.0 - Math.abs(2.0 * l - 1.0));
    if (maxC === r) {
      h = 60.0 * (((g - b) / delta) % 6);
    } else if (maxC === g) {
      h = 60.0 * ((b - r) / delta + 2);
    } else {
      h = 60.0 * ((r - g) / delta + 4);
    }
  }

  return {
    h: normalizeAngle(h),
    s: Number(clamp(s, 0.0, 1.0).toFixed(4)),
    l: Number(clamp(l, 0.0, 1.0).toFixed(4)),
  };
}

/**
 * Converts HSL (h in [0, 360), s in [0.0, 1.0], l in [0.0, 1.0]) to sRGB [0, 255].
 * Matches backend color_math.py algorithm.
 */
export function hslToRgb(hsl: HSLColor): RGBColor {
  const h = normalizeAngle(hsl.h);
  const s = clamp(hsl.s, 0.0, 1.0);
  const l = clamp(hsl.l, 0.0, 1.0);

  const c = (1.0 - Math.abs(2.0 * l - 1.0)) * s;
  const x = c * (1.0 - Math.abs(((h / 60.0) % 2) - 1.0));
  const m = l - c / 2.0;

  let r1 = 0.0;
  let g1 = 0.0;
  let b1 = 0.0;

  if (h >= 0.0 && h < 60.0) {
    r1 = c;
    g1 = x;
    b1 = 0.0;
  } else if (h >= 60.0 && h < 120.0) {
    r1 = x;
    g1 = c;
    b1 = 0.0;
  } else if (h >= 120.0 && h < 180.0) {
    r1 = 0.0;
    g1 = c;
    b1 = x;
  } else if (h >= 180.0 && h < 240.0) {
    r1 = 0.0;
    g1 = x;
    b1 = c;
  } else if (h >= 240.0 && h < 300.0) {
    r1 = x;
    g1 = 0.0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0.0;
    b1 = x;
  }

  return {
    r: Math.min(255, Math.max(0, Math.round((r1 + m) * 255.0))),
    g: Math.min(255, Math.max(0, Math.round((g1 + m) * 255.0))),
    b: Math.min(255, Math.max(0, Math.round((b1 + m) * 255.0))),
  };
}

/**
 * Converts RGB to hex string `#rrggbb`.
 */
export function rgbToHex(rgb: RGBColor): string {
  const r = Math.min(255, Math.max(0, Math.round(rgb.r)))
    .toString(16)
    .padStart(2, '0');
  const g = Math.min(255, Math.max(0, Math.round(rgb.g)))
    .toString(16)
    .padStart(2, '0');
  const b = Math.min(255, Math.max(0, Math.round(rgb.b)))
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * Converts HSL to hex string `#rrggbb`.
 */
export function hslToHex(hsl: HSLColor): string {
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Parses hex color string `#rrggbb` or `rrggbb` to RGBColor.
 */
export function hexToRgb(hex: string): RGBColor | null {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 && clean.length !== 3) {
    return null;
  }
  let fullHex = clean;
  if (clean.length === 3) {
    fullHex = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(fullHex, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Returns photographic color name for a given hue angle on [0, 360).
 * Matches backend definitions.py 12-segment color wheel.
 */
export function getTargetColorName(hueDegrees: number): string {
  const normHue = normalizeAngle(hueDegrees);
  if (normHue >= 345.0 || normHue < 15.0) {
    return 'Red';
  } else if (normHue < 45.0) {
    return 'Orange';
  } else if (normHue < 75.0) {
    return 'Yellow';
  } else if (normHue < 105.0) {
    return 'Yellow-Green';
  } else if (normHue < 135.0) {
    return 'Green';
  } else if (normHue < 165.0) {
    return 'Teal';
  } else if (normHue < 195.0) {
    return 'Cyan';
  } else if (normHue < 225.0) {
    return 'Sky Blue';
  } else if (normHue < 255.0) {
    return 'Blue';
  } else if (normHue < 295.0) {
    return 'Purple';
  } else if (normHue < 325.0) {
    return 'Magenta';
  } else {
    return 'Rose';
  }
}

