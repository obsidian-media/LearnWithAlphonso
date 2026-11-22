# Doc pass 2026-11-22, workstream C (open items): ledger

Verified against origin/main d8350542 (build 72, #705), `gh pr` (merged #603 to #705; open: #620 draft only), read-only production SELECTs and live URL probes on 2026-11-22.

| File | State | What changed | Evidence |
|---|---|---|---|
| docs/OPEN-ITEMS.md | UPDATED | Rewritten sweep header and every section. Closed: item 8 (support_ai is ON), 18 (custom domain), 20a (Limrun ran 11-21), 29 (features shipped), 42b merged, 66 (cap #605), 67, 68, 71. Updated: build 66/67/70 to 72, domain learn.alphonsoecosystem.app to learnwithalphonso.com (69), 1b sender domain, Android item 10 and workflow blocker. Added: 72 (308 redirects, timed), 72a (Resend Pro), 73 (Android workflow run), 74 (Apple web Services ID), 76 (9 held lesson-mix items), 77, 78-80/82 (remaining final QA), 81 (vocab_images host), 83 (extras review), 84 (cron prune), 42c. | `app_switches` support_ai enabled, updated 2026-11-19; questions 13,429, lessons 1,830, stories 47/47 published; vocab_images 1,421/1,421 on legacy host; cron.job_run_details 3,959; `gh pr view` 595/594 MERGED, 620 OPEN draft, 669 closed; ios/LearnWithAlphonso/project.yml:340,479 build 72; AppConfig.swift:10,25; android build.gradle.kts:37; android-release.yml (RC key check); Android Release Bundle run 45001890704 failed; curl sitemap.xml 200; #702 body (redirect runbook); #686 body (Hector type box fixed); docs/lesson-mix/held-for-owner.json has 9 entries |
| docs/archive/DOC-PASS-2026-11-22-open-items.md | NEW | this ledger | |

Not verifiable from here (kept, marked unverified in the doc): Vercel production env values (403), App Store Connect state, Paid Apps Agreement, Supabase auth dashboard toggles, provider settings on the admin project, staff display names.

The private master (docs/BACKLOG.md, gitignored) carries the same list plus a private addendum; it was edited in place in the main checkout, no git operation run there.

Follow-up: SUPPORT_NOTIFY_FROM and REPORT_NOTIFY_FROM item closed (code defaults since #704 at src/lib/support-notify.server.ts:86 and src/lib/report-notify.server.ts:72; both variables confirmed unset by a coordinator browser check on 2026-11-22). Other Vercel-only items re-tagged "verify via browser (coordinator)". Marketing-site item re-checked against that repository (7df17a1). Android setup path corrected to android/LearnWithAlphonso/OWNER-SETUP.md. Old "Recently closed" build lines labelled history. End-of-pass grep and path checks run; remaining hits are intentional.

Follow-up 2: item 29 closure evidence (#610/#615, #616/#621, #617-#625, #609/#613) and section B re-check recorded; added items 85 (referral link opens browser, /?ref= not covered by app links, android manifest 52-54), 86 (CI never exercises real signing, ci.yml:942; no cross-runtime grading parity run), 87 (native full-screen suspended view unbuilt: only a sign-in notice, Session.swift:641-651, SessionManager.kt:150,297).
