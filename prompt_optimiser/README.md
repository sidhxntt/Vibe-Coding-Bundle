# prompt-optimizer

Rewrites weak prompts into tight, effective ones using the vibe-lint rules + Claude.

![Node.js](https://img.shields.io/badge/node.js->=18-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **16 → 17 rules, shared, not copied** — the rule engine is
  [`@sidhxntt/prompt-rules`](../prompt_rules), the same module `vibe-lint` uses.
  There is exactly one copy of the patterns now.
- **File, pipe, and interactive modes** — arguments, stdin, or a REPL
- **`--force`** — optimize even when no rule fires, because a weak prompt that
  trips no regex still deserves help
- **Honest result reporting** — the tool names the rule IDs it resolved, the ones
  still present, and the ones the rewrite *introduced*, instead of printing a
  count delta that could go negative
- **Bounded retry, hard timeout, low temperature** — reproducible and resilient

## Prerequisites

- Node.js 18 or newer. The tool uses the global `fetch` and `AbortSignal`; there
  is no polyfill, so 18 is a hard floor.
- An Anthropic API key.

## Installation

```bash
npm install -g @sidhxntt/prompt-optimizer
```

Or with npx:

```bash
npx @sidhxntt/prompt-optimizer
```

> The unscoped names `prompt-optimizer` / `npx prompt-optimizer` belong to a
> different registry namespace. Always use the `@sidhxntt/` scope.

## Configuration

```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required. |
| `VIBE_NO_API_NOTICE` | Silences the first-run "your prompt is sent to the API" notice. |
| `NO_COLOR` | Disables colour (also disabled automatically when stdout is not a TTY). |

### Your prompt leaves your machine

The full prompt text is sent verbatim to the Anthropic API. Nothing is redacted.
The tool prints a one-time notice before its first request in a session — do not
paste API keys, credentials, or customer data into it.

## Usage

```
  USAGE
    prompt-optimizer [options] [file ...]
    cat prompt.txt | prompt-optimizer [options]
    prompt-optimizer                    (no files, TTY stdin → interactive REPL)

  OPTIONS
    -h, --help            Show this help and exit
    -v, --version         Print the version and exit
        --model <id>      Claude model to use (default: claude-sonnet-5)
        --force           Optimize even when no rule fires
        --timeout <ms>    Per-attempt request timeout (default: 60000)
        --retries <n>     Retries after a timeout / 429 / 5xx (default: 2)
        --json            Emit a JSON report instead of the coloured diff
        --                Treat all remaining arguments as file paths

  EXIT CODES
    0  every input was optimized (or skipped as clean)
    1  at least one optimization failed
    2  usage error or unreadable file
```

### Determinism

Requests are sent with `temperature: 0.2`. The 1.0.0 release sent no temperature
at all, so it inherited the API default of 1.0 and produced a different rewrite
every run. A low temperature makes rewrites near-deterministic; the API still
makes no exact-reproducibility guarantee.

### Model

The default is `claude-sonnet-5`. Override per run with `--model`, e.g.
`--model claude-opus-5`.

### Reliability

Each attempt carries a hard `AbortSignal` timeout. Timeouts, connection errors,
`408`/`409`/`429` and `5xx` responses are retried up to `--retries` times with
exponential backoff and jitter; `4xx` responses other than those are surfaced
immediately. A non-JSON error body (a proxy's HTML 503 page, an empty gateway
response) is reported as-is rather than being replaced by a JSON parse error.

## What it reports

`prompt-optimizer` lints the prompt, sends it plus the findings to Claude, then
lints the rewrite and compares the two by **rule ID**:

```
  ✔ resolved (3): E001, E002, W008
  · still present (1): E005 (needs manual context)
  ✖ introduced (1): W003 (the rewrite is worse here)
```

If nothing was resolved it says so in yellow. A rewrite that trips more rules
than the original is reported as such — never as a green negative count.

## Severity levels

- **Error** — high-confidence problems (ambiguous scope, missing context,
  contradictions, restated model identity)
- **Warn** — style problems and improvement suggestions
- **Info** — general recommendations

All three severities are fed to Claude identically. **Errors do not block
optimization** — they only weigh more heavily in the score.

## Scoring

Both the before and after scores come from `scorePrompt` in
`@sidhxntt/prompt-rules`: 100 minus 20/error, 8/warning, 2/hint, capped at two
findings per rule and normalized by prompt length past a 60-word baseline. See
the [vibe-lint README](../vibe_linter/README.md#scoring).

## Rule categories

| Category | Severity | Examples |
|---|---|---|
| `ambiguous-scope` | error | `"do your best"`, `"handle it"`, `"as needed"` |
| `role-confusion` | error / warn | `"you are an AI assistant"` |
| `missing-context` | error | `"the code"`, `"the file"` with no fenced block anywhere |
| `contradiction` | error | `"be brief … be comprehensive"` |
| `vague-quality` | warn | `"make it better"`, `"high-quality"` |
| `output-format` | warn | `"in a good format"`, `"respond appropriately"` |
| `politeness-bloat` | warn | `"please try to"`, `"feel free to"` |
| `negation-only` | warn | `"don't be vague"` with no paired DO |
| `no-examples` | warn | a trailing `"such as:"` |
| `no-success-criteria` | warn | `"until it's good"` |
| `vague-persona` | warn | `"act as an expert"` |
| `chain-of-thought` | info | `"just give me the answer"` |

`vibe-lint --rules` prints the live list of all 17.

## Project structure

```
prompt_optimiser/
├── LICENSE.txt
├── README.md
├── index.js               # CLI, Claude call, diff/score rendering
├── package.json
└── test/
    └── optimizer.test.js  # node:test coverage (stubbed fetch — no API spend)
```

The rules live in [`../prompt_rules`](../prompt_rules).

## Tests

```bash
npm test          # from prompt_optimiser/
```

Every test stubs `fetch`; the suite never touches the network and never needs an
API key.

## Adding a rule

Rules live in `prompt_rules/index.js`. Add the rule object plus a
positive/negative pair in `prompt_rules/test/rules.test.js`.

## License

MIT — see LICENSE.txt.
