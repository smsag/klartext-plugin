// The plugin's settings, and the one place a stored value is trusted.
//
// data.json is a file a person can edit, sync, or corrupt; whatever it holds
// is untrusted until this function has looked at it. The fallback is the
// default, never the raw value.

export interface KlartextSettings {
  /** macOS: hide the red/yellow/green window buttons along with the row. */
  hideWindowButtons: boolean;
}

export const DEFAULT_SETTINGS: KlartextSettings = {
  hideWindowButtons: true,
};

export function normalizeSettings(raw: unknown): KlartextSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    hideWindowButtons:
      typeof obj.hideWindowButtons === "boolean" ? obj.hideWindowButtons : DEFAULT_SETTINGS.hideWindowButtons,
  };
}
