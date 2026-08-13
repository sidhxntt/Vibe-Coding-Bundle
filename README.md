# Vibe Coding Bundle

A collection of AI prompt engineering tools that lint, optimize, and compress prompts for better LLM interactions.

![Node.js](https://img.shields.io/badge/node.js->=18-brightgreen.svg)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> Each tool keeps its own README under `src/<alias>/` — `src/lint`, `src/opt`, `src/squash`, `src/rules`.

## Features

- **🔍 vibe-lint** — Flags weak, vague, and contradictory prompt instructions with 17 lint rules
- **🎯 prompt-optimizer** — Rewrites weak prompts into tight, effective ones using the Claude API
- **🗜️ token-squasher** — Compresses verbose system prompts into dense, token-efficient instructions
- **📦 prompt-rules** — The shared rule engine both linting tools import, bundled as a library rather than a command
- **Three input modes everywhere** — file arguments, piped stdin, or an interactive REPL
- **CI-friendly** — `vibe-lint` exits non-zero on error-severity findings and speaks `--json`

## Prerequisites

- Node.js 18 or higher (ES modules, global `fetch`, `AbortSignal`)
- An Anthropic API key (for prompt-optimizer and token-squasher)

## Installation

### One command

```bash
npm install -g vibe-coding-bundle
vibe
```

`vibe` opens a menu. Name a tool instead and its arguments pass straight
through, so the launcher never stands between you and the work:

```bash
vibe lint my-prompt.txt          # lint
vibe opt my-prompt.txt           # rewrite with Claude
vibe squash system-prompt.txt    # compress
```

| Alias | Tool | What it does |
| --- | --- | --- |
| `lint` | vibe-lint | flags weak, vague and contradictory prompt instructions |
| `opt` | prompt-optimizer | rewrites a weak prompt with Claude, and scores the result |
| `squash` | token-squasher | compresses a verbose system prompt, keeps every rule |

`vibe-coding-bundle` is the same command, if you prefer the long name.
`--no-splash` skips the opening animation.

The three tools are not published separately and are not on your PATH: they ship
inside this package and the launcher starts them. One command to install, one to
remember.

### Or clone and run locally

```bash
git clone https://github.com/sidhxntt/Vibe-Coding-Bundle.git
cd Vibe-Coding-Bundle
npm install
npm run build      # compiles the launcher and copies the tools into dist/
npm test           # runs every tool's suite
npm run dev        # the launcher straight from src/, via ts-node
```

## Configuration

```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required by prompt-optimizer and token-squasher. |
| `VIBE_NO_API_NOTICE` | Silences the first-run "your prompt is sent to the API" notice. |
| `NO_COLOR` | Disables colour (also disabled automatically when stdout is not a TTY). |

### Your prompt leaves your machine

vibe opt and token-squasher send the full prompt text verbatim to the
Anthropic API. Nothing is redacted. Both print a one-time notice before their
first request — do not paste API keys, credentials, or customer data.

## Usage

Every tool accepts the same three input modes:

```bash
vibe <tool> file.txt file2.txt   # file arguments, processed non-interactively
cat file.txt | vibe <tool>       # piped stdin
vibe <tool>                      # no args on a TTY → interactive REPL
```

### vibe-lint

```bash
vibe lint my-prompt.txt
vibe lint --json prompts/*.txt | jq '.[].score'
vibe lint --max-warnings 0 system-prompt.txt      # strict CI gate
echo "You are a helpful AI assistant." | vibe lint
```

Real output from `vibe lint --no-suggestions --quiet src/lint/bad-prompt.txt`
(exit code 1):

```
  vibe lint v2.0.1  ─  src/lint/bad-prompt.txt
  Flagging weak, vague, and counterproductive prompt instructions

  ✖ error [E005] Reference to context not present in the prompt — model will hallucinate
    1:75  "the code"
  ✖ error [E002] Conditional hedges let the model decide scope — it will decide wrong
    1:84  "as needed"
  ✖ error [E001] Ambiguous delegation — model will hallucinate scope boundaries
    1:172  "do your best"

  ──────────────────────────────────────────────────────────
  Found: 3 errors  │  7 warnings
  Score: 0/100  [░░░░░░░░░░░░░░░░░░░░]
```

**Exit codes:** `0` clean · `1` errors present or `--max-warnings` exceeded ·
`2` usage error or unreadable file.

### prompt-optimizer

```bash
vibe opt my-prompt.txt
vibe opt --force --model claude-opus-5 my-prompt.txt
```

1. Analyzes the prompt with the shared rules
2. Shows the findings with severity levels
3. Sends prompt + findings to Claude (`temperature 0.2`, bounded retry, hard timeout)
4. Re-lints the rewrite and reports which rule IDs were **resolved**, which are
   **still present**, and which the rewrite **introduced**

`--force` optimizes even when no rule fires, so a genuinely weak prompt that
trips no regex still gets help.

### token-squasher

```bash
vibe squash system-prompt.txt
vibe squash --verbose --model claude-opus-5 system-prompt.txt
```

Token statistics are on by default and come from the Anthropic `count_tokens`
endpoint, with the compression request's own billed usage reported separately
from `resp.usage`.

**Compression is not verified** — nothing checks that the model actually
preserved every rule. Diff the two prompts before shipping.

Commands: `:stats` · `:verbose` · `:clear` · `:quit`

## Rule categories

| Category | Description | Examples |
|----------|-------------|----------|
| **vague-quality** | Unmeasurable descriptors | "make it better", "high-quality" |
| **ambiguous-scope** | Unclear task boundaries | "handle it", "as needed" |
| **output-format** | Unspecified response format | "good format", "respond appropriately" |
| **role-confusion** | Redundant AI identity statements | "you are an AI assistant" |
| **no-examples** | Trailing example placeholders | "such as:" at end of line |
| **contradiction** | Conflicting instructions | "be brief … be comprehensive" |
| **politeness-bloat** | Softening constructions | "please try to", "feel free to" |
| **negation-only** | Prohibitions with no paired DO | "don't be vague" |
| **missing-context** | References to absent context | "the code", "the file" |
| **no-success-criteria** | Subjective stop conditions | "until it's good" |
| **chain-of-thought** | Reasoning suppressed | "just give me the answer" |
| **vague-persona** | Personas with no domain | "act as an expert" |

`vibe lint --rules` prints the live list.

## Project structure

```
Vibe-Coding-Bundle/
├── package.json               # the launcher package: one bin, merged deps
├── tsconfig.json              # compiles src/*.ts only — the tools ship as-is
├── src/
│   ├── index.ts               # launcher: menu, dispatch, argv passthrough
│   ├── tools.ts               # alias → entry point registry
│   ├── splash.ts              # the opening animation
│   ├── rules/                 # @sidhxntt/prompt-rules — the shared rule engine
│   │   ├── index.js           # RULES, analyzePrompt, scorePrompt
│   │   └── test/rules.test.js
│   ├── lint/                  # @sidhxntt/vibe-lint
│   │   ├── index.js           # CLI, renderers, JSON reporter
│   │   ├── good-prompt.txt    # fixture read by the tests
│   │   ├── bad-prompt.txt     # fixture read by the tests
│   │   └── test/cli.test.js
│   ├── opt/                   # @sidhxntt/prompt-optimizer
│   │   ├── index.js           # CLI + Claude API integration
│   │   └── test/optimizer.test.js
│   └── squash/                # @sidhxntt/token-squasher
│       ├── index.js           # CLI + REPL + token statistics
│       └── test/squasher.test.js
└── docs/                      # the GitHub Pages site
```

The three CLIs are unchanged standalone programs. The launcher starts each one
as a child process with inherited stdio, so a tool owns the terminal — and its
own REPL — exactly as it does when installed on its own. Each keeps its own
`package.json`, which is where it reads its version from, and `type: module`
there is what keeps the tools ESM inside a CommonJS launcher.

## Adding custom rules

Rules live in `src/rules/index.js` and are imported by both linting tools —
there is no second copy to keep in sync.

```javascript
{
  id: "W012",                          // unique identifier
  severity: "warn",                    // "error" | "warn" | "info"
  category: "vague-quality",           // rule category
  pattern: /\b(make it pop)\b/gi,      // global regex
  message: "Brief explanation",        // problem description
  suggestions: [                       // specific alternatives
    "Specify the axis: 'reduce complexity'",
    "Target a metric: 'cut latency by 30%'",
  ],
  docs: null,                          // optional documentation link
  appliesTo: (text) => true,           // optional whole-document guard
}
```

Add a matching entry to `CASES` in `src/rules/test/rules.test.js`; the suite
fails if a rule ships without a known-positive **and** a known-negative.

### Severity levels

- **Error** — high-confidence problems (ambiguous scope, missing context,
  contradictions). They make `vibe-lint` exit non-zero.
- **Warn** — style problems and improvement suggestions. They affect the score
  and `--max-warnings`, not the default exit code.
- **Info** — general recommendations.

Severity does **not** gate prompt-optimizer: all three are fed to Claude
identically. Errors only weigh more heavily in the score.

## Examples

### Before (bad prompt)

```
You are a helpful AI assistant. Please try to be more helpful and improve
the code as needed. Make it better and more professional. Feel free to handle
the above code and do your best.
```

### After (the shape an optimized prompt should take)

```
You are a senior TypeScript engineer. Review this code for:
1. ESLint strict compliance
2. Functions >20 lines need JSDoc comments
3. Cyclomatic complexity <10
4. No magic numbers

Return: markdown with ## Issues and ## Fixed Code sections.
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Add rules to `src/rules/index.js`, following the existing pattern
4. Add a positive and a negative test case in `src/rules/test/rules.test.js`
5. Run the suites: `npm test` from the repo root
6. Verify the fixtures still behave:
   `node src/lint/index.js src/lint/good-prompt.txt` (exit 0) and
   `node src/lint/index.js src/lint/bad-prompt.txt` (exit 1)
7. Submit a pull request

### Testing your changes

```bash
npm test                                   # every tool's suite
node --test src/lint/test/*.test.js        # one tool

node src/lint/index.js src/lint/bad-prompt.txt
node src/opt/index.js --help
node src/squash/index.js --help

npm run build && node dist/index.js lint src/lint/bad-prompt.txt
```

## Publishing

There is one package. `npm publish` builds first via `prepublishOnly` and ships
`dist/` alone — the launcher plus each tool's entry point and manifest, which the
tools read their own versions from.

The rule engine is vendored at `src/rules/`, so there is no release order to
observe. An older `@sidhxntt/prompt-rules` exists on the registry from before the
bundle; it is not a dependency of this package and nothing here installs it.

## License

MIT License — see LICENSE.txt at the root and in each tool directory under `src/`.
