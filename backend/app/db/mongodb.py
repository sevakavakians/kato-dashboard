"""
MongoDB connection and utilities
"""
import logging
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConnectionFailure

from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.db.mongodb")

# Singleton client
_mongo_client: Optional[AsyncIOMotorClient] = None


async def get_mongo_client() -> AsyncIOMotorClient:
    """Get or create MongoDB client singleton"""
    global _mongo_client

    if _mongo_client is None:
        settings = get_settings()
        try:
            _mongo_client = AsyncIOMotorClient(
                settings.mongo_url,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                # Read-only configuration
                readPreference='secondaryPreferred' if settings.mongo_read_only else 'primary'
            )
            # Test connection
            await _mongo_client.admin.command('ping')
            logger.info(f"MongoDB connected: {settings.mongo_url}")
        except ConnectionFailure as e:
            logger.error(f"MongoDB connection failed: {e}")
            raise

    return _mongo_client


async def close_mongo_client():
    """Close MongoDB client"""
    global _mongo_client

    if _mongo_client:
        _mongo_client.close()
        _mongo_client = None
        logger.info("MongoDB connection closed")


async def get_database(db_name: str) -> AsyncIOMotorDatabase:
    """Get a specific database by name"""
    client = await get_mongo_client()
    return client[db_name]


async def list_databases() -> List[str]:
    """List all database names"""
    client = await get_mongo_client()
    db_list = await client.list_database_names()
    # Filter out system databases
    return [db for db in db_list if db not in ['admin', 'config', 'local']]


async def get_processor_databases() -> List[Dict[str, Any]]:
    """
    Get all processor-specific databases.
    Each KATO processor has its own database named by processor_id.
    """
    databases = await list_databases()

    result = []
    for db_name in databases:
        db = await get_database(db_name)
        collections = await db.list_collection_names()

        # Check if it looks like a KATO processor database
        if any(col.endswith('_kb') for col in collections):
            result.append({
                'processor_id': db_name,
                'collections': collections,
                'stats': await db.command('dbStats')
            })

    return result


async def get_patterns(
    processor_id: str,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = 'frequency',
    sort_order: int = -1,
    filter_query: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Get patterns from a processor's patterns_kb collection

    Args:
        processor_id: The processor database name
        skip: Number of documents to skip (pagination)
        limit: Maximum documents to return
        sort_by: Field to sort by
        sort_order: 1 for ascending, -1 for descending
        filter_query: Optional MongoDB query filter

    Returns:
        Dictionary with patterns and metadata
    """
    db = await get_database(processor_id)
    collection = db['patterns_kb']

    query = filter_query or {}

    # Get total count
    total = await collection.count_documents(query)

    # Get patterns with pagination
    cursor = collection.find(query).sort(sort_by, sort_order).skip(skip).limit(limit)
    patterns = await cursor.to_list(length=limit)

    return {
        'patterns': patterns,
        'total': total,
        'skip': skip,
        'limit': limit,
        'has_more': (skip + len(patterns)) < total
    }


async def get_pattern_by_id(processor_id: str, pattern_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific pattern by ID"""
    db = await get_database(processor_id)
    collection = db['patterns_kb']
    return await collection.find_one({'_id': pattern_id})


async def update_pattern(
    processor_id: str,
    pattern_id: str,
    updates: Dict[str, Any]
) -> bool:
    """
    Update a pattern (if not in read-only mode)

    Returns:
        True if updated, False otherwise
    """
    settings = get_settings()
    if settings.mongo_read_only:
        logger.warning("MongoDB is in read-only mode, update rejected")
        return False

    db = await get_database(processor_id)
    collection = db['patterns_kb']

    result = await collection.update_one(
        {'_id': pattern_id},
        {'$set': updates}
    )

    return result.modified_count > 0


async def delete_pattern(processor_id: str, pattern_id: str) -> bool:
    """
    Delete a pattern (if not in read-only mode)

    Returns:
        True if deleted, False otherwise
    """
    settings = get_settings()
    if settings.mongo_read_only:
        logger.warning("MongoDB is in read-only mode, delete rejected")
        return False

    db = await get_database(processor_id)
    collection = db['patterns_kb']

    result = await collection.delete_one({'_id': pattern_id})

    return result.deleted_count > 0


async def bulk_delete_patterns(processor_id: str, pattern_ids: List[str]) -> int:
    """
    Delete multiple patterns at once (if not in read-only mode)

    Args:
        processor_id: The processor database name
        pattern_ids: List of pattern IDs to delete

    Returns:
        Number of patterns deleted
    """
    settings = get_settings()
    if settings.mongo_read_only:
        logger.warning("MongoDB is in read-only mode, bulk delete rejected")
        return 0

    if not pattern_ids:
        return 0

    db = await get_database(processor_id)
    collection = db['patterns_kb']

    result = await collection.delete_many({'_id': {'$in': pattern_ids}})

    logger.info(f"Bulk deleted {result.deleted_count} patterns from {processor_id}")
    return result.deleted_count


async def list_collections_in_db(processor_id: str) -> List[str]:
    """
    List all collections in a processor database

    Args:
        processor_id: The processor database name

    Returns:
        List of collection names
    """
    db = await get_database(processor_id)
    collections = await db.list_collection_names()
    return collections


async def delete_collection(processor_id: str, collection_name: str) -> bool:
    """
    Delete an entire collection (if not in read-only mode)

    Args:
        processor_id: The processor database name
        collection_name: Name of the collection to delete

    Returns:
        True if deleted, False otherwise
    """
    settings = get_settings()
    if settings.mongo_read_only:
        logger.warning("MongoDB is in read-only mode, collection delete rejected")
        return False

    db = await get_database(processor_id)

    # Check if collection exists
    collections = await db.list_collection_names()
    if collection_name not in collections:
        logger.warning(f"Collection {collection_name} not found in {processor_id}")
        return False

    await db.drop_collection(collection_name)
    logger.info(f"Deleted collection {collection_name} from {processor_id}")
    return True


async def delete_database(processor_id: str) -> bool:
    """
    Delete an entire processor database (if not in read-only mode)

    Args:
        processor_id: The processor database name to delete

    Returns:
        True if deleted, False otherwise
    """
    settings = get_settings()
    if settings.mongo_read_only:
        logger.warning("MongoDB is in read-only mode, database delete rejected")
        return False

    # Check if database exists
    databases = await list_databases()
    if processor_id not in databases:
        logger.warning(f"Database {processor_id} not found")
        return False

    client = await get_mongo_client()
    await client.drop_database(processor_id)
    logger.info(f"Deleted database {processor_id}")
    return True


async def get_pattern_statistics(processor_id: str) -> Dict[str, Any]:
    """
    Get aggregated statistics about patterns
    """
    db = await get_database(processor_id)
    collection = db['patterns_kb']

    # Aggregation pipeline
    pipeline = [
        {
            '$facet': {
                'total_count': [{'$count': 'count'}],
                'frequency_stats': [
                    {
                        '$group': {
                            '_id': None,
                            'avg_frequency': {'$avg': '$frequency'},
                            'max_frequency': {'$max': '$frequency'},
                            'min_frequency': {'$min': '$frequency'},
                            'total_frequency': {'$sum': '$frequency'}
                        }
                    }
                ],
                'length_distribution': [
                    {
                        '$project': {
                            'length': {'$size': '$pattern'}
                        }
                    },
                    {
                        '$group': {
                            '_id': '$length',
                            'count': {'$sum': 1}
                        }
                    },
                    {'$sort': {'_id': 1}}
                ]
            }
        }
    ]

    result = await collection.aggregate(pipeline).to_list(length=1)

    if result:
        data = result[0]
        return {
            'total_patterns': data['total_count'][0]['count'] if data['total_count'] else 0,
            'frequency_stats': data['frequency_stats'][0] if data['frequency_stats'] else {},
            'length_distribution': data['length_distribution']
        }

    return {
        'total_patterns': 0,
        'frequency_stats': {},
        'length_distribution': []
    }
