# Grader word lists

`en.ts`, `fr.ts` and `es.ts` are the "is this a real word?" lists the written-answer grader uses
(`isRealWord` in `src/lib/grader-words.ts`). A word the learner wrote that is itself a real word of the course's
language, and that differs from the expected word, is a wrong word and never a spelling slip (open item 96).
`supabase/functions/_shared/grader-words/` holds byte-identical copies for the Edge Functions (they cannot import from
`src/`); `src/lib/grader-words-parity.test.ts` fails when they differ.

## Source and licence

- Source: FrequencyWords by Hermit Dave, the 2018 `en_50k.txt`, `fr_50k.txt` and `es_50k.txt` word-frequency lists
  (derived from OpenSubtitles 2018): https://github.com/hermitdave/FrequencyWords
- Licence: the repository states "MIT License for code, CC-by-sa-4.0 for content". These files are content, so they are
  CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Attribution is this file; the lists are adapted
  (filtered, see below) and stay under the same licence. Nothing else in the repository is derived from them.
- Underlying corpus: OpenSubtitles (https://www.opensubtitles.org/), via the OPUS project.

## How they were made

`scripts/build-grader-wordlists.ts` (run it again to regenerate all six files):

1. letters only, lower case, at least 5 letters (the grader never treats a shorter word as a typo candidate);
2. a count of at least 400, which drops the long tail where a subtitle corpus keeps its frequent misspellings
   (`recieve` 125, `definately` 135, `thier` 127, `wich` 265, `seperate` 166 occurrences);
3. a word that is clearly another course language's word (its share of that corpus is more than 5 times its share of
   this one) is dropped, because the Spanish and French subtitle lists carry English dialogue.

Result: en 24,211, fr 18,553, es 28,123 words, about 165-255 KB each as source, parsed into a `Set` only when its course
is first graded.

## Known limits

- It is a frequency list, not a dictionary: a rare real word (for example `cavos`, 2 occurrences) is not in it, so it is
  still treated as a typo of `cabos`; a frequent misspelling above the count threshold (`untill`, 388, is just under)
  would count as a real word. Raise `MIN_COUNT` if one turns up.
- Words under 5 letters are not listed; the typo allow-list never considers them as slips anyway.
- Subtitle text is unaccented sometimes (`tambien`), so an unaccented form can be in the list.
