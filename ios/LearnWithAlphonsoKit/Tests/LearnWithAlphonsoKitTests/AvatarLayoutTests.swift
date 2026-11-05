import XCTest
@testable import LearnWithAlphonsoKit

final class AvatarLayoutTests: XCTestCase {
    func testThereAreFifteenUniqueLayerFiles() {
        XCTAssertEqual(AvatarLayers.allFileNames.count, 15)
        XCTAssertEqual(Set(AvatarLayers.allFileNames).count, 15)
        XCTAssertTrue(AvatarLayers.allFileNames.allSatisfy { $0.hasSuffix(".webp") })
    }

    func testLayerNamesFollowTheDrawingRules() {
        XCTAssertNil(AvatarLayers.mouthFile(.closed))
        XCTAssertEqual(AvatarLayers.mouthFile(.ah), "mouth-ah.webp")
        XCTAssertEqual(AvatarLayers.mouthFile(.fv), "mouth-fv.webp")
        XCTAssertEqual(AvatarLayers.browsFile(.lowered), "brows-lowered.webp")
        XCTAssertEqual(AvatarLayers.earFile(.left, twitching: false), "ear-left-neutral.webp")
        XCTAssertEqual(AvatarLayers.earFile(.right, twitching: true), "ear-right-twitch.webp")
    }

    func testEveryDrawnFileIsInTheBundleList() {
        var drawn: [String] = [AvatarLayers.baseFile, AvatarLayers.glintMaskFile]
        for v in AvatarViseme.allCases { if let f = AvatarLayers.mouthFile(v) { drawn.append(f) } }
        for b in [AvatarBrows.neutral, .raised, .lowered] { drawn.append(AvatarLayers.browsFile(b)) }
        for side in [AvatarEarSide.left, .right] {
            for tw in [false, true] { drawn.append(AvatarLayers.earFile(side, twitching: tw)) }
        }
        XCTAssertEqual(Set(drawn), Set(AvatarLayers.allFileNames))
    }

    func testRectsAreFractionsOfTheCanvas() {
        for r in [AvatarLayers.mouthRect, AvatarLayers.browsRect, AvatarLayers.earLeftRect,
                  AvatarLayers.earRightRect, AvatarLayers.glintRect] {
            XCTAssertTrue(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1, "\(r)")
        }
    }

    func testTheSettingDefaultsOn() {
        XCTAssertTrue(AvatarPreference.defaultValue)
        XCTAssertEqual(AvatarPreference.key, "showAlphonsoWhilePractising")
    }
}
