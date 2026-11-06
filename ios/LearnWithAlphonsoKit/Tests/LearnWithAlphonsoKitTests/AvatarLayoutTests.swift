import XCTest
@testable import LearnWithAlphonsoKit

final class AvatarLayoutTests: XCTestCase {
    func testThereAreElevenUniqueLayerFiles() {
        XCTAssertEqual(AvatarLayers.allFileNames.count, 11)
        XCTAssertEqual(Set(AvatarLayers.allFileNames).count, 11)
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
        XCTAssertEqual(Set(drawn), Set(AvatarLayers.allFileNames))
    }

    func testRectsAreFractionsOfTheCanvas() {
        for r in [AvatarLayers.mouthRect, AvatarLayers.browsRect, AvatarLayers.glintRect,
                  CharacterKit.hector.mouthRect, CharacterKit.hector.expressionRect] {
            XCTAssertTrue(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1, "\(r)")
        }
    }

    func testTheTwoKitsAreDistinctAndOnlyAlphonsoHasAGlint() {
        XCTAssertEqual(CharacterKit.alphonso.displayName, "Alphonso")
        XCTAssertEqual(CharacterKit.hector.displayName, "Hector")
        XCTAssertEqual(CharacterKit.alphonso.folder, "AlphonsoAvatar")
        XCTAssertEqual(CharacterKit.hector.folder, "HectorAvatar")
        XCTAssertEqual(CharacterKit.alphonso.expressionFile(.raised), "brows-raised.webp")
        XCTAssertEqual(CharacterKit.hector.expressionFile(.raised), "eyes-raised.webp")
        XCTAssertNotNil(CharacterKit.alphonso.glintRect)
        XCTAssertNil(CharacterKit.hector.glintRect)
        for kit in [CharacterKit.alphonso, .hector] {
            XCTAssertNil(kit.earLeftRect, kit.id)
            XCTAssertNil(kit.earRightRect, kit.id)
        }
    }

    func testTheSettingDefaultsOn() {
        XCTAssertTrue(AvatarPreference.defaultValue)
        XCTAssertEqual(AvatarPreference.key, "showAlphonsoWhilePractising")
    }
}
