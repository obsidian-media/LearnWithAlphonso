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
/// Not attempted: a real Hector voice exchange (shot #4). There is no
/// synthetic-microphone-input path in a Simulator, and faking one by
/// injecting chat state directly would screenshot a state a real
/// interaction never produces -- the same "impossible state" risk that
/// ruled out a debug entitlement bypass elsewhere in this pipeline. This
/// test only opens the Hector tab; a real exchange still needs either a
/// human or a future, separately-considered effort.
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
        captureHector()
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
        // The seeded account's real streak/due-review badge needs a moment
        // to load from the network after the tab appears.
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("01-learn")
    }

    private func captureLessonPlayer() {
        // "Saying Hello" is u1l1's real title (src/data/curriculum.ts) --
        // seeded as a completed lesson, but still openable to view any
        // question in it.
        guard tapContaining(app.buttons, "Saying Hello", timeout: 10) else { return }
        // Land on a multiple-choice question per the shot list; if the
        // player opens on a different question type, this still captures
        // the lesson player itself, which is most of the value of the shot.
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("02-lesson")
        goBack()
    }

    private func captureReviewQueue() {
        guard tapTab("Learn") else { return }
        guard tapContaining(app.buttons, "Review", timeout: 10) else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("03-review")
        dismissSheet()
    }

    private func captureHector() {
        // Opens the tab only -- see this file's header comment on why a
        // real exchange isn't attempted here.
        guard tapTab("Hector") else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("04-hector")
    }

    private func captureListenLibrary() {
        guard tapTab("Listen") else { return }
        // Confirmed live: the other five shots' content is either bundled
        // (Learn) or already-cached (review/Hector/Profile) -- this is the
        // first shot in the sequence that waits on a real, cold network
        // fetch (the folder tree), while RootView's own launch .task is
        // also mid-flight (triggerSync/hydrateThemeFromServer/entitlement
        // login all fire at once) -- 15s wasn't enough on a real run
        // ("English" -- a real top-level folder, confirmed against the
        // live podcast_folders table -- never appeared in time), and a
        // later run showed 25s still isn't a hard guarantee (one of two
        // simulator jobs missed it at t=95s with 25s in place, while the
        // other job's identical wait succeeded) -- this is CI runner/
        // network jitter, not a wrong selector, so more margin helps but
        // doesn't fully remove the risk; the shot is allowed to soft-fail.
        guard tapContaining(app.staticTexts, "English", timeout: 40) else { return }
        guard tapContaining(app.staticTexts, "A1", timeout: 10) else { return }
        // Seeded resumed 40% into "Ordering Coffee" (scripts/seed-demo-account.ts)
        // so the mini player should already be docked, mid-playback, without
        // needing to tap play.
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("05-listen")
    }

    private func captureProfileHub() {
        guard tapTab("Profile") else { return }
        _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
        save("06-profile")
    }

    // MARK: - Helpers

    @discardableResult
    private func tapTab(_ label: String) -> Bool {
        let button = app.tabBars.buttons[label]
        guard button.waitForExistence(timeout: 10) else {
            XCTContext.runActivity(named: "Missing tab: \(label)") { _ in }
            return false
        }
        button.tap()
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
        // Sheets in this app are dismissed by a "Cancel"/"Done"-style
        // top-bar button or a swipe; try the common label first, fall back
        // to a swipe-down gesture.
        let closeButton = app.navigationBars.buttons["Done"]
        if closeButton.waitForExistence(timeout: 3) {
            closeButton.tap()
        } else {
            app.swipeDown()
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
