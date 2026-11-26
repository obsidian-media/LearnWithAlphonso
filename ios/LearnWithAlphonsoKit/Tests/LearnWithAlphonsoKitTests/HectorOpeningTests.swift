import XCTest
@testable import LearnWithAlphonsoKit

final class HectorOpeningTests: XCTestCase {
    private final class Box: @unchecked Sendable {
        var values: [String: Int] = [:]
        var sentVariant: Int?
    }

    private func variants(_ box: Box) -> HectorGreetingVariants {
        HectorGreetingVariants(read: { box.values[$0] }, write: { box.values[$0] = $1 })
    }

    private static func reply(_ text: String, variant: Int = 1) -> HectorGreetingReply {
        HectorGreetingReply(greeting: text, topic: "travel", variant: variant, remembered: true)
    }

    func testTheServerLineIsUsedAndItsVariantRemembered() async {
        let box = Box()
        let opening = await HectorOpening.resolve(course: .french, variants: variants(box), localFallback: "local") { _ in
            Self.reply("Salut, content de te revoir", variant: 2)
        }
        XCTAssertEqual(opening, HectorOpening(text: "Salut, content de te revoir", fromServer: true, fallbackReason: nil))
        XCTAssertEqual(variants(box).last(for: .french), 2)
        XCTAssertNil(variants(box).last(for: .english), "variants are per course")
    }

    func testTheRememberedVariantIsSentBack() async {
        let box = Box()
        variants(box).save(1, for: .spanish)
        _ = await HectorOpening.resolve(course: .spanish, variants: variants(box), localFallback: "local") { last in
            box.sentVariant = last
            return Self.reply("Hola")
        }
        XCTAssertEqual(box.sentVariant, 1)
    }

    func testAFailureFallsBackToTheLocalTemplateAndNamesWhy() async {
        let box = Box()
        let opening = await HectorOpening.resolve(course: .english, variants: variants(box), localFallback: "local") { _ in
            throw TutorError.network
        }
        XCTAssertEqual(opening, HectorOpening(text: "local", fromServer: false, fallbackReason: "network"))
        XCTAssertNil(variants(box).last(for: .english), "a failed fetch changes no variant")
    }

    func testAnEmptyServerLineFallsBack() async {
        let box = Box()
        let opening = await HectorOpening.resolve(course: .english, variants: variants(box), localFallback: "local") { _ in
            Self.reply("   ")
        }
        XCTAssertEqual(opening.text, "local")
        XCTAssertFalse(opening.fromServer)
    }

    func testASlowServerGivesWayToTheLocalGreeting() async {
        let box = Box()
        let opening = await HectorOpening.resolve(
            course: .english, variants: variants(box), localFallback: "local", timeout: 0.05
        ) { _ in
            try await Task.sleep(nanoseconds: 5_000_000_000)
            return Self.reply("Too late", variant: 2)
        }
        XCTAssertEqual(opening, HectorOpening(text: "local", fromServer: false, fallbackReason: "network"))
        XCTAssertNil(variants(box).last(for: .english), "a timed-out greeting changes no variant")
    }

    func testTheGreetingReplyParses() {
        let data = Data(#"{"greeting":"Hi there","topic":null,"variant":0,"remembered":false}"#.utf8)
        XCTAssertEqual(HectorGreetingReply.parse(data), HectorGreetingReply(greeting: "Hi there", topic: nil, variant: 0, remembered: false))
        XCTAssertNil(HectorGreetingReply.parse(Data(#"{"greeting":""}"#.utf8)))
    }
}
