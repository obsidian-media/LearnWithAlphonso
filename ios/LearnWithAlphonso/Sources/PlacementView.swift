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
    /// fullScreenCover from RootView or from LessonBrowserView)
    /// dismiss itself without this view needing to know which.
    var onFinished: () -> Void = {}

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.alphonsoDS) private var ds
    @State private var attempt: PlacementAttempt
    @State private var step = 0
    /// The submitted TEXT, not an option index -- a listening question
    /// answers with the choice's text and a translation with a whole
    /// sentence, and isPlacementAnswerCorrect grades all three the same
    /// way only because of that. Matches placement.tsx's own `picked`.
    @State private var picked: String?
    @State private var answers: [Bool] = []
    @State private var done = false

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

    /// Whether finishing this question is guaranteed whatever the answer --
    /// decided in the Kit (`PlacementAttempt.isFinalQuestion`), which also
    /// knows the skipped band the exam goes back to is always its last.
    private var isFinalQuestion: Bool {
        attempt.isFinalQuestion(step: step)
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
                    VStack(spacing: AlphonsoDS.Space.s4) {
                        Text("No placement questions are available for this course right now.")
                            .dsText(.footnote)
                            .foregroundStyle(ds.inkSoft)
                            .multilineTextAlignment(.center)
                        Button("Back to Learn") { onFinished() }
                            .buttonStyle(.dsButton(.primary))
                    }
                    .padding()
                }
            }
            .background(ds.surface)
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
        .tint(ds.choice)
    }

    /// One chip per band. A skipped band is outlined with no fill and a passed one is filled, so credit and a real
    /// pass never look alike; each reads its state aloud.
    private var levelMarkers: some View {
        HStack(spacing: AlphonsoDS.Space.s2 - 2) {
            ForEach(attempt.markers(done: false), id: \.level) { marker in
                let look = markerLook(marker.state)
                Text(marker.level)
                    .dsText(.caption)
                    .foregroundStyle(look.text)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(look.fill, in: Capsule())
                    .overlay(Capsule().strokeBorder(look.border, lineWidth: 1))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(marker.level), \(look.words)")
            }
        }
    }

    private struct MarkerLook {
        let words: String
        let fill: Color
        let border: Color
        let text: Color
    }

    private func markerLook(_ state: BandMarkerState) -> MarkerLook {
        switch state {
        case .passed: return MarkerLook(words: "passed", fill: ds.right, border: ds.right, text: ds.onRight)
        case .skipped: return MarkerLook(words: "skipped after strong answers", fill: ds.surface, border: ds.rightInk, text: ds.rightInk)
        case .current: return MarkerLook(words: "now", fill: ds.choiceTint, border: ds.choice, text: ds.choice)
        case .missed: return MarkerLook(words: "not passed", fill: ds.surface, border: ds.line, text: ds.inkSoft)
        case .upcoming: return MarkerLook(words: "not reached", fill: ds.surface, border: ds.line, text: ds.inkSoft)
        }
    }

    private func questionBody(_ q: PlacementQuestion) -> some View {
        let header = VStack(spacing: AlphonsoDS.Space.s2) {
            DSProgressBar(
                fraction: attempt.maxQuestions > 0 ? Double(step) / Double(attempt.maxQuestions) : 0,
                accessibilityLabel: "Placement progress",
                accessibilityValue: attempt.progressSpokenLabel(step: step))
            Text(attempt.progressLabel(step: step))
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
                .accessibilityLabel(attempt.progressSpokenLabel(step: step))
            levelMarkers
        }
        .padding()

        let content = VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            Text("Placement test")
                .dsText(.caption)
                .tracking(0.4)
                .foregroundStyle(ds.actionText)

            questionPromptAndChoices(q)
        }
        .padding()

        let footer = VStack(spacing: AlphonsoDS.Space.s2) {
            Button {
                Task { await submit() }
            } label: {
                Text(isFinalQuestion ? "See my level" : "Continue")
            }
            .buttonStyle(.dsButton(.primary))
            .disabled(picked?.trimmingCharacters(in: .whitespaces).isEmpty ?? true)

            Text("No hearts lost — this just finds your starting point.")
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
        }
        .padding()

        return Group {
            if dynamicTypeSize.isAccessibilitySize {
                // At the largest text sizes a pinned header and footer leave the options a window barely a row
                // tall, so everything scrolls together and nothing has a fixed share of the screen.
                ScrollView {
                    VStack(spacing: 0) {
                        header
                        content
                        footer
                    }
                }
                .scrollDismissesKeyboard(.interactively)
            } else {
                VStack(spacing: 0) {
                    header
                    ScrollView { content }
                    footer
                }
            }
        }
    }

    @ViewBuilder
    private func questionPromptAndChoices(_ q: PlacementQuestion) -> some View {
        switch q {
        case .multipleChoice(let mc):
            Text(mc.prompt)
                .dsText(.title)
                .foregroundStyle(ds.ink)
            choiceButtons(mc.choices)
        case .listening(let listening):
            Text("Listening")
                .dsText(.caption)
                .tracking(0.3)
                .foregroundStyle(ds.inkSoft)
            Button {
                speak(listening.audioText)
            } label: {
                Label("Play audio", systemImage: "speaker.wave.2.fill")
            }
            .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            Text(listening.prompt)
                .dsText(.title)
                .foregroundStyle(ds.ink)
            choiceButtons(listening.choices)
        case .translate(let translate):
            Text(translate.prompt)
                .dsText(.title)
                .foregroundStyle(ds.ink)
            TextField(
                "Write your answer",
                text: Binding(get: { picked ?? "" }, set: { picked = $0 }),
                axis: .vertical
            )
            .lineLimit(3...6)
            .dsField()
        }
    }

    // Same selected/unselected styling as LessonPlayerView's own
    // choiceButton -- duplicated rather than shared, matching this
    // codebase's established per-screen convention -- minus the
    // checked/isCorrectChoice checkmark, since placement never reveals
    // correctness mid-exam (only the final results screen does).
    private func choiceButtons(_ choices: [String]) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            ForEach(Array(choices.enumerated()), id: \.offset) { index, choice in
                LessonAnswerButton(index: index, label: choice, state: picked == choice ? .selected : .idle) {
                    picked = choice
                }
            }
        }
    }

    private var resultsBody: some View {
        let level = attempt.level
        let meta = levelMeta[level]
        let correct = answers.filter { $0 }.count
        let content = VStack(spacing: AlphonsoDS.Space.s4) {
            Image(systemName: "star.fill")
                .accessibilityHidden(true)
                .dsText(.displayXL)
                .foregroundStyle(ds.onAction)
                .padding(AlphonsoDS.Space.s4)
                .frame(minWidth: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s4, minHeight: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s4)
                .background(ds.action, in: Circle())
            Text("Your level")
                .dsText(.caption)
                .tracking(0.4)
                .foregroundStyle(ds.actionText)
            Text(level)
                .dsText(.displayXL)
                .foregroundStyle(ds.ink)
            if let meta {
                Text(meta.name)
                    .dsText(.headline)
                    .foregroundStyle(ds.ink)
                Text(meta.blurb)
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.center)
            }
            Text("\(correct) of \(total) correct")
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
            if let finished = attempt.finishedLabel {
                Text(finished)
                    .dsText(.caption)
                    .foregroundStyle(ds.choice)
            }
            // Only skips the learner's real answers backed up (see resolveBand): a band the exam went back to
            // and asked is no longer in this list.
            if !attempt.tally.skippedLevels.isEmpty {
                Text("Fast-tracked past \(attempt.tally.skippedLevels.joined(separator: ", ")) after strong answers.")
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.center)
            }
            Button("Start learning at \(level)") { onFinished() }
                .buttonStyle(.dsButton(.primary))
            Button("Retake the test") { restart() }
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
        }
        .padding()
        // Centred in the available height as before; the largest text sizes scroll instead.
        return Group {
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView { content.frame(maxWidth: .infinity) }
            } else {
                content.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private func restart() {
        attempt = PlacementAttempt(pool: contentStore.placementPool(for: course))
        answers = []
        step = 0
        picked = nil
        done = false
    }

    /// Mirrors placement.tsx's `submit()` exactly -- see that function's
    /// own comments for the band-complete/adaptive-advance branches this
    /// ports one-for-one.
    ///
    /// Graded on the device only: placement runs during onboarding, before any consent question, so nothing it
    /// sees may leave the device, and it never waits on the network.
    private func submit() async {
        guard let picked, let q = currentQuestion else { return }
        let correct = isPlacementAnswerCorrect(q, answer: picked)
        let next = answers + [correct]
        self.picked = nil
        answers = next

        let bandComplete = step + 1 == attempt.shown.count
        if !bandComplete {
            step += 1
            return
        }

        // This band just finished. The Kit decides what comes next and what a
        // skip's synthetic credit is worth (PlacementAttempt.completeBand ->
        // resolveBand): it only stands once the band after the skip is really
        // passed, and if that band was failed the exam goes BACK and asks the
        // skipped band, so a placement never rests on a band the learner was
        // never asked.
        if attempt.completeBand(answers: next) {
            finish(finalAnswers: next)
            return
        }
        step += 1
    }

    private func finish(finalAnswers: [Bool]) {
        done = true
        let level = attempt.level
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
        utterance.voice = SpeechVoice.voice(for: course)
        placementSpeechSynthesizer.speak(utterance)
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
}
