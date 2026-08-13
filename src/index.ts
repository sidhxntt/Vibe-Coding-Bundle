#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { intro, outro, select, note, log, isCancel, cancel } from '@clack/prompts';
import { allBuildHints, buildHint, findByAlias, resolveTools, type ResolvedTool } from './tools';
import { canAnimate, plainSplash, showSplash } from './splash';

/** Read from package.json at build time is not available, so keep it here. */
const VERSION = '1.0.0';

/** Sentinel for the menu entry that ends the session. */
const QUIT = '__quit__';

function bail(value: unknown): void {
  if (isCancel(value)) {
    cancel('Cancelled');
    process.exit(0);
  }
}

/**
 * Hands control to a tool.
 *
 * stdio is inherited so the tool draws its own prompts directly on this
 * terminal — the launcher gets out of the way entirely rather than trying to
 * proxy another interactive UI. It also means the tool sees the real stdin, so
 * it opens its own REPL from the menu and reads a pipe when there is one.
 */
function launch(tool: ResolvedTool, args: string[]): number {
  const [command, ...fixed] = tool.argv as string[];
  const result = spawnSync(command, [...fixed, ...args], { stdio: 'inherit' });

  if (result.error) {
    log.error(`Could not run ${tool.label}: ${result.error.message}`);
    return 1;
  }
  // A tool killed by Ctrl-C reports a signal rather than an exit code.
  if (result.signal) return 130;
  return result.status ?? 0;
}

async function askTool(tools: ResolvedTool[]): Promise<ResolvedTool | typeof QUIT> {
  const answer = await select({
    message: 'Which tool?',
    options: [
      ...tools.map((tool) => ({
        value: tool.alias,
        label: tool.argv ? tool.label : `${tool.label} (not built)`,
        hint: tool.summary,
      })),
      { value: QUIT, label: 'quit', hint: 'exit the launcher' },
    ],
  });
  bail(answer);

  if (answer === QUIT) return QUIT;
  return tools.find((tool) => tool.alias === answer) as ResolvedTool;
}

async function run(): Promise<void> {
  const tools = resolveTools();

  // Flags belong to the launcher, not to the tool it starts, so they are taken
  // out before the first remaining argument is read as a tool name.
  //
  // Only the leading run of them is taken. Everything from the alias onwards is
  // the tool's own argv and is handed over verbatim — a tool is free to have a
  // flag of the same name, and `vibe squash --no-stats` must not lose it.
  const LAUNCHER_FLAGS = ['--no-splash'];
  const argv = process.argv.slice(2);
  let first = 0;
  while (first < argv.length && LAUNCHER_FLAGS.includes(argv[first])) first++;
  const [requested, ...passthrough] = argv.slice(first);

  // Named directly, so this is a shortcut rather than a menu:
  //   vibe lint --json prompt.txt
  if (requested) {
    const tool = findByAlias(requested);
    if (!tool) {
      intro('Vibe Coding Bundle');
      outro(
        `❌ Unknown tool "${requested}". Try one of: ${tools.map((t) => t.alias).join(', ')}`
      );
      process.exit(1);
    }
    if (!tool.argv) {
      intro('Vibe Coding Bundle');
      note(buildHint(tool), 'Not built');
      outro('❌ Nothing to run.');
      process.exit(1);
    }
    process.exit(launch(tool, passthrough));
  }

  // The splash belongs to the menu only. `vibe lint ...` is someone in a hurry,
  // and an animation would just stand in front of the work.
  if (canAnimate()) {
    await showSplash(VERSION);
    // The splash is the title, so the intro contributes only clack's opening
    // bar — without it the menu has no top cap to close against at the end.
    intro('');
  } else {
    intro(plainSplash(VERSION));
  }

  const available = tools.filter((tool) => tool.argv);
  if (available.length === 0) {
    note(allBuildHints().join('\n'), 'Nothing is built yet');
    outro('❌ No tools are ready to run.');
    process.exit(1);
  }

  const missing = tools.filter((tool) => !tool.argv);
  if (missing.length > 0) {
    log.info(
      `${missing.map((tool) => tool.label).join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} not built — select for instructions.`
    );
  }

  // Loop rather than exit, so a session of several prompts is one command.
  for (;;) {
    const choice = await askTool(tools);
    if (choice === QUIT) {
      outro('Bye.');
      return;
    }

    if (!choice.argv) {
      note(buildHint(choice), 'Not built');
      continue;
    }

    // The tool owns the terminal from here, including its own intro and outro.
    const code = launch(choice, []);
    if (code !== 0 && code !== 130) {
      log.warn(`${choice.label} exited with code ${code}.`);
    }

    const again = await select({
      message: 'Anything else?',
      initialValue: 'menu',
      options: [
        { value: 'menu', label: 'back to the menu' },
        { value: 'quit', label: 'quit' },
      ],
    });
    bail(again);
    if (again === 'quit') {
      outro('Bye.');
      return;
    }
  }
}

run().catch((error: Error) => {
  console.error('Error:', error);
  process.exit(1);
});
