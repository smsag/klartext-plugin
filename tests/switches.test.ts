import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { ALL_SWITCHES, availableOn, switchClasses } from "../src/switches";

describe("the furniture switches", () => {
  it("are seventeen, one per setting that is not the top row's own or the tables'", () => {
    const keys = ALL_SWITCHES.map((s) => s.key).sort();
    const own = ["topRowOnHover", "hideWindowButtons", "mergeTableCells"];
    const expected = Object.keys(DEFAULT_SETTINGS).filter((k) => !own.includes(k)).sort();
    expect(keys).toEqual(expected);
    expect(keys).toHaveLength(17);
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

describe("availableOn", () => {
  const mac = { desktop: true, macOS: true, phone: false };
  const linux = { desktop: true, macOS: false, phone: false };
  const phone = { desktop: false, macOS: false, phone: true };
  const tablet = { desktop: false, macOS: false, phone: false };

  it("offers a Mac-only switch on a Mac desktop and nowhere else", () => {
    expect(availableOn("macos", mac)).toBe(true);
    expect(availableOn("macos", linux)).toBe(false);
    expect(availableOn("macos", { desktop: false, macOS: true, phone: false })).toBe(false); // an iPad reports macOS-like flags
  });

  it("offers a desktop switch on every desktop, and an unrestricted one everywhere", () => {
    expect(availableOn("desktop", linux)).toBe(true);
    expect(availableOn("desktop", phone)).toBe(false);
    expect(availableOn(undefined, phone)).toBe(true);
  });

  it("offers a phone switch on a phone only, not on a tablet or a desktop", () => {
    expect(availableOn("phone", phone)).toBe(true);
    expect(availableOn("phone", tablet)).toBe(false);
    expect(availableOn("phone", mac)).toBe(false);
  });

  it("marks the switches that say so in their own description", () => {
    for (const s of ALL_SWITCHES) {
      if (/^macOS only/.test(s.desc)) expect(s.only, s.key).toBe("macos");
      if (/^Desktop only/.test(s.desc)) expect(s.only, s.key).toBe("desktop");
      if (/^Phone only/.test(s.desc)) expect(s.only, s.key).toBe("phone");
    }
  });
});
