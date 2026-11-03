# ── Crazy Downloader backend ── Python 3.14 + yt-dlp ──
FROM python:3.14-slim

# ffmpeg is needed for post-processing / format merging fallback.
# Deno is the JavaScript runtime yt-dlp needs to solve YouTube's player
# challenges; without it signed-in (cookie) requests come back with no formats.
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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# When deployed as a single image, the frontend build is copied to backend/static
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
