# Real-iPhone QA checklist before submitting

Run on a physical iPhone with the release candidate from TestFlight (build 71 or later). Use a fresh test account unless
a step says otherwise. Sandbox purchases need a Sandbox Apple Account. Tick each box and note the build number.

## Account

- [ ] Sign up with email: the code arrives, enter it, name step, first-run flow completes.
- [ ] Sign in again with the same email code.
- [ ] Sign in with Apple (new account and returning account).
- [ ] Sign in with Google.
- [ ] Account switch: sign out, sign in as a second account; nothing from the first account (data, streak) shows.
- [ ] Spare install: answer Under 13 in first-run; the analytics prompt never appears and AI features stay off.

## Offline and sync

- [ ] Airplane mode: finish a lesson; the app says progress is kept and will sync.
- [ ] Reconnect: progress, XP and streak appear on the web for the same account.
- [ ] Sign out while progress is still queued (offline): the queued progress is kept; signing back in syncs it.

## Streak and hearts

- [ ] Streak count and freeze display match what the web shows.
- [ ] Hearts: a wrong answer costs one; at 0 a lesson cannot start and the options are explained.

## Pro and purchases (sandbox)

- [ ] Open the paywall from Hector: price, trial terms, Restore, Terms and Privacy links all visible.
- [ ] Paywall withdrawal wording is present and matches the legal pages.
- [ ] Buy Pro monthly with the Sandbox account; Hector unlocks.
- [ ] Delete the app, reinstall, sign in, tap Restore Purchases: Pro returns.

## AI features

- [ ] First AI use shows the AI consent sheet naming Deepgram and Anthropic via OpenRouter; "Not now" keeps the app working.
- [ ] Hector call: allow the microphone, talk, hear the reply, see the transcript, end the call, the recap shows.
- [ ] Long-press a Hector reply: "Report this response" offers reasons and confirms "Thanks".
- [ ] Miya (Profile > Help): the AI label and tag show; ask a question and get a reply.
- [ ] Long-press a Miya reply (and the VoiceOver action): "Report this response" offers reasons and confirms "Thanks";
      a staff reply has no report option.
- [ ] "Talk to a person" hands off; a staff reply arrives with email and push.

## Stories

- [ ] Graded stories: library, reader, check.
- [ ] Branching stories (once #635 has landed): pick a branch, finish, see the result screen.

## Notifications, widget, privacy, deletion

- [ ] Push notifications: allow when asked, a reminder or a support reply arrives, tapping it opens the right screen.
- [ ] Widget: add the streak widget; it shows the current streak and updates after a lesson.
- [ ] Settings > Share anonymous usage data is off by default and the switch works.
- [ ] Export My Data works.
- [ ] Delete My Account (type DELETE): signs out; signing in again with the same email starts a brand new account.

## Accessibility spot checks

- [ ] VoiceOver: Learn, a lesson question, the Hector call controls, Help chat and the paywall are reachable and labelled.
- [ ] Dynamic Type at the largest size: lesson, paywall and Help chat do not clip or overlap.
- [ ] Reduce Motion on: no looping or large movements.
- [ ] Royal light, Royal night and Meadow themes are all readable.
