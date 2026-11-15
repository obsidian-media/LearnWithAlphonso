import XCTest
@testable import LearnWithAlphonsoKit

final class SupportChatTests: XCTestCase {
    private func message(_ id: Int, _ kind: SupportMessageKind, _ body: String = "x", at: String = "2026-11-14T10:00:00Z") -> SupportMessage {
        SupportMessage(id: id, kind: kind, body: body, at: at)
    }

    private func conversation(_ status: SupportStatus, _ messages: [SupportMessage], unread: Int = 0, ai: Bool = false) -> SupportConversation {
        SupportConversation(status: status, unread: unread, messages: messages, aiAvailable: ai)
    }

    // MARK: - Banner

    func testTheBannerFollowsTheServersStatusInTheMocksWords() {
        func banner(_ status: SupportStatus?, ai: Bool = false, declined: Bool = false, online: Bool = true) -> SupportBanner? {
            SupportChatRules.banner(status: status, aiAvailable: ai, aiDeclined: declined, online: online)
        }
        XCTAssertEqual(banner(.new), .team)
        XCTAssertEqual(banner(.open), .team)
        XCTAssertEqual(banner(.waitingLearner), .wait)
        XCTAssertEqual(banner(.solved), .done)
        // AI answers off (the launch state): replies come from a person.
        XCTAssertEqual(banner(SupportStatus.none), .person)
        XCTAssertEqual(banner(.ai), .person)
        XCTAssertEqual(banner(SupportStatus.none, ai: true), .ai)
        XCTAssertEqual(banner(.ai, ai: true), .ai)
        XCTAssertEqual(banner(SupportStatus.none, ai: true, declined: true), .declined)
        // Offline replaces whatever else, and nothing shows before the first load.
        XCTAssertEqual(banner(.open, online: false), .offline)
        XCTAssertNil(banner(nil))
    }

    func testBannerWordsAreTheWebsWords() {
        XCTAssertEqual(SupportBanner.team.title, "With our team")
        XCTAssertEqual(SupportBanner.team.body, "A person will read this and reply here.")
        XCTAssertEqual(SupportBanner.wait.title, "Waiting for your reply")
        XCTAssertEqual(SupportBanner.done.title, "Solved")
        XCTAssertEqual(SupportBanner.offline.body, "Reconnect to send. Your draft is kept.")
        XCTAssertEqual(SupportBanner.person.title, "Replies come from a person")
    }

    // MARK: - Composer

    func testTheComposerSaysWhyItIsClosed() {
        let daily = SupportChatRules.composer(status: .open, limit: .daily, online: true, aiFirstOpen: false)
        XCTAssertTrue(daily.disabled)
        XCTAssertEqual(daily.placeholder, "Come back tomorrow to write again")
        XCTAssertEqual(daily.fine, "Limit: 50 messages a day.")
        let full = SupportChatRules.composer(status: .open, limit: .conversation, online: true, aiFirstOpen: false)
        XCTAssertTrue(full.disabled)
        XCTAssertEqual(full.placeholder, "This chat is full")
        XCTAssertEqual(full.fine, "")
    }

    func testTheComposerPlaceholderAndNoteFollowTheStatus() {
        func composer(_ status: SupportStatus?, online: Bool = true, aiFirst: Bool = false) -> SupportChatRules.Composer {
            SupportChatRules.composer(status: status, limit: nil, online: online, aiFirstOpen: aiFirst)
        }
        XCTAssertEqual(composer(.open).placeholder, "Add something")
        XCTAssertEqual(composer(.new).placeholder, "Add something")
        XCTAssertEqual(composer(.waitingLearner).placeholder, "Reply to the team")
        XCTAssertEqual(composer(.solved).placeholder, "Still need help? Write here")
        XCTAssertEqual(composer(nil).placeholder, "Write your message")
        XCTAssertEqual(composer(.solved).fine, "Writing within 7 days reopens this chat. After that, a new chat starts.")
        XCTAssertEqual(composer(nil, aiFirst: true).fine, SupportCopy.aiFine)
        XCTAssertEqual(composer(.open).fine, "Don't send passwords or card numbers.")
        // Offline outranks the solved note, and the box itself stays open (the draft is kept).
        XCTAssertEqual(composer(.solved, online: false).fine, "Your draft is kept on this device.")
        XCTAssertFalse(composer(.open, online: false).disabled)
    }

    func testOnlyRealTextCanBeSentAndItIsTrimmed() {
        XCTAssertNil(SupportChatRules.sendableText(""))
        XCTAssertNil(SupportChatRules.sendableText("  \n\t "))
        XCTAssertEqual(SupportChatRules.sendableText("  my Pro is gone \n"), "my Pro is gone")
    }

    // MARK: - Polling and ordering

    func testTheChatIsPolledOnlyWhilePeopleNotTheAiHaveIt() {
        XCTAssertFalse(SupportChatRules.shouldPoll(status: nil))
        XCTAssertFalse(SupportChatRules.shouldPoll(status: .ai))
        for status in [SupportStatus.none, .new, .open, .waitingLearner, .solved] {
            XCTAssertTrue(SupportChatRules.shouldPoll(status: status), "\(status)")
        }
        XCTAssertEqual(SupportChatRules.pollInterval, 20)
    }

    func testMergeIsByIdOldestFirstAndANewerCopyWins() {
        let current = [message(3, .support, "old"), message(1, .you)]
        let incoming = [message(3, .support, "edited"), message(2, .ai)]
        let merged = SupportChatRules.merge(current, incoming)
        XCTAssertEqual(merged.map(\.id), [1, 2, 3])
        XCTAssertEqual(merged[2].body, "edited")
    }

    func testTheNewReplyDividerSitsOnTheFirstUnreadPersonReply() {
        let messages = [message(1, .you), message(2, .support), message(3, .you), message(4, .support), message(5, .support)]
        XCTAssertNil(SupportChatRules.unreadDividerID(messages: messages, unread: 0))
        XCTAssertEqual(SupportChatRules.unreadDividerID(messages: messages, unread: 1), 5)
        XCTAssertEqual(SupportChatRules.unreadDividerID(messages: messages, unread: 2), 4)
        XCTAssertEqual(SupportChatRules.unreadDividerID(messages: messages, unread: 3), 2)
        // More unread than person replies: the first of them.
        XCTAssertEqual(SupportChatRules.unreadDividerID(messages: messages, unread: 9), 2)
        // Unread with no person reply in sight draws no divider.
        XCTAssertNil(SupportChatRules.unreadDividerID(messages: [message(1, .you), message(2, .ai)], unread: 1))
    }

    // MARK: - Times

    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func date(_ iso: String) -> Date { SupportClock.parse(iso)! }

    func testIsoTimesParseWithAndWithoutFractionsIncludingSixDigitsFromPostgres() {
        XCTAssertNotNil(SupportClock.parse("2026-11-14T10:02:00Z"))
        XCTAssertNotNil(SupportClock.parse("2026-11-14T10:02:00.123Z"))
        let postgres = SupportClock.parse("2026-11-14T10:02:00.123456+00:00")
        XCTAssertNotNil(postgres)
        XCTAssertEqual(postgres, SupportClock.parse("2026-11-14T10:02:00.123Z"))
        XCTAssertNil(SupportClock.parse("yesterday"))
    }

    func testDayAndTimeLabelsReadTodayYesterdayAWeekdayAndADate() {
        let clock = SupportClock(calendar: utc)
        let now = date("2026-11-14T15:00:00Z")
        XCTAssertEqual(clock.dayLabel("2026-11-14T09:41:00Z", now: now), "Today")
        XCTAssertEqual(clock.dayLabel("2026-11-13T23:59:00Z", now: now), "Yesterday")
        XCTAssertEqual(clock.dayLabel("2026-11-02T09:00:00Z", now: now), "2 Nov")
        XCTAssertEqual(clock.timeLabel("2026-11-14T09:41:00Z", now: now), "9:41 AM")
        XCTAssertEqual(clock.timeLabel("2026-11-14T21:05:00Z", now: date("2026-11-14T22:00:00Z")), "9:05 PM")
        // 11 Nov 2026 is a Wednesday, three days before.
        XCTAssertEqual(clock.timeLabel("2026-11-11T11:12:00Z", now: now), "Wed 11:12 AM")
        XCTAssertEqual(clock.timeLabel("2026-10-30T10:02:00Z", now: now), "30 Oct, 10:02 AM")
        XCTAssertEqual(clock.dayKey("2026-11-14T00:30:00Z"), clock.dayKey("2026-11-14T23:30:00Z"))
        XCTAssertNotEqual(clock.dayKey("2026-11-14T23:30:00Z"), clock.dayKey("2026-11-15T00:30:00Z"))
    }

    func testTheDaysFollowTheCalendarsTimeZone() {
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let clock = SupportClock(calendar: tokyo)
        // 20:00 UTC on the 14th is 05:00 on the 15th in Tokyo.
        XCTAssertEqual(clock.dayLabel("2026-11-14T20:00:00Z", now: date("2026-11-15T03:00:00Z")), "Today")
        XCTAssertEqual(clock.timeLabel("2026-11-14T20:00:00Z", now: date("2026-11-15T03:00:00Z")), "5:00 AM")
    }

    // MARK: - The state

    private func pending(_ text: String = "my Pro is gone", base: Int = 0) -> SupportPending {
        SupportPending(clientID: "c1", text: text, baseID: base, at: "2026-11-14T10:00:00Z")
    }

    func testALoadFillsTheStateAndPlacesTheDivider() {
        var state = SupportChatState()
        XCTAssertEqual(state.load, .loading)
        state.loaded(conversation(.open, [message(1, .you), message(2, .support)], unread: 1))
        XCTAssertEqual(state.load, .ready)
        XCTAssertEqual(state.status, .open)
        XCTAssertEqual(state.dividerID, 2)
        XCTAssertFalse(state.isEmpty)
    }

    func testAFreshAccountIsTheFirstOpenScreen() {
        var state = SupportChatState()
        state.loaded(conversation(SupportStatus.none, [], ai: false))
        XCTAssertTrue(state.isEmpty)
        // Once a message is in flight it is no longer empty.
        state.sendStarted(pending())
        XCTAssertFalse(state.isEmpty)
    }

    func testAFailedLoadIsAnErrorAndAReloadClearsIt() {
        var state = SupportChatState()
        state.loadFailed()
        XCTAssertEqual(state.load, .error)
        state.loadStarted()
        XCTAssertEqual(state.load, .loading)
    }

    func testAPollAddsOnlyWhatIsNewAndMovesTheDividerToTheFirstNewPersonReply() {
        var state = SupportChatState()
        state.loaded(conversation(.waitingLearner, [message(1, .you), message(2, .support)], unread: 0))
        XCTAssertNil(state.dividerID)
        state.polled(conversation(.waitingLearner, [message(1, .you), message(2, .support), message(3, .support), message(4, .support)]))
        XCTAssertEqual(state.messages.map(\.id), [1, 2, 3, 4])
        XCTAssertEqual(state.dividerID, 3)
        // The divider does not jump on the next poll.
        state.polled(conversation(.open, [message(1, .you), message(2, .support), message(3, .support), message(4, .support), message(5, .support)]))
        XCTAssertEqual(state.dividerID, 3)
        XCTAssertEqual(state.status, .open)
    }

    func testAPollThatFindsOnlyAiOrOwnMessagesDrawsNoDivider() {
        var state = SupportChatState()
        state.loaded(conversation(.open, [message(1, .you)]))
        state.polled(conversation(.open, [message(1, .you), message(2, .system)]))
        XCTAssertNil(state.dividerID)
    }

    func testASendMovesFromSendingToSentAndRemembersWhichIdsWereSentThisVisit() {
        var state = SupportChatState()
        state.loaded(conversation(SupportStatus.none, [], ai: true))
        state.sendStarted(pending())
        XCTAssertEqual(state.pending?.state, .sending)
        state.sendSucceeded(SupportUpdate(status: .ai, messages: [message(7, .you, "my Pro is gone"), message(8, .ai, "Tap Restore.")]))
        XCTAssertNil(state.pending)
        XCTAssertEqual(state.status, .ai)
        XCTAssertEqual(state.messages.map(\.id), [7, 8])
        XCTAssertEqual(state.sentIDs, [7])
    }

    func testAnUnreachableOrFailedSendKeepsTheTextForARetryWithTheSameClientId() {
        var state = SupportChatState()
        state.loaded(conversation(.open, [message(1, .you)]))
        let sent = pending(base: 1)
        state.sendStarted(sent)
        state.sendFailed(sent, kind: .unreachable)
        XCTAssertEqual(state.pending?.state, .failed)
        XCTAssertEqual(state.pending?.failure, .unreachable)
        XCTAssertEqual(state.retryable?.clientID, "c1")
        XCTAssertEqual(state.retryable?.text, "my Pro is gone")
        // Retrying sends the same pending again: back to sending, the failure cleared.
        state.sendStarted(state.retryable!)
        XCTAssertEqual(state.pending?.state, .sending)
        XCTAssertNil(state.pending?.failure)
        XCTAssertNil(state.retryable)
    }

    func testALimitClosesTheBoxAndKeepsNoDraft() {
        var state = SupportChatState()
        state.loaded(conversation(.open, []))
        state.sendStarted(pending())
        state.sendFailed(pending(), kind: .dailyLimit)
        XCTAssertNil(state.pending)
        XCTAssertEqual(state.limit, .daily)
        state.sendStarted(pending())
        XCTAssertNil(state.limit, "a new attempt clears the limit until the server says it again")
        state.sendFailed(pending(), kind: .conversationLimit)
        XCTAssertEqual(state.limit, .conversation)
        XCTAssertNil(state.pending)
    }

    func testAFailedMessageTheServerAlreadyHoldsIsNotDrawnTwice() {
        var state = SupportChatState()
        state.loaded(conversation(.open, [message(1, .support)]))
        let sent = pending(base: 1)
        state.sendStarted(sent)
        state.sendFailed(sent, kind: .unreachable)
        XCTAssertNotNil(state.pendingShown)
        // A poll finds the stored copy (newer than the base, same text): the unsent bubble goes away.
        state.polled(conversation(.open, [message(1, .support), message(2, .you, "my Pro is gone")]))
        XCTAssertNil(state.pendingShown)
        // The same text OLDER than the base is an earlier message, not this one.
        var older = SupportChatState()
        older.loaded(conversation(.open, [message(1, .you, "my Pro is gone")]))
        let again = pending(base: 5)
        older.sendStarted(again)
        older.sendFailed(again, kind: .failed)
        XCTAssertNotNil(older.pendingShown)
        // A message still sending is always drawn.
        var sending = SupportChatState()
        sending.loaded(conversation(.open, [message(2, .you, "my Pro is gone")]))
        sending.sendStarted(pending(base: 0))
        XCTAssertNotNil(sending.pendingShown)
    }

    func testAHandoffOpensTheConversationAndAFailureCanBeRetried() {
        var state = SupportChatState()
        state.loaded(conversation(SupportStatus.none, [], ai: false))
        state.handoffStarted()
        XCTAssertTrue(state.handoffBusy)
        state.handoffFailedNow()
        XCTAssertFalse(state.handoffBusy)
        XCTAssertTrue(state.handoffFailed)
        state.handoffStarted()
        XCTAssertFalse(state.handoffFailed)
        state.handoffSucceeded(SupportUpdate(status: .new, messages: [message(1, .system, "A person will reply here.")]))
        XCTAssertEqual(state.status, .new)
        XCTAssertEqual(state.messages.map(\.kind), [.system])
        XCTAssertFalse(state.handoffBusy)
    }

    func testSendingNeedsTheConnectionAReadyChatAndNothingInFlight() {
        var state = SupportChatState()
        XCTAssertFalse(state.canSend(online: true, composerDisabled: false), "not loaded yet")
        state.loaded(conversation(.open, []))
        XCTAssertTrue(state.canSend(online: true, composerDisabled: false))
        XCTAssertFalse(state.canSend(online: false, composerDisabled: false))
        XCTAssertFalse(state.canSend(online: true, composerDisabled: true))
        state.sendStarted(pending())
        XCTAssertFalse(state.canSend(online: true, composerDisabled: false), "one message at a time")
    }

    // MARK: - Limits, ordering and retry

    func testTheDraftIsClampedToTheServersUtf16LimitNotACharacterCount() {
        let emoji = String(repeating: "\u{1F600}", count: 1500) // 1,500 Characters, 3,000 UTF-16 units
        XCTAssertEqual(emoji.count, 1500)
        let clamped = SupportChatRules.clamped(emoji)
        XCTAssertLessThanOrEqual(clamped.utf16.count, 2000)
        XCTAssertEqual(clamped.count, 1000, "cut on a character boundary, as many whole emoji as fit")
        let plain = String(repeating: "a", count: 2000)
        XCTAssertEqual(SupportChatRules.clamped(plain), plain)
        XCTAssertEqual(SupportChatRules.clamped(plain + "a").count, 2000)
        // A family emoji is one Character of many units: it is dropped whole, never split.
        let family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"
        let text = String(repeating: "a", count: 1995) + family
        XCTAssertEqual(SupportChatRules.clamped(text), String(repeating: "a", count: 1995))
    }

    func testASecondSendIsBlockedWhileOneIsSendingOrFailed() {
        var state = SupportChatState()
        state.loaded(conversation(.open, []))
        let sent = pending()
        state.sendStarted(sent)
        XCTAssertFalse(state.canSend(online: true, composerDisabled: false))
        state.sendFailed(sent, kind: .unreachable)
        XCTAssertFalse(state.canSend(online: true, composerDisabled: false), "a failed one must be retried first")
    }

    func testRetryResendsTheSameClientIdAndText() {
        var state = SupportChatState()
        state.loaded(conversation(.open, []))
        let sent = pending()
        state.sendStarted(sent)
        state.sendFailed(sent, kind: .failed)
        let retry = state.retryable!
        XCTAssertEqual(retry.clientID, sent.clientID)
        XCTAssertEqual(retry.text, sent.text)
        state.sendStarted(retry)
        XCTAssertEqual(state.pending?.clientID, sent.clientID)
    }

    func testAPollThatStartedBeforeASendFinishedCannotRollTheStatusBack() {
        var state = SupportChatState()
        state.loaded(conversation(.waitingLearner, [message(1, .support)]))
        let started = state.revision
        let sent = pending(base: 1)
        state.sendStarted(sent)
        state.sendSucceeded(SupportUpdate(status: .open, messages: [message(2, .you, "my Pro is gone")]))
        // The poll read the old state and lands late.
        state.polled(conversation(.waitingLearner, [message(1, .support)]), startedAt: started)
        XCTAssertEqual(state.status, .open)
        XCTAssertEqual(state.messages.map(\.id), [1, 2])
        // A poll that started after the send applies as usual.
        state.polled(conversation(.open, [message(1, .support), message(2, .you), message(3, .support)]), startedAt: state.revision)
        XCTAssertEqual(state.messages.map(\.id), [1, 2, 3])
    }

    func testAPollThatStartedBeforeAHandoffIsDropped() {
        var state = SupportChatState()
        state.loaded(conversation(SupportStatus.none, [], ai: false))
        let started = state.revision
        state.handoffStarted()
        state.handoffSucceeded(SupportUpdate(status: .new, messages: [message(1, .system)]))
        state.polled(conversation(SupportStatus.none, []), startedAt: started)
        XCTAssertEqual(state.status, .new)
    }

    // MARK: - Miya's labels

    private func row(_ kind: SupportMessageKind, staffName: String? = nil) -> SupportMessage {
        SupportMessage(id: 1, kind: kind, body: "x", at: "2026-11-14T10:00:00Z", staffName: staffName)
    }

    func testTheAiIsMiyaAndAPersonIsNeverMiyaWithOrWithoutAName() {
        XCTAssertEqual(SupportChatRules.speakerLabel(row(.ai)), "Miya (AI helper)")
        XCTAssertEqual(SupportChatRules.speakerLabel(row(.support, staffName: "Dana")), "Dana \u{00B7} Support team")
        XCTAssertEqual(SupportChatRules.speakerLabel(row(.support)), "Support team")
        XCTAssertEqual(SupportChatRules.speakerLabel(row(.support, staffName: "  ")), "Support team")
        // Even a staff member called Miya is not drawn as her.
        XCTAssertEqual(SupportChatRules.speakerLabel(row(.support, staffName: "Miya")), "Support team")
        XCTAssertNil(SupportChatRules.speakerLabel(row(.you)))
        XCTAssertNil(SupportChatRules.speakerLabel(row(.system)))
        // A name on an AI row is ignored: she keeps her own label.
        XCTAssertEqual(SupportChatRules.speakerLabel(row(.ai, staffName: "Dana")), "Miya (AI helper)")
    }

    func testMiyasHandoffPoseShowsOnlyAboveTheHandoffLineAndOnlyWhenSheAnsweredFirst() {
        let notice = SupportChatRules.handoffNotice
        XCTAssertEqual(notice, "A person will reply here.")
        let withAi = [message(1, .you), message(2, .ai), message(3, .system, notice)]
        XCTAssertTrue(SupportChatRules.showsHandoffPose(messages: withAi, index: 2))
        XCTAssertFalse(SupportChatRules.showsHandoffPose(messages: [message(1, .you), message(2, .system, notice)], index: 1))
        let other = [message(1, .you), message(2, .ai), message(3, .system, "This chat was marked solved."), message(4, .support, notice)]
        XCTAssertFalse(SupportChatRules.showsHandoffPose(messages: other, index: 2))
        XCTAssertFalse(SupportChatRules.showsHandoffPose(messages: other, index: 3))
        XCTAssertFalse(SupportChatRules.showsHandoffPose(messages: other, index: 9))
    }
}
