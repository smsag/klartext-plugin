// What the top row should do, decided from plain numbers.
//
// Nothing here imports Obsidian or Electron: the wiring in main.ts reads the
// pointer, the window and the DOM, hands the numbers over, and applies the
// answer. That keeps every decision testable without a window, and keeps the
// wiring thin enough to read at a glance.

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in screen coordinates (Electron's device-independent pixels). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TopRowState {
  shown: boolean;
  /** When the pointer left the band while the row was shown; null while it is in it. */
  leftAt: number | null;
}

export interface TopRowInput {
  /** The pointer is inside the top band. */
  inBand: boolean;
  /** Keyboard focus is inside the top row: reveals it, as the pointer does. */
  focusInRow: boolean;
  /** Something the row opened is still open (a menu), or a tab is being dragged:
   *  keeps a shown row shown, but never reveals a hidden one. */
  held: boolean;
  now: number;
}

export const INITIAL: TopRowState = { shown: false, leftAt: null };

/** How long the row stays after the pointer leaves. Long enough that a pointer
 *  overshooting the band on its way down does not make it flicker. */
export const HIDE_DELAY_MS = 400;

/**
 * The band is the window's top `bandCss` CSS pixels, across its full width.
 * The pointer arrives in screen coordinates, which are device-independent
 * pixels; a page zoomed by `zoom` draws one CSS pixel as `zoom` of those, so
 * the band is scaled before it is compared. Without that, Obsidian's zoom-in
 * would shrink the band under the row it is meant to cover.
 */
export function inTopBand(pointer: Point, content: Rect, bandCss: number, zoom: number): boolean {
  if (!(bandCss > 0) || !(zoom > 0)) return false;
  const band = bandCss * zoom;
  return (
    pointer.x >= content.x &&
    pointer.x < content.x + content.width &&
    pointer.y >= content.y &&
    pointer.y < content.y + band
  );
}

export function nextState(prev: TopRowState, input: TopRowInput): TopRowState {
  if (input.inBand || input.focusInRow) return { shown: true, leftAt: null };
  if (!prev.shown) return INITIAL;
  if (input.held) return { shown: true, leftAt: null };
  if (prev.leftAt === null) return { shown: true, leftAt: input.now };
  if (input.now - prev.leftAt >= HIDE_DELAY_MS) return INITIAL;
  return prev;
}

/**
 * Whether the macOS window buttons should be visible.
 *
 * With the setting off they are never touched. In fullscreen macOS draws them
 * in its own menu bar and a window cannot hide them there, so they are left to
 * macOS rather than asked for something it will not do.
 *
 * And only with the frame hidden (Obsidian's `is-hidden-frameless`), where the
 * buttons sit over the page's top row. With the native frame or Obsidian's own
 * frame they sit in a title bar above the page, outside the band the pointer is
 * measured against: hidden there, nothing could bring them back.
 */
export function windowButtonsVisible(
  shown: boolean,
  hideWithRow: boolean,
  fullscreen: boolean,
  frameHidden: boolean,
): boolean {
  if (!hideWithRow || fullscreen || !frameHidden) return true;
  return shown;
}

// ---------------------------------------------------------------------------
// When to ask Electron where the pointer is.
//
// Each ask is two synchronous round trips to the main process, measured at
// 2.5ms. Asking ten times a second regardless cost 27ms of every second —
// while typing, with the pointer resting mid-note, for nothing. The page's own
// mouse events are free and see the pointer everywhere except over a drag
// handle, so the question is only worth asking where they are blind: near the
// top, while the row is shown (to notice the pointer leaving across the
// strip), and when the pointer is outside the window. Deep in the note, one
// confirming ask after the pointer settles catches a flick into the drag
// handle — the movement itself leaves at least one event on the way up. What
// leaves no event at all (the window moving or resizing under a still pointer)
// is caught by a slow heartbeat instead: measured, without it such a pointer
// sat in the band with the row hidden indefinitely.

export interface PointerSeen {
  /** Last clientY a mouse event reported, CSS px. */
  y: number;
  /** When that event arrived. */
  at: number;
}

export interface PollInput {
  now: number;
  shown: boolean;
  /** Null until the first mouse event, and after the pointer leaves the window. */
  pointer: PointerSeen | null;
  lastPollAt: number;
  bandCss: number;
}

export const FAST_POLL_MS = 100;
export const SLOW_POLL_MS = 300;
export const SETTLE_MS = 150;
/** The heartbeat deep in the note: the longest the row can take to notice a
 *  pointer that reached the band without a single mouse event. */
export const IDLE_POLL_MS = 1000;
/** How far below the band a pointer still counts as near it: the last mouse
 *  event before a drag handle swallows the rest lands just under its edge. */
export const NEAR_CSS = 48;

export function shouldPoll(i: PollInput): boolean {
  const since = i.now - i.lastPollAt;
  if (i.shown) return since >= FAST_POLL_MS;
  if (i.pointer === null) return since >= SLOW_POLL_MS;
  if (i.pointer.y < i.bandCss + NEAR_CSS) return since >= FAST_POLL_MS;
  const settled = i.now - i.pointer.at >= SETTLE_MS;
  const confirmed = i.lastPollAt >= i.pointer.at + SETTLE_MS;
  if (settled && !confirmed) return true;
  return since >= IDLE_POLL_MS;
}
