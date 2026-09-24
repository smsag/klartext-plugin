// The furniture switches: which setting sets which body class, and what the
// settings tab says about it.
//
// styles.css keys every furniture rule on one of these classes, and
// tests/styles.test.ts holds the two together in both directions: a setting
// with no rule does nothing, and a rule with no setting is a permanent change
// wearing a switch's name.

import type { KlartextSettings } from "./settings";

export type SwitchKey = Exclude<keyof KlartextSettings, "topRowOnHover" | "hideWindowButtons">;

export interface Switch {
  key: SwitchKey;
  cls: string;
  name: string;
  desc: string;
}

/** The window's top row: what is there, and where the window buttons sit. */
export const TOP_ROW_SWITCHES: readonly Switch[] = [
  {
    key: "hideTabBar",
    cls: "klartext-hide-tab-bar",
    name: "Hide the tab bar",
    desc:
      "Hides the tab strip at the top of the window. The note header takes its place: on macOS it is inset clear of " +
      "the window buttons, and it becomes the handle for dragging the window. The strip carries the + new tab button " +
      "and the right sidebar button, which go with it; open a tab with the hotkey or the quick switcher, and the right " +
      "sidebar with its hotkey or the command palette. Sidebar tab strips are left alone. With Obsidian's own " +
      "Appearance → “Show tab title bar” off there is no header to take the strip's place, so the strip stays.",
  },
  {
    key: "alignWindowButtons",
    cls: "klartext-align-window-buttons",
    name: "Align the window buttons with the row",
    desc:
      "macOS only, with the window frame set to hidden. Moves the red, yellow and green buttons onto the axis of " +
      "the icons beside them, through Obsidian's own placement. Nothing else on the page moves.",
  },
];

export const HIDE_SWITCHES: readonly Switch[] = [
  { key: "hideStatusBar", cls: "klartext-hide-status-bar", name: "Hide the status bar", desc: "Hides the bar along the bottom: word count, character count, backlink count." },
  {
    key: "hideVaultName",
    cls: "klartext-hide-vault-name",
    name: "Hide the vault name",
    desc:
      "Desktop only. Hides the vault profile at the foot of the sidebar. WARNING: this also hides the settings gear, " +
      "the help button and the vault switcher that sit beside it. Reach settings by hotkey or the command palette.",
  },
  { key: "hideScrollbars", cls: "klartext-hide-scrollbars", name: "Hide scroll bars", desc: "Hides every scroll bar. Scrolling itself is unaffected." },
  {
    key: "hideSidebarToggles",
    cls: "klartext-hide-sidebar-toggles",
    name: "Hide the sidebar buttons",
    desc: "Hides both sidebar buttons. The sidebars still open by hotkey, by the command palette, and by dragging their edge.",
  },
  {
    key: "hideTooltips",
    cls: "klartext-hide-tooltips",
    name: "Hide tooltips",
    desc:
      "Hides every hover tooltip. Error messages, such as a rename to a name already taken, still show, and the labels " +
      "behind the tooltips stay readable to a screen reader.",
  },
  {
    key: "hideExplorerButtons",
    cls: "klartext-hide-explorer-buttons",
    name: "Hide the file explorer's buttons",
    desc: "Hides the row of buttons at the top of the file explorer: new note, new folder, sort, collapse.",
  },
  {
    key: "hideReadingProperties",
    cls: "klartext-hide-reading-properties",
    name: "Hide properties in Reading view",
    desc: "Hides the properties block above a note in Reading view. Live Preview and the properties pane are untouched.",
  },
  {
    key: "hideSearchSuggestions",
    cls: "klartext-hide-search-suggestions",
    name: "Hide search suggestions",
    desc: "Hides the “Search options” panel that drops out of a search field listing path:, file:, tag: and the rest. The operators keep working when typed.",
  },
  {
    key: "hideSearchCounts",
    cls: "klartext-hide-search-counts",
    name: "Hide search match counts",
    desc:
      "Hides the little number beside each file in the search pane saying how many matches it holds. The “N results” " +
      "line above them stays, and so do the counts in the backlinks and tag panes.",
  },
  {
    key: "hidePromptInstructions",
    cls: "klartext-hide-prompt-instructions",
    name: "Hide prompt instructions",
    desc: "Hides the keyboard hints along the foot of the quick switcher, the command palette and every other prompt. The shortcuts themselves are unchanged.",
  },
];

export const ALL_SWITCHES: readonly Switch[] = [...TOP_ROW_SWITCHES, ...HIDE_SWITCHES];

/** The body classes the current settings ask for. */
export function switchClasses(settings: KlartextSettings): string[] {
  return ALL_SWITCHES.filter((s) => settings[s.key]).map((s) => s.cls);
}
