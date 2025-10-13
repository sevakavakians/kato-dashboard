"""
Alert manager for system monitoring and threshold detection

Monitors system metrics and generates alerts when thresholds are exceeded.
Implements cooldown periods to prevent alert spam.
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

from app.core.config import get_settings

logger = logging.getLogger("kato_dashboard.services.alert_manager")


class AlertManager:
    """Manages system alert detection and cooldown tracking"""

    def __init__(self):
        self._alert_cooldowns: Dict[str, datetime] = {}
        self._settings = get_settings()

    def check_all_thresholds(
        self,
        metrics: Dict[str, Any],
        containers: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Check all thresholds and return list of active alerts

        Args:
            metrics: KATO metrics data
            containers: Docker container stats

        Returns:
            List of alert dictionaries
        """
        alerts = []

        # Check CPU threshold
        cpu_alert = self._check_cpu_threshold(containers)
        if cpu_alert and self._should_broadcast_alert("high_cpu"):
            alerts.append(cpu_alert)
            self._record_alert_broadcast("high_cpu")

        # Check memory threshold
        memory_alert = self._check_memory_threshold(containers)
        if memory_alert and self._should_broadcast_alert("high_memory"):
            alerts.append(memory_alert)
            self._record_alert_broadcast("high_memory")

        # Check error rate threshold
        error_alert = self._check_error_rate_threshold(metrics)
        if error_alert and self._should_broadcast_alert("high_error_rate"):
            alerts.append(error_alert)
            self._record_alert_broadcast("high_error_rate")

        # Check container health
        container_alerts = self._check_container_health(containers)
        for alert in container_alerts:
            alert_key = f"container_down_{alert.get('container_name', 'unknown')}"
            if self._should_broadcast_alert(alert_key):
                alerts.append(alert)
                self._record_alert_broadcast(alert_key)

        return alerts

    def _check_cpu_threshold(self, containers: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Check if CPU usage exceeds threshold"""
        try:
            cpu_percent = containers.get("aggregated", {}).get("total_cpu_percent", 0)
            threshold = self._settings.alert_cpu_threshold

            if cpu_percent > threshold:
                return {
                    "level": "warning" if cpu_percent < 90 else "error",
                    "type": "high_cpu",
                    "message": f"High CPU usage: {cpu_percent:.1f}%",
                    "value": round(cpu_percent, 2),
                    "threshold": threshold
                }
        except Exception as e:
            logger.error(f"Error checking CPU threshold: {e}")

        return None

    def _check_memory_threshold(self, containers: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Check if memory usage exceeds threshold"""
        try:
            mem_percent = containers.get("aggregated", {}).get("total_memory_percent", 0)
            threshold = self._settings.alert_memory_threshold

            if mem_percent > threshold:
                return {
                    "level": "warning" if mem_percent < 95 else "error",
                    "type": "high_memory",
                    "message": f"High memory usage: {mem_percent:.1f}%",
                    "value": round(mem_percent, 2),
                    "threshold": threshold
                }
        except Exception as e:
            logger.error(f"Error checking memory threshold: {e}")

        return None

    def _check_error_rate_threshold(self, metrics: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Check if error rate exceeds threshold"""
        try:
            performance = metrics.get("performance", {})
            error_rate = performance.get("error_rate", 0)
            threshold = self._settings.alert_error_rate_threshold

            if error_rate > threshold:
                return {
                    "level": "warning" if error_rate < 0.10 else "error",
                    "type": "high_error_rate",
                    "message": f"High error rate: {error_rate*100:.1f}%",
                    "value": round(error_rate, 4),
                    "threshold": threshold
                }
        except Exception as e:
            logger.error(f"Error checking error rate threshold: {e}")

        return None

    def _check_container_health(self, containers: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Check if any containers are unhealthy"""
        alerts = []

        try:
            container_list = containers.get("containers", [])

            for container in container_list:
                name = container.get("name", "unknown")
                status = container.get("status", "unknown")

                # Alert if container is not running
                if status != "running":
                    alerts.append({
                        "level": "error",
                        "type": "container_down",
                        "message": f"Container '{name}' is {status}",
                        "container_name": name,
                        "status": status
                    })
        except Exception as e:
            logger.error(f"Error checking container health: {e}")

        return alerts

    def _should_broadcast_alert(self, alert_type: str) -> bool:
        """
        Check if alert should be broadcast based on cooldown

        Args:
            alert_type: Type of alert (e.g., "high_cpu", "high_memory")

        Returns:
            True if alert should be broadcast, False if in cooldown
        """
        now = datetime.now()
        last_broadcast = self._alert_cooldowns.get(alert_type)

        if last_broadcast is None:
            return True

        cooldown_period = timedelta(seconds=self._settings.alert_cooldown_seconds)
        time_since_last = now - last_broadcast

        return time_since_last >= cooldown_period

    def _record_alert_broadcast(self, alert_type: str):
        """Record that an alert was broadcast for cooldown tracking"""
        self._alert_cooldowns[alert_type] = datetime.now()
        logger.info(f"Recorded alert broadcast: {alert_type}")

    def get_cooldown_status(self) -> Dict[str, Any]:
        """Get current cooldown status for debugging"""
        now = datetime.now()
        status = {}

        for alert_type, last_broadcast in self._alert_cooldowns.items():
            time_since = (now - last_broadcast).total_seconds()
            cooldown_remaining = max(0, self._settings.alert_cooldown_seconds - time_since)

            status[alert_type] = {
                "last_broadcast": last_broadcast.isoformat(),
                "seconds_since": round(time_since, 2),
                "cooldown_remaining": round(cooldown_remaining, 2),
                "can_broadcast": cooldown_remaining == 0
            }

        return status

    def reset_cooldowns(self):
        """Reset all cooldown tracking (useful for testing)"""
        self._alert_cooldowns.clear()
        logger.info("Reset all alert cooldowns")


# Global instance
_alert_manager: Optional[AlertManager] = None


def get_alert_manager() -> AlertManager:
    """Get or create alert manager singleton"""
    global _alert_manager
    if _alert_manager is None:
        _alert_manager = AlertManager()
    return _alert_manager


def reset_alert_manager():
    """Reset the alert manager (useful for testing)"""
    global _alert_manager
    if _alert_manager:
        _alert_manager.reset_cooldowns()
