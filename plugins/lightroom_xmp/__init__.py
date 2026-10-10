"""Lightroom XMP sidecar generator package exports."""
from lightroom_xmp.camera_raw import (
    CAMERA_RAW_HUE_CHANNELS,
    CameraRawHueChannel,
    find_nearest_channel,
    map_hue_delta_to_slider,
)
from lightroom_xmp.generator import (
    XMP_NAMESPACES,
    XmpSidecarWriter,
    build_camera_raw_adjustments,
    generate_xmp_document,
)
from lightroom_xmp.plugin import LightroomXmpPlugin

__all__ = [
    "LightroomXmpPlugin",
    "XmpSidecarWriter",
    "generate_xmp_document",
    "build_camera_raw_adjustments",
    "find_nearest_channel",
    "map_hue_delta_to_slider",
    "CAMERA_RAW_HUE_CHANNELS",
    "CameraRawHueChannel",
    "XMP_NAMESPACES",
]
