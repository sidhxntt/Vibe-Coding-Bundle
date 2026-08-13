import fs from 'fs';
import path from 'path';

export interface Tool {
  /** Short name typed as the first argument: `vibe lint prompt.txt`. */
  alias: string;
  label: string;
  summary: string;
  /** Folder under src/ (and therefore dist/) holding this tool's entry point. */
  dir: string;
}

/**
 * Every tool in this package.
 *
 * They ship together as one install, but each keeps its own entry point and is
 * started as a child process: they were written as standalone CLIs that read
 * process.argv and exit when done, and running them that way keeps that
 * contract intact instead of unpicking it.
 *
 * `src/rules` is deliberately absent. It is the shared rule set the other three
 * import, not a command — it has no bin, no shebang and no argv handling, so a
 * menu entry for it would be a dead row.
 */
export const TOOLS: Tool[] = [
  {
    alias: 'lint',
    label: 'Vibe Lint',
    summary: 'flag weak, vague and contradictory prompt instructions',
    dir: 'lint',
  },
  {
    alias: 'opt',
    label: 'Prompt Optimizer',
    summary: 'rewrite a weak prompt with Claude, and score the result',
    dir: 'opt',
  },
  {
    alias: 'squash',
    label: 'Token Squasher',
    summary: 'compress a verbose system prompt, keep every rule',
    dir: 'squash',
  },
];

export interface ResolvedTool extends Tool {
  /** Argv to run it with, or null when its entry point is missing. */
  argv: string[] | null;
}

/** Entry point names, in the order they are tried. */
const ENTRIES = ['index.js', 'index.ts'];

/**
 * How to start a tool.
 *
 * Run with the same node executing this launcher, so there is nothing to find
 * on PATH and no dependency on how the package was installed. These tools are
 * plain ESM JavaScript — unlike the launcher there is nothing to compile, so
 * the same `index.js` is found whether __dirname is src/ (ts-node) or dist/.
 * A .ts entry is still resolved, so a tool written in TypeScript later needs no
 * change here beyond keeping ts-node in the loop the way `npm run dev` does.
 */
function argvFor(tool: Tool): string[] | null {
  for (const entry of ENTRIES) {
    const file = path.join(__dirname, tool.dir, entry);
    if (!fs.existsSync(file)) continue;

    // ts-node has to stay in the loop for a .ts entry point.
    const loader = entry.endsWith('.ts') ? ['-r', 'ts-node/register'] : [];
    return [process.execPath, ...loader, file];
  }
  return null;
}

/**
 * The tools this build actually contains.
 *
 * A tool whose folder is not here at all is dropped: it is not part of this
 * package, and offering it would only produce an error later. A folder that is
 * present but has no entry point means `npm run build` copied nothing into
 * dist/, which is recoverable, so it stays in the list with a build hint.
 */
export function resolveTools(): ResolvedTool[] {
  return TOOLS.filter((tool) => fs.existsSync(path.join(__dirname, tool.dir))).map(
    (tool) => ({ ...tool, argv: argvFor(tool) })
  );
}

export function findByAlias(alias: string): ResolvedTool | undefined {
  const wanted = alias.toLowerCase();
  return resolveTools().find((tool) => tool.alias === wanted);
}

/** What to tell the user when a tool's entry point is not there. */
export function buildHint(tool: ResolvedTool): string {
  return [
    `${tool.label} is missing its entry point.`,
    '',
    'The package looks half-built. From the package root:',
    '  npm install && npm run build',
  ].join('\n');
}

/** Shown when nothing at all can be run. */
export function allBuildHints(): string[] {
  return ['  npm install && npm run build'];
}
