"""Abstract interfaces and port specifications for extensible services."""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Sequence, Union

from domain.models import ColorSample
from services.raw_loader import PreviewImage


class ImageLoaderPort(ABC):
    """Abstract port for loading photo previews."""

    @abstractmethod
    def load(self, file_path: Union[str, Path]) -> PreviewImage:
        """Load image preview from file."""
        raise NotImplementedError


class PresetWriterPort(ABC):
    """Abstract port for writing Lightroom or camera adjustment presets."""

    @abstractmethod
    def write(self, target_photo_path: Union[str, Path], adjustments: dict[str, Any]) -> Path:
        """Write non-destructive preset or sidecar metadata for the photo."""
        raise NotImplementedError


from ports.plugin import PluginPort
