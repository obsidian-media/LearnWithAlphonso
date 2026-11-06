import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class VoiceCatalogTests: XCTestCase {
    func testAllowListSizesPerCourse() {
        XCTAssertEqual(VoiceCatalog.voices(for: "en").count, 32)
        XCTAssertEqual(VoiceCatalog.voices(for: "es").count, 15)
        XCTAssertEqual(VoiceCatalog.voices(for: "fr").map(\.id), ["aura-2-agathe-fr", "aura-2-hector-fr"])
        XCTAssertEqual(Set(VoiceCatalog.all.map(\.id)).count, VoiceCatalog.all.count)
    }

    func testEveryDefaultIsOnItsCoursesList() {
        for character in VoiceCharacter.allCases {
            for course in VoiceCatalog.courses {
                XCTAssertTrue(
                    VoiceCatalog.isAllowed(VoiceCatalog.defaultVoice(character, course: course), course: course))
            }
        }
        XCTAssertEqual(VoiceCatalog.defaultVoice(.alphonso, course: "fr"), "aura-2-hector-fr")
        XCTAssertEqual(VoiceCatalog.defaultVoice(.hector, course: "en"), "aura-2-hermes-en")
    }

    func testCourseIsChecked() {
        XCTAssertTrue(VoiceCatalog.isAllowed("aura-2-hector-fr", course: "fr"))
        XCTAssertFalse(VoiceCatalog.isAllowed("aura-2-hector-fr", course: "es"))
        XCTAssertFalse(VoiceCatalog.isAllowed("aura-2-valentina-es", course: "es"))
        XCTAssertFalse(VoiceCatalog.isAllowed(nil, course: "en"))
    }

    func testPreviewURLIsTheStaticClip() {
        let url = VoiceCatalog.previewURL(for: "aura-2-diana-es", base: URL(string: "https://learn.alphonsoecosystem.app")!)
        XCTAssertEqual(url.absoluteString, "https://learn.alphonsoecosystem.app/voices/aura-2-diana-es.mp3")
    }

    func testPrefsKeepTheCharactersIndependentAndDropUnknownVoices() {
        let prefs = VoicePrefs(json: [
            "alphonso": ["en": "aura-2-luna-en", "es": "aura-2-luna-en"],
            "hector": ["en": "aura-2-zeus-en", "fr": "aura-2-agathe-fr"],
        ])
        XCTAssertEqual(prefs.voice(.alphonso, course: "en"), "aura-2-luna-en")
        XCTAssertEqual(prefs.voice(.alphonso, course: "es"), "aura-2-javier-es")
        XCTAssertEqual(prefs.voice(.hector, course: "en"), "aura-2-hermes-en")
        XCTAssertEqual(prefs.voice(.hector, course: "fr"), "aura-2-agathe-fr")
        XCTAssertEqual(VoicePrefs(json: "nonsense"), VoicePrefs())
        // Off-list or wrong-course ids never survive parsing, so they are never written back to the account.
        XCTAssertEqual(prefs.choices[.hector], ["fr": "aura-2-agathe-fr"])
        XCTAssertEqual(prefs.choices[.alphonso], ["en": "aura-2-luna-en"])
    }

    func testChoosingTheDefaultClearsTheEntry() {
        let chosen = VoicePrefs().with(.hector, course: "es", voice: "aura-2-celeste-es")
        XCTAssertEqual(chosen.voice(.hector, course: "es"), "aura-2-celeste-es")
        let back = chosen.with(.hector, course: "es", voice: "aura-2-alvaro-es")
        XCTAssertEqual(back, VoicePrefs())
        XCTAssertEqual(chosen.with(.hector, course: "es", voice: "aura-2-valentina-es"), chosen)
    }

    func testCacheRoundTripsAndIsClearedWithTheAccount() {
        let defaults = UserDefaults(suiteName: "VoiceCatalogTests-\(UUID().uuidString)")!
        let cache = VoicePrefsCache(defaults: defaults)
        XCTAssertEqual(cache.voice(.alphonso, course: "en"), "aura-2-saturn-en")
        cache.save(VoicePrefs().with(.alphonso, course: "en", voice: "aura-2-apollo-en"))
        XCTAssertEqual(cache.voice(.alphonso, course: "en"), "aura-2-apollo-en")
        XCTAssertEqual(cache.voice(.hector, course: "en"), "aura-2-hermes-en")
        AccountLocalCaches(defaults: defaults).clear()
        XCTAssertEqual(cache.voice(.alphonso, course: "en"), "aura-2-saturn-en")
    }
}
