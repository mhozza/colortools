"""Unit tests verifying ports contracts and interfaces."""
import inspect
from pathlib import Path
from typing import Any, Sequence

from domain.models import ColorSample
from ports.interfaces import ImageLoaderPort, PluginPort, PresetWriterPort
from services.raw_loader import PreviewImage, RawPreviewLoader


class MockImageLoader(ImageLoaderPort):
    def load(self, file_path: str | Path) -> PreviewImage:
        return RawPreviewLoader.load_preview(file_path)


class MockPresetWriter(PresetWriterPort):
    def write(self, target_photo_path: str | Path, adjustments: dict[str, Any]) -> Path:
        return Path(str(target_photo_path) + ".xmp")


class MockHarmonyPlugin(PluginPort):
    @property
    def name(self) -> str:
        return "mock_harmony"

    def initialize(self) -> None:
        pass

    def analyze(self, samples: Sequence[ColorSample]) -> dict[str, Any]:
        return {"samples_count": len(samples), "harmony": "complementary", "score": 95.0}


def test_ports_abstractness():
    # Verify instantiating raw abstract ports raises TypeError
    import pytest

    with pytest.raises(TypeError):
        ImageLoaderPort()  # type: ignore

    with pytest.raises(TypeError):
        PresetWriterPort()  # type: ignore

    with pytest.raises(TypeError):
        PluginPort()  # type: ignore


def test_mock_implementations_fulfill_contracts():
    loader = MockImageLoader()
    assert isinstance(loader, ImageLoaderPort)

    writer = MockPresetWriter()
    assert isinstance(writer, PresetWriterPort)
    assert writer.write("photo.raw", {}) == Path("photo.raw.xmp")

    plugin = MockHarmonyPlugin()
    assert isinstance(plugin, PluginPort)
    assert plugin.name == "mock_harmony"
    plugin.initialize()
    result = plugin.analyze([])
    assert result["score"] == 95.0
