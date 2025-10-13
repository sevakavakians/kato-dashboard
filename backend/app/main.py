"""
KATO Dashboard Backend - FastAPI Application
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.api.routes import router
from app.db.mongodb import get_mongo_client, close_mongo_client
from app.db.redis_client import get_redis_client, close_redis_client
from app.db.qdrant import get_qdrant_client
from app.services.kato_api import close_kato_client
from app.services.websocket import get_connection_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("kato_dashboard")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")

    # Initialize database connections
    try:
        await get_mongo_client()
        logger.info("MongoDB connection initialized")
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")

    try:
        await get_redis_client()
        logger.info("Redis connection initialized")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")

    try:
        get_qdrant_client()
        logger.info("Qdrant connection initialized")
    except Exception as e:
        logger.error(f"Qdrant connection failed: {e}")

    logger.info("KATO Dashboard Backend ready!")

    yield

    # Cleanup
    logger.info("Shutting down KATO Dashboard Backend")
    await close_mongo_client()
    await close_redis_client()
    await close_kato_client()
    logger.info("Connections closed")


# Create FastAPI app
settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Monitoring and management dashboard for KATO AI system",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs"
    }


# WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time system metrics updates

    Clients connect to this endpoint to receive:
    - System metrics updates every 3 seconds
    - Session events when sessions are created/destroyed (Phase 2)
    - System alerts when thresholds are exceeded (Phase 3)
    - Heartbeat messages to maintain connection

    Client can send messages:
    - "ping" - Receives heartbeat response
    - {"type": "subscribe", "subscriptions": ["metrics", "containers"]} - Subscribe to specific data (Phase 4)

    Message format (server to client):
    {
        "type": "realtime_update" | "session_event" | "system_alert" | "heartbeat",
        "timestamp": "ISO-8601 timestamp",
        "data": {...}  // For realtime_update
    }
    """
    manager = get_connection_manager()
    await manager.connect(websocket)

    try:
        while True:
            # Keep connection alive by receiving messages
            # Client can send ping messages, subscription requests, or other commands
            data = await websocket.receive_text()

            # Handle different message types
            if data == "ping":
                await manager.send_heartbeat(websocket)
            else:
                # Try to parse as JSON for structured messages
                try:
                    import json
                    message = json.loads(data)

                    # Handle subscription message (Phase 4)
                    if message.get("type") == "subscribe":
                        subscriptions = message.get("subscriptions", [])
                        manager.handle_subscription(websocket, subscriptions)
                        logger.info(f"Client subscribed to: {subscriptions}")

                    # Additional message handlers can be added here

                except json.JSONDecodeError:
                    logger.warning(f"Received non-JSON message: {data}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("WebSocket client disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle uncaught exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc)
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=True  # Enable for development
    )
