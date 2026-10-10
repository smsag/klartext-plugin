// What styles.css must keep true. Nearly every assertion here is a scope that
// was once got wrong while these rules lived in the Klartext theme, found by
// measuring Obsidian, and each one fails in the forbidden direction.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_SWITCHES, TASK_MARKERS_CLASS } from "../src/switches";

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

  it("takes the emptied strip's band and rule away, but never its height", () => {
    // The band's lower edge read as a stray line across the sidebar.
    for (const [cls] of sides) {
      const r = one(cls, /background-color:\s*transparent/);
      expect(r.body).toMatch(/border-bottom-color:\s*transparent/);
      expect(r.body).not.toMatch(/display|height|border(-bottom)?:\s*(none|0)/);
      for (const a of r.arms.filter((x) => x.includes(`.${cls}`)))
        expect(a, a).toMatch(/> \.workspace-tab-header-container$/);
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

describe("the header on a phone", () => {
  const titleOnly = keyedOn("klartext-hide-phone-title").filter((r) => !r.arms.some((a) => a.includes(".klartext-hide-phone-buttons")));
  const buttonsOnly = keyedOn("klartext-hide-phone-buttons").filter((r) => !r.arms.some((a) => a.includes(".klartext-hide-phone-title")));
  const both = keyedOn("klartext-hide-phone-title").filter((r) => r.arms.every((a) => a.includes(".klartext-hide-phone-buttons")));

  it("hides one part alone in place, so the other part and the page keep their positions", () => {
    for (const r of [...titleOnly, ...buttonsOnly]) {
      expect(r.body).toMatch(/visibility:\s*hidden/);
      expect(r.body).not.toMatch(/display:\s*none/);
      for (const a of r.arms) {
        expect(a).toContain(".is-phone");
        expect(a).toContain(".mod-root");
      }
    }
    expect(titleOnly.flatMap((r) => r.arms).every((a) => a.endsWith(".view-header-title-container"))).toBe(true);
  });

  it("keeps the buttons of a canvas, a PDF or a plugin's view: they may be its only way to its actions", () => {
    const arms = buttonsOnly.flatMap((r) => r.arms);
    expect(arms.length).toBeGreaterThan(0);
    for (const a of arms) expect(a.includes('[data-type="markdown"]') || a.includes('[data-type="bases"]'), a).toBe(true);
  });

  it("empties the bar rather than removing it, so the safe area under the clock stays when it sits in the flow", () => {
    const r = both.find((x) => /display:\s*none/.test(x.body));
    expect(r).toBeDefined();
    for (const a of r!.arms) expect(a.endsWith(".view-header > *"), a).toBe(true);
    expect(css).not.toMatch(/\.view-header\s*\{\s*display:\s*none/);
  });

  it("gives the bar's room back through Obsidian's own spacing, and only under floating navigation", () => {
    const spacing = both.filter((x) => /--view-top-spacing/.test(x.body));
    expect(spacing.some((x) => /--view-top-spacing-markdown/.test(x.body))).toBe(true);
    expect(spacing.some((x) => /--view-top-spacing:/.test(x.body))).toBe(true);
    for (const r of spacing) {
      expect(r.body).not.toMatch(/--view-header-height/);
      for (const a of r.arms) {
        expect(a.includes(".is-floating-nav") || a.includes(".auto-full-screen"), a).toBe(true);
        // Only where the bar is emptied: a note in a drawer keeps its bar.
        expect(a).toContain(".workspace-split.mod-root .workspace-leaf-content[data-type=");
      }
    }
  });
});

describe("a base's toolbar while scrolling", () => {
  const toolbarRules = keyedOn("klartext-hide-base-toolbar");

  it("acts only on a leaf's own base in the main area, on a phone", () => {
    expect(toolbarRules.length).toBeGreaterThan(0);
    for (const r of toolbarRules) {
      for (const a of r.arms) {
        expect(a).toContain(".is-phone");
        expect(a).toContain('.workspace-split.mod-root .workspace-leaf-content[data-type="bases"]');
      }
    }
  });

  it("floats the toolbar over the base, so moving it changes no layout and no scroll position", () => {
    const r = one("klartext-hide-base-toolbar", /position:\s*absolute/);
    for (const a of r.arms) expect(a.endsWith("> .view-content > .bases-header"), a).toBe(true);
    expect(r.body).toMatch(/background-color:\s*var\(--background-primary\)/);
    // The 0.5 switch collapsed a margin, which moved the rows and made the
    // browser clamp the scroll position at the foot of a base.
    for (const x of toolbarRules) {
      expect(x.body).not.toMatch(/margin-top:\s*calc\(-1/);
      expect(x.body).not.toMatch(/transition:[^;]*margin/);
    }
  });

  it("opens the room in the scroller only while the search row is closed, where it would otherwise open it twice", () => {
    const spacer = one("klartext-hide-base-toolbar", /height:\s*calc\(var\(--klartext-base-band\) \+ var\(--bases-header-height\)\)/);
    for (const a of spacer.arms) expect(a).toContain(':not(.klartext-base-search-open) > .view-content > .bases-view::before');
  });

  it("keys the search row on the plugin's own mark, never on Obsidian's inline style", () => {
    // The plugin decides whether the row is open from its computed display;
    // a selector reading the style attribute could disagree with it.
    expect(css).not.toMatch(/\[style\*=/);
    const open = toolbarRules.filter((r) => r.arms.some((a) => a.includes(".bases-search-row")));
    expect(open.length).toBeGreaterThan(0);
    for (const r of open) for (const a of r.arms) expect(a).toContain(".klartext-base-search-open");
  });

  it("keeps the toolbar under Obsidian's floating bar: the base's content is its own stacking context at 0", () => {
    const r = one("klartext-hide-base-toolbar", /z-index:\s*0/);
    for (const a of r.arms) expect(a.endsWith("> .view-content"), a).toBe(true);
    expect(r.body).toMatch(/position:\s*relative/);
  });

  it("gives the toolbar the band above it as its ground, moving with it, so a returned toolbar reaches the top edge", () => {
    const r = keyedOn("klartext-hide-base-toolbar").find((x) => x.arms.every((a) => a.endsWith("> .view-content > .bases-header::before")));
    expect(r).toBeDefined();
    expect(r!.body).toMatch(/bottom:\s*100%/);
    expect(r!.body).toMatch(/height:\s*var\(--klartext-base-band\)/);
    expect(r!.body).toMatch(/background-color:\s*var\(--background-primary\)/);
  });

  it("backs a table's header with the band only once the toolbar has gone, never at rest", () => {
    const r = keyedOn("klartext-hide-base-toolbar").find((x) => x.arms.every((a) => a.endsWith(".bases-thead::before")))!;
    for (const a of r.arms) {
      expect(a).toContain(".klartext-base-toolbar-gone");
      expect(a.endsWith(".bases-thead::before"), a).toBe(true);
    }
  });

  it("hides a settling toolbar only when its slide has ended", () => {
    const r = one("klartext-hide-base-toolbar", /transition:[^;]*transform/);
    expect(r.body).toMatch(/visibility 0s linear 180ms/);
  });

  it("reads Obsidian's band only where it is a length: elsewhere it is a bare 0 that voids a calc()", () => {
    const band = toolbarRules.filter((r) => /--klartext-base-band:\s*var\(--view-top-spacing\)/.test(r.body));
    expect(band.length).toBeGreaterThan(0);
    for (const r of band) for (const a of r.arms) expect(a.includes(".is-floating-nav") || a.includes(".auto-full-screen"), a).toBe(true);
    expect(toolbarRules.some((r) => /--klartext-base-band:\s*0px/.test(r.body))).toBe(true);
    for (const r of toolbarRules) expect(r.body).not.toMatch(/calc\([^;]*var\(--view-top-spacing/);
  });

  it("fades the rows under the status bar only where the bar floats", () => {
    const mask = toolbarRules.filter((r) => /mask-image/.test(r.body));
    expect(mask.length).toBeGreaterThan(0);
    for (const r of mask) for (const a of r.arms) expect(a.includes(".is-floating-nav") || a.includes(".auto-full-screen"), a).toBe(true);
  });

  it("animates only the settling stretch, and not at all for someone who asked for less motion", () => {
    const moving = toolbarRules.filter((r) => /transition:\s*(?!none)/.test(r.body));
    expect(moving.length).toBeGreaterThan(0);
    for (const r of moving) for (const a of r.arms) expect(a).toContain(".klartext-base-toolbar-settling");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*klartext-base-toolbar-settling[^}]*\{\s*transition:\s*none/);
  });
});

describe("the theme's task markers", () => {
  it("are the theme's to draw: the plugin's stylesheet has no rule on their class", () => {
    expect(keyedOn(TASK_MARKERS_CLASS)).toEqual([]);
  });
});
