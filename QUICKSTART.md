# KATO Dashboard - Quick Start Guide

## Prerequisites
- KATO must be running
- Docker and Docker Compose installed

## Start Dashboard (First Time)

```bash
# 1. Navigate to dashboard directory
cd /Users/sevakavakians/PROGRAMMING/kato-dashboard

# 2. Make script executable (first time only)
chmod +x dashboard.sh

# 3. Start the dashboard
./dashboard.sh start
```

The script will:
- ✓ Check if KATO is running
- ✓ Verify network connectivity
- ✓ Start backend and frontend containers
- ✓ Wait for health checks to pass
- ✓ Display access URLs

## Access the Dashboard

- **Dashboard UI**: http://localhost:3001
- **Backend API**: http://localhost:8080
- **API Documentation**: http://localhost:8080/docs

## Common Commands

### Using the Management Script

```bash
./dashboard.sh start      # Start dashboard
./dashboard.sh stop       # Stop dashboard
./dashboard.sh status     # Check health and status
./dashboard.sh logs       # View all logs
./dashboard.sh restart    # Restart services
```

### Using Make (Shorter Commands)

```bash
make start       # Start dashboard
make stop        # Stop dashboard
make status      # Check status
make logs        # View logs
make restart     # Restart
```

## View Logs

```bash
# All logs
./dashboard.sh logs

# Backend only
./dashboard.sh logs backend

# Frontend only
./dashboard.sh logs frontend

# Or with make
make logs
make logs-backend
make logs-frontend
```

## Check Health

```bash
# Detailed status report
./dashboard.sh status

# Quick health check
make health

# Manual checks
curl http://localhost:8080/health
curl http://localhost:3001/health
```

## Development Mode

### Run Backend Locally (without Docker)

```bash
make dev-backend

# Or manually:
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8080
```

### Run Frontend Locally (without Docker)

```bash
make dev-frontend

# Or manually:
cd frontend
npm install
npm run dev
```

## Troubleshooting

### Dashboard won't start

1. **Check if KATO is running:**
   ```bash
   docker ps | grep kato
   ```
   If not running: `cd /path/to/kato && ./start.sh`

2. **Check logs:**
   ```bash
   ./dashboard.sh logs
   ```

3. **Rebuild containers:**
   ```bash
   ./dashboard.sh build --no-cache
   ./dashboard.sh start
   ```

### Can't access the dashboard

1. **Check container status:**
   ```bash
   ./dashboard.sh status
   ```

2. **Check if ports are in use:**
   ```bash
   lsof -i :3000  # Frontend port
   lsof -i :8080  # Backend port
   ```

3. **Restart services:**
   ```bash
   ./dashboard.sh restart
   ```

### Frontend can't reach backend

1. **Check CORS settings** in `backend/.env`
2. **Verify backend is healthy:**
   ```bash
   curl http://localhost:8080/health
   ```

### Backend can't reach KATO

1. **Check KATO is running:**
   ```bash
   docker ps | grep kato
   ```

2. **Verify network connectivity:**
   ```bash
   docker network ls | grep kato-network
   ./dashboard.sh exec backend curl http://kato:8000/health
   ```

## Stop the Dashboard

```bash
./dashboard.sh stop

# Or with make
make stop
```

## Complete Cleanup

```bash
# Stop and remove all containers and volumes
./dashboard.sh clean

# Or with make
make clean
```

## Getting Help

```bash
# Show all available commands
./dashboard.sh help

# Or with make
make help
```

## Next Steps

1. **Explore the UI** at http://localhost:3001
2. **Check API docs** at http://localhost:8080/docs
3. **View metrics** in real-time on the dashboard
4. **Monitor sessions** in the Sessions tab
5. **Browse databases** in the Databases tab

## File Locations

- **Project Root**: `/Users/sevakavakians/PROGRAMMING/kato-dashboard`
- **Backend Code**: `backend/app/`
- **Frontend Code**: `frontend/src/`
- **Configuration**: `backend/.env.example`, `frontend/.env`
- **Documentation**: `README.md`, `CLAUDE.md`

## Support

- **Main Documentation**: See `README.md`
- **Development Guide**: See `CLAUDE.md`
- **KATO Documentation**: See main KATO repository

---

**Quick Reference Card**

| Action | Command |
|--------|---------|
| Start | `./dashboard.sh start` or `make start` |
| Stop | `./dashboard.sh stop` or `make stop` |
| Status | `./dashboard.sh status` or `make status` |
| Logs | `./dashboard.sh logs` or `make logs` |
| Restart | `./dashboard.sh restart` or `make restart` |
| Test | `./dashboard.sh test` or `make test` |
| Clean | `./dashboard.sh clean` or `make clean` |
| Help | `./dashboard.sh help` or `make help` |
