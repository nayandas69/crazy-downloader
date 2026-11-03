import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCookiesTxt,
  cookiesToLines,
  isYouTubeCookie,
  summarizeCookies,
} from "../src/cookies.js";

const signedInCookie = {
  domain: ".youtube.com",
  hostOnly: false,
  path: "/",
  secure: true,
  httpOnly: true,
  expirationDate: 1_798_761_600.5,
  name: "SID",
  value: "abc123",
};

test("writes a Netscape line for a domain cookie", () => {
  const [line] = cookiesToLines([signedInCookie]);
  assert.equal(
    line,
    "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1798761600\tSID\tabc123"
  );
});

test("marks host-only, insecure, session cookies correctly", () => {
  const [line] = cookiesToLines([
    {
      domain: "www.youtube.com",
      hostOnly: true,
      path: "/feed",
      secure: false,
      httpOnly: false,
      name: "PREF",
      value: "tz=Asia.Dhaka",
    },
  ]);
  assert.equal(line, "www.youtube.com\tFALSE\t/feed\tFALSE\t0\tPREF\ttz=Asia.Dhaka");
});

test("accepts youtube.com and its subdomains only", () => {
  assert.equal(isYouTubeCookie({ domain: ".youtube.com" }), true);
  assert.equal(isYouTubeCookie({ domain: "m.youtube.com" }), true);
  assert.equal(isYouTubeCookie({ domain: ".google.com" }), false);
  assert.equal(isYouTubeCookie({ domain: ".notyoutube.com" }), false);
  assert.equal(cookiesToLines([{ domain: ".google.com", name: "SID", value: "x" }]).length, 0);
});

test("drops duplicates with the same domain, path and name", () => {
  const lines = cookiesToLines([signedInCookie, { ...signedInCookie, value: "other" }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /abc123$/);
});

test("removes tabs and newlines that would break the cookie file", () => {
  const [line] = cookiesToLines([
    { domain: ".youtube.com", name: "bad\tname", path: "/", value: "v\r\nal", hostOnly: false },
  ]);
  assert.equal(line.split("\t").length, 7);
  assert.equal(line.split("\t")[5], "badname");
  assert.equal(line.split("\t")[6], "val");
});

test("keeps the file readable with a Netscape header", () => {
  const text = buildCookiesTxt([signedInCookie]);
  assert.ok(text.startsWith("# Netscape HTTP Cookie File"));
  assert.ok(text.endsWith("\n"));
  assert.ok(text.includes(".youtube.com\tTRUE\t/\tTRUE\t1798761600\tSID\tabc123"));
});

test("returns only the header when nothing is exported", () => {
  const text = buildCookiesTxt([]);
  assert.equal(text.trim().split("\n").filter((line) => line && !line.startsWith("#")).length, 0);
});

test("sorts lines so repeated exports are stable", () => {
  const lines = cookiesToLines([
    { domain: ".youtube.com", name: "ZZZ", value: "1", path: "/", hostOnly: false },
    { domain: ".youtube.com", name: "AAA", value: "2", path: "/", hostOnly: false },
  ]);
  assert.deepEqual(
    lines.map((line) => line.split("\t")[5]),
    ["AAA", "ZZZ"]
  );
});

test("detects a signed-in session", () => {
  assert.deepEqual(summarizeCookies([signedInCookie]), { total: 1, signedIn: true });
  assert.deepEqual(
    summarizeCookies([{ domain: ".youtube.com", name: "PREF", value: "x" }]),
    { total: 1, signedIn: false }
  );
  assert.deepEqual(summarizeCookies([]), { total: 0, signedIn: false });
});
