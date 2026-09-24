# Klartext

An Obsidian plugin for Obsidian's furniture. The window's top row (tab strip,
note header with back and forward, and on macOS the red, yellow and green
window buttons) shows only while the pointer is at the top of the window, and a
set of switches hides the rest of what a quiet window can do without.

It is the companion to the [Klartext theme](https://github.com/smsag/Klartext),
and works under any theme. **The split:** the theme decides how Klartext
*looks* (type, spacing, colour, marks, diagrams); this plugin decides which
parts of Obsidian are *there*, and when. No setting lives in both.

## The switches

| Setting | Default | Does |
|---|---|---|
| Show the top row only on hover | **on** | tab strip and note header fade out, and return when the pointer reaches the top |
| Hide the window buttons with the row | **on** | macOS, frame hidden: the buttons come and go with the row |
| Hide the tab bar | off | the window's tab strip; the note header takes its place, inset clear of the window buttons and draggable. Kept while Obsidian's *Show tab title bar* is off, since there is no header then |
| Align the window buttons with the row | off | macOS, frame hidden: moves the buttons onto the icons' axis |
| Hide the status bar | off | word count, character count, backlink count |
| Hide the vault name | off | the vault profile, **with the settings gear, help button and vault switcher** (desktop only) |
| Hide scroll bars | off | every scroll bar; scrolling is unaffected |
| Hide the sidebar buttons | off | both sidebar toggles |
| Hide tooltips | off | hover tooltips; error messages still show |
| Hide the file explorer's buttons | off | new note, new folder, sort, collapse |
| Hide properties in Reading view | off | the properties block, Reading view only |
| Hide search suggestions | off | the "Search options" panel of a search field |
| Hide search match counts | off | the per-file counts in the search pane |
| Hide prompt instructions | off | the keyboard hints at the foot of every prompt |

Several reach further than their names, and their descriptions say what goes
with them and how to get it back.

### Aligning the window buttons

Obsidian places the macOS window buttons itself, from two of its own CSS
variables (`--traffic-lights-offset-x` and `-y`, 40px by default; it uses 32px
for a pop-out modal). The switch sets the vertical one to 32px and applies it
at once, with a copy of Obsidian's own formula (`src/windowButtons.ts`).
Obsidian's next placement reads the same variable and lands on the same point,
so the two never fight. Nothing on the page moves.

The 32 is calibrated on one Mac, where the buttons' centre measured 11.5px
below the position Obsidian gives them (23.5 against a row at 19.5). A
different macOS version may draw them differently. **Not verified on a Mac.**

## The top row on hover

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

**Every window has its own row.** A pop-out window hides its tab strip, note
header and window buttons, and brings them back when the pointer reaches its
own top, independently of the main window. Where a pop-out overlaps the main
window's top edge, the pointer belongs to the window in front, the focused one,
so hovering a pop-out's row does not bring up the main window's row behind it.

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

The cursor is asked for once per look, however many windows are open; each
extra pop-out adds one read of its own window's position to each ask. Measured
with one pop-out and the pointer resting: 3.2 cursor reads and 6.4 position
reads a second, against 3.2 and 3.2 with the main window alone.

The one ask a second deep in the note is a heartbeat. It exists for a pointer
that reaches the top without producing any mouse event, for example when the
window moves under a pointer that is standing still. Measured, such a pointer is
found within 0.7s; without the heartbeat it was never found.

## Verified, and not

Verified in Obsidian 1.13.7 on Linux with the Klartext theme 2.0.0, by moving
the real X pointer and reading what paints:

- **Every switch through its own setting.** Each hides its element and brings it
  back when it is switched off again. The settings tab shows two groups and 14
  toggles.
- **The scopes that were got wrong once:**
  - scroll bars go from 15px to 0 in Obsidian's macOS mode and from 12px to 0 in
    its styled mode, and the wheel still scrolls;
  - hover tooltips hide while the rename error still paints;
  - match counts go from 3 to 0 in the search pane, while the backlinks pane
    (2) and the tag pane (4) keep theirs;
  - the search options panel and the prompt hints hide, in the quick switcher and
    the command palette alike.
- **The tab bar and the button alignment across the four frame styles.** Only
  with the frame hidden does the header get the inset (44px) and the drag
  handle, the variable 32px and the buttons (14, 8). With Obsidian's frame the
  buttons stay at Obsidian's default (14, 12); with the native frame nothing is
  touched. Disabling the plugin while aligned puts them back at (14, 12).
- **Pop-out windows:** a pop-out opened before or after the plugin starts has
  its own row, which hides with the pointer in its note and returns at its top
  edge while the main window's row stays as it is, and the reverse; hovering a
  pop-out's top edge where it overlaps the main window's band leaves the main
  row hidden. Its window buttons follow its own row (recorded against a
  stand-in), a switch reaches its body, disabling the plugin gives its buttons
  back, and a closed pop-out is forgotten.
- **The top row:** every state in "The top row on hover", the poll rates in the
  table above, and a pointer that reached the top without any mouse event found
  in 0.73s. With the fading switched off the row stays and the plugin makes no
  calls at all.

**Not verified: anything that happens on macOS itself.** Linux has no window
buttons, so every call to them was recorded against a stand-in; Linux also
delivers mouse events over drag handles, so the blind case was simulated.
Worth checking on a Mac:

1. The buttons sit on the icons' axis with *Align the window buttons* on. The
   32px is calibrated on one Mac.
2. They disappear and return with the row.
3. The row appears when the pointer arrives over the empty strip, not only over
   a tab or button.
4. The window drags from the note header with *Hide the tab bar* on.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/klartext/`, then enable **Klartext** under
Settings → Community plugins. The switches work on mobile too; the top row on
hover and the window buttons are desktop only, since they need Electron.

## Development

```sh
npm install
npm run check   # unit tests, then typecheck and build
npm run dev     # rebuild on change
```

### Releasing

Obsidian installs a plugin from its GitHub release, not from the repository.
A release is cut by the **Release** workflow (Actions → Release → Run
workflow, on `main`, with the version) after `manifest.json` and
`package.json` carry that version on `main`. It refuses, before anything is
published, if the version is not `x.y.z`, differs from either file or is
already tagged, or if `npm run check` fails. Otherwise it tags the commit with
the bare version, as Obsidian expects, and attaches the `main.js` it built with
`manifest.json` and `styles.css`. The notes are GitHub's, generated from the
merged pull requests.

Every decision lives in `src/topRow.ts`, `src/settings.ts`, `src/switches.ts`
and `src/windowButtons.ts`, which import neither Obsidian nor Electron and have
unit tests. `src/main.ts` only reads the pointer, the window and the DOM, and
applies the answer. `tests/styles.test.ts` holds the stylesheet's scopes — each
one a class Obsidian reuses elsewhere, got wrong once and measured — and fails
in the forbidden direction for every one of them.

## License

By [Steffen Seitz](https://smsag.de), under the [MIT License](LICENSE).
