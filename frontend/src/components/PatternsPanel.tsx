import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, Search, ChevronRight, RefreshCw, CheckSquare, Square, Trash } from 'lucide-react'
import { apiClient } from '../lib/api'
import PatternDetailModal from './PatternDetailModal'
import type { Pattern } from '../types/knowledgebase'

interface PatternsPanelProps {
  kbId: string
}

export default function PatternsPanel({ kbId }: PatternsPanelProps) {
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set())
  const [selectedPatternForDetails, setSelectedPatternForDetails] = useState<Pattern | null>(null)
  const [sortBy, setSortBy] = useState<'length' | 'token_count' | 'frequency'>('length')
  const [sortOrder, setSortOrder] = useState<1 | -1>(-1)
  const pageSize = 20
  const queryClient = useQueryClient()

  // Reset state when kbId changes
  useEffect(() => {
    setPage(0)
    setSearchTerm('')
    setSelectedPatterns(new Set())
    setSelectedPatternForDetails(null)
  }, [kbId])

  const getPatternIdentifier = (pattern: Pattern): string => {
    return pattern.name || pattern._id || 'Unknown pattern'
  }

  const { data: patternsData, isLoading: patternsLoading, refetch: refetchPatterns } = useQuery({
    queryKey: ['hybridPatterns', kbId, page, sortBy, sortOrder],
    queryFn: () => apiClient.getHybridPatterns(kbId, page * pageSize, pageSize, sortBy, sortOrder),
    refetchInterval: 15000,
  })

  const { data: stats } = useQuery({
    queryKey: ['hybridProcessorStats', kbId],
    queryFn: () => apiClient.getHybridPatternStatistics(kbId),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ patternName }: { patternName: string }) =>
      apiClient.deleteHybridPattern(kbId, patternName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns'] })
      queryClient.invalidateQueries({ queryKey: ['hybridProcessorStats'] })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ patternNames }: { patternNames: string[] }) =>
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

  const patterns: Pattern[] = patternsData?.patterns || []
  const total = patternsData?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const filteredPatterns = patterns.filter((pattern) =>
    getPatternIdentifier(pattern).toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDelete = async (patternName: string) => {
    if (window.confirm('Are you sure you want to delete this pattern?')) {
      await deleteMutation.mutateAsync({ patternName })
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
    if (selectedPatterns.size === 0) return
    if (window.confirm(`Are you sure you want to delete ${selectedPatterns.size} pattern(s)? This action cannot be undone.`)) {
      await bulkDeleteMutation.mutateAsync({
        patternNames: Array.from(selectedPatterns)
      })
    }
  }

  return (
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

        {/* Badge Legend */}
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600 dark:text-gray-400 font-medium">Badges:</span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                E
              </span>
              <span className="text-gray-600 dark:text-gray-400">Emotives</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                M
              </span>
              <span className="text-gray-600 dark:text-gray-400">Metadata</span>
            </div>
          </div>
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
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-mono text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {getPatternIdentifier(pattern)}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {pattern.has_emotives && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                title="Has emotives"
                              >
                                E
                              </span>
                            )}
                            {pattern.has_metadata && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                                title="Has metadata"
                              >
                                M
                              </span>
                            )}
                          </div>
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

      {/* Pattern Detail Modal */}
      {selectedPatternForDetails && (
        <PatternDetailModal
          pattern={selectedPatternForDetails}
          processorId={kbId}
          onClose={() => setSelectedPatternForDetails(null)}
          onDelete={(patternName) => {
            handleDelete(patternName)
            setSelectedPatternForDetails(null)
          }}
        />
      )}
    </div>
  )
}
