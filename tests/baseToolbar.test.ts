import { describe, expect, it } from "vitest";
import { HIDE_BELOW, SHOW_AFTER, TOOLBAR_UNSEEN, nextToolbar, type ToolbarScroll } from "../src/baseToolbar";

const FAR = 100_000; // a foot no test reaches

function run(tops: number[], state: ToolbarScroll = TOOLBAR_UNSEEN, maxTop = FAR): ToolbarScroll {
  return tops.reduce((s, top) => nextToolbar(s, top, maxTop), state);
}

describe("nextToolbar", () => {
  it("hides once the base has scrolled down past the toolbar and by more than a wobble", () => {
    expect(run([0, 20, 40, 60, 80, 100]).hidden).toBe(true);
  });

  it("stays while the base is still near its top, so the first rows never jump", () => {
    expect(run([0, 20, 40, HIDE_BELOW]).hidden).toBe(false);
  });

  it("ignores a wobble", () => {
    expect(run([200, 210, 205, 215]).hidden).toBe(false);
  });

  it("takes a scroller's first position as the reference, deciding nothing on it", () => {
    // Obsidian restored the base at 800; the first touch moves it up.
    expect(run([800]).hidden).toBe(false);
    expect(run([800, 795]).hidden).toBe(false);
    expect(run([800, 795, 830]).hidden).toBe(true);
  });

  it("comes back on a run of scrolling up, measured from the deepest point", () => {
    const hidden = run([0, 100, 200, 300, 400]);
    expect(hidden.hidden).toBe(true);
    expect(run([390], hidden).hidden).toBe(true);
    expect(run([390, 400 - SHOW_AFTER], hidden).hidden).toBe(false);
  });

  it("comes back at the top whatever the distance", () => {
    expect(run([0, 100, 200, 0]).hidden).toBe(false);
  });

  it("does not flicker at the foot of a base, where collapsing clamps scrollTop back up", () => {
    // Hidden at the foot (2000); the scroller grows by 52px over the slide and
    // the browser clamps scrollTop down with it, frame by frame.
    let s = run([1900, 1950, 2000], TOOLBAR_UNSEEN, 2000);
    expect(s.hidden).toBe(true);
    for (let foot = 1990; foot >= 1948; foot -= 7) s = nextToolbar(s, foot, foot);
    expect(s.hidden).toBe(true);
    // A real step up from the foot still counts.
    s = nextToolbar(s, 1948 - SHOW_AFTER, 1948);
    expect(s.hidden).toBe(false);
  });

  it("ignores a position that is not a number", () => {
    const s = run([100]);
    expect(nextToolbar(s, Number.NaN, FAR)).toBe(s);
  });
});
