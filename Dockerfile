# Combined Dockerfile for KATO Dashboard
# This creates a single production image containing both frontend and backend services
# Frontend is served by Nginx, which also proxies API requests to the backend

# Build arguments for versioning and metadata
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ARG CACHE_BUST=1

#############################################
# Stage 1: Build Frontend
#############################################
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

#############################################
# Stage 2: Prepare Backend
#############################################
FROM python:3.12-alpine AS backend-builder

WORKDIR /app/backend

# Install system dependencies for Alpine
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    linux-headers

# Copy backend requirements
COPY backend/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

#############################################
# Stage 3: Production Image
#############################################
FROM nginx:alpine

# Re-declare build args for this stage
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ARG CACHE_BUST=1

# OCI-compliant labels
LABEL org.opencontainers.image.title="KATO Dashboard"
LABEL org.opencontainers.image.description="Comprehensive web-based monitoring and management system for the KATO AI platform"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.vendor="Sevak Avakians"
LABEL org.opencontainers.image.source="https://github.com/sevakavakians/kato-dashboard"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.documentation="https://github.com/sevakavakians/kato-dashboard#readme"

# Install Python and supervisor for process management
RUN apk add --no-cache \
    python3 \
    py3-pip \
    supervisor \
    && rm -rf /var/cache/apk/*

# Create application directory
WORKDIR /app

# Copy Python dependencies from builder to where Alpine's Python looks
COPY --from=backend-builder /usr/local/lib/python3.12/site-packages /usr/lib/python3.12/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy backend application
COPY backend/ ./backend/

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Create Nginx configuration for SPA and API proxy
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 3001;
    server_name localhost;

    # Frontend root
    root /usr/share/nginx/html;
    index index.html;

    # API proxy to backend
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for /ws
    location /ws {
        proxy_pass http://localhost:8080/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # WebSocket support for /socket.io (legacy, can be removed if not used)
    location /socket.io/ {
        proxy_pass http://localhost:8080/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint (pass to backend)
    location /health {
        proxy_pass http://localhost:8080/health;
    }

    # API docs (pass to backend)
    location /docs {
        proxy_pass http://localhost:8080/docs;
    }

    location /openapi.json {
        proxy_pass http://localhost:8080/openapi.json;
    }

    location /redoc {
        proxy_pass http://localhost:8080/redoc;
    }

    # SPA fallback - serve index.html for all other routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Create supervisor configuration
RUN cat > /etc/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:nginx]
command=nginx -g 'daemon off;'
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:backend]
command=python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
directory=/app/backend
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PYTHONUNBUFFERED=1
EOF

# Create log directory for supervisor
RUN mkdir -p /var/log/supervisor

# Expose port 3001 (Nginx serves on this port)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Store version information in image
RUN echo "${VERSION}" > /app/VERSION && \
    echo "${GIT_COMMIT}" > /app/GIT_COMMIT && \
    echo "${BUILD_DATE}" > /app/BUILD_DATE

# Start both services using supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
