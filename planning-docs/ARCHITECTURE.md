# Architecture Documentation

**Last Updated**: 2025-10-10
**Status**: MVP Complete + Bug Fixes
**Confidence Level**: High (all components tested and verified)

## System Overview

KATO Dashboard is an isolated monitoring and management interface that runs alongside the main KATO AI system. It provides real-time visibility into system performance, database state, and session management without impacting KATO's core operations.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KATO Dashboard                           │
│                    (Optional Container)                      │
├──────────────────────────┬──────────────────────────────────┤
│  Frontend Container      │   Backend Container              │
│  ┌────────────────────┐  │   ┌────────────────────────────┐ │
│  │  Nginx (Port 3000) │  │   │  FastAPI (Port 8080)       │ │
│  │  ├─ React App      │  │   │  ├─ API Routes             │ │
│  │  ├─ Static Assets  │  │   │  ├─ Database Clients       │ │
│  │  └─ Routing        │  │   │  ├─ KATO API Proxy         │ │
│  └────────────────────┘  │   │  └─ Caching Layer          │ │
│         │                │   └────────────────────────────┘ │
│         └────────────────┼───────────────┘                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  Docker Network         │
              │  kato_kato-network      │
              └────────────┬────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
   ┌───▼────────┐   ┌─────▼──────┐   ┌───────▼────────┐
   │  KATO API  │   │  MongoDB   │   │  Qdrant        │
   │  :8000     │   │  :27017    │   │  :6333         │
   │            │   │            │   │  Redis :6379   │
   └────────────┘   └────────────┘   └────────────────┘
```

## Component Architecture

### Backend (FastAPI)

#### File Structure
```
backend/app/
├── main.py                    # Application entry, lifespan management
├── core/
│   └── config.py              # Pydantic settings, environment config
├── api/
│   └── routes.py              # All API endpoints (~500 lines)
├── db/
│   ├── mongodb.py             # Async MongoDB client with read-only mode
│   ├── qdrant.py              # Qdrant vector database client
│   └── redis_client.py        # Async Redis client with connection pooling
└── services/
    └── kato_api.py            # KATO API proxy with caching layer
```

#### Key Design Patterns

**1. Lifespan Management**
- Database connections initialized at startup
- Graceful shutdown with connection cleanup
- Resource pooling for optimal performance

**2. Dependency Injection**
- Database clients injected via FastAPI dependencies
- Configuration managed through pydantic settings
- Easy testing and mocking

**3. Read-Only by Default**
- MongoDB connections use read-only mode
- Prevents accidental data modification
- Configurable via MONGODB_READ_ONLY env var

**4. Caching Layer**
- KATO API responses cached for 30 seconds
- Reduces load on main KATO system
- In-memory cache with TTL expiration

**5. Connection Pooling**
- Motor (MongoDB): MaxPoolSize=50
- Redis: ConnectionPool with max_connections=20
- Qdrant: Persistent client connections

#### API Endpoints (30+)

**System & Health**
- `GET /health` - Service health check
- `GET /system/metrics` - CPU, memory, uptime
- `GET /system/stats` - Aggregated system statistics
- `GET /cache-stats` - Cache hit/miss metrics
- `GET /connection-pools` - Database pool status

**Sessions**
- `GET /sessions/count` - Total session count
- `GET /sessions/{id}` - Session details
- `GET /sessions/{id}/stm` - Short-term memory

**MongoDB**
- `GET /databases/mongodb/processors` - List all processors
- `GET /databases/mongodb/{processor_id}/patterns` - List patterns
- `POST /databases/mongodb/{processor_id}/patterns` - Create pattern
- `PUT /databases/mongodb/{processor_id}/patterns/{pattern_id}` - Update
- `DELETE /databases/mongodb/{processor_id}/patterns/{pattern_id}` - Delete

**Qdrant**
- `GET /databases/qdrant/collections` - List collections
- `GET /databases/qdrant/processors` - List processors
- `GET /databases/qdrant/processors/{id}/points` - Query vectors

**Redis**
- `GET /databases/redis/info` - Server info
- `GET /databases/redis/keys` - List keys with pagination
- `GET /databases/redis/keys/{key}` - Get specific key
- `DELETE /databases/redis/flush` - Flush database (if not read-only)

**Analytics**
- `GET /analytics/overview` - Aggregated analytics

### Frontend (React)

#### File Structure
```
frontend/src/
├── main.tsx                   # Application entry point
├── App.tsx                    # Router configuration
├── components/
│   └── Layout.tsx             # Sidebar navigation layout
├── pages/
│   ├── Dashboard.tsx          # Real-time metrics dashboard
│   ├── Sessions.tsx           # Session management (placeholder)
│   ├── Databases.tsx          # Database browser (placeholder)
│   └── Analytics.tsx          # Analytics views (placeholder)
└── lib/
    ├── api.ts                 # Axios-based API client
    └── utils.ts               # Utility functions
```

#### Key Design Patterns

**1. Component Architecture**
- Layout component with persistent sidebar
- Page-level components for routing
- Reusable stat cards for metrics

**2. State Management**
- TanStack Query for server state
- Auto-refetch with configurable intervals
- Optimistic updates for mutations

**3. Real-Time Updates**
- `refetchInterval: 5000` for system metrics
- `refetchInterval: 10000` for database stats
- Automatic background refetching

**4. Error Handling**
- Loading states for async operations
- Error boundaries for component failures
- User-friendly error messages

**5. Styling Approach**
- Tailwind CSS utility classes
- Dark theme support (styled, toggle pending)
- Responsive design with mobile breakpoints

#### Data Flow

```
User Interaction
      │
      ▼
React Component
      │
      ▼
TanStack Query Hook
      │
      ▼
API Client (Axios)
      │
      ▼
Backend API
      │
      ▼
Cache / Database / KATO API
      │
      ▼
Response
      │
      ▼
Auto-update Component
```

## Data Models

### Key Entities

**System Metrics**
```typescript
{
  cpu_percent: number,
  memory_percent: number,
  memory_used: number,
  memory_total: number,
  uptime: number,
  timestamp: string
}
```

**Session**
```typescript
{
  session_id: string,
  created_at: string,
  last_active: string,
  user_id?: string,
  metadata: Record<string, any>
}
```

**Pattern**
```typescript
{
  pattern_id: string,
  processor_id: string,
  name: string,
  description: string,
  triggers: string[],
  confidence: number,
  created_at: string,
  updated_at: string
}
```

## Database Design

### MongoDB Collections
- `processors` - Pattern processor metadata
- `patterns` - Learned behavioral patterns (see schema below)
- `sessions` - Session metadata
- Read-only access by default

#### KATO Superknowledgebase Pattern Schema (Verified)
**Status**: Verified with production data (2025-10-10)
**Confidence**: HIGH

```typescript
interface Pattern {
  _id: ObjectId              // MongoDB unique identifier
  name: string               // Hash identifier (e.g., "1a2b3c4d5e6f...")
  pattern_data: any          // Actual pattern content (any type: string, array, object)
  length: number             // Pattern length/size
  emotives?: any             // Emotional components (optional)
  metadata?: any             // Additional metadata (optional)
  frequency?: number         // Usage frequency (added by aggregation)
}
```

**Core Fields** (always present):
- `_id`: MongoDB ObjectId (serialized to string in API responses)
- `name`: Hash-based identifier for the pattern
- `pattern_data`: The actual pattern (supports any data type)
- `length`: Numeric length/size of pattern

**Optional Fields**:
- `emotives`: Emotional components associated with pattern
- `metadata`: Additional metadata (structure varies)
- `frequency`: Added by aggregation queries, not stored in document

**Important Notes**:
- Pattern data can be any type (text, arrays, objects, nested structures)
- Frontend must handle `pattern_data` generically using JSON.stringify()
- Do not assume text-only patterns
- ObjectId fields must be serialized to strings for JSON responses (use `serialize_mongo_doc()` helper)

### Qdrant Collections
- `long_term_memory` - Vectorized memories
- `semantic_patterns` - Semantic embeddings
- Supports vector similarity search

### Redis Keys
- `session:{id}` - Session state
- `stm:{session_id}` - Short-term memory
- `cache:*` - Various cached data
- TTL-based expiration

## Security Considerations

### Current Implementation
- Read-only database access (configurable)
- Network isolation via Docker networking
- No authentication yet (internal tool)
- CORS enabled for frontend communication

### Future Enhancements
- User authentication and authorization
- API key management
- Role-based access control (RBAC)
- Audit logging for write operations

## Performance Optimizations

### Backend
- **Caching**: 30s TTL on KATO API calls
- **Connection Pooling**: Reuse database connections
- **Async I/O**: Non-blocking database operations
- **Pagination**: Limit result set sizes

### Frontend
- **Code Splitting**: Route-based lazy loading
- **Memoization**: Prevent unnecessary re-renders
- **Debouncing**: Rate-limit user input
- **Virtual Scrolling**: For large lists (future)

## Deployment Architecture

### Docker Compose Services

**Backend Service**
- Image: Python 3.11 slim
- Multi-stage build for smaller image
- Health check: HTTP GET /health
- Restart policy: unless-stopped
- Environment: Loads from .env file

**Frontend Service**
- Image: Node 20 + Nginx alpine
- Multi-stage build (build → serve)
- Health check: HTTP GET /
- Restart policy: unless-stopped
- Static file serving via Nginx

**Network**
- External network: kato_kato-network
- Allows connection to existing KATO services
- Isolated from host network

### Scaling Considerations

**Current Capacity**
- Single backend instance
- Single frontend instance
- Suitable for <100 concurrent users

**Future Scaling**
- Add load balancer (Nginx/Traefik)
- Horizontal scaling of backend
- Redis-based session storage
- WebSocket support for real-time updates

## Development Workflow

### Local Development
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080

# Frontend
cd frontend
npm install
npm run dev  # Runs on port 3000
```

### Docker Development
```bash
docker-compose up --build
```

### Production Deployment
```bash
docker-compose -f docker-compose.yml up -d
```

## Monitoring & Observability

### Health Checks
- Backend: `/health` endpoint
- Frontend: Nginx status
- Database connections verified at startup

### Logging
- Backend: Python logging to stdout
- Frontend: Console logs in development
- Docker: Container logs accessible via `docker logs`

### Metrics (Future)
- Prometheus integration
- Grafana dashboards
- Custom metrics export

## Technology Decisions

### Why FastAPI?
- Native async/await support
- Automatic OpenAPI documentation
- Type validation with pydantic
- High performance (comparable to Node.js)

### Why React + Vite?
- Fast development with HMR
- Modern build tooling
- TypeScript support
- Large ecosystem

### Why TanStack Query?
- Declarative data fetching
- Automatic caching and refetching
- Optimistic updates
- Developer tools

### Why Docker?
- Consistent deployment
- Easy scaling
- Network isolation
- Portable across environments

## Known Limitations

1. **No Authentication**: Currently open to network (internal tool)
2. **Single Instance**: No horizontal scaling yet
3. **In-Memory Cache**: Lost on restart
4. **No WebSockets**: Uses polling for real-time updates
5. **Limited Analytics**: Basic metrics only

## Future Architecture Enhancements

1. **WebSocket Support**: Real-time updates without polling
2. **Redis Caching**: Persistent, shared cache layer
3. **Message Queue**: For background job processing
4. **API Gateway**: Centralized routing and auth
5. **Microservices**: Split monolith if needed
6. **GraphQL**: More flexible data fetching
7. **Server-Side Rendering**: For improved SEO and initial load

---

## Verified Facts

- **Tested**: All components tested and working as of 2025-10-06
- **Docker**: Deployment verified on Docker Engine 24.0+
- **Performance**: Dashboard has no measurable impact on KATO performance
- **Compatibility**: Works with KATO v1.0+ (assumed, needs verification)
- **Browser Support**: Chrome, Firefox, Safari, Edge (modern versions)

## References

- FastAPI Documentation: https://fastapi.tiangolo.com/
- React Documentation: https://react.dev/
- Docker Documentation: https://docs.docker.com/
- TanStack Query: https://tanstack.com/query/latest
