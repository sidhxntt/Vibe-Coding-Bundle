import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VERSION,
  DEFAULT_MODEL,
  estimateTokens,
  countTokens,
  firstTextBlock,
  parseSquashed,
  computeStats,
  renderBar,
  formatStats,
  squashPrompt,
  parseArgs,
} from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "index.js");

function run(args = [], { stdin = "", env = {} } = {}) {
  const childEnv = { ...process.env, NO_COLOR: "1" };
  delete childEnv.ANTHROPIC_API_KEY;
  for (const [k, v] of Object.entries(env)) childEnv[k] = v;
  const res = spawnSync(process.execPath, [CLI, ...args], {
    input: stdin,
    encoding: "utf8",
    env: childEnv,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

/** A stub Anthropic client — no network, no API key, no spend. */
function stubClient({ text, usage, tokenMap = {}, countThrows = false, stopReason = "end_turn" }) {
  return {
    messages: {
      create: async () => ({
        content: text === null ? [] : [{ type: "text", text }],
        stop_reason: stopReason,
        usage: usage ?? { input_tokens: 100, output_tokens: 50 },
      }),
      countTokens: async ({ messages }) => {
        if (countThrows) throw new Error("count_tokens unavailable");
        const body = messages[0].content;
        return { input_tokens: tokenMap[body] ?? Math.ceil(body.length / 3) };
      },
    },
  };
}

const wrap = (reasoning, squashed) =>
  `<reasoning>${reasoning}</reasoning>\n<squashed>${squashed}</squashed>`;

// ─── Token counting ──────────────────────────────────────────────────────────

test("estimateTokens is only the fallback, and is documented as a char count", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
});

test("countTokens uses the count_tokens endpoint and reports exact:true", async () => {
  const client = stubClient({ text: "x", tokenMap: { hello: 42 } });
  const r = await countTokens(client, DEFAULT_MODEL, "hello");
  assert.deepEqual(r, { tokens: 42, exact: true });
});

test("countTokens falls back to an estimate and says so", async () => {
  const client = stubClient({ text: "x", countThrows: true });
  const r = await countTokens(client, DEFAULT_MODEL, "abcdefgh");
  assert.equal(r.exact, false);
  assert.equal(r.tokens, estimateTokens("abcdefgh"));
});

test("countTokens short-circuits empty input", async () => {
  const client = stubClient({ text: "x", countThrows: true });
  assert.deepEqual(await countTokens(client, DEFAULT_MODEL, ""), {
    tokens: 0,
    exact: true,
  });
});

// ─── Response parsing ────────────────────────────────────────────────────────

test("firstTextBlock skips non-text blocks instead of assuming content[0]", () => {
  const content = [
    { type: "thinking", thinking: "hmm" },
    { type: "text", text: "the answer" },
  ];
  assert.equal(firstTextBlock(content), "the answer");
  assert.equal(firstTextBlock([]), null);
  assert.equal(firstTextBlock([{ type: "tool_use" }]), null);
  assert.equal(firstTextBlock(undefined), null);
});

test("parseSquashed extracts both blocks", () => {
  const r = parseSquashed(wrap("cut filler", "Return JSON."));
  assert.equal(r.squashed, "Return JSON.");
  assert.equal(r.reasoning, "cut filler");
});

test("parseSquashed tolerates a missing reasoning block", () => {
  const r = parseSquashed("<squashed>Return JSON.</squashed>");
  assert.equal(r.reasoning, null);
});

test("parseSquashed throws when the squashed block is missing", () => {
  assert.throws(() => parseSquashed("sorry, I cannot"), /<squashed>/);
  assert.throws(() => parseSquashed(null), /No text block/);
});

// ─── Stats ───────────────────────────────────────────────────────────────────

test("computeStats reports a normal compression", () => {
  const s = computeStats(100, 40);
  assert.equal(s.delta, 60);
  assert.equal(s.pct, 60);
  assert.equal(s.expanded, false);
});

test("computeStats handles expansion without going negative-length", () => {
  const s = computeStats(40, 100);
  assert.equal(s.expanded, true);
  assert.equal(s.delta, -60);
  assert.ok(s.pct < 0);
});

test("computeStats guards division by zero (used to print NaN%)", () => {
  const s = computeStats(0, 0);
  assert.equal(s.pct, 0);
  assert.equal(s.measurable, false);
  assert.ok(!Number.isNaN(s.pct));
});

test("renderBar never calls repeat() with a negative count", () => {
  // The 1.0.0 code did "█".repeat(Math.round(pct/100*24)) → RangeError on
  // expansion. Every one of these must return a string, not throw.
  for (const pct of [-500, -74.5, -1, 0, 0.4, 50, 99.9, 100, 250, NaN]) {
    const bar = renderBar(pct);
    assert.equal(typeof bar, "string");
  }
});

test("renderBar is exactly the requested width", () => {
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  assert.equal([...strip(renderBar(50, 24))].length, 24);
  assert.equal([...strip(renderBar(-90, 24))].length, 24);
  assert.equal([...strip(renderBar(100, 24))].length, 24);
});

test("formatStats renders an expansion honestly instead of crashing", () => {
  const out = formatStats(computeStats(40, 100), {
    beforeChars: 160,
    afterChars: 400,
  });
  assert.match(out, /Grew/);
  assert.match(out, /compression failed/);
  assert.ok(!out.includes("NaN"));
});

test("formatStats labels estimated numbers", () => {
  const out = formatStats(computeStats(10, 5), {
    beforeChars: 40,
    afterChars: 20,
    exact: false,
  });
  assert.match(out, /\(estimated\)/);
});

test("formatStats surfaces the billed API usage", () => {
  const out = formatStats(computeStats(10, 5), {
    beforeChars: 40,
    afterChars: 20,
    usage: { input_tokens: 321, output_tokens: 45 },
  });
  assert.match(out, /321 in \/ 45 out/);
});

test("formatStats says n/a for empty input", () => {
  const out = formatStats(computeStats(0, 0), { beforeChars: 0, afterChars: 0 });
  assert.match(out, /n\/a/);
  assert.ok(!out.includes("NaN"));
});

// ─── squashPrompt (stubbed client, no API spend) ─────────────────────────────

test("squashPrompt returns the squashed text plus real usage", async () => {
  const client = stubClient({
    text: wrap("dropped preamble", "Return JSON. No prose."),
    usage: { input_tokens: 512, output_tokens: 64 },
  });
  const r = await squashPrompt("a verbose prompt", { client });
  assert.equal(r.squashed, "Return JSON. No prose.");
  assert.deepEqual(r.usage, { input_tokens: 512, output_tokens: 64 });
  assert.equal(r.model, DEFAULT_MODEL);
});

test("squashPrompt uses the requested model", async () => {
  let seen;
  const client = {
    messages: {
      create: async (body) => {
        seen = body.model;
        return { content: [{ type: "text", text: wrap("x", "y") }], usage: {} };
      },
    },
  };
  await squashPrompt("p", { client, model: "claude-opus-5" });
  assert.equal(seen, "claude-opus-5");
});

test("squashPrompt errors clearly when the response has no text block", async () => {
  const client = stubClient({ text: null, stopReason: "refusal" });
  await assert.rejects(squashPrompt("p", { client }), /no text block/);
  await assert.rejects(squashPrompt("p", { client }), /stop_reason: refusal/);
});

test("the expansion path runs end to end without a RangeError", async () => {
  const source = "short";
  const expanded = "a considerably longer compressed prompt than the input was";
  const client = stubClient({
    text: wrap("nothing to cut", expanded),
    tokenMap: { [source]: 2, [expanded]: 14 },
  });
  const r = await squashPrompt(source, { client });
  const before = await countTokens(client, DEFAULT_MODEL, source);
  const after = await countTokens(client, DEFAULT_MODEL, r.squashed);
  const stats = computeStats(before.tokens, after.tokens);
  assert.equal(stats.expanded, true);
  const rendered = formatStats(stats, {
    beforeChars: source.length,
    afterChars: r.squashed.length,
    usage: r.usage,
  });
  assert.match(rendered, /Grew/);
});

// ─── CLI ─────────────────────────────────────────────────────────────────────

test("parseArgs defaults: stats on, current model", () => {
  const o = parseArgs([]);
  assert.equal(o.showStats, true, "stats must default to on");
  assert.equal(o.showVerbose, false);
  assert.equal(o.model, DEFAULT_MODEL);
  assert.equal(DEFAULT_MODEL, "claude-sonnet-5");
});

test("parseArgs reads --no-stats, --verbose, --model and files", () => {
  const o = parseArgs(["--no-stats", "--verbose", "--model", "claude-opus-5", "p.txt"]);
  assert.equal(o.showStats, false);
  assert.equal(o.showVerbose, true);
  assert.equal(o.model, "claude-opus-5");
  assert.deepEqual(o.files, ["p.txt"]);
});

test("parseArgs rejects unknown flags and a bare --model", () => {
  assert.match(parseArgs(["--wat"]).error, /unknown option/);
  assert.match(parseArgs(["--model"]).error, /--model/);
});

test("--help exits 0 and documents the token-count source", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /count_tokens/);
  assert.match(r.stdout, /--model/);
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

test("a file argument is read and reported without an API key", () => {
  const tmp = path.join(os.tmpdir(), `squash-${process.pid}.txt`);
  fs.writeFileSync(tmp, "You are a helpful assistant. Please be thorough.\n");
  try {
    const r = run([tmp]);
    assert.match(r.stdout, new RegExp(path.basename(tmp)));
    assert.match(r.stdout, /ANTHROPIC_API_KEY not set/);
    assert.equal(r.status, 1);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("piped stdin is accepted and emits no ANSI escapes", () => {
  const r = run([], { stdin: "Be very thorough and comprehensive.\n" });
  assert.ok(!r.stdout.includes("\x1b"), "escape sequence leaked into the pipe");
  assert.match(r.stdout, /ANTHROPIC_API_KEY not set/);
});

test("empty stdin exits 2", () => {
  const r = run([], { stdin: "  \n" });
  assert.equal(r.status, 2);
});

test("the first-run notice warns before anything is sent", () => {
  const r = run([], { stdin: "Be thorough.\n" });
  assert.match(r.stdout, /sent verbatim to the Anthropic API/);
});
