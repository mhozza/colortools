"""Harmony definitions and mathematical spoke offsets."""
from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class HarmonyDefinition:
    """Photographic color harmony type and its canonical spoke angular offsets from a primary key hue."""
    name: str
    spoke_offsets: tuple[float, ...]  # Relative offsets in degrees from primary spoke (0.0 is primary)
    description: str


# Canonical spoke definitions as specified in the spec:
# 1. Complementary: 180°
# 2. Split-Complementary: 150°, 210°
# 3. Triadic: 120°, 240°
# 4. Analogous: ±30° (i.e. 30°, 330° or -30°)
# 5. Square / Tetradic: 90°, 180°, 270°

HARMONY_DEFINITIONS: dict[str, HarmonyDefinition] = {
    "Complementary": HarmonyDefinition(
        name="Complementary",
        spoke_offsets=(0.0, 180.0),
        description="Two colors opposite each other on the color wheel (180° apart).",
    ),
    "Split-Complementary": HarmonyDefinition(
        name="Split-Complementary",
        spoke_offsets=(0.0, 150.0, 210.0),
        description="A base color plus the two colors adjacent to its complement (150° and 210° apart).",
    ),
    "Triadic": HarmonyDefinition(
        name="Triadic",
        spoke_offsets=(0.0, 120.0, 240.0),
        description="Three colors evenly spaced around the color wheel (120° and 240° apart).",
    ),
    "Analogous": HarmonyDefinition(
        name="Analogous",
        spoke_offsets=(0.0, 30.0, 330.0),
        description="Colors adjacent on the color wheel (±30° apart).",
    ),
    "Square": HarmonyDefinition(
        name="Square",
        spoke_offsets=(0.0, 90.0, 180.0, 270.0),
        description="Four colors evenly spaced around the color wheel (90°, 180°, 270° apart).",
    ),
    "Tetradic": HarmonyDefinition(
        name="Tetradic",
        spoke_offsets=(0.0, 90.0, 180.0, 270.0),
        description="Four colors forming a square or rectangle on the color wheel.",
    ),
}


def get_target_color_name(hue_degrees: float) -> str:
    """Return photographic color name for a given hue angle on [0, 360)."""
    norm_hue = (hue_degrees % 360.0 + 360.0) % 360.0

    # Standard 12-segment photographic color wheel (each segment ±15° around its center):
    # Red: ~0° (345° - 15°)
    # Orange: ~30° (15° - 45°)
    # Yellow: ~60° (45° - 75°)
    # Yellow-Green: ~90° (75° - 105°)
    # Green: ~120° (105° - 135°)
    # Teal / Cyan-Green: ~150° (135° - 165°)
    # Cyan: ~180° (165° - 195°)
    # Sky Blue: ~210° (195° - 225°)
    # Blue: ~240° (225° - 255°)
    # Purple: ~270°-285° (255° - 295°)
    # Magenta: ~300°-315° (295° - 325°)
    # Rose: ~330° (325° - 345°)
    if norm_hue >= 345.0 or norm_hue < 15.0:
        return "Red"
    elif norm_hue < 45.0:
        return "Orange"
    elif norm_hue < 75.0:
        return "Yellow"
    elif norm_hue < 105.0:
        return "Yellow-Green"
    elif norm_hue < 135.0:
        return "Green"
    elif norm_hue < 165.0:
        return "Teal"
    elif norm_hue < 195.0:
        return "Cyan"
    elif norm_hue < 225.0:
        return "Sky Blue"
    elif norm_hue < 255.0:
        return "Blue"
    elif norm_hue < 295.0:
        return "Purple"
    elif norm_hue < 325.0:
        return "Magenta"
    else:
        return "Rose"


