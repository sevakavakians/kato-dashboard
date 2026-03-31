import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, AlertCircle, RefreshCw, Edit, Save, X } from 'lucide-react'
import { apiClient } from '../lib/api'
import type { Pattern } from '../types/knowledgebase'

interface PatternDetailModalProps {
  pattern: Pattern
  onClose: () => void
  onDelete: (patternName: string) => void
  processorId: string
}

export default function PatternDetailModal({ pattern, onClose, onDelete, processorId }: PatternDetailModalProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedFrequency, setEditedFrequency] = useState<string>('')
  const [editedEmotives, setEditedEmotives] = useState<string>('')
  const [editedMetadata, setEditedMetadata] = useState<string>('')

  const { data: fullPattern, isLoading, error, refetch } = useQuery({
    queryKey: ['hybridPatternDetail', processorId, pattern.name],
    queryFn: () => apiClient.getHybridPatternDetail(processorId, pattern.name),
  })

  const displayPattern = fullPattern || pattern

  const updateMutation = useMutation({
    mutationFn: async (updates: { frequency?: number; emotives?: any; metadata?: any }) => {
      return await apiClient.updateHybridPattern(processorId, pattern.name, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hybridPatternDetail', processorId, pattern.name] })
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns', processorId] })
      setIsEditing(false)
      alert('Pattern updated successfully!')
    },
    onError: (error: any) => {
      alert(`Failed to update pattern: ${error.response?.data?.detail || error.message}`)
    },
  })

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
                  {displayPattern.emotives && Object.keys(displayPattern.emotives).length > 0 ? (
                    <pre className="text-xs text-gray-900 dark:text-white overflow-auto">
                      {JSON.stringify(displayPattern.emotives, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No emotives set
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Metadata */}
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
                  {displayPattern.metadata && Object.keys(displayPattern.metadata).length > 0 ? (
                    <pre className="text-xs text-gray-900 dark:text-white">
                      {JSON.stringify(displayPattern.metadata, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No metadata set
                    </p>
                  )}
                </div>
              )}
            </div>
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
