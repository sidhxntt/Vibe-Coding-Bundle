import test from "node:test";
import assert from "node:assert/strict";

import {
  RULES,
  analyzePrompt,
  scorePrompt,
  summarize,
  countWords,
  SEVERITY_WEIGHT,
  MAX_FINDINGS_PER_RULE,
  BASELINE_WORDS,
} from "../index.js";

const idsFor = (text) => analyzePrompt(text).map((f) => f.rule.id);
const fires = (id, text) => idsFor(text).includes(id);

// ─────────────────────────────────────────────────────────────────────────────
// Every rule needs a known-positive and a known-negative. The negatives are the
// point: they are the regressions that shipped in 1.0.0.
// ─────────────────────────────────────────────────────────────────────────────

const CASES = [
  {
    id: "W001",
    positive: "Read the diff and make it better.",
    negative: "Improve the ranking algorithm's recall to 0.9.",
  },
  {
    id: "W002",
    positive: "Please be more helpful when answering.",
    negative: "Answer in three sentences or fewer.",
  },
  {
    id: "W003",
    positive: "Produce a high-quality summary.",
    // The 1.0.0 pattern matched a bare "clean" and flagged this.
    negative: "Clean up the array before returning it.",
  },
  {
    id: "E001",
    positive: "Look at the repo and do your best.",
    negative: "Handle HTTP 500 by retrying twice with backoff.",
  },
  {
    id: "E002",
    positive: "Add type annotations as needed.",
    negative: "Add error handling if the function throws.",
  },
  {
    id: "W004",
    positive: "Return the results in a good format.",
    negative: "Return a JSON object matching this schema.",
  },
  {
    id: "W005",
    positive: "Read the ticket and respond appropriately.",
    negative: "Respond with application/json.",
  },
  {
    id: "E003",
    positive: "You are an AI assistant built by a startup.",
    negative: "You are a senior Rust compiler engineer.",
  },
  {
    id: "W006",
    positive: "Act as a helpful assistant for our support desk.",
    negative: "Act as a PostgreSQL performance consultant.",
  },
  {
    id: "W007",
    positive: "Cover the tricky inputs, such as:",
    negative: "Cover tricky inputs such as timeouts and retries.",
  },
  {
    id: "E004",
    positive: "Be brief. At the same time, be comprehensive.",
    negative: "Be concise. Expand only on error handling.",
  },
  {
    id: "W008",
    positive: "Please try to return valid JSON.",
    // A bare "please" is courtesy, not an antipattern; 1.0.0 flagged it.
    negative: "Please return valid JSON.",
  },
  {
    id: "W009",
    positive: "Don't use passive voice.",
    negative: "Use active constructions throughout.",
  },
  {
    id: "E005",
    positive: "Summarize the code and list its exports.",
    negative: [
      "Summarize this and list its exports:",
      "```js",
      "export const a = 1;",
      "```",
      "Then rename the file accordingly.",
    ].join("\n"),
  },
  {
    id: "W010",
    positive: "Keep iterating until it's good.",
    negative: "Stop when all 5 test cases produce correct output.",
  },
  {
    id: "I001",
    positive: "Just give me the answer.",
    negative: "Think step by step before you reply.",
  },
  {
    id: "W011",
    positive: "Act as an expert and review this.",
    negative: "You are an expert in Python async internals.",
  },
];

test("every rule in RULES has a positive and negative test case", () => {
  const covered = new Set(CASES.map((c) => c.id));
  const missing = RULES.map((r) => r.id).filter((id) => !covered.has(id));
  assert.deepEqual(missing, [], `rules without coverage: ${missing.join(", ")}`);
  assert.equal(CASES.length, RULES.length);
});

for (const { id, positive, negative } of CASES) {
  test(`${id} fires on its known-positive`, () => {
    assert.ok(fires(id, positive), `${id} did not fire on: ${positive}`);
  });

  test(`${id} does not fire on its known-negative`, () => {
    assert.ok(!fires(id, negative), `${id} wrongly fired on: ${negative}`);
  });
}

// ─── E005: the fenced-block defect ───────────────────────────────────────────

test("E005 does not fire when the prompt contains a fenced code block", () => {
  const prompt = [
    "Here is the module:",
    "```js",
    "export function add(a, b) { return a + b; }",
    "```",
    "Now update the file so it also exports subtract.",
    "Do not touch the code above the fence.",
  ].join("\n");

  const ids = idsFor(prompt);
  assert.ok(
    !ids.includes("E005"),
    `E005 fired on a prompt that supplies its context: ${ids.join(", ")}`
  );
});

test("E005 fires on every context reference when no fence is present", () => {
  const prompt = ["Refactor the code.", "Then summarize the file."].join("\n");
  const e005 = analyzePrompt(prompt).filter((f) => f.rule.id === "E005");
  assert.equal(e005.length, 2);
  assert.deepEqual(
    e005.map((f) => f.line),
    [1, 2]
  );
});

test("E005 has no lookahead left in its pattern", () => {
  const e005 = RULES.find((r) => r.id === "E005");
  assert.ok(!e005.pattern.source.includes("(?!"), "E005 still carries a lookahead");
  assert.equal(typeof e005.appliesTo, "function");
});

// ─── Double-counting ─────────────────────────────────────────────────────────

test('"professional" is charged by exactly one rule', () => {
  const ids = idsFor("Make the output more professional.");
  const hits = ids.filter((id) => id === "W003" || id === "W011");
  assert.deepEqual(hits, ["W003"], `expected only W003, got ${ids.join(", ")}`);
});

test('"the master branch" no longer trips the persona rule', () => {
  assert.ok(!fires("W011", "Rebase onto the master branch before pushing."));
});

// ─── Analyzer mechanics ──────────────────────────────────────────────────────

test("analyzePrompt reports one finding per rule per line", () => {
  const prompt = "make it better and make it better again";
  const findings = analyzePrompt(prompt).filter((f) => f.rule.id === "W001");
  assert.equal(findings.length, 1);
});

test("analyzePrompt returns findings ordered by position", () => {
  const prompt = "Please try to handle it as needed and make it better.";
  const findings = analyzePrompt(prompt);
  const indexes = findings.map((f) => f.index);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
});

test("analyzePrompt is stateless across calls (no leaked lastIndex)", () => {
  const prompt = "make it better";
  assert.deepEqual(idsFor(prompt), idsFor(prompt));
});

test("analyzePrompt tolerates empty and nullish input", () => {
  assert.deepEqual(analyzePrompt(""), []);
  assert.deepEqual(analyzePrompt(undefined), []);
});

test("line and column are 1-based and point at the match", () => {
  const prompt = "line one\nplease try to help";
  const f = analyzePrompt(prompt).find((x) => x.rule.id === "W008");
  assert.equal(f.line, 2);
  assert.equal(f.col, 1);
});

// ─── Score formula ───────────────────────────────────────────────────────────

test("a clean prompt scores 100", () => {
  assert.equal(scorePrompt([], "anything at all"), 100);
});

test("severity weights are applied as documented", () => {
  assert.deepEqual(SEVERITY_WEIGHT, { error: 20, warn: 8, info: 2 });
  const oneError = analyzePrompt("Handle it.");
  assert.equal(summarize(oneError).errors, 1);
  assert.equal(scorePrompt(oneError, "Handle it."), 80);
});

test("hints count toward the score (the toJson formula used to drop them)", () => {
  const text = "Just give me the answer.";
  const findings = analyzePrompt(text);
  assert.equal(summarize(findings).hints, 1);
  assert.equal(scorePrompt(findings, text), 98);
});

test("one rule cannot sink a prompt on its own (per-rule cap)", () => {
  const text = Array.from({ length: 5 }, () => "make it better").join("\n");
  const findings = analyzePrompt(text);
  assert.equal(findings.length, 5, "expected one finding per line");
  // 5 warnings would be -40 uncapped; the cap holds it to MAX_FINDINGS_PER_RULE.
  const expected = 100 - MAX_FINDINGS_PER_RULE * SEVERITY_WEIGHT.warn;
  assert.equal(scorePrompt(findings, text), expected);
});

test("the penalty is normalized by prompt length", () => {
  const short = "Handle it.";
  const findings = analyzePrompt(short);
  const long = short + " " + "word ".repeat(BASELINE_WORDS * 3);
  const shortScore = scorePrompt(findings, short);
  const longScore = scorePrompt(findings, long);
  assert.ok(
    longScore > shortScore,
    `expected the long prompt to be penalized less (${longScore} vs ${shortScore})`
  );
});

test("prompts at or under the baseline word count take the full penalty", () => {
  const text = "Handle it. " + "word ".repeat(BASELINE_WORDS - 5);
  assert.ok(countWords(text) <= BASELINE_WORDS);
  assert.equal(scorePrompt(analyzePrompt(text), text), 80);
});

test("the score is clamped to 0..100", () => {
  const text = Array.from({ length: 10 }, (_, i) =>
    `handle it ${i}\nas needed ${i}\ndo your best ${i}`
  ).join("\n");
  const score = scorePrompt(analyzePrompt(text), text);
  assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
});

test("summarize counts each severity", () => {
  const text = "You are an AI assistant. Please try to make it better. Just give me the answer.";
  const s = summarize(analyzePrompt(text));
  assert.ok(s.errors >= 1 && s.warnings >= 1 && s.hints >= 1);
});
