import XCTest
@testable import LearnWithAlphonsoKit

final class ScreenSceneArtTests: XCTestCase {
    func testNightSwapsThePictureForTheFiveScenesThatHaveOne() {
        for scene in ["learn", "hector", "listen", "profile", "practice"] {
            XCTAssertEqual(ScreenSceneArt.assetName(scene: scene, night: true), "SceneNight-" + scene, scene)
            XCTAssertEqual(ScreenSceneArt.assetName(scene: scene, night: false), "Scene-" + scene, scene)
        }
    }

    func testLessonCompleteStaysLightEvenInNight() {
        XCTAssertEqual(ScreenSceneArt.assetName(scene: "complete", night: true), "Scene-complete")
    }

    /// Royal light, Royal night, and Meadow on a dark device: only Royal on a dark device is night.
    func testTheThemeToPictureMapping() {
        func name(_ id: DSPaletteID, deviceDark: Bool) -> String {
            ScreenSceneArt.assetName(scene: "learn", night: id.usesNight(deviceDark: deviceDark))
        }
        XCTAssertEqual(name(.royal, deviceDark: false), "Scene-learn")
        XCTAssertEqual(name(.royal, deviceDark: true), "SceneNight-learn")
        XCTAssertEqual(name(.meadow, deviceDark: false), "Scene-learn")
        XCTAssertEqual(name(.meadow, deviceDark: true), "Scene-learn")
    }
}
