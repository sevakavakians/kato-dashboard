#!/bin/bash

# KATO Dashboard Version Bumping Script
# This script automates semantic versioning across all project files
#
# Usage:
#   ./bump-version.sh <bump_type> [commit_message]
#
# Arguments:
#   bump_type:       major, minor, or patch
#   commit_message:  Optional commit message (default: "Bump version to X.Y.Z")
#
# Examples:
#   ./bump-version.sh patch                          # 0.1.0 → 0.1.1
#   ./bump-version.sh minor "Add new feature"        # 0.1.0 → 0.2.0
#   ./bump-version.sh major "Breaking changes"       # 0.1.0 → 1.0.0

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Version file paths
PYPROJECT_FILE="pyproject.toml"
PACKAGE_JSON_FILE="frontend/package.json"
VERSION_FILE="VERSION"

# ============================================================================
# Helper Functions
# ============================================================================

print_usage() {
    echo "Usage: $0 <major|minor|patch> [commit_message]"
    echo ""
    echo "Examples:"
    echo "  $0 patch                          # Bug fix: 0.1.0 → 0.1.1"
    echo "  $0 minor \"Add new feature\"        # New feature: 0.1.0 → 0.2.0"
    echo "  $0 major \"Breaking changes\"       # Breaking change: 0.1.0 → 1.0.0"
    exit 1
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

# Extract current version from pyproject.toml
get_current_version() {
    if [[ ! -f "$PYPROJECT_FILE" ]]; then
        log_error "pyproject.toml not found!"
        exit 1
    fi

    grep '^version = ' "$PYPROJECT_FILE" | sed 's/version = "\(.*\)"/\1/'
}

# Parse semantic version into components
parse_version() {
    local version=$1

    # Remove any pre-release suffix (e.g., "0.1.0-beta.1" → "0.1.0")
    version=$(echo "$version" | sed 's/-.*$//')

    # Split into components
    IFS='.' read -r MAJOR MINOR PATCH <<< "$version"

    # Validate components are numbers
    if ! [[ "$MAJOR" =~ ^[0-9]+$ ]] || ! [[ "$MINOR" =~ ^[0-9]+$ ]] || ! [[ "$PATCH" =~ ^[0-9]+$ ]]; then
        log_error "Invalid version format: $version"
        exit 1
    fi
}

# Calculate new version based on bump type
bump_version() {
    local bump_type=$1

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
        *)
            log_error "Invalid bump type: $bump_type"
            print_usage
            ;;
    esac

    NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
}

# Update version in pyproject.toml
update_pyproject() {
    local new_version=$1

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/^version = \".*\"/version = \"$new_version\"/" "$PYPROJECT_FILE"
    else
        # Linux
        sed -i "s/^version = \".*\"/version = \"$new_version\"/" "$PYPROJECT_FILE"
    fi

    log_success "Updated $PYPROJECT_FILE"
}

# Update version in frontend/package.json
update_package_json() {
    local new_version=$1

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\"version\": \".*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON_FILE"
    else
        # Linux
        sed -i "s/\"version\": \".*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON_FILE"
    fi

    log_success "Updated $PACKAGE_JSON_FILE"
}

# Update VERSION file
update_version_file() {
    local new_version=$1
    echo "$new_version" > "$VERSION_FILE"
    log_success "Updated $VERSION_FILE"
}

# Check if git working directory is clean
check_git_status() {
    if [[ -n $(git status --porcelain) ]]; then
        log_error "Git working directory is not clean. Please commit or stash changes first."
        git status --short
        exit 1
    fi
}

# Show git diff of version changes
show_diff() {
    echo ""
    log_info "Changes to be committed:"
    echo ""
    git diff "$PYPROJECT_FILE" "$PACKAGE_JSON_FILE" "$VERSION_FILE"
    echo ""
}

# ============================================================================
# Main Script
# ============================================================================

# Check arguments
if [[ $# -lt 1 ]]; then
    log_error "Missing bump type argument"
    print_usage
fi

BUMP_TYPE=$1
COMMIT_MSG=${2:-""}

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    log_error "Invalid bump type: $BUMP_TYPE"
    print_usage
fi

# Check git status
log_info "Checking git status..."
check_git_status
log_success "Git working directory is clean"

# Get current version
CURRENT_VERSION=$(get_current_version)
log_info "Current version: $CURRENT_VERSION"

# Parse and bump version
parse_version "$CURRENT_VERSION"
bump_version "$BUMP_TYPE"

log_info "New version: $NEW_VERSION"
echo ""

# Confirmation prompt
read -p "$(echo -e ${YELLOW}Bump version from $CURRENT_VERSION to $NEW_VERSION? [y/N]: ${NC})" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Version bump cancelled"
    exit 0
fi

# Update all version files
log_info "Updating version files..."
update_pyproject "$NEW_VERSION"
update_package_json "$NEW_VERSION"
update_version_file "$NEW_VERSION"

# Show changes
show_diff

# Git operations
log_info "Git operations..."
echo ""

# Ask if user wants to commit
read -p "$(echo -e ${YELLOW}Create git commit? [y/N]: ${NC})" -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Use custom commit message or default
    if [[ -z "$COMMIT_MSG" ]]; then
        COMMIT_MSG="Bump version to $NEW_VERSION"
    fi

    git add "$PYPROJECT_FILE" "$PACKAGE_JSON_FILE" "$VERSION_FILE"
    git commit -m "$COMMIT_MSG"
    log_success "Created commit: $COMMIT_MSG"

    # Ask if user wants to create tag
    read -p "$(echo -e ${YELLOW}Create git tag v$NEW_VERSION? [y/N]: ${NC})" -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Ask for tag message
        read -p "$(echo -e ${YELLOW}Enter tag message (or press Enter for default): ${NC})" TAG_MSG
        if [[ -z "$TAG_MSG" ]]; then
            TAG_MSG="Release version $NEW_VERSION"
        fi

        git tag -a "v$NEW_VERSION" -m "$TAG_MSG"
        log_success "Created tag: v$NEW_VERSION"

        echo ""
        log_info "Next steps:"
        echo "  1. Review the changes: git show"
        echo "  2. Push commit and tag: git push origin main && git push origin v$NEW_VERSION"
        echo "  3. Run build-and-push.sh to build and publish Docker images"
    else
        echo ""
        log_info "Next steps:"
        echo "  1. Create tag: git tag -a v$NEW_VERSION -m 'Release version $NEW_VERSION'"
        echo "  2. Push changes: git push origin main && git push origin v$NEW_VERSION"
        echo "  3. Run build-and-push.sh to build and publish Docker images"
    fi
else
    log_warning "Skipped git commit"
    echo ""
    log_info "Version files updated but not committed. Next steps:"
    echo "  1. Review changes: git diff"
    echo "  2. Commit: git add -A && git commit -m 'Bump version to $NEW_VERSION'"
    echo "  3. Tag: git tag -a v$NEW_VERSION -m 'Release version $NEW_VERSION'"
    echo "  4. Push: git push origin main && git push origin v$NEW_VERSION"
fi

echo ""
log_success "Version bump complete! 🎉"
