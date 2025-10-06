"""
Redis connection and utilities
"""
import logging
from typing import Optional, List, Dict, Any
import redis.asyncio as redis
from redis.exceptions import ConnectionError

from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.db.redis")

# Singleton client
_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> redis.Redis:
    """Get or create Redis client singleton"""
    global _redis_client

    if _redis_client is None:
        settings = get_settings()
        try:
            _redis_client = await redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            # Test connection
            await _redis_client.ping()
            logger.info(f"Redis connected: {settings.redis_url}")
        except ConnectionError as e:
            logger.error(f"Redis connection failed: {e}")
            raise

    return _redis_client


async def close_redis_client():
    """Close Redis client"""
    global _redis_client

    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis connection closed")


async def get_redis_info() -> Dict[str, Any]:
    """Get Redis server info"""
    client = await get_redis_client()

    try:
        info = await client.info()

        return {
            'version': info.get('redis_version'),
            'uptime_seconds': info.get('uptime_in_seconds'),
            'connected_clients': info.get('connected_clients'),
            'used_memory': info.get('used_memory'),
            'used_memory_human': info.get('used_memory_human'),
            'used_memory_peak': info.get('used_memory_peak'),
            'used_memory_peak_human': info.get('used_memory_peak_human'),
            'total_commands_processed': info.get('total_commands_processed'),
            'keyspace_hits': info.get('keyspace_hits', 0),
            'keyspace_misses': info.get('keyspace_misses', 0),
            'evicted_keys': info.get('evicted_keys', 0),
            'expired_keys': info.get('expired_keys', 0)
        }
    except Exception as e:
        logger.error(f"Failed to get Redis info: {e}")
        return {}


async def get_cache_hit_rate() -> float:
    """Calculate cache hit rate"""
    info = await get_redis_info()

    hits = info.get('keyspace_hits', 0)
    misses = info.get('keyspace_misses', 0)
    total = hits + misses

    if total == 0:
        return 0.0

    return (hits / total) * 100


async def list_keys(pattern: str = "*", count: int = 100) -> List[str]:
    """
    List Redis keys matching a pattern

    Args:
        pattern: Key pattern (supports * wildcard)
        count: Maximum number of keys to return

    Returns:
        List of matching keys
    """
    client = await get_redis_client()

    try:
        keys = []
        async for key in client.scan_iter(match=pattern, count=count):
            keys.append(key)
            if len(keys) >= count:
                break
        return keys
    except Exception as e:
        logger.error(f"Failed to list keys: {e}")
        return []


async def get_key_info(key: str) -> Optional[Dict[str, Any]]:
    """Get detailed information about a key"""
    client = await get_redis_client()

    try:
        key_type = await client.type(key)
        ttl = await client.ttl(key)

        info = {
            'key': key,
            'type': key_type,
            'ttl': ttl if ttl >= 0 else None,
            'size': await client.memory_usage(key) if hasattr(client, 'memory_usage') else None
        }

        # Get value based on type
        if key_type == 'string':
            info['value'] = await client.get(key)
        elif key_type == 'hash':
            info['value'] = await client.hgetall(key)
        elif key_type == 'list':
            info['length'] = await client.llen(key)
            info['value'] = await client.lrange(key, 0, 9)  # First 10 items
        elif key_type == 'set':
            info['cardinality'] = await client.scard(key)
            info['value'] = await client.smembers(key)
        elif key_type == 'zset':
            info['cardinality'] = await client.zcard(key)
            info['value'] = await client.zrange(key, 0, 9, withscores=True)

        return info
    except Exception as e:
        logger.error(f"Failed to get key info for {key}: {e}")
        return None


async def get_session_keys() -> List[str]:
    """Get all session-related keys"""
    return await list_keys(pattern="session:*", count=1000)


async def delete_key(key: str) -> bool:
    """
    Delete a key (if not in read-only mode)

    Returns:
        True if deleted, False otherwise
    """
    settings = get_settings()
    if settings.mongo_read_only:  # Using same read-only flag for Redis
        logger.warning("Redis is in read-only mode, delete rejected")
        return False

    client = await get_redis_client()

    try:
        result = await client.delete(key)
        return result > 0
    except Exception as e:
        logger.error(f"Failed to delete key {key}: {e}")
        return False


async def flush_cache(pattern: Optional[str] = None) -> int:
    """
    Flush cache keys matching a pattern

    Args:
        pattern: Optional key pattern to flush (None = flush all)

    Returns:
        Number of keys deleted
    """
    settings = get_settings()
    if settings.mongo_read_only:
        logger.warning("Redis is in read-only mode, flush rejected")
        return 0

    client = await get_redis_client()

    try:
        if pattern:
            keys = await list_keys(pattern=pattern, count=10000)
            if keys:
                deleted = await client.delete(*keys)
                return deleted
            return 0
        else:
            # Flush all
            await client.flushdb()
            return -1  # Indicate all keys flushed
    except Exception as e:
        logger.error(f"Failed to flush cache: {e}")
        return 0
