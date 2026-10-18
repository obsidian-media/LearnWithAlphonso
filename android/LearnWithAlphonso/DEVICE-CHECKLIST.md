# Device checklist before the first Play upload

CI proves the app compiles, its logic is right, and it launches on an
emulator. Four areas cannot be proven there (spec section 12): audio,
purchases, push and the widget. The owner runs this list once on a real
phone (Android 8 or newer, developer options on) with the debug APK from
the `app-debug-apk` artifact of the latest green `android-ci.yml` run:

```
adb install -r app-debug.apk
```

Tick each line in a copy of this file and attach it to the release PR.

## Sign-in and sync

- [ ] Email code sign-in delivers a code and lands on the Learn tab.
- [ ] Google sign-in opens a Custom Tab, returns to the app, and lands on the Learn tab (needs the Supabase redirect allow-list, owner item 1).
- [ ] Airplane mode on, complete a lesson, airplane mode off: the completion syncs and XP appears within a few seconds of reconnecting.
- [ ] Sign out, sign in again: the header shows the same streak and XP.

## Audio (Plan 3)

- [ ] First hold-to-talk press asks for the microphone; deny, and the speak question falls back to typing with the iOS copy.
- [ ] Allow the microphone; a 2-second utterance transcribes and grades; a tap shorter than half a second says "Didn't catch that" and spends no heart.
- [ ] Practice scenario: the reply plays aloud; leaving mid-recording cancels cleanly and a later podcast is not stuck paused.
- [ ] Hector (Pro or demo account): the first reply plays and the transcript scrolls.

## Podcasts (Plan 4)

- [ ] An episode plays; lock the screen; playback continues and the lock screen shows play, pause and the title.
- [ ] Unplug headphones (or disconnect Bluetooth): playback pauses.
- [ ] Start a hold-to-talk recording while an episode plays: the episode pauses and does not resume by itself.
- [ ] Download an episode, airplane mode on, kill and reopen the app: the Listen tab shows "Offline, showing your downloads" and the episode plays.
- [ ] Delete a downloaded episode while it plays: playback stops first, no crash.
- [ ] Close the app mid-episode, reopen: the episode row shows "Resume" and resumes near the same position.
- [ ] Play an episode, close the player, tap the same row again without leaving the folder: it shows "Resume" and starts from where you stopped, not from the old position.
- [ ] Listen on two devices with the same account: play on A, then on B past A's position; going back to A and playing does not rewind B's position (A may resume from B's after it reloads the list).
- [ ] An AI-narrated episode (podcast voice episodes) shows "5:05 · AI-narrated" (plus "Resume" when it has a position); an uploaded recording shows no label; the offline list shows "Downloaded · AI-narrated" for a downloaded AI-narrated one.
- [ ] Tap an episode on a slow connection: the mini bar shows a spinner (not Pause) until sound starts, then Pause.
- [ ] Airplane mode on, tap an episode that is not downloaded: the mini bar says "Download this episode to listen offline." with Retry; a downloaded one plays.
- [ ] Ask the owner to unpublish an episode you are not playing, reopen Listen: the episode and (if it was the last one) its folder are gone, and a download of it is removed. The episode playing at the time keeps playing.
- [ ] A broken or removed audio file (ask the owner to rename it in the bucket): playing it shows "This episode isn't available right now." with Retry, never a Pause that does nothing.
- [ ] Kill the network mid-episode: the mini bar shows "Buffering…" in place of the time. If sound does not come back within about 20 seconds it shows "Couldn't reach the server. Check your connection and try again." with Retry; Retry resumes from where it stopped once the network is back. If the network returns before 20 seconds, playback continues by itself and nothing is shown.
- [ ] Let an episode play to the end: it stops (it does not start again by itself), shows Play, and tapping Play starts it from the beginning within a second or two, with no error afterwards.
- [ ] Pause and play from the notification, the lock screen and a headset or Bluetooth button: the mini bar follows each press, with no spinner and no error after 20 seconds.
- [ ] Receive a phone call (or a navigation prompt) while an episode plays: playback pauses and comes back by itself when the call ends, and the bar says Pause the whole time.
- [ ] Pull the headphones (or switch Bluetooth off): playback pauses and stays paused; it does not play out of the speaker. Start a different audio app while an episode plays: the episode stays paused.
- [ ] Switch the course on the Learn tab to French, then open Listen: only French (and course-less) folders show; a course with no episodes says "No French episodes yet" with Refresh.
- [ ] Download a file that the server answers with a JSON error (ask the owner for a missing path): the download fails with "This episode isn't available to download right now." and nothing is stored.
- [ ] Sign out while an episode plays: playback stops, the notification disappears, and signing in as another account shows no resume position from the first.

## Notifications and push (Plan 4)

- [ ] Completing the first lesson asks for notification permission once; a later lesson never asks again.
- [ ] With permission granted and no lesson done today, set the phone clock to 19:59 and wait: "Keep your streak alive" arrives at 20:00.
- [ ] From a second account, nudge this account: a "You've been nudged!" notification arrives on the lock screen (needs owner items 2, 3 and 4).
- [ ] Sign out: the `device_tokens` row for this device disappears (check in Supabase Table Editor).

## Widget (Plan 4)

- [ ] Long-press the home screen, Widgets, add Learn with Alphonso Streak: it shows the streak count and "Not studied yet" or "Studied today".
- [ ] Complete a lesson: the widget updates within a few seconds without reopening the launcher.

## Purchases (Plan 3, needs owner items 5 to 7)

- [ ] Hector tab on a non-Pro account shows a real price from the Play product.
- [ ] Subscribe with a license-tester account: the Play purchase sheet completes and the Hector conversation opens.
- [ ] Restore Purchases on a fresh install of the same Google account unlocks Hector.
- [ ] Manage Subscription opens the Play subscriptions page.

## Offline queue reliability (nothing here has been run on a device)

Use a QA account. Airplane mode for the offline rows.

- [ ] Finish a lesson in airplane mode: "Saved. It will sync when you're back online." Turn airplane mode off: within a minute the Learn tab line "1 lesson is saved on this phone and waiting to sync." disappears by itself and XP updates (no need to leave the app).
- [ ] With airplane mode on, the Learn tab line says it will sync when you're back online; "Sync now" with no connection ends without an error.
- [ ] Finish a review answer offline, then answer two more: the line counts "N review answers"; reconnect and "Sync now": the count drops to zero and the queue order was kept.
- [ ] At 0 hearts, finish a lesson that was started earlier (or queue one offline, then drain hearts): it says "Saved. It will sync when your hearts refill." and syncs after the refill without a "couldn't save" notice.
- [ ] Sign in as account A, queue a lesson offline, sign out and in as account B, go online: B's Learn tab does not show A's pending line and A's lesson is never sent (check the account's XP did not change). Signing out discards what was waiting, as on iOS: sign back in as A and the line is gone too.
- [ ] Queue a lesson in airplane mode, switch accounts quickly (sign out, sign in as someone else) while the app is syncing after reconnect: the first account's lesson is never credited to the second account (check both accounts' XP), and the second account's Learn tab shows no pending line.
- [ ] Revoke the session on the server (sign the account out of all devices) while the app is in the background with a lesson queued, then open the app: it asks to sign in, and after signing in as another account the old queued lesson is gone and never sent.
- [ ] Cold launch with a lesson queued (kill the app, reopen): the queued lesson is still there and syncs; opening the app never clears the queue.
- [ ] Keep the app open on the Learn tab with the server returning 503 for complete-lesson (QA server) and a lesson queued: the line stays, and every few minutes (30 s, then doubling) the app retries by itself, three or more times in a row, without a foreground or "Sync now"; once the server recovers it drains.
- [ ] Queue a lesson while online but with the server down, then restore the server: it syncs without leaving the screen (the wake-up was armed when the lesson was queued).
- [ ] A lesson finished while the access token is expired and the refresh cannot reach the server: it says "Saved. It will sync when you're back online." (never "You've been signed out").
- [ ] A lesson the server rejects (for example after a content update changed the lesson: ask the owner to bump a lesson version on the QA server): the finish shows "This lesson changed since you started it..." with the support email line and nothing is queued; if it was queued earlier, the Learn tab shows "1 lesson couldn't be saved. Contact support." with Contact support (opens a mail draft listing the lesson) and Dismiss (the notice stays gone after a relaunch, and after a cold start where the list loads empty first). With no mail app installed, Contact support does nothing and does not crash. A lost review answer never shows this notice.
- [ ] Server trouble (ask the owner to make complete-lesson return 503 on the QA server): the finish says "Our server had a problem. Your lesson is saved and will sync automatically." and it syncs by itself later without reopening the app.
- [ ] Review: answer an item online, then check the Learn tab review badge: it drops by one right away.

## Learning goal (planner part 3, nothing here has been run on a device)

- [ ] Learn tab, no goal yet: the card says "Set a learning goal"; tapping it opens the dialog with 6 months pre-filled and a "N lessons a week" preview.
- [ ] Pick a level and a date with the date picker (today and earlier are greyed out) and with the 3, 6 and 12-month buttons: the preview follows each change and Save stays disabled until it arrives.
- [ ] Save: the card shows "Finish B1 by ...", progress, a status line, lessons a week and "An estimate of lessons, not of fluency."; the same goal shows on the web and iOS.
- [ ] Change goal and Remove goal work; a failed save or remove shows an inline message and leaves the goal editable.
- [ ] Airplane mode, reopen the app: the last plan shows with "You're offline ... As of <date>." and both buttons disabled; with no cached plan it says "Connect to load your goal".
- [ ] Switch course (English, French, Spanish) while the card is loading or saving: the card always shows the course on screen, never the one you left.
- [ ] Finish a lesson and go back to Learn: the goal card's numbers update without a "Loading" flash.
- [ ] Tap Save goal and immediately open a lesson: coming back shows the NEW goal (the save finishes in the background).
- [ ] TalkBack announces an error message (for example the server's "That level is below yours") when it appears.
- [ ] TalkBack reads the headline, progress and status line in order; the status is words, not only colour.
- [ ] Display size and font scale at 200%: the dialog scrolls and no text is clipped.
- [ ] Sign out, sign in as someone else: the other account's goal never appears, even offline.

## Team mission (study together, nothing here has been run on a device)

- [ ] Alone on a team: the Teams screen and the Learn tab show "Invite a friend to start your team's weekly mission" and no progress bar.
- [ ] With a second member: the card shows "N of M lessons done", a progress bar, and "You added X · D days left" (M is members x 4; "Last day" when one day is left).
- [ ] Finish a lesson, go back to Learn: your count and the bar move without a flash; the same numbers show on the web and iOS.
- [ ] The team reaches its target: "Mission complete!" and "+50 XP for everyone who joined in"; a member who added no lesson gets no XP; a "Team player" badge appears under Achievements for the members who were paid.
- [ ] As the team owner remove the other member: the team screen's card changes to "Invite a friend" without reopening the screen.
- [ ] No team at all: neither screen shows a card or a blank gap in the Learn list.
- [ ] Airplane mode: the card disappears rather than showing old numbers.
- [ ] TalkBack reads the headline, "Team mission progress, N percent" and the footer; the bar is not the only carrier of the information.
- [ ] Font scale 200%: nothing is clipped.

## Links

- [ ] Tap an invite link `https://learn.alphonsoecosystem.app/invite/<code>` from a message: it opens the app on the invite screen (needs `assetlinks.json`, owner item 9).
- [ ] Settings, Export my data saves a file through the system picker.
- [ ] Settings, Delete my account with the typed DELETE removes the account and returns to sign-in.

## Study buddy (Friends screen)

Two test accounts that are friends (A and B).

- [ ] A opens Friends: a "Study buddy" card shows the intro and lists B under "Ask a friend to be your study buddy".
- [ ] A taps B: "Request sent. They'll see it on their Friends page." appears and B disappears from the ask list; "Waiting for B." shows with Cancel request.
- [ ] B opens Friends: "A wants to be your study buddy." with Accept / Decline. Accept: "You're study buddies now." and the card shows A, "You 0/3 · Buddy 0/3 this week", "Streak: 0 weeks", "1 grace week left".
- [ ] After A finishes a lesson, B's card (reopen Friends) shows "Buddy 1/3".
- [ ] End study buddy asks "End being study buddies with A? Your streak ends."; Keep does nothing, Yes, end shows "You're no longer study buddies."
- [ ] Airplane mode, reopen Friends: "Couldn't load your study buddy." with Try again (never the ask list); turn the network back on, Try again recovers.
- [ ] Paired: "Send B a message" opens the 8 presets (no text field anywhere). Pick "Nice work!": "Sent." appears and "You: Nice work!" shows in the history; B sees "A: Nice work!" within a minute while Friends is open.
- [ ] Send 21 presets within an hour: the 21st answers "You've sent a lot of messages. Try again in a while."
- [ ] Matching (two test accounts that are NOT friends, same course, similar level, neither with a buddy): A sees the opt-in explanation, an "I'm 13 or older" checkbox and "Find me a study buddy (English)" (disabled until the box is ticked); ticking it and tapping shows "Looking for a study buddy learning English at your level." with Stop looking. B taps the same: both now show each other with "Matched learner" and the more-options menu (Block User / Report User).
- [ ] Block from that menu asks for confirmation, then the card returns to the no-buddy state on both; A and B are never matched again.
- [ ] With matching switched off on the server (`UPDATE public.buddy_settings SET matching_enabled = false;`), the find buttons disappear; a learner who was waiting still sees Stop looking. Switch it back on afterwards.

## French and Spanish Practice (nothing here has been run on a device)

Use a QA account with AI allowed.

- [ ] Learn tab: switch to French. Open Practice: the campaigns and scenarios are the French ones (titles in French, the English gloss under each); the same for Spanish; switching back to English shows the English list.
- [ ] Kill and reopen the app: Learn and Practice open on the course you last chose; sign in as another account: it opens on that account's own course (English if it never chose).
- [ ] Open a French scenario: the first line is French, and holding the button and speaking French is transcribed as French; the reply comes back in French and is spoken with a French voice (not English). Same for Spanish.
- [ ] A French campaign: scenes advance as in English, and the next scene's opening line is French.
- [ ] Hector with French selected: Hector greets and answers in French, with a French voice; switching to Spanish on Learn gives a fresh Hector conversation in Spanish.
- [ ] Rotate in a French conversation: the transcript stays and nothing restarts.
- [ ] English still behaves exactly as before.

## Public-name step (nothing here has been run on a device)

Use a fresh QA account (email sign-up) and a Google account whose name is set.

- [ ] First sign-in on a new email account: the "What should other learners call you?" screen covers the app before anything else, with the public-name note, an empty field showing the generated `Learner-XXXX` handle as a hint, a disabled "Save name", and "Skip for now" with "If you skip, you'll appear as Learner-XXXX." Back does nothing.
- [ ] Type one letter: "That name is too short or too long." immediately. Type a normal name: "Checking…" then "Looks good." and Save enables. Clear it: no message at all.
- [ ] Type a name the filter blocks: "That name isn't allowed. Try another." and Save stays disabled.
- [ ] Save a good name: the app opens (or placement, for a new account) and Settings > Display name shows the cleaned name (spaces collapsed).
- [ ] Airplane mode while typing: no error line, Save stays available; Save then says "Couldn't reach the server. Check your connection and try again." and the prompt stays.
- [ ] Skip: the prompt closes and the name stays `Learner-XXXX`; skip in airplane mode also closes it, and the prompt comes back on the next launch.
- [ ] Google account: the field is prefilled with the first name from the Google profile and checks itself; a name that is an email address is never prefilled.
- [ ] An account that already confirmed its name never sees the prompt; killing the app on the prompt and reopening shows it again.
- [ ] Settings > Display name with a blocked name: "That name isn't allowed. Try another." (not a generic failure).
- [ ] Rotate the phone on the prompt with a name typed: the typed text and result stay, and the app does not sync or sign in to billing again.
- [ ] Rotate while offline with the prompt up: the prompt is still there.
- [ ] Sign out on the prompt (kill and reopen if needed), then sign in as a different new account: it shows that account's own name or the `Learner-XXXX` hint, never the previous account's name.
- [ ] While Save is working the field is disabled; the keyboard is up when the prompt appears.

## Account-level AI consent (nothing here has been run on a device)

Use a QA account that has never allowed AI (on the web, Settings > AI features is off) and, for the "already allowed" rows, a second one that has.

- [ ] Fresh QA account, open Hector: a spinner, then the sheet "How Alphonso uses AI" naming Deepgram and NVIDIA, with "Read our Privacy Policy", "Allow" and "Not now". The sheet cannot be dismissed by tapping outside or Back.
- [ ] "Not now" on Hector leaves the page "AI practice is off" with "Review and allow"; tapping that reopens the sheet. The microphone is never asked for until you allow.
- [ ] "Not now" on a Practice scenario or Campaign goes back to the Practice list.
- [ ] "Allow" opens the conversation; the Settings > AI features switch is now on, and on the web the same account shows the setting on.
- [ ] An account that already allowed AI on web or iOS never sees the sheet on Android.
- [ ] Airplane mode with a never-read account on Hector: "You're offline" with "Try again", never the consent sheet and never "AI practice is off".
- [ ] Allow, start a conversation and say a turn, then turn AI off on the web and send another turn: the gate covers the live conversation ("AI practice is off") and the transcript is still there after you allow again.
- [ ] Settings > AI features: off withdraws at once (the web shows it off); on opens the sheet; "Not now" leaves it off. With airplane mode on, turning it off shows "Couldn't save your choice. Check your connection and try again." and the switch stays on.
- [ ] Lesson with a written translation question, consent off: no sheet, no wall; the card says "Checked against our answer list only." with "Turn on AI grading", which opens the sheet. A near-miss answer is marked wrong without an AI second opinion. After allowing, the same near-miss can be accepted.
- [ ] A speaking question with consent off: "Speaking answers use AI, which is turned off. Type the phrase instead." with "Use your voice instead" (opens the sheet) and a typing field; after allowing, the hold-to-talk button appears.
- [ ] Review translate card with consent off shows the same note and button.
- [ ] Placement test: no sheet at any point; written answers are checked locally when consent is off.
- [ ] Rotate the phone with the sheet open, and on a conversation that the gate covers (withdraw consent on the web first): the cover stays, the transcript is still there, "Not now" is not offered again by itself, and the sheet reopens only if it was open. The gate's flags are saved across rotation (`rememberSaveable`); this row is the only check of that, since Compose state is not unit tested.
- [ ] A speaking question while the setting is still loading says "Checking your AI setting..." (never "AI is turned off"); with an unreadable setting it shows "Couldn't check your AI setting" with "Try again".

## Report an AI reply (nothing here has been run on a device)

Use a QA account with AI allowed. Reports are emailed to the owner by the report trigger, so tell them before testing.

- [ ] Hector: long-press one of Hector's replies: a "Report this response" menu appears; tapping it shows the four reasons (Inappropriate or offensive, Harmful or unsafe, Wrong or misleading, Something else) and "We review reports within 24 hours.". Long-pressing your own message does nothing.
- [ ] Pick a reason: "Thanks. We'll review this response."; a row appears in `content_reports` with kind `ai_response`, no reported user, the reply text in `context.message`, `surface` `hector`, `course` the conversation's (`fr` when French is selected on Learn), `platform` `android`.
- [ ] Practice scenario: the scene's first line (written by us) cannot be reported; every later assistant reply can, and the row has `surface` `conversation` and the scenario id.
- [ ] Campaign: report a reply in scene 1, continue to scene 2 and report a reply there: the rows have `scene_index` 0 and 1. The opener of scene 2 is not reportable. After "Restart scene" the earlier scene's replies still are.
- [ ] Tap a reason twice quickly, or report again while "Sending your report..." shows: only one row is created and the reasons are disabled meanwhile. Rotate while it sends: the result still appears.
- [ ] A plain tap on a reply does nothing (no ripple, and TalkBack does not announce a button).
- [ ] Airplane mode: the report ends with "Couldn't send your report. Check your connection and try again."
- [ ] TalkBack: the reply announces a "Report this response" action in the actions menu; it opens the same reasons.
- [ ] Rotate with the reasons dialog open: it stays open.

## Hearts gate and AI errors (#302, #303, nothing here has been run on a device)

Use a QA account, never the App Review account. Drain its hearts by answering five questions wrong.

- [ ] At 0 hearts, open any lesson: the out-of-hearts screen shows instead of the lesson, with "Out of hearts", a countdown that ticks every second, "Use 50 XP for a heart" and "Review instead". TalkBack reads the countdown without interrupting.
- [ ] "Use 50 XP for a heart" with at least 50 XP in the course: the lesson opens and plays; finishing it shows the normal finish screen (not "Saved. This will sync").
- [ ] The same with less than 50 XP: "Not enough XP for a heart. You have N XP in this course." and the lesson stays blocked.
- [ ] "Review instead" opens Review for the same course; Back from there returns to the Learn tab.
- [ ] Airplane mode at 0 hearts: the screen shows without the buy button, and still offers "Review instead".
- [ ] Wait for the countdown to reach zero with the screen open: the lesson opens by itself.
- [ ] Rotate the phone on the out-of-hearts screen and inside a lesson: nothing restarts and no second session is opened.
- [ ] Scenario practice on an account at today's AI limit: the message says "You've reached today's AI practice limit. It resets at h:mm AM/PM.", never `quota-exceeded`.
- [ ] Hector on a non-Pro account that reaches the tutor (for example after Pro expires): "Hector is part of Alphonso Pro."; with the server's `tutor` switch off: the generic "Something went wrong on our side. Try again."
