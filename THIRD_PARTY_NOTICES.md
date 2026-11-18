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

- `french-verbs-transitive` and `french-contractions` (also from RosaeNLG) are pulled in by `french-verbs`. Their data is under CC BY-SA 3.0. They are development-only, never imported by application code, and no extract is committed.

## Fluent Emoji 3D icons (shipped)

The 3D icons (`public/icons3d/`, the iOS and Android icon sets; 30 on the web) are a curated subset of Microsoft's Fluent Emoji 3D set, MIT licensed. The licence text is kept at `assets/fluent-3d/LICENSE` and the source PNGs in `assets/fluent-3d/source/`. Added with the visual refresh (#341).

## Bricolage Grotesque and Figtree (shipped)

The design system's two faces (visual round 6): Bricolage Grotesque (display and numerals) and Figtree (body), both from google/fonts under the SIL Open Font License 1.1. One variable file each ships in the iOS app (`ios/LearnWithAlphonso/Sources/Fonts/`), the Android app (`res/font/`) and on the web as WOFF (`public/fonts/`), and each place keeps the OFL text next to the font (`*-OFL.txt`; Android's are in `android/LearnWithAlphonso/fonts-licenses/`). `src/lib/design-fonts.test.ts` checks all of it.

## Baloo 2, Fraunces and Geist (shipped)

The theme faces: Baloo 2 (Royal display) and Geist (body, both themes), and Fraunces (Meadow display). All three are under the SIL Open Font License 1.1:

- Baloo 2: Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2).
- Fraunces: Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces).
- Geist: Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font).

One variable file each ships in the iOS app (`ios/LearnWithAlphonso/Sources/Fonts/*-Variable.ttf`, with `*-OFL.txt` beside each) and the Android app (`android/LearnWithAlphonso/app/src/main/res/font/*_variable.ttf`, with the OFL texts in `android/LearnWithAlphonso/fonts-licenses/`). The website self-hosts the same faces from the `@fontsource-variable/baloo-2`, `@fontsource-variable/fraunces` and `@fontsource-variable/geist` packages (imported in `src/styles.css`), which carry the OFL text in the package. The fonts are not sold on their own and keep their original names.

## Vocabulary photos (shipped, not redistributed)

The photos on vocabulary questions (`src/data/vocab-images.ts`, with copies in `ios/LearnWithAlphonso/Resources/vocab-images.json` for iOS and `android/LearnWithAlphonso/app/src/main/assets/content/vocab-images.json` for Android) are stock photos, each with its photographer credit, source page and licence recorded in that file:

- Pexels, under the Pexels License (https://www.pexels.com/license/).
- Pixabay, under the Pixabay Content License (https://pixabay.com/service/license-summary/).
- Kaboompics (Karolina Grabowska): the photos credited to Kaboompics were taken from Pexels and are used under the Pexels License, as their entries record.

They are served from our own storage, on the website and in the iOS and Android apps, only to illustrate a word inside a lesson. We do not offer them for download, sell them or redistribute them as standalone files, which both licences prohibit. `src/data/vocab-images.guard.test.ts` checks that each entry's source, licence, photo page and credit agree.

## Kenney sound effects (shipped)

Sound effects by Kenney (kenney.nl), CC0. The nine short effects (right and wrong answer, lesson complete, XP, heart lost, tap, call start and end, achievement) are from three Kenney.nl packs released under Creative Commons Zero (CC0 1.0, public domain; http://creativecommons.org/publicdomain/zero/1.0/). No credit is required; we give it anyway. They ship as identical MP3s on the web (`public/sfx/`), iOS (`ios/LearnWithAlphonso/Sources/Sounds/`, credited in Settings, Acknowledgements, with `Sources/Licenses/Kenney-CC0.txt`) and Android (`res/raw/`). `src/lib/sound-effects-assets.test.ts` checks all of it.

| Effect          | File                      | Kenney pack and source file                                                           |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| Right answer    | `sfx-right.mp3`           | [Music Jingles](https://kenney.nl/assets/music-jingles), `jingles_PIZZI08.ogg`        |
| Wrong answer    | `sfx-wrong.mp3`           | [Interface Sounds](https://kenney.nl/assets/interface-sounds), `question_004.ogg`     |
| Lesson complete | `sfx-lesson-complete.mp3` | [Music Jingles](https://kenney.nl/assets/music-jingles), `jingles_STEEL02.ogg`        |
| XP              | `sfx-xp.mp3`              | [Interface Sounds](https://kenney.nl/assets/interface-sounds), `pluck_001.ogg`        |
| Heart lost      | `sfx-heart-lost.mp3`      | [Impact Sounds](https://kenney.nl/assets/impact-sounds), `impactSoft_medium_001.ogg`  |
| Tap             | `sfx-tap.mp3`             | [Interface Sounds](https://kenney.nl/assets/interface-sounds), `drop_002.ogg`         |
| Call starts     | `sfx-call-start.mp3`      | [Music Jingles](https://kenney.nl/assets/music-jingles), `jingles_PIZZI10.ogg`        |
| Call ends       | `sfx-call-end.mp3`        | [Music Jingles](https://kenney.nl/assets/music-jingles), `jingles_PIZZI11.ogg`        |
| Achievement     | `sfx-achievement.mp3`     | [Interface Sounds](https://kenney.nl/assets/interface-sounds), `confirmation_003.ogg` |

Licence evidence: each pack's page says "CC0 licensed", and the `License.txt` in each downloaded zip reads "Creative Commons Zero, CC0". The OGGs were converted to MP3 with no other change.

## Wiktionary extracts (check-only, not committed)

`scripts/check-wiktionary.ts` reads the kaikki.org extracts of Wiktionary (CC BY-SA 4.0)
on a developer's machine to confirm verb forms and noun genders. The extracts are not
committed. Only a summary of the comparison
(`docs/superpowers/generative-wiktionary-check.json`: the words checked, our own forms,
and agree/disagree) is committed. Our content is not derived from Wiktionary text.
