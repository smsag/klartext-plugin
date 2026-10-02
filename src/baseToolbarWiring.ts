// Wiring for a base's toolbar on a phone: follows each main-area base's own
// scroller and moves its toolbar as src/baseToolbar.ts decides. The DOM side
// only; every decision is in the pure module.
//
// A base is followed from the moment it is in the main area, not from its
// first scroll: whatever can change under a moved toolbar without a scroll
// (the search row opening, Bases replacing its scroller or its table header)
// has to put the toolbar right, and a base too short to scroll never sends
// one. One MutationObserver per base watches the base's own children and its
// search row, never the rows, which a scrolling table rewrites every frame.

import { SETTLE_AFTER_MS, TOOLBAR_UNSEEN, followScroll, settleOffset, type ToolbarScroll } from "./baseToolbar";

const LEAVES = '.workspace-split.mod-root .workspace-leaf-content[data-type="bases"]';

/** On the leaf while a half-way toolbar settles: styles.css animates the last
 *  stretch, which a finger no longer drives. */
export const SETTLING_CLASS = "klartext-base-toolbar-settling";
/** On the leaf while its search row is open. The plugin decides it once, by
 *  the row's computed display, and styles.css keys the room on this class. */
export const SEARCH_OPEN_CLASS = "klartext-base-search-open";
/** On the leaf while the toolbar has gone: a table's header then backs the
 *  band above it. Not at rest, where the band shows through the floating bar. */
export const GONE_CLASS = "klartext-base-toolbar-gone";
/** On the scroller: where a table's sticky header sticks while the toolbar is
 *  moved. A variable rather than a style on the header, which Bases rebuilds
 *  on a sort or a data change; a rebuilt one reads it at once. */
export const THEAD_TOP_VAR = "--klartext-thead-top";

export interface ToolbarCounters {
  /** Times a toolbar arrived all gone or all there again. */
  baseToolbarChanges: number;
  /** Scroll events from inside a base that were not its own scroller. */
  baseScrollsIgnored: number;
}

interface Tracked {
  leaf: HTMLElement;
  content: HTMLElement | null;
  scroller: HTMLElement | null;
  header: HTMLElement | null;
  searchRow: HTMLElement | null;
  searchOpen: boolean;
  /** Measured when the base is (re)bound, never on the scroll path. */
  height: number;
  band: number;
  state: ToolbarScroll;
  settle: number | null;
  observer: MutationObserver;
}

export class BaseToolbars {
  private readonly tracked = new Map<HTMLElement, Tracked>();
  private touching = false;
  private running = false;
  private readonly onScroll = (e: Event): void => this.scrolled(e);
  private readonly onTouchStart = (): void => {
    this.touching = true;
  };
  private readonly onTouchEnd = (): void => {
    this.touching = false;
    // The finger lifted: a fling may still carry on (its scroll events put
    // the settle off again), and a toolbar left half way can now settle.
    for (const t of this.tracked.values()) this.scheduleSettle(t);
  };

  constructor(
    private readonly doc: Document,
    private readonly counters: ToolbarCounters,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    // Scroll does not bubble: one listener in the capture phase hears every
    // scroller and picks out a base's.
    this.doc.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    this.doc.addEventListener("touchstart", this.onTouchStart, { capture: true, passive: true });
    this.doc.addEventListener("touchend", this.onTouchEnd, { capture: true, passive: true });
    this.doc.addEventListener("touchcancel", this.onTouchEnd, { capture: true, passive: true });
    this.sync();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.doc.removeEventListener("scroll", this.onScroll, { capture: true });
    this.doc.removeEventListener("touchstart", this.onTouchStart, { capture: true });
    this.doc.removeEventListener("touchend", this.onTouchEnd, { capture: true });
    this.doc.removeEventListener("touchcancel", this.onTouchEnd, { capture: true });
    for (const t of this.tracked.values()) this.detach(t);
    this.tracked.clear();
    this.touching = false;
  }

  /** Follow the bases now in the main area and drop the ones that left. On a
   *  layout or leaf change every toolbar comes back (`reset`); on a resize or
   *  a theme change the toolbars stay where they are and are measured again. */
  sync(reset = true): void {
    if (!this.running) return;
    const leaves = new Set(this.doc.querySelectorAll<HTMLElement>(LEAVES));
    for (const [leaf, t] of this.tracked) {
      if (!leaves.has(leaf)) {
        this.detach(t);
        this.tracked.delete(leaf);
      }
    }
    for (const leaf of leaves) {
      const t = this.tracked.get(leaf) ?? this.attach(leaf);
      this.bind(t, reset);
    }
  }

  private attach(leaf: HTMLElement): Tracked {
    const t: Tracked = {
      leaf,
      content: null,
      scroller: null,
      header: null,
      searchRow: null,
      searchOpen: false,
      height: 0,
      band: 0,
      state: TOOLBAR_UNSEEN,
      settle: null,
      observer: new MutationObserver(() => this.bind(t, false)),
    };
    this.tracked.set(leaf, t);
    return t;
  }

  /** Find the base's parts again. A replaced scroller starts unseen with the
   *  toolbar all there; `reset` puts it all there regardless. */
  private bind(t: Tracked, reset: boolean): void {
    const content = t.leaf.querySelector<HTMLElement>(":scope > .view-content");
    const scroller = content?.querySelector<HTMLElement>(":scope > .bases-view") ?? null;
    const header = content?.querySelector<HTMLElement>(":scope > .bases-header") ?? null;
    const searchRow = content?.querySelector<HTMLElement>(":scope > .bases-search-row") ?? null;
    if (content !== t.content || searchRow !== t.searchRow) {
      t.observer.disconnect();
      if (content !== null) t.observer.observe(content, { childList: true });
      if (searchRow !== null) t.observer.observe(searchRow, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    }
    if (header !== t.header && t.header !== null) clearHeader(t.header);
    if (scroller !== t.scroller && t.scroller !== null) t.scroller.style.removeProperty(THEAD_TOP_VAR);
    const replaced = scroller !== t.scroller || header !== t.header;
    Object.assign(t, { content, scroller, header, searchRow });

    const open = searchRow !== null && searchRow.isConnected && getComputedStyle(searchRow).display !== "none";
    t.searchOpen = open;
    t.leaf.classList.toggle(SEARCH_OPEN_CLASS, open);
    if (header !== null) {
      t.height = header.offsetHeight;
      t.band = header.offsetTop;
    }
    const before = t.state.offset;
    if (replaced) t.state = TOOLBAR_UNSEEN;
    else if (reset || open) t.state = { ...t.state, offset: 0 };
    if (replaced || reset || open) this.place(t, before);
  }

  private detach(t: Tracked): void {
    t.observer.disconnect();
    if (t.settle !== null) window.clearTimeout(t.settle);
    t.leaf.classList.remove(SETTLING_CLASS, SEARCH_OPEN_CLASS, GONE_CLASS);
    if (t.header !== null) clearHeader(t.header);
    t.scroller?.style.removeProperty(THEAD_TOP_VAR);
  }

  private scrolled(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (typeof target?.closest !== "function") return;
    const leaf = target.closest<HTMLElement>(LEAVES);
    if (leaf === null) return;
    const t = this.tracked.get(leaf) ?? this.attach(leaf);
    if (target !== t.scroller) this.bind(t, false);
    if (target !== t.scroller || t.header === null) {
      this.counters.baseScrollsIgnored++;
      return;
    }
    const before = t.state.offset;
    t.state = t.searchOpen
      ? { top: target.scrollTop, offset: 0 }
      : followScroll(t.state, target.scrollTop, target.scrollHeight - target.clientHeight, t.height);
    t.leaf.classList.remove(SETTLING_CLASS);
    this.place(t, before);
    this.scheduleSettle(t);
  }

  private scheduleSettle(t: Tracked): void {
    if (t.settle !== null) window.clearTimeout(t.settle);
    t.settle = null;
    if (t.state.offset <= 0 || t.state.offset >= t.height) return;
    t.settle = window.setTimeout(() => this.settle(t), SETTLE_AFTER_MS);
  }

  /** Scrolling stopped and no finger is down: a half-way toolbar goes to the
   *  nearer end. A finger resting mid-drag holds it; lifting it settles. */
  private settle(t: Tracked): void {
    t.settle = null;
    if (this.touching || this.tracked.get(t.leaf) !== t || t.header === null) return;
    const to = settleOffset(t.state, t.height);
    if (to === t.state.offset) return;
    const before = t.state.offset;
    t.state = { ...t.state, offset: to };
    t.leaf.classList.add(SETTLING_CLASS);
    this.place(t, before);
  }

  /** The toolbar at its offset, inline on the toolbar alone: a transform and
   *  an opacity, which change no layout. */
  private place(t: Tracked, before: number): void {
    if (t.header === null) return;
    const { offset } = t.state;
    const { height } = t;
    const style = t.header.style;
    style.transform = offset > 0 ? `translateY(${-offset}px)` : "";
    style.opacity = offset > 0 && height > 0 ? String(Math.max(0, 1 - offset / height)) : "";
    style.visibility = offset > 0 && offset >= height ? "hidden" : "";
    if (offset > 0) t.scroller?.style.setProperty(THEAD_TOP_VAR, `${t.band + height - offset}px`);
    else t.scroller?.style.removeProperty(THEAD_TOP_VAR);
    const gone = offset > 0 && offset >= height;
    t.leaf.classList.toggle(GONE_CLASS, gone);
    const end = (o: number) => (o <= 0 ? "there" : o >= height ? "gone" : null);
    if (end(offset) !== null && end(offset) !== end(before)) this.counters.baseToolbarChanges++;
  }
}

function clearHeader(header: HTMLElement): void {
  header.style.transform = header.style.opacity = header.style.visibility = "";
}
