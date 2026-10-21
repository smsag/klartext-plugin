// Which language a piece of a note is written in, for hyphenation.
//
// A browser hyphenates only text that says its language (`lang`), with that
// language's dictionary. Obsidian says none, and the note does not either, so
// it is read from the words: the short function words every sentence is made
// of (der, und, the, and…) are few, frequent and nearly unique to their
// language. Counting them is enough to tell German from English, and holds up
// for the other languages here. A text too short or too mixed to tell gets no
// answer rather than a guess: a wrong dictionary breaks words in the wrong
// places, which reads worse than no breaks at all.

/** The languages told apart, each with the function words that give it away. */
const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
  de: "der die das und ist nicht ein eine einen einem dem den des mit auf für sich auch als wird werden sind wie bei oder aber noch nur zum zur vom über dass ich wir es nach wenn kann soll hat haben wurde sein durch".split(" "),
  en: "the and is are of to that it with for as on was be this by not or have has from at which but they you we will can would an been were".split(" "),
  fr: "le la les et est des une un du que qui dans pour pas sur au aux avec ce sont il elle nous vous mais ou plus par cette être".split(" "),
  es: "el los las y es que en un una por con para no se del al lo como pero más su sus está son".split(" "),
  it: "il di che è e un una per non con del della sono si da nel alla gli ma come anche questo".split(" "),
  nl: "het een en is van dat niet op te met voor zijn er maar ook als bij aan wordt dit worden".split(" "),
};

const LANGUAGES = Object.keys(STOPWORDS);
const INDEX = new Map<string, string[]>();
for (const lang of LANGUAGES) {
  for (const word of STOPWORDS[lang]!) {
    const langs = INDEX.get(word) ?? [];
    if (!langs.includes(lang)) langs.push(lang);
    INDEX.set(word, langs);
  }
}

/** How many function words a text must hold before its language counts as known. */
export const MIN_HITS = 3;

/**
 * The text a reader sees, near enough: no frontmatter, code, URLs, link
 * targets or HTML. Code and URLs are full of English words that say nothing
 * about the note's language.
 */
export function proseOf(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---(\n|$)/, "")
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\]\([^)\s]*\)/g, "]")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/**
 * The language a text is written in, as a `lang` value, or null when it
 * cannot be told: too few function words, or two languages too close.
 */
export function detectLanguage(text: string): string | null {
  const score = new Map<string, number>();
  for (const m of text.toLowerCase().matchAll(/\p{L}+/gu)) {
    const word = m[0];
    const langs = INDEX.get(word);
    // A word several languages share counts for each, split: "de" says
    // little, "und" says German.
    if (langs) for (const lang of langs) score.set(lang, (score.get(lang) ?? 0) + 1 / langs.length);
    else if (/[äöüß]/.test(word)) score.set("de", (score.get("de") ?? 0) + 0.5);
  }
  let best: string | null = null;
  let first = 0;
  let second = 0;
  for (const [lang, n] of score) {
    if (n > first) {
      second = first;
      first = n;
      best = lang;
    } else if (n > second) {
      second = n;
    }
  }
  if (best === null || first < MIN_HITS || first < second * 2) return null;
  return best;
}

/** The note's language from its Markdown: read from the first stretch, which
 *  is plenty, so a long note costs no more than a short one. */
export function noteLanguage(markdown: string, limit = 20000): string | null {
  return detectLanguage(proseOf(markdown.slice(0, limit)));
}

/**
 * The language a block is written in when it differs from the note's: an
 * English quote in a German note. A block too short to tell, or in the
 * note's own language, gets null and keeps the note's.
 */
export function blockLanguage(text: string, note: string | null): string | null {
  const lang = detectLanguage(text);
  return lang !== null && lang !== note ? lang : null;
}

/** The language to assume when the note does not say enough: the app's, as an ISO code. */
export function fallbackLanguage(app: string | null | undefined, browser: string | null | undefined): string {
  const pick = (code: string | null | undefined) => (code ?? "").toLowerCase().split(/[-_]/)[0] ?? "";
  const a = pick(app);
  if (a) return a;
  const b = pick(browser);
  return b || "en";
}
