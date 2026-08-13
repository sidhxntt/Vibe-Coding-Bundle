// @sidhxntt/prompt-rules — the single source of truth for the prompt lint rules
// shared by @sidhxntt/vibe-lint and @sidhxntt/prompt-optimizer.
//
// A rule is:
//   id          unique identifier ("E001" error, "W001" warn, "I001" info)
//   severity    "error" | "warn" | "info"
//   category    grouping used by `vibe-lint --rules`
//   pattern     global regex; every match becomes a finding
//   message     one-line explanation of the problem
//   suggestions concrete alternatives shown to the user / fed to Claude
//   docs        optional URL
//   appliesTo   optional (text) => boolean whole-document guard. When present the
//               rule is skipped entirely unless the guard returns true. This is
//               how E005 avoids the backtracking lookahead it used to carry.

export const RULES = [
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
    // Tightened: bare "clean"/"nice" fired on legitimate phrasing such as
    // "clean up the array" or "a nice round number". Only quality-descriptor
    // adjectives and the explicit "make it clean" construction count now.
    // "professional" lives here (quality rubric), NOT in W011 (persona), so a
    // single word can no longer be penalised twice.
    pattern:
      /\b(high[- ]quality|professional|polished|production[- ]ready)\b|\b(?:make|keep) (?:it|this|them|the code|the output) (?:nice|clean|pretty|neat|tidy)\b/gi,
    message: '"High-quality/professional" is subjective without a rubric',
    suggestions: [
      "For code: 'passes ESLint strict, has JSDoc on public functions, no TODOs'",
      "For prose: 'Flesch-Kincaid grade ≤ 10, active voice, no filler phrases'",
      "For UI: 'WCAG AA contrast, touch targets ≥ 44px, no layout shift'",
    ],
    docs: null,
  },

  // ── Ambiguous scope ────────────────────────────────────────────────────────
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
    pattern:
      /\b(as needed|where (appropriate|necessary)|if (applicable|needed|relevant))\b/gi,
    message: "Conditional hedges let the model decide scope — it will decide wrong",
    suggestions: [
      "Replace with explicit conditions: 'Add error handling if the function throws'",
      "Use always/never: 'Always add type annotations. Never use `any`.'",
      "Enumerate the cases: 'Add comments above functions longer than 20 lines'",
    ],
    docs: null,
  },

  // ── Output format ──────────────────────────────────────────────────────────
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

  // ── Role confusion ─────────────────────────────────────────────────────────
  {
    id: "E003",
    severity: "error",
    category: "role-confusion",
    pattern: /\b(you (are|will be) an? (AI|assistant|language model|LLM|bot))\b/gi,
    message:
      "Restating model identity wastes tokens and adds no behavioral constraint",
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
    pattern:
      /\b(act (as|like) (a |an )?(helpful|smart|intelligent|knowledgeable) (AI|assistant))\b/gi,
    message: '"Act as a helpful assistant" adds noise, not signal',
    suggestions: [
      "'Act as a PostgreSQL performance consultant reviewing slow queries'",
      "'Act as a skeptical code reviewer who prioritizes security over brevity'",
      "'Act as the user\\'s rubber duck — ask clarifying questions before answering'",
    ],
    docs: null,
  },

  // ── Examples ───────────────────────────────────────────────────────────────
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

  // ── Contradiction ──────────────────────────────────────────────────────────
  {
    id: "E004",
    severity: "error",
    category: "contradiction",
    pattern:
      /\b(be (brief|concise|short)).{0,120}(be (comprehensive|thorough|detailed|exhaustive))\b/gis,
    message: "Contradictory length constraints — model will average them badly",
    suggestions: [
      "Pick one and qualify the other: 'Be concise. Expand only on error handling.'",
      "Use section-level rules: 'Summary: 1 sentence. Implementation: as long as needed.'",
      "Set word counts: 'Under 150 words total, but include all code in full'",
    ],
    docs: null,
  },

  // ── Politeness bloat ───────────────────────────────────────────────────────
  {
    id: "W008",
    severity: "warn",
    category: "politeness-bloat",
    // Tightened: a bare "please" is not on its own an antipattern, and matching
    // it produced a finding on almost every real-world prompt. Only the
    // softening constructions (which genuinely weaken an instruction) count.
    pattern:
      /\b(please (?:please )?(?:try to|attempt to|do your best to)|kindly|feel free to|don't hesitate to|if you (?:could|would|wouldn't mind))\b/gi,
    message:
      "Politeness tokens consume context budget and dilute instruction weight",
    suggestions: [
      "Drop courtesy words entirely — models don't have feelings",
      "Convert to imperative: 'Return X' not 'Please try to return X'",
      "Every token should carry constraint or context",
    ],
    docs: null,
  },

  // ── Negation only ──────────────────────────────────────────────────────────
  {
    id: "W009",
    severity: "warn",
    category: "negation-only",
    pattern:
      /\b(don't (be|use|include|add|make|write|do|say)|avoid being|never (be|sound))\b/gi,
    message: "Negation-only rules are weak — models anchor on the forbidden concept",
    suggestions: [
      "Pair every DON'T with a DO: 'Don't use passive voice → use active constructions'",
      "Positive constraint: 'Use direct assertions' instead of 'Don't be wishy-washy'",
      "Show an example of what you WANT instead",
    ],
    docs: null,
  },

  // ── Missing context ────────────────────────────────────────────────────────
  {
    id: "E005",
    severity: "error",
    category: "missing-context",
    // The old pattern was `...\b(?![\s\S]*?```)`. A negative lookahead wrapping a
    // lazy quantifier still backtracks across every length, so it effectively
    // asserted "no code fence anywhere after this point" — every mention AFTER a
    // fenced block errored at -20 each. The fence check is a property of the
    // whole document, so it belongs in a document-level guard, not the regex.
    pattern: /\b(the (code|file|document|data|text|above|previous|earlier))\b/gi,
    appliesTo: (text) => !text.includes("```"),
    message: "Reference to context not present in the prompt — model will hallucinate",
    suggestions: [
      "Paste the actual code/data inline in a fenced block",
      "Use explicit variable names: define it earlier in the prompt",
      "If using a system with retrieval, confirm the context is injected at runtime",
    ],
    docs: null,
  },

  // ── Success criteria ───────────────────────────────────────────────────────
  {
    id: "W010",
    severity: "warn",
    category: "no-success-criteria",
    pattern:
      /\b(until (it('s| is) (good|right|working|correct|done))|when (you('re| are) happy|satisfied|done))\b/gi,
    message: "Subjective termination condition — model can't self-evaluate accurately",
    suggestions: [
      "Objective criterion: 'Stop when all 5 test cases produce correct output'",
      "Countable: 'Generate exactly 10 variants, ranked by estimated click-through'",
      "Verifiable: 'Complete when the function has <5 lines and passes mypy strict'",
    ],
    docs: null,
  },

  // ── Chain of thought ───────────────────────────────────────────────────────
  {
    id: "I001",
    severity: "info",
    category: "chain-of-thought",
    pattern:
      /\b(answer (this|the question|directly)|just (give|tell|show) (me|us) (the )?(answer|result|output))\b/gi,
    message: "Skipping reasoning may reduce accuracy on complex tasks",
    suggestions: [
      "Add: 'Think step by step before giving the final answer'",
      "Use scratchpad: 'Reason in <thinking> tags, then output in <answer> tags'",
      "If speed matters, note it explicitly: 'Skip reasoning, latency is critical'",
    ],
    docs: null,
  },

  // ── Vague persona ──────────────────────────────────────────────────────────
  {
    id: "W011",
    severity: "warn",
    category: "vague-persona",
    // "professional" moved to W003 — it was previously matched by both rules,
    // costing -16 for one word. "master" dropped entirely: "the master branch"
    // and "the master file" made it the noisiest token in the set.
    // An article is now required so this only fires on actual persona phrasing.
    pattern:
      /\b(?:a|an|the)\s+(expert|specialist|guru|wizard|ninja)\b(?!\s+(?:in|at|of|with|on)\b)/gi,
    message: 'Bare "expert" persona lacks domain specificity',
    suggestions: [
      "'Expert' → 'Staff engineer with 10yr distributed systems experience'",
      "Add the skepticism level: 'Expert who defaults to the simplest solution'",
      "Scope the knowledge: 'Expert in Python async, unfamiliar with Rust'",
    ],
    docs: null,
  },
];

// ─── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Run every rule over `text` and return one finding per (rule, line).
 * @param {string} text
 * @returns {Array<{rule: object, match: string, index: number, line: number, col: number}>}
 */
export function analyzePrompt(text) {
  const source = String(text ?? "");
  const findings = [];

  for (const rule of RULES) {
    if (typeof rule.appliesTo === "function" && !rule.appliesTo(source)) continue;

    // Fresh regex per run: the shared literals carry /g and therefore lastIndex.
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(source)) !== null) {
      if (match[0] === "") {
        regex.lastIndex++;
        continue;
      }
      const line = source.slice(0, match.index).split("\n").length;
      const col = match.index - source.lastIndexOf("\n", match.index - 1);
      findings.push({ rule, match: match[0], index: match.index, line, col });
    }
  }

  // One finding per rule per line.
  const seen = new Set();
  const deduped = findings.filter((f) => {
    const key = `${f.rule.id}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.index - b.index);
  return deduped;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export const SEVERITY_WEIGHT = { error: 20, warn: 8, info: 2 };

/** At most this many findings of the same rule contribute to the penalty. */
export const MAX_FINDINGS_PER_RULE = 2;

/** Prompts at or under this word count are scored with the full penalty. */
export const BASELINE_WORDS = 60;

export function countWords(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function summarize(findings) {
  return {
    errors: findings.filter((f) => f.rule.severity === "error").length,
    warnings: findings.filter((f) => f.rule.severity === "warn").length,
    hints: findings.filter((f) => f.rule.severity === "info").length,
  };
}

/**
 * The one and only score formula. Both vibe-lint's summary and its --json
 * report call this, and prompt-optimizer uses it for its before/after diff.
 *
 * 100 minus a severity-weighted penalty, with two corrections:
 *  1. Per-rule cap — one rule cannot sink a prompt on its own.
 *  2. Length normalization — a 400-word prompt naturally trips more patterns
 *     than a 40-word one, so the penalty is scaled by sqrt(60 / words) beyond
 *     the 60-word baseline. Without this a long, careful prompt scored worse
 *     than a short, mediocre one.
 */
export function scorePrompt(findings, text = "") {
  const perRule = new Map();
  let penalty = 0;

  for (const f of findings) {
    const seen = perRule.get(f.rule.id) ?? 0;
    if (seen >= MAX_FINDINGS_PER_RULE) continue;
    perRule.set(f.rule.id, seen + 1);
    penalty += SEVERITY_WEIGHT[f.rule.severity] ?? 0;
  }

  const words = countWords(text);
  const lengthFactor =
    words > BASELINE_WORDS ? Math.sqrt(BASELINE_WORDS / words) : 1;

  const score = 100 - penalty * lengthFactor;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export default { RULES, analyzePrompt, scorePrompt, summarize, countWords };
