<p align="center">
  <img src="icons/icon-128.png" alt="popup" width="128">
</p>

<h2 align="center"><b>YouTube Cookies Exporter</b></h2>

A popup-only browser extension that exports your signed-in **youtube.com** cookies as a Netscape
`cookies.txt` — the format Crazy Downloader's cookie box accepts.

The cookies that prove you are signed in (`SID`, `LOGIN_INFO`, …) are `HttpOnly`. A page script,
including the app's own "Auto-detect" button, can never read them. The browser's `cookies` API can,
and an extension is the only thing that gets access to it.

[![Extension CI](https://github.com/nayandas69/crazy-downloader/actions/workflows/extension-ci.yml/badge.svg)](https://github.com/nayandas69/crazy-downloader/actions/workflows/extension-ci.yml)

[![Extension Release](https://github.com/nayandas69/crazy-downloader/actions/workflows/extension-release.yml/badge.svg)](https://github.com/nayandas69/crazy-downloader/actions/workflows/extension-release.yml)

## What it does

1. Reads the browser's YouTube cookies through `chrome.cookies` / `browser.cookies`.
2. Converts them to Netscape lines (seven tab-separated fields), prefixing `HttpOnly` cookies with
   `#HttpOnly_` so yt-dlp treats them as real cookies rather than comments.
3. Lets you **Copy** the text, **Download cookies.txt**, or inspect it in a preview.
4. Reports how many cookies it found and whether a signed-in session is present.

Nothing leaves the device during export.

## Layout

```
extension/
├── manifest.chrome.json    MV3 manifest (Chrome, Edge, Brave, Kiwi, Lemur, Orion)
├── manifest.firefox.json   MV3 manifest + gecko id (Firefox, Firefox Android)
├── src/
│   ├── popup.html/js/css   the whole UI
│   └── cookies.js          pure cookie → Netscape conversion (unit-tested)
├── scripts/
│   ├── build.mjs           builds dist/chrome, dist/firefox and the release zips
│   └── zip.mjs             dependency-free ZIP writer
├── tests/                  node:test suites
└── icons/                  extension icons (16, 32, 48, 128 px)
```

There are no npm dependencies and no bundler: the source is plain ES modules, so what you read is
what ships. The build copies files and injects the version.

## Develop

```bash
cd extension
npm test          # node --test tests/*.test.js
npm run build     # writes dist/ + dist/youtube-cookies-<version>-<target>.zip
```

`npm run build` produces:

```
dist/chrome/                               load-unpacked folder
dist/firefox/                              load-unpacked folder
dist/youtube-cookies-<version>-chrome.zip
dist/youtube-cookies-<version>-firefox.zip
```

Load `dist/chrome` as an unpacked extension (`chrome://extensions` → Developer mode → Load
unpacked), or load `dist/firefox/manifest.json` through `about:debugging#/runtime/this-firefox` →
**Load Temporary Add-on**.

The tests cover the pure conversion helpers (`cookies.test.js`), both manifests
(`manifest.test.js`), the popup wiring against a fake DOM and `chrome` API (`popup.test.js`), and the
release workflow's shell steps (`release.test.js`).

## Use

1. Sign in to **youtube.com** in the same browser.
2. Open the popup and tap **Get cookies**.
3. Tap **Copy** or **Download cookies.txt**.
4. In Crazy Downloader, open **Cookie settings** and paste the text or upload the file. The pending
   search retries automatically; otherwise the cookies are saved for the next request.

If the popup opens in a very narrow side panel on mobile, tap **Open the exporter in a tab**; the
same page then uses the full screen width.

## Mobile browsers

A phone browser can only run this extension if it supports extensions at all:

| Platform | Browser | Notes |
| --- | --- | --- |
| Android | Kiwi, Lemur (Chromium with extension support) | Load the Chrome bundle as an unpacked extension. |
| Android | Firefox | Only signed add-ons install; publish the Firefox bundle on addons.mozilla.org (unlisted is fine) and install the `.xpi`. |
| iOS / iPadOS | Orion | Installs Chrome extensions from its extensions settings. |
| Any phone | Chrome / Safari | **No extension support** — export `cookies.txt` once on a computer and send the file to the phone. |

## Permissions and privacy

- `cookies` — read the browser's cookie store.
- `https://*.youtube.com/*` — the only sites the cookie API is queried for.

The export happens locally: no network request is made, nothing is uploaded, and the text stays in
the popup until you copy or download it. Crazy Downloader then sends those cookies only with your
own requests.
