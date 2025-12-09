import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Search, TrendingUp, BarChart3, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { apiClient } from '../lib/api'

interface SymbolData {
  name: string
  frequency: number
  pattern_member_frequency: number
  freq_pmf_ratio: number
}

interface ProcessorInfo {
  kb_id: string
  processor_id: string
  symbols_count: number
}

interface SymbolsResponse {
  kb_id: string
  symbols: SymbolData[]
  total: number
  skip: number
  limit: number
  has_more: boolean
}

interface StatsResponse {
  kb_id: string
  total_symbols: number
  avg_frequency: number
  avg_pattern_member_frequency: number
  max_frequency: number
  max_pattern_member_frequency: number
  top_symbols: Array<{
    name: string
    frequency: number
    pattern_member_frequency: number
  }>
}

type SortField = 'frequency' | 'pattern_member_frequency' | 'name' | 'freq_pmf_ratio'

export default function SymbolsBrowser() {
  const [selectedProcessor, setSelectedProcessor] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('frequency')
  const [sortOrder, setSortOrder] = useState<1 | -1>(-1)
  const pageSize = 100

  // Debounce search term
  useState(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(0) // Reset to first page on search
    }, 500)
    return () => clearTimeout(timer)
  })

  // Fetch processors with symbol data
  const { data: processorsData, isLoading: processorsLoading, error: processorsError } = useQuery<{ processors: ProcessorInfo[] }>({
    queryKey: ['symbolProcessors'],
    queryFn: () => apiClient.getSymbolProcessors(),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Auto-select first processor if available
  useState(() => {
    if (processorsData?.processors?.length && !selectedProcessor) {
      setSelectedProcessor(processorsData.processors[0].kb_id)
    }
  })

  // Fetch symbols for selected processor
  const { data: symbolsData, isLoading: symbolsLoading, error: symbolsError } = useQuery<SymbolsResponse>({
    queryKey: ['symbols', selectedProcessor, page, sortBy, sortOrder, debouncedSearch],
    queryFn: () => apiClient.getSymbols(
      selectedProcessor!,
      page * pageSize,
      pageSize,
      sortBy,
      sortOrder,
      debouncedSearch || undefined
    ),
    enabled: !!selectedProcessor,
    refetchInterval: 30000,
  })

  // Fetch statistics for selected processor
  const { data: statsData, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ['symbolStats', selectedProcessor],
    queryFn: () => apiClient.getSymbolStatistics(selectedProcessor!),
    enabled: !!selectedProcessor,
    refetchInterval: 30000,
  })

  // Calculate total pages
  const totalPages = useMemo(() => {
    if (!symbolsData) return 0
    return Math.ceil(symbolsData.total / pageSize)
  }, [symbolsData])

  // Get max frequency for bar visualization
  const maxFrequency = useMemo(() => {
    if (!symbolsData?.symbols.length) return 1
    return Math.max(...symbolsData.symbols.map(s => s.frequency))
  }, [symbolsData])

  const handleSortChange = (field: SortField) => {
    if (sortBy === field) {
      // Toggle order if clicking same field
      setSortOrder(sortOrder === -1 ? 1 : -1)
    } else {
      setSortBy(field)
      setSortOrder(-1) // Default to descending
    }
    setPage(0) // Reset to first page
  }

  const getFrequencyBadgeColor = (frequency: number) => {
    if (frequency >= 100) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    if (frequency >= 10) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  }

  const getRatioColor = (ratio: number) => {
    if (ratio > 1.5) return 'text-blue-600 dark:text-blue-400' // Freq >> PMF
    if (ratio < 0.67) return 'text-purple-600 dark:text-purple-400' // PMF >> Freq
    return 'text-gray-600 dark:text-gray-400' // Balanced
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Database className="w-6 h-6" />
          Symbol Statistics
        </h2>
      </div>

      {/* Processor Selection */}
      {processorsLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading processors...
        </div>
      ) : processorsError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">
            Error loading processors: {processorsError instanceof Error ? processorsError.message : 'Unknown error'}
          </p>
        </div>
      ) : !processorsData?.processors?.length ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8 text-center">
          <Database className="w-12 h-12 mx-auto mb-4 text-yellow-600 dark:text-yellow-400" />
          <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
            No Symbol Data Available
          </h3>
          <p className="text-yellow-700 dark:text-yellow-300">
            No processors with symbol data found. Symbol data will appear here once KATO populates Redis with symbol statistics.
          </p>
        </div>
      ) : (
        <>
          {/* Processor Dropdown */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Processor:
            </label>
            <select
              value={selectedProcessor || ''}
              onChange={(e) => {
                setSelectedProcessor(e.target.value)
                setPage(0)
              }}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {processorsData.processors.map((p) => (
                <option key={p.kb_id} value={p.kb_id}>
                  {p.kb_id} ({p.symbols_count.toLocaleString()} symbols)
                </option>
              ))}
            </select>
          </div>

          {/* Statistics Cards */}
          {selectedProcessor && (
            <>
              {statsLoading ? (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  Loading statistics...
                </div>
              ) : statsData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Total Symbols */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Symbols</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                          {statsData.total_symbols.toLocaleString()}
                        </p>
                      </div>
                      <Database className="w-12 h-12 text-blue-500 opacity-20" />
                    </div>
                  </div>

                  {/* Avg Frequency */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Frequency</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                          {statsData.avg_frequency.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Max: {statsData.max_frequency}
                        </p>
                      </div>
                      <TrendingUp className="w-12 h-12 text-green-500 opacity-20" />
                    </div>
                  </div>

                  {/* Avg PMF */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg PMF</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                          {statsData.avg_pattern_member_frequency.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Max: {statsData.max_pattern_member_frequency}
                        </p>
                      </div>
                      <BarChart3 className="w-12 h-12 text-purple-500 opacity-20" />
                    </div>
                  </div>
                </div>
              )}

              {/* Search and Sort Controls */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search symbols..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Sort Controls */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Sort by:
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortChange(e.target.value as SortField)}
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="frequency">Frequency</option>
                      <option value="pattern_member_frequency">PMF</option>
                      <option value="name">Name</option>
                      <option value="freq_pmf_ratio">Ratio</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === -1 ? 1 : -1)}
                      className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title={sortOrder === -1 ? 'Descending' : 'Ascending'}
                    >
                      <ArrowUpDown className="w-5 h-5" />
                      <span className="ml-1 text-xs">{sortOrder === -1 ? '↓' : '↑'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Symbols Table */}
              {symbolsLoading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Loading symbols...
                </div>
              ) : symbolsError ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-800 dark:text-red-200">
                    Error loading symbols: {symbolsError instanceof Error ? symbolsError.message : 'Unknown error'}
                  </p>
                </div>
              ) : !symbolsData?.symbols?.length ? (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
                  <Database className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    No Symbols Found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {debouncedSearch
                      ? `No symbols match the search term "${debouncedSearch}"`
                      : 'No symbols data available for this processor'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Symbol
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Frequency
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              PMF
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Ratio
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Distribution
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {symbolsData.symbols.map((symbol, idx) => {
                            const barWidth = (symbol.frequency / maxFrequency) * 100
                            return (
                              <tr key={`${symbol.name}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="font-mono text-sm text-gray-900 dark:text-white">
                                    {symbol.name}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getFrequencyBadgeColor(symbol.frequency)}`}>
                                    {symbol.frequency}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className="text-sm text-gray-900 dark:text-white">
                                    {symbol.pattern_member_frequency}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className={`text-sm font-medium ${getRatioColor(symbol.freq_pmf_ratio)}`}>
                                    {symbol.freq_pmf_ratio.toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                      className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all"
                                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-6 py-4">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, symbolsData.total)} of {symbolsData.total.toLocaleString()} symbols
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        Page {page + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
