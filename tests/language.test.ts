import { describe, expect, it } from "vitest";
import { blockLanguage, detectLanguage, fallbackLanguage, noteLanguage, proseOf } from "../src/language";

const GERMAN =
  "Die selbstständige Tätigkeit (Gewerbe) soll eigene Software verkaufen. Die Obsidian-Plugins dienen dabei als " +
  "Prototypen, Marktforschung und Marketing, sodass Plugins und Apps einen gemeinsamen Betrieb bilden. Voraussetzung " +
  "ist die Gewinnerzielungsabsicht, die das Finanzamt nachvollziehen kann.";
const ENGLISH = "The plugin reads the language from the words of the note, and it does not guess when the text is too short.";

describe("detectLanguage", () => {
  it("tells German from English by their function words", () => {
    expect(detectLanguage(GERMAN)).toBe("de");
    expect(detectLanguage(ENGLISH)).toBe("en");
  });

  it("knows the other languages it lists", () => {
    expect(detectLanguage("Le chat est sur la table et il ne veut pas descendre avec nous.")).toBe("fr");
    expect(detectLanguage("El perro está en la casa y no quiere salir con los niños porque llueve.")).toBe("es");
    expect(detectLanguage("Il gatto è sul tavolo e non vuole scendere con gli altri, come sempre.")).toBe("it");
    expect(detectLanguage("De kat is op de tafel en wil niet naar beneden, maar het is ook laat.")).toBe("nl");
  });

  it("says nothing for a text too short to tell: a wrong dictionary breaks words in the wrong places", () => {
    expect(detectLanguage("Jahresausgaben für Apple Dev Lizenz")).toBeNull();
    expect(detectLanguage("Gewinnerzielungsabsicht")).toBeNull();
    expect(detectLanguage("")).toBeNull();
  });

  it("says nothing for a text half in one language and half in another", () => {
    expect(detectLanguage("der die das und the and of to")).toBeNull();
  });
});

describe("proseOf", () => {
  it("leaves out what is not prose: frontmatter, code, URLs, link targets", () => {
    const md = "---\ntitle: the and of\n---\nText\n```js\nthe and of to\n```\n`the code` [Link](https://the.and/of) [[target|Name]] <b>x</b>";
    const prose = proseOf(md);
    expect(prose).toContain("Text");
    expect(prose).toContain("Link");
    expect(prose).toContain("Name");
    expect(prose).not.toMatch(/the|https|target|<b>/);
  });
});

describe("noteLanguage and blockLanguage", () => {
  it("reads a German note as German despite an English code block", () => {
    expect(noteLanguage(`${GERMAN}\n\n\`\`\`\n${ENGLISH}\n${ENGLISH}\n\`\`\`\n`)).toBe("de");
  });

  it("gives a block its own language only when it differs from the note's", () => {
    expect(blockLanguage(ENGLISH, "de")).toBe("en");
    expect(blockLanguage(GERMAN, "de")).toBeNull();
    expect(blockLanguage("Konto und EÜR-Software einrichten", "de")).toBeNull();
  });
});

describe("fallbackLanguage", () => {
  it("takes the app's language, then the browser's, then English, as a bare ISO code", () => {
    expect(fallbackLanguage("de", "en-US")).toBe("de");
    expect(fallbackLanguage("pt-BR", "en-US")).toBe("pt");
    expect(fallbackLanguage(null, "de-DE")).toBe("de");
    expect(fallbackLanguage("", "")).toBe("en");
  });
});
