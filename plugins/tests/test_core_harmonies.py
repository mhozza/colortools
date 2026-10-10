"""Unit tests for harmony definitions, spoke matching, and directional directives."""
import pytest
from domain.models import ColorSample, HSLColor, RGBColor
from core_harmonies.definitions import (
    HARMONY_DEFINITIONS,
    HarmonyDefinition,
    get_target_color_name,
)
from core_harmonies.engine import HarmonyEngine
from core_harmonies.plugin import CoreHarmoniesPlugin


def make_sample(name: str, hue: float, s: float = 0.8, l: float = 0.5) -> ColorSample:
    """Helper to construct a ColorSample with a specific hue."""
    return ColorSample(
        name=name,
        x=100,
        y=100,
        rgb=RGBColor(r=200, g=100, b=50),
        hsl=HSLColor(h=hue, s=s, l=l),
    )


def test_harmony_definitions_present():
    """Verify all 5 standard photographic harmonies from spec are registered."""
    expected_harmonies = [
        "Complementary",
        "Split-Complementary",
        "Triadic",
        "Analogous",
        "Square",
        "Tetradic",
    ]
    for name in expected_harmonies:
        assert name in HARMONY_DEFINITIONS
        definition = HARMONY_DEFINITIONS[name]
        assert definition.name == name
        assert len(definition.spoke_offsets) >= 2


def test_target_color_name_photographic():
    """Verify photographic color naming across 360-degree color wheel."""
    assert get_target_color_name(0.0) == "Red"
    assert get_target_color_name(30.0) == "Orange"
    assert get_target_color_name(60.0) == "Yellow"
    assert get_target_color_name(120.0) == "Green"
    assert get_target_color_name(180.0) == "Cyan"
    assert get_target_color_name(240.0) == "Blue"
    assert get_target_color_name(285.0) == "Purple"
    assert get_target_color_name(330.0) == "Rose"
    assert get_target_color_name(355.0) == "Red"


def test_exact_complementary_yields_100_percent():
    """Exact 180° split yields 100% Complementary score."""
    sample1 = make_sample("Orange Subject", 30.0)
    sample2 = make_sample("Teal Background", 210.0)

    result = HarmonyEngine.evaluate_harmony(
        HARMONY_DEFINITIONS["Complementary"],
        [sample1, sample2],
    )

    assert result.harmony_name == "Complementary"
    assert result.match_score == 100.0
    assert len(result.directives) == 2
    for d in result.directives:
        assert abs(d.delta_degrees) < 0.01


def test_exact_triadic_yields_100_percent():
    """Exact 120° spacing yields 100% Triadic score."""
    sample1 = make_sample("Red", 0.0)
    sample2 = make_sample("Green", 120.0)
    sample3 = make_sample("Blue", 240.0)

    result = HarmonyEngine.evaluate_harmony(
        HARMONY_DEFINITIONS["Triadic"],
        [sample1, sample2, sample3],
    )

    assert result.harmony_name == "Triadic"
    assert result.match_score == 100.0


def test_exact_split_complementary_yields_100_percent():
    """Exact Split-Complementary palette (0°, 150°, 210°) yields 100%."""
    sample1 = make_sample("Base", 40.0)
    sample2 = make_sample("Split1", (40.0 + 150.0) % 360.0)
    sample3 = make_sample("Split2", (40.0 + 210.0) % 360.0)

    result = HarmonyEngine.evaluate_harmony(
        HARMONY_DEFINITIONS["Split-Complementary"],
        [sample1, sample2, sample3],
    )

    assert result.harmony_name == "Split-Complementary"
    assert result.match_score == 100.0


def test_exact_square_yields_100_percent():
    """Exact Square palette (0°, 90°, 180°, 270°) yields 100%."""
    samples = [
        make_sample("Color1", 10.0),
        make_sample("Color2", 100.0),
        make_sample("Color3", 190.0),
        make_sample("Color4", 280.0),
    ]

    result = HarmonyEngine.evaluate_harmony(
        HARMONY_DEFINITIONS["Square"],
        samples,
    )

    assert result.harmony_name == "Square"
    assert result.match_score == 100.0


def test_directional_spoke_nudge_directive():
    """Tests that nudge calculator computes correct directional delta and textual directives."""
    # Sample at 20° (Orange), primary spoke at 0° (Red), secondary spoke at 180°
    sample1 = make_sample("Tower in shadow", 20.0)
    sample2 = make_sample("Sky", 180.0)

    # Force key hue override to 0° to test precise delta calculation
    result = HarmonyEngine.evaluate_harmony(
        HARMONY_DEFINITIONS["Complementary"],
        [sample1, sample2],
        key_hue_override=0.0,
    )

    directive1 = next(d for d in result.directives if d.sample_name == "Tower in shadow")
    # Delta from 20° to 0° should be -20°
    assert directive1.current_hue == 20.0
    assert directive1.target_hue == 0.0
    assert directive1.delta_degrees == -20.0
    assert "Shift sample 'Tower in shadow' -20.0° toward Red" in directive1.instruction


def test_evaluate_all_rankings():
    """Test evaluate_all returns all registered harmonies ordered by score descending."""
    sample1 = make_sample("Flower", 30.0)
    sample2 = make_sample("Leaf", 210.0)

    ranked = HarmonyEngine.evaluate_all([sample1, sample2])
    assert len(ranked) >= 5
    assert ranked[0].harmony_name == "Complementary"
    assert ranked[0].match_score == 100.0


def test_empty_samples_handling():
    """Test evaluating with empty sample list returns 0 score without raising errors."""
    result = HarmonyEngine.evaluate_harmony(
        HARMONY_DEFINITIONS["Complementary"],
        [],
    )
    assert result.match_score == 0.0
    assert result.directives == []


def test_core_harmonies_plugin_contract():
    """Test CoreHarmoniesPlugin conforms to PluginPort."""
    plugin = CoreHarmoniesPlugin()
    assert plugin.name == "core_harmonies"
    plugin.initialize()

    sample = make_sample("Subject", 45.0)
    res = plugin.analyze([sample])

    assert res["plugin"] == "core_harmonies"
    assert res["sample_count"] == 1
    assert "harmonies" in res
    assert "top_harmony" in res
