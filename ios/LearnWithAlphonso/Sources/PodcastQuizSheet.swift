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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                    switch run.phase {
                    case .answering:
                        if let question = run.current { questionView(question) }
                    case .submitting:
                        DSCard {
                            HStack(spacing: AlphonsoDS.Space.s3) {
                                ProgressView().tint(ds.choice)
                                Text("Saving your answers…").dsText(.body).foregroundStyle(ds.inkSoft)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    case let .error(error):
                        errorView(error)
                    case .done:
                        if let result = run.result { resultView(result) }
                    case .empty:
                        DSEmptyState(art: "Alphonso-thinking", title: "No quiz", message: PodcastQuizCopy.message(for: .notFound))
                    }
                }
                .padding(AlphonsoDS.Space.gutter)
            }
            .background(ds.surface)
            .navigationTitle("Quiz: \(title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(run.phase == .done ? "Done" : "Leave") { dismiss() }
                }
            }
        }
        .tint(ds.choice)
    }

    // MARK: - Question

    private func questionView(_ question: PodcastQuizQuestion) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            Text(progressLine).dsText(.caption).foregroundStyle(ds.inkSoft)
            DSProgressBar(
                fraction: Double(run.index + (run.checked ? 1 : 0)) / Double(max(run.questions.count, 1)),
                accessibilityLabel: "Quiz progress", accessibilityValue: progressLine)
            Text(question.prompt).dsText(.question).foregroundStyle(ds.ink)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: AlphonsoDS.Space.s2) {
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
            }
            .buttonStyle(.dsButton(.primary))
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
        let border: Color = isRight ? ds.rightInk : isWrong ? ds.wrongInk : isPicked ? ds.choice : ds.line
        let fill: Color = isRight ? ds.rightTint : isWrong ? ds.wrongTint : isPicked ? ds.choiceTint : ds.card
        return Button {
            run.select(index)
        } label: {
            HStack(spacing: AlphonsoDS.Space.s3) {
                Text("\(index + 1)").dsText(.footnote).foregroundStyle(border)
                    .frame(width: AlphonsoDS.Space.s6, height: AlphonsoDS.Space.s6)
                    .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).strokeBorder(border, lineWidth: 2))
                Text(text).dsText(.answer).foregroundStyle(ds.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                // The verdict is also text for VoiceOver, not only colour and an icon.
                if isRight { Image(systemName: "checkmark").dsText(.footnote).foregroundStyle(ds.rightInk) }
                if isWrong { Image(systemName: "xmark").dsText(.footnote).foregroundStyle(ds.wrongInk) }
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(border, lineWidth: 2))
            // The whole card is the target. A plain-style button only hit-tests what it draws: the glyphs and the 1 pt
            // stroke, never the padding or the Spacer. A short choice ("It means no") left the middle of its card
            // dead, so a tap there selected nothing and Check stayed disabled.
            .contentShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(run.checked)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
        .accessibilityValue(isRight ? "Correct answer" : isWrong ? "Your answer, not correct" : "")
    }

    // MARK: - Saving and result

    private func errorView(_ error: PodcastQuizError) -> some View {
        // Only when sending the same answers again can help; a missing quiz or malformed answers cannot.
        DSEmptyState(
            art: "Alphonso-encouraging", title: "Couldn't save your answers", message: PodcastQuizCopy.message(for: error),
            actionTitle: error.isRetryable ? "Try again" : nil,
            action: error.isRetryable ? {
                run.retry()
                submit()
            } : nil)
    }

    private func resultView(_ result: PodcastQuizResult) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            DSCard {
                Text("\(result.correct) of \(result.total) correct").dsText(.display).foregroundStyle(ds.brand)
                Text(PodcastQuizCopy.xpLine(for: result)).dsText(.body).foregroundStyle(ds.inkSoft)
            }
            let missed = run.questions.filter { result.missedQuestionIDs.contains($0.id) }
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
