# ── Crazy Downloader — single-service stable build ──
# Builds the frontend (Vite) and backend (FastAPI) into one image.
# The backend serves both the API and the built static frontend.

# ── Stage 1: Build frontend ──
FROM node:24-slim AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Backend + static frontend ──
FROM python:3.14-slim

# ffmpeg merges DASH video with audio; Deno is the JavaScript runtime yt-dlp
# needs to solve YouTube's player challenges. Without the runtime, requests
# that carry cookies switch to clients whose formats cannot be signed, and
# YouTube answers with no usable formats.
ARG DENO_VERSION=2.9.8
ENV DENO_NO_UPDATE_CHECK=1
RUN set -eux; \
    apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg ca-certificates curl unzip; \
    rm -rf /var/lib/apt/lists/*; \
    case "$(dpkg --print-architecture)" in \
        arm64) deno_arch=aarch64 ;; \
        *) deno_arch=x86_64 ;; \
    esac; \
    curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${deno_arch}-unknown-linux-gnu.zip" -o /tmp/deno.zip; \
    unzip -q /tmp/deno.zip -d /usr/local/bin; \
    rm -f /tmp/deno.zip; \
    chmod 755 /usr/local/bin/deno; \
    deno --version

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /build/dist ./static

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
