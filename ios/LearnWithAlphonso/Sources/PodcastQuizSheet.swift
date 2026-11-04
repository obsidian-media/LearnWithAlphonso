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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                    switch run.phase {
                    case .answering:
                        if let question = run.current { questionView(question) }
                    case .submitting:
                        ProgressView("Saving your answers…")
                            .tint(AlphonsoColor.moss)
                            .frame(maxWidth: .infinity)
                            .padding(.top, AlphonsoSpacing.lg)
                    case let .error(error):
                        errorView(error)
                    case .done:
                        if let result = run.result { resultView(result) }
                    case .empty:
                        ContentUnavailableView {
                            Label("No quiz", systemImage: "questionmark.circle")
                        } description: {
                            Text(PodcastQuizCopy.message(for: .notFound))
                        }
                    }
                }
                .padding(AlphonsoSpacing.md)
            }
            .background(AlphonsoColor.surface)
            .navigationTitle("Quiz: \(title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(run.phase == .done ? "Done" : "Leave") { dismiss() }
                }
            }
        }
    }

    // MARK: - Question

    private func questionView(_ question: PodcastQuizQuestion) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            Text(progressLine)
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
            Text(question.prompt)
                .font(AlphonsoFont.sans(18, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: AlphonsoSpacing.sm) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { index, choice in
                    choiceRow(index: index, text: choice, answerIndex: question.answerIndex)
                }
            }
            Button {
                if run.checked {
                    run.next()
                    if run.phase == .submitting { finishedAt = Date(); submit() }
                } else {
                    run.check()
                }
            } label: {
                Text(run.checked ? (run.isLastQuestion ? "Finish" : "Next") : "Check")
                    .font(AlphonsoFont.sans(16, weight: .semiBold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(AlphonsoColor.moss)
            .disabled(run.selected == nil)
        }
    }

    private var progressLine: String {
        var line = "Question \(run.index + 1) of \(run.questions.count)"
        if let best { line += " · your best: \(best.correct) of \(run.questions.count)" }
        return line
    }

    private func choiceRow(index: Int, text: String, answerIndex: Int) -> some View {
        let isPicked = run.selected == index
        let isRight = run.checked && index == answerIndex
        let isWrong = run.checked && isPicked && index != answerIndex
        return Button {
            run.select(index)
        } label: {
            HStack {
                Text(text)
                    .font(AlphonsoFont.sans(15))
                    .foregroundStyle(AlphonsoColor.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                // The verdict is also text for VoiceOver, not only colour and an icon.
                if isRight { Image(systemName: "checkmark.circle.fill").foregroundStyle(AlphonsoColor.moss) }
                if isWrong { Image(systemName: "xmark.circle.fill").foregroundStyle(AlphonsoColor.destructive) }
            }
            .padding(AlphonsoSpacing.md)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        isRight ? AlphonsoColor.moss : isWrong ? AlphonsoColor.destructive : isPicked ? AlphonsoColor.moss : AlphonsoColor.hairline,
                        lineWidth: isPicked || isRight || isWrong ? 2 : 1
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(run.checked)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
        .accessibilityValue(isRight ? "Correct answer" : isWrong ? "Your answer, not correct" : "")
    }

    // MARK: - Saving and result

    private func errorView(_ error: PodcastQuizError) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            Text(PodcastQuizCopy.message(for: error))
                .font(AlphonsoFont.sans(15))
                .foregroundStyle(AlphonsoColor.destructive)
                .accessibilityAddTraits(.isStaticText)
            // Only when sending the same answers again can help; a missing quiz or malformed answers cannot.
            if error.isRetryable {
                Button("Try again") {
                    run.retry()
                    submit()
                }
                .buttonStyle(.borderedProminent)
                .tint(AlphonsoColor.moss)
                .frame(minHeight: 44)
            }
        }
    }

    private func resultView(_ result: PodcastQuizResult) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
            Text("\(result.correct) of \(result.total) correct")
                .font(AlphonsoFont.sans(26, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
            Text(PodcastQuizCopy.xpLine(for: result))
                .font(AlphonsoFont.sans(15))
                .foregroundStyle(AlphonsoColor.inkSoft)
            let missed = run.questions.filter { result.missedQuestionIDs.contains($0.id) }
            if !missed.isEmpty {
                Text("To review")
                    .font(AlphonsoFont.sans(14, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                    .padding(.top, AlphonsoSpacing.sm)
                ForEach(missed, id: \.id) { question in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(question.prompt).font(AlphonsoFont.sans(14)).foregroundStyle(AlphonsoColor.ink)
                        Text("Answer: \(question.choices[question.answerIndex])")
                            .font(AlphonsoFont.sans(14))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                    }
                    .accessibilityElement(children: .combine)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                Task { await open() }
            } label: {
                Text(isLoading ? "Loading quiz…" : "Take the quiz")
                    .font(AlphonsoFont.sans(13, weight: .semiBold))
                    .frame(minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(AlphonsoColor.moss)
            .disabled(isLoading)
            .accessibilityLabel("Take the quiz: \(episode.title)")
            if unavailable {
                Text(PodcastQuizCopy.message(for: .notFound))
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.destructive)
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
