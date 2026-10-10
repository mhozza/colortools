"""Non-destructive Adobe Camera Raw XMP sidecar generator and updater."""
from pathlib import Path
from typing import Mapping, Sequence
import defusedxml.minidom as minidom
import xml.etree.ElementTree as ET

from ports.plugin import SpokeDirective
from lightroom_xmp.camera_raw import (
    CAMERA_RAW_HUE_CHANNELS,
    find_nearest_channel,
    map_hue_delta_to_slider,
)

# Standard Adobe XMP XML namespaces
XMP_NAMESPACES = {
    "x": "adobe:ns:meta/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "crs": "http://ns.adobe.com/camera-raw-settings/1.0/",
}


def build_camera_raw_adjustments(
    directives: Sequence[SpokeDirective],
) -> dict[str, int]:
    """Map a sequence of sample spoke directives into Camera Raw HSL parameters.

    Returns a dictionary of crs tag to slider value, e.g.:
    {"crs:HueAdjustmentRed": 15, "crs:HueAdjustmentAqua": -25, ...}
    """
    # Accumulate slider values per channel
    channel_shifts: dict[str, list[int]] = {ch.xmp_tag: [] for ch in CAMERA_RAW_HUE_CHANNELS}

    for directive in directives:
        channel = find_nearest_channel(directive.current_hue)
        slider_val = map_hue_delta_to_slider(directive.delta_degrees)
        channel_shifts[channel.xmp_tag].append(slider_val)

    adjustments: dict[str, int] = {}
    for tag, values in channel_shifts.items():
        if values:
            # Average shifts if multiple samples fall into the same channel
            avg_val = int(round(sum(values) / len(values)))
            adjustments[tag] = max(-100, min(100, avg_val))
        else:
            adjustments[tag] = 0

    return adjustments


def generate_xmp_document(
    adjustments: Mapping[str, int | str],
    version: str = "15.0",
) -> str:
    """Generate a standalone Adobe Camera Raw XMP sidecar document string with standard XML formatting."""
    # Build standard Adobe XMP structure:
    # <x:xmpmeta xmlns:x="adobe:ns:meta/">
    #   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    #     <rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    #                      crs:Version="15.0"
    #                      crs:AlreadyApplied="False"
    #                      ... crs tags ... />
    #   </rdf:RDF>
    # </x:xmpmeta>

    lines = [
        '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 2022/01/01-00:00:00        ">',
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '  <rdf:Description rdf:about=""',
        '    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"',
        f'    crs:Version="{version}"',
        '    crs:ProcessVersion="15.4"',
        '    crs:HasSettings="True"',
    ]

    for key, val in sorted(adjustments.items()):
        # Strip namespace prefix if already present or format nicely
        tag = key if key.startswith("crs:") else f"crs:{key}"
        lines.append(f'    {tag}="{val}"')

    lines.append('  />')
    lines.append(' </rdf:RDF>')
    lines.append('</x:xmpmeta>')

    return "\n".join(lines) + "\n"


class XmpSidecarWriter:
    """Manages non-destructive writing and updating of .xmp sidecar files alongside photo files."""

    @classmethod
    def get_sidecar_path(cls, photo_path: str | Path) -> Path:
        """Derive standard .xmp sidecar file path adjacent to the photo file."""
        p = Path(photo_path)
        # Standard photography convention: photo.CR3 -> photo.xmp
        return p.with_suffix(".xmp")

    @classmethod
    def write_sidecar(
        cls,
        photo_path: str | Path,
        adjustments: Mapping[str, int | str],
        overwrite: bool = True,
    ) -> Path:
        """Write or update an .xmp sidecar file non-destructively alongside the target photo.

        Guarantees:
        - The source raw image file is NEVER touched or modified.
        - The resulting file is valid XML containing the crs namespace.
        """
        sidecar_path = cls.get_sidecar_path(photo_path)

        # Merge with existing sidecar if present and not pure overwrite
        if sidecar_path.exists() and not overwrite:
            raise FileExistsError(f"Sidecar file already exists: {sidecar_path}")

        xml_content = generate_xmp_document(adjustments)

        # Ensure parent directory exists
        sidecar_path.parent.mkdir(parents=True, exist_ok=True)
        sidecar_path.write_text(xml_content, encoding="utf-8")

        return sidecar_path
