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
