import { buildCookiesTxt, summarizeCookies } from "./cookies.js";

const badge = document.getElementById("badge");
const hint = document.getElementById("hint");
const message = document.getElementById("message");
const previewWrap = document.getElementById("preview-wrap");
const preview = document.getElementById("preview");
const refreshButton = document.getElementById("refresh");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");

// Firefox exposes `browser` (promise based), Chromium exposes `chrome` (callbacks).
const firefoxApi = globalThis.browser;
const chromeApi = globalThis.chrome;
let cookiesTxt = "";

function setBadge(text, tone) {
  badge.textContent = text;
  badge.className = "badge" + (tone ? ` ${tone}` : "");
}

function setMessage(text, tone) {
  message.textContent = text;
  message.className = "message" + (tone ? ` ${tone}` : "");
}

function hasCookieSupport() {
  return Boolean(firefoxApi?.cookies?.getAll || chromeApi?.cookies?.getAll);
}

async function getAllYouTubeCookies() {
  const query = { domain: "youtube.com" };

  if (firefoxApi?.cookies?.getAll) {
    return (await firefoxApi.cookies.getAll(query)) ?? [];
  }

  return await new Promise((resolve, reject) => {
    chromeApi.cookies.getAll(query, (cookies) => {
      const error = chromeApi.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(cookies ?? []);
    });
  });
}

function download() {
  const blob = new Blob([cookiesTxt], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cookies.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setMessage("cookies.txt downloaded. Upload it in the downloader’s Cookie settings.", "ok");
}

async function copy() {
  try {
    await navigator.clipboard.writeText(cookiesTxt);
    setMessage("Copied. Paste it in the downloader’s Cookie settings.", "ok");
  } catch {
    previewWrap.open = true;
    preview.focus();
    preview.select();
    setMessage("Press copy on your keyboard (or long-press the text) to copy it.", "");
  }
}

async function loadCookies() {
  if (!hasCookieSupport()) {
    setBadge("Unsupported", "warn");
    hint.textContent =
      "This browser does not expose the cookies API. Open this extension in a browser with extension support (Kiwi, Lemur, Firefox, or Orion).";
    setMessage("Cookies cannot be read here.", "error");
    refreshButton.disabled = true;
    return;
  }

  refreshButton.disabled = true;
  setMessage("Reading cookies…");

  try {
    const cookies = await getAllYouTubeCookies();
    const { total, signedIn } = summarizeCookies(cookies);
    cookiesTxt = buildCookiesTxt(cookies);
    preview.value = cookiesTxt;

    if (total === 0) {
      setBadge("No cookies", "warn");
      previewWrap.hidden = true;
      copyButton.disabled = true;
      downloadButton.disabled = true;
      setMessage(
        "No youtube.com cookies found. Open youtube.com in this browser, sign in, then tap Get cookies again.",
        "error"
      );
      return;
    }

    previewWrap.hidden = false;
    copyButton.disabled = false;
    downloadButton.disabled = false;

    if (signedIn) {
      setBadge(`${total} cookies`, "ok");
      setMessage("Signed-in YouTube session found. Copy or download it, then paste it in the app.", "ok");
    } else {
      setBadge(`${total} cookies`, "warn");
      setMessage(
        "Cookies found, but no signed-in session. Sign in to youtube.com in this browser first if YouTube asks to confirm you’re not a bot.",
        ""
      );
    }
  } catch (error) {
    setBadge("Error", "warn");
    copyButton.disabled = true;
    downloadButton.disabled = true;
    setMessage(error instanceof Error ? error.message : "Could not read cookies.", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadCookies);
copyButton.addEventListener("click", copy);
downloadButton.addEventListener("click", download);

// Mobile browsers (e.g. Lemur) open the popup in a very narrow side panel.
// The same page works as a regular tab, where it gets the full screen width.
const tabHint = document.getElementById("tab-hint");
const openTabLink = document.getElementById("open-tab");

function showTabHint() {
  if (!tabHint) return;
  const width = globalThis.innerWidth ?? 0;
  // Below this width the browser is drawing the popup in a narrow side panel,
  // where the full-width exporter page is much easier to use on a phone.
  tabHint.hidden = !(width > 0 && width < 360);
}

if (openTabLink) {
  openTabLink.addEventListener("click", (event) => {
    event.preventDefault();
    const url =
      chromeApi?.runtime?.getURL?.("popup.html") ?? firefoxApi?.runtime?.getURL?.("popup.html");
    if (!url) return;
    if (chromeApi?.tabs?.create) chromeApi.tabs.create({ url });
    else if (firefoxApi?.tabs?.create) firefoxApi.tabs.create({ url });
    else globalThis.open?.(url, "_blank", "noopener");
  });
}

showTabHint();

void loadCookies();
