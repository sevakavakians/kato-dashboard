/**
 * WebSocket client for real-time updates
 */

const WS_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('http', 'ws') + '/ws'
  : 'ws://localhost:8080/ws'

export type WebSocketMessage = {
  type: 'metrics_update' | 'heartbeat'
  timestamp: string
  data?: any
}

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type WebSocketCallback = (message: WebSocketMessage) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private callbacks: Set<WebSocketCallback> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000 // Start with 1 second
  private maxReconnectDelay = 30000 // Max 30 seconds
  private reconnectTimeout: number | null = null
  private heartbeatInterval: number | null = null
  private status: WebSocketStatus = 'disconnected'
  private statusCallbacks: Set<(status: WebSocketStatus) => void> = new Set()
  private shouldReconnect = true

  constructor(url: string = WS_URL) {
    this.url = url
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connected or connecting')
      return
    }

    this.updateStatus('connecting')
    console.log(`Connecting to WebSocket: ${this.url}`)

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.updateStatus('connected')
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.updateStatus('error')
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.updateStatus('disconnected')
        this.stopHeartbeat()
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      this.updateStatus('error')
      this.attemptReconnect()
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false
    this.stopHeartbeat()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.updateStatus('disconnected')
  }

  /**
   * Send a message to the server
   */
  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      console.warn('WebSocket not connected, cannot send message')
    }
  }

  /**
   * Subscribe to WebSocket messages
   */
  subscribe(callback: WebSocketCallback): () => void {
    this.callbacks.add(callback)

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback)
    }
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: WebSocketStatus) => void): () => void {
    this.statusCallbacks.add(callback)

    // Call immediately with current status
    callback(this.status)

    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback)
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): WebSocketStatus {
    return this.status
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WebSocketMessage): void {
    // Don't log heartbeat messages to reduce noise
    if (message.type !== 'heartbeat') {
      console.log('WebSocket message received:', message.type)
    }

    // Notify all subscribers
    this.callbacks.forEach((callback) => {
      try {
        callback(message)
      } catch (error) {
        console.error('Error in WebSocket callback:', error)
      }
    })
  }

  /**
   * Update connection status and notify listeners
   */
  private updateStatus(status: WebSocketStatus): void {
    if (this.status !== status) {
      this.status = status
      this.statusCallbacks.forEach((callback) => {
        try {
          callback(status)
        } catch (error) {
          console.error('Error in status callback:', error)
        }
      })
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping')
      }
    }, 30000) // Send ping every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (!this.shouldReconnect) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      this.updateStatus('error')
      return
    }

    this.reconnectAttempts++
    console.log(
      `Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    )

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)

    // Exponential backoff: double the delay, up to max
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }
}

// Global WebSocket client instance
let globalClient: WebSocketClient | null = null

/**
 * Get or create the global WebSocket client
 */
export function getWebSocketClient(): WebSocketClient {
  if (!globalClient) {
    globalClient = new WebSocketClient()
  }
  return globalClient
}

/**
 * Initialize and connect the global WebSocket client
 */
export function initWebSocket(): WebSocketClient {
  const client = getWebSocketClient()
  client.connect()
  return client
}

/**
 * Disconnect and cleanup the global WebSocket client
 */
export function cleanupWebSocket(): void {
  if (globalClient) {
    globalClient.disconnect()
    globalClient = null
  }
}
