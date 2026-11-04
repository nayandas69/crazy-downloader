<p align="center">
  <img src="icons/icon-128.png" alt="YouTube Cookies Exporter icon" width="96">
</p>
<h1 align="center">YouTube Cookies Exporter</h1>

Export your own YouTube cookies as a Netscape `cookies.txt` file for [Crazy Downloader](https://github.com/nayandas69/crazy-downloader/). The extension is useful when YouTube asks the downloader to verify your session. It is for people using Crazy Downloader in a browser that supports extensions.

## Install

- **Microsoft Edge:** Install [YouTube Cookies Exporter from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/youtube-cookies-exporter/knddfbdekkmlkfjloijeclpapobbfjgo).
- **Release bundles:** Download the Chrome or Firefox bundle from the [GitHub releases page](https://github.com/nayandas69/crazy-downloader/releases/). Unzip it before loading it manually.
  - For Chrome, Edge, or another compatible Chromium browser, open its extensions page, enable developer mode, and load the unzipped Chrome bundle as an unpacked extension.
  - For Firefox desktop, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the Firefox bundle's `manifest.json`. A temporary add-on is removed when Firefox closes. Permanent installation requires a signed add-on.

On mobile, extension availability and installation methods depend on the browser and platform. Use a browser that supports the corresponding extension format; standard mobile browsers may not support installing these bundles. Consult the browser's installation instructions.

## Use with Crazy Downloader

1. Sign in to [YouTube](https://www.youtube.com/) in the same browser and profile as the extension.
2. Open the extension. It checks YouTube cookies when the popup opens; select **Get cookies** to check again after signing in.
3. Select **Copy** or **Download cookies.txt**. You can expand the preview to inspect the text. If clipboard access fails, select the preview text and copy it manually.
4. In Crazy Downloader, open **Cookie settings**, paste the text or upload the file, and save it. If the app was waiting for cookies after a failed search, it retries that search.

The popup adapts to narrow panels. In a narrow panel, **Open in a tab** is also available. If no signed-in session is found, sign in to YouTube and select **Get cookies** again. A session indication is based on cookie names and does not guarantee that YouTube will accept the cookies; export again if they expire or are rejected.

## How it works

The browser's cookies API reads cookies for `youtube.com` and its subdomains, including `HttpOnly` session cookies that a normal web page cannot read. The extension converts them to the seven-field Netscape format, preserving `#HttpOnly_` markers for yt-dlp. It does not send the export to a server.

You choose whether to copy or download the text and provide it to Crazy Downloader. The app stores saved cookies in its browser's `localStorage`, sends them to its backend in the `X-Cookies` request header for format and download requests, and uses them for the requested YouTube operation. The backend deletes its temporary cookie file after extraction. Use **Remove** in Cookie settings to remove the app's saved copy; delete any downloaded file separately. See the [privacy policy](PRIVACY.md) for details.

**Treat exported cookies like a password.** They can contain an active session. Do not share them, and remove copies you no longer need.

## Permissions

- `cookies`: access the browser cookie store through the extension API.
- `https://*.youtube.com/*`: restrict cookie access to YouTube and its subdomains.

## Development and releases

The extension uses plain ES modules and has no npm dependencies. Node.js 24 is used in CI.

```bash
cd extension
npm test
npm run build
```

The build writes unpacked folders to `dist/chrome/` and `dist/firefox/`, plus `youtube-cookies-<version>-chrome.zip` and `youtube-cookies-<version>-firefox.zip`. The package version is injected into both built manifests. Tests cover cookie conversion, manifests, popup behavior, and release workflow steps. Release assets also include `SHA256SUMS.txt` for checking the downloaded archives.

| Path | Purpose |
| --- | --- |
| `src/` | Popup and cookie conversion |
| `manifest.chrome.json`, `manifest.firefox.json` | Browser permissions and extension metadata |
| `icons/` | Extension icons |
| `scripts/` | Bundle and ZIP generation |
| `tests/` | Node test suites |

For issues and contributions, use the [Crazy Downloader repository](https://github.com/nayandas69/crazy-downloader/).
