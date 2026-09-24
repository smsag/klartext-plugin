// Wiring: read the settings, the pointer, the window and the DOM; ask the
// pure modules; apply. Two jobs:
//
//   * the furniture switches — body classes from the settings, which
//     styles.css turns into what is hidden (src/switches.ts);
//   * the top row on hover, and the macOS window buttons with it.
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
/** Present while the row is hidden. */
const HIDDEN_CLASS = "klartext-top-row-hidden";

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
interface ElectronWindow {
  getContentBounds(): Rect;
  setWindowButtonVisibility?: (visible: boolean) => void;
  setWindowButtonPosition?: (position: ButtonPosition) => void;
}
interface ElectronBits {
  cursor(): Point;
  window: ElectronWindow;
  zoom(): number;
}

function loadElectron(): ElectronBits | string {
  const req = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof req !== "function") return "window.require is not available";
  const electron = req("electron") as {
    remote?: { getCurrentWindow?: () => ElectronWindow; screen?: { getCursorScreenPoint?: () => Point } };
    webFrame?: { getZoomFactor?: () => number };
  } | null;
  const remote = electron?.remote;
  const win = remote?.getCurrentWindow?.();
  const screen = remote?.screen;
  if (!win || typeof win.getContentBounds !== "function") return "Electron's window is not reachable";
  if (!screen || typeof screen.getCursorScreenPoint !== "function") return "Electron's cursor position is not reachable";
  const webFrame = electron?.webFrame;
  return {
    cursor: () => screen.getCursorScreenPoint!(),
    window: win,
    zoom: () => (typeof webFrame?.getZoomFactor === "function" ? webFrame.getZoomFactor() : 1),
  };
}

export default class KlartextPlugin extends Plugin {
  override settings: KlartextSettings = { ...DEFAULT_SETTINGS };
  private electron: ElectronBits | null = null;
  private state: TopRowState = INITIAL;
  /** What was last applied, so nothing is re-applied every poll. */
  private appliedHidden: boolean | null = null;
  private appliedButtons: boolean | null = null;
  /** The band's height in CSS px, measured on layout changes rather than per poll. */
  private bandCss = 0;
  /** Where the page's own mouse events last saw the pointer; null when outside the window. */
  private pointer: PointerSeen | null = null;
  private lastPollAt = 0;
  private lastInBand = false;

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new KlartextSettingTab(this.app, this));
    this.applySwitches();

    // The furniture switches are CSS and work everywhere; the top row and the
    // window buttons need Electron, which only a desktop has.
    if (!Platform.isDesktopApp) return;
    const electron = loadElectron();
    if (typeof electron === "string") {
      // Silence would look like a plugin that does nothing; say why instead.
      new Notice(`Klartext: the top row stays as it is — ${electron}.`);
      console.warn(`[klartext] not starting: ${electron}`);
      return;
    }
    this.electron = electron;
    this.placeButtons();

    document.body.toggleClass(ACTIVE_CLASS, this.settings.topRowOnHover);
    this.app.workspace.onLayoutReady(() => {
      this.measureBand();
      this.registerEvent(this.app.workspace.on("layout-change", () => this.measureBand()));
      this.registerEvent(this.app.workspace.on("css-change", () => this.measureBand()));
      this.registerDomEvent(window, "resize", () => this.measureBand());
      this.registerDomEvent(document, "mousemove", (e) => {
        this.pointer = { y: e.clientY, at: Date.now() };
      }, { passive: true });
      this.registerDomEvent(window, "mouseout", (e) => {
        if (e.relatedTarget === null) this.pointer = null; // left the window
      });
      this.registerInterval(window.setInterval(() => this.tick(), TICK_MS));
      this.tick();
    });
  }

  override onunload(): void {
    document.body.removeClass(ACTIVE_CLASS, HIDDEN_CLASS, ...ALL_SWITCHES.map((s) => s.cls));
    // Never leave a window without its buttons, or with them moved, because the
    // plugin went away: with the class gone the variable is Obsidian's default
    // again, and the same formula puts them back where Obsidian would.
    if (this.appliedButtons === false) this.setButtons(true);
    this.placeButtons();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applySwitches();
    this.placeButtons();
    document.body.toggleClass(ACTIVE_CLASS, this.settings.topRowOnHover && this.electron !== null);
    if (!this.settings.topRowOnHover) {
      document.body.removeClass(HIDDEN_CLASS);
      this.state = INITIAL;
      this.appliedHidden = null;
    }
    this.appliedButtons = null; // re-apply under the new settings on the next poll
    this.measureBand();
  }

  /** One body class per switch that is on, and none for one that is off. */
  private applySwitches(): void {
    const on = new Set(switchClasses(this.settings));
    for (const s of ALL_SWITCHES) document.body.toggleClass(s.cls, on.has(s.cls));
  }

  /**
   * Put the macOS window buttons where Obsidian's own formula says, from the
   * variable styles.css may just have changed. Obsidian does the same on its
   * next window event and, reading the same variable, lands on the same point.
   * Only where Obsidian itself places them: macOS without the native frame.
   */
  private placeButtons(): void {
    const win = this.electron?.window;
    if (!win || typeof win.setWindowButtonPosition !== "function") return;
    const body = document.body;
    if (!body.hasClass("mod-macos") || !body.hasClass("is-frameless")) return;
    const style = getComputedStyle(body);
    const position = windowButtonPosition(
      parseFloat(style.getPropertyValue("--traffic-lights-offset-x")),
      parseFloat(style.getPropertyValue("--traffic-lights-offset-y")),
      this.electron!.zoom(),
    );
    try {
      win.setWindowButtonPosition.call(win, position);
    } catch (e) {
      console.warn("[klartext] could not place the window buttons:", e);
    }
  }

  /** The band covers everything in the top row, and never less than one header. */
  private measureBand(): void {
    let bottom = 0;
    document.querySelectorAll<HTMLElement>(TOP_ROW).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
    });
    const header = parseFloat(getComputedStyle(document.body).getPropertyValue("--header-height"));
    this.bandCss = Math.max(bottom, Number.isFinite(header) ? header : 40);
  }

  private tick(): void {
    const electron = this.electron;
    if (!electron || document.hidden) return;
    if (!this.settings.topRowOnHover) {
      // The row is simply there. Give the buttons back if they were hidden.
      if (this.appliedButtons === false) this.setButtons(true);
      this.appliedButtons = true;
      return;
    }

    const now = Date.now();
    let inBand = this.lastInBand;
    if (this.pointer !== null && this.pointer.y < this.bandCss) {
      inBand = true; // the page saw it there itself: nothing to ask
    } else if (shouldPoll({ now, shown: this.state.shown, pointer: this.pointer, lastPollAt: this.lastPollAt, bandCss: this.bandCss })) {
      try {
        inBand = inTopBand(electron.cursor(), electron.window.getContentBounds(), this.bandCss, electron.zoom());
      } catch (e) {
        // A window torn down mid-poll; the next poll either works or the plugin is unloading.
        console.debug("[klartext] poll skipped:", e);
        return;
      }
      this.lastPollAt = now;
    } else if (this.pointer !== null) {
      inBand = false; // seen deep in the note, and already confirmed there
    }
    this.lastInBand = inBand;

    const active = document.activeElement;
    this.state = nextState(this.state, {
      inBand,
      focusInRow: active instanceof HTMLElement && active.closest(TOP_ROW) !== null,
      held: document.body.hasClass("is-grabbing") || document.querySelector(".menu") !== null,
      now,
    });

    const hidden = !this.state.shown;
    if (hidden !== this.appliedHidden) {
      document.body.toggleClass(HIDDEN_CLASS, hidden);
      this.appliedHidden = hidden;
    }

    const buttons = windowButtonsVisible(
      this.state.shown,
      this.settings.hideWindowButtons,
      document.body.hasClass("is-fullscreen"),
      document.body.hasClass("is-hidden-frameless"),
    );
    if (buttons !== this.appliedButtons) {
      this.setButtons(buttons);
      this.appliedButtons = buttons;
    }
  }

  /** macOS only: elsewhere Electron has no such method, and there is nothing to hide. */
  private setButtons(visible: boolean): void {
    const set = this.electron?.window.setWindowButtonVisibility;
    if (typeof set === "function") set.call(this.electron!.window, visible);
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
