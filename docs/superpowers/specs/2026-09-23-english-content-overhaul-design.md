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

- `src/data/curriculum.ts` — a small number of hand-written questions
  directly, plus `getCourse()`'s assembly of units. Already has two
  optional per-question fields used sparingly: `imageKey` (2 uses) and
  `audioText` (3 uses, all hand-written).
- `src/data/lesson-bank.ts` — the bulk of English content: ~25-line
  `Pack` objects (`kind: "pair" | "cloze"`), expanded by
  `bank-engine.ts`'s `packQuestions()`/`buildLevel()` into the 534
  generated lessons. This is where phase 1's audit spends most of its
  time.
- `src/data/bank-engine.ts` — the shared question-compilation engine
  used by every course (English, French, Spanish). `pickDistractors()`
  (~line 30) is **purely mechanical**: pool = other answers within the
  same pack, walked from a hashed seed, deduped case-insensitively (PR
  #75, 2026-09-22). Zero semantic-plausibility checking. **Duplicated**
  in `lesson-bank.ts` and `bank-engine.ts` (known tech debt, `docs/
  BACKLOG.md` §4).
- `src/data/curriculum-consistency.test.ts` — CI-enforced structural
  checks (duplicate ids, out-of-range answers, duplicate choice text,
  orphaned image refs, fill/reorder reconstructability). **Does not and
  cannot check semantic plausibility** — this spec's phase 1 is exactly
  the gap it leaves.

## Phase 1: Correctness audit

### Execution architecture

1. **Consolidate `pickDistractors` first**, before any partition starts,
   so every subagent works against one shared, already-improved copy
   rather than each patching two duplicates independently.
2. **5 parallel subagents, one per CEFR level** (A1, A2, B1, B2, C1) —
   each audits and fixes directly across its ~100 lessons against the
   checklist below, logging every change to a shared findings log
   (`docs/v5-kickoffs/english-content-audit-log.md`, not committed to
   the design doc itself since it's a working log, not a spec).
   Fixes are applied directly, not staged for a separate approval wave —
   the account owner has explicitly asked for thorough subagent-driven
   work at this scale, with the log serving as the record for later
   spot-review, not a pre-merge gate.
3. Any shared-code change (further `pickDistractors` tuning, e.g. a
   part-of-speech plausibility layer if content-only pool curation turns
   out to be insufficient — see "Open question" below) follows
   `superpowers:test-driven-development`; content-only fixes (pool
   curation, wording, explanations) are their own reviewable diffs.
4. After each subagent's pass: re-run the **scoped** consistency test —
   `bun run vitest run src/data/curriculum-consistency.test.ts` — never
   the full suite (`bun run vitest run` with no args has hung repeatedly
   in this Windows sandbox under accumulated process load; see
   `ARCHITECTURE.md`'s "Known rough edges").
5. **Closing step, after all 5 partitions merge**: run
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
   its actual vocab/grammar difficulty; flag mis-leveled lessons
   relative to siblings in the same unit.
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

## Phase 2: New lesson types

Only starts once phase 1 is genuinely complete (source fixed, DB
re-seeded, iOS content re-exported).

### 1. Listening comprehension — first-class type, not folded into MC

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

### 2. Speaking/pronunciation practice

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

### 3. Free-form writing/translation

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

### Shared grading utility

The normalize + hybrid-match logic (Section 3, step 1-2 above) is built
once and used by **both** `"speak"` and `"translate"` grading — not
duplicated. Lives alongside `bank-engine.ts` or as its own module,
ported to Swift for iOS (`LearnWithAlphonsoKit`) rather than
re-implemented ad hoc there.

### Offline behavior

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
