// Where the macOS window buttons go, computed the way Obsidian computes it.
//
// Obsidian places the buttons itself on window events, from its own CSS
// variables --traffic-lights-offset-x and --traffic-lights-offset-y (40px by
// default, 32px in a pop-out modal): for each axis floor(offset × zoom / 2 − 8),
// clamped to 0 below −5, and 2px more on x. This is a copy of that formula,
// not a variation on it: the plugin sets the variable, applies the result at
// once, and Obsidian's next placement lands on the same point instead of
// fighting it. Read from Obsidian 1.13.7's own code; if Obsidian changes the
// formula, the test that pins its default ({14, 12} at 40px) is where it shows.

export interface ButtonPosition {
  x: number;
  y: number;
}

/** Obsidian's default for both variables. */
export const DEFAULT_OFFSET = 40;

function axis(offset: number, zoom: number): number {
  const t = Math.floor((offset * zoom) / 2 - 8);
  return t < -5 ? 0 : t;
}

export function windowButtonPosition(offsetX: number, offsetY: number, zoom: number): ButtonPosition {
  // Unreadable falls back to the default on both axes; zero only on y, which is
  // all Obsidian's own code does (`0 === o && (o = 40)`).
  const x = Number.isFinite(offsetX) ? offsetX : DEFAULT_OFFSET;
  const y = Number.isFinite(offsetY) && offsetY !== 0 ? offsetY : DEFAULT_OFFSET;
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return { x: axis(x, z) + 2, y: axis(y, z) };
}
