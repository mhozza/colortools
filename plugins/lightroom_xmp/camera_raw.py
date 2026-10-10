"""Mapping between photographic hue ranges and Adobe Camera Raw 8-channel HSL parameters."""
from dataclasses import dataclass
from services.color_math import circular_distance


@dataclass(frozen=True)
class CameraRawHueChannel:
    """Adobe Camera Raw HSL hue adjustment channel."""
    name: str              # e.g., 'Red', 'Orange', 'Yellow'
    center_hue: float      # Standard center hue in degrees [0, 360)
    xmp_tag: str           # crs:HueAdjustment{Name}
    slider_min: int = -100 # Minimum slider value
    slider_max: int = 100  # Maximum slider value


# Lightroom / Adobe Camera Raw provides 8 primary color channels for HSL adjustments:
CAMERA_RAW_HUE_CHANNELS: tuple[CameraRawHueChannel, ...] = (
    CameraRawHueChannel(name="Red", center_hue=0.0, xmp_tag="crs:HueAdjustmentRed"),
    CameraRawHueChannel(name="Orange", center_hue=30.0, xmp_tag="crs:HueAdjustmentOrange"),
    CameraRawHueChannel(name="Yellow", center_hue=60.0, xmp_tag="crs:HueAdjustmentYellow"),
    CameraRawHueChannel(name="Green", center_hue=120.0, xmp_tag="crs:HueAdjustmentGreen"),
    CameraRawHueChannel(name="Aqua", center_hue=180.0, xmp_tag="crs:HueAdjustmentAqua"),
    CameraRawHueChannel(name="Blue", center_hue=240.0, xmp_tag="crs:HueAdjustmentBlue"),
    CameraRawHueChannel(name="Purple", center_hue=285.0, xmp_tag="crs:HueAdjustmentPurple"),
    CameraRawHueChannel(name="Magenta", center_hue=330.0, xmp_tag="crs:HueAdjustmentMagenta"),
)


def map_hue_delta_to_slider(delta_degrees: float) -> int:
    """Convert an angular hue delta (-180 to 180 degrees) into Lightroom's -100 to +100 slider range.

    In Adobe Camera Raw, the HSL hue slider spans approximately ±30° of hue shift across its [-100, +100] scale.
    """
    # Scale: ~30 degrees represents full ±100 deflection
    raw_val = (delta_degrees / 30.0) * 100.0
    slider_val = int(round(raw_val))
    return max(-100, min(100, slider_val))


def find_nearest_channel(hue_degrees: float) -> CameraRawHueChannel:
    """Find the nearest Adobe Camera Raw HSL channel for a given hue angle."""
    norm_hue = (hue_degrees % 360.0 + 360.0) % 360.0
    return min(CAMERA_RAW_HUE_CHANNELS, key=lambda ch: circular_distance(norm_hue, ch.center_hue))
