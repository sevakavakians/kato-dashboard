import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2, RefreshCw, AlertCircle, Clock, User, Activity } from 'lucide-react'
import { apiClient } from '../lib/api'

interface SessionData {
  session_id: string
  user_id?: string
  created_at: string
  last_active: string
  status?: string
  [key: string]: any
}

interface STMData {
  messages?: any[]
  context?: any
  [key: string]: any
}

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Fetch session details
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery<SessionData>({
    queryKey: ['session', sessionId],
    queryFn: () => apiClient.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 10000,
  })

  // Fetch session STM
  const { data: stm, isLoading: stmLoading, error: stmError } = useQuery<STMData>({
    queryKey: ['sessionSTM', sessionId],
    queryFn: () => apiClient.getSessionSTM(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 10000,
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      navigate('/sessions')
    },
  })

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete session ${sessionId}?`)) {
      await deleteMutation.mutateAsync(sessionId!)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const getTimeSince = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffDays > 0) return `${diffDays} days`
      if (diffHours > 0) return `${diffHours} hours`
      if (diffMins > 0) return `${diffMins} minutes`
      return 'less than a minute'
    } catch {
      return 'Unknown'
    }
  }

  const isLoading = sessionLoading || stmLoading
  const error = sessionError || stmError

  if (error) {
    return (
      <div>
        <Link to="/sessions" className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sessions
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-semibold text-lg">Error Loading Session</h3>
            <p className="text-red-600 dark:text-red-300 mt-1">
              {error instanceof Error ? error.message : 'Failed to load session details'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/sessions" className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sessions
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Session Details
            </h1>
            {session && (
              <code className="text-sm text-gray-600 dark:text-gray-400 mt-2 block font-mono">
                {session.session_id}
              </code>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
                queryClient.invalidateQueries({ queryKey: ['sessionSTM', sessionId] })
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading session details...
        </div>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <div className="flex items-center gap-3 mb-2">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">User ID</h3>
              </div>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {session?.user_id || <span className="text-gray-400">N/A</span>}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Created</h3>
              </div>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {session?.created_at ? formatDate(session.created_at) : 'Unknown'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {session?.created_at && `${getTimeSince(session.created_at)} ago`}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Last Active</h3>
              </div>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {session?.last_active ? formatDate(session.last_active) : 'Unknown'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {session?.last_active && `${getTimeSince(session.last_active)} ago`}
              </p>
            </div>
          </div>

          {/* Session Data */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Session Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Session Information
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    session?.status === 'active'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {session?.status || 'active'}
                  </span>
                </div>
                {session && Object.entries(session).map(([key, value]) => {
                  if (['session_id', 'user_id', 'created_at', 'last_active', 'status'].includes(key)) {
                    return null
                  }
                  return (
                    <div key={key} className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white text-right max-w-md truncate">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Short-Term Memory */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Short-Term Memory (STM)
              </h2>
              {stmError ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  Error loading STM: {(stmError as Error).message || String(stmError) || 'Unknown error'}
                </div>
              ) : !stm || Object.keys(stm).length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No STM data available</p>
              ) : (
                <div className="space-y-4">
                  {stm.messages && Array.isArray(stm.messages) && stm.messages.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Messages ({stm.messages.length})
                      </h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {stm.messages.slice(-5).map((msg: any, idx: number) => (
                          <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded p-3 text-sm">
                            <div className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                              {msg.role || 'Unknown'}
                            </div>
                            <div className="text-gray-900 dark:text-white">
                              {msg.content || JSON.stringify(msg)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.entries(stm).map(([key, value]) => {
                    if (key === 'messages') return null
                    return (
                      <div key={key}>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 capitalize">
                          {key.replace(/_/g, ' ')}
                        </h3>
                        <pre className="bg-gray-50 dark:bg-gray-700 rounded p-3 text-xs overflow-x-auto">
                          <code className="text-gray-900 dark:text-white">
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </code>
                        </pre>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Raw Data */}
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Raw Session Data
            </h2>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded p-4 overflow-x-auto text-xs">
              <code className="text-gray-900 dark:text-white">
                {JSON.stringify(session, null, 2)}
              </code>
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
