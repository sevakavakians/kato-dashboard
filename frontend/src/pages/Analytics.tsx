import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  Activity,
  Database,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { apiClient } from '../lib/api'

export default function Analytics() {
  const [sessionPeriod, setSessionPeriod] = useState(24)
  const [performancePeriod, setPerformancePeriod] = useState(60)
  const [patternLimit, setPatternLimit] = useState(20)

  // Fetch pattern frequency
  const { data: patternData, isLoading: patternsLoading } = useQuery({
    queryKey: ['pattern-frequency', patternLimit],
    queryFn: () => apiClient.getPatternFrequency(undefined, patternLimit),
    refetchInterval: 30000,
  })

  // Fetch session trends
  const { data: sessionData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['session-trends', sessionPeriod],
    queryFn: () => apiClient.getSessionDurationTrends(sessionPeriod),
    refetchInterval: 30000,
  })

  // Fetch performance trends
  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['performance-trends', performancePeriod],
    queryFn: () => apiClient.getSystemPerformanceTrends(performancePeriod),
    refetchInterval: 10000,
  })

  // Fetch database statistics
  const { data: dbStats } = useQuery({
    queryKey: ['db-statistics'],
    queryFn: () => apiClient.getDatabaseStatistics(),
    refetchInterval: 30000,
  })

  // Fetch load predictions
  const { data: loadPredictions, isLoading: loadLoading } = useQuery({
    queryKey: ['load-predictions'],
    queryFn: () => apiClient.getLoadPredictions(),
    refetchInterval: 15000,
  })

  // Format pattern data for chart
  const patternChartData = patternData?.patterns?.slice(0, 15).map((p: any) => ({
    name: p.pattern.length > 30 ? p.pattern.substring(0, 30) + '...' : p.pattern,
    frequency: p.frequency,
    processor: p.processor_id,
  })) || []

  // Format session trend data for chart
  const sessionChartData = sessionData?.sessions_by_hour?.map((s: any) => ({
    time: new Date(s.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    sessions: s.session_count,
    avgDuration: s.avg_duration_minutes,
  })) || []

  // Format performance data for chart
  // Note: time_series from backend is an object, not an array
  // For now, use current_metrics as a single data point if available
  const performanceChartData = performanceData?.current_metrics
    ? [{
        timestamp: new Date().toLocaleTimeString(),
        cpu_percent: performanceData.current_metrics.cpu_percent || 0,
        memory_percent: performanceData.current_metrics.memory_percent || 0
      }]
    : []

  // Get load prediction metrics
  const currentLoad = loadPredictions?.current_load || {}
  const trends = loadPredictions?.trends || {}
  const predictions = loadPredictions?.predictions || {}

  const getTrendBadge = (trend: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      stable: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    }
    return colors[trend as keyof typeof colors] || colors.stable
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Advanced Analytics
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Deep insights into patterns, predictions, and system performance
        </p>
      </div>

      {/* Load Predictions Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              CPU Load
            </h3>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          {loadLoading ? (
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {currentLoad.cpu_percent?.toFixed(1)}%
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${getTrendBadge(trends.cpu_trend)}`}>
                {trends.cpu_trend?.toUpperCase()}
              </span>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Memory Load
            </h3>
            <Database className="w-5 h-5 text-gray-400" />
          </div>
          {loadLoading ? (
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {currentLoad.memory_percent?.toFixed(1)}%
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${getTrendBadge(trends.memory_trend)}`}>
                {trends.memory_trend?.toUpperCase()}
              </span>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Capacity
            </h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          {loadLoading ? (
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {predictions.estimated_capacity_utilization?.toFixed(0)}%
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {currentLoad.active_sessions} / {predictions.estimated_sessions_capacity} sessions
              </p>
            </>
          )}
        </div>
      </div>

      {/* Recommendation Alert */}
      {predictions.recommended_action && (
        <div className={`rounded-lg p-4 border ${
          predictions.recommended_action.includes('Critical')
            ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
            : predictions.recommended_action.includes('Warning')
            ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
            : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
        }`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 mt-0.5 ${
              predictions.recommended_action.includes('Critical')
                ? 'text-red-600 dark:text-red-400'
                : predictions.recommended_action.includes('Warning')
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-blue-600 dark:text-blue-400'
            }`} />
            <div>
              <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-1">
                System Recommendation
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {predictions.recommended_action}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Database Statistics */}
      {dbStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Knowledgebase Statistics
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Processors</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbStats.clickhouse?.processors}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Patterns</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbStats.clickhouse?.total_patterns}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg Patterns/Processor</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbStats.clickhouse?.avg_patterns_per_processor}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Redis Statistics
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Memory Used</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbStats.redis?.used_memory}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Connected Clients</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbStats.redis?.connected_clients}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Keys</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbStats.redis?.total_keys}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pattern Frequency Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Top Patterns by Frequency
          </h3>
          <select
            value={patternLimit}
            onChange={(e) => setPatternLimit(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
          </select>
        </div>
        {patternsLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={patternChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="frequency" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Session Duration Trends */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Session Duration Trends
          </h3>
          <select
            value={sessionPeriod}
            onChange={(e) => setSessionPeriod(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value={6}>Last 6 hours</option>
            <option value={12}>Last 12 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
          </select>
        </div>
        {sessionsLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Sessions</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {sessionData?.total_sessions}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg Duration</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {sessionData?.avg_duration_minutes?.toFixed(1)}m
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Max Duration</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {sessionData?.max_duration_minutes?.toFixed(1)}m
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sessionChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="sessions"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Session Count"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgDuration"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Avg Duration (min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* System Performance Trends */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Performance Trends
          </h3>
          <select
            value={performancePeriod}
            onChange={(e) => setPerformancePeriod(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value={15}>Last 15 minutes</option>
            <option value={30}>Last 30 minutes</option>
            <option value={60}>Last hour</option>
            <option value={180}>Last 3 hours</option>
          </select>
        </div>
        {performanceLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={performanceChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="cpu_percent"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.6}
                name="CPU %"
              />
              <Area
                type="monotone"
                dataKey="memory_percent"
                stackId="2"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.6}
                name="Memory %"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
