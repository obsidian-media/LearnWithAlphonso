import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class FirstRunTests: XCTestCase {
    private func store(draft: InMemoryFirstRunKeyValue = .init(), block: InMemoryFirstRunKeyValue = .init()) -> FirstRunStore {
        FirstRunStore(draftStorage: draft, blockStorage: block)
    }

    // MARK: Under 13

    func testUnder13BlocksWipesTheAnswersAndKeepsTheFlag() {
        let draft = InMemoryFirstRunKeyValue()
        let block = InMemoryFirstRunKeyValue()
        let s = store(draft: draft, block: block)
        s.writeDraft(LearnerAnswers(name: "Sam", course: "es", goal: "travel"))
        XCTAssertEqual(FirstRun.chooseAge(s, .under13), .blocked)
        XCTAssertTrue(s.isBlocked())
        XCTAssertNil(draft.string(forKey: FirstRunStore.draftKey), "the answers are wiped from the device")
        XCTAssertEqual(block.string(forKey: FirstRunStore.under13Key), "1")
        XCTAssertEqual(s.readDraft(), LearnerAnswers())
    }

    func testGoingBackAndPickingAnOlderRangeDoesNotGetThrough() {
        let s = store()
        _ = FirstRun.chooseAge(s, .under13)
        for older in AgeChoice.allCases where older != .under13 {
            XCTAssertEqual(FirstRun.chooseAge(s, older), .blocked, older.rawValue)
        }
        XCTAssertNil(s.readDraft().ageRange)
    }

    func testTheBlockSurvivesARelaunch() {
        // A relaunch is a new store over the same storage: nothing held in memory.
        let block = InMemoryFirstRunKeyValue()
        let draft = InMemoryFirstRunKeyValue()
        _ = FirstRun.chooseAge(store(draft: draft, block: block), .under13)
        let relaunched = store(draft: draft, block: block)
        XCTAssertTrue(relaunched.isBlocked())
        XCTAssertEqual(FirstRun.chooseAge(relaunched, .adult), .blocked)
        relaunched.writeDraft(LearnerAnswers(name: "Sam"))
        XCTAssertNil(draft.string(forKey: FirstRunStore.draftKey), "a blocked device writes no answers")
    }

    func testABlockedDeviceSendsNothingEvenIfAnswersAreLeftOnIt() {
        let draft = InMemoryFirstRunKeyValue()
        let block = InMemoryFirstRunKeyValue([FirstRunStore.under13Key: "1"])
        let raw = String(data: try! JSONEncoder().encode(LearnerAnswers(name: "Sam", goal: "work")), encoding: .utf8)
        draft.set(raw, forKey: FirstRunStore.draftKey)
        XCTAssertNil(FirstRun.answersToSend(store(draft: draft, block: block)))
    }

    func testTheBlockHoldsForTheLaunchEvenWhenItsStorageCannotKeepIt() {
        final class Broken: FirstRunKeyValue {
            func string(forKey key: String) -> String? { nil }
            func set(_ value: String?, forKey key: String) {}
        }
        let s = FirstRunStore(draftStorage: InMemoryFirstRunKeyValue(), blockStorage: Broken())
        _ = FirstRun.chooseAge(s, .under13)
        XCTAssertTrue(s.isBlocked())
        XCTAssertEqual(FirstRun.chooseAge(s, .teen), .blocked)
    }

    func testAnOlderRangeIsSavedToTheDraft() {
        let s = store()
        XCTAssertEqual(FirstRun.chooseAge(s, .youngAdult), .ok)
        XCTAssertEqual(s.readDraft().ageRange, "18-24")
        XCTAssertFalse(s.isBlocked())
    }

    func testTheServerListHasNoUnder13Range() {
        XCTAssertFalse(LearnerProfileLists.ageRanges.contains(AgeChoice.under13.rawValue))
        XCTAssertEqual(
            AgeChoice.allCases.filter { $0 != .under13 }.map(\.rawValue), LearnerProfileLists.ageRanges)
    }

    // MARK: Answers

    func testCleanAnswersDropsValuesOffTheListsAndKeepsTheRest() {
        let draft = LearnerAnswers(
            name: "  Sam  ", course: "de", nativeLanguage: "fa", country: "ZZ", goal: "travel", level: "expert",
            dailyMinutes: 7, ageRange: "12", interests: ["food", "gaming"], heardFrom: "tv")
        let clean = FirstRun.cleanAnswers(draft)
        XCTAssertEqual(clean, LearnerAnswers(name: "Sam", nativeLanguage: "fa", goal: "travel", interests: ["food"]))
    }

    func testShowFlagIsSentOnlyWhenItWasAnswered() {
        XCTAssertNil(FirstRun.cleanAnswers(LearnerAnswers(goal: "work"))?.jsonPatch["showFlag"])
        XCTAssertEqual(FirstRun.cleanAnswers(LearnerAnswers(showFlag: false))?.jsonPatch["showFlag"] as? Bool, false)
    }

    func testNothingAnsweredIsNothingToSend() {
        XCTAssertNil(FirstRun.answersToSend(store()))
        XCTAssertNil(FirstRun.cleanAnswers(LearnerAnswers(name: "   ")))
    }

    func testTheJsonPatchCarriesOnlyTheKeysThatAreSet() {
        let patch = LearnerAnswers(goal: "work", dailyMinutes: 10).jsonPatch
        XCTAssertEqual(Set(patch.keys), ["goal", "dailyMinutes"])
    }

    // MARK: Steps and copy

    func testQuestionStepsCountEightForNewAndSevenWithoutTheCourse() {
        XCTAssertEqual(FirstRun.questionSteps(.new).count, 8)
        XCTAssertEqual(FirstRun.questionSteps(.complete).count, 7)
        XCTAssertFalse(FirstRun.questionSteps(.complete).contains(.course))
        XCTAssertEqual(FirstRun.questionSteps(.new)[6], .age)
    }

    func testTheRoomFollowsTheGoalThenTheCourse() {
        XCTAssertEqual(FirstRun.room(course: nil, goal: nil), "room-light")
        XCTAssertEqual(FirstRun.room(course: "es", goal: nil), "coffee")
        XCTAssertEqual(FirstRun.room(course: "es", goal: "travel"), "airport")
    }

    func testGreetingsAndPraise() {
        XCTAssertEqual(FirstRun.greeting(course: "es", name: "Sam"), "\u{A1}Hola, Sam!")
        XCTAssertEqual(FirstRun.greeting(course: "fr", name: ""), "Bonjour !")
        XCTAssertEqual(FirstRun.praise(course: "es", name: "Sam"), "\u{A1}Muy bien, Sam!")
        XCTAssertEqual(FirstRun.praise(course: "en", name: ""), "Well done!")
    }

    func testPlanSummaryReadsLikeTheWeb() {
        let draft = LearnerAnswers(goal: "travel", level: "some", interests: ["food", "music"])
        XCTAssertEqual(
            FirstRun.planSummary(draft, course: "es"),
            ["Spanish for travel \u{B7} I know some", "10 minutes a day", "Food and music"])
    }

    func testHectorTopicsUseUpToThreeInterests() {
        XCTAssertEqual(FirstRun.hectorTopics([]), "About anything you like")
        XCTAssertEqual(
            FirstRun.hectorTopics(["food", "music", "art", "tech"]), "About food, music, art and your week")
    }

    func testEveryCourseHasTwoTasteQuestionsWithAValidAnswer() {
        for course in LearnerProfileLists.courses {
            let items = FirstRun.miniLessons[course] ?? []
            XCTAssertEqual(items.count, 2, course)
            for item in items { XCTAssertTrue(item.choices.indices.contains(item.answer)) }
        }
    }

    func testLevelHintOnlyForSomeAndConfident() {
        XCTAssertNil(FirstRun.levelHint(level: "new", mode: .new))
        XCTAssertNotNil(FirstRun.levelHint(level: "some", mode: .new))
        XCTAssertTrue(FirstRun.levelHint(level: "confident", mode: .complete)!.hasPrefix("At the end"))
    }

    func testDestinationAfterTheFirstRun() {
        XCTAssertEqual(FirstRun.destination(.hector, level: "some", placementTaken: false), .hector)
        XCTAssertEqual(FirstRun.destination(.lesson, level: "some", placementTaken: false), .placement)
        XCTAssertEqual(FirstRun.destination(.lesson, level: "some", placementTaken: true), .learn)
        XCTAssertEqual(FirstRun.destination(.lesson, level: "new", placementTaken: false), .learn)
    }

    // MARK: Complete your profile

    func testCompleteProfileKeepsALeaderboardCountryShowing() {
        let prefill = FirstRun.completeProfilePrefill(
            profile: LearnerProfile(), displayName: "Robin Hood", leaderboardCountry: "GB")
        XCTAssertEqual(prefill.name, "Robin")
        XCTAssertEqual(prefill.country, "GB")
        XCTAssertEqual(prefill.showFlag, true, "a country already on the leaderboard stays on")
    }

    func testCompleteProfileNeverUsesAHandleAndStartsWithTheFlagOff() {
        let prefill = FirstRun.completeProfilePrefill(
            profile: LearnerProfile(answers: LearnerAnswers(country: "FR", showFlag: false)),
            displayName: "Learner-1A2B", leaderboardCountry: nil)
        XCTAssertNil(prefill.name)
        XCTAssertEqual(prefill.country, "FR")
        XCTAssertEqual(prefill.showFlag, false)
    }

    // MARK: Trial line

    func testTheTrialLineComesOnlyFromAStoreOffer() {
        XCTAssertNil(FirstRun.trialLine(days: nil), "no offer, no line")
        XCTAssertNil(FirstRun.trialLine(days: 0))
        XCTAssertEqual(FirstRun.trialLine(days: 7), "7 days free, then your plan's price. Cancel any time.")
        XCTAssertEqual(FirstRun.trialLine(days: 1), "1 day free, then your plan's price. Cancel any time.")
        XCTAssertEqual(FirstRun.hectorButton(hasTrial: true), "Try a free call with Hector")
        XCTAssertEqual(FirstRun.hectorButton(hasTrial: false), "See what Hector can do")
    }

    func testTrialDaysFromAStorePeriod() {
        XCTAssertEqual(FirstRun.trialDays(value: 3, unit: .day), 3)
        XCTAssertEqual(FirstRun.trialDays(value: 1, unit: .week), 7)
        XCTAssertEqual(FirstRun.trialDays(value: 1, unit: .month), 30)
        XCTAssertNil(FirstRun.trialDays(value: 0, unit: .week))
    }

    func testTrialDaysFromTheOfferingOnlyWhenTheLearnerIsEligible() {
        func product(_ trial: BillingPeriod?) -> PaywallProduct {
            PaywallProduct(id: UUID().uuidString, localizedTitle: "", localizedPriceString: "", price: 1,
                           period: BillingPeriod(unit: .year, value: 1), eligibleFreeTrial: trial)
        }
        XCTAssertNil(FirstRun.trialDays(from: .loading))
        XCTAssertNil(FirstRun.trialDays(from: .failed))
        XCTAssertNil(FirstRun.trialDays(from: .loaded([product(nil)])), "not eligible, or no trial: no line")
        XCTAssertEqual(FirstRun.trialDays(from: .loaded([product(nil), product(BillingPeriod(unit: .week, value: 1))])), 7)
    }

    // MARK: Plan

    private func unit(_ id: String, level: String, title: String, questions: Int) -> LearnWithAlphonsoKit.Unit {
        let json: [String: Any] = [
            "id": id, "level": level, "eyebrow": "", "title": title, "description": "",
            "lessons": [[
                "id": id + "-1", "title": "L", "subtitle": "",
                "questions": (0..<questions).map { n in
                    ["type": "mc", "id": "\(id)-q\(n)", "prompt": "p", "choices": ["a", "b"], "answer": 0,
                     "explanation": "e"] as [String: Any]
                },
            ]],
        ]
        return try! JSONDecoder().decode(LearnWithAlphonsoKit.Unit.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testThePlanStartsAtTheLevelTheLearnerChose() throws {
        let units = [
            unit("a1-1", level: "A1", title: "Hello", questions: 10),
            unit("a2-1", level: "A2", title: "Food", questions: 10),
            unit("a2-2", level: "A2", title: "Past", questions: 10),
            unit("a2-3", level: "A2", title: "Places", questions: 10),
            unit("a2-4", level: "A2", title: "Later", questions: 10),
        ]
        let timing = LessonTiming(secondsPerQuestion: ["mc": 60], secondsPerNewWord: 0)
        let now = ISO8601DateFormatter().date(from: "2026-11-06T12:00:00Z")!
        let plan = FirstRun.plan(units: units, level: "some", dailyMinutes: 5, now: now, timing: timing, roomMap: nil)
        XCTAssertEqual(plan.nodes.map(\.title), ["Food", "Past", "Places"])
        XCTAssertEqual(plan.goalUnitTitle, "Past")
        // Two units of 10 one-minute questions at 5 minutes a day: 4 days.
        XCTAssertEqual(FirstRun.formatDay(plan.goalDate), "10 November")
        XCTAssertEqual(plan.nodes.first?.room, LessonStage.fallbackRoom)
    }

    func testEveryAgeRangeHasItsOwnLabel() {
        let labels = AgeChoice.allCases.map(\.small)
        XCTAssertEqual(Set(labels).count, labels.count)
        XCTAssertEqual(labels, ["Under 13", "Teen", "Young adult", "Adult", "Mid-life", "Mature"])
    }
}
