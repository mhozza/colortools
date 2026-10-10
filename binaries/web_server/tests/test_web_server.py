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
