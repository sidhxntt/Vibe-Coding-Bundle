#!/usr/bin/env node

import readline from "readline";

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const c = {
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
  bg_red: "\x1b[48;5;52m",
  bg_yellow: "\x1b[48;5;58m",
  bg_green: "\x1b[48;5;22m",
};

const bold = (s) => `${c.bold}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;
const red = (s) => `${c.red}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const green = (s) => `${c.green}${s}${c.reset}`;
const cyan = (s) => `${c.cyan}${s}${c.reset}`;
const magenta = (s) => `${c.magenta}${s}${c.reset}`;
const gray = (s) => `${c.gray}${s}${c.reset}`;
const white = (s) => `${c.white}${s}${c.reset}`;

// ─── Rule Engine ─────────────────────────────────────────────────────────────

const RULES = [
  // ── Vague quality descriptors ──────────────────────────────────────────────
  {
    id: "W001",
    severity: "warn",
    category: "vague-quality",
    pattern: /\b(make it better|improve (it|this|the code|the output))\b/gi,
    message: 'Vague improvement request — "better" is unmeasurable',
    suggestions: [
      "Specify the axis: 'reduce cyclomatic complexity below 10'",
      "Target a metric: 'cut response latency by 30%'",
      "Name the smell: 'eliminate magic numbers, extract named constants'",
      "Describe the reader: 'a junior dev should understand without inline comments'",
    ],
    docs: "https://platform.openai.com/docs/guides/prompt-engineering#specify-the-desired-output-format",
  },
  {
    id: "W002",
    severity: "warn",
    category: "vague-quality",
    pattern: /\b(be (more )?(helpful|useful|good|better|clearer|concise))\b/gi,
    message: '"Be helpful/useful/good" gives the model no optimization target',
    suggestions: [
      "'Answer in ≤3 sentences unless the topic requires more depth'",
      "'If unsure, list 2 options with trade-offs rather than picking one'",
      "'Prefer code examples over prose explanations for how-to questions'",
    ],
    docs: null,
  },
  {
    id: "W003",
    severity: "warn",
    category: "vague-quality",
    pattern: /\b(high[- ]quality|professional|polished|nice|clean)\b/gi,
    message: '"High-quality/professional" is subjective without a rubric',
    suggestions: [
      "For code: 'passes ESLint strict, has JSDoc on public functions, no TODOs'",
      "For prose: 'Flesch-Kincaid grade ≤ 10, active voice, no filler phrases'",
      "For UI: 'WCAG AA contrast, touch targets ≥ 44px, no layout shift'",
    ],
    docs: null,
  },
  {
    id: "E001",
    severity: "error",
    category: "ambiguous-scope",
    pattern: /\b(do (the|your) (best|thing)|handle (it|this|everything))\b/gi,
    message: "Ambiguous delegation — model will hallucinate scope boundaries",
    suggestions: [
      "List exact subtasks: '1. Parse input 2. Validate schema 3. Return JSON'",
      "Set a ceiling: 'Only modify files in /src/components, leave tests untouched'",
      "Define done: 'Complete when all existing tests pass with no new warnings'",
    ],
    docs: null,
  },
  {
    id: "E002",
    severity: "error",
    category: "ambiguous-scope",
    pattern: /\b(as needed|where (appropriate|necessary)|if (applicable|needed|relevant))\b/gi,
    message: 'Conditional hedges let the model decide scope — it will decide wrong',
    suggestions: [
      "Replace with explicit conditions: 'Add error handling if the function throws'",
      "Use always/never: 'Always add type annotations. Never use `any`.'",
      "Enumerate the cases: 'Add comments above functions longer than 20 lines'",
    ],
    docs: null,
  },
  {
    id: "W004",
    severity: "warn",
    category: "output-format",
    pattern: /\b(in (a |an )?(good|nice|clear|readable|proper) format)\b/gi,
    message: '"Good format" is ambiguous — specify the exact structure',
    suggestions: [
      "'Return a JSON object: { summary: string, tags: string[], confidence: 0-1 }'",
      "'Use markdown with H2 sections: Overview, Usage, Examples, Caveats'",
      "'Plain text only, no markdown. Max 80 chars per line.'",
    ],
    docs: null,
  },
  {
    id: "W005",
    severity: "warn",
    category: "output-format",
    pattern: /\b(respond (appropriately|accordingly|as you see fit))\b/gi,
    message: "Deferred format decision will produce inconsistent outputs",
    suggestions: [
      "Specify mime type: 'Respond with application/json'",
      "Give a template: 'Use this structure: [ANALYSIS]\\n[CODE]\\n[CAVEATS]'",
      "Set length bounds: 'Between 100 and 300 words'",
    ],
    docs: null,
  },
  {
    id: "E003",
    severity: "error",
    category: "role-confusion",
    pattern: /\b(you (are|will be) an? (AI|assistant|language model|LLM|bot))\b/gi,
    message: "Restating model identity wastes tokens and adds no behavioral constraint",
    suggestions: [
      "Replace with a domain expert persona: 'You are a senior Rust compiler engineer'",
      "Or a constraint: 'You have access only to information in the provided context'",
      "Describe the audience: 'Your user is a first-year CS student'",
    ],
    docs: null,
  },
  {
    id: "W006",
    severity: "warn",
    category: "role-confusion",
    pattern: /\b(act (as|like) (a |an )?(helpful|smart|intelligent|knowledgeable) (AI|assistant))\b/gi,
    message: '"Act as a helpful assistant" adds noise, not signal',
    suggestions: [
      "'Act as a PostgreSQL performance consultant reviewing slow queries'",
      "'Act as a skeptical code reviewer who prioritizes security over brevity'",
      "'Act as the user\'s rubber duck — ask clarifying questions before answering'",
    ],
    docs: null,
  },
  {
    id: "W007",
    severity: "warn",
    category: "no-examples",
    pattern: /\b(for example[,:]?\s*(\.\.\.)?$|e\.g\.\s*(\.\.\.)?$|such as[,:]?\s*(\.\.\.)?$)/gim,
    message: "Trailing example placeholder — fill it in or remove it",
    suggestions: [
      "Concrete few-shot: show an input→output pair the model should emulate",
      "Negative example: show what NOT to produce (often more powerful)",
      "Edge case: show the tricky case, not the happy path",
    ],
    docs: null,
  },
  {
    id: "E004",
    severity: "error",
    category: "contradiction",
    pattern: /\b(be (brief|concise|short)).{0,120}(be (comprehensive|thorough|detailed|exhaustive))\b/gis,
    message: "Contradictory length constraints — model will average them badly",
    suggestions: [
      "Pick one and qualify the other: 'Be concise. Expand only on error handling.'",
      "Use section-level rules: 'Summary: 1 sentence. Implementation: as long as needed.'",
      "Set word counts: 'Under 150 words total, but include all code in full'",
    ],
    docs: null,
  },
  {
    id: "W008",
    severity: "warn",
    category: "politeness-bloat",
    pattern: /\b(please (please )?(try to |attempt to |do your best to )?|kindly|feel free to|don't hesitate to)\b/gi,
    message: "Politeness tokens consume context budget and dilute instruction weight",
    suggestions: [
      "Drop courtesy words entirely — models don't have feelings",
      "Convert to imperative: 'Return X' not 'Please try to return X'",
      "Every token should carry constraint or context",
    ],
    docs: null,
  },
  {
    id: "W009",
    severity: "warn",
    category: "negation-only",
    pattern: /\b(don't (be|use|include|add|make|write|do|say)|avoid being|never (be|sound))\b/gi,
    message: 'Negation-only rules are weak — models anchor on the forbidden concept',
    suggestions: [
      "Pair every DON'T with a DO: 'Don't use passive voice → use active constructions'",
      "Positive constraint: 'Use direct assertions' instead of 'Don't be wishy-washy'",
      "Show an example of what you WANT instead",
    ],
    docs: null,
  },
  {
    id: "E005",
    severity: "error",
    category: "missing-context",
    pattern: /\b(the (code|file|document|data|text|above|previous|earlier))\b(?![\s\S]*?```)/gi,
    message: "Reference to context not present in the prompt — model will hallucinate",
    suggestions: [
      "Paste the actual code/data inline in a fenced block",
      "Use explicit variable names: define it earlier in the prompt",
      "If using a system with retrieval, confirm the context is injected at runtime",
    ],
    docs: null,
  },
  {
    id: "W010",
    severity: "warn",
    category: "no-success-criteria",
    pattern: /\b(until (it('s| is) (good|right|working|correct|done))|when (you('re| are) happy|satisfied|done))\b/gi,
    message: "Subjective termination condition — model can't self-evaluate accurately",
    suggestions: [
      "Objective criterion: 'Stop when all 5 test cases produce correct output'",
      "Countable: 'Generate exactly 10 variants, ranked by estimated click-through'",
      "Verifiable: 'Complete when the function has <5 lines and passes mypy strict'",
    ],
    docs: null,
  },
  {
    id: "I001",
    severity: "info",
    category: "chain-of-thought",
    pattern: /\b(answer (this|the question|directly)|just (give|tell|show) (me|us) (the )?(answer|result|output))\b/gi,
    message: "Skipping reasoning may reduce accuracy on complex tasks",
    suggestions: [
      "Add: 'Think step by step before giving the final answer'",
      "Use scratchpad: 'Reason in <thinking> tags, then output in <answer> tags'",
      "If speed matters, note it explicitly: 'Skip reasoning, latency is critical'",
    ],
    docs: null,
  },
  {
    id: "W011",
    severity: "warn",
    category: "vague-persona",
    pattern: /\b(expert|specialist|professional|guru|master|wizard|ninja)\b(?! in| at| of| with)/gi,
    message: 'Bare "expert" persona lacks domain specificity',
    suggestions: [
      "'Expert' → 'Staff engineer with 10yr distributed systems experience'",
      "Add the skepticism level: 'Expert who defaults to the simplest solution'",
      "Scope the knowledge: 'Expert in Python async, unfamiliar with Rust'",
    ],
    docs: null,
  },
];

// ─── Analyzer ─────────────────────────────────────────────────────────────────

function analyzePrompt(text) {
  const findings = [];

  for (const rule of RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const lineNum = text.slice(0, match.index).split("\n").length;
      const colNum = match.index - text.lastIndexOf("\n", match.index - 1);
      findings.push({
        rule,
        match: match[0],
        index: match.index,
        line: lineNum,
        col: colNum,
      });
    }
  }

  // Deduplicate same rule on same line
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.rule.id}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

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
  if (findings.length === 0) {
    console.log(`\n  ${green("✔")} ${bold("No issues found.")} Your prompt is tight.\n`);
    return;
  }

  const lines = sourceText.split("\n");

  for (const f of findings) {
    const { rule, match, line, col } = f;

    console.log(
      `\n  ${severityIcon(rule.severity)} ${severityLabel(rule.severity)} ` +
      gray(`[${rule.id}]`) + ` ` +
      bold(white(rule.message))
    );
    console.log(`    ${gray(`${line}:${col}`)}  ${gray(`"${match}"`)}`);

    // Source context
    const srcLine = lines[line - 1] || "";
    const highlighted = srcLine.replace(
      match,
      `${c.red}${c.bold}${match}${c.reset}`
    );
    console.log(`    ${dim("│")} ${highlighted}`);

    // Suggestions
    if (!opts.noSuggestions && rule.suggestions.length > 0) {
      console.log(`    ${dim("│")}`);
      console.log(`    ${dim("│")} ${magenta("→ Try instead:")}`);
      for (const s of rule.suggestions) {
        console.log(`    ${dim("│")}   ${green("•")} ${s}`);
      }
    }
  }
}

function renderSummary(findings) {
  const errors = findings.filter((f) => f.rule.severity === "error").length;
  const warns = findings.filter((f) => f.rule.severity === "warn").length;
  const infos = findings.filter((f) => f.rule.severity === "info").length;

  const total = findings.length;
  console.log(`\n  ${dim("─".repeat(58))}`);

  if (total === 0) return;

  const parts = [];
  if (errors) parts.push(red(`${errors} error${errors !== 1 ? "s" : ""}`));
  if (warns) parts.push(yellow(`${warns} warning${warns !== 1 ? "s" : ""}`));
  if (infos) parts.push(cyan(`${infos} hint${infos !== 1 ? "s" : ""}`));

  console.log(`  ${bold("Found:")} ${parts.join(gray("  │  "))}`);

  // Score
  const score = Math.max(0, 100 - errors * 20 - warns * 8 - infos * 2);
  const scoreColor = score >= 80 ? green : score >= 50 ? yellow : red;
  const bar = renderScoreBar(score);
  console.log(`  ${bold("Score:")} ${scoreColor(score + "/100")}  ${bar}`);
  console.log();
}

function renderScoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? c.green : score >= 50 ? c.yellow : c.red;
  return (
    gray("[") +
    color + "█".repeat(filled) + c.reset +
    gray("░".repeat(empty)) +
    gray("]")
  );
}

function renderHeader(filename) {
  console.log();
  console.log(
    `  ${bold(cyan("vibe-lint"))} ${gray("v1.0.0")}  ${dim("─")}  ${gray(filename || "stdin")}`
  );
  console.log(`  ${gray("Flagging weak, vague, and counterproductive prompt instructions")}`);
}

// ─── JSON reporter ────────────────────────────────────────────────────────────

function toJson(findings, sourceText, file) {
  const errors = findings.filter((f) => f.rule.severity === "error").length;
  const warns = findings.filter((f) => f.rule.severity === "warn").length;
  const score = Math.max(0, 100 - errors * 20 - warns * 8);
  return JSON.stringify(
    {
      file: file || "stdin",
      score,
      summary: { errors, warnings: warns, hints: findings.filter((f) => f.rule.severity === "info").length },
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
    },
    null,
    2
  );
}

// ─── REPL Entry ───────────────────────────────────────────────────────────────

function listRules() {
  console.log(`\n  ${bold(cyan("vibe-lint rules"))}\n`);
  const byCategory = {};
  for (const r of RULES) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  for (const [cat, rules] of Object.entries(byCategory)) {
    console.log(`  ${bold(magenta(cat))}`);
    for (const r of rules) {
      console.log(`    ${gray(r.id)}  ${severityIcon(r.severity)}  ${r.message}`);
    }
    console.log();
  }
}

function printWelcome() {
  console.clear();
  console.log();
  console.log(`  ${bold(cyan("vibe-lint"))} ${gray("v1.0.0")}`);
  console.log(`  ${gray("Flags weak, vague, and contradictory prompt instructions")}`);
  console.log();
  console.log(`  ${dim("Paste your prompt below and press")} ${bold("Enter twice")} ${dim("to lint it.")}`);
  console.log(`  ${dim("Commands:")} ${cyan(":rules")} ${dim("list all rules")}  ${cyan(":clear")} ${dim("clear screen")}  ${cyan(":quit")} ${dim("or Ctrl+C to exit")}`);
  console.log(`  ${dim("─".repeat(58))}`);
  console.log();
}

async function runRepl() {
  printWelcome();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `  ${cyan("›")} `,
  });

  let buffer = [];

  const flush = () => {
    const source = buffer.join("\n").trim();
    buffer = [];

    if (!source) return;

    if (source === ":quit" || source === ":q") {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
    }
    if (source === ":rules") { listRules(); promptNext(); return; }
    if (source === ":clear") { printWelcome(); promptNext(); return; }

    const findings = analyzePrompt(source);
    console.log();
    console.log(`  ${dim("─".repeat(58))}`);
    renderFindings(findings, source);
    renderSummary(findings);
    promptNext();
  };

  const promptNext = () => {
    console.log(`  ${dim("─".repeat(58))}`);
    console.log(`  ${dim("Paste next prompt (Enter twice to lint) or")} ${cyan(":quit")}`);
    console.log();
    rl.prompt();
  };

  rl.prompt();

  rl.on("line", (line) => {
    if (line.trim() === "" && buffer.length > 0) {
      flush();
    } else {
      buffer.push(line);
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

runRepl().catch((e) => {
  console.error(red(`  ✖ ${e.message}`));
  process.exit(1);
});