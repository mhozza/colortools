import { Point2D, PolarPoint } from '../types/color';

/**
 * Normalizes an angle in degrees to the half-open interval [0, 360).
 */
export function normalizeAngle(degrees: number): number {
  if (Number.isNaN(degrees)) return 0;
  let normalized = degrees % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  // Floating point boundary guard: normalized could end up as 360 due to precision
  if (normalized >= 360 || Object.is(normalized, -0)) {
    normalized = 0;
  }
  return Number(normalized.toFixed(6));
}

/**
 * Clamps a numeric value between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.min(Math.max(val, min), max);
}

/**
 * Clamps a radial saturation coordinate to [0.0, 1.0].
 */
export function clampRadius(r: number): number {
  return clamp(r, 0.0, 1.0);
}

/**
 * Converts polar vectorscope coordinates to standard unit Cartesian coordinates (radius <= 1.0).
 * theta = 0 points along positive X axis (+X).
 */
export function polarToCartesianUnit(polar: PolarPoint): Point2D {
  const normTheta = normalizeAngle(polar.theta);
  const normR = clampRadius(polar.r);
  const rad = (normTheta * Math.PI) / 180;
  return {
    x: Number((normR * Math.cos(rad)).toFixed(6)),
    y: Number((normR * Math.sin(rad)).toFixed(6)),
  };
}

/**
 * Converts standard unit Cartesian coordinates to polar vectorscope coordinates.
 * Returns theta in [0, 360) and r clamped in [0.0, 1.0].
 */
export function cartesianUnitToPolar(point: Point2D): PolarPoint {
  const r = clampRadius(Math.hypot(point.x, point.y));
  if (r === 0) {
    return { theta: 0, r: 0 };
  }
  const rad = Math.atan2(point.y, point.x);
  const deg = normalizeAngle((rad * 180) / Math.PI);
  return {
    theta: deg,
    r: Number(r.toFixed(6)),
  };
}

/**
 * Maps polar coordinates to pixel coordinates on an HTML5 canvas.
 */
export function polarToCanvas(
  polar: PolarPoint,
  center: Point2D,
  maxRadius: number
): Point2D {
  const unit = polarToCartesianUnit(polar);
  return {
    x: Number((center.x + unit.x * maxRadius).toFixed(3)),
    y: Number((center.y + unit.y * maxRadius).toFixed(3)),
  };
}

/**
 * Maps pixel coordinates on an HTML5 canvas back to polar coordinates.
 */
export function canvasToPolar(
  canvasPoint: Point2D,
  center: Point2D,
  maxRadius: number
): PolarPoint {
  if (maxRadius <= 0) return { theta: 0, r: 0 };
  const unitX = (canvasPoint.x - center.x) / maxRadius;
  const unitY = (canvasPoint.y - center.y) / maxRadius;
  return cartesianUnitToPolar({ x: unitX, y: unitY });
}

/**
 * Computes shortest unsigned angular distance in degrees between two angles on [0, 360).
 * Output is in range [0, 180].
 */
export function circularDistance(angle1: number, angle2: number): number {
  const a1 = normalizeAngle(angle1);
  const a2 = normalizeAngle(angle2);
  let diff = Math.abs(a1 - a2) % 360;
  if (diff > 180) {
    diff = 360 - diff;
  }
  return Number(diff.toFixed(6));
}

/**
 * Computes signed shortest angular delta in degrees from source to target angle on [0, 360).
 * Output is in range (-180, 180]. Positive means counter-clockwise / positive shift.
 */
export function signedCircularDelta(sourceAngle: number, targetAngle: number): number {
  const s = normalizeAngle(sourceAngle);
  const t = normalizeAngle(targetAngle);
  let delta = (t - s) % 360;
  if (delta > 180) {
    delta -= 360;
  } else if (delta <= -180) {
    delta += 360;
  }
  return Number(delta.toFixed(6));
}

/**
 * Projects a polar coordinate to the outer perimeter (r = 1.0) while strictly preserving theta.
 */
export function projectPureHue(polar: PolarPoint): PolarPoint {
  return {
    theta: normalizeAngle(polar.theta),
    r: 1.0,
  };
}
