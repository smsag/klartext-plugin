import { describe, expect, it } from "vitest";
import { inFencedCode, lazyLines, markers, quoteOf, quotePaste, repairQuotes } from "../src/quotes";

describe("quoteOf", () => {
  it("reads the depth, the indent and the content", () => {
    expect(quoteOf("> text")).toEqual({ indent: "", depth: 1, content: "text" });
    expect(quoteOf(">text")).toEqual({ indent: "", depth: 1, content: "text" });
    expect(quoteOf("> > text")).toEqual({ indent: "", depth: 2, content: "text" });
    expect(quoteOf("  > [!quote]")).toEqual({ indent: "  ", depth: 1, content: "[!quote]" });
    expect(quoteOf(">")).toEqual({ indent: "", depth: 1, content: "" });
  });

  it("says nothing for a line without >", () => {
    expect(quoteOf("text > not a quote")).toBeNull();
    expect(quoteOf("")).toBeNull();
  });
});

describe("markers", () => {
  it("writes a space after the last > for text, none for a blank line", () => {
    expect(markers(1)).toBe("> ");
    expect(markers(2)).toBe("> > ");
    expect(markers(2, true)).toBe("> >");
  });
});

describe("repairQuotes", () => {
  it("puts a callout's slipped-out text back into it", () => {
    const note = "> [!quote]\nHype works by cannibalizing the accumulated expectations.\n\nAfter.";
    expect(repairQuotes(note)).toEqual({
      text: "> [!quote]\n> Hype works by cannibalizing the accumulated expectations.\n\nAfter.",
      repaired: 1,
    });
  });

  it("carries on through every line of the paragraph, at the quote's depth and indent", () => {
    expect(repairQuotes("> > a\nb\nc").text).toBe("> > a\n> > b\n> > c");
    expect(repairQuotes("  > a\nb").text).toBe("  > a\n  > b");
  });

  it("continues a list item's text inside a quote", () => {
    expect(repairQuotes("> - item\nmore").text).toBe("> - item\n> more");
  });

  it("leaves a line that starts a block of its own: it ends the quote", () => {
    for (const next of ["## Heading", "- item", "* item", "1. first", "```", "---", "<div>", "$$", "[^1]: note", "%% comment %%"]) {
      expect(lazyLines(`> quote\n${next}`), next).toEqual([]);
    }
  });

  it("repairs what Markdown runs on, even when it looks like a list: only 1. may interrupt", () => {
    expect(lazyLines("> quote\n2. second")).toEqual([{ line: 1, insert: "> " }]);
  });

  it("leaves a line after a blank quote line, a heading or a code block in the quote", () => {
    expect(lazyLines(">\ntext")).toEqual([]);
    expect(lazyLines("> \ntext")).toEqual([]);
    expect(lazyLines("> ## Heading\ntext")).toEqual([]);
    expect(lazyLines("> ```\n> code\ntext")).toEqual([]);
    expect(lazyLines("> ```\n> code\n> ```\ntext")).toEqual([]);
  });

  it("leaves a quote after a blank line, and text after a blank line", () => {
    expect(lazyLines("> quote\n\ntext")).toEqual([]);
  });

  it("skips the frontmatter and code outside quotes", () => {
    expect(lazyLines("---\nquote: >\n  folded\n---\n> a\nb")).toEqual([{ line: 5, insert: "> " }]);
    expect(lazyLines("```\n> in code\ntext\n```\n> a\nb")).toEqual([{ line: 5, insert: "> " }]);
    expect(lazyLines("~~~~\n```\n> in code\ntext\n~~~~")).toEqual([]);
  });

  it("changes nothing in a note without lazy lines", () => {
    const note = "# Title\n\n> [!note]\n> All here.\n\nText.";
    expect(repairQuotes(note)).toEqual({ text: note, repaired: 0 });
  });

  it("keeps Windows line endings", () => {
    expect(repairQuotes("> a\r\nb\r\n").text).toBe("> a\r\n> b\r\n");
  });
});

describe("inFencedCode", () => {
  it("knows a > line in a code block for code", () => {
    const lines = ["text", "```md", "> quoted in code", "```", "> a real quote"];
    expect(inFencedCode(lines, 2)).toBe(true);
    expect(inFencedCode(lines, 4)).toBe(false);
  });

  it("closes a fence only with its own kind, at least as long", () => {
    expect(inFencedCode(["````", "```", "> x"], 2)).toBe(true);
    expect(inFencedCode(["~~~", "```", "> x"], 2)).toBe(true);
  });
});

describe("quotePaste", () => {
  it("leaves a paste outside a quote, and a single line, to Obsidian", () => {
    expect(quotePaste("text", "a\nb")).toBeNull();
    expect(quotePaste("> ", "one line")).toBeNull();
  });

  it("drops the line break a paste starts with, right after the markers", () => {
    expect(quotePaste("> ", "\nHype works.\nSecond line.")).toBe("Hype works.\n> Second line.");
    expect(quotePaste("> ", "\n\nHype works.")).toBe("Hype works.");
  });

  it("keeps one line break after a callout's title, and quotes the line it starts", () => {
    expect(quotePaste("> [!quote]", "\nHype works.")).toBe("\n> Hype works.");
  });

  it("gives every following line the quote's markers, a blank one the bare >", () => {
    expect(quotePaste("> ", "a\n\nb")).toBe("a\n>\n> b");
    expect(quotePaste("  > > ", "a\nb")).toBe("a\n  > > b");
  });

  it("keeps the space after > on the last line, where the rest of the line goes on", () => {
    expect(quotePaste("> ", "a\nb\n")).toBe("a\n> b\n> ");
  });

  it("normalises Windows and old Mac line endings", () => {
    expect(quotePaste("> ", "a\r\nb\rc")).toBe("a\n> b\n> c");
  });

  it("leaves a quote pasted into a quote to Obsidian: its own > say where it goes", () => {
    expect(quotePaste("> ", "> a\n> b")).toBeNull();
  });
});
