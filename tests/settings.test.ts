import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

describe("normalizeSettings", () => {
  it("returns the defaults for nothing stored yet", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("turns on the quiet top row and nothing else by default", () => {
    const on = Object.entries(DEFAULT_SETTINGS).filter(([, v]) => v).map(([k]) => k);
    expect(on.sort()).toEqual(["hideWindowButtons", "topRowOnHover"]);
  });

  it("keeps every valid stored value", () => {
    const stored = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, !DEFAULT_SETTINGS[k as keyof typeof DEFAULT_SETTINGS]]));
    expect(normalizeSettings(stored)).toEqual(stored);
  });

  it("falls back to the default for a value of the wrong type, never the raw value", () => {
    expect(normalizeSettings({ hideTabBar: "true", topRowOnHover: 0 })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("garbage")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([true, false])).toEqual(DEFAULT_SETTINGS);
  });

  it("drops keys it does not know", () => {
    expect(normalizeSettings({ hideTabBar: true, extra: 1 })).toEqual({ ...DEFAULT_SETTINGS, hideTabBar: true });
  });
});
