# Changelog

All notable changes to the KATO Dashboard project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-01-09

### Changed
- Consolidated from separate backend/frontend containers to single combined container
- Renamed container from `kato-dashboard-backend` to `kato-dashboard` for better naming consistency
- Updated docker-compose.yml to use combined Dockerfile for dev/prod parity
- Simplified dashboard.sh management script to handle single container
- Updated all documentation to reflect single-container architecture

### Fixed
- Fixed compatibility with external scripts expecting `kato-dashboard` container name
- Improved development/production deployment consistency

## [0.1.4] - 2026-01-05

### Fixed
- Fixed NameError in analytics overview endpoint
- Replaced undefined `get_processor_databases()` with correct `get_processors_hybrid()` function
- Resolved analytics functionality issues

## [0.1.3] - 2026-01-03

### Fixed
- Fixed hardcoded localhost:8080 URLs in frontend production build
- Implemented relative URLs for API calls (removed hardcoded backend URL)
- Fixed WebSocket connection to use `window.location` in production
- Resolved "connection refused" errors in browser console for production deployments
- Fixed nginx proxy compatibility with relative API paths

## [0.1.2] - 2025-12-23

### Fixed
- Made GitHub Release creation non-blocking in CI/CD workflow
- Fixed Python version mismatch in combined Docker image (Python 3.11 → 3.12)
- Updated GitHub Actions workflow to fix deprecated actions
- Added `contents:write` permission for GitHub Release creation
- Switched from GITHUB_TOKEN to GHCR_TOKEN (PAT) for package push authentication
- Added explicit GITHUB_TOKEN to release action

## [0.1.1] - 2025-12-17

### Changed
- Removed all MongoDB references after migration to ClickHouse + Redis hybrid storage
- Updated Docker container monitoring references (kato-mongodb → kato-clickhouse)
- Updated documentation (CLAUDE.md, README.md, Databases.tsx)
- Corrected database module import paths

### Added
- Automated CI/CD with GitHub Actions workflow
- Multi-architecture Docker builds (linux/amd64, linux/arm64)
- Automatic GitHub Releases on version tags
- Pre-release version handling in CI/CD
- Container image publishing to GitHub Container Registry (GHCR)

### Fixed
- Corrected repository references to use sevakavakians account

## [0.1.0] - 2025-12-17

### Added

**Initial release with comprehensive Docker versioning and automation system.**

#### Docker Versioning System
- Version synchronization across pyproject.toml, VERSION file, and frontend package.json
- Semantic versioning 2.0.0 compliance
- Multi-tag strategy (version, minor, major, latest)
- Pre-release version support (alpha, beta, rc)

#### Automation Scripts
- `bump-version.sh` - Interactive version bumping with git integration
- `build-and-push.sh` - Docker image building and GHCR publishing
- `container-manager.sh` - End-to-end release automation
- Enhanced `dashboard.sh` with version management commands:
  - `version` - Show version information
  - `pull-registry [tag]` - Pull images from GHCR
  - `update [tag]` - Update to latest registry version

#### Docker Infrastructure
- Combined Dockerfile containing both frontend and backend
- Multi-stage build: Node.js (frontend) + Python (backend) + Nginx (serving)
- Nginx + Uvicorn managed by supervisor in single container
- `docker-compose.prod.yml` for production registry deployments
- OCI-compliant container labels with build metadata
- Health checks for both services

#### Registry Configuration
- GitHub Container Registry (GHCR) integration
- Image repository: `ghcr.io/sevakavakians/kato-dashboard`
- Automated multi-tag publishing:
  - Specific version (e.g., `0.1.0`)
  - Minor version (e.g., `0.1`)
  - Major version (e.g., `0`)
  - `latest` tag for stable releases

#### Documentation
- Comprehensive Docker versioning guide (`docs/maintenance/version-management.md`)
- Complete release process documentation (`docs/maintenance/releasing.md`)
- Enhanced CLAUDE.md with Docker deployment section
- Version pinning strategies and best practices

### Fixed
- Fixed postcss.config.js CommonJS syntax compatibility with Docker builds
- Corrected emotives and metadata display in pattern browser UI

---

## Pre-release Development Highlights

The following major features were developed before the initial v0.1.0 release:

### Hierarchical Graph Visualization (2025-12-11)
- Pattern-level compositional relationship visualization
- 7 layout modes with advanced graph algorithms
- Interactive exploration and progressive graph building
- BFS-based connection highlighting

### Knowledgebase Management (2025-12-09)
- Bulk deletion operations for patterns and collections
- Double confirmation UI pattern for destructive operations
- Checkbox-based multi-select interface
- Migration from MongoDB to ClickHouse + Redis hybrid storage

### Real-time Updates (2025-10-13)
- WebSocket implementation (Phases 1-4)
- Selective subscriptions for specific data types
- Live metrics and session updates

### Docker Container Monitoring (2025-10-11)
- Real-time CPU and memory metrics via Docker API
- Container stats integration in dashboard
- Read-write Docker socket access

### Database Browsers (2025-10-09 to 2025-10-10)
- Multi-database viewer (ClickHouse, Qdrant, Redis)
- Pattern browser with detail modals
- Pagination and search functionality
- KATO schema compliance fixes

### Core Dashboard (2025-10-06 to 2025-10-09)
- FastAPI backend with async database clients
- React frontend with TanStack Query
- System metrics and session management
- Database connection management
- Health check endpoints

---

## Version Links

[0.1.5]: https://github.com/sevakavakians/kato-dashboard/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/sevakavakians/kato-dashboard/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/sevakavakians/kato-dashboard/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/sevakavakians/kato-dashboard/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/sevakavakians/kato-dashboard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sevakavakians/kato-dashboard/releases/tag/v0.1.0
