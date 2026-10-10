"""Tests for domain models."""
import pytest
from pydantic import ValidationError

from domain.models import ColorSample, HSLColor, PolarPoint, RGBColor


def test_rgb_color_valid():
    c = RGBColor(r=255, g=128, b=0)
    assert c.r == 255
    assert c.g == 128
    assert c.b == 0
    assert c.as_tuple() == (255, 128, 0)
    assert c.as_hex() == "#ff8000"


def test_rgb_color_bounds():
    with pytest.raises(ValidationError):
        RGBColor(r=-1, g=0, b=0)
    with pytest.raises(ValidationError):
        RGBColor(r=256, g=0, b=0)


def test_hsl_color_valid():
    hsl = HSLColor(h=180.5, s=0.75, l=0.5)
    assert hsl.h == 180.5
    assert hsl.s == 0.75
    assert hsl.l == 0.5
    assert hsl.as_tuple() == (180.5, 0.75, 0.5)


def test_hsl_color_bounds():
    with pytest.raises(ValidationError):
        HSLColor(h=-0.1, s=0.5, l=0.5)
    with pytest.raises(ValidationError):
        HSLColor(h=360.0, s=0.5, l=0.5)
    with pytest.raises(ValidationError):
        HSLColor(h=120.0, s=1.1, l=0.5)
    with pytest.raises(ValidationError):
        HSLColor(h=120.0, s=0.5, l=-0.1)


def test_polar_point_projection():
    p = PolarPoint(theta=45.0, r=0.2)
    assert p.theta == 45.0
    assert p.r == 0.2
    assert p.as_tuple() == (45.0, 0.2)

    proj = p.pure_hue_projection()
    assert proj.theta == 45.0
    assert proj.r == 1.0


def test_color_sample_creation_and_polar_conversion():
    rgb = RGBColor(r=255, g=0, b=0)
    hsl = HSLColor(h=0.0, s=1.0, l=0.5)
    sample = ColorSample(name="Red Rose", x=100, y=200, rgb=rgb, hsl=hsl)

    assert sample.name == "Red Rose"
    assert sample.x == 100
    assert sample.y == 200
    assert sample.rgb == rgb
    assert sample.hsl == hsl
    assert len(sample.id) > 0

    polar = sample.to_polar()
    assert polar.theta == 0.0
    assert polar.r == 1.0


def test_models_immutability():
    rgb = RGBColor(r=10, g=20, b=30)
    with pytest.raises(ValidationError):
        rgb.r = 50

    polar = PolarPoint(theta=100.0, r=0.5)
    with pytest.raises(ValidationError):
        polar.r = 0.8


def test_domain_imports_no_external_web_or_ui():
    """Verify backend/domain only imports standard library and Pydantic."""
    import sys
    from domain import models

    # Check imported modules in models.py
    imported_names = [name for name in dir(models) if not name.startswith("_")]
    assert "RGBColor" in imported_names
    assert "HSLColor" in imported_names
    assert "PolarPoint" in imported_names
    assert "ColorSample" in imported_names

    # Ensure no fastapi, starlette, etc. loaded by domain
    forbidden = ["fastapi", "starlette", "tauri", "react", "flask", "django"]
    for mod in forbidden:
        assert mod not in sys.modules, f"Forbidden module {mod} imported!"
