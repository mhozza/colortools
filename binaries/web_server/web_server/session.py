"""Session and preview state management for web server."""
import io
from pathlib import Path
from typing import Optional
from PIL import Image

from domain.models import ColorSample
from services.raw_loader import PreviewImage, RawPreviewLoader


class AppSession:
    """Manages active image preview and color sampling state for the web server."""

    def __init__(self) -> None:
        self.current_file_path: Optional[str] = None
        self.preview_image: Optional[PreviewImage] = None
        self._preview_jpeg_cache: Optional[bytes] = None
        self.samples: list[ColorSample] = []

    def load_image(self, file_path: str | Path) -> PreviewImage:
        """Load image preview from file path."""
        path = Path(file_path).resolve()
        preview = RawPreviewLoader.load_preview(path)
        self.current_file_path = str(path)
        self.preview_image = preview
        self._preview_jpeg_cache = None
        self.samples = []
        return preview

    def load_image_bytes(self, data: bytes, filename: str) -> PreviewImage:
        """Load image preview from uploaded bytes."""
        import tempfile
        suffix = Path(filename).suffix.lower() if filename else ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        try:
            preview = RawPreviewLoader.load_preview(tmp_path)
            self.current_file_path = str(tmp_path)
            self.preview_image = preview
            self._preview_jpeg_cache = None
            self.samples = []
            return preview
        except Exception:
            if tmp_path.exists():
                tmp_path.unlink()
            raise

    def get_preview_jpeg_bytes(self) -> bytes:
        """Return JPEG bytes of current preview image, compressing if necessary."""
        if self.preview_image is None:
            raise ValueError("No image preview currently loaded.")

        if self._preview_jpeg_cache is not None:
            return self._preview_jpeg_cache

        # If preview_bytes already has JPEG data, reuse it directly
        if self.preview_image.preview_bytes is not None:
            # Check if preview_bytes is valid JPEG (starts with 0xFF 0xD8)
            if self.preview_image.preview_bytes.startswith(b"\xff\xd8"):
                self._preview_jpeg_cache = self.preview_image.preview_bytes
                return self._preview_jpeg_cache

        # Otherwise encode image to JPEG
        img = self.preview_image.image
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        self._preview_jpeg_cache = buffer.getvalue()
        return self._preview_jpeg_cache

    def sample_color(self, x: int, y: int, name: str = "Sample") -> ColorSample:
        """Sample a pixel on the currently loaded image preview."""
        if self.preview_image is None:
            raise ValueError("No image preview currently loaded.")

        sample = self.preview_image.sample_color(name=name, x=x, y=y)
        self.samples.append(sample)
        return sample

    def clear(self) -> None:
        """Clear active session state."""
        self.current_file_path = None
        self.preview_image = None
        self._preview_jpeg_cache = None
        self.samples = []
