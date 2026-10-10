# Photographic Color Harmony Assistant (`colortools`)

A professional photographic color harmony and vectorscope analysis assistant inspired by *The Color Lab* workflow. Analyze colors in 24MP RAW and JPEG photographs, project points onto an interactive polar vectorscope wheel, evaluate color harmonies, and export adjustments non-destructively to Adobe Lightroom Classic.

---

## Architecture Overview

Strictly adheres to **Clean Architecture** principles across a monorepo structure:

```
├── pyproject.toml            # Root workspace configuration managed by uv
├── uv.lock                   # Pinned dependency lockfile (Python 3.14+)
│
├── backend/                  # Core backend engine (Milestone 1)
│   ├── pyproject.toml        # Backend package definition managed by uv
│   ├── domain/               # Pure immutable models (RGBColor, HSLColor, PolarPoint, ColorSample)
│   ├── services/             # High-speed preview extraction, color space math, circular distance
│   ├── ports/                # Abstract contracts (ImageLoaderPort, PresetWriterPort, PluginPort)
│   └── tests/                # Test suite with >=95% coverage and performance benchmarks
│
├── plugins/                  # Modular harmony scoring & export plugins (Milestone 2)
│   ├── core_harmonies/       # Spoke calculations and harmony matching
│   └── lightroom_xmp/        # Non-destructive XMP metadata generation
│
├── frontend/                 # Reactive web frontend with Canvas vectorscope (Milestone 4)
└── binaries/                 # Packaging targets (web server, Tauri desktop, Lightroom plugin)
```

---

## Toolchain & Requirements

- **Python**: `>=3.14` managed via [`uv`](https://github.com/astral-sh/uv)
- **Version Control**: [`jj`](https://github.com/martinvonz/jj) (Jujutsu)

---

## Getting Started

### 1. Environment Setup

Install project dependencies using `uv`:

```bash
uv sync --all-packages --all-extras
```

### 2. Running Backend Tests & Coverage

Run the pytest suite with coverage verification:

```bash
uv run --directory backend pytest -v --cov=domain --cov=services --cov=ports --cov-report=term-missing
```

### 3. Running 24MP Preview Benchmarks

Run the dedicated RAW embedded preview benchmark test:

```bash
uv run --directory backend pytest -k "benchmark"
```

Extraction completes in $<50\,\text{ms}$ for 24MP RAW files (`.CR3`, `.ARW`, `.NEF`, `.DNG`).

---

## Implemented Milestones

### Milestone 1: Core Domain & Color Engine (`backend/`)
- **Domain Models (`backend/domain/`)**: Immutable Pydantic models for colors and sample points without external web or UI dependencies.
- **Color Mathematics (`backend/services/color_math.py`)**: Exact conversions between sRGB, HSL, and polar coordinates $(\theta, r)$, plus circular distance and signed deltas on $[0, 360)$.
- **Fast RAW Preview Ingestion (`backend/services/raw_loader.py`)**: High-speed extraction of embedded previews using LibRaw (`rawpy`) without expensive full sensor demosaicing.
- **Port Interfaces (`backend/ports/`)**: Abstract interfaces decoupling core domain logic from loaders, preset writers, and plugins.
