#!/usr/bin/env node
/**
 * Builds installable bundles for the YouTube Cookies Exporter.
 *
 *   dist/chrome/…        → load-unpacked folder for Chrome / Edge / Kiwi / Lemur / Orion
 *   dist/firefox/…       → load-temporary-add-on folder for Firefox
 *   dist/youtube-cookies-<version>-chrome.zip
 *   dist/youtube-cookies-<version>-firefox.zip
 *
 * The version comes from package.json and is injected into both manifests, so
 * the tag, the release asset names and the extension version always agree.
 */

import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const targets = ["chrome", "firefox"];

const FILES = ["popup.html", "popup.css", "popup.js", "cookies.js"];
const ICONS = ["icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png"];

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

function assertFile(file) {
  if (!existsSync(file)) throw new Error(`Missing build input: ${path.relative(root, file)}`);
}

async function collectEntries(dir) {
  const entries = [];
  for (const name of FILES) entries.push({ name, data: await readFile(path.join(dir, name)) });
  for (const name of ICONS) {
    entries.push({ name: `icons/${name}`, data: await readFile(path.join(dir, "icons", name)) });
  }
  entries.push({ name: "manifest.json", data: await readFile(path.join(dir, "manifest.json")) });
  return entries;
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const target of targets) {
  const targetDir = path.join(distDir, target);
  await mkdir(path.join(targetDir, "icons"), { recursive: true });

  const manifest = JSON.parse(await readFile(path.join(root, `manifest.${target}.json`), "utf8"));
  manifest.version = version;
  await writeFile(path.join(targetDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const name of FILES) {
    assertFile(path.join(srcDir, name));
    await copyFile(path.join(srcDir, name), path.join(targetDir, name));
  }
  for (const name of ICONS) {
    assertFile(path.join(root, "icons", name));
    await copyFile(path.join(root, "icons", name), path.join(targetDir, "icons", name));
  }

  const archive = await createZip(await collectEntries(targetDir));
  const archiveName = `youtube-cookies-${version}-${target}.zip`;
  await writeFile(path.join(distDir, archiveName), archive);
  console.log(`built dist/${archiveName} (${archive.length} bytes)`);
}
