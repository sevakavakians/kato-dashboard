import { useQuery } from '@tanstack/react-query'
import { Activity, Users, Database, TrendingUp } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { formatNumber, formatPercentage } from '@/lib/utils'
import StatCard from '@/components/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { useWebSocket } from '../hooks/useWebSocket'

export default function Dashboard() {
  // Use WebSocket for real-time metrics (replaces polling)
  const { data: wsMetrics, isConnected } = useWebSocket(true)

  // Fallback: Fetch metrics via HTTP if WebSocket is not connected
  const { data: httpMetrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiClient.getSystemMetrics(),
    enabled: !isConnected, // Only query if WebSocket not connected
    refetchInterval: 5000, // Fallback polling
  })

  // Use WebSocket data if available, otherwise use HTTP fallback
  const metrics = wsMetrics || httpMetrics
  const metricsLoading = !metrics && !isConnected

  // Fetch stats for charts (keep using polling for historical data)
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', 10],
    queryFn: () => apiClient.getSystemStats(10),
    refetchInterval: 10000, // Refetch every 10 seconds
  })

  // Fetch analytics overview
  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => apiClient.getAnalyticsOverview(),
    refetchInterval: 15000,
  })

  if (metricsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {!isConnected ? 'Connecting to real-time updates...' : 'Loading metrics...'}
          </p>
        </div>
      </div>
    )
  }

  // Prepare chart data from stats (using KATO v2 metric names)
  const cpuData = stats?.time_series?.kato_cpu_usage_percent || []
  const memoryData = stats?.time_series?.kato_memory_usage_percent || []

  // Check if system resource metrics are available
  // Note: CPU is currently broken in KATO (returns 0.0), but memory and disk work
  const hasCpuMetrics = (metrics?.resources?.cpu_percent ?? 0) > 0
  const hasMemoryMetrics = (metrics?.resources?.memory_percent ?? 0) > 0
  const hasTimeSeriesData = cpuData.length > 0 || memoryData.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          System Overview
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Real-time monitoring of KATO system performance and metrics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Sessions"
          value={formatNumber(metrics?.sessions?.active || 0)}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Total Requests"
          value={formatNumber(metrics?.performance?.total_requests || 0)}
          icon={Activity}
          color="green"
        />
        <StatCard
          title="Error Rate"
          value={formatPercentage(
            (metrics?.performance?.error_rate || 0) * 100
          )}
          icon={TrendingUp}
          color={
            (metrics?.performance?.error_rate || 0) > 0.05 ? 'red' : 'green'
          }
        />
        <StatCard
          title="Total Processors"
          value={formatNumber(metrics?.processor_manager?.total_processors || 0)}
          icon={Database}
          color="purple"
        />
      </div>

      {/* CPU Metric Notice (Memory and Disk work, but CPU returns 0.0) */}
      {!hasCpuMetrics && hasMemoryMetrics && (
        <Card>
          <CardContent>
            <div className="py-6 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/20 mb-3">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                CPU Metrics Currently Unavailable
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                KATO's CPU monitoring returns 0% due to a <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">psutil</code> async context issue.
                Memory ({metrics?.resources?.memory_percent?.toFixed(1)}%) and disk ({metrics?.resources?.disk_percent?.toFixed(1)}%) metrics are working correctly.
                See <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">KATO_ISSUES.md</code> for fix details.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts - Only show if data is available */}
      {hasTimeSeriesData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CPU Usage Chart */}
          {cpuData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={cpuData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) =>
                        new Date(value * 1000).toLocaleTimeString()
                      }
                    />
                    <YAxis unit="%" />
                    <Tooltip
                      labelFormatter={(value) =>
                        new Date(value * 1000).toLocaleString()
                      }
                      formatter={(value: number) => `${value.toFixed(1)}%`}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Memory Usage Chart */}
          {memoryData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={memoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value) =>
                    new Date(value * 1000).toLocaleTimeString()
                  }
                />
                <YAxis unit="%" />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(value * 1000).toLocaleString()
                  }
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                />
              </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Processor Information */}
      <Card>
        <CardHeader>
          <CardTitle>Processor Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Processors */}
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Processors
              </h4>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatNumber(metrics?.processor_manager?.total_processors || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Active in memory</p>
            </div>

            {/* Max Processors */}
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Max Capacity
              </h4>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatNumber(metrics?.processor_manager?.max_processors || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Maximum allowed</p>
            </div>

            {/* Eviction TTL */}
            <div className="border-l-4 border-purple-500 pl-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Eviction TTL
              </h4>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {metrics?.processor_manager?.eviction_ttl_seconds || 0}s
              </p>
              <p className="text-xs text-gray-500 mt-1">Idle timeout</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Processors
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {analytics.processors?.total || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Vector Collections
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {analytics.vector_collections?.total || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sessions Created
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatNumber(analytics.sessions?.total_created || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Redis Memory
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {analytics.redis?.used_memory_human || 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
