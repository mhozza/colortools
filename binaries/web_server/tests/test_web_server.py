"""Comprehensive integration tests for REST and WebSocket endpoints in binaries/web_server."""
import io
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest

from domain.models import ColorSample, HSLColor, RGBColor
from ports.plugin import SpokeDirective
from web_server.app import create_app
from web_server.session import AppSession
from web_server.ws_manager import ConnectionManager


@pytest.fixture
def sample_test_image(tmp_path: Path) -> Path:
    """Create a temporary test image with distinct quadrant colors."""
    img_path = tmp_path / "test_photo.png"
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    arr[0:50, 0:50] = [255, 0, 0]        # Top-left: Pure Red
    arr[0:50, 50:100] = [0, 255, 255]    # Top-right: Pure Cyan (Complementary to Red)
    arr[50:100, 0:50] = [0, 255, 0]      # Bottom-left: Pure Green
    arr[50:100, 50:100] = [0, 0, 255]    # Bottom-right: Pure Blue
    Image.fromarray(arr).save(img_path, format="PNG")
    return img_path


@pytest.fixture
def client() -> TestClient:
    """Create test client with fresh session and ws manager."""
    session = AppSession()
    ws_mgr = ConnectionManager()
    app = create_app(session=session, ws_manager=ws_mgr)
    return TestClient(app)


def test_health_check(client: TestClient) -> None:
    """Verify GET /health returns 200 and status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.0"}


def test_load_image_via_json(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/image/load accepts file_path via JSON and returns valid metadata."""
    payload = {"file_path": str(sample_test_image)}
    response = client.post("/api/image/load", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["file_path"] == str(sample_test_image.resolve())
    assert data["preview_url"] == "/api/image/preview"
    assert data["width"] == 100
    assert data["height"] == 100
    assert data["format"] == "PNG"
    assert data["is_embedded_preview"] is False
    assert data["extraction_time_ms"] >= 0.0


def test_load_image_via_form(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/image/load accepts file_path via form data."""
    response = client.post("/api/image/load", data={"file_path": str(sample_test_image)})
    assert response.status_code == 200
    data = response.json()
    assert data["width"] == 100
    assert data["height"] == 100


def test_load_image_via_upload(client: TestClient) -> None:
    """Verify POST /api/image/load accepts multipart file upload."""
    buf = io.BytesIO()
    arr = np.full((60, 80, 3), (200, 100, 50), dtype=np.uint8)
    Image.fromarray(arr).save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/api/image/load",
        files={"file": ("uploaded.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["width"] == 80
    assert data["height"] == 60


def test_load_image_not_found(client: TestClient) -> None:
    """Verify POST /api/image/load returns 404 for non-existent path."""
    response = client.post("/api/image/load", json={"file_path": "/nonexistent/photo.jpg"})
    assert response.status_code == 404


def test_load_image_no_input(client: TestClient) -> None:
    """Verify POST /api/image/load returns 422 if neither file nor file_path is provided."""
    response = client.post("/api/image/load")
    assert response.status_code == 422


def test_get_preview_endpoint(client: TestClient, sample_test_image: Path) -> None:
    """Verify GET /api/image/preview returns JPEG image bytes."""
    # Before loading: should return 404
    resp_before = client.get("/api/image/preview")
    assert resp_before.status_code == 404

    # Load image
    client.post("/api/image/load", json={"file_path": str(sample_test_image)})

    # Fetch preview
    resp_after = client.get("/api/image/preview")
    assert resp_after.status_code == 200
    assert resp_after.headers["content-type"] == "image/jpeg"
    assert len(resp_after.content) > 0
    # Confirm it is valid JPEG header
    assert resp_after.content.startswith(b"\xff\xd8")


def test_sample_image_endpoint(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/image/sample samples pixel at coordinates and returns ColorSample schema."""
    client.post("/api/image/load", json={"file_path": str(sample_test_image)})

    # Sample top-left quadrant (Pure Red: 255, 0, 0)
    response = client.post(
        "/api/image/sample",
        json={"x": 10, "y": 10, "name": "Red Pin"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Red Pin"
    assert data["x"] == 10
    assert data["y"] == 10
    assert data["rgb"]["r"] == 255
    assert data["rgb"]["g"] == 0
    assert data["rgb"]["b"] == 0
    assert data["hsl"]["h"] == pytest.approx(0.0, abs=1.0)
    assert data["hsl"]["s"] == pytest.approx(1.0, abs=0.05)


def test_sample_image_out_of_bounds(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/image/sample returns 422 when coordinates exceed image boundaries."""
    client.post("/api/image/load", json={"file_path": str(sample_test_image)})
    response = client.post("/api/image/sample", json={"x": 500, "y": 500, "name": "OutOfBounds"})
    assert response.status_code == 422


def test_sample_image_no_image_loaded(client: TestClient) -> None:
    """Verify POST /api/image/sample returns 400 when no image is loaded."""
    response = client.post("/api/image/sample", json={"x": 10, "y": 10})
    assert response.status_code == 400


def test_harmony_analyze_endpoint(client: TestClient) -> None:
    """Verify POST /api/harmony/analyze evaluates samples and returns ranked harmonies and directives."""
    sample_red = ColorSample(
        name="Red Sample",
        x=10,
        y=10,
        rgb=RGBColor(r=255, g=0, b=0),
        hsl=HSLColor(h=0.0, s=1.0, l=0.5),
    )
    sample_cyan = ColorSample(
        name="Cyan Sample",
        x=80,
        y=10,
        rgb=RGBColor(r=0, g=255, b=255),
        hsl=HSLColor(h=180.0, s=1.0, l=0.5),
    )

    req_payload = {
        "samples": [sample_red.model_dump(), sample_cyan.model_dump()],
        "key_hue_override": 0.0,
    }
    response = client.post("/api/harmony/analyze", json=req_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["plugin"] == "core_harmonies"
    assert data["sample_count"] == 2
    assert len(data["harmonies"]) > 0
    assert data["top_harmony"]["harmony_name"] == "Complementary"
    assert data["top_harmony"]["match_score"] == pytest.approx(100.0, abs=0.01)
    assert len(data["top_harmony"]["directives"]) == 2


def test_export_xmp_endpoint_with_directives(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/export/xmp generates and writes non-destructive .xmp sidecar."""
    directive = SpokeDirective(
        sample_id="sample-1",
        sample_name="Sky",
        current_hue=210.0,
        target_hue=220.0,
        delta_degrees=10.0,
        target_color_name="Blue",
        instruction="Shift sample Sky +10.0° toward Blue",
    )

    req_payload = {
        "photo_path": str(sample_test_image),
        "directives": [directive.model_dump()],
    }
    response = client.post("/api/export/xmp", json=req_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["photo_path"] == str(sample_test_image.resolve())

    expected_xmp = sample_test_image.with_suffix(".xmp")
    assert data["xmp_path"] == str(expected_xmp.resolve())
    assert expected_xmp.is_file()

    # Verify content of created XMP
    xmp_content = expected_xmp.read_text(encoding="utf-8")
    assert 'xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"' in xmp_content
    assert "crs:HueAdjustment" in xmp_content


def test_export_xmp_photo_not_found(client: TestClient) -> None:
    """Verify POST /api/export/xmp returns 404 if photo file does not exist."""
    response = client.post(
        "/api/export/xmp",
        json={"photo_path": "/invalid/nonexistent_photo.jpg"},
    )
    assert response.status_code == 404


def test_websocket_live_connection_and_messaging(client: TestClient) -> None:
    """Verify WebSocket /ws/live connects, exchanges messages, and handles bi-directional IPC."""
    with client.websocket_connect("/ws/live") as websocket:
        # Initial greeting from server
        init_msg = websocket.receive_json()
        assert init_msg["type"] == "connected"

        # Test ping -> pong
        websocket.send_json({"type": "ping"})
        pong_msg = websocket.receive_json()
        assert pong_msg["type"] == "pong"

        # Test echo
        websocket.send_json({"type": "echo", "payload": {"foo": "bar"}})
        echo_msg = websocket.receive_json()
        assert echo_msg["type"] == "echo"
        assert echo_msg["payload"] == {"foo": "bar"}

        # Test custom message ack
        websocket.send_json({"type": "custom_sync", "val": 42})
        ack_msg = websocket.receive_json()
        assert ack_msg["type"] == "ack"
        assert ack_msg["received_type"] == "custom_sync"


def test_export_xmp_endpoint_with_direct_adjustments(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/export/xmp supports direct adjustments dictionary."""
    req_payload = {
        "photo_path": str(sample_test_image),
        "adjustments": {"crs:HueAdjustmentRed": 15, "crs:HueAdjustmentBlue": -20},
    }
    response = client.post("/api/export/xmp", json=req_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["adjustments_applied"]["crs:HueAdjustmentRed"] == 15
    assert data["adjustments_applied"]["crs:HueAdjustmentBlue"] == -20


def test_websocket_broadcast_on_api_events(client: TestClient, sample_test_image: Path) -> None:
    """Verify API actions broadcast events over active WebSocket connections in real time."""
    with client.websocket_connect("/ws/live") as websocket:
        init_msg = websocket.receive_json()
        assert init_msg["type"] == "connected"

        # Action: load image
        client.post("/api/image/load", json={"file_path": str(sample_test_image)})
        ws_event = websocket.receive_json()
        assert ws_event["type"] == "image_loaded"
        assert ws_event["data"]["width"] == 100

        # Action: sample point
        sample_resp = client.post("/api/image/sample", json={"x": 5, "y": 5, "name": "P1"})
        ws_event = websocket.receive_json()
        assert ws_event["type"] == "color_sampled"
        assert ws_event["data"]["name"] == "P1"

        # Action: analyze harmony
        sample_data = sample_resp.json()
        client.post("/api/harmony/analyze", json={"samples": [sample_data]})
        ws_event = websocket.receive_json()
        assert ws_event["type"] == "harmony_analyzed"
        assert ws_event["data"]["plugin"] == "core_harmonies"

        # Action: export XMP
        client.post("/api/export/xmp", json={
            "photo_path": str(sample_test_image),
            "adjustments": {"crs:HueAdjustmentRed": 10},
        })
        ws_event = websocket.receive_json()
        assert ws_event["type"] == "xmp_exported"
        assert ws_event["data"]["success"] is True


def test_clear_image_endpoint(client: TestClient, sample_test_image: Path) -> None:
    """Verify POST /api/image/clear resets session image state and subsequent previews/samples fail."""
    client.post("/api/image/load", json={"file_path": str(sample_test_image)})
    assert client.get("/api/image/preview").status_code == 200

    resp = client.post("/api/image/clear")
    assert resp.status_code == 200
    assert resp.json() == {"status": "cleared"}

    # Subsequent preview must return 404
    assert client.get("/api/image/preview").status_code == 404

    # Subsequent sample must return 400
    sample_resp = client.post("/api/image/sample", json={"x": 10, "y": 10})
    assert sample_resp.status_code == 400


def test_static_spa_root_served(client: TestClient, tmp_path: Path) -> None:
    """Verify GET / returns 200 OK with text/html serving the SPA entrypoint."""
    repo_root = Path(__file__).resolve().parents[3]
    real_dist = repo_root / "frontend" / "dist"
    if real_dist.is_dir() and (real_dist / "index.html").is_file():
        response = client.get("/")
    else:
        # Isolated mock dist when frontend has not been pre-built
        mock_dist = tmp_path / "mock_dist"
        mock_dist.mkdir(parents=True, exist_ok=True)
        (mock_dist / "index.html").write_text(
            '<!doctype html><html lang="en"><head><title>Photographic Color Harmony Assistant</title></head>'
            '<body><div id="root"></div></body></html>',
            encoding="utf-8",
        )
        mock_app = create_app(static_dir=mock_dist)
        mock_client = TestClient(mock_app)
        response = mock_client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert '<div id="root">' in response.text
    assert "<title>Photographic Color Harmony Assistant</title>" in response.text


def test_static_assets_served(client: TestClient, tmp_path: Path) -> None:
    """Verify static assets under /assets/ are served with correct MIME types (CSS, JS, images)."""
    repo_root = Path(__file__).resolve().parents[3]
    assets_dir = repo_root / "frontend" / "dist" / "assets"
    if assets_dir.is_dir() and any(assets_dir.iterdir()):
        css_files = list(assets_dir.glob("*.css"))
        js_files = list(assets_dir.glob("*.js"))
        assert len(css_files) > 0, "No CSS files found in built assets directory"
        assert len(js_files) > 0, "No JS files found in built assets directory"
        css_resp = client.get(f"/assets/{css_files[0].name}")
        assert css_resp.status_code == 200
        assert "text/css" in css_resp.headers["content-type"]
        js_resp = client.get(f"/assets/{js_files[0].name}")
        assert js_resp.status_code == 200
        assert "javascript" in js_resp.headers["content-type"]

    # Isolated test directory verifying JS, CSS, and image MIME types explicitly
    test_dist = tmp_path / "mock_dist_assets"
    (test_dist / "assets").mkdir(parents=True)
    (test_dist / "index.html").write_text("<!doctype html><html></html>", encoding="utf-8")
    (test_dist / "assets" / "style.css").write_text("body { margin: 0; }", encoding="utf-8")
    (test_dist / "assets" / "bundle.js").write_text("console.log('test');", encoding="utf-8")
    (test_dist / "assets" / "icon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"></svg>', encoding="utf-8")
    test_app = create_app(static_dir=test_dist)
    test_client = TestClient(test_app)
    css_resp = test_client.get("/assets/style.css")
    assert css_resp.status_code == 200
    assert "text/css" in css_resp.headers["content-type"]
    js_resp = test_client.get("/assets/bundle.js")
    assert js_resp.status_code == 200
    assert "javascript" in js_resp.headers["content-type"]
    svg_resp = test_client.get("/assets/icon.svg")
    assert svg_resp.status_code == 200
    assert "image/svg+xml" in svg_resp.headers["content-type"]


def test_static_dir_disabled_flag(caplog: pytest.LogCaptureFixture) -> None:
    """Verify static_dir=False disables static mount without emitting missing-assets warning."""
    with caplog.at_level("WARNING"):
        app = create_app(static_dir=False)
    assert "Frontend static assets not found" not in caplog.text
    client = TestClient(app)
    assert client.get("/").status_code == 404
    assert client.get("/health").status_code == 200


def test_static_nonexistent_route(client: TestClient) -> None:
    """Verify nonexistent paths return 404 status."""
    response = client.get("/nonexistent/file.txt")
    assert response.status_code == 404


def test_static_mount_non_get_method_rejected(tmp_path: Path) -> None:
    """Verify non-GET/HEAD HTTP methods against static root mount return 405 Method Not Allowed."""
    test_dist = tmp_path / "mock_dist_methods"
    test_dist.mkdir(parents=True, exist_ok=True)
    (test_dist / "index.html").write_text("<!doctype html><html><body>SPA</body></html>", encoding="utf-8")
    app = create_app(static_dir=test_dist)
    client = TestClient(app)
    post_resp = client.post("/")
    assert post_resp.status_code == 405


def test_route_precedence_over_static_mount(sample_test_image: Path, tmp_path: Path) -> None:
    """Verify /health, /api/..., and /ws/live retain precedence over static mount even with colliding static files."""
    mock_dist = tmp_path / "mock_dist_precedence"
    mock_dist.mkdir(parents=True, exist_ok=True)
    (mock_dist / "index.html").write_text("<!doctype html><html><body>SPA</body></html>", encoding="utf-8")
    # Create static files that directly collide with API route paths
    (mock_dist / "health").write_text("static-health-collision", encoding="utf-8")
    (mock_dist / "api").mkdir(parents=True, exist_ok=True)
    ((mock_dist / "api") / "image").mkdir(parents=True, exist_ok=True)
    ((mock_dist / "api" / "image") / "preview").write_text("static-preview-collision", encoding="utf-8")

    session = AppSession()
    ws_mgr = ConnectionManager()
    app = create_app(session=session, ws_manager=ws_mgr, static_dir=mock_dist)
    target_client = TestClient(app)

    # /health must return JSON from FastAPI route, NOT static file contents
    health_resp = target_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.headers["content-type"].startswith("application/json")
    assert health_resp.json() == {"status": "ok", "version": "0.1.0"}
    assert "static-health-collision" not in health_resp.text

    # /api/image/preview returns 404 JSON when no image is loaded, NOT static file contents
    preview_resp = target_client.get("/api/image/preview")
    assert preview_resp.status_code == 404
    assert preview_resp.headers["content-type"].startswith("application/json")
    assert "static-preview-collision" not in preview_resp.text

    # API actions work normally
    load_resp = target_client.post("/api/image/load", json={"file_path": str(sample_test_image)})
    assert load_resp.status_code == 200

    # WebSocket connection works normally
    with target_client.websocket_connect("/ws/live") as websocket:
        init_msg = websocket.receive_json()
        assert init_msg["type"] == "connected"


def test_server_boots_cleanly_when_dist_missing(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Verify server boots cleanly without crashing when frontend/dist is missing."""
    nonexistent_dir = tmp_path / "does_not_exist"
    session = AppSession()
    ws_mgr = ConnectionManager()

    with caplog.at_level("WARNING"):
        app = create_app(session=session, ws_manager=ws_mgr, static_dir=nonexistent_dir)

    assert "Frontend static assets not found" in caplog.text

    fallback_client = TestClient(app)
    # GET / returns 404 when dist is missing
    root_resp = fallback_client.get("/")
    assert root_resp.status_code == 404

    # API routes still functional
    health_resp = fallback_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json() == {"status": "ok", "version": "0.1.0"}


def test_server_boots_cleanly_when_dist_empty(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Verify server boots cleanly when dist directory exists but index.html is missing."""
    empty_dir = tmp_path / "empty_dist"
    empty_dir.mkdir()
    session = AppSession()
    ws_mgr = ConnectionManager()

    with caplog.at_level("WARNING"):
        app = create_app(session=session, ws_manager=ws_mgr, static_dir=empty_dir)

    assert "Frontend static assets not found" in caplog.text

    fallback_client = TestClient(app)
    assert fallback_client.get("/").status_code == 404
    assert fallback_client.get("/health").status_code == 200


def test_server_boots_cleanly_when_default_dist_unresolved(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify default create_app() boots cleanly when resolve_frontend_dist_dir cannot locate assets."""
    monkeypatch.setattr("web_server.app.resolve_frontend_dist_dir", lambda **kwargs: None)
    with caplog.at_level("WARNING"):
        app = create_app()
    assert "Frontend static assets not found" in caplog.text
    client = TestClient(app)
    assert client.get("/").status_code == 404
    assert client.get("/health").status_code == 200


def test_custom_static_dir_mount(tmp_path: Path) -> None:
    """Verify custom static_dir containing index.html is mounted properly."""
    custom_dist = tmp_path / "custom_dist"
    custom_dist.mkdir()
    custom_index = custom_dist / "index.html"
    custom_index.write_text("<!doctype html><html><body><h1>Custom SPA</h1></body></html>", encoding="utf-8")

    session = AppSession()
    ws_mgr = ConnectionManager()
    app = create_app(session=session, ws_manager=ws_mgr, static_dir=custom_dist)
    custom_client = TestClient(app)

    response = custom_client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Custom SPA" in response.text


def test_frontend_dist_dir_env_var(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify FRONTEND_DIST_DIR environment variable is respected."""
    env_dist = tmp_path / "env_dist"
    env_dist.mkdir()
    (env_dist / "index.html").write_text("<!doctype html><html><body>Env SPA</body></html>", encoding="utf-8")

    monkeypatch.setenv("FRONTEND_DIST_DIR", str(env_dist))

    session = AppSession()
    ws_mgr = ConnectionManager()
    app = create_app(session=session, ws_manager=ws_mgr)
    client = TestClient(app)

    response = client.get("/")
    assert response.status_code == 200
    assert "Env SPA" in response.text


@pytest.mark.parametrize("empty_input", ["", "   ", Path(""), Path("   ")])
def test_custom_static_dir_empty_or_whitespace(empty_input: Union[str, Path], caplog: pytest.LogCaptureFixture) -> None:
    """Verify passing empty or whitespace str/Path logs warning and does not mount CWD."""
    with caplog.at_level("WARNING"):
        app = create_app(static_dir=empty_input)
    assert "Frontend static assets not found" in caplog.text
    client = TestClient(app)
    assert client.get("/").status_code == 404
