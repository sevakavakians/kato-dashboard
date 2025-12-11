"""
Hierarchical Graph Analysis Service

This module analyzes the hierarchical relationships between KATO knowledgebases,
specifically how pattern names from lower-level nodes become symbols in higher-level nodes.

Architecture:
- node0 patterns → symbols in node1
- node1 patterns → symbols in node2
- node2 patterns → symbols in node3

This creates the abstraction hierarchy:
    Tokens → node0 → node1 → node2 → node3
            phrases  sentences paragraphs  documents
"""

import logging
from typing import Dict, List, Any, Set, Tuple, Optional
from app.db import clickhouse, redis_client
from app.db.symbol_stats import get_all_symbols

logger = logging.getLogger("kato_dashboard.services.hierarchy_analysis")


async def compute_hierarchy_graph() -> Dict[str, Any]:
    """
    Compute the complete hierarchical graph showing connections between all knowledgebases.

    Returns:
        {
            'nodes': [
                {
                    'id': 'node0_kato',
                    'level': 0,
                    'pattern_count': 1234567,
                    'label': 'node0 (Phrases)'
                },
                ...
            ],
            'edges': [
                {
                    'from': 'node0_kato',
                    'to': 'node1_kato',
                    'connection_count': 8523,
                    'coverage_source': 0.68,  # % of source patterns used in target
                    'coverage_target': 0.42,  # % of target symbols from source
                    'label': '8,523 connections'
                },
                ...
            ],
            'statistics': {
                'total_nodes': 4,
                'total_edges': 3,
                'total_connections': 25647,
                'hierarchy_depth': 3
            }
        }

    Algorithm:
        For each adjacent KB pair (node_i → node_{i+1}):
            1. Get all pattern names from source KB (ClickHouse)
            2. Get all symbol names from target KB (Redis)
            3. Find intersection: pattern names that appear as symbols
            4. Compute statistics (counts, coverage percentages)
    """
    logger.info("Computing complete hierarchy graph...")

    try:
        # Get all processors (knowledgebases)
        from app.db.hybrid_patterns import get_processors_hybrid
        processors = await get_processors_hybrid()

        if not processors:
            logger.warning("No processors found")
            return {
                'nodes': [],
                'edges': [],
                'statistics': {
                    'total_nodes': 0,
                    'total_edges': 0,
                    'total_connections': 0,
                    'hierarchy_depth': 0
                }
            }

        # Sort processors by hierarchy level (node0, node1, node2, node3)
        # Assume naming convention: node{N}_*
        def extract_level(kb_id: str) -> int:
            """Extract hierarchy level from kb_id like 'node0_kato'"""
            try:
                if kb_id.startswith('node'):
                    level_str = kb_id.split('_')[0].replace('node', '')
                    return int(level_str)
                return 999  # Unknown level, sort to end
            except (ValueError, IndexError):
                return 999

        sorted_processors = sorted(processors, key=lambda p: extract_level(p['kb_id']))

        # Build nodes
        nodes = []
        level_labels = {
            0: 'Phrases',
            1: 'Sentences',
            2: 'Paragraphs',
            3: 'Documents'
        }

        for proc in sorted_processors:
            kb_id = proc['kb_id']
            level = extract_level(kb_id)

            nodes.append({
                'id': kb_id,
                'level': level,
                'pattern_count': proc['patterns_count'],
                'label': f"{kb_id.split('_')[0]} ({level_labels.get(level, 'Level ' + str(level))})",
                'details': {
                    'avg_length': proc.get('statistics', {}).get('avg_length'),
                    'total_patterns': proc['patterns_count']
                }
            })

        # Build edges (connections between adjacent hierarchy levels)
        edges = []
        total_connections = 0

        for i in range(len(sorted_processors) - 1):
            source_kb = sorted_processors[i]['kb_id']
            target_kb = sorted_processors[i + 1]['kb_id']

            logger.info(f"Computing connections: {source_kb} → {target_kb}")

            # Get connection details
            connection_result = await get_connection_details(source_kb, target_kb)

            if connection_result['connection_count'] > 0:
                edges.append({
                    'from': source_kb,
                    'to': target_kb,
                    'connection_count': connection_result['connection_count'],
                    'coverage_source': connection_result['coverage_source'],
                    'coverage_target': connection_result['coverage_target'],
                    'label': f"{connection_result['connection_count']:,} connections"
                })

                total_connections += connection_result['connection_count']

        # Compute overall statistics
        statistics = {
            'total_nodes': len(nodes),
            'total_edges': len(edges),
            'total_connections': total_connections,
            'hierarchy_depth': max((n['level'] for n in nodes), default=0)
        }

        logger.info(f"Hierarchy graph computed: {statistics}")

        return {
            'nodes': nodes,
            'edges': edges,
            'statistics': statistics
        }

    except Exception as e:
        logger.error(f"Failed to compute hierarchy graph: {e}")
        raise


async def get_connection_details(
    source_kb: str,
    target_kb: str,
    sample_limit: Optional[int] = None
) -> Dict[str, Any]:
    """
    Get detailed connection information between two knowledgebases.

    Args:
        source_kb: Source knowledgebase ID (e.g., 'node0_kato')
        target_kb: Target knowledgebase ID (e.g., 'node1_kato')
        sample_limit: Optional limit for pattern samples (for performance)

    Returns:
        {
            'source_kb': 'node0_kato',
            'target_kb': 'node1_kato',
            'connection_count': 8523,
            'coverage_source': 0.68,  # % of source patterns used in target
            'coverage_target': 0.42,  # % of target symbols from source
            'sample_connections': [
                {
                    'pattern_name': 'PTRN|abc123...',
                    'frequency_in_source': 42,
                    'frequency_in_target': 15
                },
                ...
            ]
        }

    Algorithm:
        1. Get all pattern names from source KB (ClickHouse)
        2. Get all symbols from target KB (Redis symbol stats)
        3. Find intersection: which source patterns appear as target symbols
        4. Compute coverage statistics
    """
    logger.info(f"Computing connection details: {source_kb} → {target_kb}")

    try:
        # Step 1: Get all pattern names from source KB
        source_patterns = await clickhouse.get_all_pattern_names(source_kb)
        source_pattern_set = set(source_patterns)

        logger.info(f"Source KB {source_kb}: {len(source_patterns)} patterns")

        # Step 2: Get all symbols from target KB
        target_symbols_data = await get_all_symbols(target_kb)
        target_symbol_set = set(target_symbols_data.keys())

        logger.info(f"Target KB {target_kb}: {len(target_symbol_set)} symbols")

        # Step 3: Find intersection (exact name matching with PTRN| prefix)
        # Pattern names from source need PTRN| prefix to match symbols in target
        source_pattern_set_prefixed = {f"PTRN|{p}" for p in source_patterns}
        connections = source_pattern_set_prefixed & target_symbol_set
        connection_count = len(connections)

        logger.info(f"Found {connection_count} connections between {source_kb} and {target_kb}")

        # Step 4: Compute coverage statistics
        coverage_source = connection_count / len(source_patterns) if source_patterns else 0.0
        coverage_target = connection_count / len(target_symbol_set) if target_symbol_set else 0.0

        # Step 5: Get sample connections with frequency data
        sample_connections = []

        if sample_limit:
            sampled_connections = list(connections)[:sample_limit]
        else:
            sampled_connections = list(connections)[:100]  # Default limit 100

        # Fetch frequencies for sample
        if sampled_connections:
            # sampled_connections contains prefixed symbols like "PTRN|hash"
            # Strip PTRN| prefix to get plain pattern names for source frequency lookup
            plain_pattern_names = [
                s.replace('PTRN|', '', 1) if s.startswith('PTRN|') else s
                for s in sampled_connections
            ]

            # Source frequencies (Redis) - use plain pattern names
            source_frequencies = await redis_client.get_patterns_frequencies_batch(
                source_kb, plain_pattern_names
            )

            # Target frequencies (from symbol stats) - use prefixed symbols
            for i, symbol_name in enumerate(sampled_connections):
                plain_name = plain_pattern_names[i]
                symbol_stats = target_symbols_data.get(symbol_name, {})

                sample_connections.append({
                    'pattern_name': symbol_name,  # Keep the prefixed version
                    'frequency_in_source': source_frequencies.get(plain_name, 0),
                    'frequency_in_target': symbol_stats.get('frequency', 0)
                })

        return {
            'source_kb': source_kb,
            'target_kb': target_kb,
            'connection_count': connection_count,
            'coverage_source': round(coverage_source, 4),
            'coverage_target': round(coverage_target, 4),
            'sample_connections': sample_connections[:50]  # Return max 50 samples
        }

    except Exception as e:
        logger.error(f"Failed to compute connection details {source_kb} → {target_kb}: {e}")
        raise


async def get_pattern_promotion_path(pattern_name: str) -> Dict[str, Any]:
    """
    Trace a pattern's promotion path through the hierarchy.

    Given a pattern name (e.g., from node0), find where it appears as a symbol
    in higher levels, and recursively find where THOSE patterns appear as symbols.

    Args:
        pattern_name: Pattern name to trace (e.g., 'PTRN|abc123...')

    Returns:
        {
            'pattern_name': 'PTRN|abc123...',
            'origin_kb': 'node0_kato',
            'path': [
                {
                    'level': 0,
                    'kb_id': 'node0_kato',
                    'role': 'pattern',
                    'frequency': 42
                },
                {
                    'level': 1,
                    'kb_id': 'node1_kato',
                    'role': 'symbol',
                    'frequency': 15,
                    'contains_patterns': ['PTRN|xyz789...', ...]
                },
                {
                    'level': 2,
                    'kb_id': 'node2_kato',
                    'role': 'symbol',
                    'frequency': 3,
                    'contains_patterns': ['PTRN|def456...', ...]
                }
            ],
            'max_level_reached': 2
        }

    Use Case:
        - Click on an edge in the hierarchy graph
        - Show example patterns and their promotion paths
        - Understand how low-level patterns contribute to high-level abstractions
    """
    logger.info(f"Tracing promotion path for pattern: {pattern_name}")

    try:
        # Get all processors sorted by level
        from app.db.hybrid_patterns import get_processors_hybrid
        processors = await get_processors_hybrid()

        def extract_level(kb_id: str) -> int:
            try:
                if kb_id.startswith('node'):
                    return int(kb_id.split('_')[0].replace('node', ''))
                return 999
            except (ValueError, IndexError):
                return 999

        sorted_processors = sorted(processors, key=lambda p: extract_level(p['kb_id']))

        path = []
        current_pattern = pattern_name
        origin_kb = None

        # Find where the pattern originates (exists as a pattern, not just a symbol)
        for proc in sorted_processors:
            kb_id = proc['kb_id']

            # Check if pattern exists in this KB
            pattern_exists = await clickhouse.get_pattern_by_name(kb_id, current_pattern)

            if pattern_exists:
                if origin_kb is None:
                    origin_kb = kb_id

                # Get frequency
                frequency = await redis_client.get_pattern_frequency(kb_id, current_pattern)

                path.append({
                    'level': extract_level(kb_id),
                    'kb_id': kb_id,
                    'role': 'pattern',
                    'frequency': frequency
                })

                # Check if this pattern appears as a symbol in the next level
                # (This would mean it's used in higher-level patterns)
                # For now, we just record where it exists as a pattern

        # Now check where this pattern appears as a SYMBOL in higher levels
        for proc in sorted_processors:
            kb_id = proc['kb_id']

            # Check if our pattern name appears as a symbol
            symbol_stats = await get_all_symbols(kb_id)

            if current_pattern in symbol_stats:
                symbol_data = symbol_stats[current_pattern]

                path.append({
                    'level': extract_level(kb_id),
                    'kb_id': kb_id,
                    'role': 'symbol',
                    'frequency': symbol_data.get('frequency', 0)
                })

        # Sort path by level
        path.sort(key=lambda x: x['level'])

        max_level = max((p['level'] for p in path), default=0)

        return {
            'pattern_name': pattern_name,
            'origin_kb': origin_kb,
            'path': path,
            'max_level_reached': max_level
        }

    except Exception as e:
        logger.error(f"Failed to trace promotion path for {pattern_name}: {e}")
        raise


# ==============================================================================
# Pattern-Level Hierarchical Graph (Individual Pattern Composition)
# ==============================================================================

def parse_pattern_references(pattern_data: List[List[str]]) -> List[str]:
    """
    Extract pattern names from pattern_data.

    Pattern data is a list of lists, where each inner list contains one element.
    For higher-level patterns, these elements are PTRN|{hash} references.

    Args:
        pattern_data: List like [["PTRN|abc123..."], ["PTRN|def456..."], ...]

    Returns:
        List of plain pattern names (hashes without PTRN| prefix): ["abc123...", "def456...", ...]
    """
    refs = []
    for item in pattern_data:
        if len(item) > 0:
            symbol = item[0]
            # Check if it's a pattern reference
            if symbol.startswith('PTRN|'):
                # Strip the PTRN| prefix to get the plain pattern name (hash)
                pattern_name = symbol.replace('PTRN|', '', 1)
                refs.append(pattern_name)
    return refs


def get_parent_kb(kb_id: str) -> Optional[str]:
    """
    Get the parent knowledge base ID (one level lower).

    Args:
        kb_id: Current KB like 'node1_kato' or 'node2_kato'

    Returns:
        Parent KB like 'node0_kato' or 'node1_kato', or None if no parent
    """
    try:
        if kb_id.startswith('node'):
            level = int(kb_id.split('_')[0].replace('node', ''))
            if level > 0:
                return f"node{level-1}_kato"
    except (ValueError, IndexError):
        pass
    return None


def get_child_kb(kb_id: str) -> Optional[str]:
    """
    Get the child knowledge base ID (one level higher).

    Args:
        kb_id: Current KB like 'node0_kato' or 'node1_kato'

    Returns:
        Child KB like 'node1_kato' or 'node2_kato', or None if no child
    """
    try:
        if kb_id.startswith('node'):
            level = int(kb_id.split('_')[0].replace('node', ''))
            # Assume max level is 3 (node0, node1, node2, node3)
            if level < 3:
                return f"node{level+1}_kato"
    except (ValueError, IndexError):
        pass
    return None


async def find_pattern_kb(pattern_name: str) -> Optional[str]:
    """
    Find which knowledge base contains a given pattern.

    Args:
        pattern_name: Pattern name (hash without PTRN| prefix)

    Returns:
        KB ID like 'node0_kato' or None if not found
    """
    from app.db.hybrid_patterns import get_processors_hybrid

    processors = await get_processors_hybrid()

    for proc in processors:
        kb_id = proc['kb_id']
        pattern = await clickhouse.get_pattern_by_name(kb_id, pattern_name)
        if pattern:
            return kb_id

    return None


async def trace_pattern_graph(
    pattern_name: str,
    kb_id: Optional[str] = None,
    max_depth: int = 2
) -> Dict[str, Any]:
    """
    Trace a pattern's compositional graph through the hierarchy.

    Given a pattern, this function:
    1. Traces backward (ancestors): What patterns is this composed of?
    2. Traces forward (descendants): What patterns use this pattern?

    Args:
        pattern_name: Pattern name (hash without PTRN| prefix)
        kb_id: Knowledge base ID (auto-detected if None)
        max_depth: Maximum depth to trace in each direction

    Returns:
        {
            'nodes': [
                {
                    'id': 'node0_kato:abc123...',
                    'pattern_name': 'abc123...',
                    'kb_id': 'node0_kato',
                    'level': 0,
                    'length': 7,
                    'frequency': 42,
                    'label': 'PTRN|abc1...',
                    'pattern_data': [["Ġthe"], ["Ġcat"], ...]
                },
                ...
            ],
            'edges': [
                {
                    'source': 'node0_kato:abc123...',
                    'target': 'node1_kato:def456...',
                    'position': 0,
                    'label': 'position 0'
                },
                ...
            ],
            'statistics': {
                'total_nodes': 25,
                'total_edges': 24,
                'max_depth_backward': 2,
                'max_depth_forward': 1,
                'origin_pattern': pattern_name,
                'origin_kb': kb_id
            }
        }
    """
    logger.info(f"Tracing pattern graph for {pattern_name} (kb_id={kb_id}, max_depth={max_depth})")

    try:
        # Step 1: Find which KB the pattern belongs to if not specified
        if not kb_id:
            kb_id = await find_pattern_kb(pattern_name)
            if not kb_id:
                raise ValueError(f"Pattern {pattern_name} not found in any knowledge base")

        nodes = []
        edges = []
        visited = set()

        # Helper: Trace backward (ancestors - patterns this is composed of)
        async def trace_ancestors(curr_name: str, curr_kb: str, depth: int):
            if depth > max_depth or curr_name in visited:
                return

            visited.add(curr_name)

            # Get pattern data from ClickHouse
            pattern = await clickhouse.get_pattern_by_name(curr_kb, curr_name)
            if not pattern:
                logger.warning(f"Pattern {curr_name} not found in {curr_kb}")
                return

            # Get frequency from Redis
            frequency = await redis_client.get_pattern_frequency(curr_kb, curr_name)

            # Add node
            node_id = f"{curr_kb}:{curr_name}"
            nodes.append({
                'id': node_id,
                'pattern_name': curr_name,
                'kb_id': curr_kb,
                'level': int(curr_kb.split('_')[0].replace('node', '')) if curr_kb.startswith('node') else 999,
                'length': pattern.get('length', 0),
                'frequency': frequency,
                'label': f"PTRN|{curr_name[:8]}...",  # Truncated for display
                'pattern_data': pattern.get('pattern_data', [])
            })

            # Parse pattern_data to find references
            refs = parse_pattern_references(pattern.get('pattern_data', []))

            if refs:
                # This pattern references other patterns - trace them
                parent_kb = get_parent_kb(curr_kb)
                if parent_kb:
                    for i, ref in enumerate(refs):
                        # Add edge: ref (parent) → curr_name (child)
                        edges.append({
                            'source': f"{parent_kb}:{ref}",
                            'target': node_id,
                            'position': i,
                            'label': f"pos {i}"
                        })

                        # Recursively trace the referenced pattern
                        await trace_ancestors(ref, parent_kb, depth + 1)

        # Helper: Trace forward (descendants - patterns that use this)
        async def trace_descendants(curr_name: str, curr_kb: str, depth: int):
            if depth > max_depth:
                return

            child_kb = get_child_kb(curr_kb)
            if not child_kb:
                return

            # Get all patterns from child KB
            # NOTE: This requires a full scan - could be expensive
            # TODO: Consider building a reverse index in Redis for efficiency
            all_patterns = await clickhouse.query_patterns(child_kb, skip=0, limit=100000)

            for pattern in all_patterns:
                pattern_name_child = pattern['name']
                pattern_data = pattern.get('pattern_data', [])

                # Parse references in this child pattern
                refs = parse_pattern_references(pattern_data)

                # Check if this child pattern references our current pattern
                if curr_name in refs:
                    # Add edge: curr_name (parent) → pattern_name_child (child)
                    node_id_child = f"{child_kb}:{pattern_name_child}"
                    node_id_curr = f"{curr_kb}:{curr_name}"

                    # Find position
                    position = refs.index(curr_name)

                    edges.append({
                        'source': node_id_curr,
                        'target': node_id_child,
                        'position': position,
                        'label': f"pos {position}"
                    })

                    # Add the child node if not already added
                    if pattern_name_child not in visited:
                        visited.add(pattern_name_child)

                        frequency = await redis_client.get_pattern_frequency(child_kb, pattern_name_child)

                        nodes.append({
                            'id': node_id_child,
                            'pattern_name': pattern_name_child,
                            'kb_id': child_kb,
                            'level': int(child_kb.split('_')[0].replace('node', '')) if child_kb.startswith('node') else 999,
                            'length': pattern.get('length', 0),
                            'frequency': frequency,
                            'label': f"PTRN|{pattern_name_child[:8]}...",
                            'pattern_data': pattern_data
                        })

                        # Recursively trace descendants
                        await trace_descendants(pattern_name_child, child_kb, depth + 1)

        # Execute tracing
        logger.info(f"Tracing ancestors (backward) from {pattern_name} in {kb_id}")
        await trace_ancestors(pattern_name, kb_id, 0)

        logger.info(f"Tracing descendants (forward) from {pattern_name} in {kb_id}")
        await trace_descendants(pattern_name, kb_id, 1)

        # Compute statistics
        statistics = {
            'total_nodes': len(nodes),
            'total_edges': len(edges),
            'max_depth_backward': max_depth,
            'max_depth_forward': max_depth,
            'origin_pattern': pattern_name,
            'origin_kb': kb_id
        }

        logger.info(f"Pattern graph traced: {statistics['total_nodes']} nodes, {statistics['total_edges']} edges")

        return {
            'nodes': nodes,
            'edges': edges,
            'statistics': statistics
        }

    except Exception as e:
        logger.error(f"Failed to trace pattern graph for {pattern_name}: {e}")
        raise
