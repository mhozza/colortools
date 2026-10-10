"""Unit tests and benchmarks for RAW and standard preview ingestion."""
import io
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import rawpy
from PIL import Image

from domain.models import ColorSample, RGBColor
from services.raw_loader import PreviewImage, RawPreviewLoader


@pytest.fixture
def sample_jpeg_path(tmp_path: Path) -> Path:
    """Create a temporary standard JPEG image."""
    img_path = tmp_path / "sample.jpg"
    arr = np.zeros((100, 200, 3), dtype=np.uint8)
    arr[:, :] = [255, 128, 64]
    Image.fromarray(arr).save(img_path, format="JPEG")
    return img_path


@pytest.fixture
def sample_png_path(tmp_path: Path) -> Path:
    """Create a temporary standard PNG image."""
    img_path = tmp_path / "sample.png"
    arr = np.zeros((50, 50, 3), dtype=np.uint8)
    arr[:, :] = [10, 20, 30]
    Image.fromarray(arr).save(img_path, format="PNG")
    return img_path


@pytest.fixture
def mock_24mp_jpeg_bytes() -> bytes:
    """Generate in-memory 24MP JPEG image preview (6000x4000)."""
    # Low-overhead uniform array representing 24MP sensor preview
    arr = np.full((4000, 6000, 3), (180, 90, 45), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


class MockRawPyThumb:
    """Mock LibRaw container returning a preview thumbnail."""

    def __init__(self, data: bytes, thumb_format: rawpy.ThumbFormat):
        self.data = data
        self.format = thumb_format


class MockRawPyContext:
    """Mock context manager for rawpy.imread."""

    def __init__(self, thumb: MockRawPyThumb):
        self.thumb = thumb

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def extract_thumb(self):
        return self.thumb


def test_is_raw_format():
    assert RawPreviewLoader.is_raw_format("photo.CR3") is True
    assert RawPreviewLoader.is_raw_format("photo.arw") is True
    assert RawPreviewLoader.is_raw_format("photo.NEF") is True
    assert RawPreviewLoader.is_raw_format("photo.dng") is True
    assert RawPreviewLoader.is_raw_format("photo.jpg") is False
    assert RawPreviewLoader.is_raw_format("photo.png") is False


def test_load_standard_jpeg(sample_jpeg_path: Path):
    preview = RawPreviewLoader.load_preview(sample_jpeg_path)
    assert preview.width == 200
    assert preview.height == 100
    assert preview.source_format == "JPG"
    assert preview.is_embedded_preview is False
    assert preview.image is not None

    # Sample color
    rgb = preview.get_pixel_rgb(50, 50)
    assert isinstance(rgb, RGBColor)
    assert rgb.r == 255
    # Allow small JPEG compression variation
    assert abs(rgb.g - 128) <= 2
    assert abs(rgb.b - 64) <= 2

    # Sample full ColorSample
    sample = preview.sample_color("Test Point", 50, 50)
    assert isinstance(sample, ColorSample)
    assert sample.name == "Test Point"
    assert sample.x == 50
    assert sample.y == 50


def test_load_standard_png(sample_png_path: Path):
    preview = RawPreviewLoader.load_preview(sample_png_path)
    assert preview.width == 50
    assert preview.height == 50
    assert preview.source_format == "PNG"
    rgb = preview.get_pixel_rgb(10, 10)
    assert (rgb.r, rgb.g, rgb.b) == (10, 20, 30)


def test_out_of_bounds_sample(sample_jpeg_path: Path):
    preview = RawPreviewLoader.load_preview(sample_jpeg_path)
    with pytest.raises(IndexError):
        preview.get_pixel_rgb(999, 999)
    with pytest.raises(IndexError):
        preview.get_pixel_rgb(-1, 0)


def test_nonexistent_file():
    with pytest.raises(FileNotFoundError):
        RawPreviewLoader.load_preview("nonexistent_path_to_file.CR3")


def test_load_raw_preview_jpeg_embedded(tmp_path: Path, mock_24mp_jpeg_bytes: bytes):
    """Test fast extraction of embedded JPEG thumbnail from a RAW file."""
    raw_path = tmp_path / "camera_shot.CR3"
    raw_path.write_bytes(b"dummy raw container bytes")

    mock_thumb = MockRawPyThumb(mock_24mp_jpeg_bytes, rawpy.ThumbFormat.JPEG)
    mock_ctx = MockRawPyContext(mock_thumb)

    with patch("rawpy.imread", return_value=mock_ctx):
        preview = RawPreviewLoader.load_preview(raw_path)

        assert preview.width == 6000
        assert preview.height == 4000
        assert preview.source_format == "CR3"
        assert preview.is_embedded_preview is True
        assert preview.extraction_time_ms < 50.0

        # Sample pixel
        sample = preview.sample_color("Subject", 3000, 2000)
        assert sample.name == "Subject"
        assert sample.x == 3000
        assert sample.y == 2000
        assert abs(sample.rgb.r - 180) <= 2


def test_load_raw_preview_bitmap_embedded(tmp_path: Path):
    """Test extraction when RAW embedded preview is an uncompressed bitmap."""
    raw_path = tmp_path / "camera_shot.NEF"
    raw_path.write_bytes(b"dummy raw container bytes")

    arr = np.zeros((120, 160, 3), dtype=np.uint8)
    arr[:, :] = [50, 150, 250]
    mock_thumb = MockRawPyThumb(arr, rawpy.ThumbFormat.BITMAP)
    mock_ctx = MockRawPyContext(mock_thumb)

    with patch("rawpy.imread", return_value=mock_ctx):
        preview = RawPreviewLoader.load_preview(raw_path)

        assert preview.width == 160
        assert preview.height == 120
        assert preview.source_format == "NEF"
        assert preview.is_embedded_preview is True
        rgb = preview.get_pixel_rgb(10, 10)
        assert (rgb.r, rgb.g, rgb.b) == (50, 150, 250)


def test_load_raw_fallback_when_no_thumbnail(tmp_path: Path):
    """Test fallback when rawpy raises LibRawNoThumbnailError on e.g. DNG/TIFF."""
    dng_path = tmp_path / "camera_shot.DNG"
    # Write a valid standard image with DNG extension
    arr = np.zeros((80, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(dng_path, format="TIFF")

    def mock_imread_fail(*args, **kwargs):
        raise rawpy.LibRawNoThumbnailError("No thumbnail in raw file")

    with patch("rawpy.imread", side_effect=mock_imread_fail):
        preview = RawPreviewLoader.load_preview(dng_path)
        assert preview.width == 100
        assert preview.height == 80
        assert preview.source_format == "DNG"
        assert preview.is_embedded_preview is False


def test_unsupported_raw_format_raises_runtime_error(tmp_path: Path):
    invalid_raw = tmp_path / "corrupt.ARW"
    invalid_raw.write_bytes(b"invalid garbage content")

    with pytest.raises(RuntimeError, match="Failed to extract preview"):
        RawPreviewLoader.load_preview(invalid_raw)


def test_invalid_standard_image_raises_runtime_error(tmp_path: Path):
    invalid_img = tmp_path / "corrupt.jpg"
    invalid_img.write_bytes(b"invalid garbage content")

    with pytest.raises(RuntimeError, match="Failed to load image file"):
        RawPreviewLoader.load_preview(invalid_img)


def test_preview_image_without_bytes_raises():
    p = PreviewImage(
        width=100,
        height=100,
        extraction_time_ms=1.0,
        source_format="TEST",
        is_embedded_preview=False,
        preview_bytes=None,
        _image=None,
    )
    with pytest.raises(ValueError, match="No image or preview bytes available"):
        _ = p.image


@pytest.mark.parametrize("ext", [".CR3", ".ARW", ".NEF", ".DNG"])
def test_raw_preview_extraction_benchmark_under_50ms(tmp_path: Path, mock_24mp_jpeg_bytes: bytes, ext: str):
    """Explicit Benchmark Gate: 24MP embedded preview extraction must benchmark <50ms."""
    raw_path = tmp_path / f"bench_photo{ext}"
    raw_path.write_bytes(b"mock raw file payload")

    mock_thumb = MockRawPyThumb(mock_24mp_jpeg_bytes, rawpy.ThumbFormat.JPEG)
    mock_ctx = MockRawPyContext(mock_thumb)

    with patch("rawpy.imread", return_value=mock_ctx):
        # Warmup
        _ = RawPreviewLoader.load_preview(raw_path)

        # Benchmark 10 runs
        durations_ms = []
        for _ in range(10):
            t0 = time.perf_counter()
            preview = RawPreviewLoader.load_preview(raw_path)
            durations_ms.append((time.perf_counter() - t0) * 1000.0)

        avg_duration = sum(durations_ms) / len(durations_ms)
        min_duration = min(durations_ms)

        assert preview.width == 6000
        assert preview.height == 4000
        # Verification Gate threshold requirement is < 50ms
        assert avg_duration < 50.0, f"Average extraction took {avg_duration:.2f}ms, exceeds 50ms limit"
        assert min_duration < 50.0
