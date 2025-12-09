#!/usr/bin/env python3
"""
Populate symbol statistics in Redis from ClickHouse patterns.

This script calculates symbol frequency and pattern_member_frequency
directly from ClickHouse patterns and writes them to Redis.

Usage:
    python populate_symbol_stats.py [--kb-id node0_kato] [--dry-run]
"""

import argparse
import logging
import sys
from collections import Counter
from itertools import chain
import redis
import clickhouse_connect

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def populate_symbols_for_kb(
    redis_client,
    clickhouse_client,
    kb_id: str,
    dry_run: bool = False
):
    """
    Populate symbol statistics for a specific kb_id.

    Args:
        redis_client: Redis client
        clickhouse_client: ClickHouse client
        kb_id: Knowledge base identifier
        dry_run: If True, don't write to Redis
    """
    logger.info(f"Processing kb_id: {kb_id}")

    # Get all patterns from ClickHouse
    query = f"""
        SELECT name, pattern_data, length
        FROM kato.patterns_data
        WHERE kb_id = '{kb_id}'
    """

    logger.info(f"Querying ClickHouse for patterns...")
    result = clickhouse_client.query(query)
    patterns = result.result_rows

    if not patterns:
        logger.warning(f"No patterns found for kb_id: {kb_id}")
        return 0

    logger.info(f"Processing {len(patterns)} patterns...")

    # Track symbol statistics
    symbol_frequency = Counter()  # Total occurrences
    symbol_pmf = Counter()  # Pattern membership frequency

    # Process patterns in batches for progress reporting
    batch_size = 10000
    for i in range(0, len(patterns), batch_size):
        batch = patterns[i:i+batch_size]

        for pattern_name, pattern_data, length in batch:
            # Pattern_data is already a list from ClickHouse
            # It's a list of lists: [[sym1, sym2], [sym3]]

            # Flatten to get all symbols
            all_symbols = list(chain(*pattern_data))

            # Count occurrences of each symbol in this pattern
            symbol_counts = Counter(all_symbols)

            # Update statistics
            # Assume frequency=1 for each pattern (since we don't have Redis frequencies yet)
            for symbol, count in symbol_counts.items():
                symbol_frequency[symbol] += count  # count * 1
                symbol_pmf[symbol] += 1  # This pattern contains this symbol

        logger.info(f"  Processed {min(i+batch_size, len(patterns))}/{len(patterns)} patterns...")

    logger.info(f"Calculated statistics for {len(symbol_frequency)} unique symbols")

    # Write to Redis
    if dry_run:
        logger.info(f"DRY RUN: Would write {len(symbol_frequency)} symbols to Redis")
        # Show sample
        sample_symbols = list(symbol_frequency.most_common(10))
        for symbol, freq in sample_symbols:
            pmf = symbol_pmf[symbol]
            logger.info(f"  {symbol}: freq={freq}, pmf={pmf}")
        return len(symbol_frequency)

    # Write symbol statistics to Redis
    logger.info(f"Writing {len(symbol_frequency)} symbols to Redis...")
    pipe = redis_client.pipeline()

    for i, symbol in enumerate(symbol_frequency):
        freq_key = f"{kb_id}:symbol:freq:{symbol}"
        pmf_key = f"{kb_id}:symbol:pmf:{symbol}"

        pipe.set(freq_key, symbol_frequency[symbol])
        pipe.set(pmf_key, symbol_pmf[symbol])

        # Execute pipeline in batches
        if i % 1000 == 0 and i > 0:
            pipe.execute()
            pipe = redis_client.pipeline()
            logger.info(f"  Written {i}/{len(symbol_frequency)} symbols...")

    # Execute remaining
    pipe.execute()

    logger.info(f"Successfully wrote {len(symbol_frequency)} symbols to Redis for {kb_id}")
    return len(symbol_frequency)


def main():
    parser = argparse.ArgumentParser(
        description='Populate symbol statistics in Redis from ClickHouse'
    )
    parser.add_argument(
        '--kb-id',
        help='Specific kb_id to process (default: process all)'
    )
    parser.add_argument(
        '--redis-url',
        default='redis://localhost:6379',
        help='Redis connection URL'
    )
    parser.add_argument(
        '--clickhouse-host',
        default='localhost',
        help='ClickHouse host'
    )
    parser.add_argument(
        '--clickhouse-port',
        type=int,
        default=8123,
        help='ClickHouse port'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without writing'
    )

    args = parser.parse_args()

    logger.info("="*80)
    logger.info("POPULATE SYMBOL STATISTICS")
    logger.info("="*80)
    logger.info(f"Redis: {args.redis_url}")
    logger.info(f"ClickHouse: {args.clickhouse_host}:{args.clickhouse_port}")
    logger.info(f"Dry run: {args.dry_run}")
    logger.info("="*80)

    try:
        # Connect to Redis
        logger.info("Connecting to Redis...")
        redis_client = redis.from_url(args.redis_url, decode_responses=True)
        redis_client.ping()
        logger.info("Connected to Redis")

        # Connect to ClickHouse
        logger.info("Connecting to ClickHouse...")
        clickhouse_client = clickhouse_connect.get_client(
            host=args.clickhouse_host,
            port=args.clickhouse_port,
            database='kato'
        )
        logger.info("Connected to ClickHouse")

        # Get kb_ids to process
        if args.kb_id:
            kb_ids = [args.kb_id]
        else:
            # Get all kb_ids from ClickHouse
            query = "SELECT DISTINCT kb_id FROM kato.patterns_data ORDER BY kb_id"
            result = clickhouse_client.query(query)
            kb_ids = [row[0] for row in result.result_rows]

        logger.info(f"Processing {len(kb_ids)} kb_id(s): {kb_ids}")

        # Process each kb_id
        total_symbols = 0
        for kb_id in kb_ids:
            logger.info("\n" + "="*80)
            count = populate_symbols_for_kb(redis_client, clickhouse_client, kb_id, args.dry_run)
            total_symbols += count

        logger.info("\n" + "="*80)
        logger.info(f"Complete! Processed {total_symbols} unique symbols across {len(kb_ids)} kb_id(s)")
        logger.info("="*80)

        # Close connections
        redis_client.close()
        clickhouse_client.close()

    except KeyboardInterrupt:
        logger.warning("\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    logger.info("\nDone!")


if __name__ == '__main__':
    main()
