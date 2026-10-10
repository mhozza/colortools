"""FastAPI application factory and route registration for the web server."""
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core_harmonies.engine import HarmonyEngine
from domain.models import ColorSample
from lightroom_xmp.generator import XmpSidecarWriter, build_camera_raw_adjustments
from ports.plugin import HarmonyEvaluationResult
from web_server.schemas import (
    ExportXmpRequest,
    ExportXmpResponse,
    HarmonyAnalyzeRequest,
    HarmonyAnalyzeResponse,
    ImageMetadataResponse,
    SampleColorRequest,
)
from web_server.session import AppSession
from web_server.ws_manager import ConnectionManager


class LoadImageJsonRequest(BaseModel):
    """Payload when loading an image via JSON file_path."""
    file_path: str = Field(..., description="Absolute path to the image file")


def create_app(
    session: Optional[AppSession] = None,
    ws_manager: Optional[ConnectionManager] = None,
) -> FastAPI:
    """Create and configure FastAPI application instance."""
    app = FastAPI(
        title="Photographic Color Harmony Assistant API",
        version="0.1.0",
        description="Local REST and WebSocket IPC server for RAW preview ingestion, color analysis, and Lightroom export.",
    )

    # Enable CORS for local web and desktop UI access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Attach shared session and ws_manager state
    app.state.session = session if session is not None else AppSession()
    app.state.ws_manager = ws_manager if ws_manager is not None else ConnectionManager()

    @app.get("/health")
    async def health_check() -> dict[str, str]:
        """Health check endpoint."""
        return {"status": "ok", "version": "0.1.0"}

    @app.post("/api/image/load", response_model=ImageMetadataResponse)
    async def load_image(
        file: Optional[UploadFile] = File(default=None),
        file_path: Optional[str] = Form(default=None),
        json_req: Optional[LoadImageJsonRequest] = None,
    ) -> ImageMetadataResponse:
        """Load image preview from file path or upload."""
        app_session: AppSession = app.state.session
        ws_mgr: ConnectionManager = app.state.ws_manager

        resolved_path = file_path or (json_req.file_path if json_req else None)

        try:
            if file is not None and file.filename:
                contents = await file.read()
                preview = app_session.load_image_bytes(contents, file.filename)
                source_path = app_session.current_file_path or file.filename
            elif resolved_path:
                preview = app_session.load_image(resolved_path)
                source_path = str(Path(resolved_path).resolve())
            else:
                raise HTTPException(
                    status_code=422,
                    detail="Either 'file' upload or 'file_path' must be provided.",
                )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to load image: {exc}") from exc

        response_data = ImageMetadataResponse(
            file_path=source_path,
            preview_url="/api/image/preview",
            width=preview.width,
            height=preview.height,
            format=preview.source_format,
            is_embedded_preview=preview.is_embedded_preview,
            extraction_time_ms=preview.extraction_time_ms,
        )

        # Broadcast loaded image event to active WebSocket clients
        await ws_mgr.broadcast_json({
            "type": "image_loaded",
            "data": response_data.model_dump(),
        })

        return response_data

    @app.get("/api/image/preview")
    async def get_preview() -> Response:
        """Serve extracted JPEG preview image bytes."""
        app_session: AppSession = app.state.session
        try:
            jpeg_bytes = app_session.get_preview_jpeg_bytes()
            return Response(content=jpeg_bytes, media_type="image/jpeg")
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/image/sample", response_model=ColorSample)
    async def sample_image(request: SampleColorRequest) -> ColorSample:
        """Sample a pixel coordinate on the active image preview."""
        app_session: AppSession = app.state.session
        ws_mgr: ConnectionManager = app.state.ws_manager

        try:
            sample = app_session.sample_color(
                x=request.x,
                y=request.y,
                name=request.name or "Sample",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except IndexError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        # Broadcast color sample event to active WebSocket clients
        await ws_mgr.broadcast_json({
            "type": "color_sampled",
            "data": sample.model_dump(),
        })

        return sample

    @app.post("/api/harmony/analyze", response_model=HarmonyAnalyzeResponse)
    async def analyze_harmonies(request: HarmonyAnalyzeRequest) -> HarmonyAnalyzeResponse:
        """Evaluate active color samples against registered harmony plugins."""
        try:
            ranked_evaluations: list[HarmonyEvaluationResult] = HarmonyEngine.evaluate_all(
                samples=request.samples,
                key_hue_override=request.key_hue_override,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Analysis failed: {exc}") from exc

        response_data = HarmonyAnalyzeResponse(
            plugin="core_harmonies",
            sample_count=len(request.samples),
            harmonies=ranked_evaluations,
            top_harmony=ranked_evaluations[0] if ranked_evaluations else None,
        )

        # Broadcast harmony evaluation to active WebSocket clients
        ws_mgr: ConnectionManager = app.state.ws_manager
        await ws_mgr.broadcast_json({
            "type": "harmony_analyzed",
            "data": response_data.model_dump(),
        })

        return response_data

    @app.post("/api/export/xmp", response_model=ExportXmpResponse)
    async def export_xmp(request: ExportXmpRequest) -> ExportXmpResponse:
        """Write/update Adobe Camera Raw .xmp sidecar metadata next to the photo."""
        photo_path = Path(request.photo_path)
        if not photo_path.is_file():
            raise HTTPException(status_code=404, detail=f"Target photo file not found: {photo_path}")

        adjustments: dict[str, int] = {}
        if request.directives is not None:
            adjustments.update(build_camera_raw_adjustments(request.directives))
        if request.adjustments is not None:
            adjustments.update(request.adjustments)

        try:
            xmp_path = XmpSidecarWriter.write_sidecar(photo_path, adjustments)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to write XMP sidecar: {exc}") from exc

        response_data = ExportXmpResponse(
            photo_path=str(photo_path.resolve()),
            xmp_path=str(xmp_path.resolve()),
            success=True,
            adjustments_applied=adjustments,
        )

        # Broadcast export event to active WebSocket clients
        ws_mgr: ConnectionManager = app.state.ws_manager
        await ws_mgr.broadcast_json({
            "type": "xmp_exported",
            "data": response_data.model_dump(),
        })

        return response_data

    @app.websocket("/ws/live")
    async def websocket_live_endpoint(websocket: WebSocket) -> None:
        """WebSocket endpoint broadcasting real-time adjustment payloads and handling bi-directional IPC."""
        ws_mgr: ConnectionManager = app.state.ws_manager
        await ws_mgr.connect(websocket)

        # Send initial connection acknowledgment
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to Color Harmony Assistant Live IPC",
        })

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type", "message")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "broadcast":
                    # Re-broadcast to all connected clients
                    payload = data.get("payload", {})
                    await ws_mgr.broadcast_json(payload)
                elif msg_type == "echo":
                    await websocket.send_json({"type": "echo", "payload": data.get("payload")})
                else:
                    # Echo back with ack
                    await websocket.send_json({
                        "type": "ack",
                        "received_type": msg_type,
                        "data": data,
                    })
        except WebSocketDisconnect:
            await ws_mgr.disconnect(websocket)
        except Exception:
            await ws_mgr.disconnect(websocket)

    return app


app = create_app()
