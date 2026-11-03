import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createZip } from "../scripts/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));

const pkg = readJson("package.json");
const chromeManifest = readJson("manifest.chrome.json");
const firefoxManifest = readJson("manifest.firefox.json");

test("package and both manifests share one version", () => {
  assert.equal(chromeManifest.version, pkg.version);
  assert.equal(firefoxManifest.version, pkg.version);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

for (const [target, manifest] of [
  ["chrome", chromeManifest],
  ["firefox", firefoxManifest],
]) {
  test(`${target} manifest declares Manifest V3 with the cookies permission`, () => {
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.permissions.includes("cookies"));
    assert.deepEqual(manifest.host_permissions, ["https://*.youtube.com/*"]);
    assert.equal(manifest.action.default_popup, "popup.html");
  });

  test(`${target} manifest only references files that ship`, () => {
    for (const size of ["16", "32", "48", "128"]) {
      assert.ok(existsSync(path.join(root, "icons", `icon-${size}.png`)), `icon-${size}.png`);
      assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    }
    for (const file of ["popup.html", "popup.css", "popup.js", "cookies.js"]) {
      assert.ok(existsSync(path.join(root, "src", file)), file);
    }
  });
}

test("firefox manifest carries a gecko id for signing", () => {
  assert.ok(firefoxManifest.browser_specific_settings.gecko.id);
});

test("zip writer produces a readable archive", () => {
  const archive = createZip([
    { name: "manifest.json", data: Buffer.from("{}") },
    { name: "icons/icon-16.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ]);
  assert.equal(archive.subarray(0, 4).toString("binary"), "PK\u0003\u0004");
  const text = archive.toString("binary");
  assert.ok(text.includes("manifest.json"));
  assert.ok(text.includes("icons/icon-16.png"));
  assert.ok(text.includes("PK\u0005\u0006"), "end of central directory");
});
