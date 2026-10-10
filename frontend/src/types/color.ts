/**
 * Color and coordinate domain types matching backend models.
 */

export interface RGBColor {
  r: number; // [0, 255]
  g: number; // [0, 255]
  b: number; // [0, 255]
}

export interface HSLColor {
  h: number; // [0, 360)
  s: number; // [0.0, 1.0]
  l: number; // [0.0, 1.0]
}

export interface PolarPoint {
  theta: number; // Hue angle in degrees [0, 360)
  r: number;     // Saturation radius [0.0, 1.0]
}

export interface Point2D {
  x: number;
  y: number;
}
