# Prompt Optimizer

Rewrites weak prompts into tight, effective ones using vibe-lint rules + Claude

![Node.js](https://img.shields.io/badge/node.js->=14-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Interactive prompt analysis** — Scans for 20+ prompt antipatterns using vibe-lint rules
- **Real-time feedback** — Shows warnings and errors with specific suggestions
- **Claude API integration** — Automatically rewrites prompts with optimization suggestions
- **Color-coded output** — Visual severity indicators (errors in red, warnings in yellow)
- **CLI-first design** — Works directly in terminal with readline interface

## Prerequisites

- Node.js 14 or higher
- Claude API access (Anthropic account required)

## Installation

```bash
npm install -g prompt-optimizer
```

Or run directly with npx:

```bash
npx prompt-optimizer
```

## Configuration

Set your Claude API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

## Usage

Launch the interactive prompt optimizer:

```bash
prompt-optimizer
```

The tool will analyze your prompts for common issues including:

### Error Categories (Will block optimization)
- **Ambiguous scope** — `"do your best"`, `"handle it"`, `"as needed"`
- **Role confusion** — `"you are an AI assistant"`  
- **Missing context** — References to `"the code above"` without providing it
- **Contradictions** — `"be brief and comprehensive"`

### Warning Categories (Suggestions for improvement)
- **Vague quality** — `"make it better"`, `"high-quality"`
- **Output format** — `"in a good format"`, `"respond appropriately"`
- **Politeness bloat** — `"please try to"`, `"feel free to"`
- **Negation-only** — `"don't be vague"` without positive guidance

## Example

Input prompt:
```
Please try to make my code better and more professional. Handle any issues as needed and respond in a good format.
```

The tool identifies:
- **W008**: "Please try to" (politeness bloat)
- **W001**: "make it better" (vague quality)  
- **W003**: "more professional" (subjective without rubric)
- **E002**: "as needed" (ambiguous scope)
- **W004**: "good format" (unspecified structure)

Optimized version:
```
Refactor this code to pass ESLint strict rules and achieve <10 cyclomatic complexity. Add JSDoc comments to all public functions. Return as a markdown code block with before/after sections.
```

## Project Structure

```
prompt_optimiser/
├── LICENSE.txt          # MIT license
├── index.js            # Main CLI application with vibe-lint rules
├── package-lock.json   # Dependency lock file  
└── package.json        # Package configuration and binary definition
```

### Key Files

- **index.js** — Contains 20+ prompt linting rules, Claude API integration, and interactive CLI interface
- **package.json** — Defines the `prompt-optimizer` CLI command and project metadata

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Add new rules to the `RULES` array in `index.js` following the existing pattern
4. Test your changes with various prompt inputs
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Rule Structure

```javascript
{
  id: "W010",
  severity: "warn", // or "error"  
  category: "category-name",
  pattern: /regex_pattern/gi,
  message: "Brief explanation of the problem",
  suggestions: [
    "Specific suggestion 1",
    "Specific suggestion 2"
  ]
}
```

## License
See MIT License for details.
