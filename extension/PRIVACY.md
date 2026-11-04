# Privacy Policy — YouTube Cookies Exporter

**Last updated:** November 4, 2026

**Applies to:** YouTube Cookies Exporter

This extension is a companion to the [Crazy Downloader project](https://github.com/nayandas69/crazy-downloader/). Its purpose is to help you export your own YouTube cookies for use with that project. This policy describes the extension and explains what happens if you choose to use an export with Crazy Downloader.

> [!IMPORTANT]
> YouTube cookies can contain an active sign-in session. Anyone with your exported cookies may be able to access your account. Treat the export like a password: do not share it, post it in an issue, or provide it to a service or person you do not trust.

## What the extension accesses

When you open the popup, the extension uses the browser's cookies API to read cookies for `youtube.com` and its subdomains in the current browser profile. It reads them again when you select **Get cookies**. These may include authentication and `HttpOnly` cookies as well as other YouTube cookies. The extension uses cookie names to estimate whether a signed-in session is present; this indication does not guarantee the session will work.

The extension requests the `cookies` permission and access to `https://*.youtube.com/*` for this purpose. It does not request access to cookies from other websites, your browsing history, or your Google password.

## Where the export goes

The extension converts the cookies to Netscape `cookies.txt` format locally in the popup or extension tab. **The extension has no backend and does not send the cookies to the developer or another server.** It does not automatically send them to Crazy Downloader. The extension contains no advertising, analytics, or activity tracking, and does not collect or sell your cookies for advertising.

You choose what to do with the export:

- **Preview:** The text is displayed in the extension page while it is open.
- **Copy:** The text is placed on your device's clipboard. Other applications or clipboard synchronization services may be able to access it.
- **Download:** The file is saved by your browser on your device and remains there until you delete it. Backups or file synchronization may create additional copies.

Installing or updating the extension through a browser store, signing in to YouTube, and visiting other websites are separate activities governed by those services' own policies.

## If you use the export with Crazy Downloader

You must paste or upload the export yourself in **Cookie settings**. The Crazy Downloader web app stores the saved text in that browser's `localStorage`. On format and download requests, the app sends the saved text, Base64-encoded, in an `X-Cookies` header to its configured backend. Base64 is not encryption; the security of the connection depends on the instance you use, including its HTTPS configuration.

The backend uses the cookies for the requested YouTube operation. It writes a temporary cookie file for extraction and attempts to delete it afterward, including when extraction fails. It may also send cookies to YouTube or its media servers to retrieve requested media. A browser, server operator, proxy, or other infrastructure may have its own storage and logging practices; this extension cannot control those practices.

> [!CAUTION]
> Only provide cookies to a Crazy Downloader instance you trust. Its operator can receive the cookies sent to the backend. A third-party deployment may behave differently from the [Crazy Downloader source code](https://github.com/nayandas69/crazy-downloader/).

## Your choices and deletion

- Select **Remove** in Crazy Downloader's Cookie settings to remove the app's saved copy from that browser. Clearing that site's browser data also removes it.
- Delete downloaded `cookies.txt` files and any backups or synchronized copies you created. Replace or clear clipboard contents separately.
- Close the popup or extension tab to remove its displayed export, or remove the extension to stop its access. Removing the extension does not delete files, clipboard contents, or cookies saved in Crazy Downloader.
- If you suspect an export was exposed, review your Google account security and sign out of affected sessions. Existing copies may remain wherever they were sent or saved.

## YouTube and Google policies

Use only cookies for an account you are authorized to use. You are responsible for complying with applicable laws, copyright rules, and the terms that apply to your use of YouTube and Google services. Review the [YouTube Terms of Service](https://www.youtube.com/t/terms), [Google Terms of Service](https://policies.google.com/terms), and [Google Privacy Policy](https://policies.google.com/privacy). Using this extension does not itself establish that a particular use of Crazy Downloader is permitted under those terms.

## Contact and changes

For questions about the extension, use the [Crazy Downloader issue tracker](https://github.com/nayandas69/crazy-downloader/issues). Issues are public: do not include cookies, account credentials, or other sensitive information. This policy may be updated if the extension or its data practices change; the date above identifies the latest revision.
