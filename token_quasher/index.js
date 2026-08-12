#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")
);
export const VERSION = pkg.version;

export const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;
const BAR_WIDTH = 24;

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const COLOR_ENABLED =
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  Boolean(process.stdout.isTTY);

const RAW = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[38;5;203m", yellow: "\x1b[38;5;220m", green: "\x1b[38;5;114m",
  cyan: "\x1b[38;5;117m", magenta: "\x1b[38;5;213m", gray: "\x1b[38;5;245m",
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

// ─── Token counting ───────────────────────────────────────────────────────────

/**
 * Last-resort estimate. `length / 4` is a character count wearing a token
 * count's hat, and it is biased in the compressor's favour: the system prompt
 * below asks for dense symbolic output ("→", "w/"), and symbols tokenize worse
 * per character than prose. Only used when the count_tokens endpoint fails.
 */
export const estimateTokens = (t) => Math.ceil(String(t ?? "").length / 4);

/**
 * Exact token count for a string, via POST /v1/messages/count_tokens.
 * Returns { tokens, exact } so the caller can label the number honestly.
 */
export async function countTokens(client, model, text) {
  if (!text) return { tokens: 0, exact: true };
  try {
    const res = await client.messages.countTokens({
      model,
      messages: [{ role: "user", content: text }],
    });
    return { tokens: res.input_tokens, exact: true };
  } catch {
    return { tokens: estimateTokens(text), exact: false };
  }
}

// ─── Response parsing ─────────────────────────────────────────────────────────

/** The first text block — content[0] may be a thinking or tool_use block. */
export function firstTextBlock(content) {
  if (!Array.isArray(content)) return null;
  const block = content.find(
    (b) => b && b.type === "text" && typeof b.text === "string"
  );
  return block ? block.text : null;
}

export function parseSquashed(raw) {
  if (typeof raw !== "string") {
    throw new Error("No text block in the API response. Try again.");
  }
  const rM = raw.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  const sM = raw.match(/<squashed>([\s\S]*?)<\/squashed>/);
  if (!sM) throw new Error("No <squashed> block returned. Try again.");
  return { squashed: sM[1].trim(), reasoning: rM ? rM[1].trim() : null };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * Compression stats with the two 1.0.0 crashes fixed:
 *  - division by zero when the input was empty (`NaN%`)
 *  - `"█".repeat(negative)` → RangeError whenever the output was LONGER
 */
export function computeStats(beforeTokens, afterTokens) {
  const before = Number(beforeTokens) || 0;
  const after = Number(afterTokens) || 0;
  const delta = before - after;
  const pct = before > 0 ? (delta / before) * 100 : 0;
  return {
    before,
    after,
    delta,
    pct,
    expanded: after > before,
    unchanged: before > 0 && after === before,
    measurable: before > 0,
  };
}

export function renderBar(pct, width = BAR_WIDTH) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.max(0, Math.min(width, Math.round((clamped / 100) * width)));
  const color = pct < 0 ? c.red : c.green;
  return `${color}${"█".repeat(filled)}${c.reset}${gray("░".repeat(width - filled))}`;
}

export function formatStats(stats, { beforeChars, afterChars, exact, usage } = {}) {
  const lines = [];
  const label = exact === false ? " (estimated)" : "";
  const pctText = `${Math.abs(stats.pct).toFixed(1)}%`;

  lines.push(`  ${bold("───── TOKEN STATS ─────")}`);
  lines.push(
    `  ${gray("Before")}   ${yellow(stats.before.toLocaleString())} tokens${label}  ${gray(`(${(beforeChars ?? 0).toLocaleString()} chars)`)}`
  );
  lines.push(
    `  ${gray("After")}    ${green(stats.after.toLocaleString())} tokens${label}  ${gray(`(${(afterChars ?? 0).toLocaleString()} chars)`)}`
  );

  if (!stats.measurable) {
    lines.push(`  ${gray("Crushed")}  ${dim("n/a (empty input)")}`);
  } else if (stats.expanded) {
    lines.push(
      `  ${gray("Grew")}     ${bold(red("+" + pctText))} ${renderBar(0)} ${dim(`(+${-stats.delta} tokens — compression failed)`)}`
    );
  } else if (stats.unchanged) {
    lines.push(`  ${gray("Crushed")}  ${bold(yellow("0.0%"))} ${renderBar(0)} ${dim("(no change)")}`);
  } else {
    lines.push(`  ${gray("Crushed")}  ${bold(green(pctText))} ${renderBar(stats.pct)}`);
  }

  if (usage) {
    lines.push(
      `  ${gray("API call")} ${dim(`${usage.input_tokens ?? "?"} in / ${usage.output_tokens ?? "?"} out (billed)`)}`
    );
  }
  lines.push(`  ${bold("───────────────────────")}`);
  return lines.join("\n");
}

function printStats(stats, meta) {
  console.log();
  console.log(formatStats(stats, meta));
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

// ─── Core squash ──────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a prompt compression expert. Convert verbose system prompts into ultra-dense, instruction-only format.

RULES:
- Strip ALL filler: pleasantries, preambles, rationale, meta-commentary
- Imperative verbs only: "Return JSON" not "You should return JSON"
- Collapse repetition: one rule, stated once
- Symbols: "→" "w/" "&"
- Numbered lists > prose paragraphs
- Remove examples unless the ONLY way to convey a rule
- Preserve ALL logic, constraints, edge cases, behavioral rules — never lose one, never add one

Return ONLY:
<reasoning>[max 8 bullets of what you compressed and how]</reasoning>
<squashed>[compressed prompt, raw text only]</squashed>`;

/**
 * Built lazily — the REPL must still start (and say so) without a key, and the
 * SDK's own "could not resolve authentication method" only surfaces at request
 * time, which is far too late to be a useful message.
 */
let cachedClient = null;
export function getClient() {
  if (!cachedClient) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        "ANTHROPIC_API_KEY not set.\n  " +
          dim("Fix: ") +
          cyan("export ANTHROPIC_API_KEY=sk-ant-...")
      );
    }
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export async function squashPrompt(promptText, opts = {}) {
  const { model = DEFAULT_MODEL, client = getClient() } = opts;

  const resp = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Compress this system prompt:\n\n${promptText}` }],
  });

  const raw = firstTextBlock(resp.content);
  if (raw === null) {
    const reason = resp.stop_reason ? ` (stop_reason: ${resp.stop_reason})` : "";
    throw new Error(`API returned no text block${reason}. Nothing was compressed.`);
  }

  const parsed = parseSquashed(raw);
  return { ...parsed, usage: resp.usage ?? null, model };
}

// ─── Privacy notice ───────────────────────────────────────────────────────────
let noticeShown = false;
export function resetNotice() { noticeShown = false; }

function printApiNotice() {
  if (noticeShown || process.env.VIBE_NO_API_NOTICE) return;
  noticeShown = true;
  console.log(`  ${yellow("⚠")}  ${bold("Your prompt is sent verbatim to the Anthropic API.")}`);
  console.log(`     ${dim("Nothing is redacted. Do not paste API keys, credentials, or customer data.")}`);
  console.log(`     ${dim("Silence this notice with")} ${cyan("VIBE_NO_API_NOTICE=1")}`);
  console.log();
}

const VERIFY_WARNING =
  "Compression is not verified. The model is asked to preserve every rule, but " +
  "nothing checks that it did — diff the two prompts before shipping.";

// ─── One squash pass ──────────────────────────────────────────────────────────

async function squashSource(source, opts, { label = null, spinner = true } = {}) {
  if (label) console.log(`\n  ${bold(cyan(label))}`);
  printApiNotice();

  const spin = spinner ? makeSpinner(`Squashing tokens with ${opts.model}…`) : { stop: () => {} };
  let result;
  let client;
  try {
    client = opts.client ?? getClient();
    result = await squashPrompt(source, { model: opts.model, client });
  } catch (err) {
    spin.stop();
    console.log(`  ${red("✖")} ${err.message}\n`);
    return { failed: true, error: err };
  }
  spin.stop();

  if (opts.showVerbose && result.reasoning) {
    console.log(`  ${bold(magenta("REASONING"))}`);
    result.reasoning.split("\n").forEach((l) => console.log(`  ${gray(l)}`));
  }

  let stats = null;
  if (opts.showStats) {
    const before = await countTokens(client, opts.model, source);
    const after = await countTokens(client, opts.model, result.squashed);
    stats = computeStats(before.tokens, after.tokens);
    printStats(stats, {
      beforeChars: source.length,
      afterChars: result.squashed.length,
      exact: before.exact && after.exact,
      usage: result.usage,
    });
  }

  console.log();
  console.log(`  ${bold(green("─── squashed ") + "─".repeat(45))}`);
  console.log();
  console.log(result.squashed);
  console.log();
  console.log(`  ${yellow("⚠")} ${dim(VERIFY_WARNING)}`);
  console.log(`  ${dim("─".repeat(58))}`);

  return { squashed: result.squashed, reasoning: result.reasoning, usage: result.usage, stats };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const HELP = `
  token-squasher v${VERSION} — compress verbose system prompts, keep the logic

  USAGE
    token-squasher [options] [file ...]
    cat system-prompt.txt | token-squasher [options]
    token-squasher                     (no files, TTY stdin → interactive REPL)

  OPTIONS
    -h, --help          Show this help and exit
    -v, --version       Print the version and exit
        --model <id>    Claude model to use (default: ${DEFAULT_MODEL})
        --no-stats      Hide the token statistics block (shown by default)
        --verbose       Show the model's compression reasoning
        --              Treat all remaining arguments as file paths

  TOKEN COUNTS
    Before/after counts come from the Anthropic count_tokens endpoint, so they
    are real tokens for the selected model, not a chars/4 guess. If that call
    fails the numbers fall back to an estimate and are labelled as such. The
    "API call" line reports what the compression request itself was billed.

  ENVIRONMENT
    ANTHROPIC_API_KEY   Required.
    VIBE_NO_API_NOTICE  Set to any value to silence the first-run notice.

  EXIT CODES
    0  every input was compressed
    1  at least one compression failed
    2  usage error or unreadable file
`;

export function parseArgs(argv) {
  const opts = {
    help: false,
    version: false,
    model: DEFAULT_MODEL,
    showStats: true,
    showVerbose: false,
    files: [],
    error: null,
  };

  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (literal) { opts.files.push(arg); continue; }

    switch (arg) {
      case "--": literal = true; break;
      case "-h": case "--help": opts.help = true; break;
      case "-v": case "--version": opts.version = true; break;
      case "--no-stats": opts.showStats = false; break;
      case "--stats": opts.showStats = true; break;
      case "--verbose": opts.showVerbose = true; break;
      case "--model": {
        const value = argv[++i];
        if (!value || value.startsWith("-")) opts.error = "--model expects a model id";
        else opts.model = value;
        break;
      }
      default:
        if (arg.startsWith("--model=")) opts.model = arg.slice(8);
        else if (arg.startsWith("-") && arg !== "-") opts.error = `unknown option: ${arg}`;
        else opts.files.push(arg);
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
  for (const input of inputs) {
    const result = await squashSource(input.text, opts, { label: input.name });
    if (result.failed) failed = true;
  }
  return failed ? 1 : 0;
}

// ─── Welcome ──────────────────────────────────────────────────────────────────
function printWelcome(state) {
  clearScreen();
  console.log();
  console.log(`  ${bold(cyan("token-squasher"))} ${gray("v" + VERSION)}`);
  console.log(`  ${gray("Compress verbose system prompts. Keep logic. Crush tokens.")}`);
  console.log();

  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`  ${green("✔")} ${dim("ANTHROPIC_API_KEY detected")}`);
  } else {
    console.log(
      `  ${red("✖")} ${bold("ANTHROPIC_API_KEY not set")}  →  ${cyan("export ANTHROPIC_API_KEY=sk-ant-...")}`
    );
  }
  console.log(`  ${dim("model:")} ${cyan(state.model)}`);

  console.log();
  console.log(`  ${dim("Paste your system prompt and press")} ${bold("Enter twice")} ${dim("to squash.")}`);
  console.log(
    `  ${dim("Commands:")} ${cyan(":stats")} ${dim("toggle stats")}  ${cyan(":verbose")} ${dim("toggle reasoning")}  ${cyan(":clear")} ${dim("clear screen")}  ${cyan(":quit")} ${dim("exit")}`
  );
  console.log(`  ${dim("─".repeat(58))}`);
  console.log();
}

// ─── REPL ─────────────────────────────────────────────────────────────────────
async function runRepl(opts) {
  const state = {
    model: opts.model,
    // Stats are the headline feature; they were off by default in 1.0.0.
    showStats: opts.showStats,
    showVerbose: opts.showVerbose,
  };
  let session = 0;
  let buffer = [];

  printWelcome(state);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `  ${cyan("›")} `,
  });

  const promptNext = () => {
    session++;
    console.log(`  ${dim("─".repeat(58))}`);
    console.log(
      `  ${dim(`Prompt #${session} — paste prompt then`)} ${bold("Enter twice")} ${dim("to squash")}  ${gray(`[stats:${state.showStats ? "on" : "off"} verbose:${state.showVerbose ? "on" : "off"}]`)}`
    );
    console.log();
    rl.prompt();
  };

  const flush = async () => {
    const source = buffer.join("\n").trim();
    buffer = [];
    if (!source) { promptNext(); return; }

    if (source === ":quit" || source === ":q") {
      console.log(`\n  ${gray("bye. tokens crushed. 👋\n")}`);
      process.exit(0);
    }
    if (source === ":clear")   { printWelcome(state); promptNext(); return; }
    if (source === ":stats")   {
      state.showStats = !state.showStats;
      console.log(`  ${dim(`stats → ${state.showStats ? green("on") : "off"}`)}\n`);
      promptNext(); return;
    }
    if (source === ":verbose") {
      state.showVerbose = !state.showVerbose;
      console.log(`  ${dim(`verbose → ${state.showVerbose ? green("on") : "off"}`)}\n`);
      promptNext(); return;
    }

    console.log();
    await squashSource(source, state);
    promptNext();
  };

  promptNext();

  rl.on("line", (line) => {
    if (line.trim() === "" && buffer.length > 0) {
      rl.pause();
      flush()
        .catch((e) => console.error(red(`  ✖ ${e.message}`)))
        .finally(() => rl.resume());
    } else {
      buffer.push(line);
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
    console.error(dim("  Run 'token-squasher --help' for usage."));
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

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => {
      console.error(red(`  ✖ ${e.message}`));
      process.exitCode = 2;
    }
  );
}
