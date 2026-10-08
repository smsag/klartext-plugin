// Table cells reaching down, applied to Obsidian's rendered tables: in Reading
// view through a Markdown post-processor, in Live Preview by watching the
// editor's table widgets. Both read the table's source (src/tableSpans.ts has
// the rule) and mark its cells; styles.css centres a cell that reaches down
// and takes the cells it covers out of the layout.
//
// Covered cells are hidden, not removed: Live Preview's table widget keeps
// its own idea of which cell is where, for editing and for moving between
// cells, and a removed cell would leave it pointing at the wrong one. A hidden
// cell takes no place in the table, so the cell above it can reach down into
// its room, and taking the marks away restores the table exactly.

import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { MarkdownPostProcessorContext } from "obsidian";
import { anyReaching, tableSpans } from "./tableSpans";

/** On a cell that reaches down over the rows below it. */
export const REACHING_CLASS = "klartext-cell-reaching";
/** On a cell the cell above reaches down over. */
export const COVERED_CLASS = "klartext-cell-covered";

/** Just the parts of a table the marks touch, so they can be tested without a DOM. */
export interface CellLike {
  rowSpan: number;
  classList: { contains(cls: string): boolean; toggle(cls: string, force: boolean): unknown };
}
export interface TableLike {
  rows: ArrayLike<{ cells: ArrayLike<CellLike> }>;
}

/**
 * Mark a rendered table's cells from its spans (header row first). A table
 * whose rows do not match the spans is left unmarked: that is a table this
 * rule did not read, and guessing would merge the wrong cells.
 */
export function applySpans(table: TableLike, spans: readonly (readonly number[])[] | null): void {
  if (spans === null || !anyReaching(spans) || table.rows.length !== spans.length) {
    clearSpans(table);
    return;
  }
  for (let r = 0; r < table.rows.length; r++) {
    const cells = table.rows[r]!.cells;
    const row = spans[r]!;
    for (let c = 0; c < cells.length; c++) {
      // A cell beyond the header's columns: nothing reaches into it.
      const span = row[c] ?? 1;
      mark(cells[c]!, span);
    }
  }
}

/** Take every mark away: the table as Obsidian drew it. */
export function clearSpans(table: TableLike): void {
  for (let r = 0; r < table.rows.length; r++) {
    const cells = table.rows[r]!.cells;
    for (let c = 0; c < cells.length; c++) mark(cells[c]!, 1);
  }
}

function mark(cell: CellLike, span: number): void {
  const rowSpan = Math.max(1, span);
  // Only what changes: a write, even of the same value, makes the browser lay
  // the table out again.
  if (cell.rowSpan !== rowSpan) cell.rowSpan = rowSpan;
  if (cell.classList.contains(REACHING_CLASS) !== span > 1) cell.classList.toggle(REACHING_CLASS, span > 1);
  if (cell.classList.contains(COVERED_CLASS) !== (span === 0)) cell.classList.toggle(COVERED_CLASS, span === 0);
}

/** A table's source lines from its first line on, up to its end (or a limit,
 *  so a runaway read cannot walk a whole note). */
export function tableLines(lineAt: (n: number) => string | null, first: number, limit = 2000): string[] {
  const out: string[] = [];
  for (let n = first; out.length < limit; n++) {
    const line = lineAt(n);
    if (line === null || (out.length >= 2 && (line.trim() === "" || !line.includes("|")))) break;
    out.push(line);
  }
  return out;
}

// MARK: Reading view

/** The post-processor: a rendered section with a table, read from its source. */
export function readingProcessor(enabled: () => boolean) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const table = el.querySelector("table");
    if (!table || !enabled()) return;
    // No section info for a table Obsidian renders from elsewhere (an embed,
    // a hover preview of a part of a note): then there is no source to read.
    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const lines = info.text.split("\n");
    applySpans(table, tableSpans(tableLines((n) => (n <= info.lineEnd ? lines[n] ?? null : null), info.lineStart)));
  };
}

// MARK: Live Preview

/** Every Live Preview editor the extension runs in, to apply again when the switch changes. */
const editors = new Set<TableWatcher>();

/** Apply again in every Live Preview editor: after the switch changed. */
export function refreshLivePreview(): void {
  for (const editor of editors) editor.schedule();
}

class TableWatcher implements PluginValue {
  private readonly observer: MutationObserver;
  private frame: number | null = null;

  constructor(private readonly view: EditorView, private readonly enabled: () => boolean) {
    // The widget draws its table after the editor's own update, and redraws
    // it when a cell is edited; its arrival in the DOM is what to wait for.
    // Only children: the marks themselves are attributes and classes, so
    // applying them does not wake the observer again.
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(view.contentDOM, { childList: true, subtree: true });
    editors.add(this);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) this.schedule();
  }

  /** Once per frame at most, however many changes arrive. */
  schedule(): void {
    if (this.frame !== null) return;
    const win = this.view.dom.ownerDocument.defaultView ?? window;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = null;
      this.apply();
    });
  }

  private apply(): void {
    const on = this.enabled();
    const doc = this.view.state.doc;
    this.view.contentDOM.querySelectorAll<HTMLTableElement>(".cm-table-widget table").forEach((table) => {
      if (!on) {
        clearSpans(table);
        return;
      }
      const widget = table.closest<HTMLElement>(".cm-table-widget") ?? table;
      let first: number;
      try {
        first = doc.lineAt(this.view.posAtDOM(widget)).number;
      } catch {
        clearSpans(table); // a widget on its way out
        return;
      }
      applySpans(table, tableSpans(tableLines((n) => (n <= doc.lines ? doc.line(n).text : null), first)));
    });
  }

  destroy(): void {
    this.observer.disconnect();
    if (this.frame !== null) (this.view.dom.ownerDocument.defaultView ?? window).cancelAnimationFrame(this.frame);
    editors.delete(this);
    this.view.contentDOM.querySelectorAll<HTMLTableElement>(".cm-table-widget table").forEach(clearSpans);
  }
}

/** The editor extension for Live Preview (and Source mode, which draws no tables and so has nothing to mark). */
export function livePreviewExtension(enabled: () => boolean) {
  return ViewPlugin.define((view) => new TableWatcher(view, enabled));
}
