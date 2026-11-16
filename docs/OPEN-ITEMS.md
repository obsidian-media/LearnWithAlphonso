# Open items

A public, sanitised list of what is not finished yet in Learn with Alphonso. The detailed internal backlog is kept private. Last swept 2026-11-15.

Sweep of 2026-11-15 against main, merged pull requests and read-only checks of the production database. "Unverified" means it could not be confirmed from code, merged PRs or the database; nothing is marked done without evidence. Old section ids (for example 0.0-an) point at the private internal backlog.

**How to keep this list current.** New work items go into this section, in the right class, with their evidence. When an item is finished, move its line to "Recently closed" at the bottom of this section with the PR number; do not delete it. Old numbered sections below are history and are not updated any more.

Counts: owner only 18, decision needed 9, device check 13, agent can do 14, done 10 groups, obsolete 8. Coverage: older history below line ~880 of the full backlog was checked by targeted search, not a full read.

### A. STILL OPEN - owner only (in priority order)

1. **Decide and perform the next App Review submission.** Builds up to 67 are on TestFlight; nothing newer than the notes shows a submission. App Store Connect state is unverified from here. (0.0-am #7, 0.0-y)
1b. **Two Vercel settings the agent could not change (403, needs production env permission), project `learnwithalphonso`:** (a) set `SUPPORT_NOTIFY_FROM` to `Learn with Alphonso Support team <support@hello.alphonsoecosystem.app>` (a verified Resend sender), then redeploy; (b) delete `NVIDIA_API_KEY` and `NVIDIA_CHAT_MODEL` if they are present (no code reads them). Both stay owner steps. (#557, #576)
2. **Paid Applications Agreement must be Active** (terms, bank, tax). Older notes disagree on whether it already is; unverified. A "New" agreement blocks every in-app price. (0.0-am, 1.1)
3. **Store privacy answers in one visit** (App Store Connect App Privacy and Google Play Data safety), before any submission: Product Interaction and Device ID for Analytics (PostHog, linked, not tracking), Product Personalization, Crash Data and Other Diagnostic Data, first-run answers (name, age range, country, avatar, goal, level, how you heard of us), Explain and Hector AI requests, learning minutes, mastered words, time zone, listening progress, and **Customer Support** for the Help chat (kept 12 months after a chat is solved, in the export). Age rating 13+. (0.0-as #1 #7 #8, 0.0-bn, 2026-11-15 note, 0.0-ai)
4. **Security follow-ups, details kept private.** Several owner-only account, settings and switch-on steps (including one timed switch-on) are tracked privately and are not described here. (0.0-bb, 0.0-as #3)
5. **Admin console numbers (#567 is merged and its migration is applied: verified).** Set the provider settings on the admin project (list in docs/operations.md), then check each group shows Connected: revenue, AI cost, App Store, Google Play (also needs the reports bucket name), own database, crash reports, analytics. Not tried with real provider settings. (r13 note 2026-11-15)
6. Moved: the admin redesign merged (#568); the one agent task left from it is item 64.
7. **Staff names for Miya.** Staff profiles need real first names in their display name, otherwise person replies read just "Support team". (r13 Miya note)
8. **Review the Help chat help file and 10 sample transcripts, then turn on the support_ai switch.** It is OFF in production (verified), so every message goes to a person. (r12 support M1)
9. **Web Pro launch:** a real payment-processor account, RevenueCat production web billing (products, trial and no-trial links, return page), production Vercel settings, redeploy, then one real purchase-and-refund check by the agent. The live web paywall is intentionally unconfigured. (0.0-an #1-4)
10. **Google Play and Android release setup:** Play developer account, move Firebase to the same Google account and rotate its settings, add the Play app-signing fingerprint to the asset-links file, RevenueCat Android setting, first hand upload. (0.0-z, OWNER-SETUP, 2026-11-14 note)
11. **After App Review approval:** point support, privacy and report mail forwarding back to the owner's inbox and send a test mail; remove the review demo-code setting from production and consider deleting the review account; turn on the RevenueCat sandbox-rejection switch. (0.0-x, remediation P-6)
12. **Demo account session cleanup** (owner step in the auth dashboard). Cannot be verified from code. (0.0-aa)
13. **Delete leftover QA test accounts** made during QA (one named in 0.0-al); unverified which remain. (0.0-al, 0.0-as #3)
14. **Timed switch-ons:** at about 90 percent adoption plus 30 days: the store URL setting, then minimum builds (update gate). (wave 2, #421, #423)
15. **Confirm the RevenueCat server setting is present on the backend** before Pro learners exist (needed by server-side hearts, #494). Unverified. (#494 note)
16. **Optional:** connect Sentry for readable crash locations; delete leftover Vercel Preview entries of the merged web-Hector branch. Other optional credential tidying is tracked privately. (0.0-as #9, 0.0-an #6)
17. **Podcast content partnership conversation**, respecting the licensed-only publishing rule (#262). (0.0-i)
18. **Custom domain for the Supabase project** (paid plan, repoint apps, retest sign-in). iOS still points at the raw project URL. (0.0-t)
19. Moved to E: stale worktree and branch cleanup was done by the owner on 2026-11-15.
20. **Store listing leftovers (likely moot):** subscription review screenshot, walkthrough recording, upgrade test 50 to 51. (0.0-am)

### B. DECISION NEEDED (owner choice)

**Order of work (owner 2026-11-16).** A small fixes, then B redesign gaps and social parity, then C reliability. D content waits for "content run approved". E art waits for mock approval.

27. **Two Qlty warnings: PARKED 2026-11-16.** Owner: "keep it for later, ignore for now".
28. **Hands-free with the screen locked: MOVED to device checks (owner) 2026-11-16.** Owner: "i will check on device and let you know". The Android microphone foreground service stays unbuilt.
29. **Someday features: PARKED until workstreams A to C finish.** Owner 2026-11-16: "lets discuss these after these are all done".

### C. DEVICE CHECK (needs a real phone; nothing can show these from code)

30. **Build 65/66 iOS redesign**, starting with the Practice call screen, Library and Watch shelf, video player, path stops. Limrun has no credits, so none of the redesign was seen on a simulator. (2026-11-14 notes, 0.0-bi)
31. **Hands-free conversation** on iOS, web and Android: headset versus speaker echo, 2-3 s Practice pause, noisy room, interruptions, tab switch, large text, screen reader. (#538, #560, Android PR)
32. **Android**: TalkBack double verdict on the quiz, unlock sheet at 360dp, dialog scroll at large font, Help chat night, practice chat, voices picker, DEVICE-CHECKLIST.md rows (teams error state, hearts gate, quota copy). (2026-11-14 STATUS, 0.0-al)
33. **Streak widget redesign** on iOS and Android (never seen on a device). (#553)
34. **Help chat** end to end after one real ticket: web, iOS, Android, staff inbox, reply notices and push tap. (r12 support M2-M6)
35. **Push notification delivery** to a physical phone. (1.3)
36. **Sandbox purchase** on TestFlight (Pro unlock end to end), Hector paywall in StoreKit. (0.0-as #4)
37. **VoiceOver, Dynamic Type, Reduced Motion** across the app; RTL layout in Explain; follow-along; staff ban screen. (0.1-a, 2026-11-13 NEXT)
38. **Voice round trip** (microphone audio cannot be carried by the simulator). (0.0-j)
39. **Meadow stays light in dark mode** on iOS and Android. (#547)
40. **Real-device web look** at phone width: teams, save-a-word dialog, word-bank layout. (0.0-ac #4, 0.0-ae)
41. **Learn tab badge after clearing the review queue**; lesson-complete button clipping at largest text. (0.0-z #5 #6)
42. **Real-microphone checks of the web voice flows** in Safari, Firefox and a phone. (#560)

- Moved here from 28 (owner 2026-11-16, "i will check on device and let you know"): hands-free with the screen locked, iOS and Android.

### D. STILL OPEN - agent can do

43. **Content: failed fixes.** About 438 English review fixes and about 580 content fixes overall still fail the checks; 16 gated refused FR/ES fixes (duplicate English prompts); about 190 English-term FR/ES cards need an authored FR/ES term; after any content merge the owner reseeds. (2026-11-07, round 7 notes)
44. **FR/ES review-panel disagreements** (77 from the first run) were folded into the content closure project; the state of the closure run and its caps is unverified from here. (0.0-ay, #428, content closure)
45. **Call scenes v2:** more vivid, less pastel, distinct interview and negotiation offices, matching evening study room. No evidence it started. (2026-11-05 note)
46. **Night rooms for dark mode** (owner said yes 2026-11-12); no evidence it was built; lessons stay light. (0.0-be)
50. **Redesign gaps, batch 2: Android residue** (the rows of the audit still open on Android).
52a. **Redesign gaps, batch 4: web call-chrome raw values.**
52. **Marketing site:** social proof, Android status, more than one sample question, and the "try one" question mock are not built (separate repository). (1.2, 2026-11-14 web batch 3)
53. **Resident hazards in tests:** a gate misses a frontable "here" (a2p16q34 was moved; the gate rule was added); the option-class tables are unaudited by a second source. (0.0-av)
54. **Concurrent-device review grading and offline streak continuity.** (3 Review, ARCHITECTURE rough edges)
57. **Remove the unused push-to-talk capability** from the App ID. (1.1 #9)
59. **Vocab image quality** beyond metadata triage; Android needs no change for empty lines (verified done). (3 Content)
62. **Podcast carried risks and deferred minors** (storage before any Pro gating, ended-event ordering). Unverified on a device. (0.8)
63. **Dev server does not boot in the Windows sandbox.** (4)

### E. DONE (recent, verified; recorded here so they are not re-opened)

- Admin numbers dashboard: PR #567 merged, migration 20261118100000 applied in production (queried).
- Stale worktree and branch cleanup (2026-11-15, owner).
- Hands-free on web #560, Android #561, iOS #538; Practice result and reply bar #552; Meadow stays light #547; streak widget #553.
- Miya #554; Help chat web #524, iOS #541, Android #544; staff inbox #532; reply email, push and retention #557 (all six support milestones).
- Privacy page covers the Help chat (#564) and the time zone wording is current (src/routes/privacy.tsx line 61).
- Admin learner page nesting suspicion: the route is users_.$id, so it does not nest under users (verified).
- Android vocab card hides empty meaning lines (LessonScreen.kt:387, LessonStage.kt:944).
- Hector daily limit now comes from the server on iOS and Android (HectorAllowance.fetchLimit, HectorView.swift:362, AppContainer.kt:83).
- Words tile counts lesson words (#537); hearts refill and talk rule (#511); themes Royal and Meadow (#512, #516); server hearts on by default (#494); local-day streaks (#497).
- Podcast quiz on web, iOS and Android (#374-#381); mistakes into review (#487); FR/ES word cards A1-C1 (#486, #492); American English (#485).
- Explain in my language (#488); opt-in analytics (#489); first-run onboarding, Profile, Practice hub, paywall (round 6); sound effects; Hector speaks first.

### F. OBSOLETE (superseded)

- 0.0-ax and 0.0-az (3D and Rive Alphonso): replaced by the realistic image kit with lip sync (#408, #426).
- 0.0-ay native-speaker items and the paid teacher check: folded into the content closure project; no native teacher.
- 2.4 Hector option B spike: Hector runs on this backend (#189).
- 0.7 Canopy QA: Canopy removed; themes are Royal and Meadow only.
- Meadow night palette: removed (#547).
- pg_net move and revoke: not possible by migration (grants belong to a platform role); closed as won't fix.
- Anti-farming and STT limit decisions: shipped in #367.
- Vercel billing outage of 2026-11-12: later notes say deploys resumed (unverified here).

### Recently closed
- Reseed after #574 (was 1a): done 2026-11-16 by the coordinator at the owner's request. The 5 units, 25 lessons and 126 questions that #574 changed (the `es*p28` Minimal Pairs and `frb2p5q16`) were upserted in prod; verified: the 126 rows hash-match `buildFullSeed()` on main exactly, 25 lessons and 5 units updated.
- Spanish minimal pairs (was 22): owner 2026-11-16, "yes"; they are spelling-choice questions (#574, 6ef39fe9; 5 lessons, 125 items, gate test).
- Social parity (was 23 and batch 1, 49): owner 2026-11-16, "close the gap"; web now has nudge, activity feed, overtake notice, weekly recap, league promotion takeover, duel block and report, and team-name report (#578, 4b43a187). Not run on a device.
- French question frb2p5q16 (was 25): the answer is "était" (#574, owner ok).
- Path tags and minutes (was 26): minutes kept because the data is too thin; tags changed (#574, owner ok).
- Royal night on the web (was 24): owner 2026-11-16, "24 yes"; merged in #577 (0b0042a1). The web Royal theme follows the device dark mode on first paint and live; Meadow stays light. Not captured on full signed-in screens.
- Redesign gaps, batch 3 (iOS residue, was 51): iOS accept-friend sheet and the legacy helpers moved onto the design system (#575, 791a81dd); the sheet copies the web and Android look as the owner chose ("3. copy"). Nothing was seen on a simulator.
- Web pending-sync, update gate and offline finish: owner 2026-11-16, "1. keep". They stay app-only (closed, by design).
- Web push notifications: owner 2026-11-16, "2. keep to app". No web push (closed, by design).

- Small fixes (#576, round 14): reserved analytics events `explain_requested` and `path_built` now sent on web, iOS and Android (47); Help reply email sender is "Learn with Alphonso Support team" (48); word-deck arrow keys scoped to the deck, tile guard tightened, Learn bubble probe-row fix; the "Word n of N" live region and the Android unit-numbering read were already in place (55); NVIDIA provider path was already retired, no source reads its env names (56); `types-fresh` waits for the deploy so a table-adding PR with its types passes (58); Placement "not passed" and "not reached" chips differ on iOS and Android (60); Save a word carries the course language and Space opens it from a transcript word (61); Staff page scope labels (64).
- Web follows the device dark mode in Royal (round 14, owner "24 yes"): Meadow stays light; lessons and `.ds-light` screens stay light.
- Alphonso tutor videos (was 21): owner 2026-11-16, "keep the videos for now". Decided: the three videos stay published (with the free-plan watermark).
- Admin console redesign from the approved mock: merged in #568 (becd9650); admin phases 1 to 3 are all built.
- Build 67 cut and uploaded to TestFlight (#571, release run 43785255490), not submitted; carries the iOS support push tap.
