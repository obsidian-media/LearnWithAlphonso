import XCTest
@testable import LearnWithAlphonsoKit

/// Where "Manage Subscription" goes. A subscription bought on the website is not in Apple's sheet, so it opens
/// RevenueCat's own management page; everything else opens Apple's sheet.
final class ManageSubscriptionRouteTests: XCTestCase {
    private let portal = URL(string: "https://billing.example/portal/abc")!

    func testAWebBilledSubscriberGetsTheirManagementLink() {
        XCTAssertEqual(
            EntitlementSnapshot(isProActive: true, isWebBilled: true, managementURL: portal).webManagementURL,
            portal
        )
    }

    func testAnAppStoreSubscriberNeverGetsAWebLinkEvenWhenRevenueCatSendsOne() {
        let apple = URL(string: "https://apps.apple.com/account/subscriptions")!
        XCTAssertNil(
            EntitlementSnapshot(isProActive: true, isWebBilled: false, managementURL: apple).webManagementURL
        )
    }

    func testANonHttpsLinkIsDropped() {
        for raw in ["http://billing.example/portal", "itms-apps://apps.apple.com", "javascript:alert(1)"] {
            XCTAssertNil(
                EntitlementSnapshot(isProActive: true, isWebBilled: true, managementURL: URL(string: raw)!)
                    .webManagementURL,
                raw
            )
        }
    }

    func testNoProMeansNoLink() {
        XCTAssertNil(EntitlementSnapshot(isProActive: false, isWebBilled: true, managementURL: portal).webManagementURL)
    }

    func testTheRouteOpensTheWebLinkWhenThereIsOne() {
        XCTAssertEqual(ManageSubscriptionRoute(webManagementURL: portal), .web(portal))
    }

    func testTheRouteFallsBackToApplesSheet() {
        XCTAssertEqual(ManageSubscriptionRoute(webManagementURL: nil), .appleSheet)
    }
}
