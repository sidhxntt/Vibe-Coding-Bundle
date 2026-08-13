#!/usr/bin/env node

import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bundled sibling rather than a published dependency: vibe-coding-bundle ships
// the rule set alongside this CLI, so the two can never drift out of version.
import {
  analyzePrompt,
  scorePrompt,
  summarize,
} from "../rules/index.js";

const pkg = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")
);
export const VERSION = pkg.version;

// ─── Defaults ─────────────────────────────────────────────────────────────────
export const DEFAULT_MODEL = "claude-sonnet-5";
/** Low, not zero: rewrites should be reproducible run to run. */
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_RETRIES = 2;
const API_URL = "https://api.anthropic.com/v1/messages";

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const COLOR_ENABLED =
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  Boolean(process.stdout.isTTY);

const RAW = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[38;5;203m",
  yellow: "\x1b[38;5;220m",
  green: "\x1b[38;5;114m",
  cyan: "\x1b[38;5;117m",
  magenta: "\x1b[38;5;213m",
  gray: "\x1b[38;5;245m",
};

const c = Object.fromEntries(
  Object.keys(RAW).map((k) => [k, COLOR_ENABLED ? RAW[k] : ""])
);

const paint = (code) => (s) => (COLOR_ENABLED ? `${code}${s}${RAW.reset}` : String(s));
const bold    = paint(RAW.bold);
const dim     = paint(RAW.dim);
const red     = paint(RAW.red);
const yellow  = paint(RAW.yellow);
const green   = paint(RAW.green);
const cyan    = paint(RAW.cyan);
const magenta = paint(RAW.magenta);
const gray    = paint(RAW.gray);

const clearScreen = () => {
  if (COLOR_ENABLED) console.clear();
};

// ─── Score rendering ──────────────────────────────────────────────────────────
function renderScoreBar(score) {
  const filled = Math.max(0, Math.min(20, Math.round(score / 5)));
  const empty  = 20 - filled;
  const col    = score >= 80 ? c.green : score >= 50 ? c.yellow : c.red;
  return gray("[") + col + "█".repeat(filled) + c.reset + gray("░".repeat(empty)) + gray("]");
}

function scoreLabel(score) {
  const col = score >= 80 ? green : score >= 50 ? yellow : red;
  return col(bold(`${score}/100`));
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function makeSpinner(msg) {
  if (!COLOR_ENABLED) {
    console.log(`  ${msg}`);
    return { stop: () => {} };
  }
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${cyan(frames[i++ % frames.length])} ${dim(msg)}`);
  }, 80);
  return { stop: () => { clearInterval(timer); process.stdout.write("\r\x1b[2K"); } };
}

// ─── Privacy notice ───────────────────────────────────────────────────────────
let noticeShown = false;

export function resetNotice() {
  noticeShown = false;
}

function printApiNotice() {
  if (noticeShown || process.env.VIBE_NO_API_NOTICE) return;
  noticeShown = true;
  console.log(
    `  ${yellow("⚠")}  ${bold("Your prompt is sent verbatim to the Anthropic API.")}`
  );
  console.log(
    `     ${dim("Nothing is redacted. Do not paste API keys, credentials, customer data,")}`
  );
  console.log(
    `     ${dim("or anything else you would not put in a third-party request body.")}`
  );
  console.log(`     ${dim("Silence this notice with")} ${cyan("VIBE_NO_API_NOTICE=1")}`);
  console.log();
}

// ─── API error handling ───────────────────────────────────────────────────────

/**
 * Build an error message from a non-2xx response body.
 * The 1.0.0 code did `JSON.parse(err)?.error?.message || err` inside the throw,
 * so a non-JSON body (a 503 HTML page from a proxy, an empty gateway response)
 * threw a SyntaxError from inside the throw expression and replaced the real
 * API error with `Unexpected token '<'`.
 */
export function apiErrorMessage(status, body) {
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? body;
  } catch {
    // Body was not JSON. Keep the raw text — it is still the best diagnostic.
  }
  detail = String(detail ?? "").replace(/\s+/g, " ").trim();
  if (detail.length > 300) detail = detail.slice(0, 300) + "…";
  return `API ${status}: ${detail || "(empty response body)"}`;
}

/** Extract the assistant text, guarding refusals and empty content arrays. */
export function extractText(data) {
  if (!data || !Array.isArray(data.content)) {
    throw new Error(
      "API response had no content array — nothing was rewritten. " +
        `Received: ${JSON.stringify(data ?? null).slice(0, 200)}`
    );
  }
  const text = data.content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) {
    const reason = data.stop_reason ? ` (stop_reason: ${data.stop_reason})` : "";
    throw new Error(
      `Claude returned no text${reason} — the request was likely refused. Your prompt is unchanged.`
    );
  }
  return text;
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SYSTEM_PROMPT = `You are an expert prompt engineer. Your task is to rewrite user-provided LLM prompts to fix specific flagged issues and make them maximally effective.

You will receive:
1. The original prompt
2. A list of flagged issues with rule IDs and suggested fixes (the list may be empty)

Your job is to output ONLY the rewritten prompt — no preamble, no explanation, no markdown wrapper, no "Here is the optimized prompt:" lead-in. Just the raw rewritten prompt text.

Rules for rewriting:
- Fix every flagged issue using the suggestions as guidance
- If no issues were flagged, still tighten the prompt: sharpen vague instructions, add missing success criteria, and make the output contract explicit
- Preserve the original intent and domain completely
- Replace vague language with concrete, measurable instructions
- Replace identity statements ("you are an AI") with domain expert personas
- Remove politeness bloat ("please", "feel free to", "kindly")
- Turn negation-only rules into positive constraints paired with the negation
- Replace ambiguous scope words ("as needed", "where appropriate") with explicit conditions
- If contradictory constraints exist, pick the most defensible interpretation and make it explicit
- Do not add new requirements the original didn't imply
- Preserve any technical specifics, code references, or domain terms verbatim`;

export function buildIssueList(findings) {
  if (findings.length === 0) {
    return "(none — no rule fired. Tighten the prompt on general principles.)";
  }
  return findings
    .map(
      (f) =>
        `- [${f.rule.id}] ${f.rule.severity.toUpperCase()}: "${f.match}" — ${f.rule.message}\n  Suggestions: ${f.rule.suggestions.join(" | ")}`
    )
    .join("\n");
}

/**
 * Call Claude. Bounded retry with exponential backoff, a hard per-attempt
 * timeout via AbortSignal, and a fixed low temperature for reproducibility.
 */
export async function optimizeWithClaude(prompt, findings, opts = {}) {
  const {
    model = DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    temperature = DEFAULT_TEMPERATURE,
    apiKey = process.env.ANTHROPIC_API_KEY,
    fetchImpl = globalThis.fetch,
    onRetry = () => {},
  } = opts;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set.\n  " +
        dim("Fix: ") +
        cyan("export ANTHROPIC_API_KEY=sk-ant-...") +
        "\n  Then restart the tool."
    );
  }

  const body = JSON.stringify({
    model,
    max_tokens: 1000,
    temperature,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Original prompt:\n"""\n${prompt}\n"""\n\n` +
          `Flagged issues to fix:\n${buildIssueList(findings)}\n\n` +
          `Rewrite the prompt to fix all issues above.`,
      },
    ],
  });

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
      onRetry(attempt, Math.round(backoff), lastError);
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const err = new Error(apiErrorMessage(response.status, text));
        err.status = response.status;
        if (RETRYABLE.has(response.status) && attempt < retries) {
          lastError = err;
          continue;
        }
        throw err;
      }

      return extractText(await response.json());
    } catch (err) {
      const isAbort = err?.name === "AbortError";
      const isNetwork = err instanceof TypeError || err?.name === "FetchError";
      const wrapped = isAbort
        ? new Error(`request timed out after ${timeoutMs}ms`)
        : err;

      if ((isAbort || isNetwork) && attempt < retries) {
        lastError = wrapped;
        continue;
      }
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("request failed after all retries");
}

// ─── Finding diff ─────────────────────────────────────────────────────────────

/**
 * Compare two finding sets by rule id. The 1.0.0 code printed
 * `findings.length - newFindings.length` as "N issues fixed" in green, which
 * went negative whenever the rewrite tripped a new rule.
 */
export function diffFindings(before, after) {
  const countBy = (list) => {
    const m = new Map();
    for (const f of list) m.set(f.rule.id, (m.get(f.rule.id) ?? 0) + 1);
    return m;
  };
  const b = countBy(before);
  const a = countBy(after);

  const resolved = [];
  const remaining = [];
  for (const id of b.keys()) {
    if ((a.get(id) ?? 0) === 0) resolved.push(id);
    else remaining.push(id);
  }
  const introduced = [...a.keys()].filter((id) => !b.has(id));

  resolved.sort();
  remaining.sort();
  introduced.sort();
  return { resolved, remaining, introduced };
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderIssuesSummary(findings) {
  const icons = { error: red("✖"), warn: yellow("⚠"), info: cyan("ℹ") };

  if (findings.length === 0) {
    console.log(
      `  ${green("✔")} ${bold("No rule fired")} — the regex engine found nothing to flag.`
    );
    return false;
  }

  console.log(`  ${bold("Issues detected:")}`);
  for (const f of findings) {
    console.log(
      `    ${icons[f.rule.severity]} ${gray(`[${f.rule.id}]`)} ${gray(`"${f.match}"`)}  ${dim(f.rule.message)}`
    );
  }

  const { errors, warnings, hints } = summarize(findings);
  const parts = [];
  if (errors)   parts.push(red(`${errors} error${errors !== 1 ? "s" : ""}`));
  if (warnings) parts.push(yellow(`${warnings} warning${warnings !== 1 ? "s" : ""}`));
  if (hints)    parts.push(cyan(`${hints} hint${hints !== 1 ? "s" : ""}`));
  console.log(`\n  ${parts.join(gray("  │  "))}`);
  return true;
}

function renderDiff(original, optimized) {
  console.log(`\n  ${bold(red("─── before ─────────────────────────────────────────────"))}`);
  for (const line of original.split("\n")) console.log(`  ${red("−")} ${dim(line)}`);
  console.log(`\n  ${bold(green("─── after ──────────────────────────────────────────────"))}`);
  for (const line of optimized.split("\n")) console.log(`  ${green("+")} ${line}`);
}

function renderScoreComparison(before, after) {
  const arrow = after > before ? green("↑") : after < before ? red("↓") : gray("→");
  console.log(
    `\n  ${bold("Score:")}  ` +
      `${scoreLabel(before)} ${renderScoreBar(before)}  ${dim("before")}` +
      `\n          ` +
      `${scoreLabel(after)}  ${renderScoreBar(after)}  ${arrow} ${dim("after")}`
  );
}

function renderOutcome({ resolved, remaining, introduced }) {
  console.log();
  if (resolved.length > 0) {
    console.log(
      `  ${green("✔")} ${bold(green(`resolved (${resolved.length}):`))} ${resolved.join(", ")}`
    );
  } else {
    console.log(`  ${yellow("⚠")} ${bold(yellow("resolved (0):"))} ${dim("no rule was cleared")}`);
  }
  if (remaining.length > 0) {
    console.log(
      `  ${yellow("·")} ${yellow(`still present (${remaining.length}):`)} ${remaining.join(", ")} ${dim("(needs manual context)")}`
    );
  }
  if (introduced.length > 0) {
    console.log(
      `  ${red("✖")} ${bold(red(`introduced (${introduced.length}):`))} ${introduced.join(", ")} ${dim("(the rewrite is worse here)")}`
    );
  }
  if (remaining.length === 0 && introduced.length === 0) {
    console.log(`  ${green("·")} ${green("prompt is clean")}`);
  }
}

// ─── One optimization pass ────────────────────────────────────────────────────

async function optimizeSource(source, opts, { label = null, spinner = true } = {}) {
  const findings = analyzePrompt(source);
  const beforeScore = scorePrompt(findings, source);

  if (label) {
    console.log(`\n  ${bold(cyan(label))}`);
  }
  const hasIssues = renderIssuesSummary(findings);

  if (!hasIssues && !opts.force) {
    console.log(
      `  ${dim("Nothing to fix by rule. Re-run with")} ${cyan("--force")} ${dim("(or type")} ${cyan(":force")} ${dim("in the REPL) to optimize anyway.")}`
    );
    return { skipped: true, findings, beforeScore };
  }

  console.log();
  printApiNotice();

  const spin = spinner ? makeSpinner(`Optimizing with ${opts.model}…`) : { stop: () => {} };
  let optimized;
  try {
    optimized = await optimizeWithClaude(source, findings, {
      model: opts.model,
      timeoutMs: opts.timeoutMs,
      retries: opts.retries,
      onRetry: (attempt, backoff, err) => {
        spin.stop();
        console.log(
          `  ${yellow("↻")} ${dim(`attempt ${attempt + 1}/${opts.retries + 1} after ${backoff}ms`)} ${gray(err ? `(${err.message})` : "")}`
        );
      },
    });
  } catch (err) {
    spin.stop();
    console.log(`  ${red("✖")} ${err.message}\n`);
    return { failed: true, error: err, findings, beforeScore };
  }
  spin.stop();

  const newFindings = analyzePrompt(optimized);
  const afterScore = scorePrompt(newFindings, optimized);

  renderDiff(source, optimized);
  renderScoreComparison(beforeScore, afterScore);
  renderOutcome(diffFindings(findings, newFindings));
  console.log();

  return {
    optimized,
    findings,
    newFindings,
    beforeScore,
    afterScore,
    diff: diffFindings(findings, newFindings),
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const HELP = `
  prompt-optimizer v${VERSION} — rewrites weak prompts using vibe-lint rules + Claude

  USAGE
    prompt-optimizer [options] [file ...]
    cat prompt.txt | prompt-optimizer [options]
    prompt-optimizer                    (no files, TTY stdin → interactive REPL)

  OPTIONS
    -h, --help            Show this help and exit
    -v, --version         Print the version and exit
        --model <id>      Claude model to use (default: ${DEFAULT_MODEL})
        --force           Optimize even when no rule fires
        --timeout <ms>    Per-attempt request timeout (default: ${DEFAULT_TIMEOUT_MS})
        --retries <n>     Retries after a timeout / 429 / 5xx (default: ${DEFAULT_RETRIES})
        --json            Emit a JSON report instead of the coloured diff
        --                Treat all remaining arguments as file paths

  ENVIRONMENT
    ANTHROPIC_API_KEY     Required.
    VIBE_NO_API_NOTICE    Set to any value to silence the "prompt is sent to the
                          API" first-run notice.

  DETERMINISM
    Requests are sent with temperature ${DEFAULT_TEMPERATURE}. Rewrites are near-deterministic
    run to run, but the API makes no exact-reproducibility guarantee.

  EXIT CODES
    0  every input was optimized (or skipped as clean)
    1  at least one optimization failed
    2  usage error or unreadable file
`;

export function parseArgs(argv) {
  const opts = {
    help: false,
    version: false,
    force: false,
    json: false,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    files: [],
    error: null,
  };

  const intArg = (name, raw, min = 0) => {
    const n = Number(raw);
    if (raw === undefined || !Number.isInteger(n) || n < min) {
      opts.error = `${name} expects an integer >= ${min}, got ${
        raw === undefined ? "nothing" : `"${raw}"`
      }`;
      return null;
    }
    return n;
  };

  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (literal) { opts.files.push(arg); continue; }

    switch (arg) {
      case "--": literal = true; break;
      case "-h": case "--help": opts.help = true; break;
      case "-v": case "--version": opts.version = true; break;
      case "--force": case "-f": opts.force = true; break;
      case "--json": opts.json = true; break;
      case "--model": {
        const value = argv[++i];
        if (!value || value.startsWith("-")) opts.error = "--model expects a model id";
        else opts.model = value;
        break;
      }
      case "--timeout": {
        const n = intArg("--timeout", argv[++i], 1);
        if (n !== null) opts.timeoutMs = n;
        break;
      }
      case "--retries": {
        const n = intArg("--retries", argv[++i], 0);
        if (n !== null) opts.retries = n;
        break;
      }
      default:
        if (arg.startsWith("--model=")) opts.model = arg.slice(8);
        else if (arg.startsWith("--timeout=")) {
          const n = intArg("--timeout", arg.slice(10), 1);
          if (n !== null) opts.timeoutMs = n;
        } else if (arg.startsWith("--retries=")) {
          const n = intArg("--retries", arg.slice(10), 0);
          if (n !== null) opts.retries = n;
        } else if (arg.startsWith("-") && arg !== "-") {
          opts.error = `unknown option: ${arg}`;
        } else {
          opts.files.push(arg);
        }
    }
  }

  return opts;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function runBatch(inputs, opts) {
  let failed = false;
  const reports = [];

  for (const input of inputs) {
    const result = await optimizeSource(input.text, opts, {
      label: input.name,
      spinner: !opts.json,
    });
    if (result.failed) failed = true;

    if (opts.json) {
      reports.push({
        file: input.name,
        model: opts.model,
        skipped: Boolean(result.skipped),
        error: result.failed ? result.error.message : null,
        score: { before: result.beforeScore ?? null, after: result.afterScore ?? null },
        resolved: result.diff?.resolved ?? [],
        remaining: result.diff?.remaining ?? [],
        introduced: result.diff?.introduced ?? [],
        original: input.text,
        optimized: result.optimized ?? null,
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  }
  return failed ? 1 : 0;
}

// ─── REPL ─────────────────────────────────────────────────────────────────────

function printWelcome(opts) {
  clearScreen();
  console.log();
  console.log(`  ${bold(cyan("prompt-optimizer"))} ${gray("v" + VERSION)}`);
  console.log(`  ${gray("Rewrites weak prompts using vibe-lint rules + Claude")}`);
  console.log();

  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`  ${green("✔")} ${dim("ANTHROPIC_API_KEY detected")}`);
  } else {
    console.log(
      `  ${red("✖")} ${bold("ANTHROPIC_API_KEY not set")}  ${dim("→")}  ${cyan("export ANTHROPIC_API_KEY=sk-ant-...")}`
    );
  }
  console.log(`  ${dim("model:")} ${cyan(opts.model)}  ${dim("temperature:")} ${cyan(DEFAULT_TEMPERATURE)}`);

  console.log();
  console.log(`  ${dim("Paste your prompt and press")} ${bold("Enter twice")} ${dim("to optimize it.")}`);
  console.log(
    `  ${dim("Commands:")} ${cyan(":force")} ${dim("optimize the last clean prompt anyway")}  ${cyan(":clear")} ${dim("clear screen")}  ${cyan(":quit")} ${dim("exit")}`
  );
  console.log(`  ${dim("─".repeat(58))}`);
  console.log();
}

async function runRepl(opts) {
  printWelcome(opts);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `  ${cyan("›")} `,
  });

  let buffer = [];
  let lastSource = null;

  const promptNext = () => {
    console.log(`  ${dim("─".repeat(58))}`);
    console.log(`  ${dim("Paste next prompt (Enter twice to optimize) or")} ${cyan(":quit")}`);
    console.log();
    rl.prompt();
  };

  const flush = async () => {
    const source = buffer.join("\n").trim();
    buffer = [];

    // Empty input used to `return` without redrawing, leaving a dead prompt.
    if (!source) { promptNext(); return; }

    if (source === ":quit" || source === ":q") {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
    }
    if (source === ":clear") { printWelcome(opts); promptNext(); return; }
    if (source === ":force") {
      if (!lastSource) {
        console.log(`  ${yellow("⚠")} ${dim("nothing to re-optimize yet.")}\n`);
        promptNext();
        return;
      }
      console.log();
      console.log(`  ${dim("─".repeat(58))}`);
      await optimizeSource(lastSource, { ...opts, force: true });
      promptNext();
      return;
    }

    lastSource = source;
    console.log();
    console.log(`  ${dim("─".repeat(58))}`);
    await optimizeSource(source, opts);
    promptNext();
  };

  rl.prompt();

  rl.on("line", (line) => {
    if (line.trim() === "" && buffer.length > 0) {
      rl.pause();
      flush()
        .catch((e) => console.error(red(`  ✖ ${e.message}`)))
        .finally(() => rl.resume());
    } else {
      buffer.push(line);
      // 1.0.0 never redrew the prompt here, so the "›" vanished after line 1.
      rl.prompt();
    }
  });

  rl.on("close", () => {
    const done = () => {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
    };
    if (buffer.length > 0) {
      // A rejected flush() used to leave the process hanging forever.
      flush()
        .catch((e) => console.error(red(`  ✖ ${e.message}`)))
        .finally(done);
    } else {
      done();
    }
  });

  rl.on("SIGINT", () => {
    if (buffer.length > 0) {
      buffer = [];
      console.log(`\n  ${yellow("⚠")}  ${gray("Input cleared.")}\n`);
      promptNext();
    } else {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
    }
  });
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  if (opts.error) {
    console.error(red(`  ✖ ${opts.error}`));
    console.error(dim("  Run 'prompt-optimizer --help' for usage."));
    return 2;
  }
  if (opts.help) { console.log(HELP); return 0; }
  if (opts.version) { console.log(VERSION); return 0; }

  if (opts.files.length > 0) {
    const inputs = [];
    for (const file of opts.files) {
      try {
        inputs.push({ name: file, text: fs.readFileSync(file, "utf8") });
      } catch (err) {
        console.error(red(`  ✖ cannot read ${file}: ${err.message}`));
        return 2;
      }
    }
    return runBatch(inputs, opts);
  }

  if (!process.stdin.isTTY) {
    const text = await readStdin();
    if (!text.trim()) {
      console.error(red("  ✖ no input on stdin"));
      return 2;
    }
    return runBatch([{ name: "stdin", text }], opts);
  }

  await runRepl(opts);
  return 0;
}

function realpathOrSelf(p) {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

const invokedDirectly =
  process.argv[1] &&
  // realpath both sides: npm installs bin as a symlink into node_modules/.bin,
  // so process.argv[1] is the link while import.meta.url is the real file.
  realpathOrSelf(process.argv[1]) === realpathOrSelf(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => {
      console.error(red(`  ✖ ${e.message}`));
      process.exitCode = 2;
    }
  );
}
