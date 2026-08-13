import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzePrompt } from "../../rules/index.js";
import {
  VERSION,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  apiErrorMessage,
  extractText,
  diffFindings,
  buildIssueList,
  optimizeWithClaude,
  parseArgs,
} from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "index.js");

function run(args = [], { stdin = "", env = {} } = {}) {
  const childEnv = { ...process.env, NO_COLOR: "1", ...env };
  delete childEnv.ANTHROPIC_API_KEY;
  for (const [k, v] of Object.entries(env)) childEnv[k] = v;
  const res = spawnSync(process.execPath, [CLI, ...args], {
    input: stdin,
    encoding: "utf8",
    env: childEnv,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const okResponse = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
  }),
  text: async () => "",
});

const errResponse = (status, body) => ({
  ok: false,
  status,
  json: async () => JSON.parse(body),
  text: async () => body,
});

// ─── apiErrorMessage ─────────────────────────────────────────────────────────

test("apiErrorMessage extracts the API message from a JSON body", () => {
  const body = JSON.stringify({
    type: "error",
    error: { type: "invalid_request_error", message: "max_tokens is too large" },
  });
  assert.equal(apiErrorMessage(400, body), "API 400: max_tokens is too large");
});

test("apiErrorMessage survives a non-JSON body (the 503 HTML proxy page)", () => {
  const html = "<html><head><title>503 Service Unavailable</title></head></html>";
  const msg = apiErrorMessage(503, html);
  assert.match(msg, /^API 503:/);
  assert.match(msg, /503 Service Unavailable/);
  assert.ok(!msg.includes("Unexpected token"), "the JSON parse error leaked through");
});

test("apiErrorMessage handles an empty body", () => {
  assert.equal(apiErrorMessage(502, ""), "API 502: (empty response body)");
});

test("apiErrorMessage truncates a huge body", () => {
  const msg = apiErrorMessage(500, "x".repeat(5000));
  assert.ok(msg.length < 400);
});

// ─── extractText ─────────────────────────────────────────────────────────────

test("extractText joins every text block", () => {
  const data = {
    content: [
      { type: "text", text: "one " },
      { type: "thinking", thinking: "ignored" },
      { type: "text", text: "two" },
    ],
  };
  assert.equal(extractText(data), "one two");
});

test("extractText throws when there is no content array", () => {
  assert.throws(() => extractText({}), /no content array/);
  assert.throws(() => extractText(null), /no content array/);
});

test("extractText throws a useful error on a refusal (empty content)", () => {
  assert.throws(
    () => extractText({ content: [], stop_reason: "refusal" }),
    /refused/
  );
  assert.throws(
    () => extractText({ content: [], stop_reason: "refusal" }),
    /stop_reason: refusal/
  );
});

test("extractText throws when content holds no text blocks", () => {
  assert.throws(
    () => extractText({ content: [{ type: "tool_use", id: "x" }] }),
    /no text/
  );
});

// ─── diffFindings ────────────────────────────────────────────────────────────

test("diffFindings reports resolved rule ids, not a count delta", () => {
  const before = analyzePrompt("Please try to handle it as needed.");
  const after = analyzePrompt("Return a JSON object with a numeric score field.");
  const d = diffFindings(before, after);
  assert.ok(d.resolved.includes("E001"));
  assert.ok(d.resolved.includes("E002"));
  assert.ok(d.resolved.includes("W008"));
  assert.deepEqual(d.remaining, []);
  assert.deepEqual(d.introduced, []);
});

test("diffFindings names rules the rewrite introduced (the negative-count case)", () => {
  const before = analyzePrompt("Handle it.");
  const after = analyzePrompt(
    "Make the output more professional. Please try to be more helpful. Just give me the answer."
  );
  const d = diffFindings(before, after);
  assert.deepEqual(d.resolved, ["E001"]);
  assert.ok(d.introduced.length > 1, "expected several introduced rules");
  // The 1.0.0 code would have printed `1 - N` = a negative "issues fixed".
  assert.ok(before.length - after.length < 0);
});

test("diffFindings keeps rules that are still present", () => {
  const before = analyzePrompt("Handle it as needed.");
  const after = analyzePrompt("Handle it precisely.");
  const d = diffFindings(before, after);
  assert.deepEqual(d.remaining, ["E001"]);
  assert.deepEqual(d.resolved, ["E002"]);
});

test("buildIssueList explains an empty finding set", () => {
  assert.match(buildIssueList([]), /no rule fired/i);
  assert.match(buildIssueList(analyzePrompt("Handle it.")), /\[E001\]/);
});

// ─── optimizeWithClaude ──────────────────────────────────────────────────────

test("optimizeWithClaude sends a low temperature and the chosen model", async () => {
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(init.body);
    return okResponse("rewritten");
  };
  const out = await optimizeWithClaude("Handle it.", analyzePrompt("Handle it."), {
    apiKey: "sk-test",
    fetchImpl,
    model: "claude-opus-5",
  });
  assert.equal(out, "rewritten");
  assert.equal(captured.temperature, DEFAULT_TEMPERATURE);
  assert.ok(captured.temperature < 1, "temperature must be below the 1.0 default");
  assert.equal(captured.model, "claude-opus-5");
});

test("optimizeWithClaude defaults to the current recommended model", async () => {
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(init.body);
    return okResponse("x");
  };
  await optimizeWithClaude("Handle it.", [], { apiKey: "sk-test", fetchImpl });
  assert.equal(captured.model, DEFAULT_MODEL);
  assert.equal(DEFAULT_MODEL, "claude-sonnet-5");
});

test("optimizeWithClaude requires an API key", async () => {
  await assert.rejects(
    optimizeWithClaude("x", [], { apiKey: undefined, fetchImpl: async () => okResponse("y") }),
    /ANTHROPIC_API_KEY not set/
  );
});

test("optimizeWithClaude retries a 429 and then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) {
      return errResponse(429, JSON.stringify({ error: { message: "rate limited" } }));
    }
    return okResponse("second try");
  };
  const out = await optimizeWithClaude("Handle it.", [], {
    apiKey: "sk-test",
    fetchImpl,
    retries: 2,
  });
  assert.equal(out, "second try");
  assert.equal(calls, 2);
});

test("optimizeWithClaude does not retry a 400", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return errResponse(400, JSON.stringify({ error: { message: "bad request" } }));
  };
  await assert.rejects(
    optimizeWithClaude("x", [], { apiKey: "sk-test", fetchImpl, retries: 3 }),
    /API 400: bad request/
  );
  assert.equal(calls, 1);
});

test("optimizeWithClaude gives up after the retry budget", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return errResponse(503, "<html>gateway</html>");
  };
  await assert.rejects(
    optimizeWithClaude("x", [], { apiKey: "sk-test", fetchImpl, retries: 1 }),
    /API 503/
  );
  assert.equal(calls, 2);
});

test("optimizeWithClaude aborts on timeout and reports it", async () => {
  const hang = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  await assert.rejects(
    optimizeWithClaude("x", [], {
      apiKey: "sk-test",
      fetchImpl: hang,
      timeoutMs: 25,
      retries: 0,
    }),
    /timed out after 25ms/
  );
});

test("optimizeWithClaude passes an AbortSignal to fetch", async () => {
  let sawSignal = false;
  const fetchImpl = async (_url, init) => {
    sawSignal = init.signal instanceof AbortSignal;
    return okResponse("y");
  };
  await optimizeWithClaude("x", [], { apiKey: "sk-test", fetchImpl });
  assert.equal(sawSignal, true);
});

test("optimizeWithClaude surfaces a refusal rather than crashing", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [], stop_reason: "refusal" }),
    text: async () => "",
  });
  await assert.rejects(
    optimizeWithClaude("x", [], { apiKey: "sk-test", fetchImpl }),
    /refused/
  );
});

// ─── parseArgs ───────────────────────────────────────────────────────────────

test("parseArgs defaults", () => {
  const o = parseArgs([]);
  assert.equal(o.model, DEFAULT_MODEL);
  assert.equal(o.force, false);
  assert.equal(o.retries, 2);
  assert.deepEqual(o.files, []);
});

test("parseArgs reads --model, --force, --timeout, --retries and files", () => {
  const o = parseArgs([
    "--model", "claude-opus-5",
    "--force",
    "--timeout", "5000",
    "--retries", "0",
    "a.txt",
  ]);
  assert.equal(o.model, "claude-opus-5");
  assert.equal(o.force, true);
  assert.equal(o.timeoutMs, 5000);
  assert.equal(o.retries, 0);
  assert.deepEqual(o.files, ["a.txt"]);
});

test("parseArgs rejects bad numeric values and unknown flags", () => {
  assert.match(parseArgs(["--timeout", "0"]).error, /--timeout/);
  assert.match(parseArgs(["--retries", "-1"]).error, /--retries/);
  assert.match(parseArgs(["--bogus"]).error, /unknown option/);
  assert.match(parseArgs(["--model"]).error, /--model/);
});

// ─── CLI (no network) ────────────────────────────────────────────────────────

test("--help exits 0 and documents --force and --model", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--force/);
  assert.match(r.stdout, /--model/);
  assert.match(r.stdout, /temperature/i);
});

test("--version prints the package version", () => {
  const r = run(["--version"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), VERSION);
});

test("an unreadable file exits 2", () => {
  const r = run(["./nope.txt"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

test("a clean prompt is skipped and points at --force", () => {
  const r = run([], { stdin: "Return a JSON object with a numeric price per SKU.\n" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No rule fired/);
  assert.match(r.stdout, /--force/);
});

test("--force on a clean prompt reaches the API layer", () => {
  const r = run(["--force"], {
    stdin: "Return a JSON object with a numeric price per SKU.\n",
  });
  // No API key in the child env, so the API layer is what reports the failure.
  assert.match(r.stdout, /ANTHROPIC_API_KEY not set/);
  assert.equal(r.status, 1);
});

test("the first-run notice warns before anything is sent", () => {
  const r = run(["--force"], { stdin: "Handle it.\n" });
  assert.match(r.stdout, /sent verbatim to the Anthropic API/);
  assert.match(r.stdout, /Do not paste API keys/);
});

test("VIBE_NO_API_NOTICE silences the notice", () => {
  const r = run(["--force"], {
    stdin: "Handle it.\n",
    env: { VIBE_NO_API_NOTICE: "1" },
  });
  assert.ok(!r.stdout.includes("sent verbatim"));
});

test("a file argument is read and linted before any API call", () => {
  const tmp = path.join(os.tmpdir(), `prompt-opt-${process.pid}.txt`);
  fs.writeFileSync(tmp, "Please try to handle it as needed.\n");
  try {
    const r = run([tmp]);
    assert.match(r.stdout, /E001/);
    assert.match(r.stdout, /E002/);
    assert.match(r.stdout, new RegExp(path.basename(tmp)));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("piped output contains no ANSI escapes", () => {
  const r = run([], { stdin: "Handle it as needed.\n" });
  assert.ok(!r.stdout.includes("\x1b"));
});
