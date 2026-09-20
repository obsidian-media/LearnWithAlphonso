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
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore

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
    /// Set only when this queue is showing SyncQueueStore's cached
    /// snapshot rather than a fresh fetch -- see loadQueue()'s offline
    /// fallback.
    @State private var showingCachedQueueSince: Date?

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
                    VStack(spacing: 0) {
                        if let showingCachedQueueSince {
                            CachedQueueBanner(since: showingCachedQueueSince)
                        }
                        reviewBody
                    }
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
        if currentItem.source == "weakness" {
            return question(fromWeaknessItem: currentItem)
        }
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

    /// Fetches the due queue online, falling back to SyncQueueStore's
    /// cached snapshot (rather than an error screen) when offline or the
    /// fetch fails -- read-only staleness, a much smaller UX problem than
    /// lesson completion's write-loss problem. See docs/v2-kickoffs/
    /// 01-offline-first.md's "Review queue: cache-then-optimistic-grade".
    private func loadQueue() async {
        isLoading = true
        errorMessage = nil
        clearedBonusMessage = nil
        showingCachedQueueSince = nil
        idx = 0
        picked = nil
        checked = false
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            isLoading = false
            return
        }

        if networkMonitor.isConnected {
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            do {
                let result = try await client.fetchDueReviews(course: course.code)
                queue = result.due
                total = result.total
                notificationScheduler.scheduleDueReviewNudge(due: result.due)
                syncQueueStore.replaceLastKnownDueReviews(result.due)
                isLoading = false
                return
            } catch {
                // fall through to the cached fallback below
            }
        }

        let cached = syncQueueStore.lastKnownDueReviews()
        queue = cached
        total = cached.count
        showingCachedQueueSince = syncQueueStore.lastSyncedAt
        isLoading = false
    }

    private func submitAndAdvance(question: Question) async {
        guard let picked else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        if networkMonitor.isConnected, let accessToken = session.accessToken {
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            do {
                _ = try await client.gradeReview(itemKey: currentItem.itemKey, answer: picked, course: course.code)
                advance()
                if idx >= queue.count {
                    await claimBonusIfCleared(client: client)
                }
                return
            } catch {
                // fall through to the offline-queue path below
            }
        }
        queueGradeOffline(item: currentItem, question: question, answer: picked)
        advance()
    }

    /// Optimistic local grading (Option A in the design doc): compute the
    /// SM-2 update via SRSEngine (already pure/tested), queue the real
    /// grade for sync, and update the cached due-list so a relaunch while
    /// still offline doesn't show an already-graded item as due again.
    /// `lapses: 0` below is a deliberate placeholder, not a bug -- see the
    /// inline note.
    private func queueGradeOffline(item: ReviewItem, question: Question, answer: String) {
        let today = todayDateString()
        let correct = isAnswerCorrect(question, picked: answer)
        // ReviewItem never carries `lapses` (fetchDueReviews doesn't select
        // it), but none of computeReviewOutcome's ease/intervalDays/
        // repetitions/dueOn outputs actually depend on the *input* lapses
        // value -- only the *returned* lapses count does, which this view
        // never displays. Safe to pass 0.
        let input = ReviewGradeInput(correct: correct, ease: item.ease, intervalDays: item.intervalDays, repetitions: item.repetitions, lapses: 0)
        let outcome = computeReviewOutcome(input, today: today, addDays: { addDaysDateString($0) })

        syncQueueStore.appendReviewGrade(PendingReviewGrade(itemKey: item.itemKey, answer: answer, course: course.code, queuedAt: Date()))

        switch outcome {
        case .retired:
            syncQueueStore.removeCachedDueReview(itemKey: item.itemKey)
        case .rescheduled(let scheduled):
            // A wrong answer keeps dueOn == today (real SM-2 behavior, see
            // grade-review's port) -- leave it cached as still-due, same as
            // the online path, which doesn't re-insert a missed item into
            // the current session's queue either.
            if scheduled.dueOn > today {
                syncQueueStore.removeCachedDueReview(itemKey: item.itemKey)
            }
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

/// Matches ProgressSyncClient.fetchDueReviews' own "yyyy-MM-dd" convention
/// (ISO8601DateFormatter().string(from:).prefix(10)).
private func todayDateString() -> String {
    String(ISO8601DateFormatter().string(from: Date()).prefix(10))
}

private func addDaysDateString(_ days: Int) -> String {
    let date = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: Date()) ?? Date()
    return String(ISO8601DateFormatter().string(from: date).prefix(10))
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

/// Shown above the queue when it's SyncQueueStore's cached snapshot rather
/// than a fresh fetch -- a relative-time indicator instead of the error
/// screen an offline/failed fetch used to show.
private struct CachedQueueBanner: View {
    let since: Date?

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash")
            Text(label)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground))
    }

    private var label: String {
        guard let since else { return "Offline -- showing your last synced queue" }
        let relative = RelativeDateTimeFormatter().localizedString(for: since, relativeTo: Date())
        return "Offline -- last synced \(relative)"
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
