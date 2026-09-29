// Wiring: read the settings, the pointer, the window and the DOM; ask the
// pure modules; apply. Two jobs:
//
//   * the furniture switches — body classes from the settings, which
//     styles.css turns into what is hidden (src/switches.ts);
//   * the top row on hover, and the macOS window buttons with it, in every
//     window: the main one and each pop-out keep their own row (RowWindow).
//
// Why the pointer is polled rather than followed with mouse events: with the
// window frame hidden, the top strip is the window's drag handle, and macOS
// does not deliver mouse movement over a drag handle to the page. The row would
// never learn the pointer had arrived — or, once it is showing, that the
// pointer had left. Electron's own cursor position is not blind there.

import { Notice, Platform, Plugin, PluginSettingTab, Setting, apiVersion, type App } from "obsidian";
import { DEFAULT_SETTINGS, normalizeSettings, type KlartextSettings } from "./settings";
import { ALL_SWITCHES, HIDE_SWITCHES, TOP_ROW_SWITCHES, availableOn, switchClasses, type PlatformFlags, type Switch } from "./switches";
import { windowButtonPosition, type ButtonPosition } from "./windowButtons";
import {
  INITIAL,
  bandHeight,
  coveredByFront,
  inTopBand,
  isResizing,
  nextState,
  shouldPoll,
  windowButtonsVisible,
  type Point,
  type PointerSeen,
  type Rect,
  type TopRowState,
} from "./topRow";

/** Present while the plugin runs; scopes every rule in styles.css. */
const ACTIVE_CLASS = "klartext-top-row";
/**
 * Each window's own state, on its own body: "hidden" while the row is hidden.
 * An attribute, not a class, because Obsidian mirrors the main window's body
 * classes into every pop-out and puts back a class a pop-out removed on the
 * main window's next change; it does not copy attributes. A class would have
 * made every window's row follow the main window's pointer.
 */
const STATE_ATTR = "data-klartext-top-row";

/** The window's top row: the root split's tab strip and the headers of its
 *  top panes. A stacked pane further down carries no `mod-top`. */
const TOP_ROW = [
  ".workspace-split.mod-root .workspace-tabs.mod-top > .workspace-tab-header-container",
  ".workspace-split.mod-root .workspace-tabs.mod-top .workspace-leaf-content > .view-header",
].join(", ");

/** How often the plugin looks at its state. Most looks cost nothing: whether
 *  one also asks Electron for the pointer is shouldPoll's decision. */
const TICK_MS = 50;

/** Just the parts of Electron this plugin touches, checked before use. */
interface NativeWindow {
  getContentBounds(): Rect;
  setWindowButtonVisibility?: (visible: boolean) => void;
  setWindowButtonPosition?: (position: ButtonPosition) => void;
}
interface ElectronModule {
  remote?: { getCurrentWindow?: () => NativeWindow; screen?: { getCursorScreenPoint?: () => Point } };
  webFrame?: { getZoomFactor?: () => number };
}

/** A window's own Electron: every Obsidian window, pop-outs included, has its
 *  own `require`, and `getCurrentWindow()` there is that window. */
function electronOf(win: Window): ElectronModule | null {
  const req = (win as unknown as { require?: (id: string) => unknown }).require;
  if (typeof req !== "function") return null;
  try {
    return (req("electron") as ElectronModule | null) ?? null;
  } catch (e) {
    // A build without Electron in reach: the top row stays as it is, and the
    // switches, which are CSS, still load. A throw here used to stop onload.
    console.warn("[klartext] Electron is not reachable:", e);
    return null;
  }
}

/** The cursor is the screen's, not a window's: one source for every window. */
function loadCursor(): (() => Point) | string {
  const electron = electronOf(window);
  if (!electron) return "window.require is not available";
  const screen = electron.remote?.screen;
  if (!screen || typeof screen.getCursorScreenPoint !== "function") return "Electron's cursor position is not reachable";
  if (typeof electron.remote?.getCurrentWindow?.()?.getContentBounds !== "function") return "Electron's window is not reachable";
  return () => screen.getCursorScreenPoint!();
}

/** One window's share of the top row: its pointer, its band, its state, its buttons. */
class RowWindow {
  state: TopRowState = INITIAL;
  /** What was last applied, so nothing is re-applied every poll. */
  appliedHidden: boolean | null = null;
  appliedButtons: boolean | null = null;
  /** The band's height in CSS px, measured on layout changes rather than per poll. */
  bandCss = 0;
  /** The layout changed since the band was measured; measured again on the next tick. */
  bandDirty = true;
  /** When the last resize event arrived, for isResizing. */
  lastResizeAt = Number.NEGATIVE_INFINITY;
  /** Where this window's own mouse events last saw the pointer; null when outside it. */
  pointer: PointerSeen | null = null;
  lastPollAt = 0;
  lastInBand = false;
  private readonly listeners = new AbortController();

  constructor(
    readonly win: Window,
    readonly native: NativeWindow | null,
    readonly zoom: () => number,
  ) {
    const opts = { signal: this.listeners.signal };
    // Only noted here. Measuring in the handler read the layout on every
    // resize event, in the middle of a resize, which is when a forced layout
    // costs the most; the next tick measures once the window holds still.
    win.addEventListener("resize", () => {
      this.lastResizeAt = Date.now();
      this.bandDirty = true;
    }, opts);
    win.document.addEventListener("mousemove", (e) => {
      this.pointer = { y: e.clientY, at: Date.now() };
    }, { ...opts, passive: true });
    win.addEventListener("mouseout", (e) => {
      if (e.relatedTarget === null) this.pointer = null; // left the window
    }, opts);
  }

  get body(): HTMLElement {
    return this.win.document.body;
  }

  /** The band covers everything in the top row, and never less than one header. */
  measureBand(): void {
    const bottoms: number[] = [];
    this.win.document.querySelectorAll<HTMLElement>(TOP_ROW).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottoms.push(r.bottom);
    });
    // This window's getComputedStyle: a pop-out's body belongs to its own window.
    const header = parseFloat(this.win.getComputedStyle(this.body).getPropertyValue("--header-height"));
    this.bandCss = bandHeight(bottoms, header);
    this.bandDirty = false;
  }

  setHidden(hidden: boolean | null): void {
    if (hidden) this.body.setAttribute(STATE_ATTR, "hidden");
    else this.body.removeAttribute(STATE_ATTR);
    this.appliedHidden = hidden;
  }

  /** macOS only: elsewhere Electron has no such method, and there is nothing to hide. */
  setButtons(visible: boolean): void {
    const set = this.native?.setWindowButtonVisibility;
    if (typeof set === "function") set.call(this.native, visible);
  }

  /**
   * Put the macOS window buttons where Obsidian's own formula says, from the
   * variable styles.css may just have changed. Obsidian does the same on its
   * next window event and, reading the same variable, lands on the same point.
   * Only where Obsidian itself places them: macOS without the native frame.
   */
  placeButtons(): void {
    const win = this.native;
    if (!win || typeof win.setWindowButtonPosition !== "function") return;
    const body = this.body;
    if (!body.hasClass("mod-macos") || !body.hasClass("is-frameless")) return;
    const style = this.win.getComputedStyle(body);
    const position = windowButtonPosition(
      parseFloat(style.getPropertyValue("--traffic-lights-offset-x")),
      parseFloat(style.getPropertyValue("--traffic-lights-offset-y")),
      this.zoom(),
    );
    try {
      win.setWindowButtonPosition.call(win, position);
    } catch (e) {
      console.warn("[klartext] could not place the window buttons:", e);
    }
  }

  /** Never leave a window without its buttons, or with them moved, because the
   *  plugin or the row went away. */
  dispose(): void {
    this.listeners.abort();
    this.setHidden(null);
    if (this.appliedButtons === false) this.setButtons(true);
  }
}

/** What the plugin has done since it started, for "Copy diagnostics". */
interface Counters {
  ticks: number;
  /** Asks of Electron for the cursor, each a synchronous round trip. */
  cursorReads: number;
  /** Asks of Electron for a window's position, the same kind of round trip. */
  boundsReads: number;
  /** Polls skipped because the window was being resized. */
  skippedWhileResizing: number;
  bandMeasures: number;
  errors: number;
}

export default class KlartextPlugin extends Plugin {
  override settings: KlartextSettings = { ...DEFAULT_SETTINGS };
  private cursor: (() => Point) | null = null;
  /** Why the top row cannot run here, when it cannot; null when it can. */
  private unavailable: string | null = null;
  /** The main window and every pop-out, each with its own row. */
  private readonly windows = new Map<Window, RowWindow>();
  /** The poll loop, running only while the top row fades. */
  private loop: number | null = null;
  private readonly counters: Counters = { ticks: 0, cursorReads: 0, boundsReads: 0, skippedWhileResizing: 0, bandMeasures: 0, errors: 0 };
  private readonly startedAt = Date.now();
  /** Each distinct failure is logged once, then counted: a poll runs twenty
   *  times a second, and a console that scrolls the same line is no report. */
  private readonly reported = new Map<string, number>();

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new KlartextSettingTab(this.app, this));
    this.applySwitches();
    this.addCommand({
      id: "copy-diagnostics",
      name: "Copy diagnostics",
      callback: () => void this.copyDiagnostics(),
    });

    // The furniture switches are CSS and work everywhere; the top row and the
    // window buttons need Electron, which only a desktop has.
    if (!Platform.isDesktopApp) {
      this.unavailable = "not a desktop app";
      return;
    }
    const cursor = loadCursor();
    if (typeof cursor === "string") {
      this.unavailable = cursor;
      console.warn(`[klartext] the top row stays as it is: ${cursor}`);
      // Silence would look like a plugin that does nothing; say why instead —
      // but only to someone who asked for the fading. With it off nothing is
      // missing, and a notice on every start would be noise.
      if (this.settings.topRowOnHover) new Notice(`Klartext: the top row stays as it is — ${cursor}.`);
      return;
    }
    this.cursor = cursor;

    this.app.workspace.onLayoutReady(() => {
      this.addWindow(window);
      this.app.workspace.iterateAllLeaves((leaf) => this.addWindow(leaf.getContainer().win));
      this.registerEvent(this.app.workspace.on("window-open", (_w, win) => this.addWindow(win)));
      this.registerEvent(this.app.workspace.on("window-close", (_w, win) => this.removeWindow(win)));
      this.registerEvent(this.app.workspace.on("layout-change", () => this.invalidateBands()));
      this.registerEvent(this.app.workspace.on("css-change", () => this.invalidateBands()));
      this.syncLoop();
    });
  }

  override onunload(): void {
    this.stopLoop();
    for (const row of this.windows.values()) {
      row.dispose();
      row.body.removeClass(ACTIVE_CLASS, ...ALL_SWITCHES.map((s) => s.cls));
      // With the class gone the variable is Obsidian's default again, and the
      // same formula puts the buttons back where Obsidian would.
      row.placeButtons();
    }
    this.windows.clear();
    document.body.removeClass(ACTIVE_CLASS, ...ALL_SWITCHES.map((s) => s.cls));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applySwitches();
    for (const row of this.windows.values()) {
      row.placeButtons();
      if (!this.settings.topRowOnHover) {
        // The row is simply there, and so are the buttons.
        row.setHidden(null);
        row.state = INITIAL;
        if (row.appliedButtons === false) row.setButtons(true);
        row.appliedButtons = true;
      } else {
        row.appliedButtons = null; // re-applied under the new settings on the next tick
      }
      row.bandDirty = true;
    }
    this.syncLoop();
  }

  /** The loop runs while there is a row to fade, and not otherwise: with the
   *  fading off, nothing needs looking at twenty times a second. */
  private syncLoop(): void {
    const wanted = this.cursor !== null && this.settings.topRowOnHover && this.windows.size > 0;
    if (wanted && this.loop === null) {
      this.loop = window.setInterval(() => this.tick(), TICK_MS);
      this.tick();
    } else if (!wanted) {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.loop !== null) window.clearInterval(this.loop);
    this.loop = null;
  }

  private addWindow(win: Window): void {
    if (this.windows.has(win)) return;
    const electron = electronOf(win);
    const native = electron?.remote?.getCurrentWindow?.() ?? null;
    const webFrame = electron?.webFrame;
    const row = new RowWindow(win, native, () =>
      typeof webFrame?.getZoomFactor === "function" ? webFrame.getZoomFactor() : 1,
    );
    this.windows.set(win, row);
    this.applySwitches();
    row.placeButtons();
    this.syncLoop();
  }

  private removeWindow(win: Window): void {
    this.windows.get(win)?.dispose();
    this.windows.delete(win);
    this.syncLoop();
  }

  private invalidateBands(): void {
    for (const row of this.windows.values()) row.bandDirty = true;
  }

  /** One body class per switch that is on, and none for one that is off, in every window. */
  private applySwitches(): void {
    const on = new Set(switchClasses(this.settings));
    const bodies = new Set<HTMLElement>([document.body]);
    for (const row of this.windows.values()) bodies.add(row.body);
    for (const body of bodies) {
      for (const s of ALL_SWITCHES) body.toggleClass(s.cls, on.has(s.cls));
      body.toggleClass(ACTIVE_CLASS, this.settings.topRowOnHover && this.cursor !== null);
    }
  }

  /** Log a failure the first time it happens, and count it every time. */
  private report(where: string, e: unknown): void {
    this.counters.errors++;
    const key = `${where}: ${e instanceof Error ? e.message : String(e)}`;
    const seen = this.reported.get(key) ?? 0;
    if (seen === 0) console.warn(`[klartext] ${where} failed; further failures of this kind are counted in "Copy diagnostics":`, e);
    this.reported.set(key, seen + 1);
  }

  private tick(): void {
    const read = this.cursor;
    if (!read) return;
    this.counters.ticks++;
    // One ask of Electron per tick at most, shared by every window that needs it.
    let cursorAt: Point | undefined;
    const cursor = () => {
      if (cursorAt === undefined) {
        this.counters.cursorReads++;
        cursorAt = read();
      }
      return cursorAt;
    };
    // The focused window is the one in front; asked for its bounds only if a
    // window behind it finds the pointer in its band.
    let focused: RowWindow | null = null;
    for (const row of this.windows.values()) if (row.body.hasClass("is-focused")) { focused = row; break; }
    let frontAt: Rect | null | undefined;
    const front = (row: RowWindow): Rect | null => {
      if (focused === null || focused === row || !focused.native) return null;
      if (frontAt === undefined) {
        this.counters.boundsReads++;
        frontAt = focused.native.getContentBounds();
      }
      return frontAt;
    };
    const now = Date.now();
    for (const row of this.windows.values()) {
      try {
        this.tickWindow(row, now, cursor, front);
      } catch (e) {
        // A window torn down mid-poll ends here once and is gone by the next
        // tick; anything that keeps failing shows up in the count.
        this.report("the poll", e);
      }
    }
  }

  private tickWindow(row: RowWindow, now: number, cursor: () => Point, front: (row: RowWindow) => Rect | null): void {
    const doc = row.win.document;
    if (doc.hidden) return;
    const resizing = isResizing(now, row.lastResizeAt);
    if (row.bandDirty && !resizing) {
      row.measureBand();
      this.counters.bandMeasures++;
    }

    let inBand = row.lastInBand;
    if (row.pointer !== null && row.pointer.y < row.bandCss) {
      inBand = true; // the page saw it there itself: nothing to ask
    } else if (
      row.native &&
      shouldPoll({ now, resizing, shown: row.state.shown, pointer: row.pointer, lastPollAt: row.lastPollAt, bandCss: row.bandCss })
    ) {
      const at = cursor();
      this.counters.boundsReads++;
      inBand = inTopBand(at, row.native.getContentBounds(), row.bandCss, row.zoom()) && !coveredByFront(at, front(row));
      row.lastPollAt = now;
    } else if (row.pointer !== null && !resizing) {
      inBand = false; // seen deep in the note, and already confirmed there
    } else if (resizing) {
      this.counters.skippedWhileResizing++;
    }
    row.lastInBand = inBand;

    const active = doc.activeElement;
    row.state = nextState(row.state, {
      inBand,
      // instanceOf, not instanceof: a pop-out's elements are its own window's HTMLElement.
      focusInRow: active !== null && active !== doc.body && active.instanceOf(HTMLElement) && active.closest(TOP_ROW) !== null,
      // Obsidian appends an open menu to the body; a child check, not a search
      // of the whole document twenty times a second.
      held: row.body.hasClass("is-grabbing") || row.body.querySelector(":scope > .menu") !== null,
      now,
    });

    const hidden = !row.state.shown;
    if (hidden !== row.appliedHidden) row.setHidden(hidden);

    const buttons = windowButtonsVisible(
      row.state.shown,
      this.settings.hideWindowButtons,
      row.body.hasClass("is-fullscreen"),
      row.body.hasClass("is-hidden-frameless"),
      row.win === window,
    );
    if (buttons !== row.appliedButtons) {
      row.setButtons(buttons);
      row.appliedButtons = buttons;
    }
  }

  /** Everything a bug report needs, on the clipboard: no values from the
   *  vault, only the plugin's own state and the platform's shape. */
  private async copyDiagnostics(): Promise<void> {
    const seconds = Math.max(1, (Date.now() - this.startedAt) / 1000);
    const perSecond = (n: number) => Math.round((n / seconds) * 10) / 10;
    const report = {
      plugin: this.manifest.version,
      obsidian: apiVersion,
      platform: {
        desktop: Platform.isDesktopApp,
        macOS: Platform.isMacOS,
        body: [...document.body.classList].filter((c) => /^(mod-|is-(hidden-)?frame|is-fullscreen|theme-)/.test(c)),
      },
      topRow: this.unavailable === null ? (this.loop !== null ? "running" : "idle") : `unavailable: ${this.unavailable}`,
      settings: this.settings,
      windows: [...this.windows.values()].map((row) => ({
        main: row.win === window,
        band: Math.round(row.bandCss),
        shown: row.state.shown,
        buttonsVisible: row.appliedButtons,
        pointerSeen: row.pointer !== null,
      })),
      counters: this.counters,
      perSecond: { cursorReads: perSecond(this.counters.cursorReads), boundsReads: perSecond(this.counters.boundsReads) },
      failures: Object.fromEntries(this.reported),
    };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      new Notice("Klartext: diagnostics copied to the clipboard.");
    } catch (e) {
      console.info("[klartext] diagnostics:\n" + text);
      new Notice("Klartext: the clipboard refused; the diagnostics are in the developer console.");
      this.report("copying diagnostics", e);
    }
  }
}

class KlartextSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: KlartextPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const el = this.containerEl;
    el.empty();

    const here = { desktop: Platform.isDesktopApp, macOS: Platform.isMacOS, phone: Platform.isPhone };

    new Setting(el).setName("Top row").setHeading();
    if (here.desktop) {
      this.toggle(
        "Show the top row only on hover",
        "The tab strip and the note header fade out, and come back when the pointer reaches the top of the window. " +
          "The note never moves.",
        "topRowOnHover",
      );
    }
    if (here.macOS && here.desktop) {
      this.toggle(
        "Hide a pop-out's window buttons with its row",
        "macOS only, with the window frame set to hidden. In a pop-out window the red, yellow and green buttons " +
          "appear and disappear together with its top row. The main window always keeps its buttons. With a title " +
          "bar, and in fullscreen, they are left alone.",
        "hideWindowButtons",
      );
    }
    for (const s of TOP_ROW_SWITCHES) this.switchToggle(s, here);

    new Setting(el).setName("Hide").setHeading();
    for (const s of HIDE_SWITCHES) this.switchToggle(s, here);
  }

  private switchToggle(s: Switch, here: PlatformFlags): void {
    if (availableOn(s.only, here)) this.toggle(s.name, s.desc, s.key);
  }

  private toggle(name: string, desc: string, key: keyof KlartextSettings): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) =>
        t.setValue(this.plugin.settings[key]).onChange(async (v) => {
          this.plugin.settings[key] = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
