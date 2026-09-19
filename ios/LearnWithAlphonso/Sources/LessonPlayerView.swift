import SwiftUI
import UIKit
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
    @State private var errorMessage: String?

    private var total: Int { lesson.questions.count }
    private var vocab: [VocabItem] { deriveVocab(lesson: lesson) }

    var body: some View {
        Group {
            if let result {
                FinishView(result: result, correct: correctCount, total: total, contentStore: contentStore, isLeaguePromotion: isLeaguePromotion)
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
                    OverviewScreen(lesson: lesson, wordCount: vocab.count, questionCount: total) {
                        phase = vocab.isEmpty ? .quiz : .vocab
                    }
                case .vocab:
                    VocabScreen(lesson: lesson, items: vocab) { phase = .quiz }
                case .quiz:
                    quizBody
                }
            }
        }
        .navigationTitle(lesson.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var quizBody: some View {
        VStack(alignment: .leading, spacing: 16) {
            ProgressView(value: Double(idx), total: Double(total))
            Text("\(idx + 1)/\(total)")
                .font(.caption)
                .foregroundStyle(.secondary)

            QuestionCard(question: lesson.questions[idx], checked: checked, picked: $picked)

            Spacer()

            if isSubmitting {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else if !checked {
                Button("Check") { checked = true; recordAnswer() }
                    .buttonStyle(.borderedProminent)
                    .disabled(picked == nil)
                    .frame(maxWidth: .infinity)
            } else {
                Button(idx < total - 1 ? "Continue" : "Finish") {
                    if idx < total - 1 {
                        idx += 1
                        picked = nil
                        checked = false
                    } else {
                        Task { await finish() }
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
            }
        }
        .padding()
    }

    private func recordAnswer() {
        let question = lesson.questions[idx]
        if isAnswerCorrect(question, picked: picked) {
            correctCount += 1
        } else {
            missedQuestionIDs.append(questionID(question))
        }
    }

    private func finish() async {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            guard let accessToken = session.accessToken else {
                errorMessage = "You've been signed out. Please sign in again."
                return
            }
            let client = ProgressSyncClient(
                supabaseURL: AppConfig.supabaseURL,
                anonKey: AppConfig.supabasePublishableKey,
                accessToken: accessToken
            )
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
            await scheduleStreakReminderAfterCompletion(lastActiveDate: completion.progress.lastActiveDate)
            if isLeaguePromotion || !completion.newlyUnlocked.isEmpty {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        } catch {
            errorMessage = "Check your connection and try again."
        }
    }

    /// Asks for notification permission at the "first engaged moment" (a
    /// completed lesson), not cold app launch -- only when authorization is
    /// still undetermined, so a prior decline is never re-prompted. Then
    /// reschedules today's streak reminder either way, since completing a
    /// lesson changes whether one is still needed today.
    private func scheduleStreakReminderAfterCompletion(lastActiveDate: String?) async {
        if await notificationScheduler.currentAuthorizationStatus() == .notDetermined {
            _ = await notificationScheduler.requestAuthorization()
        }
        notificationScheduler.scheduleStreakReminder(lastActiveDate: lastActiveDate)
    }
}

private func isAnswerCorrect(_ question: Question, picked: String?) -> Bool {
    guard let picked else { return false }
    switch question {
    case .multipleChoice(let q):
        return q.choices[q.answer] == picked
    case .fillInBlank(let q):
        return picked.trimmingCharacters(in: .whitespaces).lowercased()
            == q.answer.trimmingCharacters(in: .whitespaces).lowercased()
    }
}

private func questionID(_ question: Question) -> String {
    switch question {
    case .multipleChoice(let q): return q.id
    case .fillInBlank(let q): return q.id
    }
}

private extension Course {
    var code: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        }
    }
}

private struct QuestionCard: View {
    let question: Question
    let checked: Bool
    @Binding var picked: String?

    var body: some View {
        switch question {
        case .multipleChoice(let q):
            VStack(alignment: .leading, spacing: 12) {
                Text(q.prompt).font(.title3.weight(.semibold))
                ForEach(q.choices, id: \.self) { choice in
                    choiceButton(choice, isCorrectChoice: q.choices[q.answer] == choice)
                }
                if checked {
                    Text(q.explanation).font(.footnote).foregroundStyle(.secondary)
                }
            }
        case .fillInBlank(let q):
            VStack(alignment: .leading, spacing: 12) {
                Text(q.prompt).font(.title3.weight(.semibold))
                TextField("Type your answer", text: Binding(get: { picked ?? "" }, set: { picked = $0 }))
                    .textFieldStyle(.roundedBorder)
                    .disabled(checked)
                if !q.bank.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(q.bank, id: \.self) { word in
                                Button(word) { picked = word }
                                    .buttonStyle(.bordered)
                                    .disabled(checked)
                            }
                        }
                    }
                }
                if checked {
                    Text(q.explanation).font(.footnote).foregroundStyle(.secondary)
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
                Spacer()
                if checked && isCorrectChoice {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                } else if checked && picked == choice {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                }
            }
            .padding()
            .background(picked == choice ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(checked)
        .foregroundStyle(.primary)
    }
}

private struct OverviewScreen: View {
    let lesson: Lesson
    let wordCount: Int
    let questionCount: Int
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(lesson.subtitle)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
            Text(lesson.title)
                .font(.title.weight(.bold))

            VStack(alignment: .leading, spacing: 12) {
                overviewStep(number: 1, label: "Vocabulary", detail: "\(wordCount) word\(wordCount == 1 ? "" : "s") with examples")
                overviewStep(number: 2, label: "Practice", detail: "\(questionCount) questions")
                overviewStep(number: 3, label: "Review", detail: "Anything you miss comes back later")
            }

            Spacer()

            Button("Begin lesson", action: onStart)
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
        }
        .padding()
    }

    private func overviewStep(number: Int, label: String, detail: String) -> some View {
        HStack(spacing: 12) {
            Text("\(number)")
                .font(.caption.weight(.semibold))
                .frame(width: 28, height: 28)
                .background(Color(.secondarySystemBackground))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private struct VocabScreen: View {
    let lesson: Lesson
    let items: [VocabItem]
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Vocabulary · \(lesson.subtitle)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
            Text(lesson.title)
                .font(.title2.weight(.bold))
            Text("\(items.count) word\(items.count == 1 ? "" : "s") to learn before you practise.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(items, id: \.term) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.term).font(.headline)
                            Text(item.meaning).font(.caption).foregroundStyle(.secondary)
                            Text(item.example)
                                .font(.caption.italic())
                                .padding(.top, 2)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }

            Button("Start practice", action: onStart)
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
        }
        .padding()
    }
}

private struct FinishView: View {
    let result: LessonCompletionResult
    let correct: Int
    let total: Int
    let contentStore: ContentStore
    let isLeaguePromotion: Bool

    @State private var showPromotionOverlay = false

    private var unlockedAchievements: [Achievement] {
        result.newlyUnlocked.compactMap { id in contentStore.achievements.first { $0.id == id } }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.green)
                Text("Lesson complete")
                    .font(.title2.weight(.semibold))
                Text("+\(result.xpGain) XP")
                    .font(.title.weight(.bold))
                    .foregroundStyle(.green)
                Text("\(correct)/\(total) correct")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let bonus = result.heartsBonus {
                    Text(bonus == "streak" ? "Streak milestone: hearts fully refilled" : "Perfect lesson: +1 heart")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.pink)
                }
                if !unlockedAchievements.isEmpty {
                    VStack(spacing: 12) {
                        Text("Achievement\(unlockedAchievements.count == 1 ? "" : "s") unlocked")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.secondary)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 12) {
                            ForEach(Array(unlockedAchievements.enumerated()), id: \.element.id) { index, achievement in
                                AchievementBadgeView(achievement: achievement, unlocked: true)
                                    .springEntrance(delay: Double(index) * 0.15)
                            }
                        }
                    }
                    .padding(.top, 8)
                }
            }
            .padding()
        }
        .onAppear { showPromotionOverlay = isLeaguePromotion }
        .fullScreenCover(isPresented: $showPromotionOverlay) {
            LeaguePromotionOverlay(tier: result.progress.leagueTier) {
                showPromotionOverlay = false
            }
        }
    }
}

/// Scale+opacity entrance driven by a spring, triggered on first appear --
/// SwiftUI's equivalent of the web's Framer Motion spring entrance for
/// celebration moments (lesson.$id.tsx's FinishScreen). Shared by the
/// achievement-unlock cards (staggered via `delay`) and the league-
/// promotion overlay's badge (its own, punchier spring tuning) below, so
/// the appear-state/onAppear/withAnimation boilerplate exists once.
private struct SpringEntrance: ViewModifier {
    var response: Double = 0.5
    var dampingFraction: Double = 0.65
    var delay: Double = 0
    var minScale: Double = 0.6

    @State private var appeared = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(appeared ? 1 : minScale)
            .opacity(appeared ? 1 : 0)
            .onAppear {
                withAnimation(.spring(response: response, dampingFraction: dampingFraction).delay(delay)) {
                    appeared = true
                }
            }
    }
}

private extension View {
    func springEntrance(response: Double = 0.5, dampingFraction: Double = 0.65, delay: Double = 0, minScale: Double = 0.6) -> some View {
        modifier(SpringEntrance(response: response, dampingFraction: dampingFraction, delay: delay, minScale: minScale))
    }
}

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
                    .font(.largeTitle.weight(.bold))
                Text("You've been promoted to \(LeagueTierPalette.label(for: tier))")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Spacer()
                Button("Continue", action: onContinue)
                    .buttonStyle(.borderedProminent)
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
