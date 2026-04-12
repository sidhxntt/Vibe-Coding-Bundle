#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import readline from "readline";

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[38;5;203m", yellow: "\x1b[38;5;220m", green: "\x1b[38;5;114m",
  cyan: "\x1b[38;5;117m", magenta: "\x1b[38;5;213m", gray: "\x1b[38;5;245m",
};

const bold    = (s) => `${c.bold}${s}${c.reset}`;
const dim     = (s) => `${c.dim}${s}${c.reset}`;
const red     = (s) => `${c.red}${s}${c.reset}`;
const yellow  = (s) => `${c.yellow}${s}${c.reset}`;
const green   = (s) => `${c.green}${s}${c.reset}`;
const cyan    = (s) => `${c.cyan}${s}${c.reset}`;
const magenta = (s) => `${c.magenta}${s}${c.reset}`;
const gray    = (s) => `${c.gray}${s}${c.reset}`;

// ─── Token estimate ───────────────────────────────────────────────────────────
const estimateTokens = (t) => Math.ceil(t.length / 4);

// ─── Spinner ──────────────────────────────────────────────────────────────────
function makeSpinner(msg) {
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${cyan(frames[i++ % frames.length])} ${dim(msg)}`);
  }, 80);
  return { stop: () => { clearInterval(timer); process.stdout.write("\r\x1b[2K"); } };
}

// ─── Core squash ──────────────────────────────────────────────────────────────
async function squashPrompt(promptText) {
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a prompt compression expert. Convert verbose system prompts into ultra-dense, instruction-only format.

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
<squashed>[compressed prompt, raw text only]</squashed>`,
    messages: [{ role: "user", content: `Compress this system prompt:\n\n${promptText}` }],
  });

  const raw = resp.content[0].text;
  const rM  = raw.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  const sM  = raw.match(/<squashed>([\s\S]*?)<\/squashed>/);
  if (!sM) throw new Error("No <squashed> block returned. Try again.");
  return { squashed: sM[1].trim(), reasoning: rM ? rM[1].trim() : null };
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function printStats(orig, sq) {
  const o = estimateTokens(orig), s = estimateTokens(sq);
  const pct = (((o - s) / o) * 100).toFixed(1);
  const filled = Math.round(pct / 100 * 24);
  const bar = `${c.green}${"█".repeat(filled)}${c.reset}${gray("░".repeat(24 - filled))}`;
  console.log();
  console.log(`  ${bold("───── TOKEN STATS ─────")}`);
  console.log(`  ${gray("Before")}   ${yellow(o.toLocaleString())} tokens  ${gray(`(${orig.length.toLocaleString()} chars)`)}`);
  console.log(`  ${gray("After")}    ${green(s.toLocaleString())} tokens  ${gray(`(${sq.length.toLocaleString()} chars)`)}`);
  console.log(`  ${gray("Crushed")}  ${bold(green(pct + "%"))} ${bar}`);
  console.log(`  ${bold("───────────────────────")}`);
}

// ─── Welcome ──────────────────────────────────────────────────────────────────
function printWelcome() {
  console.clear();
  console.log();
  console.log(`  ${bold(cyan("token-squasher"))} ${gray("v2.0.0")}`);
  console.log(`  ${gray("Compress verbose system prompts. Keep logic. Crush tokens.")}`);
  console.log();

  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (hasKey) {
    console.log(`  ${green("✔")} ${dim("ANTHROPIC_API_KEY detected")}`);
  } else {
    console.log(`  ${red("✖")} ${bold("ANTHROPIC_API_KEY not set")}  →  ${cyan("export ANTHROPIC_API_KEY=sk-ant-...")}`);
  }

  console.log();
  console.log(`  ${dim("Paste your system prompt and press")} ${bold("Enter twice")} ${dim("to squash.")}`);
  console.log(`  ${dim("Commands:")} ${cyan(":stats")} ${dim("toggle stats")}  ${cyan(":verbose")} ${dim("toggle reasoning")}  ${cyan(":quit")} ${dim("exit")}`);
  console.log(`  ${dim("─".repeat(58))}`);
  console.log();
}

// ─── REPL ─────────────────────────────────────────────────────────────────────
async function runRepl() {
  printWelcome();

  let showStats   = false;
  let showVerbose = false;
  let session     = 0;
  let buffer      = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `  ${cyan("›")} `,
  });

  const promptNext = () => {
    session++;
    console.log(`  ${dim("─".repeat(58))}`);
    console.log(`  ${dim(`Prompt #${session} — paste prompt then`)} ${bold("Enter twice")} ${dim("to squash")}  ${gray(`[stats:${showStats?"on":"off"} verbose:${showVerbose?"on":"off"}]`)}`);
    console.log();
    rl.prompt();
  };

  const flush = async () => {
    const source = buffer.join("\n").trim();
    buffer = [];
    if (!source) return;

    // ── Commands ──
    if (source === ":quit" || source === ":q") {
      console.log(`\n  ${gray("bye. tokens crushed. 👋\n")}`);
      process.exit(0);
    }
    if (source === ":clear") { printWelcome(); promptNext(); return; }
    if (source === ":stats")   { showStats   = !showStats;   console.log(`  ${dim(`stats → ${showStats   ? green("on") : "off"}`)}\n`); promptNext(); return; }
    if (source === ":verbose") { showVerbose = !showVerbose; console.log(`  ${dim(`verbose → ${showVerbose ? green("on") : "off"}`)}\n`); promptNext(); return; }

    // ── Squash ──
    console.log();
    const spin = makeSpinner("Squashing tokens…");
    let result;
    try {
      result = await squashPrompt(source);
    } catch (err) {
      spin.stop();
      console.log(`  ${red("✖")} ${err.message}\n`);
      promptNext();
      return;
    }
    spin.stop();

    if (showVerbose && result.reasoning) {
      console.log(`  ${bold(magenta("REASONING"))}`);
      result.reasoning.split("\n").forEach((l) => console.log(`  ${gray(l)}`));
    }

    if (showStats) printStats(source, result.squashed);

    console.log();
    console.log(`  ${bold(green("─── squashed ") + "─".repeat(45))}`);
    console.log();
    console.log(result.squashed);
    console.log();
    console.log(`  ${dim("─".repeat(58))}`);

    promptNext();
  };

  promptNext();

  rl.on("line", (line) => {
    // Empty line after content = submit
    if (line.trim() === "" && buffer.length > 0) {
      rl.pause();
      flush().then(() => rl.resume()).catch((e) => {
        console.error(red(`  ✖ ${e.message}`));
        rl.resume();
      });
    } else {
      buffer.push(line);
      rl.prompt();
    }
  });

  rl.on("close", () => {
    if (buffer.length > 0) {
      flush().then(() => { console.log(`\n  ${gray("bye.\n")}`); process.exit(0); });
    } else {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
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

runRepl().catch((e) => {
  console.error(red(`  ✖ ${e.message}`));
  process.exit(1);
});