import { useSearchParams } from 'react-router-dom'
import { HardDrive } from 'lucide-react'
import ClickHouseBrowser from '../components/ClickHouseBrowser'
import RedisBrowser from '../components/RedisBrowser'
import QdrantBrowser from '../components/QdrantBrowser'

const TABS = [
  { id: 'clickhouse', label: 'ClickHouse' },
  { id: 'redis', label: 'Redis' },
  { id: 'qdrant', label: 'Qdrant' },
] as const

type TabId = typeof TABS[number]['id']

export default function DataBrowser() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as TabId) || 'clickhouse'

  const setTab = (tab: TabId) => {
    setSearchParams({ tab })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <HardDrive className="w-8 h-8" />
          Databases
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Browse and query ClickHouse, Redis, and Qdrant databases
        </p>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'clickhouse' && <ClickHouseBrowser />}
      {activeTab === 'redis' && <RedisBrowser />}
      {activeTab === 'qdrant' && <QdrantBrowser />}
    </div>
  )
}
