import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api'
import type { UnifiedKB } from '../types/knowledgebase'

export function useUnifiedKBList() {
  const { data: patternsData, isLoading: patternsLoading } = useQuery({
    queryKey: ['hybridProcessors'],
    queryFn: () => apiClient.getHybridProcessors(),
    refetchInterval: 30000,
  })

  const { data: symbolsData, isLoading: symbolsLoading } = useQuery({
    queryKey: ['symbolProcessors'],
    queryFn: () => apiClient.getSymbolProcessors(),
    refetchInterval: 30000,
  })

  const { data: qdrantData, isLoading: qdrantLoading } = useQuery({
    queryKey: ['qdrantProcessorCollections'],
    queryFn: () => apiClient.getQdrantProcessorCollections(),
    refetchInterval: 30000,
  })

  const knowledgebases = useMemo<UnifiedKB[]>(() => {
    const kbMap = new Map<string, UnifiedKB>()

    // Patterns (primary source)
    const processors = patternsData?.processors || []
    for (const p of processors) {
      const kbId = p.kb_id || p.processor_id
      kbMap.set(kbId, {
        kb_id: kbId,
        patterns_count: p.patterns_count || 0,
        symbols_count: 0,
        vectors_count: 0,
        vectors_collection_name: null,
      })
    }

    // Symbols
    const symbolProcessors = symbolsData?.processors || []
    for (const s of symbolProcessors) {
      const kbId = s.kb_id || s.processor_id
      const existing = kbMap.get(kbId)
      if (existing) {
        existing.symbols_count = s.symbols_count || 0
      } else {
        kbMap.set(kbId, {
          kb_id: kbId,
          patterns_count: 0,
          symbols_count: s.symbols_count || 0,
          vectors_count: 0,
          vectors_collection_name: null,
        })
      }
    }

    // Qdrant collections
    const collections = qdrantData?.collections || []
    for (const c of collections) {
      // Use processor_id if available, otherwise parse from collection name
      const kbId = c.processor_id || c.name?.replace(/^vectors_/, '')
      if (!kbId) continue

      const existing = kbMap.get(kbId)
      if (existing) {
        existing.vectors_count = c.vectors_count || 0
        existing.vectors_collection_name = c.name
      } else {
        kbMap.set(kbId, {
          kb_id: kbId,
          patterns_count: 0,
          symbols_count: 0,
          vectors_count: c.vectors_count || 0,
          vectors_collection_name: c.name,
        })
      }
    }

    return Array.from(kbMap.values()).sort((a, b) => a.kb_id.localeCompare(b.kb_id))
  }, [patternsData, symbolsData, qdrantData])

  return {
    knowledgebases,
    isLoading: patternsLoading && symbolsLoading && qdrantLoading,
    isPatternsLoading: patternsLoading,
  }
}
