#!/usr/bin/env node

import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bundled sibling rather than a published dependency: vibe-coding-bundle ships
// the rule set alongside this CLI, so the two can never drift out of version.
import {
  RULES,
  analyzePrompt,
  scorePrompt,
  summarize,
} from "../rules/index.js";

const pkg = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")
);
export const VERSION = pkg.version;

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
// Honour NO_COLOR and a non-TTY stdout. Piping into a file or another process
// must never emit escape sequences.
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
  white: "\x1b[97m",
};

const c = Object.fromEntries(
  Object.keys(RAW).map((k) => [k, COLOR_ENABLED ? RAW[k] : ""])
);

const paint = (code) => (s) => (COLOR_ENABLED ? `${code}${s}${RAW.reset}` : String(s));
const bold = paint(RAW.bold);
const dim = paint(RAW.dim);
const red = paint(RAW.red);
const yellow = paint(RAW.yellow);
const green = paint(RAW.green);
const cyan = paint(RAW.cyan);
const magenta = paint(RAW.magenta);
const gray = paint(RAW.gray);
const white = paint(RAW.white);

const clearScreen = () => {
  if (COLOR_ENABLED) console.clear();
};

// ─── Renderer ────────────────────────────────────────────────────────────────

function severityIcon(sev) {
  return { error: red("✖"), warn: yellow("⚠"), info: cyan("ℹ") }[sev];
}

function severityLabel(sev) {
  return {
    error: red(bold("error")),
    warn: yellow(bold("warn ")),
    info: cyan(bold("info ")),
  }[sev];
}

function renderFindings(findings, sourceText, opts = {}) {
  const visible = opts.quiet
    ? findings.filter((f) => f.rule.severity === "error")
    : findings;

  if (findings.length === 0) {
    if (!opts.quiet) {
      console.log(`\n  ${green("✔")} ${bold("No issues found.")} Your prompt is tight.\n`);
    }
    return;
  }

  const lines = sourceText.split("\n");

  for (const f of visible) {
    const { rule, match, line, col } = f;

    console.log(
      `\n  ${severityIcon(rule.severity)} ${severityLabel(rule.severity)} ` +
        gray(`[${rule.id}]`) +
        ` ` +
        bold(white(rule.message))
    );
    console.log(`    ${gray(`${line}:${col}`)}  ${gray(`"${match}"`)}`);

    const srcLine = lines[line - 1] || "";
    const highlighted = COLOR_ENABLED
      ? srcLine.replace(match, `${RAW.red}${RAW.bold}${match}${RAW.reset}`)
      : srcLine;
    console.log(`    ${dim("│")} ${highlighted}`);

    if (!opts.noSuggestions && rule.suggestions.length > 0) {
      console.log(`    ${dim("│")}`);
      console.log(`    ${dim("│")} ${magenta("→ Try instead:")}`);
      for (const s of rule.suggestions) {
        console.log(`    ${dim("│")}   ${green("•")} ${s}`);
      }
    }
  }
}

function renderSummary(findings, sourceText) {
  const { errors, warnings, hints } = summarize(findings);
  const total = findings.length;

  console.log(`\n  ${dim("─".repeat(58))}`);
  if (total === 0) return;

  const parts = [];
  if (errors) parts.push(red(`${errors} error${errors !== 1 ? "s" : ""}`));
  if (warnings) parts.push(yellow(`${warnings} warning${warnings !== 1 ? "s" : ""}`));
  if (hints) parts.push(cyan(`${hints} hint${hints !== 1 ? "s" : ""}`));

  console.log(`  ${bold("Found:")} ${parts.join(gray("  │  "))}`);

  const score = scorePrompt(findings, sourceText);
  const scoreColor = score >= 80 ? green : score >= 50 ? yellow : red;
  console.log(`  ${bold("Score:")} ${scoreColor(score + "/100")}  ${renderScoreBar(score)}`);
  console.log();
}

function renderScoreBar(score) {
  const filled = Math.max(0, Math.min(20, Math.round(score / 5)));
  const empty = 20 - filled;
  const color = score >= 80 ? c.green : score >= 50 ? c.yellow : c.red;
  return (
    gray("[") +
    color +
    "█".repeat(filled) +
    c.reset +
    gray("░".repeat(empty)) +
    gray("]")
  );
}

function renderHeader(filename) {
  console.log();
  console.log(
    `  ${bold(cyan("vibe-lint"))} ${gray("v" + VERSION)}  ${dim("─")}  ${gray(
      filename || "stdin"
    )}`
  );
  console.log(
    `  ${gray("Flagging weak, vague, and counterproductive prompt instructions")}`
  );
}

// ─── JSON reporter ───────────────────────────────────────────────────────────

export function toJson(findings, sourceText, file) {
  const { errors, warnings, hints } = summarize(findings);
  return {
    file: file || "stdin",
    score: scorePrompt(findings, sourceText),
    summary: { errors, warnings, hints },
    findings: findings.map((f) => ({
      id: f.rule.id,
      severity: f.rule.severity,
      category: f.rule.category,
      message: f.rule.message,
      match: f.match,
      line: f.line,
      col: f.col,
      suggestions: f.rule.suggestions,
    })),
  };
}

// ─── Rule listing ────────────────────────────────────────────────────────────

function listRules() {
  console.log(`\n  ${bold(cyan("vibe-lint rules"))}\n`);
  const byCategory = {};
  for (const r of RULES) {
    (byCategory[r.category] ||= []).push(r);
  }
  for (const [cat, rules] of Object.entries(byCategory)) {
    console.log(`  ${bold(magenta(cat))}`);
    for (const r of rules) {
      console.log(`    ${gray(r.id)}  ${severityIcon(r.severity)}  ${r.message}`);
    }
    console.log();
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const HELP = `
  vibe-lint v${VERSION} — a linter for your prompts

  USAGE
    vibe-lint [options] [file ...]
    cat prompt.txt | vibe-lint [options]
    vibe-lint                      (no files, TTY stdin → interactive REPL)

  OPTIONS
    -h, --help              Show this help and exit
    -v, --version           Print the version and exit
        --json              Emit a machine-readable JSON report on stdout
        --quiet             Report errors only (warnings still affect the exit code)
        --max-warnings <n>  Exit non-zero when warnings exceed <n> (default: unlimited)
        --no-suggestions    Omit the "Try instead" block for each finding
        --rules             List every rule and exit
        --                  Treat all remaining arguments as file paths

  EXIT CODES
    0  no error-severity findings (and warnings within --max-warnings)
    1  at least one error, or --max-warnings exceeded
    2  usage error or unreadable file

  EXAMPLES
    vibe-lint bad-prompt.txt
    vibe-lint --json prompts/*.txt | jq '.[].score'
    vibe-lint --max-warnings 0 system-prompt.txt
    echo "make it better" | vibe-lint
`;

export function parseArgs(argv) {
  const opts = {
    help: false,
    version: false,
    json: false,
    quiet: false,
    noSuggestions: false,
    rules: false,
    maxWarnings: Infinity,
    files: [],
    error: null,
  };

  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (literal) {
      opts.files.push(arg);
      continue;
    }

    switch (arg) {
      case "--":
        literal = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--quiet":
      case "-q":
        opts.quiet = true;
        break;
      case "--no-suggestions":
        opts.noSuggestions = true;
        break;
      case "--rules":
        opts.rules = true;
        break;
      case "--max-warnings": {
        const raw = argv[++i];
        const n = Number(raw);
        if (raw === undefined || !Number.isInteger(n) || n < 0) {
          opts.error = `--max-warnings expects a non-negative integer, got ${
            raw === undefined ? "nothing" : `"${raw}"`
          }`;
        } else {
          opts.maxWarnings = n;
        }
        break;
      }
      default:
        if (arg.startsWith("--max-warnings=")) {
          const raw = arg.slice("--max-warnings=".length);
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 0) {
            opts.error = `--max-warnings expects a non-negative integer, got "${raw}"`;
          } else {
            opts.maxWarnings = n;
          }
        } else if (arg.startsWith("-") && arg !== "-") {
          opts.error = `unknown option: ${arg}`;
        } else {
          opts.files.push(arg);
        }
    }
  }

  return opts;
}

/** Lint one source string. Returns { findings, score, summary, failed }. */
export function lintText(source, opts = {}) {
  const findings = analyzePrompt(source);
  const { errors, warnings, hints } = summarize(findings);
  const maxWarnings = opts.maxWarnings ?? Infinity;
  return {
    findings,
    score: scorePrompt(findings, source),
    summary: { errors, warnings, hints },
    failed: errors > 0 || warnings > maxWarnings,
  };
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

/**
 * Non-interactive path: lint each source and return the process exit code.
 * @param {Array<{name: string, text: string}>} inputs
 */
function runBatch(inputs, opts) {
  let failed = false;
  const reports = [];

  for (const input of inputs) {
    const result = lintText(input.text, opts);
    if (result.failed) failed = true;

    if (opts.json) {
      reports.push(toJson(result.findings, input.text, input.name));
    } else {
      renderHeader(input.name);
      renderFindings(result.findings, input.text, opts);
      renderSummary(result.findings, input.text);
      if (
        result.summary.warnings > (opts.maxWarnings ?? Infinity) &&
        result.summary.errors === 0
      ) {
        console.log(
          `  ${yellow("⚠")} ${result.summary.warnings} warnings exceed --max-warnings ${opts.maxWarnings}\n`
        );
      }
    }
  }

  if (opts.json) {
    // One object for a single input, an array when several files were given.
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  }

  return failed ? 1 : 0;
}

// ─── REPL ────────────────────────────────────────────────────────────────────

function printWelcome() {
  clearScreen();
  console.log();
  console.log(`  ${bold(cyan("vibe-lint"))} ${gray("v" + VERSION)}`);
  console.log(`  ${gray("Flags weak, vague, and contradictory prompt instructions")}`);
  console.log();
  console.log(
    `  ${dim("Paste your prompt below and press")} ${bold("Enter twice")} ${dim("to lint it.")}`
  );
  console.log(
    `  ${dim("Commands:")} ${cyan(":rules")} ${dim("list all rules")}  ${cyan(":clear")} ${dim("clear screen")}  ${cyan(":quit")} ${dim("or Ctrl+C to exit")}`
  );
  console.log(`  ${dim("Tip:")} ${dim("pass file paths as arguments to lint non-interactively.")}`);
  console.log(`  ${dim("─".repeat(58))}`);
  console.log();
}

async function runRepl(opts) {
  printWelcome();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `  ${cyan("›")} `,
  });

  let buffer = [];

  const promptNext = () => {
    console.log(`  ${dim("─".repeat(58))}`);
    console.log(`  ${dim("Paste next prompt (Enter twice to lint) or")} ${cyan(":quit")}`);
    console.log();
    rl.prompt();
  };

  const flush = () => {
    const source = buffer.join("\n").trim();
    buffer = [];

    // Empty input used to `return` without redrawing, leaving a dead prompt.
    if (!source) {
      promptNext();
      return;
    }

    if (source === ":quit" || source === ":q") {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
    }
    if (source === ":rules") {
      listRules();
      promptNext();
      return;
    }
    if (source === ":clear") {
      printWelcome();
      promptNext();
      return;
    }

    const findings = analyzePrompt(source);
    console.log();
    console.log(`  ${dim("─".repeat(58))}`);
    renderFindings(findings, source, opts);
    renderSummary(findings, source);
    promptNext();
  };

  rl.prompt();

  rl.on("line", (line) => {
    if (line.trim() === "" && buffer.length > 0) {
      flush();
    } else {
      buffer.push(line);
      rl.prompt();
    }
  });

  rl.on("close", () => {
    if (buffer.length > 0) flush();
    console.log(`\n  ${gray("bye.\n")}`);
    process.exit(0);
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

// ─── Entry ───────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  if (opts.error) {
    console.error(red(`  ✖ ${opts.error}`));
    console.error(dim(`  Run 'vibe-lint --help' for usage.`));
    return 2;
  }
  if (opts.help) {
    console.log(HELP);
    return 0;
  }
  if (opts.version) {
    console.log(VERSION);
    return 0;
  }
  if (opts.rules) {
    listRules();
    return 0;
  }

  // 1. Explicit file arguments.
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

  // 2. Piped stdin.
  if (!process.stdin.isTTY) {
    const text = await readStdin();
    if (!text.trim()) {
      console.error(red("  ✖ no input on stdin"));
      return 2;
    }
    return runBatch([{ name: "stdin", text }], opts);
  }

  // 3. Interactive terminal, no files → REPL.
  if (opts.json) {
    console.error(red("  ✖ --json requires a file argument or piped stdin"));
    return 2;
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
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(red(`  ✖ ${e.message}`));
      process.exitCode = 2;
    }
  );
}
