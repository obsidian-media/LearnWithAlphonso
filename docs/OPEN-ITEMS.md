# Open items

A public, sanitised list of what is not finished yet in Learn with Alphonso. The detailed internal backlog is kept private. Last swept 2026-11-16.

Sweep of 2026-11-15 against main, merged pull requests and read-only checks of the production database. "Unverified" means it could not be confirmed from code, merged PRs or the database; nothing is marked done without evidence. Old section ids (for example 0.0-an) point at the private internal backlog.

**GitHub upkeep.** Since 2026-11-16 the owner has delegated GitHub upkeep (update, rebase and merge reviewed green pull requests, including migrations) to the coordinating agent.

**Staleness sweep (standing rule, every pass).** Besides closing new merges, reconcile every standing risk, weak-spot, not-done or blocker statement against merged reality (closure reports, migrations, the database) and never cite a dated analysis document as current state without checking it against ground truth. Anything that cannot be reconciled is flagged to the coordinator, not left to age.

**How to keep this list current.** New work items go into this section, in the right class, with their evidence. When an item is finished, move its line to "Recently closed" at the bottom of this section with the PR number; do not delete it. Old numbered sections below are history and are not updated any more.

Counts: owner only 23, decision needed 9, device check 15, agent can do 12, done 10 groups, obsolete 8. Coverage: older history below line ~880 of the full backlog was checked by targeted search, not a full read.

### A. STILL OPEN - owner only (in priority order)

1. **Decide and perform the next App Review submission.** Builds up to 67 are on TestFlight; nothing newer than the notes shows a submission. App Store Connect state is unverified from here. (0.0-am #7, 0.0-y)
1b. **Two Vercel settings the agent could not change (403, needs production env permission), project `learnwithalphonso`:** (a) set `SUPPORT_NOTIFY_FROM` to `Learn with Alphonso Support team <support@hello.alphonsoecosystem.app>` (a verified Resend sender), then redeploy; (b) delete `NVIDIA_API_KEY` and `NVIDIA_CHAT_MODEL` if they are present (no code reads them). Both stay owner steps. (#557, #576)
1c. **AI cost tracking owner steps (live 2026-11-16, #588):** `SUPPORT_NOTIFY_FROM` (step 1b) is also needed for the daily cost email; grant `numbers.revenue` to whoever should see Numbers, then AI cost; optionally set the `AI_COST_*` alert thresholds (see docs/operations.md).
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
20a. **Limrun top-up for cloud iOS QA (owner).** Limrun refused the 2026-11-16 run: the organisation has no credits or subscription. Without a top-up the agent cannot check iOS on a simulator.
69. **OWNER ONLY: submit the sitemap to Google Search Console** once the domain learn.alphonsoecosystem.app is attached there: https://learn.alphonsoecosystem.app/sitemap.xml (from #600).
70. **OWNER ONLY: unblock the Instagram System User token.** Enable 2FA and add contact info on the Meta account. The Graph API Explorer path is unavailable (the login is Instagram/Business-only, with no personal Facebook).

### B. DECISION NEEDED (owner choice)

**Order of work (owner 2026-11-16).** A small fixes, then B redesign gaps and social parity, then C reliability. D content run: DONE 2026-11-06 (see item 43). E art: done (#589).

27. **Two Qlty warnings: PARKED 2026-11-16.** Owner: "keep it for later, ignore for now".
28. **Hands-free with the screen locked: MOVED to device checks (owner) 2026-11-16.** Owner: "i will check on device and let you know". The Android microphone foreground service stays unbuilt.
29. **Someday features: discussed 2026-11-16, owner to pick.** Competitor research is published (owner page). The owner chose the art workstream (items 45 and 46) and asked for cost tracking (items 65 and 66) and similar tools. Not started, owner picks which, if any:
    - IN PROGRESS: call recap card plus a "what Alphonso remembers" page. Owner decisions 2026-11-16: recap on the result screen, text only with tap-to-hear; memory is weak spots, phrases and goals (presets only), with delete and "forget everything"; recap free, memory page Pro, memory saved for Pro only; own `recap` quota (30 a day) and cost kind; Alphonso's Pro calls are primed with memory. Server and web merged (#594, f224d0dd; migration 20261119100000_call_recap_memory verified live: `tutor_memory` has RLS on, no anon read, the forget function is service-role only). iOS and Android are PR #595 (open, fixing review findings). Privacy: a code filter drops emails, phone numbers, links and name introductions, and memory stores only the corrected phrase; "forget" removes memory, weakness events and recap-made review items and keeps lessons, stars, streak, XP and saved words; free learners can forget their weak-spot notes from Settings. The privacy page wording changed (docs/privacy-and-data.md).
    - Referral.
    - Pronunciation feedback, word level first.
    - Honest billing kit plus an AI minutes meter.
    - Graded stories.
    - Quick wins: say-the-picture, and gift-a-streak-freeze.
    - Pricing risk to keep in view: heavy users are estimated at CAD 17.12 a month against the CAD 12.99 price (market-decision-2026-10-24 note; a point-in-time analysis from before the content run, so check it against current data before citing it as current), so lifetime pricing needs a usage cap.
29a. **Podcast audio bucket is public by URL, including unpublished episodes** (documented trade-off, #582). Decide whether to make unpublished audio private.

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
42a. **Call scenes v2 and Royal-night rooms on iOS and Android (build 69).** Look at the 12 call scenes plus the study room day and evening, the five Royal-night screens (learn, hector, listen, profile, practice), and the bottom fade on Alphonso's call avatar (no hard robe edge). Seen on web only; iOS (Limrun refused, no credits) and Android never seen. (#589)
42b. **Call recap and "What Alphonso remembers" on the next build** (after #595): recap card on the call result screen and tap-to-hear; memory page as Pro (weak spots, phrases, goals, delete one, forget everything); free learner forgetting weak-spot notes from Settings; Alphonso's Pro call using the memory; the 30 a day recap quota message. Web is merged (#594); iOS and Android never seen.

- Moved here from 28 (owner 2026-11-16, "i will check on device and let you know"): hands-free with the screen locked, iOS and Android.

### D. STILL OPEN - agent can do

43. **Content residue after the finished content run.** The full content review is DONE (2026-11-06, `docs/content-review/closure-report.md`): 17,196 English, French and Spanish items reviewed, 10,922 fixes applied including 2,074 French/Spanish word-card meanings. What remains by design: 681 items whose proposed fixes still failed the checks after two judge rounds (left as they are); 93 held answer keys (17 on the owner short list in `docs/content-review/owner-list.md`); 59 roleplay-prompt, campaign-premise and podcast-quiz fixes that need a whitelist of the previous prompt before they can ship; measured defect rate of the final content 13.5% (4.2% high-confidence). After any content merge the owner reseeds. Older figures ("about 438 English", "about 580", "about 190 English-term FR/ES cards") were pre-run and are superseded; the 190 cards are probably covered by the 2,074 meanings, unverified.
52. **Marketing site:** social proof, Android status, more than one sample question, and the "try one" question mock are not built (separate repository). (1.2, 2026-11-14 web batch 3)
53. **Resident hazards in tests:** a gate misses a frontable "here" (a2p16q34 was moved; the gate rule was added); the option-class tables are unaudited by a second source. (0.0-av)
57. **Remove the unused push-to-talk capability** from the App ID. (1.1 #9)
59. **Vocab image quality** beyond metadata triage; Android needs no change for empty lines (verified done). (3 Content)
63. **Dev server does not boot in the Windows sandbox.** (4)
66. **Later: monthly per-user cost budget**, to be revisited after about a month of real cost data from the AI cost log (#588). Ties to the lifetime-pricing usage cap in item 29.
67. **LAUNCH READINESS (owner 2026-11-16).** Web first, then iOS and Android; paid from day one; polished full launch; content run already done. Done and live: #598 DB hardening, #600 web launch readiness, #601 security fix (see Recently closed). In flight: store privacy answer sheets (doc); a fix PR for the AI-tutor safety findings (1 Medium: recap looksPersonal filter gaps; 2 Low: Miya link guard, which is moot while Miya AI is off in prod, and a TTS length cap). Build 70 is on TestFlight, not submitted.
68. **Owner dashboard toggle:** turn on leaked-password protection in the Supabase auth settings (cannot be done from code).

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
- #598 (cc980a55) DB hardening: 21 foreign-key indexes and 4 RLS initplan policy fixes; live on prod (index verified).
- #600 (8a94bb6d) Web launch readiness: robots.txt and sitemap.xml generated from the route tree, SEO, canonical and OG tags on the 7 public pages, redesigned 404 and error pages. Owner follow-up is item 69.
- #601 (bf003ed4) Security: the status helpers is_restricted and is_social_restricted are limited to server callers; a new scoped policy_social_restricted helper serves 4 RLS policies (friendships, friend_activity, nudges, team_members). Migration 20261120110000, live and verified on prod: authenticated can no longer call the oracle.
- Self-pentest (2026-11-16/17): clean, no Critical or High, 1 Low (fixed by #601). AI-tutor safety pass: no Critical or High; the 1 Medium and 2 Low are in item 67.
- FR/ES review-panel disagreements (was 44): folded into the content run that finished 2026-11-06 (closure report).
- Build 69 cut and uploaded to TestFlight 2026-11-16 (#593, 840c7948), not submitted; carries call scenes v2, Royal-night rooms, the avatar fade and AI cost tracking. Device check 42a applies to it.
- AI cost tracking (was 65): merged and live 2026-11-16 (#588, ecc7e584). Migration 20261118200000_ai_cost_log applied and verified in production: `ai_cost_log` and `ai_cost_daily` exist, the `tts-cache` bucket is private, `authenticated` has no read; deploy job succeeded; types regenerated automatically (2956fe03; the types-fresh job was red on ecc7e584 only until then). Owner steps are item 1c. Item 66 stays open.
- Call scenes v2 and Royal-night rooms (was 45 and 46): merged in #589 (71c2646c). 14 call-*.webp (12 scenarios plus study room day and evening) and 5 Royal-night screen scenes (learn, hector, listen, profile, practice) on web, iOS and Android (about 2.9 MB per platform). Lessons and story campaigns keep today's rooms (tests); Hector's calls use the new study room; Royal light and Meadow (even in device dark) keep day art; Lesson complete stays light; living clips unchanged; the web call now follows Royal night; Alphonso's call avatar has a bottom fade (solid to 80%) on all three platforms. Seen on web only; iOS and Android are device check 42a.
- Redesign gaps, batch 4 (was 52a): web call screen on design tokens (#586, 5296800c). Web raw-value baseline 44 to 2 (only api/review-demo-code.ts left); PracticeCall, LearnMap and AlphonsoAvatar on tokens; theme faces kept; night-stable fallbacks for the room colour and the LearnMap locked node; behaviour unchanged.
- Build 68 cut and uploaded to TestFlight 2026-11-16 (#585, fc8c9f49, release run success), not submitted; contains #575, #576, #580, #582 and content #574.
- Docs reseed and Vercel owner steps (#584, 876c12ee): reseed after #574 verified; owner item 1b added.
- Android residue (was batch 2, 50): the last Android screens are on the design system (#580, 1c996772); Android raw-value baseline 0. Nothing seen on an emulator, owner device check.
- Concurrent-device review grading and offline streak continuity (was 54): fixed in #582 (b953a0a7); known gap, a lesson started and finished offline credits the sync day.
- Podcast carried risks (was 62): checked in #582, items safe, no XP double count; the public audio bucket is a documented trade-off (see decision 29a).
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
