# vibe-lint

A linter for your prompts — flags weak, vague, and contradictory instructions.

![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![Node.js](https://img.shields.io/badge/node.js->=18-brightgreen.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- **17 lint rules** covering common prompt engineering pitfalls, shared with
  `@sidhxntt/prompt-optimizer` via the [`@sidhxntt/prompt-rules`](../prompt_rules) package
- **Severity levels** — errors for critical issues, warnings for style problems, info for hints
- **Exit codes that gate CI** — non-zero when any error-severity rule fires
- **File, pipe, and interactive modes** — arguments, stdin, or a REPL
- **`--json` reporter** for scripting
- **Colored terminal output** that turns itself off for pipes and `NO_COLOR`

## Prerequisites

- Node.js 18 or newer (ES modules, `AbortSignal`, top-level `fetch` across the bundle)

## Installation

```bash
npm install -g @sidhxntt/vibe-lint
```

Or from a clone:

```bash
git clone https://github.com/sidhxntt/Vibe-Coding-Bundle.git
cd Vibe-Coding-Bundle
npm install          # workspace install; links @sidhxntt/prompt-rules
node vibe_linter/src/index.js --help
```

## Usage

```
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
```

### File mode

```bash
vibe-lint my-prompt.txt
vibe-lint prompt1.txt prompt2.txt      # every file is linted; one failure fails the run
```

### Pipe mode

```bash
echo "You are a helpful AI assistant. Please be helpful." | vibe-lint
```

Piped output is plain text: no colour, no clear-screen, no prompt characters.

### Interactive mode

Running `vibe-lint` with no arguments on a terminal starts a REPL. Paste a
prompt, press Enter twice to lint it. `:rules`, `:clear`, `:quit`.

### Gating CI

```bash
vibe-lint --max-warnings 0 system-prompt.txt   # fails on any finding at all
vibe-lint --quiet prompts/*.txt                # errors only, still exits 1 on error
```

## Example output

Real output from `node vibe_linter/src/index.js --no-suggestions --quiet vibe_linter/bad-prompt.txt`
(colour stripped, exit code 1):

```
  vibe-lint v1.0.0  ─  vibe_linter/bad-prompt.txt
  Flagging weak, vague, and counterproductive prompt instructions

  ✖ error [E005] Reference to context not present in the prompt — model will hallucinate
    1:75  "the code"
    │ You are a helpful AI assistant. Please try to be more helpful and improve the code as needed. …

  ✖ error [E002] Conditional hedges let the model decide scope — it will decide wrong
    1:84  "as needed"
    │ You are a helpful AI assistant. Please try to be more helpful and improve the code as needed. …

  ✖ error [E001] Ambiguous delegation — model will hallucinate scope boundaries
    1:172  "do your best"
    │ You are a helpful AI assistant. Please try to be more helpful and improve the code as needed. …

  ──────────────────────────────────────────────────────────
  Found: 3 errors  │  7 warnings
  Score: 0/100  [░░░░░░░░░░░░░░░░░░░░]
```

### JSON output

`vibe-lint --json vibe_linter/bad-prompt.txt | jq '{score, summary}'`:

```json
{
  "score": 0,
  "summary": { "errors": 3, "warnings": 7, "hints": 0 }
}
```

A single file emits one object; several files emit an array of objects. Each
finding carries `id`, `severity`, `category`, `message`, `match`, `line`, `col`,
and `suggestions`.

## Scoring

`score = 100 − penalty`, where the penalty sums 20 per error, 8 per warning,
2 per hint, with two corrections:

1. **Per-rule cap** — at most 2 findings of the same rule contribute, so one
   noisy rule cannot sink a prompt on its own.
2. **Length normalization** — beyond a 60-word baseline the penalty is scaled by
   `sqrt(60 / words)`. Without this a long, careful prompt scored worse than a
   short, mediocre one purely because it had more text to match against.

The console summary and the `--json` report call the *same* function
(`scorePrompt` in `@sidhxntt/prompt-rules`), so the two can never disagree.

## Rule categories

| Category | Description | Example issues |
|----------|-------------|----------------|
| `vague-quality` | Unmeasurable quality descriptors | "make it better", "be helpful", "high-quality" |
| `ambiguous-scope` | Unclear task boundaries | "handle it", "as needed", "where appropriate" |
| `output-format` | Unspecified response format | "in a good format", "respond appropriately" |
| `role-confusion` | Redundant AI identity statements | "you are an AI assistant" |
| `no-examples` | Trailing example placeholders | "such as:" at end of line |
| `contradiction` | Conflicting instructions | "be brief … be comprehensive" |
| `politeness-bloat` | Softening constructions | "please try to", "feel free to" |
| `negation-only` | Prohibitions with no paired DO | "don't be vague" |
| `missing-context` | References to context that is not in the prompt | "the code", "the file" |
| `no-success-criteria` | Subjective termination conditions | "until it's good" |
| `chain-of-thought` | Reasoning suppressed on hard tasks | "just give me the answer" |
| `vague-persona` | Personas with no domain | "act as an expert" |

`vibe-lint --rules` prints the live list.

### E005 and fenced code blocks

`missing-context` (E005) only fires when the prompt contains **no** fenced code
block anywhere. If you paste your context in a ```` ``` ```` fence, mentions of
"the code" / "the file" are not flagged.

## Project structure

```
vibe_linter/
├── bad-prompt.txt          # fixture: a poorly-written prompt (read by the tests)
├── good-prompt.txt         # fixture: a well-structured prompt (read by the tests)
├── package.json
├── src/
│   └── index.js            # CLI, renderers, JSON reporter
└── test/
    └── cli.test.js         # node:test coverage for argv, exit codes, JSON, piping
```

The rules themselves live in [`../prompt_rules`](../prompt_rules) so that
`vibe-lint` and `prompt-optimizer` cannot drift apart.

## Tests

```bash
npm test          # from vibe_linter/
npm test          # from the repo root, runs every workspace
```

## Adding a rule

Rules live in `prompt_rules/index.js`, not here. Add the rule object and a
positive/negative pair in `prompt_rules/test/rules.test.js` — the suite fails if
any rule lacks coverage.

```javascript
{
  id: "W012",
  severity: "warn",
  category: "vague-quality",
  pattern: /\b(make it pop)\b/gi,
  message: "…",
  suggestions: ["…"],
  docs: null,
  // optional whole-document guard
  appliesTo: (text) => !text.includes("```"),
}
```

## License

MIT — see LICENSE.txt.
