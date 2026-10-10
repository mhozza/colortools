"""Lightroom XMP plugin conforming to PresetWriterPort and PluginPort."""
from pathlib import Path
from typing import Any, Mapping, Sequence

from domain.models import ColorSample
from ports.interfaces import PresetWriterPort
from ports.plugin import PluginPort, SpokeDirective
from lightroom_xmp.generator import (
    XmpSidecarWriter,
    build_camera_raw_adjustments,
    generate_xmp_document,
)


class LightroomXmpPlugin(PluginPort, PresetWriterPort):
    """Generates and writes Adobe Camera Raw .xmp sidecars without modifying raw images."""

    def __init__(self) -> None:
        self._initialized = False

    @property
    def name(self) -> str:
        return "lightroom_xmp"

    def initialize(self) -> None:
        """Lifecycle hook."""
        self._initialized = True

    def analyze(self, samples: Sequence[ColorSample]) -> dict[str, Any]:
        """Placeholder analysis hook conforming to PluginPort."""
        if not self._initialized:
            self.initialize()
        return {"plugin": self.name, "ready": True}

    def write(self, target_photo_path: str | Path, adjustments: Mapping[str, Any]) -> Path:
        """Write non-destructive .xmp sidecar metadata for the photo."""
        return XmpSidecarWriter.write_sidecar(target_photo_path, adjustments)

    def export_from_directives(
        self,
        target_photo_path: str | Path,
        directives: Sequence[SpokeDirective],
    ) -> Path:
        """Convenience method: map directives to Camera Raw HSL parameters and write sidecar."""
        adjustments = build_camera_raw_adjustments(directives)
        return self.write(target_photo_path, adjustments)
