# Phase 2: WebSocket Session Monitoring Enhancement

**Document Version:** 1.0
**Created:** 2025-10-11 18:00:00
**Status:** Ready to Start
**Phase:** 2 of 4 in WebSocket Implementation Roadmap
**Timeline:** Week 2
**Estimated Duration:** 4 hours 20 minutes

---

## Executive Summary

Phase 2 builds on the Phase 1 foundation (Container Stats Migration) to add real-time session event notifications. This enables instant visibility into session lifecycle events (create/destroy) and reduces HTTP polling overhead for session count monitoring.

### Phase 1 Foundation (Complete)
- ✅ WebSocket infrastructure established
- ✅ Container stats broadcasting (3s interval)
- ✅ Session count already included in broadcasts
- ✅ Feature flags for safe deployment
- ✅ HTTP fallback mechanism working

### Phase 2 Objectives
- Implement session change detection (create/destroy events)
- Broadcast session events via WebSocket when they occur
- Update Sessions.tsx to use WebSocket for session count
- Add optional notification UI for session events
- Maintain HTTP polling for session list (pagination support)

### Expected Benefits
- **Real-time notifications**: Instant awareness of session changes
- **Reduced polling**: Eliminate HTTP polling for session count
- **Better UX**: Users see session updates immediately
- **Foundation for Phase 3**: Event-driven architecture for system alerts

---

## Table of Contents

1. [Implementation Plan](#implementation-plan)
2. [Backend Changes](#backend-changes)
3. [Frontend Changes](#frontend-changes)
4. [Testing Strategy](#testing-strategy)
5. [Success Criteria](#success-criteria)
6. [Task Breakdown](#task-breakdown)
7. [Risk Assessment](#risk-assessment)

---

## Implementation Plan

### Overview

Phase 2 introduces session event detection by comparing session counts between broadcast intervals. When a change is detected, a `session_event` message is broadcast to all connected clients.

### Key Components

1. **SessionEventManager** (Backend)
   - Tracks previous session count
   - Detects changes (delta calculation)
   - Returns event object when change detected

2. **WebSocket Integration** (Backend)
   - Import SessionEventManager
   - Check for session changes in broadcast loop
   - Emit `session_event` messages when changes occur

3. **Message Type Handling** (Frontend)
   - Add `SessionEventMessage` type definition
   - Handle `session_event` messages in useWebSocket hook
   - Update sessionSummary state from events

4. **Sessions Page Update** (Frontend)
   - Use WebSocket sessionSummary for count display
   - Remove HTTP polling for session count
   - Add HTTP fallback when WebSocket disconnected
   - Keep HTTP polling for session list (pagination)

5. **Optional Notification UI** (Frontend)
   - Toast or alert component
   - Display session events with auto-dismiss
   - "Session created" / "Session destroyed" messages

### Architecture Decision: Scope Clarification

**What Phase 2 WILL do:**
- Detect session count changes (create/destroy events)
- Broadcast session events via WebSocket
- Update Sessions.tsx to use WebSocket for count
- Add optional notification UI

**What Phase 2 will NOT do:**
- Full session list delta updates (keep HTTP polling)
- Individual session detail events (out of scope)
- Session list real-time synchronization (complex, deferred)

**Rationale:**
- Session list uses pagination (complex state management)
- HTTP polling for list is sufficient (15s interval)
- Focus on high-value, low-complexity improvements
- Session count is the primary real-time metric needed

---

## Backend Changes

### 1. Create Session Event Manager

**File:** `backend/app/services/session_events.py` (NEW)

**Purpose:** Detect session count changes and generate event objects

**Implementation:**

```python
"""
Session event manager for real-time session monitoring
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger("kato_dashboard.services.session_events")


class SessionEventManager:
    """Manages session lifecycle events"""

    def __init__(self):
        self._last_session_count = 0
        self._session_cache: Dict[str, Any] = {}

    async def check_session_changes(self) -> Optional[Dict[str, Any]]:
        """
        Check for session changes and return event if detected

        Returns event dict if sessions changed, None otherwise
        """
        try:
            from app.services.kato_api import get_kato_client
            client = get_kato_client()

            count_data = await client.get_session_count()
            current_count = count_data.get("active_sessions", 0)

            # Detect change
            if current_count != self._last_session_count:
                delta = current_count - self._last_session_count
                event_type = "session_created" if delta > 0 else "session_destroyed"

                event = {
                    "type": "session_event",
                    "event_type": event_type,
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "current_count": current_count,
                        "previous_count": self._last_session_count,
                        "delta": abs(delta)
                    }
                }

                self._last_session_count = current_count
                logger.info(f"Session event detected: {event_type} (delta: {delta})")

                return event

            return None

        except Exception as e:
            logger.error(f"Failed to check session changes: {e}")
            return None


# Global instance
_session_event_manager: Optional[SessionEventManager] = None


def get_session_event_manager() -> SessionEventManager:
    """Get or create session event manager singleton"""
    global _session_event_manager
    if _session_event_manager is None:
        _session_event_manager = SessionEventManager()
    return _session_event_manager
```

**Key Features:**
- Singleton pattern for global state management
- Delta detection (positive = created, negative = destroyed)
- Logging for debugging
- Error handling to prevent broadcast failures
- Returns None if no change detected

**Time Estimate:** 1 hour

---

### 2. Integrate Session Events into WebSocket Broadcasts

**File:** `backend/app/services/websocket.py` (MODIFY)

**Changes:**

```python
from app.services.session_events import get_session_event_manager

async def _broadcast_metrics(self):
    """Enhanced broadcast with container stats and session events"""
    while self._running and len(self.active_connections) > 0:
        try:
            # Fetch all real-time data
            kato_metrics = await get_kato_client().get_metrics(use_cache=False)

            # Fetch container stats if feature enabled
            container_stats = None
            if settings.websocket_container_stats:
                container_stats = get_docker_stats_client().get_all_kato_stats(use_cache=False)

            # Fetch session summary if feature enabled
            session_summary = None
            if settings.websocket_session_events:
                session_summary = await self._get_session_summary()

            # Prepare consolidated message
            message = {
                "type": "realtime_update",
                "timestamp": datetime.now().isoformat(),
                "data": {
                    "metrics": kato_metrics,
                }
            }

            if container_stats:
                message["data"]["containers"] = container_stats

            if session_summary:
                message["data"]["sessions"] = session_summary

            # Broadcast to all clients
            await self.broadcast_json(message)

            # Check for session events (NEW)
            if settings.websocket_session_events:
                session_manager = get_session_event_manager()
                session_event = await session_manager.check_session_changes()
                if session_event:
                    # Broadcast session event separately
                    await self.broadcast_json(session_event)

            await asyncio.sleep(3)

        except Exception as e:
            logger.error(f"Error in enhanced broadcast: {e}")
            await asyncio.sleep(5)
```

**Key Changes:**
1. Import `get_session_event_manager`
2. Call `check_session_changes()` after regular broadcast
3. Broadcast session event if detected
4. Respects `websocket_session_events` feature flag
5. Separate message for events (don't bundle with metrics)

**Time Estimate:** 30 minutes

---

## Frontend Changes

### 1. Update WebSocket Message Types

**File:** `frontend/src/lib/websocket.ts` (MODIFY)

**Changes:**

```typescript
export type WebSocketMessageType =
  | 'connected'
  | 'metrics_update'
  | 'realtime_update'
  | 'session_event'    // NEW
  | 'heartbeat'
  | 'error'

export interface SessionEventMessage extends WebSocketMessage {
  type: 'session_event'
  event_type: 'session_created' | 'session_destroyed'
  timestamp: string
  data: {
    current_count: number
    previous_count: number
    delta: number
  }
}
```

**Time Estimate:** 15 minutes

---

### 2. Enhance useWebSocket Hook

**File:** `frontend/src/hooks/useWebSocket.ts` (MODIFY)

**Changes:**

```typescript
const handleMessage = useCallback((message: WebSocketMessage) => {
  switch (message.type) {
    case 'realtime_update':
      const realtimeMsg = message as RealtimeUpdateMessage
      setMetrics(realtimeMsg.data.metrics)

      if (realtimeMsg.data.containers) {
        setContainerStats(realtimeMsg.data.containers)
      }

      if (realtimeMsg.data.sessions) {
        setSessionSummary(realtimeMsg.data.sessions)
      }
      break

    case 'session_event':    // NEW
      const sessionMsg = message as SessionEventMessage
      // Update session summary from event
      setSessionSummary({
        active_count: sessionMsg.data.current_count,
        total_count: sessionMsg.data.current_count
      })

      // Optional: Store event for notification display
      setLastSessionEvent(sessionMsg)
      break

    case 'metrics_update':
      // Backwards compatibility
      setMetrics((message as MetricsUpdateMessage).data)
      break
  }
}, [])
```

**Additional State:**

```typescript
const [lastSessionEvent, setLastSessionEvent] = useState<SessionEventMessage | null>(null)

return {
  metrics,
  containerStats,
  sessionSummary,
  lastSessionEvent,    // NEW
  status,
  isConnected,
  error,
  reconnectCount,
}
```

**Time Estimate:** 20 minutes

---

### 3. Update Sessions Page

**File:** `frontend/src/pages/Sessions.tsx` (MODIFY)

**Changes:**

```typescript
export default function Sessions() {
  // Use WebSocket for session count (PRIMARY)
  const { sessionSummary, lastSessionEvent, isConnected } = useWebSocket(true)

  // HTTP fallback ONLY when WebSocket disconnected
  const { data: fallbackCount } = useQuery({
    queryKey: ['sessions-count'],
    queryFn: () => apiClient.getSessionsCount(),
    enabled: !isConnected,
    refetchInterval: 10000,
  })

  // Use WebSocket data with HTTP fallback
  const activeSessionCount = isConnected
    ? sessionSummary?.active_count
    : fallbackCount?.active_sessions

  // Keep HTTP polling for session list (pagination)
  const { data: sessions } = useQuery({
    queryKey: ['sessions', page],
    queryFn: () => apiClient.listSessions(page * pageSize, pageSize),
    refetchInterval: 10000, // Keep for paginated data
  })

  // Optional: Display last session event
  useEffect(() => {
    if (lastSessionEvent) {
      // Show toast or update UI
      console.log('Session event:', lastSessionEvent)
    }
  }, [lastSessionEvent])

  // ... rest of component
}
```

**Key Changes:**
1. Destructure `sessionSummary` and `lastSessionEvent` from useWebSocket
2. Remove primary HTTP polling for session count
3. Enable HTTP query only when WebSocket disconnected
4. Use WebSocket data as primary source
5. Keep HTTP polling for session list (pagination)

**Time Estimate:** 30 minutes

---

### 4. Add Session Event Notification UI (Optional)

**File:** `frontend/src/components/SessionEventToast.tsx` (NEW)

**Purpose:** Display session event notifications with auto-dismiss

**Implementation:**

```typescript
import { useEffect } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import type { SessionEventMessage } from '../lib/websocket'

interface SessionEventToastProps {
  event: SessionEventMessage | null
  onDismiss: () => void
}

export function SessionEventToast({ event, onDismiss }: SessionEventToastProps) {
  useEffect(() => {
    if (event) {
      const timer = setTimeout(() => {
        onDismiss()
      }, 4000) // Auto-dismiss after 4 seconds

      return () => clearTimeout(timer)
    }
  }, [event, onDismiss])

  if (!event) return null

  const isCreated = event.event_type === 'session_created'
  const Icon = isCreated ? CheckCircle : XCircle
  const bgColor = isCreated
    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'

  const iconColor = isCreated ? 'text-green-500' : 'text-red-500'

  const message = isCreated
    ? `${event.data.delta} session${event.data.delta > 1 ? 's' : ''} created`
    : `${event.data.delta} session${event.data.delta > 1 ? 's' : ''} destroyed`

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 p-4 rounded-lg border shadow-lg ${bgColor}`}>
      <Icon className={`w-5 h-5 ${iconColor}`} />
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {message}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Total: {event.data.current_count}
        </p>
      </div>
    </div>
  )
}
```

**Usage in Sessions.tsx:**

```typescript
const [showToast, setShowToast] = useState(false)

useEffect(() => {
  if (lastSessionEvent) {
    setShowToast(true)
  }
}, [lastSessionEvent])

return (
  <div>
    {/* Existing UI */}

    <SessionEventToast
      event={showToast ? lastSessionEvent : null}
      onDismiss={() => setShowToast(false)}
    />
  </div>
)
```

**Time Estimate:** 45 minutes

---

## Testing Strategy

### Backend Testing

#### Unit Tests

**File:** `backend/tests/test_session_events.py` (NEW)

```python
import pytest
from app.services.session_events import SessionEventManager

@pytest.mark.asyncio
async def test_session_event_detection():
    """Test session change detection"""
    manager = SessionEventManager()

    # First check (no previous state)
    event = await manager.check_session_changes()
    # Should initialize but not return event

    # Simulate session creation
    # Mock get_session_count to return different value
    event = await manager.check_session_changes()
    assert event is not None
    assert event["event_type"] == "session_created"
    assert event["data"]["delta"] > 0

@pytest.mark.asyncio
async def test_no_session_change():
    """Test no event when count unchanged"""
    manager = SessionEventManager()

    # Initialize
    await manager.check_session_changes()

    # Check again with same count
    event = await manager.check_session_changes()
    assert event is None
```

#### Integration Tests

**File:** `backend/tests/test_websocket_session_events.py` (NEW)

```python
import pytest
import websockets
import json

@pytest.mark.asyncio
async def test_session_event_broadcast():
    """Test session events are broadcast correctly"""
    uri = "ws://localhost:8080/ws"

    async with websockets.connect(uri) as websocket:
        # Receive initial realtime_update
        message = await websocket.recv()
        data = json.loads(message)
        assert data["type"] == "realtime_update"

        # Wait for potential session event
        # (requires actual session creation in test environment)
        # This test is best done in staging/development
```

**Time Estimate:** 30 minutes

---

### Frontend Testing

#### Manual Testing Checklist

1. **WebSocket Connection**
   - [ ] Dashboard connects to WebSocket
   - [ ] Connection status indicator shows "Connected"
   - [ ] sessionSummary populated from WebSocket

2. **Session Count Display**
   - [ ] Sessions.tsx displays session count from WebSocket
   - [ ] Count updates when sessions created
   - [ ] Count updates when sessions destroyed

3. **HTTP Fallback**
   - [ ] Disconnect WebSocket (stop backend)
   - [ ] Sessions.tsx falls back to HTTP polling
   - [ ] Count still displays correctly
   - [ ] Reconnect WebSocket
   - [ ] Sessions.tsx switches back to WebSocket

4. **Session Event Notifications**
   - [ ] Create a new session (via KATO API)
   - [ ] "Session created" toast appears
   - [ ] Toast auto-dismisses after 4 seconds
   - [ ] Destroy a session
   - [ ] "Session destroyed" toast appears
   - [ ] Toast shows correct delta and total count

5. **Session List Pagination**
   - [ ] Session list still uses HTTP polling
   - [ ] Pagination works correctly
   - [ ] List refreshes every 10 seconds

**Time Estimate:** 30 minutes

---

## Success Criteria

### Performance Metrics

✅ **Latency:**
- Session events delivered within 500ms of detection
- Session count update latency < 100ms

✅ **Accuracy:**
- Session count accuracy 100% (matches KATO API)
- Event delta calculation correct (matches actual change)

✅ **Reliability:**
- No memory leaks over 24h operation
- HTTP fallback works when WebSocket disconnected
- Feature flag rollback works correctly

### Functionality Metrics

✅ **Event Detection:**
- Session create events detected and broadcast
- Session destroy events detected and broadcast
- Multiple rapid changes handled correctly

✅ **UI Updates:**
- Sessions.tsx uses WebSocket for count
- HTTP polling removed for session count
- HTTP fallback enabled when disconnected
- Session list still uses HTTP (pagination)

✅ **Code Quality:**
- TypeScript errors: 0
- Backend tests pass
- Feature flags working
- Documentation complete

---

## Task Breakdown

### Backend Tasks (1.5 hours)

1. **Create session_events.py** (1 hour)
   - SessionEventManager class
   - check_session_changes() method
   - Delta detection logic
   - Error handling
   - Logging

2. **Integrate into WebSocket broadcasts** (30 minutes)
   - Import SessionEventManager
   - Call check_session_changes()
   - Broadcast events when detected
   - Feature flag checks

### Frontend Tasks (2.5 hours)

3. **Update WebSocket message types** (15 minutes)
   - Add SessionEventMessage type
   - Update WebSocketMessageType union

4. **Enhance useWebSocket hook** (20 minutes)
   - Handle session_event messages
   - Update sessionSummary from events
   - Store lastSessionEvent

5. **Update Sessions.tsx** (30 minutes)
   - Use WebSocket sessionSummary
   - Remove HTTP polling for count
   - Add HTTP fallback
   - Keep HTTP polling for list

6. **Add notification UI** (45 minutes)
   - Create SessionEventToast component
   - Integrate into Sessions.tsx
   - Auto-dismiss logic
   - Styling

### Testing & Documentation (1.33 hours)

7. **Backend unit tests** (20 minutes)
   - Test session event detection
   - Test no change scenario

8. **Manual testing** (30 minutes)
   - Test all scenarios
   - Verify HTTP fallback
   - Test event notifications

9. **Update documentation** (20 minutes)
   - Update DASHBOARD_WEBSOCKET_IMPLEMENTATION.md
   - Mark Phase 2 tasks complete

10. **Create completion archive** (23 minutes)
    - Document achievements
    - Code metrics
    - Performance results

**Total Estimated Time:** 4 hours 20 minutes

---

## Risk Assessment

### Low Risk ✅
- Session count already in broadcasts (Phase 1 complete)
- WebSocket infrastructure proven (Phase 1 success)
- Feature flags enable instant rollback
- HTTP fallback already working

### Medium Risk ⚠️
- Session event detection timing (may miss very rapid changes)
- Race conditions if sessions created/destroyed during broadcast
- Delta calculation edge cases (initialization, large changes)

### Mitigation Strategies

1. **Timing Issues:**
   - Use 3-second broadcast interval (same as Phase 1)
   - Accept eventual consistency (not real-time to the millisecond)
   - Log all events for debugging

2. **Race Conditions:**
   - Use try-catch around session count fetching
   - Store last known count in SessionEventManager
   - Don't block broadcasts if event detection fails

3. **Edge Cases:**
   - Initialize last_session_count to 0
   - Handle None/missing data gracefully
   - Log unexpected deltas (e.g., >10 sessions changed)

---

## Next Steps After Phase 2

### Phase 3: System Alerts & Events (Week 3)
- Alert threshold detection (CPU, memory, disk)
- Alert message broadcasting
- AlertNotification UI component
- Configurable alert rules

### Phase 4: Selective Subscriptions (Week 4)
- Subscription management protocol
- Page-based subscriptions
- Optimized broadcasts per client

### Quality & Security (After WebSocket)
- Comprehensive testing
- Authentication & authorization
- Error tracking (Sentry)
- Performance optimization

---

## References

- **Implementation Guide:** `/docs/DASHBOARD_WEBSOCKET_IMPLEMENTATION.md`
- **Phase 1 Archive:** `/planning-docs/completed/features/phase-1-websocket-container-stats.md`
- **Session State:** `/planning-docs/SESSION_STATE.md`
- **Daily Backlog:** `/planning-docs/DAILY_BACKLOG.md`

---

**Document Status:** Complete
**Ready for Implementation:** ✅ YES
**Phase:** 2 of 4
**Timeline:** Week 2 of WebSocket implementation
**Next Phase:** Phase 3 - System Alerts & Events

---

**Document Version:** 1.0
**Created:** 2025-10-11 18:00:00
**Author:** Project Manager Agent
