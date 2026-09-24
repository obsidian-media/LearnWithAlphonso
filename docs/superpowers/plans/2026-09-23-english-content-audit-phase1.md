# English Content Correctness Audit (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and fix every content-quality issue across all shipped English course content (534 lessons / 2,721 questions, plus 45 placement questions), without churning the question ids that users' saved progress is keyed to.

**Architecture:** Build read-only tooling first — a renderer that dumps every *compiled* English question (the audit must review generated output, not raw pack source, because the reported bug lives in generated distractors) and an id-parity checker. Then audit in parallel by CEFR level (read-only, producing findings), apply edits serially (one file, no write contention), and verify id parity plus the consistency test after each application. Finish by pushing fixes to both shipped surfaces (Supabase seed, iOS export).

**Tech Stack:** TypeScript, Vitest, Bun as both runner and TS script executor (`bun run scripts/foo.ts` — `tsx` is NOT installed in this repo despite some existing script docstrings referencing it). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md`

## Global Constraints

- **English only.** Never modify `curriculum-fr.ts`, `curriculum-es.ts`, `lesson-bank-fr.ts`, `lesson-bank-es.ts`, `placement-fr.ts`, `placement-es.ts`, or `bank-engine.ts`.
- **Id stability is a hard rule.** Question/lesson ids are index-derived (`${pack.id}q${i}`, `${pack.id}l${n}`); users' review items key on `` `${lessonId}:${questionId}` ``. Content edits MUST preserve each pack's line count and line order. Adding/removing a `data` line is a deferred structural change, logged not applied.
- **Never run the bare full test suite** (`bun run vitest run` with no args) — it hangs in this Windows sandbox. Always scope: `bun run vitest run <paths>`.
- **`pickDistractors` consolidation is out of scope** for this plan (see spec — it needs its own id-parity-proofed pass).
- **Re-leveling a pack is out of scope** — flag-only, logged for batched decision.
- Audit log lives at `docs/superpowers/english-content-audit-log.md` (committed path; `docs/v5-kickoffs/` and `docs/BACKLOG.md` are gitignored).

## Review Focus

Five conditions the spec implies but that no obvious task would otherwise test:

1. **A pack whose `data` lines change count** — the id-parity check must FAIL loudly, not silently pass. Pinned in Task 2.
2. **Empty/whitespace-only distractor after an edit** — an edit that blanks a pool entry yields a blank MC choice; the existing consistency test covers empty strings, so Task 5 must re-run it after every application, not just at the end.
3. **A pack line containing more than one `|`** — `l.split("|")` takes `[0]`/`[1]` and silently drops the rest, so an edit introducing a stray pipe corrupts content without error. Pinned in Task 2.
4. **Placement questions are not in `questionIndex`** — tooling that enumerates only `questionIndex` silently audits 0 of 45 placement questions. Pinned in Task 1.
5. **A `fill`-type question whose `answer` is absent from its own `bank`** — makes the question unanswerable; the existing consistency test checks reconstructability but Task 1's dump must surface `bank` so an auditor can actually see it. Pinned in Task 1.

---

### Task 1: Question dump tool

The audit cannot review raw pack source — `child|children` lines don't reveal which distractors `pickDistractors` actually picked. This renders every compiled English question to reviewable JSON, partitioned by level, including placement questions (which live outside `questionIndex`).

**Files:**
- Create: `scripts/dump-english-questions.ts`
- Create: `src/lib/english-content-dump.ts`
- Test: `src/lib/english-content-dump.test.ts`

**Interfaces:**
- Consumes: `getCourse` from `@/data/courses`, `PLACEMENT_QUESTIONS` from `@/data/placement`.
- Produces: `buildEnglishDump(): EnglishDump` where
  `type DumpedQuestion = { key: string; level: Level; unitId: string; lessonId: string; questionId: string; type: string; prompt: string; choices?: string[]; bank?: string[]; tokens?: string[]; answer: string; explanation: string; audioText?: string; imageKey?: string }`
  and `type EnglishDump = { byLevel: Record<Level, DumpedQuestion[]>; placement: DumpedQuestion[]; totals: { curriculum: number; placement: number } }`.
  Task 2 consumes `buildEnglishDump`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/english-content-dump.test.ts
import { describe, expect, it } from "vitest";
import { buildEnglishDump } from "./english-content-dump";
import { PLACEMENT_QUESTIONS } from "@/data/placement";

describe("buildEnglishDump", () => {
  it("dumps every curriculum question keyed as lessonId:questionId", () => {
    const dump = buildEnglishDump();
    const all = Object.values(dump.byLevel).flat();
    expect(all.length).toBe(dump.totals.curriculum);
    expect(all.length).toBeGreaterThan(2000);
    for (const q of all) {
      expect(q.key).toBe(`${q.lessonId}:${q.questionId}`);
      expect(q.prompt.trim()).not.toBe("");
    }
  });

  it("includes placement questions, which are absent from questionIndex", () => {
    const dump = buildEnglishDump();
    expect(dump.placement.length).toBe(45);
    expect(dump.totals.placement).toBe(45);
    // Review Focus #4: placement lives outside questionIndex entirely.
    for (const q of dump.placement) {
      expect(q.choices?.length).toBeGreaterThan(0);
      expect(q.answer.trim()).not.toBe("");
    }
  });

  // placement.ts is NOT covered by curriculum-consistency.test.ts (it lives
  // outside questionIndex), so without this guard Task 5's placement edits
  // would have no automated safety net at all.
  it("keeps placement questions structurally valid", () => {
    for (const p of PLACEMENT_QUESTIONS) {
      expect(p.answer, `${p.id} answer index out of range`).toBeGreaterThanOrEqual(0);
      expect(p.answer, `${p.id} answer index out of range`).toBeLessThan(p.choices.length);
      expect(p.prompt.trim(), `${p.id} has an empty prompt`).not.toBe("");
      for (const c of p.choices) {
        expect(c.trim(), `${p.id} has an empty choice`).not.toBe("");
      }
      const lowered = p.choices.map((c) => c.trim().toLowerCase());
      expect(new Set(lowered).size, `${p.id} has duplicate choices`).toBe(p.choices.length);
    }
  });

  it("surfaces the fill bank so an auditor can see answer-in-bank violations", () => {
    const dump = buildEnglishDump();
    const fills = Object.values(dump.byLevel)
      .flat()
      .filter((q) => q.type === "fill");
    expect(fills.length).toBeGreaterThan(0);
    // Review Focus #5: answer must be present in its own bank.
    for (const q of fills) {
      expect(q.bank).toBeDefined();
      expect(q.bank).toContain(q.answer);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/lib/english-content-dump.test.ts`
Expected: FAIL — `Failed to resolve import "./english-content-dump"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/english-content-dump.ts
import { getCourse } from "@/data/courses";
import { PLACEMENT_QUESTIONS } from "@/data/placement";
import type { Level } from "@/data/levels";

// NB: `LEVELS` in levels.ts is `{ id, name, blurb }[]`, NOT `Level[]` --
// do not map over it to key a record. This mirrors what
// lesson-bank.ts's own generatedUnits() does.
const ALL_LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

export type DumpedQuestion = {
  key: string;
  level: Level;
  unitId: string;
  lessonId: string;
  questionId: string;
  type: string;
  prompt: string;
  choices?: string[];
  bank?: string[];
  tokens?: string[];
  answer: string;
  explanation: string;
  audioText?: string;
  imageKey?: string;
};

export type EnglishDump = {
  byLevel: Record<Level, DumpedQuestion[]>;
  placement: DumpedQuestion[];
  totals: { curriculum: number; placement: number };
};

export function buildEnglishDump(): EnglishDump {
  const { questionIndex } = getCourse("en");
  const byLevel = Object.fromEntries(ALL_LEVELS.map((l) => [l, [] as DumpedQuestion[]])) as Record<
    Level,
    DumpedQuestion[]
  >;

  let curriculumCount = 0;
  for (const [key, ref] of Object.entries(questionIndex)) {
    const q = ref.question;
    const base = {
      key,
      level: ref.level,
      unitId: ref.unitId,
      lessonId: ref.lessonId,
      questionId: q.id,
      type: q.type,
      prompt: q.prompt,
      explanation: q.explanation,
    };
    const dumped: DumpedQuestion =
      q.type === "mc"
        ? {
            ...base,
            choices: q.choices,
            answer: q.choices[q.answer] ?? "",
            audioText: q.audioText,
            imageKey: q.imageKey,
          }
        : q.type === "fill"
          ? { ...base, bank: q.bank, answer: q.answer }
          : { ...base, tokens: q.tokens, answer: q.answer };
    byLevel[ref.level].push(dumped);
    curriculumCount++;
  }

  for (const level of ALL_LEVELS) {
    byLevel[level].sort((a, b) => a.key.localeCompare(b.key));
  }

  const placement: DumpedQuestion[] = PLACEMENT_QUESTIONS.map((p) => ({
    key: `placement:${p.id}`,
    level: p.level,
    unitId: "placement",
    lessonId: "placement",
    questionId: p.id,
    type: "mc",
    prompt: p.prompt,
    choices: p.choices,
    answer: p.choices[p.answer] ?? "",
    explanation: "",
  }));

  return {
    byLevel,
    placement,
    totals: { curriculum: curriculumCount, placement: placement.length },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run vitest run src/lib/english-content-dump.test.ts`
Expected: PASS (4 tests).

If the `fill`-bank test fails, that is a **real content bug already in the repo**, not a test bug — record it in the audit log and fix the offending pack in the level task that owns it.

- [ ] **Step 5: Add the CLI wrapper that writes the dump to disk**

```ts
// scripts/dump-english-questions.ts
/**
 * Writes the compiled English question dump used by the phase 1 content
 * audit. The audit reviews generated output (real distractors), not raw
 * pack source, because pickDistractors is what produces the wrong answers.
 *
 * Usage: bun run scripts/dump-english-questions.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildEnglishDump } from "../src/lib/english-content-dump";

const outDir = path.resolve(import.meta.dirname, "../.audit");
fs.mkdirSync(outDir, { recursive: true });

const dump = buildEnglishDump();
for (const [level, questions] of Object.entries(dump.byLevel)) {
  const out = path.join(outDir, `english-${level}.json`);
  fs.writeFileSync(out, JSON.stringify(questions, null, 2));
  console.log(`Wrote ${out} (${questions.length} questions)`);
}
const placementOut = path.join(outDir, "english-placement.json");
fs.writeFileSync(placementOut, JSON.stringify(dump.placement, null, 2));
console.log(`Wrote ${placementOut} (${dump.placement.length} questions)`);
console.log(`Totals: ${dump.totals.curriculum} curriculum, ${dump.totals.placement} placement`);
```

- [ ] **Step 6: Run the script and confirm output**

Run: `bun run scripts/dump-english-questions.ts`
Expected: writes `.audit/english-A1.json` … `english-C1.json` plus `english-placement.json`; totals print `2721 curriculum, 45 placement` (re-verify the exact curriculum number — the spec's count may have drifted; use the printed value as truth and note it in the log).

- [ ] **Step 7: Ignore the generated dump directory**

Add to `.gitignore`:

```
# Phase 1 content-audit dumps (regenerate with scripts/dump-english-questions.ts)
/.audit/
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/english-content-dump.ts src/lib/english-content-dump.test.ts scripts/dump-english-questions.ts .gitignore
git commit -m "feat: add English question dump tool for content audit"
```

---

### Task 2: Id-parity guard

Makes the spec's hard rule mechanically enforced: an edit that shifts any `lessonId:questionId`, changes a pack's line count, or introduces a stray `|` must fail loudly before it reaches users' saved progress.

**Files:**
- Create: `src/lib/english-id-parity.ts`
- Create: `src/lib/english-id-parity.test.ts`
- Create: `scripts/snapshot-english-ids.ts`
- Create: `.audit-baseline/english-ids.json` (committed — it is the baseline being compared against)

**Interfaces:**
- Consumes: `buildEnglishDump` from Task 1.
- Produces: `collectEnglishIds(): string[]` (sorted `lessonId:questionId` keys), `diffIds(baseline: string[], current: string[]): { added: string[]; removed: string[] }`, and `packLineStats(): Record<string, { lines: number; malformed: string[] }>` keyed by pack id. Task 5 runs these after every edit application.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/english-id-parity.test.ts
import { describe, expect, it } from "vitest";
import { collectEnglishIds, diffIds, packLineStats } from "./english-id-parity";

describe("collectEnglishIds", () => {
  it("returns sorted, unique lessonId:questionId keys", () => {
    const ids = collectEnglishIds();
    expect(ids.length).toBeGreaterThan(2000);
    expect([...new Set(ids)].length).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("diffIds", () => {
  it("reports no drift for identical id sets", () => {
    expect(diffIds(["a:1", "b:2"], ["a:1", "b:2"])).toEqual({ added: [], removed: [] });
  });

  it("reports drift when a line add shifts ids (Review Focus #1)", () => {
    const baseline = ["p1:q0", "p1:q1", "p1:q2"];
    const current = ["p1:q0", "p1:q1", "p1:q2", "p1:q3"];
    expect(diffIds(baseline, current)).toEqual({ added: ["p1:q3"], removed: [] });
  });

  it("reports drift when a line removal drops ids", () => {
    expect(diffIds(["p1:q0", "p1:q1"], ["p1:q0"])).toEqual({ added: [], removed: ["p1:q1"] });
  });
});

describe("packLineStats", () => {
  it("counts lines per pack and flags malformed ones (Review Focus #3)", () => {
    const stats = packLineStats();
    const packIds = Object.keys(stats);
    expect(packIds).toContain("a1p1");
    expect(stats["a1p1"]!.lines).toBeGreaterThan(0);
    // A stray extra "|" silently drops content in packQuestions' split.
    for (const [packId, s] of Object.entries(stats)) {
      expect(s.malformed, `pack ${packId} has malformed lines`).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/lib/english-id-parity.test.ts`
Expected: FAIL — `Failed to resolve import "./english-id-parity"`.

- [ ] **Step 3: Write minimal implementation**

`lesson-bank.ts` holds its packs in `const BANK: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 }` (line ~3335), which is **not currently exported**. Add `export` to that one declaration — export only, change nothing else in the file in this task:

```ts
// src/data/lesson-bank.ts (line ~3335) -- add `export`, nothing more
export const BANK: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };
```

```ts
// src/lib/english-id-parity.ts
import { buildEnglishDump } from "./english-content-dump";
import { BANK } from "@/data/lesson-bank";

export function collectEnglishIds(): string[] {
  const dump = buildEnglishDump();
  return Object.values(dump.byLevel)
    .flat()
    .map((q) => q.key)
    .sort();
}

export function diffIds(baseline: string[], current: string[]) {
  const b = new Set(baseline);
  const c = new Set(current);
  return {
    added: current.filter((id) => !b.has(id)).sort(),
    removed: baseline.filter((id) => !c.has(id)).sort(),
  };
}

export function packLineStats(): Record<string, { lines: number; malformed: string[] }> {
  const out: Record<string, { lines: number; malformed: string[] }> = {};
  for (const pack of Object.values(BANK).flat()) {
    const lines = pack.data
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const malformed = lines.filter((l) => l.split("|").length !== 2);
    out[pack.id] = { lines: lines.length, malformed };
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run vitest run src/lib/english-id-parity.test.ts`
Expected: PASS (5 tests).

If `packLineStats` reports malformed lines, that is a **real pre-existing content bug** — log it and fix it in the owning level's task.

- [ ] **Step 5: Write the baseline snapshot script**

```ts
// scripts/snapshot-english-ids.ts
/**
 * Writes the committed id baseline the phase 1 audit is checked against.
 * Run ONCE before any content edits; never re-run to "fix" a failing
 * parity check -- a failure means real users' review items would be
 * repointed (see the design doc's id-stability constraint).
 *
 * Usage: bun run scripts/snapshot-english-ids.ts
 */
import fs from "node:fs";
import path from "node:path";
import { collectEnglishIds } from "../src/lib/english-id-parity";

const outDir = path.resolve(import.meta.dirname, "../.audit-baseline");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "english-ids.json");
const ids = collectEnglishIds();
fs.writeFileSync(out, JSON.stringify(ids, null, 2));
console.log(`Wrote ${out} (${ids.length} ids)`);
```

- [ ] **Step 6: Generate and commit the baseline**

Run: `bun run scripts/snapshot-english-ids.ts`
Expected: writes `.audit-baseline/english-ids.json` with the full id list.

- [ ] **Step 7: Add the parity regression test that guards every later task**

Read the baseline with `fs`, NOT `import ... from "*.json"` — this repo's
`tsconfig.json` does not set `resolveJsonModule`, so a JSON import fails
CI's `bunx tsc --noEmit` step.

```ts
// append to src/lib/english-id-parity.test.ts
// (add these two imports alongside the existing ones at the top of the file)
import fs from "node:fs";
import path from "node:path";

describe("id parity against committed baseline", () => {
  it("has not added or removed any question id", () => {
    const baselinePath = path.resolve(__dirname, "../../.audit-baseline/english-ids.json");
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as string[];
    const { added, removed } = diffIds(baseline, collectEnglishIds());
    expect({ added, removed }).toEqual({ added: [], removed: [] });
  });
});
```

If `__dirname` is unavailable (ESM), use
`path.resolve(import.meta.dirname, "../../.audit-baseline/english-ids.json")` —
match whichever form the repo's existing test files already use.

- [ ] **Step 8: Run the parity test**

Run: `bun run vitest run src/lib/english-id-parity.test.ts`
Expected: PASS (6 tests) — parity holds, since no content has been edited yet.

- [ ] **Step 9: Commit**

```bash
git add src/lib/english-id-parity.ts src/lib/english-id-parity.test.ts scripts/snapshot-english-ids.ts .audit-baseline/english-ids.json src/data/lesson-bank.ts
git commit -m "feat: add id-parity guard for English content audit"
```

---

### Task 3: Audit log scaffold with full coverage enumeration

Exit criterion #1 requires coverage provable by enumeration. This generates the worklist so no pack, unit, or placement question can be silently skipped.

**Files:**
- Create: `scripts/init-audit-log.ts`
- Create: `docs/superpowers/english-content-audit-log.md` (generated, then committed)

**Interfaces:**
- Consumes: `BANK` from `@/data/lesson-bank` (exported in Task 2), `getCourse` from `@/data/courses`, `PLACEMENT_QUESTIONS` from `@/data/placement`.
- Produces: the committed audit log skeleton with one unchecked row per auditable unit of content.

- [ ] **Step 1: Write the generator**

```ts
// scripts/init-audit-log.ts
/**
 * Generates the phase 1 audit log skeleton: one row per pack, per
 * hand-written unit, and for the placement pool. Coverage is proved by
 * enumeration -- every row must end the audit with a verdict, including
 * "no issues found".
 *
 * Usage: bun run scripts/init-audit-log.ts
 */
import fs from "node:fs";
import path from "node:path";
import { BANK } from "../src/data/lesson-bank";
import { getCourse } from "../src/data/courses";
import { PLACEMENT_QUESTIONS } from "../src/data/placement";

const allPacks = Object.values(BANK).flat();

const packRows = allPacks.map(
  (p) => `| \`${p.id}\` | pack | ${p.title} | ${p.data.split("\n").filter((l) => l.trim()).length} | ☐ | |`,
);

const generatedPackIds = new Set(allPacks.map((p) => p.id));
const handWritten = getCourse("en")
  .curriculum.filter((u) => ![...generatedPackIds].some((id) => u.id.startsWith(id)))
  .map(
    (u) =>
      `| \`${u.id}\` | hand-written unit | ${u.title} | ${u.lessons.reduce((n, l) => n + l.questions.length, 0)} | ☐ | |`,
  );

const placementRow = `| \`placement\` | placement pool | Placement test | ${PLACEMENT_QUESTIONS.length} | ☐ | |`;

const body = `# English Content Audit Log (Phase 1)

> Generated by \`scripts/init-audit-log.ts\`. Every row must end with a
> verdict before phase 1 can be called done -- including "no issues
> found". Coverage is proved by enumeration, not sampling.
>
> Spec: \`docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md\`

## Coverage

| Id | Kind | Title | Questions | Audited | Findings |
|---|---|---|---|---|---|
${[...packRows, ...handWritten, placementRow].join("\n")}

## Findings detail

_One section per finding: what was wrong, which checklist item it violates,
the exact edit applied (or "deferred: structural" / "deferred: re-level")._

## Deferred structural changes

_Line add/remove proposals and pack re-leveling proposals. Each needs an
explicit applied/declined decision before phase 1 exits._
`;

const out = path.resolve(import.meta.dirname, "../docs/superpowers/english-content-audit-log.md");
fs.writeFileSync(out, body);
console.log(`Wrote ${out}`);
console.log(`Rows: ${packRows.length} packs, ${handWritten.length} hand-written units, 1 placement`);
```

- [ ] **Step 2: Run the generator**

Run: `bun run scripts/init-audit-log.ts`
Expected: writes the log; prints roughly `Rows: 102 packs, …` (use actual output as truth).

- [ ] **Step 3: Verify every pack appears exactly once**

Run: `grep -c '| pack |' docs/superpowers/english-content-audit-log.md`
Expected: matches the pack count printed in Step 2.

- [ ] **Step 4: Commit**

```bash
git add scripts/init-audit-log.ts docs/superpowers/english-content-audit-log.md
git commit -m "docs: add English content audit log scaffold"
```

---

### Tasks 4A–4E: Parallel read-only audit, one per CEFR level

**Run these five concurrently** (A1, A2, B1, B2, C1). They are read-only by design — no task in this group edits any content file, which is what makes concurrency safe against the single 3,449-line `lesson-bank.ts`.

Substitute `<LEVEL>` with `A1`, `A2`, `B1`, `B2`, or `C1`.

**Files:**
- Read: `.audit/english-<LEVEL>.json` (from Task 1), `src/data/lesson-bank.ts`, `src/data/curriculum.ts`, `src/data/levels.ts`
- Create: `.audit/findings-<LEVEL>.md`
- Modify: **none** — this task MUST NOT edit content files.

**Interfaces:**
- Consumes: the dump produced by Task 1.
- Produces: `.audit/findings-<LEVEL>.md`, a list of findings where each entry is: the question `key`, the violated checklist item (1–7), the current value, the exact proposed replacement, and whether it is an **in-place** edit (default) or a **deferred structural** change.

- [ ] **Step 1: Read the level's compiled questions**

Read `.audit/english-<LEVEL>.json` in full. Review the **compiled** output — the actual `choices` arrays — not just pack source lines.

- [ ] **Step 2: Audit every question against the checklist**

For each question apply all seven spec checklist items: (1) distractor plausibility, (2) prompt clarity, (3) explanation accuracy, (4) difficulty labeling — **flag-only**, (5) typos/grammar/British-spelling consistency, (6) asset correctness, (7) tone/cultural appropriateness.

For distractors specifically, the failure signature is a choice from a different semantic domain or part of speech than the answer — because `pickDistractors` draws mechanically from the pack's own answer pool, an incoherent pool yields incoherent choices. Judge the pool, not just the individual question.

- [ ] **Step 3: Write findings with exact proposed edits**

Every finding records the exact before/after text. A finding without a concrete replacement string is not done.

```markdown
### a1p3q7 — checklist 1 (distractor plausibility)
- Question: "Opposite of 'hot':"  choices: ["cold", "table", "quickly", "blue"]
- Problem: "table"/"quickly" are not adjectives; pool mixes parts of speech.
- Proposed (in-place, line 7 of pack a1p3): `hot|cold` unchanged; replace pool
  line 12 `run|table` with `run|walk` so the pool stays adjectival/verbal-coherent.
- Edit type: in-place (line count unchanged)
```

- [ ] **Step 4: Verify no content file was modified**

Run: `git status --short src/data/`
Expected: **empty output.** If anything is listed, revert it — edits belong to Task 5.

- [ ] **Step 5: Report**

Report the findings file path and a one-line count: how many findings, how many in-place vs deferred structural, how many "no issues found" packs.

Do **not** commit — `.audit/` is gitignored and these findings feed Task 5.

---

### Task 4F: Parallel read-only audit — placement pool

Runs concurrently with 4A–4E. Placement questions live **outside**
`questionIndex` (they are reached via `getCourse("en").placementPool`), so
the per-level tasks above do not cover them — without this task, 45 shipped
English questions would be audited zero times. They are also fully
hand-authored, meaning their distractors were written by a person rather
than drawn from a pack pool, so the failure mode differs from 4A–4E's.

**Files:**
- Read: `.audit/english-placement.json` (from Task 1), `src/data/placement.ts`
- Create: `.audit/findings-placement.md`
- Modify: **none** — read-only, like 4A–4E.

**Interfaces:**
- Consumes: the placement dump produced by Task 1.
- Produces: `.audit/findings-placement.md`, same finding format as 4A–4E.

- [ ] **Step 1: Read all 45 placement questions**

Read `.audit/english-placement.json` in full, alongside `src/data/placement.ts` for context on band grouping.

- [ ] **Step 2: Audit against the checklist**

Apply checklist items 1, 2, 3, 5, and 7 (items 4 and 6 do not apply: placement questions carry no `imageKey`/`audioText`, and their `level` is the band being *tested for*, not a difficulty label to correct).

Pay particular attention to item 1. `p2` is a known-suspect example already identified in the spec:

```
prompt: "Choose the polite greeting:"
choices: ["Oi you", "Good morning", "What", "Give"]
```

"What" and "Give" are unrelated bare words, not wrong-but-plausible greetings. A good distractor here is a greeting that is real but *impolite or wrong-register*, so the question actually tests politeness rather than word recognition.

- [ ] **Step 3: Write findings with exact proposed edits**

Same format as 4A–4E. Because these are hand-authored arrays, an edit replaces choice strings in place. **`answer` is an index into `choices`** — if a replacement reorders choices, the `answer` index must be updated to match, or the question silently becomes wrong. Every proposed edit must state the resulting `answer` index explicitly.

- [ ] **Step 4: Verify no content file was modified**

Run: `git status --short src/data/`
Expected: empty output.

- [ ] **Step 5: Report**

Report the findings count and how many of the 45 needed no change.

---

### Task 5: Apply edits serially, per level

Runs **after all of 4A–4F complete**. Applies each partition's proposed in-place edits to the shared content files, one partition at a time, verifying parity after each. This serialization is what prevents the write contention that parallel editing would cause.

**Files:**
- Modify: `src/data/lesson-bank.ts`, `src/data/curriculum.ts`, `src/data/levels.ts`, `src/data/placement.ts`
- Modify: `docs/superpowers/english-content-audit-log.md`

**Interfaces:**
- Consumes: `.audit/findings-<LEVEL>.md` from Tasks 4A–4E and `.audit/findings-placement.md` from Task 4F; `collectEnglishIds`/`diffIds`/`packLineStats` from Task 2.
- Produces: corrected content files, one commit per partition.

Repeat Steps 1–6 once per partition, in order A1 → A2 → B1 → B2 → C1 → placement.

For the placement pass, substitute `src/data/placement.ts` as the edited file, and additionally assert that each edited question's `answer` index still points at the intended correct choice (placement questions are not covered by `curriculum-consistency.test.ts`, since they live outside `questionIndex`).

- [ ] **Step 1: Apply that level's in-place edits**

Apply only edits marked **in-place**. Skip every **deferred structural** item — those go to Task 6. Preserve each pack's line count and line order exactly.

- [ ] **Step 2: Run the id-parity guard**

Run: `bun run vitest run src/lib/english-id-parity.test.ts`
Expected: PASS. A failure means a line was added/removed or a pack was re-leveled — **revert that edit**; do not regenerate the baseline.

- [ ] **Step 3: Run the structural consistency test**

Run: `bun run vitest run src/data/curriculum-consistency.test.ts`
Expected: PASS (33 tests). This is Review Focus #2 — it catches an edit that blanked a choice or duplicated choice text.

- [ ] **Step 4: Re-dump and spot-check the fixed questions**

Run: `bun run scripts/dump-english-questions.ts`
Then re-read the specific keys that were edited in `.audit/english-<LEVEL>.json` and confirm the compiled choices now read sensibly. Editing a pool line changes distractors for *other* questions drawing on that pool — confirm those didn't regress.

- [ ] **Step 5: Update the audit log**

Mark every row for that level as audited (`☑`), with its verdict, and add the findings detail entries.

- [ ] **Step 6: Commit that level**

```bash
git add src/data/ docs/superpowers/english-content-audit-log.md
git commit -m "fix: correct <LEVEL> English content quality issues"
```

---

### Task 6: Triage deferred structural changes

Exit criterion #4: nothing left in limbo.

**Files:**
- Modify: `docs/superpowers/english-content-audit-log.md`
- Modify (only for accepted changes): `src/data/lesson-bank.ts`, `.audit-baseline/english-ids.json`

**Interfaces:**
- Consumes: the "Deferred structural changes" section of the audit log.
- Produces: an explicit applied/declined decision per item.

- [ ] **Step 1: Present the deferred list to the account owner**

Summarize each deferred item: what it is, why it was deferred, and the id/progress cost of applying it. Ask for an applied/declined decision. Do not decide unilaterally — these change real users' saved progress.

- [ ] **Step 2: Record every decision in the log**

Each item gets `applied` or `declined` plus one line of reasoning. No item may remain undecided.

- [ ] **Step 3: If any change was accepted, apply it and re-baseline deliberately**

```bash
bun run scripts/snapshot-english-ids.ts
bun run vitest run src/lib/english-id-parity.test.ts
```

Expected: PASS against the new baseline. The commit message MUST list every changed id, because those correspond to real users' review items being repointed.

- [ ] **Step 4: Decide the deferred `pickDistractors` question**

The spec deliberately left one question open, to be answered by real findings rather than up front: **does `pickDistractors` need a semantic-plausibility layer (e.g. POS matching), or was per-pack pool curation enough?**

Answer it now, with the findings in hand. Count how many findings across 4A–4E were distractor-plausibility issues that pool curation *could not* fix in place. Then:

- **If pool curation covered them** — record "not needed" in the log with the count as evidence, and phase 1 ends here. This is the expected outcome.
- **If a meaningful residue remains** — record the count and the specific examples, and note it as **input to a separate, TDD'd piece of work**, not something to bolt on at the end of this plan. Do not add a POS layer in this plan: it changes generated output for every course-adjacent code path and would churn ids, which is exactly what this plan is built to prevent. Note also that the generative-content pilot already found `compromise`'s contextual tagging to have real false-positive problems — do not copy that approach without re-verifying it.

- [ ] **Step 5: Commit**

```bash
git add src/data/ .audit-baseline/english-ids.json docs/superpowers/english-content-audit-log.md
git commit -m "chore: triage deferred structural content changes"
```

---

### Task 7: Ship to both surfaces

Source fixes do not reach users by themselves. Exit criterion #5.

**Files:**
- Modify: `ios/LearnWithAlphonso/Resources/*.json`, `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/*.json` (generated)

**Interfaces:**
- Consumes: the corrected content from Tasks 5–6.
- Produces: regenerated iOS bundles; a re-seeded Supabase content table.

- [ ] **Step 1: Re-export iOS content**

Run: `bun run scripts/export-ios-content.ts`
Expected: writes `curriculum-en.json` (and siblings) into both iOS resource directories.

- [ ] **Step 2: Confirm the iOS diff contains only English changes**

Run: `git status --short ios/ && git diff --stat ios/`
Expected: `curriculum-en.json` changed in both directories; `curriculum-fr.json`/`curriculum-es.json` unchanged. If French/Spanish changed, stop — the audit violated the English-only constraint.

- [ ] **Step 3: Re-seed the Supabase content DB**

Review `scripts/seed-curriculum-db.ts` for which project/credentials it targets, then **confirm with the account owner before running it** — this writes to a shared, live environment.

Run (after confirmation): `bun run scripts/seed-curriculum-db.ts`

- [ ] **Step 4: Ask about the iOS build**

iOS content is bundled at build time and is not fetched at runtime, so users see no change until a new build ships. Ask the account owner whether a TestFlight build is being cut, and record the answer in the audit log.

- [ ] **Step 5: Verify all exit criteria**

Confirm and record in the log: (1) every row audited, (2) consistency test green, (3) id parity clean or deliberately re-baselined, (4) no undecided deferred items, (5) export + seed done and the build question answered.

- [ ] **Step 6: Commit**

```bash
git add ios/
git commit -m "chore: re-export iOS content after English audit"
```
