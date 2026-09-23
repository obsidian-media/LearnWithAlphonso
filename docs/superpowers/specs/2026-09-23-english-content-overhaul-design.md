# Design: English course content overhaul — correctness audit + new lesson types

> Written 2026-09-23, with the account owner, in an isolated worktree
> (`worktree-english-content-overhaul`) parallel to the UI/UX polish
> session running the same day. Source kickoff doc:
> `docs/v5-kickoffs/english-content-overhaul.md` (local-only, gitignored).

## Problem

The account owner reported shipped English-course questions that are
"way too basic," illustrated with a paraphrased example (a plural-of-X
multiple-choice question with nonsensical wrong answers). The exact
wording was confirmed to be illustrative, not a literal quote — it does
not appear verbatim anywhere in current source (`src/data/lesson-bank.ts`
has no "book" plural pair, and "highway" appears nowhere as a
distractor). **This spec targets the bug *class*** — content-quality
issues across the whole shipped English course — not one specific
string.

Two phases, in order, both required:

1. **Correctness audit**: find and fix every content-quality issue
   across all 534 English lessons / 2,721 questions.
2. **Expansion**: more lessons, plus genuinely new lesson types
   (listening, speaking, free-form translation), only once phase 1 is
   actually done.

## Scope

- **English only.** French (500 lessons) and Spanish (508 lessons)
  content is explicitly untouched.
- Both phases touch **both** the web app (`src/`, TanStack Start/React)
  and the native iOS app (`ios/LearnWithAlphonso` +
  `ios/LearnWithAlphonsoKit`) — iOS content is bundled at build time via
  `scripts/export-ios-content.ts`, not fetched live, so a source fix
  alone does not reach iOS users without a re-export and new build.

## Where content actually lives

- `src/data/curriculum.ts` — ~15 hand-written units directly, plus
  `getCourse()`'s assembly of units. Already has two optional
  per-question fields used sparingly: `imageKey` (2 uses) and
  `audioText` (3 uses, all hand-written).
- `src/data/levels.ts` — a further 6 hand-written `advancedUnits` (793
  lines). Easy to miss: it is neither `curriculum.ts` nor
  `lesson-bank.ts`, but it is real English course content and **is in
  scope for the audit**.
- `src/data/lesson-bank.ts` — the bulk of English content: ~25-line
  `Pack` objects (`kind: "pair" | "cloze"`), expanded into the 534
  generated lessons by this file's **own** `packQuestions()`/
  `buildLevel()` copy (not `bank-engine.ts`'s — see below). This is
  where phase 1's audit spends most of its time.
- `src/data/bank-engine.ts` — the shared question-compilation engine,
  imported by **French and Spanish only**. English predates it and was
  never consolidated onto it: English's generation runs on its own
  duplicated copy of the same logic inside `lesson-bank.ts` (known tech
  debt, `docs/BACKLOG.md` §4 and `ARCHITECTURE.md`'s rough edges).
  `pickDistractors()` is **purely mechanical** in both copies: pool =
  other answers within the same pack, walked from a hashed seed,
  deduped case-insensitively (PR #75, 2026-09-22). Zero
  semantic-plausibility checking.

  **Practical consequence for this spec: phase 1's audit of English
  content only needs to touch `lesson-bank.ts`'s copy.** Consolidation
  is explicitly *not* part of the audit — see below.
- `src/data/curriculum-consistency.test.ts` — CI-enforced structural
  checks (duplicate ids, out-of-range answers, duplicate choice text,
  orphaned image refs, fill/reorder reconstructability). **Does not and
  cannot check semantic plausibility** — this spec's phase 1 is exactly
  the gap it leaves.

## Phase 1: Correctness audit

### Execution architecture

#### The id-stability constraint (read this before any content edit)

Question and lesson ids are **index-derived**, not content-derived:
`packQuestions` emits `${pack.id}q${i}` per line and `buildLevel` groups
them into `${pack.id}l${n}` lessons at 5 questions each.
`ARCHITECTURE.md` records that **all users' review-item ids are keyed
against `lessonId:questionId`**.

Therefore: **adding or removing a line in a pack's `data` shifts every
subsequent question's id and re-groups lessons**, silently repointing
real users' saved review items and lesson-completion records at
different content.

This makes the audit's default edit shape a hard rule:

- **Default: edit lines in place.** Rewrite a bad distractor pool entry,
  fix a typo, reword a prompt — keeping the pack's **line count and line
  order unchanged**. This preserves every id and is safe to do at scale.
- **Adding/removing lines is a deliberate, separately-planned change**,
  not something a subagent does casually mid-audit. If a pack genuinely
  needs a line added or removed, the subagent logs it as a proposed
  structural change and leaves the data alone; those get batched and
  decided together, with the id/progress impact assessed once rather
  than 60 times.
- The consistency test does **not** catch this (it validates structure,
  not id stability across versions). A pack-level id-parity check —
  snapshot every generated `lessonId:questionId` before the audit,
  diff after — is a required part of phase 1's tooling, not optional.

#### Steps

1. **`pickDistractors` consolidation is explicitly NOT part of this
   audit.** `ARCHITECTURE.md` states that consolidating English onto
   `bank-engine.ts` "needs its own careful pass confirming lesson/unit
   id output is byte-for-byte identical before/after, **not a rider on
   an unrelated bug fix**." That warning applies exactly as much to a
   content audit. English's audit touches only `lesson-bank.ts`'s copy;
   consolidation stays a separate tracked piece of work, done on its own
   with its own id-parity proof. (An earlier draft of this spec made
   consolidation step 1 of the audit — that was wrong for this reason.)
2. **Write contention is real and must be designed around.**
   `lesson-bank.ts` is a single 3,449-line file holding *every* level's
   packs, so 5 subagents cannot simply "each fix their level" in
   parallel — they would be concurrently editing one file. Instead:
   subagents run in parallel for the **read-only audit** (each reads its
   level's packs and produces a findings report with concrete
   per-line proposed edits), and the **coordinator applies the resulting
   edits serially** to `lesson-bank.ts`. This keeps the expensive part
   (reading and judging 2,721 questions) parallel while keeping writes
   conflict-free and reviewable as coherent per-level commits.
   The hand-written content (`curriculum.ts`, `levels.ts`) is partitioned
   the same way, by the level each unit declares.
3. Any shared-code change (e.g. a part-of-speech plausibility layer in
   `pickDistractors`, if content-only pool curation turns out to be
   insufficient — see "Open question" below) follows
   `superpowers:test-driven-development` and lands separately from
   content edits.
4. **Findings log**: every finding and every applied edit is recorded in
   `docs/superpowers/english-content-audit-log.md` — a **committed**
   path. (`docs/v5-kickoffs/` and `docs/BACKLOG.md` are both gitignored;
   putting the audit record there would make the entire record of what
   changed across 2,721 questions invisible to review. An earlier draft
   of this spec made that mistake.) The log is the record for later
   spot-review, not a pre-merge approval gate — fixes are applied
   directly, per the account owner's explicit ask for thorough
   subagent-driven work at this scale.
5. After each subagent's pass: re-run the **scoped** consistency test —
   `bun run vitest run src/data/curriculum-consistency.test.ts` — never
   the full suite (`bun run vitest run` with no args has hung repeatedly
   in this Windows sandbox under accumulated process load; see
   `ARCHITECTURE.md`'s "Known rough edges").
6. **Closing step, after all 5 partitions merge**: run
   `scripts/seed-curriculum-db.ts` against the target Supabase project
   and `scripts/export-ios-content.ts`, then confirm with the account
   owner whether a new iOS build is being cut. Fixing source without
   this step leaves the reported bug live in production — the DB seed
   step is manual and known to drift (`ARCHITECTURE.md` rough edges),
   and iOS has no other way to pick up content changes short of a new
   build.

### Audit checklist

Applied per-question, not spot-checked, across each subagent's
partition:

1. **Distractor plausibility** — same part of speech and semantic
   domain as the correct answer; not arguably *also* correct (no
   accidental double-answer); genuinely wrong once the topic is known.
2. **Prompt clarity** — exactly one defensible correct answer as
   worded; pair-kind prompts (`template + left word`) read as a
   natural, grammatical phrase; cloze blanks have enough context to be
   answerable.
3. **Explanation accuracy** — factually and grammatically correct;
   where `audioText` exists, any explanation referencing "the audio"
   must match `audioText` verbatim.
4. **Difficulty/level labeling** — a pack's assigned CEFR level matches
   its actual vocab/grammar difficulty. **Flag-only, never fixed
   in-pass**: re-leveling a pack moves it between levels, which changes
   unit numbering and lesson grouping and therefore churns ids (see the
   id-stability constraint above). Mis-leveled packs are logged for a
   batched decision, not silently moved.
5. **Typos/grammar/spelling consistency** — including British vs.
   American spelling consistency across the course (existing content
   leans British, e.g. "Colours" — flag American spellings as
   inconsistencies unless told otherwise).
6. **Asset correctness** — `imageKey`/`audioText` are *semantically*
   right for the question, not just structurally valid (the existing
   consistency test already catches orphaned refs; this is the semantic
   layer on top).
7. **Tone/cultural appropriateness** — no region-narrow assumptions
   presented as universal, no stereotypes, tone consistent with the
   pack's register and CEFR level.

Anything found outside this list is still logged and fixed — this is
the concrete baseline, not a ceiling.

**Open question, deliberately deferred to the subagents' actual
findings**: whether `pickDistractors` itself needs a semantic-
plausibility layer (e.g. POS-matching) beyond per-pack pool curation.
The `compromise` library is already a dependency (used by the
generative-content pilot), but that pilot's own findings recorded real
false-positive issues with its contextual tagging — don't copy an
approach already found to be a regression there. Decide this only after
seeing how much the per-pack pool-curation pass alone fixes.

### Phase 1 exit criteria

"Genuinely done" is checkable, not a judgement call. All of these must
hold:

1. Every pack in `lesson-bank.ts` and every hand-written unit in
   `curriculum.ts` / `levels.ts` has an entry in the audit log —
   including packs where the finding was "no issues found." Coverage is
   provable by enumeration, not by sampling.
2. `curriculum-consistency.test.ts` passes (scoped run).
3. The id-parity check shows **zero** unintended `lessonId:questionId`
   changes; any intended ones are explicitly listed and accepted.
4. Structural changes deferred during the audit (line add/remove, pack
   re-leveling) are triaged — each either applied deliberately or
   explicitly declined, none left in limbo.
5. `scripts/seed-curriculum-db.ts` and `scripts/export-ios-content.ts`
   have both been run, and the iOS build question has been answered.

## Phase 2: Expansion

Only starts once phase 1 meets the exit criteria above.

### Target scope

**~1,000 English lessons, roughly double the current 534** — agreed
with the account owner as the real target, not an arbitrary round
number. At the engine's fixed 5 questions/lesson and ~25 lines/pack (5
lessons per pack), that is **roughly 90+ new packs**, or ~2,300
additional questions.

That volume is the reason the new types and the generative pipeline
both matter here: hand-authoring 90 packs to the quality bar phase 1
just spent its entire effort establishing is the dominant cost, and
`src/data/generative/` (PR #76, English-only) exists specifically to
reduce that burden. Expansion should lean on it where its known limits
allow, rather than defaulting to all-hand-authored packs — while
holding every generated pack to the same phase 1 audit checklist before
it ships. Its documented limitations are real and must be respected;
see `docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md`.

### New lesson types

#### 1. Listening comprehension — first-class type, not folded into MC

An `audioText` field already exists on `mc` questions
(`src/lib/speech.ts` plays it via the Web Speech API), but is used in
only 3 hand-written questions and zero of the 534 generated lessons.
Rather than quietly reusing that mechanism, this ships as a genuine new
type so it reads as distinguished, not a hidden variant of MC:

- New `type: "listening"` variant in the `Question` union
  (`curriculum.ts`): same shape as `mc` (`choices`, `answer`,
  `explanation`) plus a required `audioText`.
- **Web** (`lesson.$id.tsx`): a distinct screen — large play/replay
  control, choices visually led by the audio control rather than
  looking like an ordinary MC card; a "Listening" badge on both the
  in-lesson screen and the lesson card in the unit list.
- **iOS** (`LessonPlayerView.swift`): a new case in the question-
  rendering switch, using `AVSpeechSynthesizer` (the native equivalent
  of `speech.ts`) with the same distinguishing treatment.
- **Engine**: `packQuestions`/`buildLevel` gain a `kind: "listening"`
  pack option; `reshuffleQuestion` and web's `checkAnswer` both get a
  `"listening"` case (grades like `mc` — the distinction is
  presentation, not grading); `curriculum-consistency.test.ts` gets a
  case requiring non-empty `audioText` wherever `type === "listening"`.
- Content: dedicated listening packs authored in phase 2, not just
  relabeling existing MC questions — same subagent-per-level pattern as
  phase 1.

#### 2. Speaking/pronunciation practice

Real reusable infrastructure already exists: `/api/stt` calls Deepgram
and returns `{ text, confidence }`, already used by
`converse_.$scenarioId.tsx` (web, inline `getUserMedia` +
`MediaRecorder` hold-to-record) and `ConversationView.swift`'s
`TurnRecorder` class (iOS, wraps `AVAudioRecorder`). Neither recording
implementation is currently extracted/shared — this is the moment to do
that rather than adding a third copy.

- New `Question` type `"speak"`: `prompt` (what to say), `answer`
  (expected phrase), `explanation`.
- Flow: hold-to-record (extracted shared logic on each platform) →
  POST to `/api/stt` → `{ text, confidence }`.
- **Correctness** = normalized transcript-vs-`answer` match via the
  shared grading utility (below) — this alone gates hearts/XP.
- **Confidence is feedback only, never gating.** Shown as supplementary
  UI feedback ("said correctly, but try speaking more clearly") but
  never costs a heart or blocks progress — it conflates accent/mic
  quality/background noise with actual mispronunciation, and gating on
  it risks real false negatives.

#### 3. Free-form writing/translation

No existing free-text semantic grading in the app (`grade-review` is
spaced-repetition scheduling, not answer-checking; current fill/reorder
grading is exact-match only). Reuses the project's existing NVIDIA-
backed chat completion helper (`resolveNvidiaChatModel`, used by
`/api/analyze-weaknesses`) and shared `consumeQuota(request, kind)`
rate-limiting (`ai-quota.server.ts`) rather than introducing a new
vendor or quota mechanism.

- New `Question` type `"translate"`: `prompt` (source phrase/
  instruction), `acceptableAnswers: string[]` (curated valid
  phrasings), `explanation`.
- **Grading flow (hybrid, local-first)**:
  1. Normalize the submission (trim, lowercase, collapse whitespace,
     strip terminal punctuation) and compare against normalized
     `acceptableAnswers`. Exact match → correct, zero vendor cost.
  2. No local match → new `/api/grade-translation` route (same file-
     route + `consumeQuota` pattern as `/api/stt`/
     `/api/analyze-weaknesses`), calls the existing NVIDIA chat model
     with the prompt, acceptable answers, and submission; returns
     correct/incorrect + a one-line reason.
  3. The LLM verdict is **not** written back into `acceptableAnswers`.
     No auto-expanding the accepted-answer list from live grading —
     that's a separate, deliberate content-curation decision if ever
     wanted, not implicit here (YAGNI).
- New `"translate"` quota kind in `ai-quota.server.ts` alongside
  existing `"stt"`/`"chat"` kinds, so translation grading has its own
  budget rather than sharing conversation scenarios' budget.
- Content-authoring implication: every `"translate"` question needs a
  curated `acceptableAnswers` list up front, not a single answer
  string.

#### Shared grading utility

The normalize + hybrid-match logic (Section 3, step 1-2 above) is built
once and used by **both** `"speak"` and `"translate"` grading — not
duplicated. Lives alongside `bank-engine.ts` or as its own module,
ported to Swift for iOS (`LearnWithAlphonsoKit`) rather than
re-implemented ad hoc there.

#### Offline behavior

Speaking and translation grading require a live network call
(`/api/stt`, and `/api/grade-translation`'s LLM fallback) — unlike
MC/fill/reorder/listening, which are fully gradeable offline once
lesson JSON is loaded. This app is deliberately offline-first on iOS
(`ARCHITECTURE.md`, with some already-accepted unsolved edge cases), so
this is not broken quietly:

- **When offline, speaking/translation questions are skipped** (or
  substituted with a same-pack MC/fill/reorder/listening question when
  available) during lesson play. Every lesson stays playable offline;
  the question mix simply varies slightly online vs. offline.
- Both platforms' lesson-player logic needs to filter by type when
  connectivity is down; iOS's existing offline-first plumbing
  (`SyncQueueStore.swift` et al.) needs to expose connectivity state to
  the lesson player for this filtering.

## Testing

**Phase 1:**
- Scoped `vitest` runs per touched file only (never the full suite).
- `curriculum-consistency.test.ts` re-run after each level's fixes,
  plus its new `"listening"`-requires-`audioText` case (added when
  phase 2 lands the type, but the test itself is written defensively
  now if phase 1 work touches the same file).

**Phase 2:**
- Unit tests for the shared grading utility (normalization + hybrid
  match) independent of any network call.
- `/api/stt` already has `stt.test.ts`; new `/api/grade-translation`
  gets an equivalent route test, mocking the NVIDIA call rather than
  hitting the real vendor in CI.
- iOS: `LearnWithAlphonsoKitTests` gets equivalent coverage for the
  ported grading logic.

## Explicit non-goals

- French and Spanish content: untouched, this task is English-only.
- Auto-expanding `acceptableAnswers` from LLM-graded submissions: not
  implemented (YAGNI) — a future, deliberate decision if ever wanted.
- Confidence-gated speaking correctness: not implemented — confidence
  is feedback only.
- A semantic-plausibility layer inside `pickDistractors` itself: not
  committed to up front — only added if phase 1's actual findings show
  per-pack pool curation alone isn't enough.
