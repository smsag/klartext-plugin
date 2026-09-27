// What styles.css must keep true. Nearly every assertion here is a scope that
// was once got wrong while these rules lived in the Klartext theme, found by
// measuring Obsidian, and each one fails in the forbidden direction.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_SWITCHES } from "../src/switches";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule as its selector arms and its body. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  arms: (m[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  body: m[2] ?? "",
}));
const keyedOn = (cls: string) => rules.filter((r) => r.arms.some((a) => a.includes(`.${cls}`)));
const one = (cls: string, bodyPattern?: RegExp) => {
  const found = keyedOn(cls).filter((r) => !bodyPattern || bodyPattern.test(r.body));
  expect(found.length, `${cls} ${bodyPattern ?? ""}`).toBeGreaterThan(0);
  return found[0]!;
};

describe("every switch is declared and acted on, in both directions", () => {
  it("each switch has a rule — a setting with no rule does nothing", () => {
    for (const s of ALL_SWITCHES) expect(keyedOn(s.cls).length, s.cls).toBeGreaterThan(0);
  });

  it("each switch class in the stylesheet has a setting — a rule with no setting is a permanent change wearing a switch's name", () => {
    const declared = new Set(ALL_SWITCHES.map((s) => s.cls));
    const used = new Set([...css.matchAll(/\.(klartext-(?:hide|align)-[a-z-]+)/g)].map((m) => m[1]));
    for (const cls of used) expect(declared.has(cls!), cls).toBe(true);
  });
});

describe("the top row on hover", () => {
  it("keys the hidden state on each window's own attribute, never a class Obsidian copies into pop-outs", () => {
    // Obsidian mirrors the main window's body classes into every pop-out, so a
    // hidden class made each pop-out's row follow the main window's pointer.
    const hide = rules.filter((r) => /opacity:\s*0\s*;?/.test(r.body) && r.arms.some((a) => a.includes(".klartext-top-row")));
    expect(hide.length).toBeGreaterThan(0);
    for (const r of hide) for (const a of r.arms) expect(a).toContain('[data-klartext-top-row="hidden"]');
    expect(css).not.toMatch(/klartext-top-row-hidden/);
  });
});

describe("the tab strip", () => {
  it("hides only the window's own strip: a sidebar's strip is how its panes are switched", () => {
    const r = one("klartext-hide-tab-bar", /display:\s*none/);
    for (const a of r.arms) expect(a).toContain(".mod-root");
  });

  it("hides the strip only where Obsidian keeps the note header: its title bar shown, or a phone", () => {
    // With Obsidian's "Show tab title bar" off and the strip hidden too, the
    // top row was empty and the window could not be dragged at all (0/90).
    const r = one("klartext-hide-tab-bar", /display:\s*none/);
    for (const a of r.arms) expect(a.includes(".show-view-header") || a.includes(".is-phone"), a).toBe(true);
    expect(r.arms.some((a) => a.includes(".show-view-header"))).toBe(true);
    expect(r.arms.some((a) => a.includes(".is-phone"))).toBe(true);
  });

  it("keeps the header that takes the strip's place at the strip's height: it never shrinks", () => {
    // Obsidian lets the header shrink beside the note (38.14px at 900px tall,
    // 37.56px at 600px), so the find bar under it drifted against every
    // sidebar's first row, which sits under a strip that never shrinks.
    const r = one("klartext-hide-tab-bar", /flex-shrink:\s*0/);
    for (const a of r.arms) {
      expect(a).toContain(".mod-root");
      expect(a).toContain(".view-header");
      expect(a).toContain(".show-view-header");
      expect(a).toContain(":not(.is-phone)");
    }
  });

  it("insets only the header the window buttons overlap, macOS with the frame hidden, with Obsidian's own reservation", () => {
    const r = one("klartext-hide-tab-bar", /padding-left/);
    for (const a of r.arms) {
      expect(a).toContain(".mod-macos");
      expect(a).toContain(".mod-top-left-space");
      expect(a).toContain(".is-hidden-frameless");
      expect(a).toContain(":not(.is-fullscreen)");
    }
    expect(r.body).toMatch(/padding-left:\s*calc\(var\(--size-4-2\)\s*\+\s*var\(--frame-left-space\)\)/);
  });

  it("hands the window's drag handle to the header, off while a tab is dragged, under Obsidian's own frame condition", () => {
    const r = one("klartext-hide-tab-bar", /-webkit-app-region:\s*drag/);
    for (const a of r.arms) {
      expect(a).toContain(".view-header");
      expect(a).toContain(":not(.is-grabbing)");
      expect(a).toContain(".is-hidden-frameless");
      expect(a).toContain(":not(.is-fullscreen)");
    }
  });

  it("keeps the header's title and breadcrumb clickable inside that drag handle", () => {
    const r = one("klartext-hide-tab-bar", /-webkit-app-region:\s*no-drag/);
    expect(r.arms.some((a) => a.includes(".view-header-title-container"))).toBe(true);
  });
});

describe("the window buttons", () => {
  it("are aligned through Obsidian's own variable, on macOS with the frame hidden", () => {
    const r = one("klartext-align-window-buttons", /--traffic-lights-offset-y/);
    for (const a of r.arms) {
      expect(a).toContain(".mod-macos");
      expect(a).toContain(".is-hidden-frameless");
    }
  });

  it("move without anything on the page moving: no rule keyed on the alignment shifts a row", () => {
    for (const r of keyedOn("klartext-align-window-buttons")) {
      expect(r.body, r.arms.join(", ")).not.toMatch(/padding|translate|margin|top:/);
    }
  });
});

describe("classes Obsidian reuses elsewhere", () => {
  it("scroll bars go through the standard property Chromium honours, never ::-webkit-scrollbar", () => {
    one("klartext-hide-scrollbars", /--scrollbar-native-width:\s*none/);
    for (const r of keyedOn("klartext-hide-scrollbars")) for (const a of r.arms) expect(a).not.toContain("::-webkit-scrollbar");
  });

  it("tooltips spare the error tooltip, which is how Obsidian says a rename or a property was refused", () => {
    for (const a of one("klartext-hide-tooltips").arms) expect(a).toContain(":not(.mod-error)");
  });

  it("match counts are the search pane's only: the backlinks pane uses the same markup, the tag pane the same badge", () => {
    for (const a of one("klartext-hide-search-counts").arms) {
      expect(a).toContain('[data-type="search"]');
      expect(a).toContain(".search-result-file-title");
    }
  });

  it("search suggestions are the search panel's only: a bare .suggestion-container is also the quick switcher and the editor's autocomplete", () => {
    for (const a of one("klartext-hide-search-suggestions").arms) expect(a).toContain(".mod-search-suggestion");
  });

  it("the vault profile goes through Obsidian's token, which a class rule loses to at (0,4,1)", () => {
    one("klartext-hide-vault-name", /--vault-profile-display:\s*none/);
  });
});

describe("the sidebar tab icons", () => {
  const sides = [
    ["klartext-hide-left-sidebar-tabs", ".mod-left-split"],
    ["klartext-hide-right-sidebar-tabs", ".mod-right-split"],
  ] as const;

  it("hides the icons, never the strip: the window buttons, the drag handle and the sidebar button live in it", () => {
    for (const [cls] of sides) {
      const r = one(cls, /display:\s*none/);
      for (const a of r.arms) {
        expect(a, a).toMatch(/> \.workspace-tab-header-(container-inner|tab-list)$/);
        expect(a, a).not.toMatch(/\.workspace-tab-header-container$/);
      }
    }
  });

  it("stays in its own sidebar, on its top strip, on the desktop", () => {
    for (const [cls, split] of sides) {
      for (const r of keyedOn(cls)) {
        for (const a of r.arms) {
          expect(a, a).toContain(split);
          expect(a, a).not.toContain(".mod-root");
          expect(a, a).toContain(".mod-top");
          expect(a, a).toContain(":not(.is-mobile)");
        }
      }
    }
  });
});
