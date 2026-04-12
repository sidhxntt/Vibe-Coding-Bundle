# Vibe Coding Bundle

A collection of AI prompt engineering tools that lint, optimize, and compress prompts for better LLM interactions.

![Node.js](https://img.shields.io/badge/node.js->=18-brightgreen.svg)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

>To know more about indiviual tools please refer their README.md
## Features

- **🔍 vibe-lint** — Flags weak, vague, and contradictory prompt instructions with 15+ lint rules
- **🎯 prompt-optimizer** — Rewrites weak prompts into tight, effective ones using Claude API
- **🗜️ token-squasher** — Compresses verbose system prompts into dense, token-efficient instructions
- **Interactive CLI interfaces** with colored terminal output and real-time feedback
- **Comprehensive rule engine** covering common prompt engineering pitfalls
- **Claude API integration** for AI-powered prompt optimization

## Prerequisites

- Node.js 18 or higher
- Claude API key (for prompt-optimizer and token-squasher)

## Installation

### Install individual tools globally:

```bash
# Install vibe-lint
npm install -g @sidhxntt/vibe-lint

# Install prompt-optimizer  
npm install -g @sidhxntt/prompt-optimizer

# Install token-squasher
npm install -g @sidhxntt/token-squasher
```

### Or clone and run locally:

```bash
git clone <repository-url>
cd Vibe_Coding
```

## Configuration

For tools that use Claude API (prompt-optimizer and token-squasher), set your API key:

```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

## Usage

### vibe-lint

Lint prompts to identify common issues:

```bash
# Interactive mode
vibe-lint

# Lint specific files
vibe-lint my-prompt.txt bad-prompt.txt

# Pipe content
echo "You are a helpful AI assistant. Please be helpful." | vibe-lint
```

Example output:
```
┌─ bad-prompt.txt ─────────────────────────────────────────────────
│
│ 1 │ You are a helpful AI assistant. Please try to be more helpful.
│   │                                 ·─────┬─────·                
│   │                                       │                     
│   │                                    W002                      

W002  "Be helpful" gives the model no optimization target
      └ Try: 'Answer in ≤3 sentences unless the topic requires more depth'
```

### prompt-optimizer

Automatically improve prompts using AI analysis:

```bash
prompt-optimizer
```

The tool will:
1. Analyze your prompt using vibe-lint rules
2. Show identified issues with severity levels
3. Use Claude API to rewrite the prompt
4. Display the optimized version

### token-squasher

Compress verbose prompts while preserving logic:

```bash
token-squasher
```

Features:
- Token count estimation and savings display
- Preserves all behavioral rules and constraints
- Shows reasoning for compression decisions
- Interactive REPL with command support

Commands:
- `:stats` - Toggle token statistics
- `:verbose` - Toggle compression reasoning
- `:clear` - Clear screen
- `:quit` - Exit

## Rule Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **vague-quality** | Unmeasurable descriptors | "make it better", "high-quality" |
| **ambiguous-scope** | Unclear task boundaries | "handle it", "as needed" |
| **output-format** | Unspecified response format | "good format", "respond appropriately" |
| **role-confusion** | Redundant AI identity statements | "you are an AI assistant" |
| **contradiction** | Conflicting instructions | "be brief and comprehensive" |
| **politeness-bloat** | Unnecessary courtesy | "please try to", "feel free to" |

## Project Structure

```
Vibe_Coding/
├── prompt_optimiser/
│   ├── index.js              # Main CLI with vibe-lint rules + Claude API
│   ├── package.json         # Defines prompt-optimizer command
│   └── LICENSE.txt
├── token_quasher/
│   ├── index.js              # Token compression tool with Claude API
│   ├── package.json         # Defines token-squasher command  
│   └── node_modules/        # Anthropic SDK dependency
└── vibe_linter/
    ├── src/
    │   └── index.js         # Core linting engine with 15+ rules
    ├── package.json         # Defines vibe-lint command
    ├── good-prompt.txt      # Example of well-structured prompt
    ├── bad-prompt.txt       # Example of poor prompt
    └── LICENSE.txt
```

### Key Files

- **vibe_linter/src/index.js** — Core rule engine with regex-based patterns, severity levels, and CLI interface
- **prompt_optimiser/index.js** — Interactive prompt analysis and AI-powered rewriting using Claude API
- **token_quasher/index.js** — Prompt compression tool with token estimation and interactive REPL

## API Reference

### Adding Custom Rules

Rules are defined in the `RULES` array with this structure:

```javascript
{
  id: "W001",                           // Unique identifier
  severity: "warn",                     // "error" | "warn" | "info"  
  category: "vague-quality",           // Rule category
  pattern: /\b(make it better)\b/gi,   // Regex pattern
  message: "Brief explanation",         // Problem description
  suggestions: [                        // Specific alternatives
    "Specify the axis: 'reduce complexity'",
    "Target a metric: 'cut latency by 30%'"
  ],
  docs: "https://..."                   // Optional documentation link
}
```

### Severity Levels

- **Error** — Critical issues that will block optimization
- **Warn** — Style problems and improvement suggestions  
- **Info** — General recommendations

## Examples

### Before (Bad Prompt)
```
You are a helpful AI assistant. Please try to be more helpful and improve 
the code as needed. Make it better and more professional. Feel free to handle 
the above code and do your best.
```

### After (Optimized)
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
3. Add rules following the existing patterns in `RULES` arrays
4. Test with example prompts: `npm start good-prompt.txt bad-prompt.txt`
5. Ensure all tools work with new rules
6. Submit a pull request

### Testing Your Changes

```bash
# Test vibe-lint
cd vibe_linter && npm start bad-prompt.txt

# Test prompt-optimizer  
cd prompt_optimiser && npm start

# Test token-squasher
cd token_quasher && npm start
```

## License

MIT License - see LICENSE.txt files in individual tool directories for details.
