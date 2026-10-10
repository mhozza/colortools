# Plugins Engine Documentation

The `plugins/` package contains modular plugins providing photographic color harmony evaluations and non-destructive Adobe Camera Raw / Lightroom XMP sidecar export for the Photographic Color Harmony Assistant.

---

## Directory Structure

```
plugins/
├── pyproject.toml              # Plugin package definition and test configuration
├── core_harmonies/             # Standard photographic harmony evaluation plugin
│   ├── __init__.py
│   ├── definitions.py          # Spoke offsets, photographic color naming
│   ├── engine.py               # Optimal spoke rotation, scoring, directive generation
│   └── plugin.py               # CoreHarmoniesPlugin implementing PluginPort
├── lightroom_xmp/              # Adobe Camera Raw / Lightroom sidecar generator
│   ├── __init__.py
│   ├── camera_raw.py           # 8-channel HSL mapping and delta-to-slider scaling
│   ├── generator.py            # XML structure generator and non-destructive sidecar writer
│   └── plugin.py               # LightroomXmpPlugin implementing PluginPort & PresetWriterPort
└── tests/                      # Unit and contract tests for plugins
    ├── test_core_harmonies.py  # Spoke geometry, scoring, rankings, and directives tests
    └── test_lightroom_xmp.py   # Sidecar generation, XML validity, and file safety tests
```

---

## Plugin Architecture & Contracts

All plugins conform to the base interface in `backend/ports/plugin.py`:

```python
class PluginPort(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def initialize(self) -> None: ...

    @abstractmethod
    def analyze(self, samples: Sequence[ColorSample]) -> dict[str, Any]: ...
```

---

## Core Harmonies (`core_harmonies/`)

### Supported Harmonies & Canonical Spoke Geometry

1. **Complementary**: $180^\circ$ separation.
2. **Split-Complementary**: $150^\circ$ and $210^\circ$ separation from base hue.
3. **Triadic**: $120^\circ$ and $240^\circ$ separation.
4. **Analogous**: $\pm 30^\circ$ separation.
5. **Square / Tetradic**: $90^\circ, 180^\circ, 270^\circ$ separation.

### Spoke Optimization & Scoring

The engine rotates harmony spokes to find the optimal global alignment for any arbitrary cluster of sampled points, or accepts an explicit `key_hue_override`.

- **Match Score ($0 - 100\%$)**: Calculated based on the average normalized circular distance of sample points to their nearest assigned spokes.
- **Directional Directives**: Each sample receives an actionable directive with signed angular shift and photographic color name (e.g. `Shift sample 'Tower in shadow' +12.0° toward Orange`).

---

## Lightroom XMP Generator (`lightroom_xmp/`)

### Non-Destructive Sidecar Guarantee

The generator strictly outputs `.xmp` metadata sidecars (`photo.xmp` alongside `photo.CR3`/`photo.ARW`) and never alters or overwrites the original sensor data.

### 8-Channel Camera Raw Mapping

Maps sample hue shifts to Adobe Camera Raw's standard 8 HSL channels:
- `crs:HueAdjustmentRed`
- `crs:HueAdjustmentOrange`
- `crs:HueAdjustmentYellow`
- `crs:HueAdjustmentGreen`
- `crs:HueAdjustmentAqua`
- `crs:HueAdjustmentBlue`
- `crs:HueAdjustmentPurple`
- `crs:HueAdjustmentMagenta`

---

## Verification & Testing

Run all plugin unit tests and coverage verification:

```bash
uv run pytest --cov=core_harmonies --cov=lightroom_xmp --cov-report=term-missing plugins/tests/
```
