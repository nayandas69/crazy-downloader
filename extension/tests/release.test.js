import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/extension-release.yml", import.meta.url), "utf8");
const block = workflow.match(/      - name: (?:Create|Publish) GitHub release\n[\s\S]*?        run: \|\n((?:          .*\n?)+)/);
assert.ok(block, "release publishing step exists");
const publish = block[1].replace(/^ {10}/gm, "");

// Exercise the workflow's real shell block without touching GitHub releases.
const fakeGh = `
release_exists="$RELEASE_EXISTS"
gh() {
  printf '%s\\n' "$*"
  if [ "$2" = "$FAIL_COMMAND" ]; then
    return 23
  fi
  case "$2" in
    view) [ "$release_exists" = 1 ] ;;
    create)
      if [ "$release_exists" = 1 ]; then
        echo 'a release with the same tag name already exists: v1.0.0' >&2
        return 1
      fi
      release_exists=1
      ;;
    upload|edit) [ "$release_exists" = 1 ] ;;
    *) return 2 ;;
  esac
}
`;

function runPublish({ exists = false, repeat = false, fail = "" } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "extension-release-"));
  try {
    mkdirSync(path.join(dir, "extension/dist"), { recursive: true });
    for (const file of ["youtube-cookies-1.0.0-chrome.zip", "youtube-cookies-1.0.0-firefox.zip", "SHA256SUMS.txt"]) {
      writeFileSync(path.join(dir, "extension/dist", file), "test fixture");
    }
    writeFileSync(path.join(dir, "extension/RELEASE_NOTES.md"), "Test release notes");
    return spawnSync("bash", ["-e", "-c", fakeGh + publish + (repeat ? `\n${publish}` : "")], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        // Manual recovery runs execute on main but must publish the selected tag.
        GITHUB_REF_NAME: "main",
        RELEASE_TAG: "v1.0.0",
        RELEASE_EXISTS: exists ? "1" : "0",
        FAIL_COMMAND: fail,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertAssets(output) {
  assert.match(output, /extension\/dist\/youtube-cookies-1\.0\.0-chrome\.zip/);
  assert.match(output, /extension\/dist\/youtube-cookies-1\.0\.0-firefox\.zip/);
  assert.match(output, /extension\/dist\/SHA256SUMS\.txt/);
}

test("a new release is created with both bundles, checksums and notes", () => {
  const result = runPublish();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release create v1\.0\.0/);
  assert.match(result.stdout, /--verify-tag/);
  assert.match(result.stdout, /--notes-file extension\/RELEASE_NOTES\.md/);
  assertAssets(result.stdout);
});

test("an existing release gets replacement assets and updated notes, not a duplicate", () => {
  const result = runPublish({ exists: true });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /release create/);
  assert.match(result.stdout, /release upload v1\.0\.0 .*--clobber/);
  assert.match(result.stdout, /release edit v1\.0\.0 .*--notes-file extension\/RELEASE_NOTES\.md/);
  assertAssets(result.stdout);
});

test("publishing the same tag twice succeeds", () => {
  const result = runPublish({ repeat: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/release create/g) || []).length, 1);
  assert.equal((result.stdout.match(/release upload/g) || []).length, 1);
});

test("manual recovery uses an existing tag and serializes runs for that tag", () => {
  assert.match(workflow, /workflow_dispatch:\n    inputs:\n      tag:/);
  assert.match(workflow, /RELEASE_TAG: \$\{\{ inputs\.tag \|\| github\.ref_name \}\}/);
  assert.match(workflow, /ref: refs\/tags\/\$\{\{ env\.RELEASE_TAG \}\}/);
  assert.match(workflow, /group: extension-release-\$\{\{ inputs\.tag \|\| github\.ref_name \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("the version guard accepts the selected tag, not the manual workflow branch", () => {
  const guard = workflow.match(/      - name: Verify tag matches the extension version\n        run: \|\n((?:          .*\n?)+)/);
  assert.ok(guard);
  const script = guard[1].replace(/^ {10}/gm, "");
  const dir = mkdtempSync(path.join(os.tmpdir(), "extension-version-"));
  try {
    mkdirSync(path.join(dir, "extension"));
    writeFileSync(path.join(dir, "extension/package.json"), JSON.stringify({ version: "1.0.0" }));
    for (const [tag, expectedStatus] of [["v1.0.0", 0], ["v1.0.1", 1]]) {
      const result = spawnSync("bash", ["-e", "-c", script], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, GITHUB_REF_NAME: "main", RELEASE_TAG: tag },
      });
      assert.equal(result.status, expectedStatus, result.stderr);
      if (expectedStatus === 1) assert.match(result.stdout, /does not match extension version/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const command of ["create", "upload", "edit"]) {
  test(`a failed ${command} still fails the workflow`, () => {
    const result = runPublish({ exists: command !== "create", fail: command });
    assert.equal(result.status, 23, result.stderr);
    if (command === "upload") assert.doesNotMatch(result.stdout, /release edit/);
  });
}
