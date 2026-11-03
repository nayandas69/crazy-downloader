import assert from "node:assert/strict";
import test from "node:test";

/**
 * Drives the popup against a fake DOM + fake `chrome` API so the wiring
 * (support detection, callback path, button state) is covered without a browser.
 */

const IDS = ["badge", "hint", "message", "preview-wrap", "preview", "refresh", "copy", "download"];

function makeElement(id) {
  return {
    id,
    textContent: "",
    className: "",
    value: "",
    disabled: false,
    hidden: false,
    open: false,
    addEventListener() {},
    focus() {},
    select() {},
    click() {},
    remove() {},
  };
}

function setupDom() {
  const elements = new Map(IDS.map((id) => [id, makeElement(id)]));
  globalThis.document = {
    getElementById: (id) => elements.get(id) ?? null,
    createElement: () => makeElement("anchor"),
    body: { appendChild() {} },
  };
  return elements;
}

async function loadPopup(tag, { chrome, browser } = {}) {
  delete globalThis.chrome;
  delete globalThis.browser;
  if (chrome) globalThis.chrome = chrome;
  if (browser) globalThis.browser = browser;
  const elements = setupDom();

  await import(`../src/popup.js?case=${tag}`);

  for (let i = 0; i < 50; i += 1) {
    if (elements.get("badge").textContent !== "Checking…") break;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return elements;
}

const session = [
  {
    domain: ".youtube.com",
    hostOnly: false,
    path: "/",
    secure: true,
    httpOnly: true,
    expirationDate: 1_798_761_600,
    name: "SID",
    value: "abc123",
  },
  { domain: ".youtube.com", hostOnly: false, path: "/", secure: true, httpOnly: false, name: "PREF", value: "tz=UTC" },
];

test("chrome callback API produces cookies.txt and enables the buttons", async () => {
  const elements = await loadPopup("chrome", {
    chrome: { runtime: {}, cookies: { getAll: (_query, callback) => callback(session) } },
  });
  assert.equal(elements.get("badge").textContent, "2 cookies");
  assert.match(elements.get("preview").value, /#HttpOnly_\.youtube\.com\tTRUE\t\/\tTRUE\t1798761600\tSID\tabc123/);
  assert.equal(elements.get("copy").disabled, false);
  assert.equal(elements.get("download").disabled, false);
});

test("firefox promise API is used when available", async () => {
  const elements = await loadPopup("firefox", {
    browser: { cookies: { getAll: async () => session } },
  });
  assert.equal(elements.get("badge").textContent, "2 cookies");
});

test("an empty cookie store asks the user to sign in", async () => {
  const elements = await loadPopup("empty", {
    chrome: { runtime: {}, cookies: { getAll: (_query, callback) => callback([]) } },
  });
  assert.equal(elements.get("badge").textContent, "No cookies");
  assert.equal(elements.get("copy").disabled, true);
  assert.equal(elements.get("download").disabled, true);
});

test("a browser without the cookies API is reported instead of crashing", async () => {
  const elements = await loadPopup("unsupported", {});
  assert.equal(elements.get("badge").textContent, "Unsupported");
  assert.equal(elements.get("refresh").disabled, true);
});

test("a cookie-store error surfaces in the message", async () => {
  const elements = await loadPopup("error", {
    chrome: {
      runtime: { lastError: { message: "Permission denied" } },
      cookies: { getAll: (_query, callback) => callback(undefined) },
    },
  });
  assert.equal(elements.get("badge").textContent, "Error");
  assert.equal(elements.get("message").textContent, "Permission denied");
});
