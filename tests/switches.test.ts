import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { ALL_SWITCHES, switchClasses } from "../src/switches";

describe("the furniture switches", () => {
  it("are twelve, one per setting that is not the top row's own", () => {
    const keys = ALL_SWITCHES.map((s) => s.key).sort();
    const expected = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== "topRowOnHover" && k !== "hideWindowButtons").sort();
    expect(keys).toEqual(expected);
    expect(keys).toHaveLength(12);
  });

  it("are all off by default: nothing disappears until it is switched off by name", () => {
    for (const s of ALL_SWITCHES) expect(DEFAULT_SETTINGS[s.key], s.key).toBe(false);
  });

  it("each set their own class, and say what they take with them", () => {
    const classes = ALL_SWITCHES.map((s) => s.cls);
    expect(new Set(classes).size).toBe(classes.length);
    for (const s of ALL_SWITCHES) {
      expect(s.cls).toMatch(/^klartext-(hide|align)-[a-z-]+$/);
      expect(s.name.length, s.key).toBeGreaterThan(0);
      expect(s.desc.length, s.key).toBeGreaterThan(20);
    }
  });

  it("turn into exactly the classes of the switches that are on", () => {
    expect(switchClasses(DEFAULT_SETTINGS)).toEqual([]);
    expect(switchClasses({ ...DEFAULT_SETTINGS, hideTabBar: true, hideTooltips: true }).sort()).toEqual(
      ["klartext-hide-tab-bar", "klartext-hide-tooltips"].sort(),
    );
  });
});
