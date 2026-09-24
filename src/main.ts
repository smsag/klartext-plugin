// Wiring: read the pointer, the window and the DOM; ask topRow.ts; apply.
//
// Why the pointer is polled rather than followed with mouse events: with the
// window frame hidden, the top strip is the window's drag handle, and macOS
// does not deliver mouse movement over a drag handle to the page. The row would
// never learn the pointer had arrived — or, once it is showing, that the
// pointer had left. Electron's own cursor position is not blind there.

import { Notice, Platform, Plugin, PluginSettingTab, Setting, type App } from "obsidian";
import { DEFAULT_SETTINGS, normalizeSettings, type KlartextSettings } from "./settings";
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

    if (!Platform.isDesktopApp) return;
    const electron = loadElectron();
    if (typeof electron === "string") {
      // Silence would look like a plugin that does nothing; say why instead.
      new Notice(`Klartext: the top row stays as it is — ${electron}.`);
      console.warn(`[klartext] not starting: ${electron}`);
      return;
    }
    this.electron = electron;

    document.body.addClass(ACTIVE_CLASS);
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
    document.body.removeClass(ACTIVE_CLASS, HIDDEN_CLASS);
    // Never leave a window without its buttons because the plugin went away.
    if (this.appliedButtons === false) this.setButtons(true);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.appliedButtons = null; // re-apply under the new setting on the next poll
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
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Hide the window buttons with the row")
      .setDesc(
        "macOS only, with the window frame set to hidden. The red, yellow and green buttons appear and " +
          "disappear together with the top row. With a title bar, and in fullscreen, they are left alone.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.hideWindowButtons).onChange(async (v) => {
          this.plugin.settings.hideWindowButtons = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
