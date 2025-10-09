"""
Analytics service for aggregating and computing system metrics
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

from app.db.mongodb import get_processor_databases, get_patterns
from app.services.kato_api import get_kato_client
from app.db.redis_client import get_redis_info

logger = logging.getLogger("kato_dashboard.services.analytics")


async def get_pattern_frequency_analysis(
    processor_id: Optional[str] = None,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Analyze pattern frequency across processors

    Args:
        processor_id: Optional specific processor to analyze
        limit: Number of top patterns to return

    Returns:
        Dict with pattern frequency data
    """
    try:
        if processor_id:
            # Get patterns for specific processor
            patterns_data = await get_patterns(processor_id, skip=0, limit=limit)
            patterns = patterns_data.get('patterns', [])

            frequency_data = [
                {
                    'pattern': p.get('pattern', 'Unknown'),
                    'frequency': p.get('frequency', 0),
                    'processor_id': processor_id
                }
                for p in patterns
            ]

            return {
                'processor_id': processor_id,
                'patterns': frequency_data,
                'total_patterns': patterns_data.get('total', 0)
            }
        else:
            # Get top patterns across all processors
            processors = await get_processor_databases()
            all_patterns = []

            for proc in processors:
                proc_id = proc['processor_id']
                patterns_data = await get_patterns(proc_id, skip=0, limit=limit)
                patterns = patterns_data.get('patterns', [])

                for p in patterns:
                    all_patterns.append({
                        'pattern': p.get('pattern', 'Unknown'),
                        'frequency': p.get('frequency', 0),
                        'processor_id': proc_id
                    })

            # Sort by frequency and get top N
            all_patterns.sort(key=lambda x: x['frequency'], reverse=True)
            top_patterns = all_patterns[:limit]

            return {
                'patterns': top_patterns,
                'total_processors': len(processors),
                'total_patterns_analyzed': len(all_patterns)
            }
    except Exception as e:
        logger.error(f"Failed to analyze pattern frequency: {e}")
        return {'patterns': [], 'error': str(e)}


async def get_session_duration_trends(period_hours: int = 24) -> Dict[str, Any]:
    """
    Analyze session duration trends over time

    Args:
        period_hours: Time period to analyze (in hours)

    Returns:
        Dict with session duration trend data
    """
    try:
        client = get_kato_client()

        # Get current sessions
        sessions_data = await client.list_sessions(skip=0, limit=1000)
        sessions = sessions_data.get('sessions', [])

        if not sessions:
            return {
                'period_hours': period_hours,
                'total_sessions': 0,
                'avg_duration_minutes': 0,
                'sessions_by_hour': []
            }

        # Calculate durations and group by hour
        now = datetime.now()
        cutoff = now - timedelta(hours=period_hours)

        durations = []
        sessions_by_hour = {}

        for session in sessions:
            try:
                created_at = datetime.fromisoformat(session.get('created_at', ''))
                last_active = datetime.fromisoformat(session.get('last_active', ''))

                if created_at < cutoff:
                    continue

                duration_minutes = (last_active - created_at).total_seconds() / 60
                durations.append(duration_minutes)

                # Group by hour
                hour_key = created_at.strftime('%Y-%m-%d %H:00')
                if hour_key not in sessions_by_hour:
                    sessions_by_hour[hour_key] = {
                        'count': 0,
                        'total_duration': 0,
                        'timestamp': hour_key
                    }

                sessions_by_hour[hour_key]['count'] += 1
                sessions_by_hour[hour_key]['total_duration'] += duration_minutes
            except (ValueError, KeyError) as e:
                logger.warning(f"Failed to parse session dates: {e}")
                continue

        # Calculate averages by hour
        trend_data = []
        for hour_data in sessions_by_hour.values():
            avg_duration = hour_data['total_duration'] / hour_data['count'] if hour_data['count'] > 0 else 0
            trend_data.append({
                'timestamp': hour_data['timestamp'],
                'session_count': hour_data['count'],
                'avg_duration_minutes': round(avg_duration, 2)
            })

        # Sort by timestamp
        trend_data.sort(key=lambda x: x['timestamp'])

        avg_duration = sum(durations) / len(durations) if durations else 0

        return {
            'period_hours': period_hours,
            'total_sessions': len(durations),
            'avg_duration_minutes': round(avg_duration, 2),
            'min_duration_minutes': round(min(durations), 2) if durations else 0,
            'max_duration_minutes': round(max(durations), 2) if durations else 0,
            'sessions_by_hour': trend_data
        }
    except Exception as e:
        logger.error(f"Failed to analyze session duration trends: {e}")
        return {'error': str(e)}


async def get_system_performance_trends(period_minutes: int = 60) -> Dict[str, Any]:
    """
    Get system performance metrics over time

    Args:
        period_minutes: Time period to analyze (in minutes)

    Returns:
        Dict with performance trend data
    """
    try:
        client = get_kato_client()

        # Get time-series stats from KATO
        stats = await client.get_stats(minutes=period_minutes, use_cache=False)

        # Get current metrics for context
        current_metrics = await client.get_metrics(use_cache=False)

        return {
            'period_minutes': period_minutes,
            'current_metrics': {
                'cpu_percent': current_metrics.get('resources', {}).get('cpu_percent', 0),
                'memory_percent': current_metrics.get('resources', {}).get('memory_percent', 0),
                'active_sessions': current_metrics.get('sessions', {}).get('active', 0)
            },
            'time_series': stats,
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get performance trends: {e}")
        return {'error': str(e)}


async def get_database_statistics() -> Dict[str, Any]:
    """
    Get aggregated database statistics across all systems

    Returns:
        Dict with database statistics
    """
    try:
        # MongoDB stats
        processors = await get_processor_databases()
        total_patterns = 0

        for proc in processors:
            patterns_data = await get_patterns(proc['processor_id'], skip=0, limit=1)
            total_patterns += patterns_data.get('total', 0)

        # Redis stats
        redis_info = await get_redis_info()

        return {
            'mongodb': {
                'processors': len(processors),
                'total_patterns': total_patterns,
                'avg_patterns_per_processor': round(total_patterns / len(processors), 2) if processors else 0
            },
            'redis': {
                'used_memory': redis_info.get('used_memory_human', 'Unknown'),
                'connected_clients': redis_info.get('connected_clients', 0),
                'total_keys': redis_info.get('db0', {}).get('keys', 0) if isinstance(redis_info.get('db0'), dict) else 0
            },
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get database statistics: {e}")
        return {'error': str(e)}


async def get_predictive_load_analysis() -> Dict[str, Any]:
    """
    Predict system load based on current trends

    Returns:
        Dict with load predictions
    """
    try:
        client = get_kato_client()

        # Get recent metrics to establish trend
        current_metrics = await client.get_metrics(use_cache=False)
        stats = await client.get_stats(minutes=30, use_cache=False)

        # Simple trend analysis (could be enhanced with ML)
        cpu = current_metrics.get('resources', {}).get('cpu_percent', 0)
        memory = current_metrics.get('resources', {}).get('memory_percent', 0)
        sessions = current_metrics.get('sessions', {}).get('active', 0)

        # Calculate simple predictions (linear extrapolation)
        # This is a placeholder - real implementation would use historical data
        cpu_trend = 'stable'
        if cpu > 80:
            cpu_trend = 'high'
        elif cpu > 60:
            cpu_trend = 'moderate'
        else:
            cpu_trend = 'low'

        memory_trend = 'stable'
        if memory > 80:
            memory_trend = 'high'
        elif memory > 60:
            memory_trend = 'moderate'
        else:
            memory_trend = 'low'

        # Predict capacity
        session_capacity_estimate = 1000  # Placeholder
        capacity_utilization = (sessions / session_capacity_estimate) * 100 if session_capacity_estimate > 0 else 0

        return {
            'current_load': {
                'cpu_percent': cpu,
                'memory_percent': memory,
                'active_sessions': sessions
            },
            'trends': {
                'cpu_trend': cpu_trend,
                'memory_trend': memory_trend
            },
            'predictions': {
                'estimated_capacity_utilization': round(capacity_utilization, 2),
                'estimated_sessions_capacity': session_capacity_estimate,
                'recommended_action': get_recommendation(cpu, memory, capacity_utilization)
            },
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to predict load: {e}")
        return {'error': str(e)}


def get_recommendation(cpu: float, memory: float, capacity: float) -> str:
    """Get operational recommendation based on metrics"""
    if cpu > 85 or memory > 85:
        return 'Critical: Consider scaling resources immediately'
    elif cpu > 70 or memory > 70:
        return 'Warning: Monitor closely, consider scaling soon'
    elif capacity > 80:
        return 'Approaching capacity: Plan for scaling'
    else:
        return 'Normal: System operating within normal parameters'


async def get_comprehensive_analytics(
    pattern_limit: int = 20,
    session_period_hours: int = 24,
    performance_period_minutes: int = 60
) -> Dict[str, Any]:
    """
    Get comprehensive analytics combining all analysis types

    Returns:
        Dict with all analytics data
    """
    try:
        # Run all analytics in parallel would be ideal, but for simplicity we'll run sequentially
        pattern_analysis = await get_pattern_frequency_analysis(limit=pattern_limit)
        session_trends = await get_session_duration_trends(period_hours=session_period_hours)
        performance_trends = await get_system_performance_trends(period_minutes=performance_period_minutes)
        db_stats = await get_database_statistics()
        load_prediction = await get_predictive_load_analysis()

        return {
            'pattern_analysis': pattern_analysis,
            'session_trends': session_trends,
            'performance_trends': performance_trends,
            'database_statistics': db_stats,
            'load_prediction': load_prediction,
            'generated_at': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to generate comprehensive analytics: {e}")
        return {'error': str(e)}
