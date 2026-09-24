import { describe, expect, it } from "vitest";
import { windowButtonPosition } from "../src/windowButtons";

// Pinned to Obsidian 1.13.7's own code and values. If Obsidian changes its
// formula these fail first, before the buttons land somewhere Obsidian no
// longer agrees with.
describe("windowButtonPosition — Obsidian's own formula", () => {
  it("gives Obsidian's default at its default variables: {x: 14, y: 12}", () => {
    expect(windowButtonPosition(40, 40, 1)).toEqual({ x: 14, y: 12 });
  });

  it("gives what Obsidian uses in a pop-out modal (32px on both axes)", () => {
    expect(windowButtonPosition(32, 32, 1)).toEqual({ x: 10, y: 8 });
  });

  it("moves only y for the alignment, 4px up", () => {
    expect(windowButtonPosition(40, 32, 1)).toEqual({ x: 14, y: 8 });
  });

  it("scales with the zoom, as Obsidian's does", () => {
    expect(windowButtonPosition(40, 40, 1.25)).toEqual({ x: 19, y: 17 });
  });

  it("clamps below −5 to 0, and treats a zero y as the default — as Obsidian does, and only on y", () => {
    expect(windowButtonPosition(0, 40, 1)).toEqual({ x: 2, y: 12 });
    expect(windowButtonPosition(40, 0, 1)).toEqual({ x: 14, y: 12 });
  });

  it("falls back to the default for an unreadable variable or zoom", () => {
    expect(windowButtonPosition(Number.NaN, Number.NaN, Number.NaN)).toEqual({ x: 14, y: 12 });
  });
});
