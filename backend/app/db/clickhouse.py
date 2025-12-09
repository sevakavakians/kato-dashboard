"""
ClickHouse async client for pattern queries.

This module provides access to KATO's ClickHouse database for reading
pattern data stored in the hybrid architecture (ClickHouse + Redis).

Key concepts:
- kb_id: Knowledge base identifier (e.g., 'node0_kato') for multi-processor isolation
- patterns_data table: Stores pattern core data with kb_id partitioning
- Uses ClickHouse HTTP API (port 8123) for queries
"""
import logging
from typing import Optional, List, Dict, Any
import clickhouse_connect

logger = logging.getLogger("kato_dashboard.db.clickhouse")

# Singleton client
_clickhouse_client: Optional[Any] = None


async def get_clickhouse_client():
    """
    Get or create ClickHouse client singleton.

    Returns:
        ClickHouse client instance

    Raises:
        Exception: If connection fails
    """
    global _clickhouse_client

    if _clickhouse_client is None:
        from app.core.config import get_settings
        settings = get_settings()

        try:
            _clickhouse_client = clickhouse_connect.get_client(
                host=settings.clickhouse_host,
                port=settings.clickhouse_http_port,  # 8123 HTTP port
                database=settings.clickhouse_db,
                username=settings.clickhouse_user,
                password=settings.clickhouse_password,
                compress=True
            )
            # Test connection
            result = _clickhouse_client.command('SELECT 1')
            logger.info(f"ClickHouse connected: {settings.clickhouse_host}:{settings.clickhouse_http_port}")
        except Exception as e:
            logger.error(f"ClickHouse connection failed: {e}")
            raise

    return _clickhouse_client


async def close_clickhouse_client():
    """Close ClickHouse client connection."""
    global _clickhouse_client

    if _clickhouse_client:
        _clickhouse_client.close()
        _clickhouse_client = None
        logger.info("ClickHouse connection closed")


async def query_patterns(
    kb_id: str,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = 'length',
    sort_order: str = 'DESC'
) -> List[Dict[str, Any]]:
    """
    Query patterns from ClickHouse for specific kb_id.

    Args:
        kb_id: Knowledge base identifier (e.g., 'node0_kato')
        skip: Offset for pagination
        limit: Max results per page
        sort_by: Column to sort by (length, name, token_count, created_at)
        sort_order: 'ASC' or 'DESC'

    Returns:
        List of pattern dictionaries with ClickHouse fields

    Note:
        - For frequency sorting, use hybrid_patterns.get_patterns_hybrid()
          which fetches from Redis first
        - ClickHouse partition pruning automatically applies with kb_id filter
    """
    client = await get_clickhouse_client()

    # Map sort fields to ClickHouse columns
    sort_fields = {
        'length': 'length',
        'name': 'name',
        'token_count': 'token_count',
        'created_at': 'created_at',
        'updated_at': 'updated_at'
    }

    sort_col = sort_fields.get(sort_by, 'length')

    query = f"""
    SELECT
        kb_id,
        name,
        pattern_data,
        length,
        token_set,
        token_count,
        minhash_sig,
        lsh_bands,
        first_token,
        last_token,
        created_at,
        updated_at
    FROM kato.patterns_data
    WHERE kb_id = %(kb_id)s
    ORDER BY {sort_col} {sort_order}
    LIMIT %(limit)s
    OFFSET %(skip)s
    """

    result = client.query(query, parameters={'kb_id': kb_id, 'limit': limit, 'skip': skip})

    # Convert to list of dicts
    patterns = []
    for row in result.result_rows:
        patterns.append({
            'kb_id': row[0],
            'name': row[1],
            'pattern_data': row[2],
            'length': row[3],
            'token_set': row[4],
            'token_count': row[5],
            'minhash_sig': row[6],
            'lsh_bands': row[7],
            'first_token': row[8],
            'last_token': row[9],
            'created_at': row[10],
            'updated_at': row[11]
        })

    return patterns


async def get_pattern_by_name(kb_id: str, pattern_name: str) -> Optional[Dict[str, Any]]:
    """
    Get single pattern by name from ClickHouse.

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name (SHA1 hash)

    Returns:
        Pattern dictionary or None if not found
    """
    client = await get_clickhouse_client()

    query = """
    SELECT
        kb_id, name, pattern_data, length, token_set, token_count,
        minhash_sig, lsh_bands, first_token, last_token, created_at, updated_at
    FROM kato.patterns_data
    WHERE kb_id = %(kb_id)s AND name = %(name)s
    LIMIT 1
    """

    result = client.query(query, parameters={'kb_id': kb_id, 'name': pattern_name})

    if not result.result_rows:
        return None

    row = result.result_rows[0]
    return {
        'kb_id': row[0],
        'name': row[1],
        'pattern_data': row[2],
        'length': row[3],
        'token_set': row[4],
        'token_count': row[5],
        'minhash_sig': row[6],
        'lsh_bands': row[7],
        'first_token': row[8],
        'last_token': row[9],
        'created_at': row[10],
        'updated_at': row[11]
    }


async def get_all_pattern_names(kb_id: str) -> List[str]:
    """
    Get all pattern names for kb_id (efficient, name-only query).

    Used for frequency sorting - fetch all names, get frequencies from Redis,
    sort in Python, then fetch full pattern data for page.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        List of pattern names (SHA1 hashes)
    """
    client = await get_clickhouse_client()

    query = "SELECT name FROM kato.patterns_data WHERE kb_id = %(kb_id)s ORDER BY name"
    result = client.query(query, parameters={'kb_id': kb_id})

    return [row[0] for row in result.result_rows]


async def get_kb_ids() -> List[str]:
    """
    Get list of all kb_ids (processors) in ClickHouse.

    Returns:
        List of kb_id strings (e.g., ['node0_kato', 'node1_kato', ...])
    """
    client = await get_clickhouse_client()

    query = "SELECT DISTINCT kb_id FROM kato.patterns_data ORDER BY kb_id"
    result = client.query(query)

    return [row[0] for row in result.result_rows]


async def get_pattern_count(kb_id: str) -> int:
    """
    Get total pattern count for kb_id.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        Total number of patterns
    """
    client = await get_clickhouse_client()

    query = "SELECT COUNT(*) FROM kato.patterns_data WHERE kb_id = %(kb_id)s"
    result = client.query(query, parameters={'kb_id': kb_id})

    return result.result_rows[0][0]


async def get_pattern_statistics(kb_id: str) -> Dict[str, Any]:
    """
    Get aggregate statistics for kb_id patterns.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        Dictionary with aggregate stats:
        - total_patterns: Total count
        - avg_length: Average pattern length
        - min_length: Minimum pattern length
        - max_length: Maximum pattern length
        - avg_token_count: Average unique token count
    """
    client = await get_clickhouse_client()

    query = """
    SELECT
        COUNT(*) as total,
        AVG(length) as avg_length,
        MIN(length) as min_length,
        MAX(length) as max_length,
        AVG(token_count) as avg_token_count
    FROM kato.patterns_data
    WHERE kb_id = %(kb_id)s
    """

    result = client.query(query, parameters={'kb_id': kb_id})
    row = result.result_rows[0]

    return {
        'total_patterns': row[0],
        'avg_length': float(row[1]) if row[1] else 0.0,
        'min_length': row[2],
        'max_length': row[3],
        'avg_token_count': float(row[4]) if row[4] else 0.0
    }


async def delete_pattern(kb_id: str, pattern_name: str) -> bool:
    """
    Delete a pattern from ClickHouse (if not in read-only mode).

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name to delete

    Returns:
        True if deleted, False otherwise

    Note: Check read-only mode before calling this function
    """
    from app.core.config import get_settings
    settings = get_settings()

    if settings.database_read_only:
        logger.warning("ClickHouse is in read-only mode, delete rejected")
        return False

    client = await get_clickhouse_client()

    try:
        query = "ALTER TABLE kato.patterns_data DELETE WHERE kb_id = %(kb_id)s AND name = %(name)s"
        client.command(query, parameters={'kb_id': kb_id, 'name': pattern_name})
        logger.info(f"Deleted pattern {pattern_name} from ClickHouse")
        return True
    except Exception as e:
        logger.error(f"Failed to delete pattern {pattern_name}: {e}")
        return False


async def bulk_delete_patterns(kb_id: str, pattern_names: List[str]) -> int:
    """
    Bulk delete patterns from ClickHouse (if not in read-only mode).

    Args:
        kb_id: Knowledge base identifier
        pattern_names: List of pattern hashes/names to delete

    Returns:
        Number of patterns deleted (estimated, ClickHouse doesn't return count)

    Note: Check read-only mode before calling this function
    """
    from app.core.config import get_settings
    settings = get_settings()

    if settings.database_read_only:
        logger.warning("ClickHouse is in read-only mode, bulk delete rejected")
        return 0

    if not pattern_names:
        return 0

    client = await get_clickhouse_client()

    try:
        # Build IN clause for bulk delete
        names_list = "', '".join(pattern_names)
        query = f"ALTER TABLE kato.patterns_data DELETE WHERE kb_id = '{kb_id}' AND name IN ('{names_list}')"

        client.command(query)
        logger.info(f"Bulk deleted {len(pattern_names)} patterns from ClickHouse for {kb_id}")
        return len(pattern_names)
    except Exception as e:
        logger.error(f"Failed to bulk delete patterns: {e}")
        return 0


async def delete_kb_id(kb_id: str) -> int:
    """
    Delete ALL patterns for a kb_id from ClickHouse (if not in read-only mode).

    This is a destructive operation that removes an entire knowledgebase.

    Args:
        kb_id: Knowledge base identifier to delete

    Returns:
        Estimated number of patterns deleted (count before deletion)

    Note: Check read-only mode before calling this function
    """
    from app.core.config import get_settings
    settings = get_settings()

    if settings.database_read_only:
        logger.warning("ClickHouse is in read-only mode, kb_id delete rejected")
        return 0

    client = await get_clickhouse_client()

    try:
        # Get count before deletion for reporting
        count = await get_pattern_count(kb_id)

        # Delete all patterns for this kb_id
        query = f"ALTER TABLE kato.patterns_data DELETE WHERE kb_id = '{kb_id}'"
        client.command(query)

        logger.info(f"Deleted entire kb_id {kb_id} from ClickHouse ({count} patterns)")
        return count
    except Exception as e:
        logger.error(f"Failed to delete kb_id {kb_id}: {e}")
        return 0


async def health_check() -> Dict[str, Any]:
    """
    Check ClickHouse connection health.

    Returns:
        Health status dictionary with connection info and metrics
    """
    try:
        import time
        start = time.time()

        client = await get_clickhouse_client()
        total_patterns = client.command('SELECT COUNT(*) FROM kato.patterns_data')

        latency = (time.time() - start) * 1000

        return {
            'connected': True,
            'latency_ms': round(latency, 2),
            'total_patterns': total_patterns,
            'database': 'kato',
            'table': 'patterns_data'
        }
    except Exception as e:
        logger.error(f"ClickHouse health check failed: {e}")
        return {
            'connected': False,
            'error': str(e)
        }
