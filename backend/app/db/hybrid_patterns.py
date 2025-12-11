"""
Unified pattern interface combining ClickHouse + Redis.

This module provides the hybrid architecture implementation that combines:
- ClickHouse: Pattern core data (pattern_data, length, tokens, MinHash/LSH)
- Redis: Pattern metadata (frequency, emotives, metadata)

All operations maintain kb_id isolation for multi-processor support.
"""
import logging
from typing import Optional, List, Dict, Any
from app.db import clickhouse, redis_client
from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.db.hybrid_patterns")


async def get_patterns_hybrid(
    kb_id: str,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = 'length',
    sort_order: int = -1
) -> Dict[str, Any]:
    """
    Get patterns from ClickHouse + enrich with Redis metadata.

    Args:
        kb_id: Knowledge base identifier (e.g., 'node0_kato')
        skip: Pagination offset
        limit: Max results per page
        sort_by: Field to sort by ('frequency', 'length', 'name', 'token_count', 'created_at')
        sort_order: 1 for ASC, -1 for DESC

    Returns:
        {
            'patterns': [...],  # List of pattern dictionaries
            'total': int,       # Total count
            'skip': int,        # Pagination offset
            'limit': int,       # Page size
            'has_more': bool    # More results available
        }

    Note:
        - Frequency sorting requires special handling (fetch from Redis first)
        - ClickHouse partition pruning automatically applies with kb_id filter
        - Emotives/metadata are NOT fetched in list view (performance optimization)
    """

    # Handle frequency sorting (requires Redis first)
    if sort_by == 'frequency':
        return await _get_patterns_sorted_by_frequency(kb_id, skip, limit, sort_order)

    # For other sorts, use ClickHouse directly
    sort_dir = 'DESC' if sort_order == -1 else 'ASC'

    # Get total count
    total = await clickhouse.get_pattern_count(kb_id)

    # Get patterns from ClickHouse
    patterns_ch = await clickhouse.query_patterns(kb_id, skip, limit, sort_by, sort_dir)

    # Enrich with Redis frequencies (batch fetch for performance)
    pattern_names = [p['name'] for p in patterns_ch]
    frequencies = await redis_client.get_patterns_frequencies_batch(kb_id, pattern_names)

    # Combine ClickHouse + Redis data
    patterns = []
    for p in patterns_ch:
        pattern = {
            '_id': p['name'],  # MongoDB compatibility
            'name': p['name'],
            'pattern_data': p['pattern_data'],
            'length': p['length'],
            'token_count': p['token_count'],
            'token_set': p['token_set'],
            'frequency': frequencies.get(p['name'], 0),
            # ClickHouse optimization fields
            'minhash_sig': p['minhash_sig'],
            'lsh_bands': p['lsh_bands'],
            'first_token': p['first_token'],
            'last_token': p['last_token'],
            'created_at': p['created_at'].isoformat() if p['created_at'] else None,
            'updated_at': p['updated_at'].isoformat() if p['updated_at'] else None,
            # Metadata (NOT fetched in list view for performance)
            'emotives': {},
            'metadata': {}
        }
        patterns.append(pattern)

    return {
        'patterns': patterns,
        'total': total,
        'skip': skip,
        'limit': limit,
        'has_more': (skip + len(patterns)) < total
    }


async def _get_patterns_sorted_by_frequency(
    kb_id: str,
    skip: int,
    limit: int,
    sort_order: int
) -> Dict[str, Any]:
    """
    Special handling for frequency sorting.

    Strategy:
    1. Get ALL pattern names from ClickHouse (just names, fast column-only query)
    2. Batch fetch ALL frequencies from Redis (Redis pipeline, very fast)
    3. Sort in Python by frequency
    4. Apply pagination (skip/limit)
    5. Fetch full pattern data for page from ClickHouse
    6. Return enriched results

    Performance:
    - Works well for up to ~1M patterns per kb_id
    - node0_kato (1.2M patterns): ~2-3 seconds for full frequency sort
    - For billions of patterns, need pagination strategy (future optimization)

    Args:
        kb_id: Knowledge base identifier
        skip: Pagination offset
        limit: Results per page
        sort_order: 1 for ASC, -1 for DESC

    Returns:
        Same format as get_patterns_hybrid()
    """
    logger.info(f"Frequency sorting for {kb_id} - fetching all pattern names...")

    # Step 1: Get all pattern names (column-only query, very fast)
    all_names = await clickhouse.get_all_pattern_names(kb_id)

    logger.info(f"Fetched {len(all_names)} pattern names, now fetching frequencies from Redis...")

    # Step 2: Batch fetch frequencies from Redis
    frequencies = await redis_client.get_patterns_frequencies_batch(kb_id, all_names)

    logger.info(f"Fetched {len(frequencies)} frequencies, now sorting...")

    # Step 3: Sort by frequency in Python
    sorted_names = sorted(
        all_names,
        key=lambda name: frequencies.get(name, 0),
        reverse=(sort_order == -1)
    )

    # Step 4: Apply pagination
    page_names = sorted_names[skip:skip + limit]

    logger.info(f"Sorted and paginated to {len(page_names)} patterns, fetching full data...")

    # Step 5: Fetch full pattern data for page from ClickHouse
    patterns = []
    for name in page_names:
        p = await clickhouse.get_pattern_by_name(kb_id, name)
        if p:
            pattern = {
                '_id': p['name'],
                'name': p['name'],
                'pattern_data': p['pattern_data'],
                'length': p['length'],
                'token_count': p['token_count'],
                'token_set': p['token_set'],
                'frequency': frequencies.get(p['name'], 0),
                'minhash_sig': p['minhash_sig'],
                'lsh_bands': p['lsh_bands'],
                'first_token': p['first_token'],
                'last_token': p['last_token'],
                'created_at': p['created_at'].isoformat() if p['created_at'] else None,
                'updated_at': p['updated_at'].isoformat() if p['updated_at'] else None,
                'emotives': {},
                'metadata': {}
            }
            patterns.append(pattern)

    logger.info(f"Frequency sort complete, returning {len(patterns)} patterns")

    return {
        'patterns': patterns,
        'total': len(all_names),
        'skip': skip,
        'limit': limit,
        'has_more': (skip + len(patterns)) < len(all_names)
    }


async def get_pattern_by_id_hybrid(kb_id: str, pattern_name: str) -> Optional[Dict[str, Any]]:
    """
    Get single pattern with full metadata from ClickHouse + Redis.

    This is used for the detail view where we fetch ALL metadata including
    emotives and metadata fields.

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name (SHA1 hash)

    Returns:
        Complete pattern dictionary with all fields, or None if not found
    """
    # Get pattern core data from ClickHouse
    p = await clickhouse.get_pattern_by_name(kb_id, pattern_name)
    if not p:
        return None

    # Get metadata from Redis
    frequency = await redis_client.get_pattern_frequency(kb_id, pattern_name)
    emotives = await redis_client.get_pattern_emotives(kb_id, pattern_name)
    metadata = await redis_client.get_pattern_metadata(kb_id, pattern_name)

    return {
        '_id': p['name'],
        'name': p['name'],
        'pattern_data': p['pattern_data'],
        'length': p['length'],
        'token_count': p['token_count'],
        'token_set': p['token_set'],
        'frequency': frequency,
        'emotives': emotives,
        'metadata': metadata,
        'minhash_sig': p['minhash_sig'],
        'lsh_bands': p['lsh_bands'],
        'first_token': p['first_token'],
        'last_token': p['last_token'],
        'created_at': p['created_at'].isoformat() if p['created_at'] else None,
        'updated_at': p['updated_at'].isoformat() if p['updated_at'] else None
    }


async def get_processors_hybrid() -> List[Dict[str, Any]]:
    """
    Get all processors (kb_ids) with pattern counts and statistics.

    Returns list of processor info dictionaries, one per kb_id.

    Returns:
        [
            {
                'processor_id': 'node0_kato',
                'kb_id': 'node0_kato',
                'patterns_count': 1230391,
                'statistics': {...}
            },
            ...
        ]
    """
    kb_ids = await clickhouse.get_kb_ids()

    processors = []
    for kb_id in kb_ids:
        try:
            count = await clickhouse.get_pattern_count(kb_id)
            stats = await clickhouse.get_pattern_statistics(kb_id)

            processors.append({
                'processor_id': kb_id,
                'kb_id': kb_id,
                'patterns_count': count,
                'statistics': stats
            })
        except Exception as e:
            logger.error(f"Failed to get stats for {kb_id}: {e}")
            # Include processor even if stats fail
            processors.append({
                'processor_id': kb_id,
                'kb_id': kb_id,
                'patterns_count': 0,
                'statistics': {},
                'error': str(e)
            })

    return processors


async def update_pattern_hybrid(
    kb_id: str,
    pattern_name: str,
    updates: Dict[str, Any]
) -> bool:
    """
    Update pattern in ClickHouse + Redis (if not in read-only mode).

    Handles updates to both pattern core data (ClickHouse) and metadata (Redis).

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name to update
        updates: Dictionary of fields to update

    Returns:
        True if updated successfully, False otherwise

    Supported fields:
    - ClickHouse: pattern_data, length, token_set, token_count
    - Redis: frequency, emotives, metadata

    Note: ClickHouse updates use ALTER TABLE which can be slow for large tables
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Hybrid patterns in read-only mode, update rejected")
        return False

    try:
        # Handle Redis metadata updates
        if 'frequency' in updates:
            await redis_client.set_pattern_frequency(kb_id, pattern_name, updates['frequency'])

        if 'emotives' in updates:
            await redis_client.set_pattern_emotives(kb_id, pattern_name, updates['emotives'])

        if 'metadata' in updates:
            await redis_client.set_pattern_metadata(kb_id, pattern_name, updates['metadata'])

        # Note: ClickHouse updates intentionally not implemented
        # ClickHouse ALTER TABLE UPDATE is slow and blocking for large tables
        # Pattern core data (pattern_data, length, token_count) is immutable by design
        # Only Redis metadata (frequency, emotives, metadata) can be updated
        # If pattern data needs to change, delete and recreate the pattern

        logger.info(f"Updated pattern {pattern_name} in hybrid architecture")
        return True
    except Exception as e:
        logger.error(f"Failed to update pattern {pattern_name}: {e}")
        return False


async def delete_pattern_hybrid(kb_id: str, pattern_name: str) -> bool:
    """
    Delete pattern from both ClickHouse + Redis (if not in read-only mode).

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name to delete

    Returns:
        True if deleted from both systems, False otherwise
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Hybrid patterns in read-only mode, delete rejected")
        return False

    try:
        # Delete from ClickHouse
        ch_success = await clickhouse.delete_pattern(kb_id, pattern_name)

        # Delete from Redis
        redis_success = await redis_client.delete_pattern_metadata(kb_id, pattern_name)

        if ch_success and redis_success:
            logger.info(f"Deleted pattern {pattern_name} from hybrid architecture")
            return True
        else:
            logger.warning(f"Partial delete for {pattern_name}: CH={ch_success}, Redis={redis_success}")
            return False
    except Exception as e:
        logger.error(f"Failed to delete pattern {pattern_name}: {e}")
        return False


async def bulk_delete_patterns_hybrid(kb_id: str, pattern_names: List[str]) -> Dict[str, int]:
    """
    Bulk delete patterns from both ClickHouse + Redis.

    Args:
        kb_id: Knowledge base identifier
        pattern_names: List of pattern hashes/names to delete

    Returns:
        {
            'clickhouse_deleted': int,  # Patterns deleted from ClickHouse
            'redis_keys_deleted': int,  # Redis keys deleted
            'total': int                # Total patterns processed
        }
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning("Hybrid patterns in read-only mode, bulk delete rejected")
        return {'clickhouse_deleted': 0, 'redis_keys_deleted': 0, 'total': 0}

    if not pattern_names:
        return {'clickhouse_deleted': 0, 'redis_keys_deleted': 0, 'total': 0}

    try:
        # Delete from ClickHouse (returns count)
        ch_deleted = await clickhouse.bulk_delete_patterns(kb_id, pattern_names)

        # Delete from Redis (returns count of keys deleted)
        redis_deleted = await redis_client.bulk_delete_pattern_metadata(kb_id, pattern_names)

        logger.info(f"Bulk deleted {len(pattern_names)} patterns: CH={ch_deleted}, Redis={redis_deleted} keys")

        return {
            'clickhouse_deleted': ch_deleted,
            'redis_keys_deleted': redis_deleted,
            'total': len(pattern_names)
        }
    except Exception as e:
        logger.error(f"Failed to bulk delete patterns: {e}")
        return {'clickhouse_deleted': 0, 'redis_keys_deleted': 0, 'total': 0, 'error': str(e)}


async def get_pattern_statistics_hybrid(kb_id: str) -> Dict[str, Any]:
    """
    Get aggregate pattern statistics from ClickHouse.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        Statistics dictionary with aggregates
    """
    try:
        stats = await clickhouse.get_pattern_statistics(kb_id)
        return stats
    except Exception as e:
        logger.error(f"Failed to get pattern statistics for {kb_id}: {e}")
        return {
            'total_patterns': 0,
            'avg_length': 0.0,
            'min_length': 0,
            'max_length': 0,
            'avg_token_count': 0.0,
            'error': str(e)
        }


async def delete_knowledgebase_hybrid(kb_id: str) -> Dict[str, Any]:
    """
    Delete entire knowledgebase from both ClickHouse + Redis (if not in read-only mode).

    This is a destructive operation that removes ALL patterns for a kb_id.

    Args:
        kb_id: Knowledge base identifier to delete

    Returns:
        {
            'clickhouse_deleted': int,  # Patterns deleted from ClickHouse
            'redis_keys_deleted': int,  # Redis keys deleted
            'kb_id': str                # KB ID that was deleted
        }
    """
    settings = get_settings()
    if settings.database_read_only:
        logger.warning(f"Hybrid patterns in read-only mode, knowledgebase delete rejected for {kb_id}")
        return {'clickhouse_deleted': 0, 'redis_keys_deleted': 0, 'kb_id': kb_id, 'error': 'Read-only mode enabled'}

    try:
        logger.info(f"Deleting entire knowledgebase: {kb_id}")

        # Delete all patterns from ClickHouse for this kb_id
        ch_deleted = await clickhouse.delete_kb_id(kb_id)

        # Delete all Redis keys for this kb_id (pattern:{kb_id}:*)
        redis_deleted = await redis_client.delete_kb_metadata(kb_id)

        logger.info(f"Deleted knowledgebase {kb_id}: CH={ch_deleted} patterns, Redis={redis_deleted} keys")

        return {
            'clickhouse_deleted': ch_deleted,
            'redis_keys_deleted': redis_deleted,
            'kb_id': kb_id
        }
    except Exception as e:
        logger.error(f"Failed to delete knowledgebase {kb_id}: {e}")
        return {'clickhouse_deleted': 0, 'redis_keys_deleted': 0, 'kb_id': kb_id, 'error': str(e)}


async def health_check_hybrid() -> Dict[str, Any]:
    """
    Check health of hybrid architecture (ClickHouse + Redis).

    Returns:
        Health status dictionary with connection info and metrics
    """
    status = {
        'status': 'unknown',
        'mode': 'hybrid',
        'clickhouse': {},
        'redis': {}
    }

    # Check ClickHouse
    try:
        ch_health = await clickhouse.health_check()
        status['clickhouse'] = ch_health
    except Exception as e:
        status['clickhouse'] = {'connected': False, 'error': str(e)}

    # Check Redis
    try:
        import time
        start = time.time()

        client = await redis_client.get_redis_client()
        await client.ping()

        latency = (time.time() - start) * 1000

        # Sample pattern metadata keys for node0_kato
        sample_keys = await redis_client.list_keys("node0_kato:frequency:*", count=100)

        status['redis'] = {
            'connected': True,
            'latency_ms': round(latency, 2),
            'sample_pattern_keys': len(sample_keys)
        }
    except Exception as e:
        status['redis'] = {'connected': False, 'error': str(e)}

    # Overall status
    if status['clickhouse'].get('connected') and status['redis'].get('connected'):
        status['status'] = 'healthy'
    elif status['clickhouse'].get('connected') or status['redis'].get('connected'):
        status['status'] = 'degraded'
    else:
        status['status'] = 'offline'

    return status
