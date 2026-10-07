# Mascot and app-art provenance

Where the Alphonso and Hector character art (and the art made from it) came from,
and the terms under which it may be used commercially. It supports the App Store
Connect "Content Rights" answer. The file facts below were read from the metadata
of the owner's local original files on 2026-10-07. The owner answered the account
and plan questions on 2026-10-07. Items still open are marked **Open**.

## Summary

| Asset | Generator (evidence) | Owner's account or plan | Original file | First commit |
|---|---|---|---|---|
| Alphonso, first concept (square icon) | Google Gemini image generation. The C2PA manifest is signed by Google LLC ("Created by Google Generative AI"), with a SynthID watermark and IPTC digitalSourceType `trainedAlgorithmicMedia` | Google account type **Open** (Q1) | `Gemini_Generated_Image_4frny74frny74frn.jpg` (2026-09-11, 453,885 B) | Web `ba004ac` (2026-09-11, `public/icon-512.png` and favicons); marketing site `5b94da8` (2026-09-20) |
| Alphonso, in-app portrait | Higgsfield job `b1a836f5-f200-4a9c-b3f3-377f963955c7` (PNG tEXt `hf-job-id`). The C2PA manifest names model **FLUX.1 Kontext**, "Black Forest Labs API", action `c2pa.created` | **Higgsfield Ultra (paid)** (owner, 2026-10-07) | `Alphonso.png` (2026-09-22, 1024×1024, 1,131,004 B) | App `a9ed99b` (2026-09-22) |
| Hector, portrait | Higgsfield job `dcc17e4a-8853-4450-9e59-2ea3c816babf` (PNG tEXt `hf-job-id`). There is no C2PA manifest. The owner believes the model was **Nano Banana** (Google Gemini 2.5 Flash Image); not yet confirmed | **Higgsfield Ultra (paid)** (owner, 2026-10-07) | `Hector.png` (2026-09-22, 1536×2752, 6,582,252 B) | App `a9ed99b` |
| App icon | AI-generated (owner, 2026-10-07); tool not recorded. The iOS icon reuses the web app's `public/icon-512.png` (commit `e213fb3`), which was added on 2026-09-11 (`ba004ac`), the same day as the Gemini concept above | unknown | `ios/LearnWithAlphonso/Sources/Assets.xcassets/AppIcon.appiconset/AppIcon.png` (1024×1024) | `e213fb3` (2026-09-19) |

A second Gemini image, `Gemini_Generated_Image_j1k3znj1k3znj1k3.jpg` (2026-09-11),
carries the same Google C2PA and SynthID markers. Whether it is used anywhere is
an open question (Q7).

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
| Black Forest Labs FLUX.1 Kontext (through Higgsfield) | The model was used through Higgsfield's service, so Higgsfield's Terms of Use (above) govern the outputs. | BFL's own licence has not been reviewed separately. |
| Google Gemini (first Alphonso concept; Hector if Nano Banana) | [Google Terms of Service](https://policies.google.com/terms), effective July 30, 2026, "Your content": "Some of our services allow you to generate original content. Google won't claim ownership over that content." The older [Generative AI Additional Terms](https://policies.google.com/terms/generative-ai) (last modified August 9, 2023) were replaced on May 22, 2024 and have no ownership clause. | Google claims no ownership. Which account type was used (personal Gemini app or Workspace) is **Open** (Q1). |
| rembg (local background removal) | Open-source tool; it claims no rights in outputs. | Known |

## Open questions for the owner

1. **Open.** Which Google account and product generated the first Alphonso
   image: the Gemini app on a personal account, or Workspace?
2. **Answered** (owner, 2026-10-07): Higgsfield Ultra, a paid plan, was active,
   and Higgsfield's terms permit commercial use on every plan.
3. **Open.** Which model produced Hector (job `dcc17e4a-…`)? The owner believes
   it was Nano Banana; Higgsfield's job history should confirm it.
4. **Open.** Was the in-app Alphonso portrait made by editing the Gemini concept
   (FLUX.1 Kontext is an image-editing model)? If so, was the Gemini image the
   only input?
5. **Pending owner confirmation.** Did any prompt or reference image name or
   depict an existing character, brand or real person? A royal llama could
   resemble a famous cartoon llama. If yes, describe it.
6. **Open.** Where exactly did `AppIcon.png` come from (tool, date, input image)?
   The owner says it is AI-generated. It is the same file as the web app's
   `icon-512.png`, which was added on the day the Gemini concept was made. If the
   icon is rebuilt from another repository asset, record that asset's source here.
7. **Open.** Are the two "ChatGPT Image Oct 6, 2026" files or the second Gemini
   image used in any shipped asset?

## App Store Connect

Content Rights answer: the app contains no third-party content it lacks the
rights to use. This holds only once question 5 is confirmed ("no existing
character") and questions 1 and 3 confirm commercial use is permitted. If any
answer is no, resolve it before submission.
