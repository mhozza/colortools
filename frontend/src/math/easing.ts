import { PolarPoint } from '../types/color';
import { clamp, clampRadius, normalizeAngle, signedCircularDelta } from './coordinates';

export type EasingFunction = (t: number) => number;

/**
 * Linear easing: constant speed.
 */
export const linear: EasingFunction = (t: number): number => {
  return clamp(t, 0, 1);
};

/**
 * Quadratic ease-in: accelerating from zero velocity.
 */
export const easeInQuad: EasingFunction = (t: number): number => {
  const p = clamp(t, 0, 1);
  return p * p;
};

/**
 * Quadratic ease-out: decelerating to zero velocity.
 */
export const easeOutQuad: EasingFunction = (t: number): number => {
  const p = clamp(t, 0, 1);
  return p * (2 - p);
};

/**
 * Quadratic ease-in-out: acceleration until halfway, then deceleration.
 */
export const easeInOutQuad: EasingFunction = (t: number): number => {
  const p = clamp(t, 0, 1);
  return p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
};

/**
 * Cubic ease-in.
 */
export const easeInCubic: EasingFunction = (t: number): number => {
  const p = clamp(t, 0, 1);
  return p * p * p;
};

/**
 * Cubic ease-out.
 */
export const easeOutCubic: EasingFunction = (t: number): number => {
  const p = clamp(t, 0, 1) - 1;
  return p * p * p + 1;
};

/**
 * Cubic ease-in-out: smooth transition widely used in design tools.
 */
export const easeInOutCubic: EasingFunction = (t: number): number => {
  const p = clamp(t, 0, 1);
  return p < 0.5 ? 4 * p * p * p : (p - 1) * (2 * p - 2) * (2 * p - 2) + 1;
};

/**
 * Interpolates between two numbers using an easing function.
 */
export function interpolateNumber(
  from: number,
  to: number,
  t: number,
  easing: EasingFunction = easeInOutCubic
): number {
  const eased = easing(t);
  return from + (to - from) * eased;
}

/**
 * Interpolates between two angles on [0, 360) along the shortest arc.
 */
export function interpolateAngle(
  fromAngle: number,
  toAngle: number,
  t: number,
  easing: EasingFunction = easeInOutCubic
): number {
  const delta = signedCircularDelta(fromAngle, toAngle);
  const eased = easing(t);
  return normalizeAngle(fromAngle + delta * eased);
}

/**
 * Interpolates between two polar points (interpolates shortest hue arc and radial saturation).
 */
export function interpolatePolar(
  start: PolarPoint,
  target: PolarPoint,
  t: number,
  easing: EasingFunction = easeInOutCubic
): PolarPoint {
  const eased = easing(t);
  const interpolatedAngle = interpolateAngle(start.theta, target.theta, t, easing);
  const startR = clampRadius(start.r);
  const targetR = clampRadius(target.r);
  const interpolatedR = clampRadius(startR + (targetR - startR) * eased);

  return {
    theta: interpolatedAngle,
    r: Number(interpolatedR.toFixed(6)),
  };
}

/**
 * Interpolates a polar point toward its pure-hue projection (r -> 1.0) with preserved theta.
 */
export function interpolatePureHue(
  point: PolarPoint,
  t: number,
  easing: EasingFunction = easeInOutCubic
): PolarPoint {
  const eased = easing(t);
  const startR = clampRadius(point.r);
  const targetR = 1.0;
  const currentR = clampRadius(startR + (targetR - startR) * eased);

  return {
    theta: normalizeAngle(point.theta),
    r: Number(currentR.toFixed(6)),
  };
}
