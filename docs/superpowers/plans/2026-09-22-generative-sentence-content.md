# Generative Sentence-Template Content (English Pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working `generate` command for `scripts/pack-tool.ts` that produces real, grammar-correct-by-construction English sentence packs from hand-authored templates and an LLM-proposed, compiler-validated vocabulary dataset — feeding the existing human-gated `validate`/`preview`/`apply --confirm` pipeline unchanged.

**Architecture:** LLM proposes vocabulary candidates for a topic; a real morphological library (`compromise`) — queried via a verified, bug-avoiding derivation strategy, not compromise's own (buggy) subject-agreement detection — compiles the actual grammar. Templates (grammar skeletons) are hand-authored, never LLM-proposed. Full design: `docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md`.

**Tech Stack:** TypeScript, Bun, Vitest, `compromise` (npm, MIT license, verified 2026-09-22), Zod, NVIDIA NIM (existing integration).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/generative/templates.ts` (new) | Hand-authored grammar skeletons (`Template`, `Slot` types, `PRONOUNS` closed-class constant, `TEMPLATES` array — 2 entries). |
| `src/data/generative/vocab.ts` (new) | The curated vocab dataset itself (`VocabEntry` type + `GENERATIVE_VOCAB` array, starts empty). Grows only via the CLI, never hand-edited with unvalidated entries. |
| `src/data/generative/compile.ts` (new) | Conjugation (`baseForm`/`thirdPersonForm`/`pastForm`, using the verified fixed-context derivation) + `compileLine` (one `Template` + slot assignment → one `"sentence|answer"` line). |
| `src/data/generative/expand.ts` (new) | Combinatorial template × vocab expansion + seeded sampling (reuses `bank-engine.ts`'s `hash()`). |
| `src/lib/generative-vocab-authoring.ts` (new) | Pure functions: `mergeVocabEntries` (union-by-word+pos), `formatVocabEntryAsTs`, `replaceVocabArrayInSource` (marker-splice into `vocab.ts`, mirrors `pack-authoring.ts`'s `insertPackIntoBank`). |
| `src/lib/generative-vocab.server.ts` (new) | LLM vocab-candidate proposal (mirrors `weakness-detection.server.ts`'s prompt/parse pattern) + POS cross-check against `compromise`'s own tagging + `proposeVocabForTopic` orchestration. |
| `scripts/pack-tool.ts` (modify) | New `generate` subcommand wiring everything together; help text updated. |
| `src/data/generative/generate-integration.test.ts` (new) | Full pipeline test (mocked LLM, real `compromise`) reusing `curriculum-consistency.test.ts`'s invariants as the acceptance gate. |

Each `src/data/generative/*` file owns one concern (grammar skeletons / vocab data / conjugation+compilation / combinatorics), matching this codebase's existing split between `bank-engine.ts` (generic engine) and `lesson-bank*.ts` (data). `src/lib/generative-vocab*.ts` mirrors the existing `pack-authoring.ts` (pure/testable) vs. `pack-draft-generation.server.ts` (I/O, LLM calls) split.

---

### Task 1: Verified conjugation helpers

**Files:**
- Modify: `package.json`, `bun.lock` (via `bun add`)
- Create: `src/data/generative/compile.ts`
- Test: `src/data/generative/compile.test.ts`

- [ ] **Step 1: Add the `compromise` dependency**

Run: `bun add compromise`
Expected: `installed compromise@14.17.0` (or later — pin isn't required, but confirm the version actually installed, since a future major version could change conjugation behavior and would need re-verifying against Step 3's test table).

- [ ] **Step 2: Write the failing test**

Create `src/data/generative/compile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baseForm, thirdPersonForm, pastForm } from "./compile";

/**
 * Pinned to real output from a hands-on spike (2026-09-22), not assumed
 * from documentation -- see the design doc's component 4 self-critique
 * for why. If `compromise` is ever upgraded and one of these starts
 * failing, that's a real finding to investigate, not a test to loosen.
 */
describe("baseForm/thirdPersonForm/pastForm", () => {
  const cases: [verb: string, base: string, third: string, past: string][] = [
    ["have", "have", "has", "had"],
    ["go", "go", "goes", "went"],
    ["do", "do", "does", "did"],
    ["walk", "walk", "walks", "walked"],
    ["run", "run", "runs", "ran"],
    ["eat", "eat", "eats", "ate"],
    ["play", "play", "plays", "played"],
  ];

  it.each(cases)("%s -> base=%s third=%s past=%s", (verb, base, third, past) => {
    expect(baseForm(verb)).toBe(base);
    expect(thirdPersonForm(verb)).toBe(third);
    expect(pastForm(verb)).toBe(past);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run vitest run src/data/generative/compile.test.ts`
Expected: FAIL — `Cannot find module './compile'` (the file doesn't exist yet).

- [ ] **Step 4: Write the minimal implementation**

Create `src/data/generative/compile.ts`:

```ts
import nlp from "compromise";

/**
 * Generative sentence-content pilot (English only) --
 * docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md.
 *
 * VERIFIED 2026-09-22 via a hands-on spike, not assumed from docs:
 * querying `compromise` with a sentence's *actual* subject and trusting
 * its own agreement detection is unreliable -- it mis-conjugates "you"
 * as 3rd-person-singular ("you goes", "you is", "you has"), and a bare
 * isolated word fails to reach past tense with no context at all ("go"
 * alone stays "go", not "went"). The fix: never feed compromise the
 * real subject; always derive both needed forms from fixed,
 * known-correct contexts, and let the caller (compileLine, added in a
 * later task) pick the right one based on the actual subject -- not
 * compromise's own (buggy) subject detection.
 *
 * Verified against have/go/do/walk/run/eat/play with zero manual
 * overrides needed (see compile.test.ts). "be" is the one exception --
 * deliberately excluded from the pilot's vocab dataset rather than
 * special-cased, since it needs a full person-varying present paradigm
 * (am/are/is) this derivation doesn't produce.
 */
export function baseForm(verb: string): string {
  const doc = nlp(`I ${verb}`);
  doc.verbs().toPresentTense();
  return doc.text().replace(/^I /, "");
}

export function thirdPersonForm(verb: string): string {
  const doc = nlp(`he ${verb}`);
  doc.verbs().toPresentTense();
  return doc.text().replace(/^he /, "");
}

export function pastForm(verb: string): string {
  const doc = nlp(`I ${verb}`);
  doc.verbs().toPastTense();
  return doc.text().replace(/^I /, "");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run vitest run src/data/generative/compile.test.ts`
Expected: PASS (7 cases × 3 assertions each).

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/data/generative/compile.ts src/data/generative/compile.test.ts
git commit -m "feat(generative): verified conjugation helpers (compromise)"
```

---

### Task 2: Template library

**Files:**
- Create: `src/data/generative/templates.ts`
- Test: `src/data/generative/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/generative/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PRONOUNS, TEMPLATES } from "./templates";

describe("PRONOUNS", () => {
  it("has exactly the 7 English subject pronouns", () => {
    expect(PRONOUNS.map((p) => p.word)).toEqual(["I", "you", "he", "she", "it", "we", "they"]);
  });

  it("flags only he/she/it as 3rd-person-singular", () => {
    const thirdPerson = PRONOUNS.filter((p) => p.thirdPersonSingular).map((p) => p.word);
    expect(thirdPerson).toEqual(["he", "she", "it"]);
  });
});

describe("TEMPLATES", () => {
  it("has 2 pilot templates with unique ids", () => {
    expect(TEMPLATES).toHaveLength(2);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("svo-present has a verb slot that agrees with the subject slot", () => {
    const t = TEMPLATES.find((t) => t.id === "svo-present")!;
    const verbSlot = t.slots.find((s) => s.pos === "verb")!;
    expect(verbSlot.agreeWith).toBe("subject");
    expect(t.slots.some((s) => s.name === verbSlot.agreeWith)).toBe(true);
  });

  it("svo-past has a verb slot with no agreement (past tense doesn't vary by person)", () => {
    const t = TEMPLATES.find((t) => t.id === "svo-past")!;
    const verbSlot = t.slots.find((s) => s.pos === "verb")!;
    expect(verbSlot.agreeWith).toBeUndefined();
  });

  it("every template's render string has one %N placeholder per slot", () => {
    for (const t of TEMPLATES) {
      for (let i = 0; i < t.slots.length; i++) {
        expect(t.render).toContain(`%${i + 1}`);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/data/generative/templates.test.ts`
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/data/generative/templates.ts`:

```ts
import type { Level } from "../levels";

/** One filled-in-order piece of a Template's sentence. */
export type Slot = {
  name: string;
  pos: "pronoun" | "noun" | "verb" | "adjective";
  /**
   * For verb slots: which other slot's word this one must agree with
   * (English: 3rd-person-singular -s). Undefined for non-verb slots.
   *
   * NOTE: the pilot's compiler (compile.ts, added in a later task) only
   * implements the one concrete rule svo-present actually needs --
   * subject-pronoun -> 3rd-person-singular-or-not. This field is typed
   * generically because the concept generalizes, but a *general*
   * agreement-resolution engine (arbitrary slot-to-slot rules) is
   * explicitly NOT built in this pilot -- a future template with a
   * different agreement shape needs the compiler's own resolution logic
   * extended, not just a new Template entry.
   */
  agreeWith?: string;
};

export type Template = {
  id: string;
  level: Level;
  tense: "present" | "past";
  /** Slots in left-to-right sentence order. */
  slots: Slot[];
  /** `%1`, `%2`, ... index into `slots`, one placeholder per slot. */
  render: string;
};

export type PronounEntry = {
  word: string;
  /** true only for he/she/it -- the sole English pronouns that trigger
   *  3rd-person-singular verb agreement in the present tense. */
  thirdPersonSingular: boolean;
};

/**
 * A fixed, closed 7-word class -- NOT LLM-proposed vocabulary. Consulted
 * directly by the compiler; never grows, never goes through the
 * LLM-propose-then-validate pipeline `vocab.ts` uses for open word
 * classes (noun/verb/adjective).
 */
export const PRONOUNS: PronounEntry[] = [
  { word: "I", thirdPersonSingular: false },
  { word: "you", thirdPersonSingular: false },
  { word: "he", thirdPersonSingular: true },
  { word: "she", thirdPersonSingular: true },
  { word: "it", thirdPersonSingular: true },
  { word: "we", thirdPersonSingular: false },
  { word: "they", thirdPersonSingular: false },
];

/** Pilot ships exactly 2 templates -- proving the architecture, not
 *  building a grammar library. See the design doc's "Explicitly out of
 *  scope" section. */
export const TEMPLATES: Template[] = [
  {
    id: "svo-present",
    level: "A1",
    tense: "present",
    slots: [
      { name: "subject", pos: "pronoun" },
      { name: "verb", pos: "verb", agreeWith: "subject" },
      { name: "object", pos: "noun" },
    ],
    render: "%1 %2 %3.",
  },
  {
    id: "svo-past",
    level: "A1",
    tense: "past",
    slots: [
      { name: "subject", pos: "pronoun" },
      { name: "verb", pos: "verb" },
      { name: "object", pos: "noun" },
    ],
    render: "%1 %2 %3.",
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/data/generative/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/generative/templates.ts src/data/generative/templates.test.ts
git commit -m "feat(generative): hand-authored template library"
```

---

### Task 3: Vocab dataset

**Files:**
- Create: `src/data/generative/vocab.ts`
- Test: `src/data/generative/vocab.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/generative/vocab.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GENERATIVE_VOCAB, type VocabEntry } from "./vocab";

describe("GENERATIVE_VOCAB", () => {
  it("starts empty -- grows only through the generate CLI, never hand-seeded", () => {
    expect(GENERATIVE_VOCAB).toEqual([]);
  });

  it("VocabEntry excludes pronoun from its pos union (pronouns are a fixed class, not open vocabulary)", () => {
    const entry: VocabEntry = { word: "coffee", pos: "noun", level: "A1", topics: ["test"] };
    expect(entry.pos).not.toBe("pronoun");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/data/generative/vocab.test.ts`
Expected: FAIL — `Cannot find module './vocab'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/data/generative/vocab.ts`:

```ts
import type { Level } from "../levels";

export type VocabEntry = {
  word: string;
  pos: "noun" | "verb" | "adjective";
  level: Level;
  /** Safety valve for a future word compile.ts's derivation gets wrong.
   *  Verified 2026-09-22: the pilot's actual starter vocab (have, go,
   *  do, walk, run, eat, play) needs zero entries here -- see
   *  compile.test.ts. */
  irregularForms?: Partial<Record<"presentThirdPerson" | "past", string>>;
  /** Topic tag(s) this word was proposed under. Unioned (not
   *  duplicated) across repeated proposals of the same (word, pos) --
   *  see generative-vocab-authoring.ts's mergeVocabEntries. */
  topics: string[];
};

/**
 * Curated vocab dataset for the generative sentence-content pilot
 * (docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md).
 * Grows ONLY through the `generate` CLI command (scripts/pack-tool.ts)
 * -- an LLM-proposed candidate is only ever added here after passing a
 * real part-of-speech cross-check against `compromise`'s own tagging
 * (src/lib/generative-vocab.server.ts's verifyCandidatePos). Never
 * hand-edit this array directly with an unvalidated entry.
 *
 * "be" is deliberately excluded -- English's only verb with a full
 * person-varying present-tense paradigm (am/are/is), which this
 * pilot's compiler (compile.ts) doesn't attempt to derive. See the
 * design doc's component 4 for the verified spike data behind this.
 */
export const GENERATIVE_VOCAB: VocabEntry[] = [];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/data/generative/vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/generative/vocab.ts src/data/generative/vocab.test.ts
git commit -m "feat(generative): curated vocab dataset (starts empty)"
```

---

### Task 4: Vocab merge + file-write helpers

**Files:**
- Create: `src/lib/generative-vocab-authoring.ts`
- Test: `src/lib/generative-vocab-authoring.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/generative-vocab-authoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mergeVocabEntries,
  formatVocabEntryAsTs,
  replaceVocabArrayInSource,
} from "./generative-vocab-authoring";
import type { VocabEntry } from "../data/generative/vocab";

describe("mergeVocabEntries", () => {
  it("appends a genuinely new (word, pos) entry", () => {
    const existing: VocabEntry[] = [
      { word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const merged = mergeVocabEntries(existing, [
      { word: "walk", pos: "verb", level: "A1", topics: ["daily"] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.word === "walk")?.topics).toEqual(["daily"]);
  });

  it("unions topics into an existing entry instead of duplicating it", () => {
    const existing: VocabEntry[] = [
      { word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const merged = mergeVocabEntries(existing, [
      { word: "coffee", pos: "noun", level: "A1", topics: ["daily", "cafe"] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.topics).toEqual(["cafe", "daily"]);
  });

  it("treats word matching as case-insensitive but keys on (word, pos)", () => {
    const existing: VocabEntry[] = [
      { word: "Coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const merged = mergeVocabEntries(existing, [
      { word: "coffee", pos: "verb", level: "A1", topics: ["odd"] },
    ]);
    // same word text, different pos -> a distinct entry, not merged
    expect(merged).toHaveLength(2);
  });

  it("does not mutate the input arrays", () => {
    const existing: VocabEntry[] = [
      { word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const existingCopy = JSON.parse(JSON.stringify(existing));
    mergeVocabEntries(existing, [
      { word: "coffee", pos: "noun", level: "A1", topics: ["daily"] },
    ]);
    expect(existing).toEqual(existingCopy);
  });
});

describe("formatVocabEntryAsTs", () => {
  it("renders a plain entry as a TS object literal", () => {
    const rendered = formatVocabEntryAsTs({
      word: "coffee",
      pos: "noun",
      level: "A1",
      topics: ["cafe", "daily"],
    });
    expect(rendered).toContain('word: "coffee"');
    expect(rendered).toContain('pos: "noun"');
    expect(rendered).toContain('level: "A1"');
    expect(rendered).toContain('topics: ["cafe", "daily"]');
    expect(rendered).not.toContain("irregularForms");
  });

  it("includes irregularForms only when present", () => {
    const rendered = formatVocabEntryAsTs({
      word: "go",
      pos: "verb",
      level: "A1",
      topics: ["daily"],
      irregularForms: { presentThirdPerson: "goes", past: "went" },
    });
    expect(rendered).toContain("irregularForms: { presentThirdPerson: \"goes\", past: \"went\" }");
  });
});

describe("replaceVocabArrayInSource", () => {
  const fakeSource = `import type { Level } from "../levels";

export type VocabEntry = { word: string };

export const GENERATIVE_VOCAB: VocabEntry[] = [
];
`;

  it("splices entries into the GENERATIVE_VOCAB array without touching the rest of the file", () => {
    const entries: VocabEntry[] = [{ word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] }];
    const updated = replaceVocabArrayInSource(fakeSource, entries);
    expect(updated).toContain('export type VocabEntry = { word: string };');
    expect(updated).toContain('word: "coffee"');
  });

  it("produces valid-looking output with an empty entries array (no dangling comma/brace)", () => {
    const updated = replaceVocabArrayInSource(fakeSource, []);
    expect(updated).toContain("export const GENERATIVE_VOCAB: VocabEntry[] = [\n];");
  });

  it("throws a clear error if the marker isn't found", () => {
    expect(() => replaceVocabArrayInSource("no marker here", [])).toThrow(/could not find/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/generative-vocab-authoring.test.ts`
Expected: FAIL — `Cannot find module './generative-vocab-authoring'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/generative-vocab-authoring.ts`:

```ts
import type { VocabEntry } from "../data/generative/vocab";

/**
 * Unions a batch of newly-accepted vocab candidates into an existing
 * array. Entries are keyed by (word, pos) -- word compared
 * case-insensitively, since "Coffee" and "coffee" are the same
 * vocabulary item. A candidate matching an existing entry has its
 * `topics` merged (deduplicated, existing topics first) into that
 * entry rather than creating a duplicate row; a genuinely new
 * (word, pos) pair is appended. Never mutates its inputs.
 */
export function mergeVocabEntries(existing: VocabEntry[], candidates: VocabEntry[]): VocabEntry[] {
  const result = existing.map((e) => ({ ...e, topics: [...e.topics] }));
  for (const candidate of candidates) {
    const match = result.find(
      (e) => e.word.toLowerCase() === candidate.word.toLowerCase() && e.pos === candidate.pos,
    );
    if (match) {
      for (const topic of candidate.topics) {
        if (!match.topics.includes(topic)) match.topics.push(topic);
      }
      continue;
    }
    result.push({ ...candidate, topics: [...candidate.topics] });
  }
  return result;
}

function tsString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Formats one VocabEntry as the TS object-literal source used inside
 *  vocab.ts's GENERATIVE_VOCAB array (2-space indent, trailing comma) --
 *  same convention as pack-authoring.ts's formatPackAsTs. */
export function formatVocabEntryAsTs(entry: VocabEntry): string {
  const lines = [
    "  {",
    `    word: ${tsString(entry.word)},`,
    `    pos: ${tsString(entry.pos)},`,
    `    level: ${tsString(entry.level)},`,
  ];
  if (entry.irregularForms) {
    const parts: string[] = [];
    if (entry.irregularForms.presentThirdPerson) {
      parts.push(`presentThirdPerson: ${tsString(entry.irregularForms.presentThirdPerson)}`);
    }
    if (entry.irregularForms.past) {
      parts.push(`past: ${tsString(entry.irregularForms.past)}`);
    }
    lines.push(`    irregularForms: { ${parts.join(", ")} },`);
  }
  lines.push(`    topics: [${entry.topics.map(tsString).join(", ")}],`);
  lines.push("  },");
  return lines.join("\n");
}

/**
 * Splices a freshly-serialized entries array into vocab.ts's source,
 * replacing everything between `export const GENERATIVE_VOCAB:
 * VocabEntry[] = [` and the following `\n];` -- mirrors
 * pack-authoring.ts's insertPackIntoBank marker-splice pattern, but
 * replaces the WHOLE array body each time (not just appends one entry)
 * since the caller already has the complete desired array in memory
 * from mergeVocabEntries. This is what lets a repeated proposal's
 * merged topics show up correctly without surgical per-entry editing.
 * Never touches the file's header/type/comment above the marker.
 */
export function replaceVocabArrayInSource(fileSource: string, entries: VocabEntry[]): string {
  const startMarker = "export const GENERATIVE_VOCAB: VocabEntry[] = [";
  const start = fileSource.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`could not find "${startMarker}" in the vocab file source.`);
  }
  const closeMarker = "\n];";
  const closeIdx = fileSource.indexOf(closeMarker, start);
  if (closeIdx === -1) {
    throw new Error(`found "${startMarker}" but no closing "];" after it.`);
  }
  const arrayStart = start + startMarker.length;
  const body = entries.length > 0 ? "\n" + entries.map(formatVocabEntryAsTs).join("\n") : "";
  return fileSource.slice(0, arrayStart) + body + fileSource.slice(closeIdx + 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/lib/generative-vocab-authoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generative-vocab-authoring.ts src/lib/generative-vocab-authoring.test.ts
git commit -m "feat(generative): vocab merge + file-write helpers"
```

---

### Task 5: Compiler — `compileLine`

**Files:**
- Modify: `src/data/generative/compile.ts`
- Modify: `src/data/generative/compile.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/data/generative/compile.test.ts`:

```ts
import { compileLine } from "./compile";
import { TEMPLATES } from "./templates";

describe("compileLine", () => {
  const svoPresent = TEMPLATES.find((t) => t.id === "svo-present")!;
  const svoPast = TEMPLATES.find((t) => t.id === "svo-past")!;

  it("conjugates to 3rd-person-singular when the subject is he/she/it", () => {
    expect(compileLine(svoPresent, { subject: "he", verb: "walk", object: "dog" })).toBe(
      "he ___ dog.|walks",
    );
    expect(compileLine(svoPresent, { subject: "she", verb: "run", object: "school" })).toBe(
      "she ___ school.|runs",
    );
  });

  it("conjugates to base form for I/you/we/they", () => {
    expect(compileLine(svoPresent, { subject: "I", verb: "walk", object: "dog" })).toBe(
      "I ___ dog.|walk",
    );
    expect(compileLine(svoPresent, { subject: "they", verb: "eat", object: "cake" })).toBe(
      "they ___ cake.|eat",
    );
    expect(compileLine(svoPresent, { subject: "you", verb: "go", object: "school" })).toBe(
      "you ___ school.|go",
    );
  });

  it("uses past tense unconditionally on a past-tense template, no agreement", () => {
    expect(compileLine(svoPast, { subject: "I", verb: "go", object: "school" })).toBe(
      "I ___ school.|went",
    );
    expect(compileLine(svoPast, { subject: "they", verb: "eat", object: "cake" })).toBe(
      "they ___ cake.|ate",
    );
  });

  it("throws if a required slot has no assignment", () => {
    expect(() => compileLine(svoPresent, { subject: "he", verb: "walk" })).toThrow(
      /missing assignment/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/data/generative/compile.test.ts`
Expected: FAIL — `compileLine is not a function` (or `is not exported`).

- [ ] **Step 3: Write the minimal implementation**

Append to `src/data/generative/compile.ts`:

```ts
import type { Template } from "./templates";
import { PRONOUNS } from "./templates";

/** Slot name -> the concrete word chosen for it (a pronoun's own word,
 *  or a VocabEntry's word). */
export type SlotAssignment = Record<string, string>;

/**
 * Compiles one Template + a concrete word-per-slot assignment into a
 * literal "sentence|answer" line -- the exact shape bank-engine.ts's
 * packQuestions() already parses from a Pack.data string. Only the verb
 * slot is blanked (the grammatically interesting part being tested);
 * other slots render as plain text. Note: noun slots render without an
 * article ("he ___ dog.", not "he ___ the dog.") -- the pilot doesn't
 * model determiners, matching its narrow goal of testing verb
 * conjugation, not full sentence naturalness (see the design doc's
 * "known limitation" note).
 */
export function compileLine(template: Template, assignment: SlotAssignment): string {
  const verbSlot = template.slots.find((s) => s.pos === "verb");
  if (!verbSlot) throw new Error(`template "${template.id}" has no verb slot to test`);

  const subjectSlot = verbSlot.agreeWith
    ? template.slots.find((s) => s.name === verbSlot.agreeWith)
    : undefined;
  const subjectWord = subjectSlot ? assignment[subjectSlot.name] : undefined;
  const pronoun = subjectWord
    ? PRONOUNS.find((p) => p.word.toLowerCase() === subjectWord.toLowerCase())
    : undefined;

  const rawVerb = assignment[verbSlot.name];
  if (rawVerb === undefined) throw new Error(`missing assignment for slot "${verbSlot.name}"`);

  const answer =
    template.tense === "past"
      ? pastForm(rawVerb)
      : pronoun?.thirdPersonSingular
        ? thirdPersonForm(rawVerb)
        : baseForm(rawVerb);

  let prompt = template.render;
  template.slots.forEach((slot, i) => {
    const placeholder = `%${i + 1}`;
    if (slot.name === verbSlot.name) {
      prompt = prompt.replace(placeholder, "___");
      return;
    }
    const value = assignment[slot.name];
    if (value === undefined) throw new Error(`missing assignment for slot "${slot.name}"`);
    prompt = prompt.replace(placeholder, value);
  });

  return `${prompt}|${answer}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/data/generative/compile.test.ts`
Expected: PASS (all cases from Task 1 and Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/data/generative/compile.ts src/data/generative/compile.test.ts
git commit -m "feat(generative): compileLine (template + slots -> one pack line)"
```

---

### Task 6: Template expansion + seeded sampling

**Files:**
- Create: `src/data/generative/expand.ts`
- Test: `src/data/generative/expand.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/generative/expand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expandTemplate } from "./expand";
import { TEMPLATES } from "./templates";
import type { VocabEntry } from "./vocab";

const vocab: VocabEntry[] = [
  { word: "walk", pos: "verb", level: "A1", topics: ["test"] },
  { word: "run", pos: "verb", level: "A1", topics: ["test"] },
  { word: "dog", pos: "noun", level: "A1", topics: ["test"] },
  { word: "school", pos: "noun", level: "A1", topics: ["test"] },
];

describe("expandTemplate", () => {
  const svoPresent = TEMPLATES.find((t) => t.id === "svo-present")!;

  it("returns an empty array when a required POS has no vocab at this level", () => {
    const result = expandTemplate({
      template: svoPresent,
      vocab: [],
      packId: "test1",
      targetCount: 10,
    });
    expect(result).toEqual([]);
  });

  it("produces every distinct combination when under the target count", () => {
    // 7 pronouns x 2 verbs x 2 nouns = 28 combinations
    const result = expandTemplate({
      template: svoPresent,
      vocab,
      packId: "test2",
      targetCount: 100,
    });
    expect(result.length).toBe(28);
    expect(new Set(result).size).toBe(28);
  });

  it("samples down to targetCount when combinatorial expansion overproduces", () => {
    const result = expandTemplate({
      template: svoPresent,
      vocab,
      packId: "test3",
      targetCount: 10,
    });
    expect(result.length).toBe(10);
  });

  it("is deterministic given the same packId", () => {
    const a = expandTemplate({ template: svoPresent, vocab, packId: "stable-id", targetCount: 10 });
    const b = expandTemplate({ template: svoPresent, vocab, packId: "stable-id", targetCount: 10 });
    expect(a).toEqual(b);
  });

  it("filters vocab by the template's own level, ignoring other-level entries", () => {
    const mixedLevelVocab: VocabEntry[] = [
      ...vocab,
      { word: "negotiate", pos: "verb", level: "C1", topics: ["test"] },
    ];
    const result = expandTemplate({
      template: svoPresent,
      vocab: mixedLevelVocab,
      packId: "test4",
      targetCount: 100,
    });
    expect(result.some((line) => line.includes("negotiate"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/data/generative/expand.test.ts`
Expected: FAIL — `Cannot find module './expand'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/data/generative/expand.ts`:

```ts
import { hash } from "../bank-engine";
import type { Template } from "./templates";
import { PRONOUNS } from "./templates";
import type { VocabEntry } from "./vocab";
import { compileLine, type SlotAssignment } from "./compile";

/**
 * Expands a Template against a vocab pool into every valid slot
 * combination, compiles each into a literal line, then samples down to
 * `targetCount` using bank-engine's seeded hash() -- reproducible given
 * the same packId, not truly random. Matches this codebase's existing
 * pack-generation convention (see bank-engine.ts's own use of hash()
 * for shuffling). Vocab is filtered to the template's own level per
 * slot's required part of speech; pronoun slots always draw from the
 * fixed PRONOUNS list, never the vocab dataset.
 */
export function expandTemplate(params: {
  template: Template;
  vocab: VocabEntry[];
  packId: string;
  targetCount: number;
}): string[] {
  const { template, vocab, packId, targetCount } = params;

  const slotWords: string[][] = template.slots.map((slot) => {
    if (slot.pos === "pronoun") return PRONOUNS.map((p) => p.word);
    return vocab
      .filter((v) => v.pos === slot.pos && v.level === template.level)
      .map((v) => v.word);
  });

  if (slotWords.some((words) => words.length === 0)) return [];

  const combinations: SlotAssignment[] = [];
  function build(i: number, current: SlotAssignment) {
    if (i === template.slots.length) {
      combinations.push({ ...current });
      return;
    }
    const slot = template.slots[i]!;
    for (const word of slotWords[i]!) {
      current[slot.name] = word;
      build(i + 1, current);
    }
  }
  build(0, {});

  const lines = combinations.map((assignment) => compileLine(template, assignment));

  if (lines.length <= targetCount) return lines;

  const indexed = lines.map((line, i) => ({ line, sortKey: hash(`${packId}-${i}`) }));
  indexed.sort((a, b) => a.sortKey - b.sortKey);
  return indexed.slice(0, targetCount).map((x) => x.line);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/data/generative/expand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/generative/expand.ts src/data/generative/expand.test.ts
git commit -m "feat(generative): template expansion + seeded sampling"
```

---

### Task 7: LLM vocab-candidate proposal

**Files:**
- Create: `src/lib/generative-vocab.server.ts`
- Test: `src/lib/generative-vocab.server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/generative-vocab.server.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseVocabCandidates,
  proposeVocabCandidates,
  vocabProposalPrompt,
} from "./generative-vocab.server";

const CANDIDATES = [
  { word: "coffee", pos: "noun" },
  { word: "walk", pos: "verb" },
  { word: "happy", pos: "adjective" },
];

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(CANDIDATES) } }] }),
      { status: 200 },
    ),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parseVocabCandidates", () => {
  it("parses a well-formed JSON array", () => {
    expect(parseVocabCandidates(JSON.stringify(CANDIDATES))).toEqual(CANDIDATES);
  });

  it("strips markdown code fences before parsing", () => {
    expect(parseVocabCandidates("```json\n" + JSON.stringify(CANDIDATES) + "\n```")).toEqual(
      CANDIDATES,
    );
  });

  it("returns [] for invalid JSON", () => {
    expect(parseVocabCandidates("not json")).toEqual([]);
  });

  it("returns [] when a candidate's pos isn't noun/verb/adjective", () => {
    expect(parseVocabCandidates(JSON.stringify([{ word: "x", pos: "adverb" }]))).toEqual([]);
  });
});

describe("vocabProposalPrompt", () => {
  it("includes the topic and requested parts of speech", () => {
    const prompt = vocabProposalPrompt("daily routines", ["noun", "verb"]);
    expect(prompt).toContain("daily routines");
    expect(prompt).toContain("noun, verb");
  });

  it("explicitly excludes 'be'", () => {
    expect(vocabProposalPrompt("test", ["verb"])).toContain('Do not include "be"');
  });
});

describe("proposeVocabCandidates", () => {
  it("calls NVIDIA NIM and returns parsed candidates", async () => {
    const result = await proposeVocabCandidates({
      topic: "daily routines",
      posTypes: ["noun", "verb", "adjective"],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
    });
    expect(result).toEqual(CANDIDATES);
  });

  it("returns [] when the API responds with a non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    const result = await proposeVocabCandidates({
      topic: "x",
      posTypes: ["noun"],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await proposeVocabCandidates({
      topic: "x",
      posTypes: ["noun"],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/generative-vocab.server.test.ts`
Expected: FAIL — `Cannot find module './generative-vocab.server'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/generative-vocab.server.ts`:

```ts
import { z } from "zod";

/**
 * Generative sentence-content pilot -- LLM proposes vocab candidates
 * for a topic; verifyCandidatePos (added in Task 8) cross-checks each
 * one's claimed part-of-speech against `compromise`'s own tagging
 * before it's ever trusted into the curated vocab dataset. Same
 * NVIDIA NIM integration, same defensive-parse posture (never assume
 * clean JSON from the model) as practice-generation.server.ts and
 * weakness-detection.server.ts.
 */
const candidateSchema = z.object({
  word: z.string().min(1).max(40),
  pos: z.enum(["noun", "verb", "adjective"]),
});
const candidatesSchema = z.array(candidateSchema).max(30);
export type VocabCandidate = z.infer<typeof candidateSchema>;

/** Never throws -- any parse/shape failure yields an empty array. */
export function parseVocabCandidates(content: string): VocabCandidate[] {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = candidatesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function vocabProposalPrompt(
  topic: string,
  posTypes: ("noun" | "verb" | "adjective")[],
): string {
  return (
    `List up to 20 simple, common English words for an A1 (beginner) ` +
    `learner on the topic "${topic}". Only include these parts of ` +
    `speech: ${posTypes.join(", ")}. Every verb must be given in its ` +
    `base/infinitive form (e.g. "walk", not "walks" or "walked"). Do ` +
    `not include "be" -- use a different verb instead. Respond with ` +
    `ONLY a JSON array, no other text, in this exact shape: ` +
    `[{"word": "<word>", "pos": "<noun|verb|adjective>"}]. If you ` +
    `can't think of good words for this topic, respond with [].`
  );
}

/** Calls NVIDIA NIM with vocabProposalPrompt and parses the result.
 *  Never throws -- any upstream/parse failure yields an empty array,
 *  matching this codebase's existing AI-feature fail-quiet design. */
export async function proposeVocabCandidates(params: {
  topic: string;
  posTypes: ("noun" | "verb" | "adjective")[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<VocabCandidate[]> {
  try {
    const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: params.nvidiaModel,
        messages: [{ role: "user", content: vocabProposalPrompt(params.topic, params.posTypes) }],
      }),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseVocabCandidates(content);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/lib/generative-vocab.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generative-vocab.server.ts src/lib/generative-vocab.server.test.ts
git commit -m "feat(generative): LLM vocab-candidate proposal"
```

---

### Task 8: POS cross-check validation

**Files:**
- Modify: `src/lib/generative-vocab.server.ts`
- Modify: `src/lib/generative-vocab.server.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/generative-vocab.server.test.ts`:

```ts
import { verifyCandidatePos } from "./generative-vocab.server";

describe("verifyCandidatePos", () => {
  it("accepts a candidate whose claimed POS matches compromise's own tagging", () => {
    expect(verifyCandidatePos({ word: "coffee", pos: "noun" })).toBe(true);
    expect(verifyCandidatePos({ word: "happy", pos: "adjective" })).toBe(true);
    expect(verifyCandidatePos({ word: "walk", pos: "verb" })).toBe(true);
  });

  it("rejects a candidate with a deliberately wrong claimed POS", () => {
    expect(verifyCandidatePos({ word: "coffee", pos: "verb" })).toBe(false);
    expect(verifyCandidatePos({ word: "quickly", pos: "noun" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/generative-vocab.server.test.ts`
Expected: FAIL — `verifyCandidatePos is not a function` (or not exported).

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/generative-vocab.server.ts`:

```ts
import nlp from "compromise";

const POS_TAG_MAP: Record<"noun" | "verb" | "adjective", string> = {
  noun: "Noun",
  verb: "Verb",
  adjective: "Adjective",
};

/**
 * Cross-checks an LLM-claimed part-of-speech against compromise's own
 * tagging -- the concrete implementation of "the LLM never writes
 * grammar-bearing text directly" (design doc component 3). A mismatch
 * is rejected outright by the caller (proposeVocabForTopic, added in
 * Task 9), never coerced or guessed.
 */
export function verifyCandidatePos(candidate: VocabCandidate): boolean {
  const doc = nlp(candidate.word);
  const tags: string[] = doc.json()[0]?.terms?.[0]?.tags ?? [];
  return tags.includes(POS_TAG_MAP[candidate.pos]);
}
```

Note: move the `import nlp from "compromise";` line to the top of the file alongside the existing `import { z } from "zod";` rather than mid-file, per standard import placement.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/lib/generative-vocab.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generative-vocab.server.ts src/lib/generative-vocab.server.test.ts
git commit -m "feat(generative): POS cross-check against compromise's own tagging"
```

---

### Task 9: Orchestration — `proposeVocabForTopic`

**Files:**
- Modify: `src/lib/generative-vocab.server.ts`
- Modify: `src/lib/generative-vocab.server.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/generative-vocab.server.test.ts`:

```ts
import { proposeVocabForTopic } from "./generative-vocab.server";

describe("proposeVocabForTopic", () => {
  it("merges accepted candidates into the existing vocab and reports rejections", async () => {
    const result = await proposeVocabForTopic({
      topic: "daily routines",
      posTypes: ["noun", "verb", "adjective"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected).toEqual([]);
    expect(result.merged).toHaveLength(3);
    expect(result.merged.find((e) => e.word === "coffee")?.topics).toEqual(["daily routines"]);
  });

  it("excludes 'be' even if the LLM proposes it, reporting it as rejected", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify([{ word: "be", pos: "verb" }]) } }],
        }),
        { status: 200 },
      ),
    );
    const result = await proposeVocabForTopic({
      topic: "x",
      posTypes: ["verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([{ word: "be", pos: "verb" }]);
  });

  it("rejects a candidate that fails the POS cross-check", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify([{ word: "coffee", pos: "verb" }]) } },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await proposeVocabForTopic({
      topic: "x",
      posTypes: ["verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([{ word: "coffee", pos: "verb" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/generative-vocab.server.test.ts`
Expected: FAIL — `proposeVocabForTopic is not a function` (or not exported).

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/generative-vocab.server.ts` (and add the new import at the top):

```ts
import type { Level } from "../data/levels";
import type { VocabEntry } from "../data/generative/vocab";
import { mergeVocabEntries } from "./generative-vocab-authoring";

export type VocabProposalResult = {
  accepted: VocabEntry[];
  rejected: VocabCandidate[];
  merged: VocabEntry[];
};

/**
 * Full pipeline: propose candidates for a topic, cross-check each
 * one's claimed POS, exclude "be" (see vocab.ts's own header comment
 * for why), and merge the accepted ones into the existing vocab array.
 * Rejected candidates are returned -- not thrown away silently -- so
 * the CLI (Task 10) can report them as "needs manual review."
 */
export async function proposeVocabForTopic(params: {
  topic: string;
  posTypes: ("noun" | "verb" | "adjective")[];
  level: Level;
  existingVocab: VocabEntry[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<VocabProposalResult> {
  const candidates = await proposeVocabCandidates({
    topic: params.topic,
    posTypes: params.posTypes,
    nvidiaApiKey: params.nvidiaApiKey,
    nvidiaModel: params.nvidiaModel,
  });

  const accepted: VocabEntry[] = [];
  const rejected: VocabCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.word.toLowerCase() === "be") {
      rejected.push(candidate);
      continue;
    }
    if (verifyCandidatePos(candidate)) {
      accepted.push({
        word: candidate.word,
        pos: candidate.pos,
        level: params.level,
        topics: [params.topic],
      });
    } else {
      rejected.push(candidate);
    }
  }

  const merged = mergeVocabEntries(params.existingVocab, accepted);
  return { accepted, rejected, merged };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/lib/generative-vocab.server.test.ts`
Expected: PASS (all cases from Tasks 7-9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/generative-vocab.server.ts src/lib/generative-vocab.server.test.ts
git commit -m "feat(generative): proposeVocabForTopic orchestration"
```

---

### Task 10: `generate` CLI subcommand

**Files:**
- Modify: `scripts/pack-tool.ts`

- [ ] **Step 1: Add the new imports**

At the top of `scripts/pack-tool.ts`, alongside the existing imports, add:

```ts
import { GENERATIVE_VOCAB } from "../src/data/generative/vocab";
import { TEMPLATES } from "../src/data/generative/templates";
import { expandTemplate } from "../src/data/generative/expand";
import { proposeVocabForTopic } from "../src/lib/generative-vocab.server";
import { replaceVocabArrayInSource } from "../src/lib/generative-vocab-authoring";
```

- [ ] **Step 2: Add the `cmdGenerate` function**

Add this function to `scripts/pack-tool.ts`, right after `cmdDraft` (before `cmdValidate`):

```ts
const VOCAB_FILE = "src/data/generative/vocab.ts";

async function cmdGenerate(flags: Flags) {
  const course = requireCourse(flags);
  if (course !== "en") {
    fail(
      '--course must be "en" -- this pilot is English-only, see ' +
        "docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md",
    );
  }
  const level = requireLevel(flags);
  const id = requireString(flags, "id", "e.g. a1gen1");
  const templateId = requireString(
    flags,
    "template",
    `one of ${TEMPLATES.map((t) => t.id).join(", ")}`,
  );
  const topic = requireString(flags, "topic", 'e.g. "daily routines"');
  const count = flags.count ? Number(flags.count) : 25;
  const out = typeof flags.out === "string" ? flags.out : `drafts/${id}.json`;
  if (!Number.isFinite(count) || count < 3) fail("--count must be a number >= 3");

  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    fail(`unknown --template "${templateId}" -- must be one of ${TEMPLATES.map((t) => t.id).join(", ")}`);
  }
  if (template!.level !== level) {
    fail(`--level ${level} doesn't match template "${templateId}"'s level (${template!.level})`);
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    fail(
      "NVIDIA_API_KEY is not set. Vocab proposal needs a NVIDIA NIM key (see .env.example, " +
        "build.nvidia.com).",
    );
  }

  const posTypes = [
    ...new Set(template!.slots.filter((s) => s.pos !== "pronoun").map((s) => s.pos)),
  ];

  console.log(`Proposing vocab for "${topic}" (${posTypes.join(", ")})...`);
  const proposal = await proposeVocabForTopic({
    topic,
    posTypes,
    level,
    existingVocab: GENERATIVE_VOCAB,
    nvidiaApiKey: apiKey,
    nvidiaModel: resolveNvidiaChatModel(),
  });

  console.log(`  accepted: ${proposal.accepted.length}, rejected: ${proposal.rejected.length}`);
  if (proposal.rejected.length > 0) {
    console.log("  rejected (needs manual review -- POS mismatch, or excluded like \"be\"):");
    for (const r of proposal.rejected) console.log(`    - ${r.word} (claimed ${r.pos})`);
  }

  if (proposal.accepted.length > 0) {
    if (!existsSync(VOCAB_FILE)) fail(`vocab file not found: ${VOCAB_FILE}`);
    const vocabSource = readFileSync(VOCAB_FILE, "utf-8");
    const updated = replaceVocabArrayInSource(vocabSource, proposal.merged);
    writeFileSync(VOCAB_FILE, updated);
    console.log(`  written ${proposal.accepted.length} new vocab entries to ${VOCAB_FILE}.`);
  }

  const lines = expandTemplate({
    template: template!,
    vocab: proposal.merged,
    packId: id,
    targetCount: count,
  });

  if (lines.length === 0) {
    fail(
      `no sentences could be generated -- not enough vocab at level ${level} for this ` +
        `template's required parts of speech (${posTypes.join(", ")}). Run "generate" again ` +
        "with a broader topic, or add vocab manually.",
    );
  }
  if (lines.length < count) {
    console.log(
      `  warning: only ${lines.length} distinct sentences possible (requested ${count}) -- ` +
        "the vocab pool for this topic/level is small. Not an error, just a shortfall.",
    );
  }

  const pack: Pack = {
    id,
    title: topic.replace(/^\w/, (c) => c.toUpperCase()),
    subtitle: `Generated: ${template!.tense}-tense sentences`,
    kind: "cloze",
    note: `Auto-generated via "${template!.id}" -- verb-conjugation practice.`,
    data: lines.join("\n"),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 2) + "\n");
  console.log(`\nDraft pack written to ${out} (${lines.length} lines).`);
  console.log(
    "THIS IS GENERATED CONTENT -- grammar is compiler-verified, but read every line before",
  );
  console.log("validating/applying, same discipline as a hand-authored or AI-drafted pack.\n");
  console.log(previewPack(pack));
  console.log("\nValidation:");
  printIssues(validatePack(pack));
  console.log(`\nNext:`);
  console.log(`  bun run scripts/pack-tool.ts validate ${out} --course ${course}`);
  console.log(`  bun run scripts/pack-tool.ts apply ${out} --course ${course} --level ${level}`);
}
```

- [ ] **Step 3: Wire it into the command dispatcher**

In `scripts/pack-tool.ts`'s `main()` function, add a case to the `switch`:

```ts
    case "generate":
      await cmdGenerate(flags);
      break;
```

(placed after the existing `case "draft":` block, before `case "validate":`)

- [ ] **Step 4: Update the help text**

In `printHelp()`, add a line to the commands list:

```ts
      "  generate --course en --level <A1..C1> --id <id> --template <svo-present|svo-past> --topic <topic> [--count N] [--out <path>]",
```

(placed after the existing `"  draft ..."` line)

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit -p .`
Expected: no new errors (note: `scripts/` itself isn't part of the typecheck `include` per this file's own header comment, so this mainly confirms the new `src/` files typecheck cleanly against each other — still run it to be sure nothing regressed).

- [ ] **Step 6: Manual smoke test (requires `NVIDIA_API_KEY` set)**

Run:
```bash
bun run scripts/pack-tool.ts generate --course en --level A1 --id a1gentest --template svo-present --topic "daily routines" --count 15 --out drafts/a1gentest.json
```
Expected: console output showing vocab proposal results, a confirmation that `src/data/generative/vocab.ts` was updated, a preview of the generated pack, and validation output with 0 errors. Then inspect `src/data/generative/vocab.ts` and `drafts/a1gentest.json` by hand to confirm the content reads correctly.

Clean up after: revert `src/data/generative/vocab.ts` to its committed state (`git checkout src/data/generative/vocab.ts`) and delete `drafts/a1gentest.json` — this smoke test's output shouldn't be committed as part of this plan (a real topic run is a separate, deliberate decision for whoever picks up vocab growth next, not baked into the pilot's own commits).

- [ ] **Step 7: Commit**

```bash
git add scripts/pack-tool.ts
git commit -m "feat(generative): generate CLI subcommand"
```

---

### Task 11: Integration test — full pipeline

**Files:**
- Create: `src/data/generative/generate-integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/generative/generate-integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proposeVocabForTopic } from "../../lib/generative-vocab.server";
import { expandTemplate } from "./expand";
import { TEMPLATES } from "./templates";
import { packQuestions, type Pack } from "../bank-engine";

/**
 * Full pipeline test (mocked LLM, real `compromise` compilation) --
 * reuses the same invariants curriculum-consistency.test.ts enforces
 * across every hand-authored/AI-drafted course, as the acceptance gate
 * for generated content too (design doc's Testing section: "reusing
 * that scan as the acceptance gate for generated content, not writing
 * a parallel one").
 */
const CANDIDATES = [
  { word: "coffee", pos: "noun" },
  { word: "school", pos: "noun" },
  { word: "walk", pos: "verb" },
  { word: "run", pos: "verb" },
];

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(CANDIDATES) } }] }),
      { status: 200 },
    ),
  );
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("full generate pipeline", () => {
  it("produces a pack whose questions have no out-of-range answers, duplicate choices, or bank mismatches", async () => {
    const template = TEMPLATES.find((t) => t.id === "svo-present")!;
    const proposal = await proposeVocabForTopic({
      topic: "daily routines",
      posTypes: ["noun", "verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
    });
    expect(proposal.accepted.length).toBeGreaterThan(0);

    const lines = expandTemplate({
      template,
      vocab: proposal.merged,
      packId: "integrationtest1",
      targetCount: 20,
    });
    expect(lines.length).toBeGreaterThan(0);

    const pack: Pack = {
      id: "integrationtest1",
      title: "Daily Routines",
      subtitle: "Generated",
      kind: "cloze",
      note: "test",
      data: lines.join("\n"),
    };

    const questions = packQuestions(pack);
    expect(questions.length).toBe(lines.length);
    for (const q of questions) {
      if (q.type === "mc") {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        const normalized = q.choices.map((c) => c.trim().toLowerCase());
        expect(new Set(normalized).size).toBe(normalized.length);
      }
      if (q.type === "fill") {
        expect(q.bank.map((b) => b.toLowerCase())).toContain(q.answer.toLowerCase());
      }
    }
  });

  it("returns an empty pipeline result gracefully when the LLM proposes nothing usable", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), {
        status: 200,
      }),
    );
    const template = TEMPLATES.find((t) => t.id === "svo-present")!;
    const proposal = await proposeVocabForTopic({
      topic: "obscure topic",
      posTypes: ["noun", "verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
    });
    expect(proposal.accepted).toEqual([]);

    const lines = expandTemplate({
      template,
      vocab: proposal.merged,
      packId: "integrationtest2",
      targetCount: 20,
    });
    expect(lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/data/generative/generate-integration.test.ts`
Expected: FAIL initially only if any prior task's code has a defect this integration exercise surfaces (all underlying pieces already exist and pass their own unit tests from Tasks 1-9, so this should mostly just PASS immediately — if so, skip to Step 3 and note in the commit that this is a verification test, not a TDD-red-then-green step).

- [ ] **Step 3: Run the test and confirm the actual result**

Run: `bun run vitest run src/data/generative/generate-integration.test.ts`
Expected: PASS. If it fails, that's a real integration-level bug in how Tasks 1-9's pieces compose — do not patch this test to hide it; find and fix the actual defect in the relevant task's file.

- [ ] **Step 4: Run the full test suite + typecheck to confirm no regressions**

Run: `bun run vitest run`
Expected: all tests pass, including the pre-existing `src/data/curriculum-consistency.test.ts` (unaffected — `GENERATIVE_VOCAB`/`TEMPLATES` are new, separate data, not spliced into `curriculum`/`curriculumFr`/`curriculumEs` by anything in this plan).

Run: `bunx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/generative/generate-integration.test.ts
git commit -m "test(generative): full pipeline integration test"
```

---

## Self-Review

**Spec coverage:**
- Template library (hand-authored, not LLM-proposed) → Task 2. ✓
- Curated vocab dataset, separate from `VOCAB_IMAGES` → Task 3. ✓
- LLM proposes / compiler compiles hybrid, verified `compromise` derivation avoiding the "you" and bare-word bugs → Task 1, Task 5. ✓
- POS cross-check gate ("LLM never writes grammar-bearing text directly") → Task 8, wired in Task 9. ✓
- Vocab merge (union topics, not duplicate) → Task 4. ✓
- Sampling via seeded `hash()` → Task 6. ✓
- `generate` CLI, English-only guard, feeds existing `validate`/`preview`/`apply --confirm` unchanged → Task 10. ✓
- Two different write timings (vocab.ts immediate, pack gated) → Task 10, Step 2's `cmdGenerate` body. ✓
- "be" excluded from starter vocab → Task 3 (doc comment), Task 9 (`proposeVocabForTopic`'s explicit skip). ✓
- Testing section's compiler/expansion/POS-rejection/integration tests → Tasks 1, 5, 6, 8, 9, 11. ✓
- Explicitly out of scope (French/Spanish, >2 templates, changes to existing `pack-tool.ts` commands) → respected throughout; `cmdApply`/`cmdValidate`/`cmdPreview`/`cmdNew`/`cmdDraft` are never touched by any task.

**Placeholder scan:** No TBD/TODO markers. Every step has complete, runnable code or an exact command with an expected result.

**Type consistency check:**
- `Slot`/`Template`/`PronounEntry` (Task 2) are consumed identically in `compile.ts` (Task 5) and `expand.ts` (Task 6) — same field names (`agreeWith`, `pos`, `tense`, `slots`, `render`).
- `VocabEntry` (Task 3) is consumed identically in `generative-vocab-authoring.ts` (Task 4), `generative-vocab.server.ts` (Tasks 7-9), and `expand.ts` (Task 6) — same field names (`word`, `pos`, `level`, `irregularForms`, `topics`).
- `SlotAssignment` (introduced in Task 5) is reused by name in `expand.ts` (Task 6) via `import type { SlotAssignment } from "./compile"` rather than being redefined.
- `VocabCandidate` (Task 7) flows unchanged into `verifyCandidatePos` (Task 8) and `proposeVocabForTopic` (Task 9) — same `{ word, pos }` shape throughout.
- CLI flag names in Task 10 (`--course`, `--level`, `--id`, `--template`, `--topic`, `--count`, `--out`) match the spec's documented CLI signature exactly.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-22-generative-sentence-content.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
