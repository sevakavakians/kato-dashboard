#!/bin/bash

# KATO Dashboard Docker Build and Push Script
# This script builds Docker images with proper versioning and pushes them to a container registry
#
# Usage:
#   ./build-and-push.sh [OPTIONS]
#
# Options:
#   --no-push              Build only, don't push to registry
#   --registry <url>       Use custom registry (default: ghcr.io/sevakavakians)
#   --help                 Show this help message
#
# Environment Variables:
#   REGISTRY               Override default registry URL
#   NO_PUSH                Set to 'true' to skip pushing
#
# Examples:
#   ./build-and-push.sh                    # Build and push to default registry
#   ./build-and-push.sh --no-push          # Build only, don't push
#   ./build-and-push.sh --registry custom  # Use custom registry

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default configuration
DEFAULT_REGISTRY="ghcr.io/sevakavakians"
REGISTRY="${REGISTRY:-$DEFAULT_REGISTRY}"
IMAGE_NAME="kato-dashboard"
NO_PUSH="${NO_PUSH:-false}"
CACHE_BUST=1

# ============================================================================
# Helper Functions
# ============================================================================

print_usage() {
    cat << EOF
KATO Dashboard Docker Build and Push Script

Usage: $0 [OPTIONS]

Options:
  --no-push              Build only, don't push to registry
  --registry <url>       Use custom registry (default: $DEFAULT_REGISTRY)
  --help                 Show this help message

Environment Variables:
  REGISTRY               Override default registry URL
  NO_PUSH                Set to 'true' to skip pushing

Examples:
  $0                              # Build and push to default registry
  $0 --no-push                    # Build only, don't push
  $0 --registry my-registry.com   # Use custom registry

EOF
    exit 0
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_step() {
    echo -e "${CYAN}▶${NC} $1"
}

# Extract version from pyproject.toml
get_version() {
    if [[ ! -f "pyproject.toml" ]]; then
        log_error "pyproject.toml not found!"
        exit 1
    fi

    grep '^version = ' pyproject.toml | sed 's/version = "\(.*\)"/\1/'
}

# Get git commit hash
get_git_commit() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        git rev-parse --short HEAD
    else
        echo "unknown"
    fi
}

# Get build date in ISO 8601 format
get_build_date() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Check if version is a pre-release (contains -, e.g., "1.0.0-beta.1")
is_prerelease() {
    local version=$1
    [[ "$version" == *-* ]]
}

# Parse semantic version
parse_version() {
    local version=$1

    # Remove pre-release suffix for parsing
    local clean_version=$(echo "$version" | sed 's/-.*$//')

    IFS='.' read -r MAJOR MINOR PATCH <<< "$clean_version"
}

# Build Docker image with metadata
build_image() {
    local version=$1
    local git_commit=$2
    local build_date=$3

    log_step "Building Docker image..."

    docker build \
        --build-arg VERSION="$version" \
        --build-arg GIT_COMMIT="$git_commit" \
        --build-arg BUILD_DATE="$build_date" \
        --build-arg CACHE_BUST="$CACHE_BUST" \
        -t "${REGISTRY}/${IMAGE_NAME}:${version}" \
        -f Dockerfile \
        .

    log_success "Built image: ${REGISTRY}/${IMAGE_NAME}:${version}"
}

# Tag image with multiple tags
tag_image() {
    local version=$1
    local tags=("$@")

    log_step "Tagging image with multiple tags..."

    for tag in "${tags[@]:1}"; do  # Skip first element (version)
        docker tag \
            "${REGISTRY}/${IMAGE_NAME}:${version}" \
            "${REGISTRY}/${IMAGE_NAME}:${tag}"
        log_success "Tagged: ${REGISTRY}/${IMAGE_NAME}:${tag}"
    done
}

# Push all tags to registry
push_images() {
    local tags=("$@")

    log_step "Pushing images to registry..."

    for tag in "${tags[@]}"; do
        docker push "${REGISTRY}/${IMAGE_NAME}:${tag}"
        log_success "Pushed: ${REGISTRY}/${IMAGE_NAME}:${tag}"
    done
}

# Check if Docker daemon is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker daemon is not running!"
        exit 1
    fi
}

# ============================================================================
# Main Script
# ============================================================================

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-push)
            NO_PUSH=true
            shift
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --help)
            print_usage
            ;;
        *)
            log_error "Unknown option: $1"
            print_usage
            ;;
    esac
done

# Print header
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          KATO Dashboard - Build and Push Script           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Docker
log_info "Checking Docker daemon..."
check_docker
log_success "Docker daemon is running"

# Get version information
VERSION=$(get_version)
GIT_COMMIT=$(get_git_commit)
BUILD_DATE=$(get_build_date)

log_info "Version: $VERSION"
log_info "Git Commit: $GIT_COMMIT"
log_info "Build Date: $BUILD_DATE"
log_info "Registry: $REGISTRY"
echo ""

# Parse version components
parse_version "$VERSION"

# Determine tags based on version type
TAGS=("$VERSION")

if is_prerelease "$VERSION"; then
    log_warning "Pre-release version detected: $VERSION"
    log_info "Will only tag as: $VERSION (no latest, major, or minor tags)"
else
    log_info "Stable version detected: $VERSION"
    log_info "Will tag as: $VERSION, $MAJOR.$MINOR, $MAJOR, latest"

    # Add additional tags for stable releases
    TAGS+=("${MAJOR}.${MINOR}")  # e.g., "0.1"
    TAGS+=("${MAJOR}")           # e.g., "0"
    TAGS+=("latest")
fi

echo ""

# Build image
build_image "$VERSION" "$GIT_COMMIT" "$BUILD_DATE"
echo ""

# Tag image with all tags
tag_image "${TAGS[@]}"
echo ""

# Push to registry (unless --no-push)
if [[ "$NO_PUSH" == "true" ]]; then
    log_warning "Skipping push to registry (--no-push flag set)"
    echo ""
    log_info "To push manually, run:"
    for tag in "${TAGS[@]}"; do
        echo "  docker push ${REGISTRY}/${IMAGE_NAME}:${tag}"
    done
else
    push_images "${TAGS[@]}"
    echo ""
    log_success "All images pushed successfully! 🎉"
    echo ""
    log_info "Images available at:"
    for tag in "${TAGS[@]}"; do
        echo "  ${REGISTRY}/${IMAGE_NAME}:${tag}"
    done
fi

echo ""
log_info "Pull image with:"
echo "  docker pull ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo "  docker pull ${REGISTRY}/${IMAGE_NAME}:latest"
echo ""

log_success "Build complete! ✨"
