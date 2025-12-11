# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KATO Dashboard is a comprehensive web-based monitoring and management system for the KATO AI platform. It provides real-time system metrics, database analytics, session management, and performance insights through a modern React frontend and FastAPI backend.

## Architecture

### System Components

```
┌─────────────────────────────────────────┐
│    KATO Dashboard (Isolated Container)  │
│  ┌─────────────┐      ┌──────────────┐  │
│  │  React UI   │◄────►│FastAPI Backend│  │
│  │  (Port 3001)│      │  (Port 8080) │  │
│  └─────────────┘      └──────────────┘  │
│         │                      │         │
└─────────┼──────────────────────┼─────────┘
          │                      │
          ▼                      ▼
┌──────────────────────────────────────────┐
│         KATO Network (kato_kato-network) │
│                                           │
│  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │ClickHouse │  │ Qdrant │  │ Redis  │     │
│  └────────┘  └────────┘  └────────┘     │
│                                           │
│  ┌────────────────────────────────────┐  │
│  │       KATO Service (Port 8000)     │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Backend Stack
- **Framework**: FastAPI (Python 3.11+)
- **Database Clients**: ClickHouse Connect, Qdrant Client, Redis (async)
- **HTTP Client**: httpx for KATO API communication
- **Server**: Uvicorn with async/await

### Frontend Stack
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Charts**: Recharts
- **Routing**: React Router v6
- **Icons**: Lucide React

## Development Commands

### Management Script (Recommended)

The dashboard includes `dashboard.sh` for easy management:

```bash
# Start/Stop/Restart
./dashboard.sh start          # Start dashboard (checks KATO first)
./dashboard.sh stop           # Stop dashboard
./dashboard.sh restart        # Restart dashboard

# Monitoring
./dashboard.sh status         # Show health and status
./dashboard.sh logs           # View all logs
./dashboard.sh logs backend   # View backend logs only
./dashboard.sh logs frontend  # View frontend logs only

# Building
./dashboard.sh build          # Build containers
./dashboard.sh build --no-cache  # Rebuild from scratch
./dashboard.sh pull           # Pull latest base images

# Development
./dashboard.sh exec backend   # Shell into backend container
./dashboard.sh exec frontend  # Shell into frontend container
./dashboard.sh test           # Test all endpoints

# Cleanup
./dashboard.sh clean          # Stop and remove all containers
./dashboard.sh help           # Show all commands
```

### Using Makefile (Alternative)

```bash
# Start/Stop
make start                    # Start dashboard
make stop                     # Stop dashboard
make restart                  # Restart dashboard

# Monitoring
make status                   # Show status
make logs                     # All logs
make logs-backend             # Backend logs
make logs-frontend            # Frontend logs

# Development
make dev-backend              # Run backend locally
make dev-frontend             # Run frontend locally
make install                  # Install all dependencies
make shell-backend            # Shell into backend
make shell-frontend           # Shell into frontend

# Building
make build                    # Build containers
make rebuild                  # Rebuild from scratch

# Testing
make test                     # Test endpoints
make health                   # Check health

# Shortcuts
make open                     # Open dashboard in browser
make docs                     # Open API docs in browser
make help                     # Show all commands
```

### Backend Development

```bash
# Option 1: Using make
make dev-backend

# Option 2: Using management script
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8080

# View API docs
open http://localhost:8080/docs  # Swagger UI
open http://localhost:8080/redoc # ReDoc
```

### Frontend Development

```bash
# Option 1: Using make
make dev-frontend

# Option 2: Manual
cd frontend
npm install
npm run dev  # Starts on http://localhost:3001

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Docker Development

```bash
# Using management script (recommended)
./dashboard.sh start
./dashboard.sh stop
./dashboard.sh logs

# Direct docker-compose (if needed)
docker-compose up -d
docker-compose build --no-cache
docker-compose logs -f dashboard-backend
docker-compose down
docker-compose restart dashboard-backend
```

## Project Structure

### Backend (`/backend`)

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry point
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py           # All API endpoints
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py           # Configuration management
│   ├── db/
│   │   ├── __init__.py
│   │   ├── clickhouse.py       # ClickHouse async client
│   │   ├── qdrant.py           # Qdrant client
│   │   ├── redis_client.py     # Redis async client
│   │   ├── hybrid_patterns.py  # Hybrid ClickHouse+Redis pattern storage
│   │   └── symbol_stats.py     # Redis-backed symbol statistics
│   └── services/
│       ├── __init__.py
│       └── kato_api.py         # KATO API client
├── .env.example                # Environment variables template
├── Dockerfile                  # Multi-stage Docker build
└── requirements.txt            # Python dependencies
```

### Frontend (`/frontend`)

```
frontend/
├── src/
│   ├── main.tsx                # Application entry point
│   ├── App.tsx                 # Root component with routing
│   ├── index.css               # Global styles + Tailwind
│   ├── components/
│   │   ├── Layout.tsx          # Main layout with sidebar
│   │   ├── Card.tsx            # Reusable card components
│   │   ├── StatCard.tsx        # Stat display card
│   │   └── SymbolsBrowser.tsx  # Symbol statistics browser
│   ├── pages/
│   │   ├── Dashboard.tsx       # Main dashboard page
│   │   ├── Sessions.tsx        # Session management page
│   │   ├── Databases.tsx       # Database browser page (with Symbols tab)
│   │   ├── Analytics.tsx       # Analytics page
│   │   └── NotFound.tsx        # 404 page
│   ├── lib/
│   │   ├── api.ts              # API client (axios-based)
│   │   └── utils.ts            # Utility functions
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript type definitions
│   └── api/                    # API type definitions
├── index.html                  # HTML template
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── nginx.conf                  # Nginx configuration for production
├── Dockerfile                  # Multi-stage Docker build
└── package.json                # Node dependencies
```

## Key Features and Implementation

### 1. Real-Time Monitoring
**Location**: `frontend/src/pages/Dashboard.tsx`

- Uses TanStack Query with `refetchInterval` for automatic updates
- Displays system metrics (CPU, memory, sessions, requests)
- Recharts for time-series visualizations
- Auto-refresh every 5-10 seconds

### 2. API Client
**Location**: `frontend/src/lib/api.ts` & `backend/app/services/kato_api.py`

- **Frontend**: Axios-based client with interceptors
- **Backend**: httpx async client with caching
- Proxy pattern to KATO API endpoints
- Automatic retry and error handling

### 3. Database Access (Read-Only)
**Locations**:
- ClickHouse: `backend/app/db/mongodb.py`
- Qdrant: `backend/app/db/qdrant.py`
- Redis: `backend/app/db/redis_client.py`

**Important**:
- All connections are READ-ONLY by default (`DATABASE_READ_ONLY=true`)
- Write operations (update/delete) check read-only flag
- Connection pooling for performance
- Health checks for monitoring

### 4. API Endpoints
**Location**: `backend/app/api/routes.py`

All endpoints are prefixed with `/api/v1`:

**System & Health**:
- `GET /health` - Dashboard health
- `GET /system/metrics` - System metrics from KATO
- `GET /system/stats?minutes=10` - Time-series statistics

**Sessions**:
- `GET /sessions/count` - Active session count
- `GET /sessions/{id}` - Session details
- `GET /sessions/{id}/stm` - Session STM

**Hybrid Patterns** (ClickHouse + Redis):
- `GET /databases/patterns/processors` - List all knowledgebases with pattern counts
- `GET /databases/patterns/{kb_id}/patterns` - Get patterns (with pagination, search, sorting)
- `GET /databases/patterns/{kb_id}/statistics` - Pattern statistics for knowledgebase
- `PUT /databases/patterns/{kb_id}/patterns/{pattern_name}` - Update pattern (frequency, emotives, metadata)
- `DELETE /databases/patterns/{kb_id}/patterns/{pattern_name}` - Delete single pattern
- `POST /databases/patterns/{kb_id}/patterns/bulk-delete` - Bulk delete patterns
- `DELETE /databases/patterns/{kb_id}` - Delete entire knowledgebase

**Qdrant**:
- `GET /databases/qdrant/collections` - List all collections
- `GET /databases/qdrant/processors` - Processor-specific collections
- `GET /databases/qdrant/collections/{name}` - Collection stats

**Redis**:
- `GET /databases/redis/info` - Redis server info
- `GET /databases/redis/keys?pattern=*` - List keys
- `GET /databases/redis/sessions` - Session keys
- `POST /databases/redis/flush` - Flush cache (admin only)

**Symbols** (Redis-backed):
- `GET /databases/symbols/processors` - List processors with symbol data
- `GET /databases/symbols/{kb_id}` - Get paginated symbols (supports: skip, limit, sort_by, sort_order, search)
- `GET /databases/symbols/{kb_id}/statistics` - Get aggregate statistics

**Analytics**:
- `GET /analytics/overview` - Comprehensive overview

**Hierarchical Graph** (Pattern Visualization):
- `GET /analytics/graphs/hierarchy/patterns/trace/{pattern_name}` - Trace pattern connections (query params: kb_id, max_depth)

### 5. Hierarchical Graph Pattern Visualization
**Location**: `frontend/src/pages/HierarchicalGraph.tsx`, `backend/app/services/hierarchy_analysis.py`

The dashboard includes an interactive graph visualization that reveals KATO's hierarchical learning architecture by showing compositional relationships between patterns.

**Key Features**:
- **Pattern-Level Visualization**: Individual patterns as nodes (not KB aggregates)
- **Compositional Relationships**: Shows which patterns contain which patterns (PTRN| references)
- **Progressive Exploration**: Click patterns to trace and expand the graph incrementally
- **7 Layout Modes**:
  - Force-Directed: Physics-based natural clustering
  - Hierarchical (Bottom-Up): node0 at bottom → node3 at top (DEFAULT)
  - Hierarchical (Top-Down): Inverted hierarchy
  - Hierarchical (Left-Right): Horizontal left-to-right flow
  - Hierarchical (Right-Left): Horizontal right-to-left flow
  - Radial (Outward): Concentric circles expanding outward
  - Radial (Inward): Concentric circles collapsing inward
- **Interactive Highlighting**: Click nodes to highlight their connection network (BFS traversal)
- **Statistics Dashboard**: Total patterns, connections, patterns traced, origin pattern
- **Color-Coded Levels**:
  - Blue: node0 (base patterns/phrases)
  - Green: node1 (sentences)
  - Yellow: node2 (paragraphs)
  - Red: node3 (documents)
  - Amber: Highlighted selections

**User Workflow**:
1. Start with a pattern ID from the Patterns browser
2. Enter pattern ID and click "Trace Pattern"
3. Graph loads with pattern and its compositional connections
4. Click patterns in the graph to see details
5. Click "Trace This Pattern" button to expand the graph
6. Graph accumulates progressively (no duplicates)
7. Select patterns to highlight their connection network
8. Switch layouts for different perspectives

**Backend Implementation**:
- `hierarchy_analysis.py`: Pattern tracing service (~287 lines)
- `parse_pattern_references()`: Extracts PTRN| references from pattern data
- `trace_pattern_graph()`: Bidirectional tracing (ancestors + descendants) with depth limit
- Returns nodes with full pattern metadata + edges with relationship types

**Frontend Implementation**:
- `HierarchicalGraph.tsx`: Main visualization component (~600 lines)
- Uses `react-force-graph-2d` library for rendering
- Graph accumulation with Map/Set deduplication
- BFS highlighting algorithm for connected nodes
- Dynamic layout positioning based on mode
- Performance optimizations: warmupTicks, cooldownTicks

**Performance**:
- API response time: ~200ms (target <500ms)
- Graph render time: ~500ms (target <1s)
- Layout switch time: ~300ms (target <1s)
- Handles 200-300 nodes comfortably
- Memory usage: ~60MB (target <100MB)

### 6. UI Patterns for Destructive Operations
**Location**: `frontend/src/pages/Databases.tsx`

The dashboard implements consistent UI patterns for destructive operations (deletions) with appropriate safeguards:

**Double Confirmation Pattern**:
- **Single Knowledgebase Deletion**: Uses simple double confirmation (two `window.confirm` dialogs)
  - First confirmation: Shows warning with details (KB ID, pattern count, what will be deleted)
  - Second confirmation: Final "Are you absolutely sure?" message
  - No typed confirmation required - simpler UX for single deletions

**Bulk Selection and Deletion**:
- **Checkbox Selection**: All list views (processors, patterns, collections, points) support checkbox selection
  - Individual checkboxes for each item
  - "Select All" toggle in header
  - Visual feedback for selected items
- **Bulk Delete Button**: Appears when items are selected, shows count
- **Bulk Delete Confirmation**:
  - First confirmation: Shows list of items to delete and counts
  - Second confirmation: Final warning with total impact
  - Results summary after completion (success/failure counts)

**Implemented For**:
- Knowledgebases (single + bulk): Delete entire KB with all patterns
- Patterns (single + bulk): Delete patterns from a knowledgebase
- Qdrant Collections (single + bulk): Delete vector collections
- Qdrant Points (bulk): Delete vectors from a collection

**Design Rationale**:
- Simple double confirmation for single deletions (no typing required)
- Bulk operations show comprehensive impact before proceeding
- Consistent pattern across all database entities
- Results feedback helps users understand what succeeded/failed
- All operations respect `DATABASE_READ_ONLY` flag on backend

## Configuration

### Backend Environment Variables

Create `.env` file in `backend/` directory:

```env
# KATO API
KATO_API_URL=http://kato:8000

# Database Connections (Read-Only)
DATABASE_READ_ONLY=true
QDRANT_URL=http://qdrant:6333
REDIS_URL=redis://redis:6379

# Server Configuration
HOST=0.0.0.0
PORT=8080
LOG_LEVEL=INFO

# Security
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
SECRET_KEY=change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
CORS_ORIGINS=http://localhost:3001,http://localhost:8080

# Cache Configuration
CACHE_TTL_SECONDS=30
MAX_CACHE_SIZE=1000
```

### Frontend Environment Variables

Create `.env` file in `frontend/` directory:

```env
VITE_API_URL=http://localhost:8080
```

## Docker Deployment

### Prerequisites
1. KATO must be running
2. KATO network must exist: `kato_kato-network`

### Starting the Dashboard

```bash
# Ensure KATO is running
cd /path/to/kato
./start.sh

# Start dashboard
cd /path/to/kato-dashboard
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Accessing Services
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:8080
- **API Docs**: http://localhost:8080/docs

### Health Checks

Both services have health check endpoints:
- Backend: `curl http://localhost:8080/health`
- Frontend: `curl http://localhost:3001/health`

## Development Workflow

### Adding a New API Endpoint

1. **Backend** (`backend/app/api/routes.py`):
```python
@router.get("/new-endpoint")
async def new_endpoint():
    # Implementation
    return {"data": "response"}
```

2. **Frontend API Client** (`frontend/src/lib/api.ts`):
```typescript
async getNewData() {
  const { data } = await this.client.get('/new-endpoint')
  return data
}
```

3. **Frontend Component**:
```typescript
const { data } = useQuery({
  queryKey: ['newData'],
  queryFn: () => apiClient.getNewData()
})
```

### Adding a New Page

1. Create page component in `frontend/src/pages/NewPage.tsx`
2. Add route in `frontend/src/App.tsx`:
```typescript
<Route path="new-page" element={<NewPage />} />
```
3. Add navigation link in `frontend/src/components/Layout.tsx`

### Styling Guidelines

- Use Tailwind CSS utility classes
- Follow dark mode pattern: `className="bg-white dark:bg-gray-800"`
- Use custom CSS variables defined in `index.css` for theme colors
- Responsive design: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`

## Testing

### Backend Testing

```bash
cd backend

# Install dev dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=app --cov-report=html
```

### Frontend Testing

```bash
cd frontend

# Install dev dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom vitest

# Run tests
npm test

# With coverage
npm run test:coverage
```

## Performance Optimizations

1. **Backend Caching**: 30-second TTL for metrics endpoints
2. **Frontend Query Caching**: TanStack Query with stale time
3. **Database Pagination**: All list endpoints support skip/limit
4. **Connection Pooling**: Reused connections for all databases
5. **Code Splitting**: Vite automatically splits code
6. **Lazy Loading**: Images and charts loaded on demand

## Troubleshooting

### Backend won't start
- Check that KATO is running: `docker ps | grep kato`
- Verify network exists: `docker network ls | grep kato-network`
- Check environment variables in `.env`
- View logs: `docker-compose logs dashboard-backend`

### Frontend build fails
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check Node version: `node --version` (should be 18+)
- Clear Vite cache: `rm -rf node_modules/.vite`

### Can't connect to databases
- Verify dashboard is on KATO network: `docker inspect kato-dashboard-backend`
- Test database connectivity from container:
```bash
docker exec -it kato-dashboard-backend python -c "from app.db.mongodb import get_mongo_client; import asyncio; asyncio.run(get_mongo_client())"
```

### CORS errors in browser
- Check `CORS_ORIGINS` in backend `.env`
- Verify frontend is using correct API URL
- Check browser console for exact error

## Security Considerations

1. **Read-Only Mode**: Enabled by default for ClickHouse
2. **Admin Auth**: TODO - Implement JWT authentication
3. **CORS**: Restricted to configured origins
4. **Rate Limiting**: TODO - Add rate limiting middleware
5. **Input Validation**: Pydantic models for all inputs
6. **SQL Injection**: N/A - using ClickHouse with proper queries

## Future Enhancements

### Completed Features
- [x] WebSocket support for real-time updates (Phases 1-4 complete)
- [x] Session management UI (view/delete sessions)
- [x] Docker container stats monitoring
- [x] Knowledgebase deletion from UI
- [x] Bulk delete operations for patterns
- [x] Pattern editing interface (full-stack: backend + frontend COMPLETE)
- [x] Hierarchical graph visualization (pattern-level compositional relationships, 7 layouts)

### Planned Features

**Dashboard v2.0 Roadmap**:
- [ ] Phase 2: Vector visualization (t-SNE/UMAP for pattern embeddings) - DEFERRED
- [ ] Phase 3: INTRA-Node graph analysis (symbol co-occurrence) - DEFERRED
- [ ] Phase 5: Export functionality (CSV/JSON/GraphML for patterns, analytics, graphs)
- [ ] Phase 6: Testing infrastructure (unit, integration, E2E tests)

**Quality & Security**:
- [ ] User authentication (JWT-based admin auth)
- [ ] Rate limiting middleware for API endpoints
- [ ] Audit logging for destructive operations
- [ ] Error tracking integration (Sentry)
- [ ] Mobile responsive improvements

**Graph Enhancements**:
- [ ] Pattern editing from graph view (inline updates)
- [ ] Advanced graph filtering (by pattern properties, level, frequency)
- [ ] Graph export (GraphML, GEXF, PNG, SVG)
- [ ] 3D visualization mode (react-force-graph-3d)
- [ ] Community detection and clustering
- [ ] Path finding between patterns

### Technical Debt
- Add comprehensive test coverage (60%+ target)
- Implement proper error boundaries
- Add logging aggregation
- Optimize bundle size
- Add service worker for offline support
- Virtual scrolling for large pattern lists

## Dependencies

### Backend Key Dependencies
- `fastapi` - Web framework
- `motor` - Async ClickHouse client
- `qdrant-client` - Vector database client
- `redis` - Redis client
- `httpx` - Async HTTP client
- `pydantic` - Data validation

### Frontend Key Dependencies
- `react` - UI framework
- `react-router-dom` - Routing
- `@tanstack/react-query` - Server state management
- `recharts` - Charts and visualizations
- `react-force-graph-2d` - Interactive graph visualization (Phase 4)
- `axios` - HTTP client
- `tailwindcss` - Utility-first CSS
- `lucide-react` - Icon library

## Contributing Guidelines

1. Follow existing code structure and patterns
2. Use TypeScript for all new frontend code
3. Add type hints to all Python functions
4. Write tests for new features
5. Update this CLAUDE.md when adding new features
6. Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`

## Useful Commands Reference

```bash
# Dashboard Management (RECOMMENDED)
./dashboard.sh start              # Start with health checks
./dashboard.sh stop               # Stop cleanly
./dashboard.sh status             # Full status report
./dashboard.sh logs backend       # View logs
./dashboard.sh test               # Test all endpoints
./dashboard.sh exec backend bash  # Shell access

# Makefile Shortcuts
make start                        # Quick start
make status                       # Check health
make dev-backend                  # Local development
make test                         # Run tests
make clean                        # Clean up

# Backend Development
cd backend
python -m uvicorn app.main:app --reload --port 8080
pip freeze > requirements.txt
python -m pytest tests/

# Frontend Development
cd frontend
npm run dev                       # Development server
npm run build                     # Production build
npm run preview                   # Preview build
npm run lint                      # Lint code

# Docker (Direct)
docker-compose up -d --build      # Build and start
docker-compose down -v            # Stop and remove volumes
docker-compose restart <service>  # Restart service
docker-compose logs -f <service>  # Follow logs
docker exec -it kato-dashboard-backend bash
docker exec -it kato-dashboard-frontend sh

# Database Direct Access
docker exec -it kato-mongodb mongo
docker exec -it kato-redis redis-cli
curl http://localhost:6333/collections  # Qdrant

# API Testing
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/system/metrics
curl http://localhost:8080/api/v1/analytics/overview
```

## Contact and Support

For issues related to:
- **KATO Core**: See main KATO repository
- **Dashboard**: Create issue in this repository
- **Docker/Deployment**: Check docker-compose.yml and network configuration
