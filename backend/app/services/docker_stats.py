"""
Docker container statistics service
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import docker
from docker.errors import DockerException, NotFound

logger = logging.getLogger("kato_dashboard.services.docker_stats")

# Simple cache for stats (to avoid hammering Docker)
_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = timedelta(seconds=5)

# KATO container names to monitor
KATO_CONTAINERS = [
    'kato',
    'kato-clickhouse',
    'kato-qdrant',
    'kato-redis'
]


class DockerStatsClient:
    """Client for getting Docker container statistics"""

    def __init__(self):
        try:
            self.client = docker.from_env()
            logger.info("Docker client initialized successfully")
        except DockerException as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self.client = None

    def _parse_cpu_stats(self, stats: Dict[str, Any]) -> float:
        """
        Calculate CPU percentage from Docker stats

        Formula: ((cpu_delta / system_cpu_delta) * number_cpus) * 100.0
        """
        try:
            cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                       stats['precpu_stats']['cpu_usage']['total_usage']
            system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                          stats['precpu_stats']['system_cpu_usage']

            if system_delta > 0:
                percpu_usage = stats['cpu_stats']['cpu_usage'].get('percpu_usage') or [1]
                num_cpus = len(percpu_usage) if percpu_usage else 1
                cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0
                return round(cpu_percent, 2)
        except (KeyError, ZeroDivisionError) as e:
            logger.debug(f"Failed to calculate CPU stats: {e}")

        return 0.0

    def _parse_memory_stats(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Parse memory statistics from Docker stats"""
        try:
            mem_stats = stats['memory_stats']
            usage = mem_stats['usage']
            limit = mem_stats['limit']

            # Calculate percentage
            mem_percent = (usage / limit) * 100.0 if limit > 0 else 0.0

            return {
                'usage_bytes': usage,
                'limit_bytes': limit,
                'usage_mb': round(usage / (1024 * 1024), 2),
                'limit_mb': round(limit / (1024 * 1024), 2),
                'usage_percent': round(mem_percent, 2)
            }
        except (KeyError, ZeroDivisionError) as e:
            logger.debug(f"Failed to calculate memory stats: {e}")
            return {
                'usage_bytes': 0,
                'limit_bytes': 0,
                'usage_mb': 0,
                'limit_mb': 0,
                'usage_percent': 0.0
            }

    def _parse_network_stats(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Parse network I/O statistics"""
        try:
            networks = stats['networks']
            total_rx = sum(net['rx_bytes'] for net in networks.values())
            total_tx = sum(net['tx_bytes'] for net in networks.values())

            return {
                'rx_bytes': total_rx,
                'tx_bytes': total_tx,
                'rx_mb': round(total_rx / (1024 * 1024), 2),
                'tx_mb': round(total_tx / (1024 * 1024), 2)
            }
        except (KeyError, AttributeError) as e:
            logger.debug(f"Failed to calculate network stats: {e}")
            return {
                'rx_bytes': 0,
                'tx_bytes': 0,
                'rx_mb': 0,
                'tx_mb': 0
            }

    def _parse_block_io_stats(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Parse block I/O statistics"""
        try:
            blkio = stats['blkio_stats']

            # Sum up all read and write operations
            io_bytes = blkio.get('io_service_bytes_recursive') or []
            total_read = sum(item['value'] for item in io_bytes if item.get('op') == 'Read')
            total_write = sum(item['value'] for item in io_bytes if item.get('op') == 'Write')

            return {
                'read_bytes': total_read,
                'write_bytes': total_write,
                'read_mb': round(total_read / (1024 * 1024), 2),
                'write_mb': round(total_write / (1024 * 1024), 2)
            }
        except (KeyError, AttributeError) as e:
            logger.debug(f"Failed to calculate block I/O stats: {e}")
            return {
                'read_bytes': 0,
                'write_bytes': 0,
                'read_mb': 0,
                'write_mb': 0
            }

    def get_container_stats(self, container_name: str) -> Optional[Dict[str, Any]]:
        """Get statistics for a single container"""
        if not self.client:
            logger.error("Docker client not initialized")
            return None

        try:
            container = self.client.containers.get(container_name)

            # Get stats (stream=False for one-time snapshot)
            stats = container.stats(stream=False)

            return {
                'name': container_name,
                'status': container.status,
                'cpu': self._parse_cpu_stats(stats),
                'memory': self._parse_memory_stats(stats),
                'network': self._parse_network_stats(stats),
                'block_io': self._parse_block_io_stats(stats),
                'timestamp': datetime.now().isoformat()
            }
        except NotFound:
            logger.warning(f"Container {container_name} not found")
            return None
        except DockerException as e:
            logger.error(f"Failed to get stats for {container_name}: {e}")
            return None

    def get_all_kato_stats(self, use_cache: bool = True) -> Dict[str, Any]:
        """Get statistics for all KATO containers"""
        cache_key = 'all_stats'

        # Check cache
        if use_cache and cache_key in _cache:
            cached = _cache[cache_key]
            if datetime.now() < cached['expires']:
                return cached['data']

        if not self.client:
            return {
                'error': 'Docker client not initialized',
                'containers': [],
                'aggregated': {}
            }

        # Collect stats from all containers
        container_stats = []
        for container_name in KATO_CONTAINERS:
            stats = self.get_container_stats(container_name)
            if stats:
                container_stats.append(stats)

        # Calculate aggregated metrics
        total_cpu = sum(c['cpu'] for c in container_stats)
        total_memory_mb = sum(c['memory']['usage_mb'] for c in container_stats)
        total_memory_limit = sum(c['memory']['limit_mb'] for c in container_stats)

        aggregated = {
            'total_cpu_percent': round(total_cpu, 2),
            'total_memory_mb': round(total_memory_mb, 2),
            'total_memory_limit_mb': round(total_memory_limit, 2),
            'total_memory_percent': round((total_memory_mb / total_memory_limit * 100), 2) if total_memory_limit > 0 else 0.0,
            'container_count': len(container_stats),
            'timestamp': datetime.now().isoformat()
        }

        result = {
            'containers': container_stats,
            'aggregated': aggregated
        }

        # Cache the result
        _cache[cache_key] = {
            'data': result,
            'expires': datetime.now() + CACHE_TTL
        }

        return result

    def get_kato_service_stats(self) -> Optional[Dict[str, Any]]:
        """Get statistics specifically for the KATO service container"""
        return self.get_container_stats('kato')

    def close(self):
        """Close the Docker client"""
        if self.client:
            self.client.close()


# Singleton instance
_docker_stats_client: Optional[DockerStatsClient] = None


def get_docker_stats_client() -> DockerStatsClient:
    """Get or create Docker stats client singleton"""
    global _docker_stats_client

    if _docker_stats_client is None:
        _docker_stats_client = DockerStatsClient()

    return _docker_stats_client


def close_docker_stats_client():
    """Close Docker stats client"""
    global _docker_stats_client

    if _docker_stats_client:
        _docker_stats_client.close()
        _docker_stats_client = None
