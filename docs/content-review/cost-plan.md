# Full content review: cost plan (2026-11-06)

Produced by `bun scripts/content-review/run.ts plan`, which builds every phase's requests with the
same code the runner submits, from the real items and the real prompts. Nothing here called a paid
API. Hard cap: **US$99** across every phase and provider, enforced by the ledger
(`src/lib/content-review/ledger.ts`).

## Inventory (`run.ts inventory`)

17,196 learner-facing items.

| Kind                                     | English | French | Spanish |
| ---------------------------------------- | ------: | -----: | ------: |
| Question: multiple choice                |   1,375 |  1,393 |   1,588 |
| Question: fill-in                        |   1,344 |  1,287 |   1,087 |
| Question: listening                      |     336 |    125 |     125 |
| Question: reorder                        |     211 |      0 |       0 |
| Question: translate                      |     335 |    125 |     125 |
| Question: speak                          |     125 |    125 |     125 |
| Word card (with a meaning or an example) |   2,629 |  1,117 |     975 |
| Unit title and description               |     126 |    127 |     154 |
| Lesson title and subtitle                |     609 |    611 |     610 |
| Placement question                       |      60 |     45 |      45 |
| Story campaign                           |       9 |      9 |       9 |
| Story scene                              |      28 |     28 |      28 |
| Speaking scenario                        |      12 |     12 |      12 |
| Podcast quiz question                    |      70 |     20 |      20 |

Explanations and bracketed hints are part of their question (there is no separate hint field).

Deterministic flags (phase 2, no cost):

| Flag                                              | English | French | Spanish | Goes to                                |
| ------------------------------------------------- | ------: | -----: | ------: | -------------------------------------- |
| Generic `"x" is correct here.` explanation        |   1,696 |  1,230 |   1,075 | phase 6 rewrite (Sonnet)               |
| B1-C1 fill-in with wrong options from other lines |       0 |    582 |     323 | phase 6 rewrite (Opus)                 |
| B1-C1 conjugation drill with a non-form option    |       0 |    143 |     347 | phase 6, conjugation engine (no model) |
| Named second answer (`frc1p19q4`, `q15`)          |       0 |      2 |       0 | phase 5 judge                          |

The drill count, 490, is the number `romance-conjugation.test.ts` ratchets. The generic
explanations are 4,001, not the backlog's 820: the backlog counted French and Spanish fill-ins only.

## Prices used

| Model                  | Batch input / output per M tokens         | Cache                         | Source                                                                                                                              |
| ---------------------- | ----------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `claude-sonnet-5-5`    | $1 / $5                                   | 1h write 2x input, read 0.05x | platform.claude.com batch and caching pages, 2026-11-06                                                                             |
| `claude-opus-5-5`      | $2 / $10                                  | same                          | same                                                                                                                                |
| `mistral-large-latest` | $1 / $3 (assumed $2 / $6 list, 50% batch) | none                          | **assumed**, deliberately above OpenRouter's listing of Mistral Large 4 ($0.70 / $2.10); confirm Mistral's own price before the run |

## Per phase

Expected = characters / 3 for input, the assumed output per item; worst case = what the ledger
reserves (every byte a token, every cached prefix a cache write, `max_tokens` in full).

| Phase                    | Model                  | Items | Requests | Expected US$ | Worst case US$ | Basis                                                                                 |
| ------------------------ | ---------------------- | ----: | -------: | -----------: | -------------: | ------------------------------------------------------------------------------------- |
| 3 full pass              | `claude-sonnet-5-5`    | 17196 |     1327 |         5.94 |          33.18 | every item, Batches API, rubric cached 1h                                             |
| 4 second opinion         | `mistral-large-latest` |  4815 |      380 |        23.28 |          31.54 | 3439 flagged (assumed 20%) + 1376 control (10% of passed); Mistral batch, no cache    |
| 5 judge                  | `claude-opus-5-5`      |  3577 |      284 |        27.35 |          66.05 | 3577 items, effort medium                                                             |
| 6 rewrite: explanation   | `claude-sonnet-5-5`    |  4001 |      335 |         3.85 |          15.78 | every generic explanation, Sonnet (formulaic; every result re-reviewed in phase 7)    |
| 6 rewrite: cloze-options | `claude-opus-5-5`      |   905 |       76 |         6.99 |          17.16 | B1-C1 FR/ES cloze lines with pool distractors, Opus                                   |
| 6 rewrite: drill-options | engine                 |   490 |        0 |         0.00 |           0.00 | B1-C1 drills go through the #427 conjugation engine (paradigms + gate), no model call |
| 7 re-review changed      | `claude-sonnet-5-5`    |  8973 |      693 |         3.10 |          17.36 | 8973 changed items (upper estimate: every judged item counted as changed)             |
| 7 judge round 2          | `claude-opus-5-5`      |   897 |       86 |         6.87 |          16.87 | 897 re-flagged (assumed 10%)                                                          |
| 7 blind sample: Sonnet   | `claude-sonnet-5-5`    |   300 |       36 |         0.11 |           0.71 | 300 items                                                                             |
| 7 blind sample: Mistral  | `mistral-large-latest` |   300 |       36 |         1.47 |           2.01 | 300 items, every one                                                                  |
| 7 blind sample: Opus     | `claude-opus-5-5`      |   300 |       36 |         2.30 |           5.78 | 300 items, every one (the measured rate is Opus-settled)                              |
| **Total**                |                        |       |          |    **81.25** |         206.44 | cap $99                                                                               |

The worst-case total is above the cap on purpose: it is never reserved at once. Each submission
reserves its own worst case against what is left, and its settled actual frees the rest.

## Sensitivity

| Case                                                   |                 Expected total |
| ------------------------------------------------------ | -----------------------------: |
| Base (above)                                           |                         $81.25 |
| Mistral at OpenRouter's listed price ($0.70 / $2.10)   | **$65.16** (34% under the cap) |
| Claude flags 30% instead of 20%                        |                        $103.62 |
| 30% flags, Mistral at listed price                     |                         $82.67 |
| Opus writes 1,100 output tokens an item instead of 700 |                        $100.34 |

**It fits only if Mistral's real price is near its listing or the flag rate stays near 20%.** The
two biggest unknowns are the Claude flag rate and how much Opus thinks. Hence:

1. **Pilot first (about US$0.20).** `submit review --sample 400 --go` (a seeded draw across every course and kind), collect,
   and re-run the plan with the measured flag rate and output tokens. Stop and re-plan if the
   projection is above US$80.
2. **Trims, in this order, if the projection is high:**
   - Opus judge at effort `low` instead of `medium`: about -$10 (Opus 5.5 cannot turn thinking off).
   - Mistral control share 10% to 5%: about -$4 at the assumed price (a wider interval on Claude's miss rate).
   - No second opinion or judge for unit and lesson titles and word cards (Claude's verdict alone, all re-checked in the blind sample): about -$5.
   - Explanation rewrites on the A1-B1 questions only, the rest in a follow-up: about -$2.
3. **Whatever happens, the measurement is paid for.** Phases 3 to 6 cannot use the last US$12, so
   the blind sample and its error rate always run.
