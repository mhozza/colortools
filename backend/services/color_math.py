"""Accurate color math conversions and circular distance operations."""
import math
from domain.models import HSLColor, PolarPoint, RGBColor


def rgb_to_hsl(rgb: RGBColor) -> HSLColor:
    """Convert sRGB [0, 255] to HSL (h in [0, 360), s in [0.0, 1.0], l in [0.0, 1.0]).

    Uses standard colorimetric transformation formulas.
    """
    r = rgb.r / 255.0
    g = rgb.g / 255.0
    b = rgb.b / 255.0

    max_c = max(r, g, b)
    min_c = min(r, g, b)
    delta = max_c - min_c

    l = (max_c + min_c) / 2.0

    if delta == 0.0:
        h = 0.0
        s = 0.0
    else:
        s = delta / (1.0 - abs(2.0 * l - 1.0))
        if max_c == r:
            h = 60.0 * (((g - b) / delta) % 6)
        elif max_c == g:
            h = 60.0 * (((b - r) / delta) + 2)
        else:
            h = 60.0 * (((r - g) / delta) + 4)

        h = h % 360.0
        if h < 0.0:
            h += 360.0

    # Clamp rounding deviations
    h = min(max(h, 0.0), 359.999999999)
    s = min(max(s, 0.0), 1.0)
    l = min(max(l, 0.0), 1.0)

    return HSLColor(h=round(h, 4), s=round(s, 4), l=round(l, 4))


def hsl_to_rgb(hsl: HSLColor) -> RGBColor:
    """Convert HSL to sRGB [0, 255]."""
    h = hsl.h
    s = hsl.s
    l = hsl.l

    c = (1.0 - abs(2.0 * l - 1.0)) * s
    x = c * (1.0 - abs((h / 60.0) % 2 - 1.0))
    m = l - c / 2.0

    if 0.0 <= h < 60.0:
        r1, g1, b1 = c, x, 0.0
    elif 60.0 <= h < 120.0:
        r1, g1, b1 = x, c, 0.0
    elif 120.0 <= h < 180.0:
        r1, g1, b1 = 0.0, c, x
    elif 180.0 <= h < 240.0:
        r1, g1, b1 = 0.0, x, c
    elif 240.0 <= h < 300.0:
        r1, g1, b1 = x, 0.0, c
    else:
        r1, g1, b1 = c, 0.0, x

    r = int(round((r1 + m) * 255.0))
    g = int(round((g1 + m) * 255.0))
    b = int(round((b1 + m) * 255.0))

    return RGBColor(
        r=min(max(r, 0), 255),
        g=min(max(g, 0), 255),
        b=min(max(b, 0), 255),
    )


def hsl_to_polar(hsl: HSLColor) -> PolarPoint:
    """Convert HSL to polar vectorscope coordinates (theta=Hue, r=Saturation)."""
    return PolarPoint(theta=hsl.h, r=hsl.s)


def polar_to_hsl(polar: PolarPoint, l: float = 0.5) -> HSLColor:
    """Convert polar coordinates to HSL with an explicit or default lightness."""
    return HSLColor(h=polar.theta, s=polar.r, l=min(max(l, 0.0), 1.0))


def circular_distance(angle1: float, angle2: float) -> float:
    """Calculate the shortest angular distance in degrees between two angles on [0, 360).

    Returns a value in [0, 180].
    """
    diff = abs(angle1 - angle2) % 360.0
    if diff > 180.0:
        diff = 360.0 - diff
    return round(diff, 4)


def signed_circular_delta(source_angle: float, target_angle: float) -> float:
    """Calculate the signed shortest angular delta in degrees from source to target on [0, 360).

    Returns a value in (-180, 180]. Positive means counter-clockwise / forward shift.
    """
    delta = (target_angle - source_angle) % 360.0
    if delta > 180.0:
        delta -= 360.0
    elif delta <= -180.0:
        delta += 360.0
    return round(delta, 4)


def polar_to_cartesian(point: PolarPoint) -> tuple[float, float]:
    """Convert polar coordinates (theta in degrees, r) to Cartesian (x, y).

    In polar vectorscope: theta=0 is right (+x), counter-clockwise positive.
    """
    rad = math.radians(point.theta)
    x = point.r * math.cos(rad)
    y = point.r * math.sin(rad)
    return (round(x, 6), round(y, 6))


def cartesian_to_polar(x: float, y: float) -> PolarPoint:
    """Convert Cartesian (x, y) back to polar coordinates (theta in degrees [0, 360), r)."""
    r = math.hypot(x, y)
    rad = math.atan2(y, x)
    deg = math.degrees(rad) % 360.0
    # Clamp r to 1.0 if slightly exceeding due to floating-point
    r_clamped = min(max(r, 0.0), 1.0)
    deg_clamped = min(max(deg, 0.0), 359.999999999)
    return PolarPoint(theta=round(deg_clamped, 4), r=round(r_clamped, 4))
