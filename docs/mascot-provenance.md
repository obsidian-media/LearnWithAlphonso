# Mascot and app-art provenance

Where the Alphonso and Hector character art (and the art made from it) came from,
and the terms under which it may be used commercially. It supports the App Store
Connect "Content Rights" answer. The generator facts below were read from the
metadata of the owner's original files on 2026-10-07. The owner answered the
plan, app-icon and existing-character questions on 2026-10-07.

## Summary

| Asset | Generator (evidence) | Owner's account or plan | First commit |
|---|---|---|---|
| Alphonso, first concept (square icon) | Google Gemini image generation. The original's C2PA manifest is signed by Google LLC ("Created by Google Generative AI"), with a SynthID watermark and IPTC digitalSourceType `trainedAlgorithmicMedia` | Google account (product confirmed privately) | Web `ba004ac` (2026-09-11, `public/icon-512.png` and favicons); marketing site `5b94da8` (2026-09-20) |
| Alphonso, in-app portrait | Higgsfield. The original's C2PA manifest names model **FLUX.1 Kontext**, "Black Forest Labs API", action `c2pa.created` | **Higgsfield Ultra (paid)** (owner, 2026-10-07) | App `a9ed99b` (2026-09-22) |
| Hector, portrait | Higgsfield. The original has no C2PA manifest; the owner believes the model was Nano Banana (Google Gemini 2.5 Flash Image) | **Higgsfield Ultra (paid)** (owner, 2026-10-07) | App `a9ed99b` |
| App icon | **Google Gemini** (Gemini app, Pro), per the owner on 2026-10-07. Prompt: "App icon design, Alphonso the mascot's face only, centered, friendly confident expression, flat vector illustration style, bold clean outlines, warm gradient background…". Reference image: the owner's own Alphonso mascot from the owner's AlphonsoEcosystem app. The iOS icon (`ios/LearnWithAlphonso/Sources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`) reuses the web app's `public/icon-512.png` | Owner's own Google account, Gemini app (Pro) (owner, 2026-10-07) | Web `ba004ac` (2026-09-11); iOS `e213fb3` (2026-09-19) |

**Existing characters.** No prompt named or referenced an existing third-party
character, brand or real person. The prompts reference only the owner's own
mascot, Alphonso, and the reference image is the owner's own (owner, 2026-10-07).

The SynthID watermark and the C2PA manifests are kept in the original files.
The repository copies were cropped, resized and compressed, which removed the
metadata chunks.

## Derived copies

All come from the originals above.

- **iOS:** `Assets.xcassets/Alphonso.imageset/Alphonso.png` (640×640) and
  `Hector.imageset/Hector.png` (699×671). Commit `a9ed99b`, cropped to face and
  shoulders and compressed.
- **Web app:** `public/mascots/alphonso.png` (128×128) and
  `public/mascots/hector.png` (128×123). Commits `0247ced` and `3c31511`.
- **Web app icons:** `public/icon-512.png`, `icon-192.png`,
  `apple-touch-icon.png` and favicons. Commit `ba004ac`.
- **Android:** `res/drawable-nodpi/mascot_alphonso.png` and `mascot_hector.png`
  (commit `17f8299`), plus the launcher icons under `res/mipmap-*`.
- **Marketing site** (`LearnWithAlphonsoMarketing`):
  - `public/mascot/alphonso-icon.png` (the Gemini concept, resized), the
    favicons, `apple-touch-icon.png`, `icon-192/512.png` and `og-image.png`
    (commit `5b94da8`);
  - `public/mascot/alphonso-cutout.png` (background removed locally with
    `rembg`, commit `d9f6518`);
  - `public/mascot/hector-portrait.png` (from the iOS Hector asset, commit
    `2353c29`).

## Commercial-use terms

| Tool | Terms (quoted 2026-10-07) | Status |
|---|---|---|
| Higgsfield (Alphonso portrait, Hector) | [Higgsfield Terms of Use](https://higgsfield.ai/terms-of-use-agreement), last updated July 26, 2026, section 4.4: "Company does not claim ownership of any of your Inputs or Outputs, nor does it restrict your commercial use of Outputs." Also: "Your rights in Outputs you have generated and exported survive cancellation of your subscription or deletion or termination of your Account". The [Higgsfield help center](https://higgsfield.ai/creator-hub/help-center/account-and-privacy/who-owns-my-generations-and-can-i-use-them-commercially) says commercial-use rights apply to all users, whatever their plan. | Commercial use permitted. The owner was on a paid plan (Ultra). |
| Higgsfield, uniqueness caveat | Section 4.4: "Other users may receive an Output that is similar or possibly identical to yours. Company does not guarantee the uniqueness, originality, or exclusivity of any Output." | Noted. No exclusivity is claimed. |
| Higgsfield, training use | Section 4.4: "You acknowledge and agree that Your Content, Inputs, and Outputs may be used by Company to train, develop, enhance, evolve, and improve its (and its affiliates') AI models". | Noted. This does not affect our right to use the outputs. |
| Black Forest Labs FLUX.1 Kontext (through Higgsfield) | The model was used through Higgsfield's service, so Higgsfield's Terms of Use (above) govern the outputs. | Covered by Higgsfield's terms. |
| Google Gemini (first Alphonso concept, the app icon, and Hector if Nano Banana) | [Google Terms of Service](https://policies.google.com/terms), effective July 30, 2026, "Your content": "Some of our services allow you to generate original content. Google won't claim ownership over that content." The older [Generative AI Additional Terms](https://policies.google.com/terms/generative-ai) (last modified August 9, 2023) were replaced on May 22, 2024 and have no ownership clause. | Google claims no ownership of generated content. |
| rembg (local background removal) | Open-source tool; it claims no rights in outputs. | Known |

## App Store Connect

Content Rights answer: the app contains no third-party content it lacks the
rights to use. The existing-character question and the app icon's source are
answered above. The owner confirms the remaining provenance details privately
(the Google account used for the first concept, the model behind Hector, the
inputs to the in-app portrait, and which images ship) before submission. If
any of them is no or unknown, resolve it before submission.
