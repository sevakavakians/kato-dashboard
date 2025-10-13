/**
 * System Alert Notifications Component (Phase 3)
 *
 * Displays toast notifications for system alerts (CPU, memory, errors, containers)
 * Auto-dismisses after 10 seconds with manual dismiss option
 */
import { useEffect, useState } from 'react'
import { X, AlertTriangle, Info, XCircle } from 'lucide-react'
import { StoredAlert } from '../hooks/useWebSocket'
import { useAlertSidebar } from '../contexts/AlertContext'

interface SystemAlertNotificationsProps {
  alerts: StoredAlert[]
  maxVisible?: number
  autoDismissMs?: number
}

interface VisibleAlert extends StoredAlert {
  visible: boolean
}

export function SystemAlertNotifications({
  alerts,
  maxVisible = 3,
  autoDismissMs = 10000
}: SystemAlertNotificationsProps) {
  const [visibleAlerts, setVisibleAlerts] = useState<VisibleAlert[]>([])
  const { openSidebar } = useAlertSidebar()

  // Add new alerts to visible list
  useEffect(() => {
    if (alerts.length === 0) return

    const latestAlert = alerts[0]

    // Check if this alert is already visible
    const alreadyVisible = visibleAlerts.some(a => a.id === latestAlert.id)
    if (alreadyVisible) return

    // Add new alert
    const newAlert: VisibleAlert = {
      ...latestAlert,
      visible: true
    }

    setVisibleAlerts(prev => [newAlert, ...prev].slice(0, maxVisible))

    // Auto-dismiss after delay
    if (autoDismissMs > 0) {
      setTimeout(() => {
        setVisibleAlerts(prev =>
          prev.map(a => a.id === latestAlert.id ? { ...a, visible: false } : a)
        )
        // Remove after fade animation
        setTimeout(() => {
          setVisibleAlerts(prev => prev.filter(a => a.id !== latestAlert.id))
        }, 300)
      }, autoDismissMs)
    }
  }, [alerts, maxVisible, autoDismissMs, visibleAlerts])

  const handleDismiss = (alertId: string) => {
    setVisibleAlerts(prev =>
      prev.map(a => a.id === alertId ? { ...a, visible: false } : a)
    )
    // Remove after fade animation
    setTimeout(() => {
      setVisibleAlerts(prev => prev.filter(a => a.id !== alertId))
    }, 300)
  }

  const handleClick = (alertId: string) => {
    openSidebar()
    handleDismiss(alertId)
  }

  const getIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />
      default:
        return <Info className="w-5 h-5 text-gray-500" />
    }
  }

  const getBackgroundColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }
  }

  if (visibleAlerts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md pointer-events-none">
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          onClick={() => handleClick(alert.id)}
          className={`
            flex items-start gap-3 p-4 rounded-lg border shadow-lg cursor-pointer
            transition-all duration-300 pointer-events-auto hover:shadow-xl
            ${getBackgroundColor(alert.alerts[0]?.level || 'info')}
            ${alert.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
          `}
        >
          {getIcon(alert.alerts[0]?.level || 'info')}
          <div className="flex-1 min-w-0">
            {alert.alerts.map((a, idx) => (
              <div key={idx} className="mb-1 last:mb-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {a.message}
                </p>
                {a.threshold !== undefined && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Threshold: {a.threshold}{a.type.includes('cpu') || a.type.includes('memory') ? '%' : ''}
                  </p>
                )}
              </div>
            ))}
            {alert.alerts.length > 1 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                +{alert.alerts.length - 1} more alert{alert.alerts.length > 2 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDismiss(alert.id)
            }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default SystemAlertNotifications
