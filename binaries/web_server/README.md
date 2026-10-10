# Local API Server & IPC (`binaries/web_server/`)

FastAPI and WebSocket server providing local REST and real-time IPC endpoints for RAW preview ingestion, interactive color sampling, photographic color harmony analysis, and Adobe Camera Raw / Lightroom XMP sidecar export.

---

## Architecture & Responsibilities

- **FastAPI Application Factory (`web_server/app.py`)**: REST routes, CORS middleware, file upload handling, and WebSocket route mounting.
- **Pydantic Schemas (`web_server/schemas.py`)**: Request and response contracts for all endpoints with strict input validation and serialization.
- **Session & Preview State (`web_server/session.py`)**: Session management caching active image preview bytes and collected color samples.
- **WebSocket IPC Manager (`web_server/ws_manager.py`)**: Connection pool managing client sockets, handling bi-directional messages, and broadcasting events.

---

## API Endpoints

### 1. Preview Ingestion
- `POST /api/image/load`: Loads preview from local file path (JSON `{"file_path": "..."}`) or form multipart file upload. Returns metadata (`width`, `height`, `format`, `is_embedded_preview`, `extraction_time_ms`).
- `GET /api/image/preview`: Serves extracted JPEG preview bytes (`image/jpeg`).

### 2. Interactive Color Sampling
- `POST /api/image/sample`: Samples pixel color at `(x, y)` from the loaded preview image and returns a `ColorSample` entity with exact sRGB, HSL, and polar wheel coordinates.

### 3. Photographic Harmony Evaluation
- `POST /api/harmony/analyze`: Evaluates active `ColorSample` points against registered photographic harmonies (Complementary, Split-Complementary, Triadic, Analogous, Square/Tetradic) and computes percentage match scores and spoke directives.

### 4. Non-Destructive Lightroom XMP Export
- `POST /api/export/xmp`: Maps spoke directives or direct adjustments to Adobe Camera Raw HSL parameters and writes an `.xmp` sidecar alongside the photo without modifying raw files.

### 5. WebSocket Live IPC
- `GET /ws/live`: Real-time WebSocket connection for bidirectional IPC. Broadcasts events on image load, sample addition, harmony evaluation, and XMP export. Handles ping/pong, echo, and custom commands.

---

## Running the Server

Start the local server with Uvicorn:

```bash
uv run uvicorn web_server.app:app --host 127.0.0.1 --port 8000 --reload
```

---

## Verification & Testing

Run the test suite:

```bash
uv run pytest --cov=web_server --cov-report=term-missing binaries/web_server/tests/
```
