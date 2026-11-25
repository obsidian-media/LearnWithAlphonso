import XCTest

/// Captures the App Store screenshot set of the current app, signed in as the seeded demo account
/// (scripts/seed-demo-account.ts) through Session.uiTestBootstrapSession's #if DEBUG hook, never a mock. Run by
/// .github/workflows/capture-app-store-screenshots.yml on a 6.9" simulator.
///
/// The set, in the order the listing shows it (file names carry the order):
///   01-learn-map  02-lesson-question  03-story-scene  04-practice-hub  05-practice-call  06-hector
///   07-library    08-profile          (05a-practice-call-sheet is a spare: the call's start sheet)
///
/// THE RULE THIS FILE EXISTS TO KEEP: a screenshot is saved only after the run has proved it is the right screen,
/// finished loading. Each capture names the elements only that screen shows (present), the error texts it must not show
/// (absent) and waits for every visible spinner to go. A capture that cannot prove that FAILS the run, writes
/// `zz-failure-<name>.png` and `.txt` (the accessibility tree) beside the shots, and the run moves on to the next screen
/// so one miss still reports all the others. The earlier version of this test soft-failed every step and reported a green
/// run with the wrong screens (the Android job had the same bug, #724).
///
/// Writes to the demo account: this test allows AI features when the consent screen asks (the seed resets that consent
/// on every run, so a reviewer sees the sheet) and ends one practice call. Nothing else is written; Pro is NOT granted
/// here (the Hector shot fails with a clear message when the account is not Pro).
///
/// Not captured, deliberately: League, the leaderboard or any screen that lists other learners' names.
final class ScreenshotTests: XCTestCase {
    private var app: XCUIApplication!
    private var outputDir: String!
    private var failures: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        let env = ProcessInfo.processInfo.environment
        print("=== UI_TEST_ACCESS_TOKEN present in this process's env: \(env["UI_TEST_ACCESS_TOKEN"] != nil) ===")
        app.launchEnvironment = env
        // Skips the first-run questions and Complete your profile (neither is a store screenshot, and skipping writes
        // nothing to the account); English, so the copy is the listing's language.
        app.launchArguments += ["-UITestSkipOnboarding", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        outputDir = env["SCREENSHOT_OUTPUT_DIR"] ?? NSTemporaryDirectory()
        app.launch()
    }

    func testCaptureAppStoreScreenshots() throws {
        _ = app.wait(for: .runningForeground, timeout: 30)
        captureLearnMap()
        captureLessonQuestion()
        captureLibraryAndStory()
        captureProfile()
        capturePracticeHubAndCall()
        captureHector()
        XCTAssertTrue(failures.isEmpty, "Screens not captured: \(failures.joined(separator: " | "))")
    }

    // MARK: - Shots

    /// 01: the climbing map with the streak and XP in the header.
    private func captureLearnMap() {
        guard openTab("Learn", shot: "01-learn-map") else { return }
        _ = capture(
            "01-learn-map", screen: "Learn",
            present: [
                ("climb map (Unit progress)", el("label == %@", "Unit progress")),
                ("a streak above zero", el("label MATCHES %@", "(Streak: [1-9][0-9]* days?.*|[1-9][0-9]*-day streak.*)")),
                ("XP above zero", el("label MATCHES %@", "XP: [1-9][0-9]*")),
                ("the next lesson on the map", el("label BEGINSWITH %@ AND label ENDSWITH %@", "Lesson ", ", next")),
            ],
            absent: [
                ("a 'Couldn't load' rail", el("label CONTAINS %@", "Couldn't load")),
                ("the For you rail still loading", el("label ENDSWITH %@", ", Loading")),
            ])
    }

    /// 02: the first question of the next lesson, unanswered (Check is never tapped, so nothing is recorded).
    private func captureLessonQuestion() {
        guard openTab("Learn", shot: "02-lesson-question") else { return }
        let next = el("label BEGINSWITH %@ AND label ENDSWITH %@", "Lesson ", ", next")
        guard next.waitForExistence(timeout: 30), tapWhenHittable(next) else {
            fail("02-lesson-question", "Learn has no next lesson on the map to open"); return
        }
        let sheetStart = app.buttons.matching(NSPredicate(format: "label IN %@", ["Start lesson", "Continue lesson"])).firstMatch
        guard sheetStart.waitForExistence(timeout: 15) else { fail("02-lesson-question", "the lesson start sheet did not open"); return }
        sheetStart.tap()
        // The sheet closes, then the lesson opens on its overview. Start lesson on the overview is the same label as the
        // sheet's button, so wait for the sheet to be gone and the lesson HUD to be there first.
        let hud = el("label == %@", "Lesson progress")
        let opened = waitUntil(25) { !self.app.buttons["Not now"].exists && hud.exists }
        guard opened else { fail("02-lesson-question", "the lesson overview did not open"); return }
        let overviewStart = app.buttons["Start lesson"]
        if overviewStart.waitForExistence(timeout: 10) { overviewStart.tap() }
        let quiz = el("label == %@ AND value BEGINSWITH %@", "Lesson progress", "Question")
        // Past the optional vocabulary deck to the first question.
        for _ in 0..<14 where !quiz.exists {
            if tapIfPresent(app.buttons["Skip to practice"]) { continue }
            if tapIfPresent(app.buttons["Start practice"]) { continue }
            if tapIfPresent(app.buttons["Next word"]) { continue }
            Thread.sleep(forTimeInterval: 1)
        }
        _ = capture(
            "02-lesson-question", screen: "a lesson question",
            present: [("question 1 of the lesson", quiz), ("the Check button", app.buttons["Check"])],
            absent: [
                ("a vocab image still loading", el("identifier == %@", "vocab-image-loading")),
                ("the lesson-has-no-questions state", el("label CONTAINS %@", "no questions yet")),
            ])
        // Leave without answering.
        let close = app.buttons["Close"]
        if close.waitForExistence(timeout: 5) { close.tap() }
        confirmLeaveIfAsked()
        recoverToTabs()
    }

    /// 07 and 03: the Library with podcasts, then a Mona's New City story's first scene.
    private func captureLibraryAndStory() {
        guard openTab("Library", shot: "07-library") else { return }
        _ = capture(
            "07-library", screen: "Library",
            present: [
                ("the Podcasts rail", el("identifier == %@", "libraryPodcastsRail")),
                ("the Podcasts heading", app.staticTexts["Podcasts"]),
                ("the course chip", el("identifier == %@", "libraryCourseChip")),
            ],
            absent: [
                ("an episodes load error", el("label CONTAINS %@", "Couldn't load")),
                ("the offline state", el("label CONTAINS %@", "You're offline")),
            ])

        // Mona's New City: twelve branching stories; Touchdown is its first, a short arrival at the airport.
        let storiesTab = app.buttons["Stories tab"]
        guard storiesTab.waitForExistence(timeout: 10) else { fail("03-story-scene", "the Library has no Stories tab"); return }
        storiesTab.tap()
        let card = el("label BEGINSWITH %@", "Touchdown")
        guard waitUntil(30, { card.exists }), scrollUntilHittable(card) else {
            fail("03-story-scene", "Mona's New City story 'Touchdown' is not in the Stories list"); return
        }
        card.tap()
        _ = capture(
            "03-story-scene", screen: "a story scene",
            present: [("the scene label", el("label ==[c] %@", "Scene 1")), ("the story title", app.staticTexts["Touchdown"])],
            absent: [
                ("the story load error", el("label CONTAINS %@", "couldn't load this story")),
                ("story not found", el("label CONTAINS %@", "Story not found")),
            ],
            settle: 4)
        let back = app.buttons["Back"]
        if back.waitForExistence(timeout: 5) { back.tap() }
        recoverToTabs()
    }

    /// 08: the profile.
    private func captureProfile() {
        guard openTab("Profile", shot: "08-profile") else { return }
        _ = capture(
            "08-profile", screen: "Profile",
            present: [
                ("the Profile title", app.navigationBars["Profile"]),
                ("the level in the profile hero", el("label MATCHES %@", "Level [A-C][12].*")),
            ],
            absent: [("the profile load error", el("label CONTAINS %@", "Profile could not load"))])
    }

    /// 04, 05a and 05: the Practice hub with Today's pick, the call's start sheet, the call itself.
    private func capturePracticeHubAndCall() {
        guard openTab("Practice", shot: "04-practice-hub") else { return }
        let carousel = el("identifier == %@", "practiceHeroCarousel")
        let pick = el("label CONTAINS %@", "Today's pick")
        let hubOK = capture(
            "04-practice-hub", screen: "Practice",
            present: [
                ("the call cards", carousel),
                ("Today's pick", pick),
                ("the Practice heading", app.staticTexts["Practice"]),
            ],
            absent: [("the Practice load error", el("label CONTAINS %@", "Could not load Practice"))],
            beforeSave: { self.bringIntoView(pick, swipeIn: carousel) })
        guard hubOK else { return }

        let callButtons = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Call Alphonso:"))
        guard let call = callButtons.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            fail("05-practice-call", "no visible Call button on the Practice hub"); return
        }
        call.tap()
        let startCall = app.buttons.matching(NSPredicate(format: "label == %@", "Start the call")).firstMatch
        _ = capture(
            "05a-practice-call-sheet", screen: "the call start sheet",
            present: [("Start the call", startCall), ("How to earn stars", el("label ==[c] %@", "How to earn stars"))],
            absent: [])
        guard startCall.exists else { recoverToTabs(); return }
        // Mic and speech permission alerts and the AI consent sheet can both appear while the call opens.
        startCall.tap()
        let ended = app.buttons["End the call"]
        let callOK = capture(
            "05-practice-call", screen: "the Alphonso call",
            present: [("End the call", ended), ("Hold to talk", el("label BEGINSWITH %@", "Hold to talk"))],
            absent: [("the AI-off wall", el("label == %@", "AI practice is off"))],
            acceptAIConsent: true, settle: 4)
        if callOK || ended.exists { ended.tap() }
        recoverToTabs(timeout: 30)
    }

    /// 06: Hector, the Pro tutor. Needs a Pro account; this test never grants Pro.
    private func captureHector() {
        guard openTab("Hector", shot: "06-hector", hidesBar: true) else { return }
        let ok = capture(
            "06-hector", screen: "Hector",
            present: [("Hector's call screen", el("label BEGINSWITH %@", "Hold to talk to Hector")), ("End the call", app.buttons["End the call"])],
            absent: [("the AI-off wall", el("label == %@", "AI practice is off"))],
            acceptAIConsent: true, settle: 4)
        if !ok {
            failures.append("06-hector: if zz-failure-06-hector.txt shows the Pro paywall, the capture account has no Pro entitlement (not granted here)")
        }
    }

    // MARK: - The capture contract

    private typealias Named = (String, XCUIElement)

    /// Waits until every `present` element exists, no `absent` element exists and no spinner is visible; holds still for
    /// `settle` seconds and re-checks (a spinner or error that comes after the first look still fails); then saves
    /// `<name>.png`. On failure, records it, writes the evidence and returns false without saving the shot.
    @discardableResult
    private func capture(_ name: String, screen: String, present: [Named], absent: [Named],
                         timeout: TimeInterval = 45, acceptAIConsent: Bool = false, settle: TimeInterval = 2,
                         beforeSave: (() -> Void)? = nil) -> Bool {
        var problems = verdict(present: present, absent: absent)
        let deadline = Date().addingTimeInterval(timeout)
        while !problems.isEmpty, Date() < deadline {
            dismissSystemAlerts()
            if acceptAIConsent { allowAIIfAsked() }
            Thread.sleep(forTimeInterval: 0.5)
            problems = verdict(present: present, absent: absent)
        }
        if problems.isEmpty {
            Thread.sleep(forTimeInterval: settle)
            beforeSave?()
            problems = verdict(present: present, absent: absent)
        }
        guard problems.isEmpty else {
            fail(name, "\(screen) is not the right loaded screen: \(problems.joined(separator: "; "))")
            return false
        }
        save(name)
        return true
    }

    /// What is wrong with the screen right now; empty when it is the right screen and loaded.
    private func verdict(present: [Named], absent: [Named]) -> [String] {
        var problems: [String] = []
        for (what, element) in present where !element.exists { problems.append("missing \(what)") }
        for (what, element) in absent where element.exists { problems.append("shows \(what)") }
        let spinners = visibleSpinners()
        if spinners > 0 { problems.append("\(spinners) spinner(s) still visible") }
        return problems
    }

    private func visibleSpinners() -> Int {
        let window = app.windows.firstMatch.frame
        return app.activityIndicators.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty && window.intersects($0.frame) }.count
    }

    private func fail(_ name: String, _ message: String, evidence: Bool = true) {
        failures.append("\(name): \(message)")
        XCTFail("\(name): \(message)")
        guard evidence else { return }
        let shot = XCUIScreen.main.screenshot()
        let base = (outputDir as NSString).appendingPathComponent("zz-failure-\(name)")
        try? shot.pngRepresentation.write(to: URL(fileURLWithPath: base + ".png"))
        try? (message + "\n\n" + app.debugDescription).write(toFile: base + ".txt", atomically: true, encoding: .utf8)
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = "zz-failure-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // MARK: - Navigation helpers

    /// The first element of any type whose attributes satisfy the predicate.
    private func el(_ format: String, _ args: Any...) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: format, argumentArray: args)).firstMatch
    }

    private func waitUntil(_ seconds: TimeInterval, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            dismissSystemAlerts()
            if condition() { return true }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return condition()
    }

    /// Selects a tab and proves it is selected (a tap that lands on a sheet still "succeeds" and the caller would
    /// photograph whatever was already up).
    /// `hidesBar`: the tab opens a full-screen call that hides the tab bar, so a vanished bar after the tap is success
    /// (the call screen's own markers prove the screen).
    private func openTab(_ label: String, shot: String, hidesBar: Bool = false) -> Bool {
        recoverToTabs()
        let button = app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
        guard button.waitForExistence(timeout: 15) else { fail(shot, "no \(label) tab in the tab bar"); return false }
        for _ in 0..<3 {
            if button.exists && button.isHittable { button.tap() }
            Thread.sleep(forTimeInterval: 0.5)
            if !button.exists { if hidesBar { return true } else { continue } }
            if button.isSelected { return true }
            Thread.sleep(forTimeInterval: 1)
        }
        fail(shot, "the \(label) tab never became selected")
        return false
    }

    /// Gets back to a screen with the tab bar: closes what covers it (sheets, a pushed screen), a few tries.
    private func recoverToTabs(timeout: TimeInterval = 12) {
        let deadline = Date().addingTimeInterval(timeout)
        let bar = app.tabBars.buttons.firstMatch
        while Date() < deadline {
            dismissSystemAlerts()
            if bar.exists && bar.isHittable && !app.buttons["Not now"].exists { return }
            confirmLeaveIfAsked()
            var tapped = false
            for label in ["Done", "Close", "Back", "Back to Learn", "Not now"] {
                let button = app.buttons[label]
                if button.exists && button.isHittable { button.tap(); tapped = true; break }
            }
            if !tapped { app.swipeDown() }
            Thread.sleep(forTimeInterval: 1)
        }
    }

    private func confirmLeaveIfAsked() {
        let alert = app.alerts.firstMatch
        guard alert.waitForExistence(timeout: 1) else { return }
        for label in ["Leave", "Quit", "Exit", "End", "Yes", "OK"] where alert.buttons[label].exists {
            alert.buttons[label].tap()
            return
        }
    }

    /// iOS permission alerts (microphone, speech recognition, notifications) are Springboard's, not the app's.
    private func dismissSystemAlerts() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        guard alert.exists else { return }
        for label in ["Allow While Using App", "Allow", "OK"] where alert.buttons[label].exists {
            alert.buttons[label].tap()
            return
        }
    }

    /// The consent wall and sheet the AI features show until the account has allowed AI.
    private func allowAIIfAsked() {
        let gate = app.buttons["Review and allow"]
        if gate.exists && gate.isHittable { gate.tap(); Thread.sleep(forTimeInterval: 1) }
        let allow = app.buttons["Allow"]
        if allow.exists && allow.isHittable { allow.tap(); Thread.sleep(forTimeInterval: 2) }
    }

    private func tapIfPresent(_ element: XCUIElement) -> Bool {
        guard element.exists, element.isHittable else { return false }
        element.tap()
        Thread.sleep(forTimeInterval: 1)
        return true
    }

    private func tapWhenHittable(_ element: XCUIElement) -> Bool {
        guard waitUntil(10, { element.isHittable }) else { return false }
        element.tap()
        return true
    }

    private func scrollUntilHittable(_ element: XCUIElement, maxSwipes: Int = 10) -> Bool {
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        return element.exists && element.isHittable
    }

    /// Swipes a horizontal carousel until `target` is on screen (Today's pick can sit behind a Continue card).
    private func bringIntoView(_ target: XCUIElement, swipeIn carousel: XCUIElement) {
        var swipes = 0
        while !target.isHittable && swipes < 3 && carousel.exists {
            carousel.swipeLeft()
            swipes += 1
            Thread.sleep(forTimeInterval: 0.6)
        }
    }

    private func save(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let path = (outputDir as NSString).appendingPathComponent("\(name).png")
        do {
            try screenshot.pngRepresentation.write(to: URL(fileURLWithPath: path))
        } catch {
            fail(name, "could not save the screenshot: \(error)", evidence: false)
        }
        // Also attached to the result bundle, recoverable if the output directory is not where it is expected.
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
