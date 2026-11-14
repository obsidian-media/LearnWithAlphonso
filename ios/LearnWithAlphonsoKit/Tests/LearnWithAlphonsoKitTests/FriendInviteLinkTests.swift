import XCTest
@testable import LearnWithAlphonsoKit

final class FriendInviteLinkTests: XCTestCase {
    func testReadsTheCodeFromAnInviteLink() {
        XCTAssertEqual(FriendInviteLink.code(from: URL(string: "https://learn.alphonsoecosystem.app/invite/29d081151d67")!), "29d081151d67")
    }

    func testIgnoresOtherHostsPathsSchemesAndOddCodes() {
        for bad in [
            "https://evil.example/invite/29d081151d67",
            "http://learn.alphonsoecosystem.app/invite/29d081151d67",
            "https://learn.alphonsoecosystem.app/learn",
            "https://learn.alphonsoecosystem.app/invite/29d081151d67/extra",
            "https://learn.alphonsoecosystem.app/invite/ab",
            "https://learn.alphonsoecosystem.app/invite/a%2Fb%2Fc%2Fd%2Fe",
        ] {
            XCTAssertNil(FriendInviteLink.code(from: URL(string: bad)!), bad)
        }
    }

    func testCodeEntryAcceptsALinkOrABareCode() {
        XCTAssertEqual(FriendInviteLink.code(fromEntry: " https://learn.alphonsoecosystem.app/invite/29d081151d67 "), "29d081151d67")
        XCTAssertEqual(FriendInviteLink.code(fromEntry: "29d081151d67"), "29d081151d67")
        XCTAssertNil(FriendInviteLink.code(fromEntry: "not a code"))
        XCTAssertNil(FriendInviteLink.code(fromEntry: "https://evil.example/invite/29d081151d67"))
    }
}
