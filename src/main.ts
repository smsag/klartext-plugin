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

import { Notice, Platform, Plugin, PluginSettingTab, Setting, type App } from "obsidian";
import { DEFAULT_SETTINGS, normalizeSettings, type KlartextSettings } from "./settings";
import { ALL_SWITCHES, HIDE_SWITCHES, TOP_ROW_SWITCHES, switchClasses, type Switch } from "./switches";
import { windowButtonPosition, type ButtonPosition } from "./windowButtons";
import {
  INITIAL,
  coveredByFront,
  inTopBand,
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
  return typeof req === "function" ? ((req("electron") as ElectronModule | null) ?? null) : null;
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
    win.addEventListener("resize", () => this.measureBand(), opts);
    win.document.addEventListener("mousemove", (e) => {
      this.pointer = { y: e.clientY, at: Date.now() };
    }, { ...opts, passive: true });
    win.addEventListener("mouseout", (e) => {
      if (e.relatedTarget === null) this.pointer = null; // left the window
    }, opts);
    this.measureBand();
  }

  get body(): HTMLElement {
    return this.win.document.body;
  }

  /** The band covers everything in the top row, and never less than one header. */
  measureBand(): void {
    let bottom = 0;
    this.win.document.querySelectorAll<HTMLElement>(TOP_ROW).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
    });
    const header = parseFloat(getComputedStyle(this.body).getPropertyValue("--header-height"));
    this.bandCss = Math.max(bottom, Number.isFinite(header) ? header : 40);
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
    const style = getComputedStyle(body);
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

export default class KlartextPlugin extends Plugin {
  override settings: KlartextSettings = { ...DEFAULT_SETTINGS };
  private cursor: (() => Point) | null = null;
  /** The main window and every pop-out, each with its own row. */
  private readonly windows = new Map<Window, RowWindow>();

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new KlartextSettingTab(this.app, this));
    this.applySwitches();

    // The furniture switches are CSS and work everywhere; the top row and the
    // window buttons need Electron, which only a desktop has.
    if (!Platform.isDesktopApp) return;
    const cursor = loadCursor();
    if (typeof cursor === "string") {
      // Silence would look like a plugin that does nothing; say why instead.
      new Notice(`Klartext: the top row stays as it is — ${cursor}.`);
      console.warn(`[klartext] not starting: ${cursor}`);
      return;
    }
    this.cursor = cursor;

    this.app.workspace.onLayoutReady(() => {
      this.addWindow(window);
      this.app.workspace.iterateAllLeaves((leaf) => this.addWindow(leaf.getContainer().win));
      this.registerEvent(this.app.workspace.on("window-open", (_w, win) => this.addWindow(win)));
      this.registerEvent(this.app.workspace.on("window-close", (_w, win) => this.removeWindow(win)));
      this.registerEvent(this.app.workspace.on("layout-change", () => this.measureBands()));
      this.registerEvent(this.app.workspace.on("css-change", () => this.measureBands()));
      this.registerInterval(window.setInterval(() => this.tick(), TICK_MS));
      this.tick();
    });
  }

  override onunload(): void {
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
        row.setHidden(null);
        row.state = INITIAL;
      }
      row.appliedButtons = null; // re-apply under the new settings on the next poll
      row.measureBand();
    }
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
  }

  private removeWindow(win: Window): void {
    this.windows.get(win)?.dispose();
    this.windows.delete(win);
  }

  private measureBands(): void {
    for (const row of this.windows.values()) row.measureBand();
  }

  /** One body class per switch that is on, and none for one that is off, in every window. */
  private applySwitches(): void {
    const on = new Set(switchClasses(this.settings));
    const bodies = new Set([document.body, ...[...this.windows.values()].map((r) => r.body)]);
    for (const body of bodies) {
      for (const s of ALL_SWITCHES) body.toggleClass(s.cls, on.has(s.cls));
      body.toggleClass(ACTIVE_CLASS, this.settings.topRowOnHover && this.cursor !== null);
    }
  }

  private tick(): void {
    if (!this.cursor) return;
    // One ask of Electron per tick at most, shared by every window that needs it.
    let cursorAt: Point | undefined;
    const cursor = () => (cursorAt ??= this.cursor!());
    // The focused window is the one in front; asked for its bounds only if a
    // window behind it finds the pointer in its band.
    const focused = [...this.windows.values()].find((r) => r.body.hasClass("is-focused")) ?? null;
    let frontAt: Rect | null | undefined;
    const front = (row: RowWindow) =>
      focused === null || focused === row || !focused.native ? null : (frontAt ??= focused.native.getContentBounds());
    const now = Date.now();
    for (const row of this.windows.values()) {
      try {
        this.tickWindow(row, now, cursor, front);
      } catch (e) {
        // A window torn down mid-poll; the next tick either works or it has closed.
        console.debug("[klartext] poll skipped:", e);
      }
    }
  }

  private tickWindow(row: RowWindow, now: number, cursor: () => Point, front: (row: RowWindow) => Rect | null): void {
    const doc = row.win.document;
    if (doc.hidden) return;
    if (!this.settings.topRowOnHover) {
      // The row is simply there. Give the buttons back if they were hidden.
      if (row.appliedButtons === false) row.setButtons(true);
      row.appliedButtons = true;
      return;
    }

    let inBand = row.lastInBand;
    if (row.pointer !== null && row.pointer.y < row.bandCss) {
      inBand = true; // the page saw it there itself: nothing to ask
    } else if (row.native && shouldPoll({ now, shown: row.state.shown, pointer: row.pointer, lastPollAt: row.lastPollAt, bandCss: row.bandCss })) {
      const at = cursor();
      inBand = inTopBand(at, row.native.getContentBounds(), row.bandCss, row.zoom()) && !coveredByFront(at, front(row));
      row.lastPollAt = now;
    } else if (row.pointer !== null) {
      inBand = false; // seen deep in the note, and already confirmed there
    }
    row.lastInBand = inBand;

    const active = doc.activeElement;
    row.state = nextState(row.state, {
      inBand,
      // instanceOf, not instanceof: a pop-out's elements are its own window's HTMLElement.
      focusInRow: active !== null && active.instanceOf(HTMLElement) && active.closest(TOP_ROW) !== null,
      held: row.body.hasClass("is-grabbing") || doc.querySelector(".menu") !== null,
      now,
    });

    const hidden = !row.state.shown;
    if (hidden !== row.appliedHidden) row.setHidden(hidden);

    const buttons = windowButtonsVisible(
      row.state.shown,
      this.settings.hideWindowButtons,
      row.body.hasClass("is-fullscreen"),
      row.body.hasClass("is-hidden-frameless"),
    );
    if (buttons !== row.appliedButtons) {
      row.setButtons(buttons);
      row.appliedButtons = buttons;
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

    new Setting(el).setName("Top row").setHeading();
    this.toggle(
      "Show the top row only on hover",
      "The tab strip and the note header fade out, and come back when the pointer reaches the top of the window. " +
        "The note never moves.",
      "topRowOnHover",
    );
    this.toggle(
      "Hide the window buttons with the row",
      "macOS only, with the window frame set to hidden. The red, yellow and green buttons appear and " +
        "disappear together with the top row. With a title bar, and in fullscreen, they are left alone.",
      "hideWindowButtons",
    );
    for (const s of TOP_ROW_SWITCHES) this.switchToggle(s);

    new Setting(el).setName("Hide").setHeading();
    for (const s of HIDE_SWITCHES) this.switchToggle(s);
  }

  private switchToggle(s: Switch): void {
    this.toggle(s.name, s.desc, s.key);
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
