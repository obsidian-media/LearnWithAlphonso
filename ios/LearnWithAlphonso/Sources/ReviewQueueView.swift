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

    // The review sheet had no way out but swiping it down (BACKLOG 0.0-z #4).
    @Environment(\.dismiss) private var dismiss

    /// Review opens on the course the learner is studying (their per-account active course).
    @State private var course: Course
    /// The word the learner tapped in a review explanation, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    /// Only items the bundled content can render (ReviewQueueResolution), so the screen is never blank.
    @State private var queue: [ResolvedReviewItem] = []
    @State private var total = 0
    @State private var idx = 0
    @State private var picked: String?
    // Same reasoning as the lesson player: the verdict shown and the verdict
    // scored must be one value, not two derivations of it.
    @State private var translationVerdict: TranslationVerdict?
    @State private var isCheckingTranslation = false
    /// Set when Check already submitted this item (translate only). The server
    /// graded AND scheduled it in that call, so submitAndAdvance must not send
    /// it again -- a second call would re-grade, spend a second vendor call,
    /// and be rejected as not-yet-due by the freshly moved due date.
    @State private var alreadySubmitted = false
    /// The current answer's submission, created before the first network attempt and reused by every retry
    /// (Check, Next, and the offline queue). Its `queueIdentity` is the attempt id the server stores with the
    /// result, so a grade whose response was lost is replayed instead of being graded a second time.
    @State private var gradeAttempt: PendingReviewGrade?
    @State private var checked = false
    /// True once a word is placed in a sentence; QuestionCard's binding (Review has no Alphonso to react to it).
    @State private var reorderStarted = false
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var clearedBonusMessage: String?
    /// Set only when this queue is showing SyncQueueStore's cached
    /// snapshot rather than a fresh fetch -- see loadQueue()'s offline
    /// fallback.
    @State private var showingCachedQueueSince: Date?

    @MainActor init(contentStore: ContentStore, session: Session, notificationScheduler: NotificationScheduler,
         networkMonitor: NetworkMonitor, syncQueueStore: SyncQueueStore) {
        self.contentStore = contentStore
        self.session = session
        self.notificationScheduler = notificationScheduler
        self.networkMonitor = networkMonitor
        self.syncQueueStore = syncQueueStore
        _course = State(initialValue: ActiveCoursePreference.load(for: session.userID))
    }

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            // The loader below sits on this always-present stack, never on a state that may draw nothing.
            Group {
                if isLoading {
                    ProgressView().tint(ds.choice).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let errorMessage {
                    stateCard(art: "Alphonso-thinking", title: "Couldn't load your review queue", message: errorMessage)
                } else if queue.isEmpty {
                    stateCard(art: "Alphonso-happy", title: "All caught up", message: clearedBonusMessage ?? "Nothing due for review right now.")
                } else if idx < queue.count {
                    VStack(spacing: 0) {
                        if let showingCachedQueueSince {
                            CachedQueueBanner(since: showingCachedQueueSince)
                        }
                        reviewBody
                    }
                } else {
                    stateCard(art: "Alphonso-proud", title: "Queue cleared", message: clearedBonusMessage ?? "Nice work. Check back tomorrow for more.")
                }
            }
            .background(ds.surface)
            .navigationTitle("Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    CoursePicker(course: $course)
                        .disabled(isSubmitting || isCheckingTranslation || checked)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tint(ds.choice)
        .task(id: course) { await loadQueue() }
        // No whole-screen consent wall. Each item decides (AIConsentPolicy): a
        // translate item is graded by grade-review, which skips the AI grader
        // without account consent, and shows "Turn on AI grading"; a speak
        // item offers typing.
        // Tap-to-save in explanations, like the lesson player: the shared
        // ExplanationView / AlphonsoTipCard read this from the environment and
        // use it only for a course whose text is wholly in its own language.
        .environment(\.saveWordHandler, { savingWord = $0 })
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
    }

    /// An empty, cleared or failed queue: Alphonso over the words, on a card.
    private func stateCard(art: String, title: String, message: String) -> some View {
        ScrollView {
            DSEmptyState(art: art, title: title, message: message)
                .padding(AlphonsoDS.Space.gutter)
        }
    }

    private var currentItem: ReviewItem { queue[idx].item }

    /// The verdict the panel shows: a translation's settled grade when there is one, otherwise the local match.
    private func verdictCorrect(_ question: Question) -> Bool {
        if case .translate = question, let translationVerdict {
            return translationVerdict.correct
        }
        return isAnswerCorrect(question, picked: picked, course: course)
    }

    /// Non-nil for any index inside the queue: loadQueue keeps only items ReviewQueueResolution resolved.
    private var currentQuestion: Question? { idx < queue.count ? queue[idx].question : nil }

    /// Alphonso at his book over the library scene: the picture the due count sits above.
    private var banner: some View {
        Color.clear
            .frame(height: AlphonsoDS.Space.s12 * 3 + AlphonsoDS.Space.s2)
            .overlay {
                Image(SceneName.hector.assetName).resizable().scaledToFill()
            }
            .overlay {
                LinearGradient(colors: [.clear, ds.heroB.opacity(0.55)], startPoint: .center, endPoint: .bottom)
            }
            .overlay(alignment: .bottomTrailing) {
                Image("Alphonso-reading-book").resizable().scaledToFit()
                    .frame(height: AlphonsoDS.Space.s12 * 3)
                    .padding(.trailing, AlphonsoDS.Space.s3)
                    .offset(y: AlphonsoDS.Space.s2)
            }
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.sheet, style: .continuous))
            .accessibilityHidden(true)
    }

    private var reviewBody: some View {
        Group {
            if let question = currentQuestion {
                let layout = LessonStage.layout(viewportHeight: Double(UIScreen.main.bounds.height), prompt: question.prompt)
                // The question scrolls; Check and the verdict sheet are pinned below it, so a tall item plus the
                // sheet never pushes the button off a small screen.
                ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                        HStack(spacing: AlphonsoDS.Space.s3) {
                            DSProgressBar(fraction: Double(idx + (checked ? 1 : 0)) / Double(max(1, queue.count)))
                            DSPill(text: "\(idx + 1)/\(queue.count) due", tone: .gold)
                        }
                        banner
                        // .id() forces a fresh QuestionCard (and its reorder @State) per item -- same reasoning as
                        // LessonPlayerView's identical pattern.
                        QuestionCard(
                            question: question, course: course, vocabImages: contentStore.vocabImages, session: session,
                            lessonId: currentItem.lessonId, isConnected: networkMonitor.isConnected, checked: checked,
                            isReinforcing: false, compact: layout.size == .small, surface: .review, picked: $picked,
                            translationVerdict: $translationVerdict, reorderStarted: $reorderStarted)
                            .id(currentItem.itemKey)
                    }
                    .padding(AlphonsoDS.Space.gutter)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: checked) { _, isChecked in
                    guard isChecked else { return }
                    // After the verdict sheet has taken its room at the foot, so "center" is the space left above
                    // it: the right answer is never hidden behind the sheet (the lesson's own mechanism).
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(120))
                        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                            proxy.scrollTo(QuestionCard.correctAnswerID, anchor: .center)
                        }
                    }
                }
                .safeAreaInset(edge: .bottom, spacing: 0) { reviewControls(question) }
                }
                // The verdict sheet announces the verdict itself; the explanation inside it stays quiet.
                .environment(\.verdictAnnouncedByPanel, true)
                .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.86), value: checked)
            } else {
                // Unreachable since loadQueue resolves every item up front. Kept as a guard: .task(id:) re-fires
                // for each index, where a bare .task fired once per view identity and left a blank screen when
                // two unresolvable items followed each other.
                Color.clear.task(id: idx) { advance() }
            }
        }
    }

    /// Check, or the verdict sheet once checked: pinned below the scrolling question.
    @ViewBuilder
    private func reviewControls(_ question: Question) -> some View {
        if isSubmitting {
            ProgressView().tint(ds.choice).frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s4).background(ds.surface)
        } else if isCheckingTranslation {
            ProgressView("Checking...").tint(ds.choice)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s4).background(ds.surface)
        } else if !checked {
            Button("Check") {
                // A translation has to settle before the learner is
                // shown anything: the curated phrasings are only a
                // floor, and the second opinion that can lift them
                // is a network call. Every other type is decided
                // locally and instantly.
                if case .translate(let q) = question {
                    isCheckingTranslation = true
                    Task {
                        await gradeTranslationReviewItem(question: q)
                        isCheckingTranslation = false
                        checked = true
                    }
                } else {
                    checked = true
                }
            }
            .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
            // Whitespace is not an answer.
            .disabled((picked ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s3)
            .padding(.bottom, AlphonsoDS.Space.s2)
            .background(ds.surface)
        } else {
            let correct = verdictCorrect(question)
            // Same wording as the web's review: the item either stays learned or comes back.
            LessonVerdictSheet(
                correct: correct,
                title: correct ? "Still got it." : "Back in the queue.",
                xp: nil,
                correctAnswer: AnswerVerdict.correctAnswer(for: question),
                continueTitle: "Next",
                onContinue: { Task { await submitAndAdvance(question: question) } }
            ) {
                ExplanationView(
                    question: question, picked: picked, explanation: question.explanationText,
                    course: course, correctOverride: translationVerdict?.correct, inSheet: true)
            }
            .transition(reduceMotion ? .opacity : .move(edge: .bottom))
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
                let result = try await client.fetchDueReviews(course: course.wireCode)
                notificationScheduler.scheduleDueReviewNudge(due: result.due)
                syncQueueStore.replaceLastKnownDueReviews(result.due, course: course.wireCode)
                show(result.due)
                // The count shown is what can be rendered, not the server's total.
                total = queue.count
                isLoading = false
                return
            } catch {
                // fall through to the cached fallback below
            }
        }

        let cached = syncQueueStore.lastKnownDueReviews(course: course.wireCode)
        show(cached)
        total = queue.count
        showingCachedQueueSince = syncQueueStore.lastSyncedAt
        isLoading = false
    }

    /// Only renderable items reach the screen. Unrenderable ones (content changed since they were scheduled) are
    /// dropped from this course's cache too, so the badge stops counting what Review cannot show.
    private func show(_ items: [ReviewItem]) {
        let resolution = ReviewQueueResolution.resolve(items, course: course, content: contentStore)
        queue = resolution.resolved
        for key in resolution.unresolvedItemKeys {
            syncQueueStore.removeCachedDueReview(itemKey: key, course: course.wireCode)
        }
    }

    /// Grades a translate item through `grade-review` -- the one call that also
    /// schedules it -- and shows the verdict that call returned.
    ///
    /// This is deliberately NOT /api/grade-translation, which is the lesson
    /// player's route. Using it here meant the answer was graded twice by two
    /// different paths: one result shown to the learner, the other recorded by
    /// the scheduler, with no guarantee they agreed. Grading once and
    /// displaying that result is what makes them the same value rather than two
    /// derivations that usually match.
    ///
    /// Offline, or against a server too old to return a verdict, this falls
    /// back to the local match -- which is also what the offline queue will
    /// replay, so the two still agree.
    private func gradeTranslationReviewItem(question q: Question.Translate) async {
        let submission = (picked ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let localVerdict = TranslationVerdict(
            correct: TranslationAnswer.matches(
                submission: submission, acceptable: q.acceptableAnswers),
            reason: nil)

        guard networkMonitor.isConnected, let accessToken = session.accessToken else {
            translationVerdict = localVerdict
            return
        }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL,
            anonKey: AppConfig.supabasePublishableKey,
            accessToken: accessToken)
        do {
            let outcome = try await client.gradeReview(
                itemKey: currentItem.itemKey, answer: submission, course: course.wireCode,
                attemptID: attempt(for: currentItem, answer: submission).queueIdentity)
            dropFromDueCacheIfNoLongerDue(outcome, itemKey: currentItem.itemKey)
            guard let correct = outcome.correct else {
                // Server predates the field: nothing was displayed wrongly, it
                // just graded without telling us, so show the local verdict and
                // let Next submit again as it always did.
                translationVerdict = localVerdict
                return
            }
            translationVerdict = TranslationVerdict(correct: correct, reason: nil)
            alreadySubmitted = true
        } catch {
            translationVerdict = localVerdict
        }
    }

    private func submitAndAdvance(question: Question) async {
        guard let picked else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        // Already graded and scheduled by the Check step (translate only).
        if alreadySubmitted {
            advance()
            if idx >= queue.count, networkMonitor.isConnected,
                let accessToken = session.accessToken
            {
                await claimBonusIfCleared(
                    client: ProgressSyncClient(
                        supabaseURL: AppConfig.supabaseURL,
                        anonKey: AppConfig.supabasePublishableKey,
                        accessToken: accessToken))
            }
            return
        }
        if networkMonitor.isConnected, let accessToken = session.accessToken {
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            do {
                let outcome = try await client.gradeReview(
                    itemKey: currentItem.itemKey, answer: picked, course: course.wireCode,
                    attemptID: attempt(for: currentItem, answer: picked).queueIdentity,
                    expectedDueOn: currentItem.hasReviewSnapshot ? currentItem.dueOn : nil,
                    expectedLastReviewedAt: currentItem.lastReviewedAt)
                // Before advance(): currentItem moves on with idx.
                dropFromDueCacheIfNoLongerDue(outcome, itemKey: currentItem.itemKey)
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

    /// Applies the server's own scheduling answer to the cached due list.
    ///
    /// Only the OFFLINE path used to touch the cache, and the cache is only
    /// otherwise replaced when this screen opens (before any grading) or on a
    /// full sync -- so an item graded online stayed counted and the Learn tab
    /// badge kept showing it after the queue was cleared (BACKLOG 0.0-z #5).
    /// A wrong answer stays due today, so `isStillDue` keeps it counted.
    private func dropFromDueCacheIfNoLongerDue(_ outcome: ReviewGradeOutcome, itemKey: String) {
        if !outcome.isStillDue(on: todayDateString()) {
            syncQueueStore.removeCachedDueReview(itemKey: itemKey, course: course.wireCode)
        }
    }

    /// Optimistic local grading (Option A in the design doc): compute the
    /// SM-2 update via SRSEngine (already pure/tested), queue the real
    /// grade for sync, and update the cached due-list so a relaunch while
    /// still offline doesn't show an already-graded item as due again.
    /// `lapses: 0` below is a deliberate placeholder, not a bug -- see the
    /// inline note.
    private func queueGradeOffline(item: ReviewItem, question: Question, answer: String) {
        let today = todayDateString()
        let correct = isAnswerCorrect(question, picked: answer, course: course)
        // ReviewItem never carries `lapses` (fetchDueReviews doesn't select
        // it), but none of computeReviewOutcome's ease/intervalDays/
        // repetitions/dueOn outputs actually depend on the *input* lapses
        // value -- only the *returned* lapses count does, which this view
        // never displays. Safe to pass 0. Same reasoning for `elapsedDays`:
        // ReviewItem doesn't carry last_reviewed_at either, so this assumes
        // an on-schedule review (overdue bonus becomes a no-op) -- purely
        // an offline optimistic-cache prediction; the real grade (and its
        // real elapsed-time-aware interval) gets recomputed correctly
        // server-side by grade-review once this queued grade syncs.
        let input = ReviewGradeInput(correct: correct, ease: item.ease, intervalDays: item.intervalDays, repetitions: item.repetitions, lapses: 0, elapsedDays: item.intervalDays)
        let outcome = computeReviewOutcome(input, today: today, addDays: { addDaysDateString($0) })

        // The same submission the online attempt used, so the queued retry carries the same attempt id.
        syncQueueStore.appendReviewGrade(attempt(for: item, answer: answer))

        switch outcome {
        case .retired:
            syncQueueStore.removeCachedDueReview(itemKey: item.itemKey, course: course.wireCode)
        case .rescheduled(let scheduled):
            // A wrong answer keeps dueOn == today (real SM-2 behavior, see
            // grade-review's port) -- leave it cached as still-due, same as
            // the online path, which doesn't re-insert a missed item into
            // the current session's queue either.
            if scheduled.dueOn > today {
                syncQueueStore.removeCachedDueReview(itemKey: item.itemKey, course: course.wireCode)
            }
        }
    }

    private func advance() {
        idx += 1
        picked = nil
        checked = false
        // Cleared here for the same reason the lesson player clears it: a
        // stale verdict would otherwise describe the previous item, and
        // `alreadySubmitted` would make the next one skip its own grading.
        translationVerdict = nil
        alreadySubmitted = false
        gradeAttempt = nil
    }

    /// The submission for this item and answer: the one already started, or a new one.
    private func attempt(for item: ReviewItem, answer: String) -> PendingReviewGrade {
        // Matched on the card alone: the first submission for a card is the one that stands, even if the text
        // sent on a later tap differs (Check trims the answer, Next does not).
        if let gradeAttempt, gradeAttempt.itemKey == item.itemKey {
            return gradeAttempt
        }
        // No snapshot when it is unknown (see ReviewItem.hasReviewSnapshot): the grade then applies as it did
        // before freshness checks existed, instead of being dropped as superseded.
        let started = PendingReviewGrade(
            itemKey: item.itemKey, answer: answer, course: course.wireCode, queuedAt: Date(),
            expectedDueOn: item.hasReviewSnapshot ? item.dueOn : nil,
            expectedLastReviewedAt: item.hasReviewSnapshot ? item.lastReviewedAt : nil,
            ownerUserID: session.userID)
        gradeAttempt = started
        return started
    }

    private func claimBonusIfCleared(client: ProgressSyncClient) async {
        do {
            let bonus = try await client.claimReviewClearBonus(course: course.wireCode)
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

/// Shown above the queue when it's SyncQueueStore's cached snapshot rather
/// than a fresh fetch -- a relative-time indicator instead of the error
/// screen an offline/failed fetch used to show.
private struct CachedQueueBanner: View {
    let since: Date?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            Image(systemName: "wifi.slash").accessibilityHidden(true)
            Text(label)
        }
        .dsText(.caption)
        .foregroundStyle(ds.inkSoft)
        .padding(.vertical, AlphonsoDS.Space.s2)
        .frame(maxWidth: .infinity)
        .background(ds.actionTint)
        .accessibilityElement(children: .combine)
    }

    private var label: String {
        guard let since else { return "Offline. Showing your last synced queue" }
        let relative = RelativeDateTimeFormatter().localizedString(for: since, relativeTo: Date())
        return "Offline. Last synced \(relative)"
    }
}
