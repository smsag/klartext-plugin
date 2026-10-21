// Automatic hyphenation: the language of a note, on the note, so the browser
// can break long words at their syllables. styles.css turns hyphenation on for
// the note's prose while the switch's body class is set; a browser hyphenates
// only text whose `lang` it has a dictionary for, and this module supplies the
// `lang`, read from the note's words (src/language.ts has the rule).
//
// The note gets one language, and a block written in another one (an English
// quote in a German note) gets its own. In Reading view on each rendered
// section and its paragraphs, list items and table cells; in Live Preview on
// the editor's content and on each line.

import { StateEffect, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { MarkdownPostProcessorContext } from "obsidian";
import { NOTE_SAMPLE, blockLanguage, detectLanguage, noteLanguage, proseOf } from "./language";
import { lastValue } from "./lastValue";
import { warnOnce } from "./log";

/** The body class styles.css keys hyphenation on. */
export const HYPHENATE_CLASS = "klartext-hyphenate";

/** The blocks in Reading view that may be in another language than the note. */
const BLOCKS = "p, li, td, th";

// MARK: Reading view

/** The post-processor: the section's language on the section, a block's own on the block. */
export function hyphenationProcessor(enabled: () => boolean, fallback: () => string) {
  // Every section of a note is handed the whole note: read its language once.
  const notes = lastValue((text: string) => noteLanguage(text));
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    if (!enabled()) return;
    // No section info for a part of a note rendered elsewhere (a hover
    // preview, an embed's heading): then the part itself is all there is,
    // read on its own and never through the note's cache.
    const info = ctx.getSectionInfo(el);
    const lang = info ? notes.get(info.text) : detectLanguage(el.textContent ?? "");
    const note = lang ?? fallback();
    el.setAttribute("lang", note);
    el.querySelectorAll<HTMLElement>(BLOCKS).forEach((block) => {
      const own = blockLanguage(block.textContent ?? "", note);
      if (own) block.setAttribute("lang", own);
    });
  };
}

// MARK: Live Preview

/** Asks every editor to read its languages again: after the switch changed. */
const refresh = StateEffect.define<null>();
const editors = new Set<EditorView>();

export function refreshHyphenation(): void {
  for (const view of editors) view.dispatch({ effects: refresh.of(null) });
}

class LanguageLines implements PluginValue {
  /** The note's language, for the editor's content; null while the switch is off. */
  lang: string | null = null;
  decorations: DecorationSet = Decoration.none;

  constructor(private readonly view: EditorView, private readonly enabled: () => boolean, private readonly fallback: () => string) {
    editors.add(view);
    this.read(true);
  }

  update(update: ViewUpdate): void {
    const asked = update.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)));
    // The note's language is read from its first stretch only, so typing
    // further down changes nothing there: only the lines are read again.
    const sampleEdited = update.docChanged && update.changes.touchesRange(0, NOTE_SAMPLE);
    if (asked || sampleEdited) this.read(true);
    else if (update.docChanged || update.viewportChanged) this.read(false);
  }

  /** The languages again; a failure keeps the last ones and is logged once,
   *  rather than switching the extension off for the rest of the session. */
  private read(note: boolean): void {
    try {
      this.readLanguages(note);
    } catch (e) {
      warnOnce("reading a note's language in Live Preview", e);
    }
  }

  private readLanguages(note: boolean): void {
    if (!this.enabled()) {
      this.lang = null;
      this.decorations = Decoration.none;
      return;
    }
    const doc = this.view.state.doc;
    if (note || this.lang === null) this.lang = noteLanguage(doc.sliceString(0, NOTE_SAMPLE)) ?? this.fallback();
    // Only the lines on screen: a line scrolled to is read when it arrives.
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of this.view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = doc.lineAt(pos);
        const own = blockLanguage(proseOf(line.text), this.lang);
        if (own) builder.add(line.from, line.from, Decoration.line({ attributes: { lang: own } }));
        pos = line.to + 1;
      }
    }
    this.decorations = builder.finish();
  }

  destroy(): void {
    editors.delete(this.view);
  }
}

/** The editor extension: the note's language on the content, a line's own on the line. */
export function hyphenationExtension(enabled: () => boolean, fallback: () => string) {
  const plugin = ViewPlugin.define((view) => new LanguageLines(view, enabled, fallback), {
    decorations: (v) => v.decorations,
    provide: (p) =>
      EditorView.contentAttributes.of((view) => {
        const lang = view.plugin(p)?.lang;
        return lang ? { lang } : null;
      }),
  });
  return plugin;
}
