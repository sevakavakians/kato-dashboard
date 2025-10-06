import { Outlet, Link, useLocation } from 'react-router-dom'
import { Activity, Database, BarChart3, Users } from 'lucide-react'

export default function Layout() {
  const location = useLocation()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Activity },
    { name: 'Sessions', href: '/sessions', icon: Users },
    { name: 'Databases', href: '/databases', icon: Database },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  ]

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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Version 1.0.0
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// Utility function (should be in lib/utils.ts, but inline for simplicity)
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
