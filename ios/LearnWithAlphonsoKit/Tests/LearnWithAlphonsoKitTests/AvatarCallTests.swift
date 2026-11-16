import XCTest
@testable import LearnWithAlphonsoKit

final class AvatarCallTests: XCTestCase {
    func testEveryScenarioHasItsOwnRoomAndEverythingElseGetsTheDefault() {
        for id in CallScenes.scenarioIDs {
            XCTAssertEqual(CallScenes.room(for: id), CallRoom(light: "call-" + id, dark: "call-" + id, dimInDark: true), id)
        }
        for id in ["city-day", "free-talk", "", "new-scenario"] {
            XCTAssertEqual(CallScenes.room(for: id), CallScenes.defaultRoom, id)
        }
        XCTAssertEqual(CallScenes.room(for: nil), CallScenes.defaultRoom)
        XCTAssertEqual(CallScenes.scenarioIDs.count, 12)
    }

    func testAScenarioWithArtUsesItAndIsDimmedNotSwappedInDarkMode() {
        let room = CallScenes.room(for: "coffee", withArt: ["coffee"])
        XCTAssertEqual(room, CallRoom(light: "call-coffee", dark: "call-coffee", dimInDark: true))
        XCTAssertEqual(CallScenes.room(for: "doctor", withArt: ["coffee"]), CallScenes.defaultRoom)
    }

    func testTheCallUsesTheNewCallFilesAndTheStudyRoomHasItsOwnDayAndEvening() {
        XCTAssertEqual(CallScenes.defaultRoom, CallRoom(light: "call-room-light", dark: "call-room-dark", dimInDark: false))
        for id in CallScenes.scenarioIDs {
            XCTAssertTrue(CallScenes.room(for: id).light.hasPrefix("call-"), id)
        }
    }

    func testACampaignSceneKeepsTheOlderRoomFileNeverACallFile() {
        let known: Set<String> = ["coffee", "market", "office"]
        // "coffee" is both a scenario and a campaign scene room: the campaign keeps the old coffee.webp.
        XCTAssertEqual(CallScenes.campaignRoom(for: "coffee", known: known), CallRoom(light: "coffee", dark: "coffee", dimInDark: true))
        XCTAssertEqual(CallScenes.campaignRoom(for: "market", known: known).light, "market")
        XCTAssertEqual(CallScenes.campaignRoom(for: "room-light", known: known), CallScenes.defaultRoom)
        XCTAssertEqual(CallScenes.campaignRoom(for: nil, known: known), CallScenes.defaultRoom)
        for name in known { XCTAssertFalse(CallScenes.campaignRoom(for: name, known: known).light.hasPrefix("call-"), name) }
    }

    func testTheCharactersBottomFadesFromEightyPercentDown() {
        XCTAssertEqual(CallScenes.avatarFadeStart, 0.8)
    }

    func testTheEveningDimIsHalfNavy() {
        XCTAssertEqual(CallScenes.eveningOverlayOpacity, 0.5)
    }

    func testTheDefaultRoomHasItsOwnEveningPicture() {
        XCTAssertNotEqual(CallScenes.defaultRoom.light, CallScenes.defaultRoom.dark)
        XCTAssertFalse(CallScenes.defaultRoom.dimInDark)
    }

    func testTheCaptionIsTheLastTurnAndGreenWhenItIsTheLearners() {
        let turns = [ChatMessage(role: "assistant", content: "Hi!"), ChatMessage(role: "user", content: "A latte")]
        XCTAssertEqual(CallCaptionRules.caption(turns: turns, isRecording: false), CallCaption(text: "A latte", mine: true))
        XCTAssertEqual(CallCaptionRules.caption(turns: Array(turns.prefix(1)), isRecording: false),
                       CallCaption(text: "Hi!", mine: false))
    }

    func testNoCaptionWhileTheLearnerHoldsTheButtonOrWithNothingSaid() {
        let turns = [ChatMessage(role: "assistant", content: "Hi!")]
        XCTAssertNil(CallCaptionRules.caption(turns: turns, isRecording: true))
        XCTAssertNil(CallCaptionRules.caption(turns: [], isRecording: false))
        XCTAssertNil(CallCaptionRules.caption(turns: [ChatMessage(role: "assistant", content: "  ")], isRecording: false))
    }

    func testWordsLightWithTheAudioAndAllLightAtTheEnd() {
        XCTAssertEqual(CallCaptionRules.litWords(wordCount: 10, progress: 0), 0)
        XCTAssertEqual(CallCaptionRules.litWords(wordCount: 10, progress: 0.5), 6)
        XCTAssertEqual(CallCaptionRules.litWords(wordCount: 10, progress: 1), 10)
        XCTAssertEqual(CallCaptionRules.litWords(wordCount: 10, progress: 4), 10)
        XCTAssertEqual(CallCaptionRules.litWords(wordCount: 0, progress: 0.5), 0)
    }

    func testTheClockUsesMinutesAndTwoDigitSeconds() {
        XCTAssertEqual(CallClock.format(seconds: 0), "0:00")
        XCTAssertEqual(CallClock.format(seconds: 65), "1:05")
        XCTAssertEqual(CallClock.format(seconds: 750), "12:30")
        XCTAssertEqual(CallClock.format(seconds: -3), "0:00")
    }

    func testBarsRestWithoutMeteringAndStayWithinBounds() {
        for i in 0..<CallLevel.barCount {
            XCTAssertEqual(CallLevel.barHeight(dBFS: nil, index: i), CallLevel.minHeight)
            XCTAssertEqual(CallLevel.barHeight(dBFS: -160, index: i), CallLevel.minHeight, accuracy: 0.5)
            for db in [-60.0, -30, -10, 0, 12] {
                let h = CallLevel.barHeight(dBFS: db, index: i)
                XCTAssertGreaterThanOrEqual(h, CallLevel.minHeight)
                XCTAssertLessThanOrEqual(h, CallLevel.maxHeight)
            }
        }
    }

    func testLouderIsTaller() {
        for i in 0..<CallLevel.barCount {
            XCTAssertGreaterThan(CallLevel.barHeight(dBFS: -20, index: i), CallLevel.barHeight(dBFS: -45, index: i))
        }
    }

    func testThePillNamesEachMode() {
        XCTAssertEqual(AvatarMode.idle.callLabel, "Listening")
        XCTAssertEqual(AvatarMode.listening.callLabel, "Listening to you")
        XCTAssertEqual(AvatarMode.thinking.callLabel, "Thinking")
        XCTAssertEqual(AvatarMode.speaking.callLabel, "Speaking")
        XCTAssertEqual(AvatarMode.reacting(.happy).callLabel, "Nice!")
        XCTAssertEqual(AvatarMode.reacting(.encouraging).callLabel, "Let's fix that")
    }

    func testTheCharacterIsAParameter() {
        let kit = CharacterKit.alphonso
        XCTAssertEqual(kit.displayName, "Alphonso")
        XCTAssertEqual(kit.folder, "AlphonsoAvatar")
        XCTAssertEqual(kit.mouthRect, AvatarLayers.mouthRect)
        XCTAssertEqual(kit.defaultRoom, CallScenes.defaultRoom)
        // Another character's default room is what a scenario without a picture falls back to.
        let office = CallRoom(light: "office-light", dark: "office-dark", dimInDark: false)
        XCTAssertEqual(CallScenes.room(for: "free-talk", fallback: office), office)
        XCTAssertEqual(CallScenes.room(for: "coffee", fallback: office), CallRoom(light: "call-coffee", dark: "call-coffee", dimInDark: true))
    }

    func testAKitWithoutEarsOrGlintAndWithAnEyesExpressionGroup() {
        let eyes = AvatarRect(x: 0.3, y: 0.2, w: 0.2, h: 0.1)
        let kit = CharacterKit(
            id: "hector", displayName: "Hector", folder: "HectorAvatar", mouthRect: eyes, expressionRect: eyes,
            expressionPrefix: "eyes", earLeftRect: nil, earRightRect: nil, glintRect: nil,
            defaultRoom: CallRoom(light: "office-light", dark: "office-dark", dimInDark: false))
        XCTAssertNil(kit.earLeftRect)
        XCTAssertNil(kit.glintRect)
        XCTAssertEqual(kit.expressionFile(.raised), "eyes-raised.webp")
        XCTAssertEqual(CharacterKit.alphonso.expressionFile(.lowered), "brows-lowered.webp")
        XCTAssertNil(CharacterKit.alphonso.earLeftRect)
        XCTAssertNotNil(CharacterKit.alphonso.glintRect)
    }
}
