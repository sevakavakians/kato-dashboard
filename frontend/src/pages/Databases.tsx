import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { apiClient } from '../lib/api'
import { useUnifiedKBList } from '../hooks/useUnifiedKBList'
import KnowledgebaseSidebar from '../components/KnowledgebaseSidebar'
import PatternsPanel from '../components/PatternsPanel'
import SymbolsBrowser from '../components/SymbolsBrowser'
import VectorsPanel from '../components/VectorsPanel'

type SubTab = 'patterns' | 'symbols' | 'vectors'

export default function Knowledgebases() {
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [selectedSubTab, setSelectedSubTab] = useState<SubTab>('patterns')
  const [selectedKbs, setSelectedKbs] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { knowledgebases, isLoading } = useUnifiedKBList()

  const selectedKb = knowledgebases.find(kb => kb.kb_id === selectedKbId)

  const deleteKnowledgebaseMutation = useMutation({
    mutationFn: (kbId: string) => apiClient.deleteKnowledgebase(kbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hybridProcessors'] })
      queryClient.invalidateQueries({ queryKey: ['hybridPatterns'] })
      queryClient.invalidateQueries({ queryKey: ['hybridProcessorStats'] })
      queryClient.invalidateQueries({ queryKey: ['symbolProcessors'] })
      queryClient.invalidateQueries({ queryKey: ['qdrantProcessorCollections'] })
    },
    onError: (error: any) => {
      alert(`Failed to delete knowledgebase: ${error.response?.data?.detail || error.message}`)
    },
  })

  const handleSelectKb = (kbId: string) => {
    setSelectedKbId(kbId)
    setSelectedSubTab('patterns')
  }

  const handleToggleKb = (kbId: string) => {
    const newSelected = new Set(selectedKbs)
    if (newSelected.has(kbId)) {
      newSelected.delete(kbId)
    } else {
      newSelected.add(kbId)
    }
    setSelectedKbs(newSelected)
  }

  const handleToggleAll = () => {
    if (selectedKbs.size === knowledgebases.length) {
      setSelectedKbs(new Set())
    } else {
      setSelectedKbs(new Set(knowledgebases.map(kb => kb.kb_id)))
    }
  }

  const handleDeleteKb = async (kbId: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const kb = knowledgebases.find(k => k.kb_id === kbId)
    const patternCount = kb?.patterns_count || 0

    const firstConfirm = window.confirm(
      `Warning: This will permanently delete the entire knowledgebase!\n\n` +
      `Knowledgebase: ${kbId}\n` +
      `Patterns to delete: ${patternCount.toLocaleString()}\n\n` +
      `This will delete:\n` +
      `- All patterns from ClickHouse\n` +
      `- All associated Redis metadata\n\n` +
      `Are you sure you want to continue?`
    )

    if (!firstConfirm) return

    const finalConfirm = window.confirm(
      `FINAL CONFIRMATION\n\n` +
      `This will permanently delete knowledgebase "${kbId}" and cannot be undone.\n\n` +
      `Click OK to delete, or Cancel to abort.`
    )

    if (finalConfirm) {
      try {
        const data = await deleteKnowledgebaseMutation.mutateAsync(kbId)
        if (selectedKbId === kbId) {
          setSelectedKbId(null)
        }
        alert(
          `Successfully deleted knowledgebase:\n` +
          `- ${data.clickhouse_deleted} patterns from ClickHouse\n` +
          `- ${data.redis_keys_deleted} Redis keys`
        )
      } catch (_error) {
        // Error alert handled by mutation's onError
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedKbs.size === 0) return

    const selectedKbList = Array.from(selectedKbs)
    const totalPatterns = selectedKbList.reduce((sum, kbId) => {
      const kb = knowledgebases.find(k => k.kb_id === kbId)
      return sum + (kb?.patterns_count || 0)
    }, 0)

    const firstConfirm = window.confirm(
      `DANGER: You are about to delete ${selectedKbs.size} knowledgebase(s)!\n\n` +
      `Knowledgebases:\n${selectedKbList.map(kb => `  - ${kb}`).join('\n')}\n\n` +
      `Total patterns to delete: ${totalPatterns.toLocaleString()}\n\n` +
      `This will permanently remove ALL data from ClickHouse and Redis.\n\n` +
      `Are you sure you want to continue?`
    )

    if (!firstConfirm) return

    const finalConfirm = window.confirm(
      `FINAL CONFIRMATION\n\n` +
      `This will permanently delete ${selectedKbs.size} knowledgebase(s) and ${totalPatterns.toLocaleString()} pattern(s).\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Click OK to proceed with deletion, or Cancel to abort.`
    )

    if (!finalConfirm) return

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

    setSelectedKbs(new Set())
    if (selectedKbId && selectedKbList.includes(selectedKbId)) {
      setSelectedKbId(null)
    }

    let message = `Successfully deleted ${results.successful.length} knowledgebase(s)`
    if (results.failed.length > 0) {
      message += `\n\nFailed to delete ${results.failed.length} knowledgebase(s):\n`
      results.failed.forEach(f => {
        message += `\n- ${f.name}: ${f.error}`
      })
    }
    alert(message)
  }

  const subTabs: { key: SubTab; label: string; count?: number }[] = [
    { key: 'patterns', label: 'Patterns', count: selectedKb?.patterns_count },
    { key: 'symbols', label: 'Symbols', count: selectedKb?.symbols_count },
    { key: 'vectors', label: 'Vectors', count: selectedKb?.vectors_count },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Knowledgebases
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Browse and manage cognitive processor knowledgebases
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <KnowledgebaseSidebar
            knowledgebases={knowledgebases}
            isLoading={isLoading}
            selectedKbId={selectedKbId}
            onSelectKb={handleSelectKb}
            selectedKbs={selectedKbs}
            onToggleKb={handleToggleKb}
            onToggleAll={handleToggleAll}
            onDeleteKb={handleDeleteKb}
            onBulkDelete={handleBulkDelete}
            isDeleting={deleteKnowledgebaseMutation.isPending}
          />
        </div>

        {/* Content Panel */}
        <div className="lg:col-span-2">
          {!selectedKbId ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                Select a knowledgebase to view its data
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Sub-tabs */}
              <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                {subTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setSelectedSubTab(tab.key)}
                    className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
                      selectedSubTab === tab.key
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        selectedSubTab === tab.key
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {tab.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {selectedSubTab === 'patterns' && (
                <PatternsPanel kbId={selectedKbId} />
              )}
              {selectedSubTab === 'symbols' && (
                <SymbolsBrowser kbId={selectedKbId} />
              )}
              {selectedSubTab === 'vectors' && (
                <VectorsPanel
                  kbId={selectedKbId}
                  collectionName={selectedKb?.vectors_collection_name || null}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
