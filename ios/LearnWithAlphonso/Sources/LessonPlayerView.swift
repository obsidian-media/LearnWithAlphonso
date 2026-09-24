import SwiftUI
import UIKit
import AVFoundation
import LearnWithAlphonsoKit

/// Lesson player: overview -> vocab (when the lesson has any derivable
/// vocab -- see VocabDerivation.swift) -> quiz -> finish, matching the web
/// app's lesson.$id.tsx phase flow. Scoring uses
/// ProgressMath.deriveLessonCompletion's same logic the server re-derives
/// independently -- this client-side pass is only for the optimistic
/// "correct/total" the finish screen shows, never trusted as the source of
/// truth for XP.
struct LessonPlayerView: View {
    let lesson: Lesson
    let course: Course
    let session: Session
    let notificationScheduler: NotificationScheduler
    let contentStore: ContentStore
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore

    private enum Phase { case overview, vocab, quiz }

    @State private var phase: Phase = .overview
    @State private var idx = 0
    @State private var correctCount = 0
    @State private var missedQuestionIDs: [String] = []
    @State private var picked: String?
    @State private var checked = false
    @State private var isSubmitting = false
    @State private var result: LessonCompletionResult?
    @State private var isLeaguePromotion = false
    @State private var queuedOffline: PendingLessonCompletion?
    @State private var errorMessage: String?
    // V3 pkg 4b: in-lesson reinforcement, staged in two steps -- see
    // pickReinforcementQuestion's doc comment (LessonReinforcement.swift)
    // and lesson.$id.tsx's identical web-side pattern for why. Never
    // affects correctCount/missedQuestionIDs/hearts/XP.
    @State private var pendingReinforcement: Question?
    @State private var activeReinforcement: Question?
    // Fresh per-mount seed for reinforcement-pick determinism across a
    // single attempt without repeating the exact same pick on identical
    // misses -- mirrors lesson.$id.tsx's attemptSeed.
    private let attemptSeed = UUID().uuidString

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

    var body: some View {
        Group {
            if let result {
                FinishView(result: result, correct: correctCount, total: total, contentStore: contentStore, isLeaguePromotion: isLeaguePromotion, lessonID: lesson.id, course: course, session: session)
            } else if let queuedOffline {
                OfflineFinishView(pending: queuedOffline, correct: correctCount, total: total)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Couldn't save your progress", systemImage: "wifi.slash")
                } description: {
                    Text(errorMessage)
                }
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
    }

    private var quizBody: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            AlphonsoProgressBar(progress: total == 0 ? 0 : Double(idx) / Double(total))
            Text(isReinforcing ? "Quick practice" : "\(idx + 1)/\(total)")
                .font(AlphonsoFont.sans(13, weight: .medium))
                .foregroundStyle(AlphonsoColor.inkSoft)

            // .id() forces a fresh QuestionCard (and its reorder @State)
            // per question -- without it, SwiftUI would keep reusing the
            // same view identity across questions and a reorder question's
            // tapped-token state would leak into the next question.
            QuestionCard(question: currentQuestion, course: course, vocabImages: contentStore.vocabImages, session: session, isConnected: networkMonitor.isConnected, checked: checked, picked: $picked)
                .id(questionID(currentQuestion))

            Spacer()

            if isSubmitting {
                ProgressView().tint(AlphonsoColor.moss).frame(maxWidth: .infinity)
            } else if !checked {
                Button("Check") { checked = true; recordAnswer() }
                    .buttonStyle(.alphonsoPrimary)
                    .disabled(picked == nil)
            } else {
                Button(isReinforcing || pendingReinforcement != nil || idx < total - 1 ? "Continue" : "Finish") {
                    if let pendingReinforcement {
                        activeReinforcement = pendingReinforcement
                        self.pendingReinforcement = nil
                        picked = nil
                        checked = false
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
                .buttonStyle(.alphonsoPrimary)
            }
        }
        .padding()
        .background(AlphonsoColor.surface)
    }

    private func recordAnswer() {
        // Reinforcement rounds are supplementary practice only -- they
        // never touch correctCount/missedQuestionIDs/hearts/XP.
        guard !isReinforcing else { return }
        let question = lesson.questions[idx]
        if isAnswerCorrect(question, picked: picked) {
            correctCount += 1
        } else {
            missedQuestionIDs.append(questionID(question))
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

    private func finish() async {
        isSubmitting = true
        defer { isSubmitting = false }
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }

        // Never attempt startLessonSession/completeLesson while offline --
        // both calls are deferred to sync time, called fresh, exactly like
        // this online path. This sidesteps any concern about a pre-fetched
        // session token going stale during a long offline period
        // (start-lesson-session's MAX_AGE_MS is 3 hours): there's no
        // pre-fetched token to go stale, because none is fetched until
        // sync. See docs/v2-kickoffs/01-offline-first.md.
        guard networkMonitor.isConnected else {
            queueOffline()
            return
        }

        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL,
            anonKey: AppConfig.supabasePublishableKey,
            accessToken: accessToken
        )
        do {
            let sessionToken = try await client.startLessonSession(lessonID: lesson.id, course: course.code)
            let completion = try await client.completeLesson(
                lessonID: lesson.id,
                total: total,
                missedQuestionIDs: missedQuestionIDs,
                course: course.code,
                sessionToken: sessionToken
            )
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
        } catch {
            // The monitor thought we were online but the call still failed
            // (a monitor can be momentarily wrong) -- queue rather than
            // lose the attempt, same as the explicitly-offline path above.
            queueOffline()
        }
    }

    /// Queues this attempt for a later sync instead of losing it -- the
    /// worst possible moment for a network failure is after the user just
    /// played an entire lesson. `optimisticXpEstimate` is a naive guess
    /// (see PendingLessonCompletion's doc comment); the real XP is shown
    /// once sync confirms it.
    private func queueOffline() {
        let correct = total - missedQuestionIDs.count
        let pending = PendingLessonCompletion(
            lessonID: lesson.id,
            total: total,
            missedQuestionIDs: missedQuestionIDs,
            course: course.code,
            queuedAt: Date(),
            optimisticXpEstimate: computeXpGain(correct: correct, total: total)
        )
        syncQueueStore.appendLessonCompletion(pending)
        queuedOffline = pending
    }

    /// Asks for notification permission at the "first engaged moment" (a
    /// completed lesson), not cold app launch -- only when authorization is
    /// still undetermined, so a prior decline is never re-prompted. Then
    /// reschedules today's streak reminder either way, since completing a
    /// lesson changes whether one is still needed today.
    private func scheduleStreakReminderAfterCompletion(lastActiveDate: String?) async {
        if await notificationScheduler.currentAuthorizationStatus() == .notDetermined {
            let granted = await notificationScheduler.requestAuthorization()
            // V4 candidate #2 (real push) -- iOS has exactly one system
            // notification-permission prompt for both local and remote
            // notifications, so this reuses NotificationScheduler's
            // existing prompt rather than adding a second one. Only
            // registers once permission is actually granted; RootView's
            // own registerIfAuthorized() (on every launch/foreground)
            // covers the "granted in a prior session" and token-refresh
            // cases, so this call is purely about not waiting for the
            // *next* app launch after the very first grant.
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
        notificationScheduler.scheduleStreakReminder(lastActiveDate: lastActiveDate)
    }
}

private func questionID(_ question: Question) -> String {
    switch question {
    case .multipleChoice(let q): return q.id
    case .fillInBlank(let q): return q.id
    case .reorder(let q): return q.id
    case .listening(let q): return q.id
    case .speak(let q): return q.id
    }
}

/// V3 pkg 4a: on-device TTS for "listening comprehension" format questions
/// (an mc question with `audioText` set) -- same reasoning as the web's
/// speech.ts (a free platform capability, not a new vendor call).
private func speak(_ text: String, languageCode: String) {
    questionCardSpeechSynthesizer.stopSpeaking(at: .immediate)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: languageCode)
    questionCardSpeechSynthesizer.speak(utterance)
}

private extension Course {
    var code: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        }
    }

    var speechLanguageCode: String {
        switch self {
        case .english: return "en-US"
        case .french: return "fr-FR"
        case .spanish: return "es-ES"
        }
    }
}

private let questionCardSpeechSynthesizer = AVSpeechSynthesizer()

private struct QuestionCard: View {
    let question: Question
    let course: Course
    let vocabImages: [String: VocabImageRef]
    // A speaking question needs a token to transcribe with, and needs to know
    // whether transcription can happen at all -- see SpeakQuestionCard.
    let session: Session
    let isConnected: Bool
    let checked: Bool
    @Binding var picked: String?

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
                    VocabImageView(image: image, cardHeight: 160)
                }
                if let audioText = q.audioText {
                    Button {
                        speak(audioText, languageCode: course.speechLanguageCode)
                    } label: {
                        Label("Play audio", systemImage: "speaker.wave.2.fill")
                    }
                    .buttonStyle(.alphonsoSecondary(fullWidth: false))
                }
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                ForEach(q.choices, id: \.self) { choice in
                    choiceButton(choice, isCorrectChoice: q.choices[q.answer] == choice)
                }
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation)
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
                                    .buttonStyle(.alphonsoSecondary(fullWidth: false))
                                    .disabled(checked)
                            }
                        }
                    }
                }
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation)
                }
            }
        case .reorder(let q):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                assembledArea(tokens: q.tokens)
                tokenPool(tokens: q.tokens)
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation)
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
                    speak(q.audioText, languageCode: course.speechLanguageCode)
                } label: {
                    Label("Play audio", systemImage: "speaker.wave.2.fill")
                }
                .buttonStyle(.alphonsoSecondary(fullWidth: false))
                Text(q.prompt).font(AlphonsoFont.display(22, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                ForEach(q.choices, id: \.self) { choice in
                    // `answer` is the choice text, not an index.
                    choiceButton(choice, isCorrectChoice: q.answer == choice)
                }
                if checked {
                    ExplanationView(question: question, picked: picked, explanation: q.explanation)
                }
            }
            case .speak(let q):
                SpeakQuestionCard(
                    question: q, course: course, session: session,
                    isConnected: isConnected, checked: checked, picked: $picked)
            }
        }
        // Drives ExplanationView's AlphonsoTipCard .transition -- without
        // an explicit animation tied to `checked`, the card would just pop
        // in instantly instead of sliding in from the trailing edge.
        .animation(.spring(response: 0.5, dampingFraction: 0.75), value: checked)
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
                            .buttonStyle(.alphonsoSecondary(fullWidth: false))
                            .disabled(checked)
                    }
                }
            }
        }
    }

    private func choiceButton(_ choice: String, isCorrectChoice: Bool) -> some View {
        Button {
            picked = choice
        } label: {
            HStack {
                Text(choice)
                    .font(AlphonsoFont.sans(16))
                Spacer()
                if checked && isCorrectChoice {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(AlphonsoColor.moss)
                } else if checked && picked == choice {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(AlphonsoColor.destructive)
                }
            }
            .padding(AlphonsoSpacing.sm + 4)
            .background(
                picked == choice ? AlphonsoColor.moss.opacity(0.14) : AlphonsoColor.parchment,
                in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    .strokeBorder(picked == choice ? AlphonsoColor.moss : AlphonsoColor.hairline, lineWidth: picked == choice ? 1.5 : 1)
            )
        }
        .disabled(checked)
        .foregroundStyle(AlphonsoColor.ink)
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
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            Text(lesson.subtitle.uppercased())
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
            Text(lesson.title)
                .font(AlphonsoFont.display(28, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)

            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm + 4) {
                overviewStep(number: 1, label: "Vocabulary", detail: "\(wordCount) word\(wordCount == 1 ? "" : "s") with examples")
                if !previewImages.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(previewImages, id: \.url) { image in
                            VocabImageView(image: image, thumbnailSize: 44)
                        }
                    }
                    .padding(.leading, 40)
                }
                overviewStep(number: 2, label: "Practice", detail: "\(questionCount) questions")
                overviewStep(number: 3, label: "Review", detail: "Anything you miss comes back later")
            }

            Spacer()

            Button("Begin lesson", action: onStart)
                .buttonStyle(.alphonsoPrimary)
        }
        .padding()
        .background(AlphonsoColor.surface)
    }

    private func overviewStep(number: Int, label: String, detail: String) -> some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            Text("\(number)")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.surface)
                .frame(width: 28, height: 28)
                .background(AlphonsoColor.moss)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(AlphonsoFont.sans(15, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(detail)
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
        }
    }
}

private struct VocabScreen: View {
    let lesson: Lesson
    let items: [VocabItem]
    let course: Course
    let onStart: () -> Void

    var body: some View {
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

            ScrollView {
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
                                    speak(item.term, languageCode: course.speechLanguageCode)
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

            Button("Start practice", action: onStart)
                .buttonStyle(.alphonsoPrimary)
        }
        .padding()
        .background(AlphonsoColor.surface)
    }
}

/// Mirrors the web's `<img src=... onError=...>` handling: a loading
/// spinner while the Pexels CDN fetch is in flight, and -- on failure --
/// a plain neutral panel rather than a broken-image icon. Shared by
/// VocabScreen's full-width card image and OverviewScreen's small preview
/// thumbnails (pass `thumbnailSize` for the latter) so the AsyncImage
/// phase-handling exists once rather than twice. No caching beyond what
/// URLSession/AsyncImage already do by default; see
/// docs/v2-kickoffs/07-vocab-images-and-content-polish.md's "Deepened
/// feature 1" for why that's an accepted tradeoff for V2, not an oversight.
/// Not private (V3 pkg 4a): ReviewQueueView's image-matching mc rendering
/// reuses this rather than duplicating the AsyncImage phase-handling.
struct VocabImageView: View {
    let image: VocabImageRef
    /// A fixed square size for a small teaser thumbnail, or nil for a
    /// full-width card image at `cardHeight`.
    var thumbnailSize: CGFloat?
    var cardHeight: CGFloat = 120

    var body: some View {
        AsyncImage(url: URL(string: image.url)) { phase in
            switch phase {
            case .success(let loadedImage):
                loadedImage.resizable().aspectRatio(contentMode: .fill)
            case .empty:
                ProgressView().tint(AlphonsoColor.moss)
            default:
                AlphonsoColor.parchment
            }
        }
        .frame(width: thumbnailSize, height: thumbnailSize ?? cardHeight)
        .frame(maxWidth: thumbnailSize == nil ? .infinity : nil)
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous))
        .clipped()
        .accessibilityLabel(image.alt)
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

    @State private var showPromotionOverlay = false

    private var unlockedAchievements: [Achievement] {
        result.newlyUnlocked.compactMap { id in contentStore.achievements.first { $0.id == id } }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoSpacing.md) {
                Text("Lesson complete")
                    .font(AlphonsoFont.display(21, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)

                // The exact "no imagery, just text/icon" pattern the
                // spec's Background section calls out on PaywallView
                // shows up here too -- same fix.
                AlphonsoMascotBanner(mascot: .alphonso, message: "Nice work!")
                Text("+\(result.xpGain) XP")
                    .font(AlphonsoFont.display(32, weight: .bold))
                    .foregroundStyle(AlphonsoColor.moss)
                Text("\(correct)/\(total) correct")
                    .font(AlphonsoFont.sans(14))
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

                GeneratedPracticeSection(lessonID: lessonID, course: course, session: session)
            }
            .padding()
        }
        .background(AlphonsoColor.surface)
        .onAppear { showPromotionOverlay = isLeaguePromotion }
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

    private enum Status: Equatable { case idle, loading, ready, empty, error }

    @State private var status: Status = .idle
    @State private var questions: [GeneratedPracticeQuestion] = []
    @State private var idx = 0
    @State private var picked: String?
    @State private var checked = false

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

                if status == .empty {
                    Text("Couldn't generate practice for this lesson right now.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                } else if status == .error {
                    Text("Something went wrong -- try again.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
            }
            .padding(.top, 8)
        case .ready:
            if idx >= questions.count {
                Text("Nice work -- that's all the extra practice for this lesson.")
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
            ForEach(q.choices, id: \.self) { choice in
                Button {
                    picked = choice
                } label: {
                    HStack {
                        Text(choice).font(AlphonsoFont.sans(15))
                        Spacer()
                        if checked && q.choices[q.answerIndex] == choice {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(AlphonsoColor.moss)
                        } else if checked && picked == choice {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(AlphonsoColor.destructive)
                        }
                    }
                    .padding(AlphonsoSpacing.sm + 4)
                    .background(
                        picked == choice ? AlphonsoColor.moss.opacity(0.14) : AlphonsoColor.parchment,
                        in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    )
                }
                .disabled(checked)
                .foregroundStyle(AlphonsoColor.ink)
            }
            if checked {
                if picked == q.choices[q.answerIndex] {
                    Text(q.explanation).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                } else {
                    AlphonsoTipCard(explanation: q.explanation)
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
        .animation(.spring(response: 0.5, dampingFraction: 0.75), value: checked)
    }

    private func generate() async {
        status = .loading
        guard let accessToken = session.accessToken else {
            status = .error
            return
        }
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
        do {
            let result = try await client.generatePractice(lessonID: lessonID, course: course.code)
            if result.isEmpty {
                status = .empty
                return
            }
            questions = result
            idx = 0
            picked = nil
            checked = false
            status = .ready
        } catch {
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

    var body: some View {
        VStack(spacing: AlphonsoSpacing.md) {
            Image(systemName: "icloud.and.arrow.up.fill")
                .font(.system(size: 56))
                .foregroundStyle(AlphonsoColor.ember)
            Text("Saved -- will sync when you're back online")
                .font(AlphonsoFont.display(19, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)
            Text("~+\(pending.optimisticXpEstimate) XP (estimated)")
                .font(AlphonsoFont.display(24, weight: .bold))
                .foregroundStyle(AlphonsoColor.ember)
            Text("\(correct)/\(total) correct")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
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
        tier.prefix(1).uppercased() + tier.dropFirst()
    }
}
