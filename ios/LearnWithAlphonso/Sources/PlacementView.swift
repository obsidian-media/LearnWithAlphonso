import SwiftUI
import AVFoundation
import LearnWithAlphonsoKit

/// The adaptive CEFR placement exam -- mirrors the web app's
/// placement.tsx exactly (up to 15 questions, 3 per band, adaptively
/// skipping or stopping bands based on how the learner is doing; see
/// PlacementLogic.swift for the ported scoring/sequencing functions this
/// view drives).
///
/// **Why this exists.** Placement was a web-only feature until now: the
/// web app redirects every new signup straight to it and keeps a
/// persistent "Take the placement test" entry point on the Learn tab
/// (learn.tsx) for anyone who skipped or never saw it. Native iOS had
/// neither -- a new iOS user was silently assigned the CEFR default
/// ('A1') and never offered the real test, which is the wrong starting
/// level for most people. See RootView.swift (the post-sign-in gate) and
/// LessonBrowserView.swift (the persistent banner) for where this gets
/// presented from.
///
/// Not a hard gate on either presentation: the exit button below always
/// works, exactly like the web version's own placement route -- a
/// reviewer, or anyone else, can bail straight to the app without taking
/// it. `docs/BACKLOG.md`'s own "second-order implication" note is why
/// there's a persistent Learn-tab entry point too, not just a one-time
/// post-signup redirect: the real signal this is gated on is "has this
/// course's placement actually been taken" (ProgressSyncClient.
/// fetchPlacementTakenAt), which is durable and self-healing, not a
/// transient "just signed up" event that a new user could still miss.
struct PlacementView: View {
    let contentStore: ContentStore
    let session: Session
    let course: Course
    /// Called once the learner reaches "Start learning" on the results
    /// screen, or taps the exit (✕) button -- lets the presenter (a
    /// fullScreenCover from RootView, or a push from LessonBrowserView)
    /// dismiss itself without this view needing to know which.
    var onFinished: () -> Void = {}

    @State private var attempt: PlacementAttempt
    @State private var step = 0
    /// The submitted TEXT, not an option index -- a listening question
    /// answers with the choice's text and a translation with a whole
    /// sentence, and isPlacementAnswerCorrect grades all three the same
    /// way only because of that. Matches placement.tsx's own `picked`.
    @State private var picked: String?
    /// True only while a translation's second opinion is in flight.
    @State private var checking = false
    @State private var answers: [Bool] = []
    @State private var done = false
    @State private var skippedLevels: [String] = []
    @State private var correctByLevel: [String: Int] = [:]
    /// Which attempt is live -- guards the one place this view awaits
    /// (a translation's second opinion) against a reset that happened
    /// while it was in flight. Same reasoning, same shape, as
    /// placement.tsx's own `attemptRef`.
    @State private var attemptToken = UUID()

    init(contentStore: ContentStore, session: Session, course: Course, onFinished: @escaping () -> Void = {}) {
        self.contentStore = contentStore
        self.session = session
        self.course = course
        self.onFinished = onFinished
        _attempt = State(initialValue: PlacementAttempt(pool: contentStore.placementPool(for: course)))
    }

    private var currentQuestion: PlacementQuestion? {
        attempt.shown.indices.contains(step) ? attempt.shown[step] : nil
    }

    private var total: Int { attempt.shown.count }

    private var noBandsAhead: Bool {
        placementOrder[(attempt.bandIdx + 1)...].allSatisfy { (attempt.bandPool[$0]?.isEmpty ?? true) }
    }

    private var isFinalQuestion: Bool {
        step + 1 == total && noBandsAhead
    }

    var body: some View {
        NavigationStack {
            Group {
                if done {
                    resultsBody
                } else if let q = currentQuestion {
                    questionBody(q)
                } else {
                    // Defensive only, mirrors placement.tsx's own "no
                    // questions available" fallback -- every shipped
                    // course has content in every band, so this isn't
                    // expected to trigger.
                    VStack(spacing: AlphonsoSpacing.md) {
                        Text("No placement questions are available for this course right now.")
                            .font(AlphonsoFont.sans(14))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                            .multilineTextAlignment(.center)
                        Button("Back to Learn") { onFinished() }
                            .buttonStyle(.alphonsoPrimary)
                    }
                    .padding()
                }
            }
            .background(AlphonsoColor.surface)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !done {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            onFinished()
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel("Exit placement test")
                    }
                }
            }
        }
        .tint(AlphonsoColor.moss)
    }

    private func questionBody(_ q: PlacementQuestion) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: AlphonsoSpacing.sm) {
                ProgressView(value: total > 0 ? Double(step) / Double(total) : 0)
                    .tint(AlphonsoColor.moss)
                Text("\(step + 1) of \(total)")
                    .font(AlphonsoFont.sans(11, weight: .medium))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
            .padding()

            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                    Text("Placement test")
                        .font(AlphonsoFont.sans(10, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)

                    questionPromptAndChoices(q)
                }
                .padding()
            }

            VStack(spacing: AlphonsoSpacing.sm) {
                Button {
                    Task { await submit() }
                } label: {
                    if checking {
                        ProgressView().tint(AlphonsoColor.surface)
                    } else {
                        Text(isFinalQuestion ? "See my level" : "Continue")
                    }
                }
                .buttonStyle(.alphonsoPrimary)
                .disabled(checking || (picked?.trimmingCharacters(in: .whitespaces).isEmpty ?? true))

                Text("No hearts lost — this just finds your starting point.")
                    .font(AlphonsoFont.sans(11))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
            .padding()
        }
    }

    @ViewBuilder
    private func questionPromptAndChoices(_ q: PlacementQuestion) -> some View {
        switch q {
        case .multipleChoice(let mc):
            Text(mc.prompt)
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            choiceButtons(mc.choices)
        case .listening(let listening):
            Text("Listening")
                .font(AlphonsoFont.sans(10, weight: .semiBold))
                .tracking(0.3)
                .foregroundStyle(AlphonsoColor.inkSoft)
            Button {
                speak(listening.audioText)
            } label: {
                Label("Play audio", systemImage: "speaker.wave.2.fill")
            }
            .buttonStyle(.bordered)
            Text(listening.prompt)
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            choiceButtons(listening.choices)
        case .translate(let translate):
            Text(translate.prompt)
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            TextField(
                "Write your answer",
                text: Binding(get: { picked ?? "" }, set: { picked = $0 }),
                axis: .vertical
            )
            .lineLimit(3...6)
            .textFieldStyle(.plain)
            .padding(AlphonsoSpacing.sm + 2)
            .alphonsoInputBackground()
        }
    }

    // Same selected/unselected styling as LessonPlayerView's own
    // choiceButton -- duplicated rather than shared, matching this
    // codebase's established per-screen convention -- minus the
    // checked/isCorrectChoice checkmark, since placement never reveals
    // correctness mid-exam (only the final results screen does).
    private func choiceButtons(_ choices: [String]) -> some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            ForEach(choices, id: \.self) { choice in
                Button {
                    picked = choice
                } label: {
                    Text(choice)
                        .font(AlphonsoFont.sans(16))
                        .foregroundStyle(AlphonsoColor.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(AlphonsoSpacing.sm + 4)
                        .background(
                            picked == choice ? AlphonsoColor.moss.opacity(0.14) : AlphonsoColor.parchment,
                            in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                                .strokeBorder(
                                    picked == choice ? AlphonsoColor.moss : AlphonsoColor.hairline,
                                    lineWidth: picked == choice ? 1.5 : 1
                                )
                        )
                }
            }
        }
    }

    private var resultsBody: some View {
        let level = scorePlacement(correctByLevel: correctByLevel).level
        let meta = levelMeta[level]
        let correct = answers.filter { $0 }.count
        return VStack(spacing: AlphonsoSpacing.md) {
            Image(systemName: "star.fill")
                .font(.system(size: 40))
                .foregroundStyle(AlphonsoColor.surface)
                .frame(width: 64, height: 64)
                .background(AlphonsoColor.moss, in: Circle())
            Text("Your level")
                .font(AlphonsoFont.sans(10, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
            Text(level)
                .font(AlphonsoFont.display(40, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            if let meta {
                Text(meta.name)
                    .font(AlphonsoFont.display(18, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(meta.blurb)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
            }
            Text("\(correct) of \(total) correct")
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
            if !skippedLevels.isEmpty {
                Text("Fast-tracked past \(skippedLevels.joined(separator: ", ")) after strong answers.")
                    .font(AlphonsoFont.sans(11))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
            }
            Button("Start learning at \(level)") { onFinished() }
                .buttonStyle(.alphonsoPrimary)
            Button("Retake the test") { restart() }
                .font(AlphonsoFont.sans(12, weight: .medium))
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func restart() {
        attemptToken = UUID()
        correctByLevel = [:]
        attempt = PlacementAttempt(pool: contentStore.placementPool(for: course))
        answers = []
        step = 0
        picked = nil
        done = false
        skippedLevels = []
    }

    /// Mirrors placement.tsx's `submit()` exactly -- see that function's
    /// own comments for the band-complete/adaptive-advance branches this
    /// ports one-for-one.
    private func submit() async {
        guard let picked, let q = currentQuestion else { return }
        let token = attemptToken
        var correct = isPlacementAnswerCorrect(q, answer: picked)
        if !correct, case .translate(let t) = q {
            checking = true
            guard let accessToken = session.accessToken else {
                checking = false
                return
            }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let verdict = await client.gradeTranslation(placementId: t.id, submission: picked, course: course.code)
            // Nothing below this line may run for an attempt that's gone --
            // restart() or a reset makes global writes (correctByLevel,
            // savePlacementResult) that must not land against a stale
            // closure's session.
            guard attemptToken == token else { return }
            checking = false
            if verdict?.correct == true { correct = true }
        }
        let next = answers + [correct]
        self.picked = nil
        answers = next

        let bandComplete = step + 1 == attempt.shown.count
        if !bandComplete {
            step += 1
            return
        }

        let correctInBand = next[attempt.bandStart...].filter { $0 }.count
        correctByLevel[q.level] = correctInBand

        let decision = nextAdaptiveBand(bandPool: attempt.bandPool, currentIdx: attempt.bandIdx, correctInBand: correctInBand)
        if let skipped = decision.skipped {
            // Synthetic pass credit -- only ever granted when a real band
            // lies beyond it too (nextAdaptiveBand's landingHasContent
            // guard), so it's never the sole basis for the final result.
            correctByLevel[skipped] = 2
            skippedLevels.append(skipped)
        }

        let nextLevel = decision.nextIdx < placementOrder.count ? placementOrder[decision.nextIdx] : nil
        let nextBandQs = (!decision.stop && nextLevel != nil) ? (attempt.bandPool[nextLevel!] ?? []) : []
        if decision.stop || nextBandQs.isEmpty {
            finish(finalAnswers: next)
            return
        }

        let bandStart = attempt.shown.count
        attempt.shown.append(contentsOf: nextBandQs)
        attempt.bandIdx = decision.nextIdx
        attempt.bandStart = bandStart
        step += 1
    }

    private func finish(finalAnswers: [Bool]) {
        done = true
        let level = scorePlacement(correctByLevel: correctByLevel).level
        let score = finalAnswers.filter { $0 }.count
        guard let accessToken = session.accessToken else { return }
        Task {
            let client = ProgressSyncClient(
                supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken
            )
            try? await client.savePlacementResult(course: course.code, level: level, score: score)
        }
    }

    private func speak(_ text: String) {
        placementSpeechSynthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: course.speechLanguageCode)
        placementSpeechSynthesizer.speak(utterance)
    }
}

/// State for one placement attempt -- mirrors placement.tsx's local
/// `Session` type, renamed to avoid clashing with this app's own
/// `Session` (auth) class.
private struct PlacementAttempt {
    var bandPool: [String: [PlacementQuestion]]
    /// Questions actually decided-on so far, in display order -- grows
    /// band by band as the test adapts.
    var shown: [PlacementQuestion]
    /// `placementOrder` index of the band currently being tested.
    var bandIdx: Int
    /// Index into `shown` where the current band's questions begin.
    var bandStart: Int

    /// Always starts at A1 and walks forward to the first band that
    /// actually has candidate questions -- defensive only (every shipped
    /// course has content in every band), so a thin/misconfigured pool
    /// degrades to "test whatever exists" instead of crashing on a
    /// missing first question. Mirrors placement.tsx's `startSession`.
    init(pool: [PlacementQuestion]) {
        let grouped = groupByBand(pickPlacementSet(pool))
        var idx = 0
        while idx < placementOrder.count && (grouped[placementOrder[idx]]?.isEmpty ?? true) {
            idx += 1
        }
        self.bandPool = grouped
        self.shown = idx < placementOrder.count ? (grouped[placementOrder[idx]] ?? []) : []
        self.bandIdx = idx
        self.bandStart = 0
    }
}

/// Mirrors levels.ts's `LEVELS` catalog (name/blurb only -- the id is the
/// dictionary key). Duplicated here rather than shared, matching this
/// codebase's established per-file small-content convention.
private let levelMeta: [String: (name: String, blurb: String)] = [
    "A1": ("Beginner", "Greetings, basics, everyday routines."),
    "A2": ("Elementary", "Past tense, shopping, travel talk."),
    "B1": ("Intermediate", "Opinions, conditionals, work life."),
    "B2": ("Upper Int.", "Nuance, passives, debate language."),
    "C1": ("Advanced", "Idiom, register, academic precision."),
]

private let placementSpeechSynthesizer = AVSpeechSynthesizer()

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
