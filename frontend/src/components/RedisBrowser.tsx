import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Search, AlertCircle, RefreshCw } from 'lucide-react'
import { apiClient } from '../lib/api'

interface RedisKeyInfo {
  key: string
  type: string
  ttl: number
  value: any
  size?: number
}

export default function RedisBrowser() {
  const [searchPattern, setSearchPattern] = useState('*')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const { data: redisInfo } = useQuery({
    queryKey: ['redisInfo'],
    queryFn: () => apiClient.getRedisInfo(),
    refetchInterval: 10000,
  })

  const { data: keysData, isLoading: keysLoading, refetch: refetchKeys } = useQuery({
    queryKey: ['redisKeys', searchPattern],
    queryFn: () => apiClient.listRedisKeys(searchPattern, 500),
    refetchInterval: 10000,
  })

  const { data: keyInfo, isLoading: keyInfoLoading } = useQuery<RedisKeyInfo>({
    queryKey: ['redisKey', selectedKey],
    queryFn: () => apiClient.getRedisKey(selectedKey!),
    enabled: !!selectedKey,
  })

  const keys: string[] = keysData?.keys || []
  const redisStats = redisInfo?.info || {}

  const formatValue = (value: any, type: string) => {
    if (type === 'string') return value
    if (type === 'list' || type === 'set' || type === 'zset') {
      return Array.isArray(value) ? value.join('\n') : JSON.stringify(value, null, 2)
    }
    if (type === 'hash') {
      return JSON.stringify(value, null, 2)
    }
    return JSON.stringify(value, null, 2)
  }

  const formatTTL = (ttl: number) => {
    if (ttl === -1) return 'No expiration'
    if (ttl === -2) return 'Key does not exist'
    const hours = Math.floor(ttl / 3600)
    const minutes = Math.floor((ttl % 3600) / 60)
    const seconds = ttl % 60
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  return (
    <div className="space-y-6">
      {/* Redis Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Connected Clients</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {redisStats.connected_clients || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Memory Used</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {redisStats.used_memory_human || 'N/A'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Keys</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {keys.length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Hit Rate</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {redisInfo?.cache_hit_rate?.hit_rate?.toFixed(2) || 0}%
          </div>
        </div>
      </div>

      {/* Search Pattern */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search pattern (e.g., session:*, user:*)"
            value={searchPattern}
            onChange={(e) => setSearchPattern(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && refetchKeys()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => refetchKeys()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Search
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Keys List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Keys ({keys.length})
            </h2>
          </div>
          {keysLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading keys...
            </div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No keys found matching pattern "{searchPattern}"
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
              {keys.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedKey === key
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                      : ''
                  }`}
                >
                  <code className="text-sm text-gray-900 dark:text-white font-mono break-all">
                    {key}
                  </code>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Key Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Key Details
            </h2>
          </div>
          {!selectedKey ? (
            <div className="p-12 text-center">
              <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                Select a key to view its details
              </p>
            </div>
          ) : keyInfoLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading key details...
            </div>
          ) : !keyInfo ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-red-600 dark:text-red-400">
                Failed to load key details
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Key</span>
                  <code className="text-sm text-gray-900 dark:text-white font-mono break-all text-right">
                    {keyInfo.key}
                  </code>
                </div>
                <div className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Type</span>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {keyInfo.type}
                  </span>
                </div>
                <div className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">TTL</span>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {formatTTL(keyInfo.ttl)}
                  </span>
                </div>
                {keyInfo.size !== undefined && (
                  <div className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Size</span>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {keyInfo.size} bytes
                    </span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Value
                </h3>
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 max-h-64 overflow-y-auto">
                  <pre className="text-xs text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                    <code>
                      {formatValue(keyInfo.value, keyInfo.type)}
                    </code>
                  </pre>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      formatValue(keyInfo.value, keyInfo.type)
                    )
                    alert('Value copied to clipboard!')
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Copy Value
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(keyInfo.key)
                    alert('Key copied to clipboard!')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  Copy Key
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
