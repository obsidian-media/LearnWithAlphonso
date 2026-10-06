# Save-any-word -- design

**Date:** 2026-10-05. **Status:** approved by the owner (design in chat, then
the written spec). **Phases 1-2 are implemented:** backend merged as PR #211 (live
and verified), iOS on Hector replies as PR #212, Practice and Campaign replies
in the phase 2 PR, and **phase 3** (English-course lesson explanations and
podcast transcripts) in its own PR. **Phase 4 (web)** is built in its own PR (same route and row shape, no new backend; Hector has no web surface). See the plan for what was built
and `docs/BACKLOG.md` section 0.0-ac #4 for the deferred follow-ups.
**Path:** architectural (new item source, new endpoint, new migration, new UI
on two platforms). **Order:** iOS first, then web.

## 1. Intent and success

A learner reading real language (a Hector reply, a Practice conversation, a
lesson, a podcast transcript) meets a word they don't know. They tap it, save
it with the sentence it came from, and it comes back later in the normal
review queue as a card, scheduled by the existing SM-2 engine.

Success looks like:

- Tapping a word and saving takes one tap plus a short wait, and shows the
  meaning immediately so the learner learns it at save time, not only at review.
- Saved words appear in the existing Review tab as multiple-choice cards and
  are graded server-side like every other review item.
- No new way to farm XP, leaderboards or the AI bill.
- Nothing about it blocks, interrupts or changes any existing flow.

## 2. Decisions already made (owner)

| Question | Decision |
|---|---|
| Where does the meaning come from? | One NVIDIA call when the learner taps Save, stored on the card forever. |
| Card type | Multiple choice on the meaning, with the 3 wrong meanings generated in the same call. |
| Cost control | A new `define` kind with its **own** daily budget (40/day) and per-minute limit (10/min). |
| Surfaces | Hector replies, Practice/Campaign replies, lesson text, podcast transcripts -- built in phases. |
| Platform order | iOS, then web. |
| Defaults accepted with "approved" | Saving from Hector is Pro-only *because the Hector screen is*; Practice is free. A cap of 500 saved words per learner per course. The saved sentence is shown on the card. |

## 3. Non-goals (YAGNI)

- No flip-card / self-rated mode (the server cannot verify a self-rating).
- No dictionary, no audio for saved words, no editing a saved word.
- No saving of whole phrases: one word at a time.
- No lists or folders of saved words; they live in the Review queue.
- No new review screen. The existing one renders the card.

## 4. Architecture

### 4.1 Data: a third `review_items` source

`review_items` already supports self-contained rows for the Hector weakness
feature: `source`, `prompt`, `choices`, `answer_index`, `explanation`, written
by the server with `supabaseAdmin` after validating the caller's token
(`src/routes/api/analyze-weaknesses.ts`). A saved word is the same shape.

One migration (version later than `20260930170000`):

- Widen the `source` check to `('lesson', 'weakness', 'saved_word')`.
- Add nullable columns `saved_word text`, `saved_context text`.
- Replace the `weakness_shape_matches_source` constraint so that
  `source = 'saved_word'` requires `saved_word, saved_context, prompt,
  choices, answer_index` to be non-null; the `weakness` and `lesson` branches
  stay exactly as they are.
- A saved-word row uses `lesson_id = 'savedword'`, `level = 'A1'` (what the
  weakness rows do with `'weakness'`/`'A1'`) and
  `item_key = 'savedword:' || <16 hex chars>` so it satisfies the existing
  `^[a-z0-9]+:[a-z0-9]+$` item-key rule. The hex is the first 16 characters of
  SHA-256 over `<course>:<lowercased word>`, so the same word in the same
  course is one row (the existing `(user_id, item_key, language)` uniqueness).
- Same migration: `CREATE OR REPLACE` **both** `consume_ai_quota` and
  `consume_ai_rate_limit` with the `define` kind (40/day, 10/minute). Both
  functions return "not allowed" for any kind they do not list, which is the
  silent failure the translate migration (`20260926020000`) documents, so
  adding the kind to TypeScript alone would leave the feature dead.

Nothing else changes in storage. `review_items` already cascades on account
deletion and is already in the GDPR export tables; the existing drift test in
`account.functions.test.ts` covers that.

### 4.2 Backend: `POST /api/define-word`

A new TanStack Start API route, written like `analyze-weaknesses.ts` and
timed with the `stage-timer` from #205.

Request: `{ word, sentence, course }`. Validation: `word` is 1-40 Unicode
letters, apostrophes or hyphens after trimming; `sentence` is 1-300 characters
and must contain the word (case-insensitive); `course` is `en | fr | es`.
Anything else is a 400 with no AI call.

Order of operations (cheap and free checks first):

1. Resolve the user from the bearer token (claims), as `analyze-weaknesses`
   does. No token: 401.
2. Compute the item key. If a row already exists for it, return
   `{ alreadySaved: true, explanation, ... }` built from the stored row (the
   meaning and translation live in `explanation`) -- **no quota, no AI
   call** -- so re-tapping a saved word is free.
3. If the learner already has 500 `saved_word` rows for this course: 409
   `saved-word-limit`, no quota spent.
4. `consumeQuota(request, "define")` (the existing helper, extended with the
   new kind). Over the limit: 429 with the existing message shape.
5. Call NVIDIA (`resolveNvidiaChatModel()`), same transport conventions as
   `practice-generation.server.ts`: `AbortSignal.timeout(20_000)`, a
   `max_tokens` of 600 (the output is a few hundred characters of JSON, and
   that file's history shows a too-small cap truncating real output), and a
   logged duration.
6. Validate the model output strictly (section 4.3). Invalid: 502, **no row
   written**. The quota unit is spent, which is the honest cost of a call that
   returned something unusable.
7. Insert the row with `supabaseAdmin` and return it.

The route does not check Pro itself. The Save affordance exists only on
screens the learner can already reach (Hector is Pro-only; Practice is free),
and cost is bounded by the `define` quota, so a server Pro check would add a
RevenueCat round trip for no protection.

Consent: the word and sentence leave the device for NVIDIA, so the client
requires the existing AI-processing consent before calling the route (see 4.4).
The server cannot know consent, which is the same position as every other AI
route.

### 4.3 The model contract

The prompt gives the model the word, the sentence and the course language and
asks for JSON only:

```json
{ "meaning": "...", "translation": "...", "wrong": ["...", "...", "..."] }
```

`meaning` is a short explanation of the word as used in the sentence, in the
learner's UI language (English). `translation` is the word in English for a
French or Spanish course (and may repeat `meaning` for English). `wrong` are
three plausible but incorrect meanings of the same register and length.

The word and sentence are untrusted text (the sentence can come from an AI
reply or a user). They are sent as data in the user message, never as
instructions, and the output is only ever rendered as plain text. Validation
rejects the response unless: it parses as that shape; `meaning` is 1-160
characters; `wrong` has exactly 3 distinct entries, each 1-160 characters,
none equal (case-insensitively) to `meaning`.

The server builds the card, not the model:

- `prompt` = `What does "<word>" mean here?` followed by a new line and the
  sentence.
- `choices` = `meaning` plus the three `wrong`, shuffled server-side;
  `answer_index` = the position of `meaning`.
- `explanation` = `"<word>" means <meaning>.` plus the translation for
  French and Spanish. This is shown after answering, which is the second
  chance to learn the word.
- A short "AI-generated meaning" caption is shown in the save sheet, because
  the meaning can occasionally be wrong.

### 4.4 Grading and scheduling

`grade-review` (Edge Function) and web `gradeReview`
(`src/lib/review.functions.ts`) both branch on `row.source === "weakness"` and
compare `choices[answer_index] === answer`. Both change to treat `saved_word`
the same way. Correctness is therefore still re-derived on the server from the
stored key, never self-reported. SM-2 (`computeReviewOutcome`) is unchanged.
A retiring saved word does not write a `weakness_events` row; that stays
weakness-only.

`fetchDueReviews` on iOS and `getDueReviews` on web already select `source,
prompt, choices, answer_index, explanation`; saved words flow through them with
no query change.

### 4.5 iOS

Kit (testable in CI, not locally while the Windows test runner is blocked):

- `WordSegmenter`: pure function splitting a string into word and non-word
  segments (Unicode letters, with internal apostrophes and hyphens kept), so
  tapping is tested without UIKit.
- `SavedWordClient`: calls `/api/define-word` using the same transport as
  `AIConversationClient`, decoding the response and mapping 400/409/429/502 to
  distinct errors.
- `ReviewItem.isSelfContained`: true for `weakness` and `saved_word`; the
  review screen uses it instead of comparing against the string `"weakness"`.

App target:

- `TappableText`: renders a `Text` built from an `AttributedString` in which
  each word run carries a custom-scheme link, and an `OpenURLAction` on the
  environment turns a tap into "present the save sheet for this word". This
  keeps normal text layout, wrapping and Dynamic Type, unlike a custom flow
  layout of buttons.
- `SaveWordSheet`: shows the word and its sentence, a Save button, then the
  meaning and translation. States: idle, saving, saved, already saved, offline,
  no consent (offers the existing disclosure via `.aiDisclosureSheet` and
  carries on if declined), daily limit reached, 500-word limit reached, and
  failed (retry). It never blocks the screen underneath.
- `ReviewQueueView`: the `source == "weakness"` branch becomes
  `item.isSelfContained`, so the card renders with the existing code path.

### 4.6 Phasing

1. **Phase 1 (one PR):** migration, quota kinds, `/api/define-word`, grade
   changes, Kit pieces, `TappableText` and `SaveWordSheet`, adopted in Hector
   chat bubbles only. Backend deploys on merge but is inert until a client
   calls it.
2. **Phase 2:** Practice and Campaign reply bubbles.
3. **Phase 3:** lesson prompts and explanations, then podcast transcripts. At
   the start of this phase, confirm that an iOS transcript reader exists
   (the `podcast_transcripts` table does); if it does not, transcripts become
   their own item instead of widening this one.
4. **Phase 4:** web, reusing the route and the row shape unchanged.

**Phase 3 as built, and why it is narrower than written above (decision record,
2026-10-05).** A saved word is filed under a course and explained by the model as
a word OF THAT LANGUAGE, but lesson text mixes languages: in the French and
Spanish courses an explanation is English with French or Spanish words quoted
inside it, and a translate prompt is the other way round. Tapping "means" there
would file an English word under French. So lessons offer tap-to-save only in the
**English course**, only in the **explanation** (shown after answering, so it can
never give an answer away), enforced by `SavedWordPolicy.allowsSaving(inCourse:)`
in the Kit. Prompts, and the French and Spanish courses, wait until the app can
tell course-language text from interface text. Transcripts: an iOS reader exists
(`PodcastTranscriptSheet`); episodes are English (the podcast models carry no
language field), so a tapped transcript word is filed under `en`.

No iOS build is cut by any phase. Merging to main is allowed; shipping a build
is the owner's call.

## 5. Error handling and limits

| Case | Behaviour |
|---|---|
| Offline | Sheet explains it needs a connection; nothing is queued (the meaning is the point of the tap). |
| No AI consent | Sheet offers the disclosure; declining just closes it. |
| Already saved | Returns the stored meaning at no cost. |
| 40/day or 10/minute reached | 429; sheet says to try later. Reviewing existing saved words is unaffected. |
| 500 saved words | 409; sheet explains the limit. |
| Model output invalid or timeout | 502; sheet offers retry. No partial row. |
| Word not found in the sentence, or too long | 400 before any AI call. |

## 6. Testing

- Migration: the existing guard in `ai-quota.server.test.ts` already asserts
  every `QuotaKind` appears in the quota functions (adding `define` to
  `DAILY_LIMITS` is what makes it fail until the migration lands), but it checks
  the whole migration FILE, so it cannot tell which function lists a kind.
  `saved-word-migration.test.ts` pins the schema change, `define` 40/day and
  10/minute separately, and every EXISTING limit exactly as it is live (the
  latest `consume_ai_quota` has `stt` = 300; basing the new definition on the
  older translate migration would silently revert it to 60).
- Route: with `fetch` mocked, cover validation, already-saved short-circuit
  (no quota consumed), the 500 cap, quota refusal, a valid model response,
  each invalid model response (wrong count, duplicate, answer repeated,
  malformed JSON, timeout), and that no row is written on failure.
- Card building: shuffling keeps `answer_index` pointing at the meaning;
  prompt injection text in the word or sentence cannot change the stored shape.
- Grading: a `saved_word` row grades correct and incorrect through both
  `grade-review` and web `gradeReview`, and does not emit a weakness event.
- Kit: `WordSegmenter` (apostrophes, hyphens, accents, punctuation, empty),
  `isSelfContained`, `SavedWordClient` error mapping.
- Mutation-check each guard on the property it claims, per this repo's rule
  that its commonest defect is a test that cannot fail.
- App-target code is verified only by `ios-app-build`; the save sheet and tap
  behaviour need a device look.

## 7. Risks and open points

- **Cost.** One NVIDIA call per new word, bounded at 40/day/user by the new
  quota and skipped for repeats. Worth re-checking after real usage.
- **Meaning quality.** The AI can be wrong. Mitigated by the caption and by
  storing the meaning, so a bad card can be spotted; there is no edit or
  report flow in this version.
- **Inappropriate words.** The model might return unsuitable text for a
  sensitive word. Not filtered in this version; flag if it matters for the
  App Store age rating.
- **Transcripts on iOS** may not exist yet (Phase 3 check above).
- **Docs to update with the code:** CHANGELOG, ARCHITECTURE (review sources and
  the new route), AGENTS (the new route and the quota test), BACKLOG.
