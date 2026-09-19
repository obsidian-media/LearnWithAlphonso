import SwiftUI
import LearnWithAlphonsoKit

/// V1's review queue: due SM-2 items, one at a time. Grading happens
/// server-side (grade-review Edge Function re-derives correctness against
/// the real question -- same trust-boundary reasoning as LessonPlayerView's
/// completeLesson call) -- this view never trusts its own local
/// correct/incorrect check for anything but the immediate visual feedback.
struct ReviewQueueView: View {
    let contentStore: ContentStore
    let session: Session
    let notificationScheduler: NotificationScheduler

    @State private var course: Course = .english
    @State private var queue: [ReviewItem] = []
    @State private var total = 0
    @State private var idx = 0
    @State private var picked: String?
    @State private var checked = false
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var clearedBonusMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if let errorMessage {
                    ContentUnavailableView("Couldn't load your review queue", systemImage: "wifi.slash", description: Text(errorMessage))
                } else if queue.isEmpty {
                    ContentUnavailableView {
                        Label("All caught up", systemImage: "checkmark.circle")
                    } description: {
                        Text(clearedBonusMessage ?? "Nothing due for review right now.")
                    }
                } else if idx < queue.count {
                    reviewBody
                } else {
                    ContentUnavailableView {
                        Label("Queue cleared", systemImage: "checkmark.circle.fill")
                    } description: {
                        Text(clearedBonusMessage ?? "Nice work -- check back tomorrow for more.")
                    }
                }
            }
            .navigationTitle("Review")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Picker("Course", selection: $course) {
                        Text("English").tag(Course.english)
                        Text("Français").tag(Course.french)
                    }
                    .pickerStyle(.segmented)
                    .disabled(!queue.isEmpty && idx < queue.count)
                }
            }
        }
        .task(id: course) { await loadQueue() }
    }

    private var currentItem: ReviewItem { queue[idx] }

    private var currentQuestion: Question? {
        guard let found = contentStore.findLesson(id: currentItem.lessonId, course: course) else { return nil }
        let questionId = String(currentItem.itemKey.split(separator: ":").last ?? "")
        return found.lesson.questions.first { questionID($0) == questionId }
    }

    private var reviewBody: some View {
        Group {
            if let question = currentQuestion {
                VStack(alignment: .leading, spacing: 16) {
                    Text("\(idx + 1)/\(queue.count) due")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ReviewQuestionCard(question: question, checked: checked, picked: $picked)

                    Spacer()

                    if isSubmitting {
                        ProgressView().frame(maxWidth: .infinity)
                    } else if !checked {
                        Button("Check") { checked = true }
                            .buttonStyle(.borderedProminent)
                            .disabled(picked == nil)
                            .frame(maxWidth: .infinity)
                    } else {
                        Button("Next") { Task { await submitAndAdvance(question: question) } }
                            .buttonStyle(.borderedProminent)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding()
            } else {
                // Bundled content and the server's review_items row disagree --
                // skip rather than get stuck (content update, stale item, etc).
                Color.clear.task { advance() }
            }
        }
    }

    private func loadQueue() async {
        isLoading = true
        errorMessage = nil
        clearedBonusMessage = nil
        idx = 0
        picked = nil
        checked = false
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            isLoading = false
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.fetchDueReviews(course: course.code)
            queue = result.due
            total = result.total
            notificationScheduler.scheduleDueReviewNudge(due: result.due)
        } catch {
            errorMessage = "Check your connection and try again."
        }
        isLoading = false
    }

    private func submitAndAdvance(question: Question) async {
        guard let accessToken = session.accessToken, let picked else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            _ = try await client.gradeReview(itemKey: currentItem.itemKey, answer: picked, course: course.code)
        } catch {
            // Grading failure shouldn't strand the user mid-queue -- move on,
            // the item just stays due and will be re-offered next time.
        }
        advance()
        if idx >= queue.count {
            await claimBonusIfCleared(client: client)
        }
    }

    private func advance() {
        idx += 1
        picked = nil
        checked = false
    }

    private func claimBonusIfCleared(client: ProgressSyncClient) async {
        do {
            let bonus = try await client.claimReviewClearBonus(course: course.code)
            if bonus.granted {
                clearedBonusMessage = "Review queue cleared: +1 heart!"
            }
        } catch {
            // Non-critical -- the bonus is a nice-to-have, not worth surfacing an error for.
        }
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

private struct ReviewQuestionCard: View {
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
