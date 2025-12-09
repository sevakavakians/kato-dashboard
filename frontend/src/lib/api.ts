/**
 * API Client for KATO Dashboard Backend
 */
import axios, { AxiosInstance } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

class APIClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/api/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          console.error('API Error:', error.response.data)
        } else if (error.request) {
          console.error('Network Error:', error.message)
        }
        return Promise.reject(error)
      }
    )
  }

  // System & Health
  async getHealth() {
    const { data } = await this.client.get('/health')
    return data
  }

  async getKatoHealth() {
    const { data } = await this.client.get('/system/kato-health')
    return data
  }

  async getSystemMetrics(useCache = true) {
    const { data } = await this.client.get('/system/metrics', {
      params: { use_cache: useCache },
    })
    return data
  }

  async getSystemStats(minutes = 10, useCache = true) {
    const { data } = await this.client.get('/system/stats', {
      params: { minutes, use_cache: useCache },
    })
    return data
  }

  async getCacheStats() {
    const { data} = await this.client.get('/system/cache-stats')
    return data
  }

  async getConnectionPools() {
    const { data } = await this.client.get('/system/connection-pools')
    return data
  }

  async getDistributedSTMStats() {
    const { data } = await this.client.get('/system/distributed-stm')
    return data
  }

  async getContainerStats(useCache = true) {
    const { data } = await this.client.get('/system/container-stats', {
      params: { use_cache: useCache },
    })
    return data
  }

  async getSingleContainerStats(containerName: string) {
    const { data } = await this.client.get(`/system/container-stats/${containerName}`)
    return data
  }

  // Sessions
  async getSessionsCount() {
    const { data } = await this.client.get('/sessions/count')
    return data
  }

  async listSessions(skip = 0, limit = 50, status?: string, search?: string) {
    const { data } = await this.client.get('/sessions', {
      params: { skip, limit, status, search },
    })
    return data
  }

  async getSession(sessionId: string) {
    const { data } = await this.client.get(`/sessions/${sessionId}`)
    return data
  }

  async getSessionSTM(sessionId: string) {
    const { data } = await this.client.get(`/sessions/${sessionId}/stm`)
    return data
  }

  async deleteSession(sessionId: string) {
    const { data } = await this.client.delete(`/sessions/${sessionId}`)
    return data
  }

  async bulkDeleteSessions(sessionIds: string[]) {
    const { data } = await this.client.post('/sessions/bulk-delete', {
      session_ids: sessionIds,
    })
    return data
  }

  async getSessionStatistics() {
    const { data } = await this.client.get('/sessions/statistics/overview')
    return data
  }

  async getRedisSessionKeys() {
    const { data } = await this.client.get('/sessions/redis-keys/diagnostic')
    return data
  }

  async cleanupExpiredSessionKeys() {
    const { data } = await this.client.post('/sessions/redis-keys/cleanup')
    return data
  }


  // Qdrant
  async getQdrantCollections() {
    const { data } = await this.client.get('/databases/qdrant/collections')
    return data
  }

  async getQdrantProcessorCollections() {
    const { data } = await this.client.get('/databases/qdrant/processors')
    return data
  }

  async getQdrantCollectionStats(collectionName: string) {
    const { data } = await this.client.get(
      `/databases/qdrant/collections/${collectionName}`
    )
    return data
  }

  async getQdrantPoints(
    collectionName: string,
    limit = 100,
    offset?: string,
    withVectors = false,
    withPayload = true
  ) {
    const { data } = await this.client.get(
      `/databases/qdrant/collections/${collectionName}/points`,
      {
        params: {
          limit,
          offset,
          with_vectors: withVectors,
          with_payload: withPayload,
        },
      }
    )
    return data
  }

  async getQdrantPoint(
    collectionName: string,
    pointId: string,
    withVectors = true,
    withPayload = true
  ) {
    const { data } = await this.client.get(
      `/databases/qdrant/collections/${collectionName}/points/${pointId}`,
      {
        params: {
          with_vectors: withVectors,
          with_payload: withPayload,
        },
      }
    )
    return data
  }

  async searchQdrantVectors(
    collectionName: string,
    queryVector: number[],
    limit = 10,
    scoreThreshold?: number
  ) {
    const { data } = await this.client.post(
      `/databases/qdrant/collections/${collectionName}/search`,
      {
        query_vector: queryVector,
        limit,
        score_threshold: scoreThreshold,
      }
    )
    return data
  }

  async findSimilarPoints(
    collectionName: string,
    pointId: string,
    limit = 10,
    scoreThreshold?: number
  ) {
    const { data } = await this.client.get(
      `/databases/qdrant/collections/${collectionName}/points/${pointId}/similar`,
      {
        params: {
          limit,
          score_threshold: scoreThreshold,
        },
      }
    )
    return data
  }

  async bulkDeleteQdrantPoints(collectionName: string, pointIds: string[]) {
    const { data } = await this.client.post(
      `/databases/qdrant/collections/${collectionName}/points/bulk-delete`,
      { point_ids: pointIds }
    )
    return data
  }

  async deleteQdrantCollection(collectionName: string) {
    const { data } = await this.client.delete(
      `/databases/qdrant/collections/${collectionName}`
    )
    return data
  }

  // Redis
  async getRedisInfo() {
    const { data } = await this.client.get('/databases/redis/info')
    return data
  }

  async listRedisKeys(pattern = '*', count = 100) {
    const { data } = await this.client.get('/databases/redis/keys', {
      params: { pattern, count },
    })
    return data
  }

  async getRedisKey(key: string) {
    const { data } = await this.client.get(`/databases/redis/keys/${encodeURIComponent(key)}`)
    return data
  }

  async getSessionKeys() {
    const { data } = await this.client.get('/databases/redis/sessions')
    return data
  }

  async flushRedisCache(pattern?: string) {
    const { data } = await this.client.post('/databases/redis/flush', null, {
      params: pattern ? { pattern } : undefined,
    })
    return data
  }

  // Analytics
  async getAnalyticsOverview() {
    const { data } = await this.client.get('/analytics/overview')
    return data
  }

  async getPatternFrequency(processorId?: string, limit = 20) {
    const { data } = await this.client.get('/analytics/patterns/frequency', {
      params: {
        processor_id: processorId,
        limit,
      },
    })
    return data
  }

  async getSessionDurationTrends(periodHours = 24) {
    const { data } = await this.client.get('/analytics/sessions/duration', {
      params: { period_hours: periodHours },
    })
    return data
  }

  async getSystemPerformanceTrends(periodMinutes = 60) {
    const { data } = await this.client.get('/analytics/system/performance', {
      params: { period_minutes: periodMinutes },
    })
    return data
  }

  async getDatabaseStatistics() {
    const { data } = await this.client.get('/analytics/database/statistics')
    return data
  }

  async getLoadPredictions() {
    const { data } = await this.client.get('/analytics/predictions/load')
    return data
  }

  async getComprehensiveAnalytics(
    patternLimit = 20,
    sessionPeriodHours = 24,
    performancePeriodMinutes = 60
  ) {
    const { data } = await this.client.get('/analytics/comprehensive', {
      params: {
        pattern_limit: patternLimit,
        session_period_hours: sessionPeriodHours,
        performance_period_minutes: performancePeriodMinutes,
      },
    })
    return data
  }

  // ========================================================================
  // Hybrid Pattern Endpoints (ClickHouse + Redis)
  // ========================================================================

  async getHybridProcessors() {
    const { data } = await this.client.get('/databases/patterns/processors')
    return data
  }

  async getHybridPatterns(
    kbId: string,
    skip = 0,
    limit = 100,
    sortBy = 'length',
    sortOrder = -1
  ) {
    const { data } = await this.client.get(
      `/databases/patterns/${kbId}/patterns`,
      {
        params: {
          skip,
          limit,
          sort_by: sortBy,
          sort_order: sortOrder,
        },
      }
    )
    return data
  }

  async getHybridPatternDetail(kbId: string, patternName: string) {
    const { data } = await this.client.get(
      `/databases/patterns/${kbId}/patterns/${patternName}`
    )
    return data
  }

  async getHybridPatternStatistics(kbId: string) {
    const { data } = await this.client.get(
      `/databases/patterns/${kbId}/statistics`
    )
    return data
  }

  async deleteHybridPattern(kbId: string, patternName: string) {
    const { data } = await this.client.delete(
      `/databases/patterns/${kbId}/patterns/${patternName}`
    )
    return data
  }

  async bulkDeleteHybridPatterns(kbId: string, patternNames: string[]) {
    const { data } = await this.client.post(
      `/databases/patterns/${kbId}/patterns/bulk-delete`,
      { pattern_names: patternNames }
    )
    return data
  }

  async deleteKnowledgebase(kbId: string) {
    const { data } = await this.client.delete(
      `/databases/patterns/${kbId}`
    )
    return data
  }

  async getHybridHealth() {
    const { data } = await this.client.get('/databases/hybrid/health')
    return data
  }

  // ========================================================================
  // Symbol Statistics Endpoints (Redis-backed symbols_kb)
  // ========================================================================

  async getSymbolProcessors() {
    const { data } = await this.client.get('/databases/symbols/processors')
    return data
  }

  async getSymbols(
    kbId: string,
    skip = 0,
    limit = 100,
    sortBy = 'frequency',
    sortOrder = -1,
    search?: string
  ) {
    const { data } = await this.client.get(
      `/databases/symbols/${kbId}`,
      {
        params: { skip, limit, sort_by: sortBy, sort_order: sortOrder, search }
      }
    )
    return data
  }

  async getSymbolStatistics(kbId: string) {
    const { data } = await this.client.get(`/databases/symbols/${kbId}/statistics`)
    return data
  }
}

export const apiClient = new APIClient()
export default apiClient
