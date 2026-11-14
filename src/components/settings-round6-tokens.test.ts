import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The legacy surface/parchment/hairline/ink/moss tokens resolve to the old mint-green look.
// The Profile settings cards, the AI consent gate and sheet, the voice sheet and the segmented control
// must use the round-6 ds-* tokens, so they follow the round-6 look in both themes.
const LEGACY =
  /(?<![\w-])(?:[a-z]+:)?(?:bg|text|border)-(?:surface|parchment|hairline|ink|ink-soft|moss)(?![\w-])/;
const FILES = [
  "SoundEffectsSetting",
  "AiFeaturesSetting",
  "AiConsentGate",
  "AiConsentSheet",
  "VoicesSetting",
  "SegmentedControl",
];

describe("settings surfaces use round-6 tokens, not the mint theme", () => {
  for (const f of FILES) {
    it(f, () => {
      const src = fs.readFileSync(path.join(__dirname, `${f}.tsx`), "utf8");
      expect(src).not.toMatch(LEGACY);
      // Either the file names a round-6 surface itself, or it draws through the shared round-6 blocks.
      expect(src).toMatch(/bg-ds-(card|sunk|surface)|@\/components\/ds\/Blocks/);
    });
  }
});
