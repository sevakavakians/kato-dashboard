# KATO Dashboard

A comprehensive web-based monitoring and management dashboard for the KATO AI system.

## Features

- **Real-Time Monitoring**: Live system metrics, performance stats, and resource usage
- **Session Management**: View and manage active KATO sessions
- **Database Analytics**: Browse and analyze ClickHouse patterns, Qdrant vectors, and Redis cache
- **Performance Insights**: Detailed charts and visualizations for system performance
- **Pattern Analysis**: Explore learned patterns, frequencies, and emotive data

## Architecture

The dashboard consists of two main components:

1. **Backend (FastAPI)**: Python-based API server that connects to KATO and databases
2. **Frontend (React + TypeScript)**: Modern web interface with real-time updates

## Prerequisites

- Docker and Docker Compose
- KATO system running (see main KATO repository)
- Access to KATO's network: `kato_kato-network`

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd kato-dashboard
```

### 2. Configuration

The dashboard uses environment variables for configuration. Default values are provided in:
- Backend: `backend/.env.example`
- Frontend: Built-in defaults

For production, create `.env` files with your custom settings.

### 3. Start Dashboard

```bash
# Make sure KATO is running first!
cd /path/to/kato
./start.sh

# Then start the dashboard
cd /path/to/kato-dashboard
./dashboard.sh start

# Or using make
make start
```

### 4. Access Dashboard

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:8080
- **API Docs**: http://localhost:8080/docs

## Management Script

The dashboard includes a management script for easy control:

```bash
./dashboard.sh [command]
```

**Available Commands:**
- `start` - Start the dashboard
- `stop` - Stop the dashboard
- `restart` - Restart the dashboard
- `status` - Show status and health checks
- `logs [backend|frontend]` - View logs
- `build [--no-cache]` - Build containers
- `clean` - Remove all containers and volumes
- `exec <service>` - Open shell in container
- `test` - Test all endpoints
- `help` - Show help message

**Examples:**
```bash
./dashboard.sh start           # Start everything
./dashboard.sh status          # Check health
./dashboard.sh logs backend    # View backend logs
./dashboard.sh exec backend    # Shell into backend
./dashboard.sh test            # Test endpoints
./dashboard.sh stop            # Stop everything
```

**Using Make (alternative):**
```bash
make start          # Start dashboard
make stop           # Stop dashboard
make restart        # Restart
make status         # Show status
make logs           # View all logs
make logs-backend   # Backend logs only
make test           # Test endpoints
make dev-backend    # Run backend locally
make dev-frontend   # Run frontend locally
make help           # Show all commands
```

## Development

### Backend Development

```bash
# Option 1: Using make
make dev-backend

# Option 2: Manual setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8080
```

### Frontend Development

```bash
# Option 1: Using make
make dev-frontend

# Option 2: Manual setup
cd frontend
npm install
npm run dev
```

### Install Dependencies

```bash
# Install both backend and frontend dependencies
make install

# Or individually
make install-backend
make install-frontend
```

## API Endpoints

### System & Health
- `GET /api/v1/health` - Dashboard health check
- `GET /api/v1/system/metrics` - Comprehensive system metrics
- `GET /api/v1/system/stats` - Time-series statistics

### Sessions
- `GET /api/v1/sessions/count` - Active session count
- `GET /api/v1/sessions/{id}` - Session details
- `GET /api/v1/sessions/{id}/stm` - Session short-term memory

### Hybrid Patterns (ClickHouse + Redis)
- `GET /api/v1/databases/patterns/processors` - List all knowledgebases
- `GET /api/v1/databases/patterns/{kb_id}/patterns` - Get patterns (pagination, search, sorting)
- `GET /api/v1/databases/patterns/{kb_id}/statistics` - Pattern statistics
- `DELETE /api/v1/databases/patterns/{kb_id}/patterns/{pattern_name}` - Delete single pattern
- `POST /api/v1/databases/patterns/{kb_id}/patterns/bulk-delete` - Bulk delete patterns
- `DELETE /api/v1/databases/patterns/{kb_id}` - Delete entire knowledgebase

### Qdrant
- `GET /api/v1/databases/qdrant/collections` - List all collections
- `GET /api/v1/databases/qdrant/processors` - Processor collections
- `GET /api/v1/databases/qdrant/collections/{name}` - Collection stats

### Redis
- `GET /api/v1/databases/redis/info` - Redis server info
- `GET /api/v1/databases/redis/keys` - List keys
- `GET /api/v1/databases/redis/sessions` - Session keys
- `POST /api/v1/databases/redis/flush` - Flush cache

## Configuration

### Backend Environment Variables

```env
# KATO API
KATO_API_URL=http://kato:8000

# Databases (Read-Only)
# MONGO_URL (removed)=mongodb://mongodb:27017
DATABASE_READ_ONLY=true
QDRANT_URL=http://qdrant:6333
REDIS_URL=redis://redis:6379

# Server
HOST=0.0.0.0
PORT=8080
LOG_LEVEL=INFO

# Security
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
SECRET_KEY=your-secret-key

# CORS
CORS_ORIGINS=http://localhost:3001

# Cache
CACHE_TTL_SECONDS=30
MAX_CACHE_SIZE=1000
```

### Frontend Environment Variables

```env
VITE_API_URL=http://localhost:8080
```

## Security

- **Read-Only Mode**: By default, ClickHouse connections are read-only
- **Admin Authentication**: (Optional) JWT-based authentication for admin operations
- **CORS**: Configured to allow only specified origins
- **Rate Limiting**: (TODO) Implement rate limiting for destructive operations

## Troubleshooting

### Dashboard can't connect to KATO

1. Ensure KATO is running: `docker ps | grep kato`
2. Check network: `docker network ls | grep kato-network`
3. Verify dashboard is on the same network: `docker inspect kato-dashboard-backend`

### Database connection errors

1. Check that ClickHouse, Qdrant, and Redis are accessible from the dashboard network
2. Verify connection URLs in environment variables
3. Check logs: `docker-compose logs dashboard-backend`

### Frontend can't reach backend

1. Verify backend is running: `curl http://localhost:8080/health`
2. Check CORS settings in backend `.env`
3. Check browser console for CORS errors

## Performance

The dashboard is optimized for:
- **Low latency**: Caching of frequently accessed data (30s default TTL)
- **High throughput**: Async I/O for all database operations
- **Real-time updates**: WebSocket support for live metrics (TODO)
- **Efficient pagination**: All list endpoints support skip/limit

## Contributing

See `CLAUDE.md` for development guidelines and architecture details.

## License

Same license as KATO (see LICENSE file in root directory)
