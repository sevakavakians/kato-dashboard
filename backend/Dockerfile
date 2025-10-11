# Multi-stage build for KATO Dashboard Backend

# Stage 1: Build dependencies
FROM python:3.11-slim as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Create non-root user first
RUN useradd -m -u 1000 dashboard

# Copy installed packages from builder to dashboard user's home
COPY --from=builder /root/.local /home/dashboard/.local
RUN chown -R dashboard:dashboard /home/dashboard/.local

# Copy application code
COPY app /app/app
COPY .env.example /app/.env
RUN chown -R dashboard:dashboard /app

# Add dashboard user to staff group (GID 20) for Docker socket access on macOS
# On Linux, this might be different, so we create/add to multiple common groups
RUN groupadd -g 999 docker 2>/dev/null || true && \
    groupadd -g 20 staff 2>/dev/null || true && \
    usermod -aG 999 dashboard 2>/dev/null || true && \
    usermod -aG 20 dashboard 2>/dev/null || true

# Create entrypoint script to fix Docker socket permissions
RUN echo '#!/bin/sh\n\
# Fix Docker socket permissions if it exists\n\
if [ -S /var/run/docker.sock ]; then\n\
    chmod 666 /var/run/docker.sock\n\
fi\n\
# Switch to dashboard user and run command\n\
exec gosu dashboard "$@"\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

# Install gosu for switching users (lighter alternative to su/sudo)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu && \
    rm -rf /var/lib/apt/lists/*

# Make sure scripts in .local are usable
ENV PATH=/home/dashboard/.local/bin:$PATH

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/v1/health', timeout=5).read()"

# Use entrypoint to fix Docker socket permissions
ENTRYPOINT ["/entrypoint.sh"]

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
