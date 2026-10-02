// When a base's toolbar steps aside: the decision, kept apart from the DOM.
//
// The toolbar (views, results, sort, filter, properties, search, +) sits above
// the base on a phone and takes 52px of a short screen. Scrolling down means
// looking at the base, so it slides away; scrolling back up, or reaching the
// top, brings it back, as a browser's address bar does.
//
// Collapsing it makes the scroller taller, and at the foot of a base the
// browser answers by clamping scrollTop, which reads as a scroll back up and
// would bring the toolbar straight back, then hide it again: a flicker for as
// long as the finger stays there. A step up that lands exactly on the foot is
// that clamp, never a finger, so it moves the reference point and nothing
// else. Asked of the scroller itself rather than timed against the slide, so
// a slow phone or a longer slide cannot reopen the gap.

export interface ToolbarScroll {
  /** The scroll position last seen; NaN before the first. */
  top: number;
  /** Where the current run of scrolling started: the highest point while
   *  shown, the deepest while hidden. Distance is measured from here. */
  anchor: number;
  hidden: boolean;
}

/** A scroller not seen yet. Its first event only sets the reference: a base
 *  Obsidian restored halfway down would otherwise measure its first step from
 *  the top, and hide on a step up. */
export const TOOLBAR_UNSEEN: ToolbarScroll = { top: Number.NaN, anchor: Number.NaN, hidden: false };

/** At or above this the toolbar is always shown: the top of a base has it. */
export const REVEAL_TOP = 8;
/** Not hidden before the base has scrolled past the toolbar itself, or the
 *  first rows would jump up under the finger as soon as it moved. */
export const HIDE_BELOW = 64;
/** How far a run of scrolling has to go before it counts, so a finger that
 *  wobbles while reading does not toggle anything. */
export const HIDE_AFTER = 24;
export const SHOW_AFTER = 24;

/**
 * @param top the scroller's scrollTop now
 * @param maxTop scrollHeight − clientHeight now: the foot of the base
 */
export function nextToolbar(state: ToolbarScroll, top: number, maxTop: number): ToolbarScroll {
  if (!Number.isFinite(top)) return state;
  const shown: ToolbarScroll = { top, anchor: top, hidden: false };
  if (!Number.isFinite(state.top)) return top <= REVEAL_TOP ? shown : { ...state, top, anchor: top };

  if (top <= REVEAL_TOP) return state.hidden ? shown : { ...state, top, anchor: top };
  if (state.hidden) {
    if (top >= state.top) return { ...state, top, anchor: Math.max(state.anchor, top) };
    if (top >= maxTop - 1) return { ...state, top, anchor: top }; // the clamp at the foot
    return state.anchor - top >= SHOW_AFTER ? shown : { ...state, top };
  }
  if (top <= state.top) return { ...state, top, anchor: Math.min(state.anchor, top) };
  return top - state.anchor >= HIDE_AFTER && top > HIDE_BELOW ? { top, anchor: top, hidden: true } : { ...state, top };
}
