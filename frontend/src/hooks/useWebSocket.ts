/**
 * Custom React hook for WebSocket connections
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getWebSocketClient,
  WebSocketMessage,
  WebSocketStatus,
  WebSocketCallback,
  SystemAlertMessage,
  SubscriptionType,
} from '../lib/websocket'

export interface SessionEvent {
  event_type: 'session_created' | 'session_destroyed'
  timestamp: string
  data: {
    current_count: number
    previous_count: number
    delta: number
    time_since_last_event: number
  }
}

export interface StoredAlert extends SystemAlertMessage {
  read: boolean
}

export interface UseWebSocketReturn {
  data: any
  containerStats: any
  sessionSummary: any
  sessionEvents: SessionEvent[]
  systemAlerts: StoredAlert[]
  unreadAlertCount: number
  status: WebSocketStatus
  isConnected: boolean
  sendMessage: (message: string) => void
  connect: () => void
  disconnect: () => void
  markAlertsAsRead: () => void
  clearAllAlerts: () => void
}

/**
 * Hook to manage WebSocket connection and receive real-time updates
 *
 * @param autoConnect - Whether to automatically connect on mount (default: true)
 * @param onMessage - Optional callback for custom message handling
 * @param subscriptions - Subscription types to request from server (Phase 4)
 * @returns WebSocket state and control functions
 */
export function useWebSocket(
  autoConnect: boolean = true,
  onMessage?: WebSocketCallback,
  subscriptions?: SubscriptionType[]
): UseWebSocketReturn {
  const [data, setData] = useState<any>(null)
  const [containerStats, setContainerStats] = useState<any>(null)
  const [sessionSummary, setSessionSummary] = useState<any>(null)
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([])
  const [systemAlerts, setSystemAlerts] = useState<StoredAlert[]>([])
  const [unreadAlertCount, setUnreadAlertCount] = useState<number>(0)
  const [status, setStatus] = useState<WebSocketStatus>('disconnected')
  const clientRef = useRef(getWebSocketClient())
  const onMessageRef = useRef(onMessage)

  // Keep onMessage ref up to date
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  // Set subscriptions on client (Phase 4)
  useEffect(() => {
    if (subscriptions && subscriptions.length > 0) {
      clientRef.current.setSubscriptions(subscriptions)
    }
  }, [subscriptions])

  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Handle new realtime_update format (Phase 1)
    if (message.type === 'realtime_update' && message.data) {
      // Extract metrics (keeping backwards compatibility)
      if (message.data.metrics) {
        setData(message.data.metrics)
      }

      // Extract container stats
      if (message.data.containers) {
        setContainerStats(message.data.containers)
      }

      // Extract session summary
      if (message.data.sessions) {
        setSessionSummary(message.data.sessions)
      }
    }

    // Handle session events (Phase 2)
    if (message.type === 'session_event') {
      const sessionEvent: SessionEvent = {
        event_type: (message as any).event_type,
        timestamp: message.timestamp,
        data: (message as any).data
      }

      // Add to events list (keep last 10 events)
      setSessionEvents(prev => [sessionEvent, ...prev].slice(0, 10))

      // Update session summary with current count
      if (sessionEvent.data.current_count !== undefined) {
        setSessionSummary({
          active_count: sessionEvent.data.current_count,
          total_count: sessionEvent.data.current_count
        })
      }
    }

    // Handle system alerts (Phase 3)
    if (message.type === 'system_alert') {
      const alertMsg = message as SystemAlertMessage
      const storedAlert: StoredAlert = {
        ...alertMsg,
        read: false
      }

      // Add to alerts list (keep all alerts for history)
      setSystemAlerts(prev => [storedAlert, ...prev])
      setUnreadAlertCount(prev => prev + 1)
    }

    // Keep backwards compatibility with old metrics_update format
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

  // Mark all alerts as read
  const markAlertsAsRead = useCallback(() => {
    setSystemAlerts(prev => prev.map(alert => ({ ...alert, read: true })))
    setUnreadAlertCount(0)
  }, [])

  // Clear all alerts
  const clearAllAlerts = useCallback(() => {
    setSystemAlerts([])
    setUnreadAlertCount(0)
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
    containerStats,
    sessionSummary,
    sessionEvents,
    systemAlerts,
    unreadAlertCount,
    status,
    isConnected: status === 'connected',
    sendMessage,
    connect,
    disconnect,
    markAlertsAsRead,
    clearAllAlerts,
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
