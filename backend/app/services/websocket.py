"""
WebSocket connection manager for real-time updates
"""
import logging
import asyncio
import json
from typing import List, Dict, Any
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

from app.services.kato_api import get_kato_client

logger = logging.getLogger("kato_dashboard.services.websocket")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.broadcast_task = None
        self._running = False

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")

        # Start broadcast task if not running
        if not self._running and len(self.active_connections) > 0:
            self._running = True
            self.broadcast_task = asyncio.create_task(self._broadcast_metrics())

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

        # Stop broadcast task if no connections
        if len(self.active_connections) == 0:
            self._running = False
            if self.broadcast_task:
                self.broadcast_task.cancel()
                self.broadcast_task = None

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific client"""
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: str):
        """Broadcast a message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to client: {e}")
                disconnected.append(connection)

        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_json(self, data: Dict[str, Any]):
        """Broadcast JSON data to all connected clients"""
        message = json.dumps(data)
        await self.broadcast(message)

    async def _broadcast_metrics(self):
        """Background task to broadcast system metrics periodically"""
        logger.info("Started metrics broadcast task")

        while self._running and len(self.active_connections) > 0:
            try:
                # Fetch current metrics
                client = get_kato_client()
                metrics = await client.get_metrics(use_cache=False)

                # Prepare message
                message = {
                    "type": "metrics_update",
                    "timestamp": datetime.now().isoformat(),
                    "data": metrics
                }

                # Broadcast to all clients
                await self.broadcast_json(message)

                # Wait before next broadcast (every 3 seconds)
                await asyncio.sleep(3)

            except asyncio.CancelledError:
                logger.info("Metrics broadcast task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in metrics broadcast: {e}")
                await asyncio.sleep(5)  # Wait longer on error

        logger.info("Stopped metrics broadcast task")

    async def send_heartbeat(self, websocket: WebSocket):
        """Send heartbeat/ping to keep connection alive"""
        try:
            heartbeat = {
                "type": "heartbeat",
                "timestamp": datetime.now().isoformat()
            }
            await websocket.send_json(heartbeat)
        except Exception as e:
            logger.error(f"Failed to send heartbeat: {e}")
            self.disconnect(websocket)


# Global connection manager instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager instance"""
    return manager
