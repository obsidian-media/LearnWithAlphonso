import SwiftUI
import LearnWithAlphonsoKit

/// The quiz offered after a podcast episode: pick, check, next. The run (every rule about the steps) is
/// `PodcastQuizRun` in the Kit; the score and XP are the server's (`PodcastClient.submitQuiz`), and the answer shown
/// after each check is for the learner's benefit only.
struct PodcastQuizSheet: View {
    let title: String
    let episodeID: String
    let session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var run: PodcastQuizRun
    /// When the learner finished the last question; sent so the server credits the right activity day.
    @State private var finishedAt = Date()
    let best: PodcastQuizBest?
    /// Called with the server's result once saved, so the caller can refresh its "best" label.
    let onSaved: ((PodcastQuizResult) -> Void)?

    init(
        title: String,
        episodeID: String,
        offer: PodcastQuizOffer,
        session: Session,
        onSaved: ((PodcastQuizResult) -> Void)? = nil
    ) {
        self.title = title
        self.episodeID = episodeID
        self.session = session
        self.best = offer.best
        self.onSaved = onSaved
        _run = State(initialValue: PodcastQuizRun(questions: offer.questions))
    }

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The radio studio: the room a podcast quiz is asked in.
    private let roomID = "radio"

    var body: some View {
        NavigationStack {
            Group {
                switch run.phase {
                case .answering:
                    if let question = run.current { questionView(question) }
                case .submitting:
                    VStack(spacing: AlphonsoDS.Space.s3) {
                        ProgressView().tint(ds.choice)
                        Text("Saving your answers…").dsText(.body).foregroundStyle(ds.inkSoft)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ds.surface)
                case let .error(error):
                    stateScreen { errorView(error) }
                case .done:
                    if let result = run.result { resultView(result) }
                case .empty:
                    stateScreen {
                        DSEmptyState(art: "Alphonso-thinking", title: "No quiz", message: PodcastQuizCopy.message(for: .notFound))
                    }
                }
            }
            .navigationTitle("Quiz: \(title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(ds.choice)
    }

    /// An error or empty card on the plain surface, with a way out.
    private func stateScreen<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            Spacer()
            content()
            Button("Leave") { dismiss() }.buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            Spacer()
        }
        .padding(AlphonsoDS.Space.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ds.surface)
    }

    // MARK: - Question (the lesson flow: the room, Alphonso's bubble, the lesson's answers and verdict sheet)

    private func questionView(_ question: PodcastQuizQuestion) -> some View {
        let right = run.selected == question.answerIndex
        let expression = LessonStage.expression(picked: run.selected != nil, verdict: run.checked ? right : nil)
        return ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    LessonRoomView(
                        roomID: roomID, expression: expression, height: 300, alphonsoWidth: 250, topInset: 0
                    ) {
                        HStack(spacing: AlphonsoDS.Space.s3) {
                            Button { dismiss() } label: {
                                Image(systemName: "xmark").dsText(.headline).foregroundStyle(ds.ink)
                                    .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                                    .background(Circle().fill(ds.card.opacity(0.9)))
                            }
                            .accessibilityLabel("Leave the quiz")
                            DSProgressBar(
                                fraction: Double(run.index + (run.checked ? 1 : 0)) / Double(max(run.questions.count, 1)),
                                accessibilityLabel: "Quiz progress", accessibilityValue: progressLine)
                        }
                        .padding(.horizontal, AlphonsoDS.Space.s4)
                        .padding(.top, AlphonsoDS.Space.s4)
                    }
                    VStack(spacing: AlphonsoDS.Space.s3) {
                        AlphonsoBubbleView(label: progressLine, text: question.prompt, compact: true, isHeading: false)
                            .padding(.top, -AlphonsoDS.Space.s8)
                        VStack(spacing: AlphonsoDS.Space.s2) {
                            ForEach(Array(question.choices.enumerated()), id: \.offset) { index, choice in
                                LessonAnswerButton(
                                    index: index, label: choice,
                                    state: LessonAnswerState.of(
                                        checked: run.checked, isPicked: run.selected == index,
                                        isRight: index == question.answerIndex)
                                ) { run.select(index) }
                                .disabled(run.checked)
                                .id(index == question.answerIndex ? "quiz-right" : "quiz-choice-\(index)")
                            }
                        }
                    }
                    .padding(.horizontal, AlphonsoDS.Space.gutter)
                    .padding(.bottom, AlphonsoDS.Space.s4)
                }
            }
            .background(ds.surface)
            .ignoresSafeArea(edges: .top)
            .onChange(of: run.checked) { _, isChecked in
                guard isChecked else { return }
                // After the verdict sheet has taken its room, so the right answer is not hidden behind it.
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(120))
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) { proxy.scrollTo("quiz-right", anchor: .center) }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { controls(question, right: right) }
        }
    }

    /// Check, or the lesson's verdict sheet once checked: pinned below the scrolling question.
    @ViewBuilder
    private func controls(_ question: PodcastQuizQuestion, right: Bool) -> some View {
        if !run.checked {
            Button("Check") { run.check() }
                .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
                .disabled(run.selected == nil)
                .padding(.horizontal, AlphonsoDS.Space.gutter)
                .padding(.top, AlphonsoDS.Space.s3)
                .padding(.bottom, AlphonsoDS.Space.s2)
                .background(ds.surface)
        } else {
            LessonVerdictSheet(
                correct: right,
                title: AnswerVerdict.title(correct: right),
                xp: nil,
                correctAnswer: question.choices[question.answerIndex],
                continueTitle: run.isLastQuestion ? "Finish" : "Next",
                onContinue: {
                    run.next()
                    if run.phase == .submitting { finishedAt = Date(); submit() }
                }
            ) { EmptyView() }
            .transition(reduceMotion ? .opacity : .move(edge: .bottom))
        }
    }

    private var progressLine: String {
        var line = "Question \(run.index + 1) of \(run.questions.count)"
        if let best { line += " · your best: \(best.correct) of \(run.questions.count)" }
        return line
    }

    // MARK: - Saving and result

    private func errorView(_ error: PodcastQuizError) -> some View {
        // The error's own message is the title. Only when sending the same answers again can help is there a retry.
        DSEmptyState(
            art: "Alphonso-encouraging", title: PodcastQuizCopy.message(for: error),
            actionTitle: error.isRetryable ? "Try again" : nil,
            action: error.isRetryable ? {
                run.retry()
                submit()
            } : nil)
    }

    /// The lesson-complete layout: the room, the bubble with the score, then the XP line and what to review.
    private func resultView(_ result: PodcastQuizResult) -> some View {
        let missed = run.questions.filter { result.missedQuestionIDs.contains($0.id) }
        return LessonCompleteView(
            roomID: roomID,
            headline: "\(result.correct) of \(result.total) correct",
            chips: [],
            time: nil,
            xpLines: [],
            correct: result.correct,
            total: result.total,
            heartsBonus: nil,
            achievements: [],
            missed: [],
            topInset: 0,
            continueTitle: "Done",
            onContinue: { dismiss() }
        ) {
            Text(PodcastQuizCopy.xpLine(for: result)).dsText(.body).foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.center)
            if !missed.isEmpty {
                DSOverline("To review")
                DSCard(spacing: AlphonsoDS.Space.s2) {
                    ForEach(missed, id: \.id) { question in
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                            Text(question.prompt).dsText(.footnote).foregroundStyle(ds.ink)
                            Text("Answer: \(question.choices[question.answerIndex])")
                                .dsText(.footnote).foregroundStyle(ds.rightInk)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    /// Sends the answers once per entry into "submitting" (the last answer, or Try again). An unstructured task, so
    /// leaving the sheet does not cancel a request that may already have been applied.
    private func submit() {
        guard let client = makePodcastClient(session: session) else {
            run.failed(.unauthorized)
            return
        }
        let answers = run.answers
        let finished = finishedAt
        let episodeID = episodeID
        Task { @MainActor in
            do {
                let result = try await client.submitQuiz(episodeID: episodeID, answers: answers, completedAt: finished)
                run.saved(result)
                onSaved?(result)
            } catch let error as PodcastQuizError {
                run.failed(error)
            } catch {
                run.failed(.server)
            }
        }
    }
}

/// "Take the quiz" under an episode's row, for an episode that has one: a replay, or a first try for a learner who
/// listened on another device, without listening again. The quiz is read when the button is pressed.
struct PodcastQuizRowButton: View {
    let episode: PodcastEpisode
    let session: Session

    @State private var offer: PodcastQuizOffer?
    @State private var isLoading = false
    @State private var unavailable = false
    @State private var showQuiz = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                Task { await open() }
            } label: {
                Label(isLoading ? "Loading quiz…" : "Take the quiz", systemImage: "questionmark.circle.fill")
                    .labelStyle(PodcastQuizChipLabelStyle())
            }
            // An opaque surface chip with ink text, like the episode card above it: the row sits on the scene photo,
            // where the old translucent moss tint left moss text on a picture.
            .buttonStyle(AlphonsoSecondaryButtonStyle(fullWidth: false))
            .disabled(isLoading)
            .accessibilityLabel("Take the quiz: \(episode.title)")
            if unavailable {
                Text(PodcastQuizCopy.message(for: .notFound))
                    .dsText(.caption)
                    .foregroundStyle(ds.wrongInk)
            }
        }
        .sheet(isPresented: $showQuiz) {
            if let offer {
                PodcastQuizSheet(title: episode.title, episodeID: episode.id, offer: offer, session: session) { result in
                    // Reopening shows the better best without another read.
                    self.offer = PodcastQuizOffer(
                        questions: offer.questions,
                        best: PodcastQuizBest(correct: result.bestCorrect, xp: result.bestXP)
                    )
                }
            }
        }
    }

    private func open() async {
        unavailable = false
        if offer != nil { showQuiz = true; return }
        guard let client = makePodcastClient(session: session) else { unavailable = true; return }
        isLoading = true
        defer { isLoading = false }
        if let found = try? await client.fetchQuiz(episodeID: episode.id) {
            offer = found
            showQuiz = true
        } else {
            unavailable = true
        }
    }
}

/// The chip's icon is the moss accent; the words stay ink on the opaque surface, so they read on every theme.
private struct PodcastQuizChipLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: AlphonsoSpacing.xs) {
            configuration.icon
                .foregroundStyle(AlphonsoColor.moss)
                .accessibilityHidden(true)
            configuration.title
                .dsText(.footnote)
                .foregroundStyle(AlphonsoColor.ink)
        }
    }
}
