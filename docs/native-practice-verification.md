# Native Practice hub with stars

Ports the owner-approved web hub from b05ff3e8 to SwiftUI and Compose. Both platforms show Alphonso's café greeting, Today's pick, Continue, every campaign with scene-room thumbnails, the Hector invitation, painted scenarios with unlocked level filters, the persona/opener pre-call sheet, and the server's result with stars, statistics, first slip, retry and next/done actions.

## Server contract

- `GET /api/practice?course=<en|fr|es>` reads the learner's stars, level and weakness events using their bearer token, exactly as web does. Failed reads never become a displayed zero-star balance.
- Every attempt and campaign scene has a fresh random UUID. Each learner reply sends it as `callId` to `/api/chat`, alongside the existing messages, whitelisted system prompt, course and level.
- Finishing waits for a pending judged reply, then sends only `{ callId }` to `POST /api/practice`. The displayed award and statistics come from that response. There is no native scorer, database star writer or migration.
- A retry starts a new UUID; scene transitions retain the campaign transcript. Resuming mid-story also retains the correct scene offset for response reports.
- The existing voice pipeline, spoken openers, call sound effects, consent and daily quota handling remain in use. Chat mode shares the same request pipeline without transcription or speech synthesis. Hector's entitlement and billing paths are retained.

## Local verification

| Check | Result |
| --- | --- |
| `swift test -j 2` in `ios/LearnWithAlphonsoKit` | 1,445 passed |
| Android `:core:test` | 740 passed |
| Android `:app:testDebugUnitTest` | 301 passed |
| Export, native catalog parity and web/iOS design guards | 30 passed |
| Offline Android emulator Practice checks | 2 passed: hub, Continue's exact scene/persona/opener, chat selection, Advanced chip, 1–3 star accessibility labels and actions at 200% text size |
| Raw-value baseline scan | Web 171, iOS 345 (down from 368), Android 60; every baseline equals its scan |
| Content snapshot comparison | Zero changed/new learning items; persona strings are exported unchanged from the approved web catalog |
| SwiftUI syntax parsing | Passed; an iOS app build requires macOS/Xcode |

Every Gradle invocation ran one task at a time with `-Dorg.gradle.jvmargs=-Xmx1536m`.

## Mutation checks

These were temporary production-code changes, followed by real test runs and restoration, on **each** platform:

| Property | Mutation | Observed failure |
| --- | --- | --- |
| Today's pick skips written-only weaknesses | Disabled the `spelling` exclusion while leaving spelling in the scenario focus map | The worst spelling weakness selected the airport instead of the next speakable weakness; spelling-only fallback also failed |
| Stars shown are the server's call award | Replaced `displayedStars = stars` with `bestAfter` | A fixture whose call award is 1 and saved best is 3 displayed 3; the award and accessibility-label assertions failed |
| Continue resumes the right scene | Returned `sceneIndex + 1` from the resume selector | The first unstarred scene and the completed-campaign fallback assertions failed; the iOS seeded-scene assertion also failed |

All mutated runs failed on assertions, not on compilation. All restored runs passed. Additional Android view-model tests exercise the selected scene's actual opener/prompt, fresh retry IDs, typed calls without audio, waiting for an in-flight judged reply server-only results, cancelling pending speech on hang-up and sharing one result across repeated finish requests.

## Emulator captures

Offline Spanish emulator captures (hub, pre-call sheet, Advanced, one/two/three stars, 200% text) were checked locally and are not committed.

## Native differences and remaining verification

Navigation and sheets use native controls. Scenario columns, statistics and action buttons adapt to large text; screens and sheets scroll rather than constrain text to web's fixed card heights. Android's Hector invitation uses its existing Hector tab/billing entry point; iOS retains its Practice-card paywall sheet. There are no intended differences in pick, continuation, star or API rules.

iOS app compilation and device visual/VoiceOver sign-off remain for macOS/Xcode. Windows verification covers the Kit and SwiftUI syntax, not SwiftUI type checking or rendering. Android emulator fixtures do not call a live AI, spend a learner's allowance or change production data. No build numbers, migrations or publication actions are part of this change.
