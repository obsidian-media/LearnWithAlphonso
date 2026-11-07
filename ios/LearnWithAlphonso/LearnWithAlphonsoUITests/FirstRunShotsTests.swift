import XCTest

/// The first run on a real simulator (visual round 6, part 3), with screenshots named like the web's for a side by
/// side. Run by ios-first-run-shots.yml on an ERASED simulator, signed out, no account.
///
/// - test1 walks every step before sign-in, as a new learner would.
/// - test2 shows the screens that need an account through the DEBUG harness (`-UITestFirstRunHarness`), with a
///   made-up learner and NO session: they are marked "harness" in the PR.
/// - test3 answers Under 13 and checks the stop screen survives a relaunch. It runs last: the block is kept in the
///   simulator's Keychain on purpose.
final class FirstRunShotsTests: UICompatTestCase {
    private func tap(_ label: String, file: StaticString = #filePath, line: UInt = #line) {
        let b = button(containing: label)
        guard requireUsable(b, label, file: file, line: line) else { return }
        b.tap()
    }

    func test1_NewLearnerBeforeSignIn() {
        launch(signedIn: false)
        if app.tabBars.firstMatch.waitForExistence(timeout: 5) {
            return XCTFail("signed in at launch: the simulator was not erased before this suite")
        }
        let field = app.textFields.firstMatch
        guard requireUsable(field, "name field") else { return }
        field.tap()
        field.typeText("Sam")
        save("01-hello")
        tap("Nice to meet you")

        tap("Spanish")
        save("02-course")
        tap("Continue")

        XCTAssertTrue(element(labeled: "Show my flag on leaderboards").waitForExistence(timeout: 10))
        let toggle = app.switches.firstMatch
        if toggle.exists { XCTAssertEqual(toggle.value as? String, "0", "the flag starts off") }
        save("03-about-you")
        tap("Continue")

        tap("Travel")
        save("04-goal")
        tap("Continue")

        tap("I know some")
        save("05-level")
        tap("Continue")

        tap("10 minutes")
        save("06-daily-time")
        tap("Continue")

        // Neutral: nothing picked, Continue off.
        XCTAssertFalse(app.buttons["Continue"].isEnabled, "the age screen suggests no answer")
        save("07-age")
        tap("25 to 34")
        tap("Continue")

        tap("Food")
        tap("Music")
        save("08-interests")
        tap("Continue")

        tap("Buenos d")
        tap("Check")
        save("09-first-taste")
        tap("Next")
        tap("Thank you")
        tap("Check")
        tap("Next")

        XCTAssertTrue(element(labeled: "your Spanish plan").waitForExistence(timeout: 10))
        save("10-your-plan")
        tap("Save my plan")

        XCTAssertTrue(button(containing: "Continue with email").waitForExistence(timeout: 10))
        requireUsable(button(containing: "Apple"), "Continue with Apple")
        requireUsable(button(containing: "Continue with Google"), "Continue with Google")
        save("11-sign-in")
    }

    func test2_AfterSignInHarness() {
        let shots: [(String, String)] = [
            ("avatar", "avatar-picker-first-run"),
            ("heard", "13-how-did-you-hear"),
            ("hector", "12-meet-hector"),
            ("hector-trial", "12-meet-hector-with-store-trial"),
            ("complete-hello", "complete-your-profile-01-hello"),
            ("complete-about", "complete-your-profile-02-about-you"),
            ("profile", "profile-with-animal"),
            ("avatar-profile", "avatar-picker-profile"),
        ]
        for (screen, name) in shots {
            launch(signedIn: false, arguments: ["-UITestFirstRunHarness", screen])
            sleep(2)
            requireRunning(screen)
            save(name)
            app.terminate()
        }
        // The plain Meet Hector shows no trial line at all (no store offer in the harness).
        launch(signedIn: false, arguments: ["-UITestFirstRunHarness", "hector"])
        XCTAssertTrue(button(containing: "See what Hector can do").waitForExistence(timeout: 10))
        XCTAssertFalse(element(labeled: "days free").exists, "no offer, no trial line")
    }

    func test3_Under13StopsAndStaysStopped() {
        launch(signedIn: false)
        let field = app.textFields.firstMatch
        guard requireUsable(field, "name field") else { return }
        field.tap()
        field.typeText("Kid")
        tap("Nice to meet you")
        tap("English")
        tap("Continue")
        tap("Continue")
        tap("School")
        tap("Continue")
        tap("I'm brand new")
        tap("Continue")
        tap("5 minutes")
        tap("Continue")
        tap("Under 13")
        tap("Continue")
        XCTAssertTrue(app.otherElements["firstRun.under13"].waitForExistence(timeout: 10)
                      || element(labeled: "Thanks for wanting to learn with me").waitForExistence(timeout: 5))
        XCTAssertFalse(button(containing: "Back").exists, "no way back into the questions")
        save("14-under-13")

        app.terminate()
        launch(signedIn: false)
        XCTAssertTrue(element(labeled: "Thanks for wanting to learn with me").waitForExistence(timeout: 15),
                      "the stop screen survives a relaunch")
        XCTAssertFalse(app.textFields.firstMatch.exists, "no first run and no sign-in after a relaunch")
        XCTAssertFalse(button(containing: "Continue with Google").exists)
        save("14b-under-13-after-relaunch")
    }
}
