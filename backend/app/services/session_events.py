"""
Session event manager for real-time session monitoring

Detects session lifecycle events (create/destroy) and emits events
for WebSocket broadcasting.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger("kato_dashboard.services.session_events")


class SessionEventManager:
    """Manages session lifecycle event detection"""

    def __init__(self):
        self._last_session_count: Optional[int] = None
        self._last_check_time: Optional[datetime] = None

    async def check_session_changes(self) -> Optional[Dict[str, Any]]:
        """
        Check for session changes and return event if detected

        Returns:
            Event dict if sessions changed, None otherwise
        """
        try:
            from app.services.kato_api import get_kato_client
            client = get_kato_client()

            # Fetch current session count
            count_data = await client.get_session_count()
            current_count = count_data.get("active_sessions", 0)
            current_time = datetime.now()

            # Initialize on first check
            if self._last_session_count is None:
                self._last_session_count = current_count
                self._last_check_time = current_time
                logger.info(f"Session event manager initialized with {current_count} sessions")
                return None

            # Detect change
            if current_count != self._last_session_count:
                delta = current_count - self._last_session_count
                event_type = "session_created" if delta > 0 else "session_destroyed"

                # Calculate time since last change
                time_since_last = (current_time - self._last_check_time).total_seconds()

                event = {
                    "type": "session_event",
                    "event_type": event_type,
                    "timestamp": current_time.isoformat(),
                    "data": {
                        "current_count": current_count,
                        "previous_count": self._last_session_count,
                        "delta": delta,
                        "time_since_last_event": time_since_last
                    }
                }

                # Update state
                self._last_session_count = current_count
                self._last_check_time = current_time

                logger.info(
                    f"Session event detected: {event_type} "
                    f"(delta: {delta:+d}, current: {current_count})"
                )

                return event

            # No change detected
            return None

        except Exception as e:
            logger.error(f"Failed to check session changes: {e}")
            return None

    def reset(self):
        """Reset the event manager state (useful for testing)"""
        self._last_session_count = None
        self._last_check_time = None
        logger.info("Session event manager reset")

    def get_current_state(self) -> Dict[str, Any]:
        """Get current state for debugging"""
        return {
            "last_session_count": self._last_session_count,
            "last_check_time": self._last_check_time.isoformat() if self._last_check_time else None,
            "initialized": self._last_session_count is not None
        }


# Global instance
_session_event_manager: Optional[SessionEventManager] = None


def get_session_event_manager() -> SessionEventManager:
    """Get or create session event manager singleton"""
    global _session_event_manager
    if _session_event_manager is None:
        _session_event_manager = SessionEventManager()
    return _session_event_manager


def reset_session_event_manager():
    """Reset the session event manager (useful for testing)"""
    global _session_event_manager
    if _session_event_manager:
        _session_event_manager.reset()
