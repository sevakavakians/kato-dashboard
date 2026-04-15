# Bug Fix: Pattern Search Client-Side to Server-Side Migration

**Date**: 2026-04-15
**Type**: Bug Fix (High Severity)
**Status**: Implementation Complete - Awaiting live testing
**Impact**: High - Pattern search was silently returning wrong results for all users

---

## Problem Summary

Pattern search in the knowledgebase browser only filtered the current page of 20 results (client-side filtering) instead of searching the full ClickHouse database. Users searching for a pattern name had no indication that results were incomplete — the UI appeared to work, but was only scanning a 20-pattern window of potentially thousands of patterns.

---

## Root Cause

The search input in `PatternsPanel.tsx` applied a JavaScript `.filter()` call against the already-fetched page of patterns. The `search` string was never sent to the backend, so ClickHouse never received a search clause. The React Query cache key did not include `search`, meaning changing the search term did not trigger a new API fetch.

---

## Fix Implemented

The fix propagates `search` all the way from the UI input through the full stack to a ClickHouse `ILIKE` query, and replaces client-side filtering with debounced server-side search.

### Files Modified

#### 1. `backend/app/db/clickhouse.py`
- Added `search: str = ""` parameter to `query_patterns()`, `get_all_pattern_names()`, and `get_pattern_count()`
- Added `ILIKE` clause: `WHERE pattern_name ILIKE %s` with `f"%{search}%"` binding when `search` is non-empty
- Search is case-insensitive; applies consistently to count and data queries so pagination totals remain accurate

#### 2. `backend/app/db/hybrid_patterns.py`
- Passed `search` parameter through `get_patterns_hybrid()` and `_get_patterns_sorted_by_frequency()`
- Ensures both ClickHouse-primary and Redis-frequency-sorted code paths apply the same filter

#### 3. `backend/app/api/routes.py`
- Added `search: str = Query("")` to the patterns endpoint
- Passes `search` down into the hybrid patterns service call

#### 4. `frontend/src/lib/api.ts`
- Added `search?: string` to `getHybridPatterns()` parameters
- Appends `search` to the axios request query string when provided

#### 5. `frontend/src/components/PatternsPanel.tsx`
- Added 500ms debounced search state (separate `debouncedSearch` from raw input value)
- Removed client-side `.filter()` call entirely
- Added `debouncedSearch` to React Query cache key so a new fetch fires on each unique search term
- UI now waits for user to stop typing before issuing a server request (avoids excessive ClickHouse queries)

---

## Before vs. After

| Aspect | Before | After |
|---|---|---|
| Search scope | Current page only (20 patterns max) | Full ClickHouse database |
| Result accuracy | Silently incomplete | Complete and correct |
| Search trigger | Instant JS filter on existing data | Debounced (500ms) server fetch |
| API call on search | None | Yes — new request per unique term |
| Pagination totals | Unchanged (wrong) | Recalculated for search term |
| TypeScript errors | 0 | 0 (confirmed) |

---

## Verification Status

- TypeScript compilation: PASS
- Live testing with running dashboard: PENDING

---

## Lessons Learned

**Assumption vs. Reality**: Client-side filtering is a tempting shortcut for paginated UIs, but breaks silently when the data set is larger than one page. For any paginated list where the total count exceeds the page size, search must be server-side.

**Pattern to apply going forward**: Any search input in a paginated component must include the search term in the React Query key and pass it through to the backend query. Never filter already-fetched data when a full dataset exists in the database.

---

**Archive Created**: 2026-04-15
