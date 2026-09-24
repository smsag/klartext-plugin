// The plugin's settings, and the one place a stored value is trusted.
//
// data.json is a file a person can edit, sync, or corrupt; whatever it holds
// is untrusted until this function has looked at it. The fallback is the
// default, never the raw value.

export interface KlartextSettings {
  /** Fade the window's top row until the pointer reaches the top. */
  topRowOnHover: boolean;
  /** macOS: hide the red/yellow/green window buttons along with the row. */
  hideWindowButtons: boolean;
  /** macOS: move the window buttons onto the row's axis. */
  alignWindowButtons: boolean;
  hideTabBar: boolean;
  hideStatusBar: boolean;
  hideVaultName: boolean;
  hideScrollbars: boolean;
  hideSidebarToggles: boolean;
  hideTooltips: boolean;
  hideExplorerButtons: boolean;
  hideReadingProperties: boolean;
  hideSearchSuggestions: boolean;
  hideSearchCounts: boolean;
  hidePromptInstructions: boolean;
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
  hideTooltips: false,
  hideExplorerButtons: false,
  hideReadingProperties: false,
  hideSearchSuggestions: false,
  hideSearchCounts: false,
  hidePromptInstructions: false,
};

export function normalizeSettings(raw: unknown): KlartextSettings {
  const obj = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof KlartextSettings)[]) {
    const value = obj[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}
