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

/** The places that have failed. Keyed on the place alone, never the
 *  message: a message that carries a position or a name would make every
 *  occurrence new, log twenty times a second and grow this without end. The
 *  places are the fixed strings in the code, so it stays a handful. */
const reported = new Set<string>();

/** Log a failure in `where` the first time it happens there; any later
 *  failure in the same place stays quiet, whatever its message. */
export function warnOnce(where: string, e?: unknown): void {
  if (reported.has(where)) return;
  reported.add(where);
  if (e === undefined) console.warn(`${PREFIX} ${where}`);
  else console.warn(`${PREFIX} ${where} failed; further failures here are not logged:`, e);
}

/** `fn`, with a failure logged once instead of thrown into Obsidian's caller.
 *  A promise it returns is passed on with its rejection caught the same way,
 *  so an async function stays guarded and can still be awaited. */
export function guarded<A extends unknown[], R>(where: string, fn: (...args: A) => R): (...args: A) => R | undefined {
  return (...args: A) => {
    try {
      const out = fn(...args);
      if (out instanceof Promise) {
        return out.catch((e: unknown) => {
          warnOnce(where, e);
          return undefined;
        }) as R;
      }
      return out;
    } catch (e) {
      warnOnce(where, e);
      return undefined;
    }
  };
}

/** Forget what was logged: a plugin loaded again reports afresh. */
export function resetLog(): void {
  reported.clear();
}
