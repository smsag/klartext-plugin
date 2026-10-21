// Table cells reaching down: the rule, without the DOM.
//
// A Markdown table row with fewer cells than the header leaves its missing
// last columns to the cell above it, which then reaches down over the row,
// to the next row that has a cell in that column again:
//
//   | Spalte 1 | Spalte 2 | Spalte 3 |
//   | --- | --- | --- |
//   | content | Content | content |     ← "content" reaches down over
//   | content | content |                  both rows below it
//   | Content | Content |
//
// Only missing cells, never empty ones: `|  |` is a cell with nothing in it.
// The header never reaches down, so a cell missing from the first body row
// stays empty, and so does the column below it until a row has the cell.
//
// The rule has to be read from the source. In Obsidian's rendered table a
// missing cell is an empty <td> like any other, which is also why a theme
// cannot do this: CSS has no rowspan.

/** A row's cells: split at the pipes that are not escaped (`\|`) and not
 *  inside inline code. A pipe at either end frames the row. A backtick run
 *  opens code only when a run of the same length closes it later in the row;
 *  an unmatched one is a literal backtick, as in Markdown, and the pipes after
 *  it still split. */
export function splitRow(line: string): string[] {
  const runs = backtickRuns(line);
  const bounds: number[] = [];
  let code = 0;
  let at = 0;
  let next = 0;
  while (at < line.length) {
    const ch = line[at];
    if (ch === "\\") {
      at += 2;
      continue;
    }
    if (ch === "`") {
      const run = runs[next++]!;
      if (code === 0) {
        if (runs.slice(next).some((r) => r.length === run.length)) code = run.length;
      } else if (code === run.length) {
        code = 0;
      }
      at += run.length;
      continue;
    }
    if (ch === "|" && code === 0) bounds.push(at);
    at++;
  }
  const cells: string[] = [];
  let start = 0;
  for (const bound of [...bounds, line.length]) {
    cells.push(line.slice(start, bound));
    start = bound + 1;
  }
  const trimmed = line.trim();
  if (trimmed.startsWith("|")) cells.shift();
  if (bounds.length > 0 && trimmed.endsWith("|") && !trimmed.endsWith("\\|") && cells.length > 0) cells.pop();
  return cells;
}

/** The row's backtick runs that are not escaped, in order, each with its length. */
function backtickRuns(line: string): { length: number }[] {
  const runs: { length: number }[] = [];
  for (let at = 0; at < line.length; ) {
    if (line[at] === "\\") {
      at += 2;
      continue;
    }
    if (line[at] !== "`") {
      at++;
      continue;
    }
    let length = 1;
    while (line[at + length] === "`") length++;
    runs.push({ length });
    at += length;
  }
  return runs;
}

const DELIMITER =/^\|?\s*:?-+:?(?:\s*\|\s*:?-+:?)*\s*\|?$/;

/** The row under a table's header: `| --- | :-: |`. */
export function isDelimiter(line: string): boolean {
  return DELIMITER.test(line.trim());
}

/**
 * How many rows each cell reaches down, for a table's source lines (header,
 * delimiter, body rows; the lines after the table may follow and are left
 * out). One entry per row, header first and the delimiter row skipped, with
 * one number per column: 1 for a cell of its own (or an empty one), more for
 * a cell reaching down over the rows below, 0 for a missing cell that a cell
 * above covers. `null` when the lines do not start with a table.
 */
export function tableSpans(lines: readonly string[]): number[][] | null {
  const header = lines[0];
  const delimiter = lines[1];
  if (header === undefined || delimiter === undefined || !header.includes("|") || !isDelimiter(delimiter)) return null;
  const columns = splitRow(header).length;
  if (columns === 0 || splitRow(delimiter).length !== columns) return null;
  const counts = [columns];
  for (const line of lines.slice(2)) {
    if (line.trim() === "" || !line.includes("|")) break;
    counts.push(Math.min(columns, splitRow(line).length));
  }
  const spans = counts.map(() => new Array<number>(columns).fill(1));
  for (let column = 0; column < columns; column++) {
    let owner: number | null = null;
    for (let row = 1; row < counts.length; row++) {
      if (column < counts[row]!) {
        owner = row;
      } else if (owner !== null) {
        spans[owner]![column]!++;
        spans[row]![column] = 0;
      }
    }
  }
  return spans;
}

/** Whether any cell reaches down: a table without one is left as it is. */
export function anyReaching(spans: readonly (readonly number[])[]): boolean {
  return spans.some((row) => row.some((span) => span !== 1));
}
