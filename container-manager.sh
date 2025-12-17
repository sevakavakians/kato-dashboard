#!/bin/bash

# KATO Dashboard Container Manager Script
# End-to-end automation for version releases and Docker image management
#
# Usage:
#   ./container-manager.sh <bump_type> [commit_message]
#
# Arguments:
#   bump_type:       major, minor, or patch
#   commit_message:  Optional commit message (default: generated from bump type)
#
# Environment Variables:
#   AUTO_MODE        Set to 'true' to skip all confirmation prompts (use with caution!)
#   REGISTRY         Override default registry URL
#
# Examples:
#   ./container-manager.sh patch                    # Bug fix release
#   ./container-manager.sh minor "Add new feature"  # Feature release
#   ./container-manager.sh major "Breaking changes" # Major release
#
# Process:
#   1. Bump version in all files
#   2. Remind to update CHANGELOG.md
#   3. Create git commit and tag
#   4. Push to remote repository
#   5. Build and push Docker images
#   6. Verify images in registry

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
AUTO_MODE="${AUTO_MODE:-false}"
REGISTRY="${REGISTRY:-ghcr.io/sevakavakians}"
IMAGE_NAME="kato-dashboard"

# ============================================================================
# Helper Functions
# ============================================================================

print_usage() {
    cat << EOF
KATO Dashboard Container Manager

Automates the complete release process: version bump → commit → tag → push → build → publish

Usage: $0 <major|minor|patch> [commit_message]

Arguments:
  bump_type        Version bump type (major, minor, or patch)
  commit_message   Optional custom commit message

Examples:
  $0 patch                          # Bug fix: 0.1.0 → 0.1.1
  $0 minor "Add analytics feature"  # New feature: 0.1.0 → 0.2.0
  $0 major "Breaking API changes"   # Breaking change: 0.1.0 → 1.0.0

Environment Variables:
  AUTO_MODE=true   Skip all confirmation prompts (use with caution!)
  REGISTRY=url     Override default registry (ghcr.io/sevakavakians)

Process Steps:
  1. ✓ Validate environment (git, Docker)
  2. ✓ Bump version in all files
  3. ✓ Remind to update CHANGELOG.md
  4. ✓ Create git commit and tag
  5. ✓ Push to remote repository
  6. ✓ Build Docker images with metadata
  7. ✓ Push images to registry
  8. ✓ Verify images in registry

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
    echo -e "${CYAN}▶${NC} ${MAGENTA}[STEP]${NC} $1"
}

# Confirm action (skip in AUTO_MODE)
confirm() {
    if [[ "$AUTO_MODE" == "true" ]]; then
        return 0
    fi

    local prompt=$1
    read -p "$(echo -e ${YELLOW}${prompt} [y/N]: ${NC})" -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Get current version from pyproject.toml
get_version() {
    if [[ ! -f "pyproject.toml" ]]; then
        log_error "pyproject.toml not found!"
        exit 1
    fi

    grep '^version = ' pyproject.toml | sed 's/version = "\(.*\)"/\1/'
}

# Calculate new version
calculate_new_version() {
    local current_version=$1
    local bump_type=$2

    # Remove pre-release suffix
    local clean_version=$(echo "$current_version" | sed 's/-.*$//')

    IFS='.' read -r MAJOR MINOR PATCH <<< "$clean_version"

    case "$bump_type" in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        patch)
            PATCH=$((PATCH + 1))
            ;;
    esac

    echo "${MAJOR}.${MINOR}.${PATCH}"
}

# Check if git working directory is clean
check_git_clean() {
    if [[ -n $(git status --porcelain) ]]; then
        log_error "Git working directory is not clean!"
        log_info "Please commit or stash your changes first:"
        git status --short
        exit 1
    fi
}

# Check if on main branch
check_git_branch() {
    local current_branch=$(git branch --show-current)
    if [[ "$current_branch" != "main" ]]; then
        log_warning "Not on 'main' branch (current: $current_branch)"
        if ! confirm "Continue anyway?"; then
            log_error "Cancelled by user"
            exit 1
        fi
    fi
}

# Check if Docker daemon is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker daemon is not running!"
        exit 1
    fi
}

# Verify image exists in registry
verify_image() {
    local version=$1
    local tag="${REGISTRY}/${IMAGE_NAME}:${version}"

    log_info "Verifying image in registry: $tag"

    # Try to pull the image manifest (doesn't download layers)
    if docker manifest inspect "$tag" > /dev/null 2>&1; then
        log_success "Image verified in registry: $tag"
        return 0
    else
        log_warning "Could not verify image in registry (may need authentication)"
        return 1
    fi
}

# ============================================================================
# Main Script
# ============================================================================

# Print header
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        KATO Dashboard - Container Manager Script          ║"
echo "║                   Complete Release Automation              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check arguments
if [[ $# -lt 1 ]] || [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    print_usage
fi

BUMP_TYPE=$1
COMMIT_MSG=${2:-""}

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    log_error "Invalid bump type: $BUMP_TYPE"
    print_usage
fi

# ============================================================================
# Step 1: Environment Validation
# ============================================================================
log_step "Step 1: Validating environment"

log_info "Checking git repository..."
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not a git repository!"
    exit 1
fi
log_success "Git repository found"

log_info "Checking git status..."
check_git_clean
log_success "Working directory is clean"

log_info "Checking git branch..."
check_git_branch

log_info "Checking Docker daemon..."
check_docker
log_success "Docker daemon is running"

echo ""

# ============================================================================
# Step 2: Version Bump
# ============================================================================
log_step "Step 2: Bumping version"

CURRENT_VERSION=$(get_version)
NEW_VERSION=$(calculate_new_version "$CURRENT_VERSION" "$BUMP_TYPE")

log_info "Current version: $CURRENT_VERSION"
log_info "New version: $NEW_VERSION"
log_info "Bump type: $BUMP_TYPE"

echo ""
if ! confirm "Proceed with version bump $CURRENT_VERSION → $NEW_VERSION?"; then
    log_error "Cancelled by user"
    exit 1
fi

log_info "Running bump-version.sh..."
echo ""

# Generate default commit message if not provided
if [[ -z "$COMMIT_MSG" ]]; then
    case "$BUMP_TYPE" in
        major)
            COMMIT_MSG="Release version $NEW_VERSION (major update)"
            ;;
        minor)
            COMMIT_MSG="Release version $NEW_VERSION (new features)"
            ;;
        patch)
            COMMIT_MSG="Release version $NEW_VERSION (bug fixes)"
            ;;
    esac
fi

# Run bump-version.sh with automatic confirmation
echo "y" | ./bump-version.sh "$BUMP_TYPE" "$COMMIT_MSG" > /dev/null 2>&1 || {
    # If auto-confirmation failed, run interactively
    ./bump-version.sh "$BUMP_TYPE" "$COMMIT_MSG"
}

log_success "Version bumped to $NEW_VERSION"
echo ""

# ============================================================================
# Step 3: CHANGELOG Reminder
# ============================================================================
log_step "Step 3: Update CHANGELOG.md"

log_warning "REMINDER: Update CHANGELOG.md before pushing!"
log_info "Add release notes for version $NEW_VERSION"

if [[ -f "CHANGELOG.md" ]]; then
    echo ""
    if confirm "Open CHANGELOG.md now?"; then
        ${EDITOR:-vi} CHANGELOG.md

        if [[ -n $(git status --porcelain CHANGELOG.md) ]]; then
            log_info "CHANGELOG.md was modified"
            if confirm "Add CHANGELOG.md to commit?"; then
                git add CHANGELOG.md
                git commit --amend --no-edit
                log_success "CHANGELOG.md added to commit"
            fi
        fi
    fi
else
    log_info "CHANGELOG.md not found (consider creating one)"
fi

echo ""

# ============================================================================
# Step 4: Git Push
# ============================================================================
log_step "Step 4: Pushing to remote repository"

log_info "This will push:"
echo "  - Commit: $COMMIT_MSG"
echo "  - Tag: v$NEW_VERSION"
echo ""

if ! confirm "Push to remote repository?"; then
    log_warning "Skipping git push"
    log_info "To push manually, run:"
    echo "  git push origin main"
    echo "  git push origin v$NEW_VERSION"
else
    log_info "Pushing commit..."
    git push origin main
    log_success "Pushed commit to main"

    log_info "Pushing tag v$NEW_VERSION..."
    git push origin "v$NEW_VERSION"
    log_success "Pushed tag v$NEW_VERSION"
fi

echo ""

# ============================================================================
# Step 5: Build Docker Images
# ============================================================================
log_step "Step 5: Building Docker images"

log_info "Building images for version $NEW_VERSION..."
echo ""

if ! confirm "Build and push Docker images?"; then
    log_warning "Skipping Docker build"
    log_info "To build manually, run:"
    echo "  ./build-and-push.sh"
    exit 0
fi

./build-and-push.sh

echo ""
log_success "Docker images built and pushed successfully!"

# ============================================================================
# Step 6: Verification
# ============================================================================
log_step "Step 6: Verifying images in registry"

verify_image "$NEW_VERSION"
verify_image "latest"

echo ""

# ============================================================================
# Success Summary
# ============================================================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  🎉 RELEASE COMPLETE! 🎉                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

log_success "Version $NEW_VERSION released successfully!"
echo ""

log_info "Images available at:"
echo "  ${REGISTRY}/${IMAGE_NAME}:${NEW_VERSION}"
echo "  ${REGISTRY}/${IMAGE_NAME}:latest"
echo ""

log_info "Next steps:"
echo "  1. Create GitHub Release: https://github.com/intelligent-artifacts/kato-dashboard/releases/new?tag=v${NEW_VERSION}"
echo "  2. Announce the release"
echo "  3. Update deployment environments"
echo ""

log_info "Pull and deploy with:"
echo "  docker pull ${REGISTRY}/${IMAGE_NAME}:${NEW_VERSION}"
echo "  docker-compose -f docker-compose.prod.yml up -d"
echo ""

log_success "All done! ✨"
