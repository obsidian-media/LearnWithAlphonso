import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("vocab image call sites", () => {
  it.each(["src/routes/_authenticated/lesson.$id.tsx", "src/routes/_authenticated/review.tsx"])(
    "%s renders vocab images only through <VocabImage>",
    (rel) => {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).not.toMatch(/<img\s[^>]*?src=\{\s*(?:v\.image|VOCAB_IMAGES)/s);
      expect(src).toMatch(/<VocabImage\b/);
    },
  );

  it.each(["src/routes/_authenticated/lesson.$id.tsx", "src/routes/_authenticated/review.tsx"])(
    "%s gives question images an empty alt, so the alt cannot reveal the answer",
    (rel) => {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).not.toMatch(/alt=\{VOCAB_IMAGES\[/);
      expect(src).toMatch(/VOCAB_IMAGES\[q\.imageKey\]\.url\}\s*alt=""/);
    },
  );
});
