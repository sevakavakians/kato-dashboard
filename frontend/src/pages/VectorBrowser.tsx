import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Database,
  ChevronRight,
  Search,
  RefreshCw,
  AlertCircle,
  Box,
  Code,
  Sparkles,
} from 'lucide-react'
import { apiClient } from '../lib/api'

interface QdrantCollection {
  name: string
  vectors_count: number
  vector_size: number
  distance: string
  status: string
  processor_id?: string
}

interface QdrantPoint {
  id: string | number
  payload?: Record<string, any>
  vector?: number[]
}

interface QdrantPointsResponse {
  points: QdrantPoint[]
  next_offset: string | null
  count: number
}

interface SimilarPointsResponse {
  reference_point_id: string
  similar_points: Array<{
    id: string | number
    score: number
    payload?: Record<string, any>
  }>
  count: number
  collection: string
}

export default function VectorBrowser() {
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [offset, setOffset] = useState<string | undefined>(undefined)
  const [selectedPoint, setSelectedPoint] = useState<QdrantPoint | null>(null)
  const [searchPointId, setSearchPointId] = useState('')
  const [showSimilar, setShowSimilar] = useState(false)
  const [similarLimit, setSimilarLimit] = useState(10)

  // Fetch all collections
  const { data: collectionsData, isLoading: collectionsLoading } = useQuery({
    queryKey: ['qdrant-collections'],
    queryFn: () => apiClient.getQdrantCollections(),
    refetchInterval: 15000,
  })

  const collections: QdrantCollection[] = collectionsData?.collections || []

  // Fetch collection stats when selected
  const { data: collectionStats, isLoading: statsLoading } = useQuery({
    queryKey: ['qdrant-collection-stats', selectedCollection],
    queryFn: () => apiClient.getQdrantCollectionStats(selectedCollection!),
    enabled: !!selectedCollection,
    refetchInterval: 15000,
  })

  // Fetch points for selected collection
  const {
    data: pointsData,
    isLoading: pointsLoading,
    refetch: refetchPoints,
  } = useQuery<QdrantPointsResponse>({
    queryKey: ['qdrant-points', selectedCollection, offset],
    queryFn: () =>
      apiClient.getQdrantPoints(
        selectedCollection!,
        100,
        offset,
        false, // Don't fetch vectors in list view for performance
        true
      ),
    enabled: !!selectedCollection,
    refetchInterval: 15000,
  })

  // Fetch point details when selected
  const { data: pointDetails, isLoading: pointLoading } = useQuery({
    queryKey: ['qdrant-point', selectedCollection, selectedPoint?.id],
    queryFn: () =>
      apiClient.getQdrantPoint(
        selectedCollection!,
        String(selectedPoint!.id),
        true, // Include vector
        true
      ),
    enabled: !!selectedCollection && !!selectedPoint,
  })

  // Fetch similar points
  const { data: similarPointsData, isLoading: similarLoading } =
    useQuery<SimilarPointsResponse>({
      queryKey: ['similar-points', selectedCollection, selectedPoint?.id, similarLimit],
      queryFn: () =>
        apiClient.findSimilarPoints(
          selectedCollection!,
          String(selectedPoint!.id),
          similarLimit
        ),
      enabled: !!selectedCollection && !!selectedPoint && showSimilar,
    })

  const points: QdrantPoint[] = pointsData?.points || []
  const nextOffset = pointsData?.next_offset
  const pointCount = pointsData?.count || 0

  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName)
    setOffset(undefined)
    setSelectedPoint(null)
    setShowSimilar(false)
  }

  const handlePointClick = (point: QdrantPoint) => {
    setSelectedPoint(point)
    setShowSimilar(false)
  }

  const handleNextPage = () => {
    if (nextOffset) {
      setOffset(nextOffset)
      setSelectedPoint(null)
    }
  }

  const handlePrevPage = () => {
    setOffset(undefined)
    setSelectedPoint(null)
  }

  const handleSearchPoint = async () => {
    if (!selectedCollection || !searchPointId.trim()) return

    try {
      const point = await apiClient.getQdrantPoint(
        selectedCollection,
        searchPointId.trim(),
        true,
        true
      )
      setSelectedPoint(point)
    } catch (error) {
      console.error('Point not found:', error)
      alert(`Point ${searchPointId} not found in collection ${selectedCollection}`)
    }
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num)
  }

  const formatVector = (vector: number[] | undefined, maxDisplay = 10) => {
    if (!vector) return 'N/A'
    if (vector.length <= maxDisplay) {
      return `[${vector.map((v) => v.toFixed(4)).join(', ')}]`
    }
    return `[${vector
      .slice(0, maxDisplay)
      .map((v) => v.toFixed(4))
      .join(', ')}, ... +${vector.length - maxDisplay} more]`
  }

  return (
    <div className="flex h-screen">
      {/* Left Sidebar - Collection List */}
      <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5" />
            Collections
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {collections.length} total
          </p>
        </div>

        {collectionsLoading ? (
          <div className="p-4 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">Loading collections...</p>
          </div>
        ) : collections.length === 0 ? (
          <div className="p-4 text-center">
            <AlertCircle className="w-6 h-6 mx-auto text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">No collections found</p>
          </div>
        ) : (
          <div className="p-2">
            {collections.map((collection) => (
              <button
                key={collection.name}
                onClick={() => handleCollectionSelect(collection.name)}
                className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                  selectedCollection === collection.name
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">
                    {collection.name}
                  </span>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatNumber(collection.vectors_count)} points
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {collection.vector_size}D • {collection.distance}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedCollection ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Database className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Collection Selected
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Select a collection from the sidebar to browse vector points
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Collection Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCollection}
                  </h2>
                  {statsLoading ? (
                    <p className="text-sm text-gray-500">Loading stats...</p>
                  ) : collectionStats ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatNumber(collectionStats.points_count)} points •{' '}
                      {collectionStats.vector_size}D vectors •{' '}
                      {collectionStats.distance_metric}
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={() => refetchPoints()}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center gap-2 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {/* Search Bar */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchPointId}
                    onChange={(e) => setSearchPointId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchPoint()}
                    placeholder="Search by point ID..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  onClick={handleSearchPoint}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Content Area - Split View */}
            <div className="flex-1 flex overflow-hidden">
              {/* Points List */}
              <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Box className="w-4 h-4" />
                      Points ({pointCount})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePrevPage}
                        disabled={!offset}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={handleNextPage}
                        disabled={!nextOffset}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  {pointsLoading ? (
                    <div className="text-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                      <p className="text-gray-500 mt-2">Loading points...</p>
                    </div>
                  ) : points.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-8 h-8 mx-auto text-gray-400" />
                      <p className="text-gray-500 mt-2">No points found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {points.map((point) => (
                        <button
                          key={point.id}
                          onClick={() => handlePointClick(point)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedPoint?.id === point.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                              ID: {point.id}
                            </span>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                          {point.payload && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {Object.keys(point.payload).length} payload fields
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Point Details */}
              <div className="w-1/2 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                <div className="p-4">
                  {!selectedPoint ? (
                    <div className="text-center py-12">
                      <Code className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-500 dark:text-gray-400">
                        Select a point to view details
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Point ID */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Point ID
                        </h4>
                        <p className="font-mono text-sm text-gray-900 dark:text-white">
                          {selectedPoint.id}
                        </p>
                      </div>

                      {/* Vector Data */}
                      {pointLoading ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                        </div>
                      ) : pointDetails?.vector ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Vector ({pointDetails.vector.length}D)
                          </h4>
                          <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto font-mono text-gray-900 dark:text-white">
                            {formatVector(pointDetails.vector, 20)}
                          </pre>
                        </div>
                      ) : null}

                      {/* Payload */}
                      {selectedPoint.payload && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Payload
                          </h4>
                          <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto font-mono text-gray-900 dark:text-white">
                            {JSON.stringify(selectedPoint.payload, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Similar Points Section */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Similar Points
                          </h4>
                          <div className="flex items-center gap-2">
                            <select
                              value={similarLimit}
                              onChange={(e) =>
                                setSimilarLimit(Number(e.target.value))
                              }
                              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value={5}>Top 5</option>
                              <option value={10}>Top 10</option>
                              <option value={20}>Top 20</option>
                            </select>
                            <button
                              onClick={() => setShowSimilar(!showSimilar)}
                              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                            >
                              {showSimilar ? 'Hide' : 'Find Similar'}
                            </button>
                          </div>
                        </div>

                        {showSimilar && (
                          <>
                            {similarLoading ? (
                              <div className="text-center py-4">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                              </div>
                            ) : similarPointsData ? (
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {similarPointsData.similar_points.map((sp, idx) => (
                                  <div
                                    key={sp.id}
                                    className="p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono text-xs">
                                        #{idx + 1}: {sp.id}
                                      </span>
                                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                        Score: {sp.score.toFixed(4)}
                                      </span>
                                    </div>
                                    {sp.payload && (
                                      <pre className="text-xs text-gray-600 dark:text-gray-400 mt-1 overflow-x-auto">
                                        {JSON.stringify(sp.payload, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
