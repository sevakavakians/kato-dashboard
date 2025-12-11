import { Outlet, Link, useLocation } from 'react-router-dom'
import { Activity, Database, BarChart3, Users, Box, Wifi, WifiOff, Bell, Network } from 'lucide-react'
import { useWebSocket, useWebSocketStatus } from '../hooks/useWebSocket'
import { AlertProvider, useAlertSidebar } from '../contexts/AlertContext'
import AlertHistorySidebar from './AlertHistorySidebar'

function LayoutContent() {
  const location = useLocation()
  const { status, isConnected } = useWebSocketStatus()
  const {
    systemAlerts,
    unreadAlertCount,
    markAlertsAsRead,
    clearAllAlerts
  } = useWebSocket(true, undefined, ['system_alerts'])
  const { toggleSidebar } = useAlertSidebar()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Activity },
    { name: 'Sessions', href: '/sessions', icon: Users },
    { name: 'Databases', href: '/databases', icon: Database },
    { name: 'Vectors', href: '/vectors', icon: Box },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Hierarchy', href: '/hierarchy', icon: Network },
  ]

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-500'
      case 'connecting':
        return 'text-yellow-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Real-time'
      case 'connecting':
        return 'Connecting...'
      case 'error':
        return 'Connection Error'
      default:
        return 'Offline'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center px-6 py-5 border-b border-gray-200 dark:border-gray-700">
            <Activity className="w-8 h-8 text-primary mr-3" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                KATO Dashboard
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                System Monitor
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive =
                item.href === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  )}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            {/* Connection Status */}
            <div className="flex items-center gap-2 mb-3">
              {isConnected ? (
                <Wifi className={`w-4 h-4 ${getStatusColor()}`} />
              ) : (
                <WifiOff className={`w-4 h-4 ${getStatusColor()}`} />
              )}
              <span className={`text-xs font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Version 1.0.0
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        {/* Top Header with Alert Button */}
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-4">
          <div className="flex items-center justify-end">
            <button
              onClick={toggleSidebar}
              className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Open alert history"
            >
              <Bell className="w-5 h-5" />
              {unreadAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="p-8">
          <Outlet />
        </main>
      </div>

      {/* Alert History Sidebar */}
      <AlertHistorySidebar
        alerts={systemAlerts}
        unreadCount={unreadAlertCount}
        onMarkAsRead={markAlertsAsRead}
        onClearAll={clearAllAlerts}
      />
    </div>
  )
}

export default function Layout() {
  return (
    <AlertProvider>
      <LayoutContent />
    </AlertProvider>
  )
}

// Utility function (should be in lib/utils.ts, but inline for simplicity)
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
