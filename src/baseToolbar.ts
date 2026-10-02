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
// long as the finger stays there. So a change is followed by a quiet spell in
// which scroll only moves the reference point.

export interface ToolbarScroll {
  /** The scroll position last seen. */
  top: number;
  /** Where the current run of scrolling started: the highest point while
   *  shown, the deepest while hidden. Distance is measured from here. */
  anchor: number;
  hidden: boolean;
  /** Until when scroll events only move the reference point. */
  quietUntil: number;
}

export const TOOLBAR_SHOWN: ToolbarScroll = { top: 0, anchor: 0, hidden: false, quietUntil: 0 };

/** At or above this the toolbar is always shown: the top of a base has it. */
export const REVEAL_TOP = 8;
/** Not hidden before the base has scrolled past the toolbar itself, or the
 *  first rows would jump up under the finger as soon as it moved. */
export const HIDE_BELOW = 64;
/** How far a run of scrolling has to go before it counts, so a finger that
 *  wobbles while reading does not toggle anything. */
export const HIDE_AFTER = 24;
export const SHOW_AFTER = 24;
/** The length of the slide in styles.css, plus a margin. */
export const QUIET_MS = 300;

export function nextToolbar(state: ToolbarScroll, top: number, now: number): ToolbarScroll {
  if (!Number.isFinite(top)) return state;
  if (now < state.quietUntil) return { ...state, top, anchor: top };
  const change = (hidden: boolean): ToolbarScroll => ({ top, anchor: top, hidden, quietUntil: now + QUIET_MS });

  if (top <= REVEAL_TOP) return state.hidden ? change(false) : { ...state, top, anchor: top };
  if (state.hidden) {
    if (top >= state.top) return { ...state, top, anchor: Math.max(state.anchor, top) };
    return state.anchor - top >= SHOW_AFTER ? change(false) : { ...state, top };
  }
  if (top <= state.top) return { ...state, top, anchor: Math.min(state.anchor, top) };
  return top - state.anchor >= HIDE_AFTER && top > HIDE_BELOW ? change(true) : { ...state, top };
}
