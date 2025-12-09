"""
Symbol Statistics Module - Redis-backed symbol frequency data

Provides access to KATO's symbols_kb data stored in Redis:
- symbol:freq:{symbol} - Raw frequency count
- symbol:pmf:{symbol} - Pattern member frequency

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
MAX_SYMBOLS_TO_LOAD = 100000  # Limit to prevent memory/timeout issues


async def get_processors_with_symbols() -> List[Dict[str, Any]]:
    """
    Get list of processors (kb_ids) that have symbol data in Redis.

    Returns:
        List of processor dictionaries with kb_id and symbol count
    """
    try:
        client = await get_redis_client()

        # Scan once and count symbols per kb_id
        kb_symbol_counts = {}
        cursor = 0

        logger.info("Scanning for processors with symbol data...")

        while True:
            cursor, keys = await client.scan(cursor, match="*:symbol:freq:*", count=5000)

            for key in keys:
                # Extract kb_id from key: "kb_id:symbol:freq:symbol_name"
                parts = key.split(":symbol:freq:")
                if len(parts) == 2:
                    kb_id = parts[0]
                    kb_symbol_counts[kb_id] = kb_symbol_counts.get(kb_id, 0) + 1

            if cursor == 0:
                break

        # Build processor list
        processors = []
        for kb_id in sorted(kb_symbol_counts.keys()):
            processors.append({
                'kb_id': kb_id,
                'processor_id': kb_id,  # For consistency with patterns API
                'symbols_count': kb_symbol_counts[kb_id]
            })

        logger.info(f"Found {len(processors)} processors with symbol data: {[p['kb_id'] for p in processors]}")
        return processors

    except Exception as e:
        logger.error(f"Failed to get processors with symbols: {e}")
        return []


async def _load_all_symbols(kb_id: str) -> List[Dict[str, Any]]:
    """
    Load all symbols for a kb_id from Redis (cached).

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

    # Scan symbol keys (with limit to prevent timeouts on huge datasets)
    symbol_keys = []
    cursor = 0
    pattern = f"{kb_id}:symbol:freq:*"
    truncated = False

    while True:
        cursor, keys = await client.scan(cursor, match=pattern, count=5000)
        symbol_keys.extend(keys)

        # Stop if we hit the limit
        if len(symbol_keys) >= MAX_SYMBOLS_TO_LOAD:
            logger.warning(f"Hit max symbols limit ({MAX_SYMBOLS_TO_LOAD}) for {kb_id}, truncating...")
            symbol_keys = symbol_keys[:MAX_SYMBOLS_TO_LOAD]
            truncated = True
            break

        if cursor == 0:
            break

    logger.info(f"Found {len(symbol_keys)} symbol keys for {kb_id}{' (truncated)' if truncated else ''}")

    # Fetch values in batches
    symbols = []
    batch_size = 1000

    for i in range(0, len(symbol_keys), batch_size):
        batch_keys = symbol_keys[i:i+batch_size]
        pipe = client.pipeline()
        symbol_names = []

        for freq_key in batch_keys:
            symbol_name = freq_key.split(f"{kb_id}:symbol:freq:", 1)[1]
            symbol_names.append(symbol_name)
            pmf_key = f"{kb_id}:symbol:pmf:{symbol_name}"
            pipe.get(freq_key)
            pipe.get(pmf_key)

        results = await pipe.execute()

        for j, symbol_name in enumerate(symbol_names):
            freq_value = results[j * 2]
            pmf_value = results[j * 2 + 1]
            freq = int(freq_value) if freq_value else 0
            pmf = int(pmf_value) if pmf_value else 0

            symbols.append({
                'name': symbol_name,
                'frequency': freq,
                'pattern_member_frequency': pmf,
                'freq_pmf_ratio': round(freq / pmf, 2) if pmf > 0 else 0
            })

        if i % 10000 == 0 and i > 0:
            logger.info(f"  Loaded {i}/{len(symbol_keys)} symbols...")

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

    Uses in-memory caching to avoid re-scanning Redis on every request.

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
            symbols = all_symbols

        # Sort symbols
        if sort_by == 'frequency':
            symbols.sort(key=lambda s: s['frequency'], reverse=(sort_order == -1))
        elif sort_by == 'pmf' or sort_by == 'pattern_member_frequency':
            symbols.sort(key=lambda s: s['pattern_member_frequency'], reverse=(sort_order == -1))
        elif sort_by == 'name':
            symbols.sort(key=lambda s: s['name'], reverse=(sort_order == -1))
        elif sort_by == 'ratio' or sort_by == 'freq_pmf_ratio':
            symbols.sort(key=lambda s: s['freq_pmf_ratio'], reverse=(sort_order == -1))

        total = len(symbols)

        # Apply pagination
        paginated_symbols = symbols[skip:skip + limit]

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
        client = await get_redis_client()
        pattern = f"{kb_id}:symbol:freq:*"

        total_symbols = 0
        total_frequency = 0
        total_pmf = 0
        max_freq = 0
        max_pmf = 0
        top_symbols_by_freq = []

        cursor = 0

        logger.info(f"Computing statistics for {kb_id}")

        while True:
            cursor, keys = await client.scan(cursor, match=pattern, count=1000)

            for freq_key in keys:
                symbol_name = freq_key.split(f"{kb_id}:symbol:freq:", 1)[1] if f"{kb_id}:symbol:freq:" in freq_key else freq_key
                pmf_key = f"{kb_id}:symbol:pmf:{symbol_name}"

                freq_value = await client.get(freq_key)
                pmf_value = await client.get(pmf_key)

                freq = int(freq_value) if freq_value else 0
                pmf = int(pmf_value) if pmf_value else 0

                total_symbols += 1
                total_frequency += freq
                total_pmf += pmf
                max_freq = max(max_freq, freq)
                max_pmf = max(max_pmf, pmf)

                # Track top 10 symbols by frequency
                top_symbols_by_freq.append((symbol_name, freq, pmf))

            if cursor == 0:
                break

        # Sort and get top 10
        top_symbols_by_freq.sort(key=lambda x: x[1], reverse=True)
        top_10 = [
            {'name': name, 'frequency': freq, 'pattern_member_frequency': pmf}
            for name, freq, pmf in top_symbols_by_freq[:10]
        ]

        avg_freq = round(total_frequency / total_symbols, 2) if total_symbols > 0 else 0
        avg_pmf = round(total_pmf / total_symbols, 2) if total_symbols > 0 else 0

        return {
            'kb_id': kb_id,
            'total_symbols': total_symbols,
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
