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
import { blockLanguage, detectLanguage, noteLanguage, proseOf } from "./language";

/** The body class styles.css keys hyphenation on. */
export const HYPHENATE_CLASS = "klartext-hyphenate";

/** The blocks in Reading view that may be in another language than the note. */
const BLOCKS = "p, li, td, th";

// MARK: Reading view

/** The post-processor: the section's language on the section, a block's own on the block. */
export function hyphenationProcessor(enabled: () => boolean, fallback: () => string) {
  // Every section of a note is handed the same source: read it once.
  let lastSource: string | null = null;
  let lastLang: string | null = null;
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    if (!enabled()) return;
    // No section info for a part of a note rendered elsewhere (a hover
    // preview, an embed's heading): then the part itself is all there is.
    const info = ctx.getSectionInfo(el);
    const source = info?.text ?? el.textContent ?? "";
    if (source !== lastSource) {
      lastSource = source;
      lastLang = info ? noteLanguage(source) : detectLanguage(source);
    }
    const note = lastLang ?? fallback();
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
    if (update.docChanged || asked) this.read(true);
    else if (update.viewportChanged) this.read(false);
  }

  private read(note: boolean): void {
    if (!this.enabled()) {
      this.lang = null;
      this.decorations = Decoration.none;
      return;
    }
    const doc = this.view.state.doc;
    if (note || this.lang === null) this.lang = noteLanguage(doc.sliceString(0, 20000)) ?? this.fallback();
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
