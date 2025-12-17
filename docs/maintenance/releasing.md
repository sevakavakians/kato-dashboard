# Releasing Process

This document describes the complete process for releasing new versions of KATO Dashboard, from version bumping to Docker image publishing.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Release Workflow](#release-workflow)
- [Automated Release](#automated-release)
- [Manual Release](#manual-release)
- [Post-Release](#post-release)
- [Troubleshooting](#troubleshooting)

## Quick Start

For a complete automated release:

```bash
# Patch release (bug fixes)
./container-manager.sh patch

# Minor release (new features)
./container-manager.sh minor "Add session management UI"

# Major release (breaking changes)
./container-manager.sh major "API v2 with breaking changes"
```

This single command handles the entire release process:
1. Bumps version
2. Updates CHANGELOG
3. Commits and tags
4. Pushes to GitHub
5. Builds Docker images
6. Pushes to GitHub Container Registry
7. Verifies images

## Prerequisites

### Required Tools

- **Git**: Version control
- **Docker**: Container builds and pushes
- **Docker Compose**: Local testing (optional)
- **curl**: Health checks and API testing

### Access Requirements

1. **GitHub Repository Access**
   - Push access to main branch
   - Ability to create tags

2. **GitHub Container Registry (GHCR) Access**
   - Personal access token (PAT) with `write:packages` scope
   - Authentication configured:
     ```bash
     echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
     ```

3. **Clean Git Working Directory**
   - No uncommitted changes
   - On the `main` branch (recommended)

### Pre-Release Checklist

Before starting a release:

- [ ] All tests passing
- [ ] Code reviewed and merged to main
- [ ] Documentation updated
- [ ] CHANGELOG.md ready for update
- [ ] No uncommitted changes
- [ ] Docker daemon running

## Release Workflow

### Overview

```
1. Development → 2. Version Bump → 3. CHANGELOG → 4. Commit & Tag → 5. Push → 6. Build → 7. Publish → 8. Verify
```

### Step-by-Step Process

#### Step 1: Prepare for Release

```bash
# Ensure you're on main branch
git checkout main

# Pull latest changes
git pull origin main

# Verify working directory is clean
git status

# Verify Docker is running
docker info
```

#### Step 2: Choose Version Bump Type

Determine the appropriate version bump based on changes:

- **Patch** (`0.1.0` → `0.1.1`): Bug fixes, documentation, minor improvements
- **Minor** (`0.1.0` → `0.2.0`): New features, backward-compatible changes
- **Major** (`0.1.0` → `1.0.0`): Breaking changes, incompatible API changes

See [version-management.md](./version-management.md) for detailed guidelines.

#### Step 3: Run Release Process

**Option A: Automated (Recommended)**

```bash
# Run container manager for complete automation
./container-manager.sh <patch|minor|major> "[optional commit message]"
```

Follow the interactive prompts. The script will:
- Update version files
- Prompt for CHANGELOG update
- Create commit and tag
- Push to GitHub
- Build and push Docker images
- Verify deployment

**Option B: Manual Process**

See [Manual Release](#manual-release) section below.

#### Step 4: Create GitHub Release

After successful release:

1. Visit: `https://github.com/intelligent-artifacts/kato-dashboard/releases/new?tag=v0.x.x`
2. Select the created tag
3. Set release title: `v0.x.x - [Brief Description]`
4. Copy relevant section from CHANGELOG.md
5. Mark as pre-release if applicable
6. Publish release

#### Step 5: Verify Deployment

```bash
# Check image is available
docker pull ghcr.io/sevakavakians/kato-dashboard:0.x.x

# Verify image metadata
docker inspect ghcr.io/sevakavakians/kato-dashboard:0.x.x

# Test locally (optional)
docker-compose -f docker-compose.prod.yml up -d
./dashboard.sh status
./dashboard.sh test
```

## Automated Release

### Using `container-manager.sh`

The `container-manager.sh` script provides end-to-end automation.

**Features:**
- Interactive confirmations at each step
- Automatic version calculation
- Git commit and tag creation
- Docker build and push
- Registry verification
- Comprehensive error handling

**Usage Examples:**

```bash
# Patch release with automatic commit message
./container-manager.sh patch

# Minor release with custom message
./container-manager.sh minor "Add hierarchical graph visualization"

# Major release
./container-manager.sh major "Dashboard v2 with combined container architecture"
```

**Environment Variables:**

```bash
# Skip all confirmations (use with caution!)
AUTO_MODE=true ./container-manager.sh patch

# Use custom registry
REGISTRY=docker.io/myuser ./container-manager.sh minor
```

### Process Flow

1. **Environment Validation**
   - Checks git repository status
   - Verifies working directory is clean
   - Confirms correct branch
   - Validates Docker daemon

2. **Version Bump**
   - Calculates new version
   - Updates all version files
   - Shows diff for review

3. **CHANGELOG Update**
   - Reminds to update CHANGELOG.md
   - Optionally opens editor
   - Amends commit if modified

4. **Git Operations**
   - Creates commit with version bump
   - Creates annotated git tag
   - Pushes to remote repository

5. **Docker Build & Push**
   - Builds image with metadata
   - Tags with multiple version tags
   - Pushes all tags to registry

6. **Verification**
   - Confirms images exist in registry
   - Displays image metadata
   - Shows deployment instructions

## Manual Release

If you need more control or the automated script fails, follow this manual process:

### 1. Bump Version

```bash
./bump-version.sh patch "Fix session management bug"
```

This updates `pyproject.toml`, `frontend/package.json`, and `VERSION` files.

### 2. Update CHANGELOG

Edit `CHANGELOG.md`:

```markdown
## [0.1.1] - 2024-01-15

### Fixed
- Fixed session management bug causing logout issues
- Corrected Docker stats calculation

### Changed
- Improved error messages in API responses
```

Amend the commit if needed:

```bash
git add CHANGELOG.md
git commit --amend --no-edit
```

### 3. Push to GitHub

```bash
# Push commit
git push origin main

# Push tag
git push origin v0.1.1
```

### 4. Build Docker Image

```bash
./build-and-push.sh
```

Or manually:

```bash
VERSION=$(grep '^version = ' pyproject.toml | sed 's/version = "\(.*\)"/\1/')
GIT_COMMIT=$(git rev-parse --short HEAD)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

docker build \
  --build-arg VERSION="$VERSION" \
  --build-arg GIT_COMMIT="$GIT_COMMIT" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  -t ghcr.io/sevakavakians/kato-dashboard:$VERSION \
  .
```

### 5. Tag and Push Image

```bash
# Tag with multiple versions
docker tag ghcr.io/sevakavakians/kato-dashboard:$VERSION \
          ghcr.io/sevakavakians/kato-dashboard:latest

# Push all tags
docker push ghcr.io/sevakavakians/kato-dashboard:$VERSION
docker push ghcr.io/sevakavakians/kato-dashboard:latest
```

### 6. Verify

```bash
docker pull ghcr.io/sevakavakians/kato-dashboard:$VERSION
docker inspect ghcr.io/sevakavakians/kato-dashboard:$VERSION
```

## Post-Release

### 1. Create GitHub Release

Create a release on GitHub with:
- Tag: `v0.1.1`
- Title: `v0.1.1 - [Brief Description]`
- Description: Copy from CHANGELOG.md
- Assets: None needed (Docker images are in GHCR)

### 2. Announce Release

Consider announcing the release:
- Project communication channels
- Social media (if applicable)
- User documentation updates

### 3. Update Deployments

Update production deployments:

```bash
# On production server
./dashboard.sh update 0.1.1

# Or manually
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Monitor

After release, monitor:
- Application logs
- Error rates
- User reports
- Performance metrics

## Troubleshooting

### Git Working Directory Not Clean

**Problem:** Uncommitted changes prevent release

**Solution:**
```bash
# Review changes
git status

# Commit or stash changes
git add .
git commit -m "Prepare for release"
# or
git stash
```

### Docker Build Fails

**Problem:** Docker build errors

**Solutions:**

1. **Clear Docker cache:**
   ```bash
   docker system prune -a
   ./build-and-push.sh --no-cache
   ```

2. **Check Dockerfile syntax:**
   ```bash
   docker build --no-cache -t test .
   ```

3. **Verify build context:**
   ```bash
   # Ensure all required files exist
   ls -la frontend/ backend/ Dockerfile
   ```

### Push to Registry Fails

**Problem:** Authentication or permission errors

**Solutions:**

1. **Re-authenticate:**
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
   ```

2. **Verify token permissions:**
   - Token needs `write:packages` scope
   - Regenerate token if necessary

3. **Check repository settings:**
   - Verify package visibility settings in GitHub

### Version Already Exists

**Problem:** Tag or version already exists

**Solution:**

**Never reuse versions!** Instead:
1. Increment to next version
2. Delete local tag if needed:
   ```bash
   git tag -d v0.1.1
   ```
3. Use new version number

### Image Pull Fails

**Problem:** Cannot pull newly pushed image

**Solutions:**

1. **Wait a few minutes** - Registry replication takes time
2. **Verify image exists:**
   ```bash
   docker manifest inspect ghcr.io/sevakavakians/kato-dashboard:0.1.1
   ```
3. **Check package visibility** - Ensure package is public or you're authenticated

## Pre-Release Versions

For alpha, beta, or release candidate versions:

### Creating Pre-Release

```bash
# Create pre-release version
./bump-version.sh minor "0.2.0-beta.1"

# Build and push (will only tag with specific version, not latest)
./build-and-push.sh
```

### Pre-Release Guidelines

- Format: `MAJOR.MINOR.PATCH-PRERELEASE.NUMBER`
- Examples: `0.2.0-alpha.1`, `0.2.0-beta.1`, `0.2.0-rc.1`
- Pre-releases don't update `:latest`, `:MAJOR`, or `:MAJOR.MINOR` tags
- Mark GitHub Release as "pre-release"
- Test thoroughly before stable release

## Release Checklist

Use this checklist for each release:

- [ ] All code changes merged to main
- [ ] Tests passing
- [ ] Documentation updated
- [ ] CHANGELOG.md prepared
- [ ] Git working directory clean
- [ ] On main branch
- [ ] Docker daemon running
- [ ] GHCR authentication configured
- [ ] Run `./container-manager.sh <type>`
- [ ] Update CHANGELOG.md when prompted
- [ ] Verify version bumped correctly
- [ ] Verify git tag created
- [ ] Verify commit and tag pushed
- [ ] Verify Docker images built
- [ ] Verify images in registry
- [ ] Create GitHub Release
- [ ] Test deployment with new version
- [ ] Announce release (if applicable)
- [ ] Update production deployments
- [ ] Monitor application after release

## See Also

- [Version Management](./version-management.md) - Semantic versioning guidelines
- [CLAUDE.md](../../CLAUDE.md) - Complete project documentation
- [Semantic Versioning 2.0.0](https://semver.org/) - Official specification
