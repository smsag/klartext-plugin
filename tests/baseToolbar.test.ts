import { describe, expect, it } from "vitest";
import { TOOLBAR_UNSEEN, followScroll, settleOffset, type ToolbarScroll } from "../src/baseToolbar";

const H = 52;
const FAR = 100_000;

function run(tops: number[], state: ToolbarScroll = TOOLBAR_UNSEEN, maxTop = FAR): ToolbarScroll {
  return tops.reduce((s, top) => followScroll(s, top, maxTop, H), state);
}

describe("followScroll", () => {
  it("pushes the toolbar up by exactly the distance scrolled, until it is gone", () => {
    expect(run([0, 10]).offset).toBe(10);
    expect(run([0, 10, 30]).offset).toBe(30);
    expect(run([0, 10, 30, 200]).offset).toBe(H);
  });

  it("pulls it back by the distance scrolled up, from wherever the base is", () => {
    const gone = run([0, 500, 900]);
    expect(gone.offset).toBe(H);
    expect(run([880], gone).offset).toBe(H - 20);
    expect(run([880, 840], gone).offset).toBe(0);
  });

  it("is always all there at the top, and never pushed further than the base has scrolled", () => {
    expect(run([0, 500, 0]).offset).toBe(0);
    // Restored at 30 with the toolbar gone: it can be pushed no further than 30.
    expect(followScroll({ top: 500, offset: H }, 30, FAR, H).offset).toBe(0);
    expect(followScroll({ top: 20, offset: 20 }, 40, FAR, H).offset).toBe(40);
    expect(followScroll({ top: 0, offset: 0 }, 20, FAR, H).offset).toBe(20);
  });

  it("takes a scroller's first position as the reference", () => {
    // Obsidian restored the base at 800: the first event moves nothing.
    expect(run([800]).offset).toBe(0);
    expect(run([800, 790]).offset).toBe(0);
    expect(run([800, 830]).offset).toBe(30);
  });

  it("does not move on iOS's rubber band at either end", () => {
    expect(run([0, -40, 0]).offset).toBe(0);
    const atFoot = run([900, 1000], TOOLBAR_UNSEEN, 1000);
    expect(run([1060, 1000], atFoot, 1000).offset).toBe(atFoot.offset);
  });

  it("ignores a position that is not a number, and a toolbar with no height", () => {
    const s = run([100]);
    expect(followScroll(s, Number.NaN, FAR, H)).toBe(s);
    expect(followScroll(s, 200, FAR, 0)).toBe(s);
  });
});

describe("settleOffset", () => {
  it("leaves a toolbar that is all there or all gone where it is", () => {
    expect(settleOffset({ top: 500, offset: 0 }, H)).toBe(0);
    expect(settleOffset({ top: 500, offset: H }, H)).toBe(H);
  });

  it("settles a half-way toolbar to the nearer end", () => {
    expect(settleOffset({ top: 500, offset: 30 }, H)).toBe(H);
    expect(settleOffset({ top: 500, offset: 20 }, H)).toBe(0);
  });

  it("brings it back near the top, where hiding it would leave a gap above the first row", () => {
    expect(settleOffset({ top: 40, offset: 40 }, H)).toBe(0);
  });
});
