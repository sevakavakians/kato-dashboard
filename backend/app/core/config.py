"""
Configuration management for KATO Dashboard
"""
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings"""

    # API Configuration
    app_name: str = "KATO Dashboard API"
    app_version: str = "1.0.0"
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8080, env="PORT")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")

    # KATO Service
    kato_api_url: str = Field(default="http://kato:8000", env="KATO_API_URL")

    # Database Connections (Read-Only)
    mongo_url: str = Field(default="mongodb://mongodb:27017", env="MONGO_URL")
    mongo_read_only: bool = Field(default=True, env="MONGO_READ_ONLY")
    qdrant_url: str = Field(default="http://qdrant:6333", env="QDRANT_URL")
    redis_url: str = Field(default="redis://redis:6379", env="REDIS_URL")

    # Security
    admin_username: str = Field(default="admin", env="ADMIN_USERNAME")
    admin_password: str = Field(default="changeme", env="ADMIN_PASSWORD")
    secret_key: str = Field(default="your-secret-key-change-in-production", env="SECRET_KEY")
    algorithm: str = Field(default="HS256", env="ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")

    # CORS
    cors_origins: str = Field(default="http://localhost:3000,http://localhost:8080", env="CORS_ORIGINS")

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins into list"""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    # Cache Configuration
    cache_ttl_seconds: int = Field(default=30, env="CACHE_TTL_SECONDS")
    max_cache_size: int = Field(default=1000, env="MAX_CACHE_SIZE")

    # WebSocket Feature Flags
    websocket_enabled: bool = Field(default=True, env="WEBSOCKET_ENABLED")
    websocket_container_stats: bool = Field(default=True, env="WEBSOCKET_CONTAINER_STATS")
    websocket_session_events: bool = Field(default=True, env="WEBSOCKET_SESSION_EVENTS")
    websocket_system_alerts: bool = Field(default=True, env="WEBSOCKET_SYSTEM_ALERTS")
    websocket_selective_subscriptions: bool = Field(default=True, env="WEBSOCKET_SELECTIVE_SUBSCRIPTIONS")

    # Alert Thresholds (Phase 3)
    alert_cpu_threshold: float = Field(default=80.0, env="ALERT_CPU_THRESHOLD")
    alert_memory_threshold: float = Field(default=85.0, env="ALERT_MEMORY_THRESHOLD")
    alert_error_rate_threshold: float = Field(default=0.05, env="ALERT_ERROR_RATE_THRESHOLD")
    alert_cooldown_seconds: int = Field(default=60, env="ALERT_COOLDOWN_SECONDS")

    class Config:
        env_file = ".env"
        case_sensitive = False


# Singleton instance
_settings = None


def get_settings() -> Settings:
    """Get or create settings singleton"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
