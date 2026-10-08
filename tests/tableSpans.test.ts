import { describe, expect, it } from "vitest";
import { COVERED_CLASS, REACHING_CLASS, applySpans, clearSpans, tableLines } from "../src/tableCells";
import { anyReaching, isDelimiter, splitRow, tableSpans } from "../src/tableSpans";

const lines = (text: string) => text.split("\n");

describe("splitRow", () => {
  it("splits at pipes, the outer ones framing the row", () => {
    expect(splitRow("| a | b |")).toEqual([" a ", " b "]);
    expect(splitRow("a | b")).toEqual(["a ", " b"]);
  });

  it("keeps escaped pipes and pipes inside inline code in their cell", () => {
    expect(splitRow("| a \\| b | `c | d` |")).toEqual([" a \\| b ", " `c | d` "]);
  });

  it("finds no cells in a row of nothing but a pipe", () => {
    expect(splitRow("|")).toEqual([]);
  });
});

describe("isDelimiter", () => {
  it("knows the row under the header", () => {
    expect(isDelimiter("| --- | :-: | --: |")).toBe(true);
    expect(isDelimiter("--|--")).toBe(true);
    expect(isDelimiter("| a | b |")).toBe(false);
  });
});

describe("tableSpans", () => {
  it("leaves a missing last cell's column to the cell above", () => {
    const table = "| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- |\n| content | Content | content |\n| content | content |\n| Content | Content |";
    expect(tableSpans(lines(table))).toEqual([[1, 1, 1], [1, 1, 3], [1, 1, 0], [1, 1, 0]]);
  });

  it("reaches down to the next row with a cell in the column", () => {
    const table = "| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 |\n| 5 | 6 |\n| 7 | 8 | 9 |";
    expect(tableSpans(lines(table))).toEqual([[1, 1, 1], [1, 2, 3], [1, 0, 0], [1, 1, 0], [1, 1, 1]]);
  });

  it("never lets the header reach down", () => {
    expect(tableSpans(lines("| a | b |\n|---|---|\n| 1 |\n| 2 |\n| 3 | x |"))).toEqual([[1, 1], [1, 1], [1, 1], [1, 1]]);
  });

  it("does not take an empty cell for a missing one", () => {
    expect(tableSpans(lines("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |  |"))).toEqual([[1, 1], [1, 1], [1, 1]]);
  });

  it("ignores cells beyond the header's, and stops at the end of the table", () => {
    expect(tableSpans(lines("| a | b |\n|---|---|\n| 1 | 2 | 3 |\n| 4 |\n\n| 5 |"))).toEqual([[1, 1], [1, 2], [1, 0]]);
  });

  it("is not a table without its delimiter row", () => {
    expect(tableSpans(lines("| a | b |\n| 1 | 2 |"))).toBeNull();
    expect(tableSpans(lines("| a | b |\n|---|"))).toBeNull();
    expect(tableSpans([])).toBeNull();
  });
});

describe("anyReaching", () => {
  it("is false for a table whose rows all have their cells", () => {
    expect(anyReaching(tableSpans(lines("| a | b |\n|---|---|\n| 1 | 2 |"))!)).toBe(false);
    expect(anyReaching(tableSpans(lines("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |"))!)).toBe(true);
  });
});

describe("applySpans", () => {
  /** A table as plain objects: `counts[r]` cells in row r. */
  const fake = (counts: number[]) => ({
    rows: counts.map((n) => ({
      cells: Array.from({ length: n }, () => {
        const classes = new Set<string>();
        return {
          rowSpan: 1,
          classList: {
            contains: (c: string) => classes.has(c),
            toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
          },
          classes,
        };
      }),
    })),
  });
  const state = (table: ReturnType<typeof fake>) =>
    table.rows.map((row) => row.cells.map((c) => (c.classes.has(COVERED_CLASS) ? 0 : c.classes.has(REACHING_CLASS) ? c.rowSpan : 1)));
  const spans = [[1, 1, 1], [1, 1, 3], [1, 1, 0], [1, 1, 0]];

  it("lets a cell reach down and hides the cells it covers, which Obsidian drew empty", () => {
    const table = fake([3, 3, 3, 3]);
    applySpans(table, spans);
    expect(state(table)).toEqual(spans);
    expect(table.rows[1]!.cells[2]!.rowSpan).toBe(3);
  });

  it("works the same where the missing cells were never drawn", () => {
    const table = fake([3, 3, 2, 2]);
    applySpans(table, spans);
    expect(state(table)).toEqual([[1, 1, 1], [1, 1, 3], [1, 1], [1, 1]]);
  });

  it("takes every mark away again, also for a table it cannot match", () => {
    const table = fake([3, 3, 3, 3]);
    applySpans(table, spans);
    clearSpans(table);
    expect(state(table)).toEqual([[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]);
    applySpans(table, spans);
    applySpans(table, spans.slice(0, 3)); // one row more than the source says
    expect(state(table)).toEqual([[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]);
    expect(table.rows[1]!.cells[2]!.rowSpan).toBe(1);
  });
});

describe("tableLines", () => {
  const note = ["Text", "| a | b |", "|---|---|", "| 1 |", "", "| x |"];
  const at = (n: number) => note[n] ?? null;

  it("reads a table from its first line to its end", () => {
    expect(tableLines(at, 1)).toEqual(["| a | b |", "|---|---|", "| 1 |"]);
  });

  it("stops at the end of the note and at its limit", () => {
    expect(tableLines((n) => (n < 3 ? `| ${n} |` : null), 0)).toHaveLength(3);
    expect(tableLines(() => "| a |", 0, 5)).toHaveLength(5);
  });
});
