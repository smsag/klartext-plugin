// The plugin's settings, and the one place a stored value is trusted.
//
// data.json is a file a person can edit, sync, or corrupt; whatever it holds
// is untrusted until this function has looked at it. The fallback is the
// default, never the raw value.

export interface KlartextSettings {
  /** Fade the window's top row until the pointer reaches the top. */
  topRowOnHover: boolean;
  /** macOS: hide a pop-out window's red/yellow/green buttons along with its row.
   *  The main window keeps its buttons. */
  hideWindowButtons: boolean;
  /** macOS: move the window buttons onto the row's axis. */
  alignWindowButtons: boolean;
  hideTabBar: boolean;
  hideStatusBar: boolean;
  hideVaultName: boolean;
  hideScrollbars: boolean;
  hideSidebarToggles: boolean;
  hideLeftSidebarTabs: boolean;
  hideRightSidebarTabs: boolean;
  hideTooltips: boolean;
  hideExplorerButtons: boolean;
  hideReadingProperties: boolean;
  hideSearchSuggestions: boolean;
  hideSearchCounts: boolean;
  hidePromptInstructions: boolean;
  /** Phone: the folder and file name at the top of a view. */
  hidePhoneTitle: boolean;
  /** Phone: the sidebar, reading-view and ⋯ buttons beside it, in a note or a base. */
  hidePhoneButtons: boolean;
  /** Phone: a base's toolbar slides away while the base is scrolled down. */
  hideBaseToolbarOnScroll: boolean;
  /** A table row with fewer cells than the header leaves its last columns to the cell above. */
  mergeTableCells: boolean;
  /** The theme draws its own boxes for the task markers beyond Markdown's two and Obsidian's usual four. */
  themeTaskMarkers: boolean;
}

/** Installing the plugin is the choice of a quiet top row, so that part is on;
 *  every piece of furniture stays until it is switched off by name. */
export const DEFAULT_SETTINGS: KlartextSettings = {
  topRowOnHover: true,
  hideWindowButtons: true,
  alignWindowButtons: false,
  hideTabBar: false,
  hideStatusBar: false,
  hideVaultName: false,
  hideScrollbars: false,
  hideSidebarToggles: false,
  hideLeftSidebarTabs: false,
  hideRightSidebarTabs: false,
  hideTooltips: false,
  hideExplorerButtons: false,
  hideReadingProperties: false,
  hideSearchSuggestions: false,
  hideSearchCounts: false,
  hidePromptInstructions: false,
  hidePhoneTitle: false,
  hidePhoneButtons: false,
  hideBaseToolbarOnScroll: false,
  mergeTableCells: false,
  themeTaskMarkers: false,
};

export function normalizeSettings(raw: unknown): KlartextSettings {
  const obj = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof KlartextSettings)[]) {
    const value = obj[key];
    if (typeof value === "boolean") out[key] = value;
  }
  // 0.4 had one switch for the whole note header. It is now the title and the
  // buttons, and both on is what it did.
  if (obj.hidePhoneHeader === true && !("hidePhoneTitle" in obj) && !("hidePhoneButtons" in obj)) {
    out.hidePhoneTitle = true;
    out.hidePhoneButtons = true;
  }
  return out;
}
