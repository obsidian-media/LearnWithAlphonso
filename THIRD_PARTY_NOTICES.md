# Third-party notices

This file records third-party material that is not obvious from `package.json`.
It covers only items the project has had to make a licensing decision about.

## Conjugation libraries (development tools only)

`french-verbs`, `french-verbs-lefff` and `spanish-verbs` (by Ludan Stoecklé, from the
RosaeNLG project) are **devDependencies**. They are used only by tests and scripts to
cross-check the committed verb tables in `src/data/generative/`. None of them is
imported by application code, and a guard test
(`src/data/generative/romance-isolation.test.ts`) plus a CI check on the built web bundle
(`scripts/check-no-lefff-in-bundle.ts`) keep it that way.

- `french-verbs` and `spanish-verbs`: Apache-2.0. `spanish-verbs` is derived from the
  `conjugator` package (Apache-2.0, HealthTap, Inc.).
- `french-verbs-lefff`: the package metadata says Apache-2.0, **but the 6 MB data file it
  bundles (`dist/conjugations.json`) is derived from the Lefff lexicon and is under the
  LGPL-LR licence** (Lesser General Public Licence For Linguistic Resources). The Apache
  label covers the package's code, not that data. We do not redistribute the data: it is
  never imported by shipped code, and no extract of it is committed anywhere in this
  repository (our own verb tables are hand-written).

## Wiktionary extracts (check-only, not committed)

`scripts/check-wiktionary.ts` reads the kaikki.org extracts of Wiktionary (CC BY-SA 4.0)
on a developer's machine to confirm verb forms and noun genders. The extracts are not
committed. Only a summary of the comparison
(`docs/superpowers/generative-wiktionary-check.json`: the words checked, our own forms,
and agree/disagree) is committed. Our content is not derived from Wiktionary text.
