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
CONTAINER="kato-dashboard"
REGISTRY="ghcr.io/sevakavakians"
IMAGE_NAME="kato-dashboard"

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
    if docker ps | grep -q "$CONTAINER"; then
        print_warning "Dashboard is already running"
        print_info "Use './dashboard.sh restart' to restart or './dashboard.sh stop' to stop"
        exit 0
    fi

    # Start containers
    $COMPOSE_CMD up -d

    echo ""
    print_step "Waiting for services to be healthy..."
    sleep 5

    # Check dashboard health (combined frontend + backend)
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            print_success "Dashboard is healthy"
            break
        fi
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            print_error "Dashboard failed to become healthy"
            print_info "Check logs with: ./dashboard.sh logs"
            exit 1
        fi
        sleep 1
    done

    echo ""
    print_success "Dashboard started successfully!"
    echo ""
    print_info "Access the dashboard at:"
    echo -e "  ${GREEN}Dashboard:${NC} http://localhost:3001"
    echo -e "  ${GREEN}API Docs:${NC}  http://localhost:3001/docs"
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
    if ! docker ps | grep -q "$CONTAINER"; then
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
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        print_success "Dashboard is healthy"
    else
        print_error "Dashboard health check failed"
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

    # Dashboard (combined frontend + backend)
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        dashboard_status=$(curl -s http://localhost:3001/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        print_success "Dashboard: http://localhost:3001 - Status: $dashboard_status"
    else
        print_error "Dashboard: http://localhost:3001 - Not responding"
    fi

    echo ""

    # KATO connectivity
    print_step "KATO Connectivity:"
    echo ""

    if docker ps | grep -q "kato"; then
        print_success "KATO container is running"

        # Test KATO health from dashboard if it's running
        if docker ps | grep -q "$CONTAINER"; then
            if docker exec $CONTAINER curl -s http://kato:8000/health > /dev/null 2>&1; then
                print_success "Dashboard can reach KATO API"
            else
                print_error "Dashboard cannot reach KATO API"
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
        print_info "Showing dashboard logs (Ctrl+C to exit)..."
        echo ""
        $COMPOSE_CMD logs -f
    else
        # For backward compatibility, accept "backend" or "frontend" but show same logs
        case $service in
            backend|frontend|dashboard)
                print_info "Showing dashboard logs (Ctrl+C to exit)..."
                echo ""
                $COMPOSE_CMD logs -f dashboard
                ;;
            *)
                print_error "Invalid service: $service"
                print_info "Note: Dashboard now runs as a single combined container"
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

    # For backward compatibility, accept "backend", "frontend", or "dashboard"
    case $service in
        backend|frontend|dashboard)
            if [ -z "$cmd" ]; then
                # Open shell
                print_info "Opening shell in dashboard container..."
                docker exec -it $CONTAINER sh
            else
                # Run command
                docker exec $CONTAINER $cmd
            fi
            ;;
        *)
            print_error "Invalid service: $service"
            print_info "Note: Dashboard now runs as a single combined container"
            print_info "Valid options: dashboard, backend (alias), frontend (alias)"
            exit 1
            ;;
    esac
}

# Test endpoints
test_endpoints() {
    print_header
    print_info "Testing dashboard endpoints..."
    echo ""

    # Dashboard health
    print_step "Testing dashboard health..."
    if response=$(curl -s http://localhost:3001/health); then
        print_success "Dashboard health: OK"
        echo "  Response: $response"
    else
        print_error "Dashboard health check failed"
    fi
    echo ""

    # API endpoints
    print_step "Testing API endpoints..."

    # System metrics
    if curl -s http://localhost:3001/api/v1/system/metrics > /dev/null 2>&1; then
        print_success "System metrics: OK"
    else
        print_error "System metrics: Failed"
    fi

    # Session count
    if curl -s http://localhost:3001/api/v1/sessions/count > /dev/null 2>&1; then
        print_success "Session count: OK"
    else
        print_error "Session count: Failed"
    fi

    # Analytics overview
    if curl -s http://localhost:3001/api/v1/analytics/overview > /dev/null 2>&1; then
        print_success "Analytics overview: OK"
    else
        print_error "Analytics overview: Failed"
    fi

    echo ""
    print_info "API documentation available at: http://localhost:3001/docs"
    echo ""
}

# Show version
show_version() {
    print_header
    print_info "KATO Dashboard Version Information"
    echo ""

    # Get version from pyproject.toml
    if [ -f "pyproject.toml" ]; then
        local version=$(grep '^version = ' pyproject.toml | sed 's/version = "\(.*\)"/\1/')
        print_step "Current Version: $version"
    else
        print_warning "pyproject.toml not found"
    fi

    # Get version from VERSION file
    if [ -f "VERSION" ]; then
        local file_version=$(cat VERSION)
        print_step "VERSION file: $file_version"
    fi

    # Get version from frontend package.json
    if [ -f "frontend/package.json" ]; then
        local frontend_version=$(grep '"version":' frontend/package.json | sed 's/.*"version": "\(.*\)".*/\1/')
        print_step "Frontend version: $frontend_version"
    fi

    echo ""

    # Check if running from registry or local build
    if docker ps | grep -q "$CONTAINER"; then
        print_step "Checking running container version..."
        local container_version=$(docker inspect $CONTAINER --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || echo "unknown")
        if [ "$container_version" != "unknown" ] && [ -n "$container_version" ]; then
            print_success "Running container version: $container_version"

            local git_commit=$(docker inspect $CONTAINER --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo "unknown")
            if [ "$git_commit" != "unknown" ] && [ -n "$git_commit" ]; then
                print_info "Git commit: $git_commit"
            fi

            local build_date=$(docker inspect $CONTAINER --format '{{index .Config.Labels "org.opencontainers.image.created"}}' 2>/dev/null || echo "unknown")
            if [ "$build_date" != "unknown" ] && [ -n "$build_date" ]; then
                print_info "Build date: $build_date"
            fi
        else
            print_info "Running container version: Built from local sources"
        fi
    else
        print_warning "Dashboard is not running"
    fi

    echo ""
}

# Pull images from registry
pull_registry() {
    local version=${1:-latest}

    print_header
    print_info "Pulling dashboard images from registry..."
    echo ""

    check_prerequisites

    local image_tag="${REGISTRY}/${IMAGE_NAME}:${version}"

    print_step "Pulling image: $image_tag"
    if docker pull "$image_tag"; then
        print_success "Successfully pulled: $image_tag"
        echo ""

        # Show image info
        print_info "Image details:"
        docker inspect "$image_tag" --format '  Version: {{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || echo "  Version: unknown"
        docker inspect "$image_tag" --format '  Git commit: {{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo "  Git commit: unknown"
        docker inspect "$image_tag" --format '  Build date: {{index .Config.Labels "org.opencontainers.image.created"}}' 2>/dev/null || echo "  Build date: unknown"
        echo ""

        print_info "To use this image, update docker-compose.yml or use docker-compose.prod.yml"
        print_info "Then restart with: ./dashboard.sh restart"
    else
        print_error "Failed to pull image from registry"
        print_info "Available tags at: https://github.com/sevakavakians/kato-dashboard/pkgs/container/kato-dashboard"
        exit 1
    fi

    echo ""
}

# Update dashboard (pull latest from registry and restart)
update_dashboard() {
    local version=${1:-latest}

    print_header
    print_info "Updating KATO Dashboard from registry..."
    echo ""

    check_prerequisites

    # Check if docker-compose.prod.yml exists
    if [ ! -f "docker-compose.prod.yml" ]; then
        print_error "docker-compose.prod.yml not found"
        print_info "This command requires the production compose file that uses registry images"
        exit 1
    fi

    print_step "Pulling latest image: $version"
    local image_tag="${REGISTRY}/${IMAGE_NAME}:${version}"

    if ! docker pull "$image_tag"; then
        print_error "Failed to pull image from registry"
        exit 1
    fi

    print_success "Image pulled successfully"
    echo ""

    # Check if dashboard is running
    if docker ps | grep -q "$CONTAINER"; then
        print_step "Stopping current dashboard..."
        docker-compose -f docker-compose.prod.yml down
        print_success "Stopped"
    fi

    echo ""
    print_step "Starting updated dashboard..."
    docker-compose -f docker-compose.prod.yml up -d

    echo ""
    print_step "Waiting for services to be healthy..."
    sleep 5

    # Health checks
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        print_success "Dashboard is healthy"

        # Show new version
        local new_version=$(docker inspect $CONTAINER --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || echo "unknown")
        if [ "$new_version" != "unknown" ] && [ -n "$new_version" ]; then
            print_info "Now running version: $new_version"
        fi
    else
        print_error "Health check failed"
        print_info "Check logs with: ./dashboard.sh logs"
        exit 1
    fi

    echo ""
    print_success "Dashboard updated successfully! 🎉"
    echo ""
}

# Show help
show_help() {
    print_header
    echo "Usage: ./dashboard.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start                Start the dashboard"
    echo "  stop                 Stop the dashboard"
    echo "  restart              Restart the dashboard"
    echo "  status               Show dashboard status and health"
    echo "  logs                 View dashboard logs"
    echo "  build [--no-cache]   Build container from source"
    echo "  pull                 Pull latest base images for building"
    echo "  clean                Stop and remove all containers and volumes"
    echo "  exec dashboard       Open shell in dashboard container"
    echo "  test                 Test all endpoints"
    echo "  version              Show version information"
    echo "  pull-registry [tag]  Pull dashboard image from registry (default: latest)"
    echo "  update [tag]         Pull latest from registry and restart (requires prod compose)"
    echo "  help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./dashboard.sh start               # Start the dashboard"
    echo "  ./dashboard.sh logs                # View dashboard logs"
    echo "  ./dashboard.sh exec dashboard      # Open shell in dashboard container"
    echo "  ./dashboard.sh build --no-cache    # Rebuild from scratch"
    echo "  ./dashboard.sh version             # Show current version"
    echo "  ./dashboard.sh pull-registry 0.1.0 # Pull specific version from registry"
    echo "  ./dashboard.sh update              # Update to latest from registry"
    echo ""
    echo "URLs:"
    echo "  Dashboard: http://localhost:3001"
    echo "  API Docs:  http://localhost:3001/docs"
    echo ""
    echo "Registry:"
    echo "  Images:    $REGISTRY/$IMAGE_NAME"
    echo "  Packages:  https://github.com/sevakavakians/kato-dashboard/pkgs/container/kato-dashboard"
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
        version|--version|-v)
            show_version
            ;;
        pull-registry)
            pull_registry "$2"
            ;;
        update)
            update_dashboard "$2"
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
