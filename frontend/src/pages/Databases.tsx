import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {  Database, Search, Trash2, AlertCircle, ChevronRight, RefreshCw, CheckSquare, Square, Trash, Edit, Save, X } from 'lucide-react'
import { apiClient } from '../lib/api'
import SymbolsBrowser from '../components/SymbolsBrowser'

interface Pattern {
  _id: string
  name: string
  pattern_data?: any[]
  frequency: number
  length?: number
  emotives?: any
  metadata?: {
    [key: string]: any  // Arbitrary training data fields
  }
  [key: string]: any
}

interface ProcessorData {
  processor_id: string
  kb_id?: string
  name?: string
  patterns_count?: number
}

interface QdrantCollection {
  name: string
  vectors_count?: number
  vector_size?: number
  distance?: string
  status?: string
  processor_id?: string
}

interface QdrantPoint {
  id: string
  payload?: any
  vector?: number[]
}

interface RedisKeyInfo {
  key: string
  type: string
  ttl: number
  value: any
  size?: number
}

function QdrantBrowser() {
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(new Set())
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  // Fetch collections
  const { data: collectionsData, isLoading: collectionsLoading } = useQuery({
    queryKey: ['qdrantCollections'],
    queryFn: () => apiClient.getQdrantCollections(),
  })

  // Fetch points for selected collection
  const { data: pointsData, isLoading: pointsLoading } = useQuery({
    queryKey: ['qdrantPoints', selectedCollection],
    queryFn: () => apiClient.getQdrantPoints(selectedCollection!, 100),
    enabled: !!selectedCollection,
  })

  // Delete points mutation
  const deletePointsMutation = useMutation({
    mutationFn: ({ collectionName, pointIds }: { collectionName: string; pointIds: string[] }) =>
      apiClient.bulkDeleteQdrantPoints(collectionName, pointIds),
  })

  // Delete collection mutation
  const deleteCollectionMutation = useMutation({
    mutationFn: (collectionName: string) => apiClient.deleteQdrantCollection(collectionName),
  })

  const collections: QdrantCollection[] = collectionsData?.collections || []
  const points: QdrantPoint[] = pointsData?.points || []

  const handleTogglePoint = (pointId: string) => {
    const newSelected = new Set(selectedPoints)
    if (newSelected.has(pointId)) {
      newSelected.delete(pointId)
    } else {
      newSelected.add(pointId)
    }
    setSelectedPoints(newSelected)
  }

  const handleToggleAllPoints = () => {
    if (selectedPoints.size === points.length) {
      setSelectedPoints(new Set())
    } else {
      setSelectedPoints(new Set(points.map(p => p.id)))
    }
  }

  const handleBulkDeletePoints = async () => {
    if (!selectedCollection || selectedPoints.size === 0) return

    const userInput = window.prompt(
      `⚠️ WARNING: You are about to delete ${selectedPoints.size} point(s) from "${selectedCollection}".\n\n` +
      `This action CANNOT be undone.\n\n` +
      `Type "DELETE ${selectedPoints.size} POINTS" to confirm:`
    )

    const expectedInput = `DELETE ${selectedPoints.size} POINTS`
    if (userInput && userInput.trim() === expectedInput) {
      const results = {
        successful: [] as string[],
        failed: [] as { name: string; error: string }[]
      }

      try {
        await deletePointsMutation.mutateAsync({
          collectionName: selectedCollection,
          pointIds: Array.from(selectedPoints)
        })
        results.successful = Array.from(selectedPoints)
      } catch (error: any) {
        results.failed = Array.from(selectedPoints).map(id => ({
          name: id,
          error: error.response?.data?.detail || error.message || 'Unknown error'
        }))
      }

      queryClient.invalidateQueries({ queryKey: ['qdrantPoints'] })
      queryClient.invalidateQueries({ queryKey: ['qdrantCollections'] })
      setSelectedPoints(new Set())

      let message = `✓ Successfully deleted ${results.successful.length} point(s)`
      if (results.failed.length > 0) {
        message += `\n\n✗ Failed to delete ${results.failed.length} point(s):\n`
        results.failed.forEach(f => {
          message += `\n• ${f.name}: ${f.error}`
        })
      }
      alert(message)
    } else if (userInput !== null) {
      alert(`Confirmation text did not match.\nYou typed: "${userInput}"\nExpected: "${expectedInput}"`)
    }
  }

  const handleToggleCollection = (collectionName: string) => {
    const newSelected = new Set(selectedCollections)
    if (newSelected.has(collectionName)) {
      newSelected.delete(collectionName)
    } else {
      newSelected.add(collectionName)
    }
    setSelectedCollections(newSelected)
  }

  const handleToggleAllCollections = () => {
    if (selectedCollections.size === collections.length) {
      setSelectedCollections(new Set())
    } else {
      setSelectedCollections(new Set(collections.map(c => c.name)))
    }
  }

  const handleDeleteCollection = async (collectionName: string) => {
    const userInput = window.prompt(
      `⚠️ WARNING: You are about to delete the entire "${collectionName}" collection.\n\n` +
      `This will permanently remove ALL vectors and CANNOT be undone.\n\n` +
      `Type "${collectionName}" exactly to confirm deletion:`
    )

    if (userInput && userInput.trim() === collectionName) {
      if (window.confirm(`Final confirmation: Delete collection "${collectionName}"?`)) {
        try {
          await deleteCollectionMutation.mutateAsync(collectionName)
          queryClient.invalidateQueries({ queryKey: ['qdrantCollections'] })
          if (selectedCollection === collectionName) {
            setSelectedCollection(null)
          }
          alert(`✓ Successfully deleted collection "${collectionName}"`)
        } catch (error: any) {
          alert(`✗ Failed to delete collection: ${error.response?.data?.detail || error.message}`)
        }
      }
    } else if (userInput !== null) {
      alert(`Collection name did not match. You typed: "${userInput}"\nExpected: "${collectionName}"`)
    }
  }

  const handleBulkDeleteCollections = async () => {
    if (selectedCollections.size === 0) return

    const collectionList = Array.from(selectedCollections).join(', ')
    const userInput = window.prompt(
      `⚠️ DANGER: You are about to delete ${selectedCollections.size} collection(s):\n\n` +
      `${collectionList}\n\n` +
      `This will permanently remove ALL vectors and CANNOT be undone.\n\n` +
      `Type "DELETE ${selectedCollections.size} COLLECTIONS" to confirm:`
    )

    const expectedInput = `DELETE ${selectedCollections.size} COLLECTIONS`
    if (userInput && userInput.trim() === expectedInput) {
      const results = {
        successful: [] as string[],
        failed: [] as { name: string; error: string }[]
      }

      for (const collectionName of selectedCollections) {
        try {
          await deleteCollectionMutation.mutateAsync(collectionName)
          results.successful.push(collectionName)
        } catch (error: any) {
          results.failed.push({
            name: collectionName,
            error: error.response?.data?.detail || error.message || 'Unknown error'
          })
        }
      }

      queryClient.invalidateQueries({ queryKey: ['qdrantCollections'] })
      setSelectedCollection(null)
      setSelectedCollections(new Set())

      let message = `✓ Successfully deleted ${results.successful.length} collection(s)`
      if (results.failed.length > 0) {
        message += `\n\n✗ Failed to delete ${results.failed.length} collection(s):\n`
        results.failed.forEach(f => {
          message += `\n• ${f.name}: ${f.error}`
        })
      }
      alert(message)
    } else if (userInput !== null) {
      alert(`Confirmation text did not match.\nYou typed: "${userInput}"\nExpected: "${expectedInput}"`)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Collections List */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5" />
              Qdrant Collections
            </h2>
          </div>
          {collectionsLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading collections...
            </div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No collections found
            </div>
          ) : (
            <>
              {/* Bulk Actions Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleToggleAllCollections}
                      className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {selectedCollections.size === collections.length && collections.length > 0 ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {selectedCollections.size === collections.length && collections.length > 0
                        ? 'Deselect All'
                        : 'Select All'}
                    </span>
                  </div>
                  {selectedCollections.size > 0 && (
                    <button
                      onClick={handleBulkDeleteCollections}
                      disabled={deleteCollectionMutation.isPending}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash className="w-3 h-3" />
                      Delete ({selectedCollections.size})
                    </button>
                  )}
                </div>
              </div>

              {/* Collections List */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {collections.map((collection) => (
                  <div
                    key={collection.name}
                    className={`flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedCollection === collection.name
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                        : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleCollection(collection.name)
                      }}
                      className="p-4 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
                    >
                      {selectedCollections.has(collection.name) ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    {/* Collection Info */}
                    <button
                      onClick={() => {
                        setSelectedCollection(collection.name)
                        setSelectedPoints(new Set())
                      }}
                      className="flex-1 p-4 pl-0 text-left flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {collection.name}
                        </div>
                        {collection.vectors_count !== undefined && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {collection.vectors_count} vectors
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteCollection(collection.name)
                      }}
                      disabled={deleteCollectionMutation.isPending}
                      className="p-4 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 flex-shrink-0"
                      title="Delete Collection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Points View */}
      <div className="lg:col-span-2">
        {!selectedCollection ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              Select a collection to view its vectors
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Vectors in {selectedCollection}
              </h3>
            </div>

            {pointsLoading ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                Loading vectors...
              </div>
            ) : points.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No vectors found
              </div>
            ) : (
              <>
                {/* Bulk Actions Header */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleToggleAllPoints}
                        className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {selectedPoints.size === points.length && points.length > 0 ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {selectedPoints.size === points.length && points.length > 0
                          ? 'Deselect All'
                          : 'Select All'} ({points.length} vectors)
                      </span>
                    </div>
                    {selectedPoints.size > 0 && (
                      <button
                        onClick={handleBulkDeletePoints}
                        disabled={deletePointsMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash className="w-4 h-4" />
                        Delete Selected ({selectedPoints.size})
                      </button>
                    )}
                  </div>
                </div>

                {/* Points List */}
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {points.map((point) => (
                    <div key={point.id} className="flex items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      {/* Checkbox */}
                      <button
                        onClick={() => handleTogglePoint(point.id)}
                        className="mt-1 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
                      >
                        {selectedPoints.has(point.id) ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>

                      {/* Point Info */}
                      <div className="flex-1">
                        <div className="font-mono text-sm font-medium text-gray-900 dark:text-white mb-2">
                          ID: {point.id}
                        </div>
                        {point.payload && (
                          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto max-h-32 bg-gray-100 dark:bg-gray-900 p-2 rounded">
                            {JSON.stringify(point.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
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

interface PatternDetailModalProps {
  pattern: Pattern
  onClose: () => void
  onDelete: (patternName: string) => void
  processorId: string
}

function PatternDetailModal({ pattern, onClose, onDelete, processorId }: PatternDetailModalProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedFrequency, setEditedFrequency] = useState<string>('')
  const [editedEmotives, setEditedEmotives] = useState<string>('')
  const [editedMetadata, setEditedMetadata] = useState<string>('')

  // Fetch full pattern details (with emotives and metadata from Redis)
  const { data: fullPattern, isLoading, error, refetch } = useQuery({
    queryKey: ['hybridPatternDetail', processorId, pattern.name],
    queryFn: () => apiClient.getHybridPatternDetail(processorId, pattern.name),
  })

  // Use fetched pattern if available, otherwise fall back to prop pattern
  const displayPattern = fullPattern || pattern

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: { frequency?: number; emotives?: any; metadata?: any }) => {
      return await apiClient.updateHybridPattern(processorId, pattern.name, updates)
    },
    onSuccess: () => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['hybridPatternDetail', processorId, pattern.name] })
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns', processorId] })
      setIsEditing(false)
      alert('Pattern updated successfully!')
    },
    onError: (error: any) => {
      alert(`Failed to update pattern: ${error.response?.data?.detail || error.message}`)
    },
  })

  // Initialize edit form when entering edit mode
  const handleStartEdit = () => {
    setEditedFrequency(displayPattern.frequency?.toString() || '0')
    setEditedEmotives(JSON.stringify(displayPattern.emotives || {}, null, 2))
    setEditedMetadata(JSON.stringify(displayPattern.metadata || {}, null, 2))
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleSave = () => {
    try {
      // Validate and parse inputs
      const frequency = parseInt(editedFrequency, 10)
      if (isNaN(frequency) || frequency < 0) {
        alert('Frequency must be a non-negative integer')
        return
      }

      let emotives: any = {}
      try {
        emotives = JSON.parse(editedEmotives)
        if (typeof emotives !== 'object' || Array.isArray(emotives)) {
          throw new Error('Emotives must be an object')
        }
      } catch (e) {
        alert('Invalid emotives JSON format')
        return
      }

      let metadata: any = {}
      try {
        metadata = JSON.parse(editedMetadata)
        if (typeof metadata !== 'object' || Array.isArray(metadata)) {
          throw new Error('Metadata must be an object')
        }
      } catch (e) {
        alert('Invalid metadata JSON format')
        return
      }

      // Perform update
      updateMutation.mutate({ frequency, emotives, metadata })
    } catch (error: any) {
      alert(`Validation error: ${error.message}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Pattern Details
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Processor: {processorId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="p-6 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading pattern details...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                    Failed to load pattern details
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {error instanceof Error ? error.message : 'Unknown error occurred'}
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <div className="p-6 space-y-6">
            {/* Pattern ID */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Pattern ID
              </label>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                <code className="text-sm text-gray-900 dark:text-white font-mono break-all">
                  {displayPattern._id}
                </code>
              </div>
            </div>

            {/* Pattern Name */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Pattern Name
              </label>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                <code className="text-sm text-gray-900 dark:text-white font-mono break-all">
                  {displayPattern.name}
                </code>
              </div>
            </div>

            {/* Pattern Data */}
            {displayPattern.pattern_data && (
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Pattern Data
                </label>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-gray-900 dark:text-white">
                    {JSON.stringify(displayPattern.pattern_data, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Frequency {isEditing && <span className="text-xs text-blue-500">(editable)</span>}
                </label>
                {isEditing ? (
                  <input
                    type="number"
                    min="0"
                    value={editedFrequency}
                    onChange={(e) => setEditedFrequency(e.target.value)}
                    className="w-full bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-2xl font-bold text-blue-600 dark:text-blue-400 border-2 border-blue-300 dark:border-blue-700 focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {displayPattern.frequency}
                    </p>
                  </div>
                )}
              </div>

              {displayPattern.length !== undefined && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Length <span className="text-xs text-gray-500">(immutable)</span>
                  </label>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {displayPattern.length}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Emotives */}
            {(isEditing || (displayPattern.emotives && Object.keys(displayPattern.emotives).length > 0)) && (
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Emotives {isEditing && <span className="text-xs text-blue-500">(editable JSON)</span>}
                </label>
                {isEditing ? (
                  <textarea
                    value={editedEmotives}
                    onChange={(e) => setEditedEmotives(e.target.value)}
                    rows={6}
                    className="w-full bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs text-gray-900 dark:text-white font-mono border-2 border-blue-300 dark:border-blue-700 focus:outline-none focus:border-blue-500"
                    placeholder='{"emotion_name": [0.5, 0.6]}'
                  />
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                    <pre className="text-xs text-gray-900 dark:text-white overflow-auto">
                      {JSON.stringify(displayPattern.emotives, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Metadata (arbitrary training data fields) */}
            {(isEditing || (displayPattern.metadata && Object.keys(displayPattern.metadata).length > 0)) && (
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Metadata {isEditing && <span className="text-xs text-blue-500">(editable JSON)</span>}
                </label>
                {isEditing ? (
                  <textarea
                    value={editedMetadata}
                    onChange={(e) => setEditedMetadata(e.target.value)}
                    rows={8}
                    className="w-full bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs text-gray-900 dark:text-white font-mono border-2 border-blue-300 dark:border-blue-700 focus:outline-none focus:border-blue-500"
                    placeholder='{"key": "value"}'
                  />
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-900 dark:text-white">
                      {JSON.stringify(displayPattern.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isLoading && !error && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleStartEdit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Pattern
                </button>
                <button
                  onClick={() => {
                    onDelete(pattern.name)
                    onClose()
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Databases() {
  const [selectedTab, setSelectedTab] = useState<'patterns' | 'symbols' | 'qdrant' | 'redis'>('patterns')
  const [selectedProcessor, setSelectedProcessor] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set())
  const [selectedProcessors, setSelectedProcessors] = useState<Set<string>>(new Set())
  const [selectedPatternForDetails, setSelectedPatternForDetails] = useState<Pattern | null>(null)
  const [sortBy, setSortBy] = useState<'length' | 'token_count' | 'frequency'>('length')
  const [sortOrder, setSortOrder] = useState<1 | -1>(-1)
  const pageSize = 20
  const queryClient = useQueryClient()

  // Helper function to get pattern identifier for display
  // Uses only core KATO Superknowledgebase fields (name, not arbitrary metadata)
  const getPatternIdentifier = (pattern: Pattern): string => {
    return pattern.name || pattern._id || 'Unknown pattern'
  }

  // Fetch processors (hybrid ClickHouse kb_ids)
  const { data: processorsData, isLoading: processorsLoading } = useQuery({
    queryKey: ['hybridProcessors'],
    queryFn: () => apiClient.getHybridProcessors(),
    enabled: selectedTab === 'patterns',
  })

  // Fetch patterns for selected processor (hybrid ClickHouse + Redis)
  const { data: patternsData, isLoading: patternsLoading, refetch: refetchPatterns } = useQuery({
    queryKey: ['hybridPatterns', selectedProcessor, page, sortBy, sortOrder],
    queryFn: () => apiClient.getHybridPatterns(selectedProcessor!, page * pageSize, pageSize, sortBy, sortOrder),
    enabled: !!selectedProcessor,
    refetchInterval: 15000,
  })

  // Fetch processor statistics (hybrid ClickHouse)
  const { data: stats } = useQuery({
    queryKey: ['hybridProcessorStats', selectedProcessor],
    queryFn: () => apiClient.getHybridPatternStatistics(selectedProcessor!),
    enabled: !!selectedProcessor,
  })

  // Delete pattern mutation (hybrid ClickHouse + Redis)
  const deleteMutation = useMutation({
    mutationFn: ({ kbId, patternName }: { kbId: string; patternName: string }) =>
      apiClient.deleteHybridPattern(kbId, patternName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns'] })
      queryClient.invalidateQueries({ queryKey: ['hybridProcessorStats'] })
    },
  })

  // Bulk delete patterns mutation (hybrid ClickHouse + Redis)
  const bulkDeleteMutation = useMutation({
    mutationFn: ({ kbId, patternNames }: { kbId: string; patternNames: string[] }) =>
      apiClient.bulkDeleteHybridPatterns(kbId, patternNames),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns'] })
      queryClient.invalidateQueries({ queryKey: ['hybridProcessorStats'] })
      setSelectedPatterns(new Set())
      alert(`Successfully deleted ${data.deleted_count} pattern(s)`)
    },
    onError: (error: any) => {
      alert(`Failed to delete patterns: ${error.response?.data?.detail || error.message}`)
    },
  })

  // Delete knowledgebase mutation (hybrid ClickHouse + Redis)
  const deleteKnowledgebaseMutation = useMutation({
    mutationFn: (kbId: string) => apiClient.deleteKnowledgebase(kbId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hybridProcessors'] })
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns'] })
      queryClient.invalidateQueries({ queryKey: ['hybridProcessorStats'] })
      setSelectedProcessor(null)
      setSelectedPatterns(new Set())
      alert(
        `Successfully deleted knowledgebase:\n` +
        `- ${data.clickhouse_deleted} patterns from ClickHouse\n` +
        `- ${data.redis_keys_deleted} Redis keys`
      )
    },
    onError: (error: any) => {
      alert(`Failed to delete knowledgebase: ${error.response?.data?.detail || error.message}`)
    },
  })

  const processors: ProcessorData[] = processorsData?.processors || []
  const patterns: Pattern[] = patternsData?.patterns || []
  const total = patternsData?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const filteredPatterns = patterns.filter((pattern) =>
    getPatternIdentifier(pattern).toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDelete = async (patternName: string) => {
    if (!selectedProcessor) return
    if (window.confirm('Are you sure you want to delete this pattern?')) {
      await deleteMutation.mutateAsync({ kbId: selectedProcessor, patternName })
    }
  }

  const handleTogglePattern = (patternName: string) => {
    const newSelected = new Set(selectedPatterns)
    if (newSelected.has(patternName)) {
      newSelected.delete(patternName)
    } else {
      newSelected.add(patternName)
    }
    setSelectedPatterns(newSelected)
  }

  const handleToggleAll = () => {
    if (selectedPatterns.size === filteredPatterns.length) {
      setSelectedPatterns(new Set())
    } else {
      setSelectedPatterns(new Set(filteredPatterns.map(p => p.name)))
    }
  }

  const handleBulkDelete = async () => {
    if (!selectedProcessor || selectedPatterns.size === 0) return

    if (window.confirm(`Are you sure you want to delete ${selectedPatterns.size} pattern(s)? This action cannot be undone.`)) {
      await bulkDeleteMutation.mutateAsync({
        kbId: selectedProcessor,
        patternNames: Array.from(selectedPatterns)
      })
    }
  }

  const handleDeleteKnowledgebase = async (kbId: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const processor = processors.find(p => (p.processor_id || p.kb_id) === kbId)
    const patternCount = processor?.patterns_count || 0

    // First confirmation
    const firstConfirm = window.confirm(
      `⚠️ WARNING: This will permanently delete the entire knowledgebase!\n\n` +
      `Knowledgebase: ${kbId}\n` +
      `Patterns to delete: ${patternCount.toLocaleString()}\n\n` +
      `This will delete:\n` +
      `- All patterns from ClickHouse\n` +
      `- All associated Redis metadata\n\n` +
      `Are you sure you want to continue?`
    )

    if (!firstConfirm) return

    // Second confirmation
    const finalConfirm = window.confirm(
      `⚠️ FINAL CONFIRMATION\n\n` +
      `This will permanently delete knowledgebase "${kbId}" and cannot be undone.\n\n` +
      `Click OK to delete, or Cancel to abort.`
    )

    if (finalConfirm) {
      await deleteKnowledgebaseMutation.mutateAsync(kbId)
    }
  }

  const handleToggleProcessor = (processorKey: string) => {
    const newSelected = new Set(selectedProcessors)
    if (newSelected.has(processorKey)) {
      newSelected.delete(processorKey)
    } else {
      newSelected.add(processorKey)
    }
    setSelectedProcessors(newSelected)
  }

  const handleToggleAllProcessors = () => {
    if (selectedProcessors.size === processors.length) {
      setSelectedProcessors(new Set())
    } else {
      setSelectedProcessors(new Set(processors.map(p => p.processor_id || p.kb_id || 'unknown')))
    }
  }

  const handleBulkDeleteKnowledgebases = async () => {
    if (selectedProcessors.size === 0) return

    // Calculate total patterns across all selected KBs
    const selectedKbList = Array.from(selectedProcessors)
    const totalPatterns = selectedKbList.reduce((sum, kbId) => {
      const processor = processors.find(p => (p.processor_id || p.kb_id) === kbId)
      return sum + (processor?.patterns_count || 0)
    }, 0)

    // First confirmation
    const firstConfirm = window.confirm(
      `⚠️ DANGER: You are about to delete ${selectedProcessors.size} knowledgebase(s)!\n\n` +
      `Knowledgebases:\n${selectedKbList.map(kb => `  • ${kb}`).join('\n')}\n\n` +
      `Total patterns to delete: ${totalPatterns.toLocaleString()}\n\n` +
      `This will permanently remove ALL data from ClickHouse and Redis.\n\n` +
      `Are you sure you want to continue?`
    )

    if (!firstConfirm) return

    // Second confirmation
    const finalConfirm = window.confirm(
      `⚠️ FINAL CONFIRMATION\n\n` +
      `This will permanently delete ${selectedProcessors.size} knowledgebase(s) and ${totalPatterns.toLocaleString()} pattern(s).\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Click OK to proceed with deletion, or Cancel to abort.`
    )

    if (!finalConfirm) return

    // Perform bulk deletion
    const results = {
      successful: [] as string[],
      failed: [] as { name: string; error: string }[]
    }

    for (const kbId of selectedKbList) {
      try {
        await deleteKnowledgebaseMutation.mutateAsync(kbId)
        results.successful.push(kbId)
      } catch (error: any) {
        results.failed.push({
          name: kbId,
          error: error.response?.data?.detail || error.message || 'Unknown error'
        })
      }
    }

    // Clear selections
    queryClient.invalidateQueries({ queryKey: ['hybridProcessors'] })
    setSelectedProcessors(new Set())
    setSelectedProcessor(null)
    setSelectedPatterns(new Set())

    // Show results
    let message = `✓ Successfully deleted ${results.successful.length} knowledgebase(s)`
    if (results.failed.length > 0) {
      message += `\n\n✗ Failed to delete ${results.failed.length} knowledgebase(s):\n`
      results.failed.forEach(f => {
        message += `\n• ${f.name}: ${f.error}`
      })
    }
    alert(message)
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
            setSelectedTab('patterns')
            setSelectedProcessor(null)
            setSelectedPatterns(new Set())
            setSelectedProcessors(new Set())
          }}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'patterns'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Knowledgebase
        </button>
        <button
          onClick={() => {
            setSelectedTab('symbols')
            setSelectedPatterns(new Set())
            setSelectedProcessors(new Set())
          }}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'symbols'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Symbols
        </button>
        <button
          onClick={() => {
            setSelectedTab('qdrant')
            setSelectedPatterns(new Set())
            setSelectedProcessors(new Set())
          }}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'qdrant'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Qdrant
        </button>
        <button
          onClick={() => {
            setSelectedTab('redis')
            setSelectedPatterns(new Set())
            setSelectedProcessors(new Set())
          }}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedTab === 'redis'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Redis
        </button>
      </div>

      {/* Knowledgebase Tab */}
      {selectedTab === 'patterns' && (
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
                <>
                  {/* Bulk Actions Header */}
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleToggleAllProcessors}
                          className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {selectedProcessors.size === processors.length && processors.length > 0 ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {selectedProcessors.size === processors.length && processors.length > 0
                            ? 'Deselect All'
                            : 'Select All'}
                        </span>
                      </div>
                      {selectedProcessors.size > 0 && (
                        <button
                          onClick={handleBulkDeleteKnowledgebases}
                          disabled={deleteKnowledgebaseMutation.isPending}
                          className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash className="w-3 h-3" />
                          Delete ({selectedProcessors.size})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Processors List */}
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {processors.map((processor) => {
                      const processorKey = processor.processor_id || processor.kb_id || 'unknown'
                      return (
                        <div
                          key={processorKey}
                          className={`group relative flex items-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                            selectedProcessor === processorKey
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                              : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleProcessor(processorKey)
                            }}
                            className="p-4 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
                          >
                            {selectedProcessors.has(processorKey) ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>

                          {/* Processor Info */}
                          <button
                            onClick={() => {
                              setSelectedProcessor(processorKey)
                              setPage(0)
                              setSelectedPatterns(new Set())
                            }}
                            className="flex-1 p-4 pl-0 text-left flex items-center justify-between"
                          >
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {processor.name || processorKey}
                              </div>
                              {processor.patterns_count !== undefined && (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {processor.patterns_count.toLocaleString()} patterns
                                </div>
                              )}
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={(e) => handleDeleteKnowledgebase(processorKey, e)}
                            disabled={deleteKnowledgebaseMutation.isPending}
                            className="p-4 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 flex-shrink-0"
                            title="Delete knowledgebase"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
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

                {/* Hybrid Architecture Badge */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <Database className="w-5 h-5" />
                    <span className="font-semibold">Hybrid Architecture:</span>
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    <span className="font-mono">ClickHouse</span> (pattern data) + <span className="font-mono">Redis</span> (metadata)
                  </div>
                </div>

                {/* Search, Sort, and Actions */}
                <div className="space-y-4">
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex-1 relative min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Search patterns..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Sort Controls */}
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        setSortBy(e.target.value as 'length' | 'token_count' | 'frequency')
                        setPage(0)
                      }}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="length">Sort by Length</option>
                      <option value="token_count">Sort by Token Count</option>
                      <option value="frequency">Sort by Frequency</option>
                    </select>

                    <button
                      onClick={() => {
                        setSortOrder(sortOrder === -1 ? 1 : -1)
                        setPage(0)
                      }}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      title={sortOrder === -1 ? 'Descending' : 'Ascending'}
                    >
                      {sortOrder === -1 ? '↓ Desc' : '↑ Asc'}
                    </button>

                    {selectedPatterns.size > 0 && (
                      <button
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash className="w-4 h-4" />
                        Delete Selected ({selectedPatterns.size})
                      </button>
                    )}
                    <button
                      onClick={() => refetchPatterns()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </button>
                  </div>
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
                    <>
                      {/* Select All Header */}
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleToggleAll}
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {selectedPatterns.size === filteredPatterns.length && filteredPatterns.length > 0 ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {selectedPatterns.size === filteredPatterns.length && filteredPatterns.length > 0
                              ? 'Deselect All'
                              : 'Select All'
                            } ({filteredPatterns.length} patterns)
                          </span>
                        </div>
                      </div>

                      {/* Pattern Rows */}
                      <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredPatterns.map((pattern) => (
                        <div key={pattern.name || pattern._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          {/* View Mode - Clickable Row */}
                          <div className="flex items-center gap-3 p-4">
                            {/* Checkbox */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleTogglePattern(pattern.name)
                              }}
                              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
                            >
                              {selectedPatterns.has(pattern.name) ? (
                                <CheckSquare className="w-5 h-5" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>

                            {/* Clickable Pattern Content */}
                            <button
                              onClick={() => setSelectedPatternForDetails(pattern)}
                              className="flex-1 text-left flex items-center justify-between group"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-sm text-gray-900 dark:text-white mb-1 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {getPatternIdentifier(pattern)}
                                </div>
                                <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <span className="font-medium">Frequency:</span>
                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{pattern.frequency}</span>
                                  </span>
                                  {pattern.length !== undefined && (
                                    <span className="flex items-center gap-1">
                                      <span className="font-medium">Length:</span>
                                      <span className="text-purple-600 dark:text-purple-400 font-semibold">{pattern.length}</span>
                                    </span>
                                  )}
                                  {pattern.token_count !== undefined && (
                                    <span className="flex items-center gap-1">
                                      <span className="font-medium">Tokens:</span>
                                      <span className="text-green-600 dark:text-green-400 font-semibold">{pattern.token_count}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-shrink-0 ml-2" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
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

      {/* Pattern Detail Modal */}
      {selectedPatternForDetails && selectedProcessor && (
        <PatternDetailModal
          pattern={selectedPatternForDetails}
          processorId={selectedProcessor}
          onClose={() => setSelectedPatternForDetails(null)}
          onDelete={(patternName) => {
            handleDelete(patternName)
            setSelectedPatternForDetails(null)
          }}
        />
      )}

      {/* Symbols Tab */}
      {selectedTab === 'symbols' && <SymbolsBrowser />}

      {/* Qdrant Tab */}
      {selectedTab === 'qdrant' && <QdrantBrowser />}

      {/* Redis Tab */}
      {selectedTab === 'redis' && <RedisKeyBrowser />}
    </div>
  )
}
