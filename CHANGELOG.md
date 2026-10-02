# Changelog

All notable changes to the Klartext plugin. Releases also carry GitHub's
generated notes.

## [Unreleased]

## [0.5.0] — 2026-10-02

### Added

- **A base's toolbar steps aside while you scroll on the phone** (Hide a base's
  toolbar while scrolling on the phone). The row with views, sort, filter,
  search and + slides away as the base is scrolled down, and the rows take its
  52px; it comes back as soon as you scroll up or reach the top. It waits
  until the base has scrolled past the toolbar and ignores a finger that
  wobbles, and it does not flicker at the foot of a base, where taking the
  room back moves the scroll position. A base embedded in a note is left
  alone. No slide with the system's reduced motion on.

### Changed

- **The phone header is two settings: the title, and the buttons.** *Hide the
  title on the phone* hides the folder and file name, in a note, a base, a
  canvas or a PDF; *Hide the header buttons on the phone* hides the sidebar,
  reading-view and ⋯ buttons in a note or a base. One alone leaves the bar and
  the page where they are. Both together hide the whole bar, as the old
  *Hide the note header on the phone* did, and now in a base too, which moves
  up into its place. The old setting carries over as both.

### Fixed

- **Without Obsidian's floating navigation, a phone note with its header
  hidden no longer starts under the clock.** The header's top padding is the
  safe area, and hiding the header took it along: the first line sat 8px from
  the top of the screen. The bar is now emptied instead of removed, so the
  page starts below the safe area, as it does with the header shown.

## [0.4.3] — 2026-09-30

### Fixed

- **A window in front of a focused pop-out gets its row back.** The plugin
  takes the focused window to be the one in front, and lets it claim the
  pointer wherever its rectangle covers. macOS keeps a window in front without
  the focus, and a screen-filling pop-out (New doc) behind the main window then
  covered the main window's whole top band: hovering brought nothing back, and
  with the tab bar hidden nothing else closed the tab. The windows' own mouse
  events now decide: the window that saw the pointer more recently is the one
  it is over. Verified in the harness with a focused, screen-filling pop-out
  behind the main window.

## [0.4.2] — 2026-09-30

### Fixed

- **No stutter while a pop-out window is resized.** The window being resized
  already held its asks of Electron (0.4.0), but the other windows kept
  asking, the main window among them: every window shares one page thread
  and one main process, and the main process is the one busy with the resize,
  so each ask stalled the pop-out's frame too. Measured: 8 asks during a 1.4 s
  pop-out resize. While any window resizes, no window is asked about.

## [0.4.1] — 2026-09-29

### Added

- **Hide the note header on the phone.** A switch for the bar at the top of a
  note on a phone: the sidebar button, the path, the reading-view button and the
  ⋯ menu. The note moves up into its place, through Obsidian's own spacing and
  fade tokens, so it works with floating navigation and Auto full screen alike.
  Other views keep their header. Reading view is one command away ("Toggle
  reading view"), the sidebar one swipe. Shown in the settings tab on a phone
  only, so it is switched on there.

## [0.4.0] — 2026-09-28

### Fixed

- **No stutter while a window is resized.** The top row used to ask Electron
  where the pointer was during a resize, a synchronous round trip to a main
  process busy resizing the window, and measured its own height on every resize
  event, forcing a layout each time. It now asks nothing until the window has
  held still for 250ms and measures once afterwards. Measured on Linux over a
  resize burst: a third less script time, and no asks at all.
- **With "Show the top row only on hover" off, the plugin is idle.** Its loop
  ran twenty times a second regardless; it now runs only while the row fades,
  and the window buttons are given back the moment the setting goes off.
- **A failure no longer floods the console.** A poll that failed logged the same
  line twenty times a second; each distinct failure is logged once and counted.
- **A build without Electron in reach still loads the switches**, instead of
  stopping in `onload`; and the "top row stays as it is" notice appears only to
  someone who has the fading switched on.
- **Pop-out windows read their own computed style** for the row's height and the
  window-button position.

### Added

- **Klartext: Copy diagnostics**, a command that puts a JSON report of the
  plugin's state and counters on the clipboard for a bug report.
- **The settings tab shows only what can act here**: the macOS-only switches
  on a Mac, the desktop-only ones on a desktop.

### Changed

- Open menus are found as children of the body, not by searching the whole
  document twenty times a second.
- The tests are typechecked with the sources, and CI runs `npm run check` on
  every push and pull request.
