// Wiring: read the settings, the pointer, the window and the DOM; ask the
// pure modules; apply. Four jobs:
//
//   * the furniture switches — body classes from the settings, which
//     styles.css turns into what is hidden (src/switches.ts);
//   * the top row on hover, and the macOS window buttons with it, in every
//     window: the main one and each pop-out keep their own row (RowWindow);
//   * table cells reaching down, in Reading view and Live Preview
//     (src/tableCells.ts);
//   * the note's language for automatic hyphenation, in the same two
//     (src/hyphenation.ts).
//
// Why the pointer is polled rather than followed with mouse events: with the
// window frame hidden, the top strip is the window's drag handle, and macOS
// does not deliver mouse movement over a drag handle to the page. The row would
// never learn the pointer had arrived — or, once it is showing, that the
// pointer had left. Electron's own cursor position is not blind there.

import { MarkdownView, Notice, Platform, Plugin, PluginSettingTab, Setting, getLanguage, type App } from "obsidian";
import { DEFAULT_SETTINGS, normalizeSettings, type KlartextSettings } from "./settings";
import { ALL_SWITCHES, HIDE_SWITCHES, TASK_MARKERS, TASK_MARKERS_CLASS, TOP_ROW_SWITCHES, availableOn, switchClasses, type PlatformFlags, type Switch } from "./switches";
import { windowButtonPosition, type ButtonPosition } from "./windowButtons";
import { BaseToolbars } from "./baseToolbarWiring";
import { livePreviewExtension, readingProcessor, refreshLivePreview } from "./tableCells";
import { HYPHENATE_CLASS, hyphenationExtension, hyphenationProcessor, refreshHyphenation } from "./hyphenation";
import { fallbackLanguage } from "./language";
import { guarded, resetLog, warnOnce } from "./log";
import {
  INITIAL,
  anyResizing,
  bandHeight,
  coveredByFront,
  inTopBand,
  nextState,
  seenInBand,
  shouldPoll,
  windowButtonsVisible,
  type Point,
  type PointerSeen,
  type Rect,
  type TopRowState,
} from "./topRow";

/** Present while the top row fades on hover; scopes the top row's rules in styles.css. */
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
    warnOnce("reaching Electron", e);
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
      // Placed on every settings change and every new window: logged once.
      warnOnce("placing the window buttons", e);
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
  /** Why the top row cannot run here, when it cannot; null when it can. */
  private unavailable: string | null = null;
  /** The main window and every pop-out, each with its own row. */
  private readonly windows = new Map<Window, RowWindow>();
  /** The poll loop, running only while the top row fades. */
  private loop: number | null = null;
  /** Whether the tables were last drawn with cells reaching down. */
  private mergedTables = false;
  /** Whether the notes were last drawn with their language for hyphenation. */
  private hyphenated = false;
  /** A base's toolbar on a phone, while its switch is on. */
  private readonly baseToolbars = new BaseToolbars(document);

  /** Read by the settings tab, which says it beside the switch it leaves without effect. */
  get unavailableReason(): string | null {
    return this.unavailable;
  }

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.readStoredSettings());
    this.mergedTables = this.settings.mergeTableCells;
    this.hyphenated = this.settings.hyphenate;
    this.addSettingTab(new KlartextSettingTab(this.app, this));
    this.applySwitches();

    this.syncBaseScroll();

    // Registered whatever the switch says, and asked on every table: turning
    // it on or off then needs no reload, only the tables drawn again.
    const merge = () => this.settings.mergeTableCells;
    this.registerMarkdownPostProcessor(guarded("drawing a table's cells", readingProcessor(merge)));
    this.registerEditorExtension(livePreviewExtension(merge));
    // The same for the note's language. A note too short to tell takes the
    // app's language: getLanguage arrived in Obsidian 1.8.7.
    const hyphenate = () => this.settings.hyphenate;
    const fallback = () => fallbackLanguage(typeof getLanguage === "function" ? getLanguage() : null, navigator.language);
    this.registerMarkdownPostProcessor(guarded("reading a note's language", hyphenationProcessor(hyphenate, fallback)));
    this.registerEditorExtension(hyphenationExtension(hyphenate, fallback));

    // Whatever replaces a base in its leaf, or moves to another one, shows the
    // toolbar again: a short base cannot be scrolled back to bring it.
    const syncToolbars = guarded("following a base's toolbar", (reset: boolean) => this.baseToolbars.sync(reset));
    this.registerEvent(this.app.workspace.on("layout-change", () => syncToolbars(true)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => syncToolbars(true)));
    this.registerEvent(this.app.workspace.on("resize", () => syncToolbars(false)));
    this.registerEvent(this.app.workspace.on("css-change", () => syncToolbars(false)));

    // The furniture switches are CSS and work everywhere; the top row and the
    // window buttons need Electron, which only a desktop has.
    if (!Platform.isDesktopApp) {
      this.unavailable = "not a desktop app";
      return;
    }
    const cursor = loadCursor();
    if (typeof cursor === "string") {
      this.unavailable = cursor;
      warnOnce(`the top row stays as it is: ${cursor}`);
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
      row.body.removeClass(ACTIVE_CLASS, TASK_MARKERS_CLASS, HYPHENATE_CLASS, ...ALL_SWITCHES.map((s) => s.cls));
      // With the class gone the variable is Obsidian's default again, and the
      // same formula puts the buttons back where Obsidian would.
      row.placeButtons();
    }
    this.windows.clear();
    document.body.removeClass(ACTIVE_CLASS, TASK_MARKERS_CLASS, HYPHENATE_CLASS, ...ALL_SWITCHES.map((s) => s.cls));
    this.baseToolbars.stop();
    // Live Preview's tables lose their marks with the editor extension; Reading
    // view's keep them until drawn again.
    if (this.settings.mergeTableCells || this.settings.hyphenate) this.redrawReadingViews();
    resetLog();
  }

  /** data.json as stored, or nothing: a file that no longer parses (a sync
   *  conflict, a hand edit) costs the settings, never the plugin's start. */
  private async readStoredSettings(): Promise<unknown> {
    try {
      return await this.loadData();
    } catch (e) {
      warnOnce("reading the settings; the defaults apply until they are saved again", e);
      return null;
    }
  }

  /** Draw every open note's Reading view again, so its tables follow the switch. */
  private redrawReadingViews(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
    });
  }

  /** The toolbar is followed while its switch is on, on a phone, and not
   *  otherwise: no listener, no observer. */
  private syncBaseScroll(): void {
    if (Platform.isPhone && this.settings.hideBaseToolbarOnScroll) this.baseToolbars.start();
    else this.baseToolbars.stop();
  }

  /** Apply the settings at once, then store them: a save that fails (a full
   *  disk, a read-only vault) still leaves the switch working for the session. */
  async saveSettings(): Promise<void> {
    this.applySettings();
    await this.saveData(this.settings);
  }

  private applySettings(): void {
    const tablesChanged = this.settings.mergeTableCells !== this.mergedTables;
    const languageChanged = this.settings.hyphenate !== this.hyphenated;
    this.mergedTables = this.settings.mergeTableCells;
    this.hyphenated = this.settings.hyphenate;
    // One redraw of Reading view for both: each is a full render of every open note.
    if (tablesChanged || languageChanged) this.redrawReadingViews();
    if (tablesChanged) refreshLivePreview();
    if (languageChanged) refreshHyphenation();
    this.applySwitches();
    this.syncBaseScroll();
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
      body.toggleClass(TASK_MARKERS_CLASS, this.settings.themeTaskMarkers);
      body.toggleClass(HYPHENATE_CLASS, this.settings.hyphenate);
      body.toggleClass(ACTIVE_CLASS, this.settings.topRowOnHover && this.cursor !== null);
    }
  }

  private tick(): void {
    const read = this.cursor;
    if (!read) return;
    // One ask of Electron per tick at most, shared by every window that needs it.
    let cursorAt: Point | undefined;
    const cursor = () => {
      if (cursorAt === undefined) {
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
        frontAt = focused.native.getContentBounds();
      }
      return frontAt;
    };
    const frontSeen = (): number | null => focused?.pointer?.at ?? null;
    const now = Date.now();
    // One window being resized holds every ask: the main process answering
    // them is the one busy with the resize, and every window waits on it.
    const resizing = anyResizing(now, resizeTimes(this.windows.values()));
    for (const row of this.windows.values()) {
      try {
        this.tickWindow(row, now, cursor, front, frontSeen, resizing);
      } catch (e) {
        // A window torn down mid-poll ends here once and is gone by the next
        // tick; anything that keeps failing is logged the first time.
        warnOnce("the poll", e);
      }
    }
  }

  private tickWindow(
    row: RowWindow,
    now: number,
    cursor: () => Point,
    front: (row: RowWindow) => Rect | null,
    frontSeen: () => number | null,
    resizing: boolean,
  ): void {
    const doc = row.win.document;
    if (doc.hidden) return;
    if (row.bandDirty && !resizing) {
      row.measureBand();
    }

    let inBand = row.lastInBand;
    if (seenInBand(row.pointer, row.bandCss, now)) {
      inBand = true; // the page saw it there just now: nothing to ask
    } else if (
      row.native &&
      shouldPoll({ now, resizing, shown: row.state.shown, pointer: row.pointer, lastPollAt: row.lastPollAt, bandCss: row.bandCss })
    ) {
      const at = cursor();
      inBand =
        inTopBand(at, row.native.getContentBounds(), row.bandCss, row.zoom()) &&
        !coveredByFront(at, front(row), row.pointer?.at ?? null, frontSeen());
      row.lastPollAt = now;
    } else if (row.pointer !== null && row.pointer.y >= row.bandCss && !resizing) {
      inBand = false; // seen deep in the note, and already confirmed there
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
}

/** Each window's last resize, without an array per tick. */
function* resizeTimes(rows: Iterable<RowWindow>): Iterable<number> {
  for (const row of rows) yield row.lastResizeAt;
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
    // Said here, where it is missed, rather than only in the console.
    const why = this.plugin.unavailableReason;
    const fading = this.plugin.settings.topRowOnHover && why === null;
    if (here.desktop) {
      this.toggle(
        "Show the top row only on hover",
        "The tab strip and the note header fade out, and come back when the pointer reaches the top of the window. " +
          "The note never moves." +
          (why === null ? "" : ` Not working on this device: ${why}.`),
        "topRowOnHover",
        { redraw: true },
      );
    }
    if (here.macOS && here.desktop) {
      this.toggle(
        "Hide a pop-out's window buttons with its row",
        "macOS only, with the window frame set to hidden. In a pop-out window the red, yellow and green buttons " +
          "appear and disappear together with its top row. The main window always keeps its buttons. With a title " +
          "bar, and in fullscreen, they are left alone." +
          (fading ? "" : " Needs the top row to fade on hover, which it does not here."),
        "hideWindowButtons",
        { disabled: !fading },
      );
    }
    for (const s of TOP_ROW_SWITCHES) this.switchToggle(s, here);

    new Setting(el).setName("Hide").setHeading();
    for (const s of HIDE_SWITCHES) this.switchToggle(s, here);

    new Setting(el).setName("Tables").setHeading();
    this.toggle(
      "Let a cell reach down over missing cells",
      "A table row with fewer cells than the header leaves its last columns to the cell above: that cell reaches " +
        "down over the row, to the next row that has the cell again, its text centred. An empty cell (| |) stays " +
        "a cell, and the header never reaches down. In Reading view and Live Preview; the note is not changed.",
      "mergeTableCells",
    );

    new Setting(el).setName("Tasks").setHeading();
    this.toggle(
      "Draw the theme's task markers",
      "The Klartext theme gives a task its own box for each marker popular themes use beyond the usual four (" +
        TASK_MARKERS.map((m) => `[${m.marker}] ${m.meaning}`).join(", ") +
        "). Off, they look like an open task. Either way a task carrying one is open work: Schreibstube counts it " +
        "as to do. Needs the Klartext theme; under another theme nothing changes.",
      "themeTaskMarkers",
    );

    new Setting(el).setName("Text").setHeading();
    this.toggle(
      "Hyphenate long words",
      "A long word such as Gewinnerzielungsabsicht breaks at a syllable at the end of a line, so lines stay full " +
        "and the text reads more evenly, most of all on a phone. The language is read from the note's own words " +
        "(German, English, French, Spanish, Italian, Dutch); a paragraph in another language than the rest keeps " +
        "its own, and a note too short to tell takes the app's language. Body text, lists, callouts and tables, " +
        "in Reading view and Live Preview; headings, code and links stay whole. The note is not changed.",
      "hyphenate",
    );
  }

  private switchToggle(s: Switch, here: PlatformFlags): void {
    if (availableOn(s.only, here)) this.toggle(s.name, s.desc, s.key);
  }

  /** One toggle. `disabled`: shown greyed out, because another setting
   *  leaves it without effect. `redraw`: draw the tab again after a change,
   *  for the toggles that depend on this one. */
  private toggle(name: string, desc: string, key: keyof KlartextSettings, opts: { disabled?: boolean; redraw?: boolean } = {}): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .setDisabled(opts.disabled ?? false)
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings[key])
          .setDisabled(opts.disabled ?? false)
          .onChange(async (v) => {
            this.plugin.settings[key] = v;
            try {
              await this.plugin.saveSettings();
            } catch (e) {
              // The switch acts for this session; a person should know it will not last.
              warnOnce("saving the settings", e);
              new Notice("Klartext: the setting could not be saved. It applies until Obsidian restarts.");
            }
            if (opts.redraw) this.display();
          }),
      );
  }
}
