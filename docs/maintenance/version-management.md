# Version Management

This document describes the semantic versioning strategy and version management practices for KATO Dashboard.

## Table of Contents

- [Semantic Versioning](#semantic-versioning)
- [Version Files](#version-files)
- [Bumping Versions](#bumping-versions)
- [Version History](#version-history)
- [Best Practices](#best-practices)

## Semantic Versioning

KATO Dashboard follows [Semantic Versioning 2.0.0](https://semver.org/). Given a version number `MAJOR.MINOR.PATCH`, increment the:

### MAJOR Version (X.0.0)

Increment when you make **incompatible API changes** or **breaking changes** that require users to modify their setup or code.

**Examples:**
- Removing or renaming API endpoints
- Changing required environment variables
- Modifying database schema in non-backward-compatible ways
- Changing Docker container architecture (e.g., separate containers → combined container)
- Removing support for older dependencies or platforms

**Current Status:** Version `0.x.x` indicates the dashboard is in initial development. Once the API is considered stable, we'll release `1.0.0`.

### MINOR Version (x.Y.0)

Increment when you add **new features** or **functionality** in a backward-compatible manner.

**Examples:**
- Adding new API endpoints
- Adding new dashboard pages or visualizations
- Adding optional environment variables or configuration options
- Introducing new features that don't break existing functionality
- Adding support for new data sources or integrations

**Note:** In `0.x.x` versions, minor version bumps MAY include breaking changes during initial development.

### PATCH Version (x.y.Z)

Increment when you make **backward-compatible bug fixes** or **minor improvements**.

**Examples:**
- Fixing bugs in existing features
- Performance improvements without API changes
- Documentation updates
- Dependency updates (security patches)
- UI/UX improvements that don't change functionality
- Code refactoring with no external impact

## Version Files

Version information is maintained in three synchronized files:

### 1. `pyproject.toml` (Primary Source)

The canonical source of version information.

```toml
[project]
name = "kato-dashboard"
version = "0.1.0"
```

**Why primary?**
- Standard Python packaging format
- Single source of truth
- Used by build tools and automation scripts

### 2. `frontend/package.json`

Frontend package version for npm ecosystem.

```json
{
  "name": "kato-dashboard-frontend",
  "version": "0.1.0"
}
```

**Synchronized because:**
- npm ecosystem expects version in package.json
- Enables frontend-specific tooling and version checks
- Maintains consistency across the full stack

### 3. `VERSION`

Simple text file containing just the version number.

```
0.1.0
```

**Purpose:**
- Easy to read by shell scripts and automation tools
- Quick version reference without parsing TOML or JSON
- Can be embedded in Docker images

## Bumping Versions

### Automated Version Bumping

Use the `bump-version.sh` script for all version changes:

```bash
# Patch release (0.1.0 → 0.1.1)
./bump-version.sh patch

# Minor release (0.1.0 → 0.2.0)
./bump-version.sh minor "Add new analytics feature"

# Major release (0.1.0 → 1.0.0)
./bump-version.sh major "Stable release with breaking API changes"
```

**What the script does:**
1. Validates git working directory is clean
2. Extracts current version from `pyproject.toml`
3. Calculates new version based on bump type
4. Updates all three version files simultaneously
5. Shows git diff of changes
6. Optionally creates git commit
7. Optionally creates annotated git tag
8. Provides next steps guidance

**Options:**
- Interactive mode (default): Confirms each step
- Custom commit message: Pass as second argument
- Automatic tagging: Prompts for tag creation after commit

### Manual Version Bumping

**Not recommended**, but if you need to manually update versions:

1. Update `pyproject.toml`:
   ```toml
   version = "0.2.0"
   ```

2. Update `frontend/package.json`:
   ```json
   "version": "0.2.0"
   ```

3. Update `VERSION`:
   ```
   0.2.0
   ```

4. Commit all three files together:
   ```bash
   git add pyproject.toml frontend/package.json VERSION
   git commit -m "Bump version to 0.2.0"
   git tag -a v0.2.0 -m "Release version 0.2.0"
   ```

## Version History

### Current Version

- **0.1.0** (Initial Release)
  - Combined Docker image with frontend + backend
  - Hybrid architecture support (ClickHouse + Redis)
  - Hierarchical graph visualization
  - Pattern and symbol browser
  - Real-time WebSocket updates
  - Docker container stats monitoring

### Pre-Release Versions

Pre-release versions follow the format: `MAJOR.MINOR.PATCH-PRERELEASE.NUMBER`

Examples:
- `0.1.0-alpha.1` - Alpha testing
- `0.1.0-beta.1` - Beta testing
- `0.1.0-rc.1` - Release candidate

**Pre-release tagging rules:**
- Pre-release versions are tagged with the full version string (e.g., `v0.1.0-beta.1`)
- They do NOT update the `:latest`, `:MAJOR`, or `:MAJOR.MINOR` Docker tags
- Only tagged with the specific pre-release version

## Best Practices

### 1. Never Reuse Version Numbers

Once a version is released and tagged, never delete the tag or reuse the version number, even if you discover a critical bug immediately after release. Instead:

- Create a new patch version (e.g., `0.1.1`)
- Document what changed in the new release

### 2. Keep Versions Synchronized

All three version files (`pyproject.toml`, `package.json`, `VERSION`) must always have the same version number. Use `bump-version.sh` to ensure this.

### 3. Tag Every Release

Every released version should have a corresponding git tag:

```bash
git tag -a v0.1.0 -m "Release version 0.1.0"
git push origin v0.1.0
```

### 4. Use Semantic Commit Messages

When committing version bumps, use clear messages:

```bash
# Good
git commit -m "Bump version to 0.2.0 (add analytics feature)"
git commit -m "Bump version to 0.1.1 (fix session bug)"

# Less helpful
git commit -m "Version bump"
git commit -m "Update version"
```

### 5. Update CHANGELOG

After bumping the version, update `CHANGELOG.md` with:
- Version number and release date
- List of new features
- List of bug fixes
- List of breaking changes (if any)

### 6. Version 0.x.x Guidelines

During initial development (versions `0.x.x`):
- **0.1.x**: Initial features and bug fixes
- **0.2.x**: Feature additions that may include small breaking changes
- **0.x.0**: Larger feature additions or significant refactoring
- **1.0.0**: First stable release with commitment to backward compatibility

### 7. Pre-Release Testing

Before releasing a major or minor version:

1. Create a pre-release version (e.g., `0.2.0-beta.1`)
2. Test thoroughly in staging environment
3. Fix any discovered issues
4. Release the stable version (e.g., `0.2.0`)

### 8. Docker Image Versioning

Docker images are automatically tagged with:
- Specific version: `ghcr.io/sevakavakians/kato-dashboard:0.1.0`
- Minor version: `ghcr.io/sevakavakians/kato-dashboard:0.1`
- Major version: `ghcr.io/sevakavakians/kato-dashboard:0`
- Latest: `ghcr.io/sevakavakians/kato-dashboard:latest`

Users can choose their stability/update preference:
- Pin to specific version for maximum stability
- Use minor version tag to auto-receive patch updates
- Use major version tag to auto-receive minor updates
- Use `latest` tag for development/testing only

## Questions?

For questions about version management:
- Check [Semantic Versioning 2.0.0](https://semver.org/) specification
- Review [releasing.md](./releasing.md) for the complete release process
- Open an issue on GitHub for clarification

## See Also

- [Releasing Process](./releasing.md) - Complete guide to releasing new versions
- [Docker Versioning](#) - Docker-specific versioning strategy (in CLAUDE.md)
