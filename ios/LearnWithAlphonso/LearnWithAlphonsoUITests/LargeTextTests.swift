import XCTest

/// The app at Accessibility XXXL, the largest Larger Text setting, on the smallest current iPhone.
/// Required controls on auth, the paywall and a lesson must stay reachable and inside the screen.
/// The Apple and Google sign-in buttons are fixed at 50 pt; Google's label shrinks instead of wrapping.
final class LargeTextTests: UICompatTestCase {
    private let xxxl = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    func test1_AuthAtLargestText() {
        launch(signedIn: false, arguments: xxxl)
        if app.tabBars.firstMatch.waitForExistence(timeout: 5) {
            return XCTFail("signed in at launch: the simulator was not erased before this suite")
        }
        let apple = button(containing: "Apple")
        let google = button(containing: "Continue with Google")
        requireUsable(apple, "Continue with Apple")
        requireUsable(google, "Continue with Google")
        XCTAssertEqual(apple.frame.height, 50, accuracy: 1, "the Apple button is fixed at 50 pt")
        XCTAssertEqual(google.frame.height, 50, accuracy: 1, "the Google button is fixed at 50 pt")
        requireUsable(app.textFields.firstMatch, "email field")
        requireUsable(element(labeled: "Terms of Use"), "Terms of Use link")
        requireUsable(element(labeled: "Privacy Policy"), "Privacy Policy link")
        save("large-01-auth")
    }

    func test2_PaywallAtLargestText() {
        launch(signedIn: false, arguments: xxxl + ["-UITestShowPaywall"])
        _ = element(labeled: "Restore Purchases").waitForExistence(timeout: 20)
        let purchase = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "Start free trial", "Subscribe")
        ).firstMatch
        if purchase.waitForExistence(timeout: 10) {
            requireUsable(purchase, "purchase button")
        } else {
            requireUsable(button(containing: "Try again"), "Try again (offerings did not load in CI)")
        }
        requireUsable(element(labeled: "Restore Purchases"), "Restore Purchases")
        requireUsable(element(labeled: "Terms of Use"), "Terms of Use")
        requireUsable(element(labeled: "Privacy Policy"), "Privacy Policy")
        save("large-02-paywall")
    }

    func test3_LessonAtLargestText() {
        guard hasDemoSession else { return XCTFail("no demo session: the mint step did not run") }
        launch(signedIn: true, arguments: xxxl)
        guard tapTab("Learn") else { return XCTFail("no Learn tab at XXXL (tab bar labels may be the cause)") }
        save("large-03-learn-state")
        guard requireUsable(app.buttons["firstLessonRow"], "first lesson row") else { return }
        save("large-03a-learn")
        app.buttons["firstLessonRow"].tap()
        guard requireUsable(button(containing: "Begin lesson"), "Begin lesson") else { return }
        save("large-03b-overview")
        button(containing: "Begin lesson").tap()
        guard requireUsable(button(containing: "Start practice"), "Start practice (after the vocabulary)") else { return }
        save("large-03c-vocab")
        button(containing: "Start practice").tap()
        requireUsable(button(containing: "Check"), "Check (first question)")
        save("large-03d-question")
    }
}
