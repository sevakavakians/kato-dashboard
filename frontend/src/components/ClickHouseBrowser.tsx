import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Database,
  Table,
  Play,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  Layers,
} from 'lucide-react'
import { apiClient } from '../lib/api'

type Mode = 'browser' | 'query'

interface TableInfo {
  name: string
  engine: string
  total_rows: number | null
  total_bytes: number | null
}

interface ColumnInfo {
  name: string
  type: string
  default_kind: string
  default_expression: string
  comment: string
}

interface QueryResult {
  columns: string[]
  types: string[]
  rows: any[][]
  row_count: number
  elapsed_ms: number
}

export default function ClickHouseBrowser() {
  const [mode, setMode] = useState<Mode>('browser')

  // Browser mode state
  const [selectedDb, setSelectedDb] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [showSchema, setShowSchema] = useState(true)
  const [pageSize, setPageSize] = useState(50)
  const [currentOffset, setCurrentOffset] = useState(0)

  // Query mode state
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryRunning, setQueryRunning] = useState(false)

  // Fetch databases
  const { data: dbData, isLoading: dbLoading } = useQuery({
    queryKey: ['ch-databases'],
    queryFn: () => apiClient.getClickHouseDatabases(),
  })
  const databases: string[] = dbData?.databases || []

  // Fetch tables for selected database
  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['ch-tables', selectedDb],
    queryFn: () => apiClient.getClickHouseTables(selectedDb!),
    enabled: !!selectedDb,
  })
  const tables: TableInfo[] = tablesData?.tables || []

  // Fetch schema for selected table
  const { data: schemaData, isLoading: schemaLoading } = useQuery({
    queryKey: ['ch-schema', selectedDb, selectedTable],
    queryFn: () => apiClient.getClickHouseTableSchema(selectedDb!, selectedTable!),
    enabled: !!selectedDb && !!selectedTable,
  })
  const columns: ColumnInfo[] = schemaData?.columns || []

  // Fetch table data
  const { data: tableData, isLoading: dataLoading } = useQuery<QueryResult>({
    queryKey: ['ch-data', selectedDb, selectedTable, pageSize, currentOffset],
    queryFn: () => apiClient.getClickHouseTableData(selectedDb!, selectedTable!, pageSize, currentOffset),
    enabled: !!selectedDb && !!selectedTable,
  })

  // Fetch row count
  const { data: countData } = useQuery({
    queryKey: ['ch-count', selectedDb, selectedTable],
    queryFn: () => apiClient.getClickHouseTableRowCount(selectedDb!, selectedTable!),
    enabled: !!selectedDb && !!selectedTable,
  })
  const totalRows = countData?.count ?? 0

  const handleDbSelect = (db: string) => {
    setSelectedDb(db)
    setSelectedTable(null)
    setCurrentOffset(0)
  }

  const handleTableSelect = (table: string) => {
    setSelectedTable(table)
    setCurrentOffset(0)
  }

  const handleRunQuery = async () => {
    if (!queryText.trim()) return
    setQueryRunning(true)
    setQueryError(null)
    setQueryResult(null)

    try {
      const result = await apiClient.executeClickHouseQuery(queryText, 100, 0)
      setQueryResult(result)
    } catch (err: any) {
      setQueryError(err?.response?.data?.detail || err?.message || 'Query failed')
    } finally {
      setQueryRunning(false)
    }
  }

  const formatBytes = (bytes: number | null) => {
    if (bytes === null || bytes === undefined) return 'N/A'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatNumber = (num: number | null) => {
    if (num === null || num === undefined) return 'N/A'
    return new Intl.NumberFormat().format(num)
  }

  const totalPages = Math.ceil(totalRows / pageSize)
  const currentPage = Math.floor(currentOffset / pageSize) + 1

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center gap-4">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setMode('browser')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              mode === 'browser'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            Table Browser
          </button>
          <button
            onClick={() => setMode('query')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              mode === 'query'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Query Editor
          </button>
        </div>
      </div>

      {mode === 'browser' ? (
        /* ===== TABLE BROWSER MODE ===== */
        <div className="space-y-4">
          {/* Database & Table Selection */}
          <div className="flex gap-4">
            {/* Database Dropdown */}
            <div className="w-64">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Database
              </label>
              <select
                value={selectedDb || ''}
                onChange={(e) => handleDbSelect(e.target.value)}
                disabled={dbLoading}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select database...</option>
                {databases.map((db) => (
                  <option key={db} value={db}>{db}</option>
                ))}
              </select>
            </div>

            {/* Table Dropdown */}
            <div className="w-64">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Table
              </label>
              <select
                value={selectedTable || ''}
                onChange={(e) => handleTableSelect(e.target.value)}
                disabled={!selectedDb || tablesLoading}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select table...</option>
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({formatNumber(t.total_rows)} rows)
                  </option>
                ))}
              </select>
            </div>

            {/* Row Count Badge */}
            {selectedTable && totalRows > 0 && (
              <div className="flex items-end pb-1">
                <span className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-lg text-sm font-medium">
                  {formatNumber(totalRows)} total rows
                </span>
              </div>
            )}
          </div>

          {/* Table List (when database is selected but no table yet) */}
          {selectedDb && !selectedTable && !tablesLoading && tables.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Table className="w-5 h-5" />
                  Tables in {selectedDb}
                </h3>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {tables.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => handleTableSelect(t.name)}
                    className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">{t.name}</span>
                      <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                        {t.engine}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex gap-4">
                      <span>{formatNumber(t.total_rows)} rows</span>
                      <span>{formatBytes(t.total_bytes)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Schema (collapsible) */}
          {selectedTable && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <button
                onClick={() => setShowSchema(!showSchema)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Schema — {selectedDb}.{selectedTable}
                  <span className="text-gray-500 font-normal">({columns.length} columns)</span>
                </h3>
                {showSchema ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {showSchema && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {schemaLoading ? (
                    <div className="p-4 text-center">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-900">
                            <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">Column</th>
                            <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">Type</th>
                            <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">Default</th>
                            <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">Comment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {columns.map((col) => (
                            <tr key={col.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-2 font-mono text-gray-900 dark:text-white">{col.name}</td>
                              <td className="px-4 py-2 text-blue-600 dark:text-blue-400 font-mono">{col.type}</td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                {col.default_kind ? `${col.default_kind}: ${col.default_expression}` : '-'}
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{col.comment || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data Table */}
          {selectedTable && (
            <DataTable
              result={tableData || null}
              loading={dataLoading}
              pagination={{
                currentPage,
                totalPages,
                pageSize,
                totalRows,
                onPageSizeChange: (size) => { setPageSize(size); setCurrentOffset(0) },
                onPrevPage: () => setCurrentOffset(Math.max(0, currentOffset - pageSize)),
                onNextPage: () => setCurrentOffset(currentOffset + pageSize),
              }}
            />
          )}

          {/* Empty state */}
          {!selectedDb && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <Database className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                ClickHouse Browser
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Select a database and table to browse data, or switch to the Query Editor
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ===== QUERY EDITOR MODE ===== */
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SQL Query (SELECT only)
              </label>
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    handleRunQuery()
                  }
                }}
                placeholder="SELECT * FROM kato.patterns_data LIMIT 10"
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Press Cmd+Enter / Ctrl+Enter to run
                </p>
                <button
                  onClick={handleRunQuery}
                  disabled={queryRunning || !queryText.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  {queryRunning ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Run Query
                </button>
              </div>
            </div>
          </div>

          {/* Query Error */}
          {queryError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Query Error</h4>
                  <pre className="text-sm text-red-700 dark:text-red-400 mt-1 whitespace-pre-wrap font-mono">
                    {queryError}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Query Results */}
          {queryResult && (
            <DataTable result={queryResult} loading={false} />
          )}

          {/* Empty state */}
          {!queryResult && !queryError && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <Terminal className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Query Editor
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Write a SELECT query and press Run to see results
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ===== Shared Data Table Component ===== */

interface PaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  totalRows: number
  onPageSizeChange: (size: number) => void
  onPrevPage: () => void
  onNextPage: () => void
}

function DataTable({
  result,
  loading,
  pagination,
}: {
  result: QueryResult | null
  loading: boolean
  pagination?: PaginationProps
}) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-2">Loading data...</p>
      </div>
    )
  }

  if (!result || result.rows.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <AlertCircle className="w-8 h-8 mx-auto text-gray-400" />
        <p className="text-gray-500 mt-2">No data</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      {/* Header with stats and pagination */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {result.row_count} rows
          {result.elapsed_ms !== undefined && (
            <span className="ml-2 text-gray-400">({result.elapsed_ms}ms)</span>
          )}
        </div>
        {pagination && (
          <div className="flex items-center gap-3">
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {pagination.currentPage} of {pagination.totalPages || 1}
            </span>
            <div className="flex gap-1">
              <button
                onClick={pagination.onPrevPage}
                disabled={pagination.currentPage <= 1}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                onClick={pagination.onNextPage}
                disabled={pagination.currentPage >= pagination.totalPages}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-gray-50 dark:bg-gray-900">
              <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium text-xs w-12">#</th>
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap"
                >
                  <div>{col}</div>
                  {result.types?.[i] && (
                    <div className="text-xs font-normal text-gray-400 dark:text-gray-500">{result.types[i]}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {result.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-3 py-2 text-gray-400 text-xs">
                  {pagination ? pagination.pageSize * (pagination.currentPage - 1) + rowIdx + 1 : rowIdx + 1}
                </td>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-3 py-2 text-gray-900 dark:text-white font-mono text-xs max-w-xs truncate">
                    {cell === null ? (
                      <span className="text-gray-400 italic">NULL</span>
                    ) : typeof cell === 'string' && cell.length > 100 ? (
                      <span title={cell}>{cell.slice(0, 100)}...</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
