import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, lintText, toJson, VERSION } from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "index.js");
const BAD = path.join(here, "..", "bad-prompt.txt");
const GOOD = path.join(here, "..", "good-prompt.txt");

/** Run the CLI non-interactively. stdin defaults to empty (a pipe, never a TTY). */
function run(args = [], { stdin = "" } = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

// ─── Argument parsing ────────────────────────────────────────────────────────

test("parseArgs collects file paths", () => {
  const o = parseArgs(["a.txt", "b.txt"]);
  assert.deepEqual(o.files, ["a.txt", "b.txt"]);
  assert.equal(o.error, null);
});

test("parseArgs recognises every documented flag", () => {
  const o = parseArgs([
    "--json",
    "--quiet",
    "--no-suggestions",
    "--max-warnings",
    "3",
    "p.txt",
  ]);
  assert.equal(o.json, true);
  assert.equal(o.quiet, true);
  assert.equal(o.noSuggestions, true);
  assert.equal(o.maxWarnings, 3);
  assert.deepEqual(o.files, ["p.txt"]);
});

test("parseArgs accepts --max-warnings=N", () => {
  assert.equal(parseArgs(["--max-warnings=0"]).maxWarnings, 0);
});

test("parseArgs rejects a bad --max-warnings value", () => {
  assert.match(parseArgs(["--max-warnings", "-2"]).error, /max-warnings/);
  assert.match(parseArgs(["--max-warnings", "abc"]).error, /max-warnings/);
  assert.match(parseArgs(["--max-warnings"]).error, /max-warnings/);
});

test("parseArgs rejects unknown flags", () => {
  assert.match(parseArgs(["--nope"]).error, /unknown option/);
});

test("parseArgs treats everything after -- as a path", () => {
  assert.deepEqual(parseArgs(["--", "--weird-name.txt"]).files, ["--weird-name.txt"]);
});

// ─── lintText ────────────────────────────────────────────────────────────────

test("lintText fails when an error-severity finding exists", () => {
  const r = lintText("Handle it.");
  assert.equal(r.summary.errors, 1);
  assert.equal(r.failed, true);
});

test("lintText passes on a clean prompt", () => {
  const r = lintText("Return a JSON object with a numeric price field per SKU.");
  assert.equal(r.failed, false);
  assert.equal(r.score, 100);
});

test("lintText honours --max-warnings", () => {
  const text = "Please try to write it.";
  assert.equal(lintText(text).summary.warnings, 1);
  assert.equal(lintText(text, { maxWarnings: Infinity }).failed, false);
  assert.equal(lintText(text, { maxWarnings: 1 }).failed, false);
  assert.equal(lintText(text, { maxWarnings: 0 }).failed, true);
});

test("toJson and the summary agree on the score (one formula, not two)", () => {
  const text = fs.readFileSync(BAD, "utf8");
  const r = lintText(text);
  assert.equal(toJson(r.findings, text, "x").score, r.score);
});

// ─── File arguments ──────────────────────────────────────────────────────────

test("linting bad-prompt.txt exits non-zero", () => {
  const r = run([BAD]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /error/);
});

test("linting good-prompt.txt exits zero", () => {
  const r = run([GOOD]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No issues found/);
});

test("the file path is read, not ignored", () => {
  const tmp = path.join(os.tmpdir(), `vibe-lint-${process.pid}.txt`);
  fs.writeFileSync(tmp, "Do the best thing you can.\n");
  try {
    const r = run([tmp]);
    assert.match(r.stdout, /E001/, "expected the file's contents to be linted");
    assert.match(r.stdout, new RegExp(path.basename(tmp)));
    assert.equal(r.status, 1);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("multiple file arguments are all linted", () => {
  const r = run([GOOD, BAD]);
  assert.match(r.stdout, /good-prompt\.txt/);
  assert.match(r.stdout, /bad-prompt\.txt/);
  assert.equal(r.status, 1, "one failing file fails the run");
});

test("an unreadable file exits 2", () => {
  const r = run(["./definitely-not-here.txt"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

// ─── Piped stdin ─────────────────────────────────────────────────────────────

test("piped stdin is linted", () => {
  const r = run([], { stdin: "make it professional and clean\n" });
  assert.equal(r.status, 0, "warnings alone must not fail the run");
  assert.match(r.stdout, /W003/);
});

test("piped output contains no ANSI escapes and no clear-screen", () => {
  const r = run([], { stdin: "Handle it and do your best.\n" });
  assert.ok(!r.stdout.includes("\x1b"), "escape sequence leaked into the pipe");
  assert.ok(!r.stdout.includes("\x1bc"), "clear-screen leaked into the pipe");
});

test("empty stdin exits 2", () => {
  const r = run([], { stdin: "   \n" });
  assert.equal(r.status, 2);
});

// ─── --json ──────────────────────────────────────────────────────────────────

test("--json emits parseable JSON for one file", () => {
  const r = run(["--json", BAD]);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.file, BAD);
  assert.equal(typeof parsed.score, "number");
  assert.ok(parsed.summary.errors > 0);
  assert.ok(Array.isArray(parsed.findings));
  assert.equal(r.status, 1);
});

test("--json emits an array for several files", () => {
  const parsed = JSON.parse(run(["--json", GOOD, BAD]).stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 2);
});

test("--json works over a pipe", () => {
  const parsed = JSON.parse(run(["--json"], { stdin: "Handle it.\n" }).stdout);
  assert.equal(parsed.file, "stdin");
  assert.equal(parsed.summary.errors, 1);
});

// ─── Exit-code gating ────────────────────────────────────────────────────────

test("--max-warnings 0 fails a warning-only prompt", () => {
  const clean = run([], { stdin: "Please try to write it.\n" });
  assert.equal(clean.status, 0);
  const strict = run(["--max-warnings", "0"], { stdin: "Please try to write it.\n" });
  assert.equal(strict.status, 1);
});

// ─── --quiet ─────────────────────────────────────────────────────────────────

test("--quiet suppresses warnings but still reports errors", () => {
  const r = run(["--quiet"], { stdin: "Please try to handle it.\n" });
  assert.match(r.stdout, /E001/);
  assert.ok(!r.stdout.includes("W008"), "--quiet should hide warning detail");
  assert.equal(r.status, 1);
});

test("--quiet prints nothing extra for a clean prompt", () => {
  const r = run(["--quiet"], { stdin: "Return JSON matching the given schema.\n" });
  assert.ok(!r.stdout.includes("No issues found"));
  assert.equal(r.status, 0);
});

// ─── Meta flags ──────────────────────────────────────────────────────────────

test("--help exits 0 and documents the exit codes", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /USAGE/);
  assert.match(r.stdout, /EXIT CODES/);
  assert.match(r.stdout, /--max-warnings/);
});

test("--version prints the package version", () => {
  const r = run(["--version"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), VERSION);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(here, "..", "package.json"), "utf8")
  );
  assert.equal(VERSION, pkg.version);
});

test("--rules lists every category", () => {
  const r = run(["--rules"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /vague-quality/);
  assert.match(r.stdout, /missing-context/);
});

test("the bin entry is executable as a script", () => {
  const out = execFileSync(process.execPath, [CLI, "--version"], {
    encoding: "utf8",
  });
  assert.equal(out.trim(), VERSION);
});

// ─── E005 regression, end to end ─────────────────────────────────────────────

test("E005 does not fire through the CLI when a fence is present", () => {
  const prompt = [
    "Review this module:",
    "```js",
    "export const add = (a, b) => a + b;",
    "```",
    "Then update the file to export subtract as well.",
  ].join("\n");
  const r = run([], { stdin: prompt + "\n" });
  assert.ok(!r.stdout.includes("E005"), r.stdout);
  assert.equal(r.status, 0);
});
