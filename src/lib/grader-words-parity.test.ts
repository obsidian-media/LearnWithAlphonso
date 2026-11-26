import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRealWord } from "./grader-words";

// The real-word lists live twice (the Edge Functions cannot import from src/); the files must stay byte-identical.
describe("grader word lists", () => {
  it.each(["en", "fr", "es"])(
    "the %s list is the same in the web app and the Edge Functions",
    (lang) => {
      const norm = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
      expect(norm(`supabase/functions/_shared/grader-words/${lang}.ts`)).toBe(
        norm(`src/data/grader-words/${lang}.ts`),
      );
    },
  );

  it("the Deno loader is the web loader with its own import paths", () => {
    const norm = (p: string) =>
      readFileSync(p, "utf8")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((l) => !l.startsWith("import ") && !l.startsWith("//"))
        .join("\n");
    expect(norm("supabase/functions/_shared/grader-words.ts")).toBe(
      norm("src/lib/grader-words.ts"),
    );
  });

  it("holds real words and not the common misspellings", () => {
    expect(isRealWord("world", "en")).toBe(true);
    expect(isRealWord("World", "en")).toBe(true);
    expect(isRealWord("monde", "fr")).toBe(true);
    expect(isRealWord("cabos", "es")).toBe(true);
    for (const typo of ["recieve", "definately", "seperate", "wich", "gratitute"]) {
      expect(isRealWord(typo, "en"), typo).toBe(false);
    }
    // Spanish subtitles carry English dialogue; the list drops what is clearly English.
    expect(isRealWord("world", "es")).toBe(false);
  });
});
