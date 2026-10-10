"""Unit tests for color math conversions and circular arithmetic."""
import pytest

from domain.models import HSLColor, PolarPoint, RGBColor
from services.color_math import (
    cartesian_to_polar,
    circular_distance,
    hsl_to_polar,
    hsl_to_rgb,
    polar_to_cartesian,
    polar_to_hsl,
    rgb_to_hsl,
    signed_circular_delta,
)


@pytest.mark.parametrize(
    "rgb,expected_hsl",
    [
        (RGBColor(r=255, g=0, b=0), HSLColor(h=0.0, s=1.0, l=0.5)),
        (RGBColor(r=0, g=255, b=0), HSLColor(h=120.0, s=1.0, l=0.5)),
        (RGBColor(r=0, g=0, b=255), HSLColor(h=240.0, s=1.0, l=0.5)),
        (RGBColor(r=255, g=255, b=0), HSLColor(h=60.0, s=1.0, l=0.5)),
        (RGBColor(r=0, g=255, b=255), HSLColor(h=180.0, s=1.0, l=0.5)),
        (RGBColor(r=255, g=0, b=255), HSLColor(h=300.0, s=1.0, l=0.5)),
        (RGBColor(r=0, g=0, b=0), HSLColor(h=0.0, s=0.0, l=0.0)),
        (RGBColor(r=255, g=255, b=255), HSLColor(h=0.0, s=0.0, l=1.0)),
        (RGBColor(r=128, g=128, b=128), HSLColor(h=0.0, s=0.0, l=0.502)),
    ],
)
def test_rgb_to_hsl_standard_colors(rgb, expected_hsl):
    result = rgb_to_hsl(rgb)
    assert pytest.approx(result.h, abs=0.5) == expected_hsl.h
    assert pytest.approx(result.s, abs=0.02) == expected_hsl.s
    assert pytest.approx(result.l, abs=0.02) == expected_hsl.l


def test_hsl_roundtrip():
    # Test round trip conversions for various hues and saturations
    for h in [0.0, 30.0, 60.0, 90.0, 150.0, 210.0, 270.0, 330.0]:
        for s in [0.25, 0.5, 0.75, 1.0]:
            for l in [0.2, 0.5, 0.8]:
                original = HSLColor(h=h, s=s, l=l)
                rgb = hsl_to_rgb(original)
                recovered = rgb_to_hsl(rgb)
                assert pytest.approx(recovered.h, abs=2.0) == original.h
                assert pytest.approx(recovered.s, abs=0.05) == original.s
                assert pytest.approx(recovered.l, abs=0.05) == original.l


def test_hsl_and_polar_conversion():
    hsl = HSLColor(h=215.0, s=0.8, l=0.45)
    polar = hsl_to_polar(hsl)
    assert polar.theta == 215.0
    assert polar.r == 0.8

    back_hsl = polar_to_hsl(polar, l=0.45)
    assert back_hsl == hsl


def test_circular_distance():
    assert circular_distance(0.0, 0.0) == 0.0
    assert circular_distance(10.0, 350.0) == 20.0
    assert circular_distance(350.0, 10.0) == 20.0
    assert circular_distance(0.0, 180.0) == 180.0
    assert circular_distance(180.0, 0.0) == 180.0
    assert circular_distance(45.0, 225.0) == 180.0
    assert circular_distance(10.0, 70.0) == 60.0


def test_signed_circular_delta():
    # Shift from 10 to 30 is +20
    assert signed_circular_delta(10.0, 30.0) == 20.0
    # Shift from 30 to 10 is -20
    assert signed_circular_delta(30.0, 10.0) == -20.0
    # Across 0/360 boundary: 350 to 10 is +20
    assert signed_circular_delta(350.0, 10.0) == 20.0
    # 10 to 350 is -20
    assert signed_circular_delta(10.0, 350.0) == -20.0
    # Exactly opposite (180 deg)
    assert abs(signed_circular_delta(0.0, 180.0)) == 180.0


def test_polar_cartesian_roundtrip():
    point = PolarPoint(theta=60.0, r=0.75)
    x, y = polar_to_cartesian(point)
    recovered = cartesian_to_polar(x, y)
    assert pytest.approx(recovered.theta, abs=0.01) == 60.0
    assert pytest.approx(recovered.r, abs=0.01) == 0.75
