"""
API Routes for KATO Dashboard
"""
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query

from app.services.kato_api import get_kato_client
from app.services import analytics
from app.services.session_manager import get_session_manager
from app.db.mongodb import (
    get_processor_databases,
    get_patterns,
    get_pattern_by_id,
    get_pattern_statistics,
    update_pattern,
    delete_pattern,
    bulk_delete_patterns,
    list_collections_in_db,
    delete_collection,
    delete_database,
    get_collection_documents,
    get_collection_document_by_id,
    update_collection_document,
    delete_collection_document,
    bulk_delete_collection_documents,
    get_collection_statistics
)
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


@router.delete("/databases/mongodb/processors/{processor_id}")
async def delete_processor_database(processor_id: str):
    """Delete an entire processor database"""
    try:
        success = await delete_database(processor_id)

        if not success:
            raise HTTPException(
                status_code=403,
                detail="Delete database failed - database may be in read-only mode or does not exist"
            )

        return {
            "success": True,
            "processor_id": processor_id,
            "message": f"Database {processor_id} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete database: {e}")
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


@router.post("/databases/mongodb/{processor_id}/patterns/bulk-delete")
async def bulk_delete_patterns_endpoint(
    processor_id: str,
    request: Dict[str, Any]
):
    """Bulk delete multiple patterns"""
    try:
        pattern_ids = request.get('pattern_ids', [])

        if not pattern_ids:
            raise HTTPException(status_code=400, detail="No pattern IDs provided")

        deleted_count = await bulk_delete_patterns(processor_id, pattern_ids)

        if deleted_count == 0:
            raise HTTPException(
                status_code=403,
                detail="Bulk delete failed - database may be in read-only mode"
            )

        return {
            "success": True,
            "deleted_count": deleted_count,
            "requested_count": len(pattern_ids)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to bulk delete patterns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/mongodb/{processor_id}/collections")
async def list_collections_endpoint(processor_id: str):
    """List all collections in a processor database"""
    try:
        collections = await list_collections_in_db(processor_id)
        return {
            "collections": collections,
            "total": len(collections),
            "processor_id": processor_id
        }
    except Exception as e:
        logger.error(f"Failed to list collections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/databases/mongodb/{processor_id}/collections/{collection_name}")
async def delete_collection_endpoint(processor_id: str, collection_name: str):
    """Delete an entire collection"""
    try:
        success = await delete_collection(processor_id, collection_name)

        if not success:
            raise HTTPException(
                status_code=403,
                detail="Delete collection failed - database may be in read-only mode or collection does not exist"
            )

        return {
            "success": True,
            "processor_id": processor_id,
            "collection_name": collection_name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete collection: {e}")
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


@router.get("/databases/mongodb/{processor_id}/collections/{collection_name}/documents")
async def list_collection_documents(
    processor_id: str,
    collection_name: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    sort_by: str = Query("_id"),
    sort_order: int = Query(-1, ge=-1, le=1)
):
    """Get documents from any collection"""
    try:
        result = await get_collection_documents(
            processor_id=processor_id,
            collection_name=collection_name,
            skip=skip,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return result
    except Exception as e:
        logger.error(f"Failed to get collection documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/mongodb/{processor_id}/collections/{collection_name}/documents/{document_id}")
async def get_collection_document_details(
    processor_id: str,
    collection_name: str,
    document_id: str
):
    """Get specific document details from any collection"""
    try:
        document = await get_collection_document_by_id(processor_id, collection_name, document_id)

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        return document
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/databases/mongodb/{processor_id}/collections/{collection_name}/documents/{document_id}")
async def update_collection_document_endpoint(
    processor_id: str,
    collection_name: str,
    document_id: str,
    updates: Dict[str, Any]
):
    """Update a document in any collection"""
    try:
        success = await update_collection_document(processor_id, collection_name, document_id, updates)

        if not success:
            raise HTTPException(
                status_code=403,
                detail="Update failed - database may be in read-only mode"
            )

        return {"success": True, "document_id": document_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/databases/mongodb/{processor_id}/collections/{collection_name}/documents/{document_id}")
async def delete_collection_document_endpoint(
    processor_id: str,
    collection_name: str,
    document_id: str
):
    """Delete a document from any collection"""
    try:
        success = await delete_collection_document(processor_id, collection_name, document_id)

        if not success:
            raise HTTPException(
                status_code=403,
                detail="Delete failed - database may be in read-only mode"
            )

        return {"success": True, "document_id": document_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/databases/mongodb/{processor_id}/collections/{collection_name}/documents/bulk-delete")
async def bulk_delete_collection_documents_endpoint(
    processor_id: str,
    collection_name: str,
    request: Dict[str, Any]
):
    """Bulk delete multiple documents from any collection"""
    try:
        document_ids = request.get('document_ids', [])

        if not document_ids:
            raise HTTPException(status_code=400, detail="No document IDs provided")

        deleted_count = await bulk_delete_collection_documents(processor_id, collection_name, document_ids)

        if deleted_count == 0:
            raise HTTPException(
                status_code=403,
                detail="Bulk delete failed - database may be in read-only mode"
            )

        return {
            "success": True,
            "deleted_count": deleted_count,
            "requested_count": len(document_ids)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to bulk delete documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/databases/mongodb/{processor_id}/collections/{collection_name}/statistics")
async def get_collection_statistics_endpoint(
    processor_id: str,
    collection_name: str
):
    """Get aggregated statistics for any collection"""
    try:
        stats = await get_collection_statistics(processor_id, collection_name)
        return stats
    except Exception as e:
        logger.error(f"Failed to get collection statistics: {e}")
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
