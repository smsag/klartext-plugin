import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { missingMarkers, quoteMarkers, quoteMarkersExtension } from "../src/quoteMarkers";

/** An editor holding `doc`, in Live Preview or not, with the switch on or off. */
function editor(doc: string, { live = true, on = true } = {}) {
  return EditorState.create({ doc, extensions: [quoteMarkersExtension(() => on, () => live)] });
}

/** Types `text` at `pos`, as a keystroke does. */
function type(state: EditorState, pos: number, text: string, userEvent = "input.type") {
  return state.update({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length), userEvent }).state;
}

/** Types `text` one character at a time from `pos`. */
function typeEach(state: EditorState, pos: number, text: string) {
  for (const ch of text) {
    state = type(state, pos, ch);
    pos = state.selection.main.head;
  }
  return state;
}

describe("quoteMarkers", () => {
  it("reads the markers that open a quote line, nested ones too", () => {
    expect(quoteMarkers("> text")).toBe("> ");
    expect(quoteMarkers(">text")).toBe(">");
    expect(quoteMarkers("> > deep")).toBe("> > ");
    expect(quoteMarkers("   > indented")).toBe("   > ");
    expect(quoteMarkers("text")).toBeNull();
    expect(quoteMarkers("    > code")).toBeNull();
  });
});

describe("missingMarkers", () => {
  it("gives a lazy line below a callout or quote line the line's markers", () => {
    expect(missingMarkers(["> [!quote]"], "Hype works")).toBe("> ");
    expect(missingMarkers(["> [!quote] Title", "> first line"], "second line")).toBe("> ");
    expect(missingMarkers(["> > nested"], "lazy")).toBe("> > ");
    expect(missingMarkers([">tight"], "lazy")).toBe("> ");
  });

  it("leaves a line alone that starts a block of its own", () => {
    for (const line of ["# Heading", "- item", "* item", "1. item", "```", "---", "<div>", "| a | b |", "$$", "> already"]) {
      expect(missingMarkers(["> text"], line), line).toBeNull();
    }
  });

  it("waits while a block's marker is still being typed", () => {
    for (const line of ["#", "-", "--", "1", "1.", "`", "``", "~", "$"]) expect(missingMarkers(["> text"], line), line).toBeNull();
    expect(missingMarkers(["> text"], "#tag")).toBe("> ");
    expect(missingMarkers(["> text"], "2. not a new list")).toBe("> ");
    expect(missingMarkers(["> text"], "1990 war es")).toBe("> ");
  });

  it("leaves a line alone below a quote line that cannot continue", () => {
    expect(missingMarkers(["> "], "text")).toBeNull();
    expect(missingMarkers([">"], "text")).toBeNull();
    expect(missingMarkers(["> # Heading"], "text")).toBeNull();
    expect(missingMarkers(["> ---"], "text")).toBeNull();
    expect(missingMarkers(["> ```"], "text")).toBeNull();
    expect(missingMarkers(["plain"], "text")).toBeNull();
    expect(missingMarkers([], "text")).toBeNull();
    expect(missingMarkers(["> text"], "")).toBeNull();
  });

  it("knows code inside the quote ends at its edge", () => {
    expect(missingMarkers(["> ```js", "> let a = 1"], "text")).toBeNull();
    expect(missingMarkers(["> ```js", "> let a = 1", "> ```", "> after"], "text")).toBe("> ");
    expect(missingMarkers(["outside", "> ```", "> code"], "text")).toBeNull();
  });
});

describe("quoteMarkersExtension", () => {
  it("writes the marker when text is typed below a callout header", () => {
    let state = editor("> [!quote]\n");
    state = typeEach(state, state.doc.length, "Hype");
    expect(state.doc.toString()).toBe("> [!quote]\n> Hype");
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("writes it on every line of a pasted paragraph", () => {
    let state = editor("> [!quote]\n");
    state = type(state, state.doc.length, "one\ntwo\nthree", "input.paste");
    expect(state.doc.toString()).toBe("> [!quote]\n> one\n> two\n> three");
  });

  it("stops at an empty line in a paste", () => {
    let state = editor("> [!quote]\n");
    state = type(state, state.doc.length, "one\n\nafter", "input.paste");
    expect(state.doc.toString()).toBe("> [!quote]\n> one\n\nafter");
  });

  it("marks an existing lazy line when it is typed in", () => {
    let state = editor("> [!quote]\nHype works");
    state = type(state, state.doc.length, ".");
    expect(state.doc.toString()).toBe("> [!quote]\n> Hype works.");
  });

  it("lets a list typed below a quote end it", () => {
    let state = editor("> text\n");
    state = typeEach(state, state.doc.length, "- item");
    expect(state.doc.toString()).toBe("> text\n- item");
  });

  it("does nothing in Source mode, with the switch off, or for a change not typed", () => {
    for (const options of [{ live: false }, { on: false }]) {
      let state = editor("> [!quote]\n", options);
      state = type(state, state.doc.length, "Hype");
      expect(state.doc.toString()).toBe("> [!quote]\nHype");
    }
    let state = editor("> [!quote]\n");
    state = state.update({ changes: { from: state.doc.length, insert: "Hype" } }).state;
    expect(state.doc.toString()).toBe("> [!quote]\nHype");
  });

  it("undoes with the keystroke, as one change", () => {
    const start = editor("> [!quote]\n");
    const tr = start.update({ changes: { from: start.doc.length, insert: "H" }, userEvent: "input.type" });
    expect(tr.state.doc.toString()).toBe("> [!quote]\n> H");
    expect(tr.changes.invert(start.doc).apply(tr.state.doc).toString()).toBe("> [!quote]\n");
  });
});
