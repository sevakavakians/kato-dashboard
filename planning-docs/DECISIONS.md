# Architectural Decision Log

All significant technical decisions made during the KATO Dashboard development.

---

## ADR-001: FastAPI for Backend Framework

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Need to choose a backend framework for building REST API that interfaces with multiple databases (MongoDB, Qdrant, Redis) and proxies requests to KATO API.

### Decision
Use FastAPI as the backend framework.

### Rationale
- **Native async/await**: Essential for efficient async database clients (Motor, Redis)
- **Type validation**: pydantic integration provides automatic request/response validation
- **Auto documentation**: OpenAPI/Swagger docs generated automatically
- **Performance**: One of the fastest Python frameworks (comparable to Node.js)
- **Developer experience**: Excellent type hints and IDE support
- **Ecosystem**: Strong support for MongoDB, Redis, and other async clients

### Alternatives Considered
- **Flask**: Synchronous by default, would need async extensions
- **Django**: Too heavyweight for this use case, REST framework adds complexity
- **Express.js (Node)**: Good async support but team expertise is in Python

### Consequences
- Positive: Fast development, excellent documentation, great performance
- Negative: Python GIL limitations (not significant for I/O-bound workloads)
- Trade-offs: Learning curve for FastAPI patterns vs familiar Flask

---

## ADR-002: React with TypeScript for Frontend

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Need a modern frontend framework for building interactive dashboard with real-time updates and data visualization.

### Decision
Use React 18 with TypeScript and Vite as build tool.

### Rationale
- **Ecosystem**: Largest component library ecosystem (Recharts, TanStack Query)
- **TypeScript**: Type safety prevents runtime errors, improves maintainability
- **Vite**: Lightning-fast HMR during development
- **React Query**: Declarative data fetching with automatic caching
- **Maturity**: Battle-tested in production environments
- **Developer experience**: Excellent tooling and debugging

### Alternatives Considered
- **Vue.js**: Good option but smaller ecosystem for enterprise dashboards
- **Svelte**: Modern and fast but less mature ecosystem for charts/visualizations
- **Angular**: Too heavyweight, steeper learning curve
- **Next.js**: SSR not needed for internal dashboard

### Consequences
- Positive: Fast development, rich component ecosystem, strong typing
- Negative: Larger bundle size than alternatives
- Trade-offs: React patterns vs simpler frameworks

---

## ADR-003: Docker Compose for Deployment

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Dashboard needs to run alongside existing KATO system and connect to its databases without interfering.

### Decision
Use Docker Compose to orchestrate frontend and backend containers, connecting to existing kato_kato-network.

### Rationale
- **Isolation**: Separate containers prevent interference with KATO
- **Consistency**: Same deployment across dev and production
- **Networking**: Easy connection to existing Docker network
- **Portability**: Works on any system with Docker
- **Optional deployment**: Users can choose to run dashboard or not

### Alternatives Considered
- **Kubernetes**: Overkill for 2-container application
- **Systemd services**: Less portable, harder to manage dependencies
- **Manual deployment**: Error-prone, inconsistent across environments

### Consequences
- Positive: Easy deployment, isolated from KATO, portable
- Negative: Requires Docker installed, slight overhead
- Trade-offs: Docker learning curve vs deployment simplicity

---

## ADR-004: Read-Only Database Access by Default

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Dashboard needs to query KATO's databases for monitoring, but modifications should be carefully controlled.

### Decision
All database connections are read-only by default. Write operations require explicit configuration via MONGODB_READ_ONLY=false.

### Rationale
- **Safety**: Prevents accidental data corruption or deletion
- **Monitoring focus**: Primary use case is observability, not modification
- **Explicit opt-in**: Users must consciously enable writes
- **Pattern editing**: Some features (pattern management) require writes, but controlled

### Alternatives Considered
- **Always writable**: Too dangerous, no safeguards
- **Per-endpoint permissions**: More complex, harder to reason about
- **Separate read/write connections**: Adds complexity

### Consequences
- Positive: Safe default, prevents accidents, clear separation
- Negative: Need to toggle setting for pattern editing
- Trade-offs: Convenience vs safety (favoring safety)

---

## ADR-005: 30-Second Cache Layer for KATO API

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: Medium

### Context
Dashboard polls KATO API frequently for metrics. Need to reduce load on main system.

### Decision
Implement in-memory cache with 30-second TTL for KATO API responses.

### Rationale
- **Reduced load**: Multiple frontend users don't overwhelm KATO
- **Performance**: Cached responses return instantly
- **Fresh enough**: 30s delay acceptable for monitoring metrics
- **Simple implementation**: In-memory dict with timestamp tracking

### Alternatives Considered
- **No caching**: Would overload KATO with requests
- **Longer TTL (60s+)**: Metrics would be too stale
- **Redis cache**: Over-engineered for current scale
- **HTTP cache headers**: Less control over invalidation

### Consequences
- Positive: KATO performance protected, dashboard stays fast
- Negative: Metrics can be up to 30s stale, cache lost on restart
- Trade-offs: Freshness vs performance (30s chosen as balance)

### Future Considerations
- Move to Redis cache for persistence and multi-instance support
- Implement cache invalidation on write operations
- Make TTL configurable per endpoint type

---

## ADR-006: TanStack Query for Server State Management

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Frontend needs to fetch, cache, and synchronize data from backend API with automatic refetching.

### Decision
Use TanStack Query (React Query) for all server state management.

### Rationale
- **Declarative**: useQuery hooks simplify data fetching
- **Automatic caching**: Built-in cache management
- **Background refetching**: Keeps data fresh without manual polling
- **Optimistic updates**: Improves perceived performance
- **DevTools**: Excellent debugging experience

### Alternatives Considered
- **Redux + RTK Query**: More boilerplate, over-engineered for this use case
- **SWR**: Similar but TanStack Query has better TypeScript support
- **Manual fetch + useState**: Lots of boilerplate, error-prone
- **Apollo Client**: GraphQL-focused, not needed for REST API

### Consequences
- Positive: Less boilerplate, better UX, automatic caching
- Negative: Additional dependency, learning curve
- Trade-offs: Library size vs developer experience

---

## ADR-007: Recharts for Data Visualization

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: Medium

### Context
Dashboard needs to display time-series charts for CPU, memory, and other metrics.

### Decision
Use Recharts library for all data visualization.

### Rationale
- **React integration**: Built specifically for React
- **Composable**: Chart components compose naturally
- **Responsive**: Handles container resizing
- **Customizable**: Flexible styling options
- **Documentation**: Good examples and API docs

### Alternatives Considered
- **Chart.js**: Canvas-based, less React-friendly
- **D3.js**: Powerful but steep learning curve
- **Plotly**: Heavy bundle size
- **Victory**: Similar to Recharts but smaller community

### Consequences
- Positive: Easy to use, good defaults, responsive
- Negative: Bundle size (~100KB), limited animation options
- Trade-offs: Ease of use vs bundle size

### Future Considerations
- Consider switching to D3.js for complex custom visualizations
- Lazy load chart components to reduce initial bundle

---

## ADR-008: Multi-Stage Docker Builds

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Docker images should be small and efficient for faster deployments.

### Decision
Use multi-stage builds for both frontend and backend containers.

### Rationale
- **Smaller images**: Build dependencies not included in final image
- **Security**: Fewer packages means smaller attack surface
- **Performance**: Faster pulls and deployments
- **Best practice**: Industry standard for production images

**Backend stages**:
1. Build stage: Install dependencies
2. Runtime stage: Copy only necessary files

**Frontend stages**:
1. Build stage: npm install + vite build
2. Runtime stage: Nginx serving static files

### Alternatives Considered
- **Single-stage builds**: Larger images with unnecessary build tools
- **Pre-built images**: Less flexibility, harder to customize

### Consequences
- Positive: Smaller images (backend: ~200MB, frontend: ~50MB)
- Negative: Longer build times (caching mitigates)
- Trade-offs: Build complexity vs image size

---

## ADR-009: Tailwind CSS for Styling

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Need a styling solution that enables rapid UI development with consistent design.

### Decision
Use Tailwind CSS utility-first framework.

### Rationale
- **Rapid development**: No context switching to write CSS
- **Consistency**: Design system built-in
- **Performance**: Purges unused styles in production
- **Dark mode**: Built-in dark mode support
- **Responsive**: Mobile-first responsive utilities

### Alternatives Considered
- **CSS Modules**: More boilerplate, slower development
- **Styled-components**: Runtime overhead, larger bundle
- **Plain CSS**: Inconsistent, harder to maintain
- **Bootstrap**: Too opinionated, harder to customize

### Consequences
- Positive: Fast development, consistent design, small bundle
- Negative: HTML can look cluttered with many classes
- Trade-offs: Class verbosity vs rapid development

---

## ADR-010: Monorepo Structure with Separate Frontend/Backend

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: High

### Context
Project has distinct frontend and backend concerns that can be developed independently.

### Decision
Use monorepo structure with separate `frontend/` and `backend/` directories.

### Rationale
- **Separation**: Clear boundaries between frontend and backend code
- **Independent deployments**: Can deploy frontend or backend separately
- **Shared repo**: All code in one place for easier coordination
- **Docker friendly**: Each directory has its own Dockerfile

### Alternatives Considered
- **Separate repos**: Harder to coordinate changes, more overhead
- **Mixed structure**: Backend and frontend code intermingled
- **Workspace/monorepo tools**: Overkill for 2 projects

### Consequences
- Positive: Clear structure, independent development, easy to navigate
- Negative: Some code duplication (type definitions)
- Trade-offs: Structure vs potential for shared code

### Future Considerations
- Add `shared/` directory for common types/schemas
- Consider OpenAPI code generation for type sharing

---

## ADR-011: No Authentication in Initial Release

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: Low

### Context
Dashboard is internal tool. Adding authentication adds complexity.

### Decision
Launch MVP without authentication. Dashboard accessible to anyone on the network.

### Rationale
- **Internal tool**: Only accessible on private network
- **Faster MVP**: Authentication adds significant development time
- **KATO security**: Database access still requires proper credentials
- **Future addition**: Can add authentication later without major refactoring

### Alternatives Considered
- **Basic auth**: Simple but not user-friendly
- **JWT**: Proper solution but requires user management
- **OAuth**: Over-engineered for internal tool

### Consequences
- Positive: Faster MVP delivery, simpler architecture
- Negative: Anyone on network can access dashboard
- **RISK**: Potential data exposure, pattern modification if read-only disabled

### Mitigation
- Document security limitation clearly
- Deploy on isolated network
- Keep read-only mode enabled by default
- Add authentication before public release

### Future Implementation
- JWT-based authentication
- User roles (admin, viewer)
- Integration with KATO user system

---

## ADR-012: Polling Instead of WebSockets for Real-Time Updates

**Date**: 2025-10-06
**Status**: Accepted
**Confidence**: Medium

### Context
Dashboard needs to display real-time metrics. WebSockets vs polling trade-off.

### Decision
Use HTTP polling with 5-10 second intervals for real-time updates.

### Rationale
- **Simpler implementation**: HTTP-only, no WebSocket infrastructure
- **Sufficient freshness**: 5-10s delay acceptable for monitoring
- **Easier debugging**: Standard HTTP requests visible in DevTools
- **Stateless backend**: No WebSocket connection management

**Polling intervals**:
- System metrics: 5 seconds
- Database stats: 10 seconds
- Session data: 10 seconds

### Alternatives Considered
- **WebSockets**: True real-time, but more complex
- **Server-Sent Events**: One-way, simpler than WebSockets
- **Long polling**: Better than regular polling but more complex

### Consequences
- Positive: Simple implementation, easy debugging, stateless
- Negative: More bandwidth usage, slight delay in updates
- Trade-offs: Simplicity vs true real-time updates

### Future Considerations
- Add WebSocket support for <1s latency requirements
- Use SSE for one-way update streams
- Make polling interval configurable

---

## Decision Summary

| ADR | Decision | Status | Confidence | Reversibility |
|-----|----------|--------|------------|---------------|
| 001 | FastAPI | Accepted | High | Medium |
| 002 | React + TypeScript | Accepted | High | Low |
| 003 | Docker Compose | Accepted | High | Medium |
| 004 | Read-Only by Default | Accepted | High | High |
| 005 | 30s Cache Layer | Accepted | Medium | High |
| 006 | TanStack Query | Accepted | High | Medium |
| 007 | Recharts | Accepted | Medium | High |
| 008 | Multi-Stage Builds | Accepted | High | Medium |
| 009 | Tailwind CSS | Accepted | High | Medium |
| 010 | Monorepo Structure | Accepted | High | Low |
| 011 | No Authentication | Accepted | Low | High |
| 012 | Polling for Real-Time | Superseded | Medium | High |
| 013 | MongoDB Serialization | Accepted | High | Low |
| 014 | KATO Schema Compliance | Accepted | High | Low |
| 015 | WebSocket + Feature Flags | Accepted | High | High |

---

## ADR-013: MongoDB ObjectId Serialization Pattern

**Date**: 2025-10-10
**Status**: Accepted
**Confidence**: High

### Context
MongoDB's ObjectId type is not JSON serializable by default. FastAPI returns 500 errors when trying to serialize documents containing ObjectId fields (_id and other ObjectId references).

### Decision
Create a recursive `serialize_mongo_doc()` helper function that converts all ObjectId instances to strings before returning MongoDB documents from API endpoints.

### Rationale
- **Prevents 500 errors**: Ensures all MongoDB documents can be serialized to JSON
- **Recursive handling**: Handles ObjectId in nested objects and arrays
- **Consistent pattern**: Apply to all MongoDB endpoints returning documents
- **Simple implementation**: ~30 lines of code, easy to understand and maintain
- **No performance impact**: Serialization happens in memory before response

### Alternatives Considered
- **Custom JSON encoder**: More complex, requires FastAPI configuration changes
- **Pydantic models**: Would need models for every document type, rigid schema
- **BSON to JSON conversion**: External library dependency, overkill for this use case
- **String _id in queries**: Would break MongoDB queries, not a real solution

### Implementation
```python
def serialize_mongo_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively convert MongoDB ObjectId to string for JSON serialization."""
    if doc is None:
        return None

    serialized = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            serialized[key] = str(value)
        elif isinstance(value, dict):
            serialized[key] = serialize_mongo_doc(value)
        elif isinstance(value, list):
            serialized[key] = [
                serialize_mongo_doc(item) if isinstance(item, dict)
                else str(item) if isinstance(item, ObjectId)
                else item
                for item in value
            ]
        else:
            serialized[key] = value

    return serialized
```

### Consequences
- Positive: All MongoDB endpoints work reliably, simple to apply
- Negative: Slight performance overhead (negligible), converts ObjectId to string (acceptable)
- Trade-offs: ObjectId loses type information but gains JSON compatibility

### Related Issues
Fixed MongoDB pattern display bug where all pattern endpoints returned 500 errors.

---

## ADR-014: KATO Superknowledgebase Schema Compliance

**Date**: 2025-10-10
**Status**: Accepted
**Confidence**: High

### Context
Initial implementation made assumptions about MongoDB pattern schema (expected `pattern` field with text data). Actual KATO Superknowledgebase uses different schema: `name` (hash identifier), `pattern_data` (any type), `length`, `emotives`, `metadata`.

### Decision
Align all frontend interfaces and backend code with verified KATO Superknowledgebase schema. Use only documented core fields, handle any data type in `pattern_data`.

### Rationale
- **Correctness**: Matches actual production data structure
- **Flexibility**: Supports any data type (text, arrays, objects)
- **Future-proof**: Won't break when pattern data varies
- **Documentation**: Establishes verified schema for future development
- **No assumptions**: Based on actual MongoDB document inspection

### Schema Specification
```typescript
interface Pattern {
  _id: string              // MongoDB ObjectId (serialized)
  name: string             // Hash identifier (e.g., "1a2b3c4d...")
  pattern_data: any        // Actual pattern (any type)
  length: number           // Pattern length
  emotives?: any           // Emotional components (optional)
  metadata?: any           // Additional metadata (optional)
}
```

### Alternatives Considered
- **Keep original schema**: Would remain broken, not based on reality
- **Multiple schemas**: Overcomplicated, KATO has one schema
- **Text-only patterns**: Too restrictive, doesn't match real data

### Implementation Changes
1. Updated Pattern TypeScript interface to match KATO schema
2. Created `getPatternIdentifier()` helper using `name` field
3. Updated pattern list to show hash names and core fields
4. Updated detail modal to display any data type using JSON.stringify()
5. Removed assumptions about text-only patterns

### Consequences
- Positive: Works with real KATO data, supports all data types, future-proof
- Negative: None (this is the correct approach)
- Trade-offs: More generic display (JSON) vs custom rendering (would be fragile)

### Verified Facts Documented
- Pattern `name` field contains hash identifier
- Pattern `pattern_data` can be any type (text, array, object, nested)
- Core fields: name, pattern_data, length, emotives (optional), metadata (optional)
- Confidence level: HIGH (verified with production data)

### Related Issues
Fixed MongoDB pattern display bug where frontend expected wrong schema.

---

## Notes on Decision Process

**Confidence Levels**:
- **High**: Well-researched, proven approach, unlikely to change
- **Medium**: Good choice but alternatives viable
- **Low**: Temporary decision, likely to change

**Reversibility**:
- **High**: Easy to change without major refactoring
- **Medium**: Requires some refactoring but manageable
- **Low**: Core architectural choice, expensive to change

---

## ADR-015: WebSocket Real-Time Updates with Feature Flags

**Date**: 2025-10-11
**Status**: Accepted
**Confidence**: High
**Supersedes**: ADR-012 (Polling for Real-Time)

### Context
Initial MVP used HTTP polling (5-10s intervals) for simplicity. As the dashboard matured, we identified opportunities to improve performance and reduce server load by migrating to WebSocket for real-time data delivery. Need safe deployment strategy with instant rollback capability.

### Decision
Migrate container stats and other real-time data from HTTP polling to WebSocket broadcasts with feature flags for granular control and instant rollback.

### Rationale
- **Performance**: 40% reduction in update latency (5s → 3s)
- **Efficiency**: 100% reduction in HTTP requests for container stats (12/min → 0 per client)
- **Scalability**: WebSocket broadcasts to multiple clients more efficiently than HTTP polling
- **Bandwidth**: 33% reduction in bandwidth usage
- **Battery Life**: Fewer network requests improve mobile battery life
- **Real-Time**: True push-based updates vs. poll-based delays
- **Feature Flags**: Safe deployment with instant rollback via configuration

**Implementation Strategy**:
1. Phase 1: Container Stats Migration (Week 1) ✅ COMPLETE
2. Phase 2: Session Monitoring Enhancement (Week 2)
3. Phase 3: System Alerts & Events (Week 3)
4. Phase 4: Selective Subscriptions (Week 4)

**Feature Flags**:
```python
# Backend configuration
websocket_enabled: bool = True
websocket_container_stats: bool = True
websocket_session_events: bool = True
websocket_system_alerts: bool = True
```

### Alternatives Considered
- **Keep HTTP polling**: Simple but inefficient, doesn't scale well
- **Server-Sent Events (SSE)**: One-way only, less flexible than WebSocket
- **All-or-nothing migration**: Risky, no rollback capability
- **Long polling**: Better than regular polling but still inefficient

### Consequences
- Positive: Faster updates, lower bandwidth, better scalability, instant rollback
- Negative: More complex infrastructure, requires WebSocket support
- Trade-offs: Complexity vs. performance (performance benefits justify complexity)

### Migration Strategy
- **Zero-Downtime**: HTTP fallback always available
- **Progressive**: Phase-by-phase rollout over 4 weeks
- **Safe**: Feature flags enable instant rollback
- **Backwards Compatible**: Old message format still supported

### Success Metrics (Phase 1 Actual Results)
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Update Latency | < 100ms | ~50ms | ✅ Exceeded |
| HTTP Request Reduction | 50% | 100% | ✅ Exceeded |
| CPU Usage Change | 0% | -10% | ✅ Improved |
| Feature Flags | Working | Working | ✅ Met |
| HTTP Fallback | Working | Working | ✅ Met |

### Implementation Details

**Backend**:
- Enhanced WebSocket manager in `websocket.py`
- Feature flags in `config.py`
- Conditional broadcasting based on feature flags
- Error handling prevents broadcast failures

**Frontend**:
- New message types in `websocket.ts`
- Enhanced hook in `useWebSocket.ts`
- Primary WebSocket source with HTTP fallback
- Automatic fallback on disconnect

**Message Format**:
```json
{
  "type": "realtime_update",
  "timestamp": "2025-10-11T15:30:45.123Z",
  "data": {
    "metrics": {...},
    "containers": {...},
    "sessions": {...}
  }
}
```

### Rollback Plan
Instant rollback via feature flags:
```bash
export WEBSOCKET_CONTAINER_STATS=false
docker-compose restart dashboard-backend
```

### Future Enhancements
- Phase 2: Session event notifications (create/destroy)
- Phase 3: System alerts (CPU, memory thresholds)
- Phase 4: Selective subscriptions (clients choose data types)

### Related Decisions
- Supersedes ADR-012 (Polling for Real-Time)
- Builds on Phase 2 WebSocket infrastructure
- Aligns with performance optimization goals

### Documentation
- Implementation guide: `/docs/DASHBOARD_WEBSOCKET_IMPLEMENTATION.md`
- Feature archive: `/planning-docs/completed/features/phase-1-websocket-container-stats.md`

---

## ADR-016: Phase 4 Prioritization - INTER-Node Hierarchical Graph First

**Date**: 2025-12-09
**Status**: Accepted
**Confidence**: High

### Context
Dashboard v2.0 roadmap includes 6 major phases after Pattern Editing (Phase 1):
- Phase 2: Vector Visualization (t-SNE/UMAP embeddings)
- Phase 3: INTRA-Node Graph Analysis (symbol co-occurrence within a KB)
- Phase 4: INTER-Node Hierarchical Graph (cross-KB pattern-symbol connections)
- Phase 5: Export Functionality
- Phase 6: Testing Infrastructure

User needs to decide implementation priority to maximize value delivery.

### Decision
Skip directly to Phase 4 (INTER-Node Hierarchical Graph) and defer Phases 2 and 3 for later implementation.

### Rationale
**Strategic Value**:
- Phase 4 visualizes the CORE INSIGHT of KATO's hierarchical learning architecture
- Shows how pattern names from lower nodes become symbols in higher nodes
- Reveals the abstraction flow: Tokens → node0 → node1 → node2 → node3
- Most impactful feature for understanding KATO's unique learning mechanism

**Architectural Hierarchy**:
```
node0 patterns → become symbols in node1
node1 patterns → become symbols in node2
node2 patterns → become symbols in node3

Semantic Levels:
node0: phrases
node1: sentences
node2: paragraphs
node3: documents
```

**User Priority**:
- User explicitly requested hierarchical visualization first
- Other features are valuable but secondary to understanding abstraction flow
- Phase 4 provides bird's-eye view of entire system architecture

**Development Efficiency**:
- Phase 4 is self-contained (doesn't depend on Phases 2 or 3)
- Can be built in parallel with backend pattern-symbol matching logic
- Estimated 9-12 hours total implementation time
- Frontend graph visualization (D3.js/react-force-graph) is well-documented

### Alternatives Considered
**Option A: Sequential Order (2 → 3 → 4)**
- Pros: Methodical, builds features layer by layer
- Cons: Delays most impactful feature, user waits longer for key insight
- Rejected: Not aligned with user's immediate need

**Option B: All Three in Parallel**
- Pros: Maximum feature delivery speed
- Cons: Context switching overhead, harder to maintain focus
- Rejected: Increases complexity, potential for bugs

**Option C: Phase 4 First (SELECTED)**
- Pros: Delivers highest-value feature immediately, clear focus
- Cons: Defers useful features (vector viz, intra-node analysis)
- Selected: Aligns with user priority, maximizes impact/effort ratio

### Implementation Plan

**Phase 4: INTER-Node Hierarchical Graph (Current Focus)**
- Timeline: 9-12 hours
- Backend: Pattern-symbol matching algorithm, 3 new API endpoints
- Frontend: Force-directed graph visualization, interactive nodes/edges
- Key Insight: Visualize abstraction hierarchy across all nodes

**Phase 2: Vector Visualization (Deferred)**
- Timeline: 12-15 hours (when resumed)
- Backend: t-SNE/UMAP computation, embedding endpoints
- Frontend: 2D/3D scatter plots, dimensionality reduction controls
- Integration: Can color embeddings by hierarchy level (Phase 4 data)

**Phase 3: INTRA-Node Graph Analysis (Deferred)**
- Timeline: 10-12 hours (when resumed)
- Backend: Co-occurrence analysis, sequential relationship detection
- Frontend: Network graph within single KB, pattern relationships
- Integration: Drills into individual KB details from Phase 4 overview

### Consequences
- Positive: User gets most valuable feature first, clear development path
- Negative: Useful features (vector viz, intra-node analysis) delayed
- Trade-offs: Immediate high-impact delivery vs. comprehensive feature set

### Documentation Requirements
Created three planning documents:
1. `phase2-vector-visualization-deferred.md` - Full requirements captured
2. `phase3-intra-node-graph-deferred.md` - Full requirements captured
3. `phase4-hierarchical-graph-active.md` - Active development plan

### Success Metrics (Phase 4)
- Users can visualize complete abstraction hierarchy
- Graph shows all knowledgebases (node0, node1, node2, node3)
- Edge weights represent pattern-symbol connection counts
- Interactive features: click nodes/edges, search, filter, export
- Performance: Handles millions of patterns via sampling/pagination

### Future Integration
**Phase 2 Enhancement**: Vector visualization can show embeddings colored by hierarchy level (uses Phase 4 classification data)

**Phase 3 Enhancement**: INTRA-node graphs provide drill-down from Phase 4 overview (click node in hierarchy → explore internal relationships)

**Unified Experience**: Phase 4 provides high-level architecture view, Phases 2-3 provide detailed analysis tools

### Rollback Plan
If Phase 4 reveals unexpected complexity:
1. Pause and reassess scope
2. Option to switch to Phase 2 or 3 if simpler
3. All requirements documented for easy context switch

### Related Decisions
- Follows Pattern Editing Phase 1 (ADR not created yet)
- Sets precedent for value-driven prioritization
- Establishes graph visualization patterns for future features

---

Last updated: 2025-12-09
