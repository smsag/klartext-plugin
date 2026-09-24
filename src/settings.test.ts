import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("returns the defaults for nothing stored yet", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps a valid stored value", () => {
    expect(normalizeSettings({ hideWindowButtons: false })).toEqual({ hideWindowButtons: false });
  });

  it("falls back to the default for a value of the wrong type, never the raw value", () => {
    expect(normalizeSettings({ hideWindowButtons: "false" })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ hideWindowButtons: 0 })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("garbage")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("drops keys it does not know", () => {
    expect(normalizeSettings({ hideWindowButtons: true, extra: 1 })).toEqual({ hideWindowButtons: true });
  });
});
