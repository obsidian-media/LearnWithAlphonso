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
    /// What "Practice with Hector" on the finish screen needs. Nil hides the button.
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
    /// The learner's earlier best on this lesson, read when it opens. A replay pays only past it, so the verdict's
    /// "+10 XP" starts from it; unknown (offline) promises nothing.
    @State private var previousBest: LessonPreviousBest = .unknown
    /// The last question's Finish completes the lesson once.
    @State private var finishGate = FinishGate()
    /// The lesson's own time, from Start lesson to the last answer, counted only while the app is in front.
    @State private var lessonTimer: ActiveTimer?
    @State private var finishedElapsed: TimeInterval?
    /// The questions missed this attempt, for the complete screen's review list.
    @State private var missed: [LessonMissedItem] = []
    /// A word has been placed in a word-order question.
    @State private var reorderStarted = false
    @State private var showPromotionOverlay = false
    /// Flips once the complete screen appears; the success haptic is keyed to it.
    @State private var celebrated = false

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
        previousBest = .unknown
        finishGate.reset()
        lessonTimer = nil
        finishedElapsed = nil
        missed = []
        reorderStarted = false
        celebrated = false
    }

    private func practiceWithHector() {
        guard let hectorAccess else { return }
        if hectorAccess.entitlementStore.isPro { showingHector = true } else { showingHectorPaywall = true }
    }

    @Environment(\.scenePhase) private var scenePhase

    /// Hearts for the HUD: nil (shown as ∞) for Alphonso Pro.
    private var hudHearts: Int? {
        if hectorAccess?.entitlementStore.isPro ?? false { return nil }
        return syncQueueStore.lastKnownProgress()?.hearts ?? HeartsEconomy.maxHearts
    }

    /// The unit's own room from the room map (Alphonso's study by day for a unit it does not know).
    private var roomID: String { LessonStage.roomID(forUnit: unit?.id, map: LessonData.roomMap) }

    private var unitLine: String {
        guard let unit, let index = contentStore.bundle(for: course).units.firstIndex(where: { $0.id == unit.id }) else {
            return lesson.subtitle
        }
        return "Unit \(index + 1) \u{00B7} \(unit.title)"
    }

    /// "About 4 min · 8 questions · Up to 100 XP": the minutes from the same rules as the web (lesson-timing.json).
    private var startMeta: String {
        let minutes = LessonData.timing?.estimateMinutes(questionTypes: lesson.questions.map(\.typeKey), newWords: vocab.count) ?? 1
        return "About \(minutes) min \u{00B7} \(total) question\(total == 1 ? "" : "s") \u{00B7} Up to \(LessonXP.maxXp(total: total)) XP"
    }

    private var startSteps: [LessonStartStep] {
        var steps: [LessonStartStep] = []
        let words = vocab
        if !words.isEmpty {
            let sample = words.prefix(3).map { $0.term.trimmingCharacters(in: CharacterSet(charactersIn: ".!?\u{2026}")) }
            steps.append(LessonStartStep(
                id: "words", icon: .book, label: "\(words.count) new word\(words.count == 1 ? "" : "s")",
                detail: sample.joined(separator: ", ") + (words.count > sample.count ? "\u{2026}" : "")))
        }
        steps.append(LessonStartStep(
            id: "practice", icon: .check, label: "Practice",
            detail: "\(total) question\(total == 1 ? "" : "s"): pick, listen, say it back"))
        steps.append(LessonStartStep(id: "review", icon: .star, label: "Review", detail: "Anything you miss comes back later"))
        return steps
    }

    /// The stage covers the whole screen (its own HUD closes it); a plain result screen keeps the navigation bar.
    private var onStage: Bool { result != nil || (queuedOffline == nil && completionFailure == nil && total > 0) }

    private func startLesson() {
        lessonTimer = ActiveTimer(now: Date().timeIntervalSince1970)
        phase = vocab.isEmpty ? .quiz : .vocab
        Analytics.track(.lessonStarted, ["lesson_id": lesson.id, "level": "\(unit?.level ?? "")", "course": course.wireCode])
    }

    var body: some View {
        GeometryReader { proxy in
            stage(topInset: proxy.safeAreaInsets.top)
        }
        .lessonLightScope()
        .navigationTitle(lesson.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(onStage ? .hidden : .visible, for: .navigationBar)
        .toolbar(onStage ? .hidden : .visible, for: .tabBar)
        .task(id: lesson.id) { await openLessonSession() }
        // Sound effects: loaded before the first answer, and never played over the question cards' spoken lines.
        .onAppear {
            SoundEffectsPlayer.shared.preload()
            SoundEffectsPlayer.shared.registerVoiceProbe("lessonSpeech") { questionCardSpeechSynthesizer.isSpeaking }
        }
        .onDisappear { SoundEffectsPlayer.shared.cancelPendingCues() }
        // The lesson's time counts only while the app is in front.
        .onChange(of: scenePhase) { _, newPhase in
            let now = Date().timeIntervalSince1970
            if newPhase == .active { lessonTimer?.resume(now: now) } else { lessonTimer?.pause(now: now) }
        }
        // "Practice with Hector": Hector for Pro, otherwise the same paywall the Practice card opens.
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

    @ViewBuilder
    private func stage(topInset: CGFloat) -> some View {
        if let result {
            completeScreen(result: result, topInset: topInset)
        } else if let queuedOffline {
            OfflineFinishView(
                pending: queuedOffline, correct: correctCount, total: total, reason: queuedReason,
                onContinue: nextLessonID != nil ? continueToNextLesson : { dismiss() },
                onPracticeWithHector: hectorAccess == nil ? nil : practiceWithHector)
        } else if let completionFailure {
            LessonSaveFailureView(error: completionFailure, onSignIn: { session.signOut() }, onDone: { dismiss() })
        } else if total == 0 {
            ContentUnavailableView("This lesson has no questions yet", systemImage: "questionmark.circle")
        } else {
            switch phase {
            case .overview:
                LessonStartView(
                    roomID: roomID, unitLine: unitLine, title: lesson.title, meta: startMeta, steps: startSteps,
                    hearts: hudHearts, topInset: topInset, onClose: { dismiss() }, onStart: startLesson)
            case .vocab:
                VStack(spacing: 0) {
                    LessonHUD(progress: 0, hearts: hudHearts, onLight: true, onClose: { dismiss() })
                        .padding(.horizontal)
                        .padding(.top, 8)
                    VocabScreen(
                        lesson: lesson, items: vocab, session: session, courseCode: course.wireCode,
                        onSpeak: { speak($0, course: course) }) { phase = .quiz }
                }
                .lessonSurface()
            case .quiz:
                quizBody(topInset: topInset)
            }
        }
    }

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Has the learner started answering? Alphonso listens (neutral) from the first pick or placed word.
    private var hasStartedAnswer: Bool {
        !(picked ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || reorderStarted
    }

    /// The verdict's "+10 XP": only XP the server will pay (a replay pays past the best earlier score only), and none
    /// for a reinforcement round.
    private var answerXP: Int? {
        guard checked, lastAnswerCorrect, !isReinforcing else { return nil }
        return LessonXP.answerChip(rightSoFar: correctCount, previousBest: previousBest)
    }

    /// The question in the unit's room: the room and HUD on top, Alphonso's bubble over his robe, the answers below.
    /// It scrolls; Check and the verdict sheet are pinned at the foot. The right answer scrolls into view above the
    /// sheet. At accessibility text sizes the same layout holds.
    private func quizBody(topInset: CGFloat) -> some View {
        let question = currentQuestion
        let layout = LessonStage.layout(viewportHeight: Double(UIScreen.main.bounds.height), prompt: question.prompt)
        let expression = LessonStage.expression(picked: hasStartedAnswer, verdict: checked ? lastAnswerCorrect : nil)
        return ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    LessonRoomView(
                        roomID: roomID, expression: expression, height: CGFloat(layout.roomHeight),
                        alphonsoWidth: CGFloat(layout.alphonsoWidth), topInset: topInset
                    ) {
                        LessonHUD(
                            progress: Double(idx + (checked ? 1 : 0)) / Double(max(1, total)), hearts: hudHearts,
                            valueText: "Question \(idx + 1) of \(total)", onClose: { dismiss() })
                            .padding(.horizontal, 16)
                            .padding(.top, topInset + 16)
                    }
                    // .id() forces a fresh QuestionCard (and its reorder @State)
                    // per question -- without it, SwiftUI would keep reusing the
                    // same view identity across questions and a reorder question's
                    // tapped-token state would leak into the next question.
                    //
                    // 2026-09-30 whole-codebase audit: question ids are only
                    // unique WITHIN a lesson, so a reinforcement question pulled
                    // from a sibling lesson can share the missed question's id;
                    // isReinforcing strictly alternates main/reinforcement, so
                    // folding it in disambiguates every real transition.
                    QuestionCard(
                        question: question, course: course, vocabImages: contentStore.vocabImages, session: session,
                        lessonId: lesson.id, isConnected: networkMonitor.isConnected, checked: checked,
                        isReinforcing: isReinforcing, compact: layout.size == .small, picked: $picked,
                        translationVerdict: $translationVerdict, reorderStarted: $reorderStarted)
                        .id("\(isReinforcing ? "reinforce" : "main")-\(questionID(question))")
                        .padding(.horizontal, 16)
                        .padding(.top, layout.size == .small ? -36 : -44)
                        .padding(.bottom, 16)
                }
            }
            .ignoresSafeArea(edges: .top)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: checked) { _, isChecked in
                guard isChecked else { return }
                // After the verdict sheet has taken its room at the foot, so "center" is the space left above it.
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(120))
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                        proxy.scrollTo(QuestionCard.correctAnswerID, anchor: .center)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { quizControls }
        .lessonSurface()
        // The verdict sheet announces the verdict itself; the explanation inside it stays quiet.
        .environment(\.verdictAnnouncedByPanel, true)
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.86), value: checked)
    }

    /// What "Explain in <language>" would explain: the question, what the learner answered and the right answer. Nil
    /// for a right answer or when nothing was answered.
    private var explainRequest: ExplainRequest? {
        guard !lastAnswerCorrect, let picked else { return nil }
        return ExplainRequest.makeWrongAnswer(
            question: currentQuestion.prompt, wrongAnswer: picked,
            correctAnswer: AnswerVerdict.correctAnswer(for: currentQuestion), course: course.wireCode)
    }

    /// Check, or the verdict sheet once checked: pinned below the scrolling question.
    @ViewBuilder
    private var quizControls: some View {
        if isSubmitting {
            ProgressView().frame(maxWidth: .infinity, minHeight: 64).lessonSurface()
        } else if isCheckingTranslation {
            ProgressView("Checking...").frame(maxWidth: .infinity, minHeight: 64).lessonSurface()
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
                        playVerdictEffects(heartLost: recordAnswer())
                    }
                } else {
                    checked = true
                    playVerdictEffects(heartLost: recordAnswer())
                }
            }
            .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
            // Whitespace is not an answer.
            .disabled((picked ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .lessonSurface()
        } else {
            LessonVerdictSheet(
                correct: lastAnswerCorrect,
                title: lastAnswerCorrect ? "Exactly!" : AnswerVerdict.title(correct: false),
                xp: answerXP,
                correctAnswer: AnswerVerdict.correctAnswer(for: currentQuestion),
                onHearAnswer: { speak(AnswerVerdict.correctAnswer(for: currentQuestion), course: course) },
                continueTitle: isReinforcing || pendingReinforcement != nil || idx < total - 1
                    ? (lastAnswerCorrect ? "Continue" : "Got it") : "Finish",
                onContinue: advance,
                extra: explainRequest.map { request in
                    AnyView(ExplainInMyLanguage(request: request, session: session))
                }
            ) {
                ExplanationView(
                    question: currentQuestion, picked: picked, explanation: currentQuestion.explanationText,
                    course: course, correctOverride: translationVerdict?.correct, inSheet: true)
            }
            .transition(reduceMotion ? .opacity : .move(edge: .bottom))
        }
    }

    /// Continue, Got it or Finish. Finish completes the lesson once: a second tap while the completion is in flight
    /// would be a zero-XP replay (FinishGate).
    private func advance() {
        SoundEffectsPlayer.shared.play(.tap)
        if let pendingReinforcement {
            activeReinforcement = pendingReinforcement
            self.pendingReinforcement = nil
            picked = nil
            reorderStarted = false
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
            reorderStarted = false
            checked = false
            translationVerdict = nil
        } else if finishGate.begin() {
            Task { await finish() }
        }
    }

    /// Lesson complete in the unit's room. The XP lines use the server's own count of right answers.
    private func completeScreen(result: LessonCompletionResult, topInset: CGFloat) -> some View {
        let achievements = result.newlyUnlocked.compactMap { id in contentStore.achievements.first { $0.id == id } }
        let headline = total > 0 ? "\(LessonFinishCopy.headline(correct: correctCount, total: total)) You got \(correctCount) of \(total)." : LessonFinishCopy.good
        return LessonCompleteView(
            roomID: roomID,
            headline: headline,
            chips: LessonRewards.chips(xp: result.xpGain, streak: result.progress.streak, correct: correctCount, total: total),
            time: finishedElapsed.map(formatElapsed),
            xpLines: LessonXP.breakdown(correct: result.correct ?? correctCount, total: total, awarded: result.xpGain),
            correct: correctCount,
            total: total,
            heartsBonus: result.heartsBonus,
            achievements: achievements,
            missed: missed,
            topInset: topInset,
            onHearHeadline: { speak(headline, course: .english) },
            continueTitle: nextLessonID != nil ? "Continue to next lesson" : "Back to Learn",
            onContinue: { if nextLessonID != nil { continueToNextLesson() } else { dismiss() } }
        ) {
            if showReminderCard {
                LessonReminderCard(onRemindMe: { Task { await acceptReminders() } }, onNotNow: declineReminders)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
            if hectorAccess != nil {
                Button("Practice with Hector", action: practiceWithHector)
                    .buttonStyle(LessonEdgeButtonStyle(variant: .secondary))
            }
            GeneratedPracticeSection(lessonID: lesson.id, course: course, session: session)
        }
        .sensoryFeedback(trigger: celebrated) { _, _ in SoundEffectsPreference.isOn() ? .success : nil }
        .onAppear {
            showPromotionOverlay = isLeaguePromotion
            celebrated = true
            // The jingle with the confetti, then XP and any achievement as their tiles land; keyed per attempt, so a
            // re-appearance never plays them again. Sound plays under Reduce Motion too (it only calms visuals).
            SoundEffectsPlayer.shared.play(
                SoundEffectCues.finish(xp: result.xpGain, unlocked: achievements.count), key: "finish-\(attemptSeed)")
        }
        // Leaving the complete screen drops the XP and achievement sounds still to come.
        .onDisappear { SoundEffectsPlayer.shared.cancelPendingCues() }
        .fullScreenCover(isPresented: $showPromotionOverlay) {
            LeaguePromotionOverlay(tier: result.progress.leagueTier) {
                showPromotionOverlay = false
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

    /// The verdict's sound and haptic, once per checked answer. A lost heart follows the wrong-answer sound, and only
    /// when the header really shows one fewer (`heartLost`, from recordAnswer): never for Pro, a reinforcement round,
    /// or with no hearts left to lose.
    private func playVerdictEffects(heartLost: Bool) {
        let correct = lastAnswerCorrect
        SoundEffectsPlayer.shared.play(
            SoundEffectCues.verdict(correct: correct, losesHeart: !correct && heartLost),
            key: "verdict-\(attemptSeed)-\(idx)-\(isReinforcing ? "r" : "q")")
        SoundEffectsPlayer.shared.haptic(correct ? .right : .wrong)
    }

    /// Returns whether a heart was taken off the header (the heart sound plays only then).
    @discardableResult
    private func recordAnswer() -> Bool {
        // Reinforcement rounds are supplementary practice only -- they
        // never touch correctCount/answers/hearts/XP.
        guard !isReinforcing else { return false }
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
        var heartLost = false
        if correct {
            correctCount += 1
        } else {
            missed.append(LessonMissedItem(
                id: "\(questionID(question))-\(missed.count)", prompt: question.prompt, yours: picked ?? "",
                answer: AnswerVerdict.correctAnswer(for: question)))
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
            heartLost = spendHeartForWrongAnswer()
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
        return heartLost
    }

    /// Optimistically decrements the cached hearts count (so the tab-bar
    /// status header reflects the loss immediately, same intent as web's
    /// `loseHeartLocal()`) and fires the real `lose_heart` RPC in the
    /// background. Best-effort both ways: a missing access token or a
    /// failed request just means the next real sync corrects the count,
    /// same posture as this file's other fire-and-forget calls.
    /// Returns whether the cached count went down, which is what the header shows.
    private func spendHeartForWrongAnswer() -> Bool {
        // Alphonso Pro has unlimited hearts (the server skips Pro too).
        guard HeartsEconomy.wrongAnswerCostsHeart(unlimited: hectorAccess?.entitlementStore.isPro ?? false) else {
            return false
        }
        var heartLost = false
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
            heartLost = true
        }
        guard let accessToken = session.accessToken else { return heartLost }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        Task { _ = try? await client.loseHeart() }
        return heartLost
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
                   now: Date(),
                   unlimited: hectorAccess?.entitlementStore.isPro ?? false) {
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
        // The earlier best decides which right answers pay on a replay. Unreadable means unknown: no XP is promised.
        let openedFor = lesson.id
        do {
            let best = try await client.fetchLessonBest(lessonID: lesson.id, course: course.wireCode)
            guard lesson.id == openedFor else { return }
            previousBest = best.map(LessonPreviousBest.best) ?? .firstTry
        } catch {
            previousBest = .unknown
        }
    }

    private func block(refillAt: Date?) {
        heartsGateState = .blocked
        outOfHearts = OutOfHeartsModel(refillAt: refillAt)
    }

    private func finish() async {
        let now = Date().timeIntervalSince1970
        finishedElapsed = lessonTimer?.elapsed(now: now)
        lessonTimer?.pause(now: now)
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
            Analytics.track(.lessonCompleted, [
                "lesson_id": lesson.id, "level": "\(unit?.level ?? "")", "course": course.wireCode,
                "score_bucket": AnalyticsProperties.scoreBucket(percent: Double(completion.correct ?? 0) / Double(max(total, 1)) * 100),
            ])
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
            if (isLeaguePromotion || !completion.newlyUnlocked.isEmpty) && SoundEffectsPreference.isOn() {
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
            // A known earlier best caps it at what the replay rule pays (0 when this try is no better).
            optimisticXpEstimate: LessonXP.queuedEstimate(correct: correctCount, total: total, previousBest: previousBest),
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

/// One question in the unit's room: Alphonso's bubble with the prompt (and a play button), any picture, and the
/// answers in the lesson's style. Mechanics unchanged from before the redesign.
struct QuestionCard: View {
    /// The right answer's scroll target, so it can be brought into view above the verdict sheet.
    static let correctAnswerID = "lesson-correct-answer"

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
    let isReinforcing: Bool
    /// A phone under 700 pt tall: the smaller question type.
    let compact: Bool
    /// The screen that shows the card, for the AI consent policy (Review is its own surface).
    var surface: AIConsentSurface = .lesson
    @Binding var picked: String?
    /// Settled by the player before it scores -- see settledTranslationVerdict.
    @Binding var translationVerdict: TranslationVerdict?
    /// True once a word is placed in a sentence, so Alphonso starts listening before the sentence is complete.
    @Binding var reorderStarted: Bool

    // "reorder" questions accumulate tapped token *indices* (not values,
    // since a sentence can repeat a word) -- reset automatically per
    // question via this view's .id() modifier in quizBody, same reasoning
    // as the web's identical pattern in lesson.$id.tsx.
    @State private var orderPicks: [Int] = []

    private var bubbleLabel: String {
        if isReinforcing { return "Quick practice" }
        switch question {
        case .listening: return "Listening"
        case .speak: return "Speaking"
        case .translate: return "Write it yourself"
        default: return "Alphonso asks"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            bubble
            switch question {
            case .multipleChoice(let q):
                if let imageKey = q.imageKey, let image = vocabImages[imageKey] {
                    VocabImageView(image: image, cardHeight: 160, decorative: true)
                }
                choices(q.choices, rightChoice: q.choices.indices.contains(q.answer) ? q.choices[q.answer] : nil)
            case .listening(let q):
                // `answer` is the choice text, not an index.
                choices(q.choices, rightChoice: q.answer)
            case .fillInBlank(let q):
                LessonTextField(placeholder: "Type your answer", text: Binding(get: { picked ?? "" }, set: { picked = $0 }))
                    .disabled(checked)
                if !q.bank.isEmpty {
                    LessonFlowLayout {
                        ForEach(q.bank, id: \.self) { word in
                            LessonWordTile(word: word, picked: picked == word) { picked = word }
                                .disabled(checked)
                        }
                    }
                }
            case .reorder(let q):
                sentenceSlot(tokens: q.tokens)
                LessonFlowLayout {
                    ForEach(Array(q.tokens.enumerated()), id: \.offset) { i, token in
                        if !orderPicks.contains(i) {
                            LessonWordTile(word: token) { orderPicks.append(i) }
                                .disabled(checked)
                        }
                    }
                }
                .onChange(of: orderPicks) {
                    reorderStarted = !orderPicks.isEmpty
                    // `picked` stays nil (Check disabled, same generic gate as
                    // mc/fill) until every token has been placed -- matches the
                    // web's `orderPicks.length !== q.tokens.length` gate.
                    picked = orderPicks.count == q.tokens.count
                        ? orderPicks.map { q.tokens[$0] }.joined(separator: " ")
                        : nil
                }
            case .translate(let q):
                TranslateQuestionCard(
                    question: q, checked: checked, picked: $picked,
                    verdict: $translationVerdict, course: course, surface: surface, inStage: true)
            case .speak(let q):
                SpeakQuestionCard(
                    question: q, course: course, session: session,
                    isConnected: isConnected, checked: checked, picked: $picked, inStage: true)
            }
        }
    }

    private var bubble: some View {
        let onPlay: () -> Void
        let playLabel: String
        if case .listening(let q) = question {
            // A listening question's button plays what to listen to, in the course's language.
            onPlay = { speak(q.audioText, course: course) }
            playLabel = "Play audio"
        } else if case .multipleChoice(let q) = question, let audioText = q.audioText {
            onPlay = { speak(audioText, course: course) }
            playLabel = "Play audio"
        } else {
            // Any other question's button reads the question itself, which is written in English for every course.
            onPlay = { speak(question.prompt, course: .english) }
            playLabel = "Play the question"
        }
        return AlphonsoBubbleView(label: bubbleLabel, text: question.prompt, onPlay: onPlay, playLabel: playLabel, compact: compact)
    }

    private func choices(_ choices: [String], rightChoice: String?) -> some View {
        VStack(spacing: 6) {
            ForEach(Array(choices.enumerated()), id: \.offset) { index, choice in
                let isRight = choice == rightChoice
                LessonAnswerButton(
                    index: index, label: choice,
                    state: LessonAnswerState.of(checked: checked, isPicked: picked == choice, isRight: isRight)
                ) { picked = choice }
                .disabled(checked)
                .id(isRight ? Self.correctAnswerID : "choice-\(index)")
            }
        }
    }

    /// The sentence being built: a dashed well with the placed words, solid robe blue; tap one to take it back.
    private func sentenceSlot(tokens: [String]) -> some View {
        LessonSentenceSlot(isEmpty: orderPicks.isEmpty) {
            ForEach(Array(orderPicks.enumerated()), id: \.offset) { position, tokenIdx in
                LessonWordTile(word: tokens[tokenIdx], placed: true) { orderPicks.remove(at: position) }
                    .disabled(checked)
            }
        }
        .id(Self.correctAnswerID)
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
    let onPracticeWithHector: (() -> Void)?

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
            if let onPracticeWithHector {
                Button("Practice with Hector", action: onPracticeWithHector)
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

/// What the finish screen's "Practice with Hector" button needs to open Hector or the paywall.
struct HectorAccess {
    let entitlementStore: EntitlementStore
    let activeCourse: ActiveCourseModel
    let conversationStore: ConversationStore
}
