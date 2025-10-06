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

  // Sessions
  async getSessionsCount() {
    const { data } = await this.client.get('/sessions/count')
    return data
  }

  async listSessions(skip = 0, limit = 50) {
    const { data } = await this.client.get('/sessions', {
      params: { skip, limit },
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

  // MongoDB
  async getProcessors() {
    const { data } = await this.client.get('/databases/mongodb/processors')
    return data
  }

  async getPatterns(
    processorId: string,
    skip = 0,
    limit = 100,
    sortBy = 'frequency',
    sortOrder = -1
  ) {
    const { data } = await this.client.get(
      `/databases/mongodb/${processorId}/patterns`,
      {
        params: { skip, limit, sort_by: sortBy, sort_order: sortOrder },
      }
    )
    return data
  }

  async getPattern(processorId: string, patternId: string) {
    const { data } = await this.client.get(
      `/databases/mongodb/${processorId}/patterns/${patternId}`
    )
    return data
  }

  async updatePattern(
    processorId: string,
    patternId: string,
    updates: Record<string, any>
  ) {
    const { data } = await this.client.put(
      `/databases/mongodb/${processorId}/patterns/${patternId}`,
      updates
    )
    return data
  }

  async deletePattern(processorId: string, patternId: string) {
    const { data } = await this.client.delete(
      `/databases/mongodb/${processorId}/patterns/${patternId}`
    )
    return data
  }

  async getPatternStatistics(processorId: string) {
    const { data } = await this.client.get(
      `/databases/mongodb/${processorId}/statistics`
    )
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
}

export const apiClient = new APIClient()
export default apiClient
