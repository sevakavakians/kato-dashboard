# KATO Dashboard Makefile
# Convenient shortcuts for common operations

.PHONY: help start stop restart status logs build clean test dev-backend dev-frontend install

# Default target
help:
	@echo "KATO Dashboard - Available Commands"
	@echo ""
	@echo "  make start          - Start the dashboard containers"
	@echo "  make stop           - Stop the dashboard containers"
	@echo "  make restart        - Restart the dashboard"
	@echo "  make status         - Show dashboard status"
	@echo "  make logs           - View all logs"
	@echo "  make logs-backend   - View backend logs"
	@echo "  make logs-frontend  - View frontend logs"
	@echo "  make build          - Build containers"
	@echo "  make rebuild        - Rebuild containers from scratch (no cache)"
	@echo "  make clean          - Stop and remove all containers"
	@echo "  make test           - Test all endpoints"
	@echo ""
	@echo "Development:"
	@echo "  make dev-backend    - Run backend in development mode"
	@echo "  make dev-frontend   - Run frontend in development mode"
	@echo "  make install        - Install dependencies (backend & frontend)"
	@echo "  make shell-backend  - Open shell in backend container"
	@echo "  make shell-frontend - Open shell in frontend container"
	@echo ""

# Container management
start:
	@./dashboard.sh start

stop:
	@./dashboard.sh stop

restart:
	@./dashboard.sh restart

status:
	@./dashboard.sh status

# Logs
logs:
	@./dashboard.sh logs

logs-backend:
	@./dashboard.sh logs backend

logs-frontend:
	@./dashboard.sh logs frontend

# Build
build:
	@./dashboard.sh build

rebuild:
	@./dashboard.sh build --no-cache

clean:
	@./dashboard.sh clean

# Testing
test:
	@./dashboard.sh test

# Development commands
dev-backend:
	@echo "Starting backend in development mode..."
	@cd backend && \
	if [ ! -d "venv" ]; then \
		echo "Creating virtual environment..."; \
		python3 -m venv venv; \
	fi && \
	. venv/bin/activate && \
	pip install -r requirements.txt && \
	python -m uvicorn app.main:app --reload --port 8080

dev-frontend:
	@echo "Starting frontend in development mode..."
	@cd frontend && \
	if [ ! -d "node_modules" ]; then \
		echo "Installing dependencies..."; \
		npm install; \
	fi && \
	npm run dev

# Installation
install: install-backend install-frontend

install-backend:
	@echo "Installing backend dependencies..."
	@cd backend && \
	python3 -m venv venv && \
	. venv/bin/activate && \
	pip install -r requirements.txt
	@echo "✓ Backend dependencies installed"

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install
	@echo "✓ Frontend dependencies installed"

# Shell access
shell-backend:
	@./dashboard.sh exec backend

shell-frontend:
	@./dashboard.sh exec frontend

# Docker operations
pull:
	@./dashboard.sh pull

up: start

down: stop

ps:
	@docker-compose ps

# Health checks
health:
	@echo "Backend Health:"
	@curl -s http://localhost:8080/health | python3 -m json.tool || echo "Backend not responding"
	@echo ""
	@echo "Frontend Health:"
	@curl -s http://localhost:3000/health || echo "Frontend not responding"

# API documentation
docs:
	@echo "Opening API documentation..."
	@open http://localhost:8080/docs || xdg-open http://localhost:8080/docs || echo "API docs: http://localhost:8080/docs"

# Open dashboard in browser
open:
	@echo "Opening dashboard..."
	@open http://localhost:3000 || xdg-open http://localhost:3000 || echo "Dashboard: http://localhost:3000"
