// How far a base's toolbar has stepped aside: the decision, kept apart from
// the DOM.
//
// The toolbar (views, results, sort, filter, properties, search, +) sits above
// the base on a phone and takes 52px of a short screen. It follows the finger
// rather than switching: scrolling down pushes it up by exactly the distance
// scrolled until it is gone, scrolling up pulls it back the same way, as a
// browser's address bar does. A switch with a timed slide read as the bar
// being "suddenly gone" (reported on an iPhone). Where scrolling stops with
// the toolbar half way, it settles to whichever end is nearer.
//
// The toolbar floats over the base (styles.css), so moving it changes no
// layout and no scroll position: nothing for the browser to clamp, and the
// foot of a base needs no special case.

export interface ToolbarScroll {
  /** The scroll position last seen, kept within the scroller; NaN before the first. */
  top: number;
  /** How far the toolbar is pushed up, from 0 (all there) to its height (gone). */
  offset: number;
}

/** A scroller not seen yet: its first event only sets the reference, so a base
 *  Obsidian restored halfway down does not take its first step from the top. */
export const TOOLBAR_UNSEEN: ToolbarScroll = { top: Number.NaN, offset: 0 };

/**
 * The toolbar after the scroller moved to `top`.
 *
 * Never pushed further than the base has scrolled, so at the top it is always
 * all there and, near it, moves exactly with the rows it sits above. Positions
 * outside the scroller (iOS's rubber band above the top and below the foot)
 * count as the edge they overshoot, so a bounce does not move it.
 */
export function followScroll(state: ToolbarScroll, top: number, maxTop: number, height: number): ToolbarScroll {
  if (!Number.isFinite(top) || !(height > 0)) return state;
  const t = Math.min(Math.max(top, 0), Math.max(maxTop, 0));
  const limit = Math.min(height, t);
  if (!Number.isFinite(state.top)) return { top: t, offset: Math.min(state.offset, limit) };
  return { top: t, offset: Math.min(Math.max(state.offset + (t - state.top), 0), limit) };
}

/** Where a toolbar left half way comes to rest once scrolling stops. */
export function settleOffset(state: ToolbarScroll, height: number): number {
  if (state.offset <= 0 || state.offset >= height) return state.offset;
  return state.offset >= height / 2 && state.top >= height ? height : 0;
}

/** How long scrolling has to pause before a half-way toolbar settles. iOS
 *  keeps sending scroll events through a fling, so this is a real stop. */
export const SETTLE_AFTER_MS = 140;
