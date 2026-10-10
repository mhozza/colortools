# Backend Engine Documentation

The `backend/` package encapsulates core domain entities, colorimetry math, image preview extraction, and port contracts for the Photographic Color Harmony Assistant.

---

## Directory Structure

```
backend/
├── pyproject.toml         # Package definition and test configuration
├── domain/                # Pure business entities (no framework dependencies)
│   ├── __init__.py
│   └── models.py          # RGBColor, HSLColor, PolarPoint, ColorSample
├── services/              # Pure computational services
│   ├── __init__.py
│   ├── color_math.py      # sRGB/HSL/Polar conversions, circular distances
│   └── raw_loader.py      # LibRaw fast preview extractor (<50ms for 24MP)
├── ports/                 # Clean architecture interface definitions
│   ├── __init__.py
│   └── interfaces.py      # ImageLoaderPort, PresetWriterPort, PluginPort
└── tests/                 # Unit tests and performance benchmarks
    ├── test_domain_models.py
    ├── test_color_math.py
    ├── test_raw_loader.py
    └── test_ports.py
```

---

## Domain Models (`domain/models.py`)

### `RGBColor`
Represents an integer sRGB color $[0, 255]$ with validation:
- Attributes: `r`, `g`, `b` (integers $0 \le c \le 255$)
- Methods:
  - `as_tuple() -> tuple[int, int, int]`
  - `as_hex() -> str` (e.g. `"#ff8000"`)

### `HSLColor`
Represents a color in cylindrical HSL space:
- Attributes:
  - `h`: Hue angle in degrees $[0.0, 360.0)$
  - `s`: Saturation in $[0.0, 1.0]$
  - `l`: Lightness in $[0.0, 1.0]$
- Methods:
  - `as_tuple() -> tuple[float, float, float]`

### `PolarPoint`
Represents a plotted coordinate on the vectorscope color wheel:
- Attributes:
  - `theta`: Hue angle in degrees $[0.0, 360.0)$
  - `r`: Radial distance representing saturation in $[0.0, 1.0]$
- Methods:
  - `as_tuple() -> tuple[float, float]`
  - `pure_hue_projection() -> PolarPoint`: Projects low-saturation points outward to the wheel perimeter ($r = 1.0$) while preserving hue angle $\theta$.

### `ColorSample`
An interactive sampled point on a photo preview:
- Attributes: `id` (UUID string), `name` (e.g., `"Wall"`, `"Highlight"`), `x`, `y`, `rgb` (`RGBColor`), `hsl` (`HSLColor`).
- Methods:
  - `to_polar() -> PolarPoint`: Converts sample coordinates to polar vectorscope space.

---

## Services (`services/`)

### Color Math (`services/color_math.py`)
- `rgb_to_hsl(rgb: RGBColor) -> HSLColor`: Exact colorimetric conversion from sRGB to HSL.
- `hsl_to_rgb(hsl: HSLColor) -> RGBColor`: Exact conversion from HSL back to sRGB.
- `hsl_to_polar(hsl: HSLColor) -> PolarPoint`: Maps hue and saturation to polar vectorscope coordinates.
- `polar_to_hsl(polar: PolarPoint, l: float = 0.5) -> HSLColor`: Maps polar vectorscope coordinates back to HSL with custom lightness.
- `circular_distance(angle1: float, angle2: float) -> float`: Calculates the shortest circular arc distance between two angles on $[0, 360)$, returning a value in $[0, 180]$.
- `signed_circular_delta(source_angle: float, target_angle: float) -> float`: Computes the signed directional angular shift from `source_angle` to `target_angle` in $(-180, 180]$.
- `polar_to_cartesian(point: PolarPoint) -> tuple[float, float]`: Converts polar points into Cartesian $(x, y)$ coordinates.
- `cartesian_to_polar(x: float, y: float) -> PolarPoint`: Reconstructs polar coordinates from $(x, y)$.

### RAW & Image Preview Loader (`services/raw_loader.py`)
- **`RawPreviewLoader.load_preview(file_path)`**: Fast extraction of embedded previews from RAW cameras (`.CR3`, `.ARW`, `.NEF`, `.DNG`) using LibRaw without doing costly full-sensor demosaicing.
  - Benchmarked at **$<50\,\text{ms}$** on 24MP images ($6000 \times 4000$).
  - Supports standard fallback formats: `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff`, `.webp`.
- **`PreviewImage`**: Encapsulates dimensions, extraction duration, and lazy pixel access:
  - `get_pixel_rgb(x, y) -> RGBColor`: Retrieves pixel RGB values with bounds checking.
  - `sample_color(name, x, y) -> ColorSample`: Extracts a complete `ColorSample` entity with automatic HSL conversion.

---

## Ports (`ports/interfaces.py`)

Provides abstract contracts adhering to Clean Architecture:
- **`ImageLoaderPort`**: Base contract for image/preview loading adapters.
- **`PresetWriterPort`**: Base contract for exporting presets or `.xmp` sidecar metadata.
- **`PluginPort`**: Base contract for harmony evaluation and analysis plugins:
  - `name`: Unique plugin name.
  - `initialize()`: Initialization hook.
  - `analyze(samples: Sequence[ColorSample]) -> dict[str, Any]`: Evaluation hook.

---

## Usage Examples

### Example: Loading an image and sampling colors

```python
from services.raw_loader import RawPreviewLoader

# Load preview from a RAW or JPEG file
preview = RawPreviewLoader.load_preview("photos/portrait.CR3")
print(f"Loaded {preview.width}x{preview.height} in {preview.extraction_time_ms:.2f}ms")

# Sample a point clicked by the user
sample = preview.sample_color(name="Sky", x=1200, y=450)
print(f"Sampled {sample.name}: RGB={sample.rgb.as_hex()} HSL={sample.hsl.as_tuple()}")

# Get vectorscope polar coordinates and Pure Hue projection
polar = sample.to_polar()
pure_hue = polar.pure_hue_projection()
print(f"Polar: theta={polar.theta} deg, r={polar.r} -> Pure Hue: r={pure_hue.r}")
```

### Example: Computing Angular Distance Between Samples

```python
from services.color_math import circular_distance, signed_circular_delta

angle_sample1 = 350.0  # Red
angle_sample2 = 20.0   # Orange

dist = circular_distance(angle_sample1, angle_sample2)
print(f"Shortest angular distance: {dist} degrees")  # 30.0

delta = signed_circular_delta(angle_sample1, angle_sample2)
print(f"Shift required from sample 1 to sample 2: {delta} degrees")  # +30.0
```
