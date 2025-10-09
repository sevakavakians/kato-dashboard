"""
Session Manager Service

Provides session listing and management functionality by querying Redis directly.
This bypasses the KATO API limitation where session listing is not available.
"""
import logging
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import re

from app.db.redis_client import get_redis_client

logger = logging.getLogger("kato_dashboard.services.session_manager")


class SessionManager:
    """Manages session data by querying Redis directly"""

    def __init__(self):
        self.session_key_pattern = "kato:session:*"

    async def _parse_session_data(self, key: str, raw_data: Any) -> Optional[Dict[str, Any]]:
        """
        Parse session data from Redis

        Parses KATO session keys with format: kato:session:node:<node_name>:<status>

        Args:
            key: Redis key (e.g., "kato:session:node:test_node_123:active")
            raw_data: Raw session data from Redis (typically a session ID string)

        Returns:
            Parsed session dict or None if invalid
        """
        try:
            # Parse KATO session key format: kato:session:node:<node_name>:<status>
            parts = key.split(":")

            if len(parts) < 5 or parts[0] != "kato" or parts[1] != "session":
                logger.warning(f"Unexpected key format: {key}")
                return None

            # Extract components
            node_name = parts[3]  # The node name is the session identifier
            status = parts[4] if len(parts) > 4 else "unknown"

            # The value in Redis is the internal session reference
            session_reference = str(raw_data) if raw_data else None

            session_id = node_name

            # Build standardized session object from Redis key metadata
            # Note: Redis only stores a reference string, not full session data
            session = {
                "session_id": session_id,
                "node_name": node_name,
                "redis_key": key,
                "status": status,
                "session_reference": session_reference,
                "source": "redis_key_only"
            }

            # Since we don't have timestamp data in the key,
            # we'll mark these as unknown and let the UI handle it
            # In a real implementation, KATO would provide this via its API
            session["created_at"] = None
            session["last_active"] = None
            session["user_id"] = None

            return session

        except Exception as e:
            logger.error(f"Failed to parse session data for key {key}: {e}")
            return None

    async def list_sessions(
        self,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List all sessions from Redis with pagination and filtering

        Args:
            skip: Number of sessions to skip
            limit: Maximum number of sessions to return
            status: Filter by status (active, idle, expired)
            search: Search term for session_id or user_id

        Returns:
            Dict with sessions list, total count, and pagination info
        """
        try:
            client = await get_redis_client()
            sessions = []

            # Get all session keys
            session_keys = []
            async for key in client.scan_iter(match=self.session_key_pattern, count=1000):
                session_keys.append(key)

            logger.info(f"Found {len(session_keys)} session keys in Redis")

            # Fetch session data for each key
            for key in session_keys:
                try:
                    # Get key type
                    key_type = await client.type(key)

                    # Fetch data based on type
                    if key_type == "string":
                        raw_data = await client.get(key)
                    elif key_type == "hash":
                        raw_data = await client.hgetall(key)
                    else:
                        logger.warning(f"Unsupported key type {key_type} for {key}")
                        continue

                    # Parse session data
                    session = await self._parse_session_data(key, raw_data)
                    if session:
                        sessions.append(session)

                except Exception as e:
                    logger.error(f"Failed to fetch session for key {key}: {e}")
                    continue

            # Apply filters
            if status:
                sessions = [s for s in sessions if s.get("status") == status]

            if search:
                search_lower = search.lower()
                sessions = [
                    s for s in sessions
                    if search_lower in s.get("session_id", "").lower()
                    or search_lower in str(s.get("user_id", "")).lower()
                ]

            # Sort by session_id (since we don't have timestamps)
            # Sessions with no last_active get sorted to the end
            sessions.sort(
                key=lambda x: (
                    x.get("last_active") is None,  # None values go last
                    x.get("session_id", "")  # Then sort by session_id
                )
            )

            # Get total before pagination
            total = len(sessions)

            # Apply pagination
            paginated_sessions = sessions[skip:skip + limit]

            return {
                "sessions": paginated_sessions,
                "total": total,
                "skip": skip,
                "limit": limit,
                "page": skip // limit + 1 if limit > 0 else 1,
                "pages": (total + limit - 1) // limit if limit > 0 else 1,
                "source": "redis"
            }

        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return {
                "sessions": [],
                "total": 0,
                "skip": skip,
                "limit": limit,
                "error": str(e)
            }

    async def get_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific session by ID from Redis

        Args:
            session_id: Session ID to retrieve

        Returns:
            Session dict or None if not found
        """
        try:
            client = await get_redis_client()
            key = f"session:{session_id}"

            # Check if key exists
            exists = await client.exists(key)
            if not exists:
                logger.warning(f"Session {session_id} not found in Redis")
                return None

            # Get key type
            key_type = await client.type(key)

            # Fetch data based on type
            if key_type == "string":
                raw_data = await client.get(key)
            elif key_type == "hash":
                raw_data = await client.hgetall(key)
            else:
                logger.warning(f"Unsupported key type {key_type} for {key}")
                return None

            # Parse session data
            session = await self._parse_session_data(key, raw_data)

            # Get TTL info
            if session:
                ttl = await client.ttl(key)
                session["ttl"] = ttl if ttl >= 0 else None

            return session

        except Exception as e:
            logger.error(f"Failed to get session {session_id}: {e}")
            return None

    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session from Redis

        Args:
            session_id: Session ID to delete

        Returns:
            True if deleted successfully, False otherwise
        """
        try:
            from app.core.config import get_settings
            settings = get_settings()

            if settings.mongo_read_only:
                logger.warning("System is in read-only mode, delete rejected")
                return False

            client = await get_redis_client()
            key = f"session:{session_id}"

            # Delete the key
            result = await client.delete(key)

            if result > 0:
                logger.info(f"Successfully deleted session {session_id}")
                return True
            else:
                logger.warning(f"Session {session_id} not found for deletion")
                return False

        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            return False

    async def bulk_delete_sessions(self, session_ids: List[str]) -> Dict[str, Any]:
        """
        Delete multiple sessions from Redis

        Args:
            session_ids: List of session IDs to delete

        Returns:
            Dict with deletion results
        """
        try:
            from app.core.config import get_settings
            settings = get_settings()

            if settings.mongo_read_only:
                logger.warning("System is in read-only mode, bulk delete rejected")
                return {
                    "success": False,
                    "deleted_count": 0,
                    "error": "Read-only mode enabled"
                }

            client = await get_redis_client()
            deleted_count = 0

            for session_id in session_ids:
                try:
                    key = f"session:{session_id}"
                    result = await client.delete(key)
                    if result > 0:
                        deleted_count += 1
                except Exception as e:
                    logger.error(f"Failed to delete session {session_id}: {e}")
                    continue

            return {
                "success": True,
                "deleted_count": deleted_count,
                "requested_count": len(session_ids),
                "failed_count": len(session_ids) - deleted_count
            }

        except Exception as e:
            logger.error(f"Failed to bulk delete sessions: {e}")
            return {
                "success": False,
                "deleted_count": 0,
                "error": str(e)
            }

    async def get_session_count(self) -> int:
        """
        Get total count of sessions in Redis

        Returns:
            Total number of sessions
        """
        try:
            client = await get_redis_client()
            count = 0

            async for _ in client.scan_iter(match=self.session_key_pattern, count=1000):
                count += 1

            return count

        except Exception as e:
            logger.error(f"Failed to count sessions: {e}")
            return 0

    async def get_session_statistics(self) -> Dict[str, Any]:
        """
        Get aggregated session statistics

        Returns:
            Dict with session statistics
        """
        try:
            # Get all sessions from Redis
            result = await self.list_sessions(skip=0, limit=10000)
            sessions = result.get("sessions", [])

            # Calculate statistics from Redis keys
            total = len(sessions)
            active = len([s for s in sessions if s.get("status") == "active"])
            idle = len([s for s in sessions if s.get("status") == "idle"])
            expired = len([s for s in sessions if s.get("status") == "expired"])

            return {
                "redis_total": total,
                "redis_active": active,
                "redis_idle": idle,
                "redis_expired": expired,
                "source": "redis_keys",
                "note": "These are Redis session keys, which may include stale entries. Check KATO metrics for active session count.",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to get session statistics: {e}")
            return {
                "redis_total": 0,
                "redis_active": 0,
                "redis_idle": 0,
                "redis_expired": 0,
                "error": str(e)
            }

    async def get_redis_session_keys_diagnostic(self) -> Dict[str, Any]:
        """
        Get raw Redis session keys for diagnostic purposes

        Returns:
            Dict with Redis session keys and metadata
        """
        try:
            client = await get_redis_client()
            keys = []

            # Get all session keys with TTL info
            async for key in client.scan_iter(match=self.session_key_pattern, count=1000):
                try:
                    ttl = await client.ttl(key)
                    value = await client.get(key)

                    # Parse key components
                    parts = key.split(":")
                    node_name = parts[3] if len(parts) > 3 else "unknown"
                    status = parts[4] if len(parts) > 4 else "unknown"

                    keys.append({
                        "redis_key": key,
                        "node_name": node_name,
                        "status": status,
                        "session_reference": value,
                        "ttl_seconds": ttl if ttl >= 0 else None,
                        "expires": ttl > 0
                    })
                except Exception as e:
                    logger.error(f"Failed to get info for key {key}: {e}")
                    continue

            # Sort by TTL (expiring soon first)
            keys.sort(key=lambda x: x.get("ttl_seconds") or float('inf'))

            return {
                "keys": keys,
                "total": len(keys),
                "source": "redis_diagnostic",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to get Redis session keys: {e}")
            return {
                "keys": [],
                "total": 0,
                "error": str(e)
            }

    async def cleanup_expired_session_keys(self) -> Dict[str, Any]:
        """
        Clean up expired session keys from Redis

        Returns:
            Dict with cleanup results
        """
        try:
            from app.core.config import get_settings
            settings = get_settings()

            if settings.mongo_read_only:
                logger.warning("System is in read-only mode, cleanup rejected")
                return {
                    "success": False,
                    "cleaned_count": 0,
                    "error": "Read-only mode enabled"
                }

            client = await get_redis_client()
            cleaned_count = 0

            # Get all session keys
            async for key in client.scan_iter(match=self.session_key_pattern, count=1000):
                try:
                    # Check if key has expired (TTL <= 0 means will expire or no expiry set)
                    ttl = await client.ttl(key)

                    # Delete keys with no TTL or negative TTL (expired but not removed)
                    if ttl < 0:
                        result = await client.delete(key)
                        if result > 0:
                            cleaned_count += 1
                            logger.info(f"Cleaned up session key: {key}")
                except Exception as e:
                    logger.error(f"Failed to check/delete key {key}: {e}")
                    continue

            return {
                "success": True,
                "cleaned_count": cleaned_count,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to cleanup session keys: {e}")
            return {
                "success": False,
                "cleaned_count": 0,
                "error": str(e)
            }


# Singleton instance
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get or create SessionManager singleton"""
    global _session_manager

    if _session_manager is None:
        _session_manager = SessionManager()

    return _session_manager
