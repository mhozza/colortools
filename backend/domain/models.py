"""Pure domain models for color analysis and harmony."""
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field


class RGBColor(BaseModel):
    """Represents an sRGB color with integer components [0, 255]."""
    model_config = ConfigDict(frozen=True)

    r: int = Field(..., ge=0, le=255, description="Red component [0, 255]")
    g: int = Field(..., ge=0, le=255, description="Green component [0, 255]")
    b: int = Field(..., ge=0, le=255, description="Blue component [0, 255]")

    def as_tuple(self) -> tuple[int, int, int]:
        """Return RGB as a 3-tuple."""
        return (self.r, self.g, self.b)

    def as_hex(self) -> str:
        """Return hex representation #RRGGBB."""
        return f"#{self.r:02x}{self.g:02x}{self.b:02x}"


class HSLColor(BaseModel):
    """Represents a color in HSL color space.

    Hue is in degrees [0, 360).
    Saturation is in [0.0, 1.0].
    Lightness is in [0.0, 1.0].
    """
    model_config = ConfigDict(frozen=True)

    h: float = Field(..., ge=0.0, lt=360.0, description="Hue angle in degrees [0, 360)")
    s: float = Field(..., ge=0.0, le=1.0, description="Saturation [0.0, 1.0]")
    l: float = Field(..., ge=0.0, le=1.0, description="Lightness [0.0, 1.0]")

    def as_tuple(self) -> tuple[float, float, float]:
        """Return HSL as a 3-tuple."""
        return (self.h, self.s, self.l)


class PolarPoint(BaseModel):
    """Represents a point on the polar vectorscope wheel.

    theta: Hue angle in degrees [0, 360).
    r: Radial saturation coordinate [0.0, 1.0].
    """
    model_config = ConfigDict(frozen=True)

    theta: float = Field(..., ge=0.0, lt=360.0, description="Hue angle in degrees [0, 360)")
    r: float = Field(..., ge=0.0, le=1.0, description="Radius / saturation [0.0, 1.0]")

    def as_tuple(self) -> tuple[float, float]:
        """Return (theta, r) coordinates."""
        return (self.theta, self.r)

    def pure_hue_projection(self) -> "PolarPoint":
        """Project point to the perimeter (r = 1.0) while preserving theta."""
        return PolarPoint(theta=self.theta, r=1.0)


class ColorSample(BaseModel):
    """A sampled point on an image preview with spatial and color data."""
    model_config = ConfigDict(frozen=True)

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique sample identifier")
    name: str = Field(..., min_length=1, description="User-editable label (e.g., 'Wall', 'Sky')")
    x: int = Field(..., ge=0, description="Pixel coordinate x on image preview")
    y: int = Field(..., ge=0, description="Pixel coordinate y on image preview")
    rgb: RGBColor = Field(..., description="Sampled sRGB color")
    hsl: HSLColor = Field(..., description="Corresponding HSL color")

    def to_polar(self) -> PolarPoint:
        """Convert sample to polar vectorscope coordinate."""
        return PolarPoint(theta=self.hsl.h, r=self.hsl.s)
