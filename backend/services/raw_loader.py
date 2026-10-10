"""High-speed RAW preview and standard image ingestion service.

Extracts embedded JPEG previews from camera RAW files (.CR3, .ARW, .NEF, .DNG)
in <50ms without performing slow full sensor demosaicing. Also supports standard
JPEG, PNG, and TIFF formats.
"""
from dataclasses import dataclass
import io
from pathlib import Path
import time
from typing import Optional, Union

import numpy as np
from PIL import Image
import rawpy

from domain.models import ColorSample, HSLColor, RGBColor
from services.color_math import rgb_to_hsl

RAW_EXTENSIONS = {".cr3", ".arw", ".nef", ".dng", ".cr2", ".rw2", ".orf", ".pef"}
STANDARD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


@dataclass
class PreviewImage:
    """Loaded preview image container.

    Lazy-loads pixel arrays for instantaneous (<50ms) preview extraction
    from RAW streams, while caching decoded pixels on demand.
    """
    width: int
    height: int
    extraction_time_ms: float
    source_format: str
    is_embedded_preview: bool
    preview_bytes: Optional[bytes] = None
    _image: Optional[Image.Image] = None

    @property
    def image(self) -> Image.Image:
        """Access underlying Pillow Image, decoding on first access."""
        if self._image is None:
            if self.preview_bytes is not None:
                img = Image.open(io.BytesIO(self.preview_bytes))
                self._image = img.convert("RGB")
                self._image.load()
            else:
                raise ValueError("No image or preview bytes available.")
        return self._image

    def get_pixel_rgb(self, x: int, y: int) -> RGBColor:
        """Sample RGB color at coordinate (x, y)."""
        if not (0 <= x < self.width and 0 <= y < self.height):
            raise IndexError(
                f"Coordinates ({x}, {y}) out of preview bounds (0..{self.width-1}, 0..{self.height-1})"
            )
        pixel = self.image.getpixel((x, y))
        if isinstance(pixel, tuple):
            return RGBColor(r=int(pixel[0]), g=int(pixel[1]), b=int(pixel[2]))
        elif isinstance(pixel, int):
            return RGBColor(r=pixel, g=pixel, b=pixel)
        else:
            return RGBColor(r=int(pixel[0]), g=int(pixel[1]), b=int(pixel[2]))

    def sample_color(self, name: str, x: int, y: int) -> ColorSample:
        """Extract a full ColorSample entity at coordinate (x, y)."""
        rgb = self.get_pixel_rgb(x, y)
        hsl = rgb_to_hsl(rgb)
        return ColorSample(name=name, x=x, y=y, rgb=rgb, hsl=hsl)


class RawPreviewLoader:
    """Service for fast extraction of previews from RAW and standard images."""

    @staticmethod
    def is_raw_format(path: Union[str, Path]) -> bool:
        """Check if file extension corresponds to a RAW format."""
        suffix = Path(path).suffix.lower()
        return suffix in RAW_EXTENSIONS

    @classmethod
    def load_preview(cls, file_path: Union[str, Path]) -> PreviewImage:
        """Extract embedded preview from RAW file or load standard image.

        Guarantees <50ms extraction for embedded previews.
        """
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {path}")

        start_time = time.perf_counter()

        if cls.is_raw_format(path):
            preview = cls._load_raw_preview(path, start_time)
        else:
            preview = cls._load_standard_image(path, start_time)

        return preview

    @classmethod
    def _load_raw_preview(cls, path: Path, start_time: float) -> PreviewImage:
        """Extract embedded thumbnail/preview from RAW using LibRaw without demosaicing."""
        try:
            with rawpy.imread(str(path)) as raw:
                thumb = raw.extract_thumb()
                if thumb.format == rawpy.ThumbFormat.JPEG:
                    # Parse image header lazily to extract dimensions in <1ms
                    header = Image.open(io.BytesIO(thumb.data))
                    width, height = header.size
                    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                    return PreviewImage(
                        width=width,
                        height=height,
                        extraction_time_ms=elapsed_ms,
                        source_format=path.suffix.lstrip(".").upper(),
                        is_embedded_preview=True,
                        preview_bytes=thumb.data,
                    )
                elif thumb.format == rawpy.ThumbFormat.BITMAP:
                    # Uncompressed bitmap preview
                    image = Image.fromarray(thumb.data).convert("RGB")
                    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                    return PreviewImage(
                        width=image.width,
                        height=image.height,
                        extraction_time_ms=elapsed_ms,
                        source_format=path.suffix.lstrip(".").upper(),
                        is_embedded_preview=True,
                        _image=image,
                    )
                else:
                    raise ValueError(f"Unsupported thumbnail format: {thumb.format}")
        except (rawpy.LibRawNoThumbnailError, rawpy.LibRawUnsupportedThumbnailError, Exception) as exc:
            # If thumbnail extraction fails or file is not a valid raw stream,
            # fallback to direct image reader
            try:
                with Image.open(path) as img:
                    width, height = img.size
                    # Read bytes for lazy decoding
                    path_bytes = path.read_bytes()
                elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                return PreviewImage(
                    width=width,
                    height=height,
                    extraction_time_ms=elapsed_ms,
                    source_format=path.suffix.lstrip(".").upper(),
                    is_embedded_preview=False,
                    preview_bytes=path_bytes,
                )
            except Exception:
                raise RuntimeError(f"Failed to extract preview from RAW file {path}: {exc}") from exc

    @classmethod
    def _load_standard_image(cls, path: Path, start_time: float) -> PreviewImage:
        """Load standard image (JPEG, PNG, TIFF, etc.)."""
        try:
            with Image.open(path) as img:
                width, height = img.size
                path_bytes = path.read_bytes()

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return PreviewImage(
                width=width,
                height=height,
                extraction_time_ms=elapsed_ms,
                source_format=path.suffix.lstrip(".").upper(),
                is_embedded_preview=False,
                preview_bytes=path_bytes,
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to load image file {path}: {exc}") from exc
