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
                socket_connect_timeout=10,
                socket_timeout=60  # Increased for large symbol scans
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
    if settings.database_read_only:  # Using same read-only flag for Redis
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
    if settings.database_read_only:
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


# ============================================================================
# Pattern Metadata Operations (ClickHouse + Redis Hybrid Architecture)
# ============================================================================


async def get_pattern_frequency(kb_id: str, pattern_name: str) -> int:
    """
    Get frequency for a pattern from Redis.

    Redis key format: {kb_id}:frequency:{pattern_name}

    Args:
        kb_id: Knowledge base identifier (e.g., 'node0_kato')
        pattern_name: Pattern hash/name (SHA1 hash)

    Returns:
        Frequency count (integer), 0 if not found
    """
    client = await get_redis_client()

    key = f"{kb_id}:frequency:{pattern_name}"

    try:
        freq = await client.get(key)
        return int(freq) if freq else 0
    except Exception as e:
        logger.error(f"Failed to get frequency for {pattern_name}: {e}")
        return 0


async def get_patterns_frequencies_batch(kb_id: str, pattern_names: List[str]) -> Dict[str, int]:
    """
    Batch fetch frequencies for multiple patterns using Redis pipeline.

    This is significantly faster than individual GETs when fetching
    metadata for many patterns (e.g., a full page of results).

    Args:
        kb_id: Knowledge base identifier
        pattern_names: List of pattern hashes/names

    Returns:
        Dictionary mapping pattern_name -> frequency
    """
    if not pattern_names:
        return {}

    client = await get_redis_client()

    try:
        async with client.pipeline(transaction=False) as pipe:
            for name in pattern_names:
                pipe.get(f"{kb_id}:frequency:{name}")

            results = await pipe.execute()

        # Build dict mapping pattern_name -> frequency
        frequencies = {}
        for name, freq in zip(pattern_names, results):
            frequencies[name] = int(freq) if freq else 0

        return frequencies
    except Exception as e:
        logger.error(f"Failed to batch fetch frequencies: {e}")
        # Return empty dict on error
        return {name: 0 for name in pattern_names}


async def check_patterns_metadata_existence_batch(kb_id: str, pattern_names: List[str]) -> Dict[str, Dict[str, bool]]:
    """
    Batch check existence of emotives and metadata for multiple patterns using Redis pipeline.

    Checks if the data is non-empty after parsing JSON, not just if the key exists.
    KATO stores empty metadata as '{}' and empty emotives as '[]', so we need to
    actually fetch and parse to determine if there's meaningful data.

    Args:
        kb_id: Knowledge base identifier
        pattern_names: List of pattern hashes/names

    Returns:
        Dictionary mapping pattern_name -> {'has_emotives': bool, 'has_metadata': bool}
    """
    if not pattern_names:
        return {}

    client = await get_redis_client()

    try:
        import json

        async with client.pipeline(transaction=False) as pipe:
            for name in pattern_names:
                pipe.get(f"{kb_id}:emotives:{name}")
                pipe.get(f"{kb_id}:metadata:{name}")

            results = await pipe.execute()

        # Build dict mapping pattern_name -> existence flags
        existence = {}
        for i, name in enumerate(pattern_names):
            emotives_raw = results[i * 2]      # Every even index
            metadata_raw = results[i * 2 + 1]  # Every odd index

            # Check if emotives is non-empty after parsing
            has_emotives = False
            if emotives_raw:
                try:
                    emotives = json.loads(emotives_raw)
                    has_emotives = bool(emotives and len(emotives) > 0)
                except json.JSONDecodeError:
                    has_emotives = False

            # Check if metadata is non-empty after parsing
            has_metadata = False
            if metadata_raw:
                try:
                    metadata = json.loads(metadata_raw)
                    has_metadata = bool(metadata and len(metadata) > 0)
                except json.JSONDecodeError:
                    has_metadata = False

            existence[name] = {
                'has_emotives': has_emotives,
                'has_metadata': has_metadata
            }

        return existence
    except Exception as e:
        logger.error(f"Failed to batch check metadata existence: {e}")
        # Return empty dict on error
        return {name: {'has_emotives': False, 'has_metadata': False} for name in pattern_names}


async def get_pattern_emotives(kb_id: str, pattern_name: str) -> list[Dict[str, Any]]:
    """
    Get emotives list for a pattern from Redis.

    KATO stores emotives as a JSON-encoded list of emotive dicts (rolling window).
    Redis key format: {kb_id}:emotives:{pattern_name}
    Value format: JSON string like '[{"joy": 0.9}, {"joy": 0.5}]'

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name

    Returns:
        List of emotive dicts (e.g., [{'joy': 0.9, 'confidence': 0.8}, {...}])
        Empty list if not found
    """
    client = await get_redis_client()

    key = f"{kb_id}:emotives:{pattern_name}"

    try:
        emotives_raw = await client.get(key)

        if not emotives_raw:
            return []

        # Deserialize JSON string to list
        import json
        emotives = json.loads(emotives_raw)

        # Ensure it's a list
        if not isinstance(emotives, list):
            logger.warning(f"Emotives for {pattern_name} is not a list: {type(emotives)}")
            return []

        return emotives
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse emotives JSON for {pattern_name}: {e}")
        return []
    except Exception as e:
        logger.error(f"Failed to get emotives for {pattern_name}: {e}")
        return []


async def get_pattern_metadata(kb_id: str, pattern_name: str) -> Dict[str, Any]:
    """
    Get metadata dict for a pattern from Redis.

    KATO stores metadata as a JSON-encoded dict.
    Redis key format: {kb_id}:metadata:{pattern_name}
    Value format: JSON string like '{"key": "value", "tags": ["a", "b"]}'

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name

    Returns:
        Dictionary of metadata fields
        Empty dict if not found
    """
    client = await get_redis_client()

    key = f"{kb_id}:metadata:{pattern_name}"

    try:
        metadata_raw = await client.get(key)

        if not metadata_raw:
            return {}

        # Deserialize JSON string to dict
        import json
        metadata = json.loads(metadata_raw)

        # Ensure it's a dict
        if not isinstance(metadata, dict):
            logger.warning(f"Metadata for {pattern_name} is not a dict: {type(metadata)}")
            return {}

        return metadata
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse metadata JSON for {pattern_name}: {e}")
        return {}
    except Exception as e:
        logger.error(f"Failed to get metadata for {pattern_name}: {e}")
        return {}


async def set_pattern_frequency(kb_id: str, pattern_name: str, frequency: int) -> bool:
    """
    Set frequency for a pattern in Redis (if not in read-only mode).

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name
        frequency: New frequency value

    Returns:
        True if set successfully, False otherwise
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Redis is in read-only mode, set frequency rejected")
        return False

    client = await get_redis_client()

    key = f"{kb_id}:frequency:{pattern_name}"

    try:
        await client.set(key, frequency)
        logger.info(f"Set frequency for {pattern_name}: {frequency}")
        return True
    except Exception as e:
        logger.error(f"Failed to set frequency for {pattern_name}: {e}")
        return False


async def set_pattern_emotives(kb_id: str, pattern_name: str, emotives: list[Dict[str, Any]]) -> bool:
    """
    Set emotives list for a pattern in Redis (if not in read-only mode).

    KATO stores emotives as a JSON-encoded list (rolling window of emotive dicts).
    Redis key format: {kb_id}:emotives:{pattern_name}
    Value format: JSON string like '[{"joy": 0.9}, {"joy": 0.5}]'

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name
        emotives: List of emotive dicts (e.g., [{'joy': 0.9, 'confidence': 0.8}, {...}])

    Returns:
        True if set successfully, False otherwise
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Redis is in read-only mode, set emotives rejected")
        return False

    client = await get_redis_client()

    key = f"{kb_id}:emotives:{pattern_name}"

    try:
        import json
        # Store as JSON string (matching KATO's format)
        await client.set(key, json.dumps(emotives))

        logger.info(f"Set emotives for {pattern_name}: {len(emotives)} items")
        return True
    except Exception as e:
        logger.error(f"Failed to set emotives for {pattern_name}: {e}")
        return False


async def set_pattern_metadata(kb_id: str, pattern_name: str, metadata: Dict[str, Any]) -> bool:
    """
    Set metadata dict for a pattern in Redis (if not in read-only mode).

    KATO stores metadata as a JSON-encoded dict.
    Redis key format: {kb_id}:metadata:{pattern_name}
    Value format: JSON string like '{"key": "value", "tags": ["a", "b"]}'

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name
        metadata: Dictionary of metadata fields

    Returns:
        True if set successfully, False otherwise
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Redis is in read-only mode, set metadata rejected")
        return False

    client = await get_redis_client()

    key = f"{kb_id}:metadata:{pattern_name}"

    try:
        import json
        # Store as JSON string (matching KATO's format)
        await client.set(key, json.dumps(metadata))

        logger.info(f"Set metadata for {pattern_name}: {len(metadata)} fields")
        return True
    except Exception as e:
        logger.error(f"Failed to set metadata for {pattern_name}: {e}")
        return False


async def delete_pattern_metadata(kb_id: str, pattern_name: str) -> bool:
    """
    Delete all Redis metadata for a pattern (frequency, emotives, metadata).

    Used when deleting a pattern from the hybrid architecture.

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name to delete

    Returns:
        True if deleted, False otherwise
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Redis is in read-only mode, delete rejected")
        return False

    client = await get_redis_client()

    keys_to_delete = [
        f"{kb_id}:frequency:{pattern_name}",
        f"{kb_id}:emotives:{pattern_name}",
        f"{kb_id}:metadata:{pattern_name}"
    ]

    try:
        deleted = await client.delete(*keys_to_delete)
        logger.info(f"Deleted Redis metadata for {pattern_name}: {deleted} keys")
        return True
    except Exception as e:
        logger.error(f"Failed to delete Redis metadata for {pattern_name}: {e}")
        return False


async def bulk_delete_pattern_metadata(kb_id: str, pattern_names: List[str]) -> int:
    """
    Bulk delete Redis metadata for multiple patterns.

    Args:
        kb_id: Knowledge base identifier
        pattern_names: List of pattern hashes/names to delete

    Returns:
        Number of keys deleted
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Redis is in read-only mode, bulk delete rejected")
        return 0

    if not pattern_names:
        return 0

    client = await get_redis_client()

    # Build list of all keys to delete
    keys_to_delete = []
    for name in pattern_names:
        keys_to_delete.extend([
            f"{kb_id}:frequency:{name}",
            f"{kb_id}:emotives:{name}",
            f"{kb_id}:metadata:{name}"
        ])

    try:
        deleted = await client.delete(*keys_to_delete)
        logger.info(f"Bulk deleted Redis metadata for {len(pattern_names)} patterns: {deleted} keys")
        return deleted
    except Exception as e:
        logger.error(f"Failed to bulk delete Redis metadata: {e}")
        return 0


async def delete_kb_metadata(kb_id: str) -> int:
    """
    Delete ALL Redis metadata for a kb_id.

    This deletes all keys matching patterns:
    - {kb_id}:frequency:*
    - {kb_id}:emotives:*
    - {kb_id}:metadata:*

    Args:
        kb_id: Knowledge base identifier to delete

    Returns:
        Total number of keys deleted
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Redis is in read-only mode, kb_id metadata delete rejected")
        return 0

    client = await get_redis_client()

    try:
        total_deleted = 0

        # Delete all keys for each metadata type
        for key_type in ['frequency', 'emotives', 'metadata']:
            pattern = f"{kb_id}:{key_type}:*"

            # Scan for keys matching pattern
            keys_to_delete = []
            async for key in client.scan_iter(match=pattern, count=1000):
                keys_to_delete.append(key)

                # Delete in batches of 1000
                if len(keys_to_delete) >= 1000:
                    deleted = await client.delete(*keys_to_delete)
                    total_deleted += deleted
                    keys_to_delete = []

            # Delete remaining keys
            if keys_to_delete:
                deleted = await client.delete(*keys_to_delete)
                total_deleted += deleted

        logger.info(f"Deleted all Redis metadata for kb_id {kb_id}: {total_deleted} keys")
        return total_deleted
    except Exception as e:
        logger.error(f"Failed to delete Redis metadata for kb_id {kb_id}: {e}")
        return 0
