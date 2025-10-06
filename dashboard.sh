#!/bin/bash

# KATO Dashboard Management Script
# Usage: ./dashboard.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Configuration
COMPOSE_FILE="docker-compose.yml"
KATO_NETWORK="kato_kato-network"
BACKEND_CONTAINER="kato-dashboard-backend"
FRONTEND_CONTAINER="kato-dashboard-frontend"

# Print functions
print_header() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}  KATO Dashboard Manager${NC}"
    echo -e "${CYAN}================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_step() {
    echo -e "${CYAN}→${NC} $1"
}

# Check if KATO is running
check_kato() {
    print_step "Checking KATO status..."

    if docker ps | grep -q "kato"; then
        print_success "KATO container is running"
        return 0
    else
        print_error "KATO container is not running"
        print_warning "Please start KATO first: cd /path/to/kato && ./start.sh"
        return 1
    fi
}

# Check if KATO network exists
check_network() {
    print_step "Checking network configuration..."

    if docker network ls | grep -q "$KATO_NETWORK"; then
        print_success "KATO network exists: $KATO_NETWORK"
        return 0
    else
        print_error "KATO network not found: $KATO_NETWORK"
        print_warning "The dashboard needs to connect to KATO's network."
        echo ""
        print_info "To fix this, you can either:"
        echo "  1. Start KATO (recommended): cd /path/to/kato && ./start.sh"
        echo "  2. Create network manually: docker network create $KATO_NETWORK"
        echo ""
        return 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker is installed"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose is available"

    # Use docker-compose or docker compose
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
}

# Start dashboard
start_dashboard() {
    print_header
    print_info "Starting KATO Dashboard..."
    echo ""

    check_prerequisites
    check_kato || exit 1
    check_network || exit 1

    echo ""
    print_step "Starting dashboard containers..."

    # Check if already running
    if docker ps | grep -q "$BACKEND_CONTAINER"; then
        print_warning "Dashboard is already running"
        print_info "Use './dashboard.sh restart' to restart or './dashboard.sh stop' to stop"
        exit 0
    fi

    # Start containers
    $COMPOSE_CMD up -d

    echo ""
    print_step "Waiting for services to be healthy..."
    sleep 5

    # Check backend health
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:8080/health > /dev/null 2>&1; then
            print_success "Backend is healthy"
            break
        fi
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            print_error "Backend failed to become healthy"
            print_info "Check logs with: ./dashboard.sh logs backend"
            exit 1
        fi
        sleep 1
    done

    # Check frontend health
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            print_success "Frontend is healthy"
            break
        fi
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            print_error "Frontend failed to become healthy"
            print_info "Check logs with: ./dashboard.sh logs frontend"
            exit 1
        fi
        sleep 1
    done

    echo ""
    print_success "Dashboard started successfully!"
    echo ""
    print_info "Access the dashboard at:"
    echo -e "  ${GREEN}Frontend:${NC}  http://localhost:3000"
    echo -e "  ${GREEN}Backend:${NC}   http://localhost:8080"
    echo -e "  ${GREEN}API Docs:${NC}  http://localhost:8080/docs"
    echo ""
    print_info "View logs with: ./dashboard.sh logs"
    print_info "Stop with: ./dashboard.sh stop"
    echo ""
}

# Stop dashboard
stop_dashboard() {
    print_header
    print_info "Stopping KATO Dashboard..."
    echo ""

    check_prerequisites

    # Check if running
    if ! docker ps | grep -q "$BACKEND_CONTAINER"; then
        print_warning "Dashboard is not running"
        exit 0
    fi

    print_step "Stopping containers..."
    $COMPOSE_CMD down

    echo ""
    print_success "Dashboard stopped successfully!"
    echo ""
}

# Restart dashboard
restart_dashboard() {
    print_header
    print_info "Restarting KATO Dashboard..."
    echo ""

    check_prerequisites

    print_step "Restarting containers..."
    $COMPOSE_CMD restart

    echo ""
    print_step "Waiting for services to be healthy..."
    sleep 5

    # Quick health check
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        print_success "Backend is healthy"
    else
        print_error "Backend health check failed"
    fi

    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "Frontend is healthy"
    else
        print_error "Frontend health check failed"
    fi

    echo ""
    print_success "Dashboard restarted successfully!"
    echo ""
}

# Show status
show_status() {
    print_header
    print_info "Dashboard Status"
    echo ""

    check_prerequisites

    # Check container status
    print_step "Container Status:"
    echo ""

    if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "kato-dashboard|NAMES"; then
        echo ""
    else
        print_warning "No dashboard containers are running"
        echo ""
    fi

    # Health checks
    print_step "Health Checks:"
    echo ""

    # Backend
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        backend_status=$(curl -s http://localhost:8080/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        print_success "Backend: http://localhost:8080 - Status: $backend_status"
    else
        print_error "Backend: http://localhost:8080 - Not responding"
    fi

    # Frontend
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "Frontend: http://localhost:3000 - Healthy"
    else
        print_error "Frontend: http://localhost:3000 - Not responding"
    fi

    echo ""

    # KATO connectivity
    print_step "KATO Connectivity:"
    echo ""

    if docker ps | grep -q "kato"; then
        print_success "KATO container is running"

        # Test KATO health from backend if it's running
        if docker ps | grep -q "$BACKEND_CONTAINER"; then
            if docker exec $BACKEND_CONTAINER curl -s http://kato:8000/health > /dev/null 2>&1; then
                print_success "Backend can reach KATO API"
            else
                print_error "Backend cannot reach KATO API"
            fi
        fi
    else
        print_error "KATO container is not running"
    fi

    echo ""
}

# View logs
view_logs() {
    local service=$1

    check_prerequisites

    if [ -z "$service" ]; then
        # Show all logs
        print_info "Showing logs for all services (Ctrl+C to exit)..."
        echo ""
        $COMPOSE_CMD logs -f
    else
        case $service in
            backend)
                print_info "Showing backend logs (Ctrl+C to exit)..."
                echo ""
                $COMPOSE_CMD logs -f dashboard-backend
                ;;
            frontend)
                print_info "Showing frontend logs (Ctrl+C to exit)..."
                echo ""
                $COMPOSE_CMD logs -f dashboard-frontend
                ;;
            *)
                print_error "Invalid service: $service"
                print_info "Valid options: backend, frontend"
                exit 1
                ;;
        esac
    fi
}

# Build containers
build_containers() {
    print_header
    print_info "Building dashboard containers..."
    echo ""

    check_prerequisites

    local no_cache=""
    if [ "$1" == "--no-cache" ]; then
        no_cache="--no-cache"
        print_warning "Building with --no-cache (this may take longer)"
    fi

    print_step "Building containers..."
    $COMPOSE_CMD build $no_cache

    echo ""
    print_success "Build completed successfully!"
    echo ""
    print_info "Start the dashboard with: ./dashboard.sh start"
    echo ""
}

# Pull latest images
pull_images() {
    print_header
    print_info "Pulling base images..."
    echo ""

    check_prerequisites

    print_step "Pulling images..."
    $COMPOSE_CMD pull

    echo ""
    print_success "Images pulled successfully!"
    echo ""
}

# Clean up
cleanup() {
    print_header
    print_info "Cleaning up dashboard resources..."
    echo ""

    check_prerequisites

    print_step "Stopping and removing containers..."
    $COMPOSE_CMD down -v

    echo ""
    print_warning "Removing unused images..."
    docker image prune -f --filter "label=com.docker.compose.project=kato-dashboard"

    echo ""
    print_success "Cleanup completed!"
    echo ""
}

# Execute command in container
exec_cmd() {
    local service=$1
    shift
    local cmd="$@"

    check_prerequisites

    case $service in
        backend)
            if [ -z "$cmd" ]; then
                # Open shell
                print_info "Opening shell in backend container..."
                docker exec -it $BACKEND_CONTAINER bash
            else
                # Run command
                docker exec $BACKEND_CONTAINER $cmd
            fi
            ;;
        frontend)
            if [ -z "$cmd" ]; then
                # Open shell
                print_info "Opening shell in frontend container..."
                docker exec -it $FRONTEND_CONTAINER sh
            else
                # Run command
                docker exec $FRONTEND_CONTAINER $cmd
            fi
            ;;
        *)
            print_error "Invalid service: $service"
            print_info "Valid options: backend, frontend"
            exit 1
            ;;
    esac
}

# Test endpoints
test_endpoints() {
    print_header
    print_info "Testing dashboard endpoints..."
    echo ""

    # Backend health
    print_step "Testing backend health..."
    if response=$(curl -s http://localhost:8080/health); then
        print_success "Backend health: OK"
        echo "  Response: $response"
    else
        print_error "Backend health check failed"
    fi
    echo ""

    # Frontend health
    print_step "Testing frontend health..."
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "Frontend health: OK"
    else
        print_error "Frontend health check failed"
    fi
    echo ""

    # API endpoints
    print_step "Testing API endpoints..."

    # System metrics
    if curl -s http://localhost:8080/api/v1/system/metrics > /dev/null 2>&1; then
        print_success "System metrics: OK"
    else
        print_error "System metrics: Failed"
    fi

    # Session count
    if curl -s http://localhost:8080/api/v1/sessions/count > /dev/null 2>&1; then
        print_success "Session count: OK"
    else
        print_error "Session count: Failed"
    fi

    # Analytics overview
    if curl -s http://localhost:8080/api/v1/analytics/overview > /dev/null 2>&1; then
        print_success "Analytics overview: OK"
    else
        print_error "Analytics overview: Failed"
    fi

    echo ""
    print_info "API documentation available at: http://localhost:8080/docs"
    echo ""
}

# Show help
show_help() {
    print_header
    echo "Usage: ./dashboard.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start              Start the dashboard"
    echo "  stop               Stop the dashboard"
    echo "  restart            Restart the dashboard"
    echo "  status             Show dashboard status and health"
    echo "  logs [service]     View logs (backend|frontend|all)"
    echo "  build [--no-cache] Build containers"
    echo "  pull               Pull latest base images"
    echo "  clean              Stop and remove all containers and volumes"
    echo "  exec <service>     Open shell in container (backend|frontend)"
    echo "  test               Test all endpoints"
    echo "  help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./dashboard.sh start           # Start the dashboard"
    echo "  ./dashboard.sh logs backend    # View backend logs"
    echo "  ./dashboard.sh exec backend    # Open shell in backend container"
    echo "  ./dashboard.sh build --no-cache # Rebuild from scratch"
    echo ""
    echo "URLs:"
    echo "  Frontend:  http://localhost:3000"
    echo "  Backend:   http://localhost:8080"
    echo "  API Docs:  http://localhost:8080/docs"
    echo ""
}

# Main command handler
main() {
    local command=${1:-help}

    case $command in
        start)
            start_dashboard
            ;;
        stop)
            stop_dashboard
            ;;
        restart)
            restart_dashboard
            ;;
        status)
            show_status
            ;;
        logs)
            view_logs "$2"
            ;;
        build)
            build_containers "$2"
            ;;
        pull)
            pull_images
            ;;
        clean|cleanup)
            cleanup
            ;;
        exec)
            if [ -z "$2" ]; then
                print_error "Service name required"
                print_info "Usage: ./dashboard.sh exec <backend|frontend> [command]"
                exit 1
            fi
            exec_cmd "${@:2}"
            ;;
        test)
            test_endpoints
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main
main "$@"
