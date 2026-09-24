# French Content Audit (Phase 1 — Structural) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline — the
> exploratory data analysis behind Tasks 4-5 was already done in-session; a fresh
> subagent would have to re-derive it, so this plan is executed by the same session
> that wrote it). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the five structural checks the French content bank has never had
(malformed lines, pack line-count consistency, duplicate prompts across packs,
answers leaking into their own prompt, encoding integrity for its 18 non-ASCII
characters), fix what's safely fixable without shifting any question id, and
generalize the audit tooling by course instead of forking it for French.

**Architecture:** Generalize the existing English-named tooling
(`english-content-dump.ts`, `english-id-parity.ts`, and the three
`scripts/*english*.ts` wrappers) to take a `course: Course` parameter, defaulting to
`"en"` so English's existing usage is unaffected. Snapshot the French id baseline
*before* any content edit (non-negotiable — see spec §7). Apply content fixes as
same-line, same-position text replacements only (verified programmatically: every
old string must match exactly once; pack line counts before/after must be
identical). Re-verify id parity after editing, then add the new CI-enforced checks,
regenerate the iOS bundles, update the two stale doc claims, and write the audit
log.

**Tech Stack:** TypeScript, Vitest, Bun (script runner — `tsx` is not installed).
**Never run the bare `bun run vitest run` / `bun run test` with no path args** — it
hangs in this Windows sandbox per the English audit plan's own note; always scope
to specific paths, e.g. `bun run vitest run src/data/curriculum-consistency.test.ts`.

**Spec:** `docs/superpowers/specs/2026-09-24-french-content-audit-design.md`
**Companion:** `docs/superpowers/english-content-audit-log.md` (method + "How much
'No issues found' is worth")

---

## Global constraints

- **Id stability is a hard rule** (spec §7). Every content fix in Task 5 is a
  same-line text replacement — no `data` line is ever added or removed inside an
  existing pack. The French baseline is taken in Task 2, before Task 5, and
  Task 6 diffs against it and requires `{added: [], removed: []}`.
- **Distractor-quality / POS ranking is explicitly out of scope this session**
  (spec §8) — `bank-engine.ts`'s `pickDistractors` is not touched. Findings whose
  only fix is a ranking layer (pool/word-class mixing, the `frb2p17` cleft-marker
  pool) are measured and deferred in the audit log, not fixed.
- **Linguistic correctness is out of scope** (spec §11) — true cognates
  (six/six, internet/internet, intelligent/intelligent, innocent/innocent) and
  register/synonym judgment calls beyond what's specified in Task 5 are deferred.
- **Spanish is untouched.** `lesson-bank-es.ts`, `curriculum-es.ts`,
  `placement-es.ts` are read-only reference points for generalizing tooling types,
  never edited.

---

### Task 1: Generalize the content-dump and id-parity tooling by course

**Files:**
- Modify: `src/lib/english-content-dump.ts`
- Modify: `src/lib/english-content-dump.test.ts`
- Modify: `src/lib/english-id-parity.ts`
- Modify: `src/lib/english-id-parity.test.ts`
- Modify: `scripts/snapshot-english-ids.ts`
- Modify: `scripts/dump-english-questions.ts`
- Modify: `scripts/audit-scan.ts`

Rename `EnglishDump` → `CourseDump`, `buildEnglishDump()` → `buildCourseDump(course: Course = "en")`
(reading the placement pool from `getCourse(course).placementPool` instead of the
hardcoded `PLACEMENT_QUESTIONS` import), `collectEnglishIds()` → `collectCourseIds(course: Course = "en")`,
and add a `course` parameter to `packLineStats(course: Course = "en")` that selects
the right raw pack collection (`BANK` / `BANK_FR` / `BANK_ES`, all structurally
`{id, data}[]` even though English's own `Pack` type in `lesson-bank.ts` is a
separate declaration from `bank-engine.ts`'s `Pack` — spec §2.2). Defaults keep
every existing English call site (`bun run scripts/snapshot-english-ids.ts` with no
args, etc.) behaving exactly as before.

`scripts/snapshot-english-ids.ts` takes an optional course-code CLI arg
(`en`/`fr`/`es`, default `en`) and maps it to the baseline filename via
`{en: "english-ids.json", fr: "french-ids.json", es: "spanish-ids.json"}` — keeping
`english-ids.json` as English's committed filename per spec §9.

`scripts/dump-english-questions.ts` takes the same optional course arg, writing
`.audit/<prefix>-<LEVEL>.json` with `prefix` from
`{en: "english", fr: "french", es: "spanish"}`.

`scripts/audit-scan.ts` takes the course arg as `process.argv[2]` (was the level
filter; level filter moves to `process.argv[3]`), reads `.audit/<prefix>-*.json`,
and **gates the `pos` check to `course === "en"` only** — `compromise` is an
English-only tagger (spec §2.1); running it against French words would produce
confidently wrong tags exactly like the English pilot's first (bare-word) version
did (audit log "Systemic finding"), so it must not run for French this session.
The `self-ref` check's `promptWords()` must retain the 18 French accented/typographic
characters found in `lesson-bank-fr.ts` (À Ç Ê à â ç è é ê ë î ô ù û œ – — …) instead
of stripping to `[a-z\s'-]` only, or every French self-ref instance with an accented
word is silently invisible to the scan.

- [ ] Update `english-content-dump.ts`: add `Course` import from `@/data/courses`,
      rename type and function, use `getCourse(course).placementPool`.
- [ ] Update `english-content-dump.test.ts` call sites (`buildEnglishDump()` →
      `buildCourseDump("en")`); add one new `it` block calling
      `buildCourseDump("fr")` and asserting `all.length` equals `dump.totals.curriculum`
      and every question's `key` matches `${lessonId}:${questionId}` (mirrors the
      existing English assertions, catches a dump-builder regression for either
      course).
- [ ] Update `english-id-parity.ts`: rename functions, add `packsForCourse(course)`
      helper importing `BANK`/`BANK_FR`/`BANK_ES`.
- [ ] Update `english-id-parity.test.ts` call sites; French-specific assertions land
      in Task 6, not here.
- [ ] Update the three scripts' CLI argument handling as above.
- [ ] Run: `bun run vitest run src/lib/english-content-dump.test.ts src/lib/english-id-parity.test.ts`
      Expected: PASS (English behavior unchanged by the added default parameter).
- [ ] Run: `bun run vitest run src/data/curriculum-consistency.test.ts`
      Expected: PASS (untouched by this task, confirms no accidental import break).

---

### Task 2: Take the French id baseline

**Files:**
- Create: `.audit-baseline/french-ids.json` (committed)

Must run **before** Task 5's content edits — this is what Task 6 diffs against to
prove no id was added or removed.

- [ ] Run: `bun run scripts/snapshot-english-ids.ts fr`
      Expected: `Wrote .../.audit-baseline/french-ids.json (2500 ids)`
- [ ] Confirm the file is exactly the sorted `lessonId:questionId` array (spot-check
      first/last entries against `collectCourseIds("fr")`'s known shape, matching
      `english-ids.json`'s existing format).

---

### Task 3: New structural checks — line count, cross-pack duplicates, encoding

**Files:**
- Modify: `src/data/curriculum-consistency.test.ts`
- Modify: `src/lib/english-id-parity.test.ts` (line-count assertion, sits next to
  the existing `packLineStats` malformed-line test)

Extend the existing `describe.each(courses)` block in
`curriculum-consistency.test.ts` — do not duplicate it (spec §10) — with two new
language-neutral `it` blocks run for all three courses:

```ts
it("has no duplicate prompt text across different packs", () => {
  const byPrompt = new Map<string, { key: string; packId: string; answer: string }[]>();
  for (const { lesson, question } of allQuestions(units)) {
    const packId = question.id.replace(/q\d+$/, "");
    const norm = question.prompt.trim().toLowerCase();
    if (!byPrompt.has(norm)) byPrompt.set(norm, []);
    const anyQ = question as unknown as { choices?: string[]; answer: unknown; bank?: string[] };
    const answer = Array.isArray(anyQ.choices)
      ? anyQ.choices[anyQ.answer as number]
      : String(anyQ.answer);
    byPrompt.get(norm)!.push({ key: `${lesson.id}:${question.id}`, packId, answer });
  }
  const crossPackDupes: string[] = [];
  for (const [prompt, group] of byPrompt) {
    const packs = new Set(group.map((g) => g.packId));
    if (packs.size > 1) {
      crossPackDupes.push(`"${prompt}" -> ${group.map((g) => `${g.key}(${g.answer})`).join(", ")}`);
    }
  }
  // NOTE: this is a scan assertion recorded in the audit log, not a zero-tolerance
  // gate for fr/es until Task 5's fixes land -- see french-content-audit-log.md.
  // After Task 5, French must be at zero; English/Spanish are not audited this
  // session, so they stay report-only via console output rather than a hard assert.
});

it("has no mojibake or replacement characters in any question text", () => {
  const offenders: string[] = [];
  for (const { lesson, question } of allQuestions(units)) {
    const texts = [
      question.prompt,
      question.explanation ?? "",
      ...(("choices" in question && question.choices) || []),
      ...(("bank" in question && question.bank) || []),
    ];
    for (const t of texts) {
      if (t.includes("�")) offenders.push(`${lesson.id}:${question.id}: replacement char (U+FFFD)`);
      if (/Ã[\x80-\xBF]/.test(t)) offenders.push(`${lesson.id}:${question.id}: mojibake pattern "Ã.": "${t}"`);
    }
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});
```

Plus one French-only encoding floor test asserting the 18 known characters
(`À Ç Ê à â ç è é ê ë î ô ù û œ – — …`) each still appear at least once somewhere in
`curriculumFr`'s compiled text — this is the "didn't silently lose a character
class" check, not a per-question check.

`english-id-parity.test.ts` gets one new `it` inside a `describe.each` over
`[{course: "en" as const}, {course: "fr" as const}]` asserting
`packLineStats(course)` reports `lines === 25` for every pack (currently true for
both — Task-2-adjacent verification, not a new defect).

- [ ] Write the two new `curriculum-consistency.test.ts` blocks and the French
      encoding-floor test.
- [ ] Write the `packLineStats` line-count assertion in `english-id-parity.test.ts`.
- [ ] Run: `bun run vitest run src/data/curriculum-consistency.test.ts src/lib/english-id-parity.test.ts`
      Expected: mojibake/replacement-char test and line-count test PASS for all
      three courses; the duplicate-prompt scan logs French's current dupes to
      console (pre-Task-5) without failing — confirm this by reading the output,
      not by asserting on it yet.

---

### Task 4: Generalize `audit-scan.ts`'s self-ref check and run it for French

**Files:**
- Modify: `scripts/audit-scan.ts` (already course-parameterized by Task 1; this
  task is about the accent-preserving `promptWords()` and the `course === "en"`
  gate on the `pos` check, both specified in Task 1 — verify here by running it)
- Modify: `scripts/dump-english-questions.ts` (already generalized by Task 1)

- [ ] Run: `bun run scripts/dump-english-questions.ts fr`
      Expected: writes `.audit/french-A1.json` … `.audit/french-C1.json`
      (`.audit/` is gitignored).
- [ ] Run: `bun run scripts/audit-scan.ts fr`
      Expected: reports flag counts per level; total should be 83 self-ref flags
      across the whole bank (44 in `frb1p20`+`frb2p19`, 5 in `frb1p8`, 4 in
      `frb2p18`, 3 singles, 4 cognates, 17 in `frb2p17`, 6 elsewhere — see Task 5
      for the fix/defer split). If the count differs from 83, STOP and reconcile
      before Task 5 — it means either the tool's logic diverged from the
      exploratory probe or the bank changed since analysis.
- [ ] Do not proceed to Task 5 until this number is confirmed and understood.

---

### Task 5: Apply the safe content fixes

**Files:**
- Modify: `src/data/lesson-bank-fr.ts`

All edits are same-line text replacements — the `|` position and line count of
every pack are unchanged, so no question id moves. Applied via a one-shot verified
script (not by hand) so every old string's uniqueness is checked before writing:

```ts
// scratchpad only — not committed. Run with `bun run <path>`, then delete.
import fs from "node:fs";

const path = "src/data/lesson-bank-fr.ts";
let src = fs.readFileSync(path, "utf8");

const fixes: { old: string; new: string; reason: string }[] = [
  // --- frb2p19 "Faire Causatif": every line's answer is the bare infinitive
  // already shown in the hint (grammatically inherent to the causative
  // construction) -- swap the French-infinitive hint for an English gloss so
  // the hint still names the verb without literally being the answer.
  { old: 'Je fais ___ (réparer) ma voiture.|réparer', new: 'Je fais ___ (to repair) ma voiture.|réparer', reason: 'frb2p19: hint=answer' },
  { old: 'Elle fait ___ (construire) une maison.|construire', new: 'Elle fait ___ (to build) une maison.|construire', reason: 'frb2p19: hint=answer' },
  { old: 'Il fait ___ (nettoyer) son costume.|nettoyer', new: 'Il fait ___ (to clean) son costume.|nettoyer', reason: 'frb2p19: hint=answer' },
  { old: 'Nous faisons ___ (livrer) les meubles.|livrer', new: 'Nous faisons ___ (to deliver) les meubles.|livrer', reason: 'frb2p19: hint=answer' },
  { old: 'Vous faites ___ (couper) vos cheveux.|couper', new: 'Vous faites ___ (to cut) vos cheveux.|couper', reason: 'frb2p19: hint=answer' },
  { old: 'Ils font ___ (peindre) leur maison.|peindre', new: 'Ils font ___ (to paint) leur maison.|peindre', reason: 'frb2p19: hint=answer' },
  { old: 'Je me fais ___ (couper) les cheveux.|couper', new: 'Je me fais ___ (to cut) les cheveux.|couper', reason: 'frb2p19: hint=answer' },
  { old: 'Elle se fait ___ (faire) une manucure.|faire', new: 'Elle se fait ___ (to have done) une manucure.|faire', reason: 'frb2p19: hint=answer' },
  { old: 'Il fait ___ (installer) une nouvelle cuisine.|installer', new: 'Il fait ___ (to install) une nouvelle cuisine.|installer', reason: 'frb2p19: hint=answer' },
  { old: 'Nous faisons ___ (traduire) ce document.|traduire', new: 'Nous faisons ___ (to translate) ce document.|traduire', reason: 'frb2p19: hint=answer' },
  { old: 'Vous faites ___ (réviser) votre voiture.|réviser', new: 'Vous faites ___ (to service) votre voiture.|réviser', reason: 'frb2p19: hint=answer' },
  { old: 'Ils font ___ (livrer) le colis.|livrer', new: 'Ils font ___ (to deliver) le colis.|livrer', reason: 'frb2p19: hint=answer' },
  { old: 'Je fais ___ (faire) mes devoirs par mon frère.|faire', new: 'Je fais ___ (to have done) mes devoirs par mon frère.|faire', reason: 'frb2p19: hint=answer' },
  { old: 'Elle fait ___ (envoyer) un cadeau à sa mère.|envoyer', new: 'Elle fait ___ (to send) un cadeau à sa mère.|envoyer', reason: 'frb2p19: hint=answer' },
  { old: 'Il fait ___ (savoir) la nouvelle à tout le monde.|savoir', new: 'Il fait ___ (to let know) la nouvelle à tout le monde.|savoir', reason: 'frb2p19: hint=answer' },
  { old: 'Nous faisons ___ (réparer) le toit.|réparer', new: 'Nous faisons ___ (to repair) le toit.|réparer', reason: 'frb2p19: hint=answer' },
  { old: 'Vous faites ___ (imprimer) les documents.|imprimer', new: 'Vous faites ___ (to print) les documents.|imprimer', reason: 'frb2p19: hint=answer' },
  { old: 'Ils font ___ (agrandir) leur maison.|agrandir', new: 'Ils font ___ (to enlarge) leur maison.|agrandir', reason: 'frb2p19: hint=answer' },
  { old: 'Je fais ___ (venir) le plombier.|venir', new: 'Je fais ___ (to send for) le plombier.|venir', reason: 'frb2p19: hint=answer' },
  { old: 'Elle fait ___ (visiter) la ville à ses invités.|visiter', new: 'Elle fait ___ (to tour) la ville à ses invités.|visiter', reason: 'frb2p19: hint=answer' },
  { old: 'Il fait ___ (rire) tout le monde.|rire', new: 'Il fait ___ (to laugh) tout le monde.|rire', reason: 'frb2p19: hint=answer' },
  { old: 'Nous faisons ___ (comprendre) la situation.|comprendre', new: 'Nous faisons ___ (to understand) la situation.|comprendre', reason: 'frb2p19: hint=answer' },
  { old: 'Vous faites ___ (remarquer) le problème.|remarquer', new: 'Vous faites ___ (to notice) le problème.|remarquer', reason: 'frb2p19: hint=answer' },
  { old: 'Ils font ___ (payer) la note à leur client.|payer', new: 'Ils font ___ (to pay) la note à leur client.|payer', reason: 'frb2p19: hint=answer' },
  { old: 'Je fais ___ (attendre) mes amis.|attendre', new: 'Je fais ___ (to wait) mes amis.|attendre', reason: 'frb2p19: hint=answer' },

  // --- frb1p20 "Making Suggestions & Giving Advice": 19 of 25 lines are
  // bare-infinitive-after-modal constructions where hint=answer; the other 6
  // (conditional-mood lines) are untouched -- their answer already differs
  // from the hint.
  { old: 'Pourquoi ne pas ___ (prendre) un peu de repos ?|prendre', new: 'Pourquoi ne pas ___ (to take) un peu de repos ?|prendre', reason: 'frb1p20: hint=answer' },
  { old: 'Il vaudrait mieux ___ (partir) maintenant.|partir', new: 'Il vaudrait mieux ___ (to leave) maintenant.|partir', reason: 'frb1p20: hint=answer' },
  { old: 'Je te conseille de ___ (rester) prudent.|rester', new: 'Je te conseille de ___ (to stay) prudent.|rester', reason: 'frb1p20: hint=answer' },
  { old: 'Tu devrais ___ (consulter) un médecin.|consulter', new: 'Tu devrais ___ (to see) un médecin.|consulter', reason: 'frb1p20: hint=answer' },
  { old: "Ça vaudrait la peine d'___ (essayer).|essayer", new: "Ça vaudrait la peine d'___ (to try).|essayer", reason: 'frb1p20: hint=answer' },
  { old: 'Il serait sage de ___ (faire) des économies.|faire', new: 'Il serait sage de ___ (to save) des économies.|faire', reason: 'frb1p20: hint=answer' },
  { old: 'Tu ferais mieux de ___ (dormir) tôt ce soir.|dormir', new: 'Tu ferais mieux de ___ (to sleep) tôt ce soir.|dormir', reason: 'frb1p20: hint=answer' },
  { old: 'Je te suggère de ___ (prendre) une pause.|prendre', new: 'Je te suggère de ___ (to take) une pause.|prendre', reason: 'frb1p20: hint=answer' },
  { old: 'Il faudrait ___ (être) plus attentif.|être', new: 'Il faudrait ___ (to be) plus attentif.|être', reason: 'frb1p20: hint=answer' },
  { old: 'Tu devrais vraiment ___ (lire) ce livre.|lire', new: 'Tu devrais vraiment ___ (to read) ce livre.|lire', reason: 'frb1p20: hint=answer' },
  { old: 'Pourquoi ne pas ___ (partir) un peu plus tôt ?|partir', new: 'Pourquoi ne pas ___ (to leave) un peu plus tôt ?|partir', reason: 'frb1p20: hint=answer' },
  { old: 'Je te recommande de ___ (essayer) ce restaurant.|essayer', new: 'Je te recommande de ___ (to try) ce restaurant.|essayer', reason: 'frb1p20: hint=answer' },
  { old: 'Il serait préférable de ___ (attendre) demain.|attendre', new: 'Il serait préférable de ___ (to wait until) demain.|attendre', reason: 'frb1p20: hint=answer' },
  { old: 'On devrait ___ (prendre) une décision rapidement.|prendre', new: 'On devrait ___ (to make) une décision rapidement.|prendre', reason: 'frb1p20: hint=answer' },
  { old: 'Ça serait une bonne idée de ___ (faire) un plan.|faire', new: 'Ça serait une bonne idée de ___ (to make) un plan.|faire', reason: 'frb1p20: hint=answer' },
  { old: "Tu pourrais ___ (demander) à quelqu'un d'autre.|demander", new: "Tu pourrais ___ (to ask) à quelqu'un d'autre.|demander", reason: 'frb1p20: hint=answer' },
  { old: 'Il vaut mieux ___ (prévenir) que guérir.|prévenir', new: 'Il vaut mieux ___ (to prevent) que guérir.|prévenir', reason: 'frb1p20: hint=answer' },
  { old: 'Je te conseille vivement de ___ (suivre) ce cours.|suivre', new: 'Je te conseille vivement de ___ (to take) ce cours.|suivre', reason: 'frb1p20: hint=answer' },
  { old: 'Tu devrais peut-être ___ (prendre) un peu de repos.|prendre', new: 'Tu devrais peut-être ___ (to take) un peu de repos.|prendre', reason: 'frb1p20: hint=answer' },

  // --- frb1p8 "Object Pronouns": disjunctive-pronoun hints that are
  // identical to their answer in French (nous/nous, lui/lui are the same
  // word in both forms) -- reworded to a concrete referent noun phrase that
  // still grammatically requires the same pronoun, keeping the pack
  // all-French. q2's leak is unrelated (fixed phrase "tous les jours"
  // collides with the answer "les"), fixed by swapping to a synonymous
  // phrase.
  { old: 'Je ___ vois tous les jours (mes amis).|les', new: 'Je ___ vois chaque jour (mes amis).|les', reason: 'frb1p8: "les" leaks via "tous les jours"' },
  { old: 'Il ___ parle souvent (à lui/elle).|lui', new: 'Il ___ parle souvent (à son collègue).|lui', reason: 'frb1p8: hint="lui" = answer' },
  { old: 'Il ___ parle souvent (à nous).|nous', new: 'Il ___ parle souvent (à ma sœur et moi).|nous', reason: 'frb1p8: hint="nous" = answer' },
  { old: 'Vous ___ avez appelé (nous) hier.|nous', new: 'Vous ___ avez appelé (ma sœur et moi) hier.|nous', reason: 'frb1p8: hint="nous" = answer' },
  { old: 'Elle ___ a présenté son projet (à nous).|nous', new: 'Elle ___ a présenté son projet (à mes collègues et moi).|nous', reason: 'frb1p8: hint="nous" = answer' },

  // --- frb2p18 "Double Object Pronouns": parenthetical noun-phrase hints
  // whose article matches the pronoun answer (le/le, les/les), or a
  // disjunctive pronoun matching the indirect-object answer (lui/lui) --
  // same pattern as frb1p8, same fix (demonstrative or noun referent instead
  // of the colliding article/pronoun).
  { old: 'Je te ___ donne (le livre).|le', new: 'Je te ___ donne (ce livre).|le', reason: 'frb2p18: "le" leaks via hint article' },
  { old: 'Nous vous ___ offrons (les fleurs).|les', new: 'Nous vous ___ offrons (ces fleurs).|les', reason: 'frb2p18: "les" leaks via hint article' },
  { old: 'Je le ___ ai déjà dit (à lui).|lui', new: 'Je le ___ ai déjà dit (à mon collègue).|lui', reason: 'frb2p18: hint="lui" = answer' },

  // --- One-off redundant-word collisions: the answer word also appears,
  // unblanked, elsewhere in the same fixed sentence.
  { old: 'Avec ___, je viendrai avec grand plaisir.|plaisir', new: 'Avec ___, je viendrai volontiers.|plaisir', reason: 'fra2p10: "plaisir" repeated in sentence' },
  { old: 'Ils réussissent ___ finir à temps.|à', new: 'Ils réussissent ___ finir dans les délais.|à', reason: 'frb1p17: "à" repeated via "à temps"' },
  { old: 'Le juge a prononcé un ___ de non-lieu.|non-lieu', new: 'Le juge a prononcé un ___.|non-lieu', reason: 'frc1p10: "non-lieu" duplicated (also the correct idiom is "prononcer un non-lieu", not "un [X] de non-lieu")' },
];

for (const { old, new: replacement, reason } of fixes) {
  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`"${reason}": expected exactly 1 match for ${JSON.stringify(old)}, found ${count}`);
  src = src.replace(old, replacement);
}

fs.writeFileSync(path, src);
console.log(`Applied ${fixes.length} fixes to ${path}`);
```

- [ ] Write the fix script above to the scratchpad directory, review the full
      `fixes` array against Task 4's live `audit-scan.ts fr` output (every listed
      `old` string must correspond to a flag the tool actually raised — if the
      tool's real prompt text differs even by punctuation from what's captured
      above, since curly quotes/en-dashes are significant, update the `old` string
      to match the tool's exact output, not this document).
- [ ] Run the script with `bun run <scratchpad-path>`. Expected:
      `Applied 44 fixes to src/data/lesson-bank-fr.ts` (30 above; verify the exact
      count once reconciled against Task 4's tool output — the count in this doc
      is derived from manual inspection and must match the tool, not the reverse).
- [ ] Run: `bun run vitest run src/data/curriculum-consistency.test.ts`
      Expected: PASS — every fix preserved `|` structure, no empty fields, no
      duplicate choices introduced.
- [ ] Run: `bun run scripts/dump-english-questions.ts fr && bun run scripts/audit-scan.ts fr`
      Expected: self-ref flag count drops by exactly the number of fixes applied;
      remaining flags are the deferred set (cognates + pool-mixing distractor
      leaks) documented in Task 8's audit log.

**Also in this task — the 29 cross-pack duplicate-prompt groups** (Task 3's scan,
run for real via a similar one-shot script against `lesson-bank-fr.ts`'s English-cue
`pair`-pack lines): 23 exact-duplicate groups get a disambiguating parenthetical
added to the cue on the *second* occurrence only (e.g. `waiter` → `waiter (in a
restaurant)` in `fra1p15`, leaving `fra1p10`'s plain `waiter` alone); 5 groups where
the two packs' French answers are genuine synonyms differing by register
(teacher/professeur vs teacher/enseignant, etc.) get the same treatment — a
clarifying English parenthetical, no French text touched; the one cloze
tense-ambiguity duplicate (`"Je ___ (aller) au marché."` present-tense vs
passé-composé) is fixed by prefixing the `frb1p1` (Passé Composé) occurrence with
`"Hier, "`, matching the existing convention already used for the identical
sentence in `placement-fr.ts`'s `fp4`.

- [ ] Extend the same fix script (or a second one-shot script, reviewed the same
      way) with the 29 duplicate-prompt line replacements, each verified for
      exactly one source match before writing.
- [ ] Re-run: `bun run vitest run src/data/curriculum-consistency.test.ts` — still
      green.
- [ ] Delete the scratchpad fix script(s) — they are one-shot, not committed
      tooling.

---

### Task 6: Re-verify id parity, then make it a permanent CI gate

**Files:**
- Modify: `src/lib/english-id-parity.test.ts`

- [ ] Run: `bun run scripts/dump-english-questions.ts fr` then check
      `collectCourseIds("fr")`'s output against `.audit-baseline/french-ids.json`
      via the existing `diffIds` — expect `{added: [], removed: []}`. If not empty,
      STOP: some edit in Task 5 changed a line count or position; find and fix
      before continuing, do not re-baseline to paper over it (spec §7).
- [ ] Restructure `english-id-parity.test.ts`'s `describe("id parity against
      committed baseline")` and `describe("collectEnglishIds")` /
      `describe("packLineStats")` blocks into `describe.each([{course: "en",
      baseline: "english-ids.json"}, {course: "fr", baseline: "french-ids.json"}])`
      so French gets the identical zero-tolerance guard English already has,
      without duplicating the test file.
- [ ] Run: `bun run vitest run src/lib/english-id-parity.test.ts`
      Expected: PASS for both courses.

---

### Task 7: Make the cross-pack duplicate-prompt check a real (reduced) gate for French

**Files:**
- Modify: `src/data/curriculum-consistency.test.ts`

After Task 5's fixes, French's cross-pack duplicate count should be at the 27
irreducible cognate/genuinely-ambiguous-by-design instances that were never in the
29-group list to begin with (i.e., 0, since Task 5 covers all 29). Tighten Task 3's
scan block: for `fr` specifically, assert zero cross-pack duplicates; for `en`/`es`
(not audited this session), keep it report-only via `console.log`, not an assertion,
so this task doesn't silently start gating courses nobody has reviewed yet.

- [ ] Change the duplicate-prompt `it` block to assert `crossPackDupes` is `[]`
      when `name === "fr"`, and `console.log` the count otherwise.
- [ ] Run: `bun run vitest run src/data/curriculum-consistency.test.ts`
      Expected: PASS.

---

### Task 8: Regenerate iOS content bundles

**Files:**
- Modify (generated, committed): `ios/LearnWithAlphonso/Resources/curriculum-fr.json`
- Modify (generated, committed): `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/curriculum-fr.json`

CI fails the "Bundled iOS content is up to date" check if these drift from
`curriculum-fr.ts` (spec §3) — Task 5's edits must be reflected here before commit.

- [ ] Run: `bun scripts/export-ios-content.ts`
- [ ] Confirm both `curriculum-fr.json` copies changed identically
      (`diff` the two output paths — they must match byte-for-byte, per
      `export-ios-content.ts`'s own single-source-of-truth design).
- [ ] Spot-check one edited line survived the export with its accent marks intact
      (e.g. grep the new gloss text or an adjusted French sentence in the JSON).

---

### Task 9: Correct the stale "full parity" documentation claim

**Files:**
- Modify: `AGENTS.md`

Spec §4: "Two parity claims in the docs are now false... do not leave 'full
structural parity across three courses' standing unqualified." `README.md`'s
content table already matches the spec's current counts (verified — no edit
needed there). `ARCHITECTURE.md` already says "English is now ahead of structural
parity" (verified — no edit needed there). `AGENTS.md`'s Content Structure table
still shows English at 534/122 lessons (stale — current is 584/132) and its prose
still claims "All three courses are now at full parity."

- [ ] Update `AGENTS.md`'s Content Structure table to English 132/114/114/112/112,
      **584** lessons (matching README's already-current figures).
- [ ] Replace the "All three courses are now at full parity" paragraph with
      language matching `ARCHITECTURE.md`'s existing accurate framing: English is
      ahead on structure (listening + speaking, both absent from French/Spanish);
      French and Spanish are structurally complete among themselves but still need
      native-speaker linguistic review (unchanged from before, still true per this
      audit — spec §5 non-goal).

---

### Task 10: Write the audit log

**Files:**
- Create: `docs/superpowers/french-content-audit-log.md`

Modeled on `docs/superpowers/english-content-audit-log.md` (spec §6.4) — per that
log's own "How much 'No issues found' is worth" section, this must record
**coverage and method**, not just findings: what fraction of the bank was actually
examined, by what mechanism, and what the check's blind spots are.

Required sections (mirroring the English log's structure):
- **Coverage table**: not per-pack (2,500 questions across 100 packs makes a
  per-pack table the wrong granularity for a purely mechanical pass) — instead,
  one row per check (malformed lines, line-count, cross-pack duplicates, self-ref,
  encoding integrity) stating what fraction of the bank it covers (100% by
  construction, since every check enumerates the full compiled bank, not a sample)
  and its verdict.
- **Method**: exactly what Task 1-4's tooling does and does not see (explicitly:
  this pass never reviewed pool-level semantic coherence the way the English audit
  did, because that requires the same POS/ranking layer blocked in spec §8 — this
  is a narrower, purely mechanical pass, and the log must say so plainly rather
  than imply broader coverage).
- **Findings detail**: every one of the 44 (frb2p19+frb1p20) + 8 (frb1p8+frb2p18)
  + 3 (one-offs) + 29 (duplicates) fixes, grouped by root cause, with the fix
  applied — not a 84-row table; group by pack/pattern like the English log did for
  its systemic findings (a1p3, a1p11, etc.).
- **Deferred findings**: the 4 cognates, the `frb2p17` cleft-marker pool (17
  instances), and the 6 word-class/pool-mixing distractor leaks
  (`frb1p8q21`, `frb2p18q12`, `fra2p4`×2, `fra2p11`, `fra2p16`) — each with why it's
  deferred (native-speaker judgment vs. blocked ranking layer, spec §8/§11) and a
  pointer to `docs/BACKLOG.md` §0.6.2 (shared with Spanish) as the actual home for
  the ranking-layer decision.
- **Id stability**: state plainly that every fix was a same-line replacement,
  point at the `.audit-baseline/french-ids.json` baseline and the zero-diff
  re-verification from Task 6.

- [ ] Write the log.

---

### Task 11: Final verification

- [ ] Run: `bun run vitest run src/lib/english-content-dump.test.ts src/lib/english-id-parity.test.ts src/data/curriculum-consistency.test.ts`
      Expected: all PASS.
- [ ] Run: `bunx tsc --noEmit`
      Expected: no errors.
- [ ] Run: `bun run lint`
      Expected: no errors.
- [ ] Attempt `bun run test` (the full suite) once, watching for the known
      Windows-sandbox hang; if it hangs, kill it and rely on the scoped run above
      plus a note in the audit log that the full-suite run could not be verified
      in-session for an environmental reason unrelated to this change.
- [ ] `git status` — confirm only the intended files changed (tooling, tests, two
      docs, `lesson-bank-fr.ts`, `.audit-baseline/french-ids.json`, both
      `curriculum-fr.json` copies, the plan and audit-log docs). No stray
      `.audit/` or scratch files.
- [ ] Present a summary to the user; ask before committing/pushing/opening a PR.
