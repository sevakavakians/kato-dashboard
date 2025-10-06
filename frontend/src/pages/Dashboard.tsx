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

export default function Dashboard() {
  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiClient.getSystemMetrics(),
    refetchInterval: 5000, // Refetch every 5 seconds
  })

  // Fetch stats for charts
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
          <p className="text-gray-600 dark:text-gray-400">Loading metrics...</p>
        </div>
      </div>
    )
  }

  // Prepare chart data from stats
  const cpuData = stats?.time_series?.cpu_percent || []
  const memoryData = stats?.time_series?.memory_percent || []

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
          title="Memory Usage"
          value={formatPercentage(metrics?.resources?.memory_percent || 0)}
          icon={Database}
          color={
            (metrics?.resources?.memory_percent || 0) > 80 ? 'red' : 'blue'
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Usage Chart */}
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

        {/* Memory Usage Chart */}
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
      </div>

      {/* Database Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Database Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* MongoDB */}
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                MongoDB
              </h4>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatNumber(metrics?.databases?.mongodb?.operations || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Operations</p>
            </div>

            {/* Qdrant */}
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Qdrant
              </h4>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatNumber(metrics?.databases?.qdrant?.operations || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Operations</p>
            </div>

            {/* Redis */}
            <div className="border-l-4 border-red-500 pl-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Redis
              </h4>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatNumber(metrics?.databases?.redis?.operations || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Operations</p>
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
