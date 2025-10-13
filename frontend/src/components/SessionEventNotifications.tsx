/**
 * Session Event Notifications Component (Phase 2)
 *
 * Displays toast notifications for session lifecycle events
 * (session created/destroyed)
 */
import { useEffect, useState } from 'react'
import { X, UserPlus, UserMinus } from 'lucide-react'
import { SessionEvent } from '../hooks/useWebSocket'

interface SessionEventNotificationsProps {
  events: SessionEvent[]
  maxVisible?: number
  autoDismissMs?: number
}

interface VisibleEvent extends SessionEvent {
  id: string
  visible: boolean
}

export function SessionEventNotifications({
  events,
  maxVisible = 3,
  autoDismissMs = 5000
}: SessionEventNotificationsProps) {
  const [visibleEvents, setVisibleEvents] = useState<VisibleEvent[]>([])

  // Add new events to visible list
  useEffect(() => {
    if (events.length === 0) return

    const latestEvent = events[0]
    const eventId = `${latestEvent.timestamp}-${latestEvent.event_type}`

    // Check if this event is already visible
    const alreadyVisible = visibleEvents.some(e => e.id === eventId)
    if (alreadyVisible) return

    // Add new event
    const newEvent: VisibleEvent = {
      ...latestEvent,
      id: eventId,
      visible: true
    }

    setVisibleEvents(prev => [newEvent, ...prev].slice(0, maxVisible))

    // Auto-dismiss after delay
    if (autoDismissMs > 0) {
      setTimeout(() => {
        setVisibleEvents(prev =>
          prev.map(e => e.id === eventId ? { ...e, visible: false } : e)
        )
        // Remove after fade animation
        setTimeout(() => {
          setVisibleEvents(prev => prev.filter(e => e.id !== eventId))
        }, 300)
      }, autoDismissMs)
    }
  }, [events, maxVisible, autoDismissMs, visibleEvents])

  const handleDismiss = (eventId: string) => {
    setVisibleEvents(prev =>
      prev.map(e => e.id === eventId ? { ...e, visible: false } : e)
    )
    // Remove after fade animation
    setTimeout(() => {
      setVisibleEvents(prev => prev.filter(e => e.id !== eventId))
    }, 300)
  }

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'session_created':
        return <UserPlus className="w-5 h-5 text-green-500" />
      case 'session_destroyed':
        return <UserMinus className="w-5 h-5 text-red-500" />
      default:
        return null
    }
  }

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'session_created':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'session_destroyed':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }
  }

  const getEventMessage = (event: SessionEvent) => {
    const absCount = Math.abs(event.data.delta)
    const plural = absCount !== 1 ? 's' : ''

    if (event.event_type === 'session_created') {
      return `${absCount} session${plural} created`
    } else {
      return `${absCount} session${plural} ended`
    }
  }

  if (visibleEvents.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md pointer-events-none">
      {visibleEvents.map((event) => (
        <div
          key={event.id}
          className={`
            flex items-start gap-3 p-4 rounded-lg border shadow-lg
            transition-all duration-300 pointer-events-auto
            ${getEventColor(event.event_type)}
            ${event.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
          `}
        >
          {getEventIcon(event.event_type)}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {getEventMessage(event)}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Active sessions: {event.data.current_count}
            </p>
          </div>
          <button
            onClick={() => handleDismiss(event.id)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default SessionEventNotifications
