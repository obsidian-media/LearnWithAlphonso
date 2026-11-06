# Full content review: closure report (2026-11-06)

One-time review of every English, French and Spanish content item, run with `scripts/content-review/run.ts` (see `docs/CONTENT-PLAYBOOK.md`). This report is the evidence for closing the content backlog items listed at the end.

## What was reviewed

| Step                          | Model                                                              | Items                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Full pass                     | Sonnet 5.5 (batch)                                                 | all 17,196 items                                                                                                         |
| Second opinion                | Mistral Large 4 (synchronous; the batch API needs billing enabled) | 5,682 (flagged and high-risk items, blind samples)                                                                       |
| Rulings and patches           | Opus 5.5 (batch, medium effort)                                    | 15,352 items: every flagged item, then every item the full pass had marked fine                                          |
| Rewrites                      | Sonnet / Opus                                                      | 3,633 generic explanations, 2,074 French/Spanish word-card meanings, 713 cloze option sets, 487 B1–C1 conjugation drills |
| Re-read of every changed item | Sonnet, then Opus on what it still flagged                         | about 11,000                                                                                                             |

Every patch passed `src/lib/content-review/fixes.ts` before it was applied. The checker refuses:

- id, type, count or answer-position changes;
- duplicate options;
- generic explanations, and explanations that don't quote the answer;
- word-card and card-example rules broken (the CI gates' own rules);
- drill options that aren't forms of the bracketed verb;
- patches that undo an earlier reviewed fix.

Then `run.ts gates` ran every content gate with the fixes applied, and any fix that tripped a gate went back to the judge.

## Result

**Fixes applied:** 10,922 items (English 3,115, French 3,988, Spanish 3,878, less 59 hand-applied kinds, below). Each is a field-level patch in `src/data/review-fixes/{en,fr,es}.json`.

**Fixes by category** (an item can count in more than one):

| Category                  | Fixes                                           |
| ------------------------- | ----------------------------------------------- |
| Explanation               | 3,960 judged, plus 3,633 rewritten              |
| Word card                 | 551, plus 2,074 French/Spanish meanings written |
| Second correct answer     | 521                                             |
| Cloze options             | 713                                             |
| Conjugation drill options | 487                                             |
| Giveaway                  | 425                                             |
| Absurd option             | 310                                             |
| Naturalness               | 206                                             |
| Instructions              | 187                                             |
| Regional                  | 61                                              |
| Grammar                   | 53                                              |
| Level                     | 47                                              |
| Wrong key                 | 28 rulings (9 applied as key changes)           |
| Register                  | 24                                              |
| Spelling                  | 22                                              |

**Answer keys:**

- 9 changed: confidence ≥0.8, a wrong-key ruling, and Mistral not calling the item fine.
- 93 held. 17 of them are on the short list in `docs/content-review/owner-list.md`; the rest are in its appendix.
- The server grades from the seeded tables, so after the delivery PRs merge, the owner runs `bun scripts/seed-curriculum-db.ts`.

**Not changed:**

- 681 items whose proposed fixes still failed the checks after two judge rounds. They stay as they are.
- 59 fixes to roleplay prompts, campaign premises and podcast quizzes. A changed system prompt or premise makes `/api/chat` reject older app builds that send the old text, so those need a whitelist of the previous prompts first. The podcast quizzes are also seeded by a migration. Their exact patches are in `docs/content-review/manual-fixes.json`, to be applied in a follow-up that adds the prompt whitelist and the seed migration.

## Measured error rate (blind sample)

An independent stratified sample of 100 items per language: Sonnet and Mistral read each item, then Opus judged it.

| Sample                                     | Defects  | Rate      | 95% CI     |
| ------------------------------------------ | -------- | --------- | ---------- |
| After the first pass                       | 56 / 299 | 18.7%     | 14.7–23.5% |
| Final content (new sample, new seed)       | 39 / 288 | **13.5%** | 10.1–18.0% |
| Final, high-confidence defects only (≥0.8) | 12 / 288 | **4.2%**  | 2.4–7.1%   |

The first sample showed most remaining defects sat on items the Sonnet full pass had marked fine, which never reached the judge. That's why the second pass (`judge-ok`) had Opus rule on every one of them.

What the final 39 are:

- No wrong answer keys.
- 3 possible second answers.
- 13 are items Opus itself had ruled fine earlier. That's the judge disagreeing with itself, and it puts a floor of about 4–5% under any AI-only measurement.
- 18 are fixed items with a remaining minor note (wording, an explanation detail, a card gloss).

## Spend

| Provider  | Spent  | Cap |
| --------- | ------ | --- |
| Anthropic | $69.15 | $99 |
| Mistral   | $6.58  | $10 |

About $5 of the Anthropic spend was wasted. The new phase was missing from the ruling-phase list, so two slices re-sent items whose rulings weren't stored. That's fixed, and the stored replies were re-read at no cost. Per-phase figures are in `cost-plan.md` under "Measured run".

## Backlog items this closes

- **0.0-ay** (French/Spanish agent panel, native judgement) and the native-speaker items folded into this project. Every French and Spanish item was reviewed by two model families, with Opus rulings. French: 3,988 fixes; Spanish: 3,878.
- **0.0-av** (the next French/Spanish lesson round): covered by the same pass.
- **0.0-au #1**'s remaining native-judgement placement items: placement questions were in the inventory and judged with everything else.
- **The B1–C1 conjugation drills** (490 lines offering non-forms): rewritten, and the drill gate's ratchet is lowered in the French and Spanish C1 PRs.
- **Generic explanations behind the word cards:** rewritten, and the checker now refuses generic explanations.

**Still open:**

- The 59 prompt, premise and quiz fixes above (an engineering follow-up).
- The 17 owner decisions.
- No native speaker has read the content. The quality claim is the blind AI sample above, with its CI.
