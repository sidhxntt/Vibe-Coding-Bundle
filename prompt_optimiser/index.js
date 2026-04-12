#!/usr/bin/env node

import readline from "readline";

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
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
};

const bold    = (s) => `${c.bold}${s}${c.reset}`;
const dim     = (s) => `${c.dim}${s}${c.reset}`;
const red     = (s) => `${c.red}${s}${c.reset}`;
const yellow  = (s) => `${c.yellow}${s}${c.reset}`;
const green   = (s) => `${c.green}${s}${c.reset}`;
const cyan    = (s) => `${c.cyan}${s}${c.reset}`;
const magenta = (s) => `${c.magenta}${s}${c.reset}`;
const gray    = (s) => `${c.gray}${s}${c.reset}`;

// ─── Rules (same as vibe-lint) ────────────────────────────────────────────────
const RULES = [
  {
    id: "W001", severity: "warn", category: "vague-quality",
    pattern: /\b(make it better|improve (it|this|the code|the output))\b/gi,
    message: 'Vague improvement request — "better" is unmeasurable',
    suggestions: [
      "Specify the axis: 'reduce cyclomatic complexity below 10'",
      "Target a metric: 'cut response latency by 30%'",
      "Name the smell: 'eliminate magic numbers, extract named constants'",
    ],
  },
  {
    id: "W002", severity: "warn", category: "vague-quality",
    pattern: /\b(be (more )?(helpful|useful|good|better|clearer|concise))\b/gi,
    message: '"Be helpful/useful/good" gives the model no optimization target',
    suggestions: [
      "'Answer in ≤3 sentences unless the topic requires more depth'",
      "'If unsure, list 2 options with trade-offs rather than picking one'",
      "'Prefer code examples over prose explanations for how-to questions'",
    ],
  },
  {
    id: "W003", severity: "warn", category: "vague-quality",
    pattern: /\b(high[- ]quality|professional|polished|nice|clean)\b/gi,
    message: '"High-quality/professional" is subjective without a rubric',
    suggestions: [
      "For code: 'passes ESLint strict, has JSDoc on public functions, no TODOs'",
      "For prose: 'Flesch-Kincaid grade ≤ 10, active voice, no filler phrases'",
      "For UI: 'WCAG AA contrast, touch targets ≥ 44px, no layout shift'",
    ],
  },
  {
    id: "E001", severity: "error", category: "ambiguous-scope",
    pattern: /\b(do (the|your) (best|thing)|handle (it|this|everything))\b/gi,
    message: "Ambiguous delegation — model will hallucinate scope boundaries",
    suggestions: [
      "List exact subtasks: '1. Parse input 2. Validate schema 3. Return JSON'",
      "Set a ceiling: 'Only modify files in /src/components, leave tests untouched'",
      "Define done: 'Complete when all existing tests pass with no new warnings'",
    ],
  },
  {
    id: "E002", severity: "error", category: "ambiguous-scope",
    pattern: /\b(as needed|where (appropriate|necessary)|if (applicable|needed|relevant))\b/gi,
    message: "Conditional hedges let the model decide scope — it will decide wrong",
    suggestions: [
      "Replace with explicit conditions: 'Add error handling if the function throws'",
      "Use always/never: 'Always add type annotations. Never use `any`.'",
      "Enumerate the cases: 'Add comments above functions longer than 20 lines'",
    ],
  },
  {
    id: "W004", severity: "warn", category: "output-format",
    pattern: /\b(in (a |an )?(good|nice|clear|readable|proper) format)\b/gi,
    message: '"Good format" is ambiguous — specify the exact structure',
    suggestions: [
      "'Return a JSON object: { summary: string, tags: string[], confidence: 0-1 }'",
      "'Use markdown with H2 sections: Overview, Usage, Examples, Caveats'",
    ],
  },
  {
    id: "W005", severity: "warn", category: "output-format",
    pattern: /\b(respond (appropriately|accordingly|as you see fit))\b/gi,
    message: "Deferred format decision will produce inconsistent outputs",
    suggestions: [
      "Specify mime type: 'Respond with application/json'",
      "Give a template: 'Use this structure: [ANALYSIS]\\n[CODE]\\n[CAVEATS]'",
    ],
  },
  {
    id: "E003", severity: "error", category: "role-confusion",
    pattern: /\b(you (are|will be) an? (AI|assistant|language model|LLM|bot))\b/gi,
    message: "Restating model identity wastes tokens and adds no behavioral constraint",
    suggestions: [
      "Replace with a domain expert persona: 'You are a senior Rust compiler engineer'",
      "Or a constraint: 'You have access only to information in the provided context'",
    ],
  },
  {
    id: "W006", severity: "warn", category: "role-confusion",
    pattern: /\b(act (as|like) (a |an )?(helpful|smart|intelligent|knowledgeable) (AI|assistant))\b/gi,
    message: '"Act as a helpful assistant" adds noise, not signal',
    suggestions: [
      "'Act as a PostgreSQL performance consultant reviewing slow queries'",
      "'Act as a skeptical code reviewer who prioritizes security over brevity'",
    ],
  },
  {
    id: "E004", severity: "error", category: "contradiction",
    pattern: /\b(be (brief|concise|short)).{0,120}(be (comprehensive|thorough|detailed|exhaustive))\b/gis,
    message: "Contradictory length constraints — model will average them badly",
    suggestions: [
      "Pick one and qualify the other: 'Be concise. Expand only on error handling.'",
      "Use section-level rules: 'Summary: 1 sentence. Implementation: as long as needed.'",
    ],
  },
  {
    id: "W008", severity: "warn", category: "politeness-bloat",
    pattern: /\b(please (please )?(try to |attempt to |do your best to )?|kindly|feel free to|don't hesitate to)\b/gi,
    message: "Politeness tokens consume context budget and dilute instruction weight",
    suggestions: [
      "Drop courtesy words entirely — models don't have feelings",
      "Convert to imperative: 'Return X' not 'Please try to return X'",
    ],
  },
  {
    id: "W009", severity: "warn", category: "negation-only",
    pattern: /\b(don't (be|use|include|add|make|write|do|say)|avoid being|never (be|sound))\b/gi,
    message: "Negation-only rules are weak — models anchor on the forbidden concept",
    suggestions: [
      "Pair every DON'T with a DO: 'Don't use passive voice → use active constructions'",
      "Positive constraint: 'Use direct assertions' instead of 'Don't be wishy-washy'",
    ],
  },
  {
    id: "E005", severity: "error", category: "missing-context",
    pattern: /\b(the (code|file|document|data|text|above|previous|earlier))\b(?![\s\S]*?```)/gi,
    message: "Reference to context not present in the prompt — model will hallucinate",
    suggestions: [
      "Paste the actual code/data inline in a fenced block",
      "Use explicit variable names: define it earlier in the prompt",
    ],
  },
  {
    id: "W010", severity: "warn", category: "no-success-criteria",
    pattern: /\b(until (it('s| is) (good|right|working|correct|done))|when (you('re| are) happy|satisfied|done))\b/gi,
    message: "Subjective termination condition — model can't self-evaluate accurately",
    suggestions: [
      "Objective criterion: 'Stop when all 5 test cases produce correct output'",
      "Countable: 'Generate exactly 10 variants, ranked by estimated click-through'",
    ],
  },
  {
    id: "I001", severity: "info", category: "chain-of-thought",
    pattern: /\b(answer (this|the question|directly)|just (give|tell|show) (me|us) (the )?(answer|result|output))\b/gi,
    message: "Skipping reasoning may reduce accuracy on complex tasks",
    suggestions: [
      "Add: 'Think step by step before giving the final answer'",
      "Use scratchpad: 'Reason in <thinking> tags, then output in <answer> tags'",
    ],
  },
  {
    id: "W011", severity: "warn", category: "vague-persona",
    pattern: /\b(expert|specialist|professional|guru|master|wizard|ninja)\b(?! in| at| of| with)/gi,
    message: 'Bare "expert" persona lacks domain specificity',
    suggestions: [
      "'Expert' → 'Staff engineer with 10yr distributed systems experience'",
      "Add the skepticism level: 'Expert who defaults to the simplest solution'",
    ],
  },
];

function analyzePrompt(text) {
  const findings = [];
  for (const rule of RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const lineNum = text.slice(0, match.index).split("\n").length;
      const colNum  = match.index - text.lastIndexOf("\n", match.index - 1);
      findings.push({ rule, match: match[0], index: match.index, line: lineNum, col: colNum });
    }
  }
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.rule.id}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scorePrompt(findings) {
  const errors = findings.filter((f) => f.rule.severity === "error").length;
  const warns  = findings.filter((f) => f.rule.severity === "warn").length;
  const infos  = findings.filter((f) => f.rule.severity === "info").length;
  return Math.max(0, 100 - errors * 20 - warns * 8 - infos * 2);
}

function renderScoreBar(score) {
  const filled = Math.round(score / 5);
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
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${cyan(frames[i++ % frames.length])} ${dim(msg)}`);
  }, 80);
  return { stop: () => { clearInterval(timer); process.stdout.write("\r\x1b[2K"); } };
}

// ─── API call ─────────────────────────────────────────────────────────────────
async function optimizeWithClaude(prompt, findings) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set.\n  " +
      dim("Fix: ") + cyan("export ANTHROPIC_API_KEY=sk-ant-...") +
      "\n  Then restart the tool."
    );
  }

  const issueList = findings.map((f) =>
    `- [${f.rule.id}] ${f.rule.severity.toUpperCase()}: "${f.match}" — ${f.rule.message}\n  Suggestions: ${f.rule.suggestions.join(" | ")}`
  ).join("\n");

  const systemPrompt = `You are an expert prompt engineer. Your task is to rewrite user-provided LLM prompts to fix specific flagged issues and make them maximally effective.

You will receive:
1. The original prompt
2. A list of flagged issues with rule IDs and suggested fixes

Your job is to output ONLY the rewritten prompt — no preamble, no explanation, no markdown wrapper, no "Here is the optimized prompt:" lead-in. Just the raw rewritten prompt text.

Rules for rewriting:
- Fix every flagged issue using the suggestions as guidance
- Preserve the original intent and domain completely
- Replace vague language with concrete, measurable instructions
- Replace identity statements ("you are an AI") with domain expert personas
- Remove politeness bloat ("please", "feel free to", "kindly")
- Turn negation-only rules into positive constraints paired with the negation
- Replace ambiguous scope words ("as needed", "where appropriate") with explicit conditions
- If contradictory constraints exist, pick the most defensible interpretation and make it explicit
- Do not add new requirements the original didn't imply
- Preserve any technical specifics, code references, or domain terms verbatim`;

  const userMessage = `Original prompt:\n"""\n${prompt}\n"""\n\nFlagged issues to fix:\n${issueList}\n\nRewrite the prompt to fix all issues above.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${JSON.parse(err)?.error?.message || err}`);
  }

  const data = await response.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderIssuesSummary(findings) {
  const icons = { error: red("✖"), warn: yellow("⚠"), info: cyan("ℹ") };

  if (findings.length === 0) {
    console.log(`  ${green("✔")} ${bold("Prompt looks clean")} — nothing to optimize.\n`);
    return false;
  }

  console.log(`  ${bold("Issues detected:")}`);
  for (const f of findings) {
    console.log(`    ${icons[f.rule.severity]} ${gray(`[${f.rule.id}]`)} ${gray(`"${f.match}"`)}  ${dim(f.rule.message)}`);
  }

  const errors = findings.filter((f) => f.rule.severity === "error").length;
  const warns  = findings.filter((f) => f.rule.severity === "warn").length;
  const infos  = findings.filter((f) => f.rule.severity === "info").length;
  const parts  = [];
  if (errors) parts.push(red(`${errors} error${errors !== 1 ? "s" : ""}`));
  if (warns)  parts.push(yellow(`${warns} warning${warns !== 1 ? "s" : ""}`));
  if (infos)  parts.push(cyan(`${infos} hint${infos !== 1 ? "s" : ""}`));
  console.log(`\n  ${parts.join(gray("  │  "))}`);
  return true;
}

function renderDiff(original, optimized) {
  console.log(`\n  ${bold(red("─── before ─────────────────────────────────────────────"))}`);
  for (const line of original.split("\n")) {
    console.log(`  ${red("−")} ${dim(line)}`);
  }
  console.log(`\n  ${bold(green("─── after ──────────────────────────────────────────────"))}`);
  for (const line of optimized.split("\n")) {
    console.log(`  ${green("+")} ${line}`);
  }
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

// ─── REPL ─────────────────────────────────────────────────────────────────────
function printWelcome() {
  console.clear();
  console.log();
  console.log(`  ${bold(cyan("prompt-optimizer"))} ${gray("v1.0.0")}`);
  console.log(`  ${gray("Rewrites weak prompts using vibe-lint rules + Claude")}`);
  console.log();

  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (hasKey) {
    console.log(`  ${green("✔")} ${dim("ANTHROPIC_API_KEY detected")}`);
  } else {
    console.log(`  ${red("✖")} ${bold("ANTHROPIC_API_KEY not set")}  ${dim("→")}  ${cyan("export ANTHROPIC_API_KEY=sk-ant-...")}`);
  }

  console.log();
  console.log(`  ${dim("Paste your prompt and press")} ${bold("Enter twice")} ${dim("to optimize it.")}`);
  console.log(`  ${dim("Commands:")} ${cyan(":clear")} ${dim("clear screen")}  ${cyan(":quit")} ${dim("or Ctrl+C to exit")}`);
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

  const flush = async () => {
    const source = buffer.join("\n").trim();
    buffer = [];
    if (!source) return;

    if (source === ":quit" || source === ":q") {
      console.log(`\n  ${gray("bye.\n")}`);
      process.exit(0);
    }
    if (source === ":clear") { printWelcome(); promptNext(); return; }

    const findings    = analyzePrompt(source);
    const beforeScore = scorePrompt(findings);

    console.log();
    console.log(`  ${dim("─".repeat(58))}`);
    const hasIssues = renderIssuesSummary(findings);

    if (!hasIssues) {
      promptNext();
      return;
    }

    console.log();
    const spin = makeSpinner("Optimizing with Claude…");
    let optimized;
    try {
      optimized = await optimizeWithClaude(source, findings);
    } catch (err) {
      spin.stop();
      console.log(`  ${red("✖")} ${err.message}\n`);
      promptNext();
      return;
    }
    spin.stop();

    const newFindings = analyzePrompt(optimized);
    const afterScore  = scorePrompt(newFindings);

    renderDiff(source, optimized);
    renderScoreComparison(beforeScore, afterScore);

    const fixed  = findings.length - newFindings.length;
    const remain = newFindings.length;
    console.log(
      `\n  ${green("✔")} ${bold(green(`${fixed} issue${fixed !== 1 ? "s" : ""} fixed`))}` +
      (remain > 0
        ? `  ${dim("·")}  ${yellow(`${remain} remaining`)} ${dim("(needs manual context)")}`
        : `  ${dim("·")}  ${green("prompt is clean")}`)
    );

    console.log();
    promptNext();
  };

  const promptNext = () => {
    console.log(`  ${dim("─".repeat(58))}`);
    console.log(`  ${dim("Paste next prompt (Enter twice to optimize) or")} ${cyan(":quit")}`);
    console.log();
    rl.prompt();
  };

  rl.prompt();

  rl.on("line", (line) => {
    if (line.trim() === "" && buffer.length > 0) {
      rl.pause();
      flush().then(() => rl.resume()).catch((e) => {
        console.error(red(`  ✖ ${e.message}`));
        rl.resume();
      });
    } else {
      buffer.push(line);
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