"""
API Routes for KATO Dashboard
"""
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query

from app.services.kato_api import get_kato_client
from app.services import analytics
from app.services.session_manager import get_session_manager
from app.services.docker_stats import get_docker_stats_client
from app.db.qdrant import (
    list_collections,
    get_collection_stats,
    get_processor_collections,
    scroll_points,
    get_point,
    search_vectors,
    search_similar_points,
    delete_points,
    delete_collection as delete_qdrant_collection
)
from app.db.redis_client import (
    get_redis_info,
    get_cache_hit_rate,
    list_keys,
    get_key_info,
    get_session_keys,
    flush_cache
)

logger = logging.getLogger("kato_dashboard.api.routes")

router = APIRouter(prefix="/api/v1")


# ============================================================================
# System & Health Endpoints
# ============================================================================

@router.get("/health")
async def health_check():
    """Dashboard health check"""
    return {
        "status": "healthy",
        "service": "kato-dashboard",
        "version": "1.0.0"
    }


@router.get("/system/kato-health")
async def kato_health():
    """Get KATO service health status"""
    client = get_kato_client()
    return await client.get_health()


@router.get("/system/metrics")
async def get_system_metrics(use_cache: bool = True):
    """Get comprehensive system metrics from KATO"""
    client = get_kato_client()
    return await client.get_metrics(use_cache=use_cache)


@router.get("/system/stats")
async def get_system_stats(minutes: int = Query(10, ge=1, le=1440), use_cache: bool = True):
    """Get time-series statistics"""
    client = get_kato_client()
    return await client.get_stats(minutes=minutes, use_cache=use_cache)


@router.get("/system/cache-stats")
async def get_cache_statistics():
    """Get KATO cache statistics"""
    client = get_kato_client()
    return await client.get_cache_stats(use_cache=False)


@router.get("/system/connection-pools")
async def get_connection_pool_stats():
    """Get connection pool statistics"""
    client = get_kato_client()
    return await client.get_connection_pools()


@router.get("/system/distributed-stm")
async def get_distributed_stm_statistics():
    """Get distributed STM statistics"""
    client = get_kato_client()
    return await client.get_distributed_stm_stats()


@router.get("/system/container-stats")
async def get_container_statistics(use_cache: bool = True):
    """
    Get Docker container statistics for all KATO services

    Returns real-time CPU, memory, network, and disk I/O metrics
    for KATO, ClickHouse, Qdrant, and Redis containers.
    """
    try:
        docker_client = get_docker_stats_client()
        stats = docker_client.get_all_kato_stats(use_cache=use_cache)

        if 'error' in stats:
            raise HTTPException(status_code=503, detail=stats['error'])

        return stats
    except Exception as e:
        logger.error(f"Failed to get container stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system/container-stats/{container_name}")
async def get_single_container_stats(container_name: str):
    """Get statistics for a specific container"""
    try:
        docker_client = get_docker_stats_client()
        stats = docker_client.get_container_stats(container_name)

        if not stats:
            raise HTTPException(status_code=404, detail=f"Container {container_name} not found")

        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get stats for {container_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Session Management Endpoints
# ============================================================================

@router.get("/sessions/count")
async def get_sessions_count():
    """Get active session count"""
    client = get_kato_client()
    return await client.get_session_count()


@router.get("/sessions")
async def list_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """
    List all active sessions with pagination and filtering

    Uses Redis as the source of truth for session data since KATO
    doesn't expose a session listing endpoint.
    """
    try:
        session_manager = get_session_manager()
        result = await session_manager.list_sessions(
            skip=skip,
            limit=limit,
            status=status,
            search=search
        )
        return result
    except Exception as e:
        logger.error(f"Failed to list sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}")
async def get_session_details(session_id: str):
    """
    Get session details

    First tries KATO API, falls back to Redis if not available.
    """
    # Try KATO API first
    client = get_kato_client()
    result = await client.get_session(session_id)

    if 'error' not in result:
        return result

    # Fallback to Redis
    session_manager = get_session_manager()
    redis_result = await session_manager.get_session_by_id(session_id)

    if not redis_result:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return redis_result


@router.get("/sessions/{session_id}/stm")
async def get_session_short_term_memory(session_id: str):
    """Get session's short-term memory"""
    client = get_kato_client()
    result = await client.get_session_stm(session_id)

    if 'error' in result:
        raise HTTPException(status_code=404, detail=result['error'])

    return result


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a session

    First tries KATO API, falls back to Redis if not available.
    """
    # Try KATO API first
    client = get_kato_client()
    result = await client.delete_session(session_id)

    if 'error' not in result:
        return result

    # Fallback to Redis
    session_manager = get_session_manager()
    success = await session_manager.delete_session(session_id)

    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete session")

    return {
        "success": True,
        "session_id": session_id,
        "message": f"Session {session_id} deleted successfully",
        "source": "redis"
    }


@router.post("/sessions/bulk-delete")
async def bulk_delete_sessions(request: Dict[str, Any]):
    """
    Bulk delete multiple sessions

    Request body:
    {
        "session_ids": ["session1", "session2", ...]
    }
    """
    try:
        session_ids = request.get('session_ids', [])

        if not session_ids:
            raise HTTPException(status_code=400, detail="No session IDs provided")

        session_manager = get_session_manager()
        result = await session_manager.bulk_delete_sessions(session_ids)

        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Bulk delete failed'))

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to bulk delete sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/statistics/overview")
async def get_session_statistics():
    """Get aggregated session statistics"""
    try:
        session_manager = get_session_manager()
        stats = await session_manager.get_session_statistics()
        return stats
    except Exception as e:
        logger.error(f"Failed to get session statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/redis-keys/diagnostic")
async def get_redis_session_keys_diagnostic():
    """
    Get raw Redis session keys for diagnostic and cleanup purposes

    Returns detailed information about all session keys in Redis,
    including TTL and status information.
    """
    try:
        session_manager = get_session_manager()
        result = await session_manager.get_redis_session_keys_diagnostic()
        return result
    except Exception as e:
        logger.error(f"Failed to get Redis session keys: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/redis-keys/cleanup")
async def cleanup_expired_redis_session_keys():
    """
    Clean up expired session keys from Redis

    Removes session keys that have no TTL or have expired.
    Useful for cleaning up stale test sessions.
    """
    try:
        session_manager = get_session_manager()
        result = await session_manager.cleanup_expired_session_keys()

        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Cleanup failed'))

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cleanup session keys: {e}")
        raise HTTPException(status_code=500, detail=str(e))




# ============================================================================
# Qdrant Vector Database Endpoints
# ============================================================================

@router.get("/databases/qdrant/collections")
async def list_qdrant_collections():
    """List all Qdrant collections"""
    try:
        collections = await list_collections()
        return {
            "collections": collections,
            "total": len(collections)
        }
    except Exception as e:
        logger.error(f"Failed to list collections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/qdrant/processors")
async def list_qdrant_processor_collections():
    """List processor-specific Qdrant collections"""
    try:
        collections = await get_processor_collections()
        return {
            "collections": collections,
            "total": len(collections)
        }
    except Exception as e:
        logger.error(f"Failed to list processor collections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/qdrant/collections/{collection_name}")
async def get_qdrant_collection_stats(collection_name: str):
    """Get detailed statistics for a collection"""
    try:
        stats = await get_collection_stats(collection_name)

        if not stats:
            raise HTTPException(status_code=404, detail="Collection not found")

        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get collection stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/qdrant/collections/{collection_name}/points")
async def list_collection_points(
    collection_name: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: Optional[str] = Query(None),
    with_vectors: bool = Query(False),
    with_payload: bool = Query(True)
):
    """List points in a collection with pagination"""
    try:
        result = await scroll_points(
            collection_name=collection_name,
            limit=limit,
            offset=offset,
            with_vectors=with_vectors,
            with_payload=with_payload
        )
        return result
    except Exception as e:
        logger.error(f"Failed to list points: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/qdrant/collections/{collection_name}/points/{point_id}")
async def get_collection_point(
    collection_name: str,
    point_id: str,
    with_vectors: bool = Query(True),
    with_payload: bool = Query(True)
):
    """Get a specific point by ID"""
    try:
        point = await get_point(
            collection_name=collection_name,
            point_id=point_id,
            with_vectors=with_vectors,
            with_payload=with_payload
        )

        if not point:
            raise HTTPException(status_code=404, detail="Point not found")

        return point
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/databases/qdrant/collections/{collection_name}/search")
async def search_collection_vectors(
    collection_name: str,
    request: Dict[str, Any]
):
    """Search for similar vectors in a collection"""
    try:
        query_vector = request.get('query_vector')
        limit = request.get('limit', 10)
        score_threshold = request.get('score_threshold')

        if not query_vector:
            raise HTTPException(status_code=400, detail="query_vector is required")

        results = await search_vectors(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=limit,
            score_threshold=score_threshold
        )

        return {
            'results': results,
            'count': len(results),
            'collection': collection_name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to search vectors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/qdrant/collections/{collection_name}/points/{point_id}/similar")
async def find_similar_points(
    collection_name: str,
    point_id: str,
    limit: int = Query(10, ge=1, le=100),
    score_threshold: Optional[float] = Query(None)
):
    """Find points similar to a given point"""
    try:
        results = await search_similar_points(
            collection_name=collection_name,
            point_id=point_id,
            limit=limit,
            score_threshold=score_threshold
        )

        return {
            'reference_point_id': point_id,
            'similar_points': results,
            'count': len(results),
            'collection': collection_name
        }
    except Exception as e:
        logger.error(f"Failed to find similar points: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/databases/qdrant/collections/{collection_name}/points/bulk-delete")
async def bulk_delete_qdrant_points(
    collection_name: str,
    request: Dict[str, Any]
):
    """Bulk delete points from a Qdrant collection"""
    try:
        point_ids = request.get('point_ids', [])

        if not point_ids:
            raise HTTPException(status_code=400, detail="No point IDs provided")

        deleted_count = await delete_points(collection_name, point_ids)

        return {
            "success": True,
            "deleted_count": deleted_count,
            "requested_count": len(point_ids),
            "collection": collection_name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to bulk delete points: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/databases/qdrant/collections/{collection_name}")
async def delete_qdrant_collection_endpoint(collection_name: str):
    """Delete an entire Qdrant collection"""
    try:
        success = await delete_qdrant_collection(collection_name)

        if not success:
            raise HTTPException(
                status_code=404,
                detail="Delete collection failed - collection does not exist"
            )

        return {
            "success": True,
            "collection_name": collection_name,
            "message": f"Collection {collection_name} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Redis Endpoints
# ============================================================================

@router.get("/databases/redis/info")
async def get_redis_information():
    """Get Redis server information"""
    try:
        info = await get_redis_info()
        hit_rate = await get_cache_hit_rate()

        return {
            "info": info,
            "cache_hit_rate": hit_rate
        }
    except Exception as e:
        logger.error(f"Failed to get Redis info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/redis/keys")
async def list_redis_keys(
    pattern: str = Query("*"),
    count: int = Query(100, ge=1, le=10000)
):
    """List Redis keys matching a pattern"""
    try:
        keys = await list_keys(pattern=pattern, count=count)
        return {
            "keys": keys,
            "total": len(keys),
            "pattern": pattern
        }
    except Exception as e:
        logger.error(f"Failed to list keys: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/redis/keys/{key}")
async def get_redis_key_details(key: str):
    """Get detailed information about a Redis key"""
    try:
        info = await get_key_info(key)

        if not info:
            raise HTTPException(status_code=404, detail="Key not found")

        return info
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get key info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/redis/sessions")
async def get_redis_session_keys():
    """Get all session-related keys"""
    try:
        keys = await get_session_keys()
        return {
            "session_keys": keys,
            "total": len(keys)
        }
    except Exception as e:
        logger.error(f"Failed to get session keys: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/databases/redis/flush")
async def flush_redis_cache(pattern: Optional[str] = None):
    """Flush Redis cache (optionally by pattern)"""
    try:
        deleted = await flush_cache(pattern=pattern)

        if deleted == 0:
            raise HTTPException(
                status_code=403,
                detail="Flush failed - database may be in read-only mode"
            )

        return {
            "success": True,
            "deleted_keys": deleted,
            "pattern": pattern
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to flush cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Analytics Endpoints
# ============================================================================

@router.get("/analytics/overview")
async def get_analytics_overview():
    """Get comprehensive analytics overview"""
    try:
        # Get data from multiple sources
        from app.db.hybrid_patterns import get_processors_hybrid

        client = get_kato_client()
        metrics = await client.get_metrics(use_cache=True)
        processors = await get_processors_hybrid()
        qdrant_collections = await get_processor_collections()
        redis_info = await get_redis_info()

        # Compile overview
        overview = {
            "timestamp": metrics.get("timestamp"),
            "sessions": {
                "active": metrics.get("sessions", {}).get("active", 0),
                "total_created": metrics.get("sessions", {}).get("total_created", 0)
            },
            "processors": {
                "total": len(processors),
                "processor_ids": [p['processor_id'] for p in processors]
            },
            "vector_collections": {
                "total": len(qdrant_collections),
                "collections": [c['name'] for c in qdrant_collections]
            },
            "performance": metrics.get("performance", {}),
            "resources": metrics.get("resources", {}),
            "redis": {
                "connected_clients": redis_info.get("connected_clients", 0),
                "used_memory_human": redis_info.get("used_memory_human", "unknown")
            }
        }

        return overview
    except Exception as e:
        logger.error(f"Failed to get analytics overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/patterns/frequency")
async def get_pattern_frequency(
    processor_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100)
):
    """Get pattern frequency analysis"""
    try:
        result = await analytics.get_pattern_frequency_analysis(
            processor_id=processor_id,
            limit=limit
        )
        return result
    except Exception as e:
        logger.error(f"Failed to get pattern frequency: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/sessions/duration")
async def get_session_duration_trends(
    period_hours: int = Query(24, ge=1, le=168)
):
    """Get session duration trends"""
    try:
        result = await analytics.get_session_duration_trends(period_hours=period_hours)
        return result
    except Exception as e:
        logger.error(f"Failed to get session trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/system/performance")
async def get_performance_trends(
    period_minutes: int = Query(60, ge=1, le=1440)
):
    """Get system performance trends over time"""
    try:
        result = await analytics.get_system_performance_trends(period_minutes=period_minutes)
        return result
    except Exception as e:
        logger.error(f"Failed to get performance trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/database/statistics")
async def get_db_statistics():
    """Get aggregated database statistics"""
    try:
        result = await analytics.get_database_statistics()
        return result
    except Exception as e:
        logger.error(f"Failed to get database statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/predictions/load")
async def get_load_predictions():
    """Get predictive load analysis"""
    try:
        result = await analytics.get_predictive_load_analysis()
        return result
    except Exception as e:
        logger.error(f"Failed to get load predictions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/comprehensive")
async def get_comprehensive_analytics(
    pattern_limit: int = Query(20, ge=1, le=100),
    session_period_hours: int = Query(24, ge=1, le=168),
    performance_period_minutes: int = Query(60, ge=1, le=1440)
):
    """Get comprehensive analytics report"""
    try:
        result = await analytics.get_comprehensive_analytics(
            pattern_limit=pattern_limit,
            session_period_hours=session_period_hours,
            performance_period_minutes=performance_period_minutes
        )
        return result
    except Exception as e:
        logger.error(f"Failed to get comprehensive analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Hierarchical Graph Analytics (KATO Abstraction Hierarchy)
# ============================================================================


@router.get("/analytics/graphs/hierarchy")
async def get_hierarchy_graph():
    """
    Get the complete hierarchical graph showing connections between knowledgebases.

    This endpoint analyzes how pattern names from lower-level nodes (e.g., node0)
    become symbols in higher-level nodes (e.g., node1, node2, node3), revealing
    the abstraction hierarchy in KATO's learning architecture.

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
                    'coverage_source': 0.68,
                    'coverage_target': 0.42,
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

    Use Cases:
        - Visualize the abstraction hierarchy (phrases → sentences → paragraphs → documents)
        - Understand pattern reuse across hierarchy levels
        - Identify bottlenecks in hierarchical learning
    """
    try:
        from app.services.hierarchy_analysis import compute_hierarchy_graph
        result = await compute_hierarchy_graph()
        return result
    except Exception as e:
        logger.error(f"Failed to compute hierarchy graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/graphs/hierarchy/{kb_id_from}/to/{kb_id_to}")
async def get_hierarchy_connection_details(
    kb_id_from: str,
    kb_id_to: str,
    sample_limit: int = Query(50, ge=1, le=1000)
):
    """
    Get detailed connection information between two knowledgebases.

    Args:
        kb_id_from: Source knowledgebase (e.g., 'node0_kato')
        kb_id_to: Target knowledgebase (e.g., 'node1_kato')
        sample_limit: Number of sample connections to return (default: 50)

    Returns:
        {
            'source_kb': 'node0_kato',
            'target_kb': 'node1_kato',
            'connection_count': 8523,
            'coverage_source': 0.68,
            'coverage_target': 0.42,
            'sample_connections': [
                {
                    'pattern_name': 'PTRN|abc123...',
                    'frequency_in_source': 42,
                    'frequency_in_target': 15
                },
                ...
            ]
        }

    Use Cases:
        - Click on an edge in the hierarchy graph to see connection details
        - Understand which patterns are promoted between levels
        - Analyze pattern frequency changes across hierarchy
    """
    try:
        from app.services.hierarchy_analysis import get_connection_details
        result = await get_connection_details(kb_id_from, kb_id_to, sample_limit)
        return result
    except Exception as e:
        logger.error(f"Failed to get connection details {kb_id_from} → {kb_id_to}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/graphs/hierarchy/patterns/trace/{pattern_name}")
async def trace_pattern_composition_graph(
    pattern_name: str,
    kb_id: Optional[str] = Query(None, description="Knowledge base ID (auto-detected if not provided)"),
    max_depth: int = Query(2, ge=1, le=5, description="Maximum tracing depth in each direction")
):
    """
    Trace a pattern's compositional graph showing what it's made of and what uses it.

    This endpoint returns individual patterns as nodes and their compositional relationships
    as edges. For a given pattern, it traces:
    - Backward (ancestors): What patterns is this composed of?
    - Forward (descendants): What patterns use this pattern?

    Args:
        pattern_name: Pattern name (hash without PTRN| prefix)
        kb_id: Knowledge base ID (optional, will be auto-detected)
        max_depth: Maximum depth to trace (1-5, default: 2)

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
                    'label': 'pos 0'
                },
                ...
            ],
            'statistics': {
                'total_nodes': 25,
                'total_edges': 24,
                'origin_pattern': pattern_name,
                'origin_kb': kb_id
            }
        }

    Example:
        GET /analytics/graphs/hierarchy/patterns/trace/542bfbb8a72168becb55fdaa50862a5f0a937b75?max_depth=2
    """
    try:
        from app.services.hierarchy_analysis import trace_pattern_graph

        result = await trace_pattern_graph(
            pattern_name=pattern_name,
            kb_id=kb_id,
            max_depth=max_depth
        )

        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to trace pattern graph for {pattern_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/graphs/hierarchy/patterns/{pattern_name}/path")
async def get_pattern_promotion_path(pattern_name: str):
    """
    Trace a pattern's promotion path through the hierarchy.

    Given a pattern name, find where it appears as a pattern in lower levels
    and where it's used as a symbol in higher levels.

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
                    'frequency': 15
                },
                ...
            ],
            'max_level_reached': 2
        }

    Use Cases:
        - Trace how a low-level pattern contributes to high-level abstractions
        - Understand pattern reuse across the hierarchy
        - Debug hierarchical learning behavior
    """
    try:
        from app.services.hierarchy_analysis import get_pattern_promotion_path
        result = await get_pattern_promotion_path(pattern_name)
        return result
    except Exception as e:
        logger.error(f"Failed to trace pattern promotion path for {pattern_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Hybrid Pattern Endpoints (ClickHouse + Redis)
# ============================================================================


@router.get("/databases/patterns/processors")
async def list_pattern_processors():
    """
    List all processors from ClickHouse kb_ids.

    Returns list of processors with pattern counts and statistics.
    Uses hybrid architecture (ClickHouse + Redis).
    """
    try:
        from app.db.hybrid_patterns import get_processors_hybrid
        processors = await get_processors_hybrid()
        return {"processors": processors, "total": len(processors)}
    except Exception as e:
        logger.error(f"Failed to list pattern processors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/patterns/{kb_id}/patterns")
async def get_patterns_for_kb(
    kb_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    sort_by: str = Query('length', regex='^(frequency|length|name|token_count|created_at)$'),
    sort_order: int = Query(-1, ge=-1, le=1),
    include_metadata_flags: bool = Query(False, description="Include has_emotives and has_metadata flags for list indicators")
):
    """
    Get patterns for specific kb_id from hybrid architecture.

    Uses ClickHouse for pattern data and Redis for frequencies.
    Supports pagination and multiple sort options.

    Args:
        kb_id: Knowledge base identifier (e.g., 'node0_kato')
        skip: Pagination offset
        limit: Results per page (max 500)
        sort_by: Field to sort by (frequency, length, name, token_count, created_at)
        sort_order: 1 for ASC, -1 for DESC
        include_metadata_flags: Include existence indicators for emotives/metadata (default False)

    Note: Frequency sorting may take longer for kb_ids with >1M patterns
    """
    try:
        from app.db.hybrid_patterns import get_patterns_hybrid
        return await get_patterns_hybrid(kb_id, skip, limit, sort_by, sort_order, include_metadata_flags)
    except Exception as e:
        logger.error(f"Failed to get patterns for {kb_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/patterns/{kb_id}/patterns/{pattern_name}")
async def get_pattern_detail(kb_id: str, pattern_name: str):
    """
    Get pattern with full metadata from hybrid architecture.

    Fetches pattern data from ClickHouse and metadata from Redis.
    Includes: frequency, emotives, metadata, and ClickHouse optimization fields.

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name (SHA1 hash)
    """
    try:
        from app.db.hybrid_patterns import get_pattern_by_id_hybrid
        pattern = await get_pattern_by_id_hybrid(kb_id, pattern_name)

        if not pattern:
            raise HTTPException(
                status_code=404,
                detail=f"Pattern {pattern_name} not found in {kb_id}"
            )

        return pattern
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get pattern {pattern_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/databases/patterns/{kb_id}/patterns/{pattern_name}")
async def update_pattern(kb_id: str, pattern_name: str, request: Dict[str, Any]):
    """
    Update pattern metadata in hybrid architecture (if not in read-only mode).

    Updates are applied to Redis only (frequency, emotives, metadata).
    ClickHouse pattern data (pattern_data, length, token_count) is immutable.

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name to update
        request: Dictionary with fields to update
            {
                "frequency": int (optional),
                "emotives": {...} (optional),
                "metadata": {...} (optional)
            }

    Returns:
        Updated pattern object with new metadata
    """
    try:
        from app.db.hybrid_patterns import update_pattern_hybrid, get_pattern_by_id_hybrid

        # Validate pattern exists
        existing_pattern = await get_pattern_by_id_hybrid(kb_id, pattern_name)
        if not existing_pattern:
            raise HTTPException(
                status_code=404,
                detail=f"Pattern {pattern_name} not found in {kb_id}"
            )

        # Extract updates
        updates = {}
        if 'frequency' in request:
            if not isinstance(request['frequency'], int) or request['frequency'] < 0:
                raise HTTPException(
                    status_code=400,
                    detail="Frequency must be a non-negative integer"
                )
            updates['frequency'] = request['frequency']

        if 'emotives' in request:
            if not isinstance(request['emotives'], dict):
                raise HTTPException(
                    status_code=400,
                    detail="Emotives must be a dictionary"
                )
            updates['emotives'] = request['emotives']

        if 'metadata' in request:
            if not isinstance(request['metadata'], dict):
                raise HTTPException(
                    status_code=400,
                    detail="Metadata must be a dictionary"
                )
            updates['metadata'] = request['metadata']

        if not updates:
            raise HTTPException(
                status_code=400,
                detail="No valid fields to update (frequency, emotives, metadata)"
            )

        # Perform update
        success = await update_pattern_hybrid(kb_id, pattern_name, updates)

        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update pattern (check read-only mode)"
            )

        # Return updated pattern
        updated_pattern = await get_pattern_by_id_hybrid(kb_id, pattern_name)
        return updated_pattern

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update pattern {pattern_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/patterns/{kb_id}/statistics")
async def get_pattern_statistics_for_kb(kb_id: str):
    """
    Get aggregate pattern statistics for kb_id from ClickHouse.

    Returns:
        - total_patterns: Total pattern count
        - avg_length: Average pattern length
        - min_length: Minimum pattern length
        - max_length: Maximum pattern length
        - avg_token_count: Average unique token count
    """
    try:
        from app.db.hybrid_patterns import get_pattern_statistics_hybrid
        return await get_pattern_statistics_hybrid(kb_id)
    except Exception as e:
        logger.error(f"Failed to get statistics for {kb_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/databases/patterns/{kb_id}/patterns/{pattern_name}")
async def delete_pattern_from_hybrid(kb_id: str, pattern_name: str):
    """
    Delete pattern from both ClickHouse + Redis (if not in read-only mode).

    Args:
        kb_id: Knowledge base identifier
        pattern_name: Pattern hash/name to delete

    Returns:
        Success status
    """
    try:
        from app.db.hybrid_patterns import delete_pattern_hybrid
        success = await delete_pattern_hybrid(kb_id, pattern_name)

        if not success:
            raise HTTPException(
                status_code=400,
                detail="Failed to delete pattern (check read-only mode)"
            )

        return {
            "success": True,
            "kb_id": kb_id,
            "pattern_name": pattern_name,
            "message": f"Pattern {pattern_name} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete pattern {pattern_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/databases/patterns/{kb_id}/patterns/bulk-delete")
async def bulk_delete_patterns_from_hybrid(kb_id: str, request: Dict[str, Any]):
    """
    Bulk delete multiple patterns from hybrid architecture.

    Request body:
    {
        "pattern_names": ["pattern1", "pattern2", ...]
    }

    Returns:
        {
            "success": bool,
            "clickhouse_deleted": int,
            "redis_keys_deleted": int,
            "total": int
        }
    """
    try:
        pattern_names = request.get('pattern_names', [])

        if not pattern_names:
            raise HTTPException(status_code=400, detail="No pattern names provided")

        from app.db.hybrid_patterns import bulk_delete_patterns_hybrid
        result = await bulk_delete_patterns_hybrid(kb_id, pattern_names)

        if 'error' in result:
            raise HTTPException(status_code=400, detail=result['error'])

        return {
            "success": True,
            "kb_id": kb_id,
            **result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to bulk delete patterns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/databases/patterns/{kb_id}")
async def delete_knowledgebase_from_hybrid(kb_id: str):
    """
    Delete entire knowledgebase (all patterns) from hybrid architecture (ClickHouse + Redis).

    This is a DESTRUCTIVE operation that removes ALL patterns for a kb_id.

    Args:
        kb_id: Knowledge base identifier to delete

    Returns:
        {
            "success": bool,
            "kb_id": str,
            "clickhouse_deleted": int,
            "redis_keys_deleted": int,
            "message": str
        }
    """
    try:
        from app.db.hybrid_patterns import delete_knowledgebase_hybrid
        result = await delete_knowledgebase_hybrid(kb_id)

        if 'error' in result:
            raise HTTPException(status_code=400, detail=result['error'])

        return {
            "success": True,
            "kb_id": kb_id,
            "clickhouse_deleted": result['clickhouse_deleted'],
            "redis_keys_deleted": result['redis_keys_deleted'],
            "message": f"Knowledgebase {kb_id} deleted successfully ({result['clickhouse_deleted']} patterns, {result['redis_keys_deleted']} Redis keys)"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete knowledgebase {kb_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/hybrid/health")
async def hybrid_health_check():
    """
    Check health of hybrid architecture (ClickHouse + Redis).

    Returns connection status, latencies, and pattern counts.
    """
    try:
        from app.db.hybrid_patterns import health_check_hybrid
        return await health_check_hybrid()
    except Exception as e:
        logger.error(f"Failed to check hybrid health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================================
# Symbol Statistics Endpoints (Redis-backed symbols_kb)
# ========================================================================

@router.get("/databases/symbols/processors")
async def get_symbol_processors():
    """
    Get list of processors (kb_ids) that have symbol data.

    Returns:
        List of processors with symbol counts
    """
    try:
        from app.db.symbol_stats import get_processors_with_symbols
        return {
            'processors': await get_processors_with_symbols()
        }
    except Exception as e:
        logger.error(f"Failed to get symbol processors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/symbols/{kb_id}")
async def get_symbols_for_kb(
    kb_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    sort_by: str = Query('frequency', regex='^(frequency|pmf|name|ratio)$'),
    sort_order: int = Query(-1, ge=-1, le=1),
    search: Optional[str] = Query(None)
):
    """
    Get paginated, sorted symbol data for a kb_id.

    Args:
        kb_id: Knowledge base identifier (e.g., 'node0_kato')
        skip: Pagination offset
        limit: Results per page (max 500)
        sort_by: Field to sort by (frequency, pmf, name, ratio)
        sort_order: 1 for ASC, -1 for DESC
        search: Optional substring to filter symbol names

    Returns:
        Paginated symbols list with statistics
    """
    try:
        from app.db.symbol_stats import get_symbols_paginated
        return await get_symbols_paginated(kb_id, skip, limit, sort_by, sort_order, search)
    except Exception as e:
        logger.error(f"Failed to get symbols for {kb_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/symbols/{kb_id}/statistics")
async def get_symbol_statistics_for_kb(kb_id: str):
    """
    Get aggregate statistics for all symbols in a kb_id.

    Args:
        kb_id: Knowledge base identifier

    Returns:
        Dictionary with aggregate stats (total, averages, top symbols)
    """
    try:
        from app.db.symbol_stats import get_symbol_statistics
        return await get_symbol_statistics(kb_id)
    except Exception as e:
        logger.error(f"Failed to get symbol statistics for {kb_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
