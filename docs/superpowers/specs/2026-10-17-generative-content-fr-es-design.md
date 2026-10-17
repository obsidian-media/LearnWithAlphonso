# Generative sentence content for French and Spanish (design)

**Status:** design only. No dependency is installed and no code is changed by the PR that adds this file.
**Date:** 2026-10-17
**Builds on:** `2026-09-22-generative-sentence-content-design.md` (the English pilot), `2026-09-24-french-content-audit-design.md` §8 (the `french-verbs` adoption).

## 1. Goal and the rule that governs everything

Extend the template pipeline in `src/data/generative/` to French and Spanish and ship generated practice into the two course banks. The account owner chose to ship without a native-speaker pass, so **correctness has to come from machine gates that cannot be fooled**. Three rules follow from that and from what the English pilot taught us:

1. **A closed vocabulary, taken from the shipped course data only.** No LLM proposes a word. Every noun and verb a generated sentence uses already appears in the French or Spanish bank today.
2. **Two independent sources must agree on every verb form.** A library produces the form; a committed, hand-verified table says what it must be. A form ships only when both agree. A verb the library gets wrong is dropped, never "fixed" by overriding the library, because an override is exactly the unreviewed path we are trying to close.
3. **The generator may only produce sentences whose meaning was allowed by hand.** Grammar correctness is not meaning correctness. "Elle écoute le pain" is grammatical. §6 adds an explicit verb-to-object-class allowlist so only sensible pairs are emitted.

## 2. Spike: which libraries, with evidence

The spike ran in a scratch folder outside the repo. Each library was run against a committed-style hand-verified table (this PR's §10 lists the verbs; the tables themselves land in the implementation PR). Persons are 1sg 2sg 3sg 1pl 2pl 3pl. Every form is counted.

### 2.1 French: `french-verbs` 5.4.0 + `french-verbs-lefff` 3.4.0 (Apache-2.0 code)

| Check                                                                                                             | Forms tested | Pass    | Fail                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ------------ | ------- | ---------------------------------------------------- |
| Present, 43 verbs (être avoir aller faire prendre vouloir pouvoir venir plus regular -er/-ir/-re and stem changes) | 258          | 257     | 1: `pouvoir`, 1sg, library `puis`, table `peux`      |
| Passé composé, 40 avoir verbs, every person                                                                       | 240          | all     | 0                                                    |
| Passé composé, 11 être verbs (aller venir partir arriver rester sortir entrer tomber rentrer monter descendre), both genders, sg and pl | 132 | all     | 0                                                    |

Findings:

- `pouvoir` 1sg returns the archaic/formal `puis` ("je puis"). It is a valid French form but not what a beginner course teaches. The table says `peux`, so **this form fails the gate and `pouvoir` is not used in the first-person-singular present**. The gate caught a real divergence on the first run, which is the point of having it.
- `getAux` default is sound for the verbs we use (`aller`, `venir`, `arriver`, `rester` give ETRE, `manger` gives AVOIR) but is **not trusted**: the template declares the auxiliary per verb and a test compares it with the table.
- The §8.3 condition 3 trap is confirmed live: `aller`, ETRE, person 3, with `agreeGender` but no `agreeNumber`, returns `sommes allé` (singular). The compiler must always pass both `agreeGender` and `agreeNumber` for être verbs, and a test must prove it (the gate in §9, item 3).
- Licence: the package code is Apache-2.0, but the bundled lexicon `french-verbs-lefff/dist/conjugations.json` is the Lefff data under **LGPL-LR**. We use it as a build-time tool, not redistributed in a shipped artifact: it is **6.1 MB, so it must be a `devDependency` and never be imported from `src/` runtime code** (it would land in the web bundle). A guard test (§9, item 9) enforces that. The generated sentences are our own output.

### 2.2 Spanish: two candidates

| Library                                                       | Licence    | Last published | Present (252 forms) | Preterite (198 forms) | Verdict      |
| ------------------------------------------------------------- | ---------- | -------------- | ------------------- | --------------------- | ------------ |
| `spanish-verbs` 3.4.0 (same author family as `french-verbs`)  | Apache-2.0 | 2026-03        | 223 pass, 29 fail   | 184 pass, 14 fail     | **Use, gated** |
| `spanishconjugator` 2.0.1                                     | ISC        | 2022-05        | 18 pass, 234 fail   | 16 pass, 182 fail     | Rejected     |

`spanishconjugator` fails even `ser` and `ir` (`so`, `o`) and misspells its own mood parameter in the API (`indicitive`). Unmaintained since 2022. Rejected without further work.

`spanish-verbs` is correct on every regular verb and on many irregulars, and **fails silently** on the rest: it does not throw, it returns a plausible wrong form (`pedir` gives `pedo`, `jugar` gives `jugo`, `traer` gives `trao`). That silent failure is why the table is the authority and not an afterthought.

Per-verb result, present indicative (a verb is usable only if all six forms match):

- **Pass (34):** ser estar tener ir hacer poder querer dormir comer beber vivir leer escribir abrir comprar hablar escuchar mirar ver tomar preparar buscar encontrar poner saber dar decir venir conocer cocinar limpiar vender seguir almorzar.
- **Fail (8), excluded for the present tense:** pedir, jugar, cerrar, traer (1sg only), elegir, perder, entender, empezar. The brief asked about `pedir` and `jugar` specifically: both fail in the present, so neither is used there.

Per-verb result, preterite indicative:

- **Pass (29):** hablar comer vivir ser ir estar tener hacer poder querer jugar ver dar decir buscar comprar escribir abrir beber poner venir saber empezar encontrar tomar preparar cocinar escuchar mirar.
- **Fail (4), excluded for the preterite:** dormir (3sg `dormió` not `durmió`), pedir (`pedió` not `pidió`), leer (drops accents and the `y`), traer (no `traje` stem). Note `jugar` and `empezar` pass in the preterite although they fail in the present, so exclusion is per verb per tense, never per verb.

The stem-changing families still have coverage from passing verbs: o>ue (dormir, poder, encontrar, almorzar), e>ie (querer), e>i (seguir), plus irregular first persons (tener, hacer, poner, venir, decir, conocer, saber, dar, ver).

`ser` and `ir` share every preterite form (`fui fuiste fue ...`). The sentence's answer is checked against the one lemma hint in the prompt, so this is not ambiguous in a cloze, but the gate treats the identical forms as expected and does not flag them.

**Fallback considered and not needed:** if no Spanish library had been good enough, the authority would be the committed table alone for a small closed verb set. It is not needed, but the table is built so the library check can be deleted without weakening anything: the table is always the final word.

## 3. Pronouns (closed classes, never LLM-proposed)

**French:** `je` (`j'` before a vowel or mute h), `tu`, `il`, `elle`, `nous`, `vous`, `ils`, `elles`. `vous` is included: its verb form is unambiguous (the formal singular and plural share it) and English has one word, "you", for it. Person index for the library: je=0, tu=1, il/elle=2, nous=3, vous=4, ils/elles=5.

**Spanish:** `yo`, `tú`, `él`, `ella`, `nosotros`, `ellos`, `ellas`, `ustedes`. **`vosotros` is excluded**: the shipped Spanish course never uses it (0 occurrences) and uses `ustedes` (10), and the vocabulary is Latin American (`papa`, `durazno`, `computadora`). Teaching a form the rest of the course does not would be inconsistent. `ustedes` takes the 3pl form (library index 5). `usted` is left out to keep one person-number class per pronoun. Library person index for Spanish: yo=0, tú=1, él/ella=2, nosotros=3, (vosotros=4, unused), ellos/ellas/ustedes=5.

Subject pronouns are the only subjects, as in the English pilot. Spanish subject pronouns are not dropped in the templates (the course teaches "Yo ___ (hablar) ..." everywhere), so every generated sentence has an explicit subject.

## 4. Templates

Shape matches the English pilot: a hand-authored skeleton, a closed slot assignment, and a literal `"sentence|answer"` line that goes through the unmodified `validate`/`preview`/`apply --confirm` path.

| Id               | Language | Level | Skeleton                                   | Notes                                                    |
| ---------------- | -------- | ----- | ------------------------------------------ | -------------------------------------------------------- |
| `fr-svo-present` | fr       | A2    | `{subject} {verb} {article} {noun}.`       | transitive verb, definite or indefinite article          |
| `fr-svo-pc`      | fr       | B1    | `{subject} {aux} {participle} {article} {noun}.` | avoir verbs only; the cloze blanks the whole `ai mangé` unit |
| `fr-etre-pc`     | fr       | B1    | `{subject} {être-aux} {participle} {à/au/à la/aux} {place}.` | être verbs; subjects limited to il elle ils elles (see §4.2) |
| `es-svo-present` | es       | A2    | `{subject} {verb} {article} {noun}.`       | no `a personal` (objects are things, never people)       |
| `es-svo-preterite` | es     | A2    | same, preterite                            | only verbs that pass the preterite table in §2.2         |

Level placement follows the course: the existing French "Common Verbs (je form)" is A2 and "Passé Composé" is B1; the existing Spanish "Past Tense (yo form)" is A2. Generated content sits beside, not before, the hand-authored grammar introduction.

### 4.1 French passé composé — **included, but only because the gates cover it**

Included because the spike shows 372 of 372 forms correct and the two risks are testable:

- **Auxiliary choice** is declared per verb in the table (`avoir` or `être`) and compared with the library's choice. A disagreement fails the build.
- **Participle agreement.** With `avoir` and the object after the verb, there is no agreement, so `fr-svo-pc` is safe by construction (the object is never placed before the verb; no pronoun objects, no relative clauses). With `être`, the participle agrees with the subject in gender and number. `fr-etre-pc` therefore only uses **il, elle, ils, elles**, where the pronoun fixes the gender. `je`, `tu`, `nous`, `vous` are excluded from `être` sentences: their gender is not determined by the pronoun, and picking one would invent a fact about the learner. The compiler passes both `agreeGender` and `agreeNumber` every time, and a test proves it (§9, item 3).

### 4.2 Spanish preterite — included for the 29 passing verbs

Accent placement is the main risk (`habló` vs `hablo`). The table carries the accents and the comparison is exact, with no accent folding.

### 4.3 What is deliberately out

Negation, questions, pronoun objects (`je le mange`), reflexive verbs, adjectives, imperfect, future, subjunctive, two-verb sentences (`je veux manger`), `a personal`, and partitive articles in negation. Each introduces an agreement or word-order rule the gates in §9 do not yet cover. Out of scope until separately specified.

## 5. Articles, gender, number, elision, contraction

### 5.1 French

- Nouns carry gender (`m`/`f`) and number (`s`/`p`) taken from the shipped bank, where French nouns already appear with their article (`la mère`, `l'oncle`, `les cheveux`). **Gender is read from the article in the course data, not guessed.** For `l'`-nouns (`l'oncle`, `l'amie`) the bank's own gender word is ambiguous from the article alone, so those nouns need their gender from the committed noun table, cross-checked: a table entry must agree with every shipped line that disambiguates it (for example a `le`/`la` form of the same stem elsewhere), and a `l'` noun with no disambiguating evidence is **left out**, not guessed.
- Articles: definite `le/la/l'/les`, indefinite `un/une/des`. Plural nouns take `les`/`des` only.
- Elision: `je` becomes `j'` before a vowel or mute h in the verb (`j'aime`, `j'écoute`, `j'habite`, `j'ai`); `le`/`la` become `l'` before a vowel or mute h in the noun. **Aspirated h is the trap** (`le héros`, `la haine`): any noun or verb starting with `h` must carry an explicit `hAspire` flag in its table entry, and an `h` word without the flag fails the vocabulary gate.
- Contraction: `à + le = au`, `à + les = aux`, `à + la` unchanged, `à + l'` unchanged; `de + le = du`, `de + les = des`. Used in `fr-etre-pc` (`à la maison`, `au marché`) and, only if a template needs it, `de`.
- Capitalisation: first letter only. The cloze blank stays lowercase answer, matching `fra2p1`.
- Final punctuation: `.` with no space before it (French typography puts a space before `?`, `!`, `:`, `;`; those are out of scope here because only statements are generated).

### 5.2 Spanish

- The shipped Spanish noun data is **bare** (`casa`, `mesa`, `manzana`), with **no gender**, unlike French. The task rule is that gender must not be invented, so gender comes from a committed hand-verified noun table, and a noun is admitted only if it passes both of:
  1. an **ending rule**: `-o`, `-or`, `-aje`, `-án`, `-ón` expect masculine; `-a`, `-ción`, `-sión`, `-dad`, `-tad`, `-ud` expect feminine. Every noun whose table gender disagrees with the rule must be on an explicit, reviewed **exception list** (`mano` f, `día` m, `mapa` m, `problema` m, `agua` f, `foto` f, `moto` f, `radio` f, `pijama` m, `tomate` m, `sofá` m, ...). A noun with no rule match (`pan`, `lápiz`, `flor`, `luz`) needs a positive piece of evidence in the course data (a shipped sentence that puts an article or adjective with it) or it is **left out**.
  2. a **corpus check**: where the shipped data shows the noun next to an article, adjective or demonstrative (`la cuenta`, `una manzana`, `esa idea`), the table gender must match. A conflict fails the build.
- Articles: definite `el/la/los/las`, indefinite `un/una/unos/unas`. Plural nouns are generated only from nouns whose plural is the regular `+s`/`+es` and are verified against a table plural form, not computed (an `-z` noun becomes `-ces`; we simply avoid such nouns).
- **Feminine nouns starting with stressed `a`/`ha` (`el agua`, `el águila`) are excluded**, because they take `el` while remaining feminine and break both the agreement gate and the beginner's rule.
- Contractions: `a + el = al`, `de + el = del`. Needed only if a template uses them; `es-svo-*` does not, so this is covered by a unit test of the helper, not by shipped content.
- No inverted marks (statements only). Accents are exact: no folding anywhere in the pipeline.

## 6. Vocabulary: where it comes from

**Only words already in the shipped French/Spanish packs.** The extraction script reads the pair packs and the cloze hints and produces a candidate list; a person-reviewed, committed table (`src/data/generative/fr-lexicon.ts`, `es-lexicon.ts`) is what the generator reads. The table is not edited by any tool that talks to an LLM. Each entry records: lemma or noun, gender, number, the **source pack id and line**, an English gloss (for the explanation line and for the sample in the content PR), and a semantic **object class**.

Measured supply (French pair packs with an article-bearing noun: about 25 packs; Spanish: nouns exist in about 20 packs but bare).

**Object classes (hand-assigned per noun, from its source pack):** `food`, `drink`, `clothing`, `animal`, `school-object`, `household-object`, `vehicle`, `book-media`, `place`. **Verb to class allowlist (hand-written):** for example `manger`/`comer` accept `food`; `boire`/`beber` accept `drink`; `lire`/`leer` accept `book-media`; `porter`/`llevar` accept `clothing`; `regarder`/`mirar`/`voir`/`ver` accept `animal`, `vehicle`, `household-object`, `book-media`; `acheter`/`comprar` accept `food`, `drink`, `clothing`, `school-object`, `household-object`, `book-media`. The expander only emits an allowlisted (verb, class) pair, and a vocabulary test fails on any verb with an empty allowlist or any noun in no class. The allowlist is the only thing keeping "elle mange la chaise" out, so it is reviewed line by line in the implementation PR.

**Verb set** (first cut, all in the shipped banks and all passing §2):

- French present, transitive: aimer manger boire prendre acheter regarder écouter lire écrire voir avoir choisir finir vendre perdre mettre ouvrir apprendre préparer cuisiner chercher trouver donner porter. `pouvoir` is not used in a way that exposes the 1sg `puis` divergence. The set is capped per pack (§7), as in the English pilot.
- French passé composé avoir: the transitive subset of the above that the 40-verb table covers. French passé composé être: aller venir partir arriver rester sortir entrer rentrer.
- Spanish present: comer beber leer escribir abrir comprar escuchar mirar ver tomar preparar buscar encontrar poner dar vender cocinar limpiar tener hacer querer. Spanish preterite: the subset of those that pass the preterite column.

A verb enters a pack only if the lexicon lists it **and** the table has all its forms **and** the library matches. A new verb is a three-way edit (lexicon, table, library check), so a verb can never reach a lesson half-verified.

## 7. From a generated item to a lesson question

Same path as the English pilot, unchanged downstream:

1. The expander builds `"sentence|answer"` lines. Example (French): `Je ___ (manger) une pomme.|mange`; (Spanish): `Ella ___ (comer) una manzana.|come`. The parenthetical hint is the verb's infinitive, matching the existing `fra2p1` and `esa1p5` lines.
2. A line becomes a `cloze` pack, `kind: "cloze"`, run through `validate`, `preview` and `apply --confirm`. `bank-engine.ts` turns each line into an `mc` or `fill` question exactly as for the hand-authored packs (hash-chosen, 4 choices, distractors pooled from the pack's answers). **No change to `bank-engine.ts`.**
3. Question types are therefore the ones the English pilot produced: `mc` and `fill`. `translate` is not generated (it would need an English-side grammar this work does not build).
4. English meaning is **not** a question field. It is used in two places only: the question's explanation line (`"mange" is correct here. ...`, as today) and the owner-spot-check sample table in the content PR. It is composed from the lexicon's English glosses with a hand-written English verb form per lexicon entry, never from `compromise`.

**Distractors.** Pool distractors inherit the existing weakness the French audit documented (§8.1): a different verb's conjugation is an easy, vocabulary-not-conjugation distractor. We do not change the engine. We bound the damage with two measures: a pack uses at most 4 verbs (as in the English pilot), and sentences are stratified across subjects so the answers in a pack are spread over person forms. Quality is then **measured, not assumed**, by the gates in §9 (item 6) against the same thresholds the existing French and Spanish distractor tests use.

**Volume (quality over volume):**

| Language | Packs | Questions | Lessons (5 each) | Level |
| -------- | ----- | --------- | ---------------- | ----- |
| French present | 4 themed (food, drinks and shopping, school and home, animals and transport) x 25 | 100 | 20 | A2 |
| French passé composé | 2 avoir packs x 20, 1 être pack x 20 | 60 | 12 | B1 |
| Spanish present | 4 themed x 25 | 100 | 20 | A2 |
| Spanish preterite | 2 packs x 20 | 40 | 8 | A2 |

About 300 questions in total, each pack's verb pool capped at 4. If a pack cannot reach its size without a repeated prompt or a failed gate, it ships smaller; the gates win over the target. Pack ids use a distinct prefix (`frg`, `esg`) so a generated pack is recognisable and never collides with hand-authored ids; the content PR also checks the placement-overlap guard.

## 8. Mechanics of the pipeline change (implementation PR)

- `Template` gains `lang` and the French/Spanish slot kinds; the English path is untouched and its tests must stay green.
- `pack-tool generate --course fr|es --template <id> --topic <topic>` **no longer calls the LLM vocabulary proposer for fr/es**. It reads the committed lexicon for the topic. (`NVIDIA_API_KEY` is required only for `--course en`.)
- `bun add -d french-verbs french-verbs-lefff spanish-verbs` (exact versions pinned). They are used only from `scripts/` and `*.test.ts`.
- New files, all under `src/data/generative/`: `fr-lexicon.ts`, `es-lexicon.ts`, `fr-verb-table.ts`, `es-verb-table.ts`, `compile-fr.ts`, `compile-es.ts`, plus tests.

## 9. Validation gates (each is a test, each is mutation-checked)

Every gate is verified by deliberately breaking **the property it claims to guard**, one at a time, and seeing that gate go red (and only after confirming it was green before). The mutation list is recorded in the implementation PR.

1. **Verb form = library = committed table.** For every (verb, tense, person) the lexicon uses, `library form === table form`. Plus: no verb is used in any generated line unless it is in the table (a generated line's verb is looked up in the table, not the library). Mutations: change one table cell; change one library-returning cell via a stub; add a verb to the lexicon but not the table; each must fail.
2. **Gender and number agreement.** Article gender and number match the noun's table gender and number; the Spanish ending-rule-with-exceptions check and the corpus check run over the lexicon. Mutation: flip one noun's gender; swap `la` for `le` in a template.
3. **Passé composé agreement and auxiliary.** Auxiliary matches the table; for être sentences the participle agrees with the subject in gender and number; **the compiler always passes `agreeNumber`**. Mutations: drop `agreeNumber` from the call (this reproduces the `sommes allé` result of §2.1 and must be caught); declare `aller` as AVOIR.
4. **Elision, contraction, spacing, capitalisation, punctuation.** `j'` / `l'` before vowels and mute h, none before aspirated h; `au/aux/du/des`; Spanish `al/del`; no double space, no space before `.`, a single trailing `.`, first letter capital, rest as written, no `--`. Mutation: remove the elision rule; remove the aspirated-h flag from `héros`.
5. **The course's own checkers accept the answer and reject every wrong option.** For each generated question, `deriveAnswerCorrectness(question, answer, course)` is true for the intended answer and false for every distractor. (For cloze `fill` this is exact case-insensitive equality; for `mc` it is choice equality.) A second check proves no distractor equals the answer once accents are folded with `normaliseSpoken`, so a spoken or typed variant cannot slip a wrong form through (`habló` vs `hablo`). Mutation: add the answer to its own distractor list; add its unaccented twin as a distractor.
6. **No duplicate prompt in the course, distractor quality.** No generated prompt equals any existing question prompt in that course (normalised with `normaliseWritten`), and none repeats within the pack. The generated packs are included in the scope of `pair-distractor-quality`, `spanish-distractor-quality` and the French equivalent (extending those tests' scans to the new packs, with the existing thresholds, not looser ones). Mutation: append an existing hand-authored line to a generated pack.
7. **Semantic allowlist.** Every (verb, noun-class) pair in a generated line is on the allowlist, and the allowlist has no empty verb. Mutation: add a forbidden pair to the expander.
8. **`curriculum-consistency.test.ts` passes**, including the no-`--` guard, unchanged.
9. **Runtime isolation.** A guard test fails if any file under `src/` outside `src/data/generative/*.test.ts` imports `french-verbs`, `french-verbs-lefff` or `spanish-verbs` (the 6 MB Lefff JSON must never reach a client bundle). Mutation: add such an import to a `src/` file.

Also unchanged and required in CI: `bun scripts/export-ios-content.ts` and `bun scripts/export-android-content.ts` must be re-run in the content PR, or the stale-bundle check fails.

## 10. Verb tables used in the spike (what gets committed)

Hand-verified present tables: être avoir aller faire prendre apprendre comprendre vouloir pouvoir venir savoir dire voir boire lire écrire mettre ouvrir partir dormir vendre attendre perdre finir choisir parler aimer manger regarder écouter chercher trouver donner porter préparer cuisiner jouer travailler acheter appeler préférer commencer nettoyer (43). Spanish present (42 tried, 34 pass) and preterite (33 tried, 29 pass) as in §2.2. Passé composé participles for the 40 French verbs plus the 11 être verbs. The spike deliberately includes traps (`acheter`, `appeler`, `préférer`, `commencer`, `nettoyer`, `manger` for spelling changes; `jugar`, `pedir`, `cerrar` for stem changes) to see whether the library catches them. The French library did; the Spanish one did not for eight verbs.

The implementation PR commits the tables for exactly the verbs it uses, not the whole spike set.

## 11. Risks and what we are not claiming

- **The hand tables are written by one author (an AI agent) and checked against a library by the same agent.** Where they agree, two independent sources agree (the library is not derived from the table). Where a verb is wrong in **both** the table and the library the same way, no gate here sees it. The mitigation is breadth of checks (spelling changes, stem changes, accent placement) and keeping the verb set to forms a beginner course teaches. The sample in the content PR lets the owner spot-check by eye. We make no claim of native-speaker review.
- Meaning-level errors the allowlist did not foresee (a sensible-looking pair that is odd in practice) are possible. The allowlist is conservative on purpose, and the sample exposes them.
- Distractor quality inherits `bank-engine.ts`'s pooled behaviour. Better generated distractors (other forms of the line's own verb, §8.3 of the French audit) remain a separate, unscheduled design.
- The 6 MB Lefff lexicon is LGPL-LR data. It stays a dev tool (§9, item 9). If a later change wanted it at runtime, the licence needs a fresh look.
