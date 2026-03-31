export interface Pattern {
  _id: string
  name: string
  pattern_data?: any[]
  frequency: number
  length?: number
  emotives?: any
  metadata?: {
    [key: string]: any
  }
  has_emotives?: boolean
  has_metadata?: boolean
  [key: string]: any
}

export interface ProcessorData {
  processor_id: string
  kb_id?: string
  name?: string
  patterns_count?: number
}

export interface QdrantCollection {
  name: string
  vectors_count?: number
  vector_size?: number
  distance?: string
  status?: string
  processor_id?: string
}

export interface QdrantPoint {
  id: string
  payload?: any
  vector?: number[]
}

export interface RedisKeyInfo {
  key: string
  type: string
  ttl: number
  value: any
  size?: number
}

export interface UnifiedKB {
  kb_id: string
  patterns_count: number
  symbols_count: number
  vectors_count: number
  vectors_collection_name: string | null
}
