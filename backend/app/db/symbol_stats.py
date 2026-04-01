"""
Symbol Statistics Module - Redis-backed symbol frequency data

Provides access to KATO's symbol data stored in Redis as HASH keys:
- {kb_id}:symbols:freq  (HASH) - symbol_name -> frequency count
- {kb_id}:symbols:pmf   (HASH) - symbol_name -> pattern member frequency
- {kb_id}:affinity:{symbol} (HASH) - emotive_name -> running sum (float)

Symbols represent individual tokens/characters that make up patterns.
"""
import logging
import time
from typing import Dict, Any, List, Optional
from app.db.redis_client import get_redis_client

logger = logging.getLogger("kato_dashboard.db.symbol_stats")

# In-memory cache for symbol data (kb_id -> {'symbols': [...], 'timestamp': time})
_symbol_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


async def get_processors_with_symbols() -> List[Dict[str, Any]]:
    """
    Get list of processors (kb_ids) that have symbol data in Redis.

    Scans for keys matching *:symbols:freq (HASH keys, one per kb_id).

    Returns:
        List of processor dictionaries with kb_id and symbol count
    """
    try:
        client = await get_redis_client()

        kb_ids = []
        cursor = 0

        logger.info("Scanning for processors with symbol data...")

        while True:
            cursor, keys = await client.scan(cursor, match="*:symbols:freq", count=5000)
            for key in keys:
                # Extract kb_id from key: "{kb_id}:symbols:freq"
                if key.endswith(":symbols:freq"):
                    kb_id = key[:-len(":symbols:freq")]
                    kb_ids.append(kb_id)
            if cursor == 0:
                break

        # Get symbol counts for each kb_id
        processors = []
        if kb_ids:
            pipe = client.pipeline()
            for kb_id in kb_ids:
                pipe.hlen(f"{kb_id}:symbols:freq")
            counts = await pipe.execute()

            for kb_id, count in zip(sorted(kb_ids), sorted(zip(kb_ids, counts))):
                processors.append({
                    'kb_id': count[0],
                    'processor_id': count[0],
                    'symbols_count': count[1]
                })
            # Sort by kb_id
            processors.sort(key=lambda p: p['kb_id'])

        logger.info(f"Found {len(processors)} processors with symbol data: {[p['kb_id'] for p in processors]}")
        return processors

    except Exception as e:
        logger.error(f"Failed to get processors with symbols: {e}")
        return []


async def _load_all_symbols(kb_id: str) -> List[Dict[str, Any]]:
    """
    Load all symbols for a kb_id from Redis (cached).

    Reads from two HASH keys:
    - {kb_id}:symbols:freq  -> {symbol_name: frequency, ...}
    - {kb_id}:symbols:pmf   -> {symbol_name: pmf, ...}

    Returns:
        List of symbol dictionaries
    """
    # Check cache
    now = time.time()
    if kb_id in _symbol_cache:
        cache_entry = _symbol_cache[kb_id]
        if now - cache_entry['timestamp'] < CACHE_TTL_SECONDS:
            logger.info(f"Using cached symbols for {kb_id} ({len(cache_entry['symbols'])} symbols)")
            return cache_entry['symbols']

    logger.info(f"Loading symbols for {kb_id} from Redis (cache miss or expired)...")
    client = await get_redis_client()

    # Fetch both hashes in a single pipeline
    pipe = client.pipeline()
    pipe.hgetall(f"{kb_id}:symbols:freq")
    pipe.hgetall(f"{kb_id}:symbols:pmf")
    freq_hash, pmf_hash = await pipe.execute()

    if not freq_hash:
        logger.info(f"No symbol frequency data found for {kb_id}")
        _symbol_cache[kb_id] = {'symbols': [], 'timestamp': now}
        return []

    # Build symbol list by merging freq and pmf data
    symbols = []
    for symbol_name, freq_value in freq_hash.items():
        freq = int(freq_value) if freq_value else 0
        pmf_value = pmf_hash.get(symbol_name)
        pmf = int(pmf_value) if pmf_value else 0

        symbols.append({
            'name': symbol_name,
            'frequency': freq,
            'pattern_member_frequency': pmf,
            'freq_pmf_ratio': round(freq / pmf, 2) if pmf > 0 else 0
        })

    logger.info(f"Loaded {len(symbols)} symbols for {kb_id}, caching for {CACHE_TTL_SECONDS}s")

    # Cache the results
    _symbol_cache[kb_id] = {
        'symbols': symbols,
        'timestamp': now
    }

    return symbols


async def get_symbols_paginated(
    kb_id: str,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = 'frequency',
    sort_order: int = -1,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get paginated, sorted symbol data for a kb_id.

    Uses in-memory caching to avoid re-reading Redis on every request.

    Args:
        kb_id: Knowledge base identifier
        skip: Pagination offset
        limit: Results per page (max 500)
        sort_by: Field to sort by ('frequency', 'pmf', 'name', 'ratio')
        sort_order: 1 for ASC, -1 for DESC
        search: Optional substring to filter symbol names

    Returns:
        Dict with symbols list, total count, and pagination info
    """
    try:
        # Load all symbols (cached)
        all_symbols = await _load_all_symbols(kb_id)

        # Filter by search term
        if search:
            symbols = [s for s in all_symbols if search.lower() in s['name'].lower()]
        else:
            symbols = list(all_symbols)

        # For affinity sorting, we need to fetch all affinities before sorting
        all_affinity_map = {}
        if sort_by == 'affinity':
            symbol_names = [s['name'] for s in symbols]
            all_affinity_map = await get_symbols_affinity_batch(kb_id, symbol_names)

        # Sort symbols
        if sort_by == 'frequency':
            symbols.sort(key=lambda s: s['frequency'], reverse=(sort_order == -1))
        elif sort_by == 'pmf' or sort_by == 'pattern_member_frequency':
            symbols.sort(key=lambda s: s['pattern_member_frequency'], reverse=(sort_order == -1))
        elif sort_by == 'name':
            symbols.sort(key=lambda s: s['name'], reverse=(sort_order == -1))
        elif sort_by == 'ratio' or sort_by == 'freq_pmf_ratio':
            symbols.sort(key=lambda s: s['freq_pmf_ratio'], reverse=(sort_order == -1))
        elif sort_by == 'affinity':
            symbols.sort(
                key=lambda s: sum(all_affinity_map.get(s['name'], {}).values()),
                reverse=(sort_order == -1)
            )

        total = len(symbols)

        # Apply pagination
        paginated_symbols = symbols[skip:skip + limit]

        # Fetch affinity for this page's symbols (use existing map if we already fetched all)
        if all_affinity_map:
            affinity_map = {
                s['name']: all_affinity_map[s['name']]
                for s in paginated_symbols if s['name'] in all_affinity_map
            }
        else:
            symbol_names = [s['name'] for s in paginated_symbols]
            affinity_map = await get_symbols_affinity_batch(kb_id, symbol_names)

        # Enrich symbols with affinity data
        for symbol in paginated_symbols:
            symbol['affinity'] = affinity_map.get(symbol['name'], None)

        return {
            'kb_id': kb_id,
            'symbols': paginated_symbols,
            'total': total,
            'skip': skip,
            'limit': limit,
            'has_more': (skip + len(paginated_symbols)) < total
        }

    except Exception as e:
        logger.error(f"Failed to get symbols for {kb_id}: {e}")
        return {
            'kb_id': kb_id,
            'symbols': [],
            'total': 0,
            'skip': skip,
            'limit': limit,
            'has_more': False,
            'error': str(e)
        }


async def get_symbol_statistics(kb_id: str) -> Dict[str, Any]:
    """
    Get aggregate statistics for all symbols in a kb_id.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        Dictionary with aggregate stats
    """
    try:
        # Use cached symbol data
        all_symbols = await _load_all_symbols(kb_id)

        # Get total pattern count from ClickHouse for coverage calculation
        total_patterns = 0
        try:
            from app.db.clickhouse import get_pattern_count
            total_patterns = await get_pattern_count(kb_id)
        except Exception as e:
            logger.warning(f"Could not get pattern count for {kb_id}: {e}")

        if not all_symbols:
            return {
                'kb_id': kb_id,
                'total_symbols': 0,
                'total_patterns': total_patterns,
                'avg_frequency': 0,
                'avg_pattern_member_frequency': 0,
                'max_frequency': 0,
                'max_pattern_member_frequency': 0,
                'top_symbols': []
            }

        total_symbols = len(all_symbols)
        total_frequency = sum(s['frequency'] for s in all_symbols)
        total_pmf = sum(s['pattern_member_frequency'] for s in all_symbols)
        max_freq = max(s['frequency'] for s in all_symbols)
        max_pmf = max(s['pattern_member_frequency'] for s in all_symbols)

        # Top 10 by frequency
        sorted_by_freq = sorted(all_symbols, key=lambda s: s['frequency'], reverse=True)
        top_10 = [
            {'name': s['name'], 'frequency': s['frequency'], 'pattern_member_frequency': s['pattern_member_frequency']}
            for s in sorted_by_freq[:10]
        ]

        avg_freq = round(total_frequency / total_symbols, 2)
        avg_pmf = round(total_pmf / total_symbols, 2)

        return {
            'kb_id': kb_id,
            'total_symbols': total_symbols,
            'total_patterns': total_patterns,
            'avg_frequency': avg_freq,
            'avg_pattern_member_frequency': avg_pmf,
            'max_frequency': max_freq,
            'max_pattern_member_frequency': max_pmf,
            'top_symbols': top_10
        }

    except Exception as e:
        logger.error(f"Failed to get statistics for {kb_id}: {e}")
        return {
            'kb_id': kb_id,
            'total_symbols': 0,
            'avg_frequency': 0,
            'avg_pattern_member_frequency': 0,
            'error': str(e)
        }


async def get_symbols_affinity_batch(
    kb_id: str,
    symbol_names: List[str]
) -> Dict[str, Dict[str, float]]:
    """
    Batch fetch affinity data for a list of symbols using Redis pipeline.

    Redis key schema: {kb_id}:affinity:{symbol} (HASH)
        field = emotive_name (e.g., "utility", "energy")
        value = running sum (float, via HINCRBYFLOAT)

    Args:
        kb_id: Knowledge base identifier
        symbol_names: List of symbol names to fetch affinity for

    Returns:
        Dict mapping symbol_name -> {emotive_name: float_value, ...}
        Symbols with no affinity data are omitted from the result.
    """
    if not symbol_names:
        return {}

    try:
        client = await get_redis_client()

        pipe = client.pipeline()
        for name in symbol_names:
            pipe.hgetall(f"{kb_id}:affinity:{name}")

        results = await pipe.execute()

        affinity_map = {}
        for name, hash_data in zip(symbol_names, results):
            if hash_data:  # Non-empty hash
                affinity_map[name] = {
                    k: float(v) for k, v in hash_data.items()
                }

        return affinity_map

    except Exception as e:
        logger.error(f"Failed to batch fetch affinity for {kb_id}: {e}")
        return {}


async def get_all_symbols(kb_id: str) -> Dict[str, Dict[str, Any]]:
    """
    Get all symbols for a knowledgebase as a dictionary mapping symbol name to data.

    This is used for hierarchical analysis to find which pattern names from
    lower nodes appear as symbols in higher nodes.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        Dictionary: {symbol_name: {frequency: int, pmf: float, ratio: float}}
    """
    try:
        symbols_list = await _load_all_symbols(kb_id)

        # Convert list to dictionary mapping symbol name to data
        symbols_dict = {}
        for symbol in symbols_list:
            symbol_name = symbol.get('name')
            if symbol_name:
                symbols_dict[symbol_name] = {
                    'frequency': symbol.get('frequency', 0),
                    'pmf': symbol.get('pattern_member_frequency', 0),
                    'ratio': symbol.get('freq_pmf_ratio', 0.0)
                }

        return symbols_dict

    except Exception as e:
        logger.error(f"Failed to get all symbols for {kb_id}: {e}")
        return {}
