import { Database, ChevronRight, Trash2, CheckSquare, Square, Trash } from 'lucide-react'
import type { UnifiedKB } from '../types/knowledgebase'

interface KnowledgebaseSidebarProps {
  knowledgebases: UnifiedKB[]
  isLoading: boolean
  selectedKbId: string | null
  onSelectKb: (kbId: string) => void
  selectedKbs: Set<string>
  onToggleKb: (kbId: string) => void
  onToggleAll: () => void
  onDeleteKb: (kbId: string, event: React.MouseEvent) => void
  onBulkDelete: () => void
  isDeleting: boolean
}

export default function KnowledgebaseSidebar({
  knowledgebases,
  isLoading,
  selectedKbId,
  onSelectKb,
  selectedKbs,
  onToggleKb,
  onToggleAll,
  onDeleteKb,
  onBulkDelete,
  isDeleting,
}: KnowledgebaseSidebarProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Database className="w-5 h-5" />
          Knowledgebases
        </h2>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          Loading knowledgebases...
        </div>
      ) : knowledgebases.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No knowledgebases found
        </div>
      ) : (
        <>
          {/* Bulk Actions Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={onToggleAll}
                  className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {selectedKbs.size === knowledgebases.length && knowledgebases.length > 0 ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedKbs.size === knowledgebases.length && knowledgebases.length > 0
                    ? 'Deselect All'
                    : 'Select All'}
                </span>
              </div>
              {selectedKbs.size > 0 && (
                <button
                  onClick={onBulkDelete}
                  disabled={isDeleting}
                  className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash className="w-3 h-3" />
                  Delete ({selectedKbs.size})
                </button>
              )}
            </div>
          </div>

          {/* KB List */}
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {knowledgebases.map((kb) => (
              <div
                key={kb.kb_id}
                className={`group relative flex items-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedKbId === kb.kb_id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                    : ''
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleKb(kb.kb_id)
                  }}
                  className="p-4 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
                >
                  {selectedKbs.has(kb.kb_id) ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>

                {/* KB Info */}
                <button
                  onClick={() => onSelectKb(kb.kb_id)}
                  className="flex-1 p-4 pl-0 text-left flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {kb.kb_id}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {kb.patterns_count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {kb.patterns_count.toLocaleString()} patterns
                        </span>
                      )}
                      {kb.symbols_count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          {kb.symbols_count.toLocaleString()} symbols
                        </span>
                      )}
                      {kb.vectors_count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          {kb.vectors_count.toLocaleString()} vectors
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
                </button>

                {/* Delete Button */}
                <button
                  onClick={(e) => onDeleteKb(kb.kb_id, e)}
                  disabled={isDeleting}
                  className="p-4 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Delete knowledgebase"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
