## YouTube Cookies Exporter

Exports the YouTube cookies of the browser you are signed in to as a Netscape
`cookies.txt`, ready to paste or upload into **Crazy Downloader → Cookie settings**.

### Download

| File | Use it for |
| --- | --- |
| `youtube-cookies-<version>-chrome.zip` | Chrome, Edge, Brave, Kiwi, Lemur, Orion and other Chromium/Chrome-extension browsers |
| `youtube-cookies-<version>-firefox.zip` | Firefox (temporary add-on; sign it on addons.mozilla.org for a permanent install) |
| `SHA256SUMS.txt` | Optional integrity check: `sha256sum -c SHA256SUMS.txt` |

### Install

- **Desktop Chrome / Edge / Brave:** unzip, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, pick the unzipped folder.
- **Chrome for Android with extension support (e.g. Kiwi, Lemur):** unzip the Chrome bundle and load it as an unpacked extension from the browser's extensions page.
- **Firefox desktop:** unzip, open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on**, choose `manifest.json`.
- **Firefox for Android:** Firefox only installs signed add-ons; sign the bundle at <https://addons.mozilla.org/developers/> and install the resulting `.xpi`.
- **iOS (Orion):** Orion supports Chrome extensions — install the Chrome bundle through its extensions settings.

### Use

1. Sign in to **youtube.com** in the same browser.
2. Open the extension and tap **Get cookies**. It reads `youtube.com` cookies through the browser's cookie API, so the `HttpOnly` session cookies a page script cannot see are included.
3. Tap **Copy** or **Download cookies.txt**.
4. In Crazy Downloader, open **Cookie settings** and paste the text or upload the file — the pending search then retries automatically.

Cookies are read locally, never uploaded anywhere; the downloader sends them only with your own request.
