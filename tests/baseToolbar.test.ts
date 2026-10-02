import { describe, expect, it } from "vitest";
import { HIDE_AFTER, HIDE_BELOW, QUIET_MS, TOOLBAR_SHOWN, nextToolbar, type ToolbarScroll } from "../src/baseToolbar";

/** Feeds scroll positions one frame (16ms) apart, starting at `start` ms. */
function run(tops: number[], state: ToolbarScroll = TOOLBAR_SHOWN, start = 1000): ToolbarScroll {
  let s = state;
  tops.forEach((top, i) => (s = nextToolbar(s, top, start + i * 16)));
  return s;
}

describe("nextToolbar", () => {
  it("hides once the base has scrolled down past the toolbar and by more than a wobble", () => {
    expect(run([0, 20, 40, 60, 80, 100]).hidden).toBe(true);
  });

  it("stays while the base is still near its top, so the first rows never jump", () => {
    expect(run([0, 20, 40, HIDE_BELOW]).hidden).toBe(false);
  });

  it("ignores a wobble", () => {
    expect(run([210, 205, 215], { ...TOOLBAR_SHOWN, top: 200, anchor: 200 }).hidden).toBe(false);
  });

  it("comes back on a run of scrolling up, measured from the deepest point", () => {
    const hidden = run([0, 100, 200, 300]);
    expect(hidden.hidden).toBe(true);
    const later = hidden.quietUntil + 1;
    let s = nextToolbar(hidden, 400, later);
    expect(s.hidden).toBe(true);
    s = nextToolbar(s, 390, later + 16);
    expect(s.hidden).toBe(true);
    s = nextToolbar(s, 400 - HIDE_AFTER, later + 32);
    expect(s.hidden).toBe(false);
  });

  it("comes back at the top whatever the distance", () => {
    const hidden = run([0, 100, 200]);
    expect(nextToolbar(hidden, 0, hidden.quietUntil + 1).hidden).toBe(false);
  });

  it("does not flicker at the foot of a base, where collapsing clamps scrollTop back up", () => {
    // Hidden at 2000; the scroller grows by 52px and the browser clamps to 1948.
    const hidden = run([1900, 1950, 2000]);
    expect(hidden.hidden).toBe(true);
    const clamped = nextToolbar(hidden, 1948, hidden.quietUntil - QUIET_MS + 20);
    expect(clamped.hidden).toBe(true);
    // After the quiet spell, the clamped position is the new reference: a
    // finger still pressing down does not read as scrolling up.
    expect(nextToolbar(clamped, 1948, hidden.quietUntil + 1).hidden).toBe(true);
  });

  it("ignores a position that is not a number", () => {
    expect(nextToolbar(TOOLBAR_SHOWN, Number.NaN, 0)).toBe(TOOLBAR_SHOWN);
  });
});
