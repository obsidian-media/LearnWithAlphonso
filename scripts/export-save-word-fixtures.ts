import fs from "node:fs";
import path from "node:path";
import { SAVE_WORD_SPANS_FIXTURE_JSON } from "../src/lib/save-word-spans-fixture";

// Writes the shared save-word spans fixture and its iOS copy. Run after changing course-language-spans.ts
// or the French/Spanish curriculum; src/lib/save-word-spans-fixture.test.ts fails when either is stale.
const root = path.resolve(import.meta.dirname, "..");
const json = SAVE_WORD_SPANS_FIXTURE_JSON();
for (const target of [
  "src/lib/save-word-spans.fixtures.json",
  "ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/save-word-spans.fixtures.json",
]) {
  fs.writeFileSync(path.join(root, target), json);
  console.log(`wrote ${target}`);
}
