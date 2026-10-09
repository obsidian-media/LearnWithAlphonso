import XCTest

/// Drives the real app -- signed in as the seeded demo account
/// (scripts/seed-demo-account.ts) via Session.uiTestBootstrapSession's
/// #if DEBUG hook, never a mock -- and captures each
/// screenshot-shot-list.md screen. Run by
/// .github/workflows/capture-app-store-screenshots.yml, once per target
/// simulator (1290x2796 and 1179x2556).
///
/// Every step is independent and soft-fails (records a note, keeps
/// going) rather than aborting the whole run on one missed selector --
/// this cannot be dry-run against a live Simulator from where it was
/// written (no macOS access), so the first real signal on whether these
/// selectors actually match anything is this test's own CI run. A partial
/// set of screenshots from one flaky selector is far more useful than
/// zero from a hard failure three steps in.
///
/// Not automated: the Hector voice shot. There is no synthetic-microphone
/// input path in a Simulator, and faking one by injecting chat state
/// directly would screenshot a state a real interaction never produces --
/// the same "impossible state" risk that ruled out a debug entitlement
/// bypass elsewhere in this pipeline. That shot is captured on a device.
///
/// Also deliberately not captured: League, the leaderboard, or any other
/// screen that lists other learners' public names. Marketing assets must
/// not show real people's names.
final class ScreenshotTests: XCTestCase {
    private var app: XCUIApplication!
    private var outputDir: String!

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        // UI_TEST_* come from seed-demo-account.ts's session (minted by
        // scripts/mint-demo-session.ts) via the workflow's env, forwarded
        // here as launch environment -- see Session.uiTestBootstrapSession.
        let env = ProcessInfo.processInfo.environment
        // Prints regardless of outcome -- the previous two attempts to get
        // UI_TEST_ACCESS_TOKEN from the CI shell into this process each
        // silently failed a different way (a TEST_RUNNER_-prefixed
        // xcodebuild argument, then still nothing after that fix), and
        // both were only diagnosable after guessing a specific cause and
        // burning a full CI round-trip on it. This says directly, every
        // run, whether this process actually has the value, instead of
        // inferring it from whether the app happened to sign in.
        print("=== UI_TEST_ACCESS_TOKEN present in this process's env: \(env["UI_TEST_ACCESS_TOKEN"] != nil) ===")
        app.launchEnvironment = env
        outputDir = env["SCREENSHOT_OUTPUT_DIR"] ?? NSTemporaryDirectory()
        app.launch()
    }

    func testCaptureAppStoreScreenshots() throws {
        captureLaunchDiagnostic()
        captureLearnTab()
        captureLessonPlayer()
        captureReviewQueue()
        capturePracticeInFrench()
        captureListenLibrary()
        captureProfileHub()
    }

    /// Unconditional -- taken and dumped regardless of what's on screen,
    /// before any navigation attempt. Every other shot in this file
    /// soft-fails (records a note, keeps going) rather than asserting, on
    /// purpose, which means "the test passed" does not imply any real
    /// screenshot was captured -- confirmed live: a run where every single
    /// shot's target element went missing still reported as passed. This
    /// is the one unconditional source of truth for what actually
    /// rendered, independent of every navigation guess after it.
    private func captureLaunchDiagnostic() {
        _ = app.wait(for: .runningForeground, timeout: 15)
        print("=== accessibility tree at launch ===")
        print(app.debugDescription)
        save("00-launch-diagnostic")
    }

    // MARK: - Shots

    private func captureLearnTab() {
        guard tapTab("Learn") else { return }
        // Wait for a SYNC-DEPENDENT element, not just any text. The title
        // "Learn with Alphonso" renders instantly from the bundle, so the
        // old `staticTexts.firstMatch` wait returned immediately and the
        // shot caught the PRE-SYNC empty state -- A1 selected, no streak
        // banner, no XP/league pills, "Nothing due" -- even though the DB
        // has this account as a seeded Sapphire/B2 learner with a 12-day
        // streak (confirmed by querying it directly). The streak banner
        // only renders once the server sync lands, and waiting for it also
        // means the band picker has loaded the real level (B2) rather than
        // the A1 default. The data is known to be present, so this appears
        // given enough time; 30s covers a cold sync racing the launch task.
        let synced = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] %@", "streak"))
            .firstMatch
        if !synced.waitForExistence(timeout: 30) {
            XCTContext.runActivity(named: "Learn never synced -- shot may be empty") { _ in }
        }
        save("01-learn")
    }

    private func captureLessonPlayer() {
        // 2026-09-29: was hardcoded to "Saying Hello" (u1l1, an A1
        // lesson) -- broke once captureLearnTab started correctly waiting
        // for the demo account's real saved level (B2) to load, since
        // that lesson isn't in the visible list at that level at all.
        // "firstLessonRow" is a stable identifier on whichever lesson
        // actually renders first (LessonBrowserView.swift), independent
        // of which CEFR band is showing.
        guard app.buttons["firstLessonRow"].waitForExistence(timeout: 10) else {
            XCTContext.runActivity(named: "Missing element: firstLessonRow") { _ in }
            return
        }
        app.buttons["firstLessonRow"].tap()
        // The shot must show a loaded vocab image, never the loading
        // placeholder (VocabImageView exposes "vocab-image-loaded" once the
        // image has rendered). Soft-fail: capture anyway after the timeout.
        // Wait until no image is still loading (and at least one has loaded).
        let loading = app.images.matching(NSPredicate(format: "identifier == 'vocab-image-loading'"))
        let loaded = app.images.matching(NSPredicate(format: "identifier == 'vocab-image-loaded'")).firstMatch
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline, loading.count > 0 || !loaded.exists {
            Thread.sleep(forTimeInterval: 0.5)
        }
        if loading.count > 0 || !loaded.exists {
            XCTContext.runActivity(named: "02-lesson: vocab images not all loaded within 20 s; capturing anyway") { _ in }
        }
        // The lesson opens on its overview screen (title, counts, image
        // thumbnails); that overview is what this shot captures.
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("02-lesson")
        goBack()
    }

    private func captureReviewQueue() {
        guard tapTab("Learn") else { return }
        guard tapContaining(app.buttons, "Review", timeout: 10) else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("07-review")
        dismissSheet()
    }

    /// Switches the course picker on Learn to French, captures Practice,
    /// then restores English so the remaining shots show the English
    /// library and profile.
    private func capturePracticeInFrench() {
        guard tapTab("Learn") else { return }
        guard selectCourse("FR") else { return }
        if tapTab("Practice") {
            _ = app.buttons["practiceScenarioRow"].firstMatch.waitForExistence(timeout: 15)
            save("03-practice-fr")
        }
        if tapTab("Learn") {
            if !selectCourse("EN") {
                XCTContext.runActivity(named: "Could not restore the English course") { _ in }
            }
        }
    }

    private func captureListenLibrary() {
        guard tapTab("Listen") else { return }

        // Capture the library root FIRST, unconditionally. Everything
        // below this line is a network-dependent enhancement, and the
        // previous version made the whole shot depend on it: two taps
        // ("English", then "A1") that wait on a cold fetch of the folder
        // tree while RootView's launch .task is still in flight. When
        // either timed out the function simply returned, so 05-listen was
        // MISSING from both device sets -- a soft-fail that cost the
        // entire screenshot rather than the extra detail it was guarding.
        //
        // The root view is worth shipping on its own: it is the audio
        // library, which is what the App Store description promises.
        // Never let an optional improvement take the guaranteed shot
        // down with it.
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 15)
        save("05-listen")

        // Now the richer shot, best-effort. Seeded resumed 40% into
        // "Ordering Coffee" (scripts/seed-demo-account.ts) so the mini
        // player should already be docked mid-playback without tapping
        // play. If the fetch is slow we keep 05-listen and lose only this.
        guard tapContaining(app.staticTexts, "English", timeout: 40) else { return }
        guard tapContaining(app.staticTexts, "A1", timeout: 15) else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        guard tapContaining(app.staticTexts, "Ordering Coffee", timeout: 15) else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("06-listen-episode")
        dismissSheet()
    }

    private func captureProfileHub() {
        guard tapTab("Profile") else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("09-profile")
    }

    // MARK: - Helpers

    @discardableResult
    private func tapTab(_ label: String) -> Bool {
        let button = app.tabBars.buttons[label]
        guard button.waitForExistence(timeout: 10) else {
            XCTContext.runActivity(named: "Missing tab: \(label)") { _ in }
            return false
        }
        // Verify the tap actually SELECTED the tab. A tap that lands on a
        // sheet still "succeeds" as far as XCUITest is concerned, and the
        // caller then screenshots whatever was already on screen -- which
        // is how three captures came back byte-identical while the run
        // reported success. Returning false here means the caller skips
        // the shot instead of saving a wrong one.
        for _ in 0..<3 {
            if button.isHittable { button.tap() }
            if button.isSelected { return true }
            _ = button.waitForExistence(timeout: 1)
        }
        XCTContext.runActivity(named: "Tab never became selected: \(label)") { _ in }
        return false
    }

    /// Opens the course picker (a menu in Learn's navigation bar) and picks
    /// the option whose label contains `flagCode` (the exact CoursePicker
    /// labels, e.g. "🇫🇷 FR").
    @discardableResult
    private func selectCourse(_ code: String) -> Bool {
        let labels = ["EN": "🇬🇧 EN", "FR": "🇫🇷 FR", "ES": "🇪🇸 ES"]
        let target = labels[code] ?? code
        let picker = app.navigationBars.buttons
            .matching(NSPredicate(format: "label CONTAINS 'Course' OR label CONTAINS %@ OR label CONTAINS %@ OR label CONTAINS %@",
                                  labels["EN"]!, labels["FR"]!, labels["ES"]!))
            .firstMatch
        guard picker.waitForExistence(timeout: 10) else {
            XCTContext.runActivity(named: "Missing course picker") { _ in }
            return false
        }
        picker.tap()
        let option = app.buttons
            .matching(NSPredicate(format: "label CONTAINS %@", target))
            .firstMatch
        guard option.waitForExistence(timeout: 5) else {
            XCTContext.runActivity(named: "Course option not found: \(code)") { _ in }
            return false
        }
        option.tap()
        return true
    }

    /// `label CONTAINS` rather than an exact dictionary lookup -- SwiftUI
    /// often composes a button's accessibility label from more than just
    /// its visible title (e.g. a row's subtitle folded in too), which an
    /// exact match would miss.
    @discardableResult
    private func tapContaining(_ query: XCUIElementQuery, _ text: String, timeout: TimeInterval) -> Bool {
        let match = query.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        guard match.waitForExistence(timeout: timeout) else {
            XCTContext.runActivity(named: "Missing element containing: \(text)") { _ in }
            return false
        }
        match.tap()
        return true
    }

    private func goBack() {
        let backButton = app.navigationBars.buttons.element(boundBy: 0)
        if backButton.waitForExistence(timeout: 5) { backButton.tap() }
    }

    private func dismissSheet() {
        // A single swipeDown() is NOT reliable: on scrollable sheet
        // content it scrolls the content instead of dismissing, and the
        // old version never checked whether it worked. When it silently
        // failed the sheet stayed up and EVERY later capture photographed
        // it -- three earlier shots came back
        // byte-identical, and the run reported success. That is worse
        // than a missing shot: a duplicate labelled "listen" looks
        // uploadable.
        //
        // Retry, and confirm the tab bar is actually reachable again.
        for attempt in 0..<4 {
            if app.tabBars.buttons.firstMatch.isHittable { return }
            let done = app.navigationBars.buttons["Done"]
            if done.exists && done.isHittable {
                done.tap()
            } else if attempt == 0 {
                app.swipeDown()
            } else {
                // Drag from well inside the sheet to the bottom edge --
                // a real dismissal gesture rather than a flick that a
                // scroll view can swallow.
                let top = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
                let bottom = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95))
                top.press(forDuration: 0.1, thenDragTo: bottom)
            }
            _ = app.tabBars.buttons.firstMatch.waitForExistence(timeout: 2)
        }
        if !app.tabBars.buttons.firstMatch.isHittable {
            XCTContext.runActivity(named: "Sheet would not dismiss") { _ in }
        }
    }

    private func save(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let path = (outputDir as NSString).appendingPathComponent("\(name).png")
        do {
            try screenshot.pngRepresentation.write(to: URL(fileURLWithPath: path))
        } catch {
            XCTContext.runActivity(named: "Couldn't save \(name): \(error)") { _ in }
        }
        // Also attach to the test result, so a screenshot is recoverable
        // from the .xcresult even if SCREENSHOT_OUTPUT_DIR isn't mounted
        // where expected.
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
