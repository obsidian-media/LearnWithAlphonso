import XCTest

/// Shared helpers for the UI compatibility suites (IPadCompatibilityTests, LargeTextTests).
/// "Obvious breakage" = the app left the foreground, or a required control is missing, can't be made
/// hittable by scrolling, has no size, or runs past the window's side. Screenshots go to
/// SCREENSHOT_OUTPUT_DIR (uploaded by ios-ui-compat.yml) and into the result bundle.
class UICompatTestCase: XCTestCase {
    var app: XCUIApplication!

    var outputDir: String { ProcessInfo.processInfo.environment["SCREENSHOT_OUTPUT_DIR"] ?? NSTemporaryDirectory() }
    var hasDemoSession: Bool { !(ProcessInfo.processInfo.environment["UI_TEST_ACCESS_TOKEN"] ?? "").isEmpty }

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    /// Signed out: UI_TEST_* removed, so Session's DEBUG bootstrap does not run (the suites run test1 first on
    /// an erased simulator, so the keychain is empty). Signed in: the demo session is passed through.
    func launch(signedIn: Bool, arguments: [String] = []) {
        app = XCUIApplication()
        var env = ProcessInfo.processInfo.environment
        if !signedIn { env = env.filter { !$0.key.hasPrefix("UI_TEST_") } }
        app.launchEnvironment = env
        app.launchArguments += ["-UITestLayoutProbe"] + (signedIn ? ["-UITestSkipOnboarding"] : []) + arguments
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "the app did not reach the foreground")
    }

    func requireRunning(_ step: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(app.state, .runningForeground, "\(step): the app is not running (crash?)", file: file, line: line)
    }

    @discardableResult
    func requireUsable(_ element: XCUIElement, _ name: String, timeout: TimeInterval = 15,
                       file: StaticString = #filePath, line: UInt = #line) -> Bool {
        guard element.waitForExistence(timeout: timeout) else {
            XCTFail("\(name): missing", file: file, line: line)
            return false
        }
        var swipes = 0
        while !element.isHittable && swipes < 6 {
            app.swipeUp()
            swipes += 1
        }
        guard element.isHittable else {
            XCTFail("\(name): never hittable (clipped or covered)", file: file, line: line)
            return false
        }
        let window = app.windows.firstMatch.frame
        let frame = element.frame
        XCTAssertTrue(frame.width > 0 && frame.height > 0, "\(name): zero-size frame \(frame)", file: file, line: line)
        XCTAssertTrue(frame.minX >= window.minX - 1 && frame.maxX <= window.maxX + 1,
                      "\(name): runs off the side, \(frame) in window \(window)", file: file, line: line)
        return true
    }

    func button(containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    func element(labeled text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    /// "portrait" or "landscape", as the app laid itself out (RootView's DEBUG probe).
    var appLayout: String {
        let probe = app.staticTexts["uiTest.layout"]
        return probe.waitForExistence(timeout: 5) ? probe.label : "unknown"
    }

    @discardableResult
    func tapTab(_ label: String) -> Bool {
        let tab = app.tabBars.buttons[label]
        guard tab.waitForExistence(timeout: 30) else { return false }
        tab.tap()
        return true
    }

    func save(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        try? shot.pngRepresentation.write(to: URL(fileURLWithPath: (outputDir as NSString).appendingPathComponent("\(name).png")))
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func note(_ text: String) {
        print("UICOMPAT \(text)")
        let attachment = XCTAttachment(string: text)
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
