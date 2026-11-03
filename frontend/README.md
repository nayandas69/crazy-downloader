# Crazy Downloader — Frontend

This single-page app for pasting a YouTube URL, choosing a format, and downloading with live progress.

---

## Tech Stack

| Component | Technology |
| --- | --- |
| Framework | React 19 + React Router 7 |
| Build tool | Vite 8 |
| Language | TypeScript 7 (`tsc --noEmit` in the build) |
| Styling | Tailwind CSS 3, PostCSS, Autoprefixer |
| Icons | lucide-react |
| Tests | Vitest 5, Testing Library, jsdom |
| Runtime | Node.js 24 |

## Layout

```
frontend/
├── src/
│   ├── main.tsx                 React root
│   ├── App.tsx                  routes
│   ├── api/client.ts            API calls, cookie storage, error mapping
│   ├── components/
│   │   ├── Layout.tsx           header, nav, footer
│   │   ├── UrlInput.tsx         URL form, validation, paste button
│   │   ├── FormatList.tsx       video info + format cards + download state
│   │   ├── CookieManager.tsx    cookie sheet (paste, upload, auto-detect)
│   │   ├── HowItWorks.tsx       "how it works" and feature sections
│   │   ├── AdSection.tsx        sponsor banner / placeholder
│   │   └── GitHubBadge.tsx      star count link
│   ├── config/sponsors.ts       sponsor configuration
│   ├── pages/                   Home, Privacy, Terms, ServerError, NotFound
│   └── __tests__/, test/        Vitest suites
├── vite.config.ts               dev server, `/api` proxy
├── vitest.config.ts             jsdom test environment
├── Dockerfile                   node build → nginx image
└── nginx.conf                   SPA fallback, gzip, streaming `/api` proxy
```

## Routes

| Path | Page |
| --- | --- |
| `/` | Downloader |
| `/privacy` | Privacy policy |
| `/terms` | Terms of use |
| `/500` | Server error page |
| `*` | Not found |

## Local development

### Prerequisites

- Node.js **24**

### Run

```bash
cd frontend
npm ci
npm run dev
```

The dev server listens on `http://localhost:5173` and proxies `/api` to `http://backend:8000` — the
Compose service name. When the backend runs directly on your host, change the proxy target in
`vite.config.ts` to `http://localhost:8000`. `run.sh` installs dependencies and starts the same dev
server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR (port 5173) |
| `npm run build` | `tsc --noEmit && vite build` → `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | Type check only (`tsc --noEmit`) |
| `npm run format` | Prettier write for `src` |
| `npm run format:check` | Prettier check for `src` |

## Features

### Search and formats

`UrlInput` validates the link client-side, then `Home` calls `api.getFormats`. Results are split into
**video** (`video_audio` + `video_only`, sorted by resolution then bitrate) and **audio only** (sorted
by bitrate). Each card shows quality, container, FPS above 30, and size when known.

If YouTube blocks the request, the app surfaces the message and — for `cookies_required` /
`cookies_rejected` — opens the cookie sheet, then retries the same URL once cookies are saved.

### Real-time download progress

`FormatList` downloads with the Fetch API and reads the response body as a stream:

- **Phases:** Connecting → Downloading → Merging (DASH formats) → Finalizing.
- **Progress:** percentage when `Content-Length` or `X-Estimated-Size` is known; otherwise an
  indeterminate bar with bytes received. Merged streams are detected by an estimate without a
  content length.
- **Speed and ETA:** speed is an exponential moving average (60% previous, 40% instant), updated
  every ~100 ms; ETA derives from the smoothed speed and known total.
- **Cancel:** an `AbortController` aborts the fetch mid-stream.
- **Save:** chunks are assembled into a Blob and saved with the `Content-Disposition` filename.

The download request is always `/api/download` on the page's own origin, so the nginx/Vite proxy
handles it. `api.downloadUrl` exists for building links but the component uses the relative URL.

### Cookie manager

Cookies are stored in `localStorage` under `crazy-downloader-cookies` (text) and
`crazy-downloader-cookies-source` (`manual`, `file`, or `auto`). They are Base64-encoded and sent as
`X-Cookies` only on format and download requests. The sheet supports:

- uploading a `cookies.txt` (read on-device with `File.text()`),
- pasting the text,
- auto-detecting `document.cookie` (limited to non-`HttpOnly` YouTube cookies, so it rarely finds the
  signed-in session — the upload path is the reliable one),
- removing stored cookies,
- status display and a note pointing to the browser extension for phones.

### Sponsor section

`src/config/sponsors.ts` holds `activeSponsor` (image, link, alt) and `sponsorContactLink`. Set
`activeSponsor` to `null` to show the "your ad could be here" placeholder. `AdSection` renders only
while no video is loaded and no error is shown, so results take its place.

### GitHub badge

The header badge fetches `https://api.github.com/repos/nayandas69/crazy-downloader` for the star
count; if the request fails it still renders the repository link.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | empty | Base URL for the `/api/formats` request. Empty means same-origin. Download requests are always relative (`/api/download`), so the proxy must serve `/api` on the page's origin. |

Baked in at build time by Vite, so rebuild after changing it.

## Testing

```bash
cd frontend
npm ci
npm test
```

Vitest runs in jsdom with Testing Library. Suites cover app routing (`App.test.tsx`), the home flow
(`Home.test.tsx`), format rendering (`FormatList.test.tsx`), and the API client including cookie
encoding and error mapping (`__tests__/client.test.ts`).

## Building

```bash
cd frontend
npm run build
```

`npm run build` type-checks first and emits `dist/`. In the Compose stack, `frontend/Dockerfile`
builds that output in a Node stage and serves it with nginx, which also proxies `/api/` to
`backend:8000` without buffering and with long read/send timeouts for streams. In the root
single-image build, `dist/` is copied into the backend image and served by FastAPI instead.
