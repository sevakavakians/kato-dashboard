/**
 * Custom React hook for WebSocket connections
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getWebSocketClient,
  WebSocketMessage,
  WebSocketStatus,
  WebSocketCallback,
} from '../lib/websocket'

export interface UseWebSocketReturn {
  data: any
  status: WebSocketStatus
  isConnected: boolean
  sendMessage: (message: string) => void
  connect: () => void
  disconnect: () => void
}

/**
 * Hook to manage WebSocket connection and receive real-time updates
 *
 * @param autoConnect - Whether to automatically connect on mount (default: true)
 * @param onMessage - Optional callback for custom message handling
 * @returns WebSocket state and control functions
 */
export function useWebSocket(
  autoConnect: boolean = true,
  onMessage?: WebSocketCallback
): UseWebSocketReturn {
  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<WebSocketStatus>('disconnected')
  const clientRef = useRef(getWebSocketClient())
  const onMessageRef = useRef(onMessage)

  // Keep onMessage ref up to date
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Update data state for metrics updates
    if (message.type === 'metrics_update' && message.data) {
      setData(message.data)
    }

    // Call custom message handler if provided
    if (onMessageRef.current) {
      onMessageRef.current(message)
    }
  }, [])

  // Connect function
  const connect = useCallback(() => {
    clientRef.current.connect()
  }, [])

  // Disconnect function
  const disconnect = useCallback(() => {
    clientRef.current.disconnect()
  }, [])

  // Send message function
  const sendMessage = useCallback((message: string) => {
    clientRef.current.send(message)
  }, [])

  // Set up WebSocket subscriptions
  useEffect(() => {
    const client = clientRef.current

    // Subscribe to messages
    const unsubscribeMessages = client.subscribe(handleMessage)

    // Subscribe to status changes
    const unsubscribeStatus = client.onStatusChange(setStatus)

    // Auto-connect if enabled
    if (autoConnect && !client.isConnected()) {
      client.connect()
    }

    // Cleanup on unmount
    return () => {
      unsubscribeMessages()
      unsubscribeStatus()
    }
  }, [autoConnect, handleMessage])

  return {
    data,
    status,
    isConnected: status === 'connected',
    sendMessage,
    connect,
    disconnect,
  }
}

/**
 * Hook to get only the WebSocket connection status
 */
export function useWebSocketStatus(): {
  status: WebSocketStatus
  isConnected: boolean
} {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected')
  const clientRef = useRef(getWebSocketClient())

  useEffect(() => {
    const client = clientRef.current
    const unsubscribe = client.onStatusChange(setStatus)

    return () => {
      unsubscribe()
    }
  }, [])

  return {
    status,
    isConnected: status === 'connected',
  }
}
