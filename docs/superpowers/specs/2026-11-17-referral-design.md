# Referral program (design, approved 2026-11-17)

## Status (verified 2026-11-22 against d8350542)

Delivered: server and web in #610 (merged 2026-11-17, migration `20261120140000_referral_program.sql`), the privacy line in #612, and the Invite screens on iOS and Android in #615 (iOS `ReferralInviteView.swift`, Android `ui/referral/ReferralInviteScreen.kt`). LIVING because this is the only document of the referral rules (nothing in ARCHITECTURE.md, AGENTS.md or README.md mentions them) and one follow-up is genuinely open: a tapped referral link still opens the browser, not the app (see "Out of scope"). Not tracked in `docs/OPEN-ITEMS.md` at the time of this check.

Checked in code: constants `REFERRAL_REWARD_HEARTS = 5`, `REFERRAL_MONTHLY_CAP = 20`, `REFERRAL_FREEZE_CAP = 3`, 30-day capture (`REFERRAL_KEEP_MS`) in `src/lib/referral.ts`; `claim_referral` refuses an account older than 2 days and `monthly_cap = 20` / `freeze-cap` / `monthly-cap` notes in the migration; the first-lesson hook after a saved completion in `src/lib/sync.functions.ts` (`completeLessonRemote`, `settleReferralReward`) and `supabase/functions/complete-lesson/handler.ts` (`_shared/referral.ts`); the screen `src/routes/_authenticated/profile_.invite.tsx`. The link host is no longer fixed: the web builds it from `window.location.origin` (`referralLink` in `src/lib/referral.ts`), so on the current web address it is `https://learnwithalphonso.com/?ref=<code>`, not the old `learn.alphonsoecosystem.app` host written below.

Open work:
- Make a referral link open the app. The app links cover `/invite/*` only (iOS associated domains; Android manifest `pathPrefix="/invite/"` at `AndroidManifest.xml:52` and `:54`), and the referral link is `/?ref=<code>`. Needs the owner/infra step of an association for the site root (iOS can match the `ref` query; Android App Links cannot filter by query, so a root `/` path would claim every site link) or a dedicated `/r/<code>` path. Until then iOS and Android rely on the manual "Got an invite code?" claim and on `ReferralPending` for a `?ref` link that does reach the app.
- Device and network based duplicate detection stays out of scope (unchanged).

Original status line: owner-approved design. First increment is server + web. iOS and Android (native share sheet) follow.

## Goal

A learner can invite a friend with a personal link. When the friend is a real, engaged new learner, both get a small
reward. The program must not be farmable.

## Reward

| Who                                                                                | Reward                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Invited friend (the referee, always a brand-new account, so free at referral time) | Bonus hearts                                                                                 |
| Referrer, free                                                                     | Bonus hearts                                                                                 |
| Referrer, Pro                                                                      | ONE streak freeze instead (Pro already has unlimited hearts, so hearts mean nothing to them) |

- Hearts amount lives in ONE documented constant (`REFERRAL_REWARD_HEARTS`). The hearts column is hard-capped at 5
  (`user_progress_hearts_range`), and a streak milestone already means "refill to full", so a "day's worth" collapses to a
  full refill: the reward is a full refill (5). Changing the number is a one-line change in the migration function plus
  the TypeScript constant; a test pins both to the same value.
- Streak freeze reuses the existing mechanic (`user_progress.streak_freezes`). The hold cap is 3 (the same cap the gift
  uses). A Pro referrer already holding 3 is skipped gracefully: no error, the friend still gets their hearts, and the
  referral records why (`note = 'freeze-cap'`).

## Trigger

The reward fires when the referee completes their FIRST lesson, never on signup. The hook sits on the existing
server-side completion paths (the web server function `completeLessonRemote` in `sync.functions.ts` and the
`complete-lesson` Edge Function used by iOS): after a completion is saved and hearts are settled, each calls the
service-role-only database function `grant_referral_reward`. The call is best-effort and can never fail or delay a saved
lesson. A referral still pending after the first completion (the call failed) is granted by the next completion, which
is the catch-up path.

## Attribution

- Each learner already has an opaque, unguessable invite code (`friend_invite_codes`, created lazily). The referral link
  was `https://learn.alphonsoecosystem.app/?ref=<code>` when written; today it is the site origin plus `/?ref=<code>`. No second code system.
- A visitor opening the link has the code captured (kept 30 days in the browser, only the opaque code) and carried
  through sign-up, including email confirmation in another tab. Once signed in, the app claims it once with
  `claim_referral`.
- A person can be referred ONCE, at signup, never retroactively: the claim is refused if the account is more than 2 days
  old or already has a completed lesson, and `referee_id` is unique.
- The reward is granted EXACTLY ONCE: the referral row is locked and moves `pending -> completed` in one transaction.

## Anti-abuse

- Reward only after a first completed lesson (a real, engaged human, behind the existing hourly completion ceiling).
- Self-referral is refused (referrer = referee, and the direct circle A refers B while B refers A). Best effort: one
  human with two accounts is bounded by the cap and the first-lesson requirement, not eliminated.
- Cap: 20 rewarded referrals per referrer per UTC calendar month (`REFERRAL_MONTHLY_CAP`). Invites past the cap still
  work (the friend signs up and learns) but grant nothing to anyone; the referrer sees "monthly invite reward limit
  reached". It resets on the 1st (UTC).
- A referee cannot be referred twice (unique key plus the claim check).
- A blocked or banned referrer is treated as an unknown code.
- All checks run server-side, after locking both learners' progress rows in id order, so two simultaneous completions
  cannot both pass the cap.

## Placement

A new "Invite friends" screen at `/profile/invite`, reached from Profile (a row under "Friends this week"). It shows the
learner's referral link with a copy / share button, the count of successful referrals, how many rewards are left this
month, and a short plain explanation of the reward. States: loading, ready, cap reached, error. Web first.

## Data

`public.referrals`: `id`, `referrer_id`, `referee_id` (unique), `status` (`pending` | `completed`), `created_at`,
`completed_at`, `reward_kind` (`hearts` | `freeze` | `none`), `reward_granted`, `capped`, `note`. RLS: a learner reads
only rows where they are the referrer or the referee; clients have `SELECT` only. Creation is
`claim_referral` (authenticated, `SECURITY DEFINER`, `search_path = ''`); granting is `grant_referral_reward`
(service role only, same hardening). Cascade on account deletion.

## Out of scope (follow-ups)

- Capturing the code from a deep link on iOS and Android. The Invite screens, native share and the manual "Got an invite
  code?" claim field shipped (R41). The app links cover `/invite/*` only (apple-app-site-association and the Android
  manifest), and the referral link is `/?ref=<code>`, so a tapped referral link opens the browser, not the app. The app
  already captures and claims a `?ref` link that does reach it (`ReferralPending`); it needs the owner/infra step of an
  association for the site root (iOS can match the `ref` query; Android App Links cannot filter by query, so the root
  `/` path would claim every site link) or a dedicated `/r/<code>` path, before it ever fires.
- Any change to pricing or the paywall.
- Device or network based duplicate detection.
