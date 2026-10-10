"""WebSocket connection manager for real-time IPC."""
import asyncio
from typing import Any
from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections and handles bi-directional messaging and broadcasting."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept incoming WebSocket connection and register it."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict[str, Any]) -> None:
        """Broadcast JSON payload to all connected clients, removing dead connections."""
        async with self._lock:
            connections = list(self.active_connections)

        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                await self.disconnect(connection)

    async def send_personal_json(self, message: dict[str, Any], websocket: WebSocket) -> None:
        """Send JSON payload directly to a specific client."""
        await websocket.send_json(message)

    @property
    def connection_count(self) -> int:
        """Return number of currently active connections."""
        return len(self.active_connections)
