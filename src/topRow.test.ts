import { describe, expect, it } from "vitest";
import {
  HIDE_DELAY_MS,
  IDLE_POLL_MS,
  INITIAL,
  NEAR_CSS,
  inTopBand,
  nextState,
  shouldPoll,
  windowButtonsVisible,
} from "./topRow";

const win = { x: 100, y: 50, width: 1000, height: 800 };

describe("inTopBand", () => {
  it("is the window's top band, across its full width", () => {
    expect(inTopBand({ x: 100, y: 50 }, win, 40, 1)).toBe(true); // top-left corner
    expect(inTopBand({ x: 1099, y: 89 }, win, 40, 1)).toBe(true); // last pixel inside
    expect(inTopBand({ x: 600, y: 90 }, win, 40, 1)).toBe(false); // one below
    expect(inTopBand({ x: 1100, y: 60 }, win, 40, 1)).toBe(false); // right of the window
    expect(inTopBand({ x: 99, y: 60 }, win, 40, 1)).toBe(false); // left of the window
    expect(inTopBand({ x: 600, y: 49 }, win, 40, 1)).toBe(false); // above it, e.g. the menu bar
  });

  it("scales the band with the page zoom, so zooming in does not shrink it under the row", () => {
    // At 150% a 40px row is 60 screen pixels tall.
    expect(inTopBand({ x: 600, y: 50 + 59 }, win, 40, 1.5)).toBe(true);
    expect(inTopBand({ x: 600, y: 50 + 59 }, win, 40, 1)).toBe(false);
  });

  it("is empty for a nonsense band or zoom rather than the whole window", () => {
    expect(inTopBand({ x: 600, y: 60 }, win, 0, 1)).toBe(false);
    expect(inTopBand({ x: 600, y: 60 }, win, Number.NaN, 1)).toBe(false);
    expect(inTopBand({ x: 600, y: 60 }, win, 40, 0)).toBe(false);
    expect(inTopBand({ x: 600, y: 60 }, win, 40, -1)).toBe(false);
  });
});

describe("nextState", () => {
  const idle = { inBand: false, focusInRow: false, held: false };

  it("reveals the row when the pointer enters the band", () => {
    expect(nextState(INITIAL, { ...idle, inBand: true, now: 0 })).toEqual({ shown: true, leftAt: null });
  });

  it("reveals it for keyboard focus inside the row, pointer or not", () => {
    expect(nextState(INITIAL, { ...idle, focusInRow: true, now: 0 }).shown).toBe(true);
  });

  it("keeps it for the delay after the pointer leaves, then hides it", () => {
    let s = nextState(INITIAL, { ...idle, inBand: true, now: 0 });
    s = nextState(s, { ...idle, now: 1000 });
    expect(s).toEqual({ shown: true, leftAt: 1000 });
    s = nextState(s, { ...idle, now: 1000 + HIDE_DELAY_MS - 1 });
    expect(s.shown).toBe(true);
    s = nextState(s, { ...idle, now: 1000 + HIDE_DELAY_MS });
    expect(s).toEqual(INITIAL);
  });

  it("restarts the delay when the pointer comes back before it runs out", () => {
    let s = nextState(INITIAL, { ...idle, inBand: true, now: 0 });
    s = nextState(s, { ...idle, now: 100 });
    s = nextState(s, { ...idle, inBand: true, now: 200 });
    s = nextState(s, { ...idle, now: 300 });
    s = nextState(s, { ...idle, now: 300 + HIDE_DELAY_MS - 1 });
    expect(s.shown).toBe(true);
  });

  it("holds a shown row while something it opened is open, however long", () => {
    let s = nextState(INITIAL, { ...idle, inBand: true, now: 0 });
    s = nextState(s, { ...idle, held: true, now: 10_000 });
    expect(s.shown).toBe(true);
    // Released: the delay starts from the release, not from when the pointer left.
    s = nextState(s, { ...idle, now: 20_000 });
    expect(s).toEqual({ shown: true, leftAt: 20_000 });
  });

  it("never reveals a hidden row because of a hold: a menu opened in the note is not the row's", () => {
    expect(nextState(INITIAL, { ...idle, held: true, now: 0 })).toEqual(INITIAL);
  });
});

describe("windowButtonsVisible", () => {
  it("follows the row when the setting is on and the frame is hidden", () => {
    expect(windowButtonsVisible(true, true, false, true)).toBe(true);
    expect(windowButtonsVisible(false, true, false, true)).toBe(false);
  });

  it("never hides them when the setting is off", () => {
    expect(windowButtonsVisible(false, false, false, true)).toBe(true);
  });

  it("leaves them to macOS in fullscreen, where a window cannot hide them", () => {
    expect(windowButtonsVisible(false, true, true, true)).toBe(true);
  });

  it("never hides them in a title bar above the page, where no pointer in the band could bring them back", () => {
    expect(windowButtonsVisible(false, true, false, false)).toBe(true);
  });
});

describe("shouldPoll", () => {
  const base = { now: 10_000, shown: false, lastPollAt: 0, bandCss: 40 };
  const deep = { y: 400, at: 10_000 };

  it("asks once after the pointer settles deep in the note, then only at the heartbeat", () => {
    // moved at 10 000, confirmed at 10 150
    expect(shouldPoll({ ...base, now: 10_100, pointer: deep, lastPollAt: 9_900 })).toBe(false); // not settled yet
    expect(shouldPoll({ ...base, now: 10_150, pointer: deep, lastPollAt: 9_900 })).toBe(true); // the confirming ask
    expect(shouldPoll({ ...base, now: 10_400, pointer: deep, lastPollAt: 10_150 })).toBe(false);
    expect(shouldPoll({ ...base, now: 10_150 + IDLE_POLL_MS - 1, pointer: deep, lastPollAt: 10_150 })).toBe(false);
    expect(shouldPoll({ ...base, now: 10_150 + IDLE_POLL_MS, pointer: deep, lastPollAt: 10_150 })).toBe(true); // heartbeat
  });

  it("keeps the heartbeat going however long the pointer rests, so a pointer that reached the band without an event is found", () => {
    expect(shouldPoll({ ...base, now: 60_000, pointer: deep, lastPollAt: 60_000 - IDLE_POLL_MS })).toBe(true);
  });

  it("asks again after the pointer moves and settles again", () => {
    const moved = { y: 420, at: 20_000 };
    expect(shouldPoll({ ...base, now: 20_150, pointer: moved, lastPollAt: 10_150 })).toBe(true);
  });

  it("asks at the fast rate near the top, where a drag handle hides the pointer", () => {
    const near = { y: 40 + NEAR_CSS - 1, at: 10_000 };
    expect(shouldPoll({ ...base, now: 10_099, pointer: near, lastPollAt: 10_000 })).toBe(false);
    expect(shouldPoll({ ...base, now: 10_100, pointer: near, lastPollAt: 10_000 })).toBe(true);
  });

  it("asks at the fast rate while the row is shown, to notice the pointer leaving across the strip", () => {
    expect(shouldPoll({ ...base, shown: true, pointer: deep, now: 10_100, lastPollAt: 10_000 })).toBe(true);
    expect(shouldPoll({ ...base, shown: true, pointer: deep, now: 10_050, lastPollAt: 10_000 })).toBe(false);
  });

  it("asks at the slow rate when the pointer is outside the window or not yet seen", () => {
    expect(shouldPoll({ ...base, pointer: null, now: 10_299, lastPollAt: 10_000 })).toBe(false);
    expect(shouldPoll({ ...base, pointer: null, now: 10_300, lastPollAt: 10_000 })).toBe(true);
  });
});
