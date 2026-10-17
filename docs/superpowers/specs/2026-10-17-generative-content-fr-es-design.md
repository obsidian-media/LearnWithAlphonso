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
- `getAux` is **wrong for dual-auxiliary verbs**, measured: `aller venir arriver rester partir entrer tomber` give ETRE (and `alwaysAuxEtre` is true), but `rentrer sortir monter descendre passer retourner` give AVOIR (`alwaysAuxEtre` false). Those six take être when intransitive ("elle est rentrée") and avoir with an object. An earlier draft of this spec called the default sound; that was wrong. The rule is now: the table declares the auxiliary per verb; the gate compares it with `alwaysAuxEtre` **only for always-être verbs**; dual-auxiliary verbs carry a table flag `intransitiveOnly: être`, and a test proves no template ever gives such a verb an object (§9, item 3).
- The §8.3 condition 3 trap is confirmed live: `aller`, ETRE, person 3, with `agreeGender` but no `agreeNumber`, returns `sommes allé` (singular). The compiler must always pass both `agreeGender` and `agreeNumber` for être verbs, and a test must prove it (the gate in §9, item 3).
- Licence: the package code is Apache-2.0, but the bundled lexicon `french-verbs-lefff/dist/conjugations.json` is the Lefff data under **LGPL-LR**. We use it as a build-time tool, not redistributed in a shipped artifact: it is **6.1 MB, so it must be a `devDependency` and never be imported from `src/` runtime code** (it would land in the web bundle). A guard test (§9, item 9) enforces that. The generated sentences are our own output. Further rules: (1) **no extract of `conjugations.json` is ever committed**, not even a fixture; our committed tables are hand-written and independent of it. (2) The package metadata labels the whole package Apache-2.0 while the bundled data is LGPL-LR; that mislabel is recorded in the repo's third-party notices file in the implementation PR, with the data's real licence and our dev-only use. (3) Gate 9 also covers `scripts/export-*` and dynamic `import()` / `require`, and adds a built-bundle check for a Lefff marker string.

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

### 2.3 How independent are the sources? (honest accounting, and the fix)

- `spanish-verbs` is a rule-based fork of the `conjugator` package. It is also known to get `servir`, `repetir`, `vestir`, `preferir` and `mentir` wrong, beyond the eight verbs the spike found. **Its agreement with our table is therefore weak evidence**: it is a rules engine, not an independent lexicon, and it passes whatever its rules happen to produce. The same author wrote the table and ran the library, so a shared blind spot is possible. Library agreement is a tripwire against typos in the table, not proof of correctness.
- The French Lefff data is a real lexicon (independent of the table) and is stronger evidence than the Spanish rules engine.

Two further checks are added so correctness does not rest on the library plus one author's table:

- **(a) In-repo cross-check.** A test reads every existing hand-authored cloze line shaped `Pronoun ___ (infinitive)|form` (for example `fra2p1`, `frb1p1`, `esa1p5`, and the other conjugation packs) and checks the form against our table for that (verb, person, tense). It also reads every `article noun` pair in the French bank and checks it against the noun table. The existing course content was written and reviewed separately, so this is independent evidence for every verb and noun it covers. Where the course and the table disagree, the build fails and a person decides which is wrong.
- **(b) Wiktionary as a check-only third source.** A local script (not run in CI; no Wiktionary data is committed) reads the kaikki.org JSONL extracts (CC BY-SA) for French and Spanish, looks up every lexicon verb form and noun gender, and writes a short **summary file** (counts, plus the list of disagreements) that is committed. A disagreement blocks a verb or noun until resolved. Only the summary is committed, which keeps the CC BY-SA data out of the repo. The script runs in the implementation PR and its summary is part of that PR.

Coverage claim: a verb or noun counts as "three-source verified" only when the table, the library (or the Lefff lexicon) and Wiktionary agree, and it is additionally course-verified where (a) covers it. The implementation PR reports the count in each bucket.

## 3. Pronouns (closed classes, never LLM-proposed)

**French:** `je` (`j'` before a vowel or mute h), `tu`, `il`, `elle`, `nous`, `vous`, `ils`, `elles`. `vous` is included: its verb form is unambiguous (the formal singular and plural share it) and English has one word, "you", for it. Person index for the library: je=0, tu=1, il/elle=2, nous=3, vous=4, ils/elles=5.

**Spanish:** `yo`, `tú`, `él`, `ella`, `nosotros`, `ellos`, `ellas`, `ustedes`. **`vosotros` is excluded**: the shipped Spanish course never uses it (0 occurrences) and uses `ustedes` (10), and the vocabulary is Latin American (`papa`, `durazno`, `computadora`). Teaching a form the rest of the course does not would be inconsistent. `ustedes` takes the 3pl form (library index 5). `usted` is left out to keep one person-number class per pronoun. Library person index for Spanish: yo=0, tú=1, él/ella=2, nosotros=3, (vosotros=4, unused), ellos/ellas/ustedes=5.

Subject pronouns are the only subjects, as in the English pilot. Spanish subject pronouns are not dropped in the templates (the course teaches "Yo ___ (hablar) ..." everywhere), so every generated sentence has an explicit subject.

## 4. Templates

Shape matches the English pilot: a hand-authored skeleton, a closed slot assignment, and a literal `"sentence|answer"` line that goes through the unmodified `validate`/`preview`/`apply --confirm` path. In every template the **blank is the verb unit only** (the finite verb, or the whole auxiliary plus participle in the passé composé); the subject pronoun, article and noun are fixed text.

| Id                 | Language | Level | Skeleton                                                  | Notes                                                                                   |
| ------------------ | -------- | ----- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fr-svo-present`   | fr       | A2    | `{subject} ___ ({infinitive}) {np}.`                      | `np` = article (kind chosen per §5.3) + noun                                            |
| `fr-svo-pc`        | fr       | B1    | `{subject} ___ ({infinitive}) {np}.` (answer `a mangé`)   | avoir verbs only; never `je` (see §4.4)                                                 |
| `fr-etre-pc`       | fr       | B1    | `{subject} ___ ({infinitive}) {place-phrase}.`            | aller venir arriver rester rentrer only; subjects il elle ils elles (§4.1)              |
| `es-svo-present`   | es       | A2    | `{subject} ___ ({infinitive}) {np}.`                      | no personal `a` (objects are things; animals indefinite only, §5.2)                     |
| `es-svo-preterite` | es       | A2    | same, preterite                                           | only verbs that pass the preterite table in §2.2                                        |

Level placement follows the course: the existing French "Common Verbs (je form)" is A2 and "Passé Composé" is B1; the existing Spanish "Past Tense (yo form)" is A2. Generated content sits beside, not before, the hand-authored grammar introduction.

### 4.1 French passé composé — included, with the risks closed one by one

- **Auxiliary.** Declared per verb in the table. Compared with the library's `alwaysAuxEtre` **only for always-être verbs** (`aller venir arriver rester`). `rentrer` is dual-auxiliary (the library's `getAux` says AVOIR, §2.1), so it carries `intransitiveOnly: être`; a test proves no template gives it an object. `sortir monter descendre passer retourner` are not used at all.
- **Participle agreement.** With `avoir` and the object after the verb there is no agreement, so `fr-svo-pc` is safe by construction (no pronoun objects, no relative clauses, object never before the verb). With `être` the participle agrees with the subject, so `fr-etre-pc` uses only **il, elle, ils, elles**. `je`, `tu`, `nous`, `vous` are excluded from `être` sentences. The compiler always passes both `agreeGender` and `agreeNumber` (§9, item 3).
- **Place phrases.** `fr-etre-pc` is restricted to `aller`, `venir`, `arriver`, `rester`, `rentrer`. Each place noun carries hand-written phrases per relation, written out in full (never composed by a preposition rule): `to` (`à la maison`, `au marché`, `à l'école`), `at` (`à la maison`, `chez le médecin` only where the shipped data has the person), `from` (`de la maison`, `du marché`). A hand-written **(verb, place) allowlist** says which relation each verb uses and which places are natural: `aller` + `to`; `arriver` + `to`; `venir` + `from` (`Elle est venue du marché.`); `rester` + `at` (`Ils sont restés à la maison.`); `rentrer` + `to` and only for `maison` and `école`. Countries (`en France`) and `chez` phrases enter only if the shipped data contains the noun, and each is written out and allowlisted individually. Gate: §9, item 3.

### 4.2 Spanish preterite — included for the 29 passing verbs

Accent placement is the main risk (`habló` vs `hablo`). The table carries the accents and comparison is exact, with no accent folding. A pack never mixes present and preterite answers.

### 4.3 What is deliberately out

Negation, questions, pronoun objects (`je le mange`), reflexive verbs, adjectives, imperfect, future, subjunctive, two-verb sentences (`je veux manger`), personal `a`, and partitive articles in negation. Each introduces an agreement or word-order rule the gates in §9 do not yet cover.

### 4.4 Elision inside the cloze (French)

The blank holds the verb only, so `J'___` would leak the answer's first sound and `Je ___` before a vowel is ungrammatical. Rules:

- **`je` is used only with consonant-initial verbs in the present.** Vowel-initial and mute-h verbs (`aimer`, `écouter`, `acheter`, `écrire`, `ouvrir`, `avoir`, `apprendre`, `habiter`) are used with every subject **except `je`**.
- **Pack composition:** a pack's verbs are all consonant-initial (any subject, including `je`) or all vowel/mute-h-initial (no `je`). Because the distractor pool is the pack's own answers, this guarantees no distractor begins with a vowel in a `Je ___` line, so a wrong option is never wrong merely because of elision.
- **The passé composé never uses `je`** with avoir verbs (the unit `ai mangé` would force `J'___`). `fr-etre-pc` already excludes `je`.
- **The gate tests the completed sentence for every choice**, answer and distractors alike: substitute each choice into the blank and run the elision checker on the result. The answer must pass entirely. A distractor may be wrong only because of its verb form; if its completed sentence also has an elision defect, the build fails (§9, item 4).

## 5. Articles, countability, gender, number, elision, contraction

### 5.1 French

- Nouns carry gender (`m`/`f`), number (`s`/`p`) and **countability** (`count` or `mass`) in the committed noun table. Gender comes from the article in the shipped data (`la mère`, `l'oncle`, `les cheveux`). For `l'` nouns the article does not show gender, so the table entry must be backed by a disambiguating shipped line or the third source (§2.3); otherwise the noun is **left out**.
- **Mass nouns take the partitive**, as the course already does (`fra2p1`: `de l'eau`, `du pain`): `du` (m), `de la` (f), `de l'` (vowel or mute h), `des` (plural). Mass nouns never take `un/une`. Count nouns take `un/une/des` or `le/la/l'/les`.
- **Elision.** `le`/`la` become `l'` before a vowel or mute h; `de la` becomes `de l'`. **Every noun and verb whose spelling begins with a vowel, `h`, `y` or `w` must carry an explicit `elides: true|false` flag** (this covers aspirated h: `le héros`, `les haricots`, `le handball`, `la hauteur`, `la honte`, and the y-initial words that do not elide: `le yoga`, `le yaourt`). A missing flag fails the vocabulary gate; the flag is checked against a small committed list of known cases.
- **Contraction** (hand-written, tested including the h-aspiré and y cases): `à + le = au`, `à + les = aux`, `à + la` and `à + l'` unchanged; `de + le = du`, `de + les = des`. Examples the tests pin: `au marché`, `au héros` (not `à l'héros`), `aux haricots`, `du yaourt` (not `de l'yaourt`), `de l'école`.
- Capitalisation: first letter only; the blank's answer is lowercase, matching `fra2p1`. Final punctuation is `.` with no space before it (statements only).

### 5.2 Spanish

- The shipped Spanish noun data is **bare** (`casa`, `mesa`), with **no gender**. Gender is never inferred. A noun is admitted only with **positive evidence**, one of:
  1. **corpus evidence**: an article, demonstrative or agreeing adjective next to the noun in shipped Spanish data (`la cuenta`, `una manzana`, `esa idea`, `casa grande`); or
  2. **the third source** (§2.3, Wiktionary) agreeing with the table **and** the in-repo cross-check where it applies.
  The ending rule (`-o` m, `-a` f, `-ción` f) is demoted to a **tripwire only**: it flags a table entry that disagrees, which then needs explicit review. It is not evidence, because it is not independent of how we would write the table (`razón`, `opinión`, `región`, `religión` are feminine yet end in `-ón`, which the old rule listed as masculine).
- **Stressed-a feminine nouns.** Every noun beginning with `a`, `á`, `ha` or `há` must carry an explicit `stressedA: true|false` flag (`aula`, `agua`, `hambre`, `arma`, `águila`, `hacha`, `alma`). Stress is not computable from spelling, so a missing flag fails the build. Nouns flagged `true` are **excluded from the first release**: they take `el`/`un` while feminine and break the agreement gate and the beginner's rule.
- **Countability and articles.** Nouns carry `count|mass`. **Mass nouns use the bare noun** (`Yo bebo leche.`), never `la/una`. Plural count nouns may be bare (`Ella compra manzanas.`) or definite (`los/las`); singular count nouns take `un/una` or `el/la` per §5.3. Plurals are table entries, not computed.
- **Animals take the indefinite only** (`Veo un perro.`, `Tengo un gato.`), never a definite animal object. A definite animal object invites the personal `a` (`Veo al perro`), which is out of scope (§4.3). Objects that are things never take personal `a`.
- Contractions `a + el = al`, `de + el = del`: no shipped template uses them; the helper has a unit test.
- No inverted marks (statements only). Accents are exact: no folding anywhere in the pipeline.

### 5.3 Article choice is hand-written per (verb, class)

Grammatical agreement does not make the article natural: `J'ai le chien`, `J'aime une pomme`, `Yo tengo la manzana` are well formed and wrong in this context. For every (verb, noun-class) pair on the allowlist (§6) the table lists the **article kinds allowed**, from `definite`, `indefinite`, `partitive` (French mass), `bare` (Spanish mass, Spanish bare plural). Examples:

| Verb (fr / es)          | Class                | Allowed article kinds                                           |
| ----------------------- | -------------------- | --------------------------------------------------------------- |
| avoir / tener           | animal, object       | indefinite only (`J'ai un chien`, `Tengo un gato`)              |
| aimer (French only; `gustar` is out of scope) | food, drink, animal  | definite (`J'aime les pommes`, `J'aime le thé`)                 |
| manger / comer          | food (count)         | indefinite, definite plural (`Il mange une pomme`)              |
| manger / comer          | food (mass)          | partitive / bare (`Elle mange du pain`, `Ella come pan`)        |
| boire / beber           | drink (mass)         | partitive / bare (`Je bois de l'eau`, `Yo bebo leche`)          |
| lire / leer             | readable (count)     | indefinite or definite                                          |
| ver / voir / regarder   | animal               | indefinite (es); indefinite or definite (fr)                    |
| porter / llevar, mettre | clothing             | indefinite or definite                                          |

The compiler picks only among the allowed kinds; a test checks each emitted line's article kind against the table (§9, item 2).

## 6. Vocabulary: where it comes from

**Only words already in the shipped French/Spanish packs.** The extraction script reads the pair packs and the cloze hints and produces a candidate list; a person-reviewed, committed table (`src/data/generative/fr-lexicon.ts`, `es-lexicon.ts`) is what the generator reads. The table is not edited by any tool that talks to an LLM. Each entry records: lemma or noun, gender, number, countability, the **source pack id and line**, an English gloss (used only in the owner sample, never in learner text, §7), and its semantic classes.

**Meaning allowlist, finer than before.** Classes are fine-grained, assigned per noun by hand, and some are an explicit per-noun flag rather than inherited from the source pack:

- `food-count`, `food-mass`, `drink`, `clothing`, `animal`, `school-object`, `household-object`, `vehicle`, `place` (for §4.1 only);
- `readable` (livre, journal, cahier... / libro, cuaderno...), `watchable` (an explicit flag on nouns one actually watches: animals, vehicles, screens, films; **not** all household objects), `listenable` (musique, radio...).

**Verb to class allowlist (hand-written, reviewed line by line in the implementation PR).** Examples: `manger`/`comer` accept `food-count`, `food-mass`; `boire`/`beber` accept `drink`; `lire`/`leer` accept `readable`; `porter` and `mettre` accept `clothing` (this is the **only** class `mettre` accepts); `regarder`/`voir`/`mirar`/`ver` accept `watchable`; `écouter`/`escuchar` accept `listenable`; `acheter`/`comprar` accept the consumables, `clothing`, `school-object`, `readable`; `avoir`/`tener` accept `animal`, `school-object`, `household-object`; `préparer`/`cuisiner`/`preparar`/`cocinar` accept `food-*`. **Dropped:** `donner`/`dar` (they need an indirect object) and `poner`, plus `mettre`/`poner` outside clothing. Where a class is still too coarse for a verb, the allowlist is written at **(verb, noun)** level instead. The example this must exclude is `regarder la fourchette`.

The expander only emits an allowlisted pair. The vocabulary test fails on any verb with an empty allowlist, any noun in no class, and prints every distinct (verb, class) pair to be read in review.

**Verb set** (first cut; all in the shipped banks and all passing §2):

- French present, transitive: aimer manger boire prendre acheter regarder écouter lire écrire voir avoir choisir finir vendre perdre ouvrir apprendre préparer cuisiner chercher trouver porter, and `mettre` (clothing only). Vowel-initial verbs follow §4.4.
- French passé composé avoir: the subset of the above with participles in the table. French passé composé être: aller venir arriver rester rentrer.
- Spanish present: comer beber leer escribir abrir comprar escuchar mirar ver tomar preparar buscar encontrar vender cocinar limpiar tener querer. Spanish preterite: the subset that passes the preterite column.

A verb enters a pack only if the lexicon lists it, the table has all its forms and the library matches. A new verb is a three-way edit (lexicon, table, library check), so a verb never reaches a lesson half-verified.

## 7. From a generated item to a lesson question

Same path as the English pilot, unchanged downstream:

1. The expander builds `"sentence|answer"` lines. Example (French): `Elle ___ (manger) du pain.|mange`; (Spanish): `Ella ___ (comer) una manzana.|come`. The parenthetical hint is the verb's infinitive, matching `fra2p1` and `esa1p5`.
2. A line becomes a `cloze` pack run through `validate`, `preview` and `apply --confirm`. `bank-engine.ts` turns each line into an `mc` or `fill` (tap-the-word) question as for hand-authored packs (hash-chosen, 4 choices, distractors pooled from the pack's answers). **No change to `bank-engine.ts`.**
3. Question types are therefore `mc` and `fill`. `translate` is not generated.
4. **The English gloss stays out of learner text.** The existing explanation line (`"mange" is correct here. <note>`) has no per-line slot for a gloss, and adding one means a `bank-engine.ts` change, which is out of scope. The gloss is used only by a script that prints the **owner spot-check sample** (sentence, English meaning) for the content PR body. English forms come from the lexicon's hand-written glosses, never from `compromise`.

**Distractors: a real threshold, not a pinned count.** The existing distractor-quality tests pin measured counts, which would pass a regression that stayed under the pin. For these packs we define a quantity and a floor:

- **Same-verb share** = (distractors that are a form of the same hinted verb as the line) / (all distractors) over a pack. A same-verb distractor tests conjugation; a different-verb distractor tests only vocabulary (French audit §8.1).
- **Floor: at least 40% per pack**, asserted as a floor in the test, not pinned at the measured value. The implementation PR reports the measured figure.
- **Pack composition that meets it:** at most **2 verbs per pack**, sentences stratified across subjects so each verb's person forms are all present. With 2 verbs the pool has roughly half same-verb answers, which is why the floor is 40% and not higher.
- The existing `pair-distractor-quality`, `spanish-distractor-quality` and French equivalent scans still run over the new packs unchanged.

**Volume (quality over volume).** Smaller packs of two verbs each, 15 questions (3 lessons) per pack:

| Language             | Packs                                   | Questions | Lessons | Level |
| -------------------- | --------------------------------------- | --------- | ------- | ----- |
| French present       | 6 (food, drinks, clothing, school, animals, media; each 2 verbs) | 90 | 18 | A2 |
| French passé composé | 2 avoir packs + 2 être packs            | 60        | 12      | B1    |
| Spanish present      | 6 themed, 2 verbs each                  | 90        | 18      | A2    |
| Spanish preterite    | 3 packs, 2 verbs each                   | 45        | 9       | A2    |

About 285 questions in total. If a pack cannot reach its size without a repeated prompt, a failed gate or an unnatural pair, it ships smaller; the gates win over the target. Pack ids use a distinct prefix (`frg`, `esg`); the content PR also checks the placement-overlap guard.

## 8. Mechanics of the pipeline change (implementation PR)

- `Template` gains `lang` and the French/Spanish slot kinds; the English path is untouched and its tests must stay green.
- `pack-tool generate --course fr|es --template <id> --topic <topic>` **does not call the LLM vocabulary proposer for fr/es**. It reads the committed lexicon. (`NVIDIA_API_KEY` is required only for `--course en`.)
- `bun add -d french-verbs french-verbs-lefff spanish-verbs` (exact versions pinned). Used only from `scripts/` and `*.test.ts`.
- New files under `src/data/generative/`: `fr-lexicon.ts`, `es-lexicon.ts`, `fr-verb-table.ts`, `es-verb-table.ts`, `compile-fr.ts`, `compile-es.ts`, plus tests. A local script `scripts/check-wiktionary.ts` (not in CI) and its committed summary.

## 9. Validation gates (each is a test, each is mutation-checked)

Every gate is verified by breaking **the property it claims to guard**, one change at a time, after confirming it was green before. The mutation list is recorded in the implementation PR.

1. **Verb form = library = committed table, plus the two independent checks.** For every (verb, tense, person) the lexicon uses, `library form === table form`. No verb appears in a generated line unless it is in the table. The **in-repo cross-check** (§2.3a) compares the table with every existing hand-authored `Pronoun ___ (infinitive)|form` cloze line and every French article-noun pair. Mutations: change one table cell; stub one library cell; add a verb to the lexicon but not the table; change a table cell that an existing course line covers (the cross-check must catch it).
2. **Agreement, countability and article kind.** Article gender and number match the noun table; **a mass noun is never given `un/une/le/la` in a counted role (French partitive, Spanish bare)**; every emitted (verb, class, article kind) is in the §5.3 table (no `J'ai le chien`, `J'aime une pomme`, `Yo tengo la manzana`); animals in Spanish are indefinite only; the Spanish noun table has positive evidence for every entry and an explicit `stressedA` flag on every a-/á-/ha-/há- noun. Mutations: flip a gender; mark `pain` as count; allow `definite` for `avoir`; drop a `stressedA` flag.
3. **Passé composé.** Auxiliary matches the table, compared with `alwaysAuxEtre` only for always-être verbs; dual-auxiliary verbs carry `intransitiveOnly: être` and no template gives them an object; for être sentences the participle agrees with the subject in gender and number; the compiler always passes `agreeNumber`; every `fr-etre-pc` place phrase is a hand-written entry and its (verb, place, relation) is on the allowlist. Mutations: drop `agreeNumber` (reproduces `sommes allé`); declare `aller` as AVOIR; give `rentrer` an object; use a `from` phrase with `aller`.
4. **Elision, contraction, typography, cloze elision.** `l'` / `de l'` before vowels and mute h; none before an `elides: false` word (`héros`, `haricots`, `yaourt`); `au/aux/du/des` including `au héros`; Spanish `al/del`; no double space, no space before `.`, one trailing `.`, first letter capital, no `--`. **The completed sentence is checked for every choice**: the answer must be defect-free; a distractor must have no elision defect (§4.4). `je` never appears with a vowel-initial verb, a pack is all-consonant or all-vowel, and the avoir passé composé never uses `je`. Mutations: remove an elision rule; clear `elides` on `héros`; put `aimer` in a `je` pack; allow `je` in an avoir passé composé line.
5. **Checker accepts the answer; no distractor is a correct form.** `deriveAnswerCorrectness(question, answer, course)` accepts the intended answer. For every distractor, it is **not a correct form for that line's subject, verb and tense per the table, counting all accepted variants** (the table stores every valid spelling: `paie`/`paye`, participle gender variants). A distractor that coincides with another person's form of the same verb, but is also valid for this person (`mange` for `je` and `il`), fails here. A second check rejects a distractor that equals the answer once accents are folded (`habló`/`hablo`) so a typed or spoken variant cannot pass as a wrong option. (The plain `distractor !== answer` check is deliberately not the gate: `pickDistractors` already drops the answer, so that assertion could not fail.) Mutations: add a valid variant spelling to the distractors; add the unaccented twin of the answer.
6. **No duplicate prompt, same-verb share.** No generated prompt equals any existing question prompt in that course (normalised with `normaliseWritten`) or another in the pack. **Same-verb share per pack is at least 40%** and a pack has at most 2 verbs. The existing distractor-quality scans pass over the new packs. Mutations: append an existing hand-authored line; build a 4-verb pack (the floor must fail).
7. **Meaning allowlist.** Every (verb, class) and every (verb, noun) override in a generated line is on the allowlist; no verb has an empty allowlist; `mettre` accepts clothing only. Mutations: add `watchable` to a fork; give `mettre` `food-count`; add `regarder` + `fourchette`.
8. **`curriculum-consistency.test.ts` passes**, including the no-`--` guard, unchanged.
9. **Runtime and licence isolation.** A guard fails if any file under `src/` (outside `src/data/generative/*.test.ts`) or any `scripts/export-*` file imports `french-verbs`, `french-verbs-lefff` or `spanish-verbs`, by static `import`, dynamic `import()` or `require`. A second check scans the built web bundle for a Lefff marker string (a distinctive rare verb form from `conjugations.json`), and a third scans the repo for any committed file containing a long run of lexicon entries. Mutations: add each kind of import to a `src/` file; paste a lexicon fragment into a fixture.

Also required in CI: `bun scripts/export-ios-content.ts` and `bun scripts/export-android-content.ts` re-run in the content PR, or the stale-bundle check fails.

## 10. Verb tables used in the spike (what gets committed)

Hand-verified present tables: être avoir aller faire prendre apprendre comprendre vouloir pouvoir venir savoir dire voir boire lire écrire mettre ouvrir partir dormir vendre attendre perdre finir choisir parler aimer manger regarder écouter chercher trouver donner porter préparer cuisiner jouer travailler acheter appeler préférer commencer nettoyer (43). Spanish present (42 tried, 34 pass) and preterite (33 tried, 29 pass) as in §2.2. Passé composé participles for 40 avoir verbs plus 11 être verbs. The spike deliberately includes traps (`acheter`, `appeler`, `préférer`, `commencer`, `nettoyer`, `manger` for spelling changes; `jugar`, `pedir`, `cerrar` for stem changes). The French library handled them; the Spanish one did not for eight verbs. The verbs in §6 are a subset of what the spike tested. `servir repetir vestir preferir mentir` were not in the spike set and are added to the Spanish spike tables in the implementation PR (reported as likely failures).

The implementation PR commits tables for exactly the verbs it uses, not the whole spike set.

## 11. Risks and what we are not claiming

- **The tables are written by one author (an AI agent).** The library check is a tripwire, not independent proof, especially for Spanish (§2.3). The independence comes from the in-repo cross-check of existing hand-authored content and from the Wiktionary check. A form wrong in the table, the library, Wiktionary and the existing course would pass; that is unlikely but not excluded. The owner sample lets a person spot-check by eye. We make no claim of native-speaker review.
- Meaning-level errors the allowlist did not foresee are possible. The allowlist is conservative, written at (verb, noun) level where classes are coarse, and the sample exposes the rest.
- Distractor quality inherits `bank-engine.ts`'s pooled behaviour; the 40% same-verb floor bounds it. Generating other forms of the line's own verb as distractors (French audit §8.3) remains a separate, unscheduled design.
- The 6 MB Lefff lexicon is LGPL-LR data and stays a dev tool (§9, item 9, and §2.1). If a later change wanted it at runtime, the licence needs a fresh look.

## 12. Implementation notes (what changed from the design while building it)

- **One verb per pack.** The measured same-verb share of a two-verb pack was about 31%, under the 40% floor, because `bank-engine` pools a pack's answers. Every pack now drills a single verb (100% of wrong options are other persons' forms of it). The gate still allows two verbs and holds the 40% floor. Volume became 18 French and 9 Spanish packs of up to 15 questions, rather than fewer two-verb packs.
- **Tense marker.** Past sentences start with `Hier,` / `Ayer,`. Without it a passé composé or preterite line would read exactly like the present-tense line for the same subject and noun, which is an ambiguous question.
- **Pack size.** The engine's distractor walk steps by 7, so a pool whose size is a multiple of 7 can leave a question with fewer than three distinct wrong options. The generator tries 15 questions and falls back to 14, 13 or 12; a test requires four distinct choices on every question.
- **Existing prompts.** Candidates that already exist in the course (for example `Je ___ (boire) de l'eau.`) are filtered out at generation time.
- **Agreement strings are table data.** The compiler never calls the library; the table's four written-out être participles are the source, and the test compares them with the library with `agreeNumber` passed.
- **Unused verbs.** `cuisiner prendre mettre ouvrir regarder choisir rentrer` (French) and `preparar tomar buscar mirar abrir querer` (Spanish) are verified and allowlisted but not used by any shipped pack.
- **Wiktionary rule.** A present form tagged only "indicative" (no other tense) counts as present; a participle form listed in the base participle's own inflection line counts as confirmed.
