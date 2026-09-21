import XCTest
@testable import LearnWithAlphonsoKit

final class RemotePushLogicTests: XCTestCase {
    func testEmptyDataProducesEmptyString() {
        XCTAssertEqual(hexString(fromDeviceToken: Data()), "")
    }

    func testKnownBytesLowercaseHexWithLeadingZeros() {
        // Deliberately includes a byte < 0x10 (0x0a) to catch a missing
        // zero-pad (a naive String(byte, radix: 16) would produce "a" not
        // "0a", silently corrupting every token containing one) and a
        // byte >= 0xa0 to catch accidental uppercasing.
        let data = Data([0x00, 0x0a, 0xff, 0xa1])
        XCTAssertEqual(hexString(fromDeviceToken: data), "000affa1")
    }

    func testRealisticLengthDeviceToken() {
        // APNs device tokens are 32 bytes -- a real one is opaque, but the
        // length/format (64 lowercase hex chars, no separators) is what
        // both APNs' HTTP/2 API and device_tokens.token expect.
        let data = Data(repeating: 0x5b, count: 32)
        let result = hexString(fromDeviceToken: data)
        XCTAssertEqual(result.count, 64)
        XCTAssertEqual(result, String(repeating: "5b", count: 32))
    }
}
