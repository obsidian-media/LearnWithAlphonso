# Play screenshot shot list

Captured by `ScreenshotTest` (androidTest) on the CI emulator through the
`screenshots` job of `android-release.yml`, signed in as the demo account
through instrumentation arguments (`uiTestAccessToken`, `uiTestRefreshToken`,
`uiTestUserId`, minted the way `capture-app-store-screenshots.yml` mints the
iOS session). Files land in the `android-screenshots` artifact as
`NN-name.png`, phone portrait 1080 x 2400.

| # | File | Screen | What must be visible |
| --- | --- | --- | --- |
| 1 | 01-learn.png | Learn tab | Status header with streak and hearts, course picker, the first CEFR band with completion dots |
| 2 | 02-lesson.png | Lesson player | A multiple-choice question with choices and the Check button |
| 3 | 03-review.png | Review queue | A due item or the empty-queue state with the clear bonus |
| 4 | 04-listen.png | Listen tab | Folder tree with at least one episode row and the download icon |
| 5 | 05-practice.png | Practice tab | Scenario cards and the hold-to-talk hint |
| 6 | 06-hector.png | Hector tab | The conversation screen (demo account is Pro) |
| 7 | 07-profile.png | Profile hub | League, Friends and Achievements entries |
| 8 | 08-widget.png | Home screen widget | Not automatable on the emulator; the owner captures it on a device |

Feature graphic and icon are not screenshots; see `listing.md`.
