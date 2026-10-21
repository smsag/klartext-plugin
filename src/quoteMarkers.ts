// Quote markers kept: a line typed right below a quote or callout line gets
// that line's ">" markers, so what Live Preview shows inside the callout is
// inside it in the note too.
//
// Markdown counts a line of text right after a quote line as part of the
// quote even without ">" (a lazy line), and Obsidian draws it inside the
// quote or callout. Under the Klartext theme, which never shows the ">", the
// lazy line looks exactly like a marked one, so a lost ">" goes unseen until
// another app reads the note: a Markdown reader that wants every line marked
// finds the callout empty. Writing the markers changes nothing about what the
// note means – the line was in the quote already – only that it says so.
//
// Only what is typed or pasted in Live Preview: Source mode shows the markers,
// and a note is never rewritten on opening. A line that ends the quote (a
// heading, a list, a fence, a rule, a table, an empty line) is left alone, and
// so is one whose marker is still being typed ("-" before "- item"); so is a
// line below a quote line that cannot continue (a fence, a heading, a rule,
// an empty "> ", or code inside the quote).

import { EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";

/** The markers that open a quote line: up to three spaces, then ">" for each level. */
const MARKERS = /^ {0,3}(?:>[ \t]?)+/;
/** Lines that start a block of their own, so Markdown does not read them as a lazy continuation. */
const INTERRUPTS = [
  /^ {0,3}#{1,6}(?:[ \t]|$)/, // heading
  /^ {0,3}(?:`{3,}|~{3,})/, // code fence
  /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/, // rule
  /^ {0,3}[-*+][ \t]/, // bullet
  /^ {0,3}1[.)][ \t]/, // numbered list from 1
  /^ {0,3}</, // HTML
  /^ {0,3}=+[ \t]*$/, // setext underline
  /^ {0,3}\$\$/, // math block
  /^ {0,3}\|/, // table row
];
/** What a line holds while a block's marker is still being typed ("#", "-", "1.", "`"): not text yet. */
const UNFINISHED = /^(?:#{1,6}|[-*+_=]+|\d{1,9}[.)]?|`{1,2}|~{1,2}|\$)$/;
/** The farthest a quote is followed upward to see whether a code fence is open in it. */
const LOOKBACK = 500;

/** The ">" markers that open `line`, or null when it is no quote line. */
export function quoteMarkers(line: string): string | null {
  return MARKERS.exec(line)?.[0] ?? null;
}

/** Whether a quote's text line (its markers taken off) is paragraph text a lazy line continues. */
function continues(text: string): boolean {
  if (text.trim() === "") return false;
  if (/^ {4,}/.test(text)) return false; // indented code
  return !INTERRUPTS.some((re) => re.test(text));
}

/** Whether `text` can be a lazy line: text, and nothing that starts a block of its own – or may yet, while it is typed. */
function lazy(text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== "" && !UNFINISHED.test(trimmed) && quoteMarkers(text) === null && !INTERRUPTS.some((re) => re.test(text));
}

/** Whether a code fence is still open at the end of `lines`, the quote's lines from its top (markers off). */
function fenceOpen(lines: readonly string[]): boolean {
  let fence: string | null = null;
  for (const text of lines) {
    const run = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (run === undefined) continue;
    if (fence === null) fence = run;
    else if (run[0] === fence[0] && run.length >= fence.length && text.trim() === run) fence = null;
  }
  return fence !== null;
}

/**
 * The markers to put before `line`, given the lines above it (nearest last):
 * the quote line right above, written so the text keeps a space after them.
 * Null when `line` is not a lazy continuation of a quote.
 */
export function missingMarkers(above: readonly string[], line: string): string | null {
  const previous = above[above.length - 1];
  if (previous === undefined || !lazy(line)) return null;
  const markers = quoteMarkers(previous);
  if (markers === null || !continues(previous.slice(markers.length))) return null;
  // The quote's lines up to here: a fence open in them is code, which ends at the quote's edge.
  const quote: string[] = [];
  for (const text of above.slice(-LOOKBACK).reverse()) {
    const m = quoteMarkers(text);
    if (m === null) break;
    quote.unshift(text.slice(m.length));
  }
  if (fenceOpen(quote)) return null;
  return /[ \t]$/.test(markers) ? markers : markers + " ";
}

/** The lines a transaction wrote into, by number in the new document, each once and in order. */
function touchedLines(tr: Transaction): number[] {
  const lines = new Set<number>();
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const first = tr.newDoc.lineAt(fromB).number;
    const last = tr.newDoc.lineAt(toB).number;
    for (let n = first; n <= last; n++) lines.add(n);
  });
  return [...lines].sort((a, b) => a - b);
}

/**
 * The markers a typed or pasted transaction leaves out, as changes in its new
 * document; null when it leaves none out. A pasted paragraph gets them on
 * every line, since each line continues the one above.
 */
export function markerChanges(tr: Transaction): TransactionSpec | null {
  const doc = tr.newDoc;
  const added = new Map<number, string>();
  const text = (n: number) => (added.get(n) ?? "") + doc.line(n).text;
  for (const n of touchedLines(tr)) {
    if (n === 1) continue;
    const above: string[] = [];
    for (let i = n - 1; i >= 1 && n - i <= LOOKBACK; i--) {
      above.unshift(text(i));
      if (quoteMarkers(text(i)) === null) break;
    }
    const markers = missingMarkers(above, doc.line(n).text);
    if (markers !== null) added.set(n, markers);
  }
  if (added.size === 0) return null;
  return { changes: [...added].map(([n, insert]) => ({ from: doc.line(n).from, insert })), sequential: true };
}

/**
 * The editor extension: typing and pasting in Live Preview keep a quote's
 * markers. `livePreview` tells Live Preview from Source mode (Obsidian's
 * editorLivePreviewField, passed in so this module runs without Obsidian).
 */
export function quoteMarkersExtension(enabled: () => boolean, livePreview: (state: EditorState) => boolean) {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !enabled()) return tr;
    // Typing and pasting only; an IME composition is left to finish first.
    if (!(tr.isUserEvent("input") || tr.isUserEvent("paste")) || tr.isUserEvent("input.type.compose")) return tr;
    if (!livePreview(tr.startState)) return tr;
    const spec = markerChanges(tr);
    return spec ? [tr, spec] : tr;
  });
}
