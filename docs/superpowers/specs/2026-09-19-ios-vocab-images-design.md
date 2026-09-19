# Design: iOS Vocab Stock Photos

> Written 2026-09-19. V2, parallel-safe (touches the content-export
> script + `ContentStore`/`VocabDerivation.swift`, which no other V2 doc
> touches). Small — the deliberately-deferred half of
> `2026-09-19-*` overview/vocab-phases work already shipped
> (`VocabDerivation.swift`'s `image` field doesn't exist yet; this adds
> it).

## Goal

Vocab cards in `LessonPlayerView`'s vocab phase are currently text-only.
`src/data/vocab-images.ts`'s `VOCAB_IMAGES` (term → Pexels stock photo,
~1,900 entries, `9984` lines) is exactly what the web's `deriveVocab`
attaches per-term — port it the same way `scenarios.json` was bundled.

## Why this is cheap

`VOCAB_IMAGES` is a flat `Record<string, {url, alt, credit}>` — pure
data, no logic. Bundling it as JSON is small (URLs and short alt-text
strings, not image bytes — expect well under 1MB, nowhere near the
15MB/16MB artifact limits that matter for other bundled content). Images
themselves are **not** bundled — they're loaded from Pexels' CDN at
runtime via `AsyncImage`, same as the web's `<img src=...>` with
`onError` fallback.

## Components

- **Export script** (`scripts/export-ios-content.ts` +
  `src/lib/ios-content-export.ts`): add `buildIOSVocabImagesBundle()`
  returning `VOCAB_IMAGES` as-is (it's already a plain serializable
  object, no transform needed) and a `writeJSON("vocab-images.json",
  buildIOSVocabImagesBundle())` call, same pattern as the existing three
  `writeJSON` calls.
- **Kit**: extend `VocabItem` (`VocabDerivation.swift`) with an optional
  `image: VocabImageRef?` field (`VocabImageRef`: `url: String, alt:
  String, credit: String` — mirrors the web's `VocabImage` type).
  `ContentStore` loads `vocab-images.json` into a `[String: VocabImageRef]`
  dictionary (lowercased-term keyed, matching the web's `titleCaseKey`
  despite its name just being `.lowercased()`) at init, same lazy-once
  pattern as the curriculum/scenarios loads. `deriveVocab(lesson:)` needs
  a new parameter (`images: [String: VocabImageRef]`) to do the lookup —
  **this changes `deriveVocab`'s signature**, so `LessonPlayerView`'s
  call site needs updating in the same PR (small, one call site).
- **App**: `VocabScreen` (in `LessonPlayerView.swift`) — add an
  `AsyncImage(url:)` above the term/meaning/example text when
  `item.image != nil`, with a `ProgressView` placeholder and silent
  fallback to text-only on failure (mirrors the web's `onError` handler
  that just hides the broken-image icon — never show a broken-image
  placeholder to the user).

## Testing

- Kit: extend `VocabDerivationTests` with cases for the image-attached
  and no-image-match paths (the existing 6 tests all pass `images: [:]`
  once the signature changes — update them, don't leave them broken).
- Kit: a `ContentStoreTests` case confirming `vocab-images.json` loads.
- App: `ios-app-build` CI compile is the verification; the `AsyncImage`
  network behavior itself isn't unit-testable (no test target for
  SwiftUI views, matches precedent) — a manual TestFlight check that
  images actually render is worth doing once this ships, not a blocker
  for merging.

## Rollout

No backend changes, no migration. Re-run
`node_modules/.bin/tsx scripts/export-ios-content.ts` as part of this
PR (same as any content-export change) so the new `vocab-images.json` is
actually committed, not just the script that would produce it.
