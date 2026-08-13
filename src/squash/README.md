# token-squasher

Compress verbose system prompts into dense, token-efficient instructions.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@sidhxntt/token-squasher.svg)](https://www.npmjs.com/package/@sidhxntt/token-squasher)

## Features

- **Real token counts** — before/after numbers come from the Anthropic
  `count_tokens` endpoint, so they are actual tokens for the selected model, not
  a `chars / 4` guess. The compression request's own billed usage is reported
  separately from `resp.usage`.
- **Interactive REPL** with multi-line input and commands
- **Statistics on by default**
- **File and pipe modes** — arguments or stdin, not just the REPL
- **Colored output** that turns itself off for pipes and `NO_COLOR`
- **Reasoning display** — what was compressed and how (`--verbose` / `:verbose`)

### What it does not do

**Compression is not verified.** The system prompt asks the model to preserve
every rule, constraint, and edge case, but nothing in this tool checks that it
did. There is no round-trip test, no semantic diff, no assertion. Read the
`before`/`after` pair yourself before shipping a squashed prompt. The tool
prints this warning after every compression.

## Prerequisites

- Node.js >= 18.0.0
- An Anthropic API key

## Installation

```bash
npm install -g @sidhxntt/token-squasher
```

Or with npx:

```bash
npx @sidhxntt/token-squasher
```

## Configuration

```bash
export ANTHROPIC_API_KEY=sk-ant-your-api-key-here
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
    token-squasher [options] [file ...]
    cat system-prompt.txt | token-squasher [options]
    token-squasher                     (no files, TTY stdin → interactive REPL)

  OPTIONS
    -h, --help          Show this help and exit
    -v, --version       Print the version and exit
        --model <id>    Claude model to use (default: claude-sonnet-5)
        --no-stats      Hide the token statistics block (shown by default)
        --verbose       Show the model's compression reasoning
        --              Treat all remaining arguments as file paths

  EXIT CODES
    0  every input was compressed
    1  at least one compression failed
    2  usage error or unreadable file
```

### REPL commands

- `:stats` — toggle the token statistics block (on by default)
- `:verbose` — toggle the compression reasoning
- `:clear` — clear the screen
- `:quit` / `:q` — exit

## Token counting

| Number | Source |
|---|---|
| `Before` | `POST /v1/messages/count_tokens` on the original prompt |
| `After` | `POST /v1/messages/count_tokens` on the squashed prompt |
| `API call` | `resp.usage.input_tokens` / `resp.usage.output_tokens` from the compression request |

Both `Before` and `After` are measured the same way (each string sent as a
single user message), so the ratio between them is apples-to-apples; both
include the same few tokens of message framing. If the `count_tokens` call
fails, the numbers fall back to a `chars / 4` estimate and are labelled
`(estimated)`.

The `API call` line is what the compression itself cost you — it covers the
system prompt, the wrapper, and the model's reasoning block, so it is
deliberately *not* the same number as `Before`.

Version 1.0.0 estimated every number as `Math.ceil(text.length / 4)`. That is a
character count, and it is biased in the compressor's favour: this tool's own
system prompt asks for dense symbolic output (`→`, `w/`, `&`), and symbol-heavy
text tokenizes worse per character than plain prose.

## Example statistics block

The exact format the tool prints. The token counts below come from a stubbed
client used in the test suite (`token_quasher/test/squasher.test.js`) rather
than a live call, so no invented numbers are involved — on a real run the same
fields are filled from `count_tokens` and `resp.usage`:

```
  ───── TOKEN STATS ─────
  Before   43 tokens  (215 chars)
  After    15 tokens  (67 chars)
  Crushed  65.1% ████████████████░░░░░░░░
  API call 311 in / 88 out (billed)
  ───────────────────────
```

When the "compressed" output is longer than the input, the same code path
reports it honestly instead of throwing a `RangeError`:

```
  ───── TOKEN STATS ─────
  Before   12 tokens  (48 chars)
  After    31 tokens  (124 chars)
  Grew     +158.3% ░░░░░░░░░░░░░░░░░░░░░░░░ (+19 tokens — compression failed)
  API call 120 in / 70 out (billed)
  ───────────────────────
```

## API reference

```javascript
import { squashPrompt, countTokens, computeStats, formatStats } from "@sidhxntt/token-squasher";

const { squashed, reasoning, usage, model } = await squashPrompt(promptText, {
  model: "claude-sonnet-5",   // optional
  client,                     // optional Anthropic client (inject a stub in tests)
});
```

**Returns** an object with `squashed` (string), `reasoning` (string or `null`),
`usage` (the raw `resp.usage`), and `model`.

Throws when the response contains no text block (a refusal, or a response whose
first block is a thinking block) or when the model omits the `<squashed>`
wrapper.

**Model:** `claude-sonnet-5` by default, `max_tokens: 4096`. The 1.0.0 release
hardcoded `claude-sonnet-4-20250514`; use `--model` to pin any other id.

## Project structure

```
token_quasher/
├── LICENSE.txt
├── README.md
├── index.js               # CLI, REPL, Anthropic integration, token stats
├── package.json
└── test/
    └── squasher.test.js   # node:test coverage (stubbed client — no API spend)
```

## Tests

```bash
npm test          # from token_quasher/
```

Every test injects a stub client; the suite never touches the network and never
needs an API key.

## License

MIT — see LICENSE.txt.
