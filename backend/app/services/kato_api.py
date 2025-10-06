"""
KATO API client - proxy for KATO endpoints
"""
import logging
from typing import Optional, Dict, Any, List
import httpx
from datetime import datetime, timedelta

from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.services.kato_api")

# Simple cache for metrics (to avoid hammering KATO)
_cache: Dict[str, Dict[str, Any]] = {}


class KatoAPIClient:
    """Client for interacting with KATO API"""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.kato_api_url
        self.cache_ttl = timedelta(seconds=settings.cache_ttl_seconds)
        self.client = httpx.AsyncClient(timeout=30.0)

    def _get_cached(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired"""
        if key in _cache:
            cached = _cache[key]
            if datetime.now() < cached['expires']:
                return cached['data']
        return None

    def _set_cache(self, key: str, data: Any):
        """Set value in cache with expiration"""
        _cache[key] = {
            'data': data,
            'expires': datetime.now() + self.cache_ttl
        }

    async def get_health(self) -> Dict[str, Any]:
        """Get KATO health status"""
        try:
            response = await self.client.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get health: {e}")
            return {'status': 'error', 'error': str(e)}

    async def get_metrics(self, use_cache: bool = True) -> Dict[str, Any]:
        """Get comprehensive metrics from KATO"""
        cache_key = 'metrics'

        if use_cache:
            cached = self._get_cached(cache_key)
            if cached:
                return cached

        try:
            response = await self.client.get(f"{self.base_url}/metrics")
            response.raise_for_status()
            data = response.json()
            self._set_cache(cache_key, data)
            return data
        except Exception as e:
            logger.error(f"Failed to get metrics: {e}")
            return {'error': str(e)}

    async def get_stats(self, minutes: int = 10, use_cache: bool = True) -> Dict[str, Any]:
        """Get time-series statistics"""
        cache_key = f'stats_{minutes}'

        if use_cache:
            cached = self._get_cached(cache_key)
            if cached:
                return cached

        try:
            response = await self.client.get(
                f"{self.base_url}/stats",
                params={'minutes': minutes}
            )
            response.raise_for_status()
            data = response.json()
            self._set_cache(cache_key, data)
            return data
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {'error': str(e)}

    async def get_cache_stats(self, use_cache: bool = False) -> Dict[str, Any]:
        """Get Redis cache statistics from KATO"""
        try:
            response = await self.client.get(f"{self.base_url}/cache/stats")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {'error': str(e)}

    async def get_connection_pools(self, use_cache: bool = True) -> Dict[str, Any]:
        """Get connection pool statistics"""
        cache_key = 'connection_pools'

        if use_cache:
            cached = self._get_cached(cache_key)
            if cached:
                return cached

        try:
            response = await self.client.get(f"{self.base_url}/connection-pools")
            response.raise_for_status()
            data = response.json()
            self._set_cache(cache_key, data)
            return data
        except Exception as e:
            logger.error(f"Failed to get connection pools: {e}")
            return {'error': str(e)}

    async def get_distributed_stm_stats(self, use_cache: bool = True) -> Dict[str, Any]:
        """Get distributed STM statistics"""
        cache_key = 'distributed_stm'

        if use_cache:
            cached = self._get_cached(cache_key)
            if cached:
                return cached

        try:
            response = await self.client.get(f"{self.base_url}/distributed-stm/stats")
            response.raise_for_status()
            data = response.json()
            self._set_cache(cache_key, data)
            return data
        except Exception as e:
            logger.error(f"Failed to get distributed STM stats: {e}")
            return {'error': str(e)}

    async def get_session_count(self) -> Dict[str, Any]:
        """Get active session count"""
        try:
            response = await self.client.get(f"{self.base_url}/sessions/count")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get session count: {e}")
            return {'error': str(e)}

    async def get_session(self, session_id: str) -> Dict[str, Any]:
        """Get session details"""
        try:
            response = await self.client.get(f"{self.base_url}/sessions/{session_id}")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get session {session_id}: {e}")
            return {'error': str(e)}

    async def get_session_stm(self, session_id: str) -> Dict[str, Any]:
        """Get session's short-term memory"""
        try:
            response = await self.client.get(f"{self.base_url}/sessions/{session_id}/stm")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get STM for session {session_id}: {e}")
            return {'error': str(e)}

    async def list_sessions(self, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        """List all active sessions with pagination"""
        try:
            response = await self.client.get(
                f"{self.base_url}/sessions",
                params={'skip': skip, 'limit': limit}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return {'error': str(e), 'sessions': [], 'total': 0}

    async def delete_session(self, session_id: str) -> Dict[str, Any]:
        """Delete a session"""
        try:
            response = await self.client.delete(f"{self.base_url}/sessions/{session_id}")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            return {'error': str(e)}

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()


# Singleton instance
_kato_client: Optional[KatoAPIClient] = None


def get_kato_client() -> KatoAPIClient:
    """Get or create KATO API client singleton"""
    global _kato_client

    if _kato_client is None:
        _kato_client = KatoAPIClient()

    return _kato_client


async def close_kato_client():
    """Close KATO API client"""
    global _kato_client

    if _kato_client:
        await _kato_client.close()
        _kato_client = None
