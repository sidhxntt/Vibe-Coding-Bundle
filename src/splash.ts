/**
 * The launch splash.
 *
 * Written against raw ANSI rather than a colour library: the animation needs
 * per-character control over a gradient and cursor movement, which is more
 * direct to express here than through a wrapper, and it keeps the launcher at
 * a single dependency.
 */

const WORDMARK = [
  '██    ██ ██ ██████  ███████',
  '██    ██ ██ ██   ██ ██     ',
  '██    ██ ██ ██████  █████  ',
  ' ██  ██  ██ ██   ██ ██     ',
  '  ████   ██ ██████  ███████',
];

const TAGLINE = 'vibe coding bundle';

/** Gradient endpoints, violet through to cyan. */
const FROM: RGB = [167, 139, 250];
const TO: RGB = [34, 211, 238];

type RGB = [number, number, number];

const ESC = '[';
const RESET = `${ESC}0m`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True when the terminal can be drawn on.
 *
 * Piped or redirected output gets nothing: escape codes would corrupt it, and
 * a script waiting on this command should not pay for an animation. NO_COLOR
 * and CI are respected for the same reason.
 */
export function canAnimate(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.NO_COLOR || process.env.CI) return false;
  if (process.argv.includes('--no-splash')) return false;
  return (process.stdout.columns ?? 80) >= WORDMARK[0].length + 2;
}

/** 24-bit colour where the terminal supports it, else the nearest basic cyan. */
function paint(text: string, [r, g, b]: RGB): string {
  const colorTerm = process.env.COLORTERM ?? '';
  if (colorTerm.includes('truecolor') || colorTerm.includes('24bit')) {
    return `${ESC}38;2;${r};${g};${b}m${text}${RESET}`;
  }
  return `${ESC}36m${text}${RESET}`;
}

function mix(from: RGB, to: RGB, t: number): RGB {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(from[0] + (to[0] - from[0]) * clamped),
    Math.round(from[1] + (to[1] - from[1]) * clamped),
    Math.round(from[2] + (to[2] - from[2]) * clamped),
  ] as RGB;
}

/**
 * Colours a line across its width, optionally brightening a band around
 * `highlight` so a glint can be swept along the wordmark.
 */
function gradientLine(line: string, highlight: number | null): string {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === ' ') {
      out += ' ';
      continue;
    }

    let color = mix(FROM, TO, i / Math.max(1, line.length - 1));
    if (highlight !== null) {
      const distance = Math.abs(i - highlight);
      if (distance < 6) {
        // Lift towards white, strongest at the centre of the band.
        color = mix(color, [255, 255, 255], (1 - distance / 6) * 0.85);
      }
    }
    out += paint(character, color);
  }
  return out;
}

function write(text: string): void {
  process.stdout.write(text);
}

/** Redraws the wordmark in place, with the glint at the given column. */
function redraw(highlight: number | null): void {
  write(`${ESC}${WORDMARK.length}A`);
  for (const line of WORDMARK) {
    write(`\r${ESC}2K${gradientLine(line, highlight)}\n`);
  }
}

/**
 * Draws the splash: the wordmark appears a line at a time, a glint sweeps
 * across it, then the tagline types itself out.
 *
 * Kept under about three quarters of a second — long enough to feel deliberate,
 * short enough that it never stands between the user and the menu.
 */
export async function showSplash(version: string): Promise<void> {
  write(HIDE_CURSOR);

  try {
    // Appear, one line at a time.
    for (const line of WORDMARK) {
      write(`${gradientLine(line, null)}\n`);
      await sleep(45);
    }

    // A single glint along the width.
    const width = WORDMARK[0].length;
    for (let position = -6; position <= width + 6; position += 5) {
      redraw(position);
      await sleep(16);
    }
    redraw(null);

    // Tagline types itself, with the version dimmed behind it.
    write('\n');
    const indent = ' ';
    write(indent);
    for (const character of TAGLINE) {
      write(paint(character, mix(FROM, TO, 0.5)));
      await sleep(14);
    }
    write(`${ESC}2m  v${version}${RESET}\n\n`);
  } finally {
    // Always restore the cursor, even if the write stream errors mid-animation.
    write(SHOW_CURSOR);
  }
}

/** The one-line header used when the terminal cannot be animated. */
export function plainSplash(version: string): string {
  return `${TAGLINE} v${version}`;
}
