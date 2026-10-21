// The plugin's one voice in the console. Every line carries the [klartext]
// prefix, so a bug report can be filtered to it, and a failure that repeats
// is logged once: the top row polls twenty times a second, a table is
// redrawn on every keystroke, and a console that scrolls the same line is no
// report.
//
// Failures are caught where the plugin hands control back to Obsidian or the
// browser (a post-processor, an editor extension, an observer, a timer), so
// one bad table or one torn-down window costs that piece of work, never the
// note's rendering or the rest of the plugin.

export const PREFIX = "[klartext]";

const reported = new Set<string>();

/** Log a failure the first time it happens; the same failure again stays quiet. */
export function warnOnce(where: string, e?: unknown): void {
  const detail = e === undefined ? "" : e instanceof Error ? e.message : String(e);
  const key = `${where}: ${detail}`;
  if (reported.has(key)) return;
  reported.add(key);
  if (e === undefined) console.warn(`${PREFIX} ${where}`);
  else console.warn(`${PREFIX} ${where} failed; further failures of this kind are not logged:`, e);
}

/** `fn`, with a failure logged once instead of thrown into Obsidian's caller. */
export function guarded<A extends unknown[]>(where: string, fn: (...args: A) => void): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (e) {
      warnOnce(where, e);
    }
  };
}

/** Forget what was logged: a plugin loaded again reports afresh. */
export function resetLog(): void {
  reported.clear();
}
