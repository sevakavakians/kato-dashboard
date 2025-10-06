"""
Qdrant vector database connection and utilities
"""
import logging
from typing import Optional, List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.db.qdrant")

# Singleton client
_qdrant_client: Optional[QdrantClient] = None


def get_qdrant_client() -> QdrantClient:
    """Get or create Qdrant client singleton"""
    global _qdrant_client

    if _qdrant_client is None:
        settings = get_settings()
        try:
            _qdrant_client = QdrantClient(url=settings.qdrant_url, timeout=10)
            # Test connection
            _qdrant_client.get_collections()
            logger.info(f"Qdrant connected: {settings.qdrant_url}")
        except Exception as e:
            logger.error(f"Qdrant connection failed: {e}")
            raise

    return _qdrant_client


def close_qdrant_client():
    """Close Qdrant client"""
    global _qdrant_client

    if _qdrant_client:
        _qdrant_client.close()
        _qdrant_client = None
        logger.info("Qdrant connection closed")


async def list_collections() -> List[Dict[str, Any]]:
    """List all Qdrant collections"""
    client = get_qdrant_client()

    try:
        collections_response = client.get_collections()

        result = []
        for collection in collections_response.collections:
            collection_name = collection.name

            # Get collection info
            try:
                info = client.get_collection(collection_name)
                result.append({
                    'name': collection_name,
                    'vectors_count': info.points_count if hasattr(info, 'points_count') else 0,
                    'vector_size': info.config.params.vectors.size if hasattr(info.config.params, 'vectors') else None,
                    'distance': info.config.params.vectors.distance.name if hasattr(info.config.params, 'vectors') else None,
                    'status': info.status.name if hasattr(info, 'status') else 'unknown'
                })
            except Exception as e:
                logger.warning(f"Could not get info for collection {collection_name}: {e}")
                result.append({
                    'name': collection_name,
                    'error': str(e)
                })

        return result
    except Exception as e:
        logger.error(f"Failed to list collections: {e}")
        return []


async def get_collection_stats(collection_name: str) -> Optional[Dict[str, Any]]:
    """Get detailed statistics for a collection"""
    client = get_qdrant_client()

    try:
        info = client.get_collection(collection_name)

        return {
            'name': collection_name,
            'points_count': info.points_count if hasattr(info, 'points_count') else 0,
            'vector_size': info.config.params.vectors.size if hasattr(info.config.params, 'vectors') else None,
            'distance_metric': info.config.params.vectors.distance.name if hasattr(info.config.params, 'vectors') else None,
            'status': info.status.name if hasattr(info, 'status') else 'unknown',
            'optimizer_status': info.optimizer_status.ok if hasattr(info, 'optimizer_status') else None,
            'indexed_vectors_count': info.indexed_vectors_count if hasattr(info, 'indexed_vectors_count') else 0
        }
    except Exception as e:
        logger.error(f"Failed to get collection stats for {collection_name}: {e}")
        return None


async def search_vectors(
    collection_name: str,
    query_vector: List[float],
    limit: int = 10,
    score_threshold: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Search for similar vectors in a collection

    Args:
        collection_name: Name of the collection
        query_vector: Query vector
        limit: Maximum number of results
        score_threshold: Minimum score threshold

    Returns:
        List of search results with scores
    """
    client = get_qdrant_client()

    try:
        search_result = client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=limit,
            score_threshold=score_threshold
        )

        return [
            {
                'id': hit.id,
                'score': hit.score,
                'payload': hit.payload if hasattr(hit, 'payload') else None
            }
            for hit in search_result
        ]
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []


async def get_processor_collections() -> List[Dict[str, Any]]:
    """
    Get all processor-specific vector collections.
    Collections are named vectors_{processor_id}
    """
    collections = await list_collections()

    # Filter to only processor collections
    processor_collections = [
        coll for coll in collections
        if coll['name'].startswith('vectors_')
    ]

    # Extract processor_id from collection name
    for coll in processor_collections:
        coll['processor_id'] = coll['name'].replace('vectors_', '')

    return processor_collections
