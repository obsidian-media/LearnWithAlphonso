# Archive

Historical records. Nothing here is current: each file starts with a one-line header naming the PR that delivered it (or what superseded it) and the living doc that describes today's behaviour. Link to those, not to these.

## Plans and specs

Moved from docs/superpowers/ in the 2026-11-22 doc pass (ledger: [DOC-PASS-2026-11-22-plans.md](DOC-PASS-2026-11-22-plans.md)). Three specs still describing open work stay in docs/superpowers/specs/.

### 2026-09

- [2026-09-17-complete-lesson-edge-function-design.md](2026-09/2026-09-17-complete-lesson-edge-function-design.md) (delivered, #27 #31 #190 #260); now: ARCHITECTURE.md (complete-lesson, start-lesson-session sections)
- [2026-09-17-native-ios-app-design.md](2026-09/2026-09-17-native-ios-app-design.md) (delivered, #24 #32 #36 #40); now: ARCHITECTURE.md (iOS section)
- [2026-09-17-native-ios-content-bootstrap.md](2026-09/2026-09-17-native-ios-content-bootstrap.md) (delivered, #87); now: ARCHITECTURE.md
- [2026-09-18-curriculum-db-schema-design.md](2026-09/2026-09-18-curriculum-db-schema-design.md) (delivered, #25 #26 #89); now: ARCHITECTURE.md (curriculum tables, deploy-supabase seeding)
- [2026-09-18-curriculum-db-schema.md](2026-09/2026-09-18-curriculum-db-schema.md) (delivered, #25); now: supabase/migrations/20260918120000_curriculum_data_tables.sql
- [2026-09-18-theme-foundation-design.md](2026-09/2026-09-18-theme-foundation-design.md) (superseded, #30 #512); now: ARCHITECTURE.md (Royal + Meadow)
- [2026-09-18-theme-foundation.md](2026-09/2026-09-18-theme-foundation.md) (superseded, #30 #83 #91 #512); now: ARCHITECTURE.md-952
- [2026-09-19-ios-achievements-leagues-design.md](2026-09/2026-09-19-ios-achievements-leagues-design.md) (delivered, #51 #264); now: ARCHITECTURE.md (achievements, leagues)
- [2026-09-19-ios-friends-design.md](2026-09/2026-09-19-ios-friends-design.md) (delivered, #50 #54 #62 #184); now: ARCHITECTURE.md (friends)
- [2026-09-19-ios-leaderboards-design.md](2026-09/2026-09-19-ios-leaderboards-design.md) (delivered, #49 #54 #62); now: ARCHITECTURE.md (leaderboard)
- [2026-09-19-ios-push-notifications-design.md](2026-09/2026-09-19-ios-push-notifications-design.md) (delivered, #48); now: ARCHITECTURE.md (NotificationLogic)
- [2026-09-19-ios-vocab-images-design.md](2026-09/2026-09-19-ios-vocab-images-design.md) (superseded, #52 #249); now: LESSON_ASSETS.md
- [2026-09-20-hector-weakness-detection.md](2026-09/2026-09-20-hector-weakness-detection.md) (delivered, #256); now: src/routes/api/analyze-weaknesses.ts
- [2026-09-21-conversation-campaigns-design.md](2026-09/2026-09-21-conversation-campaigns-design.md) (delivered, #58 #251 #495); now: ARCHITECTURE.md (campaigns, 31 mentions)
- [2026-09-21-remote-push-notifications-design.md](2026-09/2026-09-21-remote-push-notifications-design.md) (delivered, #57 #59 #60 #192); now: ARCHITECTURE.md
- [2026-09-22-challenges.md](2026-09/2026-09-22-challenges.md) (delivered, #65 #236 #248); now: migration 20260922030500_weekly_challenges.sql
- [2026-09-22-deeper-gamification-design.md](2026-09/2026-09-22-deeper-gamification-design.md) (delivered, #64 #65 #66 #67); now: ARCHITECTURE.md (teams, season ladder, quests)
- [2026-09-22-generative-sentence-content-design.md](2026-09/2026-09-22-generative-sentence-content-design.md) (delivered, #76); now: ARCHITECTURE.md (generative templates)
- [2026-09-22-generative-sentence-content.md](2026-09/2026-09-22-generative-sentence-content.md) (delivered, #76); now: docs/CONTENT-PLAYBOOK.md
- [2026-09-22-season-ladder.md](2026-09/2026-09-22-season-ladder.md) (delivered, #67); now: migration 20260922050000_season_ladder.sql
- [2026-09-22-teams.md](2026-09/2026-09-22-teams.md) (delivered, #66 #236 #248); now: migration 20260922040000_teams.sql plus later team_* migrations
- [2026-09-22-weekly-xp-shared-helper.md](2026-09/2026-09-22-weekly-xp-shared-helper.md) (delivered, #64); now: migration 20260922030000_weekly_xp_helper.sql (+20260929020001, 20260930080000 fixes)
- [2026-09-23-english-content-audit-phase1.md](2026-09/2026-09-23-english-content-audit-phase1.md) (delivered, #84); now: docs/content-audit-2026-11.md
- [2026-09-23-english-content-overhaul-design.md](2026-09/2026-09-23-english-content-overhaul-design.md) (delivered, #84); now: docs/CONTENT-PLAYBOOK.md
- [2026-09-23-ios-canopy-screen-rollout.md](2026-09/2026-09-23-ios-canopy-screen-rollout.md) (superseded, #83 #91 #512); now: ARCHITECTURE.md-952
- [2026-09-23-ios-canopy-theme-foundation.md](2026-09/2026-09-23-ios-canopy-theme-foundation.md) (superseded, #83 #91 #512); now: ARCHITECTURE.md-952
- [2026-09-23-ios-canopy-theme-redesign-design.md](2026-09/2026-09-23-ios-canopy-theme-redesign-design.md) (superseded, #83 #512); now: ARCHITECTURE.md
- [2026-09-24-canopy-web-port-design.md](2026-09/2026-09-24-canopy-web-port-design.md) (superseded, #91 #512); now: ARCHITECTURE.md
- [2026-09-24-french-content-audit-design.md](2026-09/2026-09-24-french-content-audit-design.md) (delivered, #97 #101 #104 #106); now: docs/superpowers/french-content-audit-log.md
- [2026-09-24-french-content-audit-phase1.md](2026-09/2026-09-24-french-content-audit-phase1.md) (delivered); now: docs/content-review/closure-report.md
- [2026-09-24-french-phase-2-question-types-design.md](2026-09/2026-09-24-french-phase-2-question-types-design.md) (delivered, #104 #106 #108 #115); now: docs/CONTENT-PLAYBOOK.md
- [2026-09-24-listening-question-type.md](2026-09/2026-09-24-listening-question-type.md) (delivered, #88); now: migration 20260924010000_v5_listening_question_type.sql
- [2026-09-24-pair-pack-pos-coverage.md](2026-09/2026-09-24-pair-pack-pos-coverage.md) (superseded); now: ARCHITECTURE.md (two sources of POS tags)
- [2026-09-24-placement-question-types.md](2026-09/2026-09-24-placement-question-types.md) (delivered, #107 #128); now: src/data/placement.ts
- [2026-09-24-podcast-library-phase1-design.md](2026-09/2026-09-24-podcast-library-phase1-design.md) (delivered, #98 #105 #262); now: ARCHITECTURE.md (podcast_* tables)
- [2026-09-24-podcast-library-phase1a.md](2026-09/2026-09-24-podcast-library-phase1a.md) (delivered, #98 #105); now: migration 20260926030000_podcast_library.sql
- [2026-09-24-podcast-phase0-ios-tabs-design.md](2026-09/2026-09-24-podcast-phase0-ios-tabs-design.md) (delivered, #102); now: ios/LearnWithAlphonso/Sources/RootView.swift (5 tabs
- [2026-09-24-podcast-phase0-ios-tabs.md](2026-09/2026-09-24-podcast-phase0-ios-tabs.md) (delivered, #102); now: ios/LearnWithAlphonso/Sources/RootView.swift
- [2026-09-24-podcast-phase1b-ios-design.md](2026-09/2026-09-24-podcast-phase1b-ios-design.md) (delivered, #110 #262 #270); now: ARCHITECTURE.md (Listen/Library)
- [2026-09-24-podcast-phase1b-ios.md](2026-09/2026-09-24-podcast-phase1b-ios.md) (delivered, #110 #262); now: ios/LearnWithAlphonso/Sources/ListenView.swift
- [2026-09-24-speaking-question-type.md](2026-09/2026-09-24-speaking-question-type.md) (delivered, #94); now: migration 20260924081755_v5_speaking_question_type.sql
- [2026-09-24-translation-question-type.md](2026-09/2026-09-24-translation-question-type.md) (delivered, #96); now: migration 20260926010000_v5_translate_question_type.sql
- [2026-09-25-podcast-phase2b-questions-design.md](2026-09/2026-09-25-podcast-phase2b-questions-design.md) (delivered, #125 #126 #374 #375); now: ARCHITECTURE.md 'Podcast quiz' and line 2164 (#487)
- [2026-09-25-podcast-phase3-offline-download-design.md](2026-09/2026-09-25-podcast-phase3-offline-download-design.md) (delivered, #131 #133); now: ARCHITECTURE.md "Offline download (Phase 3)" (~line 372)
- [2026-09-25-podcast-phase3-offline-download.md](2026-09/2026-09-25-podcast-phase3-offline-download.md) (delivered, #131 #133 #262); now: ARCHITECTURE.md
- [2026-09-25-podcast-phase4-admin-design.md](2026-09/2026-09-25-podcast-phase4-admin-design.md) (delivered, #140 #143 #703); now: ARCHITECTURE.md (podcast admin ~line 355
- [2026-09-25-podcast-phase4-admin.md](2026-09/2026-09-25-podcast-phase4-admin.md) (delivered, #140 #141 #143 #262); now: ARCHITECTURE.md (admin_users, line ~274)
- [2026-09-25-spanish-content-audit-design.md](2026-09/2026-09-25-spanish-content-audit-design.md) (delivered, #122 #127 #130 #132); now: ARCHITECTURE.md
- [2026-09-26-ci-guard-audit.md](2026-09/2026-09-26-ci-guard-audit.md) (delivered, #161 #204); now: .github/workflows/ci.yml
- [2026-09-26-display-identity-and-team-creation.md](2026-09/2026-09-26-display-identity-and-team-creation.md) (delivered, #178 #248 #255); now: ARCHITECTURE.md
- [2026-09-26-hector-reparenting-design.md](2026-09/2026-09-26-hector-reparenting-design.md) (superseded, #157 #159 #176 #189); now: docs/superpowers/specs/2026-09-27-hector-decoupling-design.md
- [2026-09-27-hector-decoupling-design.md](2026-09/2026-09-27-hector-decoupling-design.md) (delivered, #189); now: ARCHITECTURE.md
- [2026-09-27-hector-decoupling.md](2026-09/2026-09-27-hector-decoupling.md) (delivered, #189); now: ARCHITECTURE.md (Hector section, /api/hector-respond ~line 970)
- [2026-09-29-android-app-design.md](2026-09/2026-09-29-android-app-design.md) (delivered, #200); now: android/LearnWithAlphonso/README.md
- [2026-09-29-android-plan-1-foundation-and-learning-loop.md](2026-09/2026-09-29-android-plan-1-foundation-and-learning-loop.md) (delivered, #200); now: ARCHITECTURE.md (Android sections ~line 1477+)
- [2026-09-29-android-plan-2-social-and-gamification.md](2026-09/2026-09-29-android-plan-2-social-and-gamification.md) (delivered, #200); now: ARCHITECTURE.md
- [2026-09-29-android-plan-3-audio-ai-and-pro.md](2026-09/2026-09-29-android-plan-3-audio-ai-and-pro.md) (delivered, #200 #312); now: ARCHITECTURE.md
- [2026-09-29-android-plan-4-podcasts-notifications-push-widget.md](2026-09/2026-09-29-android-plan-4-podcasts-notifications-push-widget.md) (delivered, #200 #192 #323 #327); now: ARCHITECTURE.md
- [2026-09-29-android-plan-5-release.md](2026-09/2026-09-29-android-plan-5-release.md) (delivered, #198 #199 #200); now: .github/workflows/android-release.yml
- [english-content-audit-log.md](2026-09/english-content-audit-log.md) (delivered, #84); now: docs/content-review/closure-report.md
- [french-content-audit-log.md](2026-09/french-content-audit-log.md) (delivered, #391 #427); now: docs/CONTENT-PLAYBOOK.md
- [french-distractor-quality-evidence.md](2026-09/french-distractor-quality-evidence.md) (delivered, #427 #391); now: docs/distractor-policy.md

### 2026-10

- [2026-10-05-learning-goal-planner-design.md](2026-10/2026-10-05-learning-goal-planner-design.md) (delivered, #222 #223 #224 #225); now: ARCHITECTURE.md
- [2026-10-05-save-any-word-design.md](2026-10/2026-10-05-save-any-word-design.md) (delivered, #211 #212 #213 #214); now: ARCHITECTURE.md
- [2026-10-05-save-any-word-phase1.md](2026-10/2026-10-05-save-any-word-phase1.md) (delivered, #211 #212 #213 #214); now: ARCHITECTURE.md (save-any-word, lines ~238-240, ~1477)
- [2026-10-06-buddy-pairing-web.md](2026-10/2026-10-06-buddy-pairing-web.md) (delivered, #238 #248); now: ARCHITECTURE.md (buddy_* tables lines ~80-83)
- [2026-10-06-learning-goal-planner-android.md](2026-10/2026-10-06-learning-goal-planner-android.md) (delivered, #226); now: ARCHITECTURE.md (learning goal planner ~line 242)
- [2026-10-06-learning-goal-planner-ios.md](2026-10/2026-10-06-learning-goal-planner-ios.md) (delivered, #225); now: ARCHITECTURE.md (~line 242)
- [2026-10-06-learning-goal-planner-web.md](2026-10/2026-10-06-learning-goal-planner-web.md) (delivered, #223 #224); now: ARCHITECTURE.md (~line 242)
- [2026-10-06-study-together-design.md](2026-10/2026-10-06-study-together-design.md) (delivered, #230 #234 #238 #240); now: ARCHITECTURE.md
- [2026-10-06-team-mission-web.md](2026-10/2026-10-06-team-mission-web.md) (delivered, #230 #231 #233 #234); now: ARCHITECTURE.md
- [2026-10-06-team-player-badge.md](2026-10/2026-10-06-team-player-badge.md) (delivered, #232); now: ARCHITECTURE.md
- [2026-10-07-buddy-matching.md](2026-10/2026-10-07-buddy-matching.md) (delivered, #244 #245 #248 #265); now: ARCHITECTURE.md (buddy_pool lines ~82-83)
- [2026-10-07-buddy-messages-web.md](2026-10/2026-10-07-buddy-messages-web.md) (delivered, #242 #243); now: ARCHITECTURE.md (buddy_messages line ~81)
- [2026-10-17-generative-content-fr-es-design.md](2026-10/2026-10-17-generative-content-fr-es-design.md) (delivered, #317 #319); now: ARCHITECTURE.md (generative)

### 2026-11

- [2026-11-02-openrouter-switch.md](2026-11/2026-11-02-openrouter-switch.md) (delivered, #338); now: ARCHITECTURE.md (AI chat section lines ~1594-1620)
- [2026-11-02-visual-refresh-design.md](2026-11/2026-11-02-visual-refresh-design.md) (delivered, #341 #347 #350); now: ARCHITECTURE.md (Royal/Meadow design system ~line 939)
- [2026-11-02-visual-refresh.md](2026-11/2026-11-02-visual-refresh.md) (delivered, #341 #345); now: ARCHITECTURE.md
- [2026-11-02-web-hector-pro-design.md](2026-11/2026-11-02-web-hector-pro-design.md) (delivered, #339); now: ARCHITECTURE.md "Alphonso Pro on the web" (line 1952)
- [2026-11-02-web-hector-pro.md](2026-11/2026-11-02-web-hector-pro.md) (delivered, #339 #470); now: ARCHITECTURE.md ("Alphonso Pro on the web", ~line 1952)
- [2026-11-03-visual-refresh-scenes-design.md](2026-11/2026-11-03-visual-refresh-scenes-design.md) (delivered, #341 #347 #350 #344); now: ARCHITECTURE.md (design system)
- [2026-11-03-visual-round4.md](2026-11/2026-11-03-visual-round4.md) (delivered, #347); now: ARCHITECTURE.md
- [2026-11-13-admin-console-and-support-design.md](2026-11/2026-11-13-admin-console-and-support-design.md) (delivered, #496 #515 #524 #532); now: ARCHITECTURE.md staff console (line 2167)
- [2026-11-13-admin-console-phase1.md](2026-11/2026-11-13-admin-console-phase1.md) (delivered, #496 #682 #703); now: ARCHITECTURE.md (staff_roles etc. line ~61, "Build 62" section ~2155)
- [2026-11-14-support-help-chat.md](2026-11/2026-11-14-support-help-chat.md) (delivered, #515 #524 #532 #541); now: ARCHITECTURE.md (Help chat sections ~lines 1699-1709)
- [2026-11-17-graded-stories-design.md](2026-11/2026-11-17-graded-stories-design.md) (delivered, #617 #623 #624 #625); now: docs/operations.md (story narration only) - GAP: no living doc for the data model/reader
- [2026-11-17-pronunciation-feedback-design.md](2026-11/2026-11-17-pronunciation-feedback-design.md) (delivered, #616 #621 #661 #664); now: none - GAP FOR A (src/lib/pronunciation.ts, SayItRight.tsx)
- [2026-11-17-say-the-picture-design.md](2026-11/2026-11-17-say-the-picture-design.md) (delivered, #609 #613 #658 #660); now: none - GAP FOR A (src/lib/say-the-picture.ts, src/components/practice/SayThePicture.tsx)
- [2026-11-18-interactive-branching-stories-design.md](2026-11/2026-11-18-interactive-branching-stories-design.md) (delivered, #622 #635 #659 #675); now: none - GAP FOR A (migration 20261122100000_branching_stories.sql, src/lib/branching.ts, BranchingStoryReader.tsx)

## Root and other archived files

(Workstream A adds its archived root files here.)
