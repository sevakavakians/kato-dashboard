import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {  Database, Search, Edit, Trash2, AlertCircle, ChevronRight, RefreshCw } from 'lucide-react'
import { apiClient } from '../lib/api'

interface Pattern {
  _id: string
  pattern: string
  frequency: number
  confidence?: number
  last_seen?: string
  [key: string]: any
}

interface ProcessorData {
  processor_id: string
  name?: string
  patterns_count?: number
}

interface RedisKeyInfo {
  key: string
  type: string
  ttl: number
  value: any
  size?: number
}

function RedisKeyBrowser() {
  const [searchPattern, setSearchPattern] = useState('*')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Fetch Redis info
  const { data: redisInfo } = useQuery({
    queryKey: ['redisInfo'],
    queryFn: () => apiClient.getRedisInfo(),
    refetchInterval: 10000,
  })

  // Fetch keys list
  const { data: keysData, isLoading: keysLoading, refetch: refetchKeys } = useQuery({
    queryKey: ['redisKeys', searchPattern],
    queryFn: () => apiClient.listRedisKeys(searchPattern, 500),
    refetchInterval: 10000,
  })

  // Fetch selected key details
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
              {/* Key Info */}
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

              {/* Value */}
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

              {/* Actions */}
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

export default function Databases() {
  const [selectedTab, setSelectedTab] = useState<'mongodb' | 'qdrant' | 'redis'>('mongodb')
  const [selectedProcessor, setSelectedProcessor] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null)
  const [editFormData, setEditFormData] = useState<Record<string, any>>({})
  const pageSize = 20
  const queryClient = useQueryClient()

  // Fetch processors
  const { data: processorsData, isLoading: processorsLoading } = useQuery({
    queryKey: ['processors'],
    queryFn: () => apiClient.getProcessors(),
    enabled: selectedTab === 'mongodb',
  })

  // Fetch patterns for selected processor
  const { data: patternsData, isLoading: patternsLoading, refetch: refetchPatterns } = useQuery({
    queryKey: ['patterns', selectedProcessor, page],
    queryFn: () => apiClient.getPatterns(selectedProcessor!, page * pageSize, pageSize),
    enabled: !!selectedProcessor,
    refetchInterval: 15000,
  })

  // Fetch processor statistics
  const { data: stats } = useQuery({
    queryKey: ['processorStats', selectedProcessor],
    queryFn: () => apiClient.getPatternStatistics(selectedProcessor!),
    enabled: !!selectedProcessor,
  })

  // Delete pattern mutation
  const deleteMutation = useMutation({
    mutationFn: ({ processorId, patternId }: { processorId: string; patternId: string }) =>
      apiClient.deletePattern(processorId, patternId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] })
      queryClient.invalidateQueries({ queryKey: ['processorStats'] })
    },
  })

  // Update pattern mutation
  const updateMutation = useMutation({
    mutationFn: ({ processorId, patternId, updates }: { processorId: string; patternId: string; updates: any }) =>
      apiClient.updatePattern(processorId, patternId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] })
      queryClient.invalidateQueries({ queryKey: ['processorStats'] })
      setEditingPattern(null)
      setEditFormData({})
    },
  })

  const processors: ProcessorData[] = processorsData?.processors || []
  const patterns: Pattern[] = patternsData?.patterns || []
  const total = patternsData?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const filteredPatterns = patterns.filter((pattern) =>
    pattern.pattern?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDelete = async (patternId: string) => {
    if (!selectedProcessor) return
    if (window.confirm('Are you sure you want to delete this pattern?')) {
      await deleteMutation.mutateAsync({ processorId: selectedProcessor, patternId })
    }
  }

  const handleEdit = (pattern: Pattern) => {
    setEditingPattern(pattern)
    setEditFormData({
      pattern: pattern.pattern,
      frequency: pattern.frequency,
      confidence: pattern.confidence || 0,
    })
  }

  const handleUpdate = async () => {
    if (!editingPattern || !selectedProcessor) return
    await updateMutation.mutateAsync({
      processorId: selectedProcessor,
      patternId: editingPattern._id,
      updates: editFormData,
    })
  }

  const handleCancelEdit = () => {
    setEditingPattern(null)
    setEditFormData({})
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Database Management
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Browse and analyze MongoDB, Qdrant, and Redis databases
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            setSelectedTab('mongodb')
            setSelectedProcessor(null)
          }}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'mongodb'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          MongoDB
        </button>
        <button
          onClick={() => setSelectedTab('qdrant')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'qdrant'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Qdrant
        </button>
        <button
          onClick={() => setSelectedTab('redis')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'redis'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Redis
        </button>
      </div>

      {/* MongoDB Tab */}
      {selectedTab === 'mongodb' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Processors List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Processors
                </h2>
              </div>
              {processorsLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Loading processors...
                </div>
              ) : processors.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No processors found
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {processors.map((processor) => (
                    <button
                      key={processor.processor_id}
                      onClick={() => {
                        setSelectedProcessor(processor.processor_id)
                        setPage(0)
                      }}
                      className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        selectedProcessor === processor.processor_id
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {processor.name || processor.processor_id}
                        </div>
                        {processor.patterns_count !== undefined && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {processor.patterns_count} patterns
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Patterns View */}
          <div className="lg:col-span-2">
            {!selectedProcessor ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Select a processor to view its patterns
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stats */}
                {stats && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Total Patterns</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {stats.total_patterns || 0}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Avg Frequency</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {stats.avg_frequency?.toFixed(2) || 0}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {stats.avg_confidence?.toFixed(2) || 0}%
                      </div>
                    </div>
                  </div>
                )}

                {/* Search and Actions */}
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search patterns..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => refetchPatterns()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </button>
                </div>

                {/* Patterns List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                  {patternsLoading ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      Loading patterns...
                    </div>
                  ) : filteredPatterns.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      {searchTerm ? 'No patterns found matching your search' : 'No patterns available'}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredPatterns.map((pattern) => (
                        <div key={pattern._id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          {editingPattern?._id === pattern._id ? (
                            /* Edit Mode */
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Pattern
                                </label>
                                <input
                                  type="text"
                                  value={editFormData.pattern || ''}
                                  onChange={(e) => setEditFormData({ ...editFormData, pattern: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Frequency
                                  </label>
                                  <input
                                    type="number"
                                    value={editFormData.frequency || 0}
                                    onChange={(e) => setEditFormData({ ...editFormData, frequency: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Confidence
                                  </label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={editFormData.confidence || 0}
                                    onChange={(e) => setEditFormData({ ...editFormData, confidence: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleUpdate}
                                  disabled={updateMutation.isPending}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* View Mode */
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900 dark:text-white mb-1">
                                  {pattern.pattern}
                                </div>
                                <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                                  <span>Frequency: {pattern.frequency}</span>
                                  {pattern.confidence !== undefined && (
                                    <span>Confidence: {pattern.confidence}%</span>
                                  )}
                                  {pattern.last_seen && (
                                    <span>Last seen: {new Date(pattern.last_seen).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEdit(pattern)}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                  title="Edit Pattern"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(pattern._id)}
                                  disabled={deleteMutation.isPending}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                  title="Delete Pattern"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-gray-600 dark:text-gray-400">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Qdrant Tab */}
      {selectedTab === 'qdrant' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            Qdrant vector database browser coming in Phase 2
          </p>
        </div>
      )}

      {/* Redis Tab */}
      {selectedTab === 'redis' && <RedisKeyBrowser />}
    </div>
  )
}
