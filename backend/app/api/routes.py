"""
API Routes for KATO Dashboard
"""
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query

from app.services.kato_api import get_kato_client
from app.db.mongodb import (
    get_processor_databases,
    get_patterns,
    get_pattern_by_id,
    get_pattern_statistics,
    update_pattern,
    delete_pattern
)
from app.db.qdrant import (
    list_collections,
    get_collection_stats,
    get_processor_collections
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
    limit: int = Query(50, ge=1, le=200)
):
    """List all active sessions with pagination"""
    client = get_kato_client()
    result = await client.list_sessions(skip=skip, limit=limit)

    if 'error' in result and result.get('total', 0) == 0:
        logger.warning(f"Failed to list sessions: {result['error']}")

    return result


@router.get("/sessions/{session_id}")
async def get_session_details(session_id: str):
    """Get session details"""
    client = get_kato_client()
    result = await client.get_session(session_id)

    if 'error' in result:
        raise HTTPException(status_code=404, detail=result['error'])

    return result


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
    """Delete a session"""
    client = get_kato_client()
    result = await client.delete_session(session_id)

    if 'error' in result:
        raise HTTPException(status_code=400, detail=result['error'])

    return result


# ============================================================================
# MongoDB Database Endpoints
# ============================================================================

@router.get("/databases/mongodb/processors")
async def list_processor_databases():
    """List all processor databases"""
    try:
        databases = await get_processor_databases()
        return {
            "processors": databases,
            "total": len(databases)
        }
    except Exception as e:
        logger.error(f"Failed to list processor databases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/mongodb/{processor_id}/patterns")
async def list_patterns(
    processor_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    sort_by: str = Query("frequency", regex="^(frequency|_id|pattern)$"),
    sort_order: int = Query(-1, ge=-1, le=1)
):
    """Get patterns for a processor"""
    try:
        result = await get_patterns(
            processor_id=processor_id,
            skip=skip,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return result
    except Exception as e:
        logger.error(f"Failed to get patterns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/mongodb/{processor_id}/patterns/{pattern_id}")
async def get_pattern_details(processor_id: str, pattern_id: str):
    """Get specific pattern details"""
    try:
        pattern = await get_pattern_by_id(processor_id, pattern_id)

        if not pattern:
            raise HTTPException(status_code=404, detail="Pattern not found")

        return pattern
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get pattern: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/databases/mongodb/{processor_id}/patterns/{pattern_id}")
async def update_pattern_endpoint(
    processor_id: str,
    pattern_id: str,
    updates: Dict[str, Any]
):
    """Update a pattern"""
    try:
        success = await update_pattern(processor_id, pattern_id, updates)

        if not success:
            raise HTTPException(
                status_code=403,
                detail="Update failed - database may be in read-only mode"
            )

        return {"success": True, "pattern_id": pattern_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update pattern: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/databases/mongodb/{processor_id}/patterns/{pattern_id}")
async def delete_pattern_endpoint(processor_id: str, pattern_id: str):
    """Delete a pattern"""
    try:
        success = await delete_pattern(processor_id, pattern_id)

        if not success:
            raise HTTPException(
                status_code=403,
                detail="Delete failed - database may be in read-only mode"
            )

        return {"success": True, "pattern_id": pattern_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete pattern: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/mongodb/{processor_id}/statistics")
async def get_processor_statistics(processor_id: str):
    """Get aggregated statistics for a processor"""
    try:
        stats = await get_pattern_statistics(processor_id)
        return stats
    except Exception as e:
        logger.error(f"Failed to get statistics: {e}")
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
        client = get_kato_client()
        metrics = await client.get_metrics(use_cache=True)
        processors = await get_processor_databases()
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
