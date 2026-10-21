// Every line of a quote or callout carries its ">".
//
// Markdown lets a quote's paragraph run on into lines without ">" (a "lazy"
// continuation): Reading view and Live Preview still draw them inside the
// quote, but the source no longer says so, and Source mode shows a callout
// whose text has slipped out of it. Such lines are almost never typed; they
// are pasted. Obsidian carries "> " on to the next line when Enter is pressed
// in a quote, but a paste brings its own line breaks, and text copied from a
// browser often starts with one, so the first pasted line already lands
// outside.
//
// Two jobs, both pure:
//
//   * quotePaste — the text to insert for a paste into a quote line, with
//     every line after the first carrying the quote's ">";
//   * lazyLines — the lines of a note that are such continuations, and the
//     ">" each one needs. Adding it changes nothing in how the note is drawn:
//     only the lines Markdown already counts as the quote's are touched.

/** The ">" markers that open a quote line, with the indent before them. */
interface Quote {
  /** The whitespace before the first ">". */
  indent: string;
  /** How many quotes deep the line is. */
  depth: number;
  /** The line after its markers. */
  content: string;
}

const QUOTE = /^([ \t]*)((?:>[ \t]?)+)(.*)$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** The quote a line belongs to, or null for a line without ">". */
export function quoteOf(line: string): Quote | null {
  const m = QUOTE.exec(line);
  if (!m) return null;
  return { indent: m[1]!, depth: (m[2]!.match(/>/g) ?? []).length, content: m[3]! };
}

/** The markers that put a line `depth` quotes deep: "> > " for text, "> >" for a blank line. */
export function markers(depth: number, blank = false): string {
  const bare = Array.from({ length: depth }, () => ">").join(" ");
  return blank ? bare : bare + " ";
}

/**
 * Whether a line, coming right after a paragraph, starts a block of its own
 * rather than continuing it. Markdown's list of what may interrupt a
 * paragraph, plus what Obsidian adds: a math block, a footnote, a comment.
 * Such a line ends the quote above it and is not the quote's.
 */
function interrupts(line: string): boolean {
  const s = line.replace(/^[ \t]{0,3}/, "");
  return (
    /^#{1,6}([ \t]|$)/.test(s) || // heading
    FENCE.test(s) || // code
    /^([-*_])[ \t]*(\1[ \t]*){2,}$/.test(s) || // thematic break
    /^[-*+][ \t]+\S/.test(s) || // bullet item with text
    /^1[.)][ \t]+\S/.test(s) || // ordered list starting at 1
    /^<\/?[A-Za-z][\w-]*(\s|\/?>|$)/.test(s) || // HTML block
    /^<!--/.test(s) ||
    /^\$\$/.test(s) || // math block
    /^\[\^[^\]]+\]:/.test(s) || // footnote
    /^%%/.test(s) // Obsidian comment
  );
}

/** Whether a quote line's content is part of a paragraph, which a lazy line may continue. */
function opensParagraph(content: string): boolean {
  if (content.trim() === "") return false;
  // Inside the quote a list item's text is a paragraph too: "> - a" runs on.
  const inner = content.replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?=\S)/, "");
  const s = inner.replace(/^[ \t]{0,3}/, "");
  if (/^#{1,6}([ \t]|$)/.test(s)) return false;
  if (FENCE.test(s)) return false;
  if (/^([-*_])[ \t]*(\1[ \t]*){2,}$/.test(s)) return false;
  if (/^<\/?[A-Za-z!]/.test(s)) return false;
  if (/^\$\$/.test(s)) return false;
  return true;
}

/** One line to put back into its quote: the line's number and what goes before it. */
export interface LazyLine {
  /** Zero-based. */
  line: number;
  /** The markers to insert at the start of the line. */
  insert: string;
}

/**
 * Every lazy continuation line of a note, with the ">" it needs. Frontmatter
 * and code outside quotes are skipped, and so is code inside one: a quoted
 * code block ends at the first line without ">", it never runs on.
 */
export function lazyLines(text: string): LazyLine[] {
  const lines = text.split(/\r?\n/);
  const found: LazyLine[] = [];
  let i = 0;
  if (lines[0]?.trimEnd() === "---") {
    for (i = 1; i < lines.length; i++) if (/^(---|\.\.\.)\s*$/.test(lines[i]!)) { i++; break; }
  }
  /** The fence of the code block the text is in, outside any quote. */
  let fence: string | null = null;
  /** The fence of the code block the quote is in. */
  let quotedFence: string | null = null;
  /** The quote whose paragraph the next line may continue, if any. */
  let open: { indent: string; depth: number } | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence !== null) {
      if (closes(line, fence)) fence = null;
      continue;
    }
    const q = quoteOf(line);
    if (q) {
      if (quotedFence !== null) {
        if (closes(q.content, quotedFence)) quotedFence = null;
        open = null;
        continue;
      }
      const f = FENCE.exec(q.content);
      if (f) {
        quotedFence = f[1]!;
        open = null;
        continue;
      }
      open = opensParagraph(q.content) ? { indent: q.indent, depth: q.depth } : null;
      continue;
    }
    quotedFence = null;
    if (line.trim() === "") {
      open = null;
      continue;
    }
    if (open !== null && !interrupts(line)) {
      found.push({ line: i, insert: open.indent + markers(open.depth) });
      continue; // still the same paragraph: the next line may run on too
    }
    open = null;
    const f = FENCE.exec(line);
    if (f) fence = f[1]!;
  }
  return found;
}

/** Whether a line closes a code block opened with `fence`. */
function closes(line: string, fence: string): boolean {
  const m = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return m !== null && m[1]![0] === fence[0] && m[1]!.length >= fence.length;
}

/** Whether a line sits in a fenced code block outside any quote, where a ">" is code. */
export function inFencedCode(lines: readonly string[], at: number): boolean {
  let fence: string | null = null;
  for (let i = 0; i < at && i < lines.length; i++) {
    const line = lines[i]!;
    if (fence !== null) {
      if (closes(line, fence)) fence = null;
      continue;
    }
    const f = FENCE.exec(line);
    if (f) fence = f[1]!;
  }
  return fence !== null;
}

/** A note with every lazy line given its ">", and how many there were. */
export function repairQuotes(text: string): { text: string; repaired: number } {
  const lazy = lazyLines(text);
  if (lazy.length === 0) return { text, repaired: 0 };
  const lines = text.split("\n");
  for (const { line, insert } of lazy) lines[line] = insert + lines[line]!;
  return { text: lines.join("\n"), repaired: lazy.length };
}

/**
 * The text to insert for a paste at a point on a quote line, or null to leave
 * the paste to Obsidian.
 *
 * `before` is the line up to the cursor. Every pasted line after the first
 * gets the line's markers, a blank one the bare ">". Line breaks the paste
 * starts with are dropped when the cursor sits right after the markers, where
 * they would only push the text out of the quote; after text, such as a
 * callout's "[!quote]", one is kept, so the paste starts a line of its own
 * inside the callout instead of joining its title.
 */
export function quotePaste(before: string, pasted: string): string | null {
  const q = quoteOf(before);
  if (!q) return null;
  let text = pasted.replace(/\r\n?/g, "\n");
  if (!text.includes("\n")) return null;
  const pastedLines = text.split("\n").filter((l) => l.trim() !== "");
  // A quote pasted into a quote: its own ">" already say where it goes.
  if (pastedLines.length > 0 && pastedLines.every((l) => quoteOf(l) !== null)) return null;

  const atStart = q.content.trim() === "";
  if (atStart) text = text.replace(/^(?:[ \t]*\n)+/, "");
  else text = text.replace(/^(?:[ \t]*\n)+/, "\n");
  if (!text.includes("\n")) return text;

  const out = text.split("\n");
  // The last line goes on with whatever followed the cursor, so it keeps the
  // space after its ">" even when the paste left it empty.
  return out
    .map((l, n) => {
      if (n === 0) return l;
      if (l.trim() === "" && n < out.length - 1) return q.indent + markers(q.depth, true);
      return q.indent + markers(q.depth) + l;
    })
    .join("\n");
}
