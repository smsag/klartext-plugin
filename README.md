# Klartext

An Obsidian plugin that shows the window's top row only while the pointer is at
the top of the window. The top row is the tab strip, the note header with back
and forward, and on macOS the red, yellow and green window buttons. Move the
pointer up and the row fades in; move it away and it fades out. The note never
moves.

It is the companion to the [Klartext theme](https://github.com/smsag/Klartext),
and works under any theme.

## What it does

- **The band is the window's top edge, across its full width.** It is as tall as
  the row it reveals, measured from the layout: about 80px with a tab strip,
  40px when a theme hides the strip. The window-button corner counts.
- **The row stays about 0.4s after the pointer leaves**, so a pointer that
  overshoots on its way down does not make it flicker.
- **It stays while something it opened is open.** A menu from the note header
  keeps it shown, and so does dragging a tab. A menu opened in the note does not
  reveal it.
- **Keyboard focus inside the row reveals it** just as the pointer does.
- **The window buttons follow the row** (macOS, with the window frame set to
  hidden). There is a setting to leave them alone. In fullscreen, and with a
  title bar, they are never touched: in fullscreen macOS draws them in its own
  menu bar, and in a title bar no pointer in the band could bring them back.
- **Disabling the plugin puts everything back**, the window buttons included.

Only the main area's top row is affected: the root tab strip and the headers of
its top panes. A pane stacked below another keeps its own strip and header, and
the sidebars are left alone.

### With the Klartext theme

The theme's *Hide Tab Bar* removes the tab strip altogether, and the plugin then
reveals just the note header and the window buttons. The theme's *Hide View
Header* fades the header until it is hovered itself; with the plugin running,
the header appears as soon as the pointer reaches the top of the window,
including the corner with the window buttons.

## How it knows where the pointer is

With the window frame hidden, the empty part of the top strip is the window's
drag handle, and macOS does not deliver mouse movement over a drag handle to the
page. A page listening for the pointer alone would never see it arrive at the
top, and never see it leave again. So the plugin asks Electron where the cursor
is, which works over a drag handle as well.

Each ask is two synchronous calls to Electron's main process, measured at
2.5ms. The plugin therefore asks only where the page cannot see for itself:

| where the pointer is | asks per second | |
|---|---|---|
| resting deep in the note | 1 | measured |
| just below the row | about 10 | measured |
| in the row, where the page can see it | 0 | measured |
| in the row, over a drag handle (macOS) | about 10, while shown | by design; Linux has no blind drag handle to measure |
| outside the window | about 3 | by design |

The one ask a second deep in the note is a heartbeat. It exists for a pointer
that reaches the top without producing any mouse event, for example when the
window moves under a pointer that is standing still. Measured, such a pointer is
found within 0.7s; without the heartbeat it was never found.

## Verified, and not

Verified in Obsidian 1.13.7 on Linux, by moving the real X pointer and reading
what paints:

- the row fading at every state above, under the default theme and under
  Klartext with and without its two switches
- the reveal band following the layout (80px with a strip, 40px without)
- every call to the window buttons: one per change and none per poll, the
  fullscreen and title-bar exemptions, and the restore when the plugin is
  disabled

**Not verified: anything specific to macOS.** Linux has no
`setWindowButtonVisibility`, so the window-button calls were checked against a
stand-in that records them. Linux also delivers mouse events over drag handles,
so the blind case was simulated. Worth checking on a Mac:

1. The buttons disappear and come back with the row.
2. The row appears when the pointer arrives over the empty strip, not only over
   a tab or button.
3. macOS does not bring the buttons back on its own, for example after leaving
   fullscreen or switching windows.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/klartext/`, then enable **Klartext** under
Settings → Community plugins. Desktop only.

## Development

```sh
npm install
npm run check   # unit tests, then typecheck and build
npm run dev     # rebuild on change
```

Every decision lives in `src/topRow.ts` and `src/settings.ts`, which import
neither Obsidian nor Electron and have unit tests. `src/main.ts` only reads the
pointer, the window and the DOM, and applies the answer.
