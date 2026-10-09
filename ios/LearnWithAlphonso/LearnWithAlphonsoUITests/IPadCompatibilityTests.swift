import XCTest

/// The iPhone-only app on an iPad simulator (compatibility mode), as App Review runs it.
/// Each screen is checked in portrait and in landscape. Methods are numbered: XCTest runs them in name order,
/// and test1 must run first on the erased simulator (signed out).
final class IPadCompatibilityTests: UICompatTestCase {
    /// The app pins itself to portrait in code (AppDelegate), so with the device in landscape it must still lay
    /// itself out in portrait.
    private let expectPortraitLock = true

    private let orientations: [(UIDeviceOrientation, String)] = [(.portrait, "portrait"), (.landscapeLeft, "landscape")]

    override func tearDown() {
        XCUIDevice.shared.orientation = .portrait
        super.tearDown()
    }

    private func checkLayout(_ step: String, _ orientationName: String) {
        let layout = appLayout
        note("\(step) device=\(orientationName) app=\(layout)")
        if expectPortraitLock {
            XCTAssertEqual(layout, "portrait", "\(step): the app laid itself out \(layout) with the device \(orientationName)")
        }
    }

    func test1_AuthScreen() {
        launch(signedIn: false)
        if app.tabBars.firstMatch.waitForExistence(timeout: 5) {
            XCTFail("signed in at launch: the simulator was not erased before this suite")
            return
        }
        for (orientation, name) in orientations {
            XCUIDevice.shared.orientation = orientation
            requireRunning("auth \(name)")
            requireUsable(button(containing: "Apple"), "Continue with Apple (\(name))")
            requireUsable(button(containing: "Continue with Google"), "Continue with Google (\(name))")
            save("ipad-01-auth-\(name)")
            checkLayout("auth", name)
        }
    }

    func test2_LessonScreen() {
        guard hasDemoSession else { return XCTFail("no demo session: the mint step did not run") }
        launch(signedIn: true)
        guard tapTab("Learn") else {
            return XCTFail("no Learn tab: sign-in failed, or a one-time prompt (name, placement) is showing for the demo account")
        }
        for (orientation, name) in orientations {
            XCUIDevice.shared.orientation = orientation
            requireRunning("learn \(name)")
            requireUsable(app.buttons["firstLessonRow"], "first lesson row (\(name))")
            save("ipad-02a-learn-\(name)")
            checkLayout("learn", name)
        }
        XCUIDevice.shared.orientation = .portrait
        app.buttons["firstLessonRow"].tap()
        for (orientation, name) in orientations {
            XCUIDevice.shared.orientation = orientation
            requireRunning("lesson \(name)")
            requireUsable(button(containing: "Begin lesson"), "Begin lesson (\(name))")
            save("ipad-02b-lesson-\(name)")
            checkLayout("lesson", name)
        }
    }

    func test3_RecordingScreen() {
        guard hasDemoSession else { return XCTFail("no demo session: the mint step did not run") }
        launch(signedIn: true)
        guard tapTab("Practice") else { return XCTFail("no Practice tab") }
        let row = app.buttons.matching(identifier: "practiceScenarioRow").firstMatch
        guard requireUsable(row, "first practice scenario") else { return }
        row.tap()
        // An account without AI consent sees the consent sheet first. It is part of this screen on iPad too.
        let notNow = app.buttons["Not now"]
        if notNow.waitForExistence(timeout: 5) {
            for (orientation, name) in orientations {
                XCUIDevice.shared.orientation = orientation
                requireUsable(notNow, "consent sheet Not now (\(name))")
                save("ipad-03a-consent-\(name)")
                checkLayout("consent", name)
            }
            XCUIDevice.shared.orientation = .portrait
            notNow.tap()
            // Declining returns to the scenario list. Reaching the recording screen would mean allowing AI, which
            // writes the consent record to the shared demo account, so the consent sheet is as far as this goes.
            if app.buttons.matching(identifier: "practiceScenarioRow").firstMatch.waitForExistence(timeout: 10) {
                note("recording screen not reached: declining AI returns to the scenario list")
                return
            }
        }
        for (orientation, name) in orientations {
            XCUIDevice.shared.orientation = orientation
            requireRunning("recording \(name)")
            let mic = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Hold to talk")).firstMatch
            if mic.waitForExistence(timeout: 10) {
                requireUsable(mic, "Hold to talk (\(name))")
            } else if app.textFields.firstMatch.waitForExistence(timeout: 3) {
                requireUsable(app.textFields.firstMatch, "typing fallback (\(name))")
            } else {
                // The consent state could not be read (the CI simulator's network): its retry control is the screen.
                requireUsable(button(containing: "Try again"), "Try again (\(name))")
            }
            save("ipad-03b-recording-\(name)")
            checkLayout("recording", name)
        }
    }

    func test4_Paywall() {
        launch(signedIn: false, arguments: ["-UITestShowPaywall"])
        for (orientation, name) in orientations {
            XCUIDevice.shared.orientation = orientation
            requireRunning("paywall \(name)")
            requireUsable(element(labeled: "Restore Purchases"), "Restore Purchases (\(name))")
            requireUsable(element(labeled: "Terms of Use"), "Terms of Use (\(name))")
            requireUsable(element(labeled: "Privacy Policy"), "Privacy Policy (\(name))")
            save("ipad-04-paywall-\(name)")
            checkLayout("paywall", name)
        }
    }
}
