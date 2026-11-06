# Content playbook

**Required reading before any change to learner-facing content** in the English, French or
Spanish courses: lesson questions, explanations, word cards, unit and lesson titles, placement
questions, story campaigns, speaking scenarios and podcast quizzes. Read it before you write the
first line, not before you open the PR.

Every rule here exists because breaking it shipped a defect. The history is in
`docs/distractor-policy.md`, `docs/content-panel/`, and the "Content guards" table in `AGENTS.md`.

## 1. The workflow, in order

1. **Snapshot the content before you edit it.**
   `bun scripts/content-review/run.ts snapshot` saves a hash of every learner-facing item to
   `.content-review/snapshot.json` (git-ignored).
2. **Write the content** by the rules in sections 2 to 4.
3. **Run the gates** you touched (section 5). A failing content gate is almost certainly right.
4. **Run the panel on what you changed** (section 6). This step is mandatory.
5. **Re-export the bundles** (section 7).
6. **Check the definition of done** (section 8), then open the PR, linking the panel report.

## 2. Rules that hold for every item

- **Ids are review history.** Lesson question ids are index-derived, and learners' spaced
  repetition is keyed on them. Fix a question by replacing it in place, 1:1. Append, never insert
  or delete. `id-parity.test.ts` holds this. Placement question ids are not review keys, so placement
  content may be rewritten (ARCHITECTURE.md, "Placement content is safe to rewrite").
- **One correct answer.** The sentence, a bracketed clue, the subject or a picture rules every
  other option out. If two options fit, add a clue or change an option.
- **Wrong options earn their place.** `docs/distractor-policy.md` applies in full: same slot,
  tempting, and clearly wrong because of something in the question. Never take wrong options from
  the other lines of a pack: they are other words, often another kind of word.
- **No giveaways.** No option that alone matches the bracketed hint or the ending, no English gloss
  that names the answer, no prompt that contains it.
- **Level.** Vocabulary and grammar fit the unit's CEFR level.
- **Explanations** say why THIS answer is right for THIS sentence, in one or two plain English
  sentences, and quote the answer in double quotes (`"parle"`). The generated
  `"x" is correct here. <note>` line is a defect; never add a new one. The quotes are load-bearing:
  the save-a-word feature (`src/lib/course-language-spans.ts` and its Swift and Kotlin twins) only
  offers course-language text that the explanation quotes.
- **Varieties.** English: British spelling and usage. French: standard European French.
  Spanish: Latin American (tú/usted/ustedes, never vosotros or vos; seseo and yeísmo assumed).
- **Conversation prompts.** The English `systemPrompt` of a scenario or campaign scene is frozen:
  older app builds send it verbatim and `/api/chat` rejects anything not in `ALL_SYSTEM_PROMPTS`.
  Changing a French or Spanish prompt means adding the old text to
  `src/data/legacy-system-prompts.fixtures.json` in the same PR.

## 3. Rules per item type

| Type                   | Rules                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mc`                   | Three or four options, one right. The answer index stays put when options change. Options are the same kind of word as the answer.                                                                                                           |
| `fill`                 | Exactly one `___`. The answer is in the bank. French and Spanish hand-written lines take written wrong options (`src/data/romance-cloze-options.ts`), with a clue where two words fit.                                                       |
| Conjugation drill      | Wrong options are other persons of the SAME verb in the SAME tense (`src/data/romance-conjugation.ts`); the subject is always named; French elides `Je` before a vowel. Add the pack to `CONJUGATION_DRILLS` and its verbs to the paradigms. |
| `listening`            | The prompt never restates the audio. No option sounds like the answer (homophones, and in Spanish seseo/yeísmo/b-v mergers).                                                                                                                 |
| `translate`            | The left side describes the idea without giving the sentence away. The first accepted answer is the canonical one; list every natural wording you would accept.                                                                              |
| `reorder`              | The tokens are exactly the answer's words. Only one natural order.                                                                                                                                                                           |
| `speak`                | Round-trip the line through the course's spoken-answer normaliser (`spoken-answer-fr.ts`, `spoken-answer-es.ts`) before shipping it.                                                                                                         |
| Word card              | `meaning`: at most 8 words of simple, true English for the term as used in the lesson. `example`: a natural sentence using it with that meaning. Never the quiz explanation (`vocab-meanings.test.ts`).                                      |
| Unit and lesson titles | Short, accurate, in the app's UI language unless the course shows them in the target language.                                                                                                                                               |
| Placement              | Nine per band, three drawn. Never a duplicate of lesson content (`placement-lesson-overlap.test.ts`). Same option rules as lessons.                                                                                                          |
| Campaign or scenario   | Target-language title, English blurb, persona name present in the prompt, register consistent with the opener. No safety text in the prompt (the server adds it).                                                                            |
| Podcast quiz           | Answerable from the audio alone; `evidence` is a verbatim transcript excerpt. Regenerate the seed with `bun scripts/gen-podcast-quiz-migration.ts` (a new migration, versioned after the last).                                              |

## 4. The checklist reviewers use (and authors should apply first)

The full review and the per-PR check give these lines to the reviewing models word for word
(`src/lib/content-review/rubric.ts`; a test fails if the two drift).

**Every language**

- One correct answer: exactly one option is right, and the sentence, a bracketed clue, the subject or a picture rules every other option out.
- The KEY is right: the marked answer is correct, natural and at the stated level.
- No absurd options: every wrong option is the same kind of word as the answer and something a real learner might pick.
- No giveaways: the answer cannot be found without the skill being tested (the only option matching a bracketed hint, the only option with the right ending, an English gloss that names it, a prompt that contains it).
- Level: vocabulary and grammar fit the stated CEFR level; an A1 item never needs B2 grammar.
- Explanation: says WHY this answer is right for THIS sentence (the rule or the clue), in plain English, in one or two sentences, and quotes the answer in double quotes. A generic line that would fit any question is a defect.
- Word cards: the meaning is a short, true English gloss of the term as used in the lesson; the example is a natural sentence that uses the term with that meaning.
- Instructions and titles: clear, short, correct; English UI text is plain and friendly.
- Conversation instructions (scenarios, story scenes): the persona, register and level they ask for are consistent with the opening line and with each other.
- Spelling and accents are correct, including capitals and punctuation in the target language.

**English**

- Variety: British English spelling and usage (colour, favourite, flat); flag a US-only form only when it is the key or the only natural option.
- Register: everyday neutral English unless the item sets a formal or casual scene.
- Phrasal verbs, articles and prepositions: the classic learner traps; a second preposition that is also idiomatic is a second answer.

**French**

- Variety: standard European French; Quebec-only or strongly regional usage is 'regional'.
- Register: tu or vous must fit the situation (a stranger, a shop, a customer: vous; a friend, family, a child: tu) and must not switch within one item or one conversation.
- Elision and liaison in writing: j'ai, l'ami, qu'il; never 'Je ai'.
- Agreement: gender and number on articles, adjectives and past participles (être verbs, preceding direct objects).
- Typography: a space before ? ! : ; and inside « » is accepted; do not flag spacing alone.

**Spanish**

- Variety: Latin American Spanish: ustedes, never vosotros or vos; seseo means s/z/c sound the same; flag Spain-only words when a Latin American learner would be misled.
- Register: tú or usted must fit the situation (a stranger, a shop, an official: usted; a friend, family: tú) and must not switch within one item or one conversation.
- Accents and opening marks: tildes that change meaning (él/el, tú/tu, sí/si, qué/que in questions) and ¿ ¡ are required.
- Agreement: gender and number on articles and adjectives; ser vs estar; the subjunctive where the trigger requires it.
- Listening: under seseo and yeísmo two spellings can sound the same; a listening option that sounds like the answer is a second answer.

## 5. The gates, and how to run them

Run only the files you touched; the machine is short of memory (`bunx vitest run <file> ...`).
The "Content guards" table in `AGENTS.md` says what each holds. The ones content changes trip most:

| Change                    | Run                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Any lesson question       | `src/lib/id-parity.test.ts`, `src/data/curriculum-consistency.test.ts`, `src/data/question-variety*.test.ts`       |
| English options           | `src/data/distractor-gate.test.ts`, `src/data/also-correct.test.ts`, `src/data/english-distractor-quality.test.ts` |
| French or Spanish options | `src/data/romance-options.test.ts`, `src/data/romance-conjugation.test.ts`                                         |
| Listening                 | `src/data/lesson-bank-listening.test.ts`                                                                           |
| Word cards                | `src/data/vocab.test.ts`, `src/data/vocab-meanings.test.ts`                                                        |
| Explanations              | `src/lib/course-language-spans.test.ts`, `src/lib/save-word-spans-fixture.test.ts`                                 |
| Placement                 | `src/data/placement*.test.ts`                                                                                      |
| Campaigns, scenarios      | `src/data/campaigns*.test.ts`, `src/data/scenarios.test.ts`, `src/data/legacy-system-prompts.test.ts`              |
| Podcast quizzes           | `src/data/podcast-quizzes.test.ts`                                                                                 |
| This pipeline             | `src/lib/content-review/`                                                                                          |

If you fix a ratcheted defect, lower the ratchet number in the same commit. Never raise one.

## 6. Run the panel on what you changed (mandatory)

After the gates pass, and before the PR:

```sh
bun scripts/content-review/run.ts check                       # dry run: how many items changed, worst-case cost
bun scripts/content-review/run.ts check --go --name <branch>  # Claude Sonnet and Mistral read only the changed items
```

- It compares every item with the snapshot from step 1 and sends only the changed or new ones,
  synchronously, to both reviewers with the checklist above.
- Cost: a few cents for a typical PR. It refuses to start when the worst case is above
  `--max-usd` (default US$2), and refuses more than 300 items (that is a review round: use the
  batch phases in section 9).
- Keys: `ANTHROPIC_API_KEY` and `MISTRAL_API_KEY`, or `ANTHROPIC_API_KEY_FILE` and
  `MISTRAL_API_KEY_FILE`, or the git-ignored `.content-review/config.json`. Never paste a key or a
  local path into a committed file.
- It writes `docs/content-review/checks/<branch>.md`. **Fix or answer every row**, re-run until
  it is clean or every remaining row has a written reason, commit the report, and link it in the PR
  body. A disagreement you overrule needs one line saying why.

## 7. Export the bundles

The iOS and Android apps bundle content; they never fetch it.

```sh
bun scripts/export-ios-content.ts       # ios/.../Resources and the Kit's Resources
bun scripts/export-android-content.ts   # android/.../assets/content
bun scripts/export-save-word-fixtures.ts  # only when the save-word span rules or fixture inputs change
```

CI fails a PR whose bundles are stale ("Bundled iOS content is up to date", and the Android
equivalent). Commit the exported files with the content change.

## 8. Definition of done

A content change is done when all of these are true:

- [ ] The rules in sections 2 and 3 hold for every changed item; no id moved.
- [ ] Every gate in section 5 for the touched content passes locally, ratchets lowered where you fixed something.
- [ ] `run.ts check` ran on the final content; its report is committed and linked in the PR body; every row is fixed or answered.
- [ ] The iOS and Android bundles are re-exported and committed.
- [ ] If an answer key changed: the PR says so, because the server grades lessons from the database tables seeded from these files (`supabase/functions/complete-lesson`), and the owner must run `bun scripts/seed-curriculum-db.ts` (service-role key) after the merge.
- [ ] A `docs/` or `AGENTS.md` number you changed (counts, ratchets) is updated in the same PR.
- [ ] The PR title is neutral product language.
- [ ] CI is green.

## 9. The full review (the one-time job that closed the content backlog)

`scripts/content-review/run.ts`, logic in `src/lib/content-review/`. Run once over every item,
under a **US$99 hard cap**, owner-approved. The cost plan is `docs/content-review/cost-plan.md`.

| Phase            | Command                                                                                     | What it does                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Inventory      | `inventory`                                                                                 | Every learner-facing item, EN/FR/ES, with a stable id and its source file.                                                                                                                     |
| 2 Gates          | (inside `inventory`)                                                                        | Deterministic flags: generic explanation, B1-C1 drill options, B1-C1 cloze pools, named second answers.                                                                                        |
| 3 Full pass      | `submit review --go`, then `collect --go`                                                   | Claude Sonnet reads every item through the Message Batches API (50% off, the checklist cached).                                                                                                |
| 4 Second opinion | `submit second --go`                                                                        | Mistral (direct, batch) reads every Claude flag plus a seeded 10% of the passed items, which measures how much Claude misses.                                                                  |
| 5 Judge          | `submit judge --go`, then `route`                                                           | Claude Opus decides every flagged item: keep, fix (a structured patch), or owner. `route` checks every patch against the constraints and writes the overlays, the owner list and the refusals. |
| 6 Rewrites       | `submit rewrite-explanation`, `submit rewrite-cloze`; drills through the conjugation engine | Generic explanations (Sonnet), B1-C1 cloze options (Opus), B1-C1 drills (engine, no model).                                                                                                    |
| 7 Verify         | `submit verify`, `submit blind-sonnet`, `blind-mistral`, `blind-judge`, `report`            | A fresh read of every changed item, then a blind random sample of 300 (100 per course) settled by Opus: the published error rate with its 95% interval.                                        |
| 8 Delivery       |                                                                                             | PRs by language and level, each CI-green, bundles re-exported.                                                                                                                                 |
| 9 Closure        |                                                                                             | Every backlog content item listed as closed, with evidence.                                                                                                                                    |

**Money.** Only `submit --go` spends, and only with `CONTENT_REVIEW_APPROVED=yes`. Before each
submission the ledger (`src/lib/content-review/ledger.ts`) reserves its worst case (every input
byte a token, every cached prefix a cache write, `max_tokens` billed in full), writes it to disk,
and refuses the submission if that would pass US$99. Results settle the reservation at the actual
cost. Phases before verification leave US$12 untouched so the measurement is always affordable.
The ledger lives in `.content-review/ledger.json` and is mirrored to
`~/.lwa-content-review/ledger.json` (or `CONTENT_REVIEW_LEDGER_MIRROR`); deleting either loses
nothing, and a missing ledger next to a started run is refused, never recreated empty.

**Where fixes land.** `run.ts route --apply` merges every checked fix into `src/data/review-fixes/<course>.json`, which `src/data/review-fixes.ts` applies at build time to questions, word cards, lesson and unit titles and placement (a fix that matches nothing throws). Campaign, scenario and podcast fixes are listed in `.content-review/manual-fixes.json` and applied in their source files by hand.

**What a fix may change** (`src/lib/content-review/fixes.ts`): not ids, types, option counts or the
answer's position; the answer only on a reviewed wrong-key ruling; explanations must quote the
answer; English conversation prompts never. A refused fix goes to the owner list with its reason.

## 10. Proposed: a gate for unreviewed content (not built yet)

After the full review every item has a verdict. The closure PR can then commit
`docs/content-review/reviewed.json` (item id to content hash, written only by `run.ts` from a
verdict file), with a test that fails when an item's current hash is not in it: content changed
without a review record. `run.ts check` would update the entries it reviewed. It is deliberately not
built before the full review, because today it would fail on every item.
