import SwiftUI
import UIKit
import AVFoundation
import LearnWithAlphonsoKit

/// Lesson player: overview -> vocab (when the lesson has any derivable
/// vocab -- see VocabDerivation.swift) -> quiz -> finish, matching the web
/// app's lesson.$id.tsx phase flow. `correctCount`/`answers` here are only
/// for the optimistic "correct/total" the finish screen shows and the
/// completion payload -- never trusted as the source of truth for XP. The
/// server re-derives correctness itself, per submitted answer, against the
/// real answer key (§0.1-d #6; see complete-lesson/index.ts's
/// deriveAnswerCorrectness), not merely re-checking question-id membership.
struct LessonPlayerView: View {
    // TestFlight feedback (2026-09-29): "there is no way to continue to
    // the next lesson without going back to the main menu." `@State`
    // rather than `let` so `continueToNextLesson()` can transform this
    // same view instance into the next lesson in place, instead of
    // needing a bindable NavigationPath threaded down from
    // LessonBrowserView just to push a new stack entry per lesson (which
    // would also make the stack grow unboundedly as a learner keeps
    // going). See the custom `init` below -- adding one means Swift no
    // longer synthesizes the memberwise one.
    @State private var lesson: Lesson
    let course: Course
    let session: Session
    let notificationScheduler: NotificationScheduler
    let contentStore: ContentStore
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore
    /// What "Practise with Hector" on the finish screen needs. Nil hides the button.
    let hectorAccess: HectorAccess?
    @EnvironmentObject private var aiConsent: AIConsentStore

    init(
        lesson: Lesson, course: Course, session: Session, notificationScheduler: NotificationScheduler,
        contentStore: ContentStore, networkMonitor: NetworkMonitor, syncQueueStore: SyncQueueStore,
        hectorAccess: HectorAccess? = nil
    ) {
        _lesson = State(initialValue: lesson)
        self.course = course
        self.session = session
        self.notificationScheduler = notificationScheduler
        self.contentStore = contentStore
        self.networkMonitor = networkMonitor
        self.syncQueueStore = syncQueueStore
        self.hectorAccess = hectorAccess
    }

    private enum Phase { case overview, vocab, quiz }

    @State private var phase: Phase = .overview
    /// The word the learner tapped in a lesson explanation, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var idx = 0
    @State private var correctCount = 0
    // §0.1-d #6: every real (non-reinforcement) question's raw submission,
    // correct or not -- completeLesson re-derives correctness itself from
    // these against the real answer key, rather than trusting which ones
    // this client claims it missed.
    @State private var answers: [LessonAnswer] = []
    @State private var picked: String?
    // A translation's verdict is settled by TranslateQuestionCard (locally,
    // then by the server when it can be reached) rather than derived here, so
    // that what the learner is shown and what is scored are the same value.
    @State private var translationVerdict: TranslationVerdict?
    @State private var isCheckingTranslation = false
    @State private var checked = false
    @State private var isSubmitting = false
    @State private var result: LessonCompletionResult?
    @State private var isLeaguePromotion = false
    @State private var showReminderCard = false
    @State private var queuedOffline: PendingLessonCompletion?
    /// Why the completion was queued (offline, timeout or server), for the offline finish screen's wording.
    @State private var queuedReason: LessonCompletionError = .offline
    /// A completion failure that is NOT queued (a rejected 4xx, or signed out).
    @State private var completionFailure: LessonCompletionError?
    /// The start-lesson-session token from when this lesson opened. Using it at finish means a heart lost
    /// mid-lesson never blocks saving the lesson (the hearts gate applies when a lesson starts, as on the web).
    @State private var sessionToken: String?
    @State private var outOfHearts: OutOfHeartsModel?
    @State private var heartsGateState: HeartsGateState = .open
    @State private var showingReviewInstead = false
    @State private var showingHector = false
    @State private var showingHectorPaywall = false
    @Environment(\.dismiss) private var dismiss

    private enum HeartsGateState { case open, blocked, reviewInstead }
    // V3 pkg 4b: in-lesson reinforcement, staged in two steps -- see
    // pickReinforcementQuestion's doc comment (LessonReinforcement.swift)
    // and lesson.$id.tsx's identical web-side pattern for why. Never
    // affects correctCount/answers/hearts/XP.
    @State private var pendingReinforcement: Question?
    @State private var activeReinforcement: Question?
    // Fresh per-attempt seed for reinforcement-pick determinism across a
    // single attempt without repeating the exact same pick on identical
    // misses -- mirrors lesson.$id.tsx's attemptSeed. `@State` (not
    // `let`) and regenerated in continueToNextLesson() so "fresh per
    // attempt" still holds when this same view instance moves on to the
    // next lesson rather than being freshly created.
    @State private var attemptSeed = UUID().uuidString

    private var total: Int { lesson.questions.count }
    private var vocab: [VocabItem] { deriveVocab(lesson: lesson, images: contentStore.vocabImages) }
    private var isReinforcing: Bool { activeReinforcement != nil }
    private var currentQuestion: Question { activeReinforcement ?? lesson.questions[idx] }

    // `Unit` alone is ambiguous once both LearnWithAlphonsoKit and
    // Foundation are visible (Foundation.Unit is the Measurement API's
    // base class) -- fully qualified to disambiguate.
    private var unit: LearnWithAlphonsoKit.Unit? {
        contentStore.findLesson(id: lesson.id, course: course)?.unit
    }
    private var siblingQuestions: [Question] {
        (unit?.lessons ?? []).filter { $0.id != lesson.id }.flatMap(\.questions)
    }
    private var levelQuestions: [Question] {
        contentStore.bundle(for: course).units
            .filter { $0.level == unit?.level && $0.id != unit?.id }
            .flatMap { $0.lessons.flatMap(\.questions) }
    }

    /// TestFlight feedback (2026-09-29): the next lesson to continue to,
    /// within the current unit first, then the first lesson of the next
    /// unit at the same CEFR band -- crossing unit boundaries, not just
    /// "next in this unit," so finishing a unit's last lesson still
    /// offers a real "continue" rather than silently stopping there. Nil
    /// (no button shown) at the very end of a CEFR band -- deliberately
    /// not rolling over into the next band, which is a level-up decision
    /// the learner should make explicitly via the band picker, not have
    /// made for them by tapping "Continue" one too many times.
    private var nextLessonID: String? {
        guard let unit else { return nil }
        if let idx = unit.lessons.firstIndex(where: { $0.id == lesson.id }),
           unit.lessons.indices.contains(idx + 1) {
            return unit.lessons[idx + 1].id
        }
        let sameLevelUnits = contentStore.bundle(for: course).units.filter { $0.level == unit.level }
        guard let unitIdx = sameLevelUnits.firstIndex(where: { $0.id == unit.id }),
              sameLevelUnits.indices.contains(unitIdx + 1) else { return nil }
        return sameLevelUnits[unitIdx + 1].lessons.first?.id
    }

    /// Transforms this same view instance into playing `nextLessonID` --
    /// resets every piece of per-lesson state back to a fresh start, same
    /// as if the learner had navigated back and tapped the next lesson by
    /// hand. A no-op if `nextLessonID` doesn't resolve to a real lesson
    /// (contentStore is the bundled, always-consistent source of truth,
    /// so this should never actually happen -- guarding anyway rather
    /// than force-unwrapping into a crash).
    private func continueToNextLesson() {
        guard let nextLessonID, let found = contentStore.findLesson(id: nextLessonID, course: course) else { return }
        lesson = found.lesson
        phase = .overview
        idx = 0
        correctCount = 0
        answers = []
        picked = nil
        translationVerdict = nil
        isCheckingTranslation = false
        checked = false
        isSubmitting = false
        result = nil
        showReminderCard = false
        isLeaguePromotion = false
        queuedOffline = nil
        completionFailure = nil
        queuedReason = .offline
        sessionToken = nil
        pendingReinforcement = nil
        activeReinforcement = nil
        // 2026-09-30 whole-codebase audit: this function's own doc
        // comment on attemptSeed's declaration already claimed this
        // reset happens here -- it didn't. Low-severity (reinforcement
        // question variety only, never a data-safety/double-award
        // issue), but a real doc/code mismatch worth closing now that
        // it's been pointed out rather than leaving the comment wrong.
        attemptSeed = UUID().uuidString
    }

    private func practiseWithHector() {
        guard let hectorAccess else { return }
        if hectorAccess.entitlementStore.isPro { showingHector = true } else { showingHectorPaywall = true }
    }

    var body: some View {
        Group {
            if let result {
                FinishView(
                    result: result, correct: correctCount, total: total, contentStore: contentStore,
                    isLeaguePromotion: isLeaguePromotion, lessonID: lesson.id, course: course, session: session,
                    onContinueToNextLesson: nextLessonID != nil ? continueToNextLesson : nil,
                    onPractiseWithHector: hectorAccess == nil ? nil : practiseWithHector,
                    showReminderCard: showReminderCard,
                    onRemindMe: { Task { await acceptReminders() } },
                    onNotNow: declineReminders
                )
            } else if let queuedOffline {
                OfflineFinishView(
                    pending: queuedOffline, correct: correctCount, total: total, reason: queuedReason,
                    onContinue: nextLessonID != nil ? continueToNextLesson : { dismiss() },
                    onPractiseWithHector: hectorAccess == nil ? nil : practiseWithHector)
            } else if let completionFailure {
                LessonSaveFailureView(error: completionFailure, onSignIn: { session.signOut() }, onDone: { dismiss() })
            } else if total == 0 {
                ContentUnavailableView("This lesson has no questions yet", systemImage: "questionmark.circle")
            } else {
                switch phase {
                case .overview:
                    OverviewScreen(lesson: lesson, wordCount: vocab.count, questionCount: total, previewImages: vocab.prefix(3).compactMap(\.image)) {
                        phase = vocab.isEmpty ? .quiz : .vocab
                    }
                case .vocab:
                    VocabScreen(lesson: lesson, items: vocab, course: course) { phase = .quiz }
                case .quiz:
                    quizBody
                }
            }
        }
        .navigationTitle(lesson.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: lesson.id) { await openLessonSession() }
        // "Practise with Hector": Hector for Pro, otherwise the same paywall the Practice card opens.
        .sheet(isPresented: $showingHector) {
            if let hectorAccess {
                HectorView(
                    session: session, entitlementStore: hectorAccess.entitlementStore,
                    activeCourse: hectorAccess.activeCourse, conversationStore: hectorAccess.conversationStore,
                    onClose: { showingHector = false })
            }
        }
        .sheet(isPresented: $showingHectorPaywall) {
            if let hectorAccess {
                PaywallView(entitlementStore: hectorAccess.entitlementStore, source: .lessonComplete, onClose: { showingHectorPaywall = false })
            }
        }
        .sheet(item: $outOfHearts, onDismiss: {
            // Closed without a heart: leave the lesson (it can't be saved). "Review instead" opens Review first.
            switch heartsGateState {
            // A sheet already queued to replace this one (a refill or purchase that was refused again) means the
            // learner is still choosing, so only leave when no sheet is pending.
            case .blocked: if outOfHearts == nil { dismiss() }
            case .reviewInstead: showingReviewInstead = true
            case .open: break
            }
        }) { model in
            OutOfHeartsSheet(
                model: model, course: course, session: session, isOnline: networkMonitor.isConnected,
                onUnblocked: {
                    heartsGateState = .open
                    outOfHearts = nil
                    Task { await openLessonSession() }
                },
                onPracticeInstead: {
                    heartsGateState = .reviewInstead
                    outOfHearts = nil
                })
        }
        .sheet(isPresented: $showingReviewInstead, onDismiss: { dismiss() }) {
            ReviewQueueView(
                contentStore: contentStore, session: session, notificationScheduler: notificationScheduler,
                networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
        }
        // Consent is the account's (AIConsentStore). Without it a translate
        // answer is graded on the device and complete-lesson grades it the
        // same way server-side (it checks the same account consent), so the
        // verdict shown and the verdict scored agree. A speak question offers
        // typing (SpeakQuestionCard). No lesson is walled.
        //
        // Tap-to-save in explanations: the shared ExplanationView and
        // AlphonsoTipCard read this handler from the environment, so every
        // question type gets it without threading a closure through each
        // call site. They only use it for a course whose text is wholly in its
        // own language (SavedWordPolicy), i.e. the English course today.
        .environment(\.saveWordHandler, { savingWord = $0 })
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
    }

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// The question scrolls; Check and the verdict panel are pinned above the tab bar. A tall question (an image,
    /// four tiles, Alphonso's tip) plus the panel is taller than an iPhone SE's screen, and before this the column
    /// did not scroll, so Continue could land under the tab bar. At accessibility text sizes the same layout holds.
    private var quizBody: some View {
        ScrollView {
            quizContent
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            quizControls
                .padding(.horizontal)
                .padding(.vertical, AlphonsoSpacing.sm)
                .background(AlphonsoColor.surface)
        }
        .background(AlphonsoColor.surface)
        // The verdict panel announces the verdict itself; the explanation under the question stays quiet.
        .environment(\.verdictAnnouncedByPanel, true)
        .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.85), value: checked)
    }

    private var quizContent: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            AlphonsoProgressBar(progress: total == 0 ? 0 : Double(idx) / Double(total))
            Text(isReinforcing ? "Quick practice" : "\(idx + 1)/\(total)")
                .font(AlphonsoFont.sans(13, weight: .medium))
                .foregroundStyle(AlphonsoColor.inkSoft)

            // .id() forces a fresh QuestionCard (and its reorder @State)
            // per question -- without it, SwiftUI would keep reusing the
            // same view identity across questions and a reorder question's
            // tapped-token state would leak into the next question.
            //
            // 2026-09-30 whole-codebase audit: question ids are only
            // unique WITHIN a lesson (LessonReinforcement.swift's own doc
            // comment), not globally -- every lesson independently
            // numbers its own questions "q1", "q2"... A reinforcement
            // question is pulled from a SIBLING lesson
            // (siblingQuestions/levelQuestions), so its raw id can
            // collide with the missed question's id it's replacing (both
            // "q3", say), and questionID() alone wouldn't have changed
            // identity for that transition -- the exact leak this .id()
            // exists to prevent. isReinforcing strictly alternates
            // main/reinforcement (recordAnswer's `guard !isReinforcing`
            // means a reinforcement answer never queues another
            // reinforcement), so folding it in disambiguates every real
            // transition without needing content-wide unique ids.
            QuestionCard(question: currentQuestion, course: course, vocabImages: contentStore.vocabImages, session: session, lessonId: lesson.id, isConnected: networkMonitor.isConnected, checked: checked, picked: $picked, translationVerdict: $translationVerdict)
                .id("\(isReinforcing ? "reinforce" : "main")-\(questionID(currentQuestion))")

        }
        .padding()
    }

    /// Check, or the verdict panel once checked: pinned below the scrolling question.
    @ViewBuilder
    private var quizControls: some View {
            if isSubmitting {
                ProgressView().tint(AlphonsoColor.moss).frame(maxWidth: .infinity)
            } else if isCheckingTranslation {
                ProgressView("Checking...").tint(AlphonsoColor.moss).frame(maxWidth: .infinity)
            } else if !checked {
                Button("Check") {
                    // Every other type grades synchronously. A translation has
                    // to settle first, because the curated phrasings are only a
                    // floor and the second opinion that can lift them is a
                    // network call -- scoring before it lands would record a
                    // miss the learner is then told they did not make.
                    if case .translate = currentQuestion {
                        isCheckingTranslation = true
                        Task {
                            await settleTranslationVerdict()
                            isCheckingTranslation = false
                            checked = true
                            recordAnswer()
                        }
                    } else {
                        checked = true
                        recordAnswer()
                    }
                }
                    .buttonStyle(.alphonsoPrimary)
                    // Whitespace is not an answer.
                    .disabled((picked ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } else {
                AnswerVerdictPanel(
                    correct: lastAnswerCorrect,
                    correctAnswer: AnswerVerdict.correctAnswer(for: currentQuestion),
                    continueTitle: isReinforcing || pendingReinforcement != nil || idx < total - 1 ? "Continue" : "Finish"
                ) {
                    if let pendingReinforcement {
                        activeReinforcement = pendingReinforcement
                        self.pendingReinforcement = nil
                        picked = nil
                        checked = false
                        translationVerdict = nil
                        return
                    }
                    if activeReinforcement != nil {
                        activeReinforcement = nil
                        // falls through: finishing a reinforcement round
                        // still needs to advance below.
                    }
                    if idx < total - 1 {
                        idx += 1
                        picked = nil
                        checked = false
                    } else {
                        Task { await finish() }
                    }
                }
            }
    }

    /// The verdict the panel shows: a translation's settled grade when there is one (it may come from the AI
    /// grader), otherwise the local match. The same rule recordAnswer scores by.
    private var lastAnswerCorrect: Bool {
        if case .translate = currentQuestion, let translationVerdict {
            return translationVerdict.correct
        }
        return isAnswerCorrect(currentQuestion, picked: picked, course: course)
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Settles the current translation's verdict before it is scored.
    private func settleTranslationVerdict() async {
        guard case .translate(let q) = currentQuestion else { return }
        translationVerdict = await settledTranslationVerdict(
            question: q,
            lessonId: lesson.id,
            course: course,
            session: session,
            isConnected: networkMonitor.isConnected,
            hasAIConsent: aiConsent.isGranted,
            submission: picked)
    }

    private func recordAnswer() {
        // Reinforcement rounds are supplementary practice only -- they
        // never touch correctCount/answers/hearts/XP.
        guard !isReinforcing else { return }
        let question = lesson.questions[idx]
        answers.append(LessonAnswer(questionId: questionID(question), answer: picked ?? ""))
        // For a translation the settled verdict outranks the local match: it is
        // what the learner was just shown, and isAnswerCorrect only knows the
        // curated phrasings.
        let correct: Bool
        if case .translate = question, let translationVerdict {
            correct = translationVerdict.correct
        } else {
            correct = isAnswerCorrect(question, picked: picked, course: course)
        }
        if correct {
            correctCount += 1
        } else {
            // 2026-09-30 whole-codebase audit: a wrong answer never spent
            // a heart on iOS at all -- confirmed by grepping the entire
            // app target for `loseHeart`, finding zero call sites outside
            // ProgressSyncClient's own definition and tests. Web calls
            // both a local optimistic update and the loseHeart RPC on
            // every wrong (non-reinforcement) answer
            // (lesson.$id.tsx:206-207); complete-lesson only ever GRANTS
            // hearts (regen/streak-milestone/perfect-lesson bonus), never
            // deducts them, so nothing else was covering for this. Net
            // effect: an iOS learner could answer every question wrong,
            // in every lesson, forever, and never lose a heart -- the
            // hearts gate and the XP-to-heart purchase built around it
            // had no effect on iOS. Fire-and-forget, matching web's own
            // `void loseHeartRemote()` -- a lost heart is not worth
            // blocking the learner's flow over, and the next full sync
            // (or restoreHeartsIfDue's regen check) will reconcile
            // either way if this particular call fails.
            spendHeartForWrongAnswer()
            // "Doing well" skews the reinforcement pool wider (see
            // pickReinforcementQuestion's doc comment) -- based on
            // accuracy over prior questions this attempt, not counting
            // this miss. Queued as *pending*, not shown yet -- the
            // learner should see this question's own feedback first.
            let doingWell = idx > 0 && Double(correctCount) / Double(idx) >= 0.8
            pendingReinforcement = pickReinforcementQuestion(
                siblingQuestions: siblingQuestions,
                levelQuestions: levelQuestions,
                doingWell: doingWell,
                seed: "\(attemptSeed)-reinforce-\(idx)"
            )
        }
    }

    /// Optimistically decrements the cached hearts count (so the tab-bar
    /// status header reflects the loss immediately, same intent as web's
    /// `loseHeartLocal()`) and fires the real `lose_heart` RPC in the
    /// background. Best-effort both ways: a missing access token or a
    /// failed request just means the next real sync corrects the count,
    /// same posture as this file's other fire-and-forget calls.
    private func spendHeartForWrongAnswer() {
        if let cached = syncQueueStore.lastKnownProgress(), cached.hearts > 0 {
            // The last heart also starts the refill timer, so the offline gate can show a countdown.
            let after = HeartsEconomy.afterLosingHeart(
                hearts: cached.hearts,
                heartsRefillAt: cached.heartsRefillAt.map { Date(timeIntervalSince1970: $0 / 1000) },
                now: Date())
            syncQueueStore.updateLastKnownProgress(LessonCompletionProgress(
                xp: cached.xp, streak: cached.streak, longestStreak: cached.longestStreak,
                lastActiveDate: cached.lastActiveDate, hearts: after.hearts,
                heartsRefillAt: after.heartsRefillAt.map { $0.timeIntervalSince1970 * 1000 },
                streakFreezes: cached.streakFreezes, leagueTier: cached.leagueTier
            ))
        }
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        Task { _ = try? await client.loseHeart() }
    }

    /// The lesson session starts when the lesson opens, which is where the server's hearts gate applies
    /// (start-lesson-session's 409). Offline, the cached hearts decide with the same rule (HeartsEconomy.gate).
    /// A failure here is not fatal: finish() mints a token if none is held.
    private func openLessonSession() async {
        sessionToken = nil
        guard networkMonitor.isConnected else {
            if let cached = syncQueueStore.lastKnownProgress(),
               case let .outOfHearts(refillAt) = HeartsEconomy.gate(
                   hearts: cached.hearts,
                   heartsRefillAt: cached.heartsRefillAt.map { Date(timeIntervalSince1970: $0 / 1000) },
                   now: Date()) {
                block(refillAt: refillAt)
            }
            return
        }
        guard let accessToken = await session.freshAccessToken() else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            sessionToken = try await client.startLessonSession(lessonID: lesson.id, course: course.wireCode)
        } catch let ProgressSyncError.outOfHearts(refillAt) {
            block(refillAt: refillAt)
        } catch {
            // Best-effort: finish() starts a session itself when none is held.
        }
    }

    private func block(refillAt: Date?) {
        heartsGateState = .blocked
        outOfHearts = OutOfHeartsModel(refillAt: refillAt)
    }

    private func finish() async {
        isSubmitting = true
        defer { isSubmitting = false }
        guard session.accessToken != nil else {
            completionFailure = .unauthorized
            return
        }
        // Offline: never attempt the calls. The queued row keeps the session token from the lesson's start, so
        // sync can use it within its 3 h lifetime (LessonCompletionService re-mints an expired one).
        guard networkMonitor.isConnected else {
            queueOffline(reason: .offline)
            return
        }
        let session = self.session
        let service = LessonCompletionService(
            token: { force in
                if let token = await session.freshAccessToken(forceRefresh: force) { return .token(token) }
                return await session.accessToken == nil ? .signedOut : .unreachable
            },
            makeClient: { ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: $0) })
        let request = LessonCompletionRequest(lessonID: lesson.id, total: total, answers: answers, course: course.wireCode, sessionToken: sessionToken)
        switch await service.complete(request) {
        case let .success(completion):
            // nil previousTier means this is the first completion this
            // cache has ever seen (fresh install, or cleared) -- there's no
            // real "before" to compare against, so that case is never
            // treated as a promotion.
            let previousTier = LeagueTierCache.lastKnownTier
            LeagueTierCache.lastKnownTier = completion.progress.leagueTier
            isLeaguePromotion = previousTier != nil && previousTier != completion.progress.leagueTier
            result = completion
            syncQueueStore.updateLastKnownProgress(completion.progress)
            await scheduleStreakReminderAfterCompletion(lastActiveDate: completion.progress.lastActiveDate)
            if isLeaguePromotion || !completion.newlyUnlocked.isEmpty {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            // After the haptic and off the finish path: a slow network must not delay either.
            Task { await decideReminderCard() }
        case let .failure(error):
            // Queue what waiting can fix, and a finish refused at 0 hearts (sync defers it until a refill). A
            // rejected attempt is never queued (it would sit in the queue forever), and is never "offline".
            switch error.finishDisposition {
            case .queue: queueOffline(reason: error)
            case .showFailure: completionFailure = error
            }
        }
    }

    /// Queues this attempt for a later sync instead of losing it -- the
    /// worst possible moment for a network failure is after the user just
    /// played an entire lesson. `optimisticXpEstimate` is a naive guess
    /// (see PendingLessonCompletion's doc comment); the real XP is shown
    /// once sync confirms it.
    private func queueOffline(reason: LessonCompletionError) {
        let pending = PendingLessonCompletion(
            lessonID: lesson.id,
            total: total,
            answers: answers,
            course: course.wireCode,
            queuedAt: Date(),
            optimisticXpEstimate: computeXpGain(correct: correctCount, total: total),
            ownerUserID: session.userID,
            sessionToken: sessionToken
        )
        syncQueueStore.appendLessonCompletion(pending)
        queuedReason = reason
        queuedOffline = pending
    }

    /// Reschedules today's streak reminder, since completing a lesson changes whether one is still needed.
    /// Never asks for permission: a cold system dialog over the first celebration gets permanent "Don't Allow"
    /// answers. The ask lives behind the in-app card ("Remind me"), see `acceptReminders`.
    private func scheduleStreakReminderAfterCompletion(lastActiveDate: String?) async {
        notificationScheduler.scheduleStreakReminder(lastActiveDate: lastActiveDate)
    }

    /// Decides whether the finish screen offers the reminder card: from the 2nd completed lesson, only while
    /// the permission is still undetermined, at most twice and 3 days apart (`ReminderPromptPolicy`).
    private func decideReminderCard() async {
        showReminderCard = false
        let decidingFor = lesson.id
        let status = await notificationScheduler.currentAuthorizationStatus()
        let permission: ReminderPermission = switch status {
        case .notDetermined: .notDetermined
        case .denied: .denied
        default: .granted
        }
        // Cheap checks first: no lesson-count request when the card could not show anyway.
        guard permission == .notDetermined, ReminderPromptStore().load().dismissals < ReminderPromptPolicy.maxDismissals,
              let token = await session.freshAccessToken() else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        let completed = Set((try? await client.fetchCompletedLessonIds(course: course.wireCode)) ?? []).count
        // The learner may have tapped Continue while the fetch ran; never show a stale lesson's card.
        guard lesson.id == decidingFor, result != nil else { return }
        let show = ReminderPromptPolicy.shouldShowCard(
            completedLessons: completed, permission: permission, state: ReminderPromptStore().load(), now: Date())
        withAnimation(UIAccessibility.isReduceMotionEnabled ? .linear(duration: 0.15) : .spring(duration: 0.35)) {
            showReminderCard = show
        }
        if show { AccessibilityNotification.Announcement(ReminderPromptCopy.title).post() }
    }

    /// "Remind me": the only place the system permission dialog is requested.
    private func acceptReminders() async {
        showReminderCard = false
        if await notificationScheduler.requestAuthorization() {
            // iOS has one permission for local and remote notifications; RootView's registerIfAuthorized()
            // covers later launches, this covers the session of the grant.
            UIApplication.shared.registerForRemoteNotifications()
            notificationScheduler.scheduleStreakReminder(lastActiveDate: result?.progress.lastActiveDate)
        }
    }

    private func declineReminders() {
        ReminderPromptStore().recordNotNow()
        showReminderCard = false
    }
}

private func questionID(_ question: Question) -> String {
    switch question {
    case .multipleChoice(let q): return q.id
    case .fillInBlank(let q): return q.id
    case .reorder(let q): return q.id
    case .listening(let q): return q.id
    case .speak(let q): return q.id
    case .translate(let q): return q.id
    }
}

/// V3 pkg 4a: on-device TTS for "listening comprehension" format questions
/// (an mc question with `audioText` set) -- same reasoning as the web's
/// speech.ts (a free platform capability, not a new vendor call).
private func speak(_ text: String, course: Course) {
    questionCardSpeechSynthesizer.stopSpeaking(at: .immediate)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = SpeechVoice.voice(for: course)
    questionCardSpeechSynthesizer.speak(utterance)
}

private let questionCardSpeechSynthesizer = AVSpeechSynthesizer()

private struct QuestionCard: View {
    let question: Question
    let course: Course
    let vocabImages: [String: VocabImageRef]
    // A speaking question needs a token to transcribe with, and needs to know
    // whether transcription can happen at all -- see SpeakQuestionCard.
    let session: Session
    /// Which lesson this question belongs to, for /api/grade-translation's
    /// server-side question lookup.
    let lessonId: String
    let isConnected: Bool
    let checked: Bool
    @Binding var picked: String?
    /// Settled by the player before it scores -- see settledTranslationVerdict.
    @Binding var translationVerdict: TranslationVerdict?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // "reorder" questions accumulate tapped token *indices* (not values,
    // since a sentence can repeat a word) -- reset automatically per
    // question via this view's .id() modifier in quizBody, same reasoning
    // as the web's identical pattern in lesson.$id.tsx.
    @State private var orderPicks: [Int] = []

    var body: some View {
        Group {
            switch question {
            case .multipleChoice(let q):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                if let imageKey = q.imageKey, let image = vocabImages[imageKey] {
                    VocabImageView(image: image, cardHeight: 160, decorative: true)
                }
                if let audioText = q.audioText {
                    Button {
                        speak(audioText, course: course)
                    } label: {
                        Label("Play audio", systemImage: "speaker.wave.2.fill")
                    }
                    .buttonStyle(.alphonsoSecondary(fullWidth: false))
                }
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                ForEach(q.choices, id: \.self) { choice in
                    AnswerChoiceButton(choice: choice, picked: picked, checked: checked, isCorrectChoice: q.choices[q.answer] == choice) { picked = choice }
                }
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation, course: course)
                }
            }
        case .fillInBlank(let q):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                TextField("Type your answer", text: Binding(get: { picked ?? "" }, set: { picked = $0 }))
                    .textFieldStyle(.plain)
                    .padding(AlphonsoSpacing.sm)
                    .alphonsoInputBackground()
                    .disabled(checked)
                if !q.bank.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(q.bank, id: \.self) { word in
                                Button(word) { picked = word }
                                    .buttonStyle(.alphonsoWordChip(picked: picked == word))
                                    .disabled(checked)
                                    // Room for the chip's 4 pt edge, which a horizontal ScrollView would clip.
                                    .padding(.bottom, 4)
                            }
                        }
                    }
                }
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation, course: course)
                }
            }
        case .reorder(let q):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                assembledArea(tokens: q.tokens)
                tokenPool(tokens: q.tokens)
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation, course: course)
                }
            }
            .onChange(of: orderPicks) {
                // `picked` stays nil (Check disabled, same generic gate as
                // mc/fill) until every token has been placed -- matches the
                // web's `orderPicks.length !== q.tokens.length` gate.
                picked = orderPicks.count == q.tokens.count
                    ? orderPicks.map { q.tokens[$0] }.joined(separator: " ")
                    : nil
            }
        case .listening(let q):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                // Audio-led and labelled, so it does not read as an ordinary
                // multiple choice that happens to have a speaker button.
                Text("LISTENING")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.inkSoft)
                Button {
                    speak(q.audioText, course: course)
                } label: {
                    Label("Play audio", systemImage: "speaker.wave.2.fill")
                }
                .buttonStyle(.alphonsoSecondary(fullWidth: false))
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                ForEach(q.choices, id: \.self) { choice in
                    // `answer` is the choice text, not an index.
                    AnswerChoiceButton(choice: choice, picked: picked, checked: checked, isCorrectChoice: q.answer == choice) { picked = choice }
                }
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation, course: course)
                }
            }
            case .translate(let q):
                TranslateQuestionCard(
                    question: q, checked: checked, picked: $picked,
                    verdict: $translationVerdict, course: course, surface: .lesson)
            case .speak(let q):
                SpeakQuestionCard(
                    question: q, course: course, session: session,
                    isConnected: isConnected, checked: checked, picked: $picked)
            }
        }
        // Drives ExplanationView's AlphonsoTipCard .transition -- without
        // an explicit animation tied to `checked`, the card would just pop
        // in instantly instead of sliding in from the trailing edge. nil
        // under Reduced Motion: AlphonsoTipCard's own transition already
        // drops to a plain opacity fade in that case, and a spring on the
        // surrounding container would still animate its relayout/resize
        // otherwise.
        .animation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75), value: checked)
    }

    private func assembledArea(tokens: [String]) -> some View {
        HStack {
            if orderPicks.isEmpty {
                Text("Tap the words below in order")
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            } else {
                ForEach(Array(orderPicks.enumerated()), id: \.offset) { position, tokenIdx in
                    Button(tokens[tokenIdx]) {
                        orderPicks.remove(at: position)
                    }
                    .buttonStyle(.alphonsoPrimary(fullWidth: false))
                    .disabled(checked)
                }
            }
            Spacer()
        }
        .frame(minHeight: 44)
        .padding(AlphonsoSpacing.sm)
        .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
    }

    // Horizontal scroll rather than a wrapping layout -- same tradeoff
    // this file already made for fill-in-blank's word bank just above,
    // kept consistent rather than introducing a custom Layout for this
    // one case.
    private func tokenPool(tokens: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(Array(tokens.enumerated()), id: \.offset) { i, token in
                    if !orderPicks.contains(i) {
                        Button(token) { orderPicks.append(i) }
                            .buttonStyle(.alphonsoWordChip(picked: false))
                            .disabled(checked)
                            // Room for the chip's 4 pt edge, which a horizontal ScrollView would clip.
                            .padding(.bottom, 4)
                    }
                }
            }
        }
    }
}

private struct OverviewScreen: View {
    let lesson: Lesson
    let wordCount: Int
    let questionCount: Int
    /// Up to 3 of this lesson's vocab images, shown as a small teaser
    /// before the user commits to starting -- genuinely optional polish
    /// (docs/v2-kickoffs/07-vocab-images-and-content-polish.md's "Deepened
    /// feature 2"), not core functionality; an empty array just means no
    /// thumbnails render, same as today.
    let previewImages: [VocabImageRef]
    let onStart: () -> Void

    var body: some View {
        // TestFlight feedback (2026-09-29, with a screenshot): "the button
        // to start a lesson will be buried underneath [the podcast mini-
        // bar]." This screen is pushed via LessonBrowserView's
        // NavigationStack, and the mini-bar's safeAreaInset is reserved
        // by the tab ROOT (see PodcastMiniBar.swift's own "Applied to
        // each tab's ROOT CONTENT" comment, which already flagged itself
        // as unverified on hardware) -- it does not extend to a pushed
        // destination's own layout, so a Spacer()-pinned-to-bottom button
        // here had nothing stopping it from landing exactly where the
        // mini-bar sits. Fixed by making the button part of the normal
        // scrolling content instead of pinned to the absolute bottom --
        // reachable by construction regardless of what other chrome is on
        // screen, rather than depending on safe-area propagation across a
        // navigation push boundary.
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                MascotTile(moment: .emptyState, size: 120, tone: .mint)
                    .alphonsoLift()
                    .frame(maxWidth: .infinity)
                    .accessibilityHidden(true)
                Text(lesson.subtitle.uppercased())
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
                Text(lesson.title)
                    .font(AlphonsoFont.display(32, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)

                VStack(alignment: .leading, spacing: AlphonsoSpacing.sm + 4) {
                    overviewStep(emoji: "\u{1F4DA}", tone: .coral, label: "Vocabulary", detail: "\(wordCount) word\(wordCount == 1 ? "" : "s") with examples")
                    if !previewImages.isEmpty {
                        HStack(spacing: 8) {
                            ForEach(previewImages, id: \.url) { image in
                                VocabImageView(image: image, thumbnailSize: 44)
                            }
                        }
                        .padding(.leading, AlphonsoSpacing.md)
                    }
                    overviewStep(emoji: "\u{1F3AF}", tone: .sky, label: "Practice", detail: "\(questionCount) questions")
                    overviewStep(emoji: "\u{2B50}", tone: .mint, label: "Review", detail: "Anything you miss comes back later")
                }

                Button("Begin lesson", action: onStart)
                    .buttonStyle(.alphonsoPrimary)
                    .padding(.top, AlphonsoSpacing.sm)
            }
            .padding()
        }
        .background(AlphonsoColor.surface)
    }

    /// One step as a coloured card with a 3D icon. The icon is decorative; the label carries the meaning.
    private func overviewStep(emoji: String, tone: AlphonsoTileTone, label: String, detail: String) -> some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            Icon3DView(emoji: emoji, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(AlphonsoFont.display(17, weight: .bold))
                Text(detail)
                    .font(AlphonsoFont.sans(12))
                    .opacity(0.8)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(tone.ink)
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.vertical, 12)
        .background(tone.background, in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl + 6, style: .continuous))
        .alphonsoLift()
        .accessibilityElement(children: .combine)
    }
}

private struct VocabScreen: View {
    let lesson: Lesson
    let items: [VocabItem]
    let course: Course
    let onStart: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page = 0

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            // At the largest text sizes a fixed card would clip its words, so the screen stays one scrolling list.
            ScrollView { listContent }
        } else {
            deck
        }
    }

    /// Words to learn, one big card at a time: the picture, the word, its sound, the meaning and an example, with
    /// Alphonso peeking over the corner. "Next word" moves on and the last card starts practice; Skip goes straight
    /// to it. Swiping also moves between cards.
    private var deck: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Vocabulary · \(lesson.subtitle)".uppercased())
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
                Text(lesson.title)
                    .font(AlphonsoFont.display(24, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
                // Skip shares the counter's row (build 55): beside the title it crowded long titles.
                HStack {
                    Text("Word \(page + 1) of \(items.count)")
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                        .monospacedDigit()
                    Spacer(minLength: 0)
                    if items.count > 1 {
                        Button("Skip to practice", action: onStart)
                            .font(AlphonsoFont.sans(14, weight: .semiBold))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                            .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                    }
                }
            }

            TabView(selection: $page) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    wordCard(item, index: index)
                        .padding(.horizontal, 2)
                        .padding(.top, 14)
                        .padding(.bottom, 8)
                        // The card keeps its own height, at the top of the page.
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: page)

            HStack(spacing: 6) {
                ForEach(items.indices, id: \.self) { index in
                    Capsule()
                        .fill(index == page ? AlphonsoColor.moss : AlphonsoColor.hairline)
                        .frame(width: index == page ? 20 : 8, height: 8)
                }
            }
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)

            Button(VocabDeck.buttonTitle(index: page, count: items.count)) {
                if page < items.count - 1 {
                    page += 1
                } else {
                    onStart()
                }
            }
            .buttonStyle(.alphonsoPrimary)
        }
        .padding()
        .background(AlphonsoColor.surface)
    }

    /// The card's picture: 180 pt, smaller on a short screen (an iPhone SE) so the words below it still fit.
    private static var cardImageHeight: CGFloat { min(180, UIScreen.main.bounds.height * 0.2) }

    private func speakButton(_ item: VocabItem, foreground: Color = AlphonsoColor.ink) -> some View {
        Button {
            speak(item.term, course: course)
        } label: {
            Image(systemName: "speaker.wave.2.fill")
                .font(.body)
                .frame(width: AlphonsoSpacing.minTouchTarget, height: AlphonsoSpacing.minTouchTarget)
                .background(AlphonsoColor.surface, in: Circle())
                .overlay(Circle().strokeBorder(AlphonsoColor.hairline, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .foregroundStyle(foreground)
        .accessibilityLabel("Play pronunciation for \(item.term)")
    }

    /// A word with no photo (grammar words never have one) gets a coloured band with the word itself, large, in
    /// place of the picture: a different tile tone per card so the deck still feels illustrated.
    private func wordBand(_ item: VocabItem, index: Int) -> some View {
        let tone = AlphonsoTileTone.allCases[index % AlphonsoTileTone.allCases.count]
        return VStack(spacing: AlphonsoSpacing.sm) {
            Text(item.term)
                .font(AlphonsoFont.display(40, weight: .bold))
                .foregroundStyle(tone.ink)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.5)
                .lineLimit(2)
            speakButton(item, foreground: tone.ink)
        }
        .padding(.horizontal, 56)
        .padding(.vertical, AlphonsoSpacing.md + 4)
        .frame(maxWidth: .infinity)
        .background(tone.background, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg + 4, style: .continuous))
    }

    private func cardWords(_ item: VocabItem, index: Int) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
            if let image = item.image {
                VocabImageView(image: image, cardHeight: Self.cardImageHeight)
                HStack(spacing: AlphonsoSpacing.sm) {
                    Text(item.term)
                        .font(AlphonsoFont.display(34, weight: .bold))
                        .foregroundStyle(AlphonsoColor.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(2)
                    speakButton(item)
                }
                .padding(.trailing, 56)
            } else {
                wordBand(item, index: index)
            }
            // Either line can be empty when the lesson data has no real meaning or example for the word.
            if !item.meaning.isEmpty {
                Text(item.meaning)
                    .font(AlphonsoFont.sans(16))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !item.example.isEmpty {
                Text(item.example)
                    .font(AlphonsoFont.sans(15).italic())
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, AlphonsoSpacing.md)
                    .padding(.vertical, AlphonsoSpacing.sm + 2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AlphonsoColor.surface, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
            }
        }
        .padding(AlphonsoSpacing.md + 4)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// One card, as tall as its words (no stretched empty box). It scrolls inside only when the words do not fit
    /// (a long example on an iPhone SE).
    private func wordCard(_ item: VocabItem, index: Int) -> some View {
        ViewThatFits(in: .vertical) {
            cardWords(item, index: index)
            ScrollView { cardWords(item, index: index) }
                .scrollBounceBehavior(.basedOnSize)
        }
        .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(AlphonsoColor.hairline, lineWidth: 2))
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(AlphonsoColor.hairline)
                .offset(y: 6)
        )
        .overlay(alignment: .topTrailing) {
            // Decorative: Alphonso peeks over the card's corner.
            Image("Alphonso-encouraging")
                .resizable()
                .scaledToFit()
                .frame(width: 72, height: 72)
                .offset(x: 6, y: -14)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .contain)
    }

    /// The scrolling list, kept for the largest text sizes.
    private var listContent: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            Text("Vocabulary · \(lesson.subtitle)".uppercased())
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
            Text(lesson.title)
                .font(AlphonsoFont.display(24, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("\(items.count) word\(items.count == 1 ? "" : "s") to learn before you practise.")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
            wordList
            startButton
        }
        .padding()
        .background(AlphonsoColor.surface)
    }

    private var startButton: some View {
        Button("Start practice", action: onStart)
            .buttonStyle(.alphonsoPrimary)
    }

    private var wordList: some View {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm + 4) {
                ForEach(items, id: \.term) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        if let image = item.image {
                            VocabImageView(image: image)
                        }
                        HStack(spacing: 8) {
                            Text(item.term)
                                .font(AlphonsoFont.display(17, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                            Button {
                                speak(item.term, course: course)
                            } label: {
                                Image(systemName: "speaker.wave.2.fill")
                                    .font(.footnote)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(AlphonsoColor.inkSoft)
                            .accessibilityLabel("Play pronunciation for \(item.term)")
                        }
                        Text(item.meaning)
                            .font(AlphonsoFont.sans(12))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                        Text(item.example)
                            .font(AlphonsoFont.sans(12).italic())
                            .foregroundStyle(AlphonsoColor.inkSoft)
                            .padding(.top, 2)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
                }
            }

    }
}

/// The one way the iOS app shows a vocab image (App Store review fix, 2026-10).
/// A neutral placeholder only while loading. On failure, or for any URL outside
/// the self-hosted bucket, the slot collapses entirely: no blank box. Shared by
/// VocabScreen's card image, OverviewScreen's thumbnails (`thumbnailSize`) and
/// ReviewQueueView's image-matching questions. The decision lives in the Kit's
/// VocabImagePolicy (tested); this view only maps AsyncImage phases onto it.
struct VocabImageView: View {
    let image: VocabImageRef
    /// A fixed square size for a small teaser thumbnail, or nil for a
    /// full-width card image at `cardHeight`.
    var thumbnailSize: CGFloat?
    var cardHeight: CGFloat = 120
    /// True for an image shown alongside a question whose answer is the term: its
    /// description would give the answer away to VoiceOver, so it is hidden from it.
    var decorative = false
    @State private var failedURL: String?
    /// The URL that has actually rendered; exposed to UI tests through the accessibility identifier.
    @State private var loadedURL: String?

    var body: some View {
        switch VocabImagePolicy.slot(url: image.url, failedURL: failedURL) {
        case .collapsed:
            EmptyView()
        case .visible:
            AsyncImage(url: URL(string: image.url)) { phase in
                switch phase {
                case .success(let loadedImage):
                    loadedImage.resizable().aspectRatio(contentMode: .fill)
                        .onAppear { loadedURL = image.url }
                case .empty:
                    ZStack {
                        AlphonsoColor.parchment
                        ProgressView().tint(AlphonsoColor.moss)
                    }
                case .failure:
                    Color.clear.onAppear { failedURL = image.url }
                @unknown default:
                    Color.clear.onAppear { failedURL = image.url }
                }
            }
            .frame(width: thumbnailSize, height: thumbnailSize ?? cardHeight)
            .frame(maxWidth: thumbnailSize == nil ? .infinity : nil)
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous))
            .clipped()
            .accessibilityLabel(image.alt)
            .accessibilityIdentifier(loadedURL == image.url ? "vocab-image-loaded" : "vocab-image-loading")
            .accessibilityHidden(decorative)
        }
    }
}

private struct FinishView: View {
    let result: LessonCompletionResult
    let correct: Int
    let total: Int
    let contentStore: ContentStore
    let isLeaguePromotion: Bool
    let lessonID: String
    let course: Course
    let session: Session
    /// TestFlight feedback (2026-09-29): "there is no way to continue to
    /// the next lesson ... without going back to the main menu." Nil (no
    /// button) at the end of a CEFR band -- see LessonPlayerView's
    /// nextLessonID doc comment for why that's deliberate.
    let onContinueToNextLesson: (() -> Void)?
    /// Opens Hector (or the paywall) from the happiest moment. Nil hides the button.
    let onPractiseWithHector: (() -> Void)?
    /// The in-app reminder card (from the 2nd completed lesson). The system dialog only follows "Remind me".
    let showReminderCard: Bool
    let onRemindMe: () -> Void
    let onNotNow: () -> Void

    @State private var showPromotionOverlay = false
    /// Flips once on appear; the success haptic is keyed to it.
    @State private var celebrated = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @Environment(\.dismiss) private var dismiss

    /// Clear space over the clip before the card starts, so Alphonso is seen first.
    private static var clipWindow: CGFloat { UIScreen.main.bounds.height * 0.34 }

    private var unlockedAchievements: [Achievement] {
        result.newlyUnlocked.compactMap { id in contentStore.achievements.first { $0.id == id } }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoSpacing.md) {
                // The title sits on glass, over the clip.
                Text("Lesson complete")
                    .font(AlphonsoFont.display(21, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                    .padding(.horizontal, AlphonsoSpacing.md)
                    .padding(.vertical, AlphonsoSpacing.sm)
                    .alphonsoGlass(radius: AlphonsoRadius.xl)

                // Clear space: the clip behind shows Alphonso here, before the card.
                Color.clear
                    .frame(height: Self.clipWindow)
                    .accessibilityElement()
                    .accessibilityLabel("Alphonso celebrating on the stage")
                    .accessibilityAddTraits(.isImage)

                VStack(spacing: AlphonsoSpacing.md) {
                    Text(LessonFinishCopy.headline(correct: correct, total: total))
                        .font(AlphonsoFont.display(24, weight: .bold))
                        .foregroundStyle(AlphonsoColor.ink)
                        .multilineTextAlignment(.center)
                    HStack(spacing: 10) {
                        ForEach(Array(LessonRewards.chips(xp: result.xpGain, streak: result.progress.streak, correct: correct, total: total).enumerated()), id: \.offset) { index, chip in
                            LessonRewardChipView(chip: chip, index: index)
                                .springEntrance(delay: reduceMotion ? 0 : 0.15 + Double(index) * 0.12)
                        }
                    }
                    Text("\(correct)/\(total) correct")
                        .font(AlphonsoFont.sans(13))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                    if let bonus = result.heartsBonus {
                        Text(bonus == "streak" ? "Streak milestone: hearts fully refilled" : "Perfect lesson: +1 heart")
                            .font(AlphonsoFont.sans(13, weight: .semiBold))
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    if !unlockedAchievements.isEmpty {
                        VStack(spacing: AlphonsoSpacing.sm + 4) {
                            Text("Achievement\(unlockedAchievements.count == 1 ? "" : "s") unlocked")
                                .font(AlphonsoFont.sans(13, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: AlphonsoSpacing.sm + 4)], spacing: AlphonsoSpacing.sm + 4) {
                                ForEach(Array(unlockedAchievements.enumerated()), id: \.element.id) { index, achievement in
                                    AchievementBadgeView(achievement: achievement, unlocked: true)
                                        .springEntrance(delay: Double(index) * 0.15)
                                }
                            }
                        }
                        .padding(.top, 8)
                    }

                    if showReminderCard {
                        VStack(spacing: AlphonsoSpacing.sm) {
                            Text(ReminderPromptCopy.title)
                                .font(AlphonsoFont.sans(15, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                                .accessibilityAddTraits(.isHeader)
                            Text(ReminderPromptCopy.body)
                                .font(AlphonsoFont.sans(13))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                                .multilineTextAlignment(.center)
                            ViewThatFits(in: .horizontal) {
                                HStack(spacing: AlphonsoSpacing.sm) {
                                    Button(ReminderPromptCopy.decline, action: onNotNow)
                                        .buttonStyle(.alphonsoSecondary)
                                    Button(ReminderPromptCopy.accept, action: onRemindMe)
                                        .buttonStyle(.alphonsoPrimary)
                                }
                                VStack(spacing: AlphonsoSpacing.sm) {
                                    Button(ReminderPromptCopy.accept, action: onRemindMe)
                                        .buttonStyle(.alphonsoPrimary)
                                    Button(ReminderPromptCopy.decline, action: onNotNow)
                                        .buttonStyle(.alphonsoSecondary)
                                }
                            }
                        }
                        .padding(.top, 8)
                        .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
                    }

                    if let onPractiseWithHector {
                        Button("Practise with Hector", action: onPractiseWithHector)
                            .buttonStyle(.alphonsoSecondary)
                    }

                    GeneratedPracticeSection(lessonID: lessonID, course: course, session: session)
                }
                .padding(AlphonsoSpacing.md)
                .frame(maxWidth: .infinity)
                .alphonsoGlass()
                .springEntrance()
            }
            .padding()
        }
        .scrollContentBackground(.hidden)
        // The whole celebration is one looping clip (the stage, confetti cannons, streamers, sweeping spotlights and
        // Alphonso cheering), filling the screen behind the card with Alphonso in the top half. A fade into the
        // surface at the bottom keeps the card's text readable. Under Reduce Motion the clip's first frame stands
        // still. Decorative here: the clear window above carries its label.
        .background {
            ZStack(alignment: .bottom) {
                ClipBackdrop(clip: .complete, verticalAnchor: 0.2)
                    .ignoresSafeArea()
                LinearGradient(colors: [.clear, AlphonsoColor.surface.opacity(0.92)], startPoint: .top, endPoint: .bottom)
                    .frame(height: UIScreen.main.bounds.height * 0.55)
                    .ignoresSafeArea(edges: .bottom)
            }
            .background(AlphonsoColor.ink)
            .accessibilityHidden(true)
        }
        // Pinned above the tab bar: the way on never scrolls out of view, even on an iPhone SE.
        .safeAreaInset(edge: .bottom) {
            Group {
                if let onContinueToNextLesson {
                    Button("Continue to next lesson", action: onContinueToNextLesson)
                } else {
                    Button("Back to Learn") { dismiss() }
                }
            }
            .buttonStyle(.alphonsoEmber)
            .padding(.horizontal)
            .padding(.vertical, AlphonsoSpacing.sm)
            .background(.ultraThinMaterial)
        }
        .sensoryFeedback(.success, trigger: celebrated)
        .onAppear {
            showPromotionOverlay = isLeaguePromotion
            celebrated = true
        }
        .fullScreenCover(isPresented: $showPromotionOverlay) {
            LeaguePromotionOverlay(tier: result.progress.leagueTier) {
                showPromotionOverlay = false
            }
        }
    }
}

/// V3 pkg 4b -- "generative sentence content." On-demand extra practice a
/// learner can do immediately after finishing a lesson -- entirely
/// ephemeral (view-local state only), never touching XP/hearts/review
/// scheduling, same posture as in-lesson reinforcement (QuestionCard
/// above). Mirrors the web's identical FinishScreen addition
/// (lesson.$id.tsx's GeneratedPracticeSection).
private struct GeneratedPracticeSection: View {
    let lessonID: String
    let course: Course
    let session: Session

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.saveWordHandler) private var saveWordHandler

    /// The course to file a tapped word under, or nil when this course's text is not
    /// wholly in its own language (`SavedWordPolicy`); same rule as ExplanationView.
    private var saveCourse: String? {
        let code = course.translationCourseCode
        // Generated practice has no Question to prove which text is course-language: English only.
        return SavedWordPolicy.savesWholeText(inCourse: code) ? code : nil
    }

    private enum Status: Equatable { case idle, loading, ready, empty, error }

    @State private var status: Status = .idle
    @State private var questions: [GeneratedPracticeQuestion] = []
    @State private var idx = 0
    @State private var picked: Int?
    @State private var checked = false
    @State private var errorText: String?

    var body: some View {
        switch status {
        case .idle, .loading, .empty, .error:
            VStack(spacing: 8) {
                Button {
                    Task { await generate() }
                } label: {
                    if status == .loading {
                        ProgressView().tint(AlphonsoColor.ink)
                    } else {
                        Text("Generate more practice")
                    }
                }
                .buttonStyle(.alphonsoSecondary)
                .disabled(status == .loading)

                // The server answers within about 20 seconds (two short model attempts, then its own fallback
                // set), and generatePractice gives up after 25. This text says a wait is expected.
                if status == .loading {
                    Text("This can take up to 20 seconds.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                } else if status == .empty {
                    Text("Couldn't generate practice for this lesson right now.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                } else if status == .error {
                    Text(errorText ?? "Something went wrong. Try again.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
            }
            .padding(.top, 8)
        case .ready:
            if idx >= questions.count {
                Text("Nice work. That's all the extra practice for this lesson.")
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .padding(.top, 8)
            } else {
                practiceCard
            }
        }
    }

    private var practiceCard: some View {
        let q = questions[idx]
        return VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
            Text("Extra practice \u{00B7} \(idx + 1)/\(questions.count)")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.inkSoft)
            Text(q.prompt)
                .font(AlphonsoFont.sans(16, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            // Keyed by position, not text: a repeated choice would otherwise collide and light up twice.
            ForEach(Array(q.choices.enumerated()), id: \.offset) { index, choice in
                Button {
                    picked = index
                } label: {
                    HStack {
                        Text(choice).font(AlphonsoFont.sans(15))
                        Spacer()
                        if checked && q.answerIndex == index {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(AlphonsoColor.moss)
                        } else if checked && picked == index {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(AlphonsoColor.destructive)
                        }
                    }
                    .padding(AlphonsoSpacing.sm + 4)
                    .background(
                        picked == index ? AlphonsoColor.moss.opacity(0.14) : AlphonsoColor.parchment,
                        in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    )
                }
                .disabled(checked)
                .foregroundStyle(AlphonsoColor.ink)
            }
            if checked {
                if picked == q.answerIndex {
                    if let saveCourse, let saveWordHandler {
                        TappableText(
                            text: q.explanation, color: AlphonsoColor.inkSoft, course: saveCourse,
                            mode: .allWords, onSave: saveWordHandler
                        )
                        .font(AlphonsoFont.sans(13))
                    } else {
                        Text(q.explanation).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                    }
                } else {
                    AlphonsoTipCard(explanation: q.explanation, saveCourse: saveCourse)
                }
                if saveCourse != nil, saveWordHandler != nil {
                    SaveWordHintLine()
                }
            }
            Button(!checked ? "Check" : idx < questions.count - 1 ? "Next" : "Finish practice") {
                if !checked {
                    checked = true
                    return
                }
                idx += 1
                picked = nil
                checked = false
            }
            .buttonStyle(.alphonsoPrimary)
            .disabled(!checked && picked == nil)
        }
        .padding(.top, 8)
        .animation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75), value: checked)
    }

    private func generate() async {
        status = .loading
        errorText = nil
        guard let accessToken = session.accessToken else {
            status = .error
            return
        }
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
        do {
            let result = try await client.generatePractice(lessonID: lessonID, course: course.wireCode)
            if result.isEmpty {
                status = .empty
                return
            }
            questions = result
            idx = 0
            picked = nil
            checked = false
            status = .ready
        } catch let error as TutorError {
            // A quota 429 says when it resets; other failures say what happened (TutorError's copy).
            errorText = error.userMessage()
            status = .error
        } catch {
            errorText = nil
            status = .error
        }
    }
}

/// Shown instead of `FinishView` when the completion was queued for later
/// sync rather than confirmed -- deliberately distinguishable at a glance
/// (cloud-upload icon, orange rather than green, "estimated" language), so
/// a user never mistakes a provisional result for a confirmed one. No
/// achievement/league-promotion celebration here -- those need the real
/// server result, which doesn't exist yet.
private struct OfflineFinishView: View {
    let pending: PendingLessonCompletion
    let correct: Int
    let total: Int
    let reason: LessonCompletionError
    let onContinue: () -> Void
    let onPractiseWithHector: (() -> Void)?

    var body: some View {
        VStack(spacing: AlphonsoSpacing.md) {
            Image(systemName: "icloud.and.arrow.up.fill")
                .font(.system(size: 56))
                .foregroundStyle(AlphonsoColor.ember)
                .accessibilityHidden(true)
            Text(reason.userMessage)
                .font(AlphonsoFont.display(19, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)
            // "Up to": the number is this attempt's full value. A lesson completed before only earns the
            // improvement over its best score, which this screen cannot know offline.
            Text("Up to +\(pending.optimisticXpEstimate) XP once it syncs")
                .font(AlphonsoFont.display(24, weight: .bold))
                .foregroundStyle(AlphonsoColor.ember)
                .multilineTextAlignment(.center)
            Text("A lesson you've already finished only earns XP for a better score.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
            Text("\(correct)/\(total) correct")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
            Button("Continue", action: onContinue)
                .buttonStyle(.alphonsoPrimary)
                .padding(.top, AlphonsoSpacing.sm)
            if let onPractiseWithHector {
                Button("Practise with Hector", action: onPractiseWithHector)
                    .buttonStyle(.alphonsoSecondary)
            }
        }
        .padding()
        .background(AlphonsoColor.surface)
    }
}

// SpringEntrance/`.springEntrance(...)` moved to
// DesignSystem/AlphonsoComponents.swift so other screens can share it.

/// A distinct, bigger celebration for a league promotion -- rarer and more
/// significant than a typical achievement unlock, so it gets a full-screen
/// takeover rather than another card in the achievement grid above.
private struct LeaguePromotionOverlay: View {
    let tier: String
    let onContinue: () -> Void

    var body: some View {
        ZStack {
            LeagueTierPalette.color(for: tier).opacity(0.15).ignoresSafeArea()
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "shield.fill")
                    .font(.system(size: 96))
                    .foregroundStyle(LeagueTierPalette.color(for: tier))
                    .springEntrance(response: 0.6, dampingFraction: 0.6, minScale: 0.4)
                Text("League up!")
                    .font(AlphonsoFont.display(34, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
                AlphonsoMascotBanner(mascot: .alphonso, message: "You've been promoted to \(LeagueTierPalette.label(for: tier))!")
                    .padding(.horizontal)
                Spacer()
                Button("Continue", action: onContinue)
                    .buttonStyle(.alphonsoPrimary)
                    .padding(.horizontal, 40)
                    .padding(.bottom, 40)
            }
        }
    }
}

/// Ports src/data/achievements.ts's LEAGUE_TIER_META hex values exactly --
/// a different, 5-tier palette (bronze/silver/sapphire/ruby/diamond) from
/// AchievementBadgeView's 4-tier achievement-tier palette, so kept separate
/// rather than merged.
enum LeagueTierPalette {
    static func color(for tier: String) -> Color {
        switch tier {
        case "bronze": return Color(hex: 0xB07242)
        case "silver": return Color(hex: 0x8A9099)
        case "sapphire": return Color(hex: 0x4A6B8A)
        case "ruby": return Color(hex: 0x9A4A4A)
        case "diamond": return Color(hex: 0x4A7F7A)
        default: return Color(white: 0.53)
        }
    }

    static func label(for tier: String) -> String {
        LeagueTierCopy.label(for: tier)
    }
}

/// What the finish screen's "Practise with Hector" button needs to open Hector or the paywall.
struct HectorAccess {
    let entitlementStore: EntitlementStore
    let activeCourse: ActiveCourseModel
    let conversationStore: ConversationStore
}

/// One reward on the lesson-complete screen: a 3D icon, the value and its name, in a chunky bordered card.
private struct LessonRewardChipView: View {
    let chip: LessonRewardChip
    /// Its place in the row; later chips start counting a little later, as they pop in.
    var index: Int = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Flips once the chip appears; the number counts up from 0 to its value while it does.
    @State private var reached = false

    /// XP and streak count up; accuracy is shown as it is.
    private var split: (prefix: String, number: Int, suffix: String)? {
        chip.kind != .accuracy ? RewardCountUp.split(chip.value) : nil
    }

    private var title: String {
        switch chip.kind {
        case .xp: return "XP"
        case .streak: return "Streak"
        case .accuracy: return "Accuracy"
        }
    }

    private var tone: AlphonsoTileTone {
        switch chip.kind {
        case .xp: return .sun
        case .streak: return .coral
        case .accuracy: return .mint
        }
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .foregroundStyle(tone.ink)
            Icon3DView(emoji: chip.emoji, size: 28)
            Group {
                if let split {
                    CountingText(
                        number: Double(reduceMotion || reached ? split.number : 0),
                        prefix: split.prefix,
                        suffix: split.suffix
                    )
                } else {
                    Text(chip.value)
                }
            }
            .font(AlphonsoFont.display(18, weight: .bold))
            .foregroundStyle(AlphonsoColor.ink)
        }
        .frame(minWidth: 84)
        .padding(.vertical, 10)
        .background(tone.background, in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous))
        .alphonsoLift()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeOut(duration: RewardCountUp.duration).delay(0.15 + Double(index) * 0.12)) {
                reached = true
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(chip.value)")
    }
}
