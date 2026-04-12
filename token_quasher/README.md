# token-squasher

Compress verbose system prompts into dense, token-efficient instructions without losing logic.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@sidhxntt/token-squasher.svg)](https://www.npmjs.com/package/@sidhxntt/token-squasher)

## Features

- **Token-efficient compression** - Reduces prompt length by removing filler while preserving all logic
- **Interactive REPL** - Multi-line prompt input with command support
- **Real-time statistics** - Token count reduction and compression percentage
- **Colored output** - Syntax highlighting for better readability
- **Claude Sonnet integration** - Uses Anthropic's latest model for intelligent compression
- **Reasoning display** - Shows what was compressed and how (optional)
- **Session management** - Track multiple compression attempts

## Prerequisites

- Node.js >= 18.0.0
- Anthropic API key

## Installation

```bash
npm install -g @sidhxntt/token-squasher
```

Or run directly with npx:

```bash
npx @sidhxntt/token-squasher
```

## Configuration

Set your Anthropic API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

## Usage

### Interactive Mode

Start the REPL:

```bash
token-squasher
```

### Commands

- `:stats` - Toggle token statistics display
- `:verbose` - Toggle compression reasoning display  
- `:clear` - Clear screen and reset
- `:quit` or `:q` - Exit the application

### Example Session

```
token-squasher v2.0.0
Compress verbose system prompts. Keep logic. Crush tokens.

✔ ANTHROPIC_API_KEY detected

Paste your system prompt and press Enter twice to squash.
Commands: :stats toggle stats  :verbose toggle reasoning  :quit exit
──────────────────────────────────────────────────────────

Prompt #1 — paste prompt then Enter twice to squash
› You are a helpful AI assistant. Please analyze the user's input carefully 
› and provide a comprehensive response that addresses all aspects of their 
› question. Make sure to be thorough and considerate in your analysis.
› 

  ⠋ Squashing tokens...

  ✔ Compressed successfully

Analyze user input comprehensively. Address all question aspects thoroughly.

───── TOKEN STATS ─────
Before   47 tokens  (187 chars)
After    12 tokens  (74 chars)
Crushed  74.5% ████████████████████░░░░
───────────────────────
```

### Input Methods

1. **Multi-line paste** - Paste your prompt and press Enter twice
2. **Line-by-line** - Type each line, pressing Enter between lines, then Enter twice to finish

## API Reference

The core compression function:

```javascript
async function squashPrompt(promptText)
```

**Parameters:**
- `promptText` (string) - The verbose system prompt to compress

**Returns:**
- Object with `squashed` (string) and `reasoning` (string) properties

**Model:** Uses `claude-sonnet-4-20250514` with max 4096 tokens

## Project Structure

```
token_quasher/
├── index.js          # Main CLI application with REPL
├── package.json      # NPM package configuration
└── package-lock.json # Dependency lock file
```

### Key Files

- **`index.js`** - Complete CLI implementation with Anthropic integration, REPL interface, and token estimation
- **`package.json`** - Defines the package as a global CLI tool with Node.js 18+ requirement

## License

MIT
