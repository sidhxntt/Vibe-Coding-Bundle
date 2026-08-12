# @sidhxntt/prompt-rules

The shared rule engine behind [`@sidhxntt/vibe-lint`](../vibe_linter) and
[`@sidhxntt/prompt-optimizer`](../prompt_optimiser).

![Node.js](https://img.shields.io/badge/node.js->=18-brightgreen.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Why this package exists

The rules were originally copy-pasted between the linter and the optimizer, and
they had already drifted: 17 rules in one, 16 in the other (`W007 no-examples`
was missing), suggestion arrays truncated to 2–3 entries, and the `docs` field
dropped entirely. Two copies of a regex set is one copy too many. This package
is the single source of truth; both CLIs depend on it.

## Install

```bash
npm install @sidhxntt/prompt-rules
```

Inside this repo it is a workspace package — a root `npm install` links it into
both consumers automatically.

## API

```javascript
import {
  RULES,
  analyzePrompt,
  scorePrompt,
  summarize,
  countWords,
  SEVERITY_WEIGHT,
  MAX_FINDINGS_PER_RULE,
  BASELINE_WORDS,
} from "@sidhxntt/prompt-rules";

const findings = analyzePrompt("Please try to handle it as needed.");
// [{ rule, match, index, line, col }, …] sorted by position,
// deduplicated to one finding per rule per line

summarize(findings);            // { errors: 2, warnings: 1, hints: 0 }
scorePrompt(findings, text);    // 0..100
```

### `RULES`

```javascript
{
  id: "E005",                    // unique; E = error, W = warn, I = info
  severity: "error",
  category: "missing-context",
  pattern: /…/gi,                // global regex; every match becomes a finding
  message: "…",
  suggestions: ["…", "…"],
  docs: null,                    // optional URL
  appliesTo: (text) => …,        // optional whole-document guard
}
```

`appliesTo` is the escape hatch for conditions that are properties of the whole
document rather than of a span. E005 uses it to skip prompts that contain a
fenced code block. The previous implementation expressed that with a negative
lookahead wrapping a lazy quantifier — `\b(?![\s\S]*?\`\`\`)` — which backtracks
across every length and therefore asserted "no fence anywhere after this point".
The consequence was that in a prompt with one fenced block, every "the file"
mention *after* the fence errored at −20 each.

### `scorePrompt(findings, text)`

```
score = clamp(0, 100, round(100 − penalty × lengthFactor))

penalty      = Σ SEVERITY_WEIGHT[severity], counting at most
               MAX_FINDINGS_PER_RULE (2) findings per rule id
lengthFactor = words > BASELINE_WORDS (60) ? sqrt(60 / words) : 1
```

`SEVERITY_WEIGHT` is `{ error: 20, warn: 8, info: 2 }`.

Two corrections over the naive formula:

- **Per-rule cap** — one noisy rule cannot sink a prompt on its own.
- **Length normalization** — the raw penalty is absolute, so a long, careful
  prompt scored worse than a short, mediocre one purely because it had more text
  to match against.

Both `vibe-lint`'s console summary and its `--json` reporter call this one
function. They used to carry two different formulas: the summary charged
`infos × 2` and the JSON reporter silently dropped that term.

## The 17 rules

| ID | Severity | Category |
|---|---|---|
| W001 | warn | vague-quality |
| W002 | warn | vague-quality |
| W003 | warn | vague-quality |
| E001 | error | ambiguous-scope |
| E002 | error | ambiguous-scope |
| W004 | warn | output-format |
| W005 | warn | output-format |
| E003 | error | role-confusion |
| W006 | warn | role-confusion |
| W007 | warn | no-examples |
| E004 | error | contradiction |
| W008 | warn | politeness-bloat |
| W009 | warn | negation-only |
| E005 | error | missing-context |
| W010 | warn | no-success-criteria |
| I001 | info | chain-of-thought |
| W011 | warn | vague-persona |

`vibe-lint --rules` prints the list with messages.

### Deliberate narrowing

- **W003 / W011 no longer overlap.** `"professional"` matched both, costing −16
  for one word. It now belongs to W003 (quality rubric) only.
- **W003 no longer matches a bare `clean` or `nice`.** `"clean up the array"` is
  legitimate phrasing.
- **W008 no longer matches a bare `please`.** Only the softening constructions
  (`please try to`, `kindly`, `feel free to`, …) genuinely weaken an instruction.
- **W011 requires an article** (`an expert`, not any `expert`) and dropped
  `master`, which fired on `the master branch`.

## Tests

```bash
npm test
```

Every rule has a known-positive and a known-negative case, and the suite fails
if a rule is added without both. Adding a rule means adding an entry to `CASES`
in `test/rules.test.js`.

## License

MIT — see LICENSE.txt.
