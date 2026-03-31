import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, CheckSquare, Square, Trash, Trash2 } from 'lucide-react'
import { apiClient } from '../lib/api'
import type { QdrantPoint } from '../types/knowledgebase'

interface VectorsPanelProps {
  kbId: string
  collectionName: string | null
}

export default function VectorsPanel({ kbId, collectionName }: VectorsPanelProps) {
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  // Reset state when kbId changes
  useEffect(() => {
    setSelectedPoints(new Set())
  }, [kbId, collectionName])

  const { data: collectionStats } = useQuery({
    queryKey: ['qdrantCollectionStats', collectionName],
    queryFn: () => apiClient.getQdrantCollectionStats(collectionName!),
    enabled: !!collectionName,
  })

  const { data: pointsData, isLoading: pointsLoading } = useQuery({
    queryKey: ['qdrantPoints', collectionName],
    queryFn: () => apiClient.getQdrantPoints(collectionName!, 100),
    enabled: !!collectionName,
  })

  const deletePointsMutation = useMutation({
    mutationFn: ({ pointIds }: { pointIds: string[] }) =>
      apiClient.bulkDeleteQdrantPoints(collectionName!, pointIds),
  })

  const deleteCollectionMutation = useMutation({
    mutationFn: () => apiClient.deleteQdrantCollection(collectionName!),
  })

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
    if (!collectionName || selectedPoints.size === 0) return

    const userInput = window.prompt(
      `Warning: You are about to delete ${selectedPoints.size} point(s) from "${collectionName}".\n\n` +
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
        await deletePointsMutation.mutateAsync({ pointIds: Array.from(selectedPoints) })
        results.successful = Array.from(selectedPoints)
      } catch (error: any) {
        results.failed = Array.from(selectedPoints).map(id => ({
          name: id,
          error: error.response?.data?.detail || error.message || 'Unknown error'
        }))
      }

      queryClient.invalidateQueries({ queryKey: ['qdrantPoints'] })
      queryClient.invalidateQueries({ queryKey: ['qdrantCollectionStats'] })
      queryClient.invalidateQueries({ queryKey: ['qdrantProcessorCollections'] })
      setSelectedPoints(new Set())

      let message = `Successfully deleted ${results.successful.length} point(s)`
      if (results.failed.length > 0) {
        message += `\n\nFailed to delete ${results.failed.length} point(s):\n`
        results.failed.forEach(f => {
          message += `\n- ${f.name}: ${f.error}`
        })
      }
      alert(message)
    } else if (userInput !== null) {
      alert(`Confirmation text did not match.\nYou typed: "${userInput}"\nExpected: "${expectedInput}"`)
    }
  }

  const handleDeleteCollection = async () => {
    if (!collectionName) return

    const userInput = window.prompt(
      `Warning: You are about to delete the entire "${collectionName}" collection.\n\n` +
      `This will permanently remove ALL vectors and CANNOT be undone.\n\n` +
      `Type "${collectionName}" exactly to confirm deletion:`
    )

    if (userInput && userInput.trim() === collectionName) {
      if (window.confirm(`Final confirmation: Delete collection "${collectionName}"?`)) {
        try {
          await deleteCollectionMutation.mutateAsync()
          queryClient.invalidateQueries({ queryKey: ['qdrantCollectionStats'] })
          queryClient.invalidateQueries({ queryKey: ['qdrantProcessorCollections'] })
          alert(`Successfully deleted collection "${collectionName}"`)
        } catch (error: any) {
          alert(`Failed to delete collection: ${error.response?.data?.detail || error.message}`)
        }
      }
    } else if (userInput !== null) {
      alert(`Collection name did not match. You typed: "${userInput}"\nExpected: "${collectionName}"`)
    }
  }

  if (!collectionName) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
        <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Vector Collection
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          No vector collection found for this knowledgebase.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Collection Stats */}
      {collectionStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Vectors</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {(collectionStats.points_count || collectionStats.vectors_count || 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Vector Size</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {collectionStats.vector_size || 'N/A'}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Status</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {collectionStats.status || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Collection Info */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
            <Database className="w-5 h-5" />
            <span className="font-semibold">Collection:</span>
          </div>
          <span className="text-sm font-mono text-purple-600 dark:text-purple-400">{collectionName}</span>
        </div>
        <button
          onClick={handleDeleteCollection}
          disabled={deleteCollectionMutation.isPending}
          className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
          Delete Collection
        </button>
      </div>

      {/* Points */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Vectors
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
    </div>
  )
}
