import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Eye,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  CheckSquare,
  Square,
  Database,
} from 'lucide-react'
import { apiClient } from '../lib/api'

interface Session {
  session_id: string
  node_name?: string
  user_id?: string
  created_at?: string | null
  last_active?: string | null
  status?: string
  source?: string
  redis_key?: string
  session_reference?: string
  [key: string]: any
}

export default function SessionsBrowser() {
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const pageSize = 20
  const queryClient = useQueryClient()

  // Fetch Redis session list
  const { data: redisData, isLoading, error, refetch } = useQuery({
    queryKey: ['sessions', page],
    queryFn: () => apiClient.listSessions(page * pageSize, pageSize),
    refetchInterval: 10000,
  })

  // Delete session mutation
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (sessionIds: string[]) => apiClient.bulkDeleteSessions(sessionIds),
    onSuccess: () => {
      setSelectedSessions(new Set())
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: () => apiClient.cleanupExpiredSessionKeys(),
    onSuccess: (result) => {
      alert(`Cleaned up ${result.cleaned_count} expired session keys`)
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const sessions: Session[] = redisData?.sessions || []
  const total = redisData?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  // Filter sessions based on search term
  const filteredSessions = sessions.filter((session) =>
    session.session_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (session.node_name && session.node_name.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleDelete = async (sessionId: string) => {
    if (window.confirm(`Are you sure you want to delete session ${sessionId}?`)) {
      await deleteMutation.mutateAsync(sessionId)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedSessions.size === 0) return
    if (window.confirm(`Are you sure you want to delete ${selectedSessions.size} sessions?`)) {
      await bulkDeleteMutation.mutateAsync(Array.from(selectedSessions))
    }
  }

  const handleCleanup = async () => {
    if (window.confirm('Clean up all expired session keys from Redis? This cannot be undone.')) {
      await cleanupMutation.mutateAsync()
    }
  }

  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions)
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId)
    } else {
      newSelected.add(sessionId)
    }
    setSelectedSessions(newSelected)
  }

  const toggleAllSessions = () => {
    if (selectedSessions.size === filteredSessions.length) {
      setSelectedSessions(new Set())
    } else {
      setSelectedSessions(new Set(filteredSessions.map(s => s.session_id)))
    }
  }

  return (
    <div>
      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mb-6">
        {selectedSessions.size > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete {selectedSessions.size}
          </button>
        )}
        <button
          onClick={handleCleanup}
          disabled={cleanupMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Database className="w-4 h-4" />
          Cleanup Expired
        </button>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Session Keys</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {isLoading ? '...' : total}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Current Page</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {page + 1} / {totalPages || 1}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 dark:text-gray-400">Filtered Results</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {isLoading ? '...' : filteredSessions.length}
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
              Diagnostic View
            </h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Shows raw Redis session keys, which may include stale entries from test runs.
              Use "Cleanup Expired" to remove stale keys.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by session ID or node name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-semibold">Error Loading Sessions</h3>
            <p className="text-red-600 dark:text-red-300 text-sm mt-1">
              {error instanceof Error ? error.message : 'Failed to load sessions'}
            </p>
          </div>
        </div>
      )}

      {/* Sessions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Loading sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {searchTerm ? 'No sessions found matching your search' : 'No sessions available'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={toggleAllSessions}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100"
                      title={selectedSessions.size === filteredSessions.length ? "Deselect all" : "Select all"}
                    >
                      {selectedSessions.size === filteredSessions.length && filteredSessions.length > 0 ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Node Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Session Reference
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredSessions.map((session) => (
                  <tr key={session.session_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleSessionSelection(session.session_id)}
                        className="text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100"
                      >
                        {selectedSessions.has(session.session_id) ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                        {session.node_name || session.session_id}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        session.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {session.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                        {session.session_reference?.substring(0, 40) || 'N/A'}...
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/sessions/${session.session_id}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(session.session_id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete Session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
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
  )
}
