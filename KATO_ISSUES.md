# KATO Issues - Implementation Status

**Last Updated**: October 8, 2025
**Review Date**: Post-KATO development work

This document tracks issues found in the KATO service and their current implementation status.

---

## ⚠️ Issue #1: System Resource Metrics - **MOSTLY FIXED**

### Status: 🟡 Partially Working

**What Works**:
- ✅ Memory metrics: **WORKING** (returns 44.9%)
- ✅ Disk metrics: **WORKING** (returns 41.2%)

**What's Broken**:
- ❌ CPU metrics: **BROKEN** (returns 0.0%)

### Implementation Details

KATO now has system monitoring implemented using `psutil` in `/kato/monitoring/metrics.py`:

```python
async def collect_system_metrics(self):
    """Collect system resource metrics"""
    # CPU metrics - call twice because first call returns 0.0
    psutil.cpu_percent(interval=0.1)  # Prime the pump
    await asyncio.sleep(0.1)
    cpu_percent = psutil.cpu_percent(interval=0.1)  # ← Still returns 0.0
    self.set("kato_cpu_usage_percent", cpu_percent)

    # Memory metrics
    memory = psutil.virtual_memory()
    self.set("kato_memory_usage_bytes", memory.used)
    self.set("kato_memory_usage_percent", memory.percent)  # ← WORKING

    # Disk metrics
    disk = psutil.disk_usage('/')
    self.set("kato_disk_usage_percent", disk.percent)  # ← WORKING
```

### Root Cause: CPU Metric Bug

The CPU metric returns 0.0 because `psutil.cpu_percent(interval=0.1)` is a **blocking call** being used in an async context. The interval-based call doesn't work correctly here.

### Recommended Fix

Replace the CPU collection with non-blocking approach:

```python
# Option 1: Use non-blocking mode after initialization
# In __init__ or startup:
psutil.cpu_percent()  # Initialize - discards first 0.0 value

# In collection loop:
cpu_percent = psutil.cpu_percent(interval=None)  # Non-blocking

# Option 2: Run in thread pool
import asyncio
loop = asyncio.get_event_loop()
cpu_percent = await loop.run_in_executor(
    None,
    psutil.cpu_percent,
    0.1
)
```

### Impact on Dashboard
- Dashboard updated to show working memory/disk metrics
- Warning message now CPU-specific
- Charts will populate once CPU metric is fixed

---

## ✅ Issue #2: Time Series Data - **FULLY FIXED**

### Status: 🟢 Working

KATO now collects comprehensive time series data with proper implementation:

**Implementation**:
- ✅ Deque-based circular buffer (maxlen=1000)
- ✅ 10-second collection interval
- ✅ Multiple metrics tracked
- ✅ Time-windowed queries supported

**Available Time Series Metrics**:
```json
[
  "kato_cpu_usage_percent",         // ← Works but all values are 0.0
  "kato_memory_usage_percent",      // ← WORKING
  "kato_memory_usage_bytes",        // ← WORKING
  "kato_disk_usage_percent",        // ← WORKING
  "load_average_1m",
  "kato_requests_total",
  "kato_request_duration_seconds",
  "kato_errors_total",
  "sessions_created",
  "sessions_deleted",
  "session_operations",
  "mongodb_operations",
  "mongodb_response_time",
  "mongodb_errors",
  "qdrant_operations",
  "qdrant_response_time",
  "qdrant_errors",
  "redis_operations",
  "redis_response_time",
  "redis_errors"
]
```

### Breaking Change: Metric Names

Metric names changed from generic to KATO-specific:

| Old Name | New Name |
|----------|----------|
| `cpu_percent` | `kato_cpu_usage_percent` |
| `memory_percent` | `kato_memory_usage_percent` |

**Dashboard Updated**: ✅ Frontend now uses new metric names

### Impact on Dashboard
- ✅ Memory charts now populate
- ✅ Disk metrics available
- ⚠️ CPU chart shows all zeros until CPU metric fixed

---

## ✅ Issue #3: Session Listing - **WORKAROUND IMPLEMENTED**

### Status: 🟡 Workaround Active

**KATO Status**: ❌ Not implemented (no `GET /sessions` endpoint)

**Dashboard Solution**: ✅ **SessionManager service queries Redis directly**

### Implementation

Dashboard implements `/backend/app/services/session_manager.py`:

```python
class SessionManager:
    async def list_sessions(self, skip, limit, status, search):
        # Scan Redis for session keys
        async for key in client.scan_iter(match="kato:session:*"):
            session_keys.append(key)

        # Parse and return sessions with pagination
        return {
            "sessions": sessions,
            "total": len(sessions),
            "skip": skip,
            "limit": limit
        }
```

### Current Stats
- **KATO Active Sessions**: 2
- **Redis Session Keys**: 1,701 (includes stale test sessions)

### Endpoints Available

| Endpoint | Status | Source |
|----------|--------|--------|
| `GET /api/v1/sessions/count` | ✅ Working | KATO |
| `GET /api/v1/sessions?skip=0&limit=20` | ✅ Working | **Dashboard (Redis)** |
| `GET /api/v1/sessions/{id}` | ✅ Working | KATO |
| `GET /api/v1/sessions/{id}/stm` | ✅ Working | KATO |
| `DELETE /api/v1/sessions/{id}` | ✅ Working | Dashboard + KATO fallback |
| `POST /api/v1/sessions/bulk-delete` | ✅ Working | Dashboard (Redis) |

### Dashboard UI Features
- ✅ Two-tab interface: "Active Sessions" (KATO count) + "Redis Keys" (full list)
- ✅ Pagination support
- ✅ Bulk delete functionality
- ✅ Cleanup expired keys
- ✅ Search/filter

### Decision
**Keep dashboard workaround**. It's pragmatic, works well, and provides functionality KATO doesn't need to implement urgently.

---

## ❌ Issue #4: Database Operation Metrics - **NOT FIXED**

### Status: 🔴 Not Implemented

Database operation tracking is still not implemented in KATO.

**Current Behavior**:
```json
{
  "databases": {
    "mongodb": {"operations": 0.0, "errors": 0.0, "avg_response_time": 0.0},
    "qdrant": {"operations": 0.0, "errors": 0.0, "avg_response_time": 0.0},
    "redis": {"operations": 0.0, "errors": 0.0, "avg_response_time": 0.0}
  }
}
```

**Expected Behavior**:
```json
{
  "databases": {
    "mongodb": {"operations": 1523, "errors": 0, "avg_response_time": 0.045},
    "qdrant": {"operations": 892, "errors": 2, "avg_response_time": 0.023},
    "redis": {"operations": 5234, "errors": 0, "avg_response_time": 0.002}
  }
}
```

### Required Implementation

Add operation tracking middleware to database clients:

```python
class MongoDBClient:
    async def find(self, *args, **kwargs):
        start = time.time()
        try:
            result = await self._collection.find(*args, **kwargs)
            metrics_collector.increment("mongodb_operations")
            metrics_collector.observe("mongodb_response_time", time.time() - start)
            return result
        except Exception as e:
            metrics_collector.increment("mongodb_errors")
            raise
```

Apply similar pattern to:
- MongoDB operations (find, insert, update, delete)
- Qdrant operations (search, upsert, delete)
- Redis operations (get, set, delete)

### Impact on Dashboard
- Dashboard "Processor Information" section shows processor stats instead
- Database operation metrics section removed until KATO implements tracking

---

## Summary Table

| Issue | Status | Dashboard Impact |
|-------|--------|-----------------|
| **#1 System Resources** | 🟡 Mostly Fixed | Memory/disk working, CPU broken |
| **#2 Time Series Data** | 🟢 Fixed | Charts populate (except CPU) |
| **#3 Session Listing** | 🟡 Workaround | Fully functional via Redis |
| **#4 Database Metrics** | 🔴 Not Fixed | Section replaced with processor info |

---

## Next Steps

### For KATO Development Team

1. **HIGH PRIORITY**: Fix CPU metric (2-3 hours)
   - Use `psutil.cpu_percent(interval=None)` or thread pool
   - Test in async context

2. **MEDIUM PRIORITY**: Implement database operation tracking (6-8 hours)
   - Add middleware to database clients
   - Track operations, errors, response times
   - Expose via metrics collector

3. **LOW PRIORITY**: Implement session listing endpoint (optional)
   - Dashboard workaround is sufficient
   - Consider if needed for other clients

### For Dashboard Team

- ✅ Metric names updated
- ✅ UI updated to show working metrics
- ✅ Session management fully functional
- ⏳ Waiting on KATO CPU fix to enable CPU charts

---

## Testing Commands

```bash
# Test system metrics
curl http://localhost:8080/api/v1/system/metrics | jq '.resources'

# Expected:
# {
#   "cpu_percent": 0.0,           ← Should be > 0
#   "memory_percent": 44.9,       ← WORKING
#   "disk_percent": 41.2          ← WORKING
# }

# Test time series
curl "http://localhost:8080/api/v1/system/stats?minutes=1" | jq '.time_series.kato_memory_usage_percent | length'

# Expected: > 0 (should have data points)

# Test session listing
curl "http://localhost:8080/api/v1/sessions?skip=0&limit=5" | jq '.total'

# Expected: 1701 (current count)
```

---

## Conclusion

**3 out of 4 issues addressed**. KATO team has made significant progress:

- ✅ System monitoring implemented (memory, disk working)
- ✅ Time series collection implemented
- ❌ CPU metric needs async fix (blocking issue)
- ❌ Database operation tracking not started

Dashboard is **production-ready** with current KATO capabilities. CPU charts will activate automatically once KATO fixes the CPU metric issue.
