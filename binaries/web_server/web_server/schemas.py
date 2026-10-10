"""Pydantic request and response schemas for the web server API."""
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field

from domain.models import ColorSample
from ports.plugin import HarmonyEvaluationResult, SpokeDirective


class ImageMetadataResponse(BaseModel):
    """Metadata response for a loaded image preview."""
    model_config = ConfigDict(frozen=True)

    file_path: str = Field(..., description="Absolute path to the source image file")
    preview_url: str = Field(..., description="URL endpoint serving the extracted preview JPEG")
    width: int = Field(..., ge=1, description="Preview image width in pixels")
    height: int = Field(..., ge=1, description="Preview image height in pixels")
    format: str = Field(..., description="Source image format (e.g. CR3, ARW, JPEG)")
    is_embedded_preview: bool = Field(..., description="Whether preview was extracted from embedded RAW thumbnail")
    extraction_time_ms: float = Field(..., ge=0.0, description="Preview extraction duration in milliseconds")


class SampleColorRequest(BaseModel):
    """Request payload for sampling a pixel coordinate."""
    model_config = ConfigDict(frozen=True)

    x: int = Field(..., ge=0, description="Pixel coordinate x on image preview")
    y: int = Field(..., ge=0, description="Pixel coordinate y on image preview")
    name: Optional[str] = Field(default="Sample", min_length=1, description="Optional label for the sampled point")


class HarmonyAnalyzeRequest(BaseModel):
    """Request payload for evaluating samples against photographic harmonies."""
    model_config = ConfigDict(frozen=True)

    samples: list[ColorSample] = Field(..., min_length=1, description="Active color sample points to evaluate")
    key_hue_override: Optional[float] = Field(default=None, ge=0.0, lt=360.0, description="Optional fixed key hue angle [0, 360)")


class HarmonyAnalyzeResponse(BaseModel):
    """Response containing ranked color harmony evaluation results."""
    model_config = ConfigDict(frozen=True)

    plugin: str = Field(..., description="Evaluating plugin name")
    sample_count: int = Field(..., ge=0, description="Number of samples evaluated")
    harmonies: list[HarmonyEvaluationResult] = Field(..., description="Ranked list of evaluated harmonies")
    top_harmony: Optional[HarmonyEvaluationResult] = Field(default=None, description="Highest scoring harmony")


class ExportXmpRequest(BaseModel):
    """Request payload for writing/updating an Adobe Camera Raw .xmp sidecar."""
    model_config = ConfigDict(frozen=True)

    photo_path: str = Field(..., description="Path to original photo file (.CR3, .ARW, .DNG, .JPG)")
    directives: Optional[list[SpokeDirective]] = Field(default=None, description="Spoke directives from harmony analysis")
    adjustments: Optional[dict[str, Any]] = Field(default=None, description="Direct Camera Raw adjustments dictionary")


class ExportXmpResponse(BaseModel):
    """Response returned upon successful .xmp sidecar write."""
    model_config = ConfigDict(frozen=True)

    photo_path: str = Field(..., description="Path to original photo file")
    xmp_path: str = Field(..., description="Path to created/updated .xmp sidecar file")
    success: bool = Field(default=True, description="Export success status")
    adjustments_applied: dict[str, Any] = Field(default_factory=dict, description="Camera Raw parameters written to sidecar")
