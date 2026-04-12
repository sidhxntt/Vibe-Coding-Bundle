# vibe-lint

A linter for your prompts — flags weak, vague, and contradictory instructions

![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=flat&logo=node.js&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- **Comprehensive rule engine** with 15+ lint rules covering common prompt engineering pitfalls
- **Severity levels** — errors for critical issues, warnings for style problems, info for suggestions  
- **Colored terminal output** with line numbers and context highlighting
- **Actionable suggestions** — specific alternatives for each flagged pattern
- **Documentation links** to OpenAI and prompt engineering best practices
- **Interactive and file-based modes** — lint from stdin or file arguments

## Prerequisites

- Node.js 14+ (uses ES modules)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd vibe_linter

# Install as global CLI tool
npm install -g .

# Or run directly with npm
npm start
```

## Usage

### Interactive Mode (stdin)

```bash
# Type your prompt, then Ctrl+D to lint
vibe-lint

# Or pipe content
echo "You are a helpful AI assistant. Please be helpful and improve the code." | vibe-lint
```

### File Mode

```bash
# Lint a single prompt file
vibe-lint my-prompt.txt

# Lint multiple files  
vibe-lint prompt1.txt prompt2.txt
```

### Example Output

Running `vibe-lint bad-prompt.txt`:

```
┌─ bad-prompt.txt ─────────────────────────────────────────────────
│
│ 1 │ You are a helpful AI assistant. Please try to be more helpful and improve the code as needed.
│   │                                 ·─────┬─────·                  ·────────┬────────·
│   │                                       │                               │
│   │                                    W002                            W001
│ 2 │ Make it better and more professional. Feel free to handle the above code and do your best.
│   │ ·─────┬─────·                                  ·─────────┬─────────·
│   │       │                                                │
│   │    W001                                             E001

Errors: 1, Warnings: 3, Info: 0

W002  "Be helpful" gives the model no optimization target
      └ Try: 'Answer in ≤3 sentences unless the topic requires more depth'

W001  Vague improvement request — "better" is unmeasurable  
      └ Try: Specify the axis: 'reduce cyclomatic complexity below 10'

E001  Ambiguous delegation — model will hallucinate scope boundaries
      └ Try: List exact subtasks: '1. Parse input 2. Validate schema 3. Return JSON'
```

## Rule Categories

| Category | Description | Example Issues |
|----------|-------------|----------------|
| `vague-quality` | Unmeasurable quality descriptors | "make it better", "be helpful", "high-quality" |
| `ambiguous-scope` | Unclear task boundaries | "handle it", "as needed", "where appropriate" |
| `output-format` | Unspecified response format | "good format", "respond appropriately" |
| `role-confusion` | Redundant AI identity statements | "you are an AI assistant" |
| `verbosity-conflict` | Contradictory length requirements | "don't be verbose but be comprehensive" |

## Project Structure

```
vibe_linter/
├── bad-prompt.txt          # Example of a poorly-written prompt
├── good-prompt.txt         # Example of a well-structured prompt  
├── package.json           # NPM package configuration
└── src/
    └── index.js          # Main CLI application with rule engine
```

### Key Components

- **Rule Engine**: 15+ regex-based rules with severity levels and suggestions
- **Linter Logic**: Multi-line context analysis with precise error positioning  
- **CLI Interface**: Supports both interactive stdin and file-based input
- **Colored Output**: ANSI terminal formatting for improved readability

## Adding Custom Rules

Rules are defined in the `RULES` array in `src/index.js`:

```javascript
{
  id: "W001",
  severity: "warn",                    // "error" | "warn" | "info"
  category: "vague-quality",
  pattern: /\b(make it better)\b/gi,
  message: "Vague improvement request",
  suggestions: [
    "Specify the axis: 'reduce complexity'",
    "Target a metric: 'cut latency by 30%'"
  ],
  docs: "https://platform.openai.com/docs/guides/prompt-engineering"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Add your rule to the `RULES` array with test cases
4. Test with both example files: `npm start good-prompt.txt bad-prompt.txt`
5. Submit a pull request

## License

MIT
