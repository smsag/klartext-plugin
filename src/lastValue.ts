// The last value computed from a key, kept for the length of a burst.
//
// Obsidian hands every section of a note to a post-processor with the whole
// note's text, one section after another: a note with forty sections asks for
// the same answer forty times. Keeping the last answer saves that, and letting
// it go once the burst is over keeps a closed note's text from staying in
// memory for as long as the plugin runs.

/** How long after the last ask the value is let go. Long enough to cover a
 *  note's sections being drawn one frame after another. */
export const RELEASE_MS = 2000;

export interface LastValue<K, V> {
  get(key: K): V;
  /** Let the value go now. */
  release(): void;
}

export function lastValue<K, V>(compute: (key: K) => V, releaseMs = RELEASE_MS): LastValue<K, V> {
  let held: { key: K; value: V } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = (): void => {
    held = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    get(key: K): V {
      if (held === null || held.key !== key) held = { key, value: compute(key) };
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(release, releaseMs);
      return held.value;
    },
    release,
  };
}
