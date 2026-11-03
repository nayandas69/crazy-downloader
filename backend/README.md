# Crazy Downloader — Backend

FastAPI service that extracts YouTube formats with yt-dlp and streams downloads to the client. No
database, no persistent storage, and no re-encoding.

---

## Tech Stack

| Component | Technology |
| --- | --- |
| Framework | FastAPI 0.162 on Starlette 1.10 |
| Extraction | yt-dlp 2026.08.19 + yt-dlp-ejs (bundled challenge solver) |
| Streaming client | httpx (async, streamed) |
| Merging | ffmpeg, `-c copy` over pipes |
| Runtime | Python 3.14, Deno 2.9.8, ffmpeg |
| Tests / lint | pytest, pytest-asyncio, ruff |

## Layout

```
backend/
├── app/
│   ├── main.py            application factory, CORS, error handler, /api routes
│   ├── middleware.py      in-memory sliding-window rate limiter
│   ├── routers/download.py format + download endpoints, ffmpeg merging
│   ├── services.py        yt-dlp wrapper, format parsing, cookie handling, cache
│   └── schemas.py         Pydantic models mirroring the JSON response shapes
├── tests/                 health, routes, services
├── Dockerfile             python:3.14-slim + ffmpeg + Deno
├── run.sh                 local dev: install requirements, uvicorn --reload
├── pyproject.toml         version, ruff and pytest config
├── requirements.txt       runtime dependencies
└── requirements-dev.txt   pytest, pytest-asyncio, httpx, ruff
```

## Local development

### Prerequisites

- Python **3.14**
- **ffmpeg** on `PATH` (`apt install ffmpeg` / `brew install ffmpeg`) for DASH merging
- **Deno** on `PATH` for yt-dlp's JavaScript player-challenge solving. Public videos often extract
  without it, but signed-in/cookie requests need it to return usable formats.

### Run

```bash
cd backend
./run.sh
```

`run.sh` installs `requirements.txt`, prints the Python/yt-dlp versions, then runs:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or manually:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Docker

```bash
docker build -t crazy-downloader-backend .
docker run -p 8000:8000 crazy-downloader-backend
```

The image installs ffmpeg and Deno, copies the app, and starts
`uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers`.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api` | Service name, version, endpoint list |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/formats?url=<youtube-url>` | Extract metadata and formats (cached 5 min) |
| `GET` | `/api/download?url=<youtube-url>&format_id=<id>&title=<title>` | Stream a format |
| `GET` | `/api/docs` | Swagger UI |
| `GET` | `/api/openapi.json` | OpenAPI schema |

URL validation accepts `youtube.com` (`/watch`, `/embed`, `/v`, `/shorts`, `/live`) and `youtu.be`,
over http or https. Playlists are not expanded (`noplaylist`), and HLS/`.m3u8` formats are skipped.

### `/api/formats` response

```json
{
  "title": "Video title",
  "thumbnail": "https://i.ytimg.com/...",
  "duration": 212,
  "uploader": "Channel",
  "view_count": 123456,
  "formats": [
    {
      "format_id": "137",
      "ext": "mp4",
      "resolution": "1920x1080",
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "vcodec": "avc1.640028",
      "acodec": "none",
      "filesize": 12345678,
      "filesize_approx": 12345678,
      "tbr": 4500.5,
      "format_note": "1080p",
      "category": "video_only"
    }
  ]
}
```

`category` is `video_audio`, `video_only`, or `audio_only`.

### Headers

Request:

- `X-Cookies` (optional) — Base64-encoded Netscape `cookies.txt` contents. Invalid Base64 is
  ignored; valid Base64 that is not Netscape format returns `400 invalid_cookies`.

Response for `/api/download`:

- `Content-Disposition` — filename, with characters unsafe for filesystems replaced by `_`.
- `Content-Length` — exact size when known (from yt-dlp metadata or the CDN).
- `X-Estimated-Size` — approximate total for merged streams where the exact size is unknown.
- `Content-Type` — taken from the upstream stream (`video/mp4` or `video/webm` for merged output).

CORS allows any origin without credentials and exposes `X-Estimated-Size`, `Content-Disposition`,
`Content-Length`, and `Content-Type`.

### Errors

Bodies follow `{"detail": ...}`; cookie errors use an object:

```json
{
  "detail": {
    "code": "cookies_required",
    "message": "YouTube asked us to confirm you're not a bot for this video. ..."
  }
}
```

| Status | Cause |
| --- | --- |
| `400` | Empty/invalid URL, extraction failure, or `invalid_cookies`. |
| `403` | `cookies_required`, `cookies_rejected`, or an upstream stream refusing the session. |
| `404` | `format_id` not present in the extracted formats. |
| `429` | Rate limit exceeded. |
| `500` | Unhandled error or ffmpeg merge failure. |
| `502` | Upstream stream unreachable or rejected with a non-auth status. |

Unhandled exceptions are logged and returned as `500 {"detail": "An unexpected error occurred."}`.

## How downloads work

1. **Formats.** `services.extract_info` runs `YoutubeDL.extract_info(url, download=False)` inside
   `asyncio.to_thread`, so the event loop stays free. Results are cached in memory for five minutes
   (`_CACHE_TTL = 300`). The cache key is `anon:<url>` or `auth:<sha256(cookies)[:16]>:<url>`, because
   media URLs are minted for the session that requested them; mixing signed-in and anonymous results
   causes false `cookies_rejected` errors.
2. **Progressive formats** (`video_audio`, `audio_only`): httpx requests the format URL with
   YouTube's headers (plus a `Cookie` header built from the supplied cookie file) and streams the
   body to the response. `Content-Length` is forwarded when known.
3. **Video-only formats:** `find_best_audio` selects the highest-`tbr` audio-only format. If none
   exists, the video-only stream is sent as-is. Otherwise ffmpeg reads both URLs and writes
   `-c copy` output to `pipe:1`:
   - WebM input → `-f webm`;
   - everything else → `-f mp4 -movflags frag_keyframe+empty_moov`.
   No temporary media files are created. `X-Estimated-Size` is the sum of the two format sizes.
4. **Cookies.** `normalize_cookies` trims BOM/CR newlines, keeps `#HttpOnly_` lines, requires seven
   tab-separated fields, and re-adds the Netscape header. `extract_info` writes the set to
   `tempfile.mkstemp()` for the yt-dlp run and unlinks it in a `finally` block. If a cookie attempt
   fails, extraction is retried anonymously so expired cookies never hide a public video; the cookie
   error is only surfaced when the failure is genuinely about a signed-in session.
5. **Rate limiting.** `RateLimitMiddleware` keeps a per-IP sliding window of 30 requests per 60
   seconds. It is in-memory and per process, so it fits single-instance deployments; `/api/health`,
   `/api`, `/api/docs`, and `/api/openapi.json` bypass it.

When the built SPA is present in `backend/static` (the root single-image Docker build), FastAPI
mounts it at `/`; API routes keep their `/api` prefix.

## Testing and linting

```bash
cd backend
pip install -r requirements-dev.txt

ruff format --check .   # formatting
ruff check .            # lint (E, F, W, I, UP, B, SIM)
pytest                  # tests (asyncio_mode = auto)
```

Test coverage:

| File | Covers |
| --- | --- |
| `tests/test_health.py` | `/api/health`, `/api` |
| `tests/test_download_routes.py` | URL validation, format/download routes, cookie errors |
| `tests/test_services.py` | cookie normalization, format parsing, caching keys, error helpers |

## Privacy

- Downloads are piped through; no video file is written to disk.
- Cookies are never persisted — they exist in a temp file for one request and are deleted after.
- No analytics or database; server logs may record requests and errors.
