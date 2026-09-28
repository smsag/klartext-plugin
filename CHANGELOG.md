# Changelog

All notable changes to the Klartext plugin. Releases also carry GitHub's
generated notes.

## [Unreleased]

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
