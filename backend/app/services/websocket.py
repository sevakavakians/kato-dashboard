"""
WebSocket connection manager for real-time updates
"""
import logging
import asyncio
import json
from typing import List, Dict, Any, Optional, Set
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

from app.services.kato_api import get_kato_client
from app.services.docker_stats import get_docker_stats_client
from app.services.session_events import get_session_event_manager
from app.services.alert_manager import get_alert_manager
from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.services.websocket")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.subscriptions: Dict[WebSocket, Set[str]] = {}  # Phase 4: Track subscriptions per connection
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

        # Remove subscriptions for this connection (Phase 4)
        if websocket in self.subscriptions:
            del self.subscriptions[websocket]

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
        settings = get_settings()

        while self._running and len(self.active_connections) > 0:
            try:
                # Fetch KATO metrics
                client = get_kato_client()
                metrics = await client.get_metrics(use_cache=False)

                # Initialize data payload
                data = {"metrics": metrics}

                # Fetch container stats if feature is enabled
                if settings.websocket_container_stats:
                    try:
                        docker_client = get_docker_stats_client()
                        container_stats = docker_client.get_all_kato_stats(use_cache=False)
                        data["containers"] = container_stats
                    except Exception as e:
                        logger.error(f"Failed to fetch container stats: {e}")
                        data["containers"] = {"error": "Failed to fetch container stats"}

                # Fetch session summary if feature is enabled
                if settings.websocket_session_events:
                    session_summary = await self._get_session_summary()
                    data["sessions"] = session_summary

                # Prepare message with new format
                message = {
                    "type": "realtime_update",
                    "timestamp": datetime.now().isoformat(),
                    "data": data
                }

                # Broadcast to subscribed clients (Phase 4: metrics, containers, or sessions)
                # Send to clients subscribed to any of these data types
                await self._broadcast_realtime_update(message)

                # Check for session events (Phase 2)
                if settings.websocket_session_events:
                    await self._check_and_broadcast_session_events()

                # Check for system alerts (Phase 3)
                if settings.websocket_system_alerts:
                    await self._check_and_broadcast_system_alerts(metrics, container_stats)

                # Wait before next broadcast (every 3 seconds)
                await asyncio.sleep(3)

            except asyncio.CancelledError:
                logger.info("Metrics broadcast task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in metrics broadcast: {e}")
                await asyncio.sleep(5)  # Wait longer on error

        logger.info("Stopped metrics broadcast task")

    async def _get_session_summary(self) -> Dict[str, Any]:
        """Get session summary for broadcasts"""
        try:
            client = get_kato_client()
            count = await client.get_session_count()
            return {
                "active_count": count.get("active_sessions", 0),
                "total_count": count.get("total_sessions", 0),
            }
        except Exception as e:
            logger.error(f"Failed to get session summary: {e}")
            return {"active_count": 0, "total_count": 0}

    async def _broadcast_realtime_update(self, message: Dict[str, Any]):
        """Broadcast realtime_update to clients subscribed to metrics, containers, or sessions (Phase 4)"""
        disconnected = []
        message_json = json.dumps(message)

        for connection in self.active_connections:
            # Check if client is subscribed to any of the data types in this message
            is_interested = (
                self.is_subscribed(connection, "metrics") or
                self.is_subscribed(connection, "containers") or
                self.is_subscribed(connection, "sessions")
            )

            if is_interested:
                try:
                    await connection.send_text(message_json)
                except Exception as e:
                    logger.error(f"Failed to broadcast realtime_update: {e}")
                    disconnected.append(connection)

        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

    async def _check_and_broadcast_session_events(self):
        """Check for session events and broadcast if detected (Phase 2)"""
        try:
            event_manager = get_session_event_manager()
            event = await event_manager.check_session_changes()

            if event:
                # Broadcast session event to subscribed clients (Phase 4)
                await self.broadcast_to_subscribed(event, "session_events")
                logger.info(f"Broadcasted session event: {event['event_type']}")
        except Exception as e:
            logger.error(f"Failed to check and broadcast session events: {e}")

    async def _check_and_broadcast_system_alerts(
        self,
        metrics: Dict[str, Any],
        container_stats: Dict[str, Any]
    ):
        """Check for system alerts and broadcast if thresholds exceeded (Phase 3)"""
        try:
            alert_manager = get_alert_manager()
            alerts = alert_manager.check_all_thresholds(metrics, container_stats)

            if alerts:
                # Generate unique alert message ID
                alert_id = f"alert_{int(datetime.now().timestamp() * 1000)}"

                # Broadcast system alert to subscribed clients (Phase 4)
                alert_message = {
                    "type": "system_alert",
                    "id": alert_id,
                    "timestamp": datetime.now().isoformat(),
                    "alerts": alerts
                }
                await self.broadcast_to_subscribed(alert_message, "system_alerts")

                # Log alert types for debugging
                alert_types = [a.get("type", "unknown") for a in alerts]
                logger.warning(f"Broadcasted system alerts: {', '.join(alert_types)}")
        except Exception as e:
            logger.error(f"Failed to check and broadcast system alerts: {e}")

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

    def handle_subscription(self, websocket: WebSocket, subscriptions: List[str]):
        """Handle subscription message from client (Phase 4)"""
        settings = get_settings()

        if not settings.websocket_selective_subscriptions:
            # Feature disabled, ignore subscriptions
            return

        # Store subscriptions for this connection
        self.subscriptions[websocket] = set(subscriptions)
        logger.info(f"Client subscribed to: {subscriptions}")

    def is_subscribed(self, websocket: WebSocket, subscription_type: str) -> bool:
        """Check if a client is subscribed to a specific type (Phase 4)"""
        settings = get_settings()

        # If feature is disabled, broadcast to all
        if not settings.websocket_selective_subscriptions:
            return True

        # If no subscriptions recorded, broadcast to all (backward compatibility)
        if websocket not in self.subscriptions:
            return True

        # Check if client subscribed to this type
        return subscription_type in self.subscriptions[websocket]

    async def broadcast_to_subscribed(
        self,
        message: Dict[str, Any],
        subscription_type: str
    ):
        """Broadcast message only to clients subscribed to a specific type (Phase 4)"""
        disconnected = []
        message_json = json.dumps(message)

        for connection in self.active_connections:
            if self.is_subscribed(connection, subscription_type):
                try:
                    await connection.send_text(message_json)
                except Exception as e:
                    logger.error(f"Failed to broadcast to client: {e}")
                    disconnected.append(connection)

        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)


# Global connection manager instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager instance"""
    return manager
