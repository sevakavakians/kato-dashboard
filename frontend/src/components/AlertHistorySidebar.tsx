/**
 * Alert History Sidebar Component (Phase 3 - MANDATORY)
 *
 * Slide-in sidebar panel for viewing and managing system alert history
 * Features: filtering by severity/type, mark as read, clear all
 */
import { useState, useMemo } from 'react'
import { X, AlertTriangle, Info, XCircle, Filter, Trash2, CheckCircle } from 'lucide-react'
import { SystemAlert } from '../lib/websocket'
import { StoredAlert } from '../hooks/useWebSocket'
import { useAlertSidebar } from '../contexts/AlertContext'

interface AlertHistorySidebarProps {
  alerts: StoredAlert[]
  unreadCount: number
  onMarkAsRead: () => void
  onClearAll: () => void
}

type SeverityFilter = 'all' | 'info' | 'warning' | 'error'
type TypeFilter = 'all' | 'high_cpu' | 'high_memory' | 'container_down' | 'high_error_rate'

export function AlertHistorySidebar({
  alerts,
  unreadCount,
  onMarkAsRead,
  onClearAll
}: AlertHistorySidebarProps) {
  const { isOpen, closeSidebar } = useAlertSidebar()
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      // Check if any alert in the message matches filters
      const matchesSeverity = severityFilter === 'all' ||
        alert.alerts.some((a: SystemAlert) => a.level === severityFilter)

      const matchesType = typeFilter === 'all' ||
        alert.alerts.some((a: SystemAlert) => a.type === typeFilter)

      return matchesSeverity && matchesType
    })
  }, [alerts, severityFilter, typeFilter])

  const getIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />
      default:
        return <Info className="w-4 h-4 text-gray-500" />
    }
  }

  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'info':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`
    return date.toLocaleDateString()
  }

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      high_cpu: 'High CPU',
      high_memory: 'High Memory',
      container_down: 'Container Down',
      high_error_rate: 'High Error Rate'
    }
    return labels[type] || type
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={closeSidebar}
      />

      {/* Sidebar Panel */}
      <div className={`
        fixed right-0 top-0 h-full w-[400px] max-w-full bg-white dark:bg-gray-900
        shadow-2xl z-50 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Alert History
            </h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={closeSidebar}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onMarkAsRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
              hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" />
            Mark all read
          </button>
          <button
            onClick={onClearAll}
            disabled={alerts.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400
              hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Clear all
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          {/* Severity Filter */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Severity
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'info', 'warning', 'error'] as SeverityFilter[]).map(severity => (
                <button
                  key={severity}
                  onClick={() => setSeverityFilter(severity)}
                  className={`
                    px-3 py-1 text-xs font-medium rounded-full transition-colors
                    ${severityFilter === severity
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
              Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="w-full px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200
                dark:border-gray-700 rounded text-gray-900 dark:text-white focus:outline-none focus:ring-2
                focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="high_cpu">High CPU</option>
              <option value="high_memory">High Memory</option>
              <option value="container_down">Container Down</option>
              <option value="high_error_rate">High Error Rate</option>
            </select>
          </div>
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12">
              <Info className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {alerts.length === 0 ? 'No alerts yet' : 'No alerts match your filters'}
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`
                  p-3 rounded-lg border transition-colors
                  ${alert.read
                    ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                    : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 shadow-sm'
                  }
                `}
              >
                {/* Timestamp */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimestamp(alert.timestamp)}
                  </span>
                  {!alert.read && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  )}
                </div>

                {/* Alerts */}
                <div className="space-y-2">
                  {alert.alerts.map((a: SystemAlert, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      {getIcon(a.level)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getLevelBadgeColor(a.level)}`}>
                            {a.level.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {getAlertTypeLabel(a.type)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {a.message}
                        </p>
                        {a.threshold !== undefined && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Threshold: {a.threshold}
                            {a.type.includes('cpu') || a.type.includes('memory') ? '%' : ''}
                          </p>
                        )}
                        {a.container_name && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Container: {a.container_name}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

export default AlertHistorySidebar
