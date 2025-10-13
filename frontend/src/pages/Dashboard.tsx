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
import SystemAlertNotifications from '../components/SystemAlertNotifications'

export default function Dashboard() {
  // Use WebSocket for real-time metrics, container stats, and alerts (Phase 4: with subscriptions)
  const {
    data: wsMetrics,
    containerStats: wsContainerStats,
    systemAlerts,
    isConnected
  } = useWebSocket(true, undefined, ['metrics', 'containers', 'system_alerts'])

  // Fallback: Fetch metrics via HTTP if WebSocket is not connected
  const { data: httpMetrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiClient.getSystemMetrics(),
    enabled: !isConnected, // Only query if WebSocket not connected
    refetchInterval: 5000, // Fallback polling
  })

  // Fallback: Fetch container stats via HTTP if WebSocket is not connected
  const { data: httpContainerStats } = useQuery({
    queryKey: ['containerStats'],
    queryFn: () => apiClient.getContainerStats(),
    enabled: !isConnected, // Only query if WebSocket not connected
    refetchInterval: 5000, // Fallback polling
  })

  // Use WebSocket data if available, otherwise use HTTP fallback
  const metrics = wsMetrics || httpMetrics
  const containerStats = wsContainerStats || httpContainerStats
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

  // Use container stats for real-time metrics (replaces broken psutil metrics)
  const containerCpuPercent = containerStats?.aggregated?.total_cpu_percent || 0
  const containerMemoryPercent = containerStats?.aggregated?.total_memory_percent || 0
  const hasContainerStats = containerStats && containerStats.containers?.length > 0
  const hasTimeSeriesData = cpuData.length > 0 || memoryData.length > 0

  return (
    <div className="space-y-6">
      {/* System Alert Toast Notifications (Phase 3) */}
      <SystemAlertNotifications alerts={systemAlerts} />

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

      {/* Container Resource Metrics */}
      {hasContainerStats && (
        <Card>
          <CardHeader>
            <CardTitle>Container Resources (Docker Stats)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Aggregated Stats */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total CPU Usage
                </h4>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {containerCpuPercent.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Across {containerStats?.containers?.length || 0} containers
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Memory Usage
                </h4>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {containerMemoryPercent.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {containerStats?.aggregated?.total_memory_mb?.toFixed(0) || 0} MB / {containerStats?.aggregated?.total_memory_limit_mb?.toFixed(0) || 0} MB
                </p>
              </div>
            </div>

            {/* Individual Container Stats */}
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Container Breakdown
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {containerStats?.containers?.map((container: any) => (
                  <div
                    key={container.name}
                    className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {container.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {container.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {container.cpu?.toFixed(2)}%
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {container.memory?.usage_mb?.toFixed(0)} MB
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
